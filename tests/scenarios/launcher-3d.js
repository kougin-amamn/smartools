/* 3Dランチャー(本棚・美術館)の通し試験。three.js r128 のモジュール版を手元に置いた時だけ 3D を動かす。
   使い方: THREE_JS_DIR=<three.module.js のあるフォルダ> node tests/scenarios/launcher-3d.js
   手元に取る方法(npm は使えないため git で1ファイルだけ):
     git clone -q --depth 1 --branch r128 --filter=blob:none --sparse https://github.com/mrdoob/three.js <フォルダ>
     cd <フォルダ> && git sparse-checkout set --no-cone /build/three.module.js   → <フォルダ>/build が THREE_JS_DIR
   THREE_JS_DIR が無い時は、three.js が読めない時の 2D の一覧だけを確かめる */
const path = require('path');
const { launch, report } = require('../lib/harness');

const DIR = process.env.THREE_JS_DIR;
const PAGES = ['launcher-3d-bookshelf', 'launcher-3d-museum'];

(async () => {
  const h = await launch(['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']);
  const problems = [];
  const errorsOf = (logs) =>
    logs.filter(
      (l) => /^PAGEERROR|^error /.test(l) && !/GL Driver|GroupMarker|swiftshader/i.test(l),
    );
  try {
    for (const name of PAGES) {
      /* three.js が読めない時: 2D の一覧と、想定内の警告(error ではない) */
      const off = await h.open('launchers/' + name + '.html', { width: 844, wait: 1500 });
      if (await off.page.isHidden('#listPanel'))
        problems.push(name + ': three.js が無い時に一覧が出ません');
      if (!off.logs.some((l) => /^warning .*three\.js\)を読み込めませんでした/.test(l)))
        problems.push(name + ': three.js が無い時の警告がありません');
      errorsOf(off.logs).forEach((l) => problems.push(name + '(three.js 無し): ' + l));
      await off.context.close();

      if (!DIR) continue;
      const on = await h.open('launchers/' + name + '.html', {
        width: 844,
        wait: 100,
        stubs: { 'three.module.js': path.resolve(DIR, 'three.module.js') },
      });
      await on.page.setViewportSize({ width: 844, height: 390 });
      await on.page.waitForFunction(
        () => document.getElementById('loading').classList.contains('done'),
        null,
        {
          timeout: 60000,
        },
      );
      await on.page.waitForTimeout(1500);
      if (!on.logs.some((l) => /起動しました\(/.test(l)))
        problems.push(name + ': 起動のログがありません');
      /* 画面の真ん中をタップ(本棚は本、美術館は入口の旗) */
      await on.page.mouse.click(370, 190);
      await on.page.waitForTimeout(1500);
      if (name === 'launcher-3d-bookshelf' && (await on.page.isHidden('#card')))
        problems.push(
          name + ': 本をタップしても説明カードが出ません(' + on.logs.slice(-3).join(' / ') + ')',
        );
      errorsOf(on.logs).forEach((l) => problems.push(name + ': ' + l));
      await on.context.close();
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await h.close();
  }
  if (!DIR)
    console.log('注意: THREE_JS_DIR が無いため、3D の表示は確かめていません(2D の一覧だけ)');
  process.exitCode = report('launcher-3d シナリオ', problems) ? 0 : 1;
})();
