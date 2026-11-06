/* 計算部分(DOM を使わないファイル)の試験をまとめて動かす。tests/core/*.test.js を順に実行し、1件1行で結果を出す。
   使い方: node tests/core.js            (名前を渡すとその試験だけ: node tests/core.js env) */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'core');
const only = process.argv[2];
let ng = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js'))) {
  if (only && !f.startsWith(only)) continue;
  try {
    require(path.join(dir, f));
    console.log('OK ' + f);
  } catch (e) {
    ng++;
    console.log('NG ' + f + '\n  - ' + (e.message || e).split('\n')[0]);
  }
}
process.exitCode = ng ? 1 : 0;
