/* ツールの並べ替えの試験(docs/design/tool-sort.md)。ツールを開くと記録され、一覧の 最近・よく使う・名前 の順になり、
   選んだ並びが読み込み直しても残る。使い方: node tests/scenarios/tool-sort.js */
const { launch, report, splitErrors } = require('../lib/harness');
const TOOL_COUNT = require('../../index-data.json').length;

(async () => {
  const site = await launch();
  const problems = [];
  try {
    /* 同じブラウザの中で、メモ帳を 3 回、方位磁石を 1 回(後で)開く */
    const { page, logs, context } = await site.open('tools/notepad/notepad.html');
    await page.reload();
    await page.reload();
    await page.waitForTimeout(200);
    await page.goto(site.base + '/tools/compass/compass.html');
    await page.waitForTimeout(300);
    await page.goto(site.base + '/index.html');
    await page.waitForSelector('#sorts:not([hidden])', { timeout: 3000 });

    const firstCards = (n) =>
      page.evaluate(
        (n) =>
          Array.from(document.querySelectorAll('#list .card'))
            .slice(0, n)
            .map(
              (c) =>
                c.querySelector('.title').textContent +
                (c.querySelector('.use') ? ' ' + c.querySelector('.use').textContent : ''),
            ),
        n,
      );

    await page.selectOption('#sortSelect', 'recent');
    let cards = await firstCards(2);
    if (!/^方位磁石 たった今$/.test(cards[0]) || !/^メモ帳/.test(cards[1]))
      problems.push(`最近の順が違う(${cards.join(' / ')})`);
    if (await page.locator('#list .cat-head').count())
      problems.push('最近の時に分類の見出しが残っている');

    await page.selectOption('#sortSelect', 'frequent');
    cards = await firstCards(2);
    if (cards[0] !== 'メモ帳 3回' || cards[1] !== '方位磁石 1回')
      problems.push(`よく使う順が違う(${cards.join(' / ')})`);

    await page.selectOption('#sortSelect', 'name');
    cards = await firstCards(TOOL_COUNT);
    if (cards.some((c) => / \d+回|前$|たった今$/.test(c)))
      problems.push('名前の時に日時・回数が出ている');
    if (cards.length !== TOOL_COUNT)
      problems.push(`名前の時の件数 ${cards.length}(${TOOL_COUNT} のはず)`);

    /* 選んだ並びが残る */
    await page.selectOption('#sortSelect', 'frequent');
    await page.reload();
    await page.waitForSelector('#sorts:not([hidden])', { timeout: 3000 });
    if ((await page.inputValue('#sortSelect')) !== 'frequent')
      problems.push('読み込み直すと並びが戻る');
    if ((await firstCards(1))[0] !== 'メモ帳 3回') problems.push('読み込み直した後の並びが違う');

    /* 分類に戻すと見出しが戻る */
    await page.selectOption('#sortSelect', 'category');
    if (!(await page.locator('#list .cat-head').count()))
      problems.push('分類に戻しても見出しが無い');

    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー: ' + real.join(' / '));
    await context.close();
  } finally {
    await site.close();
  }
  process.exit(report('ツールの並べ替え', problems) ? 0 : 1);
})();
