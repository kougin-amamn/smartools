/* 押した時の波紋(common/press.js)の試験。ボタンを押すと波紋が出て、離すと消える。押せないボタンと data-no-ripple には出ない。
   使い方: node tests/scenarios/press.js */
const { launch, report, splitErrors } = require('../lib/harness');

(async () => {
  const site = await launch();
  const problems = [];
  try {
    const { page, logs, context } = await site.open('tools/stopwatch/stopwatch.html');
    await page.waitForTimeout(300);
    const press = async (selector) => {
      const box = await page.locator(selector).first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(100);
      return page.locator(selector + ' .ripple').count();
    };
    if ((await press('#startStopBtn')) !== 1) problems.push('ボタンを押しても波紋が出ない');
    await page.mouse.up();
    await page.waitForTimeout(800);
    if (await page.locator('.ripple').count()) problems.push('離しても波紋が消えない');

    /* 一覧のカードにも出る */
    await page.goto(site.base + '/index.html');
    await page.waitForSelector('#list .card');
    if ((await press('#list .card')) !== 1) problems.push('一覧のカードで波紋が出ない');
    await page.mouse.move(1, 1); // 外へ動かしてから離す(押しただけでツールを開かないように)
    await page.mouse.up();

    /* data-no-ripple の中には出さない */
    await page.evaluate(() =>
      document.querySelector('#list .card').setAttribute('data-no-ripple', ''),
    );
    await page.waitForTimeout(800);
    if ((await press('#list .card')) !== 0) problems.push('data-no-ripple でも波紋が出る');
    await page.mouse.move(1, 1);
    await page.mouse.up();

    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー: ' + real.join(' / '));
    await context.close();
  } finally {
    await site.close();
  }
  process.exit(report('押した時の波紋', problems) ? 0 : 1);
})();
