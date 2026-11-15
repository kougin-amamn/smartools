/* 頭痛予報の計算(docs/design/headache-forecast.md) */
const a = require('assert');
const C = require('../../tools/headache-forecast/headache-forecast-core.js');

/* T-01(R-02): 下がった量。前が無い時は null、上がった時はマイナス */
const p = [1015, 1014, 1013, 1012, 1013];
a.equal(C.dropOf(p, 3, 3), 3);
a.equal(C.dropOf(p, 2, 3), null);
a.equal(C.dropOf(p, 4, 1), -1);

/* T-02(R-02): 段階。3時間 1.5 で注意、3 で警戒、24時間 6 で注意、10 で警戒 */
a.equal(C.levelOf(1.4, 0, 'normal'), 0);
a.equal(C.levelOf(1.5, 0, 'normal'), 1);
a.equal(C.levelOf(3, null, 'normal'), 2);
a.equal(C.levelOf(null, 6, 'normal'), 1);
a.equal(C.levelOf(0, 10, 'normal'), 2);
a.equal(C.levelOf(null, null, 'normal'), 0);

/* T-03(R-05): 感じやすさ。敏感なら 1.1 で注意、鈍感なら 1.5 では知らせない */
a.equal(C.levelOf(1.1, 0, 'high'), 1);
a.equal(C.levelOf(1.5, 0, 'low'), 0);
a.equal(C.levelOf(2.1, 0, 'low'), 1);

/* T-04(R-02, R-03): 1時間ごとの段階、まとまり、24時間の見通し */
const H = 3600;
const base = 1700000000;
const times = [];
const pressures = [];
for (let i = 0; i < 48; i++) {
  times.push(base + i * H);
  /* 30時間目から1時間に1hPaずつ下がり、36時間目で止まる */
  pressures.push(i < 30 ? 1015 : i < 36 ? 1015 - (i - 30) : 1009);
}
const hours = C.hourlyLevelsOf(times, pressures, 'normal');
a.equal(hours.length, 48);
a.equal(hours[0].time, base * 1000);
a.equal(hours[29].level, 0);
a.equal(hours[32].level, 1); /* 3時間で2下がった */
a.equal(hours[33].level, 2); /* 3時間で3下がった */
const now = (base + 20 * H) * 1000;
const outlook = C.outlookOf(hours, now);
a.equal(outlook.now.time, now);
a.equal(outlook.maxLevel, 2);
a.equal(outlook.firstStart, (base + 32 * H) * 1000);
a.equal(outlook.periods.length, 1);
a.equal(outlook.periods[0].level, 2);
/* 24時間を超えた先は見通しに入れない */
a.equal(C.outlookOf(hours, (base + 2 * H) * 1000).maxLevel, 0);
a.equal(C.indexAt(hours, (base - 5 * H) * 1000), -1);

/* T-05(R-06): 記録。新しい順・上限、記録した時の段階を数える */
let records = [];
for (let i = 0; i < 205; i++) records = C.addRecord(records, i);
a.equal(records.length, C.MAX_RECORDS);
a.equal(records[0].time, 204);
records = C.addRecord(C.addRecord(null, (base + 33 * H) * 1000), (base + 5 * H) * 1000);
records = C.addRecord(records, (base - 100 * H) * 1000);
const stats = C.recordStatsOf(records, hours);
a.equal(stats.rows.length, 3);
a.equal(stats.matched, 2);
a.equal(stats.inCaution, 1);
a.equal(stats.rows[0].hour, null);

console.log('OK headache-forecast.test.js');
