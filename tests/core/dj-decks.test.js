/* DJデッキの計算(T-01: docs/design/dj-decks.md) */
const C = require('../../tools/dj-decks/dj-decks-core.js');
const a = require('assert');
const near = (x, y) => a.ok(Math.abs(x - y) < 1e-9, `${x} ≒ ${y}`);

/* 時間の文字 */
a.equal(C.formatTime(0), '00:00');
a.equal(C.formatTime(205.9), '03:25');
a.equal(C.formatTime(NaN), '00:00');
a.equal(C.formatTime(Infinity), '00:00');

/* クロスフェーダー: 両端で片方だけ、中央で同じ */
near(C.crossfadeGainsOf(0).a, 1);
near(C.crossfadeGainsOf(0).b, 0);
near(C.crossfadeGainsOf(1).a, 0);
near(C.crossfadeGainsOf(1).b, 1);
near(C.crossfadeGainsOf(0.5).a, C.crossfadeGainsOf(0.5).b);
near(C.crossfadeGainsOf(-1).a, 1);

/* ピッチ → 速さ */
near(C.rateOf(0), 1);
near(C.rateOf(16), 1.16);
near(C.rateOf(-8), 0.92);

/* 角度: 差は -180〜180 に、盤の絵は 1 秒 = 200 度 */
near(C.unwrapDegrees(90), 90);
near(C.unwrapDegrees(350), -10);
near(C.unwrapDegrees(-350), 10);
near(C.platterAngleOf(0), 0);
near(C.platterAngleOf(1.8), 0);
near(C.platterAngleOf(0.9), 180);
near(C.platterAngleOf(-0.45), 270);

/* Int16 への変換: 端を切り、0 は 0 */
a.deepEqual(Array.from(C.int16Of([0, 1, -1, 2, 0.5])), [0, 32767, -32767, 32767, 16383]);

/* 波形の山: 本数、0〜1、いちばん大きい所が 1 */
const left = new Float32Array(1000),
  right = new Float32Array(1000);
for (let i = 0; i < 1000; i++) left[i] = Math.sin(i / 10) * (i / 1000) * 0.5;
right[900] = -0.95;
const peaks = C.peaksOf([left, right], 50);
a.equal(peaks.length, 50);
a.ok(peaks.every((p) => p >= 0 && p <= 1));
near(Math.max(...peaks), 1);
a.ok(peaks[45] === 1, '右のチャンネルの大きな振れが山になる');
a.ok(peaks[1] < peaks[30], '小さい所は低い');
a.deepEqual(C.peaksOf([], 3), [0, 0, 0]);
a.deepEqual(C.peaksOf([new Float32Array(10)], 2), [0, 0]);

console.log('OK dj-decks.test.js');
