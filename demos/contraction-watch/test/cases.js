(function (root) {
'use strict';
var C = [], g = '';
function group(n) { g = n; }
function test(n, f) { C.push({ group: g, name: n, fn: f }); }
function ok(x, m) { if (!x) throw new Error(m || 'expected truthy'); }
function eq(a, b) { if (a !== b) throw new Error('expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function S(w) { return new CW.Session({ weeks: w }); }
function add(s, t, d) { ok(s.start(t)); return s.stop(t + d); }
function fill(s, n, every, d) { for (var i = 0; i < n; i++) add(s, i * every, d); return (n - 1) * every + d; }
function has(s, now, id) { return s.evaluate(now).alerts.some(function (a) { return a.id === id; }); }
function dv() { return new DataView(new Uint8Array([].slice.call(arguments)).buffer); }
function detect(samples) { var d = new CW.HrDetector(), o = [];
  samples.forEach(function (x) { var e = d.push(x); if (e) o.push(e); }); return o; }
function series(n, f, m) { var a = []; for (var t = 0; t < n; t++) a.push({ t: t, hr: f(t), motion: m ? m(t) : 0.02 }); return a; }
function bump(a, b, x) { return function (t) { return t >= a && t < b ? 80 + x : 80; }; }

group('Tap logging');
test('start then stop logs duration', function () { var s = S(39); eq(add(s, 0, 60).reason, 'logged'); eq(s.events[0].end, 60); });
test('double start is ignored', function () { var s = S(39); s.start(0); eq(s.start(5), false); eq(s.active.start, 0); });
test('stop without start is rejected', function () { eq(S(39).stop(5).ok, false); });
test('9 s is an accidental tap', function () { var s = S(39); eq(add(s, 0, 9).reason, 'too-short'); eq(s.events.length, 0); });
test('10 s is kept', function () { eq(add(S(39), 0, 10).ok, true); });
test('599 s still has a duration', function () { var s = S(39); add(s, 0, 599); ok(s.events[0].durationKnown); });
test('600 s counts as a forgotten stop, occurrence kept', function () { var s = S(39); eq(add(s, 0, 600).reason, 'abandoned'); eq(s.events.length, 1); ok(!s.events[0].durationKnown); });
test('clock moving backwards cannot stop', function () { var s = S(39); s.start(100); eq(s.stop(50).ok, false); ok(s.active); });
test('overlapping start is rejected', function () { var s = S(39); add(s, 0, 60); eq(s.start(30), false); });
test('NaN time is rejected', function () { eq(S(39).start(NaN), false); });
test('undo removes last and is safe when empty', function () { var s = S(39); add(s, 0, 60); ok(s.undo()); eq(s.undo(), null); });

group('5-1-1 (term)');
test('every 5:00, 60 s, one hour: fires', function () { var s = S(39), n = fill(s, 13, 300, 60); ok(has(s, n, 'term511')); });
test('every 5:01 does not fire', function () { var s = S(39), n = fill(s, 13, 301, 60); ok(!has(s, n, 'term511')); });
test('59 s durations do not fire', function () { var s = S(39), n = fill(s, 13, 300, 59); ok(!has(s, n, 'term511')); });
test('55 minutes is not enough', function () { var s = S(39), n = fill(s, 12, 300, 60); ok(!has(s, n, 'term511')); });
test('every 4 min for over an hour: fires', function () { var s = S(39), n = fill(s, 17, 240, 70); ok(has(s, n, 'term511')); });
test('a gap over 10 minutes breaks the run', function () { var s = S(39); for (var i = 0; i < 18; i++) if (i < 7 || i > 10) add(s, i * 200, 60); ok(!has(s, 3660, 'term511')); });
test('stopped 11 minutes ago: not current', function () { var s = S(39), n = fill(s, 13, 300, 60); ok(!has(s, n + 660, 'term511')); });
test('unknown durations never satisfy it', function () { var s = S(39), n = fill(s, 13, 300, 60); s.events.forEach(function (e) { e.durationKnown = false; }); ok(!has(s, n, 'term511')); });
test('mostly unknown durations are not enough', function () { var s = S(39), n = fill(s, 13, 300, 60); s.events.forEach(function (e, i) { if (i > 1) e.durationKnown = false; }); ok(!has(s, n, 'term511')); });
test('not used before 37 weeks', function () { var s = S(36), n = fill(s, 13, 300, 60); ok(!has(s, n, 'term511')); });

group('Progress meters');
test('empty log has no averages', function () { var p = S(39).progress(0); eq(p.span, 0); eq(p.interval, null); eq(p.duration, null); });
test('reports span, interval and length', function () { var s = S(39), n = fill(s, 4, 300, 60), p = s.progress(n); eq(p.span, 960); eq(p.interval, 300); eq(p.duration, 60); });
test('run resets after 10 quiet minutes', function () { var s = S(39), n = fill(s, 4, 300, 60); eq(s.progress(n + 601).count, 0); });
test('remove deletes one entry only', function () { var s = S(39); fill(s, 3, 300, 60); ok(s.remove(s.events[1])); eq(s.events.length, 2); eq(s.remove({}), false); });

group('Preterm');
test('4 in 20 min at 36 weeks: urgent', function () { var s = S(36), n = fill(s, 4, 300, 40); eq(s.evaluate(n).level, 'urgent'); });
test('3 in 20 min: no alert', function () { var s = S(36), n = fill(s, 3, 300, 40); ok(!has(s, n, 'preterm')); });
test('6 in 60 min: fires', function () { var s = S(30), n = fill(s, 6, 600, 40); ok(has(s, n, 'preterm')); });
test('5 in 60 min: no alert', function () { var s = S(30), n = fill(s, 5, 700, 40); ok(!has(s, n, 'preterm')); });
test('active contraction counts', function () { var s = S(30); fill(s, 3, 300, 40); s.start(900); ok(has(s, 905, 'preterm')); });
test('exactly 37.0 weeks uses term rules', function () { var s = S(37), n = fill(s, 4, 300, 40); ok(!has(s, n, 'preterm')); });
test('36.9 weeks is preterm', function () { var s = S(36.9), n = fill(s, 4, 300, 40); ok(has(s, n, 'preterm')); });
test('week not set: uses the cautious preterm rule', function () { var s = S(), n = fill(s, 4, 300, 40); ok(has(s, n, 'preterm')); });

group('Urgent rules');
test('16 in 30 min: tachysystole', function () { var s = S(39), n = fill(s, 16, 112, 50); ok(has(s, n, 'tachysystole')); });
test('15 in 30 min: not tachysystole', function () { var s = S(39), n = fill(s, 15, 120, 50); ok(!has(s, n, 'tachysystole')); });
test('6 in one 10-min burst alone: not tachysystole', function () { var s = S(39), n = fill(s, 6, 100, 50); ok(!has(s, n, 'tachysystole')); });
test('119 s: not prolonged', function () { var s = S(39); add(s, 0, 119); ok(!has(s, 119, 'prolonged')); });
test('120 s: prolonged', function () { var s = S(39); add(s, 0, 120); ok(has(s, 120, 'prolonged')); });
test('fires while still in progress', function () { var s = S(39); s.start(0); ok(has(s, 120, 'prolonged')); });
test('warning symptom overrides a quiet log', function () { var s = S(39); s.redFlags.bleeding = true; eq(s.evaluate(0).level, 'urgent'); });
test('alert stays after condition clears until acknowledged', function () { var s = S(39); s.redFlags.x = true; s.evaluate(0); s.redFlags.x = false; ok(has(s, 1, 'redflag')); s.ack('redflag'); ok(!has(s, 2, 'redflag')); });
test('acknowledged but still true remains visible', function () { var s = S(39); s.redFlags.x = true; s.evaluate(0); s.ack('redflag'); var r = s.evaluate(1); eq(r.level, 'urgent'); eq(r.alerts[0].latched, false); });
test('alert rearms after clearing', function () { var s = S(39); s.redFlags.x = true; s.evaluate(0); s.ack('redflag'); s.redFlags.x = false; s.evaluate(1); s.redFlags.x = true; ok(s.evaluate(2).alerts[0].latched); });
test('urgent outranks call', function () { var s = S(39); s.vitals = 'high'; eq(s.evaluate(0).level, 'call'); s.redFlags.x = true; eq(s.evaluate(0).level, 'urgent'); });

group('Never falsely reassures');
test('empty log says it is not an all-clear', function () { ok(/not an all-clear/.test(S(39).evaluate(0).message)); });
test('irregular log never says false labour or safe', function () { var s = S(39); add(s, 0, 30); add(s, 1500, 30); ok(!/false|braxton|safe|fine|normal/i.test(s.evaluate(1600).message)); });

group('Heart-rate hint');
test('60 s rise of 15 bpm asks once', function () { eq(detect(series(400, bump(200, 260, 15))).length, 1); });
test('start and end within 8 s of truth', function () { var e = detect(series(400, bump(200, 260, 15)))[0]; ok(Math.abs(e.start - 200) <= 8); ok(Math.abs(e.end - 260) <= 8); });
test('flat heart rate: silent', function () { eq(detect(series(900, function () { return 80; })).length, 0); });
test('7 bpm rise is under threshold', function () { eq(detect(series(400, bump(200, 260, 7))).length, 0); });
test('15 s spike is too short', function () { eq(detect(series(400, bump(200, 215, 20))).length, 0); });
test('150 s rise is too long', function () { eq(detect(series(500, bump(200, 350, 20))).length, 0); });
test('sustained rise aborts, then rebaselines', function () { eq(detect(series(1200, function (t) { return t < 200 ? 80 : t >= 800 && t < 860 ? 120 : 100; })).length, 1); });
test('movement suppresses it', function () { eq(detect(series(400, bump(200, 260, 20), function (t) { return t >= 200 && t < 260 ? 0.4 : 0.02; })).length, 0); });
test('missing motion data is reported as unknown', function () { var a = series(400, bump(200, 260, 15)); a.forEach(function (x) { x.motion = null; }); eq(detect(a)[0].motionKnown, false); });
test('no baseline yet: silent', function () { eq(detect(series(100, bump(20, 80, 20))).length, 0); });
test('gap mid-rise drops the episode', function () { eq(detect(series(300, bump(200, 260, 15)).filter(function (x) { return x.t < 220 || x.t > 240; })).length, 0); });
test('0, 255, NaN and no-contact samples rejected', function () { [0, 255, NaN, null].forEach(function (h) { ok(!CW.validSample({ t: 0, hr: h })); }); ok(!CW.validSample({ t: 0, hr: 80, contact: false })); });
test('duplicate and reversed timestamps ignored', function () { var d = new CW.HrDetector(); d.push({ t: 5, hr: 80 }); d.push({ t: 5, hr: 90 }); d.push({ t: 4, hr: 90 }); eq(d.recent.length, 1); });

group('Hints need confirmation');
test('hint alone is never counted', function () { var s = S(30); for (var i = 0; i < 20; i++) s.suggest({ start: i * 100, end: i * 100 + 60 }); eq(s.events.length, 0); eq(s.evaluate(2000).level, 'none'); });
test('Yes logs occurrence without duration', function () { var s = S(39); s.suggest({ start: 0, end: 60 }); s.answer(true); eq(s.events[0].durationKnown, false); });
test('No logs nothing', function () { var s = S(39); s.suggest({ start: 0, end: 60 }); s.answer(false); eq(s.events.length, 0); });
test('confirmed hints count for frequency', function () { var s = S(30); for (var i = 0; i < 4; i++) { s.suggest({ start: i * 200, end: i * 200 + 60 }); s.answer(true); } ok(has(s, 700, 'preterm')); });
test('no duplicate of a tapped contraction', function () { var s = S(39); add(s, 100, 60); eq(s.suggest({ start: 110, end: 175 }), false); });
test('no hint while timing', function () { var s = S(39); s.start(0); eq(s.suggest({ start: 0, end: 40 }), false); });
test('a tap start clears a pending hint', function () { var s = S(39); s.suggest({ start: 0, end: 60 }); s.start(61); eq(s.suggestion, null); });

group('Resting heart rate');
function vit(hr, n, m, gap) { var v = new CW.VitalsMonitor(), st; for (var t = 0; t <= n; t++) { if (gap && t > 150 && t < 165) continue; st = v.push({ t: t, hr: hr, motion: m }); } return st; }
test('121 for 5 min: high', function () { eq(vit(121, 300, 0), 'high'); });
test('120 is not above 120', function () { eq(vit(120, 400, 0), null); });
test('49 for 5 min: low', function () { eq(vit(49, 300, 0), 'low'); });
test('50 is not below 50', function () { eq(vit(50, 400, 0), null); });
test('4:59 is not enough', function () { eq(vit(130, 299, 0), null); });
test('movement does not count as rest', function () { eq(vit(130, 400, 0.4), null); });
test('a gap restarts the timer', function () { eq(vit(130, 320, 0, true), null); });

group('Bluetooth packets');
test('8-bit rate', function () { eq(CW.parseHeartRate(dv(0, 82)).hr, 82); });
test('16-bit little-endian rate', function () { eq(CW.parseHeartRate(dv(1, 0x2C, 0x01)).hr, 300); });
test('contact lost', function () { eq(CW.parseHeartRate(dv(4, 80)).contact, false); });
test('contact present', function () { eq(CW.parseHeartRate(dv(6, 80)).contact, true); });
test('contact unsupported is unknown', function () { eq(CW.parseHeartRate(dv(0, 80)).contact, null); });
test('truncated packets are rejected', function () { eq(CW.parseHeartRate(dv(0)), null); eq(CW.parseHeartRate(dv(1, 80)), null); });

group('Save and restore');
test('round trip keeps log, active timer and flags', function () { var s = S(38); add(s, 0, 60); s.start(100); s.redFlags.x = true; var r = CW.Session.from(JSON.parse(JSON.stringify(s))); eq(r.events.length, 1); eq(r.active.start, 100); eq(r.weeks, 38); ok(has(r, 101, 'redflag')); });
test('corrupt data gives a usable session', function () { [null, {}, { v: 9 }, { v: 1, events: 'x' }, { v: 1, events: [null, { start: 'a' }] }].forEach(function (o) { eq(CW.Session.from(o).events.length, 0); }); });

group('Scenarios (synthetic)');
function run(name, seed) { var d = CWSim.make(name, seed), s = S(d.weeks), h = new CW.HrDetector(), v = new CW.VitalsMonitor(), seen = {}, hints = 0, by = {};
  d.samples.forEach(function (x) { by[x.t] = x; });
  for (var t = 0; t < d.total; t++) {
    d.truth.forEach(function (e) { if (e.start === t) s.start(t); if (e.end === t) s.stop(t); });
    if (by[t]) { if (h.push(by[t])) hints++; s.vitals = v.push(by[t]); }
    if (t % 5 === 0) s.evaluate(t).alerts.forEach(function (a) { seen[a.id] = 1; });
  } return { seen: Object.keys(seen).sort().join(), hints: hints, truth: d.truth.length }; }
var want = { term: 'term511', early: '', preterm: 'preterm', tachy: 'tachysystole', prolonged: 'prolonged', silent: 'term511', walking: '', stress: '', dropout: 'term511', fasthr: 'vitals' };
Object.keys(want).forEach(function (n) { test(n + ': alerts = ' + (want[n] || 'none') + ' (5 seeds)', function () { for (var i = 1; i <= 5; i++) eq(run(n, i).seen, want[n]); }); });
test('silent heart rate: 0 hints, so taps are essential', function () { eq(run('silent', 1).hints, 0); });
test('walking: 0 hints', function () { eq(run('walking', 1).hints, 0); });
test('KNOWN LIMIT: stress at rest does cause false hints', function () { ok(run('stress', 1).hints > 0); });

root.CWTests = { cases: C, run: function () { return C.map(function (c) {
  try { c.fn(); return { group: c.group, name: c.name, pass: true }; }
  catch (e) { return { group: c.group, name: c.name, pass: false, error: e.message }; } }); } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
