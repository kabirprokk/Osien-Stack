'use strict';
/* osien-3d-forge — HUMAN-ULTRA v2.4.0 (PLAYER mega-pack)
 * 24 parametric human/player kits. Realistic proportions (~7.5 heads, H~1.8m),
 * symmetric A-pose, tapered-cylinder limbs, face hint via vertex colors,
 * STANDARD 17-bone rig on every mesh (animation-system contract).
 * Node stdlib only. Patches UltraForge without breaking v1/v2/v2.2/v2.3 API:
 * copy of the vegetation.js register-pattern (chained _origParse/_origQuick).
 */
function _hmulberry(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _hclamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _hshade(c, f) { return [_hclamp(c[0] * f, 0, 1), _hclamp(c[1] * f, 0, 1), _hclamp(c[2] * f, 0, 1)]; }
function _hvary(c, rng, amt) {
  amt = amt === undefined ? 0.08 : amt;
  const f = 1 + (rng() - 0.5) * 2 * amt;
  return _hshade(c, f);
}
// module-local transforms (index.js translate/scaleM/mergeMeshes equivalents)
function _t(m, x, y, z) {
  for (let i = 0; i < m.positions.length; i += 3) { m.positions[i] += x; m.positions[i + 1] += y; m.positions[i + 2] += z; }
  return m;
}
function _s(m, sx, sy, sz) {
  if (sz === undefined) sz = 1;
  for (let i = 0; i < m.positions.length; i += 3) { m.positions[i] *= sx; m.positions[i + 1] *= sy; m.positions[i + 2] *= sz; }
  return m;
}
function _merge(list, name) {
  const out = { name: name || 'merged', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
  let off = 0;
  for (const m of list) {
    for (let i = 0; i < m.positions.length; i++) out.positions.push(m.positions[i]);
    for (let i = 0; i < m.indices.length; i++) out.indices.push(m.indices[i] + off);
    const n = m.positions.length / 3;
    const uv = (m.uvs && m.uvs.length === n * 2) ? m.uvs : new Array(n * 2).fill(0);
    const cl = (m.colors && m.colors.length === n * 3) ? m.colors : new Array(n * 3).fill(0.7);
    for (let i = 0; i < uv.length; i++) out.uvs.push(uv[i]);
    for (let i = 0; i < cl.length; i++) out.colors.push(cl[i]);
    if (m.normals && m.normals.length === n * 3) for (let i = 0; i < m.normals.length; i++) out.normals.push(m.normals[i]);
    off += n;
  }
  return out;
}

const HUMAN_KITS = ['baseMale', 'baseFemale', 'baseChild', 'warrior', 'knight', 'mage', 'archer',
  'soldierModern', 'pirate', 'ninja', 'astronaut', 'runner', 'worker', 'king', 'zombie', 'vampire',
  'cyborg', 'monk', 'viking', 'samurai', 'cowboy', 'pilot', 'medic', 'robotTrooper'];

const SKIN_TONES = [
  [0.98, 0.80, 0.64], [0.90, 0.72, 0.58], [0.76, 0.55, 0.40],
  [0.55, 0.38, 0.27], [0.36, 0.25, 0.18]
];
// EXACT animation-system contract: 17 bones, H=1.8 positions. Do not rename/rescale.
const STANDARD_RIG_BONES = [
  { name: 'hips', parent: null, head: [0, 0.95, 0] },
  { name: 'spine', parent: 'hips', head: [0, 1.12, 0] },
  { name: 'chest', parent: 'spine', head: [0, 1.32, 0] },
  { name: 'neck', parent: 'chest', head: [0, 1.50, 0] },
  { name: 'head', parent: 'neck', head: [0, 1.63, 0] },
  { name: 'upperArm.L', parent: 'chest', head: [-0.26, 1.40, 0] },
  { name: 'forearm.L', parent: 'upperArm.L', head: [-0.38, 1.14, 0] },
  { name: 'hand.L', parent: 'forearm.L', head: [-0.43, 0.92, 0] },
  { name: 'upperArm.R', parent: 'chest', head: [0.26, 1.40, 0] },
  { name: 'forearm.R', parent: 'upperArm.R', head: [0.38, 1.14, 0] },
  { name: 'hand.R', parent: 'forearm.R', head: [0.43, 0.92, 0] },
  { name: 'thigh.L', parent: 'hips', head: [-0.11, 0.90, 0] },
  { name: 'shin.L', parent: 'thigh.L', head: [-0.12, 0.48, 0] },
  { name: 'foot.L', parent: 'shin.L', head: [-0.12, 0.06, 0.12] },
  { name: 'thigh.R', parent: 'hips', head: [0.11, 0.90, 0] },
  { name: 'shin.R', parent: 'thigh.R', head: [0.12, 0.48, 0] },
  { name: 'foot.R', parent: 'shin.R', head: [0.12, 0.06, 0.12] }
];
// per-archetype art direction: palette + gear flags interpreted by the shared builder
const ARCH = {
  baseMale: { skin: 1, hair: 'short', hairC: [0.25, 0.16, 0.10], top: [0.30, 0.42, 0.62], bottom: [0.24, 0.25, 0.30], boots: [0.30, 0.22, 0.15], gear: ['belt'], metal: 0.05, rough: 0.85 },
  baseFemale: { skin: 0, hair: 'long', hairC: [0.45, 0.25, 0.12], top: [0.70, 0.32, 0.42], bottom: [0.22, 0.24, 0.34], boots: [0.35, 0.20, 0.16], gear: ['belt'], metal: 0.05, rough: 0.85 },
  baseChild: { skin: 0, hair: 'short', hairC: [0.55, 0.35, 0.18], top: [0.95, 0.55, 0.20], bottom: [0.25, 0.45, 0.70], boots: [0.9, 0.9, 0.92], short: true, gear: [], metal: 0.0, rough: 0.9 },
  warrior: { skin: 1, hair: 'wild', hairC: [0.20, 0.12, 0.08], top: [0.72, 0.55, 0.40], bottom: [0.45, 0.30, 0.16], boots: [0.35, 0.24, 0.14], gear: ['belt', 'buckle', 'pauldronsFur', 'straps', 'skirtShort'], metal: 0.15, rough: 0.7 },
  knight: { skin: 1, hair: 'bald', hairC: [0.2, 0.15, 0.1], top: [0.72, 0.74, 0.78], bottom: [0.60, 0.62, 0.66], boots: [0.55, 0.57, 0.60], gear: ['chestplate', 'pauldrons', 'belt', 'helmetKnight', 'plume', 'gauntlets', 'sabatons'], limbs: [0.68, 0.70, 0.74], metal: 0.85, rough: 0.35 },
  mage: { skin: 0, hair: 'long', hairC: [0.75, 0.75, 0.78], top: [0.25, 0.20, 0.45], bottom: [0.20, 0.16, 0.38], boots: [0.25, 0.18, 0.12], gear: ['robeSkirt', 'pointHat', 'staff', 'beard', 'belt'], beardC: [0.8, 0.8, 0.82], metal: 0.05, rough: 0.9 },
  archer: { skin: 1, hair: 'short', hairC: [0.30, 0.18, 0.10], top: [0.30, 0.42, 0.22], bottom: [0.35, 0.27, 0.16], boots: [0.32, 0.22, 0.13], gear: ['hood', 'quiver', 'bow', 'belt', 'bracers'], metal: 0.1, rough: 0.8 },
  soldierModern: { skin: 2, hair: 'buzz', hairC: [0.15, 0.12, 0.10], top: [0.32, 0.34, 0.22], bottom: [0.30, 0.31, 0.20], boots: [0.20, 0.18, 0.14], gear: ['helmetSoldier', 'vest', 'backpack', 'rifle', 'belt'], metal: 0.2, rough: 0.75 },
  pirate: { skin: 1, hair: 'long', hairC: [0.15, 0.10, 0.08], top: [0.20, 0.22, 0.35], bottom: [0.30, 0.24, 0.16], boots: [0.28, 0.19, 0.12], bootsTall: true, gear: ['tricorn', 'coatSkirt', 'belt', 'buckle', 'beard'], beardC: [0.15, 0.10, 0.08], metal: 0.2, rough: 0.7 },
  ninja: { skin: 1, hair: 'hood', hairC: [0.08, 0.09, 0.12], top: [0.10, 0.11, 0.15], bottom: [0.09, 0.10, 0.13], boots: [0.08, 0.08, 0.09], gear: ['maskNinja', 'hoodDark', 'belt', 'straps'], limbs: [0.10, 0.11, 0.15], hands: [0.10, 0.11, 0.15], metal: 0.1, rough: 0.85 },
  astronaut: { skin: 1, hair: 'bald', hairC: [0.2, 0.15, 0.1], top: [0.88, 0.89, 0.90], bottom: [0.82, 0.83, 0.85], boots: [0.75, 0.76, 0.78], gear: ['helmetAstro', 'visorGold', 'chestpack', 'backpack', 'belt'], limbs: [0.86, 0.87, 0.89], hands: [0.86, 0.87, 0.89], metal: 0.15, rough: 0.6 },
  runner: { skin: 2, hair: 'short', hairC: [0.12, 0.10, 0.09], top: [0.90, 0.20, 0.25], bottom: [0.15, 0.16, 0.20], boots: [0.92, 0.92, 0.94], gear: ['sneakers', 'shorts'], limbsSkin: true, metal: 0.0, rough: 0.9 },
  worker: { skin: 1, hair: 'short', hairC: [0.35, 0.22, 0.12], top: [0.95, 0.45, 0.10], bottom: [0.25, 0.28, 0.35], boots: [0.30, 0.22, 0.12], bootsTall: true, gear: ['hardhat', 'vestHiVis', 'belt'], metal: 0.1, rough: 0.8 },
  king: { skin: 0, hair: 'short', hairC: [0.7, 0.7, 0.72], top: [0.55, 0.10, 0.14], bottom: [0.45, 0.08, 0.12], boots: [0.30, 0.20, 0.12], gear: ['robeSkirt', 'crown', 'cape', 'belt', 'buckle', 'beard'], beardC: [0.75, 0.75, 0.76], metal: 0.4, rough: 0.5 },
  zombie: { skin: [0.55, 0.65, 0.45], hair: 'wild', hairC: [0.25, 0.25, 0.22], top: [0.35, 0.38, 0.30], bottom: [0.30, 0.30, 0.32], boots: [0.25, 0.22, 0.18], gear: ['darkEyes', 'belt'], metal: 0.0, rough: 0.95 },
  vampire: { skin: [0.92, 0.82, 0.78], hair: 'slick', hairC: [0.08, 0.08, 0.10], top: [0.12, 0.12, 0.14], bottom: [0.10, 0.10, 0.12], boots: [0.12, 0.10, 0.10], gear: ['cape', 'highCollar', 'redEyes', 'belt'], capeC: [0.10, 0.10, 0.12], capeIn: [0.55, 0.08, 0.10], metal: 0.1, rough: 0.7 },
  cyborg: { skin: 1, hair: 'buzz', hairC: [0.1, 0.1, 0.12], top: [0.45, 0.47, 0.50], bottom: [0.30, 0.31, 0.34], boots: [0.25, 0.26, 0.28], gear: ['metalArm', 'redEye', 'facePlate', 'visor', 'belt'], limbs: [0.45, 0.47, 0.50], metal: 0.85, rough: 0.35 },
  monk: { skin: 2, hair: 'bald', hairC: [0.1, 0.08, 0.06], top: [0.90, 0.50, 0.12], bottom: [0.85, 0.45, 0.10], boots: [0.55, 0.38, 0.27], barefoot: true, gear: ['robeSkirt', 'sash'], limbsSkin: true, metal: 0.0, rough: 0.95 },
  viking: { skin: 0, hair: 'long', hairC: [0.75, 0.45, 0.20], top: [0.45, 0.38, 0.30], bottom: [0.35, 0.30, 0.22], boots: [0.30, 0.22, 0.14], bootsTall: true, gear: ['horns', 'beard', 'belt', 'buckle', 'pauldronsFur', 'axe'], beardC: [0.72, 0.42, 0.18], metal: 0.3, rough: 0.6 },
  samurai: { skin: 1, hair: 'topknot', hairC: [0.08, 0.08, 0.09], top: [0.35, 0.12, 0.12], bottom: [0.15, 0.15, 0.18], boots: [0.20, 0.15, 0.10], gear: ['lamellar', 'pauldrons', 'belt', 'katana', 'topknot'], metal: 0.5, rough: 0.5 },
  cowboy: { skin: 1, hair: 'short', hairC: [0.30, 0.20, 0.12], top: [0.45, 0.32, 0.18], bottom: [0.25, 0.32, 0.50], boots: [0.32, 0.22, 0.13], bootsTall: true, gear: ['cowboyHat', 'vestCowboy', 'belt', 'buckle'], metal: 0.15, rough: 0.75 },
  pilot: { skin: 1, hair: 'short', hairC: [0.25, 0.16, 0.10], top: [0.35, 0.42, 0.28], bottom: [0.33, 0.40, 0.26], boots: [0.25, 0.20, 0.14], gear: ['helmetPilot', 'visor', 'vest', 'belt'], limbs: [0.35, 0.42, 0.28], metal: 0.2, rough: 0.7 },
  medic: { skin: 0, hair: 'short', hairC: [0.40, 0.28, 0.16], top: [0.93, 0.93, 0.95], bottom: [0.85, 0.87, 0.90], boots: [0.88, 0.88, 0.90], gear: ['medicCross', 'medicCap', 'belt'], metal: 0.0, rough: 0.9 },
  robotTrooper: { skin: [0.70, 0.72, 0.75], hair: 'bald', hairC: [0.2, 0.2, 0.22], top: [0.62, 0.64, 0.68], bottom: [0.40, 0.42, 0.46], boots: [0.30, 0.31, 0.34], gear: ['chestplate', 'pauldrons', 'helmetTrooper', 'visorSlit', 'belt', 'gauntlets', 'sabatons'], limbs: [0.58, 0.60, 0.64], hands: [0.35, 0.36, 0.39], metal: 0.85, rough: 0.35 }
};

function registerHumans(UltraForge) {
  function _seg(forge, quality) {
    void forge;
    if (quality === 'draft') return { rad: 7, sph: 10, eye: 6 };
    if (quality === 'cinema') return { rad: 20, sph: 24, eye: 10 };
    return { rad: 12, sph: 16, eye: 8 }; // game
  }
  // shared parametric body builder — every kit goes through here (symmetric A-pose)
  UltraForge.prototype._buildHuman = function (opts) {
    opts = opts || {};
    const arch = opts.archetype || 'baseMale';
    const cfg = ARCH[arch] || ARCH.baseMale;
    const quality = opts.quality || 'game';
    const S = _seg(this, quality);
    const rng = _hmulberry(opts.seed !== undefined ? opts.seed : 4242);
    const H = cfg.short ? 1.25 : (opts.height || 1.8);
    const k = H / 1.8; // geometry scale (rig stays at exact H=1.8 contract positions)
    const skin = Array.isArray(cfg.skin) ? cfg.skin : _hvary(SKIN_TONES[cfg.skin], rng, 0.05);
    const skinD = _hshade(skin, 0.82);
    const topC = opts.topColor || _hvary(cfg.top, rng);
    const botC = opts.bottomColor || _hvary(cfg.bottom, rng);
    const bootC = opts.bootColor || _hvary(cfg.boots, rng);
    const limbC = cfg.limbs ? _hvary(cfg.limbs, rng) : (cfg.limbsSkin ? skin : topC);
    const handC = cfg.hands ? _hvary(cfg.hands, rng) : (cfg.limbsSkin ? skin : skin);
    const hairC = _hvary(cfg.hairC, rng);
    const gear = cfg.gear || [];
    const has = function (g) { return gear.indexOf(g) !== -1; };
    const self = this;
    function P(mm, c) {
      if (self.paint) self.paint(mm, c);
      else { const n = mm.positions.length / 3; mm.colors = []; for (let i = 0; i < n; i++) mm.colors.push(c[0], c[1], c[2]); }
      return mm;
    }
    const parts = [];
    const Y = function (v) { return v * k; };
    // ---- pelvis + torso (tapered beveled cylinders, elliptical via z-scale) ----
    const pelvis = P(this.box(0.30 * k, 0.17 * k, 0.19 * k), botC); _t(pelvis, 0, Y(0.99), 0); parts.push(pelvis);
    const torso = P(this.cylinder(0.165 * k, 0.132 * k, 0.52 * k, S.rad), topC); _s(torso, 1, 1, 0.68); _t(torso, 0, Y(1.27), 0); parts.push(torso);
    if (has('chestplate')) {
      const cp = P(this.cylinder(0.178 * k, 0.148 * k, 0.40 * k, S.rad), _hvary([0.72, 0.74, 0.78], rng, 0.04)); _s(cp, 1, 1, 0.70); _t(cp, 0, Y(1.30), 0.008 * k); parts.push(cp);
      const ridge = P(this.box(0.03 * k, 0.34 * k, 0.02 * k), [0.55, 0.57, 0.60]); _t(ridge, 0, Y(1.30), 0.128 * k); parts.push(ridge);
    }
    if (has('vest') || has('vestHiVis')) {
      const vv = P(this.box(0.34 * k, 0.30 * k, 0.24 * k), has('vestHiVis') ? [0.95, 0.45, 0.10] : _hvary([0.30, 0.32, 0.22], rng)); _t(vv, 0, Y(1.28), 0); parts.push(vv);
      if (has('vestHiVis')) for (const yy of [1.22, 1.34]) {
        const st = P(this.box(0.35 * k, 0.045 * k, 0.25 * k), [0.95, 0.95, 0.60]); _t(st, 0, Y(yy), 0); parts.push(st);
      }
    }
    if (has('vestCowboy')) {
      for (const sd of [-1, 1]) { const p = P(this.box(0.10 * k, 0.34 * k, 0.22 * k), [0.42, 0.28, 0.15]); _t(p, sd * 0.11 * k, Y(1.28), 0); parts.push(p); }
    }
    if (has('lamellar')) for (let i = 0; i < 3; i++) {
      const lam = P(this.box(0.32 * k, 0.09 * k, 0.22 * k), _hvary([0.45, 0.16, 0.14], rng, 0.06)); _t(lam, 0, Y(1.18 + i * 0.10), 0.005 * k); parts.push(lam);
    }
    if (has('straps')) for (const sd of [-1, 1]) {
      const st = P(this.box(0.07 * k, 0.44 * k, 0.24 * k), [0.35, 0.22, 0.12]); this.rotate(st, 0, 0, sd * 28); _t(st, sd * 0.02 * k, Y(1.28), 0); parts.push(st);
    }
    if (has('medicCross')) {
      const c1 = P(this.box(0.10 * k, 0.03 * k, 0.012 * k), [0.85, 0.10, 0.12]); _t(c1, 0, Y(1.36), 0.125 * k); parts.push(c1);
      const c2 = P(this.box(0.03 * k, 0.10 * k, 0.012 * k), [0.85, 0.10, 0.12]); _t(c2, 0, Y(1.36), 0.125 * k); parts.push(c2);
    }
    if (has('chestpack')) {
      const pk = P(this.box(0.22 * k, 0.16 * k, 0.08 * k), [0.75, 0.76, 0.78]); _t(pk, 0, Y(1.28), 0.14 * k); parts.push(pk);
      const btnC = [[0.9, 0.2, 0.2], [0.2, 0.5, 0.9], [0.9, 0.8, 0.2]];
      for (let i = 0; i < 3; i++) { const b = P(this.sphere(S.eye), btnC[i]); _s(b, 0.014 * k, 0.014 * k, 0.010 * k); _t(b, (-0.06 + i * 0.06) * k, Y(1.30), 0.185 * k); parts.push(b); }
    }
    // ---- neck + head + face hint (vertex-color eyes/nose/mouth) ----
    const neck = P(this.cylinder(0.052 * k, 0.058 * k, 0.10 * k, S.rad), skinD); _t(neck, 0, Y(1.545), 0); parts.push(neck);
    const head = P(this.sphere(S.sph), skin); _s(head, 0.105 * k, 0.125 * k, 0.110 * k); _t(head, 0, Y(1.72), 0); parts.push(head);
    const eyeMode = has('darkEyes') ? 'dark' : has('redEyes') ? 'red' : has('redEye') ? 'cyborg' : 'normal';
    const visorCover = has('visorGold') || has('helmetKnight') || has('helmetTrooper');
    if (!visorCover) {
      for (const sd of [-1, 1]) {
        if (eyeMode === 'dark') {
          const so = P(this.sphere(S.eye), [0.10, 0.08, 0.08]); _s(so, 0.026 * k, 0.028 * k, 0.014 * k); _t(so, sd * 0.042 * k, Y(1.74), 0.095 * k); parts.push(so);
        } else if (eyeMode === 'red') {
          const so = P(this.sphere(S.eye), [0.75, 0.08, 0.08]); _s(so, 0.022 * k, 0.024 * k, 0.012 * k); _t(so, sd * 0.042 * k, Y(1.74), 0.097 * k); parts.push(so);
        } else if (eyeMode === 'cyborg') {
          if (sd < 0) { const w = P(this.sphere(S.eye), [0.95, 0.95, 0.95]); _s(w, 0.020 * k, 0.022 * k, 0.012 * k); _t(w, sd * 0.042 * k, Y(1.74), 0.097 * k); parts.push(w); }
          else { const g = P(this.sphere(S.eye), [1.0, 0.15, 0.10]); _s(g, 0.020 * k, 0.022 * k, 0.012 * k); _t(g, sd * 0.042 * k, Y(1.74), 0.097 * k); parts.push(g); }
        } else {
          const w = P(this.sphere(S.eye), [0.94, 0.94, 0.94]); _s(w, 0.021 * k, 0.023 * k, 0.012 * k); _t(w, sd * 0.042 * k, Y(1.74), 0.096 * k); parts.push(w);
          const pu = P(this.sphere(6), [0.10, 0.10, 0.12]); _s(pu, 0.009 * k, 0.010 * k, 0.007 * k); _t(pu, sd * 0.042 * k, Y(1.74), 0.107 * k); parts.push(pu);
        }
      }
      const nose = P(this.box(0.026 * k, 0.036 * k, 0.026 * k), skinD); _t(nose, 0, Y(1.695), 0.112 * k); parts.push(nose);
      const mouth = P(this.box(0.052 * k, 0.009 * k, 0.010 * k), eyeMode === 'dark' ? [0.15, 0.12, 0.10] : [0.45, 0.22, 0.18]); _t(mouth, 0, Y(1.652), 0.102 * k); parts.push(mouth);
    } else {
      const nose = P(this.box(0.026 * k, 0.036 * k, 0.026 * k), skinD); _t(nose, 0, Y(1.695), 0.112 * k); parts.push(nose);
    }
    for (const sd of [-1, 1]) { const ear = P(this.sphere(S.eye), skinD); _s(ear, 0.020 * k, 0.028 * k, 0.022 * k); _t(ear, sd * 0.104 * k, Y(1.71), 0); parts.push(ear); }
    // ---- hair / helmet per archetype ----
    const hstyle = cfg.hair;
    if (hstyle === 'short' || hstyle === 'buzz') {
      const h = P(this.sphere(S.sph), hairC); _s(h, 0.108 * k, 0.09 * k, 0.113 * k); _t(h, 0, Y(1.775), -0.012 * k); parts.push(h);
    } else if (hstyle === 'long') {
      const h = P(this.sphere(S.sph), hairC); _s(h, 0.110 * k, 0.115 * k, 0.115 * k); _t(h, 0, Y(1.76), -0.018 * k); parts.push(h);
      const back = P(this.box(0.16 * k, 0.22 * k, 0.07 * k), hairC); _t(back, 0, Y(1.60), -0.10 * k); parts.push(back);
    } else if (hstyle === 'wild') {
      const h = P(this.sphere(S.sph), hairC); _s(h, 0.118 * k, 0.125 * k, 0.120 * k); _t(h, 0, Y(1.75), -0.02 * k); parts.push(h);
    } else if (hstyle === 'slick' || hstyle === 'topknot') {
      const h = P(this.sphere(S.sph), hairC); _s(h, 0.107 * k, 0.085 * k, 0.112 * k); _t(h, 0, Y(1.78), -0.012 * k); parts.push(h);
    }
    if (hstyle === 'topknot' || has('katana')) { const tk = P(this.sphere(S.eye), hairC); _s(tk, 0.028 * k, 0.035 * k, 0.028 * k); _t(tk, 0, Y(1.875), -0.03 * k); parts.push(tk); }
    if (has('beard')) { const b = P(this.box(0.11 * k, 0.11 * k, 0.035 * k), _hvary(cfg.beardC || hairC, rng)); _t(b, 0, Y(1.615), 0.095 * k); parts.push(b); }
    if (has('facePlate')) { const fp = P(this.box(0.055 * k, 0.16 * k, 0.02 * k), [0.62, 0.64, 0.68]); _t(fp, 0.055 * k, Y(1.70), 0.10 * k); parts.push(fp); }
    if (has('maskNinja')) {
      const mk = P(this.box(0.15 * k, 0.10 * k, 0.05 * k), [0.08, 0.09, 0.12]); _t(mk, 0, Y(1.66), 0.085 * k); parts.push(mk);
      const band = P(this.box(0.17 * k, 0.035 * k, 0.03 * k), [0.08, 0.09, 0.12]); _t(band, 0, Y(1.775), 0.09 * k); parts.push(band);
    }
    if (has('pointHat')) { const ht = P(this.cone(0.10 * k, 0.34 * k, S.rad), _hvary(cfg.top, rng)); _t(ht, 0, Y(2.00), -0.01 * k); parts.push(ht); }
    if (has('hood') || has('hoodDark')) {
      const hd = P(this.cone(0.115 * k, 0.22 * k, S.rad), has('hoodDark') ? [0.08, 0.09, 0.12] : _hvary(cfg.top, rng)); _t(hd, 0, Y(1.90), -0.035 * k); parts.push(hd);
    }
    if (has('tricorn')) {
      const br = P(this.cylinder(0.16 * k, 0.16 * k, 0.025 * k, S.rad), [0.12, 0.10, 0.10]); _s(br, 1.15, 1, 1); _t(br, 0, Y(1.845), 0); parts.push(br);
      const dome = P(this.sphere(S.eye), [0.14, 0.11, 0.11]); _s(dome, 0.085 * k, 0.06 * k, 0.085 * k); _t(dome, 0, Y(1.87), 0); parts.push(dome);
    }
    if (has('cowboyHat')) {
      const br = P(this.cylinder(0.155 * k, 0.155 * k, 0.02 * k, S.rad), [0.42, 0.30, 0.16]); _t(br, 0, Y(1.845), 0); parts.push(br);
      const dome = P(this.sphere(S.eye), [0.45, 0.32, 0.17]); _s(dome, 0.075 * k, 0.07 * k, 0.075 * k); _t(dome, 0, Y(1.88), 0); parts.push(dome);
    }
    if (has('hardhat')) {
      const hh = P(this.sphere(S.eye), [0.95, 0.80, 0.10]); _s(hh, 0.115 * k, 0.085 * k, 0.118 * k); _t(hh, 0, Y(1.80), 0); parts.push(hh);
      const br = P(this.cylinder(0.13 * k, 0.13 * k, 0.018 * k, S.rad), [0.90, 0.75, 0.10]); _t(br, 0, Y(1.775), 0); parts.push(br);
    }
    if (has('crown')) {
      const cr = P(this.cylinder(0.085 * k, 0.09 * k, 0.07 * k, S.rad), [1.0, 0.78, 0.20]); _t(cr, 0, Y(1.885), 0); parts.push(cr);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = P(this.cone(0.016 * k, 0.05 * k, 6), [1.0, 0.80, 0.25]); _t(sp, Math.cos(a) * 0.075 * k, Y(1.945), Math.sin(a) * 0.075 * k); parts.push(sp); }
    }
    if (has('helmetKnight')) {
      const hm = P(this.cylinder(0.115 * k, 0.12 * k, 0.24 * k, S.rad), [0.66, 0.68, 0.72]); _t(hm, 0, Y(1.74), 0); parts.push(hm);
      const slit = P(this.box(0.13 * k, 0.018 * k, 0.02 * k), [0.05, 0.05, 0.06]); _t(slit, 0, Y(1.745), 0.115 * k); parts.push(slit);
    }
    if (has('plume')) { const pl = P(this.box(0.03 * k, 0.06 * k, 0.20 * k), [0.75, 0.12, 0.12]); _t(pl, 0, Y(1.90), -0.03 * k); parts.push(pl); }
    if (has('helmetSoldier')) {
      const hm = P(this.sphere(S.eye), _hvary([0.32, 0.34, 0.22], rng)); _s(hm, 0.118 * k, 0.09 * k, 0.122 * k); _t(hm, 0, Y(1.79), -0.005 * k); parts.push(hm);
    }
    if (has('helmetAstro')) {
      const hm = P(this.sphere(S.sph), [0.90, 0.91, 0.93]); _s(hm, 0.135 * k, 0.145 * k, 0.135 * k); _t(hm, 0, Y(1.72), 0); parts.push(hm);
    }
    if (has('visorGold')) { const v = P(this.box(0.15 * k, 0.10 * k, 0.03 * k), [0.95, 0.70, 0.25]); _t(v, 0, Y(1.735), 0.115 * k); parts.push(v); }
    if (has('helmetPilot')) {
      const hm = P(this.sphere(S.eye), [0.88, 0.88, 0.90]); _s(hm, 0.118 * k, 0.125 * k, 0.120 * k); _t(hm, 0, Y(1.73), -0.005 * k); parts.push(hm);
      const v = P(this.box(0.14 * k, 0.06 * k, 0.025 * k), [0.10, 0.12, 0.16]); _t(v, 0, Y(1.745), 0.105 * k); parts.push(v);
    }
    if (has('helmetTrooper')) {
      const hm = P(this.sphere(S.eye), [0.60, 0.62, 0.66]); _s(hm, 0.115 * k, 0.13 * k, 0.118 * k); _t(hm, 0, Y(1.735), 0); parts.push(hm);
      const slit = P(this.box(0.15 * k, 0.022 * k, 0.02 * k), [0.05, 0.06, 0.08]); _t(slit, 0, Y(1.75), 0.108 * k); parts.push(slit);
    }
    if (has('visorSlit') && !has('helmetTrooper') && !has('helmetKnight')) { const v = P(this.box(0.15 * k, 0.022 * k, 0.02 * k), [0.05, 0.06, 0.08]); _t(v, 0, Y(1.745), 0.108 * k); parts.push(v); }
    if (has('visor') && !has('visorGold')) { const v = P(this.box(0.14 * k, 0.05 * k, 0.025 * k), [0.12, 0.14, 0.18]); _t(v, 0, Y(1.745), 0.105 * k); parts.push(v); }
    if (has('horns')) { const cap = P(this.sphere(S.eye), [0.55, 0.55, 0.58]); _s(cap, 0.105 * k, 0.09 * k, 0.108 * k); _t(cap, 0, Y(1.79), 0); parts.push(cap); }
    if (has('horns')) for (const sd of [-1, 1]) {
      const hn2 = P(this.cone(0.028 * k, 0.16 * k, 8), [0.88, 0.83, 0.70]); this.rotate(hn2, 0, 0, sd * -55); _t(hn2, sd * 0.15 * k, Y(1.90), 0); parts.push(hn2);
    }
    if (has('medicCap')) { const mc = P(this.cylinder(0.10 * k, 0.105 * k, 0.06 * k, S.rad), [0.93, 0.93, 0.95]); _t(mc, 0, Y(1.845), 0); parts.push(mc); }
    // ---- arms in A-pose (tapered cylinders, slight outward tilt) ----
    for (const sd of [-1, 1]) {
      const up = P(this.cylinder(0.048 * k, 0.056 * k, 0.29 * k, S.rad), limbC); this.rotate(up, 0, 0, sd * 24); _t(up, sd * 0.315 * k, Y(1.27), 0); parts.push(up);
      const fo = P(this.cylinder(0.040 * k, 0.047 * k, 0.23 * k, S.rad), limbC); this.rotate(fo, 0, 0, sd * 12); _t(fo, sd * 0.405 * k, Y(1.03), 0); parts.push(fo);
      if (has('bracers')) { const br = P(this.cylinder(0.052 * k, 0.055 * k, 0.10 * k, S.rad), [0.40, 0.28, 0.15]); this.rotate(br, 0, 0, sd * 12); _t(br, sd * 0.41 * k, Y(0.99), 0); parts.push(br); }
      if (has('gauntlets')) { const g = P(this.cylinder(0.052 * k, 0.055 * k, 0.12 * k, S.rad), [0.60, 0.62, 0.66]); this.rotate(g, 0, 0, sd * 12); _t(g, sd * 0.41 * k, Y(0.985), 0); parts.push(g); }
      if (has('metalArm') && sd > 0) {
        const ma = P(this.cylinder(0.050 * k, 0.055 * k, 0.23 * k, S.rad), [0.60, 0.62, 0.66]); this.rotate(ma, 0, 0, sd * 12); _t(ma, sd * 0.405 * k, Y(1.03), 0); parts.push(ma);
      }
      // mitten hand + finger grooves
      const hand = P(this.sphere(S.eye), handC); _s(hand, 0.046 * k, 0.062 * k, 0.050 * k); _t(hand, sd * 0.43 * k, Y(0.875), 0.008 * k); parts.push(hand);
      for (let f = 0; f < 2; f++) { const gr = P(this.box(0.075 * k, 0.006 * k, 0.008 * k), _hshade(handC, 0.55)); _t(gr, sd * 0.43 * k, Y(0.885 - f * 0.025), 0.052 * k); parts.push(gr); }
    }
    if (has('pauldrons') || has('pauldronsFur')) for (const sd of [-1, 1]) {
      const pd = P(this.sphere(S.eye), has('pauldronsFur') ? [0.45, 0.32, 0.18] : [0.68, 0.70, 0.74]); _s(pd, 0.085 * k, 0.06 * k, 0.085 * k); _t(pd, sd * 0.25 * k, Y(1.45), 0); parts.push(pd);
    }
    // ---- belt + lower garments ----
    if (has('belt') || gear.length) {
      const bl = P(this.cylinder(0.148 * k, 0.152 * k, 0.055 * k, S.rad), [0.30, 0.20, 0.12]); _s(bl, 1, 1, 0.70); _t(bl, 0, Y(1.03), 0); parts.push(bl);
      if (has('buckle')) { const bk = P(this.box(0.07 * k, 0.05 * k, 0.02 * k), [1.0, 0.78, 0.20]); _t(bk, 0, Y(1.03), 0.108 * k); parts.push(bk); }
    }
    if (has('sash')) { const sa = P(this.box(0.34 * k, 0.09 * k, 0.24 * k), [0.95, 0.60, 0.15]); _t(sa, 0, Y(1.06), 0); parts.push(sa); }
    if (has('robeSkirt')) {
      const rb = P(this.cylinder(0.145 * k, 0.235 * k, 0.92 * k, S.rad), botC); _s(rb, 1, 1, 0.78); _t(rb, 0, Y(0.52), 0); parts.push(rb);
    } else if (has('coatSkirt')) {
      const ct = P(this.cylinder(0.150 * k, 0.20 * k, 0.42 * k, S.rad), topC); _s(ct, 1, 1, 0.75); _t(ct, 0, Y(0.78), 0); parts.push(ct);
    } else if (has('skirtShort')) {
      const sk = P(this.cylinder(0.150 * k, 0.175 * k, 0.22 * k, S.rad), botC); _s(sk, 1, 1, 0.75); _t(sk, 0, Y(0.88), 0); parts.push(sk);
    } else if (has('shorts')) {
      const sh = P(this.box(0.30 * k, 0.18 * k, 0.20 * k), botC); _t(sh, 0, Y(0.88), 0); parts.push(sh);
    }
    // ---- legs (thigh + shin) + boots/shoes ----
    const skirtCover = has('robeSkirt');
    for (const sd of [-1, 1]) {
      const th = P(this.cylinder(0.066 * k, 0.086 * k, 0.44 * k, S.rad), skirtCover ? skin : botC); _t(th, sd * 0.11 * k, Y(0.69), 0); parts.push(th);
      const sh2 = P(this.cylinder(0.046 * k, 0.062 * k, 0.42 * k, S.rad), skirtCover ? skin : (cfg.barefoot ? skin : botC)); _t(sh2, sd * 0.12 * k, Y(0.27), 0); parts.push(sh2);
      if (cfg.barefoot) {
        const ft = P(this.sphere(S.eye), skin); _s(ft, 0.050 * k, 0.035 * k, 0.095 * k); _t(ft, sd * 0.12 * k, Y(0.035), 0.04 * k); parts.push(ft);
      } else if (has('sabatons')) {
        const bt = P(this.box(0.10 * k, 0.12 * k, 0.22 * k), [0.58, 0.60, 0.64]); _t(bt, sd * 0.12 * k, Y(0.06), 0.03 * k); parts.push(bt);
        const toe = P(this.box(0.09 * k, 0.07 * k, 0.10 * k), [0.55, 0.57, 0.61]); _t(toe, sd * 0.12 * k, Y(0.035), 0.16 * k); parts.push(toe);
      } else if (has('sneakers')) {
        const sn = P(this.box(0.10 * k, 0.09 * k, 0.23 * k), bootC); _t(sn, sd * 0.12 * k, Y(0.045), 0.03 * k); parts.push(sn);
        const stripe = P(this.box(0.105 * k, 0.03 * k, 0.16 * k), topC); _t(stripe, sd * 0.12 * k, Y(0.05), 0.02 * k); parts.push(stripe);
      } else {
        const bh = cfg.bootsTall || has('sabatons') ? 0.22 : 0.12;
        const bt = P(this.box(0.105 * k, bh * k, 0.21 * k), bootC); _t(bt, sd * 0.12 * k, Y(bh / 2), 0.02 * k); parts.push(bt);
        const toe = P(this.sphere(S.eye), _hshade(bootC, 0.85)); _s(toe, 0.052 * k, 0.045 * k, 0.07 * k); _t(toe, sd * 0.12 * k, Y(0.045), 0.12 * k); parts.push(toe);
      }
    }
    // ---- signature props ----
    if (has('staff')) {
      const st = P(this.cylinder(0.018 * k, 0.022 * k, 1.45 * k, 8), [0.40, 0.28, 0.15]); _t(st, 0.47 * k, Y(0.95), 0.05 * k); parts.push(st);
      const orb = P(this.sphere(S.eye), [0.45, 0.75, 1.0]); _s(orb, 0.05 * k, 0.05 * k, 0.05 * k); _t(orb, 0.47 * k, Y(1.72), 0.05 * k); parts.push(orb);
    }
    if (has('quiver')) {
      const qv = P(this.cylinder(0.045 * k, 0.04 * k, 0.42 * k, 8), [0.42, 0.30, 0.16]); this.rotate(qv, 12, 0, 8); _t(qv, -0.14 * k, Y(1.30), -0.17 * k); parts.push(qv);
      for (let i = 0; i < 3; i++) { const ar = P(this.cylinder(0.008 * k, 0.008 * k, 0.12 * k, 6), [0.80, 0.75, 0.65]); _t(ar, (-0.16 + i * 0.025) * k, Y(1.53), -0.185 * k); parts.push(ar); }
    }
    if (has('bow')) {
      const arc = this.tubeAlongCurve([[-0.50 * k, Y(0.75), 0.10 * k], [-0.58 * k, Y(1.05), 0.10 * k], [-0.50 * k, Y(1.35), 0.10 * k]], 0.014 * k, 6);
      P(arc, [0.45, 0.30, 0.15]); parts.push(arc);
    }
    if (has('rifle')) {
      const rf = P(this.box(0.05 * k, 0.09 * k, 0.52 * k), [0.16, 0.16, 0.17]); this.rotate(rf, 0, 18, 0); _t(rf, 0.10 * k, Y(1.18), 0.16 * k); parts.push(rf);
      const br2 = P(this.cylinder(0.012 * k, 0.012 * k, 0.22 * k, 6), [0.10, 0.10, 0.11]); this.rotate(br2, 90, 0, 0); _t(br2, 0.16 * k, Y(1.20), 0.42 * k); parts.push(br2);
    }
    if (has('katana')) {
      const bl3 = P(this.box(0.025 * k, 0.03 * k, 0.55 * k), [0.80, 0.82, 0.85]); _t(bl3, -0.20 * k, Y(0.95), 0.06 * k); parts.push(bl3);
      const hd2 = P(this.cylinder(0.015 * k, 0.015 * k, 0.16 * k, 6), [0.15, 0.12, 0.10]); this.rotate(hd2, 90, 0, 0); _t(hd2, -0.20 * k, Y(0.95), -0.28 * k); parts.push(hd2);
    }
    if (has('axe')) {
      const haft = P(this.cylinder(0.016 * k, 0.018 * k, 0.55 * k, 6), [0.42, 0.30, 0.16]); _t(haft, 0.47 * k, Y(1.05), 0.05 * k); parts.push(haft);
      const axh = P(this.box(0.05 * k, 0.14 * k, 0.16 * k), [0.62, 0.64, 0.68]); _t(axh, 0.47 * k, Y(1.30), 0.05 * k); parts.push(axh);
    }
    if (has('backpack')) { const bp = P(this.box(0.24 * k, 0.30 * k, 0.12 * k), _hvary(cfg.bottom, rng, 0.12)); _t(bp, 0, Y(1.28), -0.17 * k); parts.push(bp); }
    if (has('cape')) {
      const capeC = cfg.capeC || _hvary(cfg.top, rng);
      const cp2 = P(this.box(0.34 * k, 0.72 * k, 0.025 * k), capeC); this.rotate(cp2, 6, 0, 0); _t(cp2, 0, Y(1.08), -0.165 * k); parts.push(cp2);
      if (cfg.capeIn) { const lin = P(this.box(0.30 * k, 0.66 * k, 0.012 * k), cfg.capeIn); this.rotate(lin, 6, 0, 0); _t(lin, 0, Y(1.08), -0.150 * k); parts.push(lin); }
      for (const sd of [-1, 1]) { const cl = P(this.sphere(6), [1.0, 0.78, 0.20]); _s(cl, 0.02 * k, 0.02 * k, 0.02 * k); _t(cl, sd * 0.15 * k, Y(1.44), -0.10 * k); parts.push(cl); }
    }
    if (has('highCollar')) {
      const col = P(this.cylinder(0.16 * k, 0.10 * k, 0.16 * k, S.rad), [0.10, 0.10, 0.12]); _t(col, 0, Y(1.56), -0.03 * k); parts.push(col);
    }
    // ---- merge + PBR + finish (weld/uv/normals like other v2 kits) ----
    const m = _merge(parts, arch);
    m.material = this.pbrUltra ? this.pbrUltra({ baseColor: topC, metallic: cfg.metal !== undefined ? cfg.metal : 0.05, roughness: cfg.rough !== undefined ? cfg.rough : 0.8, vertexColors: true, seed: opts.seed !== undefined ? opts.seed : 4242 }) : { baseColor: topC, metallic: 0.05, roughness: 0.8, vertexColors: true, name: 'ultra' };
    if (this._kitFinish) this._kitFinish(m, m.material);
    else { if (this.autoUV) this.autoUV(m); if (this.computeNormals) this.computeNormals(m); }
    // ---- STANDARD RIG (exact contract) + parts/pivots ----
    m.rig = { bones: STANDARD_RIG_BONES.map(function (b) { return { name: b.name, parent: b.parent, head: b.head.slice() }; }) };
    m.parts = [
      { name: 'head', center: [0, Y(1.72), 0] }, { name: 'torso', center: [0, Y(1.30), 0] },
      { name: 'hips', center: [0, Y(0.99), 0] },
      { name: 'arm_upper_L', center: [-0.315 * k, Y(1.27), 0] }, { name: 'arm_fore_L', center: [-0.405 * k, Y(1.03), 0] },
      { name: 'hand_L', center: [-0.43 * k, Y(0.875), 0] },
      { name: 'arm_upper_R', center: [0.315 * k, Y(1.27), 0] }, { name: 'arm_fore_R', center: [0.405 * k, Y(1.03), 0] },
      { name: 'hand_R', center: [0.43 * k, Y(0.875), 0] },
      { name: 'leg_thigh_L', center: [-0.11 * k, Y(0.69), 0] }, { name: 'leg_shin_L', center: [-0.12 * k, Y(0.27), 0] },
      { name: 'foot_L', center: [-0.12 * k, Y(0.05), 0.06 * k] },
      { name: 'leg_thigh_R', center: [0.11 * k, Y(0.69), 0] }, { name: 'leg_shin_R', center: [0.12 * k, Y(0.27), 0] },
      { name: 'foot_R', center: [0.12 * k, Y(0.05), 0.06 * k] }
    ];
    m.pivots = {};
    m.parts.forEach(function (p) { m.pivots[p.name] = p.center; });
    m.name = arch;
    return m;
  };

  // ---------- 24 parametric kit entry points ----------
  HUMAN_KITS.forEach(function (kit) {
    UltraForge.prototype[kit] = function (opts) {
      opts = opts || {};
      opts.archetype = kit;
      return this._buildHuman(opts);
    };
  });

  // ---------- dispatcher for API users ----------
  UltraForge.prototype.human = function (opts) {
    opts = opts || {};
    const raw = String(opts.kind || opts.archetype || opts.type || 'baseMale').toLowerCase();
    const alias = {
      man: 'baseMale', male: 'baseMale', guy: 'baseMale', hero: 'baseMale', character: 'baseMale',
      player: 'baseMale', person: 'baseMale', human: 'baseMale', humanoid: 'baseMale', avatar: 'baseMale',
      woman: 'baseFemale', female: 'baseFemale', girl: 'baseFemale', lady: 'baseFemale',
      boy: 'baseChild', child: 'baseChild', kid: 'baseChild',
      soldier: 'soldierModern', marine: 'soldierModern', commando: 'soldierModern',
      trooper: 'robotTrooper', robocop: 'robotTrooper', robot: 'robotTrooper',
      athlete: 'runner', runner: 'runner', mage: 'mage', knight: 'knight', warrior: 'warrior'
    };
    const hit = alias[raw] || raw;
    const kit = HUMAN_KITS.indexOf(hit) !== -1 ? hit : 'baseMale';
    opts.archetype = kit;
    return this._buildHuman(opts);
  };

  // ---------- parser patch: human words FIRST (before veg/water/v2 traps like pirate->boat) ----------
  const _origParse = UltraForge.prototype.parsePrompt;
  UltraForge.prototype.parsePrompt = function (prompt) {
    const p = String(prompt || '');
    // gear-focus guard: "knight helmet" / "knight longsword" ask for GEAR, not a person —
    // let them fall through to helmet/sword unless worn/wielded in an action scene
    const gearFocus = /helmet|longsword|\bsword\b|\bshield\b|\bblade\b|\baxe\b/i.test(p)
      && !/wield|hold|wear|\barmor\b|mount|fight|stand|kneel|\brun\b|walk|\bsit\b|ride/i.test(p);
    const table = [
      [/knight|paladin|\barmor\b/i, 'knight'],
      [/warrior|barbarian|gladiator/i, 'warrior'],
      [/mage|wizard|sorcerer|warlock|\bstaff\b/i, 'mage'],
      [/archer|bowman|\bbow\b|longbow|crossbow/i, 'archer'],
      [/soldier|commando|infantry|tactical|marine\b/i, 'soldierModern'],
      [/pirate(?!\s?(ship|boat|sail|galley|yacht))|buccaneer|corsair|tricorn|sailor|captain|skipper|boatswain/i, 'pirate'],
      [/ninja|shinobi|kunai/i, 'ninja'],
      [/astronaut|cosmonaut|spacesuit/i, 'astronaut'],
      [/runner|running|athlete|jogger|sprinter|marathon|\brun\b/i, 'runner'],
      [/worker|construction|hardhat|hi-?vis|engineer\b|builder\b/i, 'worker'],
      [/king|queen|monarch|\bcrown\b/i, 'king'],
      [/zombie|undead|\bwalker\b/i, 'zombie'],
      [/vampire|dracula|nosferatu/i, 'vampire'],
      [/cyborg|bionic/i, 'cyborg'],
      [/monk|friar|abbot/i, 'monk'],
      [/viking|norseman|berserker/i, 'viking'],
      [/samurai|ronin/i, 'samurai'],
      [/cowboy|cowgirl|gunslinger|sheriff|lasso/i, 'cowboy'],
      [/pilot|aviator|airman/i, 'pilot'],
      [/medic|paramedic|nurse\b|doctor|surgeon/i, 'medic'],
      [/trooper|robocop|exosuit|power.?armor|mech.?suit/i, 'robotTrooper'],
      [/female|\bwoman\b|\bgirl\b|\blady\b|heroine/i, 'baseFemale'],
      [/child|\bboy\b|\bkid\b|toddler|youth|juvenile/i, 'baseChild'],
      [/\bmale\b|\bman\b|\bmen\b|guy|gentleman/i, 'baseMale'],
      [/human|person|character|hero|player|avatar|villager/i, 'baseMale']
    ];
    for (const [re, kind] of table) {
      if (kind === 'knight' && gearFocus) continue; // gear noun without a wearer → helmet/sword kits
      if (re.test(p)) {
        const base = _origParse.call(this, 'box'); // reuse color/style/material/mood parsing
        base.kind = kind;
        if (/cinema|ultra|8k|hero|masterpiece|detailed|perfect/i.test(p)) base.quality = 'cinema';
        else if (/draft|fast|sketch|concept|low.?poly/i.test(p)) base.quality = 'draft';
        else base.quality = 'game';
        return base;
      }
    }
    return _origParse.call(this, prompt);
  };

  // ---------- quick patch: route human kits (budgets draft4k/game14k/cinema40k) ----------
  const _origQuick = UltraForge.prototype.quick;
  UltraForge.prototype.quick = function (prompt, opts) {
    opts = opts || {};
    let q;
    try { q = this.parsePrompt(prompt); } catch (e) { return _origQuick.call(this, prompt, opts); }
    if (HUMAN_KITS.indexOf(q.kind) === -1) return _origQuick.call(this, prompt, opts);
    const t0 = Date.now();
    if (opts.quality) q.quality = opts.quality;
    if (opts.style) q.style = opts.style;
    const presetName = q.quality || 'game';
    const seed = opts.seed !== undefined ? opts.seed : 4000 + String(prompt).length * 131;
    let m;
    try { m = this[q.kind]({ quality: presetName, seed: seed }); }
    catch (e) { return _origQuick.call(this, prompt, opts); }
    m.name = q.kind + '_' + (q.colorName || 'human');
    // optional full v2 pipeline (default off: preserves STANDARD RIG + face vertex colors)
    if (opts.applyQuality && this.applyQuality) { try { this.applyQuality(m, presetName, q); } catch (e) {} }
    const dt = Date.now() - t0;
    let score = 85;
    try { score = this.qualityScore ? this.qualityScore(m) : 85; } catch (e) {}
    const budgetMap = { draft: 4000, game: 14000, cinema: 40000, print: 30000 };
    const budget = opts.polyBudget || (budgetMap[presetName] || 14000);
    if (m.indices.length / 3 > budget) { try { this.decimate(m, budget); } catch (e) {} }
    return { mesh: m, stats: { verts: m.positions.length / 3, tris: m.indices.length / 3, timeMs: dt, kind: q.kind, color: q.colorName || 'human', quality: presetName, style: q.style, material: q.materialName || 'skin', score: score } };
  };

  return { HUMAN_KITS: HUMAN_KITS };
}

try { module.exports = { registerHumans: registerHumans, HUMAN_KITS: HUMAN_KITS }; } catch (e) {}
