'use strict';
/* UltraForge v2.3 water-ultra examples — 80 recipes (10 per kit x 8 kits).
 * Run: node generate-water.js (appends to index.json, safe re-run via id overwrite)
 * Every prompt routes to its declared water kit (verified against parsePrompt water table).
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
const rng = mulberry32(20261003);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const BASES = [
  ['ocean', 'oceanWave', 'stormy ocean waves surf', ['ocean', 'surf', 'swell'], ['stormy', 'big', 'foamy', 'deep', 'wild']],
  ['lake', 'calmLake', 'calm mountain lake water', ['lake', 'still', 'mirror'], ['calm', 'clear', 'still', 'serene']],
  ['river', 'riverRapids', 'rushing river rapids stream', ['river', 'rapids', 'whitewater'], ['rushing', 'foamy', 'fast', 'rocky']],
  ['waterfall', 'waterfall', 'tall waterfall cascade falls', ['waterfall', 'cascade', 'mist'], ['tall', 'misty', 'powerful']],
  ['pool', 'poolWater', 'swimming pool clear water', ['pool', 'tiled', 'clean'], ['clear', 'clean', 'blue', 'still']],
  ['puddle', 'puddle', 'rainy street puddle water', ['puddle', 'rain', 'street'], ['rainy', 'reflective', 'shallow']],
  ['rainpond', 'rainPond', 'rain pond ripples water', ['rain', 'pond', 'ripples'], ['rainy', 'rippled', 'fresh']],
  ['tropical', 'tropicalShallows', 'tropical turquoise shallows lagoon', ['tropical', 'lagoon', 'sand'], ['turquoise', 'shallow', 'sandy', 'clear']],
];
const QUALITIES = ['game', 'game', 'cinema', 'cinema', 'game', 'draft'];

function main() {
  const manPath = path.join(ROOT, 'index.json');
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const outDir = path.join(ROOT, 'water-ultra');
  fs.mkdirSync(outDir, { recursive: true });
  const fresh = [];
  let n = 0;
  for (const [slugBase, kit, core, tags, adjs] of BASES) {
    for (let i = 1; i <= 10; i++) {
      n++;
      const id = 'wat-' + slugBase + '-' + String(i).padStart(3, '0');
      const adj1 = pick(adjs);
      let adj2 = pick(adjs.filter(a => a !== adj1));
      const q = pick(QUALITIES);
      const name = adj1[0].toUpperCase() + adj1.slice(1) + ' ' + slugBase[0].toUpperCase() + slugBase.slice(1) + ' ' + String(i).padStart(3, '0');
      const prompt = adj1 + ' ' + adj2 + ' ' + core;
      const recipe = {
        id, name, category: 'water-ultra', kit, prompt, seed: 40000 + n,
        params: { quality: q, style: 'realistic' },
        tags: tags.concat([adj1, adj2, q]), difficulty: q === 'cinema' ? 'advanced' : q === 'game' ? 'intermediate' : 'beginner'
      };
      fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(recipe, null, 1) + '\n');
      fresh.push({ id, name, category: 'water-ultra', prompt, kit, tags: recipe.tags, difficulty: recipe.difficulty, file: 'water-ultra/' + id + '.json' });
    }
  }
  man.entries = man.entries.filter(e => e.category !== 'water-ultra').concat(fresh);
  man.entries.sort((a, b) => (a.id < b.id ? -1 : 1));
  man.total = man.entries.length;
  man.version = '2.3.0';
  man.generated = '2026-10-01';
  man.categories['water-ultra'] = { count: fresh.length, path: 'water-ultra/' };
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1) + '\n');
  console.log('water-ultra: ' + fresh.length + ' recipes, total now ' + man.total);
}
main();
