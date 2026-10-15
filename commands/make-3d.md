---
description: Generate a procedural 3D model from a text prompt (instant, local, $0)
---

# /3d — instant procedural 3D model

Generate with the global `osien-3d-forge` engine (zero deps, <50ms, OBJ/STL/GLTF/GLB). Any model or bot can invoke it the same way.

## Invoke

```bash
node ~/.config/opencode/skills/osien-3d-forge/cli.js "<prompt>" --format glb --out ./out
```

Arguments: `$ARGUMENTS` is the prompt, e.g. `/3d red sports car` or `/3d low poly pine tree --format obj`.

## Flags

- `--format obj|stl|gltf|glb` (default `glb`; add `--ascii` for ASCII STL)
- `--out ./out` (output dir), `--poly 10k` (triangle budget), `--lod 3` (LOD chain), `--seed N`
- `--list` (kits), `--batch scenes.json` (many models at once)

## Examples

```bash
node ~/.config/opencode/skills/osien-3d-forge/cli.js "red sports car" --format glb --out ./out
node ~/.config/opencode/skills/osien-3d-forge/cli.js "low poly tree" --format obj --out ./out
node ~/.config/opencode/skills/osien-3d-forge/cli.js "wooden chair" --format stl --out ./out
node ~/.config/opencode/skills/osien-3d-forge/cli.js "humanoid character" --format gltf --out ./out
```

## JS API (alternative)

```js
const { UltraForge } = require(process.env.HOME + '/.config/opencode/skills/osien-3d-forge/index.js');
const { mesh, stats } = new UltraForge().quick('red sports car');
new UltraForge().save(mesh, './out/car.glb');
```

Kits: humanoid, car, building, chair, table, tree, rock, sword, creature + primitives (box/sphere/cylinder/cone/torus/plane/capsule/tube/lathe/extrusion). Color words tint the PBR material; `low poly` caps ≈2.5k tris. CLI prints `{prompt, verts, tris, timeMs, files}` JSON.
