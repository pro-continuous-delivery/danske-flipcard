// Run: node tools/bump_version.js
// Rewrites CACHE_VERSION in sw.js with a hash of every cached file, so the
// service worker (and its cache) updates whenever anything changes. Idempotent:
// running it twice without changes yields the same version.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const swPath = path.join(root, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'))
  .filter((f) => f !== './');
const h = crypto.createHash('sha1');
for (const f of files) h.update(f).update(fs.readFileSync(path.join(root, f)));
const v = 'v' + h.digest('hex').slice(0, 10);
fs.writeFileSync(swPath, sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${v}';`));
console.log('sw.js CACHE_VERSION =', v);
