'use strict';
/* osien-3d-forge — UltraForge procedural 3D engine. Node stdlib only, zero deps. */

// ---- inlined math (asset-gen style, no imports) ----
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mulberry(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _P = new Uint8Array(512);
(function () {
  const r = mulberry(1337); const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) _P[i] = p[i & 255];
})();
function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _g(h, x, y) { const g = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]][h & 7]; return g[0]*x+g[1]*y; }
function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x), yf = y - Math.floor(y);
  const u = _fade(xf), v = _fade(yf);
  const a = _P[X+_P[Y]] & 255, b = _P[X+1+_P[Y]] & 255, c = _P[X+_P[Y+1]] & 255, d = _P[X+1+_P[Y+1]] & 255;
  return lerp(lerp(_g(a,xf,yf), _g(b,xf-1,yf), u), lerp(_g(c,xf,yf-1), _g(d,xf-1,yf-1), u), v); // [-1,1]
}
function fbm2(x, y, oct) {
  let v = 0, a = 1, f = 1, m = 0;
  for (let i = 0; i < (oct || 4); i++) { v += a * noise2(x*f+i*13.7, y*f-i*7.1); m += a; a *= 0.5; f *= 2.03; }
  return v / m;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const NAMED_COLORS = { red:[1,0.12,0.1], blue:[0.15,0.4,1], green:[0.15,0.75,0.25], yellow:[1,0.85,0.1], orange:[1,0.5,0.08], purple:[0.6,0.25,0.9], pink:[1,0.45,0.7], white:[0.95,0.95,0.95], black:[0.08,0.08,0.09], gray:[0.55,0.56,0.58], grey:[0.55,0.56,0.58], brown:[0.45,0.28,0.15], wood:[0.55,0.36,0.2], wooden:[0.55,0.36,0.2], gold:[1,0.75,0.2], silver:[0.8,0.82,0.85], chrome:[0.85,0.87,0.9], stone:[0.6,0.6,0.62], grass:[0.3,0.7,0.25], leaf:[0.25,0.6,0.2], skin:[0.9,0.72,0.58], steel:[0.5,0.53,0.58], dark:[0.15,0.15,0.17] };

// Mesh: { name, positions:[x,y,z...], indices:[...], normals?, uvs?, colors?, material? }
function emptyMesh(name) { return { name: name || 'mesh', positions: [], indices: [], normals: [], uvs: [], colors: [], material: null }; }
function xform(mesh, fn) { // fn(x,y,z)->[x,y,z]
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const r = fn(mesh.positions[i], mesh.positions[i+1], mesh.positions[i+2]);
    mesh.positions[i] = r[0]; mesh.positions[i+1] = r[1]; mesh.positions[i+2] = r[2];
  }
  return mesh;
}
function translate(mesh, x, y, z) { return xform(mesh, (a,b,c) => [a+x, b+y, c+z]); }
function scaleM(mesh, x, y, z) { return xform(mesh, (a,b,c) => [a*x, b*y, c*(z===undefined?1:z)]); }
function mergeMeshes(list, name) {
  const out = emptyMesh(name || 'merged'); let off = 0;
  for (const m of list) {
    for (let i = 0; i < m.positions.length; i++) out.positions.push(m.positions[i]);
    for (let i = 0; i < m.indices.length; i++) out.indices.push(m.indices[i] + off);
    if (m.uvs && m.uvs.length) for (let i = 0; i < m.uvs.length; i++) out.uvs.push(m.uvs[i]);
    if (m.normals && m.normals.length) for (let i = 0; i < m.normals.length; i++) out.normals.push(m.normals[i]);
    if (m.colors && m.colors.length) for (let i = 0; i < m.colors.length; i++) out.colors.push(m.colors[i]);
    off += m.positions.length / 3;
  }
  return out;
}

class UltraForge {
  constructor(opts) { this.seed = (opts && opts.seed) || 1337; this.defaultMat = null; }

  // ---------- PRIMITIVES ----------
  box(w, h, d) {
    w = w===undefined?1:w; h = h===undefined?1:h; d = d===undefined?1:d;
    const x=w/2,y=h/2,z=d/2; const m = emptyMesh('box');
    const v=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
    const q=[[0,1,2,3],[4,5,6,7],[4,5,1,0],[3,2,6,7],[1,5,6,2],[4,0,3,7]];
    for (const f of q) for (const i of f) m.positions.push(v[i][0],v[i][1],v[i][2]);
    for (let f = 0; f < 6; f++) { const b=f*4; m.indices.push(b,b+1,b+2, b,b+2,b+3); }
    return this.computeNormals(this.autoUV(m));
  }
  plane(w, d, seg) {
    w=w||2; d=d||2; seg=Math.max(1,seg||1); const m=emptyMesh('plane');
    for (let j=0;j<=seg;j++) for (let i=0;i<=seg;i++) { m.positions.push((i/seg-0.5)*w, 0, (j/seg-0.5)*d); m.uvs.push(i/seg, j/seg); }
    for (let j=0;j<seg;j++) for (let i=0;i<seg;i++) { const a=j*(seg+1)+i,b=a+1,c=a+seg+1,e=c+1; m.indices.push(a,c,b, b,c,e); }
    return this.computeNormals(m);
  }
  sphere(detail) {
    detail = clamp(detail===undefined?16:detail, 4, 96);
    const m = emptyMesh('sphere'); const nu=detail, nv=Math.max(3,(detail*2/3)|0);
    for (let j=0;j<=nv;j++) { const th=j/nv*Math.PI, st=Math.sin(th), ct=Math.cos(th);
      for (let i=0;i<=nu;i++) { const ph=i/nu*Math.PI*2; m.positions.push(st*Math.cos(ph), ct, st*Math.sin(ph)); m.uvs.push(i/nu, j/nv); } }
    for (let j=0;j<nv;j++) for (let i=0;i<nu;i++) { const a=j*(nu+1)+i,b=a+1,c=a+nu+1,e=c+1; m.indices.push(a,b,c, b,e,c); }
    return this.computeNormals(m);
  }
  cylinder(rTop, rBot, h, seg) {
    rTop=rTop===undefined?0.5:rTop; rBot=rBot===undefined?0.5:rBot; h=h||2; seg=clamp(seg||20,3,96);
    const m=emptyMesh('cylinder');
    for (let i=0;i<=seg;i++){ const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
      m.positions.push(c*rTop,h/2,s*rTop, c*rBot,-h/2,s*rBot); m.uvs.push(i/seg,1, i/seg,0); }
    for (let i=0;i<seg;i++){ const a=i*2; m.indices.push(a,a+2,a+1, a+1,a+2,a+3); }
    // caps
    const cb=m.positions.length/3; m.positions.push(0,h/2,0); m.uvs.push(0.5,0.5);
    for (let i=0;i<=seg;i++){ const a=i/seg*Math.PI*2; m.positions.push(Math.cos(a)*rTop,h/2,Math.sin(a)*rTop); m.uvs.push(0.5+Math.cos(a)/2,0.5+Math.sin(a)/2); }
    for (let i=0;i<seg;i++) m.indices.push(cb,cb+1+i+1,cb+1+i);
    const cb2=m.positions.length/3; m.positions.push(0,-h/2,0); m.uvs.push(0.5,0.5);
    for (let i=0;i<=seg;i++){ const a=i/seg*Math.PI*2; m.positions.push(Math.cos(a)*rBot,-h/2,Math.sin(a)*rBot); m.uvs.push(0.5+Math.cos(a)/2,0.5+Math.sin(a)/2); }
    for (let i=0;i<seg;i++) m.indices.push(cb2,cb2+1+i,cb2+1+i+1);
    return this.computeNormals(m);
  }
  cone(r, h, seg) { const m = this.cylinder(0.001, r===undefined?0.5:r, h||2, seg||20); m.name='cone'; return m; }
  torus(R, r, segU, segV) {
    R=R||1; r=r||0.3; segU=clamp(segU||28,4,128); segV=clamp(segV||14,3,64);
    const m=emptyMesh('torus');
    for (let j=0;j<=segV;j++) for (let i=0;i<=segU;i++){ const u=i/segU*Math.PI*2,v=j/segV*Math.PI*2;
      m.positions.push((R+r*Math.cos(v))*Math.cos(u), r*Math.sin(v), (R+r*Math.cos(v))*Math.sin(u)); m.uvs.push(i/segU,j/segV); }
    for (let j=0;j<segV;j++) for (let i=0;i<segU;i++){ const a=j*(segU+1)+i,b=a+1,c=a+segU+1,e=c+1; m.indices.push(a,b,c,b,e,c); }
    return this.computeNormals(m);
  }
  capsule(r, h, seg) {
    r=r||0.5; h=h||1.5; seg=clamp(seg||16,6,64);
    const top=this.sphere(seg); scaleM(top, r, r/1, r); translate(top,0,h/2,0);
    // keep only upper hemisphere
    const bot=this.sphere(seg); scaleM(bot, r, r, r); translate(bot,0,-h/2,0);
    const mid=this.cylinder(r,r,h,seg);
    const m=mergeMeshes([top,mid,bot],'capsule'); return this.computeNormals(this.autoUV(m));
  }
  tubeAlongCurve(points, radius, radialSeg) {
    radius=radius||0.1; radialSeg=clamp(radialSeg||8,3,32);
    const m=emptyMesh('tube');
    const n=points.length;
    for (let i=0;i<n;i++){
      const p=points[i];
      const q0=points[Math.max(0,i-1)], q1=points[Math.min(n-1,i+1)];
      let tx=q1[0]-q0[0],ty=q1[1]-q0[1],tz=q1[2]-q0[2];
      const tl=Math.hypot(tx,ty,tz)||1; tx/=tl;ty/=tl;tz/=tl;
      let ax=Math.abs(ty)<0.9?[0,1,0]:[1,0,0];
      let nx=ax[1]*tz-ax[2]*ty, ny=ax[2]*tx-ax[0]*tz, nz=ax[0]*ty-ax[1]*tx;
      const nl=Math.hypot(nx,ny,nz)||1; nx/=nl;ny/=nl;nz/=nl;
      const bx=ty*nz-tz*ny, by=tz*nx-tx*nz, bz=tx*ny-ty*nx;
      for(let k=0;k<=radialSeg;k++){ const a=k/radialSeg*Math.PI*2, c=Math.cos(a), s=Math.sin(a);
        m.positions.push(p[0]+(nx*c+bx*s)*radius, p[1]+(ny*c+by*s)*radius, p[2]+(nz*c+bz*s)*radius);
        m.uvs.push(i/(n-1), k/radialSeg); }
    }
    for(let i=0;i<n-1;i++) for(let k=0;k<radialSeg;k++){ const a=i*(radialSeg+1)+k,b=a+1,c=a+radialSeg+1,e=c+1; m.indices.push(a,b,c,b,e,c); }
    return this.computeNormals(m);
  }
  lathe(profile, seg) { // profile: [[r,y],...]
    seg=clamp(seg||24,3,96); const m=emptyMesh('lathe');
    for(let j=0;j<profile.length;j++) for(let i=0;i<=seg;i++){ const a=i/seg*Math.PI*2;
      m.positions.push(profile[j][0]*Math.cos(a), profile[j][1], profile[j][0]*Math.sin(a)); m.uvs.push(i/seg, j/(profile.length-1)); }
    for(let j=0;j<profile.length-1;j++) for(let i=0;i<seg;i++){ const a=j*(seg+1)+i,b=a+1,c=a+seg+1,e=c+1; m.indices.push(a,b,c,b,e,c); }
    return this.computeNormals(m);
  }
  extrusion(shape2D, depth, bevel) { // shape2D: [[x,y]...] closed polygon, fan-triangulated top/bottom + sides
    depth=depth||1; const m=emptyMesh('extrusion'); const n=shape2D.length;
    for(const p of shape2D){ m.positions.push(p[0],p[1],0); m.uvs.push(p[0],p[1]); }
    for(const p of shape2D){ m.positions.push(p[0],p[1],depth); m.uvs.push(p[0],p[1]); }
    for(let i=1;i<n-1;i++) m.indices.push(0,i,i+1);
    for(let i=1;i<n-1;i++) m.indices.push(n,n+i+1,n+i);
    for(let i=0;i<n;i++){ const j=(i+1)%n; m.indices.push(i,n+j,n+i, i,j,n+j); }
    if (bevel) this.smooth(m, 1);
    return this.computeNormals(m);
  }

  // ---------- KITS (parametric assemblies) ----------
  humanoid(opts) {
    opts=opts||{}; const s=opts.scale||1.7; const parts=[];
    const head=this.sphere(18); scaleM(head,0.14*s,0.16*s,0.14*s); translate(head,0,0.86*s,0); head.name='head'; parts.push(head);
    const torso=this.box(0.42*s,0.55*s,0.24*s); translate(torso,0,0.5*s,0); parts.push(torso);
    for (const sd of [-1,1]) {
      const arm=this.capsule(0.06*s,0.5*s,10); xform(arm,(x,y,z)=>[x+sd*0.28*s, y+0.52*s, z]); parts.push(arm);
      const leg=this.capsule(0.08*s,0.6*s,10); xform(leg,(x,y,z)=>[x+sd*0.12*s, y-0.05*s, z]); parts.push(leg);
    }
    const m=mergeMeshes(parts,'humanoid'); m.material=this.pbr({baseColor:opts.color||[0.9,0.72,0.58]});
    return this.computeNormals(this.autoUV(m));
  }
  car(opts) {
    opts=opts||{}; const sport=opts.sport!==false; const parts=[];
    const body=this.box(sport?4.2:4.5, sport?0.55:0.8, 1.9); translate(body,0,0.65,0); parts.push(body);
    const cab=this.box(sport?1.9:2.2, 0.5, 1.6); translate(cab,sport?-0.2:0,1.15,0); parts.push(cab);
    const wg=[[0.75,1.05],[0.65,0.95]];
    for (const [wx,wz] of [[1.35,0.95],[1.35,-0.95],[-1.35,0.95],[-1.35,-0.95]]) {
      const w=this.cylinder(0.38,0.38,0.3,14); xform(w,(x,y,z)=>[z+wx,y+0.38,x+wz]); parts.push(w);
    }
    if (sport) { const sp=this.box(0.5,0.12,1.8); translate(sp,-2.1,1.0,0); parts.push(sp); }
    const m=mergeMeshes(parts,'car'); m.material=this.pbr({baseColor:opts.color||[0.9,0.1,0.12], metallic:0.7, roughness:0.35});
    return this.computeNormals(this.autoUV(m));
  }
  building(opts) {
    opts=opts||{}; const floors=opts.floors||4, w=opts.w||6, d=opts.d||6, fh=3; const parts=[];
    const rnd=mulberry(hashStr('bld'+floors));
    for(let f=0;f<floors;f++){ const b=this.box(w*(1-f*0.02),fh,d*(1-f*0.02)); translate(b,0,f*fh+fh/2,0); parts.push(b); }
    const roof=this.cone(Math.max(w,d)*0.75, 1.5, 4); xform(roof,(x,y,z)=>[x,y+floors*fh+0.75,z+0]); parts.push(roof);
    for(let i=0;i<floors*4;i++){ const win=this.box(0.9,1.1,0.1); translate(win,(rnd()-0.5)*w, 1.5+((i*2.3)%(floors*fh-1)), d/2+0.02); parts.push(win); }
    const m=mergeMeshes(parts,'building'); m.material=this.pbr({baseColor:opts.color||[0.75,0.72,0.68], roughness:0.9});
    return this.computeNormals(this.autoUV(m));
  }
  chair(opts) {
    opts=opts||{}; const wood=opts.color||[0.55,0.36,0.2]; const parts=[];
    const seat=this.box(0.9,0.08,0.9); translate(seat,0,0.45,0); parts.push(seat);
    const back=this.box(0.9,0.9,0.07); translate(back,0,0.9,-0.42); parts.push(back);
    for (const [lx,lz] of [[-0.4,-0.4],[0.4,-0.4],[-0.4,0.4],[0.4,0.4]]) { const l=this.cylinder(0.04,0.05,0.45,8); translate(l,lx,0.22,lz); parts.push(l); }
    const m=mergeMeshes(parts,'chair'); m.material=this.pbr({baseColor:wood, roughness:0.75});
    return this.computeNormals(this.autoUV(m));
  }
  table(opts) {
    opts=opts||{}; const parts=[];
    const top=this.box(1.8,0.09,1.1); translate(top,0,0.75,0); parts.push(top);
    for (const [lx,lz] of [[-0.8,-0.45],[0.8,-0.45],[-0.8,0.45],[0.8,0.45]]) { const l=this.box(0.08,0.75,0.08); translate(l,lx,0.37,lz); parts.push(l); }
    const m=mergeMeshes(parts,'table'); m.material=this.pbr({baseColor:opts.color||[0.5,0.33,0.18], roughness:0.7});
    return this.computeNormals(this.autoUV(m));
  }
  tree(opts) {
    opts=opts||{}; const low=opts.lowPoly; const parts=[];
    const trunk=this.cylinder(0.12,0.2,1.6,low?6:9); translate(trunk,0,0.8,0); parts.push(trunk);
    const layers=low?2:3;
    for(let i=0;i<layers;i++){ const c=this.cone(low?1.1-i*0.25:1.4-i*0.3, low?1.1:1.4, low?7:10); translate(c,0,1.6+i*(low?0.7:0.85),0); parts.push(c); }
    const m=mergeMeshes(parts,'tree');
    // vertex colors: trunk brown, leaves green via y threshold
    const n=m.positions.length/3; m.colors=new Array(n*3);
    for(let i=0;i<n;i++){ const y=m.positions[i*3+1];
      const leaf=y>1.4; const j=fbm2(m.positions[i*3]*2,m.positions[i*3+2]*2,2)*0.08;
      const c=leaf?[0.22+j,0.55+j,0.22]:[0.4,0.26,0.14];
      m.colors[i*3]=clamp(c[0],0,1); m.colors[i*3+1]=clamp(c[1],0,1); m.colors[i*3+2]=clamp(c[2],0,1); }
    m.material=this.pbr({baseColor:[0.25,0.55,0.25], roughness:0.9, vertexColors:true});
    return this.computeNormals(this.autoUV(m));
  }
  rock(opts) {
    opts=opts||{}; const seed=hashStr('rock'+(opts.variant||0)); const rnd=mulberry(seed);
    const m=this.sphere(opts.detail||14);
    for(let i=0;i<m.positions.length;i+=3){
      const x=m.positions[i],y=m.positions[i+1],z=m.positions[i+2];
      const d=1+fbm2(x*1.5+seed%7, (y+z)*1.5, 3)*0.45+(rnd()-0.5)*0.05;
      m.positions[i]*=d; m.positions[i+1]*=d*0.75; m.positions[i+2]*=d;
    }
    m.name='rock'; m.material=this.pbr({baseColor:opts.color||[0.55,0.55,0.58], roughness:0.95});
    return this.computeNormals(this.autoUV(m));
  }
  sword(opts) {
    opts=opts||{}; const parts=[];
    const blade=this.box(0.09,1.0,0.02); translate(blade,0,0.85,0); parts.push(blade);
    const tip=this.cone(0.064,0.22,4); xform(tip,(x,y,z)=>[x,y+1.46,z]); parts.push(tip);
    const guard=this.box(0.32,0.05,0.07); translate(guard,0,0.33,0); parts.push(guard);
    const grip=this.cylinder(0.03,0.035,0.28,8); translate(grip,0,0.17,0); parts.push(grip);
    const pommel=this.sphere(8); scaleM(pommel,0.05,0.05,0.05); translate(pommel,0,0.0,0); parts.push(pommel);
    const m=mergeMeshes(parts,'sword'); m.material=this.pbr({baseColor:[0.8,0.82,0.86], metallic:0.9, roughness:0.3});
    return this.computeNormals(this.autoUV(m));
  }
  creature(opts) { // quadruped: body + head + 4 legs + tail + horns
    opts=opts||{}; const parts=[];
    const body=this.sphere(16); scaleM(body,0.9,0.55,0.45); translate(body,0,0.85,0); parts.push(body);
    const head=this.sphere(12); scaleM(head,0.32,0.3,0.3); translate(head,0.95,1.05,0); parts.push(head);
    for (const [lx,lz] of [[0.55,0.25],[0.55,-0.25],[-0.55,0.25],[-0.55,-0.25]]) { const l=this.cylinder(0.09,0.07,0.7,8); translate(l,lx,0.35,lz); parts.push(l); }
    const pts=[[-0.85,0.9,0],[-1.2,1.0,0.1],[-1.5,1.25,0]]; parts.push(this.tubeAlongCurve(pts,0.06,6));
    for (const s of [-1,1]) { const h=this.cone(0.06,0.3,6); xform(h,(x,y,z)=>[x+0.95,y+1.35,z+s*0.15]); parts.push(h); }
    const m=mergeMeshes(parts,'creature'); m.material=this.pbr({baseColor:opts.color||[0.45,0.3,0.5], roughness:0.8});
    return this.computeNormals(this.autoUV(m));
  }

  // ---------- MODIFIERS ----------
  computeNormals(m) {
    const n=m.positions.length/3; m.normals=new Array(n*3).fill(0);
    for(let i=0;i<m.indices.length;i+=3){
      const a=m.indices[i]*3,b=m.indices[i+1]*3,c=m.indices[i+2]*3;
      const ax=m.positions[a],ay=m.positions[a+1],az=m.positions[a+2];
      const ux=m.positions[b]-ax,uy=m.positions[b+1]-ay,uz=m.positions[b+2]-az;
      const vx=m.positions[c]-ax,vy=m.positions[c+1]-ay,vz=m.positions[c+2]-az;
      let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      m.normals[a]+=nx;m.normals[a+1]+=ny;m.normals[a+2]+=nz;
      m.normals[b]+=nx;m.normals[b+1]+=ny;m.normals[b+2]+=nz;
      m.normals[c]+=nx;m.normals[c+1]+=ny;m.normals[c+2]+=nz;
    }
    for(let i=0;i<n;i++){ const x=m.normals[i*3],y=m.normals[i*3+1],z=m.normals[i*3+2];
      const l=Math.hypot(x,y,z)||1; m.normals[i*3]=x/l;m.normals[i*3+1]=y/l;m.normals[i*3+2]=z/l; }
    return m;
  }
  autoUV(m) {
    const n=m.positions.length/3;
    if (!m.uvs || m.uvs.length !== n*2) {
      m.uvs=new Array(n*2);
      let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
      for(let i=0;i<n;i++){ const x=m.positions[i*3],y=m.positions[i*3+1]; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y; }
      const dx=(maxX-minX)||1, dy=(maxY-minY)||1;
      for(let i=0;i<n;i++){ m.uvs[i*2]=(m.positions[i*3]-minX)/dx; m.uvs[i*2+1]=(m.positions[i*3+1]-minY)/dy; }
    }
    return m;
  }
  subdivide(m, iters) { // midpoint subdivision (4x tris per iter)
    iters=iters||1;
    for(let k=0;k<iters;k++){
      const pos=m.positions.slice(); const idx=m.indices; const mid=new Map(); const np=pos.slice(); const ni=[];
      const nv=pos.length/3;
      function midpoint(a,b){ const key=a<b?a+'_'+b:b+'_'+a; let id=mid.get(key);
        if(id===undefined){ id=np.length/3;
          np.push((pos[a*3]+pos[b*3])/2,(pos[a*3+1]+pos[b*3+1])/2,(pos[a*3+2]+pos[b*3+2])/2);
          if(m.uvs&&m.uvs.length){ if(!m._nuv)m._nuv=m.uvs.slice(); m._nuv.push((m.uvs[a*2]+m.uvs[b*2])/2,(m.uvs[a*2+1]+m.uvs[b*2+1])/2); }
          mid.set(key,id); }
        return id; }
      for(let i=0;i<idx.length;i+=3){ const a=idx[i],b=idx[i+1],c=idx[i+2];
        const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
        ni.push(a,ab,ca, b,bc,ab, c,ca,bc, ab,bc,ca); }
      m.positions=np; m.indices=ni;
      if(m._nuv){ m.uvs=m._nuv; delete m._nuv; } else this.autoUV(m);
    }
    return this.computeNormals(m);
  }
  smooth(m, iters) { // laplacian relax toward neighbor average
    iters=iters||1;
    for(let k=0;k<iters;k++){
      const adj=new Map();
      for(let i=0;i<m.indices.length;i+=3){ const t=[m.indices[i],m.indices[i+1],m.indices[i+2]];
        for(let e=0;e<3;e++){ const a=t[e],b=t[(e+1)%3];
          if(!adj.has(a))adj.set(a,new Set()); if(!adj.has(b))adj.set(b,new Set());
          adj.get(a).add(b); adj.get(b).add(a); } }
      const np=m.positions.slice();
      for(const [vi,nb] of adj){ let sx=0,sy=0,sz=0;
        for(const w of nb){ sx+=m.positions[w*3];sy+=m.positions[w*3+1];sz+=m.positions[w*3+2]; }
        const nlen=nb.size||1;
        np[vi*3]=lerp(m.positions[vi*3],sx/nlen,0.5); np[vi*3+1]=lerp(m.positions[vi*3+1],sy/nlen,0.5); np[vi*3+2]=lerp(m.positions[vi*3+2],sz/nlen,0.5); }
      m.positions=np;
    }
    return this.computeNormals(m);
  }
  decimate(m, targetPoly) { // stride-based triangle drop (fast, keeps every k-th tri), then weld
    const tris=m.indices.length/3;
    if(!targetPoly || tris<=targetPoly) return m;
    const keep=Math.max(1, Math.floor(tris/targetPoly));
    const ni=[];
    for(let t=0;t<tris;t+=keep){ ni.push(m.indices[t*3],m.indices[t*3+1],m.indices[t*3+2]); }
    m.indices=ni; return this.weld(this.computeNormals(m));
  }
  quantize(m, bits) {
    bits=bits||14; const s=(1<<bits)-1;
    let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
    for(let i=0;i<m.positions.length;i+=3){ const x=m.positions[i],y=m.positions[i+1],z=m.positions[i+2];
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z; }
    const dx=(maxX-minX)||1,dy=(maxY-minY)||1,dz=(maxZ-minZ)||1;
    for(let i=0;i<m.positions.length;i+=3){
      m.positions[i]=minX+Math.round((m.positions[i]-minX)/dx*s)/s*dx;
      m.positions[i+1]=minY+Math.round((m.positions[i+1]-minY)/dy*s)/s*dy;
      m.positions[i+2]=minZ+Math.round((m.positions[i+2]-minZ)/dz*s)/s*dz; }
    return m;
  }
  weld(m, tol) {
    tol=tol||1e-4; const map=new Map(); const oldN=m.positions.length/3;
    const np=[],nuv=m.uvs&&m.uvs.length?[]:null,nc=m.colors&&m.colors.length?[]:null;
    const remap=new Array(oldN); let count=0;
    for(let i=0;i<oldN;i++){ const key=Math.round(m.positions[i*3]/tol)+'_'+Math.round(m.positions[i*3+1]/tol)+'_'+Math.round(m.positions[i*3+2]/tol);
      if(map.has(key)){ remap[i]=map.get(key); } else { map.set(key,count); remap[i]=count++;
        np.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);
        if(nuv)nuv.push(m.uvs[i*2],m.uvs[i*2+1]);
        if(nc)nc.push(m.colors[i*3],m.colors[i*3+1],m.colors[i*3+2]); } }
    m.positions=np; if(nuv)m.uvs=nuv; if(nc)m.colors=nc;
    m.indices=m.indices.map(i=>remap[i]);
    return this.computeNormals(m);
  }
  mirror(m, axis) {
    axis=axis||'x'; const out=emptyMesh(m.name+'_mirrored');
    out.positions=m.positions.slice(); out.uvs=(m.uvs||[]).slice(); out.colors=(m.colors||[]).slice();
    const ai=axis==='x'?0:axis==='y'?1:2;
    for(let i=ai;i<out.positions.length;i+=3) out.positions[i]*=-1;
    for(let i=0;i<m.indices.length;i+=3) out.indices.push(m.indices[i],m.indices[i+2],m.indices[i+1]); // flip winding
    out.material=m.material;
    return this.computeNormals(out);
  }
  array(m, count, offset) {
    count=Math.max(1,count||1); offset=offset||[2,0,0]; const parts=[];
    for(let i=0;i<count;i++){ const c={...m,positions:m.positions.slice(),indices:m.indices.slice(),uvs:(m.uvs||[]).slice(),normals:[],colors:(m.colors||[]).slice(),material:m.material};
      translate(c,offset[0]*i,offset[1]*i,offset[2]*i); c.name=m.name; parts.push(c); }
    return mergeMeshes(parts, m.name+'_array');
  }
  scatter(m, count, radius, seed) {
    const rnd=mulberry(seed||hashStr(m.name)); const parts=[];
    for(let i=0;i<(count||5);i++){ const c={...m,positions:m.positions.slice(),indices:m.indices.slice(),uvs:(m.uvs||[]).slice(),normals:[],colors:(m.colors||[]).slice(),material:m.material};
      const a=rnd()*Math.PI*2, r=Math.sqrt(rnd())*(radius||5);
      translate(c,Math.cos(a)*r,0,Math.sin(a)*r); parts.push(c); }
    return this.computeNormals(mergeMeshes(parts, m.name+'_scatter'));
  }

  // ---------- MATERIAL ----------
  pbr(opts) {
    opts=opts||{};
    let base=opts.baseColor||[0.8,0.8,0.8];
    if(typeof base==='string'){ const n=NAMED_COLORS[base.toLowerCase()]; if(n)base=n; }
    return { name:opts.name||'pbr', baseColor:base.slice(0,3),
      metallic:opts.metallic!==undefined?opts.metallic:0.0,
      roughness:opts.roughness!==undefined?opts.roughness:0.8,
      vertexColors:!!opts.vertexColors };
  }
  proceduralPBR(seedStr, opts) { // noise-varied PBR like asset-gen style
    opts=opts||{}; const h=hashStr(String(seedStr)); const rnd=mulberry(h);
    const hue=(h%360);
    const base=opts.baseColor||[clamp(0.3+((h>>3)%50)/100,0,1),clamp(0.3+((h>>9)%40)/100,0,1),clamp(0.3+((h>>15)%40)/100,0,1)];
    void hue; void rnd;
    return { name:'proc_'+h.toString(36), baseColor:base, metallic:opts.metallic!==undefined?opts.metallic:((h>>21)%100)/100*0.6, roughness:opts.roughness!==undefined?opts.roughness:0.4+((h>>27)%50)/100, seed:h };
  }
  vertexColors(m, fn) {
    const n=m.positions.length/3; m.colors=new Array(n*3);
    for(let i=0;i<n;i++){ const c=fn(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2],i);
      m.colors[i*3]=c[0];m.colors[i*3+1]=c[1];m.colors[i*3+2]=c[2]; }
    if(m.material)m.material.vertexColors=true;
    return m;
  }
  bakeTexture(m, w, h) { // procedural PNG data-URL; canvas if present else fallback
    w=w||256; h=h||128;
    const seed=m.material&&m.material.seed||hashStr(m.name);
    try {
      const cv=require('canvas');
      const c=cv.createCanvas(w,h); const g=c.getContext('2d');
      const img=g.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){ const n=fbm2(x/32+seed%13,y/32,3)*0.5+0.5;
        const bc=(m.material&&m.material.baseColor)||[0.8,0.8,0.8];
        const o=(y*w+x)*4; img.data[o]=clamp(bc[0]*(0.7+n*0.6),0,1)*255; img.data[o+1]=clamp(bc[1]*(0.7+n*0.6),0,1)*255; img.data[o+2]=clamp(bc[2]*(0.7+n*0.6),0,1)*255; img.data[o+3]=255; }
      g.putImageData(img,0,0);
      return c.toDataURL('image/png');
    } catch(e) {
      // fallback: tiny procedural descriptor (no canvas dep)
      return 'procedural:fbm:'+seed+':'+w+'x'+h;
    }
  }

  // ---------- EXPORT ----------
  toOBJ(m) {
    let s='# '+m.name+' generated by osien-3d-forge\n';
    const n=m.positions.length/3;
    for(let i=0;i<n;i++) s+='v '+m.positions[i*3].toFixed(5)+' '+m.positions[i*3+1].toFixed(5)+' '+m.positions[i*3+2].toFixed(5)+'\n';
    const hasUV=m.uvs&&m.uvs.length===n*2, hasN=m.normals&&m.normals.length===n*3;
    if(hasUV)for(let i=0;i<n;i++) s+='vt '+m.uvs[i*2].toFixed(5)+' '+m.uvs[i*2+1].toFixed(5)+'\n';
    if(hasN)for(let i=0;i<n;i++) s+='vn '+m.normals[i*3].toFixed(5)+' '+m.normals[i*3+1].toFixed(5)+' '+m.normals[i*3+2].toFixed(5)+'\n';
    for(let i=0;i<m.indices.length;i+=3){ const a=m.indices[i]+1,b=m.indices[i+1]+1,c=m.indices[i+2]+1;
      s+='f '+a+'/'+(hasUV?a:'')+'/'+(hasN?a:'')+' '+b+'/'+(hasUV?b:'')+'/'+(hasN?b:'')+' '+c+'/'+(hasUV?c:'')+'/'+(hasN?c:'')+'\n'; }
    return s;
  }
  toSTL(m, ascii) {
    if(ascii){
      let s='solid '+m.name+'\n';
      for(let i=0;i<m.indices.length;i+=3){
        const a=m.indices[i]*3,b=m.indices[i+1]*3,c=m.indices[i+2]*3;
        const ux=m.positions[b]-m.positions[a],uy=m.positions[b+1]-m.positions[a+1],uz=m.positions[b+2]-m.positions[a+2];
        const vx=m.positions[c]-m.positions[a],vy=m.positions[c+1]-m.positions[a+1],vz=m.positions[c+2]-m.positions[a+2];
        let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx; const l=Math.hypot(nx,ny,nz)||1; nx/=l;ny/=l;nz/=l;
        s+=' facet normal '+nx.toFixed(5)+' '+ny.toFixed(5)+' '+nz.toFixed(5)+'\n  outer loop\n';
        for(const v of [a,b,c]) s+='   vertex '+m.positions[v].toFixed(5)+' '+m.positions[v+1].toFixed(5)+' '+m.positions[v+2].toFixed(5)+'\n';
        s+='  endloop\n endfacet\n';
      }
      return s+'endsolid '+m.name+'\n';
    }
    const tris=m.indices.length/3; const buf=Buffer.alloc(84+tris*50);
    buf.write(m.name.slice(0,79),0); buf.writeUInt32LE(tris,80);
    let o=84;
    // ensure normals
    if(!m.normals||!m.normals.length) this.computeNormals(m);
    for(let i=0;i<m.indices.length;i+=3){
      const ia=m.indices[i],ib=m.indices[i+1],ic=m.indices[i+2];
      buf.writeFloatLE(m.normals[ia*3],o);buf.writeFloatLE(m.normals[ia*3+1],o+4);buf.writeFloatLE(m.normals[ia*3+2],o+8); o+=12;
      for(const vi of [ia,ib,ic]){ buf.writeFloatLE(m.positions[vi*3],o);buf.writeFloatLE(m.positions[vi*3+1],o+4);buf.writeFloatLE(m.positions[vi*3+2],o+8); o+=12; }
      buf.writeUInt16LE(0,o); o+=2;
    }
    return buf;
  }
  toGLTF(m) {
    const posBuf=Buffer.from(Float32Array.from(m.positions).buffer);
    const idx=Math.max(...m.indices) > 65535;
    const idxArr=idx?Uint32Array.from(m.indices):Uint16Array.from(m.indices);
    const idxBuf=Buffer.from(idxArr.buffer);
    const nrmBuf=Buffer.from(Float32Array.from(m.normals&&m.normals.length?m.normals:new Array(m.positions.length).fill(0)).buffer);
    const uvArr=(m.uvs&&m.uvs.length)?m.uvs:new Array(m.positions.length/3*2).fill(0);
    const uvBuf=Buffer.from(Float32Array.from(uvArr).buffer);
    const all=Buffer.concat([posBuf,idxBuf,nrmBuf,uvBuf]);
    const b64=all.toString('base64');
    const nv=m.positions.length/3;
    const mat=m.material||{baseColor:[0.8,0.8,0.8],metallic:0,roughness:0.8};
    let off=0;
    const bP=off; off+=posBuf.length; const bI=off; off+=idxBuf.length; const bN=off; off+=nrmBuf.length; const bU=off;
    const js={ asset:{version:'2.0',generator:'osien-3d-forge'},
      scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0,name:m.name}], meshes:[{name:m.name,primitives:[{attributes:{POSITION:0,NORMAL:2,TEXCOORD_0:3},indices:1,material:0}]}],
      materials:[{name:'mat',pbrMetallicRoughness:{baseColorFactor:[mat.baseColor[0],mat.baseColor[1],mat.baseColor[2],1],metallicFactor:mat.metallic||0,roughnessFactor:mat.roughness===undefined?0.8:mat.roughness}}],
      accessors:[{bufferView:0,componentType:5126,count:nv,type:'VEC3',max:[1,1,1],min:[-1,-1,-1]},
        {bufferView:1,componentType:idx?5125:5123,count:m.indices.length,type:'SCALAR'},
        {bufferView:2,componentType:5126,count:nv,type:'VEC3'},
        {bufferView:3,componentType:5126,count:nv,type:'VEC2'}],
      bufferViews:[{buffer:0,byteOffset:bP,byteLength:posBuf.length},{buffer:0,byteOffset:bI,byteLength:idxBuf.length},{buffer:0,byteOffset:bN,byteLength:nrmBuf.length},{buffer:0,byteOffset:bU,byteLength:uvBuf.length}],
      buffers:[{byteLength:all.length,uri:'data:application/octet-stream;base64,'+b64}] };
    return JSON.stringify(js);
  }
  toGLB(m) {
    const gltf=JSON.parse(this.toGLTF(m));
    const bin=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');
    delete gltf.buffers[0].uri; gltf.buffers[0].byteLength=bin.length;
    const js=Buffer.from(JSON.stringify(gltf));
    const jsPad=(4-(js.length%4))%4, binPad=(4-(bin.length%4))%4;
    const total=12+8+js.length+jsPad+8+bin.length+binPad;
    const out=Buffer.alloc(total);
    out.writeUInt32LE(0x46546C67,0); out.writeUInt32LE(2,4); out.writeUInt32LE(total,8);
    out.writeUInt32LE(js.length+jsPad,12); out.writeUInt32LE(0x4E4F534A,16); js.copy(out,20); out.fill(0x20,20+js.length,20+js.length+jsPad);
    const bo=20+js.length+jsPad; out.writeUInt32LE(bin.length+binPad,bo); out.writeUInt32LE(0x004E4942,bo+4); bin.copy(out,bo+8); out.fill(0,bo+8+bin.length,bo+8+bin.length+binPad);
    return out;
  }
  save(m, filePath) {
    const fs=require('fs'), path=require('path');
    const ext=path.extname(filePath).toLowerCase();
    fs.mkdirSync(path.dirname(filePath),{recursive:true});
    if(ext==='.obj') fs.writeFileSync(filePath,this.toOBJ(m));
    else if(ext==='.stl') { const b=this.toSTL(m,false); fs.writeFileSync(filePath,b); }
    else if(ext==='.gltf') fs.writeFileSync(filePath,this.toGLTF(m));
    else if(ext==='.glb') fs.writeFileSync(filePath,this.toGLB(m));
    else throw new Error('unknown format '+ext+' (use .obj/.stl/.gltf/.glb)');
    return filePath;
  }

  // ---------- FAST PATH ----------
  parsePrompt(prompt) {
    const p=String(prompt||'').toLowerCase();
    const color=Object.keys(NAMED_COLORS).find(k=>p.includes(k));
    const poly=p.includes('low poly')||p.includes('low-poly')?'low':(p.includes('high')||p.includes('ultra')||p.includes('detailed')?'high':'med');
    let kind='box';
    if(/car|vehicle|sports|truck|racer/.test(p))kind='car';
    else if(/human|character|man|woman|person|humanoid|avatar|robot/.test(p))kind='humanoid';
    else if(/house|building|tower|castle|hut|skyscraper/.test(p))kind='building';
    else if(/chair/.test(p))kind='chair';
    else if(/table|desk/.test(p))kind='table';
    else if(/tree|pine|oak/.test(p))kind='tree';
    else if(/rock|stone|boulder/.test(p))kind='rock';
    else if(/sword|blade|knife|weapon|dagger|katana/.test(p))kind='sword';
    else if(/creature|monster|dragon|animal|beast|dog|cat|quadruped/.test(p))kind='creature';
    else if(/torus|donut|ring/.test(p))kind='torus';
    else if(/sphere|ball|planet|orb/.test(p))kind='sphere';
    else if(/cylinder|pillar|column|tube|pipe/.test(p))kind='cylinder';
    else if(/cone/.test(p))kind='cone';
    else if(/capsule|pill/.test(p))kind='capsule';
    else if(/plane|floor|ground/.test(p))kind='plane';
    else if(/box|cube|crate/.test(p))kind='box';
    return { kind, color:color?NAMED_COLORS[color]:null, colorName:color||null, poly, sport:/sport|race|fast/.test(p) };
  }
  quick(prompt, opts) {
    const t0=Date.now(); opts=opts||{};
    const q=this.parsePrompt(prompt);
    const col=q.color||(opts.color)||[0.75,0.75,0.78];
    let m;
    const det=q.poly==='low'?8:(q.poly==='high'?32:18);
    switch(q.kind){
      case 'car': m=this.car({color:col,sport:q.sport||/car/.test(String(prompt).toLowerCase())}); break;
      case 'humanoid': m=this.humanoid({color:q.colorName==='red'?col:[0.9,0.72,0.58]}); break;
      case 'building': m=this.building({color:col,floors:q.poly==='low'?2:4}); break;
      case 'chair': m=this.chair({color:col}); break;
      case 'table': m=this.table({color:col}); break;
      case 'tree': m=this.tree({lowPoly:q.poly!=='high'}); break;
      case 'rock': m=this.rock({detail:det,color:col}); break;
      case 'sword': m=this.sword(); break;
      case 'creature': m=this.creature({color:col}); break;
      case 'sphere': m=this.sphere(det); break;
      case 'cylinder': m=this.cylinder(0.5,0.5,2,det); break;
      case 'cone': m=this.cone(0.5,2,det); break;
      case 'torus': m=this.torus(1,0.3,det+10,det); break;
      case 'capsule': m=this.capsule(0.5,1.5,det); break;
      case 'plane': m=this.plane(4,4,4); break;
      default: m=this.box(1,1,1);
    }
    m.name=q.kind+'_'+(q.colorName||'default');
    if(!m.material)m.material=this.pbr({baseColor:col});
    else if(q.color&&q.kind!=='tree'){ m.material.baseColor=col; }
    // poly budget
    const budget=opts.polyBudget||(q.poly==='low'?2500:(q.poly==='high'?60000:10000));
    const tris=m.indices.length/3;
    if(tris>budget) this.decimate(m,budget);
    const dt=Date.now()-t0;
    return { mesh:m, stats:{ verts:m.positions.length/3, tris:m.indices.length/3, timeMs:dt, polyLevel:q.poly, kind:q.kind, color:q.colorName||'default' } };
  }
  batch(specs) { // specs: array of prompt strings or {prompt, opts}
    return (specs||[]).map(s=>{
      if(typeof s==='string') return this.quick(s);
      return this.quick(s.prompt||s.kind||'box', s.opts||{});
    });
  }
  lod(m, levels) {
    levels=levels||3; const out=[m]; const base=m.indices.length/3;
    for(let i=1;i<levels;i++){ const c={name:m.name+'_lod'+i,positions:m.positions.slice(),indices:m.indices.slice(),normals:(m.normals||[]).slice(),uvs:(m.uvs||[]).slice(),colors:(m.colors||[]).slice(),material:m.material};
      this.decimate(c, Math.max(12,Math.floor(base/Math.pow(4,i)))); c.name=m.name+'_lod'+i; out.push(c); }
    return out;
  }
}

module.exports = { UltraForge, NAMED_COLORS, clamp, lerp, noise2, fbm2, mergeMeshes, translate, scaleM };
/* =====================================================================
 * UltraForge V2 — BEST-MODELS-EVER quality core (stdlib only, <300ms).
 * Appended without touching V1 API: quick/save/lod/batch keep working.
 * Adds: Catmull-Clark, Taubin, clean topology, angle-weighted normals,
 * hard-edge split, tangents, pro auto-UV atlas, PBR ULTRA, sculpt pass,
 * QEM-lite decimate, 4-level LOD, rigs, quality presets, prompt parser v2.
 * ===================================================================== */

const QUALITY_PRESETS = {
  draft:  { subdiv: 0, smooth: 0, sculpt: false, ao: true,  budget: 4000,  watertight: false },
  game:   { subdiv: 0, smooth: 1, sculpt: false, ao: true,  budget: 12000, watertight: false },
  cinema: { subdiv: 2, smooth: 2, sculpt: true,  ao: true,  budget: 60000, watertight: false },
  print:  { subdiv: 1, smooth: 1, sculpt: false, ao: false, budget: 30000, watertight: true },
};

const MATERIAL_PRESETS = {
  gold:    { baseColor: [1.0, 0.72, 0.18], metallic: 1.0,  roughness: 0.28 },
  silver:  { baseColor: [0.82, 0.84, 0.87], metallic: 0.95, roughness: 0.32 },
  chrome:  { baseColor: [0.88, 0.90, 0.93], metallic: 1.0,  roughness: 0.12 },
  steel:   { baseColor: [0.52, 0.55, 0.60], metallic: 0.9,  roughness: 0.42 },
  iron:    { baseColor: [0.32, 0.32, 0.35], metallic: 0.85, roughness: 0.55 },
  copper:  { baseColor: [0.85, 0.45, 0.22], metallic: 1.0,  roughness: 0.32 },
  bronze:  { baseColor: [0.65, 0.42, 0.20], metallic: 1.0,  roughness: 0.38 },
  brass:   { baseColor: [0.80, 0.62, 0.25], metallic: 1.0,  roughness: 0.30 },
  wood:    { baseColor: [0.55, 0.36, 0.20], metallic: 0.0,  roughness: 0.72 },
  rust:    { baseColor: [0.48, 0.24, 0.10], metallic: 0.25, roughness: 0.92 },
  marble:  { baseColor: [0.90, 0.89, 0.86], metallic: 0.0,  roughness: 0.25 },
  stone:   { baseColor: [0.60, 0.60, 0.62], metallic: 0.0,  roughness: 0.95 },
  leather: { baseColor: [0.42, 0.25, 0.13], metallic: 0.0,  roughness: 0.85 },
  crystal: { baseColor: [0.55, 0.75, 1.00], metallic: 0.1,  roughness: 0.12 },
  glass:   { baseColor: [0.75, 0.88, 0.95], metallic: 0.0,  roughness: 0.08 },
  obsidian:{ baseColor: [0.08, 0.07, 0.10], metallic: 0.4,  roughness: 0.20 },
  bone:    { baseColor: [0.88, 0.83, 0.70], metallic: 0.0,  roughness: 0.60 },
  fabric:  { baseColor: [0.55, 0.25, 0.30], metallic: 0.0,  roughness: 0.95 },
};
const MATERIAL_ALIASES = { golden: 'gold', wooden: 'wood', oak: 'wood', pine: 'wood', metallic: 'steel', marblelike: 'marble', rocky: 'stone', stony: 'stone', rusty: 'rust', rusted: 'rust', chromed: 'chrome' };

// ---------- small v2 helpers ----------
UltraForge.prototype.rotate = function (m, rx, ry, rz) { // euler degrees
  rx = (rx || 0) * Math.PI / 180; ry = (ry || 0) * Math.PI / 180; rz = (rz || 0) * Math.PI / 180;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  for (let i = 0; i < m.positions.length; i += 3) {
    let x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2];
    let y1 = y * cx - z * sx, z1 = y * sx + z * cx; y = y1; z = z1;
    let x1 = x * cy + z * sy, z2 = -x * sy + z * cy; x = x1; z = z2;
    let x2 = x * cz - y * sz, y2 = x * sz + y * cz; x = x2; y = y2;
    m.positions[i] = x; m.positions[i + 1] = y; m.positions[i + 2] = z;
  }
  return this.computeNormals(m);
};
UltraForge.prototype.paint = function (m, rgb) {
  const n = m.positions.length / 3; m.colors = new Array(n * 3);
  for (let i = 0; i < n; i++) { m.colors[i * 3] = rgb[0]; m.colors[i * 3 + 1] = rgb[1]; m.colors[i * 3 + 2] = rgb[2]; }
  if (m.material) m.material.vertexColors = true;
  return m;
};
UltraForge.prototype._kitFinish = function (m, mat) { // weld + uv + normals, shared by all v2 kits
  if (mat) m.material = mat;
  this.weld(m, 1e-4); this.autoUV(m); this.computeNormals(m);
  return m;
};
function _v2adj(m) { // unique-neighbor adjacency (cached by topology key)
  const n = m.positions.length / 3, key = m.indices.length + ':' + n;
  if (m._adjCache && m._adjCache.key === key && m._adjCache.adj.length === n) return m._adjCache.adj;
  const adj = new Array(n);
  for (let i = 0; i < n; i++) adj[i] = new Set();
  for (let i = 0; i < m.indices.length; i += 3) {
    const t = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
    if (t[0] < 0 || t[1] < 0 || t[2] < 0 || t[0] >= n || t[1] >= n || t[2] >= n) continue; // skip corrupt refs
    for (let e = 0; e < 3; e++) { adj[t[e]].add(t[(e + 1) % 3]); adj[t[(e + 1) % 3]].add(t[e]); }
  }
  m._adjCache = { key: key, adj: adj };
  return adj;
}
function _v2bbox(m) {
  let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = m.positions[i + k]; if (v < a[k]) a[k] = v; if (v > b[k]) b[k] = v; }
  }
  return { min: a, max: b, size: [b[0] - a[0] || 1, b[1] - a[1] || 1, b[2] - a[2] || 1] };
}

// ---------- subdivision + smoothing ----------
UltraForge.prototype.catmullClark = function (m, iters) { // CC-approx for tri meshes: mid-subdiv + vertex-point relax
  iters = (iters === undefined) ? 2 : iters;
  for (let k = 0; k < iters; k++) {
    const P = m.positions, IDX = m.indices, n = P.length / 3;
    const adj = _v2adj(m);
    const mid = new Map(), NP = Array.prototype.slice.call(P), ni = [];
    const uvA = (m.uvs && m.uvs.length === n * 2) ? Array.prototype.slice.call(m.uvs) : null;
    const colA = (m.colors && m.colors.length === n * 3) ? Array.prototype.slice.call(m.colors) : null;
    function midpoint(a, b) {
      const key = a < b ? a + '_' + b : b + '_' + a; let id = mid.get(key);
      if (id === undefined) {
        id = NP.length / 3;
        NP.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
        if (uvA) uvA.push((m.uvs[a * 2] + m.uvs[b * 2]) / 2, (m.uvs[a * 2 + 1] + m.uvs[b * 2 + 1]) / 2);
        if (colA) colA.push((m.colors[a * 3] + m.colors[b * 3]) / 2, (m.colors[a * 3 + 1] + m.colors[b * 3 + 1]) / 2, (m.colors[a * 3 + 2] + m.colors[b * 3 + 2]) / 2);
        mid.set(key, id);
      }
      return id;
    }
    for (let i = 0; i < IDX.length; i += 3) {
      const a = IDX[i], b = IDX[i + 1], c = IDX[i + 2];
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      ni.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    for (let i = 0; i < n; i++) { // vertex-point relax toward neighbor centroid (beta=0.25)
      const nb = adj[i]; if (!nb.size) continue;
      let sx = 0, sy = 0, sz = 0;
      nb.forEach(function (w) { sx += P[w * 3]; sy += P[w * 3 + 1]; sz += P[w * 3 + 2]; });
      const s = nb.size, beta = 0.25;
      NP[i * 3] = P[i * 3] * (1 - beta) + (sx / s) * beta;
      NP[i * 3 + 1] = P[i * 3 + 1] * (1 - beta) + (sy / s) * beta;
      NP[i * 3 + 2] = P[i * 3 + 2] * (1 - beta) + (sz / s) * beta;
    }
    m.positions = NP; m.indices = ni; if (uvA) m.uvs = uvA; if (colA) m.colors = colA;
  }
  return this.computeAngleWeightedNormals(m);
};
UltraForge.prototype._lapPass = function (m, factor) {
  const adj = _v2adj(m), NP = m.positions.slice();
  adj.forEach(function (nb, vi) {
    if (!nb.size) return;
    let sx = 0, sy = 0, sz = 0;
    nb.forEach(function (w) { sx += m.positions[w * 3]; sy += m.positions[w * 3 + 1]; sz += m.positions[w * 3 + 2]; });
    const s = nb.size;
    NP[vi * 3] = lerp(m.positions[vi * 3], sx / s, factor);
    NP[vi * 3 + 1] = lerp(m.positions[vi * 3 + 1], sy / s, factor);
    NP[vi * 3 + 2] = lerp(m.positions[vi * 3 + 2], sz / s, factor);
  });
  m.positions = NP; return m;
};
UltraForge.prototype.taubin = function (m, iters, lambda, mu) { // shrink-free smoothing
  iters = iters || 1; lambda = lambda === undefined ? 0.5 : lambda; mu = mu === undefined ? -0.53 : mu;
  for (let k = 0; k < iters; k++) { this._lapPass(m, lambda); this._lapPass(m, mu); }
  return this.computeNormals(m);
};
UltraForge.prototype.bevelEdges = function (m, amt) { // fake micro-bevel: light relax + pro normals (no razor-sharp CG)
  amt = amt === undefined ? 0.15 : amt;
  if (m.indices.length / 3 > 40000) return this.computeAngleWeightedNormals(m);
  this._lapPass(m, amt);
  return this.computeAngleWeightedNormals(m);
};

// ---------- clean topology ----------
UltraForge.prototype.removeDegenerate = function (m) {
  const n = m.positions.length / 3, ni = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i], b = m.indices[i + 1], c = m.indices[i + 2];
    if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) continue; // out-of-range guard
    if (a === b || b === c || a === c) continue;
    const ax = m.positions[a * 3], ay = m.positions[a * 3 + 1], az = m.positions[a * 3 + 2];
    const ux = m.positions[b * 3] - ax, uy = m.positions[b * 3 + 1] - ay, uz = m.positions[b * 3 + 2] - az;
    const vx = m.positions[c * 3] - ax, vy = m.positions[c * 3 + 1] - ay, vz = m.positions[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if ((nx * nx + ny * ny + nz * nz) < 1e-14) continue;
    ni.push(a, b, c);
  }
  m.indices = ni; return m;
};
UltraForge.prototype.fixWinding = function (m) { // flip inward-facing tris (manifold consistency)
  const n = m.positions.length / 3; if (!n || !m.indices.length) return m;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += m.positions[i * 3]; cy += m.positions[i * 3 + 1]; cz += m.positions[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    const ux = m.positions[b] - m.positions[a], uy = m.positions[b + 1] - m.positions[a + 1], uz = m.positions[b + 2] - m.positions[a + 2];
    const vx = m.positions[c] - m.positions[a], vy = m.positions[c + 1] - m.positions[a + 1], vz = m.positions[c + 2] - m.positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (m.positions[a] + m.positions[b] + m.positions[c]) / 3 - cx;
    const my = (m.positions[a + 1] + m.positions[b + 1] + m.positions[c + 1]) / 3 - cy;
    const mz = (m.positions[a + 2] + m.positions[b + 2] + m.positions[c + 2]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) { const t = m.indices[i + 1]; m.indices[i + 1] = m.indices[i + 2]; m.indices[i + 2] = t; }
  }
  return this.computeNormals(m);
};
UltraForge.prototype.cleanTopology = function (m, tol) {
  this.weld(m, tol || 1e-4);
  this.removeDegenerate(m);
  this.fixWinding(m);
  return this.computeAngleWeightedNormals(m);
};

// ---------- best-in-class normals / tangents ----------
UltraForge.prototype.computeAngleWeightedNormals = function (m) {
  const n = m.positions.length / 3; m.normals = new Array(n * 3).fill(0);
  for (let i = 0; i < m.indices.length; i += 3) {
    const ia = m.indices[i], ib = m.indices[i + 1], ic = m.indices[i + 2];
    const a = ia * 3, b = ib * 3, c = ic * 3;
    const ux = m.positions[b] - m.positions[a], uy = m.positions[b + 1] - m.positions[a + 1], uz = m.positions[b + 2] - m.positions[a + 2];
    const vx = m.positions[c] - m.positions[a], vy = m.positions[c + 1] - m.positions[a + 1], vz = m.positions[c + 2] - m.positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const lu = Math.hypot(ux, uy, uz) || 1, lv = Math.hypot(vx, vy, vz) || 1;
    let angA = Math.acos(clamp((ux * vx + uy * vy + uz * vz) / (lu * lv), -1, 1));
    const e1x = m.positions[a] - m.positions[b], e1y = m.positions[a + 1] - m.positions[b + 1], e1z = m.positions[a + 2] - m.positions[b + 2];
    const e2x = m.positions[c] - m.positions[b], e2y = m.positions[c + 1] - m.positions[b + 1], e2z = m.positions[c + 2] - m.positions[b + 2];
    const l1 = Math.hypot(e1x, e1y, e1z) || 1, l2 = Math.hypot(e2x, e2y, e2z) || 1;
    let angB = Math.acos(clamp((e1x * e2x + e1y * e2y + e1z * e2z) / (l1 * l2), -1, 1));
    const angC = Math.PI - angA - angB;
    m.normals[a] += nx * angA; m.normals[a + 1] += ny * angA; m.normals[a + 2] += nz * angA;
    m.normals[b] += nx * angB; m.normals[b + 1] += ny * angB; m.normals[b + 2] += nz * angB;
    m.normals[c] += nx * angC; m.normals[c + 1] += ny * angC; m.normals[c + 2] += nz * angC;
  }
  for (let i = 0; i < n; i++) {
    const x = m.normals[i * 3], y = m.normals[i * 3 + 1], z = m.normals[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    m.normals[i * 3] = x / l; m.normals[i * 3 + 1] = y / l; m.normals[i * 3 + 2] = z / l;
  }
  return m;
};
UltraForge.prototype.splitHardEdges = function (m, creaseDeg) { // duplicate verts across >crease dihedral (default 30°)
  creaseDeg = creaseDeg === undefined ? 30 : creaseDeg;
  const cosC = Math.cos(creaseDeg * Math.PI / 180);
  const n = m.positions.length / 3, nt = m.indices.length / 3;
  if (!nt) return m;
  const FN = new Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = m.indices[t * 3] * 3, b = m.indices[t * 3 + 1] * 3, c = m.indices[t * 3 + 2] * 3;
    const ux = m.positions[b] - m.positions[a], uy = m.positions[b + 1] - m.positions[a + 1], uz = m.positions[b + 2] - m.positions[a + 2];
    const vx = m.positions[c] - m.positions[a], vy = m.positions[c + 1] - m.positions[a + 1], vz = m.positions[c + 2] - m.positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    FN[t * 3] = nx / l; FN[t * 3 + 1] = ny / l; FN[t * 3 + 2] = nz / l;
  }
  const inc = new Array(n); for (let i = 0; i < n; i++) inc[i] = [];
  for (let t = 0; t < nt; t++) { inc[m.indices[t * 3]].push(t); inc[m.indices[t * 3 + 1]].push(t); inc[m.indices[t * 3 + 2]].push(t); }
  const hasUV = m.uvs && m.uvs.length === n * 2, hasC = m.colors && m.colors.length === n * 3;
  const NP = [], NUV = hasUV ? [] : null, NCL = hasC ? [] : null;
  const NI = new Array(m.indices.length);
  function pushVert(v) {
    const id = NP.length / 3;
    NP.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    if (hasUV) NUV.push(m.uvs[v * 2], m.uvs[v * 2 + 1]);
    if (hasC) NCL.push(m.colors[v * 3], m.colors[v * 3 + 1], m.colors[v * 3 + 2]);
    return id;
  }
  for (let v = 0; v < n; v++) {
    const faces = inc[v]; if (!faces.length) continue;
    const gs = []; // arrays of face ids
    const gOf = {};
    faces.forEach(function (f) {
      let placed = -1;
      for (let g = 0; g < gs.length; g++) {
        const f0 = gs[g][0];
        const d = FN[f * 3] * FN[f0 * 3] + FN[f * 3 + 1] * FN[f0 * 3 + 1] + FN[f * 3 + 2] * FN[f0 * 3 + 2];
        if (d > cosC) { placed = g; break; }
      }
      if (placed < 0) { placed = gs.length; gs.push([]); }
      gOf[f] = placed; gs[placed].push(f);
    });
    const ids = gs.map(function () { return pushVert(v); });
    faces.forEach(function (f) {
      const gi = gOf[f], base3 = f * 3;
      for (let c = 0; c < 3; c++) {
        if (m.indices[base3 + c] === v) NI[base3 + c] = ids[gi];
      }
    });
  }
  m.positions = NP; m.indices = NI; if (hasUV) m.uvs = NUV; if (hasC) m.colors = NCL;
  return this.computeAngleWeightedNormals(m);
};
UltraForge.prototype.computeTangents = function (m) { // for normal maps (needs UVs)
  const n = m.positions.length / 3;
  if (!m.uvs || m.uvs.length !== n * 2) this.autoUV(m);
  m.tangents = new Array(n * 3).fill(0);
  for (let i = 0; i < m.indices.length; i += 3) {
    const i0 = m.indices[i], i1 = m.indices[i + 1], i2 = m.indices[i + 2];
    const x0 = m.positions[i0 * 3], y0 = m.positions[i0 * 3 + 1], z0 = m.positions[i0 * 3 + 2];
    const e1 = [m.positions[i1 * 3] - x0, m.positions[i1 * 3 + 1] - y0, m.positions[i1 * 3 + 2] - z0];
    const e2 = [m.positions[i2 * 3] - x0, m.positions[i2 * 3 + 1] - y0, m.positions[i2 * 3 + 2] - z0];
    const d1 = [m.uvs[i1 * 2] - m.uvs[i0 * 2], m.uvs[i1 * 2 + 1] - m.uvs[i0 * 2 + 1]];
    const d2 = [m.uvs[i2 * 2] - m.uvs[i0 * 2], m.uvs[i2 * 2 + 1] - m.uvs[i0 * 2 + 1]];
    const r = (d1[0] * d2[1] - d2[0] * d1[1]) || 1;
    const tx = (e1[0] * d2[1] - e2[0] * d1[1]) / r, ty = (e1[1] * d2[1] - e2[1] * d1[1]) / r, tz = (e1[2] * d2[1] - e2[2] * d1[1]) / r;
    for (const vi of [i0, i1, i2]) { m.tangents[vi * 3] += tx; m.tangents[vi * 3 + 1] += ty; m.tangents[vi * 3 + 2] += tz; }
  }
  if (!m.normals || !m.normals.length) this.computeAngleWeightedNormals(m);
  for (let i = 0; i < n; i++) { // orthogonalize + normalize
    let tx = m.tangents[i * 3], ty = m.tangents[i * 3 + 1], tz = m.tangents[i * 3 + 2];
    const nx = m.normals[i * 3], ny = m.normals[i * 3 + 1], nz = m.normals[i * 3 + 2];
    const d = tx * nx + ty * ny + tz * nz;
    tx -= nx * d; ty -= ny * d; tz -= nz * d;
    const l = Math.hypot(tx, ty, tz) || 1;
    m.tangents[i * 3] = tx / l; m.tangents[i * 3 + 1] = ty / l; m.tangents[i * 3 + 2] = tz / l;
  }
  return m;
};

// ---------- pro UV: box/spherical/cylindrical + packed 0-1 atlas ----------
UltraForge.prototype.autoUVPro = function (m, mode) {
  mode = mode || 'auto';
  const n = m.positions.length / 3; if (!n) return m;
  if (!m.normals || m.normals.length !== n * 3) this.computeAngleWeightedNormals(m);
  const bb = _v2bbox(m);
  if (mode === 'auto') mode = (bb.size[1] > 1.5 * Math.max(bb.size[0], bb.size[2])) ? 'cylindrical' : 'box';
  m.uvs = new Array(n * 2);
  const pad = 0.02;
  for (let i = 0; i < n; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    let u = 0, v = 0;
    if (mode === 'spherical') {
      const r = Math.hypot(x - (bb.min[0] + bb.max[0]) / 2, y - (bb.min[1] + bb.max[1]) / 2, z - (bb.min[2] + bb.max[2]) / 2) || 1;
      u = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
      v = Math.acos(clamp(y / r, -1, 1)) / Math.PI;
    } else if (mode === 'cylindrical') {
      u = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
      v = (y - bb.min[1]) / bb.size[1];
    } else { // box: dominant normal axis -> own atlas third (no overlap, padded)
      const nx = Math.abs(m.normals[i * 3]), ny = Math.abs(m.normals[i * 3 + 1]), nz = Math.abs(m.normals[i * 3 + 2]);
      const third = 1 / 3;
      if (nx >= ny && nx >= nz) { u = ((z - bb.min[2]) / bb.size[2]); v = ((y - bb.min[1]) / bb.size[1]); u = u * (third - pad * 2) + pad; }
      else if (ny >= nx && ny >= nz) { u = ((x - bb.min[0]) / bb.size[0]); v = ((z - bb.min[2]) / bb.size[2]); u = third + u * (third - pad * 2) + pad; }
      else { u = ((x - bb.min[0]) / bb.size[0]); v = ((y - bb.min[1]) / bb.size[1]); u = 2 * third + u * (third - pad * 2) + pad; }
      v = v * (1 - pad * 2) + pad;
      m.uvs[i * 2] = clamp(u, 0, 1); m.uvs[i * 2 + 1] = clamp(v, 0, 1);
      continue;
    }
    m.uvs[i * 2] = clamp(pad + u * (1 - pad * 2), 0, 1); m.uvs[i * 2 + 1] = clamp(pad + v * (1 - pad * 2), 0, 1);
  }
  return m;
};
UltraForge.prototype.packAtlas = function (m, padding) { // normalize UVs into padded 0-1 range
  padding = padding === undefined ? 0.02 : padding;
  const n = m.positions.length / 3;
  if (!m.uvs || m.uvs.length !== n * 2) this.autoUV(m);
  for (let i = 0; i < n; i++) {
    m.uvs[i * 2] = clamp(padding + m.uvs[i * 2] * (1 - padding * 2), 0, 1);
    m.uvs[i * 2 + 1] = clamp(padding + m.uvs[i * 2 + 1] * (1 - padding * 2), 0, 1);
  }
  return m;
};

// ---------- PBR ULTRA ----------
UltraForge.prototype.pbrUltra = function (opts) {
  opts = opts || {};
  let base = opts.baseColor || [0.8, 0.8, 0.8];
  if (typeof base === 'string') { const c = NAMED_COLORS[base.toLowerCase()]; if (c) base = c; }
  const mood = opts.mood || 'balanced';
  const wear = mood === 'worn' ? 0.7 : mood === 'pristine' ? 0.05 : mood === 'ancient' ? 0.85 : 0.25;
  return {
    name: opts.name || 'ultra', baseColor: base.slice(0, 3),
    metallic: opts.metallic !== undefined ? opts.metallic : 0.05,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.8,
    aoStrength: opts.aoStrength !== undefined ? opts.aoStrength : 0.8,
    microDetail: { scale: opts.microScale || 6, amount: opts.microAmount !== undefined ? opts.microAmount : 0.15 },
    wear: wear, mood: mood,
    layers: { base: base.slice(0, 3), wearTint: [0.30, 0.20, 0.12], edgeTint: [1.0, 1.0, 1.0] },
    vertexColors: !!opts.vertexColors, seed: opts.seed !== undefined ? opts.seed : 1337,
  };
};
UltraForge.prototype.applyCavityAO = function (m, strength) { // concave-curvature AO into m.ao (0.2..1)
  strength = strength === undefined ? 0.8 : strength;
  const n = m.positions.length / 3; if (!n) return m;
  if (!m.normals || m.normals.length !== n * 3) this.computeAngleWeightedNormals(m);
  const adj = _v2adj(m);
  let edge = 0, ec = 0;
  adj.forEach(function (nb, vi) {
    nb.forEach(function (w) {
      if (w > vi) { edge += Math.hypot(m.positions[w * 3] - m.positions[vi * 3], m.positions[w * 3 + 1] - m.positions[vi * 3 + 1], m.positions[w * 3 + 2] - m.positions[vi * 3 + 2]); ec++; }
    });
  });
  const avgE = (edge / (ec || 1)) || 1;
  m.ao = new Array(n); m._cav = new Array(n);
  for (let i = 0; i < n; i++) {
    const nb = adj[i]; if (!nb.size) { m.ao[i] = 1; m._cav[i] = 0; continue; }
    let sx = 0, sy = 0, sz = 0;
    nb.forEach(function (w) { sx += m.positions[w * 3]; sy += m.positions[w * 3 + 1]; sz += m.positions[w * 3 + 2]; });
    const s = nb.size;
    const dx = sx / s - m.positions[i * 3], dy = sy / s - m.positions[i * 3 + 1], dz = sz / s - m.positions[i * 3 + 2];
    const d = (dx * m.normals[i * 3] + dy * m.normals[i * 3 + 1] + dz * m.normals[i * 3 + 2]) / avgE;
    m._cav[i] = d;
    m.ao[i] = clamp(1 - d * strength * 0.6, 0.2, 1);
  }
  return m;
};
UltraForge.prototype.microNormal = function (m, amount, freq, seed) { // procedural noise bump on normals
  amount = amount === undefined ? 0.15 : amount; freq = freq || 6; seed = seed || 1337;
  const n = m.positions.length / 3;
  if (!m.normals || m.normals.length !== n * 3) this.computeAngleWeightedNormals(m);
  for (let i = 0; i < n; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    const b1 = noise2(x * freq + seed % 17, (y + z) * freq);
    const b2 = noise2((y - x) * freq, z * freq - seed % 11);
    m.normals[i * 3] += b1 * amount; m.normals[i * 3 + 1] += b2 * amount; m.normals[i * 3 + 2] += b1 * b2 * amount;
    const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]) || 1;
    m.normals[i * 3] /= l; m.normals[i * 3 + 1] /= l; m.normals[i * 3 + 2] /= l;
  }
  return m;
};
UltraForge.prototype.threeLayerColor = function (m, base, wearAmt) { // base + wear in crevices + edge highlight
  base = base || (m.material && m.material.baseColor) || [0.8, 0.8, 0.8];
  wearAmt = wearAmt === undefined ? ((m.material && m.material.wear) || 0.25) : wearAmt;
  const n = m.positions.length / 3; if (!n) return m;
  if (!m.ao || m.ao.length !== n) this.applyCavityAO(m, 0.8);
  const hasBase = m.colors && m.colors.length === n * 3;
  const out = new Array(n * 3);
  const wt = [0.30, 0.20, 0.12];
  for (let i = 0; i < n; i++) {
    const b = hasBase ? [m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]] : base;
    const ao = m.ao[i], concave = clamp(1 - ao, 0, 1), convex = clamp((m._cav ? -m._cav[i] : 0), 0, 1);
    const w = concave * wearAmt, e = clamp(convex * 1.2, 0, 0.5);
    out[i * 3] = clamp((b[0] * (0.55 + 0.45 * ao)) * (1 - w) + wt[0] * w + e * 0.35, 0, 1);
    out[i * 3 + 1] = clamp((b[1] * (0.55 + 0.45 * ao)) * (1 - w) + wt[1] * w + e * 0.35, 0, 1);
    out[i * 3 + 2] = clamp((b[2] * (0.55 + 0.45 * ao)) * (1 - w) + wt[2] * w + e * 0.35, 0, 1);
  }
  m.colors = out;
  if (m.material) m.material.vertexColors = true;
  return m;
};

// ---------- detail sculpt pass ----------
UltraForge.prototype.sculptPass = function (m, style, amount, seed) {
  style = style || 'default'; seed = seed || hashStr(m.name || 'sculpt');
  const n = m.positions.length / 3; if (!n) return m;
  if (!m.normals || m.normals.length !== n * 3) this.computeAngleWeightedNormals(m);
  const bb = _v2bbox(m), diag = Math.hypot(bb.size[0], bb.size[1], bb.size[2]);
  const tris = m.indices.length / 3;
  const big = tris > 12000; // single-octave noise keeps cinema <300ms on dense meshes
  const freq = tris > 20000 ? 0.9 : tris > 8000 ? 1.6 : 2.6; // frequency follows poly budget
  amount = amount === undefined ? diag * 0.022 : amount;
  const rnd = seed % 97;
  for (let i = 0; i < n; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    let d = 0;
    if (style === 'rock' || style === 'mountain') { // ridged fbm
      const r = 1 - Math.abs(big ? fbm2(x * freq + rnd, (y + z) * freq, 2) : fbm2(x * freq + rnd, (y + z) * freq, 3));
      d = (r - 0.55) * amount * 2.2;
    } else if (style === 'wood') { // growth rings
      d = (Math.sin((x + z) * freq * 4 + (big ? noise2(x * 2, z * 2) : fbm2(x * 2, z * 2, 2)) * 5) * 0.5) * amount * 0.7;
    } else if (style === 'metal') { // brushed anisotropy (stretched streaks)
      d = (big ? noise2(x * freq * 0.7 + rnd, y * freq * 7) : fbm2(x * freq * 0.7 + rnd, y * freq * 7, 2)) * amount * 0.35;
    } else {
      d = (big ? noise2(x * freq + rnd, (y + z) * freq - rnd) : fbm2(x * freq + rnd, (y + z) * freq - rnd, 2)) * amount;
    }
    m.positions[i * 3] += m.normals[i * 3] * d;
    m.positions[i * 3 + 1] += m.normals[i * 3 + 1] * d;
    m.positions[i * 3 + 2] += m.normals[i * 3 + 2] * d;
  }
  return this.computeAngleWeightedNormals(m);
};

// ---------- QEM-lite decimate (preserves borders + creases) ----------
UltraForge.prototype.decimateQEM = function (m, targetTris, opts) {
  opts = opts || {};
  const preserveCrease = opts.preserveCrease !== false, preserveBorder = opts.preserveBorder !== false;
  let tris = m.indices.length / 3;
  if (!targetTris || tris <= targetTris) return m;
  const cosCrease = Math.cos(30 * Math.PI / 180);
  let passes = 0;
  const hasUV = function () { return m.uvs && m.uvs.length === (m.positions.length / 3) * 2; };
  const hasC = function () { return m.colors && m.colors.length === (m.positions.length / 3); };
  while (tris > targetTris && passes < 8) {
    passes++;
    const n = m.positions.length / 3, idx = m.indices, ntris = idx.length / 3;
    const FN = new Float64Array(ntris * 3);
    for (let t = 0; t < ntris; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ux = m.positions[b] - m.positions[a], uy = m.positions[b + 1] - m.positions[a + 1], uz = m.positions[b + 2] - m.positions[a + 2];
      const vx = m.positions[c] - m.positions[a], vy = m.positions[c + 1] - m.positions[a + 1], vz = m.positions[c + 2] - m.positions[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      FN[t * 3] = nx / l; FN[t * 3 + 1] = ny / l; FN[t * 3 + 2] = nz / l;
    }
    const edges = new Map();
    for (let t = 0; t < ntris; t++) {
      const tri = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = a < b ? a + '_' + b : b + '_' + a;
        let E = edges.get(key);
        if (!E) { E = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; edges.set(key, E); }
        E.faces.push(t);
      }
    }
    const cand = [];
    edges.forEach(function (E) {
      if (preserveBorder && E.faces.length !== 2) return; // keep borders + non-manifold
      if (preserveCrease && E.faces.length === 2) {
        const f0 = E.faces[0] * 3, f1 = E.faces[1] * 3;
        if (FN[f0] * FN[f1] + FN[f0 + 1] * FN[f1 + 1] + FN[f0 + 2] * FN[f1 + 2] < cosCrease) return;
      }
      const dx = m.positions[E.a * 3] - m.positions[E.b * 3], dy = m.positions[E.a * 3 + 1] - m.positions[E.b * 3 + 1], dz = m.positions[E.a * 3 + 2] - m.positions[E.b * 3 + 2];
      cand.push([dx * dx + dy * dy + dz * dz, E.a, E.b]);
    });
    if (!cand.length) break;
    cand.sort(function (x, y) { return x[0] - y[0]; });
    const take = Math.min(cand.length, Math.max(8, Math.ceil((tris - targetTris) * 0.5))); // converge geometrically, no overshoot
    const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    let collapsed = 0;
    for (let i = 0; i < take; i++) {
      const ra = find(cand[i][1]), rb = find(cand[i][2]);
      if (ra === rb) continue;
      m.positions[ra * 3] = (m.positions[ra * 3] + m.positions[rb * 3]) / 2;
      m.positions[ra * 3 + 1] = (m.positions[ra * 3 + 1] + m.positions[rb * 3 + 1]) / 2;
      m.positions[ra * 3 + 2] = (m.positions[ra * 3 + 2] + m.positions[rb * 3 + 2]) / 2;
      parent[rb] = ra; collapsed++;
    }
    if (!collapsed) break;
    const UV = hasUV(), CL = hasC(), AO = (m.ao && m.ao.length === n);
    const ni = [];
    for (let t = 0; t < ntris; t++) {
      const a = find(idx[t * 3]), b = find(idx[t * 3 + 1]), c = find(idx[t * 3 + 2]);
      if (a === b || b === c || a === c) continue;
      ni.push(a, b, c);
    }
    const mapI = new Int32Array(n).fill(-1);
    const NP = [], NUV = UV ? [] : null, NCL = CL ? [] : null, NAO = AO ? [] : null;
    let vc = 0;
    const NI = [];
    for (let i = 0; i < ni.length; i++) {
      const v = ni[i];
      if (mapI[v] < 0) {
        mapI[v] = vc++;
        NP.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
        if (UV) NUV.push(m.uvs[v * 2], m.uvs[v * 2 + 1]);
        if (CL) NCL.push(m.colors[v * 3], m.colors[v * 3 + 1], m.colors[v * 3 + 2]);
        if (AO) NAO.push(m.ao[v]);
      }
      NI.push(mapI[v]);
    }
    m.positions = NP; m.indices = NI; if (UV) m.uvs = NUV; if (CL) m.colors = NCL; if (AO) m.ao = NAO;
    tris = NI.length / 3;
  }
  this.weld(m, 1e-6);
  return this.computeAngleWeightedNormals(m);
};
UltraForge.prototype.decimateFast = UltraForge.prototype.decimate; // keep V1 stride version available
UltraForge.prototype.decimate = function (m, targetPoly) { // V2: QEM-lite by default (same signature)
  return this.decimateQEM(m, targetPoly, { preserveBorder: true, preserveCrease: true });
};
UltraForge.prototype.lodChain = function (m) { // watertight 4-level chain: 100 / 50 / 25 / 12 %
  const ratios = [1, 0.5, 0.25, 0.12], out = [];
  const base = m.indices.length / 3;
  for (let i = 0; i < ratios.length; i++) {
    const c = { name: m.name + '_lod' + i, positions: m.positions.slice(), indices: m.indices.slice(), normals: (m.normals || []).slice(), uvs: (m.uvs || []).slice(), colors: (m.colors || []).slice(), material: m.material };
    if (m.ao) c.ao = m.ao.slice();
    if (i > 0) { this.decimateQEM(c, Math.max(12, Math.floor(base * ratios[i])), { preserveBorder: true, preserveCrease: true }); this.weld(c, 1e-6); }
    c.name = m.name + '_lod' + i; out.push(c);
  }
  return out;
};
UltraForge.prototype._lodV1 = UltraForge.prototype.lod;
UltraForge.prototype.lod = function (m, levels) { // V2 default: 4-level chain, still lod(mesh, n) compatible
  levels = levels || 4;
  if (levels === 3 && this._lodV1) { /* fall through to V2 ratios for better quality */ }
  const ratios = [1, 0.5, 0.25, 0.12], out = [];
  const base = m.indices.length / 3;
  for (let i = 0; i < levels; i++) {
    const r = ratios[Math.min(i, ratios.length - 1)] / (i >= ratios.length ? Math.pow(2, i - ratios.length + 1) : 1);
    const c = { name: m.name + '_lod' + i, positions: m.positions.slice(), indices: m.indices.slice(), normals: (m.normals || []).slice(), uvs: (m.uvs || []).slice(), colors: (m.colors || []).slice(), material: m.material };
    if (m.ao) c.ao = m.ao.slice();
    if (i > 0) { this.decimateQEM(c, Math.max(12, Math.floor(base * r)), { preserveBorder: true, preserveCrease: true }); this.weld(c, 1e-6); }
    c.name = m.name + '_lod' + i; out.push(c);
  }
  return out;
};

// ---------- rig-ready metadata ----------
UltraForge.prototype.skeleton = function (kind) {
  kind = kind || 'generic';
  if (kind === 'humanoid' || kind === 'robot') {
    const J = function (n, p, j) { return { name: n, parent: p, pos: j }; };
    return { kind: kind, pose: 'A-pose', joints: [
      J('hips', null, [0, 0.95, 0]), J('spine', 'hips', [0, 1.15, 0]), J('chest', 'spine', [0, 1.35, 0]),
      J('neck', 'chest', [0, 1.52, 0]), J('head', 'neck', [0, 1.68, 0]),
      J('shoulder_L', 'chest', [0.24, 1.45, 0]), J('elbow_L', 'shoulder_L', [0.42, 1.22, 0]), J('wrist_L', 'elbow_L', [0.52, 1.0, 0]),
      J('shoulder_R', 'chest', [-0.24, 1.45, 0]), J('elbow_R', 'shoulder_R', [-0.42, 1.22, 0]), J('wrist_R', 'elbow_R', [-0.52, 1.0, 0]),
      J('hip_L', 'hips', [0.11, 0.9, 0]), J('knee_L', 'hip_L', [0.12, 0.5, 0]), J('ankle_L', 'knee_L', [0.12, 0.1, 0]),
      J('hip_R', 'hips', [-0.11, 0.9, 0]), J('knee_R', 'hip_R', [-0.12, 0.5, 0]), J('ankle_R', 'knee_R', [-0.12, 0.1, 0]),
    ] };
  }
  if (kind === 'dragon' || kind === 'creature') {
    const J = function (n, p, j) { return { name: n, parent: p, pos: j }; };
    return { kind: kind, pose: 'quadruped', joints: [
      J('hips', null, [0, 1.0, 0]), J('spine', 'hips', [0.4, 1.1, 0]), J('neck', 'spine', [0.9, 1.4, 0]), J('head', 'neck', [1.4, 1.8, 0]),
      J('wing_L', 'spine', [0.2, 1.3, 0.4]), J('wing_R', 'spine', [0.2, 1.3, -0.4]),
      J('tail_0', 'hips', [-0.7, 1.0, 0]), J('tail_1', 'tail_0', [-1.2, 1.1, 0]),
      J('leg_FL', 'spine', [0.55, 0.6, 0.25]), J('leg_FR', 'spine', [0.55, 0.6, -0.25]),
      J('leg_BL', 'hips', [-0.55, 0.6, 0.25]), J('leg_BR', 'hips', [-0.55, 0.6, -0.25]),
    ] };
  }
  return { kind: kind, pose: 'static', joints: [{ name: 'root', parent: null, pos: [0, 0, 0] }] };
};
UltraForge.prototype.attachRig = function (m, kind) {
  m.rig = this.skeleton(kind);
  if (!m.parts || !m.parts.length) {
    const bb = _v2bbox(m);
    m.parts = [{ name: kind || m.name, center: [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2] }];
  }
  m.pivots = {};
  m.parts.forEach(function (p) { m.pivots[p.name] = p.center; });
  return m;
};
UltraForge.prototype.humanoidV2 = function (opts) { // rig-ready: symmetric, named parts, A-pose, golden-ratio proportions
  opts = opts || {};
  const H = opts.scale || 1.7, headH = H / 7.5; // golden-ish: head = 1/7.5 of height
  const parts = [], meta = [];
  function add(mesh, name) {
    const bb = _v2bbox(mesh);
    meta.push({ name: name, center: [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2] });
    mesh.name = name; parts.push(mesh); return mesh;
  }
  const head = this.sphere(18); scaleM(head, headH * 0.72, headH * 0.85, headH * 0.72); translate(head, 0, H - headH * 0.8, 0); add(head, 'head');
  const neck = this.cylinder(0.05 * H / 1.7, 0.06 * H / 1.7, 0.08 * H, 10); translate(neck, 0, H - headH * 1.7, 0); add(neck, 'neck');
  const torso = this.box(0.26 * H, 0.30 * H, 0.15 * H); translate(torso, 0, H * 0.62, 0); add(torso, 'torso');
  const hips = this.box(0.22 * H, 0.12 * H, 0.14 * H); translate(hips, 0, H * 0.45, 0); add(hips, 'hips');
  for (const sd of [-1, 1]) {
    const tag = sd < 0 ? 'R' : 'L';
    const upper = this.capsule(0.038 * H, 0.16 * H, 10); this.rotate(upper, 0, 0, sd * -12); translate(upper, sd * 0.18 * H, H * 0.68, 0); add(upper, 'arm_upper_' + tag);
    const fore = this.capsule(0.032 * H, 0.15 * H, 10); this.rotate(fore, 0, 0, sd * -8); translate(fore, sd * 0.225 * H, H * 0.52, 0); add(fore, 'arm_fore_' + tag);
    const hand = this.sphere(10); scaleM(hand, 0.035 * H, 0.05 * H, 0.035 * H); translate(hand, sd * 0.25 * H, H * 0.40, 0); add(hand, 'hand_' + tag);
    const thigh = this.capsule(0.05 * H, 0.20 * H, 10); translate(thigh, sd * 0.07 * H, H * 0.28, 0); add(thigh, 'leg_thigh_' + tag);
    const shin = this.capsule(0.04 * H, 0.18 * H, 10); translate(shin, sd * 0.07 * H, H * 0.10, 0); add(shin, 'leg_shin_' + tag);
    const foot = this.box(0.07 * H, 0.04 * H, 0.13 * H); translate(foot, sd * 0.07 * H, 0.02 * H, 0.03 * H); add(foot, 'foot_' + tag);
  }
  const m = mergeMeshes(parts, 'humanoid');
  m.parts = meta;
  m.material = this.pbrUltra({ baseColor: opts.color || [0.9, 0.72, 0.58] });
  this.attachRig(m, 'humanoid');
  return this.computeNormals(this.autoUV(m));
};

// ---------- quality score ----------
UltraForge.prototype.qualityScore = function (m) {
  const n = m.positions.length / 3, tris = m.indices.length / 3;
  let s = 0;
  if (m.normals && m.normals.length === n * 3) s += 25;
  if (m.uvs && m.uvs.length === n * 2) s += 20;
  if (m.tangents && m.tangents.length === n * 3) s += 10;
  let degen = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i], b = m.indices[i + 1], c = m.indices[i + 2];
    if (a === b || b === c || a === c) degen++;
  }
  const tr = tris || 1;
  s += Math.round(20 * (1 - degen / tr));
  let density;
  if (tris < 200) density = (tris / 200) * 15;
  else if (tris <= 50000) density = 15 + 10 * Math.min(1, (tris - 200) / 3000);
  else density = Math.max(0, 25 - (tris - 50000) / 5000);
  s += density;
  return Math.max(0, Math.min(100, Math.round(s)));
};
/* ================= UltraForge V2b: parser v2, 24 new kits, pipeline ================= */

const COLOR_ALIASES_EXTRA = { golden: 'gold', wooden: 'wood', oaken: 'wood', crimson: 'red', scarlet: 'red', azure: 'blue', ebony: 'black', snowy: 'white', sandy: 'yellow' };
const ALL_COLOR_WORDS = Object.assign({}, NAMED_COLORS);
Object.keys(COLOR_ALIASES_EXTRA).forEach(function (k) { ALL_COLOR_WORDS[k] = NAMED_COLORS[COLOR_ALIASES_EXTRA[k]]; });

UltraForge.prototype.parsePrompt = function (prompt) { // v2: superset of v1 fields (kind/color/colorName/poly/sport kept)
  const p = String(prompt || '');
  const pl = p.toLowerCase();
  const color = Object.keys(ALL_COLOR_WORDS).find(function (k) { return pl.includes(k); });
  const poly = (pl.includes('low poly') || pl.includes('low-poly')) ? 'low' : ((pl.includes('high') || pl.includes('ultra') || pl.includes('detailed') || pl.includes('8k')) ? 'high' : 'med');
  let style = null;
  if (/low.?poly|voxel|flat.?shade|minimil|chunky/i.test(p)) style = 'lowpoly';
  else if (/sci.?fi|cyber|futur|space|robotic|mech/i.test(p)) style = 'scifi';
  else if (/fantasy|ornate|rune|elv|dwarf|magic|medieval|mythic/i.test(p)) style = 'fantasy';
  else if (/cartoon|cute|pixar|stylized/i.test(p)) style = 'stylized';
  else if (/photoreal|realistic|ultra|8k|cinematic|detailed/i.test(p)) style = 'realistic';
  else style = 'stylized';
  let material = null;
  const matWords = Object.keys(MATERIAL_PRESETS).concat(Object.keys(MATERIAL_ALIASES));
  for (const w of matWords) { if (pl.includes(w)) { material = MATERIAL_ALIASES[w] || w; break; } }
  let mood = 'balanced';
  if (/worn|weathered|rusty|rusted|old|battered|used/i.test(p)) mood = 'worn';
  else if (/pristine|polished|new|clean|shiny|immaculate/i.test(p)) mood = 'pristine';
  else if (/ancient|mossy|cursed|ruined|forgotten/i.test(p)) mood = 'ancient';
  const partWords = ['wheels', 'windows', 'doors', 'spoiler', 'rims', 'headlights', 'wings', 'sails', 'mast', 'chimney', 'tower', 'gate', 'horns', 'tail', 'spikes', 'turret', 'sail', 'propeller', 'engine', 'cockpit'];
  const parts = partWords.filter(function (w) { return pl.includes(w); });
  let quality = 'game';
  if (/cinema|ultra|8k|hero|ornate|masterpiece/i.test(p)) quality = 'cinema';
  else if (/3d.?print|watertight|\bstl\b|printable/i.test(p)) quality = 'print';
  else if (/draft|sketch|concept|fast|low.?poly/i.test(p)) quality = 'draft';
  let kind = 'box';
  if (/dragon|drake|wyvern/i.test(p)) kind = 'dragon';
  else if (/robot|droid|mech(?!.*forest)|android|cyborg/i.test(p)) kind = 'robot';
  else if (/spaceship|space.?ship|rocket|ufo|starship|shuttle/i.test(p)) kind = 'spaceship';
  else if (/castle|fortress|keep\b|fort\b/i.test(p)) kind = 'castle';
  else if (/house|\bhut\b|cabin|cottage|bungalow|villa/i.test(p)) kind = 'house';
  else if (/bridge|viaduct|overpass/i.test(p)) kind = 'bridge';
  else if (/ornate|runed|excalibur|enchanted/i.test(p) && /sword|blade|dagger|katana/i.test(p)) kind = 'swordV2';
  else if (/sword|blade|knife|dagger|katana|weapon/i.test(p)) kind = /ornate|gold|jeweled|royal/i.test(p) ? 'swordV2' : 'sword';
  else if (/axe|hatchet|tomahawk/i.test(p)) kind = 'axe';
  else if (/shield|buckler|aegis/i.test(p)) kind = 'shield';
  else if (/helmet|\bhelm\b/i.test(p)) kind = 'helmet';
  else if (/throne/i.test(p)) kind = 'throne';
  else if (/lamp|lantern|torch|streetlight|chandelier/i.test(p)) kind = 'lamp';
  else if (/sofa|couch|loveseat|settee/i.test(p)) kind = 'sofa';
  else if (/bookshelf|bookcase|book.?shelf|shelf|cabinet|wardrobe|dresser/i.test(p)) kind = 'bookshelf';
  else if (/bed|bunk|mattress|headboard/i.test(p)) kind = 'bed';
  else if (/sports.?car|race.?car|racer|super.?car|lambo|ferrari/i.test(p)) kind = 'carSportsV2';
  else if (/motorcycle|motorbike|\bbike\b|harley|scooter|vespa|chopper/i.test(p)) kind = 'motorcycle';
  else if (/airplane|aircraft|airliner|\bjet\b|fighter|biplane|glider|cessna/i.test(p)) kind = 'airplane';
  else if (/boat|ship|yacht|canoe|kayak|sailboat|galley|pirate/i.test(p)) kind = 'boat';
  else if (/alien.?(plant|flora|flower)|xenomorph|tentacle.?(plant|flower)|space.?(plant|flower|flora)/i.test(p)) kind = 'alienPlant';
  else if (/mushroom|toadstool|fungus|shroom/i.test(p)) kind = 'mushroom';
  else if (/crystal|gem|diamond|quartz|amethyst|geode/i.test(p)) kind = 'crystal';
  else if (/treasure|chest|loot|coffer/i.test(p)) kind = 'treasureChest';
  else if (/fountain/i.test(p)) kind = 'fountain';
  else if (/car|vehicle|truck|pickup|sedan|taxi|\bvan\b|suv|wagon/i.test(p)) kind = (parts.includes('spoiler') || parts.includes('rims') || parts.includes('headlights')) ? 'carSportsV2' : 'car';
  else if (/human|character|\bman\b|woman|person|humanoid|avatar|knight|armor|warrior|mage|\belf\b|orc|villager/i.test(p)) kind = 'humanoid';
  else if (/chair|stool|armchair|office.?chair/i.test(p)) kind = 'chair';
  else if (/table|desk/i.test(p)) kind = 'table';
  else if (/tree|pine|oak/i.test(p)) kind = 'tree';
  else if (/rock|stone|boulder/i.test(p)) kind = 'rock';
  else if (/creature|monster|beast|animal|\bdog\b|\bcat\b|wolf|bear|quadruped|alien|pet/i.test(p)) kind = 'creature';
  else if (/building|tower|skyscraper|apartment|office|temple|church/i.test(p)) kind = 'building';
  else if (/torus|donut|ring/i.test(p)) kind = 'torus';
  else if (/sphere|ball|planet|orb/i.test(p)) kind = 'sphere';
  else if (/cylinder|pillar|column|tube|pipe/i.test(p)) kind = 'cylinder';
  else if (/cone/i.test(p)) kind = 'cone';
  else if (/capsule|pill/i.test(p)) kind = 'capsule';
  else if (/floor|ground/i.test(p)) kind = 'plane';
  else if (/\bplane\b/i.test(p)) kind = 'plane';
  else if (/box|cube|crate/i.test(p)) kind = 'box';
  let baseColor = color ? ALL_COLOR_WORDS[color] : null;
  if (!baseColor && material && MATERIAL_PRESETS[material]) baseColor = MATERIAL_PRESETS[material].baseColor;
  return { kind: kind, color: baseColor, colorName: color || (material || null), poly: poly, sport: /sport|race|fast/.test(pl), style: style, material: material, materialName: material || 'default', mood: mood, parts: parts, quality: quality };
};

// ---------- 24 NEW KITS (beveled, proportioned, secondary + micro detail) ----------
UltraForge.prototype.dragon = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const gold = opts.color || [0.75, 0.45, 0.12];
  const body = this.sphere(20); scaleM(body, 1.1, 0.6, 0.5); translate(body, 0, 1.2, 0); parts.push(P(body, gold));
  const neckPts = [[0.9, 1.35, 0], [1.25, 1.7, 0], [1.55, 2.05, 0]]; parts.push(P(this.tubeAlongCurve(neckPts, 0.20, 10), gold));
  const skull = this.sphere(14); scaleM(skull, 0.30, 0.26, 0.26); translate(skull, 1.68, 2.12, 0); parts.push(P(skull, gold));
  const snout = this.box(0.38, 0.20, 0.26); translate(snout, 1.98, 2.04, 0); parts.push(P(snout, [0.82, 0.55, 0.2]));
  for (const s of [-1, 1]) {
    const horn = this.cone(0.06, 0.35, 6); this.rotate(horn, 0, 0, -35); translate(horn, 1.5, 2.35, s * 0.14); parts.push(P(horn, [0.9, 0.85, 0.6]));
    const eye = this.sphere(8); scaleM(eye, 0.05, 0.05, 0.05); translate(eye, 1.80, 2.18, s * 0.20); parts.push(P(eye, [1, 0.85, 0.1]));
    const wingArm = this.tubeAlongCurve([[-0.1, 1.55, s * 0.25], [0.5, 2.1, s * 0.9], [1.1, 2.3, s * 1.5]], 0.06, 6); parts.push(P(wingArm, gold));
    const wing = this.extrusion([[-0.1, 1.5], [1.15, 2.25], [0.35, 1.35]], 0.03); this.rotate(wing, 80, 0, 0); translate(wing, 0, 0.15, s * 0.55); parts.push(P(wing, [0.62, 0.3, 0.1]));
    for (const lx of [0.55, -0.55]) { const leg = this.cylinder(0.13, 0.09, 0.8, 8); translate(leg, lx, 0.4, s * 0.28); parts.push(P(leg, gold)); }
    const claw = this.cone(0.05, 0.18, 6); this.rotate(claw, 180, 0, 0); translate(claw, 0.55, 0.02, s * 0.28); parts.push(P(claw, [0.15, 0.12, 0.1]));
  }
  const tail = this.tubeAlongCurve([[-0.9, 1.2, 0], [-1.5, 1.25, 0.1], [-2.1, 1.5, 0]], 0.14, 8); parts.push(P(tail, gold));
  for (let i = 0; i < 5; i++) { const sp = this.cone(0.07, 0.28 - i * 0.03, 6); translate(sp, 0.5 - i * 0.35, 1.75 - i * 0.06, 0); parts.push(P(sp, [0.9, 0.8, 0.55])); }
  const m = mergeMeshes(parts, 'dragon');
  m.parts = [{ name: 'body', center: [0, 1.2, 0] }, { name: 'head', center: [1.68, 2.12, 0] }, { name: 'wing_L', center: [0.4, 1.9, 0.9] }, { name: 'wing_R', center: [0.4, 1.9, -0.9] }, { name: 'tail', center: [-1.5, 1.3, 0] }];
  m.material = this.pbrUltra({ baseColor: gold, metallic: 0.25, roughness: 0.55, mood: opts.mood, vertexColors: true });
  this.attachRig(m, 'dragon');
  return this._kitFinish(m);
};
UltraForge.prototype.robot = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const steel = [0.55, 0.58, 0.62], dark = [0.2, 0.21, 0.24], glow = [0.2, 0.8, 1.0];
  const torso = this.box(0.55, 0.7, 0.38); translate(torso, 0, 1.1, 0); parts.push(P(torso, steel));
  const chest = this.box(0.35, 0.25, 0.03); translate(chest, 0, 1.2, 0.20); parts.push(P(chest, dark));
  const core = this.sphere(8); scaleM(core, 0.07, 0.07, 0.04); translate(core, 0, 1.2, 0.22); parts.push(P(core, glow));
  const head = this.box(0.34, 0.30, 0.32); translate(head, 0, 1.68, 0); parts.push(P(head, steel));
  const visor = this.box(0.26, 0.09, 0.03); translate(visor, 0, 1.70, 0.17); parts.push(P(visor, glow));
  const ant = this.cylinder(0.015, 0.015, 0.3, 6); translate(ant, 0.1, 1.95, 0); parts.push(P(ant, dark));
  const antTip = this.sphere(6); scaleM(antTip, 0.035, 0.035, 0.035); translate(antTip, 0.1, 2.1, 0); parts.push(P(antTip, [1, 0.3, 0.2]));
  for (const s of [-1, 1]) {
    const sh = this.sphere(10); scaleM(sh, 0.11, 0.11, 0.11); translate(sh, s * 0.36, 1.38, 0); parts.push(P(sh, dark));
    const arm = this.cylinder(0.07, 0.06, 0.55, 8); translate(arm, s * 0.40, 1.05, 0); parts.push(P(arm, steel));
    const claw = this.box(0.10, 0.16, 0.14); translate(claw, s * 0.40, 0.70, 0); parts.push(P(claw, dark));
    const leg = this.cylinder(0.09, 0.08, 0.6, 8); translate(leg, s * 0.15, 0.45, 0); parts.push(P(leg, steel));
    const foot = this.box(0.16, 0.10, 0.28); translate(foot, s * 0.15, 0.05, 0.04); parts.push(P(foot, dark));
    for (const ry of [1.30, 0.95]) { const riv = this.sphere(6); scaleM(riv, 0.025, 0.025, 0.02); translate(riv, s * 0.20, ry, 0.20); parts.push(P(riv, dark)); }
  }
  const m = mergeMeshes(parts, 'robot');
  m.parts = [{ name: 'torso', center: [0, 1.1, 0] }, { name: 'head', center: [0, 1.68, 0] }];
  m.material = this.pbrUltra({ baseColor: steel, metallic: 0.85, roughness: 0.35, mood: opts.mood, vertexColors: true });
  this.attachRig(m, 'robot');
  return this._kitFinish(m);
};
UltraForge.prototype.spaceship = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const hull = [0.75, 0.78, 0.82], accent = opts.color || [0.15, 0.35, 0.9], dark = [0.12, 0.13, 0.16];
  const body = this.cylinder(0.35, 0.42, 2.6, 16); this.rotate(body, 0, 0, 90); parts.push(P(body, hull));
  const nose = this.cone(0.35, 0.9, 16); this.rotate(nose, 0, 0, -90); translate(nose, 1.75, 0, 0); parts.push(P(nose, accent));
  const cockpit = this.sphere(12); scaleM(cockpit, 0.35, 0.22, 0.22); translate(cockpit, 0.75, 0.32, 0); parts.push(P(cockpit, [0.1, 0.25, 0.4]));
  for (const s of [-1, 1]) {
    const wing = this.box(1.1, 0.07, 1.3); translate(wing, -0.5, -0.05, s * 0.95); parts.push(P(wing, hull));
    const tip = this.box(0.5, 0.3, 0.07); translate(tip, -0.7, 0.15, s * 1.55); parts.push(P(tip, accent));
    const eng = this.cylinder(0.20, 0.24, 0.9, 12); this.rotate(eng, 0, 0, 90); translate(eng, -1.2, 0, s * 0.55); parts.push(P(eng, dark));
    const glow = this.sphere(8); scaleM(glow, 0.10, 0.14, 0.14); translate(glow, -1.68, 0, s * 0.55); parts.push(P(glow, [0.4, 0.8, 1.0]));
  }
  const fin = this.box(0.7, 0.7, 0.07); translate(fin, -1.1, 0.5, 0); parts.push(P(fin, accent));
  const m = mergeMeshes(parts, 'spaceship');
  m.material = this.pbrUltra({ baseColor: hull, metallic: 0.7, roughness: 0.35, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.castle = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const stone = [0.62, 0.60, 0.57], dark = [0.25, 0.22, 0.2], roofC = [0.45, 0.15, 0.12];
  const keep = this.box(4, 3.5, 4); translate(keep, 0, 1.75, 0); parts.push(P(keep, stone));
  const walk = this.box(4.4, 0.4, 4.4); translate(walk, 0, 3.7, 0); parts.push(P(walk, [0.55, 0.53, 0.5]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tw = this.cylinder(0.75, 0.85, 5.2, 12); translate(tw, sx * 2.3, 2.6, sz * 2.3); parts.push(P(tw, stone));
    const rf = this.cone(1.0, 1.4, 12); translate(rf, sx * 2.3, 5.9, sz * 2.3); parts.push(P(rf, roofC));
  }
  const gate = this.box(1.2, 1.8, 0.15); translate(gate, 0, 0.9, 2.02); parts.push(P(gate, dark));
  for (let i = 0; i < 6; i++) { const win = this.box(0.35, 0.6, 0.12); translate(win, -1.5 + (i % 3) * 1.5, 2.0 + Math.floor(i / 3) * 1.1, 2.0); parts.push(P(win, [1, 0.85, 0.5])); }
  const pole = this.cylinder(0.03, 0.03, 1.6, 6); translate(pole, 0, 4.7, 0); parts.push(P(pole, dark));
  const flag = this.extrusion([[-0.8, 0.6], [0, 0.6], [0, 1.0]], 0.03); translate(flag, 0, 4.8, 0); parts.push(P(flag, [0.8, 0.1, 0.1]));
  const m = mergeMeshes(parts, 'castle');
  m.material = this.pbrUltra({ baseColor: stone, metallic: 0, roughness: 0.9, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.house = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wall = opts.color || [0.88, 0.80, 0.66], roofC = [0.5, 0.2, 0.12], wood = [0.45, 0.3, 0.16];
  const base = this.box(3, 2, 2.6); translate(base, 0, 1, 0); parts.push(P(base, wall));
  const roof = this.extrusion([[-1.85, 0], [1.85, 0], [0, 1.25]], 3.0); this.rotate(roof, 90, 0, 0); this.rotate(roof, 0, 90, 0); translate(roof, 0, 2.0, -1.5); parts.push(P(roof, roofC));
  const door = this.box(0.7, 1.3, 0.1); translate(door, 0, 0.65, 1.32); parts.push(P(door, wood));
  const knob = this.sphere(6); scaleM(knob, 0.04, 0.04, 0.04); translate(knob, 0.22, 0.65, 1.38); parts.push(P(knob, [1, 0.8, 0.2]));
  for (const s of [-1, 1]) { const win = this.box(0.7, 0.6, 0.1); translate(win, s * 1.0, 1.2, 1.31); parts.push(P(win, [1, 0.9, 0.6])); }
  const chim = this.box(0.4, 1.0, 0.4); translate(chim, 0.9, 2.9, 0); parts.push(P(chim, [0.6, 0.35, 0.3]));
  const step = this.box(1.0, 0.15, 0.5); translate(step, 0, 0.07, 1.55); parts.push(P(step, [0.6, 0.6, 0.6]));
  const m = mergeMeshes(parts, 'house');
  m.material = this.pbrUltra({ baseColor: wall, metallic: 0, roughness: 0.85, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.bridge = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const stone = [0.6, 0.59, 0.57], wood = [0.5, 0.34, 0.18];
  const deck = this.box(7, 0.25, 1.8); translate(deck, 0, 2, 0); parts.push(P(deck, wood));
  for (const s of [-1, 1]) {
    const arc = this.tubeAlongCurve([[-3, 2, s * 0.7], [0, 0.6, s * 0.7], [3, 2, s * 0.7]], 0.14, 8); parts.push(P(arc, stone));
    const rail = this.box(7, 0.08, 0.08); translate(rail, 0, 2.9, s * 0.85); parts.push(P(rail, wood));
    for (let i = 0; i < 8; i++) { const post = this.box(0.08, 0.75, 0.08); translate(post, -3 + i, 2.5, s * 0.85); parts.push(P(post, wood)); }
  }
  for (const px of [-2.2, 0, 2.2]) { const pil = this.box(0.5, 2.2, 1.4); translate(pil, px, 0.9, 0); parts.push(P(pil, stone)); }
  const m = mergeMeshes(parts, 'bridge');
  m.material = this.pbrUltra({ baseColor: stone, metallic: 0, roughness: 0.9, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.swordV2 = function (opts) { // ornate BEST-ever sword
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const steelC = [0.82, 0.85, 0.9], goldC = opts.color || [1, 0.75, 0.2], gripC = [0.35, 0.2, 0.1], gemC = [0.9, 0.1, 0.2];
  const blade = this.box(0.10, 1.15, 0.028); translate(blade, 0, 0.95, 0); parts.push(P(blade, steelC));
  const fuller = this.box(0.03, 0.9, 0.032); translate(fuller, 0, 0.9, 0); parts.push(P(fuller, [0.6, 0.63, 0.68]));
  const tip = this.cone(0.07, 0.25, 4); this.rotate(tip, 0, 45, 0); translate(tip, 0, 1.65, 0); parts.push(P(tip, steelC));
  const guard = this.torus(0.17, 0.035, 16, 8); this.rotate(guard, 90, 0, 0); scaleM(guard, 1.2, 1, 0.6); translate(guard, 0, 0.36, 0); parts.push(P(guard, goldC));
  for (const s of [-1, 1]) { const gem = this.sphere(8); scaleM(gem, 0.045, 0.045, 0.045); translate(gem, s * 0.20, 0.36, 0); parts.push(P(gem, gemC)); }
  const grip = this.cylinder(0.032, 0.038, 0.30, 10); translate(grip, 0, 0.18, 0); parts.push(P(grip, gripC));
  for (let i = 0; i < 3; i++) { const ring = this.torus(0.04, 0.012, 10, 6); this.rotate(ring, 90, 0, 0); translate(ring, 0, 0.10 + i * 0.08, 0); parts.push(P(ring, goldC)); }
  const pommel = this.sphere(10); scaleM(pommel, 0.06, 0.06, 0.06); translate(pommel, 0, 0.0, 0); parts.push(P(pommel, goldC));
  const m = mergeMeshes(parts, 'sword_ornate');
  m.material = this.pbrUltra({ baseColor: steelC, metallic: 0.85, roughness: 0.3, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.axe = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wood = [0.45, 0.3, 0.16], steelC = [0.7, 0.72, 0.76];
  const handle = this.cylinder(0.035, 0.045, 1.15, 10); translate(handle, 0, 0.57, 0); parts.push(P(handle, wood));
  for (const wy of [0.35, 0.55]) { const wrap = this.torus(0.045, 0.014, 10, 6); this.rotate(wrap, 90, 0, 0); translate(wrap, 0, wy, 0); parts.push(P(wrap, [0.3, 0.18, 0.1])); }
  const head = this.box(0.16, 0.24, 0.07); translate(head, 0.10, 1.05, 0); parts.push(P(head, steelC));
  const blade = this.extrusion([[0.16, -0.14], [0.42, -0.20], [0.42, 0.20], [0.16, 0.14]], 0.06); translate(blade, 0, 1.05, -0.03); parts.push(P(blade, steelC));
  const pommel = this.sphere(8); scaleM(pommel, 0.05, 0.05, 0.05); translate(pommel, 0, 0.0, 0); parts.push(P(pommel, steelC));
  const m = mergeMeshes(parts, 'axe');
  m.material = this.pbrUltra({ baseColor: steelC, metallic: 0.8, roughness: 0.4, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.shield = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wood = opts.color || [0.5, 0.33, 0.17], steelC = [0.7, 0.72, 0.76], goldC = [1, 0.75, 0.2];
  const dish = this.lathe([[0.02, 0], [0.35, 0.02], [0.52, 0.10], [0.55, 0.16]], 20); this.rotate(dish, 90, 0, 0); parts.push(P(dish, wood));
  const boss = this.sphere(12); scaleM(boss, 0.14, 0.14, 0.10); translate(boss, 0, 0, 0.12); parts.push(P(boss, steelC));
  const rim = this.torus(0.55, 0.03, 20, 8); translate(rim, 0, 0, 0.10); parts.push(P(rim, steelC));
  const crossV = this.box(0.10, 0.8, 0.03); translate(crossV, 0, 0, 0.06); parts.push(P(crossV, goldC));
  const crossH = this.box(0.6, 0.10, 0.03); translate(crossH, 0, 0.1, 0.06); parts.push(P(crossH, goldC));
  const m = mergeMeshes(parts, 'shield');
  m.material = this.pbrUltra({ baseColor: wood, metallic: 0.3, roughness: 0.6, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.helmet = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const steelC = opts.color || [0.68, 0.70, 0.74], dark = [0.1, 0.1, 0.12], crestC = [0.75, 0.12, 0.12];
  const dome = this.sphere(18); scaleM(dome, 0.30, 0.32, 0.32); translate(dome, 0, 0.1, 0); parts.push(P(dome, steelC));
  const visor = this.box(0.34, 0.08, 0.05); translate(visor, 0, 0.08, 0.28); parts.push(P(visor, dark));
  const nose = this.box(0.05, 0.22, 0.04); translate(nose, 0, -0.05, 0.29); parts.push(P(nose, steelC));
  const crest = this.box(0.05, 0.18, 0.5); translate(crest, 0, 0.44, -0.02); parts.push(P(crest, crestC));
  const rim = this.torus(0.30, 0.025, 18, 8); this.rotate(rim, 90, 0, 0); scaleM(rim, 1, 1, 1.05); translate(rim, 0, -0.12, 0); parts.push(P(rim, [0.5, 0.52, 0.55]));
  for (const s of [-1, 1]) { const cheek = this.box(0.06, 0.25, 0.28); translate(cheek, s * 0.27, -0.05, 0.08); parts.push(P(cheek, steelC)); }
  const m = mergeMeshes(parts, 'helmet');
  m.material = this.pbrUltra({ baseColor: steelC, metallic: 0.85, roughness: 0.35, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.throne = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wood = [0.4, 0.25, 0.12], goldC = [1, 0.75, 0.2], cushion = opts.color || [0.65, 0.1, 0.12];
  const seat = this.box(1.1, 0.15, 0.9); translate(seat, 0, 0.55, 0); parts.push(P(seat, wood));
  const cush = this.box(0.9, 0.10, 0.7); translate(cush, 0, 0.66, 0); parts.push(P(cush, cushion));
  const back = this.box(1.1, 1.9, 0.14); translate(back, 0, 1.5, -0.42); parts.push(P(back, wood));
  const backPad = this.box(0.8, 1.5, 0.08); translate(backPad, 0, 1.5, -0.33); parts.push(P(backPad, cushion));
  const crest = this.cone(0.18, 0.4, 8); translate(crest, 0, 2.6, -0.42); parts.push(P(crest, goldC));
  for (const s of [-1, 1]) {
    const arm = this.box(0.14, 0.12, 0.85); translate(arm, s * 0.55, 1.0, 0); parts.push(P(arm, wood));
    const post = this.cylinder(0.06, 0.07, 0.45, 8); translate(post, s * 0.55, 0.75, 0.35); parts.push(P(post, wood));
    const orb = this.sphere(8); scaleM(orb, 0.08, 0.08, 0.08); translate(orb, s * 0.55, 1.12, 0.35); parts.push(P(orb, goldC));
    for (const lz of [-0.35, 0.35]) { const leg = this.cylinder(0.06, 0.05, 0.55, 8); translate(leg, s * 0.45, 0.27, lz); parts.push(P(leg, wood)); }
  }
  for (let i = 0; i < 4; i++) { const stud = this.sphere(6); scaleM(stud, 0.035, 0.035, 0.035); translate(stud, -0.3 + i * 0.2, 2.2, -0.34); parts.push(P(stud, goldC)); }
  const m = mergeMeshes(parts, 'throne');
  m.material = this.pbrUltra({ baseColor: wood, metallic: 0.2, roughness: 0.6, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.lamp = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const iron = [0.15, 0.15, 0.17], glow = [1, 0.85, 0.55];
  const base = this.cylinder(0.22, 0.28, 0.15, 12); translate(base, 0, 0.07, 0); parts.push(P(base, iron));
  const pole = this.cylinder(0.045, 0.06, 2.2, 10); translate(pole, 0, 1.2, 0); parts.push(P(pole, iron));
  const collar = this.torus(0.07, 0.025, 10, 6); this.rotate(collar, 90, 0, 0); translate(collar, 0, 1.6, 0); parts.push(P(collar, [0.8, 0.65, 0.2]));
  const glassBox = this.box(0.34, 0.42, 0.34); translate(glassBox, 0, 2.5, 0); parts.push(P(glassBox, [0.9, 0.9, 0.85]));
  const bulb = this.sphere(10); scaleM(bulb, 0.10, 0.12, 0.10); translate(bulb, 0, 2.5, 0); parts.push(P(bulb, glow));
  const cap = this.cone(0.30, 0.25, 4); this.rotate(cap, 0, 45, 0); translate(cap, 0, 2.85, 0); parts.push(P(cap, iron));
  const tip = this.sphere(6); scaleM(tip, 0.04, 0.06, 0.04); translate(tip, 0, 3.0, 0); parts.push(P(tip, iron));
  const m = mergeMeshes(parts, 'lamp');
  m.material = this.pbrUltra({ baseColor: iron, metallic: 0.7, roughness: 0.5, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.sofa = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const fab = opts.color || [0.35, 0.45, 0.6], dark = [0.25, 0.32, 0.45];
  const base = this.box(2.0, 0.45, 0.9); translate(base, 0, 0.35, 0); parts.push(P(base, fab));
  const back = this.box(2.0, 0.75, 0.25); translate(back, 0, 0.85, -0.35); parts.push(P(back, fab));
  for (const s of [-1, 1]) { const arm = this.box(0.28, 0.65, 0.9); translate(arm, s * 1.0, 0.65, 0); parts.push(P(arm, fab)); }
  for (let i = 0; i < 3; i++) {
    const cu = this.box(0.58, 0.16, 0.7); translate(cu, -0.64 + i * 0.64, 0.63, 0.05); parts.push(P(cu, dark));
    const pil = this.box(0.5, 0.4, 0.14); this.rotate(pil, -10, 0, 0); translate(pil, -0.64 + i * 0.64, 0.95, -0.25); parts.push(P(pil, dark));
    const btn = this.sphere(6); scaleM(btn, 0.025, 0.025, 0.025); translate(btn, -0.64 + i * 0.64, 0.72, 0.41); parts.push(P(btn, fab));
  }
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.35, 0.35]) { const leg = this.cylinder(0.04, 0.03, 0.14, 6); translate(leg, sx, 0.07, sz); parts.push(P(leg, dark)); }
  const m = mergeMeshes(parts, 'sofa');
  m.material = this.pbrUltra({ baseColor: fab, metallic: 0, roughness: 0.95, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.bed = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wood = [0.45, 0.3, 0.16], sheet = opts.color || [0.85, 0.85, 0.88], blanket = [0.3, 0.4, 0.65];
  const frame = this.box(1.7, 0.25, 2.3); translate(frame, 0, 0.3, 0); parts.push(P(frame, wood));
  const headboard = this.box(1.7, 1.1, 0.12); translate(headboard, 0, 0.85, -1.1); parts.push(P(headboard, wood));
  const knob1 = this.sphere(8); scaleM(knob1, 0.07, 0.07, 0.07); translate(knob1, -0.8, 1.45, -1.1); parts.push(P(knob1, wood));
  const knob2 = this.sphere(8); scaleM(knob2, 0.07, 0.07, 0.07); translate(knob2, 0.8, 1.45, -1.1); parts.push(P(knob2, wood));
  const mattress = this.box(1.55, 0.22, 2.1); translate(mattress, 0, 0.53, 0.02); parts.push(P(mattress, sheet));
  const bl = this.box(1.6, 0.10, 1.2); translate(bl, 0, 0.62, 0.5); parts.push(P(bl, blanket));
  for (const s of [-1, 1]) { const pil = this.box(0.65, 0.14, 0.4); this.rotate(pil, 0, 0, s * -6); translate(pil, s * 0.38, 0.68, -0.75); parts.push(P(pil, [0.95, 0.95, 0.97])); }
  for (const sx of [-0.75, 0.75]) for (const sz of [-1.0, 1.0]) { const leg = this.box(0.1, 0.2, 0.1); translate(leg, sx, 0.1, sz); parts.push(P(leg, wood)); }
  const m = mergeMeshes(parts, 'bed');
  m.material = this.pbrUltra({ baseColor: wood, metallic: 0, roughness: 0.8, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.bookshelf = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wood = opts.color || [0.5, 0.33, 0.18];
  const rnd = mulberry(hashStr('shelf' + (opts.variant || 0)));
  for (const s of [-1, 1]) { const side = this.box(0.08, 2.0, 0.4); translate(side, s * 0.75, 1.0, 0); parts.push(P(side, wood)); }
  const top = this.box(1.6, 0.08, 0.4); translate(top, 0, 2.0, 0); parts.push(P(top, wood));
  const bot = this.box(1.6, 0.10, 0.4); translate(bot, 0, 0.05, 0); parts.push(P(bot, wood));
  const palette = [[0.7, 0.2, 0.15], [0.2, 0.35, 0.6], [0.25, 0.5, 0.3], [0.75, 0.6, 0.2], [0.5, 0.3, 0.55]];
  for (let sh = 0; sh < 4; sh++) {
    const y = 0.45 + sh * 0.48;
    const shelf = this.box(1.44, 0.05, 0.36); translate(shelf, 0, y - 0.24, 0); parts.push(P(shelf, wood));
    let bx = -0.65;
    while (bx < 0.6) {
      const bw = 0.05 + rnd() * 0.05, bh = 0.28 + rnd() * 0.14;
      if (rnd() < 0.12) { bx += 0.08; continue; }
      const book = this.box(bw, bh, 0.26); translate(book, bx + bw / 2, y - 0.215 + bh / 2, 0); parts.push(P(book, palette[(rnd() * palette.length) | 0]));
      bx += bw + 0.012;
    }
  }
  const m = mergeMeshes(parts, 'bookshelf');
  m.material = this.pbrUltra({ baseColor: wood, metallic: 0, roughness: 0.75, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.carSportsV2 = function (opts) { // BEST-ever sports car: rims + spoiler + headlights + details
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const paintC = opts.color || [0.9, 0.08, 0.1], glass = [0.08, 0.1, 0.14], dark = [0.1, 0.1, 0.11], chrome = [0.85, 0.87, 0.9];
  const lower = this.box(4.2, 0.45, 1.9); translate(lower, 0, 0.55, 0); parts.push(P(lower, paintC));
  const nose = this.box(0.9, 0.32, 1.8); this.rotate(nose, 0, 0, -8); translate(nose, 2.0, 0.48, 0); parts.push(P(nose, paintC));
  const cabin = this.box(1.9, 0.42, 1.5); translate(cabin, -0.25, 1.0, 0); parts.push(P(cabin, glass));
  const roof = this.box(1.1, 0.06, 1.4); translate(roof, -0.25, 1.24, 0); parts.push(P(roof, paintC));
  for (const wx of [1.35, -1.35]) for (const wz of [0.95, -0.95]) {
    const tire = this.cylinder(0.40, 0.40, 0.32, 16); this.rotate(tire, 90, 0, 0); translate(tire, wx, 0.40, wz); parts.push(P(tire, dark));
    const rim = this.cylinder(0.22, 0.22, 0.34, 10); this.rotate(rim, 90, 0, 0); translate(rim, wx, 0.40, wz); parts.push(P(rim, chrome));
    const hub = this.cylinder(0.07, 0.07, 0.36, 8); this.rotate(hub, 90, 0, 0); translate(hub, wx, 0.40, wz); parts.push(P(hub, dark));
    for (let sp = 0; sp < 5; sp++) { const spoke = this.box(0.36, 0.05, 0.05); this.rotate(spoke, sp * 72, 0, 0); translate(spoke, wx, 0.40, wz + (wz > 0 ? 0.0 : 0.0)); parts.push(P(spoke, chrome)); }
  }
  for (const s of [-1, 1]) { const strut = this.box(0.08, 0.35, 0.08); translate(strut, -1.95, 0.95, s * 0.6); parts.push(P(strut, dark)); }
  const wing = this.box(0.55, 0.08, 1.9); translate(wing, -2.0, 1.15, 0); parts.push(P(wing, paintC));
  for (const s of [-1, 1]) {
    const hl = this.sphere(10); scaleM(hl, 0.08, 0.10, 0.12); translate(hl, 2.35, 0.62, s * 0.6); parts.push(P(hl, [1, 0.97, 0.85]));
    const tl = this.box(0.08, 0.10, 0.3); translate(tl, -2.12, 0.68, s * 0.55); parts.push(P(tl, [0.9, 0.05, 0.05]));
    const mir = this.box(0.12, 0.08, 0.12); translate(mir, 0.55, 1.0, s * 0.95); parts.push(P(mir, paintC));
    const ex = this.cylinder(0.06, 0.07, 0.25, 10); this.rotate(ex, 0, 0, 90); translate(ex, -2.15, 0.35, s * 0.4); parts.push(P(ex, chrome));
  }
  const bumperF = this.box(0.25, 0.25, 1.85); translate(bumperF, 2.15, 0.35, 0); parts.push(P(bumperF, dark));
  const bumperR = this.box(0.25, 0.25, 1.85); translate(bumperR, -2.12, 0.35, 0); parts.push(P(bumperR, dark));
  const m = mergeMeshes(parts, 'car_sports');
  m.material = this.pbrUltra({ baseColor: paintC, metallic: 0.75, roughness: 0.3, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.motorcycle = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const paintC = opts.color || [0.85, 0.15, 0.1], dark = [0.1, 0.1, 0.11], chrome = [0.85, 0.87, 0.9];
  for (const wx of [0.95, -0.95]) {
    const tire = this.torus(0.33, 0.09, 16, 8); this.rotate(tire, 0, 90, 0); translate(tire, wx, 0.33, 0); parts.push(P(tire, dark));
    const hub = this.cylinder(0.06, 0.06, 0.1, 8); this.rotate(hub, 90, 0, 0); translate(hub, wx, 0.33, 0); parts.push(P(hub, chrome));
    for (let sp = 0; sp < 3; sp++) { const spoke = this.box(0.04, 0.6, 0.04); this.rotate(spoke, sp * 60, 0, 0); translate(spoke, wx, 0.33, 0); parts.push(P(spoke, chrome)); }
  }
  const frame = this.tubeAlongCurve([[-0.9, 0.6, 0], [-0.2, 0.55, 0], [0.7, 0.8, 0]], 0.05, 8); parts.push(P(frame, paintC));
  const fork = this.tubeAlongCurve([[0.7, 0.8, 0], [0.9, 0.4, 0]], 0.04, 6); parts.push(P(fork, chrome));
  const tank = this.sphere(12); scaleM(tank, 0.32, 0.20, 0.18); translate(tank, 0.1, 0.78, 0); parts.push(P(tank, paintC));
  const seat = this.box(0.55, 0.10, 0.25); translate(seat, -0.5, 0.72, 0); parts.push(P(seat, dark));
  const bars = this.tubeAlongCurve([[0.7, 1.05, -0.25], [0.72, 1.1, 0], [0.7, 1.05, 0.25]], 0.03, 6); parts.push(P(bars, chrome));
  const lampH = this.sphere(10); scaleM(lampH, 0.09, 0.11, 0.11); translate(lampH, 0.82, 0.95, 0); parts.push(P(lampH, [1, 0.97, 0.85]));
  const fender = this.torus(0.40, 0.05, 12, 6); this.rotate(fender, 0, 90, 0); translate(fender, -0.95, 0.45, 0); parts.push(P(fender, paintC));
  const m = mergeMeshes(parts, 'motorcycle');
  m.material = this.pbrUltra({ baseColor: paintC, metallic: 0.6, roughness: 0.35, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.airplane = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const paintC = opts.color || [0.85, 0.87, 0.9], accent = [0.15, 0.3, 0.8], dark = [0.1, 0.1, 0.12];
  const fus = this.cylinder(0.35, 0.28, 3.4, 16); this.rotate(fus, 0, 0, 90); parts.push(P(fus, paintC));
  const nose = this.sphere(12); scaleM(nose, 0.45, 0.35, 0.35); translate(nose, 1.75, 0, 0); parts.push(P(nose, paintC));
  const cockpit = this.sphere(10); scaleM(cockpit, 0.4, 0.2, 0.25); translate(cockpit, 0.9, 0.32, 0); parts.push(P(cockpit, [0.1, 0.2, 0.35]));
  const wing = this.box(1.0, 0.08, 5.6); translate(wing, 0.1, -0.05, 0); parts.push(P(wing, paintC));
  for (const s of [-1, 1]) {
    const eng = this.cylinder(0.20, 0.22, 1.1, 12); this.rotate(eng, 0, 0, 90); translate(eng, 0.15, -0.25, s * 1.4); parts.push(P(eng, accent));
    const glow = this.sphere(8); scaleM(glow, 0.08, 0.14, 0.14); translate(glow, -0.42, -0.25, s * 1.4); parts.push(P(glow, dark));
    const tail = this.box(0.7, 0.06, 1.6); translate(tail, -1.6, 0.15, s * 0.55); parts.push(P(tail, paintC));
  }
  const fin = this.box(0.7, 0.9, 0.08); translate(fin, -1.6, 0.5, 0); parts.push(P(fin, accent));
  const m = mergeMeshes(parts, 'airplane');
  m.material = this.pbrUltra({ baseColor: paintC, metallic: 0.65, roughness: 0.35, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.boat = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const hullC = opts.color || [0.5, 0.25, 0.12], deckC = [0.75, 0.62, 0.42], sailC = [0.93, 0.92, 0.88];
  const hull = this.box(3.0, 0.8, 1.4); translate(hull, 0, 0.4, 0); parts.push(P(hull, hullC));
  const bow = this.cone(0.7, 1.0, 4); this.rotate(bow, 0, 0, -90); this.rotate(bow, 0, 45, 0); scaleM(bow, 1, 1, 0.55); translate(bow, 1.9, 0.4, 0); parts.push(P(bow, hullC));
  const deck = this.box(2.6, 0.08, 1.2); translate(deck, -0.1, 0.84, 0); parts.push(P(deck, deckC));
  const cabin = this.box(0.9, 0.5, 0.8); translate(cabin, -0.6, 1.1, 0); parts.push(P(cabin, deckC));
  const mast = this.cylinder(0.05, 0.06, 2.6, 8); translate(mast, 0.3, 2.1, 0); parts.push(P(mast, [0.4, 0.28, 0.15]));
  const sail = this.extrusion([[0.35, 1.2], [0.35, 3.1], [1.6, 1.2]], 0.04); translate(sail, 0, 0, -0.02); parts.push(P(sail, sailC));
  for (const s of [-1, 1]) { const rail = this.box(2.6, 0.06, 0.06); translate(rail, -0.1, 1.2, s * 0.6); parts.push(P(rail, deckC)); }
  for (let i = 0; i < 4; i++) { const port = this.sphere(6); scaleM(port, 0.05, 0.05, 0.03); translate(port, -1 + i * 0.6, 0.55, 0.71); parts.push(P(port, [0.1, 0.15, 0.2])); }
  const m = mergeMeshes(parts, 'boat');
  m.material = this.pbrUltra({ baseColor: hullC, metallic: 0.05, roughness: 0.7, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.alienPlant = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const stem = [0.3, 0.55, 0.3], glowA = [0.2, 1, 0.8], glowB = [0.8, 0.3, 1];
  const mound = this.sphere(12); scaleM(mound, 0.7, 0.25, 0.7); translate(mound, 0, 0.05, 0); parts.push(P(mound, [0.25, 0.2, 0.3]));
  const stalk = this.tubeAlongCurve([[0, 0.1, 0], [0.15, 0.8, 0.1], [-0.1, 1.5, 0]], 0.09, 8); parts.push(P(stalk, stem));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7, c = i % 2 ? glowA : glowB;
    const tent = this.tubeAlongCurve([[0, 0.4 + i * 0.15, 0], [Math.cos(a) * 0.5, 0.7 + i * 0.15, Math.sin(a) * 0.5], [Math.cos(a) * 0.8, 0.5 + i * 0.1, Math.sin(a) * 0.8]], 0.05, 6);
    parts.push(P(tent, stem));
    const bulb = this.sphere(10); scaleM(bulb, 0.13, 0.16, 0.13); translate(bulb, Math.cos(a) * 0.8, 0.55 + i * 0.1, Math.sin(a) * 0.8); parts.push(P(bulb, c));
  }
  const crown = this.sphere(12); scaleM(crown, 0.2, 0.24, 0.2); translate(crown, -0.1, 1.65, 0); parts.push(P(crown, glowA));
  const m = mergeMeshes(parts, 'alien_plant');
  m.material = this.pbrUltra({ baseColor: stem, metallic: 0, roughness: 0.5, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.mushroom = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const capC = opts.color || [0.85, 0.15, 0.12], cream = [0.92, 0.87, 0.75];
  const stem = this.cylinder(0.16, 0.24, 0.7, 12); translate(stem, 0, 0.35, 0); parts.push(P(stem, cream));
  const cap = this.sphere(18); scaleM(cap, 0.62, 0.38, 0.62); translate(cap, 0, 0.78, 0); parts.push(P(cap, capC));
  const rnd = mulberry(hashStr('shroom'));
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, r = 0.15 + rnd() * 0.35;
    const spot = this.sphere(8); scaleM(spot, 0.06 + rnd() * 0.05, 0.03, 0.06 + rnd() * 0.05);
    translate(spot, Math.cos(a) * r, 0.78 + 0.38 * Math.sqrt(Math.max(0, 1 - (r / 0.62) * (r / 0.62))) - 0.02, Math.sin(a) * r);
    parts.push(P(spot, cream));
  }
  const m = mergeMeshes(parts, 'mushroom');
  m.material = this.pbrUltra({ baseColor: capC, metallic: 0, roughness: 0.6, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.crystal = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const tints = opts.color ? [opts.color, opts.color] : [[0.55, 0.4, 0.95], [0.4, 0.75, 1.0], [0.7, 0.5, 1.0]];
  const rnd = mulberry(hashStr('crys' + (opts.variant || 0)));
  const base = this.cylinder(0.7, 0.85, 0.25, 10); translate(base, 0, 0.1, 0); parts.push(P(base, [0.4, 0.38, 0.42]));
  for (let i = 0; i < 6; i++) {
    const h = 0.6 + rnd() * 1.2, r = 0.12 + rnd() * 0.12;
    const a = rnd() * Math.PI * 2, d = rnd() * 0.4;
    const c1 = this.cone(r, h / 2, 6); translate(c1, Math.cos(a) * d, h / 4 + 0.2, Math.sin(a) * d);
    this.rotate(c1, (rnd() - 0.5) * 24, 0, (rnd() - 0.5) * 24);
    const c2 = this.cone(r, h / 3, 6); this.rotate(c2, 180, 0, 0); translate(c2, Math.cos(a) * d, h / 2 + h / 6 + 0.2, Math.sin(a) * d);
    const tint = tints[i % tints.length];
    parts.push(P(c1, tint)); parts.push(P(c2, tint));
  }
  const m = mergeMeshes(parts, 'crystal');
  m.material = this.pbrUltra({ baseColor: tints[0], metallic: 0.15, roughness: 0.12, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.treasureChest = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const wood = [0.45, 0.28, 0.12], goldC = [1, 0.75, 0.2], iron = [0.25, 0.25, 0.28], gemC = [0.9, 0.15, 0.3];
  const baseB = this.box(1.2, 0.55, 0.8); translate(baseB, 0, 0.32, 0); parts.push(P(baseB, wood));
  const lid = this.cylinder(0.40, 0.40, 1.2, 14); this.rotate(lid, 90, 0, 0); this.rotate(lid, 0, 90, 0); translate(lid, 0, 0.60, -0.42); this.rotate(lid, 0, 0, 0); parts.push(P(lid, [0.4, 0.24, 0.1]));
  for (const bx of [-0.4, 0, 0.4]) { const band = this.box(0.08, 0.62, 0.86); translate(band, bx, 0.33, 0); parts.push(P(band, iron)); }
  const lock = this.box(0.16, 0.2, 0.06); translate(lock, 0, 0.45, 0.42); parts.push(P(lock, goldC));
  const rnd = mulberry(777);
  for (let i = 0; i < 10; i++) { const coin = this.sphere(6); scaleM(coin, 0.07, 0.05, 0.07); translate(coin, (rnd() - 0.5) * 0.9, 0.62 + rnd() * 0.08, (rnd() - 0.5) * 0.5); parts.push(P(coin, goldC)); }
  for (let i = 0; i < 3; i++) { const gem = this.cone(0.06, 0.12, 6); translate(gem, -0.3 + i * 0.3, 0.70, 0.1); parts.push(P(gem, i === 1 ? [0.2, 0.6, 1] : gemC)); }
  const m = mergeMeshes(parts, 'treasure_chest');
  m.material = this.pbrUltra({ baseColor: wood, metallic: 0.3, roughness: 0.55, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};
UltraForge.prototype.fountain = function (opts) {
  opts = opts || {}; const parts = [], P = (mm, c) => this.paint(mm, c);
  const stone = opts.color || [0.72, 0.71, 0.68], water = [0.35, 0.65, 0.9];
  const basin = this.lathe([[0.1, 0], [1.1, 0.05], [1.25, 0.35], [1.15, 0.55]], 20); translate(basin, 0, 0, 0); parts.push(P(basin, stone));
  const waterD = this.cylinder(1.05, 1.05, 0.06, 20); translate(waterD, 0, 0.42, 0); parts.push(P(waterD, water));
  const pillar = this.cylinder(0.16, 0.24, 1.2, 12); translate(pillar, 0, 0.9, 0); parts.push(P(pillar, stone));
  const tier = this.lathe([[0.08, 0], [0.6, 0.04], [0.68, 0.18]], 18); translate(tier, 0, 1.4, 0); parts.push(P(tier, stone));
  const waterT = this.cylinder(0.55, 0.55, 0.05, 18); translate(waterT, 0, 1.52, 0); parts.push(P(waterT, water));
  const top = this.sphere(10); scaleM(top, 0.14, 0.18, 0.14); translate(top, 0, 1.85, 0); parts.push(P(top, stone));
  const drop = this.sphere(6); scaleM(drop, 0.05, 0.09, 0.05); translate(drop, 0, 2.05, 0); parts.push(P(drop, water));
  const m = mergeMeshes(parts, 'fountain');
  m.material = this.pbrUltra({ baseColor: stone, metallic: 0, roughness: 0.8, mood: opts.mood, vertexColors: true });
  return this._kitFinish(m);
};

const V2_KITS = ['dragon', 'robot', 'spaceship', 'castle', 'house', 'bridge', 'swordV2', 'axe', 'shield', 'helmet', 'throne', 'lamp', 'sofa', 'bed', 'bookshelf', 'carSportsV2', 'motorcycle', 'airplane', 'boat', 'alienPlant', 'mushroom', 'crystal', 'treasureChest', 'fountain'];
const ALL_KITS = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'capsule', 'tubeAlongCurve', 'lathe', 'extrusion', 'humanoid', 'car', 'building', 'chair', 'table', 'tree', 'rock', 'sword', 'creature'].concat(V2_KITS);

// ---------- V2 quality pipeline + quick override (same signature) ----------
UltraForge.prototype.applyQuality = function (m, presetName, q) {
  q = q || {};
  const P = QUALITY_PRESETS[presetName] || QUALITY_PRESETS.game;
  this.cleanTopology(m);
  let tris = m.indices.length / 3, sub = P.subdiv;
  const subCap = presetName === 'cinema' ? 24000 : P.budget; // keep cinema <300ms
  while (sub > 0 && tris * Math.pow(4, sub) > subCap) sub--;
  if (sub > 0) { this.catmullClark(m, sub); tris = m.indices.length / 3; }
  if (P.smooth > 0) this.taubin(m, Math.min(P.smooth, 2));
  if (P.smooth < 2) this.bevelEdges(m, 0.12); // taubin x2 already rounds edges
  if (P.sculpt) {
    const kind = (m.name || '').split('_')[0];
    const sculptStyle = /rock|crystal|fountain|castle|bridge/.test(m.name) ? 'rock' : /wood|throne|table|chair|house|boat|bookshelf|bed/.test(m.name) ? 'wood' : /sword|robot|car|shield|helmet|axe|spaceship|motor|plane|lamp/.test(m.name) ? 'metal' : 'default';
    void kind;
    this.sculptPass(m, sculptStyle);
  }
  this.computeAngleWeightedNormals(m);
  const glassSmooth = sub > 0 && P.smooth >= 2; // subdiv+taubin leaves no hard edges: split would be pure overhead
  if (presetName !== 'draft' && presetName !== 'print' && !glassSmooth) this.splitHardEdges(m, 30);
  this.autoUVPro(m, 'auto');
  this.computeTangents(m);
  if (P.ao) this.applyCavityAO(m, 0.8);
  else this.applyCavityAO(m, 0.3);
  const md = m.material && m.material.microDetail;
  this.microNormal(m, md ? md.amount : 0.12, md ? md.scale : 6, hashStr(m.name || 'micro'));
  this.threeLayerColor(m, m.material && m.material.baseColor, m.material && m.material.wear);
  if (/^(humanoid|robot|dragon|creature)/.test(m.name)) this.attachRig(m, m.name.split('_')[0]);
  tris = m.indices.length / 3;
  if (tris > P.budget) this.decimate(m, P.budget);
  if (P.watertight) { this.weld(m, 1e-3); this.fixWinding(m); }
  return m;
};
UltraForge.prototype._quickV1 = UltraForge.prototype.quick; // keep V1 path reachable
UltraForge.prototype.quick = function (prompt, opts) {
  const t0 = Date.now(); opts = opts || {};
  const q = this.parsePrompt(prompt);
  if (opts.quality && QUALITY_PRESETS[opts.quality]) q.quality = opts.quality;
  if (opts.style) q.style = opts.style;
  if (opts.material && MATERIAL_PRESETS[opts.material]) { q.material = opts.material; q.materialName = opts.material; }
  const presetName = q.quality || 'game';
  const col = (opts.color) || q.color || [0.75, 0.75, 0.78];
  const det = presetName === 'draft' ? (q.poly === 'low' ? 7 : 10) : presetName === 'cinema' ? (q.poly === 'low' ? 12 : 26) : (q.poly === 'low' ? 8 : 18);
  let m; const kind = q.kind;
  const mood = q.mood;
  switch (kind) {
    case 'dragon': m = this.dragon({ color: col, mood: mood }); break;
    case 'robot': m = this.robot({ color: col, mood: mood }); break;
    case 'spaceship': m = this.spaceship({ color: col, mood: mood }); break;
    case 'castle': m = this.castle({ color: col, mood: mood }); break;
    case 'house': m = this.house({ color: col, mood: mood }); break;
    case 'bridge': m = this.bridge({ color: col, mood: mood }); break;
    case 'swordV2': m = this.swordV2({ color: q.material === 'gold' || !q.color ? undefined : col, mood: mood }); break;
    case 'axe': m = this.axe({ mood: mood }); break;
    case 'shield': m = this.shield({ color: col, mood: mood }); break;
    case 'helmet': m = this.helmet({ color: col, mood: mood }); break;
    case 'throne': m = this.throne({ color: col, mood: mood }); break;
    case 'lamp': m = this.lamp({ mood: mood }); break;
    case 'sofa': m = this.sofa({ color: col, mood: mood }); break;
    case 'bed': m = this.bed({ color: col, mood: mood }); break;
    case 'bookshelf': m = this.bookshelf({ color: col, mood: mood }); break;
    case 'carSportsV2': m = this.carSportsV2({ color: col, mood: mood }); break;
    case 'motorcycle': m = this.motorcycle({ color: col, mood: mood }); break;
    case 'airplane': m = this.airplane({ color: col, mood: mood }); break;
    case 'boat': m = this.boat({ color: col, mood: mood }); break;
    case 'alienPlant': m = this.alienPlant({ mood: mood }); break;
    case 'mushroom': m = this.mushroom({ color: col, mood: mood }); break;
    case 'crystal': m = this.crystal({ color: col, mood: mood }); break;
    case 'treasureChest': m = this.treasureChest({ mood: mood }); break;
    case 'fountain': m = this.fountain({ color: col, mood: mood }); break;
    case 'car': m = this.car({ color: col, sport: q.sport || /car/.test(String(prompt).toLowerCase()) }); break;
    case 'humanoid': m = this.humanoidV2({ color: (q.colorName === 'red' || !q.color) ? [0.9, 0.72, 0.58] : col }); break;
    case 'building': m = this.building({ color: col, floors: q.poly === 'low' ? 2 : 4 }); break;
    case 'chair': m = this.chair({ color: col }); break;
    case 'table': m = this.table({ color: col }); break;
    case 'tree': m = this.tree({ lowPoly: q.poly !== 'high' && presetName !== 'cinema' }); break;
    case 'rock': m = this.rock({ detail: det, color: col }); break;
    case 'sword': m = this.sword(); break;
    case 'creature': m = this.creature({ color: col }); break;
    case 'sphere': m = this.sphere(det); break;
    case 'cylinder': m = this.cylinder(0.5, 0.5, 2, det); break;
    case 'cone': m = this.cone(0.5, 2, det); break;
    case 'torus': m = this.torus(1, 0.3, det + 10, det); break;
    case 'capsule': m = this.capsule(0.5, 1.5, det); break;
    case 'plane': m = this.plane(4, 4, 4); break;
    default: m = this.box(1, 1, 1);
  }
  m.name = kind + '_' + (q.colorName || 'default');
  // upgrade material to PBR ULTRA (preserve kit-tuned metallic/roughness unless material word overrides)
  let metal, rough;
  if (q.material && MATERIAL_PRESETS[q.material]) { metal = MATERIAL_PRESETS[q.material].metallic; rough = MATERIAL_PRESETS[q.material].roughness; }
  else if (m.material && m.material.metallic !== undefined && m.material.name === 'ultra') { metal = m.material.metallic; rough = m.material.roughness; }
  else if (q.style === 'scifi') { metal = 0.6; rough = 0.4; }
  else if (kind === 'car' || kind === 'carSportsV2' || kind === 'motorcycle') { metal = 0.7; rough = 0.35; }
  else if (kind === 'airplane' || kind === 'spaceship' || kind === 'boat') { metal = 0.6; rough = 0.4; }
  else if (kind === 'sword' || kind === 'robot' || kind === 'helmet' || kind === 'shield' || kind === 'axe') { metal = 0.85; rough = 0.35; }
  else { metal = 0.05; rough = 0.8; }
  const keepVC = !!(m.material && m.material.vertexColors && m.colors && m.colors.length);
  m.material = this.pbrUltra({ baseColor: (kind === 'tree' || (keepVC && !q.color && !q.material)) ? (m.material.baseColor || col) : col, metallic: metal, roughness: rough, mood: mood, vertexColors: keepVC, seed: hashStr(String(prompt)) });
  if (keepVC && (kind === 'tree' || !q.color)) { /* kit vertex colors preserved as 3-layer base */ }
  else if (!keepVC && m.colors) { delete m.colors; m.material.vertexColors = false; }
  if (kind === 'car' && q.sport && !/sport/i.test(m.name)) { /* basic car kept for backward compat */ }
  this.applyQuality(m, presetName, q);
  const budget = opts.polyBudget || (QUALITY_PRESETS[presetName] || QUALITY_PRESETS.game).budget;
  if (m.indices.length / 3 > budget) this.decimate(m, budget);
  else if (opts.polyBudget && m.indices.length / 3 > opts.polyBudget) this.decimate(m, opts.polyBudget);
  const dt = Date.now() - t0;
  return { mesh: m, stats: { verts: m.positions.length / 3, tris: m.indices.length / 3, timeMs: dt, polyLevel: q.poly, kind: kind, color: q.colorName || 'default', quality: presetName, style: q.style, material: q.materialName || 'default', score: this.qualityScore(m) } };
};

// ---------- texture baking (PNG via canvas if present, else PPM) ----------
UltraForge.prototype.bakeTextures = function (m, w, h) {
  w = w || 128; h = h || 128;
  const seed = (m.material && m.material.seed) || hashStr(m.name || 'tex');
  const bc = (m.material && m.material.baseColor) || [0.8, 0.8, 0.8];
  const rgh = (m.material && m.material.roughness !== undefined) ? m.material.roughness : 0.8;
  function ppm(fn) {
    let s = 'P3\n' + w + ' ' + h + '\n255\n';
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) row += fn(x / w, y / h) + ' ';
      s += row + '\n';
    }
    return s;
  }
  const albedo = ppm(function (u, v) {
    const nn = fbm2(u * 6 + seed % 13, v * 6, 3) * 0.5 + 0.5, f = 0.7 + nn * 0.6;
    return Math.round(clamp(bc[0] * f, 0, 1) * 255) + ' ' + Math.round(clamp(bc[1] * f, 0, 1) * 255) + ' ' + Math.round(clamp(bc[2] * f, 0, 1) * 255);
  });
  const rough = ppm(function (u, v) {
    const nn = fbm2(u * 8, v * 8 + seed % 7, 2) * 0.5 + 0.5;
    const g = Math.round(clamp(rgh * (0.75 + nn * 0.5), 0, 1) * 255);
    return g + ' ' + g + ' ' + g;
  });
  const ao = ppm(function (u, v) {
    const nn = fbm2(u * 4 + 3, v * 4 + seed % 5, 3) * 0.5 + 0.5;
    const g = Math.round((0.55 + nn * 0.45) * 255);
    return g + ' ' + g + ' ' + g;
  });
  let png = null;
  try {
    const cv = require('canvas');
    function toPNG(ppmStr) {
      const lines = ppmStr.split('\n');
      const nums = lines.slice(3).join(' ').trim().split(/\s+/).map(Number);
      const c = cv.createCanvas(w, h), g = c.getContext('2d');
      const img = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { img.data[i * 4] = nums[i * 3]; img.data[i * 4 + 1] = nums[i * 3 + 1]; img.data[i * 4 + 2] = nums[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    }
    png = { albedo: toPNG(albedo), roughness: toPNG(rough), ao: toPNG(ao) };
  } catch (e) { png = null; }
  return { albedo: albedo, roughness: rough, ao: ao, png: png, w: w, h: h };
};

// ---------- turntable previews (software rasterizer; PNG via canvas if present, else PPM) ----------
UltraForge.prototype.renderPreview = function (m, angleDeg, W, H) {
  W = W || 320; H = H || 240;
  const c = { name: m.name + '_pv', positions: m.positions.slice(), indices: m.indices.slice(), normals: [], uvs: [], colors: (m.colors || []).slice(), material: m.material };
  if (c.indices.length / 3 > 3000) this.decimateQEM(c, 3000, { preserveBorder: false, preserveCrease: false });
  this.computeAngleWeightedNormals(c);
  const a = (angleDeg || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const n = c.positions.length / 3;
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mxz = 1e9, mxz2 = -1e9;
  const P = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = c.positions[i * 3], y = c.positions[i * 3 + 1], z = c.positions[i * 3 + 2];
    const rx = x * ca + z * sa, rz = -x * sa + z * ca;
    P[i * 3] = rx; P[i * 3 + 1] = y; P[i * 3 + 2] = rz;
    if (rx < mnx) mnx = rx; if (rx > mxx) mxx = rx;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (rz < mxz) mxz = rz; if (rz > mxz2) mxz2 = rz;
  }
  const sc = Math.min(W, H) * 0.42 / Math.max(mxx - mnx, mxy - mny, mxz2 - mxz, 1e-6);
  const cx = (mnx + mxx) / 2, cyy = (mny + mxy) / 2;
  const rgb = new Uint8Array(W * H * 3).fill(18);
  const zb = new Float64Array(W * H).fill(-1e9);
  const bc = (c.material && c.material.baseColor) || [0.8, 0.8, 0.8];
  const hasC = c.colors && c.colors.length === n * 3;
  const lx = -0.4, ly = 0.8, lz = 0.6, ll = Math.hypot(lx, ly, lz);
  for (let t = 0; t < c.indices.length; t += 3) {
    const v0 = c.indices[t], v1 = c.indices[t + 1], v2 = c.indices[t + 2];
    const sx = [(W / 2 + (P[v0 * 3] - cx) * sc) | 0, (W / 2 + (P[v1 * 3] - cx) * sc) | 0, (W / 2 + (P[v2 * 3] - cx) * sc) | 0];
    const sy = [(H / 2 - (P[v0 * 3 + 1] - cyy) * sc) | 0, (H / 2 - (P[v1 * 3 + 1] - cyy) * sc) | 0, (H / 2 - (P[v2 * 3 + 1] - cyy) * sc) | 0];
    const sz = [P[v0 * 3 + 2], P[v1 * 3 + 2], P[v2 * 3 + 2]];
    const ux = P[v1 * 3] - P[v0 * 3], uy = P[v1 * 3 + 1] - P[v0 * 3 + 1], uz = P[v1 * 3 + 2] - P[v0 * 3 + 2];
    const vx = P[v2 * 3] - P[v0 * 3], vy = P[v2 * 3 + 1] - P[v0 * 3 + 1], vz = P[v2 * 3 + 2] - P[v0 * 3 + 2];
    let fnx = uy * vz - uz * vy, fny = uz * vx - ux * vz, fnz = ux * vy - uy * vx;
    const fl = Math.hypot(fnx, fny, fnz) || 1; fnx /= fl; fny /= fl; fnz /= fl;
    if (fnz > -0.05 && (P[v0 * 3 + 2] + P[v1 * 3 + 2] + P[v2 * 3 + 2]) / 3 < mxz2 - (mxz2 - mxz) * 0.02) {
      // backface cull toward viewer (+z after rotation? viewer looks along -z, keep faces with fnz<0)... keep simple: shade all
    }
    const inten = 0.35 + 0.65 * Math.abs((fnx * lx + fny * ly + fnz * lz) / ll);
    let cr, cg, cb;
    if (hasC) { cr = (c.colors[v0 * 3] + c.colors[v1 * 3] + c.colors[v2 * 3]) / 3; cg = (c.colors[v0 * 3 + 1] + c.colors[v1 * 3 + 1] + c.colors[v2 * 3 + 1]) / 3; cb = (c.colors[v0 * 3 + 2] + c.colors[v1 * 3 + 2] + c.colors[v2 * 3 + 2]) / 3; }
    else { cr = bc[0]; cg = bc[1]; cb = bc[2]; }
    const R = Math.min(255, (cr * inten * 255) | 0), G = Math.min(255, (cg * inten * 255) | 0), B = Math.min(255, (cb * inten * 255) | 0);
    const minX = Math.max(0, Math.min(sx[0], sx[1], sx[2])), maxX = Math.min(W - 1, Math.max(sx[0], sx[1], sx[2]));
    const minY = Math.max(0, Math.min(sy[0], sy[1], sy[2])), maxY = Math.min(H - 1, Math.max(sy[0], sy[1], sy[2]));
    const d = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2]);
    if (!d) continue;
    for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
      const l0 = ((sy[1] - sy[2]) * (xx - sx[2]) + (sx[2] - sx[1]) * (yy - sy[2])) / d;
      const l1 = ((sy[2] - sy[0]) * (xx - sx[2]) + (sx[0] - sx[2]) * (yy - sy[2])) / d;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const z = l0 * sz[0] + l1 * sz[1] + l2 * sz[2], o = yy * W + xx;
      if (z > zb[o]) { zb[o] = z; rgb[o * 3] = R; rgb[o * 3 + 1] = G; rgb[o * 3 + 2] = B; }
    }
  }
  return { w: W, h: H, rgb: rgb };
};
UltraForge.prototype.previewToPPM = function (pv) {
  let s = 'P3\n' + pv.w + ' ' + pv.h + '\n255\n';
  for (let y = 0; y < pv.h; y++) {
    let row = '';
    for (let x = 0; x < pv.w; x++) { const o = (y * pv.w + x) * 3; row += pv.rgb[o] + ' ' + pv.rgb[o + 1] + ' ' + pv.rgb[o + 2] + ' '; }
    s += row + '\n';
  }
  return s;
};
UltraForge.prototype.previewToPNG = function (pv) {
  try {
    const cv = require('canvas');
    const c = cv.createCanvas(pv.w, pv.h), g = c.getContext('2d');
    const img = g.createImageData(pv.w, pv.h);
    for (let i = 0; i < pv.w * pv.h; i++) { img.data[i * 4] = pv.rgb[i * 3]; img.data[i * 4 + 1] = pv.rgb[i * 3 + 1]; img.data[i * 4 + 2] = pv.rgb[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  } catch (e) { return null; }
};

// ---------- V2 export hardening: safe toGLTF + vertex colors ----------
UltraForge.prototype._toGLTFV1 = UltraForge.prototype.toGLTF;
UltraForge.prototype.toGLTF = function (m) {
  const posBuf = Buffer.from(Float32Array.from(m.positions).buffer);
  let mx = 0;
  for (let i = 0; i < m.indices.length; i++) if (m.indices[i] > mx) mx = m.indices[i];
  const idx = mx > 65535;
  const idxArr = idx ? Uint32Array.from(m.indices) : Uint16Array.from(m.indices);
  const idxBuf = Buffer.from(idxArr.buffer);
  const nrmBuf = Buffer.from(Float32Array.from(m.normals && m.normals.length ? m.normals : new Array(m.positions.length).fill(0)).buffer);
  const uvArr = (m.uvs && m.uvs.length) ? m.uvs : new Array(m.positions.length / 3 * 2).fill(0);
  const uvBuf = Buffer.from(Float32Array.from(uvArr).buffer);
  const useC = m.colors && m.material && m.material.vertexColors && m.colors.length === m.positions.length;
  const colBuf = useC ? Buffer.from(Float32Array.from(m.colors).buffer) : null;
  const parts = [posBuf, idxBuf, nrmBuf, uvBuf].concat(colBuf ? [colBuf] : []);
  const all = Buffer.concat(parts);
  const b64 = all.toString('base64');
  const nv = m.positions.length / 3;
  const mat = m.material || { baseColor: [0.8, 0.8, 0.8], metallic: 0, roughness: 0.8 };
  let off = 0;
  const bP = off; off += posBuf.length; const bI = off; off += idxBuf.length; const bN = off; off += nrmBuf.length; const bU = off; off += uvBuf.length; const bC = off;
  const attrs = { POSITION: 0, NORMAL: 2, TEXCOORD_0: 3 };
  const accessors = [
    { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', max: [1, 1, 1], min: [-1, -1, -1] },
    { bufferView: 1, componentType: idx ? 5125 : 5123, count: m.indices.length, type: 'SCALAR' },
    { bufferView: 2, componentType: 5126, count: nv, type: 'VEC3' },
    { bufferView: 3, componentType: 5126, count: nv, type: 'VEC2' },
  ];
  const views = [
    { buffer: 0, byteOffset: bP, byteLength: posBuf.length },
    { buffer: 0, byteOffset: bI, byteLength: idxBuf.length },
    { buffer: 0, byteOffset: bN, byteLength: nrmBuf.length },
    { buffer: 0, byteOffset: bU, byteLength: uvBuf.length },
  ];
  if (colBuf) { attrs.COLOR_0 = 4; accessors.push({ bufferView: 4, componentType: 5126, count: nv, type: 'VEC3' }); views.push({ buffer: 0, byteOffset: bC, byteLength: colBuf.length }); }
  const js = {
    asset: { version: '2.0', generator: 'osien-3d-forge-v2' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: m.name }], meshes: [{ name: m.name, primitives: [{ attributes: attrs, indices: 1, material: 0 }] }],
    materials: [{ name: 'mat', pbrMetallicRoughness: { baseColorFactor: [mat.baseColor[0], mat.baseColor[1], mat.baseColor[2], 1], metallicFactor: mat.metallic || 0, roughnessFactor: mat.roughness === undefined ? 0.8 : mat.roughness } }],
    accessors: accessors, bufferViews: views,
    buffers: [{ byteLength: all.length, uri: 'data:application/octet-stream;base64,' + b64 }],
  };
  return JSON.stringify(js);
};

// ---------- V2.1 example library (1040+ recipes; lazy require, fully backward compatible) ----------
UltraForge.listExamples = function (filter) {
  try { return require('./examples/catalog.js').search(filter || {}); }
  catch (e) { return []; }
};
UltraForge.exampleRecipe = function (idOrPath) {
  try { return require('./examples/catalog.js').resolve(idOrPath); }
  catch (e) { return null; }
};
UltraForge.fromExample = function (idOrPath, opts) { // -> {mesh, stats, recipe}; builds a library example
  opts = opts || {};
  const rec = UltraForge.exampleRecipe(idOrPath);
  if (!rec) throw new Error('example not found: ' + idOrPath + ' (try UltraForge.listExamples({query:...}))');
  const forge = new UltraForge({ seed: opts.seed !== undefined ? opts.seed : (rec.seed || 1337) });
  return forge.buildExample(idOrPath, opts);
};
UltraForge.prototype.buildExample = function (idOrPath, opts) { // instance version, honors recipe params
  const rec = UltraForge.exampleRecipe(idOrPath);
  if (!rec) throw new Error('example not found: ' + idOrPath);
  opts = opts || {};
  const qopts = {};
  if (rec.params) {
    if (rec.params.quality) qopts.quality = rec.params.quality;
    if (rec.params.style) qopts.style = rec.params.style;
    if (rec.params.material) qopts.material = rec.params.material;
    if (rec.params.poly) qopts.polyBudget = rec.params.poly;
  }
  for (const k of ['quality', 'style', 'material', 'polyBudget']) if (opts[k] !== undefined) qopts[k] = opts[k];
  const r = this.quick(rec.prompt, qopts);
  r.recipe = rec;
  return r;
};

Object.assign(module.exports, { UltraForge: UltraForge, QUALITY_PRESETS: QUALITY_PRESETS, MATERIAL_PRESETS: MATERIAL_PRESETS, V2_KITS: V2_KITS, ALL_KITS: ALL_KITS });
// ---------- v2.2 VEGETATION-ULTRA (perfect grass + bush; auto-registers, extends ALL_KITS) ----------
try {
  const _veg = require('./vegetation.js');
  const _r = _veg.registerVegetation(UltraForge);
  if (_r && _r.VEG_KITS) {
    for (const k of _r.VEG_KITS) if (ALL_KITS.indexOf(k) === -1) ALL_KITS.push(k);
    module.exports.VEG_KITS = _r.VEG_KITS;
  }
} catch (e) { /* vegetation optional — v1/v2 still work without it */ }
// ---------- v2.3 WATER-ULTRA (very high quality water; auto-registers, extends ALL_KITS) ----------
try {
  const _wat = require('./water.js');
  const _wr = _wat.registerWater(UltraForge);
  if (_wr && _wr.WATER_KITS) {
    for (const k of _wr.WATER_KITS) if (ALL_KITS.indexOf(k) === -1) ALL_KITS.push(k);
    module.exports.WATER_KITS = _wr.WATER_KITS;
  }
} catch (e) { /* water optional — earlier versions still work without it */ }
// ---------- v2.4 HUMAN-PLAYERS (24 rigged archetypes; auto-registers, extends ALL_KITS) ----------
try {
  const _hum = require('./humans.js');
  const _hr = _hum.registerHumans(UltraForge);
  if (_hr && _hr.HUMAN_KITS) {
    for (const k of _hr.HUMAN_KITS) if (ALL_KITS.indexOf(k) === -1) ALL_KITS.push(k);
    module.exports.HUMAN_KITS = _hr.HUMAN_KITS;
  }
} catch (e) { /* humans optional — earlier versions still work without them */ }
// ---------- v2.4 GAME-ANIMATIONS (32 procedural clips + pose sampler) ----------
try {
  const _anm = require('./animations.js');
  const _ar = _anm.registerAnimations(UltraForge);
  if (_ar && _ar.ANIM_CLIPS) module.exports.ANIM_CLIPS = _ar.ANIM_CLIPS;
} catch (e) { /* animations optional — meshes still work without them */ }
