---
name: osien-3d-forge
description: Ultra-fast procedural 3D generator for all bots — primitives, parametric kits incl. perfect grass+bush vegetation-ultra, LOD, auto-UV/normals, GLB/OBJ/STL/GLTF export. Use when user says 3d/model/mesh/asset/character/vehicle/building/furniture/grass/bush/lawn/garden.
---

# osien-3d-forge

Zero-dep, local-first, $0 procedural 3D generator. Builds meshes in <50ms with Node stdlib only. Works for every OSIEN bot and every opencode model with no install.

## When to use

Trigger on: `3d`, `model`, `mesh`, `asset`, `character`, `vehicle`, `building`, `furniture`, `generate … car/chair/tree/…`.

## CLI (fastest — use this)

```bash
node ~/.config/opencode/skills/osien-3d-forge/cli.js "<prompt>" --format glb --out ./out
node ~/.config/opencode/skills/osien-3d-forge/cli.js "red sports car" --format glb --out ./out --poly 10k --lod 3
node ~/.config/opencode/skills/osien-3d-forge/cli.js --list
node ~/.config/opencode/skills/osien-3d-forge/cli.js --batch scenes.json --format obj --out ./out
```

Flags: `--format obj|stl|gltf|glb` (default glb), `--out ./out`, `--poly 10k|2500` (triangle budget), `--lod 3` (LOD chain files `*_lod0..2`), `--seed N`, `--ascii` (ASCII STL instead of binary).

## API

```js
const { UltraForge } = require(process.env.HOME + '/.config/opencode/skills/osien-3d-forge/index.js');
const forge = new UltraForge({ seed: 7 });

// Fast path: natural language → mesh in <50ms
const { mesh, stats } = forge.quick('low poly red sports car');
// → stats: { verts, tris, timeMs, polyLevel, kind, color }

forge.save(mesh, './out/car.glb');           // auto-detects .obj/.stl/.gltf/.glb
const lods = forge.lod(mesh, 3);             // [full, 1/4, 1/16] decimated copies
const all = forge.batch(['wooden chair', 'stone rock', 'pine tree']); // [{mesh,stats}…]
```

## Prompts that work

| Say | Gets |
|---|---|
| `red sports car` / `blue truck` | `car()` racer body, wheels, spoiler, metallic PBR |
| `humanoid character` / `robot avatar` | `humanoid()` head+torso+limbs |
| `house` / `castle tower` / `skyscraper` | `building()` stacked floors + roof + windows |
| `wooden chair` / `desk table` | `chair()` / `table()` wood PBR |
| `low poly pine tree` | `tree()` trunk + cone layers, vertex colors |
| `stone rock` / `boulder` | `rock()` fbm-displaced sphere |
| `sword` / `katana` | `sword()` blade+guard+grip |
| `dragon creature` / `beast` | `creature()` body+head+legs+tail+horns |
| `sphere|box|cylinder|cone|torus|capsule|plane` | matching primitive |

Modifiers: `low poly` caps ≈2.5k tris; `high/detailed/ultra` raises detail; `--poly 10k` overrides. Color words (red/blue/wood/stone/…) tint the PBR baseColor.

## API table

Primitives: `box(w,h,d)`, `sphere(detail)`, `cylinder(rTop,rBot,h,seg)`, `cone(r,h,seg)`, `torus(R,r,u,v)`, `plane(w,d,seg)`, `capsule(r,h,seg)`, `tubeAlongCurve([[x,y,z]…],radius,seg)`, `lathe([[r,y]…],seg)`, `extrusion([[x,y]…],depth)`.
Kits: `humanoid()`, `car()`, `building()`, `chair()`, `table()`, `tree()`, `rock()`, `sword()`, `creature()`.
Modifiers: `subdivide(m,n)`, `smooth(m,n)`, `decimate(m,targetTris)`, `autoUV(m)`, `computeNormals(m)`, `quantize(m,bits)`, `weld(m,tol)`, `mirror(m,axis)`, `array(m,count,offset)`, `scatter(m,count,radius,seed)`.
Material: `pbr({baseColor,metallic,roughness})`, `proceduralPBR(seed,opts)`, `vertexColors(m,fn)`, `bakeTexture(m,w,h)` (canvas if installed, else `procedural:…` descriptor).
Export: `toOBJ(m)`, `toSTL(m,ascii?)`, `toGLTF(m)`, `toGLB(m)`, `save(m,path)`.

## File outputs

One file per model: `<prompt-slug>.<obj|stl|gltf|glb>`. With `--lod 3`: `<slug>_lod0/1/2.<ext>`. CLI prints `{prompt, verts, tris, timeMs, polyLevel, kind, color, files:[{file,bytes}]}`.

---

## v2 — BEST-MODELS-EVER quality (engine 2.0.0)

V2 keeps every v1 command working and adds an ULTRA pipeline: Catmull-Clark subdivision, Taubin smoothing, weld-by-distance + degenerate removal + winding fix, angle-weighted normals with 30° hard-edge split, tangents, box/spherical/cylindrical auto-UV packed into a padded 0-1 atlas, PBR ULTRA materials (metallic + roughness + cavity AO + micro-normal noise + 3-layer base/wear/edge colors), style-aware sculpt (ridged rock, wood rings, brushed metal), QEM-lite decimation, and a watertight 4-level LOD chain (100%/50%/25%/12%).

### Quality presets

| Preset | Flag | What it does | Use for |
|---|---|---|---|
| `draft` | `--quality draft` | clean topology + AO only, ≤4k tris, <10ms | concepts, thumbnails, lowpoly style |
| `game` | `--quality game` (default) | + Taubin smooth, bevels, pro UV, ≤12k tris | realtime, games, previews |
| `cinema` | `--quality cinema` | + subdiv ×2, sculpt, micro-normals, ≤24k tris, still <300ms | hero assets, close-ups, portfolio |
| `print` | `--quality print` | + subdiv ×1, watertight weld + winding fix, ≤30k tris | 3D printing / STL |

### Kits (43 total)

Primitives (10): `box sphere cylinder cone torus plane capsule tubeAlongCurve lathe extrusion`.
V1 kits (9): `humanoid car building chair table tree rock sword creature`.
V2 kits (24): `dragon robot spaceship castle house bridge swordV2(ornate) axe shield helmet throne lamp sofa bed bookshelf carSportsV2(rims+spoiler+headlights) motorcycle airplane boat alienPlant mushroom crystal treasureChest fountain`.

Every v2 kit ships beveled edges (no razor-sharp CG), real proportions, secondary details (buttons, rivets, spokes, portholes, book rows) and micro-bevels via the quality pipeline.

### V2 CLI flags (all backward compatible)

`--quality draft|game|cinema|print` (default game), `--style realistic|stylized|lowpoly|scifi|fantasy`, `--material gold|wood|chrome|rust|marble|steel|copper|…`, `--textures` (bakes albedo+roughness+AO: PNG via canvas if installed, else PPM), `--rig` (skeleton JSON sidecar with joints + named parts + pivots), `--turntable` (8-angle previews: PNG or PPM), `--stats` (prints verts/tris/time/quality score).

### Pro tips for AIs (how to get BEST results)

1. **Always use `--quality cinema` for hero assets**, `game` for realtime/scene filler, `draft` only for thumbnails.
2. **Add style + material words to the prompt**: `realistic`, `stylized`, `lowpoly`, `scifi`, `fantasy` steer detail; `gold`, `wooden`, `chrome`, `rusted`, `marble` drive PBR (metallic/roughness auto-set).
3. **Add mood words**: `worn`/`weathered` adds edge wear, `pristine`/`polished` keeps it clean, `ancient` adds heavy aging.
4. **Name parts you want**: `wheels`, `spoiler`, `rims`, `headlights`, `wings`, `chimney`, `gate` — the parser routes to the richest kit (e.g. `car` + `spoiler` → sports-car kit).
5. **Export smart**: `--format glb` for apps/web, `obj` for editing, `stl + --quality print` for 3D printing, `--lod 4` for engine LOD chains, `--rig` for characters/creatures.

### 5 copy-paste BEST prompts

```bash
node cli.js "ornate gold dragon fantasy masterpiece" --quality cinema --format obj --out ./out --stats
node cli.js "red sports car realistic with spoiler rims headlights" --quality cinema --format glb --out ./out --textures --turntable
node cli.js "wooden throne stylized with cushions" --quality cinema --format gltf --out ./out --stats
node cli.js "weathered stone castle with gate and towers" --quality game --format glb --out ./out --lod 4
node cli.js "cute robot character stylized" --quality game --format glb --out ./out --rig --turntable
```

---

## Example library v2.1 (1040 recipes — AIs start here, not from blank prompts)

`examples/` holds 1040 seeded recipes across 12 categories. Every prompt is verified
to route to its declared kit. **Flow: search → build → remix.**

```bash
node cli.js --search "dragon"                          # match id/name/prompt/tags/kit
node cli.js --category vehicles                        # list 10 from a category
node cli.js --example crea-fire-dragon-001 --format glb --out ./out --stats
node cli.js --random fantasy --format obj --out ./out  # surprise me, then iterate
# remix: keep the reference, change one axis:
node cli.js --example crea-fire-dragon-001 --quality cinema --material gold --format glb --out ./out --stats
```

| Category | Count | | Category | Count |
|---|---|---|---|---|
| `buildings-bldg/` | 120 | | `furniture/` | 100 |
| `weapons-guns/` | 120 | | `architecture-interior/` | 80 |
| `natural/` | 120 | | `scifi/` | 80 |
| `vehicles/` | 100 | | `fantasy/` | 60 |
| `characters/` | 80 | | `food/` | 40 |
| `creatures/` | 80 | | `everyday-props/` | 60 |

```js
const { UltraForge } = require(process.env.HOME + '/.config/opencode/skills/osien-3d-forge/index.js');
UltraForge.listExamples({ query: 'castle', limit: 5 });   // browse
const { mesh, stats, recipe } = UltraForge.fromExample('bldg-gothic-cathedral-001', { quality: 'cinema' });
new UltraForge({ seed: 7 }).buildExample('food-donut-003'); // instance version
// recipe.params/.tags/.prompt show what made the reference good — reuse them, then
// remix: (R1) --material swap, (R2) draft→cinema quality ladder, (R3) merge two example prompts.
// See examples/README.md for the full table + 3 remix recipes.
```

## VEGETATION-ULTRA v2.2 — perfect grass + perfect bush (why it beats generic AI)

Generic AIs fail grass/bush because theyes guess pixels. UltraForge builds botany:
- Grass 3-scale: blade (tapered V-fold ribbon, root-AO → tip-light, dry tips, dew) → tuft (phyllotactic spiral, 3 height layers) → patch (Poisson field, bare-earth noise mask, thatch under-layer, wind weights in uv.y)
- Bush 3-shell: branches (recursive, droop, bark ridges, moss north side) + leaves (cupped bilayer, 5 shapes, vein darkening) in outer/mid/inner canopy + cavity AO + new-growth tips + flowers/fruit
- 16 veg kits: lawnGrass wildMeadow savannaTuft pampasPlume mossCarpet cloverPatch wheatField reedMarsh boxwoodTopiary roseBush hydrangea juniperConifer hedgeRow wildBramble lavenderBush bonsai + scatterVegetation garden builder
- 120 veg examples in `vegetation-ultra/` (total library now 1160). Total kits now 91 (16 veg + 8 water + 24 humans) + 32 game animations.

```bash
node cli.js "lush green manicured lawn grass" --quality cinema --format glb --out ./out --stats
node cli.js "wild meadow tall grass with flowers" --quality game --format glb --out ./out --stats
node cli.js "dense boxwood bush topiary ball" --quality game --format glb --out ./out --stats
node cli.js "wild rose bush with red blooms" --quality game --format glb --out ./out --stats
node cli.js "trimmed hedge row" --quality game --format obj --out ./out --stats
node cli.js --example veg-meadow-001 --format glb --out ./out --stats
node cli.js --category vegetation-ultra | --search "bonsai"
```
Tips: grass defaults cinema (dense), bushes default game. Add `lush/dense` for cinema density, `dry` for savanna yellowing, name flowers (`rose blooms`) for blossom clusters.

## WATER-ULTRA v2.3 — very high quality water (why it beats generic AI)
Generic AIs paint a flat blue plane. UltraForge builds water systems:
- Waves: 4 Gerstner-lite swells + chop (sharp crests), frozen at best crest moment, directional flow, rain rings
- Color: shallow turquoise -> deep navy depth gradient + caustic light webs + subsurface flank glow, all in vertex colors
- Foam where physics says: crests + shoreline ring/banks + rapids bands + plunge pool, broken by noise (no foam soup)
- Systems not slabs: ocean (swell+streaks), lake (ring shore), tropical (sand ripples under clear sheet), river (banks+rapids), waterfall (lip+sheet+plunge+mist+rocks), pool (tiles+coping+clear top), puddle (wet ring+rain rings), rain pond
- 8 kits: oceanWave calmLake tropicalShallows riverRapids waterfall poolWater puddle rainPond + 80 water-ultra examples (library now 1240, 67 kits).
```bash
node cli.js "stormy ocean waves" --quality cinema --format glb --out ./out --stats
node cli.js "tall waterfall cascade" --quality cinema --format glb --out ./out --stats
node cli.js "tropical turquoise shallows lagoon" --quality game --format glb --out ./out --stats
node cli.js "rushing river rapids" --quality game --format glb --out ./out --stats
node cli.js --example wat-ocean-001 --format glb --out ./out --stats
node cli.js --category water-ultra | --search "lagoon"
```
Tips: add stormy/big for cinema swells, clear/still for glassy lake/pool, rainy for ripple rings. Materials carry transparent+opacity; GLTF/GLB keep vertex foam/depth.

## HUMAN-PLAYERS + GAME-ANIMATIONS v2.4 (rigged characters, real movesets)
24 parametric humans (male/female/child/warrior/knight/mage/archer/soldier/pirate/ninja/astronaut/runner/worker/king/zombie/vampire/cyborg/monk/viking/samurai/cowboy/pilot/medic/robotTrooper), all H=1.8m, A-pose, 17-bone rig (hips/spine/chest/neck/head/arms/legs), 120 human-players examples (library now 1360).
32 procedural clips: idle breathe walk run sprint jump land crouchIdle crouchWalk sneak turnLeft turnRight punch kick attackSlash1 attackSlash2 attackStab attackCombo block hitReact death dance wave bow cheer sit swim climb aimBow castSpell throw talk. Gait science: counter-phase thighs, knees-only-backward, 2x hip bob.
```bash
node cli.js "hero knight in armor" --quality game --format glb --out ./out --rig --anim walk --anim run --anim idle --anim attackSlash1 --anim death --stats
node cli.js --list-anims | --example hum-knight-003 --format glb --out ./out --anim walk
```
Browser: anim-player.js (AnimPlayer + buildSkeletonMesh + loadClip) retargets any clip onto any 17-bone rig. Router notes: gear-focus guard (knight helmet = helmet), person-context kits, 1360/1360 audit clean.
