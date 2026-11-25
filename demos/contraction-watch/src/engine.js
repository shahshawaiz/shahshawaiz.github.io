/* Pure logic: no DOM, storage, clock or network. All times are in SECONDS.
   Portable to the watch build. See README for where each threshold comes from. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CW = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CLINICAL = {
    termWeeks: 37,
    term: { windowSec: 3600, maxMeanIntervalSec: 300, minMeanDurationSec: 60, maxGapSec: 600 },
    preterm: { count20min: 4, count60min: 6 },
    tachysystole: { windowSec: 1800, maxCount: 15 },   // MORE than 15 in 30 min = >5 per 10 averaged
    prolongedSec: 120,
    hrHigh: 120, hrLow: 50                             // strictly outside this range
  };
  // Engineering choices, NOT medical standards.
  var TUNING = {
    minContractionSec: 10, abandonedSec: 600, hrSustainSec: 300, maxSampleGapSec: 10,
    smooth: 5, baselineSec: 180, minBaselineSec: 60,
    riseBpm: 8, riseHoldSec: 8, fallBpm: 4, fallHoldSec: 5,
    minEpisodeSec: 25, maxEpisodeSec: 120, abortEpisodeSec: 180,
    motionG: 0.15, maxMotionFraction: 0.2
  };

  function finite(x) { return typeof x === 'number' && isFinite(x); }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // ---- Bluetooth Heart Rate Measurement (0x2A37) ----
  function parseHeartRate(view) {
    if (!view || view.byteLength < 2) return null;
    var flags = view.getUint8(0), wide = flags & 1;
    if (wide && view.byteLength < 3) return null;
    var hr = wide ? view.getUint16(1, true) : view.getUint8(1);
    var contact = (flags & 4) ? !!(flags & 2) : null;    // null: sensor does not report contact
    return { hr: hr, contact: contact };
  }
  function validSample(s) {
    return !!s && finite(s.t) && finite(s.hr) && s.hr >= 30 && s.hr <= 220 && s.contact !== false;
  }

  // ---- Experimental heart-rate hint. Output is only ever a QUESTION to the user. ----
  function HrDetector() { this.reset(); }
  HrDetector.prototype.reset = function () {
    this.recent = []; this.base = []; this.lastT = null; this.ep = null; this.riseFrom = null;
    this.riseMotion = []; this.baseline = null; this.rejected = null;
  };
  HrDetector.prototype.push = function (s) {
    if (!validSample(s)) return null;
    if (this.lastT !== null && s.t <= this.lastT) return null;
    if (this.lastT !== null && s.t - this.lastT > TUNING.maxSampleGapSec) this.reset();
    this.lastT = s.t;
    this.recent.push(s.hr); if (this.recent.length > TUNING.smooth) this.recent.shift();
    var v = median(this.recent), moving = finite(s.motion) ? (s.motion > TUNING.motionG ? 1 : 0) : 0;

    if (this.ep) {
      var e = this.ep; e.motion.push(moving);
      if (s.t - e.start > TUNING.abortEpisodeSec) { this.reset(); this.rejected = 'sustained'; return null; }
      if (v < this.baseline + TUNING.fallBpm) {
        if (e.fallFrom === null) e.fallFrom = s.t;
        if (s.t - e.fallFrom >= TUNING.fallHoldSec) {
          var dur = e.fallFrom - e.start, mf = mean(e.motion);
          this.ep = null; this.riseFrom = null;
          if (mf > TUNING.maxMotionFraction) { this.rejected = 'motion'; return null; }
          if (dur < TUNING.minEpisodeSec) { this.rejected = 'short'; return null; }
          if (dur > TUNING.maxEpisodeSec) { this.rejected = 'long'; return null; }
          this.rejected = null;
          return { start: e.start, end: e.fallFrom, motionKnown: finite(s.motion) };
        }
      } else e.fallFrom = null;
      return null;
    }

    var b = this.base;
    while (b.length && s.t - b[0].t > TUNING.baselineSec) b.shift();
    var ready = b.length > 1 && s.t - b[0].t >= TUNING.minBaselineSec;
    if (ready) this.baseline = median(b.map(function (x) { return x.v; }));
    if (ready && v >= this.baseline + TUNING.riseBpm) {
      if (this.riseFrom === null) { this.riseFrom = s.t; this.riseMotion = []; }
      this.riseMotion.push(moving);
      if (s.t - this.riseFrom >= TUNING.riseHoldSec) {
        this.ep = { start: this.riseFrom, fallFrom: null, motion: this.riseMotion.slice() };
      }
    } else { this.riseFrom = null; b.push({ t: s.t, v: v }); }
    return null;
  };

  // ---- Sustained resting maternal heart rate ----
  function VitalsMonitor() { this.last = null; this.side = null; this.since = null; this.state = null; }
  VitalsMonitor.prototype.push = function (s) {
    if (!validSample(s) || (this.last !== null && s.t <= this.last)) return this.state;
    var gap = this.last !== null && s.t - this.last > TUNING.maxSampleGapSec;
    this.last = s.t;
    var side = s.hr > CLINICAL.hrHigh ? 'high' : s.hr < CLINICAL.hrLow ? 'low' : null;
    if (finite(s.motion) && s.motion > TUNING.motionG) side = null;
    if (gap || side !== this.side) { this.side = side; this.since = s.t; this.state = null; }
    if (side && s.t - this.since >= TUNING.hrSustainSec) this.state = side;
    return this.state;
  };

  // ---- Session: log + rules ----
  function Session(opts) {
    opts = opts || {};
    this.weeks = finite(opts.weeks) ? opts.weeks : null;
    this.events = []; this.active = null; this.suggestion = null; this.vitals = null;
    this.redFlags = {}; this.acked = {}; this.latched = {};
  }
  Session.prototype.start = function (t) {
    if (!finite(t) || this.active) return false;
    var last = this.events[this.events.length - 1];
    if (last && t < last.end) return false;
    this.suggestion = null;
    this.active = { start: t }; return true;
  };
  Session.prototype.stop = function (t) {
    if (!this.active || !finite(t) || t < this.active.start) return { ok: false, reason: 'not-active' };
    var d = t - this.active.start, st = this.active.start;
    this.active = null;
    if (d < TUNING.minContractionSec) return { ok: false, reason: 'too-short' };
    if (d >= TUNING.abandonedSec) {                    // forgotten stop: keep the start, drop the bogus length
      this._add({ start: st, end: st, source: 'tap', durationKnown: false });
      return { ok: true, reason: 'abandoned' };
    }
    this._add({ start: st, end: t, source: 'tap', durationKnown: true });
    return { ok: true, reason: 'logged' };
  };
  Session.prototype._add = function (e) {
    this.events.push(e); this.events.sort(function (a, b) { return a.start - b.start; });
  };
  Session.prototype.undo = function () { return this.events.pop() || null; };
  Session.prototype.suggest = function (ep) {
    if (!ep || this.active) return false;
    var hit = this.events.some(function (e) {          // 20 s margin: heart rate can lead or lag
      return ep.start <= e.end + 20 && ep.end >= e.start - 20;
    });
    if (hit) return false;
    this.suggestion = ep; return true;
  };
  Session.prototype.answer = function (yes) {
    var ep = this.suggestion; this.suggestion = null;
    if (!ep || !yes) return false;
    this._add({ start: ep.start, end: ep.end, source: 'hr-confirmed', durationKnown: false });
    return true;
  };
  Session.prototype._starts = function (now, win) {
    var a = this.events.filter(function (e) { return e.start > now - win && e.start <= now; });
    var n = a.length;
    if (this.active && this.active.start > now - win) n++;
    return n;
  };
  Session.prototype.stats = function (now) {
    var ev = this.events.filter(function (e) { return e.start > now - 3600 && e.start <= now; });
    var iv = [], du = [];
    ev.forEach(function (e, i) {
      if (i) iv.push(e.start - ev[i - 1].start);
      if (e.durationKnown) du.push(e.end - e.start);
    });
    return { count60: this._starts(now, 3600), meanInterval: mean(iv), meanDuration: mean(du) };
  };
  // Current unbroken run (no gap over 10 min), limited to the rule window.
  Session.prototype.progress = function (now) {
    var T = CLINICAL.term, run = [], i, e, iv = [], du = [];
    var ev = this.events.filter(function (x) {
      return x.start <= now && x.start >= now - T.windowSec - T.maxMeanIntervalSec;
    });
    for (i = ev.length - 1; i >= 0; i--) {
      e = ev[i];
      if ((run.length ? run[0].start : now) - e.start > T.maxGapSec) break;
      run.unshift(e);
    }
    run.forEach(function (x, k) {
      if (k) iv.push(x.start - run[k - 1].start);
      if (x.durationKnown) du.push(x.end - x.start);
    });
    return { count: run.length, span: run.length ? now - run[0].start : 0, interval: mean(iv),
      duration: du.length * 2 >= run.length ? mean(du) : null,
      count20: this._starts(now, 1200), count60: this._starts(now, 3600) };
  };
  Session.prototype._fiveOneOne = function (now) {
    var T = CLINICAL.term, p = this.progress(now);
    return p.count >= 2 && p.span >= T.windowSec && p.interval <= T.maxMeanIntervalSec &&
      p.duration !== null && p.duration >= T.minMeanDurationSec;
  };
  Session.prototype.remove = function (ev) {
    var i = this.events.indexOf(ev); if (i < 0) return false;
    this.events.splice(i, 1); return true;
  };
  var TEXT = {
    redflag: ['urgent', 'Warning symptom reported. Call your maternity unit or emergency services now.'],
    tachysystole: ['urgent', 'More than 5 contractions per 10 minutes, averaged over 30 minutes. Call your maternity unit now.'],
    prolonged: ['urgent', 'A contraction has lasted 2 minutes or more. If that is right, call your maternity unit now.'],
    preterm: ['urgent', 'Frequent contractions before 37 weeks, or week not set. Call your maternity unit now.'],
    vitals: ['call', 'Resting heart rate has stayed above 120 or below 50. Re-check it, then call your maternity unit.'],
    term511: ['call', '5-1-1 pattern: about every 5 minutes, 1 minute long, for 1 hour. Call your maternity unit.']
  };
  Session.prototype.evaluate = function (now) {
    var on = {}, self = this, C = CLINICAL;
    if (Object.keys(this.redFlags).some(function (k) { return self.redFlags[k]; })) on.redflag = 1;
    if (this._starts(now, C.tachysystole.windowSec) > C.tachysystole.maxCount) on.tachysystole = 1;
    if (this.active && now - this.active.start >= C.prolongedSec) on.prolonged = 1;
    this.events.forEach(function (e) {
      if (e.durationKnown && e.end - e.start >= C.prolongedSec && now - e.end < 1800) on.prolonged = 1;
    });
    var atTerm = this.weeks !== null && this.weeks >= C.termWeeks;
    if (!atTerm && (this._starts(now, 1200) >= C.preterm.count20min ||
                    this._starts(now, 3600) >= C.preterm.count60min)) on.preterm = 1;
    if (atTerm && this._fiveOneOne(now)) on.term511 = 1;
    if (this.vitals) on.vitals = 1;

    Object.keys(TEXT).forEach(function (id) {
      if (on[id]) { if (!self.acked[id]) self.latched[id] = 1; }
      else delete self.acked[id];                      // rearm once the condition clears
    });
    var alerts = Object.keys(TEXT).filter(function (id) { return on[id] || self.latched[id]; })
      .map(function (id) { return { id: id, level: TEXT[id][0], text: TEXT[id][1], current: !!on[id], latched: !!self.latched[id] }; });
    var level = alerts.some(function (a) { return a.level === 'urgent'; }) ? 'urgent' : alerts.length ? 'call' : 'none';
    return { level: level, alerts: alerts,
      message: level === 'none' ? 'No alert rule met. This is not an all-clear.' : alerts[0].text };
  };
  Session.prototype.ack = function (id) { delete this.latched[id]; this.acked[id] = 1; };
  Session.prototype.toJSON = function () {
    return { v: 1, weeks: this.weeks, events: this.events, active: this.active, redFlags: this.redFlags };
  };
  Session.from = function (o) {
    var s = new Session(o && typeof o === 'object' ? o : {});
    if (!o || o.v !== 1) return s;
    if (Array.isArray(o.events)) s.events = o.events.filter(function (e) {
      return e && finite(e.start) && finite(e.end) && e.end >= e.start;
    });
    if (o.active && finite(o.active.start)) s.active = { start: o.active.start };
    if (o.redFlags && typeof o.redFlags === 'object') s.redFlags = o.redFlags;
    return s;
  };

  return { CLINICAL: CLINICAL, TUNING: TUNING, Session: Session, HrDetector: HrDetector,
    VitalsMonitor: VitalsMonitor, parseHeartRate: parseHeartRate, validSample: validSample };
});
