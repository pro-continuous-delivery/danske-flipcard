/* UI + storage. Spaced-repetition rules live in srs.js. */
(function () {
  'use strict';
  var KEY = 'dansk-verber-v1';
  var $ = function (id) { return document.getElementById(id); };

  var deck = [], forms = [], byId = {};
  var state = load();
  var memoryOnly = false;               // true if localStorage is unavailable
  var session = { queue: [], requeued: {}, current: null, total: 0, done: 0 };
  var flipped = false, busy = false;

  /* ---------- storage (always try/catch: Safari private mode, quota, cleared data) ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return SRS.sanitizeImport(JSON.parse(raw));
    } catch (e) { /* fall through to empty state */ }
    return SRS.emptyState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!memoryOnly) { memoryOnly = true; toast('Storage unavailable – progress will not be saved. Use Export.'); } }
  }

  /* ---------- helpers ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var today = function () { return SRS.dayNum(); };

  var TYPE_LABEL = { verb: 'Verb', adjective: 'Adjective', adverb: 'Adverb' };


  /* ---------- study ---------- */
  function startSession() {
    var s = state.settings;
    session.queue = SRS.buildQueue(deck, state, s, today(), s.shuffle);
    session.requeued = {}; session.total = session.queue.length; session.done = 0;
    next();
  }

  function next() {
    var id = session.queue.shift();
    session.current = id ? byId[id] : null;
    renderCard();
  }

  function renderCard() {
    var c = session.current, s = state.settings;
    var card = $('card');
    // Reset to the front without animating, so the next answer never flashes.
    card.classList.add('notrans'); card.classList.remove('flipped'); flipped = false;
    $('empty').hidden = !!c; $('swipe').hidden = !c;
    $('actions').hidden = !c; $('hint').hidden = !c;
    $('left').textContent = c ? (session.queue.length + 1) + ' left' : '';
    $('modechip').textContent = s.reverse ? 'English → Danish' : '';
    $('btn-know').disabled = $('btn-miss').disabled = true;
    if (!c) { renderEmpty(); void card.offsetWidth; card.classList.remove('notrans'); return; }

    var isVerb = c.type === 'verb';
    // Edge colour: verbs = conjugation group (as in the PDF); adjectives / adverbs have their own colour.
    var edge = isVerb ? 'var(--c' + c.conjugation + ')' : c.type === 'adjective' ? 'var(--adj)' : 'var(--adv)';
    var front = $('front'), back = $('back');
    front.textContent = ''; back.textContent = '';
    front.style.setProperty('--conj', edge); back.style.setProperty('--conj', edge);

    var da = el('div', 'word');
    if (isVerb) { da.appendChild(el('span', 'at', 'at ')); da.appendChild(document.createTextNode(c.danish.replace(/^at /, ''))); }
    else da.textContent = c.danish;
    var en = el('div', 'gloss', c.english);
    if (c.english.length > 26) en.style.fontSize = '24px';       // long glosses, e.g. movement/location pairs
    var rec = state.cards[c.id];
    var tagText = TYPE_LABEL[c.type] + (rec ? ' · box ' + rec.box : ' · new');

    front.appendChild(s.reverse ? en : da);
    front.appendChild(el('div', 'tag', tagText));

    // Back: the answer, then the verb forms (adjectives and adverbs are just word + meaning)
    back.appendChild(s.reverse ? da : en);
    if (isVerb) {
      var dl = el('dl', 'forms');
      [['IMP', c.imp], ['NU', c.nu], ['DATID', c.datid], ['PERF', c.perf]].forEach(function (p) {
        dl.appendChild(el('dt', null, p[0])); dl.appendChild(el('dd', null, p[1]));
      });
      back.appendChild(dl);
    }
    back.appendChild(el('div', 'tag', tagText));
    void card.offsetWidth; card.classList.remove('notrans');
    busy = false;
  }

  function renderEmpty() {
    var e = $('empty'); e.textContent = '';
    var bc = SRS.boxCounts(deck, state, today());
    var upcoming = Infinity;
    deck.forEach(function (d) {
      var c = state.cards[d.id];
      if (c && SRS.matches(d, state.settings) && c.due > today() && c.due < upcoming) upcoming = c.due;
    });
    e.appendChild(el('div', 'big', session.total ? '🎉' : '🤷'));
    e.appendChild(el('h2', null, session.total ? 'Session complete' : 'Nothing due'));
    var msg = session.total ? 'You reviewed ' + session.done + ' cards.' : 'No cards match these filters or everything is scheduled.';
    if (upcoming !== Infinity) msg += ' Next review ' + (upcoming - today() === 1 ? 'tomorrow' : 'in ' + (upcoming - today()) + ' days') + '.';
    e.appendChild(el('p', 'muted', msg));
    var b = el('button', 'btn plain', 'Start again'); b.type = 'button';
    b.addEventListener('click', startSession); e.appendChild(b);
  }

  function flip() {
    if (!session.current || busy) return;
    flipped = !flipped;
    $('card').classList.toggle('flipped', flipped);
    $('btn-know').disabled = $('btn-miss').disabled = !flipped;
  }

  // Grade the current card; `dir` (+1/-1) animates the card off-screen first.
  function answer(knew) {
    if (!session.current || !flipped || busy) return;
    busy = true;
    var c = session.current;
    SRS.grade(state, c.id, knew, today());
    save();
    session.done++;
    // A missed card comes back later in this same session (at most twice).
    if (!knew && (session.requeued[c.id] || 0) < 2) {
      session.requeued[c.id] = (session.requeued[c.id] || 0) + 1;
      session.queue.push(c.id);
    }
    var sw = $('swipe');
    sw.classList.remove('dragging');
    sw.style.transform = 'translateX(' + (knew ? 120 : -120) + '%) rotate(' + (knew ? 8 : -8) + 'deg)';
    sw.style.opacity = '0';
    setTimeout(function () {
      sw.classList.add('dragging');           // no transition while resetting
      sw.style.transform = ''; sw.style.opacity = ''; setTint(0, 0);
      void sw.offsetWidth; sw.classList.remove('dragging');
      next();
    }, 230);
  }

  function setTint(know, miss) {
    var t = document.querySelectorAll('.swipe-tint');
    t[0].style.opacity = know; t[1].style.opacity = miss;
  }

  /* Gestures: tap = flip; drag horizontally (only when flipped) = grade. */
  (function gestures() {
    var sw = $('swipe'), startX = 0, startY = 0, dx = 0, active = false, moved = false, THRESH = 90;
    sw.addEventListener('pointerdown', function (e) {
      if (busy) return;
      active = true; moved = false; dx = 0; startX = e.clientX; startY = e.clientY;
    });
    sw.addEventListener('pointermove', function (e) {
      if (!active) return;
      var ddx = e.clientX - startX, ddy = e.clientY - startY;
      if (!moved && Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) {
        moved = true;
        if (flipped) { sw.classList.add('dragging'); try { sw.setPointerCapture(e.pointerId); } catch (x) {} }
      }
      if (moved && flipped) {
        dx = ddx;
        sw.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 25 + 'deg)';
        var p = Math.min(Math.abs(dx) / THRESH, 1) * 0.85;
        setTint(dx > 0 ? p : 0, dx < 0 ? p : 0);
      }
    });
    function end(e) {
      if (!active) return; active = false;
      sw.classList.remove('dragging');
      if (moved && flipped && Math.abs(dx) > THRESH) { answer(dx > 0); return; }
      if (!moved) { if (e.type === 'pointerup') flip(); return; }   // a tap
      sw.style.transform = ''; setTint(0, 0);                         // drag too short: snap back
    }
    sw.addEventListener('pointerup', end);
    sw.addEventListener('pointercancel', function () { active = false; sw.classList.remove('dragging'); sw.style.transform = ''; setTint(0, 0); });
    $('card').addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') answer(true);
      else if (e.key === 'ArrowLeft') answer(false);
    });
  })();
  $('btn-know').addEventListener('click', function () { answer(true); });
  $('btn-miss').addEventListener('click', function () { answer(false); });

  /* ---------- progress ---------- */
  function renderProgress() {
    var v = $('view-progress'); v.textContent = '';
    var t = today(), bc = SRS.boxCounts(deck, state, t), m = SRS.mastery(deck, state);
    v.appendChild(el('h1', null, 'Progress'));
    var stats = el('div', 'stats');
    [[bc.due, 'due today'], [SRS.currentStreak(state, t), 'day streak'], [state.log[t] || 0, 'reviewed today']].forEach(function (s) {
      var d = el('div', 'stat'); d.appendChild(el('b', null, String(s[0]))); d.appendChild(el('span', null, s[1])); stats.appendChild(d);
    });
    v.appendChild(stats);
    v.appendChild(el('p', 'muted small', 'Best streak: ' + state.streak.best + ' days · Intervals: ' + SRS.INTERVALS.join(' / ') + ' days'));

    v.appendChild(el('h2', null, 'Cards per box'));
    var bars = el('div', 'bars'), max = Math.max.apply(null, bc.counts.concat([1]));
    bc.counts.forEach(function (n, i) {
      var b = el('div', 'bar'); b.appendChild(el('b', null, String(n)));
      var fill = el('i'); fill.style.height = Math.max(2, Math.round(n / max * 80)) + '%'; if (i === 0) fill.style.background = 'var(--line)';
      b.appendChild(fill); b.appendChild(document.createTextNode(i === 0 ? 'New' : 'Box ' + i)); bars.appendChild(b);
    });
    v.appendChild(bars);

    v.appendChild(el('h2', null, 'Mastery by word type'));
    v.appendChild(el('p', 'muted small', 'Dark = mastered (box 4–5), light = seen at least once.'));
    ['verb', 'adjective', 'adverb'].forEach(function (g) {
      var x = m[g]; if (!x) return;
      var r = el('div', 'm-row');
      r.appendChild(el('div', null, TYPE_LABEL[g] + 's — ' + x.mastered + '/' + x.total + ' mastered'));
      var meter = el('div', 'meter'), s1 = el('i', 'seen'), s2 = el('i', 'mast');
      s1.style.width = (x.seen / x.total * 100) + '%'; s2.style.width = (x.mastered / x.total * 100) + '%';
      meter.appendChild(s1); meter.appendChild(s2); r.appendChild(meter); v.appendChild(r);
    });
  }

  /* ---------- lookup ---------- */
  function renderLookup() {
    var q = $('q').value.trim().toLowerCase(), box = $('results'); box.textContent = '';
    if (q.length < 2) return;
    var shown = 0;
    function edgeOf(d) { return d.type === 'verb' ? 'var(--c' + d.conjugation + ')' : d.type === 'adjective' ? 'var(--adj)' : 'var(--adv)'; }
    function card(title, sub, edge) {
      var r = el('div', 'res'); if (edge) r.style.setProperty('--conj', edge);
      r.appendChild(el('b', null, title)); r.appendChild(el('div', 'sub', sub)); box.appendChild(r); shown++;
    }
    forms.forEach(function (f) {
      if (shown < 40 && f.form.toLowerCase().indexOf(q) === 0) {
        var c = deck.filter(function (d) { return d.danish === f.verb; })[0];
        card(f.form + ' → ' + f.verb, f.english + (c ? ' · ' + c.datid + ' / ' + c.perf : ''), c && edgeOf(c));
      }
    });
    deck.forEach(function (d) {
      if (shown < 40 && (d.danish.toLowerCase().indexOf(q) !== -1 || d.english.toLowerCase().indexOf(q) !== -1))
        card(d.danish + ' — ' + d.english,
          d.type === 'verb' ? 'IMP ' + d.imp + ' · NU ' + d.nu + ' · DATID ' + d.datid + ' · PERF ' + d.perf
                            : TYPE_LABEL[d.type], edgeOf(d));
    });
    if (!shown) box.appendChild(el('p', 'muted', 'No match.'));
  }
  $('q').addEventListener('input', renderLookup);

  /* ---------- settings ---------- */
  function initSettings() {
    var s = state.settings;
    // Progress files from the earlier verbs-only version carry a "group" setting; ignore it.
    if (['all', 'verb', 'adjective', 'adverb'].indexOf(s.type) < 0) s.type = 'all';
    delete s.group;
    $('f-type').value = s.type; $('f-conj').value = s.conj;
    $('f-base').checked = s.baseOnly;
    delete s.coreOnly;
    $('f-reverse').checked = s.reverse; $('f-shuffle').checked = s.shuffle;
    updateRows();
  }
  // Show only the filters that apply to the chosen word type.
  function updateRows() {
    var verb = $('f-type').value === 'verb';
    $('row-conj').hidden = $('row-base').hidden = !verb;
  }
  function onSettingChange() {
    var s = state.settings;
    s.type = $('f-type').value; s.conj = $('f-conj').value;
    s.baseOnly = $('f-base').checked;
    s.reverse = $('f-reverse').checked; s.shuffle = $('f-shuffle').checked;
    updateRows(); save(); startSession();
  }
  ['f-type', 'f-conj', 'f-base', 'f-reverse', 'f-shuffle'].forEach(function (id) { $(id).addEventListener('change', onSettingChange); });

  function updateAbout() {
    var a = $('about'); if (!a) return;
    var cnt = {}; deck.forEach(function (d) { cnt[d.type] = (cnt[d.type] || 0) + 1; });
    a.textContent = (cnt.verb || 0) + ' verbs · ' + (cnt.adjective || 0) + ' adjectives · ' + (cnt.adverb || 0) + ' adverbs · ' + forms.length + ' irregular verb forms' + (memoryOnly ? ' · Storage unavailable!' : '');
  }

  /* Export: share sheet on iOS (Save to Files / Drive), plain download elsewhere. */
  $('btn-export').addEventListener('click', function () {
    var json = JSON.stringify({ app: 'dansk-verber', version: 1, exportedAt: new Date().toISOString(), state: state }, null, 1);
    var name = 'dansk-verber-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    var file;
    try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Dansk verber progress' }).catch(function (e) {
        if (e && e.name !== 'AbortError') download(json, name);
      });
    } else download(json, name);
  });
  function download(text, name) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Progress exported.');
  }
  $('btn-import').addEventListener('click', function () { $('file-import').click(); });
  $('file-import').addEventListener('change', function (e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var imported = SRS.sanitizeImport(JSON.parse(r.result));
        var n = Object.keys(imported.cards).length;
        if (!confirm('Replace your current progress with this file (' + n + ' cards)?')) return;
        state = imported; save(); initSettings(); startSession(); renderProgress();
        toast('Imported ' + n + ' cards.');
      } catch (err) { toast('Import failed: ' + err.message); }
    };
    r.onerror = function () { toast('Could not read the file.'); };
    r.readAsText(f);
  });
  $('btn-reset').addEventListener('click', function () {
    if (!confirm('Delete ALL progress on this device? Export first if unsure.')) return;
    state = SRS.emptyState(); save(); initSettings(); startSession(); toast('Progress reset.');
  });

  /* ---------- navigation ---------- */
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-view');
      document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
      document.querySelectorAll('.tabs button').forEach(function (x) {
        var on = x === b; x.classList.toggle('active', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current');
      });
      if (name === 'progress') renderProgress();
      if (name === 'lookup') $('q').focus();
      $('view-' + name).scrollIntoView();
      document.querySelector('main').scrollTop = 0;
    });
  });

  /* ---------- boot ---------- */
  Promise.all([fetch('deck.json').then(function (r) { return r.json(); }), fetch('forms.json').then(function (r) { return r.json(); })])
    .then(function (res) {
      deck = res[0]; forms = res[1];
      deck.forEach(function (d) { byId[d.id] = d; });
      initSettings(); updateAbout(); startSession();
    })
    .catch(function () { $('left').textContent = 'Could not load the deck. Open the app once while online.'; });

  /* ---------- service worker (offline + updates) ---------- */
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () {});
    // When a new version takes over, reload once so the new files are used.
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !window.__reloaded) { window.__reloaded = true; location.reload(); }
    });
  }
})();
