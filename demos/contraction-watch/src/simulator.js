/* Synthetic signals only: useful for exercising code, not evidence of real-world accuracy. */
(function (root) {
  'use strict';
  function rng(seed) {
    return function () { seed = (seed + 0x6D2B79F5) | 0;
      var x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  var S = {
    term:     { label: 'Term, 5-1-1 pattern',        weeks: 39, every: 280, dur: 65, bump: 16, total: 4800 },
    early:    { label: 'Term, irregular and short',  weeks: 39, every: 720, jitter: 240, dur: 35, bump: 14, total: 5400 },
    preterm:  { label: 'Preterm, 33 weeks',          weeks: 33, every: 270, dur: 45, bump: 15, total: 3600 },
    tachy:    { label: 'Too frequent (tachysystole)',weeks: 40, every: 110, dur: 50, bump: 16, total: 3000 },
    prolonged:{ label: 'One prolonged contraction',  weeks: 39, every: 600, dur: 130, bump: 16, total: 1500 },
    silent:   { label: 'Contractions, no HR change', weeks: 39, every: 280, dur: 65, bump: 0,  total: 4800 },
    walking:  { label: 'Walking, no contractions',   weeks: 39, every: 0, walkEvery: 300, dur: 60, bump: 22, total: 3600 },
    stress:   { label: 'Still, HR spikes, no contractions', weeks: 39, every: 0, spikeEvery: 400, dur: 60, bump: 16, total: 3600 },
    dropout:  { label: 'Contractions, sensor dropouts', weeks: 39, every: 280, dur: 65, bump: 16, drop: true, total: 4800 },
    fasthr:   { label: 'Resting HR stays at 130',    weeks: 39, every: 0, base: 130, dur: 0, bump: 0, total: 1200 }
  };
  function make(name, seed) {
    var c = S[name], r = rng(seed || 1), truth = [], bumps = [], t, out = [];
    var step = c.every || c.walkEvery || c.spikeEvery;
    if (step) for (t = 240; t + c.dur < c.total; t += step + (c.jitter ? (r() * 2 - 1) * c.jitter : 0)) {
      var e = { start: Math.round(t), end: Math.round(t) + c.dur };
      bumps.push(e); if (c.every) truth.push(e);
    }
    for (t = 0; t < c.total; t++) {
      var hr = (c.base || 82) + (r() - 0.5) * 4, motion = 0.02 + r() * 0.03;
      bumps.forEach(function (b) {
        if (t < b.start || t > b.end + 10) return;
        var up = Math.min(1, (t - b.start) / 12), down = Math.min(1, Math.max(0, (b.end + 10 - t) / 15));
        hr += c.bump * Math.min(up, down);
        if (c.walkEvery) motion = 0.35 + r() * 0.2;
      });
      if (c.drop && t % 300 > 240 && t % 300 < 265) continue;
      out.push({ t: t, hr: Math.round(hr), motion: motion });
    }
    return { samples: out, truth: truth, weeks: c.weeks, total: c.total };
  }
  root.CWSim = { scenarios: S, make: make };
  if (typeof module === 'object' && module.exports) module.exports = root.CWSim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
