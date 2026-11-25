/* Opened with index.html?selftest. Uses a FAKE Bluetooth watch. Result goes in the page title. */
(async function () {
  var $ = function (i) { return document.getElementById(i); }, KEY = 'contraction-watch-live', keep = localStorage.getItem(KEY), n = 0, bad = [];
  function check(name, v) { n++; if (!v) bad.push(name); }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  try {
    localStorage.removeItem(KEY); CWDemo.live();
    $('rt').click(); check('engine suite ' + $('tr').textContent, /^(\d+) of \1 passed$/.test($('tr').textContent));
    $('weeks').value = 39; $('weeks').onchange(); $('tap').click(); check('timing', $('act').textContent === 'Tap to stop');
    CWDemo.session().active.start -= 60; $('tap').click(); check('logged', document.querySelectorAll('.lr').length === 1);
    CWDemo.live(); check('survives reload', CWDemo.session().events.length === 1);
    var before = localStorage.getItem(KEY); CWDemo.startSim('tachy'); CWDemo.advance(2800);
    check('sim urgent', /urgent/.test($('status').className)); check('sim labelled', !$('simbar').hidden); check('sim leaves real log alone', localStorage.getItem(KEY) === before);
    $('exit').click(); check('real log back', CWDemo.session().events.length === 1);
    document.querySelector('.lr button').click(); check('delete row', CWDemo.session().events.length === 0);
    document.querySelector('#flags button').click(); check('flag urgent', /urgent/.test($('status').className)); document.querySelector('#flags button').click();
    // fake watch
    var ch = new EventTarget(), dev = new EventTarget(), fail = false, joins = 0; ch.startNotifications = async function () {};
    dev.gatt = { connected: false, connect: async function () { if (fail) throw new Error('x'); joins++; this.connected = true; return this; }, getPrimaryService: async function () { return { getCharacteristic: async function () { return ch; } }; }, disconnect: function () { this.connected = false; dev.dispatchEvent(new Event('gattserverdisconnected')); } };
    var send = function (b) { ch.value = new DataView(new Uint8Array(b).buffer); ch.dispatchEvent(new Event('characteristicvaluechanged')); };
    var next = 'none'; Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { getAvailability: async function () { return true; }, requestDevice: async function () { if (next === 'none') { var e = new Error('cancel'); e.name = 'NotFoundError'; throw e; } return dev; } } });
    CWDemo.tab('connect'); await wait(20); check('bluetooth ready', $('st3').classList.contains('done'));
    $('model').value = 'b10'; $('model').onchange(); check('model steps', /Share HR/.test($('how').textContent));
    $('ble').click(); await wait(20); check('cancel explained', /No watch chosen/.test($('blemsg').textContent));
    next = 'dev'; $('ble').click(); await wait(20); check('connected', $('st4').classList.contains('done'));
    send([0, 0]); check('zero pulse explained', /no pulse/.test($('sigmsg').textContent)); send([4, 80]); check('contact loss explained', /skin contact/.test($('sigmsg').textContent));
    for (var i = 0; i < 5; i++) { send([0, 82 + i]); await wait(15); }
    check('signal confirmed', $('st5').classList.contains('done')); check('chip shows rate', /86 bpm/.test($('chip').textContent) || (CWDemo.tab('connect'), /86 bpm/.test($('chip').textContent)));
    dev.gatt.disconnect(); check('loss shown', /Reconnecting/.test($('blemsg').textContent)); await wait(2300); check('auto reconnect', joins === 2 && $('st4').classList.contains('done'));
    $('dis').click(); await wait(20); check('manual disconnect stays off', $('blemsg').textContent === 'Disconnected.'); await wait(2300); check('no reconnect', joins === 2);
  } catch (e) { bad.push('ERROR ' + e.message); }
  keep === null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, keep); CWDemo.live();
  document.title = 'UI ' + (n - bad.filter(function (b) { return !/^ERROR/.test(b); }).length) + '/' + n + (bad.length ? ' FAILED: ' + bad.join('; ') : ' passed');
  if (/shot/.test(location.search)) { CWDemo.startSim('term'); CWDemo.advance(4000); }
  if (/wiz/.test(location.search)) CWDemo.tab('connect');
})();
