/* カラーテーマの試験。一覧から選ぶと色が変わる、選んだ色が次に開いたページにも付く、標準に戻せる、エラーが出ない。
   使い方: node tests/scenarios/color-theme.js */
const { launch, report, splitErrors } = require('../lib/harness');

const accentOf = (page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );

(async () => {
  const site = await launch();
  const problems = [];
  try {
    const { page, logs } = await site.open('tools/calculator/calculator.html', { hour: 12 });
    const standard = await accentOf(page);

    /* 一覧から「ブルー」を選ぶ */
    await page.click('#colorBtn');
    await page.waitForSelector('.color-item[data-id="blue"]', { timeout: 3000 });
    await page.click('.color-item[data-id="blue"]');
    const blue = await accentOf(page);
    if (blue.toLowerCase() !== '#2563eb')
      problems.push(`ブルーを選んでも色が変わらない(${standard} → ${blue})`);

    /* 次に開いたページにも付く(保存した色を、読み込んだ時に当てる) */
    await page.reload();
    await page.waitForTimeout(300);
    if ((await accentOf(page)).toLowerCase() !== '#2563eb') problems.push('読み込み直すと色が戻る');
    if (!(await page.locator('#colorBtn').count()))
      problems.push('色を保存した後、ヘッダのボタンが出ない');

    /* 標準に戻す */
    await page.click('#colorBtn');
    await page.waitForSelector('.color-item[data-id="standard"]', { timeout: 3000 });
    await page.click('.color-item[data-id="standard"]');
    if ((await accentOf(page)) !== standard) problems.push('標準に戻らない');

    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー: ' + real.join(' / '));
  } finally {
    await site.close();
  }
  process.exit(report('カラーテーマ', problems) ? 0 : 1);
})();
