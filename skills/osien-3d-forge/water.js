'use strict';
/* osien-3d-forge — WATER-ULTRA v2.3.0
 * Very very high quality water. Solves what generic AIs get wrong:
 *  - real wave geometry (Gerstner-lite swells + chop, not a flat blue plane)
 *  - depth gradient (shallow turquoise -> deep navy) in vertex colors
 *  - foam where it happens (crests, shoreline, rapids, plunge pool) broken by noise
 *  - caustic light webs, flow direction, rain rings, wet-ground rings
 *  - waterfall as a system (lip + falling sheet + plunge + mist + rocks), not a slab
 * Node stdlib only. Patches UltraForge without breaking v1/v2/v2.2 API.
 */
function _wmulberry(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _wclamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _wlerp(a, b, t) { return a + (b - a) * t; }
function _wnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  function h(ix, iy) { let n = (ix * 374761393 + iy * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return (((n ^ (n >>> 16)) >>> 0) % 1000) / 500 - 1; }
  return _wlerp(_wlerp(h(xi, yi), h(xi + 1, yi), u), _wlerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
function _wfbm(x, y, oct) {
  let v = 0, a = 1, f = 1, m = 0;
  for (let i = 0; i < (oct || 3); i++) { v += a * _wnoise(x * f + i * 7.3, y * f - i * 3.1); m += a; a *= 0.5; f *= 2.02; }
  return v / m;
}
function _wss(a, b, x) { const t = _wclamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

const WATER_KITS = ['oceanWave', 'calmLake', 'riverRapids', 'waterfall', 'poolWater', 'puddle', 'rainPond', 'tropicalShallows'];

const SHALLOW = [0.30, 0.72, 0.68], DEEP = [0.02, 0.17, 0.34], FOAM = [0.96, 0.98, 1.0];

function registerWater(UltraForge) {
  // ---------- core: wave surface with depth + foam + caustics ----------
  UltraForge.prototype.waterSurface = function (opts) {
    opts = opts || {};
    const W = opts.width || 10, D = opts.depth || 10;
    const quality = opts.quality || 'game';
    const seg = opts.seg || (quality === 'draft' ? 22 : quality === 'cinema' ? 78 : 46);
    const seed = opts.seed !== undefined ? opts.seed : 9090;
    const amp = opts.amplitude !== undefined ? opts.amplitude : 0.22;
    const chop = opts.chop !== undefined ? opts.chop : 0.35;
    const flowX = opts.flowX || 0, flowZ = opts.flowZ || 0; // directional current
    const shore = opts.shore || null; // 'ring' | 'banks' | null
    const foamAmt = opts.foam !== undefined ? opts.foam : 0.5;
    const sharp = opts.sharp !== undefined ? opts.sharp : 1; // >1 = peaked storm crests + flat troughs (1 = legacy sine)
    const deepC = opts.deepColor || DEEP, shalC = opts.shallowColor || SHALLOW;
    // 4 Gerstner-lite waves: dir, wavelength, speed, steepness
    const waves = opts.waves || [
      { dx: 1, dz: 0.3, len: 5.0, spd: 1.0, st: 0.8 },
      { dx: -0.6, dz: 1, len: 2.7, spd: 1.4, st: 0.6 },
      { dx: 0.8, dz: -1, len: 1.4, spd: 2.0, st: 0.45 },
      { dx: -1, dz: -0.5, len: 0.7, spd: 2.8, st: 0.3 },
    ];
    const pos = [], idx = [], col = [], uv = [];
    const t = opts.phase !== undefined ? opts.phase : 0.8; // frozen time slice (best-looking crest moment)
    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, v = j / seg;
        let x = (u - 0.5) * W, z = (v - 0.5) * D, y = 0;
        let crest = 0;
        for (const wv of waves) {
          const dl = Math.hypot(wv.dx, wv.dz) || 1;
          const kx = (wv.dx / dl) * (Math.PI * 2 / wv.len), kz = (wv.dz / dl) * (Math.PI * 2 / wv.len);
          const ph = kx * x + kz * z + t * wv.spd;
          const s = Math.sin(ph), c = Math.cos(ph);
          const sy = (sharp !== 1 && s > 0) ? Math.pow(s, sharp) : s; // narrow peaks, wide troughs
          y += amp * wv.st * sy * 0.5;
          crest += (sy * 0.5 + 0.5) * wv.st * 0.25;
          x += chop * amp * wv.st * c * (wv.dx / dl) * 0.5; // horizontal chop -> sharp crests
          z += chop * amp * wv.st * c * (wv.dz / dl) * 0.5;
        }
        // directional flow stretch
        x += flowX * v * 0.4; z += flowZ * u * 0.4;
        // rain rings
        if (opts.rain) {
          const r1 = _wfbm(x * 1.3 + seed % 7, z * 1.3, 2) * 0.5 + 0.5;
          y += Math.sin(Math.hypot(x * 2.1, z * 2.1) * 6 + t * 5) * 0.02 * (0.4 + r1);
        }
        pos.push(x, y, z);
        uv.push(u, v);
        // depth: center deep, edges shallow (or banks along x for rivers)
        let depth;
        if (shore === 'banks') depth = _wclamp(1 - Math.abs(u - 0.5) * 2.4, 0, 1);
        else if (shore === 'ring') { const e = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2; depth = _wclamp(1 - Math.pow(e, 3), 0, 1); }
        else depth = _wclamp(0.55 + _wfbm(x * 0.3, z * 0.3, 2) * 0.45, 0, 1);
        let r = _wlerp(shalC[0], deepC[0], depth), g = _wlerp(shalC[1], deepC[1], depth), b = _wlerp(shalC[2], deepC[2], depth);
        // caustic webs (light dapple in shallows)
        const ca = _wfbm(x * 1.8 + 9, z * 1.8 + t, 3) * 0.5 + 0.5;
        const web = Math.pow(1 - Math.abs(ca * 2 - 1), 6); // thin bright veins
        const cAmt = (1 - depth) * web * 0.55 * (opts.caustics === false ? 0 : 1);
        r += cAmt * 0.5; g += cAmt * 0.55; b += cAmt * 0.5;
        // foam: crests + shoreline + noise breakup
        const edge = shore === 'banks' ? _wss(0.72, 0.98, Math.abs(u - 0.5) * 2) : shore === 'ring' ? _wss(0.68, 0.95, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2) : 0;
        const crestF = _wss(0.62, 0.92, crest) * foamAmt;
        const nBr = _wfbm(x * 2.6 + seed % 5, z * 2.6, 3) * 0.5 + 0.5;
        let f = _wclamp(crestF * (0.45 + nBr * 0.9) + edge * (0.5 + nBr * 0.7) * foamAmt, 0, 1);
        if (opts.rapids) { const rb = _wss(0.2, 0.8, _wfbm(x * 0.8, z * 3.2, 2) * 0.5 + 0.5); f = _wclamp(f + rb * 0.7 * foamAmt, 0, 1); }
        r = _wlerp(r, FOAM[0], f); g = _wlerp(g, FOAM[1], f); b = _wlerp(b, FOAM[2], f);
        // subsurface glow on wave flanks
        const glow = crest * 0.12 * (1 - f);
        g += glow * 0.4; b += glow * 0.3;
        col.push(_wclamp(r, 0, 1), _wclamp(g, 0, 1), _wclamp(b, 0, 1));
      }
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    const m = { name: opts.name || 'water', positions: pos, indices: idx, normals: [], uvs: uv, colors: col, material: null };
    m.material = this.pbrUltra ? this.pbrUltra({ baseColor: [0.1, 0.4, 0.55], metallic: 0.05, roughness: 0.08, vertexColors: true, seed: seed }) : { baseColor: [0.1, 0.4, 0.55], metallic: 0.05, roughness: 0.08, vertexColors: true, name: 'ultra' };
    m.material.transparent = true; m.material.opacity = opts.opacity !== undefined ? opts.opacity : 0.88;
    m.material.roughness = 0.06 + (1 - foamAmt) * 0.06;
    this.computeNormals(m);
    return m;
  };

  // ---------- 8 named water kits ----------
  UltraForge.prototype.oceanWave = function (o) {
    o = o || {};
    const m = this.waterSurface(Object.assign({ name: 'ocean', width: 14, depth: 14, amplitude: 0.42, chop: 0.55, foam: 0.75, sharp: 1.8, deepColor: [0.01, 0.13, 0.30], shallowColor: [0.15, 0.55, 0.60] }, o));
    return m;
  };
  UltraForge.prototype.calmLake = function (o) {
    o = o || {};
    return this.waterSurface(Object.assign({ name: 'lake', width: 10, depth: 10, amplitude: 0.05, chop: 0.1, foam: 0.12, shore: 'ring', deepColor: [0.03, 0.22, 0.32], shallowColor: [0.35, 0.70, 0.62] }, o));
  };
  UltraForge.prototype.tropicalShallows = function (o) {
    o = o || {};
    const parts = [];
    // sand bottom with ripple ridges
    const sand = { name: 'sand', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    {
      const seg = o.quality === 'cinema' ? 30 : 16, W = 9, D = 9;
      for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
        const x = (i / seg - 0.5) * W, z = (j / seg - 0.5) * D;
        const rip = Math.sin(x * 4 + _wfbm(x, z, 2) * 5) * 0.03;
        sand.positions.push(x, -0.55 + rip, z); sand.uvs.push(i / seg, j / seg);
        const sh = 0.85 + _wfbm(x * 2, z * 2, 2) * 0.2;
        sand.colors.push(0.85 * sh, 0.76 * sh, 0.58 * sh);
      }
      for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, e = c + 1; sand.indices.push(a, c, b, b, c, e); }
      parts.push(sand);
    }
    const top = this.waterSurface({ name: 'shallows', width: 9, depth: 9, amplitude: 0.07, chop: 0.15, foam: 0.2, shore: 'ring', quality: o.quality, seed: o.seed, opacity: 0.62, deepColor: [0.05, 0.35, 0.55], shallowColor: [0.45, 0.85, 0.78] });
    parts.push(top);
    // merge
    const out = { name: 'tropicalShallows', positions: [], indices: [], normals: [], uvs: [], colors: [], material: top.material };
    let off = 0;
    for (const m of parts) {
      for (const v of m.positions) out.positions.push(v);
      for (const ix of m.indices) out.indices.push(ix + off);
      for (const v of m.uvs) out.uvs.push(v);
      for (const v of m.colors) out.colors.push(v);
      off += m.positions.length / 3;
    }
    this.computeNormals(out);
    return out;
  };
  UltraForge.prototype.riverRapids = function (o) {
    o = o || {};
    const parts = [];
    const water = this.waterSurface({ name: 'river', width: 4, depth: 12, amplitude: 0.16, chop: 0.4, foam: 0.65, rapids: true, shore: 'banks', flowZ: 0.8, quality: o.quality, seed: o.seed, deepColor: [0.05, 0.25, 0.30], shallowColor: [0.40, 0.65, 0.55] });
    parts.push(water);
    // banks: two rocky-grass ridges
    const rng = _wmulberry(o.seed || 41);
    for (const s of [-1, 1]) {
      const bank = { name: 'bank', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
      const seg = 12;
      for (let j = 0; j <= seg; j++) for (let i = 0; i <= 3; i++) {
        const z = (j / seg - 0.5) * 12, x = s * (2.0 + (i / 3) * 1.6);
        const y = 0.15 + (i / 3) * 0.55 + _wfbm(x * 1.2, z * 0.8, 2) * 0.2;
        bank.positions.push(x, y, z); bank.uvs.push(i / 3, j / seg);
        const g = 0.5 + _wfbm(x * 2, z * 2, 2) * 0.4;
        bank.colors.push(0.25 * g + 0.15 * (i / 3), 0.42 * g, 0.18 * g);
      }
      for (let j = 0; j < seg; j++) for (let i = 0; i < 3; i++) { const a = j * 4 + i, b = a + 1, c = a + 4, e = c + 1; bank.indices.push(a, c, b, b, c, e); }
      parts.push(bank);
    }
    const out = { name: 'riverRapids', positions: [], indices: [], normals: [], uvs: [], colors: [], material: water.material };
    let off = 0;
    for (const m of parts) {
      for (const v of m.positions) out.positions.push(v);
      for (const ix of m.indices) out.indices.push(ix + off);
      const nn = m.positions.length / 3;
      const uv = (m.uvs && m.uvs.length === nn * 2) ? m.uvs : new Array(nn * 2).fill(0);
      const cl = (m.colors && m.colors.length === nn * 3) ? m.colors : new Array(nn * 3).fill(0.5);
      for (const v of uv) out.uvs.push(v);
      for (const v of cl) out.colors.push(v);
      off += nn;
    }
    this.computeNormals(out);
    return out;
  };
  UltraForge.prototype.waterfall = function (o) {
    o = o || {};
    const seed = o.seed || 777;
    const rng = _wmulberry(seed);
    const H = o.height || 3.2, Wd = o.width || 2.2;
    const segV = o.quality === 'cinema' ? 40 : o.quality === 'draft' ? 12 : 24;
    const segH = 14;
    // falling sheet: vertical, accelerating stretch + streaks + edge feather
    const sheet = { name: 'sheet', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    for (let j = 0; j <= segV; j++) {
      const v = j / segV; // 0 top -> 1 bottom
      for (let i = 0; i <= segH; i++) {
        const u = i / segH;
        const x = (u - 0.5) * Wd * (1 + v * 0.25); // spreads as it falls
        const y = H * (1 - v);
        const z = Math.sin(u * 9 + seed) * 0.05 * v + v * v * 0.55; // arcs outward
        sheet.positions.push(x, y, z); sheet.uvs.push(u, v);
        const streak = _wfbm(u * 9 + seed % 7, v * 5 - 2.2, 3) * 0.5 + 0.5;
        const speed = 0.35 + v * 0.65;
        const white = _wclamp(0.25 + streak * 0.6 * speed + v * 0.35, 0, 1);
        const r = _wlerp(0.35, 0.97, white), g = _wlerp(0.62, 0.98, white), b = _wlerp(0.68, 1.0, white);
        // feather edges transparent-ish (pale + will read as mist)
        const edge = _wss(0.32, 0.02, Math.abs(u - 0.5));
        sheet.colors.push(_wlerp(r, 0.9, edge * 0.4), _wlerp(g, 0.95, edge * 0.4), _wlerp(b, 1.0, edge * 0.4));
      }
    }
    for (let j = 0; j < segV; j++) for (let i = 0; i < segH; i++) { const a = j * (segH + 1) + i, b = a + 1, c = a + segH + 1, e = c + 1; sheet.indices.push(a, b, c, b, e, c); }
    const parts = [sheet];
    // cliff lip rock
    const lip = { name: 'lip', positions: [-Wd / 2 - 0.8, H, -0.5, Wd / 2 + 0.8, H, -0.5, Wd / 2 + 0.8, H + 0.5, -1.2, -Wd / 2 - 0.8, H + 0.5, -1.2], indices: [0, 1, 2, 0, 2, 3], normals: [], uvs: [0, 0, 1, 0, 1, 1, 0, 1], colors: [0.35, 0.33, 0.3, 0.35, 0.33, 0.3, 0.22, 0.28, 0.18, 0.22, 0.28, 0.18], material: null };
    parts.push(lip);
    // plunge pool: disc with radial foam
    {
      const pool = { name: 'plunge', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
      const rings = 10, spokes = 22, R = Wd * 1.1;
      pool.positions.push(0, 0.02, 0.9); pool.uvs.push(0.5, 0.5); pool.colors.push(0.95, 0.98, 1.0);
      for (let ri = 1; ri <= rings; ri++) {
        for (let si = 0; si < spokes; si++) {
          const a = (si / spokes) * Math.PI * 2;
          const rr = (ri / rings) * R;
          pool.positions.push(Math.cos(a) * rr, 0.02 + _wfbm(Math.cos(a) * 3, ri * 0.8, 2) * 0.05, 0.9 + Math.sin(a) * rr);
          pool.uvs.push(0.5 + Math.cos(a) * rr / R / 2, 0.5 + Math.sin(a) * rr / R / 2);
          const f = _wclamp(1.2 - (ri / rings) * 1.4 + _wfbm(a * 2, ri, 2) * 0.4, 0, 1);
          pool.colors.push(_wlerp(0.1, 0.96, f), _wlerp(0.4, 0.98, f), _wlerp(0.5, 1.0, f));
        }
      }
      for (let si = 0; si < spokes; si++) pool.indices.push(0, 1 + si, 1 + (si + 1) % spokes);
      for (let ri = 0; ri < rings - 1; ri++) for (let si = 0; si < spokes; si++) {
        const a = 1 + ri * spokes + si, b = 1 + ri * spokes + (si + 1) % spokes, c = a + spokes, e = b + spokes;
        pool.indices.push(a, c, b, b, c, e);
      }
      parts.push(pool);
    }
    // mist: 3 pale cones
    for (let mi = 0; mi < 3; mi++) {
      const mr = 0.35 + mi * 0.25, mh = 0.7 + mi * 0.3;
      const mx = (rng() - 0.5) * Wd * 0.8, mz = 0.9 + (rng() - 0.5) * 0.8;
      const cone = { name: 'mist', positions: [mx, 0.1, mz], indices: [], normals: [], uvs: [0.5, 0], colors: [0.92, 0.96, 1.0], material: null };
      const NR = 8;
      for (let i = 0; i <= NR; i++) {
        const a = (i / NR) * Math.PI * 2;
        cone.positions.push(mx + Math.cos(a) * mr, 0.1 + mh, mz + Math.sin(a) * mr);
        cone.uvs.push(i / NR, 1); cone.colors.push(0.88, 0.93, 0.98);
      }
      for (let i = 0; i < NR; i++) cone.indices.push(0, 1 + i, 1 + i + 1);
      parts.push(cone);
    }
    const out = { name: 'waterfall', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    let off = 0;
    for (const m of parts) {
      for (const v of m.positions) out.positions.push(v);
      for (const ix of m.indices) out.indices.push(ix + off);
      for (const v of m.uvs) out.uvs.push(v);
      for (const v of m.colors) out.colors.push(v);
      off += m.positions.length / 3;
    }
    out.material = this.pbrUltra ? this.pbrUltra({ baseColor: [0.5, 0.75, 0.8], metallic: 0, roughness: 0.25, vertexColors: true, seed: seed }) : null;
    if (out.material) { out.material.transparent = true; out.material.opacity = 0.9; }
    this.computeNormals(out);
    out.parts = [{ name: 'sheet', center: [0, H / 2, 0.3] }, { name: 'plunge', center: [0, 0, 0.9] }, { name: 'mist', center: [0, 0.4, 0.9] }];
    return out;
  };
  UltraForge.prototype.poolWater = function (o) {
    o = o || {};
    const parts = [];
    // tiled bottom: checker vertex colors
    {
      const tiles = { name: 'tiles', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
      const seg = 14, W = 5, D = 3;
      for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
        const x = (i / seg - 0.5) * W, z = (j / seg - 0.5) * D;
        tiles.positions.push(x, -0.6, z); tiles.uvs.push(i / seg, j / seg);
        const chk = ((Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0);
        const t = chk ? [0.25, 0.6, 0.75] : [0.9, 0.95, 0.97];
        tiles.colors.push(t[0], t[1], t[2]);
      }
      for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, e = c + 1; tiles.indices.push(a, c, b, b, c, e); }
      parts.push(tiles);
    }
    const top = this.waterSurface({ name: 'pooltop', width: 5, depth: 3, amplitude: 0.02, chop: 0.05, foam: 0.05, quality: o.quality, seed: o.seed, opacity: 0.55, deepColor: [0.1, 0.45, 0.6], shallowColor: [0.5, 0.85, 0.88] });
    for (let k = 1; k < top.positions.length; k += 3) top.positions[k] += 0.0; // at y=0
    parts.push(top);
    // coping edge
    const cop = { name: 'coping', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    {
      const W = 5.6, D = 3.6;
      const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
      for (let i = 0; i < 4; i++) {
        const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4];
        const b = cop.positions.length / 3;
        cop.positions.push(x0, 0.12, z0, x1, 0.12, z1, x1, 0.0, z1, x0, 0.0, z0);
        for (let k = 0; k < 4; k++) { cop.uvs.push(k / 4, 0); cop.colors.push(0.85, 0.83, 0.78); }
        cop.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      parts.push(cop);
    }
    const out = { name: 'poolWater', positions: [], indices: [], normals: [], uvs: [], colors: [], material: top.material };
    let off = 0;
    for (const m of parts) {
      for (const v of m.positions) out.positions.push(v);
      for (const ix of m.indices) out.indices.push(ix + off);
      const nn = m.positions.length / 3;
      const uv = (m.uvs && m.uvs.length === nn * 2) ? m.uvs : new Array(nn * 2).fill(0);
      const cl = (m.colors && m.colors.length === nn * 3) ? m.colors : new Array(nn * 3).fill(0.6);
      for (const v of uv) out.uvs.push(v);
      for (const v of cl) out.colors.push(v);
      off += nn;
    }
    this.computeNormals(out);
    return out;
  };
  UltraForge.prototype.puddle = function (o) {
    o = o || {};
    const seed = o.seed || 55;
    // wet dark ground ring
    const ground = { name: 'wetground', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    {
      const seg = 8, spokes = 20, R = 1.6;
      ground.positions.push(0, -0.02, 0); ground.uvs.push(0.5, 0.5); ground.colors.push(0.18, 0.16, 0.13);
      for (let ri = 1; ri <= seg; ri++) for (let si = 0; si < spokes; si++) {
        const a = (si / spokes) * Math.PI * 2, rr = (ri / seg) * R * (1 + _wfbm(Math.cos(a) * 2 + seed, ri * 0.5, 2) * 0.15);
        ground.positions.push(Math.cos(a) * rr, -0.02, Math.sin(a) * rr);
        ground.uvs.push(0.5 + Math.cos(a) * rr / R / 2, 0.5 + Math.sin(a) * rr / R / 2);
        const wet = 1 - ri / seg; // darker near water
        ground.colors.push(0.18 + wet * 0.05, 0.16 + wet * 0.04, 0.13 + wet * 0.03);
      }
      for (let si = 0; si < spokes; si++) ground.indices.push(0, 1 + si, 1 + (si + 1) % spokes);
      for (let ri = 0; ri < seg - 1; ri++) for (let si = 0; si < spokes; si++) {
        const a = 1 + ri * spokes + si, b = 1 + ri * spokes + (si + 1) % spokes, c = a + spokes, e = b + spokes;
        ground.indices.push(a, c, b, b, c, e);
      }
    }
    const top = this.waterSurface({ name: 'puddleTop', width: 2.2, depth: 2.2, amplitude: 0.012, chop: 0.05, foam: 0.03, rain: true, quality: o.quality, seed: seed, opacity: 0.8, deepColor: [0.15, 0.2, 0.24], shallowColor: [0.55, 0.62, 0.65] });
    const out = { name: 'puddle', positions: ground.positions.concat(top.positions), indices: ground.indices.slice(), normals: [], uvs: ground.uvs.concat(top.uvs), colors: ground.colors.concat(top.colors), material: top.material };
    const off = ground.positions.length / 3;
    for (const ix of top.indices) out.indices.push(ix + off);
    this.computeNormals(out);
    return out;
  };
  UltraForge.prototype.rainPond = function (o) {
    o = o || {};
    return this.waterSurface(Object.assign({ name: 'rainPond', width: 8, depth: 8, amplitude: 0.04, chop: 0.1, foam: 0.08, rain: true, shore: 'ring', deepColor: [0.05, 0.2, 0.28], shallowColor: [0.4, 0.6, 0.58] }, o));
  };

  // ---------- parser patch: water words (chain after veg patch) ----------
  const _origParse = UltraForge.prototype.parsePrompt;
  UltraForge.prototype.parsePrompt = function (prompt) {
    const p = String(prompt || '');
    const water = [
      [/waterfall|cascade|falls\b/i, 'waterfall'],
      [/ocean(?! (blue|green|teal|azure|navy|black|white))|\bsea\b|surf|breaker|tsunami|swell/i, 'oceanWave'],
      [/tropical|lagoon|shallows|coral.?bay|turquoise.?bay/i, 'tropicalShallows'],
      [/\briver\b|rapids|\bstream\b|\bcreek\b|whitewater/i, 'riverRapids'],
      [/swimming.?pool|\bpool\b/i, 'poolWater'],
      [/puddle/i, 'puddle'],
      [/rain.?pond|rainy.?lake|(?<!b)rain\s/i, 'rainPond'],
      [/\blake\b|\bpond\b(?!\s?(grass|reeds?|marsh|meadow|lily))|reservoir/i, 'calmLake'],
      [/\bwave\b|\btide\b/i, 'oceanWave'],
      [/\bwater\b/i, 'calmLake'],
    ];
    for (const [re, kind] of water) {
      if (re.test(p)) {
        const base = _origParse.call(this, 'box');
        base.kind = kind;
        if (/cinema|ultra|8k|hero|masterpiece|perfect|detailed|storm|big/i.test(p)) base.quality = 'cinema';
        else if (/draft|fast|sketch/i.test(p)) base.quality = 'draft';
        else base.quality = 'game';
        return base;
      }
    }
    return _origParse.call(this, prompt);
  };

  // ---------- quick patch: route water kits ----------
  const _origQuick = UltraForge.prototype.quick;
  UltraForge.prototype.quick = function (prompt, opts) {
    opts = opts || {};
    let q;
    try { q = this.parsePrompt(prompt); } catch (e) { return _origQuick.call(this, prompt, opts); }
    if (WATER_KITS.indexOf(q.kind) === -1) return _origQuick.call(this, prompt, opts);
    const t0 = Date.now();
    if (opts.quality) q.quality = opts.quality;
    if (opts.style) q.style = opts.style;
    const presetName = q.quality || 'game';
    const seed = opts.seed !== undefined ? opts.seed : 2000 + String(prompt).length * 91;
    const vopts = { quality: presetName, seed: seed };
    let m;
    switch (q.kind) {
      case 'oceanWave': m = this.oceanWave(vopts); break;
      case 'calmLake': m = this.calmLake(vopts); break;
      case 'tropicalShallows': m = this.tropicalShallows(vopts); break;
      case 'riverRapids': m = this.riverRapids(vopts); break;
      case 'waterfall': m = this.waterfall(vopts); break;
      case 'poolWater': m = this.poolWater(vopts); break;
      case 'puddle': m = this.puddle(vopts); break;
      case 'rainPond': m = this.rainPond(vopts); break;
      default: return _origQuick.call(this, prompt, opts);
    }
    m.name = q.kind + '_' + (q.colorName || 'water');
    const dt = Date.now() - t0;
    let score = 85;
    try { score = this.qualityScore ? this.qualityScore(m) : 85; } catch (e) {}
    const budgetMap = { draft: 4000, game: 14000, cinema: 30000, print: 30000 };
    const budget = opts.polyBudget || (budgetMap[presetName] || 14000);
    if (m.indices.length / 3 > budget) { try { this.decimate(m, budget); } catch (e) {} }
    return { mesh: m, stats: { verts: m.positions.length / 3, tris: m.indices.length / 3, timeMs: dt, polyLevel: q.poly, kind: q.kind, color: q.colorName || 'water', quality: presetName, style: q.style, material: q.materialName || 'water', score: score } };
  };

  return { WATER_KITS: WATER_KITS };
}

try { module.exports = { registerWater: registerWater, WATER_KITS: WATER_KITS }; } catch (e) {}
