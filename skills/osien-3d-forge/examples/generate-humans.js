'use strict';
/* UltraForge v2.4 human-players examples — 120 recipes (10 per 12 archetype groups).
 * Run: node generate-humans.js (safe re-run: removes old human-players entries first)
 * Every prompt routes to its kit (verified against parsePrompt human table).
 * Trap-word hygiene: each prompt contains ONLY its group's trigger word plus
 * neutral adjectives (no cross-kit / veg / water / v2-trap words).
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

// [slug, kit, core (routes to kit), tags, style]
const GROUPS = [
  ['male', 'baseMale', 'standing man', ['man', 'male', 'casual'], 'realistic'],
  ['female', 'baseFemale', 'standing woman', ['woman', 'female', 'casual'], 'realistic'],
  ['child', 'baseChild', 'young child', ['child', 'kid', 'young'], 'realistic'],
  ['warrior', 'warrior', 'fierce warrior', ['warrior', 'fighter', 'tribal'], 'fantasy'],
  ['knight', 'knight', 'noble knight in armor', ['knight', 'armor', 'plate'], 'fantasy'],
  ['mage', 'mage', 'wise mage with staff', ['mage', 'wizard', 'staff'], 'fantasy'],
  ['archer', 'archer', 'swift archer with bow', ['archer', 'bow', 'ranger'], 'fantasy'],
  ['soldier', 'soldierModern', 'modern soldier', ['soldier', 'modern', 'tactical'], 'realistic'],
  ['pirate', 'pirate', 'rugged pirate captain', ['pirate', 'captain', 'rogue'], 'fantasy'],
  ['ninja', 'ninja', 'silent ninja', ['ninja', 'stealth', 'shadow'], 'fantasy'],
  ['astronaut', 'astronaut', 'brave astronaut', ['astronaut', 'space', 'suit'], 'realistic'],
  ['runner', 'runner', 'swift running athlete', ['runner', 'athlete', 'sport'], 'realistic'],
];
// neutral adjectives only — never a kit/quality/veg/water trap word
const ADJS = ['brave', 'tall', 'strong', 'swift', 'silent', 'noble', 'rugged', 'keen', 'bold', 'calm', 'sturdy', 'grand', 'wild', 'proud', 'steady'];
const QUALITIES = ['cinema', 'game', 'game', 'game', 'game', 'draft', 'cinema', 'game', 'draft', 'game'];

function main() {
  const manPath = path.join(ROOT, 'index.json');
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const outDir = path.join(ROOT, 'human-players');
  fs.mkdirSync(outDir, { recursive: true });
  const newEntries = [];
  let n = 0;
  for (const [slug, kit, core, tags, style] of GROUPS) {
    for (let i = 1; i <= 10; i++) {
      n++;
      const id = 'hum-' + slug + '-' + String(i).padStart(3, '0');
      const adj1 = pick(ADJS);
      let adj2 = pick(ADJS);
      if (adj2 === adj1) adj2 = 'bold';
      const q = QUALITIES[(i - 1) % QUALITIES.length];
      const name = adj1[0].toUpperCase() + adj1.slice(1) + ' ' + slug[0].toUpperCase() + slug.slice(1) + ' ' + String(i).padStart(3, '0');
      const prompt = adj1 + ' ' + adj2 + ' ' + core;
      const recipe = {
        id, name, category: 'human-players', kit,
        prompt, seed: 40000 + n,
        params: { quality: q, style: style },
        tags: tags.concat([adj1, adj2, q]), difficulty: q === 'cinema' ? 'advanced' : q === 'game' ? 'intermediate' : 'beginner'
      };
      fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(recipe, null, 1) + '\n');
      newEntries.push({ id, name, category: 'human-players', prompt, kit, tags: recipe.tags, difficulty: recipe.difficulty, file: 'human-players/' + id + '.json' });
    }
  }
  man.entries = man.entries.filter(e => e.category !== 'human-players').concat(newEntries);
  man.entries.sort((a, b) => (a.id < b.id ? -1 : 1));
  man.total = man.entries.length;
  man.version = '2.4.0';
  man.generated = '2026-10-01';
  man.categories['human-players'] = { count: newEntries.length, path: 'human-players/' };
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1) + '\n');
  console.log('human-players: ' + newEntries.length + ' recipes, total now ' + man.total);
}
main();
