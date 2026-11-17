// Run: node tools/test_srs.js   (no dependencies)
const assert = require('node:assert/strict');
const S = require('../srs.js');

const deck = [
  { id: 'a', type: 'verb', conjugation: 1, prefixed: false },
  { id: 'b', type: 'verb', conjugation: 3, prefixed: true },
  { id: 'c', type: 'adjective' },
  { id: 'd', type: 'adverb' },
];
const T = 20000; // arbitrary "today"
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('new card + knew -> box 2, due in 2 days', () => {
  const s = S.emptyState(); const c = S.grade(s, 'a', true, T);
  assert.equal(c.box, 2); assert.equal(c.due, T + 2);
});
t('box climbs to 5 and caps, with intervals 1/2/4/8/16', () => {
  const s = S.emptyState(); const seen = [];
  for (let i = 0; i < 6; i++) { const c = S.grade(s, 'a', true, T); seen.push([c.box, c.due - T]); }
  assert.deepEqual(seen, [[2, 2], [3, 4], [4, 8], [5, 16], [5, 16], [5, 16]]);
});
t('miss -> box 1, due today, from any box', () => {
  const s = S.emptyState();
  for (let i = 0; i < 4; i++) S.grade(s, 'a', true, T);
  const c = S.grade(s, 'a', false, T);
  assert.equal(c.box, 1); assert.equal(c.due, T); assert.equal(c.miss, 1);
});
t('queue: due first (most overdue first), then new', () => {
  const s = S.emptyState();
  s.cards.c = { box: 3, due: T - 5, seen: 1, miss: 0 };
  s.cards.b = { box: 2, due: T - 1, seen: 1, miss: 0 };
  s.cards.d = { box: 4, due: T + 3, seen: 1, miss: 0 }; // not due
  const q = S.buildQueue(deck, s, S.defaultSettings(), T, false);
  assert.deepEqual(q, ['c', 'b', 'a']);
});
t('shuffle keeps due ahead of new', () => {
  const s = S.emptyState();
  s.cards.c = { box: 1, due: T, seen: 1, miss: 0 };
  for (let k = 0; k < 20; k++) {
    const q = S.buildQueue(deck, s, S.defaultSettings(), T, true, Math.random);
    assert.equal(q[0], 'c'); assert.equal(q.length, 4);
  }
});
t('filters: word type, conjugation, base only', () => {
  const s = S.emptyState(); const f = S.defaultSettings(); const q = (o) => S.buildQueue(deck, s, { ...f, ...o }, T, false);
  assert.deepEqual(q({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(q({ type: 'verb' }), ['a', 'b']);
  assert.deepEqual(q({ type: 'adjective' }), ['c']);
  assert.deepEqual(q({ type: 'verb', conj: '3' }), ['b']);
  assert.deepEqual(q({ type: 'verb', baseOnly: true }), ['a']);
  assert.deepEqual(q({ conj: '3', baseOnly: true }), ['a', 'b', 'c', 'd']);   // verb-only filters ignored unless type=verb
});
t('streak: same day no double count, next day +1, gap resets', () => {
  const s = S.emptyState();
  S.grade(s, 'a', true, T); S.grade(s, 'b', true, T);
  assert.equal(s.streak.count, 1);
  S.grade(s, 'a', true, T + 1); assert.equal(s.streak.count, 2);
  assert.equal(S.currentStreak(s, T + 1), 2);
  assert.equal(S.currentStreak(s, T + 2), 2);   // still alive until end of that day
  assert.equal(S.currentStreak(s, T + 3), 0);   // missed a full day
  S.grade(s, 'a', true, T + 5); assert.equal(s.streak.count, 1); assert.equal(s.streak.best, 2);
});
t('dayNum rolls over at local midnight', () => {
  const a = S.dayNum(new Date(2026, 5, 1, 23, 59, 59)), b = S.dayNum(new Date(2026, 5, 2, 0, 0, 1));
  assert.equal(b - a, 1);
});
t('boxCounts and mastery', () => {
  const s = S.emptyState();
  s.cards.a = { box: 4, due: T + 8, seen: 3, miss: 0 };
  s.cards.b = { box: 1, due: T, seen: 1, miss: 1 };
  const bc = S.boxCounts(deck, s, T);
  assert.deepEqual(bc.counts, [2, 1, 0, 0, 1, 0]); assert.equal(bc.due, 1);
  const m = S.mastery(deck, s);
  assert.deepEqual(m.verb, { total: 2, seen: 2, mastered: 1 });
  assert.deepEqual(m.adjective, { total: 1, seen: 0, mastered: 0 });
});
t('export -> import round trip', () => {
  const s = S.emptyState(); S.grade(s, 'a', true, T); S.grade(s, 'b', false, T);
  const back = S.sanitizeImport(JSON.parse(JSON.stringify({ version: 1, state: s })));
  assert.deepEqual(back, s);
});
t('import rejects junk and drops bad cards', () => {
  assert.throws(() => S.sanitizeImport({ hello: 1 }));
  assert.throws(() => S.sanitizeImport(null));
  assert.throws(() => S.sanitizeImport({ version: 2, cards: {} }));
  const ok = S.sanitizeImport({ version: 1, cards: { a: { box: 9, due: 1 }, b: { box: 2, due: T } } });
  assert.deepEqual(Object.keys(ok.cards), ['b']);
});
console.log(`\n${n} tests passed`);
