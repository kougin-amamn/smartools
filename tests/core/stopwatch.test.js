/* ストップウォッチの計時(docs/design/stopwatch.md) */
const a = require('assert');
const C = require('../../tools/stopwatch/stopwatch-core.js');

/* T-01(R-01): 外の輪は 60 秒で 1 周 */
a.equal(C.secondProgressOf(0), 0);
a.equal(C.secondProgressOf(30000), 0.5);
a.equal(C.secondProgressOf(60000), 0);
a.equal(C.secondProgressOf(90000), 0.5);

/* T-02(R-04): 前のラップとの比べ */
a.equal(C.paceOf(1000, 0), null);
a.deepEqual(C.paceOf(500, 1000), { ratio: 0.5, over: false, difference: -500 });
a.deepEqual(C.paceOf(1500, 1000), { ratio: 1, over: true, difference: 500 });

/* T-03(R-05): 最速・最遅 */
a.equal(C.extremesOf([{ no: 1, split: 10 }]), null);
a.equal(
  C.extremesOf([
    { no: 1, split: 10 },
    { no: 2, split: 10 },
  ]),
  null,
);
a.deepEqual(
  C.extremesOf([
    { no: 1, split: 10 },
    { no: 2, split: 8 },
    { no: 3, split: 12 },
  ]),
  { fastest: 2, slowest: 3 },
);

/* 計時: ラップの区間と合計 */
let t = 0;
const sw = C.create(() => t);
sw.start();
t = 1500;
a.deepEqual(sw.lap(), { no: 1, split: 1500, total: 1500 });
t = 2500;
a.deepEqual(sw.lap(), { no: 2, split: 1000, total: 2500 });
a.equal(C.fmt(61234), '01:01.23');
