/* どのページにも共通する確認(起動のログが1回・テーマ・幅・ヘッダのボタン・環境情報・ログ・共通ファイルが無い時の案内)。
   使い方: node tests/smoke.js tools/calculator tools/paint   (all でツールとランチャー全部、--logs で各ページのログも出す) */
const fs = require('fs');
const path = require('path');
const { launch, report, splitErrors, ROOT } = require('./lib/harness');

function pagesOf(args) {
  const list = args.filter((a) => !a.startsWith('--'));
  if (list.includes('all')) {
    const tools = fs
      .readdirSync(path.join(ROOT, 'tools'))
      .map((s) => 'tools/' + s + '/' + s + '.html');
    const launchers = fs
      .readdirSync(path.join(ROOT, 'launchers'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => 'launchers/' + f);
    return ['index.html'].concat(launchers, tools);
  }
  return list.map((p) =>
    p.endsWith('.html') ? p : p.replace(/\/$/, '') + '/' + path.basename(p) + '.html',
  );
}

(async () => {
  const args = process.argv.slice(2);
  const pages = pagesOf(args);
  if (!pages.length) {
    console.log('使い方: node tests/smoke.js tools/<slug> … | all [--logs]');
    return;
  }
  const site = await launch();
  const notes = [];
  let ng = 0;
  for (const p of pages) {
    const problems = [];
    /* 昼はライト、夜はダーク */
    for (const [hour, want] of [
      [12, 'light'],
      [20, 'dark'],
    ]) {
      const { page, logs, context } = await site.open(p, { hour });
      const theme = await page.getAttribute('html', 'data-theme');
      if (theme !== want) problems.push(hour + '時のテーマが ' + theme + '(期待 ' + want + ')');
      if (hour === 12) {
        const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        if (w[0] > w[1]) problems.push('横にはみ出しています(' + w[0] + 'px)');
        const ids = await page.$$eval('.site-bar > button', (b) => b.map((e) => e.id).join(' '));
        if (!/infoBtn colorBtn themeBtn dbgBtn$/.test(ids))
          problems.push('ヘッダのボタンの並びが ' + ids);
        /* ヘッダを隠しているツール(つまみで引き出す)は、先に出す */
        if (await page.$('.bar-handle')) {
          await page.click('.bar-handle');
          await page.waitForTimeout(300);
        }
        await page.click('#themeBtn');
        if ((await page.getAttribute('html', 'data-theme')) !== 'dark')
          problems.push('テーマボタンで切り替わりません');
        if (await page.$('#infoBtn')) {
          await page.click('#infoBtn');
          const rows = await page.$$eval('.info-list dt', (e) => e.length);
          if (rows !== 12) problems.push('環境情報が ' + rows + ' 行です(期待 12)');
        }
        if (
          p.startsWith('tools/') &&
          !(await page.evaluate(() => !!(window.ToolKit.media && ToolKit.sensor)))
        )
          problems.push('device.js が読み込まれていません');
        const errors = splitErrors(logs);
        errors.real.forEach((l) => problems.push('エラー: ' + l.split('\n')[0]));
        if (errors.cdn.length) notes.push(p + ': CDN のライブラリは開発環境では読めないため未確認');
        /* 起動のログは log.started() がちょうど1回出す(docs/logging.md) */
        const started = logs.filter((l) => /起動しました\(/.test(l)).length;
        if (started !== 1) problems.push('起動のログが ' + started + ' 回です(期待 1)');
        if (args.includes('--logs')) console.log('  ' + p + '\n    ' + logs.join('\n    '));
      }
      await context.close();
    }
    /* 共通ファイルが読めない時は、画面の先頭に案内を出す(ツールは device.js だけが無い時も) */
    const blocks = [/\/common\//].concat(p.startsWith('tools/') ? [/\/common\/device\.js/] : []);
    for (const block of blocks) {
      const missing = await site.open(p, { block });
      if (
        !(await missing.page.textContent('body')).includes(
          '共通ファイル(common/)を読み込めませんでした',
        )
      )
        problems.push('共通ファイルが無い時の案内が出ません(' + block + ')');
      await missing.context.close();
    }
    if (!report(p, problems)) ng++;
  }
  await site.close();
  if (notes.length) console.log('注意:\n  ' + notes.join('\n  '));
  console.log(pages.length + '件中 ' + (pages.length - ng) + '件 OK');
  process.exitCode = ng ? 1 : 0;
})();
