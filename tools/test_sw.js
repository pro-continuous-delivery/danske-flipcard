// Run: node tools/test_sw.js  — exercises sw.js with a fake Cache API (no browser needed).
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const root = __dirname + '/..';
function boot(src, stores) {
  const handlers = {}, calls = { skip: 0, claim: 0 };
  const caches = {
    open: async (n) => { stores[n] = stores[n] || new Map(); const m = stores[n]; return {
      addAll: async (reqs) => reqs.forEach((r) => m.set(r.url || r, 'body:' + (r.url || r))) }; },
    keys: async () => Object.keys(stores),
    delete: async (k) => delete stores[k],
    match: async (req) => { for (const m of Object.values(stores)) { const u = req.url || req; if (m.has(u)) return m.get(u); } },
  };
  const self = { addEventListener: (t, f) => (handlers[t] = f), skipWaiting: async () => calls.skip++, clients: { claim: async () => calls.claim++ } };
  vm.runInNewContext(src, { self, caches, Request: class { constructor(u) { this.url = u; } }, fetch: async () => 'NETWORK' });
  const run = async (type, ev) => { let p; handlers[type]({ ...ev, waitUntil: (x) => (p = x), respondWith: (x) => (p = x) }); return p; };
  return { run, calls };
}
(async () => {
  const stores = {};
  const v1 = fs.readFileSync(root + '/sw.js', 'utf8');
  const a = boot(v1, stores);
  await a.run('install'); await a.run('activate');
  const name = Object.keys(stores)[0];
  const files = JSON.parse(v1.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  assert.equal(stores[name].size, files.length); assert(a.calls.skip && a.calls.claim);
  console.log('ok  - install precaches', files.length, 'files into', name);
  assert.equal(await a.run('fetch', { request: { method: 'GET', url: 'deck.json' } }), 'body:deck.json');
  assert.equal(await a.run('fetch', { request: { method: 'GET', url: 'other.json' } }), 'NETWORK');
  console.log('ok  - cache-first hit, network fallback on miss');
  // Simulate an update: new version string -> old cache deleted on activate.
  const v2 = v1.replace(/CACHE_VERSION = '[^']*'/, "CACHE_VERSION = 'vNEW'");
  const b = boot(v2, stores); await b.run('install'); await b.run('activate');
  assert.deepEqual(Object.keys(stores), ['dansk-verber-vNEW']);
  console.log('ok  - new version replaces the old cache');
  // Every precached file must exist on disk.
  files.filter((f) => f !== './').forEach((f) => assert(fs.existsSync(root + '/' + f), 'missing ' + f));
  console.log('ok  - all precached files exist');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
