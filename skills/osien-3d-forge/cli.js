#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { UltraForge, QUALITY_PRESETS, ALL_KITS, MATERIAL_PRESETS } = require('./index.js');

const KITS = ALL_KITS || ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'capsule', 'tubeAlongCurve', 'lathe', 'extrusion', 'humanoid', 'car', 'building', 'chair', 'table', 'tree', 'rock', 'sword', 'creature'];

function help() {
  console.log('osien-3d-forge v2 — BEST-MODELS-EVER procedural 3D generator (zero deps)\n');
  console.log('Usage: node cli.js "<prompt>" --format glb --out ./out [--quality game] [--style realistic] [--material gold]');
  console.log('       node cli.js --list | --batch file.json');
  console.log('       node cli.js --example <id-or-name> [--format glb --out ./out]   (build a library example)');
  console.log('       node cli.js --category <cat> | --search <query> | --random [cat] (browse the 1040+ library)');
  console.log('Examples:');
  console.log('  node cli.js "ornate gold dragon" --quality cinema --format obj --out ./out --stats');
  console.log('  node cli.js "red sports car realistic" --quality game --format glb --out ./out --textures');
  console.log('  node cli.js "wooden throne stylized" --quality cinema --format gltf --out ./out --turntable');
  console.log('  node cli.js "low poly pine tree" --format obj --out ./out   (v1 style still works)');
  console.log('  node cli.js --example nat-pine-tree-001 --format obj --out ./out --stats');
  console.log('  node cli.js --category weapons-guns | --search "dragon" | --random vehicles --format obj --out ./out');
  console.log('\nQuality presets: draft (fast <10ms) | game (balanced, default) | cinema (ultra <300ms) | print (watertight)');
  console.log('Styles: realistic | stylized | lowpoly | scifi | fantasy (auto-detected, override with --style)');
  console.log('Materials: ' + Object.keys(MATERIAL_PRESETS || {}).join(', '));
  console.log('\nFlags: --format obj|stl|gltf|glb (default glb), --out ./out, --poly 10k|2500 (tri budget),');
  console.log('  --lod N (LOD chain files *_lod0..N-1, v2 default chain is 100/50/25/12%), --seed N, --ascii (ASCII STL),');
  console.log('  --quality draft|game|cinema|print (default game), --style NAME, --material NAME,');
  console.log('  --textures (bake albedo+roughness+AO: PNG via canvas if present, else PPM),');
  console.log('  --rig (skeleton JSON sidecar), --turntable (8-angle previews: PNG or PPM), --stats (verts/tris/time/score)');
  console.log('  --anim <clip> (baked animation JSON sidecar, e.g. walk/run/idle/attackSlash1), --list-anims');
  console.log('\nKits (' + KITS.length + '): ' + KITS.join(', '));
  console.log('Formats: obj stl gltf glb (stl=binary, use --ascii for ASCII STL)');
}

function parsePoly(s) {
  if (s === undefined || s === null) return undefined;
  const m = String(s).toLowerCase().match(/^([\d.]+)\s*(k?)$/);
  if (!m) return parseInt(s, 10) || undefined;
  let v = parseFloat(m[1]);
  if (m[2] === 'k') v *= 1000;
  return Math.floor(v);
}

function writeDataURL(dataURL, file) {
  const b64 = dataURL.split(',')[1];
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { help(); process.exit(0); }
  if (argv.includes('--list')) { console.log(KITS.join('\n')); return; }
  if (argv.includes('--list-anims')) {
    const clips = UltraForge.animList ? UltraForge.animList() : [];
    if (!clips.length) { console.error('animations not loaded (animations.js missing?)'); process.exit(1); }
    console.log(clips.join('\n')); return;
  }
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
  const has = (k) => argv.includes(k);
  const catalog = () => require('./examples/catalog.js');

  // ---- v2.1 library browsers (list-only) ----
  if (argv.includes('--category') && !has('--example') && !has('--random') && !has('--search')) {
    const c = get('--category');
    if (!c) { // bare --category: show all categories with counts
      catalog().listCategories().forEach(x => console.log(x.name + '  (' + x.count + ')'));
      return;
    }
    // a positional prompt alongside --category means "build", not "browse"
    const cval = c;
    const positional = argv.find(a => !a.startsWith('--') && a !== cval);
    if (positional) { /* fall through to build */ }
    else {
      const hits = catalog().search({ category: c, limit: 10 });
      if (!hits.length) { console.error('unknown category "' + c + '". Use bare --category to list.'); process.exit(1); }
      hits.forEach(e => console.log(e.id + ' | ' + e.name + ' | ' + e.kit + ' | ' + e.prompt));
      return;
    }
  }
  if (argv.includes('--search')) {
    const q = get('--search', '');
    const hits = catalog().search({ query: q, category: get('--category', undefined), kit: get('--kit', undefined), limit: 20 });
    if (!hits.length) { console.log('no examples match "' + q + '"'); return; }
    hits.forEach(e => console.log(e.id + ' | ' + e.name + ' | ' + e.kit + ' | ' + e.prompt));
    return;
  }

  // ---- v2.1 library builders: resolve --example / --random to a recipe ----
  let recipe = null;
  if (argv.includes('--example')) {
    const id = get('--example', '');
    recipe = catalog().resolve(id);
    if (!recipe) { console.error('example not found: "' + id + '" (try --search "' + id + '")'); process.exit(1); }
  } else if (argv.includes('--random')) {
    const rc = get('--random', undefined);
    const pool = catalog().random(rc || undefined, 1);
    if (!pool.length) { console.error('unknown category "' + rc + '". Use bare --category to list.'); process.exit(1); }
    recipe = pool[0];
    console.log('random pick: ' + recipe.id + ' | ' + recipe.name);
  }
  const flagVals = new Set();
  for (const f of ['--quality', '--style', '--material', '--format', '--out', '--poly', '--lod', '--seed', '--batch', '--example', '--category', '--search', '--random', '--kit', '--anim']) {
    const v = get(f, undefined); if (v !== undefined) flagVals.add(v);
  }
  const quality = (get('--quality', (recipe && recipe.params && recipe.params.quality) || 'game') || 'game').toLowerCase();
  const style = get('--style', (recipe && recipe.params && recipe.params.style) || undefined);
  const material = get('--material', (recipe && recipe.params && recipe.params.material) || undefined);
  if (!QUALITY_PRESETS[quality]) { console.error('unknown --quality ' + quality + ' (use draft|game|cinema|print)'); process.exit(1); }

  if (argv.includes('--batch')) {
    const f = get('--batch');
    const specs = JSON.parse(fs.readFileSync(f, 'utf8'));
    const forge = new UltraForge();
    const outDir = get('--out', './out');
    const format = (get('--format', 'glb') || 'glb').toLowerCase();
    const budget = parsePoly(get('--poly'));
    specs.forEach((s, i) => {
      const prompt = typeof s === 'string' ? s : (s.prompt || s.kind || 'box');
      const sopts = typeof s === 'object' && s.opts ? s.opts : {};
      if (budget) sopts.polyBudget = budget;
      if (!sopts.quality) sopts.quality = quality;
      if (style && !sopts.style) sopts.style = style;
      if (material && !sopts.material) sopts.material = material;
      const r = forge.quick(prompt, sopts);
      const safe = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      forge.save(r.mesh, path.join(outDir, safe + '.' + format));
      console.log(JSON.stringify({ prompt: s, ...r.stats }));
    });
    return;
  }
  let prompt, safe;
  if (recipe) {
    prompt = recipe.prompt; safe = recipe.id;
    console.log('example: ' + recipe.id + ' | ' + recipe.name + ' | kit=' + recipe.kit);
  } else {
    prompt = argv.find(a => !a.startsWith('--') && !flagVals.has(a));
    if (!prompt) { help(); process.exit(1); }
    safe = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'model';
  }
  const format = (get('--format', 'glb') || 'glb').toLowerCase().replace(/^\./, '');
  const outDir = get('--out', './out');
  const budget = parsePoly(get('--poly', (recipe && recipe.params && recipe.params.poly) || undefined));
  const lodN = parseInt(get('--lod', '0'), 10) || 0;
  const seed = parseInt(get('--seed', String((recipe && recipe.seed) || 1337)), 10) || 1337;
  const ascii = argv.includes('--ascii');
  const wantTextures = has('--textures'), wantRig = has('--rig'), wantTurn = has('--turntable'), wantStats = has('--stats');
  const forge = new UltraForge({ seed });
  const qopts = { quality };
  if (budget) qopts.polyBudget = budget;
  if (style) qopts.style = style;
  if (material) qopts.material = material;
  const r = forge.quick(prompt, qopts);
  if (recipe) r.stats.example = recipe.id;
  fs.mkdirSync(outDir, { recursive: true });
  const ext = format === 'stl' && ascii ? '.stl' : '.' + format;
  const saveOne = (m, fp) => {
    if (format === 'stl' && ascii) fs.writeFileSync(fp, forge.toSTL(m, true));
    else forge.save(m, fp);
  };
  let files = [];
  if (lodN > 1) {
    const chain = forge.lod(r.mesh, lodN);
    chain.forEach((m, i) => {
      const fp = path.join(outDir, safe + '_lod' + i + ext);
      saveOne(m, fp);
      files.push(fp);
    });
  } else {
    const fp = path.join(outDir, safe + ext);
    saveOne(r.mesh, fp);
    files.push(fp);
  }
  if (wantTextures) {
    const tx = forge.bakeTextures(r.mesh, 128, 128);
    for (const k of ['albedo', 'roughness', 'ao']) {
      if (tx.png && tx.png[k]) { const fp = path.join(outDir, safe + '_' + k + '.png'); writeDataURL(tx.png[k], fp); files.push(fp); }
      else { const fp = path.join(outDir, safe + '_' + k + '.ppm'); fs.writeFileSync(fp, tx[k]); files.push(fp); }
    }
  }
  if (wantRig) {
    const rig = r.mesh.rig || forge.skeleton(r.stats.kind);
    const fp = path.join(outDir, safe + '_rig.json');
    fs.writeFileSync(fp, JSON.stringify({ skeleton: rig, parts: r.mesh.parts || [], pivots: r.mesh.pivots || {} }, null, 1));
    files.push(fp);
  }
  const animNames = [];
  argv.forEach((a, i) => { if (a === '--anim' && argv[i+1] && !argv[i+1].startsWith('--')) animNames.push(argv[i+1]); });
  for (const animName of animNames) {
    if (!UltraForge.animGet) { console.error('--anim needs animations.js (not loaded)'); process.exit(1); }
    const clip = UltraForge.animGet(animName, { seed });
    const fp = path.join(outDir, safe + '_anim_' + clip.name + '.json');
    fs.writeFileSync(fp, JSON.stringify(clip));
    files.push(fp);
    if (wantStats) console.log('anim: ' + clip.name + '  frames: ' + Object.values(clip.tracks)[0].length + '  loop: ' + clip.loop);
  }
  if (wantTurn) {
    for (let a = 0; a < 8; a++) {
      const pv = forge.renderPreview(r.mesh, a * 45, 320, 240);
      const png = forge.previewToPNG(pv);
      if (png) { const fp = path.join(outDir, safe + '_turn_' + a + '.png'); writeDataURL(png, fp); files.push(fp); }
      else { const fp = path.join(outDir, safe + '_turn_' + a + '.ppm'); fs.writeFileSync(fp, forge.previewToPPM(pv)); files.push(fp); }
    }
  }
  const st = files.map(f => ({ file: f, bytes: fs.statSync(f).size }));
  if (wantStats) {
    console.log('verts: ' + r.stats.verts + '  tris: ' + r.stats.tris + '  time: ' + r.stats.timeMs + 'ms' +
      '  quality: ' + r.stats.quality + ' (' + (r.stats.score) + '/100)' +
      '  style: ' + r.stats.style + '  material: ' + r.stats.material);
  }
  console.log(JSON.stringify({ prompt, ...r.stats, files: st }, null, 1));
}

main();
