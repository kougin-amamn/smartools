/* 電卓の通し試験(docs/design/calculator.md)。キーボードの入力(数字・小数点・演算子・%・Enter・c・Backspace)、
   対応する画面のキーが押した見た目になる、00 のキーが無い、履歴に入る。使い方: node tests/scenarios/calculator.js */
const { launch, report, splitErrors } = require('../lib/harness');

(async () => {
  const site = await launch();
  const problems = [];
  try {
    const { page, logs } = await site.open('tools/calculator/calculator.html');
    const result = () => page.textContent('#result');
    const type = async (keys) => {
      for (const k of keys) await page.keyboard.press(k);
    };

    if (await page.locator('[data-val="00"]').count()) problems.push('00 のキーが残っている');
    if (!(await page.locator('[data-act="dot"]').count())) problems.push('小数点のキーが無い');

    /* 12.5 × 2 = 25(小数点と * と Enter) */
    await type(['1', '2', '.', '5', '*', '2', 'Enter']);
    if ((await result()) !== '25') problems.push(`12.5 × 2 が ${await result()}`);
    if ((await page.locator('.history-item').count()) !== 1)
      problems.push('計算が履歴に入っていない');

    /* 押したキーに対応する画面のキーが、押した見た目になる */
    await page.keyboard.press('7');
    const lit = await page.evaluate(() =>
      document.querySelector('[data-act="num"][data-val="7"]').classList.contains('pressed'),
    );
    if (!lit) problems.push('キーボードの 7 で、画面の 7 が押した見た目にならない');

    /* % と c と Backspace、カンマも小数点 */
    await type(['c', '5', '0', '%']);
    if ((await result()) !== '0.5') problems.push(`50% が ${await result()}`);
    await type(['c', '1', ',', '5', '+', '1', 'Enter']);
    if ((await result()) !== '2.5') problems.push(`1,5 + 1 が ${await result()}`);
    await type(['c', '1', '2', '3', 'Backspace']);
    if ((await result()) !== '12') problems.push(`Backspace の後が ${await result()}`);
    await type(['Escape']);
    if ((await result()) !== '0') problems.push('Escape でクリアされない');

    if (!logs.some((l) => /キーボードの「Enter」を押下しました/.test(l)))
      problems.push('キーのログが無い');
    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー: ' + real.join(' / '));
  } finally {
    await site.close();
  }
  process.exit(report('電卓(キーボード・小数点・履歴)', problems) ? 0 : 1);
})();
