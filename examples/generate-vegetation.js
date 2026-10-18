'use strict';
/* UltraForge v2.2 vegetation-ultra examples — 120 recipes (60 grass + 60 bush).
 * Run: node generate-vegetation.js (appends to index.json, safe re-run via id overwrite)
 * Every prompt routes to its veg kit (verified against parsePrompt vegetation table).
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261002);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const GRASS_BASES = [
  ['lawn', 'lawnGrass', 'manicured lawn grass', ['lawn', 'turf', 'garden'], ['lush', 'green', 'manicured', 'fresh', 'dense']],
  ['meadow', 'wildMeadow', 'wild meadow tall grass with flowers', ['meadow', 'wildflowers', 'prairie'], ['lush', 'wild', 'tall', 'dense', 'natural']],
  ['savanna', 'savannaTuft', 'savanna dry grass tuft', ['savanna', 'dry', 'field'], ['dry', 'golden', 'withered', 'tall']],
  ['pampas', 'pampasPlume', 'pampas plume ornamental grass', ['ornamental', 'plume', 'garden'], ['tall', 'feathery', 'dense']],
  ['moss', 'mossCarpet', 'mossy ground moss carpet', ['moss', 'forest-floor', 'damp'], ['lush', 'green', 'damp', 'soft']],
  ['clover', 'cloverPatch', 'clover patch ground', ['clover', 'lawn-alt', 'low'], ['lush', 'green', 'low', 'dense']],
  ['wheat', 'wheatField', 'wheat crop field', ['wheat', 'crop', 'farm'], ['golden', 'ripe', 'tall', 'dense']],
  ['reed', 'reedMarsh', 'reed marsh pond grass', ['marsh', 'pond', 'wetland'], ['tall', 'lush', 'wet', 'dense']],
];
const BUSH_BASES = [
  ['boxwood', 'boxwoodTopiary', 'boxwood topiary ball sheared bush', ['topiary', 'formal', 'garden'], ['dense', 'trimmed', 'round', 'lush']],
  ['rose', 'roseBush', 'rose bush with red blooms', ['roses', 'flowering', 'garden'], ['lush', 'thorny', 'blooming']],
  ['hydrangea', 'hydrangea', 'hydrangea flower bush', ['flowering', 'shrub'], ['lush', 'blooming', 'round']],
  ['juniper', 'juniperConifer', 'juniper conifer evergreen bush', ['evergreen', 'conifer'], ['dense', 'needle', 'tall']],
  ['hedge', 'hedgeRow', 'trimmed hedge row wall', ['hedge', 'privacy', 'formal'], ['trimmed', 'dense', 'long']],
  ['bramble', 'wildBramble', 'wild bramble berry bush', ['wild', 'berries', 'tangle'], ['wild', 'thorny', 'tangled']],
  ['lavender', 'lavenderBush', 'lavender flower bush', ['fragrant', 'purple', 'herb'], ['fragrant', 'purple', 'low']],
  ['bonsai', 'bonsai', 'bonsai miniature tree', ['miniature', 'zen', 'pot'], ['miniature', 'gnarled', 'artful']],
];
const QUALITIES = ['cinema', 'cinema', 'game', 'game', 'game', 'draft'];
const OUTFIT = { lawn: 10, meadow: 10, savanna: 7, pampas: 6, moss: 7, clover: 6, wheat: 7, reed: 7, boxwood: 10, rose: 9, hydrangea: 7, juniper: 7, hedge: 7, bramble: 6, lavender: 7, bonsai: 7 }; // sums 120

function main() {
  const manPath = path.join(ROOT, 'index.json');
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const outDir = path.join(ROOT, 'vegetation-ultra');
  fs.mkdirSync(outDir, { recursive: true });
  const newEntries = [];
  let n = 0;
  const all = GRASS_BASES.map(b => ({ b, n: OUTFIT[b[0]] })).concat(BUSH_BASES.map(b => ({ b, n: OUTFIT[b[0]] })));
  for (const { b, n: count } of all) {
    const [slugBase, kit, core, tags, adjs] = b;
    for (let i = 1; i <= count; i++) {
      n++;
      const id = 'veg-' + slugBase + '-' + String(i).padStart(3, '0');
      const adj1 = pick(adjs), adj2 = pick(adjs.filter(a => a !== adj1));
      const q = pick(QUALITIES);
      const name = adj1[0].toUpperCase() + adj1.slice(1) + ' ' + slugBase[0].toUpperCase() + slugBase.slice(1) + ' ' + String(i).padStart(3, '0');
      const prompt = adj1 + ' ' + adj2 + ' ' + core;
      const recipe = {
        id, name, category: 'vegetation-ultra', kit,
        prompt, seed: 30000 + n,
        params: { quality: q, style: kit.includes('Grass') || kit.includes('Meadow') || kit.includes('Field') ? 'realistic' : 'stylized' },
        tags: tags.concat([adj1, adj2, q]), difficulty: q === 'cinema' ? 'advanced' : q === 'game' ? 'intermediate' : 'beginner'
      };
      fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(recipe, null, 1) + '\n');
      newEntries.push({ id, name, category: 'vegetation-ultra', prompt, kit, tags: recipe.tags, difficulty: recipe.difficulty, file: 'vegetation-ultra/' + id + '.json' });
    }
  }
  // remove old veg entries, append new
  man.entries = man.entries.filter(e => e.category !== 'vegetation-ultra').concat(newEntries);
  man.entries.sort((a, b) => (a.id < b.id ? -1 : 1));
  man.total = man.entries.length;
  man.version = '2.2.0';
  man.generated = '2026-10-01';
  man.categories['vegetation-ultra'] = { count: newEntries.length, path: 'vegetation-ultra/' };
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1) + '\n');
  console.log('vegetation-ultra: ' + newEntries.length + ' recipes, total now ' + man.total);
}
main();
