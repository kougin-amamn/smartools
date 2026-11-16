/* 方位磁石の方位の名前(docs/design/compass.md) */
const a = require('assert');
const C = require('../../tools/compass/compass-core.js');

/* T-01(R-01): 8方位の名前 */
a.equal(C.eightDirectionOf(0), '北');
a.equal(C.eightDirectionOf(44), '北東');
a.equal(C.eightDirectionOf(100), '東');
a.equal(C.eightDirectionOf(350), '北');
a.equal(C.eightDirectionOf(-90), '西');
