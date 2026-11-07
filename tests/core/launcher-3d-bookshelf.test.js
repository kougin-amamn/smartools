/* launchers/launcher-3d-bookshelf-core.js: 本の詰め方(ツールが 10 / 47 / 200 冊の時)と、マスの冊数 */
const B = require('../../launchers/launcher-3d-bookshelf-core.js').default;
const a = require('assert');

function toolsOf(n, cats) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ slug: 't' + i, cat: 'c' + (i % cats) });
  return out;
}
[10, 47, 200].forEach((n) => {
  const shelves = B.packShelves(toolsOf(n, 6), B.capacity());
  const total = shelves.reduce((s, x) => s + x.tools.length, 0);
  a.equal(total, n, n + '冊が全部並ぶ');
  const sizes = shelves.map((x) => x.tools.length);
  a.ok(Math.max(...sizes) <= B.capacity(), n + '冊: 1マスの上限を超えない');
  a.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, n + '冊: マスごとの冊数がそろう');
  /* ジャンル順に並ぶ(同じジャンルが離れない) */
  const order = shelves.flatMap((x) => x.cats);
  const seen = [];
  order.forEach((c) => {
    if (seen[seen.length - 1] !== c) {
      a.ok(!seen.includes(c), n + '冊: ジャンル ' + c + ' が離れている');
      seen.push(c);
    }
  });
});
const row = B.shelfBooks(3, 0);
a.equal(row.books.length, 3);
a.ok(row.width > 0 && row.end);
a.equal(B.shelfBooks(0, 0).end, null);
