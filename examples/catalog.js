'use strict';
/* UltraForge v2.1 example catalog — lazy-loading search over examples/index.json.
 * Stdlib only. Used by the engine (fromExample/listExamples), cli.js and bots.
 *
 *   const catalog = require('./catalog.js');
 *   catalog.count()                       // 1040
 *   catalog.listCategories()              // [{name, count, path}...]
 *   catalog.search({query:'dragon', limit:10})
 *   catalog.search({category:'natural', kit:'tree', difficulty:'beginner'})
 *   catalog.getById('nat-pine-tree-001')  // full recipe JSON
 *   catalog.getByName('Mossy Pine Tree 001')
 *   catalog.random('vehicles', 3)         // 3 full random recipes
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

let _manifest = null;
function manifest() {
  if (!_manifest) {
    _manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  }
  return _manifest;
}

function count() { return manifest().total; }

function listCategories() {
  const m = manifest();
  return Object.keys(m.categories).sort().map((name) => ({
    name, count: m.categories[name].count, path: m.categories[name].path,
  }));
}

function _norm(s) { return String(s || '').toLowerCase(); }

function search(opts) {
  opts = opts || {};
  const q = _norm(opts.query || opts.q);
  const cat = _norm(opts.category);
  const kit = _norm(opts.kit);
  const diff = _norm(opts.difficulty);
  const tag = _norm(opts.tag);
  const limit = Math.max(1, Math.min(500, parseInt(opts.limit, 10) || 20));
  const out = [];
  const entries = manifest().entries;
  for (let i = 0; i < entries.length && out.length < limit; i++) {
    const e = entries[i];
    if (cat && _norm(e.category) !== cat) continue;
    if (kit && _norm(e.kit) !== kit) continue;
    if (diff && _norm(e.difficulty) !== diff) continue;
    if (tag && e.tags.map(_norm).indexOf(tag) < 0) continue;
    if (q) {
      const hay = (e.id + ' ' + e.name + ' ' + e.prompt + ' ' + e.kit + ' ' + e.category + ' ' + e.tags.join(' ')).toLowerCase();
      if (q.split(/\s+/).every((w) => hay.indexOf(w) >= 0)) out.push(e);
      else continue;
    } else out.push(e);
  }
  return out;
}

function _loadFile(rel) {
  return JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));
}

function getById(id) {
  if (!id) return null;
  let s = String(id);
  if (s.endsWith('.json')) {
    const abs = path.isAbsolute(s) ? s : path.join(DIR, s);
    try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { return null; }
  }
  const m = manifest();
  const low = s.toLowerCase();
  for (const e of m.entries) {
    if (e.id === s || e.id.toLowerCase() === low) return _loadFile(e.file);
  }
  return null;
}

function getByName(name) {
  if (!name) return null;
  const low = String(name).toLowerCase();
  const m = manifest();
  for (const e of m.entries) {
    if (e.name.toLowerCase() === low || e.id.toLowerCase() === low) return _loadFile(e.file);
  }
  // fuzzy: unique substring match on name or id
  const hits = m.entries.filter((e) => e.name.toLowerCase().indexOf(low) >= 0 || e.id.toLowerCase().indexOf(low) >= 0);
  if (hits.length === 1) return _loadFile(hits[0].file);
  return hits.length ? _loadFile(hits[0].file) : null;
}

function resolve(idOrName) {
  return getById(idOrName) || getByName(idOrName);
}

// Seeded-safe quick RNG (Math.random is fine for "random example" UX).
function random(category, n) {
  n = Math.max(1, Math.min(50, parseInt(n, 10) || 1));
  const pool = category ? search({ category, limit: 500 }) : manifest().entries.slice();
  if (!pool.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(_loadFile(pool[Math.floor(Math.random() * pool.length)].file));
  return out;
}

module.exports = { manifest, count, listCategories, search, getById, getByName, resolve, random, dir: DIR };
