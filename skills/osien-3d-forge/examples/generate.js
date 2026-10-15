'use strict';
/* UltraForge v2.1 example library generator — stdlib only, seeded, deterministic.
 * Produces 1040 recipe JSONs across 12 categories + index.json manifest.
 * Run: node generate.js   (writes into __dirname; safe to re-run)
 * Every recipe prompt is crafted to route to its declared kit via parsePrompt().
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const VERSION = '2.1.0';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261001);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');

const MAT_ADJ = { gold: 'gold', silver: 'silver', chrome: 'chrome', steel: 'steel', iron: 'iron', copper: 'copper', bronze: 'bronze', brass: 'brass', wood: 'wooden', rust: 'rusty', marble: 'marble', stone: 'stone', leather: 'leather', crystal: 'crystal', glass: 'glass', obsidian: 'obsidian', bone: 'bone', fabric: 'fabric' };
const STYLE_WORD = { realistic: 'realistic', stylized: 'stylized', lowpoly: 'low poly', scifi: 'sci-fi', fantasy: 'fantasy' };
const QUALITY_W = [['game', 50], ['cinema', 25], ['draft', 15], ['print', 10]];
function pickQuality() { const r = rng() * 100; let acc = 0; for (const [q, w] of QUALITY_W) { acc += w; if (r < acc) return q; } return 'game'; }
const BUDGET = { draft: 4000, game: 12000, cinema: 24000, print: 30000 };
const DIFF = { draft: 'beginner', game: 'intermediate', cinema: 'advanced', print: 'advanced' };
const MOODS = [['worn', 'weathered', 0.16], ['worn', 'worn', 0.08], ['pristine', 'polished', 0.12], ['pristine', 'pristine', 0.06], ['ancient', 'ancient', 0.12], ['ancient', 'mossy', 0.06]];
function pickMood() { const r = rng(); let acc = 0; for (const [m, w, p] of MOODS) { acc += p; if (r < acc) return { mood: m, word: w }; } return { mood: 'balanced', word: '' }; }

// Base tuple: [name, kit, corePrompt, extraTags, partsPool] + opts {mats, adjs}
// mats/adjs restrict per-base pools so prompt words can never hijack parsePrompt()
// routing (e.g. "stone"->rock, "crystal"->crystal, "gold"+blade->swordV2,
// "village"~"villa"->house, "cabinet"~"cabin"->house, "carrot"~"car"->car).
function B(n, k, p, t, pp, opts) { const o = opts || {}; return { n, k, p, t: t || [], pp: pp || [], mats: o.mats || null, adjs: o.adjs || null }; }
const NOSTONE = ['marble', 'wood', 'glass', 'steel', 'iron', 'brass']; // safe for building/table/chair/car/food kits
const NOSTONE_NOCRYSTAL = ['wood', 'fabric', 'glass', 'bone', 'marble']; // safe for late kits (creature/sphere/cone/cylinder/box/...)
const PLAIN_BLADE_MATS = ['steel', 'iron', 'chrome', 'rust', 'wood', 'obsidian', 'bronze']; // no gold: gold+blade routes swordV2
const PLAIN_BLADE_ADJS = ['Rusty', 'Ancient', 'Polished', 'Dark', 'Oaken', 'Steel']; // no Ornate/Golden: they route swordV2

const CATS = [
{ dir: 'buildings-bldg', prefix: 'bldg', count: 120, tag: 'bldg',
  styles: ['realistic', 'stylized', 'lowpoly', 'fantasy'], materials: ['stone', 'marble', 'wood', 'glass', 'steel', 'iron'],
  adjs: ['Gothic', 'Grand', 'Ancient', 'Towering', 'Ruined', 'Medieval', 'Marble', 'Old'],
  bases: [
    B('Gothic Cathedral', 'castle', 'gothic stone castle cathedral with towers and gate', ['gothic', 'church'], ['towers', 'gate', 'windows']),
    B('Castle Keep', 'castle', 'medieval castle fortress keep with towers and gate', ['medieval', 'fortress'], ['towers', 'gate']),
    B('Skyscraper', 'building', 'modern glass skyscraper tower with windows', ['modern', 'city'], ['windows', 'doors'], { mats: NOSTONE }),
    B('Apartment Block', 'building', 'brick apartment building block with windows and doors', ['city', 'housing'], ['windows', 'doors'], { mats: NOSTONE }),
    B('Clock Tower', 'building', 'old clock tower building with windows', ['tower'], ['windows', 'doors'], { mats: NOSTONE }),
    B('Wooden Cabin', 'house', 'wooden cabin hut house with chimney', ['cabin', 'forest'], ['chimney', 'doors', 'windows']),
    B('Country Cottage', 'house', 'country stone cottage house with chimney and windows', ['cottage'], ['chimney', 'windows', 'doors']),
    B('Desert Villa', 'house', 'desert sandstone villa house with doors and windows', ['villa', 'desert'], ['doors', 'windows']),
    B('Arch Bridge', 'bridge', 'stone arch bridge with pillars', ['river'], []),
    B('Steel Viaduct', 'bridge', 'steel viaduct bridge with pillars', ['rail'], []),
    B('Village Hut', 'house', 'village straw hut house with doors', ['hut', 'village'], ['doors']),
    B('Temple Hall', 'building', 'ancient marble temple hall with columns and steps', ['temple'], ['doors', 'windows'], { mats: NOSTONE }),
  ] },
{ dir: 'weapons-guns', prefix: 'gun', count: 120, tag: 'guns',
  styles: ['realistic', 'fantasy', 'stylized', 'lowpoly'], materials: ['steel', 'iron', 'gold', 'chrome', 'rust', 'wood', 'obsidian', 'bronze'],
  adjs: ['Rusty', 'Ancient', 'Golden', 'Polished', 'Dark', 'Oaken', 'Steel', 'Ornate'],
  bases: [
    B('Knight Longsword', 'sword', 'knight steel longsword blade', ['sword', 'knight'], [], { mats: PLAIN_BLADE_MATS, adjs: PLAIN_BLADE_ADJS }),
    B('Ornate Excalibur', 'swordV2', 'ornate golden enchanted excalibur sword blade', ['sword', 'legendary'], []),
    B('War Axe', 'axe', 'steel war axe hatchet', ['axe'], []),
    B('Round Shield', 'shield', 'round iron shield buckler', ['shield'], []),
    B('Knight Helmet', 'helmet', 'steel knight helmet helm', ['helmet', 'armor'], []),
    B('Katana', 'sword', 'polished steel katana blade', ['katana', 'samurai'], [], { mats: PLAIN_BLADE_MATS, adjs: PLAIN_BLADE_ADJS }),
    B('War Dagger', 'sword', 'iron war dagger knife', ['dagger'], [], { mats: PLAIN_BLADE_MATS, adjs: PLAIN_BLADE_ADJS }),
    B('AK-47 Rifle', 'cylinder', 'rusty ak-47 assault rifle tube barrel', ['gun', 'rifle'], []),
    B('Sniper Rifle', 'cylinder', 'long steel sniper rifle barrel tube', ['gun', 'sniper'], []),
    B('Pump Shotgun', 'box', 'wooden pump shotgun receiver box', ['gun', 'shotgun'], []),
    B('Revolver', 'cylinder', 'iron revolver drum cylinder', ['gun', 'revolver'], []),
    B('Scope Sight', 'torus', 'black scope sight ring torus', ['gun', 'scope'], []),
  ] },
{ dir: 'natural', prefix: 'nat', count: 120, tag: 'nature',
  styles: ['realistic', 'stylized', 'lowpoly'], materials: ['wood', 'stone', 'crystal', 'glass', 'bone'],
  adjs: ['Tall', 'Old', 'Mossy', 'Glowing', 'Red', 'Amber', 'Wild', 'Grey'],
  bases: [
    B('Pine Tree', 'tree', 'tall pine tree', ['pine', 'forest'], [], { mats: ['wood', 'stone', 'glass', 'bone', 'fabric'] }),
    B('Oak Tree', 'tree', 'broad oak tree', ['oak', 'forest'], [], { mats: ['wood', 'stone', 'glass', 'bone', 'fabric'] }),
    B('Granite Boulder', 'rock', 'gray granite boulder rock', ['boulder'], [], { mats: ['wood', 'stone', 'glass', 'bone', 'marble'] }),
    B('Mossy Stone', 'rock', 'mossy ancient stone rock', ['moss'], [], { mats: ['wood', 'stone', 'glass', 'bone', 'marble'] }),
    B('Red Mushroom', 'mushroom', 'red spotted mushroom toadstool', ['fungus'], []),
    B('Glowcap Fungus', 'mushroom', 'glowing blue glowcap mushroom', ['glow', 'fungus'], []),
    B('Alien Flora', 'alienPlant', 'glowing alien plant tentacle flower', ['alien', 'flora'], []),
    B('Quartz Crystal', 'crystal', 'clear quartz crystal cluster gem', ['quartz', 'gem'], [], { mats: ['crystal', 'glass', 'stone', 'bone'] }),
    B('Amethyst Geode', 'crystal', 'purple amethyst crystal geode', ['amethyst', 'gem'], [], { mats: ['crystal', 'glass', 'stone', 'bone'] }),
    B('Desert Rock', 'rock', 'weathered sandstone desert rock', ['desert'], [], { mats: ['wood', 'stone', 'glass', 'bone', 'marble'] }),
  ] },
{ dir: 'vehicles', prefix: 'veh', count: 100, tag: 'vehicles',
  styles: ['realistic', 'stylized', 'lowpoly', 'scifi'], materials: ['chrome', 'steel', 'rust', 'iron', 'glass', 'gold'],
  adjs: ['Red', 'Blue', 'Rusty', 'Chrome', 'Fast', 'Old', 'Desert', 'Midnight'],
  bases: [
    B('City Sedan', 'car', 'red city sedan car vehicle', ['sedan', 'city'], ['wheels', 'doors', 'windows']),
    B('Pickup Truck', 'car', 'blue pickup truck vehicle', ['truck'], ['wheels', 'doors', 'engine']),
    B('Race Supercar', 'carSportsV2', 'red sports race car supercar', ['sports', 'race'], ['spoiler', 'rims', 'headlights', 'wheels']),
    B('Chopper Bike', 'motorcycle', 'black chopper motorcycle bike', ['chopper'], ['wheels', 'engine']),
    B('Vespa Scooter', 'motorcycle', 'mint vespa scooter bike', ['scooter'], ['wheels', 'engine']),
    B('Jet Airliner', 'airplane', 'white jet airliner airplane', ['airliner'], ['wings', 'engine', 'cockpit']),
    B('Fighter Jet', 'airplane', 'gray fighter jet aircraft', ['fighter'], ['wings', 'engine', 'cockpit']),
    B('Sailboat', 'boat', 'wooden sailboat yacht', ['sailboat'], ['sails', 'mast']),
    B('Pirate Galley', 'boat', 'old pirate galley ship', ['pirate', 'ship'], ['sails', 'mast']),
    B('Harbor Ferry', 'boat', 'yellow harbor ferry boat', ['ferry'], ['engine', 'mast']),
  ] },
{ dir: 'characters', prefix: 'char', count: 80, tag: 'characters',
  styles: ['realistic', 'stylized', 'fantasy', 'scifi', 'lowpoly'], materials: ['steel', 'leather', 'fabric', 'gold', 'iron', 'chrome', 'bone'],
  adjs: ['Brave', 'Old', 'Cute', 'Dark', 'Golden', 'Scarred', 'Wise', 'Young'],
  bases: [
    B('Village Knight', 'humanoid', 'brave kingdom knight warrior in armor', ['knight', 'warrior'], []),
    B('Forest Elf', 'humanoid', 'slender forest elf mage', ['elf', 'mage'], []),
    B('Orc Brute', 'humanoid', 'hulking orc warrior', ['orc'], []),
    B('Cute Robot', 'robot', 'cute little robot droid', ['droid', 'cute'], []),
    B('Space Marine', 'humanoid', 'armored space marine soldier avatar', ['soldier'], []),
    B('Battle Droid', 'robot', 'tall battle droid mech', ['mech'], ['engine']),
    B('Wise Villager', 'humanoid', 'wise old townsfolk person', ['villager'], []),
    B('Cyber Cyborg', 'robot', 'chrome cyber cyborg android', ['cyborg'], ['engine']),
  ] },
{ dir: 'creatures', prefix: 'crea', count: 80, tag: 'creatures',
  styles: ['fantasy', 'realistic', 'stylized', 'lowpoly'], materials: ['leather', 'stone', 'bone', 'crystal', 'obsidian'],
  adjs: ['Ancient', 'Fire', 'Dark', 'Golden', 'Swamp', 'Young', 'Wild', 'Horned'],
  bases: [
    B('Fire Dragon', 'dragon', 'huge fire dragon drake', ['fire', 'drake'], ['horns', 'tail', 'wings']),
    B('Swamp Wyvern', 'dragon', 'lean swamp wyvern drake', ['wyvern'], ['wings', 'tail', 'horns']),
    B('Dire Wolf', 'creature', 'gray dire wolf beast', ['wolf'], ['tail'], { mats: NOSTONE_NOCRYSTAL }),
    B('Cave Bear', 'creature', 'brown cave bear beast', ['bear'], [], { mats: NOSTONE_NOCRYSTAL }),
    B('Forest Stag', 'creature', 'brown forest stag animal', ['deer'], ['horns', 'tail'], { mats: NOSTONE_NOCRYSTAL }),
    B('Swamp Monster', 'creature', 'lumpy swamp monster creature', ['monster'], ['spikes', 'tail'], { mats: NOSTONE_NOCRYSTAL }),
    B('Alien Pet', 'creature', 'small cute alien pet quadruped', ['alien', 'pet'], [], { mats: NOSTONE_NOCRYSTAL }),
    B('Alley Cat', 'creature', 'small orange alley cat', ['cat'], ['tail'], { mats: NOSTONE_NOCRYSTAL }),
  ] },
{ dir: 'furniture', prefix: 'furn', count: 100, tag: 'furniture',
  styles: ['stylized', 'realistic', 'lowpoly'], materials: ['wood', 'leather', 'fabric', 'marble', 'glass', 'brass', 'iron'],
  adjs: ['Oaken', 'Cozy', 'Modern', 'Antique', 'Leather', 'Small', 'Grand', 'Round'],
  bases: [
    B('Oak Chair', 'chair', 'wooden oak chair', ['oak', 'seat'], []),
    B('Plush Armchair', 'chair', 'plush fabric armchair seat', ['armchair'], []),
    B('Office Desk', 'table', 'modern office desk table', ['desk', 'office'], []),
    B('Farm Table', 'table', 'rustic wooden farm table', ['farm'], []),
    B('Chester Sofa', 'sofa', 'leather chesterfield sofa couch', ['couch'], []),
    B('Canopy Bed', 'bed', 'wooden canopy bed mattress', ['mattress'], []),
    B('Bookshelf', 'bookshelf', 'tall wooden bookshelf shelf with books', ['shelf', 'books'], []),
    B('Wardrobe', 'bookshelf', 'oak wardrobe cupboard with doors', ['cabinet', 'wardrobe'], ['doors']),
    B('Royal Throne', 'throne', 'golden royal throne seat', ['royal', 'gold'], []),
    B('Brass Lamp', 'lamp', 'brass desk lamp lantern', ['lantern'], []),
  ] },
{ dir: 'architecture-interior', prefix: 'intr', count: 80, tag: 'interior',
  styles: ['realistic', 'stylized', 'fantasy', 'lowpoly'], materials: ['wood', 'marble', 'brass', 'glass', 'fabric', 'leather', 'stone'],
  adjs: ['Cozy', 'Grand', 'Marble', 'Dim', 'Modern', 'Antique', 'Warm', 'Small'],
  bases: [
    B('Lobby Chandelier', 'lamp', 'grand lobby chandelier lamp', ['chandelier', 'lobby'], []),
    B('Library Shelf', 'bookshelf', 'dark library bookshelf wall', ['library'], []),
    B('Four-Poster Bed', 'bed', 'fabric four-poster bed', ['bedroom'], []),
    B('Lounge Sofa', 'sofa', 'modern lounge sofa', ['lounge'], []),
    B('Hall Throne', 'throne', 'marble hall throne', ['hall'], []),
    B('Court Fountain', 'fountain', 'marble court fountain', ['court'], []),
    B('Study Desk', 'table', 'oak study desk table', ['study'], []),
    B('Oak Dresser', 'bookshelf', 'oak dresser cupboard drawers', ['dresser'], ['doors']),
  ] },
{ dir: 'scifi', prefix: 'sfx', count: 80, tag: 'scifi',
  styles: ['scifi', 'realistic', 'stylized', 'lowpoly'], materials: ['chrome', 'steel', 'glass', 'iron', 'obsidian', 'copper'],
  adjs: ['Chrome', 'Orbital', 'Neon', 'Rusty', 'Lunar', 'Solar', 'Quantum', 'Deep'],
  bases: [
    B('Patrol Droid', 'robot', 'chrome patrol robot droid', ['patrol'], ['engine']),
    B('Starship', 'spaceship', 'sleek starship rocket', ['starship'], ['engine', 'cockpit']),
    B('Orbital Shuttle', 'spaceship', 'white orbital shuttle spacecraft', ['shuttle'], ['engine', 'cockpit']),
    B('Recon Rover', 'car', 'lunar recon rover car vehicle', ['rover'], ['wheels', 'engine']),
    B('Airlock Door', 'box', 'steel airlock door box panel', ['airlock'], []),
    B('Comms Antenna', 'cylinder', 'tall comms antenna tube mast', ['antenna'], ['mast']),
    B('Reactor Core', 'cylinder', 'glowing reactor core cylinder column', ['reactor'], ['engine']),
    B('Halo Ring', 'torus', 'spinning halo ring torus station', ['station'], []),
  ] },
{ dir: 'fantasy', prefix: 'fant', count: 60, tag: 'fantasy',
  styles: ['fantasy', 'stylized', 'realistic'], materials: ['gold', 'crystal', 'wood', 'obsidian', 'marble', 'bronze'],
  adjs: ['Enchanted', 'Ancient', 'Golden', 'Dark', 'Mystic', 'Runic'],
  bases: [
    B('Elder Dragon', 'dragon', 'ancient elder dragon', ['elder'], ['horns', 'wings', 'tail']),
    B('Elven Castle', 'castle', 'slender elven castle fortress', ['elven'], ['towers', 'gate']),
    B('Rune Blade', 'swordV2', 'ornate runed rune blade sword', ['rune'], []),
    B('Aegis Shield', 'shield', 'golden aegis shield', ['aegis'], []),
    B('Mana Crystal', 'crystal', 'glowing blue mana crystal', ['mana'], []),
    B('Loot Chest', 'treasureChest', 'old wooden loot treasure chest', ['loot'], [], { mats: ['gold', 'wood', 'marble', 'bronze', 'iron'] }),
  ] },
{ dir: 'food', prefix: 'food', count: 40, tag: 'food',
  styles: ['stylized', 'realistic', 'lowpoly'], materials: ['wood', 'fabric', 'glass', 'bone', 'marble'],
  adjs: ['Red', 'Ripe', 'Glazed', 'Fresh', 'Sweet', 'Big', 'Small', 'Golden'],
  bases: [
    B('Red Apple', 'sphere', 'shiny red apple sphere fruit', ['apple', 'fruit'], []),
    B('Orange Fruit', 'sphere', 'ripe orange sphere fruit', ['orange', 'fruit'], []),
    B('Donut', 'torus', 'glazed pink donut torus ring', ['donut'], []),
    B('Sweet Potato', 'cone', 'orange sweet potato cone', ['potato'], []),
    B('Soda Can', 'cylinder', 'silver soda can cylinder tin', ['soda'], []),
    B('Baguette', 'capsule', 'golden baguette capsule loaf', ['bread'], []),
    B('Cheese Wheel', 'cylinder', 'yellow cheese wheel cylinder', ['cheese'], []),
    B('Soup Bowl', 'sphere', 'white soup bowl sphere dish', ['soup'], []),
  ] },
{ dir: 'everyday-props', prefix: 'prop', count: 60, tag: 'props',
  styles: ['stylized', 'realistic', 'lowpoly'], materials: ['wood', 'steel', 'iron', 'fabric', 'glass', 'leather', 'brass'],
  adjs: ['Old', 'Wooden', 'Small', 'Heavy', 'Red', 'Round', 'Blue', 'Big'],
  bases: [
    B('Wooden Crate', 'box', 'wooden storage crate box', ['crate'], []),
    B('Game Dice', 'box', 'white game dice cube', ['dice'], []),
    B('Coffee Mug', 'cylinder', 'white coffee mug cylinder cup', ['mug'], []),
    B('Rubber Ball', 'sphere', 'red rubber ball sphere', ['ball'], []),
    B('Truck Tire', 'torus', 'black rubber tire torus ring', ['tire'], []),
    B('Life Buoy', 'torus', 'red life buoy ring torus', ['buoy'], []),
    B('Brass Key', 'box', 'small brass key box teeth', ['key'], []),
    B('Glass Bottle', 'capsule', 'green glass bottle capsule', ['bottle'], []),
    B('Floor Rug', 'plane', 'patterned floor rug plane', ['rug'], []),
    B('Treasure Chest', 'treasureChest', 'iron-bound treasure chest coffer', ['treasure'], []),
  ] },
];

function main() {
  // self-cleaning: drop previous run so renames never leave stale recipes
  for (const cat of CATS) {
    const outDir = path.join(ROOT, cat.dir);
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  }
  const entries = [];
  const catCounts = {};
  let seedCounter = 41000;
  for (const cat of CATS) {
    const outDir = path.join(ROOT, cat.dir);
    fs.mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < cat.count; i++) {
      const base = cat.bases[i % cat.bases.length];
      const serial = String(i + 1).padStart(3, '0');
      const adj = pick(base.adjs || cat.adjs);
      const quality = pickQuality();
      const style = base.k === 'dragon' && rng() < 0.5 ? 'fantasy' : pick(cat.styles);
      const material = pick(base.mats || cat.materials);
      const mood = pickMood();
      const nParts = base.pp.length ? (rng() < 0.55 ? Math.min(base.pp.length, 1 + Math.floor(rng() * 2)) : 0) : 0;
      const shuffled = base.pp.slice().sort(() => rng() - 0.5);
      const parts = shuffled.slice(0, nParts);
      const partsPhrase = parts.length ? ' with ' + parts.join(' and ') : '';
      const prompt = [mood.word, MAT_ADJ[material], base.p + partsPhrase, STYLE_WORD[style]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const budget = Math.round(BUDGET[quality] * (0.9 + rng() * 0.2));
      const id = `${cat.prefix}-${slug(base.n)}-${serial}`;
      const name = `${adj} ${base.n} ${serial}`;
      const recipe = {
        id, name, category: cat.dir, prompt, kit: base.k,
        params: { quality, style, material, poly: budget, parts },
        tags: Array.from(new Set([cat.tag, base.k, style, material, mood.mood].concat(base.t))),
        difficulty: DIFF[quality], polyTarget: budget, seed: seedCounter++,
      };
      fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(recipe, null, 1) + '\n');
      entries.push({ id, name, category: cat.dir, prompt, kit: base.k, tags: recipe.tags, difficulty: recipe.difficulty, file: cat.dir + '/' + id + '.json' });
    }
    catCounts[cat.dir] = cat.count;
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : 1));
  const manifest = {
    version: VERSION, generated: new Date().toISOString().slice(0, 10),
    total: entries.length, categories: {},
    entries,
  };
  for (const cat of CATS) manifest.categories[cat.dir] = { count: cat.count, path: cat.dir + '/' };
  fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log('UltraForge example library v' + VERSION);
  let total = 0;
  for (const cat of CATS) { console.log('  ' + cat.dir + ': ' + cat.count); total += cat.count; }
  console.log('TOTAL: ' + total + ' recipes');
}

main();
