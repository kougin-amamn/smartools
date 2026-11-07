/* ページを離れる時の終了処理の試験(設計: docs/design/page-exit.md の T-01〜T-06)。
   カメラは Chromium の偽のカメラ、ZXing は tests/stubs/fake-zxing.js。使い方: node tests/scenarios/page-exit.js */
const { launch, report, splitErrors } = require('../lib/harness');

const FAKE_CAMERA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

/* ページの中で出来事を起こす */
function fire(page, kind) {
  return page.evaluate((kind) => {
    if (kind === 'hidden') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    } else if (kind === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide'));
    else window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }, kind);
}
/* pageshow(persisted)で読み込み直したか。印を付けてから起こし、印が消えたら読み込み直した */
async function reloadedByPageshow(page) {
  await page.evaluate(() => (window.__mark = 1));
  await Promise.all([page.waitForLoadState('load').catch(() => {}), fire(page, 'pageshow')]);
  await page.waitForTimeout(400);
  return page.evaluate(() => window.__mark !== 1);
}

(async () => {
  const site = await launch(FAKE_CAMERA);
  let ok = true;
  try {
    /* T-01・T-02・T-04・T-05: 電卓のページで登録して確かめる */
    const calc = await site.open('tools/calculator/calculator.html');
    const p1 = [];
    if (await reloadedByPageshow(calc.page))
      p1.push('終了処理が無いページなのに、戻った時に読み込み直した');
    await calc.page.evaluate(() => {
      window.__calls = [];
      ToolKit.addSave(() => window.__calls.push('保存'));
      ToolKit.addCleanup(() => {
        throw new Error('試験の失敗');
      }, '失敗する処理');
      ToolKit.addCleanup(() => {
        window.__calls.push('読み上げ');
        return true;
      }, '読み上げ');
      ToolKit.addCleanup(() => window.__calls.push('何もしない'), '何もしない処理');
    });
    await fire(calc.page, 'hidden');
    const afterHidden = await calc.page.evaluate(() => window.__calls.join(','));
    if (afterHidden !== '保存') p1.push(`T-04 画面が隠れた時の呼び出し: ${afterHidden}`);
    await fire(calc.page, 'pagehide');
    const afterHide = await calc.page.evaluate(() => window.__calls.join(','));
    if (afterHide !== '保存,保存,読み上げ,何もしない')
      p1.push(`T-01 pagehide の時の呼び出し: ${afterHide}`);
    const logs = calc.logs.join('\n');
    if (!/失敗する処理の終了処理でエラーが発生しました/.test(logs))
      p1.push('T-02 失敗のログが無い');
    if (!/読み上げを停止しました\(ページを離れたため\)/.test(logs))
      p1.push('T-01 停止のログが無い');
    if (/何もしない処理を停止しました/.test(logs))
      p1.push('true を返さない処理まで停止のログが出た');
    if (!(await reloadedByPageshow(calc.page))) p1.push('T-05 戻った時に読み込み直さなかった');
    ok = report('T-01・T-02・T-04・T-05 終了処理と保存の登録', p1) && ok;

    /* T-03: ToolKit.media.open で開いたカメラは、何も書かなくても止まる */
    const cam = await site.open('tools/calculator/calculator.html', { permissions: ['camera'] });
    const p3 = [];
    await cam.page.evaluate(async () => {
      const r = await ToolKit.media.open({ video: true }, 'カメラ');
      window.__track = r.stream && r.stream.getVideoTracks()[0];
    });
    if ((await cam.page.evaluate(() => window.__track && window.__track.readyState)) !== 'live')
      p3.push('偽のカメラが開けなかった');
    await fire(cam.page, 'pagehide');
    if ((await cam.page.evaluate(() => window.__track && window.__track.readyState)) !== 'ended')
      p3.push('pagehide でカメラが止まらなかった');
    if (!cam.logs.some((l) => /カメラを停止しました\(ページを離れたため\)/.test(l)))
      p3.push('カメラの停止のログが無い');
    ok = report('T-03 開いたカメラの自動停止', p3) && ok;

    /* T-06: QR 読み取りは、読めた時・読み直して離れた時にカメラが止まる */
    const qr = await site.open('tools/qr-reader/qr-reader.html', {
      permissions: ['camera'],
      stubs: { '@zxing/library': 'fake-zxing.js' },
      wait: 800,
    });
    const p6 = [];
    const liveTracks = () =>
      qr.page.evaluate(() => {
        const s = document.getElementById('video').srcObject;
        return s ? s.getVideoTracks().filter((t) => t.readyState === 'live').length : 0;
      });
    if ((await liveTracks()) !== 1) p6.push('読み取りの開始でカメラが開いていない');
    await qr.page.evaluate(() => window.__qr('https://example.com/'));
    if ((await liveTracks()) !== 0) p6.push('読めた後もカメラが点いている');
    if (await qr.page.locator('#resultCard').isHidden()) p6.push('読めた結果が出ていない');
    await qr.page.click('#rescanBtn');
    await qr.page.waitForTimeout(500);
    if ((await liveTracks()) !== 1) p6.push('読み直しでカメラが開いていない');
    await fire(qr.page, 'pagehide');
    if ((await liveTracks()) !== 0) p6.push('ページを離れた後もカメラが点いている');
    const { real } = splitErrors(qr.logs);
    if (real.length) p6.push('エラー: ' + real.join(' / '));
    ok = report('T-06 QR 読み取りのカメラの停止', p6) && ok;
  } finally {
    await site.close();
  }
  process.exit(ok ? 0 : 1);
})();
