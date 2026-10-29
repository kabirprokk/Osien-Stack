---
description: PERFECT 3D pipeline — AI base -> sculpt -> retopo -> UV -> bake -> texture -> rig -> animate -> export (human checkpoints)
agent: model-creator
---
PERFECT 3D PIPELINE (human checkpoints required — AI assists, human polishes):
1. BASE MESH: osien-3d-forge (primitives/vegetation/kits) OR AI generator (Meshy/Tripo/Rodin for props; MakeHuman/Character Creator/MetaHuman for humans). Export GLB/OBJ.
2. SCULPT (human): ZBrush or Blender sculpt — high-poly detail (muscles, pores, cloth). AI can't do final sculpt; human polishes.
3. RETOPO (human/AI-assist): Auto-Rig Pro / Blender retopo tools -> low-poly game mesh; keep silhouette.
4. UV UNWRAP: Blender Smart UV / UDIM; auto-UV from forge for simple assets.
5. BAKE: normals/ao/curvature from high to low (Substance/Marmoset/Blender).
6. TEXTURE: AI (Meshy texture / Dream Textures addon / Substance) then hand-paint polish. PBR: albedo/normal/roughness/metallic/ao.
7. RIG: Auto-Rig Pro / Rigify / Mixamo auto-rig; for humans use HumanIK/CC rig.
8. ANIMATE: Mixamo base mocap -> Cascadeur keyframe polish -> DeepMotion/Plask video mocap -> Rokoko real-time. Retarget + polish in graph editor.
9. VERIFY: node --check / mesh validate (manifold, UV coverage, poly budget, LODs) via osien-3d-forge export checks.
10. EXPORT: GLB (web/games), FBX (anim), USD (film), with LODs.
Human checkpoints after steps 2, 4, 6, 8. AI never declares "perfect" without human sign-off. Caveman style.
