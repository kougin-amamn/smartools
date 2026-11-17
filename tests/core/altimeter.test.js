/* 高度計の計算(docs/design/altimeter.md) */
const a = require('assert');
const C = require('../../tools/altimeter/altimeter-core.js');

/* T-01: 送る座標は小数3桁 */
a.equal(C.roundedCoordinateOf(35.681236), 35.681);
a.equal(C.roundedCoordinateOf(139.767125), 139.767);
a.equal(
  C.elevationUrlOf(35.681236, 139.767125),
  'https://api.open-meteo.com/v1/elevation?latitude=35.681&longitude=139.767',
);

/* T-02: 標高を取り直すのは初めてか 60m 以上動いた時 */
const here = { lat: 35.68, lon: 139.76 };
a.equal(C.needsElevationOf(null, here), true);
a.equal(C.needsElevationOf(here, { lat: 35.6802, lon: 139.76 }), false); // 約 22m
a.equal(C.needsElevationOf(here, { lat: 35.681, lon: 139.76 }), true); // 約 111m
a.ok(Math.abs(C.distanceOf(here, { lat: 35.681, lon: 139.76 }) - 111) < 1);

/* T-03: 精度の段階 */
a.equal(C.qualityOf(null), 'unknown');
a.equal(C.qualityOf(5), 'good');
a.equal(C.qualityOf(20), 'fair');
a.equal(C.qualityOf(45), 'poor');

/* T-04: 差の表示 */
a.equal(C.signedMetersOf(12.34), '+12.3 m');
a.equal(C.signedMetersOf(-3.06), '−3.1 m');
a.equal(C.signedMetersOf(0.01), '0.0 m');

a.deepEqual(C.recentOf([{ t: 0 }, { t: 500 }, { t: 900 }], 1000, 500), [{ t: 500 }, { t: 900 }]);
