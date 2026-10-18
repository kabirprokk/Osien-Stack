'use strict';
/* osien-3d-forge — ANIMATIONS-ULTRA v2.3.1
 * Game-ready procedural animation system. Node stdlib only, zero deps.
 * 32 phase-parameterized clips (sine walk science, NOT hand keyframes),
 * retargeted to the STANDARD 17-bone rig (H=1.8, see REST_POSE below).
 * Backward compatible: only ADDS methods to UltraForge, never touches v1/v2.
 *
 * Clip format: {name, fps:30, loop:bool, length:sec,
 *                rootMotion:[dx,dy,dz] total, tracks:{bone:[{t, e:[rx,ry,rz] deg, p:[x,y,z]|null}]}}
 * Rotations are RELATIVE to rest pose. Bones not listed = rest.
 *
 * Usage:
 *   const { UltraForge } = require('./index.js');
 *   const { registerAnimations } = require('./animations.js');
 *   registerAnimations(UltraForge);
 *   const forge = new UltraForge();
 *   forge.animList();                       // -> 32 names
 *   const walk = forge.bakeAnim('walk');    // baked at 30fps
 *   const pose = forge.applyAnimPose(null, walk, 0.25); // {bone:{e,p}}
 */
function _amulberry(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _aclamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _alerp(a, b, t) { return a + (b - a) * t; }
function _ahash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function _ss(x) { x = _aclamp(x, 0, 1); return x * x * (3 - 2 * x); }   // smoothstep 0..1
function _W(u, a, b) { return _ss((u - a) / ((b - a) || 1e-6)); }        // 0->1 window edge
function _ENV(u, a, b, c, d) { return _W(u, a, b) * (1 - _W(u, c, d)); } // attack-sustain-release bump
function _r3(v) { return Math.round(v * 1000) / 1000; }

const TAU = Math.PI * 2;

// ---------- STANDARD 17-bone RIG (H=1.8) ----------
const REST_POSE = {
  'hips': [0, 0.95, 0], 'spine': [0, 1.12, 0], 'chest': [0, 1.32, 0],
  'neck': [0, 1.50, 0], 'head': [0, 1.63, 0],
  'upperArm.L': [-0.26, 1.40, 0], 'forearm.L': [-0.38, 1.14, 0], 'hand.L': [-0.43, 0.92, 0],
  'upperArm.R': [0.26, 1.40, 0], 'forearm.R': [0.38, 1.14, 0], 'hand.R': [0.43, 0.92, 0],
  'thigh.L': [-0.11, 0.90, 0], 'shin.L': [-0.12, 0.48, 0], 'foot.L': [-0.12, 0.06, 0.12],
  'thigh.R': [0.11, 0.90, 0], 'shin.R': [0.12, 0.48, 0], 'foot.R': [0.12, 0.06, 0.12]
};
const BONE_PARENTS = {
  'hips': null, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
  'upperArm.L': 'chest', 'forearm.L': 'upperArm.L', 'hand.L': 'forearm.L',
  'upperArm.R': 'chest', 'forearm.R': 'upperArm.R', 'hand.R': 'forearm.R',
  'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L',
  'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R'
};
const BONES = Object.keys(REST_POSE);
const BONE_SET = {};
BONES.forEach(function (b) { BONE_SET[b] = 1; });

function P_(e, p) { return { e: e, p: p || null }; } // pose entry: euler deg XYZ + rest-offset or null

// ---------- shared gait solver (walk science) ----------
// forward swing = -X (flexion), knee bend = +X (only backward), foot compensates.
// o: {cycles, phase, swing, knee, kneeBase, bob, sway, arm, armBase, elbow, lean,
//     hipPitch, twist, roll, crouch, nod, headYaw}
function gaitPose(u, o) {
  const w = TAU * (o.cycles || 1) * u + (o.phase || 0);
  const sL = Math.sin(w), sR = -sL;
  const sw = o.swing || 0, kn = o.knee || 0, ar = o.arm !== undefined ? o.arm : sw * 0.7;
  const rip = 0.5 - 0.5 * Math.cos(2 * w + 1.0); // 2x-frequency double-support ripple (shared)
  const kL = kn * (0.75 * Math.pow(Math.max(0, Math.sin(w + 2.2)), 1.1) + 0.25 * rip) + (o.kneeBase || 0);
  const kR = kn * (0.75 * Math.pow(Math.max(0, Math.sin(w + Math.PI + 2.2)), 1.1) + 0.25 * rip) + (o.kneeBase || 0);
  const thL = -sL * sw, thR = -sR * sw;                    // counter-phase thighs
  const fL = _aclamp(-(thL + kL) * 0.85, -45, 45);         // foot flattens
  const fR = _aclamp(-(thR + kR) * 0.85, -45, 45);
  const aL = sL * ar + (o.armBase || 0), aR = sR * ar + (o.armBase || 0); // arms counter-swing legs
  const el = o.elbow || 12;
  const tw = o.twist !== undefined ? o.twist : 5, ro = o.roll !== undefined ? o.roll : 3;
  const ln = o.lean || 0, cr = o.crouch || 0, bo = o.bob || 0, sy = o.sway || 0;
  return {
    'hips': P_([o.hipPitch || 0, -tw * 0.4 * sL, ro * sL], [sy * sL, -cr + bo * Math.sin(2 * w + 1.2), 0]),
    'spine': P_([-ln * 0.4, tw * 0.5 * sL, -ro * 0.4 * sL]),
    'chest': P_([-ln, tw * sL, -ro * 0.6 * sL]),
    'neck': P_([ln * 0.25, (o.headYaw || 0) * 0.5 * Math.sin(w + 0.5), 0]),
    'head': P_([ln * 0.45 + (o.nod || 0) * Math.sin(2 * w + 0.8), (o.headYaw || 0) * Math.sin(w + 0.5), 0]),
    'upperArm.L': P_([aL, 0, -6 - ar * 0.12]),
    'upperArm.R': P_([aR, 0, 6 + ar * 0.12]),
    'forearm.L': P_([-(el + 8 * Math.max(0, -sL)), 0, 0]),
    'forearm.R': P_([-(el + 8 * Math.max(0, sL)), 0, 0]),
    'hand.L': P_([sL * ar * 0.25, 0, 0]),
    'hand.R': P_([sR * ar * 0.25, 0, 0]),
    'thigh.L': P_([thL, 0, 1.5]),
    'thigh.R': P_([thR, 0, -1.5]),
    'shin.L': P_([kL, 0, 0]),
    'shin.R': P_([kR, 0, 0]),
    'foot.L': P_([fL, 0, 0]),
    'foot.R': P_([fR, 0, 0])
  };
}

// ---------- 32 CLIP DEFINITIONS (pose(u) -> {bone:{e,p}}, u in 0..1) ----------
const CLIP_DEFS = [
  { name: 'idle', length: 3.0, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const b1 = Math.sin(TAU * u), b2 = Math.sin(TAU * 2 * u + 0.7);
      return {
        'hips': P_([0, 0, 1.2 * b1], [0.02 * b1, 0.004 * b2, 0]),
        'spine': P_([-1 - 0.8 * b2, 0.8 * b1, 0]),
        'chest': P_([-2 - 1.5 * b2, 1.5 * b1, 0]),
        'neck': P_([1 + 0.5 * b2, 2 * b1, 0]),
        'head': P_([1.5 + 0.8 * b2, 3.5 * Math.sin(TAU * u + 1.0), 1.2 * b1]),
        'upperArm.L': P_([1.5 * b2, 0, -7 - 0.8 * b2]),
        'upperArm.R': P_([-1.5 * b2, 0, 7 + 0.8 * b2]),
        'forearm.L': P_([-8 - 2 * b2, 0, 0]),
        'forearm.R': P_([-8 + 2 * b2, 0, 0]),
        'thigh.L': P_([0.8 * b1, 0, 1]),
        'thigh.R': P_([-0.8 * b1, 0, -1])
      };
  } },
  { name: 'breathe', length: 4.0, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const b = Math.sin(TAU * u);
      return {
        'hips': P_([0, 0, 0], [0, 0.008 * b, 0]),
        'spine': P_([1 + 1 * b, 0, 0]),
        'chest': P_([-3 - 3 * b, 0, 0]),
        'neck': P_([1.5 * b, 0, 0]),
        'head': P_([2 * b, 0, 0]),
        'upperArm.L': P_([0, 0, -6 - 1.5 * b]),
        'upperArm.R': P_([0, 0, 6 + 1.5 * b]),
        'forearm.L': P_([-6 - 2 * b, 0, 0]),
        'forearm.R': P_([-6 - 2 * b, 0, 0])
      };
  } },
  { name: 'walk', length: 1.0, loop: true, rootMotion: [0, 0, 1.4], pose: function (u) {
      return gaitPose(u, { swing: 30, knee: 45, bob: 0.03, sway: 0.02, arm: 22, elbow: 14, lean: 4, twist: 5, nod: 2, phase: Math.PI / 2 });
  } },
  { name: 'run', length: 0.6, loop: true, rootMotion: [0, 0, 2.6], pose: function (u) {
      const g = gaitPose(u, { swing: 55, knee: 85, bob: 0.055, sway: 0.015, arm: 42, elbow: 48, lean: 12, twist: 7, hipPitch: -4, nod: 3, phase: Math.PI / 2 });
      g['hips'].p[1] += 0.02; // flight phase lift
      return g;
  } },
  { name: 'sprint', length: 0.5, loop: true, rootMotion: [0, 0, 3.4], pose: function (u) {
      const g = gaitPose(u, { swing: 65, knee: 105, bob: 0.07, sway: 0.01, arm: 55, elbow: 62, lean: 18, twist: 8, hipPitch: -6, nod: 3, phase: Math.PI / 2 });
      g['hips'].p[1] += 0.035;
      return g;
  } },
  { name: 'jump', length: 0.9, loop: false, rootMotion: [0, 0, 0.9], pose: function (u) {
      const crouch = _ENV(u, 0.0, 0.03, 0.22, 0.38);   // anticipation dip
      const extend = _ENV(u, 0.22, 0.36, 0.50, 0.62);  // launch extension
      const air = _W(u, 0.38, 0.50) * (1 - _W(u, 0.72, 0.90)); // tuck
      const land = _W(u, 0.72, 0.85);                  // landing bend (held)
      const kB = 55 * crouch + 8 * extend + 45 * air + 35 * land;
      return {
        'hips': P_([-6 * crouch - 10 * extend + 8 * air + 4 * land, 0, 0], [0, -0.22 * crouch + 0.25 * extend + 0.12 * air - 0.12 * land, 0]),
        'spine': P_([-14 * crouch + 6 * extend + 4 * air - 6 * land, 0, 0]),
        'chest': P_([-18 * crouch + 8 * extend + 6 * air - 8 * land, 0, 0]),
        'neck': P_([8 * crouch, 0, 0]),
        'head': P_([10 * crouch - 4 * extend, 0, 0]),
        'upperArm.L': P_([15 * crouch - 150 * extend - 120 * air - 40 * land, 0, -12 - 20 * air]),
        'upperArm.R': P_([15 * crouch - 150 * extend - 120 * air - 40 * land, 0, 12 + 20 * air]),
        'forearm.L': P_([-20 * crouch - 10 * extend - 25 * air - 30 * land, 0, 0]),
        'forearm.R': P_([-20 * crouch - 10 * extend - 25 * air - 30 * land, 0, 0]),
        'thigh.L': P_([-40 * crouch + 10 * extend - 25 * air - 30 * land, 0, 2]),
        'thigh.R': P_([-40 * crouch + 10 * extend - 25 * air - 30 * land, 0, -2]),
        'shin.L': P_([kB, 0, 0]),
        'shin.R': P_([kB, 0, 0]),
        'foot.L': P_([20 * crouch - 15 * air + 10 * land, 0, 0]),
        'foot.R': P_([20 * crouch - 15 * air + 10 * land, 0, 0])
      };
  } },
  { name: 'land', length: 0.5, loop: false, rootMotion: [0, 0, 0], pose: function (u) {
      const r = _W(u, 0.10, 0.70); // bent -> recover
      const k = 1 - r;
      return {
        'hips': P_([4 * k, 0, 0], [0, -0.15 * k, 0]),
        'spine': P_([-8 * k, 0, 0]),
        'chest': P_([-10 * k, 0, 0]),
        'head': P_([-6 * k, 0, 0]),
        'upperArm.L': P_([-60 * k, 0, -25 * k]),
        'upperArm.R': P_([-60 * k, 0, 25 * k]),
        'forearm.L': P_([-25 * k, 0, 0]),
        'forearm.R': P_([-25 * k, 0, 0]),
        'thigh.L': P_([-35 * k, 0, 2]),
        'thigh.R': P_([-35 * k, 0, -2]),
        'shin.L': P_([50 * k, 0, 0]),
        'shin.R': P_([50 * k, 0, 0]),
        'foot.L': P_([12 * k, 0, 0]),
        'foot.R': P_([12 * k, 0, 0])
      };
  } },
  { name: 'crouchIdle', length: 2.5, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const b = Math.sin(TAU * 2 * u);
      return {
        'hips': P_([-6, 0, 0], [0, -0.32 + 0.008 * b, 0]),
        'spine': P_([-8, 0, 0]),
        'chest': P_([-14 - 2 * b, 0, 0]),
        'neck': P_([8, 0, 0]),
        'head': P_([10 + 1.5 * b, 3 * Math.sin(TAU * u), 0]),
        'upperArm.L': P_([-30, 0, -8]),
        'upperArm.R': P_([-30, 0, 8]),
        'forearm.L': P_([-35, 0, 0]),
        'forearm.R': P_([-35, 0, 0]),
        'thigh.L': P_([-70, 0, 3]),
        'thigh.R': P_([-70, 0, -3]),
        'shin.L': P_([85, 0, 0]),
        'shin.R': P_([85, 0, 0]),
        'foot.L': P_([-12, 0, 0]),
        'foot.R': P_([-12, 0, 0])
      };
  } },
  { name: 'crouchWalk', length: 1.1, loop: true, rootMotion: [0, 0, 0.7], pose: function (u) {
      return gaitPose(u, { swing: 18, knee: 55, kneeBase: 45, bob: 0.02, sway: 0.02, arm: 18, armBase: -15, elbow: 42, lean: 10, twist: 4, crouch: 0.34, phase: Math.PI / 2 });
  } },
  { name: 'sneak', length: 1.2, loop: true, rootMotion: [0, 0, 0.8], pose: function (u) {
      return gaitPose(u, { swing: 24, knee: 55, kneeBase: 30, bob: 0.02, sway: 0.025, arm: 26, armBase: -38, elbow: 58, lean: 16, twist: 5, crouch: 0.24, nod: 2, phase: Math.PI / 2 });
  } },
  { name: 'turnLeft', length: 0.8, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const g = gaitPose(u, { cycles: 1, swing: 12, knee: 20, bob: 0.015, sway: 0.015, arm: 10, elbow: 18, lean: 2, twist: 3, phase: Math.PI / 2 });
      g['hips'].e[1] += -16; g['chest'].e[1] += -10; g['head'].e[1] += -8;
      return g;
  } },
  { name: 'turnRight', length: 0.8, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const g = gaitPose(u, { cycles: 1, swing: 12, knee: 20, bob: 0.015, sway: 0.015, arm: 10, elbow: 18, lean: 2, twist: 3, phase: Math.PI / 2 });
      g['hips'].e[1] += 16; g['chest'].e[1] += 10; g['head'].e[1] += 8;
      return g;
  } },
  { name: 'punch', length: 0.55, loop: false, rootMotion: [0, 0, 0.25], pose: function (u) {
      const wind = _ENV(u, 0.0, 0.05, 0.10, 0.25);
      const hit = _W(u, 0.15, 0.35) * (1 - _W(u, 0.55, 0.95));
      return {
        'hips': P_([0, 8 * wind - 10 * hit, 0], [0, -0.03 * hit, 0.08 * hit]),
        'spine': P_([0, 6 * wind - 10 * hit, 0]),
        'chest': P_([-4 * hit, 12 * wind - 18 * hit, 0]),
        'neck': P_([0, 6 * wind - 8 * hit, 0]),
        'head': P_([0, 6 * wind - 8 * hit, 0]),
        'upperArm.L': P_([-20 * wind - 30 * hit, 0, -10]),
        'upperArm.R': P_([25 * wind - 95 * hit, 0, 8 - 8 * hit]),
        'forearm.L': P_([-70 * wind - 60 * hit, 0, 0]),
        'forearm.R': P_([-35 * wind - 5 * hit, 0, 0]),
        'hand.R': P_([0, 0, 0], [0, 0, 0.05 * hit]),
        'thigh.L': P_([-15 * hit, 0, 2]),
        'thigh.R': P_([8 * wind + 5 * hit, 0, -2]),
        'shin.L': P_([18 * hit, 0, 0]),
        'shin.R': P_([6 * hit, 0, 0])
      };
  } },
  { name: 'kick', length: 0.65, loop: false, rootMotion: [0, 0, 0.3], pose: function (u) {
      const chamber = _ENV(u, 0.0, 0.10, 0.20, 0.32);
      const ext = _W(u, 0.30, 0.44) * (1 - _W(u, 0.60, 0.95));
      return {
        'hips': P_([6 * ext, 0, 0], [0, -0.04 * chamber - 0.02 * ext, 0.05 * ext]),
        'spine': P_([8 * chamber + 12 * ext, 0, 0]),
        'chest': P_([10 * chamber + 14 * ext, -10 * ext, 0]),
        'head': P_([6 * ext, 0, 0]),
        'upperArm.L': P_([20 * chamber + 30 * ext, 0, -20]),
        'upperArm.R': P_([20 * chamber + 30 * ext, 0, 20]),
        'forearm.L': P_([-20, 0, 0]),
        'forearm.R': P_([-20, 0, 0]),
        'thigh.L': P_([-6 * chamber, 0, 2]),
        'thigh.R': P_([-50 * chamber - 85 * ext, 0, -2]),
        'shin.L': P_([12 * chamber + 8 * ext, 0, 0]),
        'shin.R': P_([70 * chamber + 8 * ext, 0, 0]),
        'foot.R': P_([-30 * chamber + 20 * ext, 0, 0])
      };
  } },
  { name: 'attackSlash1', length: 0.7, loop: false, rootMotion: [0, 0, 0.35], pose: function (u) {
      const s = _W(u, 0.08, 0.55);                 // slash travel 0->1
      const rec = _W(u, 0.70, 0.97);              // recover to guard
      const k = s * (1 - rec);
      return {
        'hips': P_([0, _alerp(6, -12, k), 0], [0, -0.05 * k, 0.12 * k]),
        'spine': P_([0, _alerp(8, -14, k), 0]),
        'chest': P_([-6 * k, _alerp(14, -22, k), 0]),
        'head': P_([0, _alerp(8, -12, k), 0]),
        'upperArm.R': P_([_alerp(-140, -25, k), 0, _alerp(-55, 38, k)]),
        'forearm.R': P_([-25 + 12 * k, 0, 0]),
        'hand.R': P_([0, 0, 0], [0, 0, 0.04 * k]),
        'upperArm.L': P_([-15 * k, 0, -15]),
        'forearm.L': P_([-40 * k, 0, 0]),
        'thigh.L': P_([-22 * k, 0, 2]),
        'shin.L': P_([25 * k, 0, 0])
      };
  } },
  { name: 'attackSlash2', length: 0.7, loop: false, rootMotion: [0, 0, 0.35], pose: function (u) {
      const s = _W(u, 0.08, 0.55);
      const rec = _W(u, 0.70, 0.97);
      const k = s * (1 - rec); // backhand: low-left -> high-right
      return {
        'hips': P_([0, _alerp(-12, 10, k), 0], [0, -0.05 * k, 0.12 * k]),
        'spine': P_([0, _alerp(-14, 12, k), 0]),
        'chest': P_([-4 * k, _alerp(-22, 20, k), 0]),
        'head': P_([0, _alerp(-12, 10, k), 0]),
        'upperArm.R': P_([_alerp(5, -150, k), 0, _alerp(42, -48, k)]),
        'forearm.R': P_([-45 + 25 * k, 0, 0]),
        'upperArm.L': P_([-12 * k, 0, -14]),
        'forearm.L': P_([-35 * k, 0, 0]),
        'thigh.R': P_([-20 * k, 0, -2]),
        'shin.R': P_([22 * k, 0, 0])
      };
  } },
  { name: 'attackStab', length: 0.6, loop: false, rootMotion: [0, 0, 0.5], pose: function (u) {
      const th = _ENV(u, 0.10, 0.30, 0.50, 0.90);
      return {
        'hips': P_([-4 * th, 0, 0], [0, -0.08 * th, 0.25 * th]),
        'spine': P_([-8 * th, 0, 0]),
        'chest': P_([-12 * th, 0, 0]),
        'head': P_([6 * th, 0, 0]),
        'upperArm.L': P_([-88 * th, 0, -6]),
        'upperArm.R': P_([-92 * th, 0, 6]),
        'forearm.L': P_([-6 * th, 0, 0]),
        'forearm.R': P_([-4 * th, 0, 0]),
        'hand.L': P_([0, 0, 0], [0, 0, 0.10 * th]),
        'hand.R': P_([0, 0, 0], [0, 0, 0.12 * th]),
        'thigh.L': P_([-32 * th, 0, 2]),
        'thigh.R': P_([18 * th, 0, -2]),
        'shin.L': P_([34 * th, 0, 0]),
        'shin.R': P_([4 * th, 0, 0])
      };
  } },
  { name: 'attackCombo', length: 1.5, loop: false, rootMotion: [0, 0, 0.6], pose: function (u) {
      const s1 = _ENV(u, 0.02, 0.12, 0.25, 0.33); // right slash
      const s2 = _ENV(u, 0.35, 0.45, 0.58, 0.66); // left backhand
      const s3 = _ENV(u, 0.68, 0.80, 0.90, 1.00); // finishing stab
      const tw = -20 * s1 + 20 * s2 - 4 * s3;
      return {
        'hips': P_([0, tw * 0.5, 0], [0, -0.06 * (s1 + s2) - 0.08 * s3, 0.10 * s1 + 0.10 * s2 + 0.25 * s3]),
        'chest': P_([-6 * (s1 + s2) - 12 * s3, tw, 0]),
        'spine': P_([0, tw * 0.6, 0]),
        'head': P_([0, tw * 0.4, 0]),
        'upperArm.R': P_([-100 * s1 - 20 * s2 - 90 * s3, 0, 30 * s1 - 30 * s2]),
        'forearm.R': P_([-15 * s1 - 40 * s2 - 5 * s3, 0, 0]),
        'upperArm.L': P_([-20 * s1 - 100 * s2 - 85 * s3, 0, -15]),
        'forearm.L': P_([-40 * s1 - 15 * s2 - 8 * s3, 0, 0]),
        'thigh.L': P_([-20 * s1 - 10 * s2 - 30 * s3, 0, 2]),
        'shin.L': P_([22 * s1 + 12 * s2 + 32 * s3, 0, 0]),
        'thigh.R': P_([-10 * s1 - 20 * s2 + 16 * s3, 0, -2]),
        'shin.R': P_([12 * s1 + 22 * s2 + 4 * s3, 0, 0])
      };
  } },
  { name: 'block', length: 0.9, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const sway = Math.sin(TAU * u); // subtle living hold (periodic)
      return {
        'hips': P_([-4, 0, 0], [0, -0.09 + 0.004 * sway, 0]),
        'spine': P_([-6, 0, 0]),
        'chest': P_([-8 + sway, 0, 0]),
        'head': P_([4, 0, 0]),
        'upperArm.L': P_([-42 + 2 * sway, 0, -18]),
        'upperArm.R': P_([-42 - 2 * sway, 0, 18]),
        'forearm.L': P_([-95, 0, 0], [0.02, 0.03, 0.02]),
        'forearm.R': P_([-95, 0, 0], [-0.02, 0.03, 0.02]),
        'thigh.L': P_([-28, 0, 3]),
        'thigh.R': P_([-28, 0, -3]),
        'shin.L': P_([34, 0, 0]),
        'shin.R': P_([34, 0, 0])
      };
  } },
  { name: 'hitReact', length: 0.45, loop: false, rootMotion: [0, 0, -0.15], pose: function (u) {
      const j = _ENV(u, 0.0, 0.06, 0.25, 0.80);
      return {
        'hips': P_([10 * j, 0, 0], [0, -0.03 * j, -0.12 * j]),
        'spine': P_([14 * j, 0, 0]),
        'chest': P_([18 * j, 6 * j, 0]),
        'neck': P_([12 * j, 0, 0]),
        'head': P_([15 * j, 8 * j, 0]),
        'upperArm.L': P_([25 * j, 0, -25 * j]),
        'upperArm.R': P_([25 * j, 0, 25 * j]),
        'forearm.L': P_([-20 * j, 0, 0]),
        'forearm.R': P_([-20 * j, 0, 0]),
        'thigh.L': P_([-8 * j, 0, 2]),
        'shin.L': P_([12 * j, 0, 0]),
        'shin.R': P_([10 * j, 0, 0])
      };
  } },
  { name: 'death', length: 2.0, loop: false, rootMotion: [0, 0, -0.4], pose: function (u) {
      const fall = _W(u, 0.05, 0.45);            // collapse backward (held)
      const settle = _ss((u - 0.45) / 0.45) * fall; // small post-fall bounce
      const bounce = Math.sin(settle * Math.PI) * 0.04;
      return {
        'hips': P_([55 * fall, 0, 0], [0, -0.80 * fall + bounce, -0.25 * fall]),
        'spine': P_([18 * fall, 0, 0]),
        'chest': P_([25 * fall - 4 * settle, 8 * fall, 0]),
        'neck': P_([18 * fall, 0, 0]),
        'head': P_([22 * fall - 6 * settle, 10 * fall, 0]),
        'upperArm.L': P_([-20 * fall, 0, -70 * fall]),
        'upperArm.R': P_([-20 * fall, 0, 70 * fall]),
        'forearm.L': P_([-15 * fall, 0, 0]),
        'forearm.R': P_([-15 * fall, 0, 0]),
        'thigh.L': P_([-8 * fall, 0, 4]),
        'thigh.R': P_([-8 * fall, 0, -4]),
        'shin.L': P_([10 * fall, 0, 0]),
        'shin.R': P_([10 * fall, 0, 0])
      };
  } },
  { name: 'dance', length: 2.0, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const w = TAU * 2 * u; // 2 groove cycles per clip
      const s1 = Math.sin(w), s2 = Math.sin(2 * w + 0.9);
      return {
        'hips': P_([-4, 0, 10 * s1], [0.03 * s2, -0.08 + 0.05 * s2, 0]),
        'spine': P_([-6, 8 * s1, -4 * s1]),
        'chest': P_([-8 + 4 * s2, 12 * s1, -6 * s1]),
        'neck': P_([4, -6 * s1, 0]),
        'head': P_([6 + 6 * s2, -8 * s1, 4 * s2]),
        'upperArm.L': P_([-150 + 25 * s2, 0, -25 + 12 * s1]),
        'upperArm.R': P_([-40 - 30 * s1, 0, 30 - 10 * s2]),
        'forearm.L': P_([-30 + 20 * s1, 0, 0]),
        'forearm.R': P_([-70 - 20 * s2, 0, 0]),
        'hand.L': P_([20 * s2, 0, 0]),
        'thigh.L': P_([-15 - 10 * s2, 0, 3]),
        'thigh.R': P_([-15 + 10 * s2, 0, -3]),
        'shin.L': P_([20 + 10 * s2, 0, 0]),
        'shin.R': P_([20 - 10 * s2, 0, 0])
      };
  } },
  { name: 'wave', length: 1.5, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const wv = Math.sin(TAU * 3 * u); // 3 waves per clip (periodic)
      const b = Math.sin(TAU * u);
      return {
        'hips': P_([0, 0, 1.5 * b], [0, 0.005 * b, 0]),
        'chest': P_([-2, -4, 0]),
        'neck': P_([0, -4, 0]),
        'head': P_([0, -5, 5]),
        'upperArm.L': P_([2 * b, 0, -7]),
        'forearm.L': P_([-8, 0, 0]),
        'upperArm.R': P_([-160, 0, 15]),
        'forearm.R': P_([-12 + 24 * wv, 0, 0]),
        'hand.R': P_([10 * wv, 0, 0])
      };
  } },
  { name: 'bow', length: 1.6, loop: false, rootMotion: [0, 0, 0], pose: function (u) {
      const k = _ENV(u, 0.05, 0.35, 0.60, 0.95);
      return {
        'hips': P_([-8 * k, 0, 0], [0, -0.06 * k, 0]),
        'spine': P_([-16 * k, 0, 0]),
        'chest': P_([-30 * k, 0, 0]),
        'neck': P_([-14 * k, 0, 0]),
        'head': P_([-8 * k, 0, 0]),
        'upperArm.L': P_([-8 * k, 0, -9 - 2 * k]),
        'upperArm.R': P_([-8 * k, 0, 9 + 2 * k]),
        'forearm.L': P_([-6 * k, 0, 0]),
        'forearm.R': P_([-6 * k, 0, 0]),
        'thigh.L': P_([-6 * k, 0, 1]),
        'thigh.R': P_([-6 * k, 0, -1]),
        'shin.L': P_([8 * k, 0, 0]),
        'shin.R': P_([8 * k, 0, 0])
      };
  } },
  { name: 'cheer', length: 1.2, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const p = Math.sin(TAU * 2 * u); // 2 pumps per clip (periodic)
      return {
        'hips': P_([-3, 0, 0], [0, 0.07 * Math.max(0, p), 0]),
        'spine': P_([4 + 2 * p, 0, 0]),
        'chest': P_([8 + 3 * p, 0, 0]),
        'neck': P_([-6, 0, 0]),
        'head': P_([-10 - 3 * p, 0, 0]),
        'upperArm.L': P_([-160 + 22 * p, 0, -14]),
        'upperArm.R': P_([-160 + 22 * p, 0, 14]),
        'forearm.L': P_([-12, 0, 0]),
        'forearm.R': P_([-12, 0, 0]),
        'thigh.L': P_([-6 * Math.max(0, p), 0, 2]),
        'thigh.R': P_([-6 * Math.max(0, p), 0, -2]),
        'shin.L': P_([8 * Math.max(0, p), 0, 0]),
        'shin.R': P_([8 * Math.max(0, p), 0, 0])
      };
  } },
  { name: 'sit', length: 1.2, loop: false, rootMotion: [0, 0, 0.1], pose: function (u) {
      const k = _W(u, 0.05, 0.50); // settle into chair (held)
      return {
        'hips': P_([-6 * k, 0, 0], [0, -0.48 * k, -0.05 * k]),
        'spine': P_([-4 * k, 0, 0]),
        'chest': P_([-8 * k, 0, 0]),
        'neck': P_([5 * k, 0, 0]),
        'head': P_([6 * k, 0, 0]),
        'upperArm.L': P_([-12 * k, 0, -8]),
        'upperArm.R': P_([-12 * k, 0, 8]),
        'forearm.L': P_([-28 * k, 0, 0]),
        'forearm.R': P_([-28 * k, 0, 0]),
        'thigh.L': P_([-85 * k, 0, 2]),
        'thigh.R': P_([-85 * k, 0, -2]),
        'shin.L': P_([85 * k, 0, 0]),
        'shin.R': P_([85 * k, 0, 0]),
        'foot.L': P_([12 * k, 0, 0]),
        'foot.R': P_([12 * k, 0, 0])
      };
  } },
  { name: 'swim', length: 1.6, loop: true, rootMotion: [0, 0, 2.0], pose: function (u) {
      const w = TAU * u;
      const sL = Math.sin(w), sR = -sL;
      const fl = Math.sin(3 * w); // flutter kick 3x (periodic)
      return {
        'hips': P_([-55, 0, 3 * sL], [0, 0, 0]),
        'spine': P_([-10, 0, 0]),
        'chest': P_([-12, 5 * sL, 0]),
        'neck': P_([30, 0, 0]),
        'head': P_([38, 4 * sL, 0]),
        'upperArm.L': P_([-90 + 70 * sL, 0, -14]),
        'upperArm.R': P_([-90 + 70 * sR, 0, 14]),
        'forearm.L': P_([-25 - 12 * Math.max(0, sL), 0, 0]),
        'forearm.R': P_([-25 - 12 * Math.max(0, sR), 0, 0]),
        'hand.L': P_([10 * sL, 0, 0]),
        'hand.R': P_([10 * sR, 0, 0]),
        'thigh.L': P_([8 * fl, 0, 2]),
        'thigh.R': P_([-8 * fl, 0, -2]),
        'shin.L': P_([18 + 10 * Math.max(0, fl), 0, 0]),
        'shin.R': P_([18 + 10 * Math.max(0, -fl), 0, 0]),
        'foot.L': P_([15, 0, 0]),
        'foot.R': P_([15, 0, 0])
      };
  } },
  { name: 'climb', length: 1.2, loop: true, rootMotion: [0, 1.2, 0], pose: function (u) {
      const w = TAU * u;
      const sL = Math.sin(w), sR = -sL;
      return {
        'hips': P_([-6, 0, 0], [0, 0.05 * Math.sin(2 * w + 0.5), 0]),
        'spine': P_([-4, 0, 0]),
        'chest': P_([-8, 4 * sL, 0]),
        'head': P_([-12, 0, 0]),
        'upperArm.L': P_([-160 + 45 * sL, 0, -10]),
        'upperArm.R': P_([-160 + 45 * sR, 0, 10]),
        'forearm.L': P_([-35 - 12 * Math.max(0, sL), 0, 0]),
        'forearm.R': P_([-35 - 12 * Math.max(0, sR), 0, 0]),
        'thigh.L': P_([-45 - 28 * Math.max(0, sR), 0, 3]),
        'thigh.R': P_([-45 - 28 * Math.max(0, sL), 0, -3]),
        'shin.L': P_([60 + 20 * Math.max(0, sR), 0, 0]),
        'shin.R': P_([60 + 20 * Math.max(0, sL), 0, 0]),
        'foot.L': P_([25, 0, 0]),
        'foot.R': P_([25, 0, 0])
      };
  } },
  { name: 'aimBow', length: 1.0, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const b = Math.sin(TAU * u); // breathing sway (periodic)
      return {
        'hips': P_([0, -14, 0], [0, -0.06, 0]),
        'spine': P_([0, -8, 0]),
        'chest': P_([-4 + b, -20, 0]),
        'neck': P_([0, 12, 0]),
        'head': P_([0, 16, 0]),
        'upperArm.L': P_([-88, 0, -10]),
        'forearm.L': P_([-4, 0, 0]),
        'hand.L': P_([0, 0, 0], [0, 0.004 * b, 0.02]),
        'upperArm.R': P_([-62 + 1.5 * b, 0, 22]),
        'forearm.R': P_([-102, 0, 0]),
        'hand.R': P_([0, 0, 0], [0, 0, -0.03]),
        'thigh.L': P_([-18, 0, 3]),
        'thigh.R': P_([6, 0, -4]),
        'shin.L': P_([22, 0, 0]),
        'shin.R': P_([6, 0, 0])
      };
  } },
  { name: 'castSpell', length: 1.2, loop: false, rootMotion: [0, 0, 0], pose: function (u) {
      const raise = _ENV(u, 0.0, 0.10, 0.30, 0.45);
      const thrust = _W(u, 0.40, 0.55) * (1 - _W(u, 0.75, 1.0));
      return {
        'hips': P_([4 * raise - 4 * thrust, 0, 0], [0, -0.04 * raise - 0.02 * thrust, 0.06 * thrust]),
        'spine': P_([8 * raise - 10 * thrust, 0, 0]),
        'chest': P_([10 * raise - 15 * thrust, 0, 0]),
        'neck': P_([-8 * raise + 4 * thrust, 0, 0]),
        'head': P_([-12 * raise + 6 * thrust, 0, 0]),
        'upperArm.L': P_([-150 * raise - 90 * thrust + 60 * raise * thrust, 0, -12]),
        'upperArm.R': P_([-150 * raise - 90 * thrust + 60 * raise * thrust, 0, 12]),
        'forearm.L': P_([-15 * raise - 8 * thrust, 0, 0]),
        'forearm.R': P_([-15 * raise - 8 * thrust, 0, 0]),
        'hand.L': P_([0, 0, 0], [0, 0, 0.08 * thrust]),
        'hand.R': P_([0, 0, 0], [0, 0, 0.08 * thrust]),
        'thigh.L': P_([-10 * raise, 0, 2]),
        'thigh.R': P_([-10 * raise, 0, -2]),
        'shin.L': P_([12 * raise, 0, 0]),
        'shin.R': P_([12 * raise, 0, 0])
      };
  } },
  { name: 'throw', length: 0.7, loop: false, rootMotion: [0, 0, 0.3], pose: function (u) {
      const wind = _ENV(u, 0.0, 0.08, 0.25, 0.40);
      const rel = _W(u, 0.35, 0.50) * (1 - _W(u, 0.65, 0.95));
      return {
        'hips': P_([0, 10 * wind - 12 * rel, 0], [0, -0.03 * wind, 0.15 * rel]),
        'spine': P_([6 * wind - 6 * rel, 8 * wind - 10 * rel, 0]),
        'chest': P_([8 * wind - 10 * rel, 14 * wind - 18 * rel, 0]),
        'head': P_([0, 8 * wind - 8 * rel, 0]),
        'upperArm.R': P_([38 * wind - 115 * rel, 0, 12 - 6 * rel]),
        'forearm.R': P_([-65 * wind - 12 * rel, 0, 0]),
        'hand.R': P_([-20 * wind, 0, 0], [0, 0, 0.05 * rel]),
        'upperArm.L': P_([-20 * wind - 30 * rel, 0, -18]),
        'forearm.L': P_([-30 * wind, 0, 0]),
        'thigh.L': P_([-25 * rel, 0, 2]),
        'thigh.R': P_([15 * wind + 10 * rel, 0, -2]),
        'shin.L': P_([28 * rel, 0, 0]),
        'shin.R': P_([10 * wind, 0, 0])
      };
  } },
  { name: 'talk', length: 2.5, loop: true, rootMotion: [0, 0, 0], pose: function (u) {
      const w1 = TAU * u, w2 = TAU * 2 * u;
      return {
        'hips': P_([0, 0, 1.5 * Math.sin(w1)], [0.02 * Math.sin(w1), 0.003 * Math.sin(w2), 0]),
        'chest': P_([-2 - Math.sin(w2 + 0.4), 2 * Math.sin(w1 + 0.6), 0]),
        'neck': P_([1.5 * Math.sin(w2), 3 * Math.sin(w1 + 1.2), 0]),
        'head': P_([3 * Math.sin(w2 + 0.8), 6 * Math.sin(w1 + 0.3), 2 * Math.sin(w1)]),
        'upperArm.L': P_([-8 + 3 * Math.sin(w2), 0, -9]),
        'upperArm.R': P_([-18 + 8 * Math.sin(w2 + 1.1), 0, 10 + 3 * Math.sin(w1)]),
        'forearm.L': P_([-22 + 5 * Math.sin(w2 + 0.5), 0, 0]),
        'forearm.R': P_([-38 + 16 * Math.sin(w2 + 1.4), 0, 0]),
        'hand.R': P_([8 * Math.sin(w2 + 2.0), 0, 0])
      };
  } }
];

const ANIM_CLIPS = CLIP_DEFS.map(function (d) { return d.name; });
const DEF_BY_NAME = {};
CLIP_DEFS.forEach(function (d) { DEF_BY_NAME[d.name] = d; });

// ---------- bake: sample parametric pose at 30fps ----------
function bakeClip(name, opts) {
  opts = opts || {};
  const def = DEF_BY_NAME[name];
  if (!def) { console.warn('[animations] unknown clip: ' + name); return null; }
  const seed = opts.seed !== undefined ? opts.seed : 0;
  const rnd = _amulberry(((_ahash(name) ^ (seed | 0)) >>> 0) || 1);
  const phaseOff = (rnd() - 0.5) * 0.5;   // seeded phase variation (radians)
  const ampJit = 1 + (rnd() - 0.5) * 0.12; // seeded amplitude jitter
  let ex = opts.exaggerate !== undefined ? opts.exaggerate : 1;
  const ch = opts.character || opts.style || null;
  if (ch === 'child' || ch === 'kid') ex *= 1.3;   // kids: 1.3x energy
  if (ch === 'zombie' || ch === 'undead') ex *= 0.6; // zombies: 0.6x + shamble lean
  const zombie = (ch === 'zombie' || ch === 'undead');
  let speed = opts.speed || 1;
  if (!(speed > 0)) speed = 1;
  const fps = 30;
  const effLen = def.length / speed;
  const N = Math.max(1, Math.round(fps * effLen));
  const acc = {}; // bone -> [{t,e,p}]
  for (let i = 0; i < N; i++) {
    const t = i / fps;
    let uu = (t * speed) / def.length;
    if (def.loop) { uu = (((uu + phaseOff / TAU) % 1) + 1) % 1; }
    else { uu = _aclamp(uu, 0, 1); }
    let pose;
    try { pose = def.pose(uu); }
    catch (e) { console.warn('[animations] clip "' + name + '" pose fn threw: ' + e.message); return null; }
    for (const b in pose) {
      if (!BONE_SET[b]) { console.warn('[animations] clip "' + name + '" uses unknown bone "' + b + '" — skipping'); continue; }
      const src = pose[b] || {};
      const se = src.e || [0, 0, 0], sp = src.p || null;
      let exx = se[0] * ex * ampJit, eyy = se[1] * ex * ampJit, ezz = se[2] * ex * ampJit;
      let pp = sp ? [sp[0] * ex, sp[1] * ex, sp[2] * ex] : null;
      if (zombie) { // shamble post-process: stoop + arms dragged forward
        if (b === 'chest') exx -= 16;
        else if (b === 'head' || b === 'neck') exx -= 7;
        else if (b === 'upperArm.L') { exx = exx * 0.3 - 50; ezz = ezz * 0.3 - 10; }
        else if (b === 'upperArm.R') { exx = exx * 0.3 - 50; ezz = ezz * 0.3 + 10; }
        else if (b === 'forearm.L' || b === 'forearm.R') exx = exx * 0.3 - 12;
        else if (b === 'hips') exx -= 8;
      }
      if (!isFinite(exx) || !isFinite(eyy) || !isFinite(ezz)) { console.warn('[animations] clip "' + name + '" produced non-finite euler on ' + b + ' — clamping'); exx = 0; eyy = 0; ezz = 0; }
      if (!acc[b]) acc[b] = [];
      acc[b].push({ t: Math.round(t * 10000) / 10000, e: [_r3(exx), _r3(eyy), _r3(ezz)], p: pp ? [pp[0], pp[1], pp[2]].map(_r3) : null });
    }
  }
  // prune bones that never leave rest (keeps JSON small)
  const tracks = {};
  for (const b in acc) {
    const frames = acc[b];
    let live = false;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (Math.abs(f.e[0]) > 0.02 || Math.abs(f.e[1]) > 0.02 || Math.abs(f.e[2]) > 0.02) { live = true; break; }
      if (f.p && (Math.abs(f.p[0]) > 0.0005 || Math.abs(f.p[1]) > 0.0005 || Math.abs(f.p[2]) > 0.0005)) { live = true; break; }
    }
    if (live) tracks[b] = frames;
  }
  return { name: name, fps: fps, loop: !!def.loop, length: Math.round(effLen * 10000) / 10000, rootMotion: def.rootMotion.slice(), tracks: tracks };
}

function sampleBaked(clip, t) {
  const L = clip.length || 0;
  let tt = +t || 0;
  if (clip.loop && L > 0) tt = (((tt % L) + L) % L);
  else tt = _aclamp(tt, 0, L);
  const out = {};
  for (let bi = 0; bi < BONES.length; bi++) {
    const b = BONES[bi], tr = clip.tracks[b];
    if (!tr || !tr.length) { out[b] = { e: [0, 0, 0], p: null }; continue; }
    if (tt <= tr[0].t) { out[b] = { e: tr[0].e.slice(), p: tr[0].p ? tr[0].p.slice() : null }; continue; }
    const last = tr[tr.length - 1];
    if (tt >= last.t) { out[b] = { e: last.e.slice(), p: last.p ? last.p.slice() : null }; continue; }
    let i = 0;
    while (i < tr.length - 2 && tr[i + 1].t < tt) i++;
    const k0 = tr[i], k1 = tr[i + 1];
    const f = (tt - k0.t) / ((k1.t - k0.t) || 1e-9);
    const e = [_alerp(k0.e[0], k1.e[0], f), _alerp(k0.e[1], k1.e[1], f), _alerp(k0.e[2], k1.e[2], f)];
    let p = null;
    if (k0.p || k1.p) {
      const p0 = k0.p || [0, 0, 0], p1 = k1.p || [0, 0, 0];
      p = [_alerp(p0[0], p1[0], f), _alerp(p0[1], p1[1], f), _alerp(p0[2], p1[2], f)];
    }
    out[b] = { e: e, p: p };
  }
  return out;
}

function registerAnimations(UltraForge) {
  // validate once at registration: every clip references only standard bones
  CLIP_DEFS.forEach(function (def) {
    [0, 0.25, 0.5, 0.75].forEach(function (uu) {
      let pose;
      try { pose = def.pose(uu); } catch (e) { console.warn('[animations] clip "' + def.name + '" pose fn threw at u=' + uu); return; }
      for (const b in pose) {
        if (!BONE_SET[b]) console.warn('[animations] clip "' + def.name + '" references non-standard bone "' + b + '"');
      }
    });
  });

  UltraForge.animList = function () { return ANIM_CLIPS.slice(); };
  UltraForge.animGet = function (name, opts) { return bakeClip(name, opts || {}); };
  UltraForge.prototype.bakeAnim = function (name, opts) { return bakeClip(name, opts || {}); };
  UltraForge.prototype.applyAnimPose = function (rig, clip, timeSec) {
    if (typeof clip === 'string') clip = bakeClip(clip, {});
    if (!clip || !clip.tracks) { console.warn('[animations] applyAnimPose: bad clip'); return null; }
    return sampleBaked(clip, timeSec);
  };
  // rig metadata for runtimes (additive, no clash with skeleton()/attachRig())
  UltraForge.REST_POSE = REST_POSE;
  UltraForge.BONE_PARENTS = BONE_PARENTS;
  UltraForge.STANDARD_BONES = BONES.slice();

  return { ANIM_CLIPS: ANIM_CLIPS.slice() };
}

try { module.exports = { registerAnimations: registerAnimations, ANIM_CLIPS: ANIM_CLIPS, REST_POSE: REST_POSE, BONE_PARENTS: BONE_PARENTS }; } catch (e) {}
