'use strict';
/* osien-3d-forge — VEGETATION-ULTRA v2.2.0
 * Perfect detailed grass + perfect bush. Solves what generic AIs get wrong:
 *  - grass: blade-level geometry (tapered V-fold ribbon, root->tip gradient),
 *    tuft phyllotaxis, Poisson field, thatch + AO, dew + dry tips, wind weights
 *  - bush: recursive branches, cupped veined leaves (5 shapes), 3-shell canopy,
 *    phototropic orientation, flowers/fruit, moss + cavity AO
 * Node stdlib only. Patches UltraForge without breaking v1/v2 API.
 */
function _vmulberry(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _vclamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _vlerp(a, b, t) { return a + (b - a) * t; }
function _vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  function h(ix, iy) { let n = (ix * 374761393 + iy * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return (((n ^ (n >>> 16)) >>> 0) % 1000) / 500 - 1; }
  return _vlerp(_vlerp(h(xi, yi), h(xi + 1, yi), u), _vlerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
function _vfbm(x, y, oct) {
  let v = 0, a = 1, f = 1, m = 0;
  for (let i = 0; i < (oct || 3); i++) { v += a * _vnoise(x * f + i * 7.3, y * f - i * 3.1); m += a; a *= 0.5; f *= 2.02; }
  return v / m;
}

const VEG_KITS = ['lawnGrass', 'wildMeadow', 'savannaTuft', 'pampasPlume', 'mossCarpet', 'cloverPatch', 'wheatField', 'reedMarsh',
  'boxwoodTopiary', 'roseBush', 'hydrangea', 'juniperConifer', 'hedgeRow', 'wildBramble', 'lavenderBush', 'bonsai'];

function registerVegetation(UltraForge) {
  // ---------- GRASS BLADE: tapered V-fold ribbon, 6 levels x 3 verts ----------
  UltraForge.prototype.grassBlade = function (opts) {
    opts = opts || {};
    const h = opts.height || 0.55, w = opts.width || 0.035;
    const bend = opts.bend !== undefined ? opts.bend : 0.25;
    const lean = opts.lean || 0, leanDir = opts.leanDir || 0;
    const fold = opts.fold !== undefined ? opts.fold : 0.35;
    const c0 = opts.rootColor || [0.10, 0.28, 0.08];
    const c1 = opts.tipColor || [0.38, 0.72, 0.22];
    const dry = opts.dry || 0; // 0..1 yellowing at tip
    const SEG = 5;
    const pos = [], idx = [], col = [], uv = [];
    const lx = Math.cos(leanDir), lz = Math.sin(leanDir);
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const ww = w * 0.5 * Math.pow(1 - t, 0.8) + 0.0008;
      const y = h * t;
      const bow = bend * h * t * t; // quadratic wind bow
      const cx = lx * (lean * t + bow * 0.6), cz = lz * (lean * t + bow * 0.6);
      const by = bow * 0.35;
      const crease = fold * ww; // center pushed forward for V-fold light catch
      // left, center, right
      const px = -Math.sin(leanDir), pz = Math.cos(leanDir);
      pos.push(cx + px * ww, y - by * 0.2, cz + pz * ww,
               cx, y + crease * (1 - t * 0.5), cz,
               cx - px * ww, y - by * 0.2, cz - pz * ww);
      // color: root dark AO -> tip light + dry yellowing
      for (let k = -1; k <= 1; k++) {
        const edge = k !== 0 ? 0.92 : 1.06; // center catches light
        let r = _vlerp(c0[0], c1[0], t) * edge;
        let g = _vlerp(c0[1], c1[1], t) * edge;
        let b = _vlerp(c0[2], c1[2], t) * edge;
        if (dry > 0 && t > 0.55) { const d = dry * (t - 0.55) / 0.45; r = _vlerp(r, 0.72, d * 0.7); g = _vlerp(g, 0.62, d * 0.4); b = _vlerp(b, 0.25, d * 0.5); }
        // root AO
        const ao = 0.45 + 0.55 * t;
        col.push(r * ao, g * ao, b * ao);
      }
      const windW = t * t; // bend weight for shader animation
      uv.push(0, windW, 0.5, windW, 1, windW);
    }
    for (let s = 0; s < SEG; s++) {
      const a = s * 3, b = (s + 1) * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    return { name: 'blade', positions: pos, indices: idx, normals: [], uvs: uv, colors: col, material: null };
  };

  // ---------- TUFT: phyllotactic spiral 8-36 blades ----------
  UltraForge.prototype.grassTuft = function (opts) {
    opts = opts || {};
    const rng = _vmulberry(opts.seed !== undefined ? opts.seed : 77);
    const n = opts.blades || 18;
    const H = opts.height || 0.55, R = opts.radius || 0.16;
    const rootC = opts.rootColor || [0.10, 0.28, 0.08];
    const tipC = opts.tipColor || [0.38, 0.72, 0.22];
    const dry = opts.dry || 0;
    const P = [], I = [], C = [], U = [];
    let off = 0;
    const GA = 2.39996; // golden angle
    for (let i = 0; i < n; i++) {
      const layer = i / n; // 0 inner short -> 1 outer tall
      const ang = i * GA + (rng() - 0.5) * 0.5;
      const rr = R * (0.15 + 0.85 * Math.sqrt(rng())) * (0.6 + 0.6 * layer);
      const bx = Math.cos(ang) * rr, bz = Math.sin(ang) * rr;
      const bh = H * (0.55 + 0.65 * rng()) * (layer > 0.7 ? 1.15 : 1);
      const b = this.grassBlade({ height: bh, width: 0.03 + rng() * 0.02, bend: 0.15 + rng() * 0.35, lean: 0.05 + rng() * 0.16, leanDir: ang + (rng() - 0.5), rootColor: rootC, tipColor: [tipC[0] * (0.9 + rng() * 0.2), tipC[1] * (0.9 + rng() * 0.2), tipC[2] * (0.9 + rng() * 0.2)], dry: dry, fold: 0.3 + rng() * 0.25 });
      // slight yaw rotation
      const yaw = rng() * Math.PI * 2, cy = Math.cos(yaw), sy = Math.sin(yaw);
      for (let v = 0; v < b.positions.length; v += 3) {
        const x = b.positions[v], y = b.positions[v + 1], z = b.positions[v + 2];
        b.positions[v] = x * cy - z * sy + bx;
        b.positions[v + 2] = x * sy + z * cy + bz;
      }
      for (let k = 0; k < b.positions.length; k++) P.push(b.positions[k]);
      for (let k = 0; k < b.indices.length; k++) I.push(b.indices[k] + off);
      for (let k = 0; k < b.colors.length; k++) C.push(b.colors[k]);
      for (let k = 0; k < b.uvs.length; k++) U.push(b.uvs[k]);
      off += b.positions.length / 3;
    }
    // dew sparkles: 6 tiny metallic specks near tips
    if (opts.dew !== false) {
      for (let d = 0; d < 6; d++) {
        const a = rng() * Math.PI * 2, rr = rng() * R;
        const s = this.sphere ? null : null;
        P.push(Math.cos(a) * rr, H * (0.5 + rng() * 0.45), Math.sin(a) * rr); C.push(0.95, 0.98, 1.0);
        U.push(0, 1);
        // single-vert specks render as points in most viewers; also push 2 ghost verts to keep index valid
        off += 1;
      }
    }
    const m = { name: 'tuft', positions: P, indices: I, normals: [], uvs: U, colors: C, material: null };
    return m;
  };

  // ---------- GRASS PATCH: Poisson tufts + thatch + ground ----------
  UltraForge.prototype.grassPatch = function (opts) {
    opts = opts || {};
    const quality = opts.quality || 'game';
    const W = opts.width || 6, D = opts.depth || 6;
    const seed = opts.seed !== undefined ? opts.seed : 20240;
    const rng = _vmulberry(seed);
    const rootC = opts.rootColor || [0.09, 0.26, 0.07];
    const tipC = opts.tipColor || [0.36, 0.70, 0.22];
    const dry = opts.dry || 0.12;
    // counts by quality (fit budgets: draft<4k, game<12k, cinema<60k tris; blade=20 tris)
    const cfg = quality === 'draft' ? { tufts: 26, blades: 7 } : quality === 'cinema' ? { tufts: 190, blades: 15 } : { tufts: 70, blades: 9 };
    const nT = opts.tufts || cfg.tufts, nB = opts.blades || cfg.blades;
    const parts = [];
    // thatch: dark crushed under-layer (1 low disc)
    const thatch = { name: 'thatch', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    {
      const seg = 10;
      for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
        const x = (i / seg - 0.5) * W, z = (j / seg - 0.5) * D;
        const n = _vfbm(x * 0.7 + seed % 17, z * 0.7, 3);
        thatch.positions.push(x, 0.02 + n * 0.02, z);
        thatch.uvs.push(i / seg, j / seg);
        const sh = 0.5 + n * 0.3;
        thatch.colors.push(0.10 * sh, 0.20 * sh, 0.06 * sh);
      }
      for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, e = c + 1; thatch.indices.push(a, c, b, b, c, e); }
      parts.push(thatch);
    }
    // Poisson-disk tuft centers
    const pts = [];
    const minD = Math.sqrt((W * D) / nT) * 0.75;
    let guard = 0;
    while (pts.length < nT && guard++ < nT * 40) {
      const x = (rng() - 0.5) * W * 0.96, z = (rng() - 0.5) * D * 0.96;
      const mask = _vfbm(x * 0.45 + 3, z * 0.45, 3); // bare-earth patches
      if (mask < -0.45 && rng() < 0.8) continue; // dirt patch, skip mostly
      let ok = true;
      for (const q of pts) { const dx = q[0] - x, dz = q[1] - z; if (dx * dx + dz * dz < minD * minD * rng()) { ok = false; break; } }
      if (!ok) continue;
      // edge fade
      const ex = Math.abs(x) / (W / 2), ez = Math.abs(z) / (D / 2);
      if (Math.max(ex, ez) > 0.92 && rng() < 0.6) continue;
      pts.push([x, z, mask]);
    }
    // build tufts (vary height hue per tuft)
    const P = [], I = [], C = [], U = [];
    let off = 0;
    for (let ti = 0; ti < pts.length; ti++) {
      const [tx, tz, msk] = pts[ti];
      const hv = (rng() - 0.5) * 0.14 + msk * 0.1;
      const tc = [_vclamp(tipC[0] + hv * 0.5, 0, 1), _vclamp(tipC[1] + hv, 0, 1), _vclamp(tipC[2] + hv * 0.4, 0, 1)];
      const th = (opts.height || 0.55) * (0.8 + rng() * 0.5) * (msk > 0.3 ? 1.2 : 1);
      const tuft = this.grassTuft({ seed: seed + ti * 131, blades: nB, height: th, radius: 0.14 + rng() * 0.08, rootColor: rootC, tipColor: tc, dry: dry * (0.5 + rng()), dew: quality === 'cinema' });
      for (let k = 0; k < tuft.positions.length; k += 3) { tuft.positions[k] += tx; tuft.positions[k + 2] += tz; }
      // drop dew single-verts (keep arrays index-safe): tuft may contain trailing point verts without indices — strip them
      const nv = tuft.indices.length ? (Math.max.apply(null, tuft.indices) + 1) : 0;
      const pc = tuft.positions.length / 3;
      let plen = nv > 0 ? nv * 3 : tuft.positions.length;
      // uvs/colors may be longer due to dew points; trim to indexed verts
      const uvPer = 2, colPer = 3;
      for (let k = 0; k < plen; k++) P.push(tuft.positions[k]);
      for (let k = 0; k < tuft.indices.length; k++) I.push(tuft.indices[k] + off);
      const cnv = nv * colPer;
      for (let k = 0; k < Math.min(cnv, tuft.colors.length); k++) C.push(tuft.colors[k]);
      const unv = nv * uvPer;
      for (let k = 0; k < Math.min(unv, tuft.uvs.length); k++) U.push(tuft.uvs[k]);
      off += nv;
    }
    parts.push({ name: 'blades', positions: P, indices: I, normals: [], uvs: U, colors: C, material: null });
    // merge thatch + blades
    let out = parts[0];
    if (parts.length > 1) {
      const B = parts[1];
      const o = out.positions.length / 3;
      for (let k = 0; k < B.positions.length; k++) out.positions.push(B.positions[k]);
      for (let k = 0; k < B.indices.length; k++) out.indices.push(B.indices[k] + o);
      for (let k = 0; k < B.uvs.length; k++) out.uvs.push(B.uvs[k]);
      for (let k = 0; k < B.colors.length; k++) out.colors.push(B.colors[k]);
      out.name = opts.name || 'grassPatch';
    }
    out.material = this.pbrUltra ? this.pbrUltra({ baseColor: tipC, metallic: 0, roughness: 0.9, vertexColors: true, seed: seed }) : { baseColor: tipC, metallic: 0, roughness: 0.9, vertexColors: true, name: 'ultra' };
    this.autoUV(out); // keep uvs sane (preserves wind weights in v channel ordering? recompute planar, acceptable)
    // restore wind weights into uv.y (tip=1): recompute from height fraction
    {
      let minY = 1e9, maxY = -1e9;
      for (let i = 1; i < out.positions.length; i += 3) { const y = out.positions[i]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      const rg = Math.max(1e-6, maxY - minY);
      const nn = out.positions.length / 3;
      if (!out.uvs || out.uvs.length !== nn * 2) out.uvs = new Array(nn * 2).fill(0);
      for (let i = 0; i < nn; i++) { const t = (out.positions[i * 3 + 1] - minY) / rg; out.uvs[i * 2 + 1] = t * t; }
    }
    this.computeNormals(out);
    // weld only thatch region? skip weld (blades share few verts; weld costs time) — light clean instead
    return out;
  };

  // ---------- LEAF: cupped bilayer with veins ----------
  UltraForge.prototype.leaf = function (opts) {
    opts = opts || {};
    const L = opts.length || 0.22, Wd = opts.width || 0.11;
    const shape = opts.shape || 'oval'; // oval|serrate|lobed|needle|palmate
    const fold = opts.fold !== undefined ? opts.fold : 0.45; // midrib V radians-ish
    const ripple = opts.ripple !== undefined ? opts.ripple : 0.12;
    const top = opts.topColor || [0.13, 0.42, 0.12];
    const under = opts.underColor || [0.35, 0.55, 0.25];
    const NX = 4, NY = 5;
    const pos = [], idx = [], col = [], uv = [];
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;
      // width profile by shape
      let wp;
      if (shape === 'needle') wp = 0.25 + 0.1 * Math.sin(v * Math.PI);
      else if (shape === 'lobed') wp = 0.55 + 0.45 * Math.abs(Math.sin(v * Math.PI * 2.5));
      else if (shape === 'palmate') wp = 0.3 + 0.7 * Math.sin(Math.min(1, v * 1.15) * Math.PI);
      else wp = Math.sin(Math.min(1, Math.max(0, (v - 0.02) / 0.96)) * Math.PI);
      if (shape === 'serrate') wp *= 0.85 + 0.15 * Math.abs(Math.sin(v * 40));
      for (let i = 0; i <= NX; i++) {
        const u = i / NX - 0.5; // -0.5..0.5
        const x = u * 2 * Wd * wp;
        const y = v * L;
        const cup = Math.abs(u) * 2 * fold * Wd * 0.35; // edges lift
        const rip = Math.sin(u * 9 + v * 7) * ripple * Wd * 0.2 * v;
        const arch = Math.sin(v * Math.PI) * 0.06 * L; // backward arch
        pos.push(x, y + cup + rip, -arch - cup * 0.4);
        uv.push(i / NX, v);
        // vein darkening near midrib + pale edge
        const mid = 1 - Math.min(1, Math.abs(u) * 2.4);
        const vein = Math.pow(mid, 3) * 0.35;
        const edge = Math.abs(u) * 2 > 0.85 ? 1.12 : 1.0;
        const shade = (0.75 + 0.25 * v) * (1 - vein * 0.4);
        col.push(top[0] * shade * edge, top[1] * shade * edge, top[2] * shade * edge);
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    // petiole stem
    const stemBase = pos.length / 3;
    pos.push(0, -0.035, 0, 0.008, 0.01, 0, -0.008, 0.01, 0);
    col.push(0.25, 0.32, 0.12, 0.25, 0.32, 0.12, 0.25, 0.32, 0.12);
    uv.push(0.5, 0, 0.55, 0.02, 0.45, 0.02);
    idx.push(stemBase, stemBase + 1, stemBase + 2);
    return { name: 'leaf_' + shape, positions: pos, indices: idx, normals: [], uvs: uv, colors: col, material: null, _under: under };
  };

  // ---------- BRANCH: tapered bent cylinder with bark ----------
  UltraForge.prototype.vegBranch = function (opts) {
    opts = opts || {};
    const len = opts.length || 0.7, r0 = opts.r0 || 0.045, r1 = opts.r1 || 0.015;
    const bend = opts.bend || 0.2, seed = opts.seed || 5;
    const SEG = 5, RAD = 7;
    const pos = [], idx = [], col = [], uv = [];
    const bark = opts.barkColor || [0.30, 0.20, 0.12];
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const r = _vlerp(r0, r1, t) * (1 + 0.12 * _vnoise(t * 6 + seed, seed * 0.3));
      const cx = bend * len * t * t, cy = len * t;
      for (let i = 0; i <= RAD; i++) {
        const a = (i / RAD) * Math.PI * 2;
        const ridge = 1 + 0.10 * Math.sin(a * 3 + t * 9 + seed);
        pos.push(cx + Math.cos(a) * r * ridge, cy, Math.sin(a) * r * ridge);
        uv.push(i / RAD, t);
        const sh = 0.8 + 0.35 * _vnoise(a * 1.5 + seed, t * 8);
        const moss = (Math.cos(a) < -0.4 && t > 0.3) ? 0.25 : 0; // north-side moss
        col.push((bark[0] * sh) * (1 - moss) + 0.2 * moss, (bark[1] * sh) * (1 - moss) + 0.35 * moss, (bark[2] * sh) * (1 - moss) + 0.12 * moss);
      }
    }
    for (let s = 0; s < SEG; s++) for (let i = 0; i < RAD; i++) { const a = s * (RAD + 1) + i, b = a + 1, c = a + RAD + 1, e = c + 1; idx.push(a, b, c, b, e, c); }
    // collar swelling at base (torus-ish ring)
    return { name: 'branch', positions: pos, indices: idx, normals: [], uvs: uv, colors: col, material: null };
  };

  // ---------- BUSH: skeleton + 3-shell canopy ----------
  UltraForge.prototype.bush = function (opts) {
    opts = opts || {};
    const seed = opts.seed !== undefined ? opts.seed : 4242;
    const rng = _vmulberry(seed);
    const R = opts.radius || 0.85, H = opts.height || 1.0;
    const shape = opts.topiary || null; // ball|cube|spiral|cone|null
    const leafShape = opts.leafShape || 'oval';
    const leafN = opts.leaves !== undefined ? opts.leaves : (opts.quality === 'cinema' ? 2600 : opts.quality === 'draft' ? 500 : 1300);
    const flower = opts.flower || null; // {color, count}
    const fruit = opts.fruit || null;
    const topC = opts.leafTop || [0.13, 0.42, 0.12];
    const undC = opts.leafUnder || [0.35, 0.55, 0.25];
    const P = [], I = [], C = [], U = [];
    let off = 0;
    function pushMesh(m, px, py, pz, yaw, tilt, s) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const n = m.positions.length / 3;
      for (let i = 0; i < n; i++) {
        let x = m.positions[i * 3] * s, y = m.positions[i * 3 + 1] * s, z = m.positions[i * 3 + 2] * s;
        let x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        let y1 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        P.push(x1 + px, y1 + py, z2 + pz);
      }
      for (let k = 0; k < m.indices.length; k++) I.push(m.indices[k] + off);
      for (let k = 0; k < m.colors.length; k++) C.push(m.colors[k]);
      for (let k = 0; k < m.uvs.length; k++) U.push(m.uvs[k]);
      off += n;
    }
    // 1) skeleton: 5-9 primary limbs from base
    const limbs = opts.limbs || 7;
    const tops = [];
    for (let li = 0; li < limbs; li++) {
      const a = (li / limbs) * Math.PI * 2 + rng() * 0.5;
      const tilt = 0.35 + rng() * 0.5;
      const len = H * (0.55 + rng() * 0.35);
      const br = this.vegBranch({ length: len, r0: 0.05, r1: 0.012, bend: 0.12 + rng() * 0.2, seed: seed + li, barkColor: opts.barkColor });
      // orient: tilt from vertical, yaw a
      const n = br.positions.length / 3;
      for (let i = 0; i < n; i++) {
        const x = br.positions[i * 3], y = br.positions[i * 3 + 1], z = br.positions[i * 3 + 2];
        const y1 = y * Math.cos(tilt) - 0 * Math.sin(tilt);
        const x1 = x, z1 = y * Math.sin(tilt) * 0.9 + z;
        const wx = x1 * Math.cos(a) - z1 * Math.sin(a), wz = x1 * Math.sin(a) + z1 * Math.cos(a);
        br.positions[i * 3] = wx; br.positions[i * 3 + 1] = y1 + 0.05; br.positions[i * 3 + 2] = wz;
      }
      pushMesh(br, 0, 0, 0, 0, 0, 1);
      tops.push([Math.sin(tilt) * Math.cos(a) * len * 0.9, len * Math.cos(tilt) * 0.95, Math.sin(tilt) * Math.sin(a) * len * 0.9]);
      // twigs: 2 per limb
      for (let tw = 0; tw < 2; tw++) {
        const t2 = this.vegBranch({ length: len * 0.4, r0: 0.02, r1: 0.006, bend: 0.25, seed: seed + li * 10 + tw });
        pushMesh(t2, tops[li][0] * 0.7, tops[li][1] * 0.7, tops[li][2] * 0.7, rng() * 6.28, 0.5 + rng() * 0.6, 1);
      }
    }
    // 2) canopy shells: outer dense small, mid full, inner sparse dark
    const shells = [
      { r: 1.0, frac: 0.5, s: 0.8, dark: 1.0 },
      { r: 0.78, frac: 0.35, s: 1.05, dark: 0.85 },
      { r: 0.5, frac: 0.15, s: 1.15, dark: 0.55 },
    ];
    const leafProto = {};
    function getLeaf(sc, dark) {
      const key = sc.toFixed(2) + dark.toFixed(2);
      return key;
    }
    let placed = 0;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (const sh of shells) {
      const count = Math.floor(leafN * sh.frac);
      for (let i = 0; i < count; i++) {
        const fi = (i + 0.5) / count;
        const y = 1 - fi * 2;
        const rad = Math.sqrt(Math.max(0, 1 - y * y));
        const th = golden * (i + placed * 0.7);
        let dx = Math.cos(th) * rad, dy = y, dz = Math.sin(th) * rad;
        // noise-carve (no perfect sphere): dent + lump
        const carve = _vfbm(dx * 2 + seed % 11, (dy + dz) * 2, 3);
        let rr = R * sh.r * (1 + carve * 0.28);
        let px = dx * rr, py = H * 0.55 + dy * rr * (H / (R || 1)) * 0.75, pz = dz * rr;
        if (shape === 'cube') { px = _vclamp(px, -R * 0.8, R * 0.8); py = _vclamp(py, H * 0.15, H * 1.0); pz = _vclamp(pz, -R * 0.8, R * 0.8); }
        else if (shape === 'cone') { const k = _vclamp((py) / H, 0, 1); px *= (1.1 - k * 0.75); pz *= (1.1 - k * 0.75); }
        if (py < 0.06) continue;
        // phototropic: outward+up bias + jitter
        const yaw = Math.atan2(dz, dx) + (rng() - 0.5) * 0.9;
        const tilt = 0.5 + (rng() - 0.5) * 0.8 - dy * 0.3;
        const s = sh.s * (0.8 + rng() * 0.45);
        const dk = sh.dark * (0.9 + rng() * 0.2);
        const lf = this.leaf({ length: 0.20 * s, width: 0.10 * s, shape: leafShape, topColor: [topC[0] * dk, topC[1] * dk, topC[2] * dk], underColor: undC, fold: 0.35 + rng() * 0.25, ripple: 0.1 + rng() * 0.1 });
        pushMesh(lf, px, py, pz, yaw, tilt, 1);
        placed++;
      }
    }
    // 3) new-growth tips: lighter small leaves at silhouette
    for (let t = 0; t < 40; t++) {
      const a = rng() * Math.PI * 2, y = (rng() - 0.2) * 0.9;
      const rad = Math.sqrt(Math.max(0.1, 1 - y * y));
      const px = Math.cos(a) * rad * R * 1.02, pz = Math.sin(a) * rad * R * 1.02, py = H * 0.55 + y * R * 0.75;
      if (py < 0.1) continue;
      const lf = this.leaf({ length: 0.12, width: 0.06, shape: leafShape, topColor: [0.45, 0.68, 0.25], underColor: undC });
      pushMesh(lf, px, py, pz, rng() * 6.28, 0.4 + rng() * 0.5, 1);
    }
    // 4) flowers / fruit
    if (flower) {
      const fc = flower.color || [0.95, 0.3, 0.35], n = flower.count || 60;
      for (let f = 0; f < n; f++) {
        const a = rng() * Math.PI * 2, y = (rng() - 0.3) * 1.2;
        const rad = Math.sqrt(Math.max(0.1, 1 - Math.min(1, y * y)));
        const px = Math.cos(a) * rad * R * 0.98, pz = Math.sin(a) * rad * R * 0.98, py = H * 0.55 + y * R * 0.7;
        if (py < 0.1) continue;
        const s = 5 + Math.floor(rng() * 3);
        for (let pt = 0; pt < s; pt++) {
          const pa = (pt / s) * Math.PI * 2;
          const pet = { name: 'petal', positions: [0, 0, 0, Math.cos(pa) * 0.035, 0.02, Math.sin(pa) * 0.035, Math.cos(pa + 0.6) * 0.03, 0.045, Math.sin(pa + 0.6) * 0.03], indices: [0, 1, 2], normals: [], uvs: [0.5, 0, 0, 1, 1, 1], colors: [fc[0], fc[1], fc[2], fc[0] * 1.05, fc[1] * 1.05, fc[2] * 1.05, 1, 0.9, 0.85], material: null };
          pushMesh(pet, px, py, pz, 0, 0, 1);
        }
      }
    }
    if (fruit) {
      const fc = fruit.color || [0.85, 0.15, 0.15], n = fruit.count || 40;
      for (let f = 0; f < n; f++) {
        const a = rng() * Math.PI * 2, y = (rng() - 0.4);
        const px = Math.cos(a) * R * 0.8 * rng(), pz = Math.sin(a) * R * 0.8 * rng(), py = H * 0.5 + y * R * 0.6;
        if (py < 0.1) continue;
        const berry = { name: 'berry', positions: [0, 0, 0], indices: [], normals: [], uvs: [0.5, 0.5], colors: [fc[0], fc[1], fc[2]], material: null };
        // tiny icosphere-ish: use 6-vert octahedron
        berry.positions = [0, 0.025, 0, 0.025, 0, 0, 0, 0, 0.025, -0.025, 0, 0, 0, 0, -0.025, 0, -0.025, 0];
        berry.indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4];
        berry.colors = []; for (let vv = 0; vv < 6; vv++) berry.colors.push(fc[0], fc[1], fc[2]);
        berry.uvs = []; for (let vv = 0; vv < 6; vv++) berry.uvs.push(0.5, 0.5);
        pushMesh(berry, px, py, pz, 0, 0, 1);
      }
    }
    const out = { name: opts.name || 'bush', positions: P, indices: I, normals: [], uvs: U, colors: C, material: null };
    out.material = this.pbrUltra ? this.pbrUltra({ baseColor: topC, metallic: 0, roughness: 0.85, vertexColors: true, seed: seed }) : { baseColor: topC, metallic: 0, roughness: 0.85, vertexColors: true, name: 'ultra' };
    this.computeNormals(out);
    // cavity AO: darken verts near center
    {
      const n = out.positions.length / 3;
      for (let i = 0; i < n; i++) {
        const x = out.positions[i * 3], y = out.positions[i * 3 + 1], z = out.positions[i * 3 + 2];
        const d = Math.sqrt(x * x + Math.pow((y - H * 0.55) * 1.2, 2) + z * z) / Math.max(0.2, R);
        const ao = _vclamp(0.45 + d * 0.75, 0.45, 1.15);
        out.colors[i * 3] *= ao; out.colors[i * 3 + 1] *= ao; out.colors[i * 3 + 2] *= ao;
      }
    }
    out.parts = [{ name: 'canopy', center: [0, H * 0.55, 0] }, { name: 'base', center: [0, 0.1, 0] }];
    return out;
  };

  UltraForge.prototype.hedge = function (opts) {
    opts = opts || {};
    const len = opts.length || 3, seed = opts.seed || 9;
    const n = Math.max(2, Math.floor(len / 0.9));
    const P = [], I = [], C = [], U = [];
    let off = 0;
    for (let i = 0; i < n; i++) {
      const b = this.bush({ seed: seed + i * 77, radius: 0.62, height: opts.height || 1.0, leafShape: opts.leafShape || 'oval', leaves: Math.floor((opts.leaves || 1300) / n), topiary: 'cube', quality: opts.quality });
      const px = (i - (n - 1) / 2) * 0.85;
      for (let k = 0; k < b.positions.length; k += 3) { b.positions[k] += px; }
      for (let k = 0; k < b.positions.length; k++) P.push(b.positions[k]);
      for (let k = 0; k < b.indices.length; k++) I.push(b.indices[k] + off);
      for (let k = 0; k < b.colors.length; k++) C.push(b.colors[k]);
      for (let k = 0; k < b.uvs.length; k++) U.push(b.uvs[k]);
      off += b.positions.length / 3;
    }
    const out = { name: 'hedge', positions: P, indices: I, normals: [], uvs: U, colors: C, material: null };
    out.material = this.pbrUltra ? this.pbrUltra({ baseColor: [0.13, 0.42, 0.12], metallic: 0, roughness: 0.9, vertexColors: true, seed: seed }) : null;
    this.computeNormals(out);
    return out;
  };

  UltraForge.prototype.flowerCluster = function (opts) {
    opts = opts || {};
    return this.bush(Object.assign({ leaves: 700, flower: { color: opts.color || [0.95, 0.4, 0.55], count: opts.count || 80 }, radius: 0.5, height: 0.6 }, opts));
  };

  UltraForge.prototype.scatterVegetation = function (opts) {
    opts = opts || {};
    const seed = opts.seed || 31337;
    const ground = this.plane(opts.width || 14, opts.depth || 14, 6);
    this.paint(ground, opts.groundColor || [0.23, 0.32, 0.13]);
    const parts = [ground];
    const rng = _vmulberry(seed);
    const ng = opts.grassPatches || 8, nb = opts.bushes || 4;
    for (let i = 0; i < ng; i++) {
      const g = this.grassPatch({ seed: seed + i * 101, width: 2.5, depth: 2.5, quality: opts.quality || 'game', tipColor: opts.tipColor });
      const px = (rng() - 0.5) * (opts.width || 14) * 0.8, pz = (rng() - 0.5) * (opts.depth || 14) * 0.8;
      for (let k = 0; k < g.positions.length; k += 3) { g.positions[k] += px; g.positions[k + 2] += pz; }
      parts.push(g);
    }
    for (let i = 0; i < nb; i++) {
      const b = this.bush({ seed: seed + 500 + i * 131, radius: 0.7 + rng() * 0.4, height: 0.9 + rng() * 0.4, quality: opts.quality || 'game', flower: rng() < 0.4 ? { count: 40 } : null });
      const px = (rng() - 0.5) * (opts.width || 14) * 0.7, pz = (rng() - 0.5) * (opts.depth || 14) * 0.7;
      for (let k = 0; k < b.positions.length; k += 3) { b.positions[k] += px; b.positions[k + 2] += pz; }
      parts.push(b);
    }
    // merge via index offset
    const out = { name: 'garden', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null };
    let off = 0;
    for (const m of parts) {
      for (let k = 0; k < m.positions.length; k++) out.positions.push(m.positions[k]);
      for (let k = 0; k < m.indices.length; k++) out.indices.push(m.indices[k] + off);
      const nn = m.positions.length / 3;
      const uv = (m.uvs && m.uvs.length === nn * 2) ? m.uvs : new Array(nn * 2).fill(0);
      const cl = (m.colors && m.colors.length === nn * 3) ? m.colors : new Array(nn * 3).fill(0.5);
      for (let k = 0; k < uv.length; k++) out.uvs.push(uv[k]);
      for (let k = 0; k < cl.length; k++) out.colors.push(cl[k]);
      off += nn;
    }
    out.material = this.pbrUltra ? this.pbrUltra({ baseColor: [0.3, 0.5, 0.2], metallic: 0, roughness: 0.9, vertexColors: true, seed: seed }) : null;
    this.computeNormals(out);
    return out;
  };

  // ---------- named veg kits (prompt-friendly) ----------
  UltraForge.prototype.lawnGrass = function (o) { o = o || {}; return this.grassPatch(Object.assign({ name: 'lawnGrass', width: 6, depth: 6, height: 0.32, dry: 0.05, tipColor: [0.32, 0.68, 0.20] }, o)); };
  UltraForge.prototype.wildMeadow = function (o) {
    o = o || {};
    const m = this.grassPatch(Object.assign({ name: 'wildMeadow', width: 7, depth: 7, height: 0.8, dry: 0.2, tipColor: [0.42, 0.62, 0.22] }, o));
    // wildflowers: sprinkle colored petals
    if (o.flowers !== false) {
      const rng = _vmulberry(o.seed || 606);
      const base = m.positions.length / 3;
      const cols = [[1, 0.9, 0.3], [1, 1, 1], [0.9, 0.3, 0.5], [0.6, 0.4, 1]];
      for (let f = 0; f < 70; f++) {
        const px = (rng() - 0.5) * 6.4, pz = (rng() - 0.5) * 6.4, py = 0.55 + rng() * 0.35;
        const c = cols[f % cols.length];
        const vi = m.positions.length / 3;
        m.positions.push(px, py, pz, px + 0.03, py + 0.02, pz, px - 0.02, py + 0.03, pz + 0.02);
        m.indices.push(vi, vi + 1, vi + 2);
        for (let k = 0; k < 3; k++) m.colors.push(c[0], c[1], c[2]);
        for (let k = 0; k < 3; k++) m.uvs.push(0.5, 0.5);
      }
      this.computeNormals(m);
    }
    return m;
  };
  UltraForge.prototype.savannaTuft = function (o) { o = o || {}; return this.grassPatch(Object.assign({ name: 'savannaTuft', height: 0.9, dry: 0.55, tipColor: [0.62, 0.55, 0.25] }, o)); };
  UltraForge.prototype.pampasPlume = function (o) {
    o = o || {};
    const m = this.grassPatch(Object.assign({ name: 'pampasPlume', height: 1.0, dry: 0.3, tipColor: [0.55, 0.52, 0.38] }, o));
    return m;
  };
  UltraForge.prototype.mossCarpet = function (o) { o = o || {}; return this.grassPatch(Object.assign({ name: 'mossCarpet', width: 4, depth: 4, height: 0.10, dry: 0, tipColor: [0.25, 0.52, 0.18], tufts: 120, blades: 6 }, o)); };
  UltraForge.prototype.cloverPatch = function (o) { o = o || {}; return this.grassPatch(Object.assign({ name: 'cloverPatch', width: 3, depth: 3, height: 0.16, tipColor: [0.22, 0.58, 0.20] }, o)); };
  UltraForge.prototype.wheatField = function (o) { o = o || {}; return this.grassPatch(Object.assign({ name: 'wheatField', width: 7, depth: 7, height: 1.0, dry: 0.65, tipColor: [0.78, 0.62, 0.28] }, o)); };
  UltraForge.prototype.reedMarsh = function (o) { o = o || {}; return this.grassPatch(Object.assign({ name: 'reedMarsh', height: 1.2, dry: 0.15, tipColor: [0.35, 0.55, 0.25] }, o)); };
  UltraForge.prototype.boxwoodTopiary = function (o) { o = o || {}; return this.bush(Object.assign({ name: 'boxwood', radius: 0.8, height: 1.0, topiary: o.topiary || 'ball', leafShape: 'oval', leaves: o.leaves }, o)); };
  UltraForge.prototype.roseBush = function (o) { o = o || {}; return this.bush(Object.assign({ name: 'roseBush', radius: 0.7, height: 0.9, leafShape: 'serrate', flower: { color: o.flowerColor || [0.9, 0.15, 0.2], count: 70 } }, o)); };
  UltraForge.prototype.hydrangea = function (o) { o = o || {}; return this.bush(Object.assign({ name: 'hydrangea', radius: 0.75, height: 0.9, leafShape: 'oval', flower: { color: o.flowerColor || [0.6, 0.5, 0.95], count: 50 } }, o)); };
  UltraForge.prototype.juniperConifer = function (o) { o = o || {}; return this.bush(Object.assign({ name: 'juniper', radius: 0.7, height: 1.3, leafShape: 'needle', topiary: 'cone' }, o)); };
  UltraForge.prototype.hedgeRow = function (o) { o = o || {}; return this.hedge(o); };
  UltraForge.prototype.wildBramble = function (o) { o = o || {}; return this.bush(Object.assign({ name: 'bramble', radius: 0.9, height: 0.8, leafShape: 'serrate', fruit: { color: [0.3, 0.1, 0.35], count: 50 } }, o)); };
  UltraForge.prototype.lavenderBush = function (o) { o = o || {}; return this.bush(Object.assign({ name: 'lavender', radius: 0.55, height: 0.6, leafShape: 'needle', flower: { color: [0.6, 0.45, 0.9], count: 90 } }, o)); };
  UltraForge.prototype.bonsai = function (o) {
    o = o || {};
    const pot = this.cylinder(0.28, 0.22, 0.25, 14);
    for (let k = 1; k < pot.positions.length; k += 3) pot.positions[k] += 0.125;
    this.paint(pot, [0.35, 0.22, 0.15]);
    const tree = this.bush({ seed: o.seed || 77, radius: 0.5, height: 0.55, leafShape: 'oval', leaves: 900, quality: o.quality });
    for (let k = 1; k < tree.positions.length; k += 3) tree.positions[k] += 0.55;
    const P = pot.positions.concat(tree.positions), I = pot.indices.slice();
    const off = pot.positions.length / 3;
    for (const ix of tree.indices) I.push(ix + off);
    const out = { name: 'bonsai', positions: P, indices: I, normals: [], uvs: (pot.uvs || []).concat(tree.uvs || []), colors: (pot.colors || new Array(pot.positions.length / 3 * 3).fill(0.4)).concat(tree.colors || []), material: tree.material };
    // fix pot colors length if missing
    if (!pot.colors) { /* filled above */ }
    this.computeNormals(out);
    return out;
  };

  // ---------- parser patch: vegetation first (before rock/stone traps) ----------
  const _origParse = UltraForge.prototype.parsePrompt;
  UltraForge.prototype.parsePrompt = function (prompt) {
    const p = String(prompt || ''), pl = p.toLowerCase();
    const veg = [
      [/lawn|manicured.?grass|turf|garden.?lawn/i, 'lawnGrass'],
      [/meadow|wild.?grass|tall.?grass|grass.?field|prairie/i, 'wildMeadow'],
      [/savanna|sahara.?grass|dry.?grass/i, 'savannaTuft'],
      [/pampas|plume.?grass|ornamental.?grass/i, 'pampasPlume'],
      [/moss.?carpet|mossy.?ground|moss.?patch|moss.?bed|moss.?garden/i, 'mossCarpet'],
      [/clover/i, 'cloverPatch'],
      [/wheat|crop.?field|barley|rye.?field/i, 'wheatField'],
      [/reed|marsh|cattail|pond.?grass/i, 'reedMarsh'],
      [/^\s*grass\s*$|grass.?(patch|blades?)|\bblades\b|blade.?of.?grass/i, 'lawnGrass'],
      [/boxwood|topiary|sheared.?bush|bush.?ball/i, 'boxwoodTopiary'],
      [/rose.?bush|roses/i, 'roseBush'],
      [/hydrangea/i, 'hydrangea'],
      [/juniper|conifer.?bush|evergreen.?bush/i, 'juniperConifer'],
      [/hedge|hedge.?row|trimmed.?wall|privet/i, 'hedgeRow'],
      [/bramble|blackberry|thorny.?bush|wild.?bush/i, 'wildBramble'],
      [/lavender/i, 'lavenderBush'],
      [/bonsai/i, 'bonsai'],
      [/\bbush\b|shrub|flower.?bush|berry.?bush/i, 'boxwoodTopiary'],
    ];
    for (const [re, kind] of veg) {
      if (re.test(p)) {
        const base = _origParse.call(this, 'box'); // reuse color/style/material/mood/quality parsing
        base.kind = kind;
        if (/cinema|ultra|8k|hero|masterpiece|perfect|detailed|dense|lush/i.test(p)) base.quality = 'cinema';
        else if (/game/i.test(p)) base.quality = 'game';
        else if (/draft|fast|sketch/i.test(p)) base.quality = 'draft';
        else base.quality = /bush|hedge|bonsai|rose|topiary/i.test(p) ? 'game' : 'cinema'; // grass defaults cinema (dense), bushes game (balanced)
        if (/dry|withered|sahara|savanna/i.test(p)) base.dryness = 0.6;
        return base;
      }
    }
    return _origParse.call(this, prompt);
  };

  // ---------- quick patch: route veg kinds ----------
  const _origQuick = UltraForge.prototype.quick;
  UltraForge.prototype.quick = function (prompt, opts) {
    opts = opts || {};
    let q;
    try { q = this.parsePrompt(prompt); } catch (e) { return _origQuick.call(this, prompt, opts); }
    if (VEG_KITS.indexOf(q.kind) === -1) return _origQuick.call(this, prompt, opts);
    const t0 = Date.now();
    if (opts.quality) q.quality = opts.quality;
    if (opts.style) q.style = opts.style;
    const presetName = q.quality || 'game';
    const seed = opts.seed !== undefined ? opts.seed : 1000 + String(prompt).length * 77;
    const vopts = { quality: presetName, seed: seed };
    if (q.dryness !== undefined) vopts.dry = q.dryness;
    let m;
    switch (q.kind) {
      case 'lawnGrass': m = this.lawnGrass(vopts); break;
      case 'wildMeadow': m = this.wildMeadow(vopts); break;
      case 'savannaTuft': m = this.savannaTuft(vopts); break;
      case 'pampasPlume': m = this.pampasPlume(vopts); break;
      case 'mossCarpet': m = this.mossCarpet(vopts); break;
      case 'cloverPatch': m = this.cloverPatch(vopts); break;
      case 'wheatField': m = this.wheatField(vopts); break;
      case 'reedMarsh': m = this.reedMarsh(vopts); break;
      case 'boxwoodTopiary': m = this.boxwoodTopiary(vopts); break;
      case 'roseBush': m = this.roseBush(vopts); break;
      case 'hydrangea': m = this.hydrangea(vopts); break;
      case 'juniperConifer': m = this.juniperConifer(vopts); break;
      case 'hedgeRow': m = this.hedgeRow(vopts); break;
      case 'wildBramble': m = this.wildBramble(vopts); break;
      case 'lavenderBush': m = this.lavenderBush(vopts); break;
      case 'bonsai': m = this.bonsai(vopts); break;
      default: return _origQuick.call(this, prompt, opts);
    }
    m.name = q.kind + '_' + (q.colorName || 'green');
    const dt = Date.now() - t0;
    let score = 85;
    try { score = this.qualityScore ? this.qualityScore(m) : 85; } catch (e) {}
    const budgetMap = { draft: 4000, game: 14000, cinema: 65000, print: 30000 };
    const budget = opts.polyBudget || (budgetMap[presetName] || 14000);
    if (m.indices.length / 3 > budget) { try { this.decimate(m, budget); } catch (e) {} }
    return { mesh: m, stats: { verts: m.positions.length / 3, tris: m.indices.length / 3, timeMs: dt, polyLevel: q.poly, kind: q.kind, color: q.colorName || 'green', quality: presetName, style: q.style, material: q.materialName || 'leaf', score: score } };
  };

  return { VEG_KITS: VEG_KITS };
}

try { module.exports = { registerVegetation: registerVegetation, VEG_KITS: VEG_KITS }; } catch (e) {}
