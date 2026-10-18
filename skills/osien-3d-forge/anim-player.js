// anim-player.js — Three.js runtime for UltraForge ANIMATIONS-ULTRA clips.
// ES module, no deps beyond three.js. Node-safe: three is loaded lazily
// (pass it in, setThree(), or await ensureThree()), and the demo only runs
// in a browser page containing <div id="anim-demo">.
// Baked clip JSON shape (see animations.js):
//   {name, fps:30, loop, length, rootMotion:[dx,dy,dz], tracks:{bone:[{t,e:[deg],p:[x,y,z]|null}]}}
const D2R = Math.PI / 180;

// Standard 17-bone rest pose (H=1.8) — mirrors animations.js REST_POSE.
export const REST_POSE = {
  hips: [0, 0.95, 0], spine: [0, 1.12, 0], chest: [0, 1.32, 0],
  neck: [0, 1.5, 0], head: [0, 1.63, 0],
  'upperArm.L': [-0.26, 1.4, 0], 'forearm.L': [-0.38, 1.14, 0], 'hand.L': [-0.43, 0.92, 0],
  'upperArm.R': [0.26, 1.4, 0], 'forearm.R': [0.38, 1.14, 0], 'hand.R': [0.43, 0.92, 0],
  'thigh.L': [-0.11, 0.9, 0], 'shin.L': [-0.12, 0.48, 0], 'foot.L': [-0.12, 0.06, 0.12],
  'thigh.R': [0.11, 0.9, 0], 'shin.R': [0.12, 0.48, 0], 'foot.R': [0.12, 0.06, 0.12]
};
export const BONE_PARENTS = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  'upperArm.L': 'chest', 'forearm.L': 'upperArm.L', 'hand.L': 'forearm.L',
  'upperArm.R': 'chest', 'forearm.R': 'upperArm.R', 'hand.R': 'forearm.R',
  'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L',
  'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R'
};
export const BONES = Object.keys(REST_POSE);

// ---- lazy three.js (keeps this module importable in Node) ----
let _THREE = null;
export function setThree(t) { _THREE = t; return _THREE; }
export async function ensureThree() {
  if (_THREE) return _THREE;
  if (typeof globalThis !== 'undefined' && globalThis.THREE) { _THREE = globalThis.THREE; return _THREE; }
  try { _THREE = await import('three'); }
  catch (e) { throw new Error('anim-player: three.js is required (pass it to buildSkeletonMesh, setThree(), or use an importmap)'); }
  return _THREE;
}
function needThree(threeImpl) {
  return threeImpl || _THREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null) || null;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function ss01(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

// Interpolate a baked clip at time t (seconds) -> {bone:{e:[deg],p:[x,y,z]|null}}.
// Loop clips wrap, one-shots clamp. Bones missing from tracks return rest.
export function samplePose(clip, t) {
  if (!clip || !clip.tracks) throw new Error('samplePose: bad clip');
  const L = clip.length || 0;
  let tt = +t || 0;
  if (clip.loop && L > 0) tt = (((tt % L) + L) % L);
  else tt = Math.min(Math.max(tt, 0), L);
  const out = {};
  for (const b of BONES) {
    const tr = clip.tracks[b];
    if (!tr || !tr.length) { out[b] = { e: [0, 0, 0], p: null }; continue; }
    if (tt <= tr[0].t) { out[b] = { e: tr[0].e.slice(), p: tr[0].p ? tr[0].p.slice() : null }; continue; }
    const last = tr[tr.length - 1];
    if (tt >= last.t) { out[b] = { e: last.e.slice(), p: last.p ? last.p.slice() : null }; continue; }
    let i = 0;
    while (i < tr.length - 2 && tr[i + 1].t < tt) i++;
    const k0 = tr[i], k1 = tr[i + 1];
    const f = (tt - k0.t) / ((k1.t - k0.t) || 1e-9);
    const e = [lerp(k0.e[0], k1.e[0], f), lerp(k0.e[1], k1.e[1], f), lerp(k0.e[2], k1.e[2], f)];
    let p = null;
    if (k0.p || k1.p) {
      const p0 = k0.p || [0, 0, 0], p1 = k1.p || [0, 0, 0];
      p = [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), lerp(p0[2], p1[2], f)];
    }
    out[b] = { e, p };
  }
  return out;
}

// Fetch a baked clip JSON (browser fetch, or Node fs fallback for file paths).
export async function loadClip(url) {
  if (typeof fetch === 'function') {
    const r = await fetch(url);
    if (!r.ok) throw new Error('loadClip: HTTP ' + r.status + ' for ' + url);
    return await r.json();
  }
  const fs = await import('node:fs/promises');
  return JSON.parse(await fs.readFile(url, 'utf8'));
}

// Build a posable debug rig: spheres at joints + limb cylinders parent->child.
// rig: {joints:[{name,parent,pos}]} | {skeleton:{joints}} | joints array (pos = world).
// Returns THREE.Group with userData.boneIndex {name: Object3D} + userData.rest.
export function buildSkeletonMesh(rig, material, threeImpl) {
  const T = needThree(threeImpl);
  if (!T) throw new Error('buildSkeletonMesh: three.js not available — pass it as 3rd arg or call await ensureThree() first');
  let joints = null;
  if (Array.isArray(rig)) joints = rig;
  else if (rig && Array.isArray(rig.joints)) joints = rig.joints;
  else if (rig && rig.skeleton && Array.isArray(rig.skeleton.joints)) joints = rig.skeleton.joints;
  else throw new Error('buildSkeletonMesh: rig must be {joints:[{name,parent,pos}]}');
  let mat = material;
  if (!mat) mat = new T.MeshStandardMaterial({ color: 0x3fa7ff, roughness: 0.55, metalness: 0.1 });
  else if (Array.isArray(mat)) mat = new T.MeshStandardMaterial({ color: new T.Color(mat[0], mat[1], mat[2]), roughness: 0.55, metalness: 0.1 });
  const root = new T.Group();
  root.name = 'animRig';
  const W = {};
  for (const j of joints) W[j.name] = j.pos;
  const objs = {}, rest = {};
  for (const j of joints) {
    const o = new T.Object3D();
    o.name = j.name;
    const pw = j.parent ? W[j.parent] : null;
    const local = pw ? [j.pos[0] - pw[0], j.pos[1] - pw[1], j.pos[2] - pw[2]] : j.pos.slice();
    o.position.set(local[0], local[1], local[2]);
    o.add(new T.Mesh(new T.SphereGeometry(0.035, 12, 10), mat));
    objs[j.name] = o;
    rest[j.name] = local;
  }
  const up = new T.Vector3(0, 1, 0);
  for (const j of joints) {
    if (j.parent && objs[j.parent]) {
      objs[j.parent].add(objs[j.name]);
      const local = rest[j.name];
      const len = Math.hypot(local[0], local[1], local[2]);
      if (len > 1e-6) {
        const limb = new T.Mesh(new T.CylinderGeometry(0.022, 0.028, len, 8), mat);
        limb.position.set(local[0] / 2, local[1] / 2, local[2] / 2);
        limb.quaternion.setFromUnitVectors(up, new T.Vector3(local[0] / len, local[1] / len, local[2] / len));
        objs[j.parent].add(limb);
      }
    } else {
      root.add(objs[j.name]);
    }
  }
  root.userData.boneIndex = objs;
  root.userData.rest = rest;
  root.userData.rigKind = rig.kind || 'humanoid-17';
  return root;
}

export class AnimPlayer {
  // skeletonRoot: THREE.Group with userData.boneIndex {name: Object3D}
  constructor(skeletonRoot, clip) {
    this.root = skeletonRoot || null;
    this.bones = {};
    this.rest = {};
    this.clips = {};
    this.clip = null;
    this.time = 0;
    this.playing = false;
    this.current = null;   // last applied pose (for fade snapshots)
    this.from = null;      // fade source pose
    this.fadeT = 1;
    this.fadeDur = 0.25;
    if (skeletonRoot) this.bind(skeletonRoot);
    if (clip) this.setClip(clip);
  }
  bind(skeletonRoot) {
    this.root = skeletonRoot;
    const idx = (skeletonRoot && skeletonRoot.userData && skeletonRoot.userData.boneIndex) || {};
    this.bones = idx;
    this.rest = {};
    for (const name of Object.keys(idx)) {
      const o = idx[name];
      if (o && o.position) this.rest[name] = [o.position.x, o.position.y, o.position.z];
    }
    return this;
  }
  addClip(clip) {
    if (clip && clip.name && clip.tracks) this.clips[clip.name] = clip;
    return this;
  }
  setClip(clip) {
    if (typeof clip === 'string') {
      if (!this.clips[clip]) { console.warn('AnimPlayer: unknown clip "' + clip + '"'); return this; }
      clip = this.clips[clip];
    }
    if (clip) this.addClip(clip);
    this.clip = clip || null;
    this.time = 0;
    this.from = null;
    this.fadeT = 1;
    this.playing = !!clip;
    return this;
  }
  // play(nameOrClip, {fade}): crossfade from current pose into the new clip.
  play(nameOrClip, opts) {
    let clip = nameOrClip;
    if (typeof clip === 'string') {
      if (!this.clips[clip]) { console.warn('AnimPlayer: unknown clip "' + clip + '"'); return this; }
      clip = this.clips[clip];
    }
    if (!clip) return this;
    const fade = (opts && opts.fade !== undefined) ? opts.fade : 0.25;
    if (this.current && fade > 0) {
      this.from = this.current;
      this.fadeT = 0;
      this.fadeDur = fade;
    } else {
      this.from = null;
      this.fadeT = 1;
    }
    this.addClip(clip);
    this.clip = clip;
    this.time = 0;
    this.playing = true;
    return this;
  }
  stop() { this.playing = false; return this; }
  update(dt) {
    if (!this.clip || !this.playing) return null;
    this.time += Math.max(0, dt || 0);
    let pose = samplePose(this.clip, this.time);
    if (this.from) {
      this.fadeT += Math.max(0, dt || 0);
      const k = ss01(this.fadeT / (this.fadeDur || 1e-6));
      if (k >= 1) { this.from = null; }
      else {
        const mixed = {};
        for (const b of Object.keys(pose)) {
          const a = this.from[b] || { e: [0, 0, 0], p: null };
          const c = pose[b];
          const e = [lerp(a.e[0], c.e[0], k), lerp(a.e[1], c.e[1], k), lerp(a.e[2], c.e[2], k)];
          let p = null;
          if (a.p || c.p) {
            const p0 = a.p || [0, 0, 0], p1 = c.p || [0, 0, 0];
            p = [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k), lerp(p0[2], p1[2], k)];
          }
          mixed[b] = { e, p };
        }
        pose = mixed;
      }
    }
    this._apply(pose);
    this.current = pose;
    return pose;
  }
  _apply(pose) {
    for (const name of Object.keys(pose)) {
      const o = this.bones[name];
      if (!o) continue;
      const { e, p } = pose[name];
      if (o.rotation) o.rotation.set(e[0] * D2R, e[1] * D2R, e[2] * D2R);
      if (o.position) {
        const r = this.rest[name] || [0, 0, 0];
        if (p) o.position.set(r[0] + p[0], r[1] + p[1], r[2] + p[2]);
        else o.position.set(r[0], r[1], r[2]);
      }
    }
  }
}

// ---------- minimal demo: skeleton + walk loop, drag-orbit (no OrbitControls dep) ----------
// Runs only when opened in a page containing <div id="anim-demo">.
if (typeof document !== 'undefined' && document.getElementById('anim-demo')) {
  (async function animDemo() {
    const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
    const holder = document.getElementById('anim-demo');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const Wpx = holder.clientWidth || 640, Hpx = holder.clientHeight || 480;
    renderer.setSize(Wpx, Hpx);
    holder.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1118);
    const camera = new THREE.PerspectiveCamera(50, Wpx / Hpx, 0.1, 100);
    let theta = 0.6, phi = 1.15, radius = 3.4;
    function placeCam() {
      camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi) + 1.0,
        radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(0, 0.95, 0);
    }
    placeCam();
    // tiny drag-orbit (no addons needed)
    let drag = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
    window.addEventListener('pointerup', () => { drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      theta -= (e.clientX - drag[0]) * 0.008;
      phi = Math.min(Math.max(phi - (e.clientY - drag[1]) * 0.006, 0.2), 1.5);
      drag = [e.clientX, e.clientY];
      placeCam();
    });
    renderer.domElement.addEventListener('wheel', (e) => {
      radius = Math.min(Math.max(radius + (e.deltaY > 0 ? 0.25 : -0.25), 1.5), 8);
      placeCam();
      e.preventDefault();
    }, { passive: false });
    scene.add(new THREE.HemisphereLight(0xbdd7ee, 0x1a2028, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 40),
      new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // rig from embedded rest pose
    const joints = Object.keys(REST_POSE).map((n) => ({ name: n, parent: BONE_PARENTS[n], pos: REST_POSE[n].slice() }));
    const rig = buildSkeletonMesh({ kind: 'humanoid-17', joints }, [0.25, 0.65, 1.0], THREE);
    scene.add(rig);
    const player = new AnimPlayer(rig);
    // inline procedural walk (2-pole sine; full clips come from walk.json via loadClip)
    function demoWalk() {
      const fps = 30, N = 30, tracks = {};
      const bones = ['hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R', 'upperArm.L', 'upperArm.R'];
      for (const b of bones) tracks[b] = [];
      for (let i = 0; i < N; i++) {
        const t = i / fps, w = (i / N) * Math.PI * 2 + Math.PI / 2;
        const s = Math.sin(w);
        const F = [
          ['hips', [0, 0, 0], [0.02 * s, 0.03 * Math.sin(2 * w), 0]],
          ['thigh.L', [-30 * s, 0, 0], null], ['thigh.R', [30 * s, 0, 0], null],
          ['shin.L', [45 * (0.5 - 0.5 * Math.cos(2 * w + 1)), 0, 0], null],
          ['shin.R', [45 * (0.5 - 0.5 * Math.cos(2 * w + 1 + Math.PI)), 0, 0], null],
          ['foot.L', [10 * s, 0, 0], null], ['foot.R', [-10 * s, 0, 0], null],
          ['upperArm.L', [22 * s, 0, -6], null], ['upperArm.R', [-22 * s, 0, 6], null]
        ];
        for (const [b, e, p] of F) tracks[b].push({ t, e, p });
      }
      return { name: 'walk', fps, loop: true, length: 1, rootMotion: [0, 0, 1.4], tracks };
    }
    let clip = null;
    try { clip = await loadClip('./walk.json'); } catch (e) { clip = demoWalk(); }
    player.addClip(clip).play('walk', { fade: 0 });
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;top:8px;left:10px;color:#cfe8ff;font:12px system-ui;opacity:.85';
    label.textContent = 'UltraForge anim-player · ' + clip.name + ' · drag = orbit · wheel = zoom';
    holder.style.position = holder.style.position || 'relative';
    holder.appendChild(label);
    let prev = performance.now();
    (function tick(now) {
      requestAnimationFrame(tick);
      const dt = Math.min(((now - prev) / 1000) || 0.016, 0.05);
      prev = now;
      player.update(dt);
      renderer.render(scene, camera);
    })(prev);
  })().catch((e) => console.error('[anim-player demo]', e));
}
