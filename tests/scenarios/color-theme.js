/* カラーテーマの試験(設計: docs/design/color-theme.md の T-01・T-02)。6つだけ並ぶ、選ぶと背景からボタンまで変わる、
   ライト⇄ダークで値が切り替わる、読み込み直しても残る、最初の色(01 Ocean × Coral)に戻せる、前のテーマを保存した人も 01 になる。
   使い方: node tests/scenarios/color-theme.js */
const { launch, report, splitErrors } = require('../lib/harness');

const tokensOf = (page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue('--bg').trim().toLowerCase(),
      accent: s.getPropertyValue('--accent').trim().toLowerCase(),
      border: s.getPropertyValue('--border').trim().toLowerCase(),
    };
  });

(async () => {
  const site = await launch();
  const problems = [];
  try {
    const { page, logs } = await site.open('tools/calculator/calculator.html', { hour: 12 });

    /* 何も選んでいない時は 01 Ocean × Coral(ライト) */
    let t = await tokensOf(page);
    if (t.bg !== '#eff5f8' || t.accent !== '#17637c')
      problems.push(`最初の色が 01 でない(${JSON.stringify(t)})`);

    /* 一覧は6つ。Violet × Lime を選ぶ */
    await page.click('#colorBtn');
    await page.waitForSelector('.color-item[data-id="violet-lime"]', { timeout: 3000 });
    const count = await page.locator('.color-item').count();
    if (count !== 6) problems.push(`一覧が ${count} 件(6 件のはず)`);
    await page.click('.color-item[data-id="violet-lime"]');
    t = await tokensOf(page);
    if (t.bg !== '#f5f1f8' || t.accent !== '#674393' || t.border !== '#d9cde5')
      problems.push(`Violet × Lime のライトにならない(${JSON.stringify(t)})`);

    /* ダークにすると、同じテーマのダークの値 */
    await page.evaluate(() => document.getElementById('themeBtn').click());
    t = await tokensOf(page);
    if (t.bg !== '#211735' || t.accent !== '#7653a8')
      problems.push(`Violet × Lime のダークにならない(${JSON.stringify(t)})`);

    /* 読み込み直しても残る */
    await page.reload();
    await page.waitForTimeout(300);
    t = await tokensOf(page);
    if (t.accent !== '#674393' && t.accent !== '#7653a8') problems.push('読み込み直すと色が戻る');

    /* 01 に戻す */
    await page.click('#colorBtn');
    await page.waitForSelector('.color-item[data-id="ocean-coral"]', { timeout: 3000 });
    await page.click('.color-item[data-id="ocean-coral"]');
    t = await tokensOf(page);
    if (!['#17637c', '#267c94'].includes(t.accent))
      problems.push(`01 に戻らない(${JSON.stringify(t)})`);

    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー: ' + real.join(' / '));

    /* 前のテーマ(ブルー)を保存してあった人も、エラー無く 01 になる */
    const old = await site.open('tools/calculator/calculator.html', { hour: 12 });
    await old.page.evaluate(() =>
      localStorage.setItem(
        'site-color',
        JSON.stringify({ id: 'blue', name: 'ブルー', main: '#2563EB', sub: '#93C5FD' }),
      ),
    );
    await old.page.reload();
    await old.page.waitForTimeout(300);
    t = await tokensOf(old.page);
    if (t.accent !== '#17637c')
      problems.push(`前のテーマを保存していると 01 にならない(${t.accent})`);
    if (splitErrors(old.logs).real.length)
      problems.push('前のテーマでエラー: ' + splitErrors(old.logs).real.join(' / '));
  } finally {
    await site.close();
  }
  process.exit(report('カラーテーマ', problems) ? 0 : 1);
})();
