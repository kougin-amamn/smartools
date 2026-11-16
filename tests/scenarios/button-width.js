/* 文字が変わるボタンの幅が変わらないか(common/tool-kit.js の data-texts)。メトロノームで 開始 → 停止 → 開始 と
   変えても幅が同じ。日本語と英語の両方。使い方: node tests/scenarios/button-width.js */
const { launch, report, splitErrors } = require('../lib/harness');

(async () => {
  const site = await launch();
  const problems = [];
  try {
    for (const locale of ['ja-JP', 'en-US']) {
      const { page, logs, context } = await site.open('tools/metronome/metronome.html', { locale });
      await page.waitForFunction(() => window.I18n && I18n.isReady());
      await page.waitForTimeout(200);
      const widths = () =>
        page.evaluate(() =>
          ['startStopBtn'].map((id) => document.getElementById(id).getBoundingClientRect().width),
        );
      const first = await widths();
      await page.click('#startStopBtn'); // 停止
      const running = await widths();
      await page.click('#startStopBtn'); // 開始に戻る
      const stopped = await widths();
      [running, stopped].forEach((w) =>
        w.forEach((v, i) => {
          if (Math.abs(v - first[i]) > 0.5)
            problems.push(`${locale}: ボタン ${i + 1} の幅が変わった(${first[i]} → ${v})`);
        }),
      );
      const { real } = splitErrors(logs);
      if (real.length) problems.push('エラー: ' + real.join(' / '));
      await context.close();
    }
  } finally {
    await site.close();
  }
  process.exit(report('文字が変わるボタンの幅', problems) ? 0 : 1);
})();
