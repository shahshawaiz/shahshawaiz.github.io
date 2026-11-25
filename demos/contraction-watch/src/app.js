(function () {
'use strict';
var $ = function (i) { return document.getElementById(i); }, KEY = 'contraction-watch-live';
var mode = 'live', s, det, vit, hist, hints = 0, sim = null, scn = '', byT, simT = 0, playing = false, carry = 0, frame = 0;
var lastHr = null, lastT = -1e9, good = 0, note = '', storeOk = true, sig = '', logSig = '', lock = null;
var device = null, wantLink = false, btOk = false;
var FLAGS = { bleeding: 'Bleeding', water: 'Waters broke', movement: 'Baby moving less', pain: 'Constant severe pain', vision: 'Bad headache or vision changes', fever: 'Fever', faint: 'Faint or short of breath' };
var HOW = {
  b10: 'On the band: Settings, then Share HR, then switch it on.',
  b56: 'In the phone app (Zepp Life, formerly Mi Fit): Profile, your band, Activity heart rate sharing. Then start a workout on the band.',
  b789: 'Look in the band settings for Share HR or heart rate broadcast. Support varies by model and firmware, so it may be missing.',
  other: 'Look in the watch settings, and in the workout settings, for Share HR or heart rate broadcast. Not every model has it. If it is missing, use tap timing.'
};
function now() { return mode === 'sim' ? simT : Date.now() / 1000; }
function fmt(x) { if (x === null || x === undefined) return '--'; x = Math.round(x); return Math.floor(x / 60) + ':' + ('0' + x % 60).slice(-2); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function save() { if (mode !== 'live') return; try { localStorage.setItem(KEY, JSON.stringify(s)); storeOk = true; } catch (e) { storeOk = false; } }
function fresh() { det = new CW.HrDetector(); vit = new CW.VitalsMonitor(); hist = []; hints = 0; lastHr = null; lastT = -1e9; note = ''; sig = logSig = ''; }
function live() { mode = 'live'; playing = false; fresh(); var o = null; try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} s = CW.Session.from(o); sync(); }
function startSim(name) {
  mode = 'sim'; scn = name; fresh(); sim = CWSim.make(name, 1); simT = carry = 0; byT = {};
  sim.samples.forEach(function (x) { byT[x.t] = x; });
  s = new CW.Session({ weeks: sim.weeks }); playing = true; sync(); tab('track');
}
function sync() {
  $('weeks').value = s.weeks === null ? '' : s.weeks;
  $('simbar').hidden = $('player').hidden = mode !== 'sim';
  $('pname').textContent = mode === 'sim' ? CWSim.scenarios[scn].label : '';
  document.querySelectorAll('#flags button').forEach(function (b) { b.setAttribute('aria-pressed', !!s.redFlags[b.dataset.k]); });
  draw();
}
function sample(x) {
  if (!CW.validSample(x)) return false;
  if (hist.length && x.t <= hist[hist.length - 1].t) return false;
  lastHr = x.hr; lastT = x.t; hist.push(x);
  while (hist.length && hist[0].t < x.t - 3600) hist.shift();
  s.vitals = vit.push(x);
  var e = det.push(x);
  if (e && s.suggest(e)) { hints++; if (mode === 'live' && navigator.vibrate) navigator.vibrate(200); }
  return true;
}
function step() {
  if (simT >= sim.total) { playing = false; return; }
  if ($('auto').checked) sim.truth.forEach(function (e) { if (e.start === simT) s.start(simT); if (e.end === simT) s.stop(simT); });
  if (byT[simT]) sample(byT[simT]);
  s.evaluate(simT); simT++;
}
function tab(n) {
  document.querySelectorAll('nav button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === n); });
  ['track', 'connect', 'sim', 'checks'].forEach(function (k) { $('p-' + k).hidden = k !== n; });
  if (n === 'connect') { if (mode === 'sim') live(); checkBt(); }
  draw();
}
document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { tab(b.dataset.tab); }; });
$('chip').onclick = function () { tab('connect'); };
Object.keys(FLAGS).forEach(function (k) {
  var b = el('button', '', FLAGS[k]); b.dataset.k = k; b.setAttribute('aria-pressed', 'false');
  b.onclick = function () { s.redFlags[k] = !s.redFlags[k]; b.setAttribute('aria-pressed', s.redFlags[k]); save(); draw(); };
  $('flags').append(b);
});
Object.keys(CWSim.scenarios).forEach(function (k) { var b = el('button', '', CWSim.scenarios[k].label); b.onclick = function () { startSim(k); }; $('scns').append(b); });
$('exit').onclick = live;
$('play').onclick = function () { if (simT >= sim.total) startSim(scn); else playing = !playing; };
$('reset').onclick = function () { startSim(scn); };
$('weeks').onchange = function () { var v = parseFloat(this.value); s.weeks = v >= 20 && v <= 43 ? v : null; if (s.weeks === null) this.value = ''; save(); draw(); };
function wake(on) { if (on && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { lock = l; }, function () {}); else if (!on && lock) { lock.release(); lock = null; } }
$('tap').onclick = function () {
  var t = now(); note = '';
  if (s.active) { var r = s.stop(t).reason; note = r === 'too-short' ? 'Under 10 seconds, so not logged.' : r === 'abandoned' ? 'Over 10 minutes: logged, length not used.' : 'Logged.'; wake(false); }
  else if (s.start(t)) wake(mode === 'live');
  if (mode === 'live' && navigator.vibrate) navigator.vibrate(40);
  save(); draw();
};
$('yes').onclick = function () { s.answer(true); save(); draw(); };
$('no').onclick = function () { s.answer(false); draw(); };
$('undo').onclick = function () { s.undo(); note = ''; save(); draw(); };
$('clear').onclick = function () { if (!confirm('Delete every logged contraction?')) return; s.events = []; s.active = null; s.suggestion = null; note = ''; save(); draw(); };

// ---- Watch connection ----
function done(i, v) { $('st' + i).classList.toggle('done', !!v); }
$('model').onchange = function () { $('how').textContent = HOW[this.value] || 'Choose a model first.'; done(1, this.value); };
$('shared').onchange = function () { done(2, this.checked); };
async function checkBt() {
  var m = '';
  if (!window.isSecureContext) m = 'Open this page from http://localhost:8137 or over HTTPS.';
  else if (!navigator.bluetooth) m = 'This browser cannot use Bluetooth. Open the page in Chrome on a computer or Android phone.';
  else try { if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) m = 'Bluetooth is off or blocked. Turn it on and allow Chrome to use it, then reopen this tab.'; } catch (e) {}
  btOk = !m; $('bt').textContent = m || 'Bluetooth is ready.'; $('bt').className = m ? 'bad' : 'mute'; $('ble').disabled = !btOk; done(3, btOk);
}
function say(t, bad) { $('blemsg').textContent = t; $('blemsg').className = bad ? 'bad' : ''; }
function reading(e) {
  if (mode !== 'live') return;
  var p = CW.parseHeartRate(e.target.value); if (!p) return;
  if (p.contact === false) { $('sigmsg').textContent = 'No skin contact. Tighten the strap.'; return; }
  if (sample({ t: Date.now() / 1000, hr: p.hr, contact: p.contact, motion: null })) good++;
  else if (p.hr === 0) $('sigmsg').textContent = 'Connected, but no pulse reading yet. Keep still for 30 seconds.';
  $('bpm').textContent = lastHr === null ? '--' : lastHr;
  if (good >= 5) { done(5, true); $('sigmsg').textContent = 'Signal confirmed. Movement is not shared, so expect false questions when you move.'; $('go').hidden = false; }
}
async function link() {
  var g = await device.gatt.connect(), sv = await g.getPrimaryService('heart_rate'), ch = await sv.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', reading);
  await ch.startNotifications();
  if (!wantLink) { g.disconnect(); return; }
  say('Connected.'); done(4, true); $('ble').hidden = true; $('dis').hidden = false;
}
function linkDown(t) { done(4, false); done(5, false); good = 0; $('bpm').textContent = '--'; $('go').hidden = true; $('ble').hidden = false; $('dis').hidden = true; $('sigmsg').textContent = 'Waiting for 5 good readings.'; say(t, wantLink); }
async function lost(ev) {
  if (ev.target !== device) return;
  if (!wantLink) { linkDown('Disconnected.'); return; }
  var d = device;
  for (var i = 1; i <= 3; i++) {
    linkDown('Connection lost. Reconnecting, try ' + i + ' of 3. Keep tapping.');
    await new Promise(function (r) { setTimeout(r, 2000 * i); });
    if (!wantLink || device !== d) return;
    try { await link(); return; } catch (e) {}
  }
  linkDown('Connection lost. Press Connect to try again. Tap timing still works.');
}
$('ble').onclick = async function () {
  this.disabled = true; say('Looking for watches...');
  try {
    var d = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    if (d !== device) d.addEventListener('gattserverdisconnected', lost);
    device = d; wantLink = true; good = 0; say('Connecting...'); await link();
  } catch (e) {
    wantLink = false;
    say(e.name === 'NotFoundError' ? 'No watch chosen. If yours was not listed, see the help below.' : 'Could not connect: ' + e.message, true);
  } finally { this.disabled = !btOk; }
};
$('dis').onclick = function () { wantLink = false; if (device && device.gatt.connected) device.gatt.disconnect(); linkDown('Disconnected.'); };
$('go').onclick = function () { tab('track'); };

// ---- Drawing ----
function meter(label, value, target, frac) {
  var m = el('div', 'm'), top = el('div'), b = el('b', '', value), bar = el('div', 'mb'), i = el('i');
  top.append(el('span', '', label), b); i.style.width = Math.max(0, Math.min(1, frac || 0)) * 100 + '%'; bar.append(i);
  m.append(top, bar, el('span', 'mute sm', target)); return m;
}
var NS = 'http://www.w3.org/2000/svg';
function sv(svg, tag, at, text) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); if (text !== undefined) e.textContent = text; svg.append(e); return e; }
function tipOn(e, text) { var t = $('tip'); t.textContent = text; t.hidden = false; t.style.left = Math.min(innerWidth - t.offsetWidth - 8, e.clientX + 12) + 'px'; t.style.top = e.clientY - 40 + 'px'; }
function tipOff() { $('tip').hidden = true; }
function charts(n) {
  var H = 120, B = 98, L = 36, w = $('tl').clientWidth; if (!w) return;
  var X = function (t) { return L + (t - n + 3600) / 3600 * (w - L - 8); };
  [$('tl'), $('hrc')].forEach(function (g) {
    g.textContent = ''; g.setAttribute('viewBox', '0 0 ' + w + ' ' + H);
    [60, 45, 30, 15, 0].forEach(function (m) { sv(g, 'text', { x: X(n - m * 60), y: 115, 'text-anchor': m === 60 ? 'start' : m ? 'middle' : 'end' }, m ? '-' + m + ' min' : 'now'); });
  });
  var g = $('tl'), ev = s.events.filter(function (e) { return e.start >= n - 3600; });
  var mx = Math.max(90, Math.max.apply(null, ev.map(function (e) { return e.durationKnown ? e.end - e.start : 0; }).concat(0)));
  var Y = function (d) { return B - d / mx * 88; };
  sv(g, 'line', { x1: L, x2: w - 8, y1: B, y2: B, 'class': 'gl' }); sv(g, 'line', { x1: L, x2: w - 8, y1: Y(60), y2: Y(60), 'class': 'tg' }); sv(g, 'text', { x: 0, y: Y(60) + 4 }, '1 min');
  var bw = Math.min(14, Math.max(5, (w - L) / 75));
  ev.forEach(function (e) {
    var d = e.durationKnown ? e.end - e.start : 12, txt = (e.durationKnown ? fmt(d) + ' long' : 'length unknown') + ', ' + fmt(n - e.start) + ' ago', x = X(e.start) - bw / 2;
    sv(g, 'rect', { x: x, y: Y(d), width: bw, height: B - Y(d), rx: 3, 'class': 'bar1', opacity: e.durationKnown ? 1 : .45 });
    var hit = sv(g, 'rect', { x: x - 6, y: 0, width: bw + 12, height: B, fill: 'transparent' }); hit.onpointermove = function (q) { tipOn(q, txt); }; hit.onpointerleave = tipOff;
  });
  if (!ev.length) sv(g, 'text', { x: w / 2, y: 55, 'text-anchor': 'middle' }, 'No contractions logged yet');
  g = $('hrc');
  if (!hist.length) { sv(g, 'text', { x: w / 2, y: 55, 'text-anchor': 'middle' }, 'No heart rate. Connect a watch to see it.'); return; }
  var lo = 50, hi = 130; hist.forEach(function (q) { lo = Math.min(lo, q.hr); hi = Math.max(hi, q.hr); });
  var V = function (v) { return B - (v - lo) / (hi - lo) * 88; }, path = '', p = null, stride = Math.max(1, Math.floor(hist.length / 700));
  [60, 90, 120].forEach(function (v) { sv(g, 'line', { x1: L, x2: w - 8, y1: V(v), y2: V(v), 'class': 'gl' }); sv(g, 'text', { x: 0, y: V(v) + 4 }, v); });
  hist.forEach(function (q, i) { if (q.t < n - 3600) return; if (p === null || q.t - p.t > 10) path += 'M' + X(q.t) + ' ' + V(q.hr); else if (i % stride === 0) path += 'L' + X(q.t) + ' ' + V(q.hr); p = q; });
  sv(g, 'path', { d: path, 'class': 'ln' });
}
$('hrc').onpointermove = function (e) {
  if (!hist.length) return; var n = now(), b = this.getBoundingClientRect(), t = n - 3600 + (e.clientX - b.left - 36) / (b.width - 44) * 3600, best = hist[0];
  hist.forEach(function (q) { if (Math.abs(q.t - t) < Math.abs(best.t - t)) best = q; });
  if (Math.abs(best.t - t) < 30) tipOn(e, best.hr + ' bpm, ' + fmt(n - best.t) + ' ago'); else tipOff();
};
$('hrc').onpointerleave = tipOff;
var lastChart = -1;
function draw() {
  var n = now(), r = s.evaluate(n), last = s.events[s.events.length - 1], on = !!s.active, el0 = on ? n - s.active.start : last ? n - last.start : 0, p = s.progress(n);
  $('chip').textContent = n - lastT <= 10 ? (mode === 'sim' ? 'Simulated: ' : 'Watch: ') + lastHr + ' bpm' : wantLink && mode === 'live' ? 'Watch: no signal' : 'Watch not connected';
  $('chip').className = 'chip' + (n - lastT <= 10 ? ' ok' : '');
  $('cap').textContent = on ? 'Contraction' : last ? 'Since last start' : 'Ready'; $('time').textContent = fmt(el0); $('act').textContent = on ? 'Tap to stop' : 'Tap to start'; $('tap').className = on ? 'on' : '';
  var c = 2 * Math.PI * 108, f = on ? Math.min(1, el0 / 120) : 0; $('ring').setAttribute('stroke-dasharray', f * c + ' ' + c); $('ring').style.opacity = f ? 1 : 0;
  $('sub').textContent = on ? 'Ring mark is 1 minute. A full ring is 2 minutes.' : note; $('ask').hidden = !s.suggestion; $('undo').disabled = !s.events.length;
  $('play').textContent = playing ? 'Pause' : 'Play';
  $('wkmsg').textContent = s.weeks === null ? 'Not set, so the cautious preterm rule applies.' : s.weeks < 37 ? 'Preterm rule in use.' : '5-1-1 rule in use.';
  var k = JSON.stringify(r) + storeOk;
  if (k !== sig) {
    sig = k; $('status').className = 'status ' + r.level; $('sic').textContent = r.level === 'none' ? 'i' : '!'; var box = $('alerts'); box.textContent = '';
    if (!r.alerts.length) box.append(el('p', '', r.message));
    r.alerts.forEach(function (a) { var d = el('div', 'row'); d.append(el('span', '', a.text)); if (a.latched) { var b = el('button', '', 'Got it'); b.onclick = function () { s.ack(a.id); draw(); }; d.append(b); } box.append(d); });
    if (!storeOk) box.append(el('p', 'bad', 'The log could not be saved on this device.'));
  }
  var ms = $('meters'); ms.textContent = '';
  if (s.weeks !== null && s.weeks >= 37) ms.append(
    meter('Average interval', fmt(p.interval), 'Rule: 5:00 or less', p.interval ? 300 / p.interval : 0),
    meter('Average length', fmt(p.duration), 'Rule: 1:00 or more', p.duration / 60),
    meter('Pattern running for', fmt(p.span), 'Rule: 60:00 without a 10 minute break', p.span / 3600));
  else ms.append(meter('In the last 20 minutes', p.count20, 'Rule: 4 or more', p.count20 / 4), meter('In the last 60 minutes', p.count60, 'Rule: 6 or more', p.count60 / 6));
  ms.append(el('p', 'mute sm', 'Heart rate questions asked: ' + hints));
  var ls = mode + s.events.length + (last ? last.start : '') + (s.events[0] ? s.events[0].start : '');
  if (ls !== logSig) {
    logSig = ls; var L = $('log'); L.textContent = '';
    if (!s.events.length) L.append(el('p', 'mute', 'Your contractions will appear here.'));
    s.events.slice().reverse().forEach(function (e) {
      var i = s.events.indexOf(e), d = el('div', 'lr'), x = el('button', '', 'Delete'), when = mode === 'sim' ? fmt(e.start) : new Date(e.start * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      x.setAttribute('aria-label', 'Delete contraction at ' + when); x.onclick = function () { s.remove(e); logSig = ''; save(); draw(); };
      d.append(el('span', '', when + (e.source === 'tap' ? '' : ' (from hint)')), el('span', '', e.durationKnown ? fmt(e.end - e.start) + ' long' : 'length unknown'), el('span', 'mute', i ? fmt(e.start - s.events[i - 1].start) + ' apart' : ''), x); L.append(d);
    });
  }
  var stamp = mode + Math.floor(mode === 'sim' ? simT / 5 : n) + s.events.length + innerWidth + $('p-track').hidden;
  if (stamp !== lastChart) { lastChart = stamp; charts(n); }
}
$('rt').onclick = function () {
  var r = CWTests.run(), bad = r.filter(function (x) { return !x.pass; }), box = $('tlist'), g = {}; box.textContent = '';
  $('tr').textContent = r.length - bad.length + ' of ' + r.length + ' passed'; $('tr').className = bad.length ? 'bad' : '';
  r.forEach(function (x) {
    if (!g[x.group]) { g[x.group] = el('details'); g[x.group].list = []; box.append(g[x.group]); }
    g[x.group].list.push(x);
  });
  Object.keys(g).forEach(function (k) { var l = g[k].list, ok = l.filter(function (x) { return x.pass; }).length; g[k].append(el('summary', ok < l.length ? 'bad' : '', k + ': ' + ok + '/' + l.length)); l.forEach(function (x) { g[k].append(el('div', x.pass ? 'mute' : 'bad', (x.pass ? 'Pass: ' : 'FAIL: ') + x.name + (x.error ? ' - ' + x.error : ''))); }); });
};
function tick(ms) { if (frame && mode === 'sim' && playing) { carry += Math.min(.25, (ms - frame) / 1000) * +$('speed').value; while (carry >= 1 && playing) { step(); carry--; } } if (!frame || ms - frame >= 0) frame = ms; draw(); requestAnimationFrame(tick); }
window.CWDemo = { startSim: startSim, live: live, tab: tab, session: function () { return s; }, advance: function (n) { playing = false; while (n--) step(); draw(); } };
$('model').onchange();
live(); tab('track'); requestAnimationFrame(tick);
if (/[?&]selftest/.test(location.search)) { var q = document.createElement('script'); q.src = 'test/ui.js'; document.body.append(q); }
})();
