/* 電卓の計算と履歴(docs/design/calculator.md) */
const a = require('assert');
const C = require('../../tools/calculator/calculator-core.js');

/* 履歴の答えを使う: = の後なら新しい計算、途中なら 2 つ目の数 */
let calc = C.create();
calc.num('1');
calc.num('2');
calc.op('×');
calc.num('3');
a.deepEqual(calc.equals(), { expr: '12 × 3 =', result: '36' });
calc.use('75');
a.equal(calc.state.current, '75');
a.equal(calc.pending(), '');
calc.op('+');
calc.use('36');
a.deepEqual(calc.equals(), { expr: '75 + 36 =', result: '111' });

/* 履歴: 古い順に足し、最大を超えたら古い物から消す */
let list = [];
for (let i = 1; i <= 22; i++)
  list = C.addHistory(list, { expr: `${i} + 0`, result: String(i) }, 20);
a.equal(list.length, 20);
a.equal(list[0].result, '3');
a.equal(list[19].result, '22');
a.deepEqual(C.addHistory(null, { expr: '1 + 1', result: '2' }), [{ expr: '1 + 1', result: '2' }]);

console.log('OK calculator.test.js');
