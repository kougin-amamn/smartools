/* コンセプト(docs/design-philosophy.md)の基本の試験。docs/concept-review.md の A-1・A-2・A-3。
   弱い文字のコントラストが 4.5 以上(ライト・ダーク)、ヘッダのボタンが 高さ 44px・幅 38px、動きを減らす設定で切り替えの演出が止まる。
   使い方: node tests/scenarios/concept-basics.js */
const { launch, report, splitErrors } = require('../lib/harness');

/* WCAG のコントラスト比(トークンの色どうし) */
function contrastOf(page, a, b) {
  return page.evaluate(
    ([a, b]) => {
      const s = getComputedStyle(document.documentElement);
      const lum = (hex) =>
        [1, 3, 5]
          .map((i) => parseInt(hex.trim().slice(i, i + 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
          .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
      const x = lum(s.getPropertyValue(a)),
        y = lum(s.getPropertyValue(b));
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    },
    [a, b],
  );
}

(async () => {
  const site = await launch();
  const problems = [];
  try {
    for (const [hour, mode] of [
      [12, 'ライト'],
      [23, 'ダーク'],
    ]) {
      const { page, logs } = await site.open('tools/pomodoro-timer/pomodoro-timer.html', { hour });
      for (const back of ['--bg', '--panel', '--fn-bg']) {
        const ratio = await contrastOf(page, '--sub', back);
        if (ratio < 4.5)
          problems.push(`${mode}: --sub と ${back} のコントラスト ${ratio.toFixed(2)}`);
      }
      const sizes = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.site-bar .dbg-btn')).map((b) => {
          const r = b.getBoundingClientRect();
          return `${b.getAttribute('aria-label')} ${Math.round(r.width)}×${Math.round(r.height)}`;
        }),
      );
      const small = sizes.filter((s) =>
        /(\d+)×(\d+)$/
          .exec(s)
          .slice(1)
          .some((n, i) => n < (i === 0 ? 38 : 44)),
      );
      if (small.length)
        problems.push(`${mode}: 小さいヘッダのボタン(幅 38・高さ 44 未満) ${small.join(' / ')}`);
      const { real } = splitErrors(logs);
      if (real.length) problems.push(`${mode}: エラー ` + real.join(' / '));
    }

    /* 動きを減らす設定: キッチンタイマーの背景の切り替えの演出(自分では対応していない所)が、共通の決まりで止まる */
    const { page } = await site.open('tools/kitchen-timer/kitchen-timer.html');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.evaluate(() => {
      return parseFloat(getComputedStyle(document.body).transitionDuration);
    });
    if (duration > 0.001) problems.push(`動きを減らす設定でも演出が残る(${duration}s)`);
  } finally {
    await site.close();
  }
  process.exit(report('コンセプトの基本(コントラスト・押す所・動き)', problems) ? 0 : 1);
})();
