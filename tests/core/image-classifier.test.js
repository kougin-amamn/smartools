/* tools/image-classifier の計算部分と日本語名の表 */
const C = require('../../tools/image-classifier/image-classifier-core.js');
const L = require('../../tools/image-classifier/image-classifier-labels.json');
const a = require('assert');
const p = new Float32Array(1000);
p[5] = 0.5;
p[900] = 0.3;
p[3] = 0.1;
a.deepStrictEqual(
  C.topK(p, 3).map((e) => e.index),
  [5, 900, 3],
);
a.deepStrictEqual(C.smooth([0, 1], [1, 0], 0.25), [0.25, 0.75]);
a.deepStrictEqual(C.centerSquare(1280, 720), { x: 280, y: 0, s: 720 });
a.equal(C.confidence(0.7, 0.2), 'high');
a.equal(C.confidence(0.1, 0.2), 'low');
a.equal(L.length, 1000);
/* ImageNet の有名な番号で、順番がずれていないか確かめる */
a.equal(L[281][0], 'tabby');
a.equal(L[398][0], 'abacus');
a.equal(L[504][0], 'coffee mug');
a.equal(L[954][0], 'banana');
a.equal(L[999][0], 'toilet tissue');
a.equal(C.name(L, 281), 'トラ猫');
