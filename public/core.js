// Shared logic (runs in the browser AND in Node). No dependencies.
(function (root) {
  const R = 6371000; // Earth radius in metres

  function haversine(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }

  // seconds per km, or null when there is not enough data
  function paceFrom(sec, meters) {
    if (!(meters >= 5) || !(sec > 0)) return null;
    return sec / (meters / 1000);
  }

  function fmtPace(secPerKm) {
    if (!secPerKm || !isFinite(secPerKm) || secPerKm > 3600) return '--:--';
    let m = Math.floor(secPerKm / 60);
    let s = Math.round(secPerKm % 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}:${pad2(s)}`;
  }

  function speedKmh(sec, meters) {
    return sec > 0 ? (meters / sec) * 3.6 : 0;
  }

  function downsample(points, max) {
    if (points.length <= max) return points.slice();
    const step = points.length / max;
    const out = [];
    for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]);
    out.push(points[points.length - 1]);
    return out;
  }

  // route: [[lat,lng],...] -> [[x,y],...] fitted inside a size x size box
  function projectRoute(route, size, pad) {
    if (!route || route.length < 2) return [];
    const lats = route.map((p) => p[0]);
    const lngs = route.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = (maxLng - minLng) * k;
    const h = maxLat - minLat;
    const scale = (size - 2 * pad) / Math.max(w, h, 1e-9);
    const ox = (size - w * scale) / 2;
    const oy = (size - h * scale) / 2;
    return route.map((p) => [ox + (p[1] - minLng) * k * scale, oy + (maxLat - p[0]) * scale]);
  }

  // Turns raw GPS fixes into a clean distance, splits and current speed.
  class Tracker {
    constructor(opts) {
      this.o = Object.assign({ maxAcc: 35, maxSpeed: 12, minMove: 3, windowMs: 30000 }, opts || {});
      this.reset();
    }
    reset() {
      this.points = [];
      this.distance = 0;
      this.marks = []; // elapsed ms at each full km
      this.last = null;
      this.lastElapsed = 0;
      this.recent = [];
      this.badStreak = 0;
    }
    breakSegment() { this.last = null; } // call on pause so the gap is not counted

    _accept(pt, elapsed, d) {
      this.distance += d;
      this.last = pt;
      this.lastElapsed = elapsed;
      this.badStreak = 0;
      this.points.push({ lat: pt.lat, lng: pt.lng });
      this.recent.push({ e: elapsed, d: this.distance });
    }

    add(pt, elapsedMs) {
      if (!(pt.acc <= this.o.maxAcc)) return false; // poor accuracy (also catches NaN)
      if (!this.last) { this._accept(pt, elapsedMs, 0); return true; }
      const dt = (pt.t - this.last.t) / 1000;
      if (dt <= 0) return false;
      const d = haversine(this.last, pt);
      if (d / dt > this.o.maxSpeed) { // GPS jump
        if (++this.badStreak >= 5) this._accept(pt, elapsedMs, 0); // re-anchor
        return false;
      }
      if (d < this.o.minMove) return false; // jitter while standing still
      const prev = this.distance;
      const next = prev + d;
      for (let k = Math.floor(prev / 1000) + 1; k * 1000 <= next; k++) {
        const frac = (k * 1000 - prev) / d;
        this.marks.push(this.lastElapsed + frac * (elapsedMs - this.lastElapsed));
      }
      this._accept(pt, elapsedMs, d);
      return true;
    }

    // seconds for each completed km
    splitTimes() {
      return this.marks.map((m, i) => (m - (i ? this.marks[i - 1] : 0)) / 1000);
    }

    // current speed in m/s over the last ~30 s, or null if unknown
    currentSpeed(elapsedMs) {
      while (this.recent.length && elapsedMs - this.recent[0].e > this.o.windowMs) this.recent.shift();
      if (!this.recent.length) return this.points.length ? 0 : null;
      const first = this.recent[0];
      const span = (elapsedMs - first.e) / 1000;
      if (span < 5) return null;
      return (this.distance - first.d) / span;
    }
  }

  const api = { haversine, fmtTime, paceFrom, fmtPace, speedKmh, downsample, projectRoute, Tracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RunCore = api;
})(typeof self !== 'undefined' ? self : this);
