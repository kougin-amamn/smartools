/* launchers/launcher-3d の共通の計算(乱数・カテゴリ分け・カメラの姿勢と補間)。ES モジュールを require で読む(Node 22.12 以降) */
const C = require('../../launchers/launcher-3d/launcher-3d-core.js');
const a = require('assert');
const near = (x, y, what) => a.ok(Math.abs(x - y) < 1e-9, what + ': ' + x + ' (期待 ' + y + ')');

const r1 = C.randomOf(42),
  r2 = C.randomOf(42);
a.equal(r1(), r2(), '同じ種は同じ並び');
a.ok(r1() >= 0 && r1() < 1);

const tools = [];
for (let i = 0; i < 20; i++) tools.push({ slug: 't' + i, cat: i < 17 ? '定番' : 'QR' });
const groups = C.groupByCategory(tools, 15);
a.deepStrictEqual(
  groups.map((g) => [g.cat, g.tools.length]),
  [
    ['定番 1/2', 9],
    ['定番 2/2', 8],
    ['QR', 3],
  ],
);
a.equal(C.groupByCategory([{ slug: 'x' }])[0].cat, 'ツール');

/* 正面に立つ姿勢: 作品の法線の向きに離れ、画面の真ん中なら作品の正面 */
const pose = C.framePose(
  { x: 1, y: 2, z: 3, w: 1, h: 1, ry: 0, nx: 0, nz: 1 },
  { fov: 50, aspect: 1, availW: 1, availH: 1, cx: 0.5, cy: 0.5, minDist: 0.1, maxDist: 100 },
);
near(pose.x, 1, '正面の x');
near(pose.y, 2, '正面の y');
a.ok(pose.z > 3 && pose.yaw === 0);

near(C.nearestAngle(0, 2 * Math.PI - 0.1), -0.1, '遠回りしない角度');
near(C.easeInOut(0.5), 0.5, '中点');
a.equal(C.easeInOut(2), 1);
a.deepStrictEqual(
  C.interpolatePose(
    { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    { x: 2, y: 4, z: 6, yaw: 1, pitch: 1 },
    0.5,
  ),
  {
    x: 1,
    y: 2,
    z: 3,
    yaw: 0.5,
    pitch: 0.5,
  },
);
a.equal(C.nextIndex(0, 5, -1), 4);
a.equal(C.nextIndex(0, 0, 1), -1);
