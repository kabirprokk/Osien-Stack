# UltraForge v2.1 — Example Library (1040 recipes)

Seeded, deterministic reference library so AIs/bots can **search → build → remix**
instead of starting from a blank prompt. Every recipe maps to a real engine kit
(verified: 1040/1040 prompts route to their declared `kit` via `parsePrompt()`).

## Categories

| Folder | Count | Kits used | Example IDs |
|---|---|---|---|
| `buildings-bldg/` | 120 | building, castle, house, bridge | `bldg-gothic-cathedral-001` |
| `weapons-guns/` | 120 | sword, swordV2, axe, shield, helmet, cylinder, box, torus | `gun-ak-47-rifle-008` |
| `natural/` | 120 | tree, rock, mushroom, alienPlant, crystal | `nat-pine-tree-001` |
| `vehicles/` | 100 | car, carSportsV2, motorcycle, airplane, boat | `veh-race-supercar-003` |
| `characters/` | 80 | humanoid, robot | `char-village-knight-001` |
| `creatures/` | 80 | dragon, creature | `crea-fire-dragon-001` |
| `furniture/` | 100 | chair, table, sofa, bed, bookshelf, throne, lamp | `furn-royal-throne-009` |
| `architecture-interior/` | 80 | lamp, bookshelf, bed, sofa, throne, fountain, table | `intr-lobby-chandelier-001` |
| `scifi/` | 80 | robot, spaceship, car, box, cylinder, torus | `sfx-starship-002` |
| `fantasy/` | 60 | dragon, castle, swordV2, shield, crystal, treasureChest | `fant-rune-blade-003` |
| `food/` | 40 | sphere, torus, cone, cylinder, capsule | `food-donut-003` |
| `everyday-props/` | 60 | box, sphere, cylinder, torus, capsule, plane, lamp, treasureChest | `prop-wooden-crate-001` |
| **Total** | **1040** | 43 kits | |

## Recipe schema

Each recipe is one JSON file (`<id>.json`):

```json
{
  "id": "nat-pine-tree-001",
  "name": "Mossy Pine Tree 001",
  "category": "natural",
  "prompt": "fabric tall pine tree stylized",
  "kit": "tree",
  "params": { "quality": "game", "style": "stylized", "material": "fabric", "poly": 11737, "parts": [] },
  "tags": ["nature", "tree", "stylized", "fabric", "balanced", "pine", "forest"],
  "difficulty": "intermediate",
  "polyTarget": 11737,
  "seed": 41240
}
```

`index.json` is the manifest: `{version, generated, total, categories, entries[]}`
(lightweight entries so search never reads 1040 files).

## How AIs use the library (search → build → remix)

**1. Search** for the closest reference — don't guess prompts:
```bash
node cli.js --search "dragon"            # match id/name/prompt/tags/kit
node cli.js --category vehicles         # list 10 from a category
node cli.js --category                  # list all 12 categories + counts
```

**2. Build** the example exactly (params baked in, reproducible via `seed`):
```bash
node cli.js --example crea-fire-dragon-001 --format glb --out ./out --stats
node cli.js --random fantasy --format obj --out ./out   # surprise me, then keep/iterate
```

**3. Remix** the params — keep what works, change one axis at a time:
```bash
# same dragon, hero quality + gold PBR:
node cli.js --example crea-fire-dragon-001 --quality cinema --material gold --format glb --out ./out --stats
# same reference prompt, pushed further via API:
```

```js
const { UltraForge } = require('./index.js');
const { mesh, stats, recipe } = UltraForge.fromExample('crea-fire-dragon-001', { quality: 'cinema' });
// recipe.params / recipe.tags tell you what made the reference good — reuse them.
```

**4. Finish** with the right quality: `--quality cinema` for hero assets,
`game` for realtime/scene filler, `draft` for thumbnails, `print` (+`--format stl`) for 3D printing.

### 3 remix recipes (copy-paste patterns)

```bash
# R1 — Material swap: keep silhouette, change PBR story (wood -> obsidian ancient)
node cli.js --example furn-royal-throne-009 --material obsidian --quality cinema --format glb --out ./out --stats
# R2 — Quality ladder: draft thumbnail first, cinema hero on approval
node cli.js --example veh-race-supercar-003 --quality draft --format obj --out ./out
node cli.js --example veh-race-supercar-003 --quality cinema --textures --turntable --format glb --out ./out
# R3 — Kit-bash via prompt: build two examples, describe the merge as a new prompt
node cli.js --example bldg-gothic-cathedral-001 --format obj --out ./ref
node cli.js --example fant-elven-castle-002 --format obj --out ./ref
# then: node cli.js "ancient stone elven castle cathedral with towers and gate fantasy" --quality cinema --format glb --out ./out
```

## API (`catalog.js` + engine)

```js
const catalog = require('./catalog.js');
catalog.count();                                    // 1040
catalog.listCategories();                           // [{name, count, path}...]
catalog.search({ query: 'castle', limit: 5 });      // filter: category/kit/tag/difficulty/query
catalog.getById('gun-ak-47-rifle-008');             // full recipe
catalog.getByName('Ancient Gothic Cathedral 001');  // full recipe (exact/fuzzy)
catalog.random('food', 2);                          // 2 random full recipes

const { UltraForge } = require('../index.js');
UltraForge.listExamples({ kit: 'dragon', limit: 5 });
UltraForge.fromExample('sfx-starship-002', { quality: 'cinema' }); // {mesh, stats, recipe}
new UltraForge({ seed: 7 }).buildExample('food-donut-003');       // instance version
```

## Regenerate

```bash
node generate.js   # seeded (mulberry32) — deterministic, rewrites all 1040 JSONs + index.json
```

Prompt words are constrained on purpose: material adjectives (`stone`, `crystal`, `gold`)
and substrings (`village`~`villa`, `cabinet`~`cabin`, `carrot`~`car`, `street`~`tree`,
`vegetable`~`table`) can hijack `parsePrompt()` routing — per-base material/adjective
pools in `generate.js` keep every recipe on its declared kit.

## vegetation-ultra (120 recipes, v2.2)
Perfect grass + bush references: 60 grass (lawn/meadow/savanna/pampas/moss/clover/wheat/reed) + 60 bushes (boxwood/rose/hydrangea/juniper/hedge/bramble/lavender/bonsai). Regenerate: node generate-vegetation.js. Browse: --category vegetation-ultra. Total library now 1160.

## water-ultra (80 recipes, v2.3)
Very high quality water: ocean/lake/tropical/river/waterfall/pool/puddle/rainpond (10 each). Regenerate: node generate-water.js. Browse: --category water-ultra. Total library now 1240.

## human-players (120 recipes, v2.4)
24 rigged archetypes (warriors, mages, soldiers, crew...). 60 older character recipes upgraded to the new kits (elf->mage, marine->soldierModern...). Total library now 1360, audit 1360/1360 clean.
