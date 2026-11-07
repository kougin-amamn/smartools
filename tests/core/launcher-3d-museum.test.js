/* launchers/launcher-3d-museum-core.js: 壁ごとの点数・作品の配置・部屋の大きさ・ホールの入口・新着 */
const M = require('../../launchers/launcher-3d-museum-core.js').default;
const a = require('assert');

a.deepStrictEqual(M.distribute(7), [2, 3, 2]);
a.deepStrictEqual(M.roomCounts(3), [0, 3, 0], '3点以下は正面の壁');
a.deepStrictEqual(M.roomCounts(4), [1, 2, 1]);
[1, 5, 15, 40].forEach((n) => {
  const counts = M.roomCounts(n);
  const room = M.roomDims(counts);
  const items = M.layout(n, room, { size: 3, centerY: 3.5 }, counts);
  a.equal(items.length, n, n + '点が全部並ぶ');
  items.forEach((it) => {
    a.ok(
      Math.abs(it.x) <= room.w / 2 + 1e-9 && Math.abs(it.z) <= room.d / 2 + 1e-9,
      n + '点: 部屋の中',
    );
    a.ok(it.w > 0 && it.w <= 3, n + '点: 大きさ');
  });
});
a.deepStrictEqual(M.doorSplit(3), [1, 2, 0]);
a.deepStrictEqual(M.doorSplit(8), [3, 3, 2]);
a.deepStrictEqual(M.hallCounts(0, 0, 6), M.distribute(6));

const now = Date.parse('2026-11-07');
a.ok(M.isNew({ slug: 'a', added: '2026-11-01' }, now, { viewed: {} }, 30));
a.ok(
  !M.isNew({ slug: 'a', added: '2026-11-01' }, now, { viewed: { a: 1 } }, 30),
  '見たら新着ではない',
);
a.ok(!M.isNew({ slug: 'b', added: '2026-01-01' }, now, { viewed: {}, base: { b: 1 } }, 30));
a.deepStrictEqual(
  M.topFavorites([{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }], { a: 1, b: 5, c: 3 }, 2, 2).map(
    (x) => x.slug || x.t.slug,
  ),
  ['b', 'c'],
);
