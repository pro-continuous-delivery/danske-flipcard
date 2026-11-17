/* Leitner spaced-repetition logic. Pure functions, no DOM: usable from the
 * browser (window.SRS) and from node tests (module.exports). */
(function (root) {
  'use strict';

  // Review interval in days for boxes 1..5.
  var INTERVALS = [1, 2, 4, 8, 16];

  // Whole days since epoch in LOCAL time, so "today" flips at local midnight.
  function dayNum(date) {
    var d = date || new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  function defaultSettings() {
    // type: all | verb | adjective | adverb. conj/baseOnly only apply to verbs.
    return { type: 'all', conj: 'all', baseOnly: false, reverse: false, shuffle: false };
  }

  function emptyState() {
    return {
      version: 1,
      cards: {},                                  // id -> { box 1..5, due dayNum, seen, miss }
      streak: { last: null, count: 0, best: 0 },  // last = dayNum of last review
      log: {},                                    // dayNum -> number of reviews
      settings: defaultSettings()
    };
  }

  // Grade one review. Unseen cards behave as if they were in box 1.
  // Knew it -> next box (max 5), due after that box's interval.
  // Missed  -> back to box 1, still due today.
  function grade(state, id, knew, today) {
    var c = state.cards[id] || { box: 0, due: today, seen: 0, miss: 0 };
    c.seen++;
    if (knew) {
      c.box = Math.min(5, (c.box || 1) + 1);
      c.due = today + INTERVALS[c.box - 1];
    } else {
      c.box = 1;
      c.due = today;
      c.miss++;
    }
    state.cards[id] = c;
    touchStreak(state, today);
    state.log[today] = (state.log[today] || 0) + 1;
    return c;
  }

  // Streak = consecutive days with at least one review.
  function touchStreak(state, today) {
    var s = state.streak;
    if (s.last === today) return;
    s.count = (s.last === today - 1) ? s.count + 1 : 1;
    s.last = today;
    if (s.count > s.best) s.best = s.count;
  }

  // Streak as displayed today: it is broken if you skipped yesterday.
  function currentStreak(state, today) {
    var s = state.streak;
    return (s.last === today || s.last === today - 1) ? s.count : 0;
  }

  function matches(card, f) {
    if (f.type !== 'all' && card.type !== f.type) return false;
    // The verb-only filters apply only when the verb type is selected.
    if (f.type === 'verb') {
      if (f.conj !== 'all' && String(card.conjugation) !== String(f.conj)) return false;
      if (f.baseOnly && card.prefixed) return false;
    }
    return true;
  }

  function shuffleInPlace(a, rng) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Session queue: due cards first (most overdue first), then never-seen cards.
  // With shuffle on, each of the two groups is shuffled but due stays ahead of new.
  function buildQueue(deck, state, f, today, shuffle, rng) {
    var due = [], fresh = [];
    deck.forEach(function (card, i) {
      if (!matches(card, f)) return;
      var c = state.cards[card.id];
      if (!c) fresh.push(card.id);
      else if (c.due <= today) due.push({ id: card.id, due: c.due, i: i });
    });
    due.sort(function (a, b) { return a.due - b.due || a.i - b.i; });
    var dueIds = due.map(function (d) { return d.id; });
    if (shuffle) {
      var r = rng || Math.random;
      shuffleInPlace(dueIds, r);
      shuffleInPlace(fresh, r);
    }
    return dueIds.concat(fresh);
  }

  // Cards per box (0 = new), due-today count.
  function boxCounts(deck, state, today) {
    var counts = [0, 0, 0, 0, 0, 0], due = 0;
    deck.forEach(function (card) {
      var c = state.cards[card.id];
      if (!c) { counts[0]++; return; }
      counts[c.box]++;
      if (c.due <= today) due++;
    });
    return { counts: counts, due: due };
  }

  // Per word type: total, seen, mastered (box >= 4).
  function mastery(deck, state) {
    var out = {};
    deck.forEach(function (card) {
      var g = out[card.type] || (out[card.type] = { total: 0, seen: 0, mastered: 0 });
      g.total++;
      var c = state.cards[card.id];
      if (c) { g.seen++; if (c.box >= 4) g.mastered++; }
    });
    return out;
  }

  // Validate + sanitize imported progress. Returns a clean state or throws.
  function sanitizeImport(obj) {
    var s = obj && obj.state ? obj.state : obj;
    if (!s || typeof s !== 'object' || s.version !== 1 || typeof s.cards !== 'object' || s.cards === null)
      throw new Error('Not a progress file for this app');
    var out = emptyState();
    Object.keys(s.cards).forEach(function (id) {
      var c = s.cards[id];
      if (c && Number.isInteger(c.box) && c.box >= 1 && c.box <= 5 && Number.isInteger(c.due))
        out.cards[id] = { box: c.box, due: c.due, seen: c.seen | 0, miss: c.miss | 0 };
    });
    if (s.streak && Number.isInteger(s.streak.count))
      out.streak = { last: Number.isInteger(s.streak.last) ? s.streak.last : null,
                     count: s.streak.count, best: s.streak.best | 0 };
    if (s.log && typeof s.log === 'object')
      Object.keys(s.log).forEach(function (k) { if (Number.isInteger(+k)) out.log[k] = s.log[k] | 0; });
    if (s.settings && typeof s.settings === 'object')
      out.settings = Object.assign(defaultSettings(), s.settings);
    return out;
  }

  var api = {
    INTERVALS: INTERVALS, dayNum: dayNum, emptyState: emptyState, defaultSettings: defaultSettings,
    grade: grade, currentStreak: currentStreak, matches: matches, buildQueue: buildQueue,
    boxCounts: boxCounts, mastery: mastery, sanitizeImport: sanitizeImport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof window !== 'undefined' ? window : this);
