// Quick checks for the distance / pace logic. Run: node test.js
const assert = require('assert');
const C = require('./public/core.js');

// 1 degree of latitude is about 111.2 km
const km = C.haversine({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 });
assert(Math.abs(km - 1112) < 5, 'haversine off: ' + km);

assert.strictEqual(C.fmtTime(65), '1:05');
assert.strictEqual(C.fmtTime(3725), '1:02:05');
assert.strictEqual(C.fmtPace(330), '5:30');
assert.strictEqual(C.fmtPace(359.8), '6:00');
assert.strictEqual(C.fmtPace(null), '--:--');
assert.strictEqual(C.paceFrom(1800, 5000), 360); // 5 km in 30 min = 6:00/km
assert.strictEqual(C.speedKmh(1800, 5000).toFixed(1), '10.0');

// Simulate a 3 km run at 5:00/km (3.33 m/s), one GPS fix per second
const t = new C.Tracker();
const mPerDegLat = 111195;
let elapsed = 0;
for (let s = 0; s <= 910; s++) {
  elapsed = s * 1000;
  t.add({ lat: (s * (1000 / 300)) / mPerDegLat, lng: 0, t: 1e12 + elapsed, acc: 8 }, elapsed);
}
assert(Math.abs(t.distance - 3033) < 40, 'distance ' + t.distance);
const splits = t.splitTimes();
assert.strictEqual(splits.length, 3);
splits.forEach((s) => assert(Math.abs(s - 300) < 3, 'split ' + s));
const cur = t.currentSpeed(elapsed);
assert(Math.abs(cur - 3.33) < 0.1, 'current speed ' + cur);

// Bad accuracy and GPS jumps are ignored
const t2 = new C.Tracker();
t2.add({ lat: 0, lng: 0, t: 1e12, acc: 8 }, 0);
assert.strictEqual(t2.add({ lat: 0.001, lng: 0, t: 1e12 + 1000, acc: 80 }, 1000), false);
assert.strictEqual(t2.add({ lat: 0.05, lng: 0, t: 1e12 + 2000, acc: 8 }, 2000), false); // 5 km in 2 s
assert.strictEqual(t2.distance, 0);

console.log('All tests passed');
