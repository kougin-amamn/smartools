/* 頭痛予報の通し試験(docs/design/headache-forecast.md T-06)。偽の予報で、見通し・グラフ・一覧・記録・感じやすさ・英語の画面を確かめる。
   使い方: node tests/scenarios/headache-forecast.js [画面を撮る場所.png] */
const { launch, report, splitErrors } = require('../lib/harness');

/* 今の5時間後から1時間に1hPaずつ6時間下がる予報(過去7日〜3日先) */
function fakeForecast() {
  const H = 3600;
  const start = Math.floor(Date.now() / 1000 / H) * H - 7 * 24 * H;
  const time = [];
  const surface_pressure = [];
  for (let i = 0; i < 240; i++) {
    const t = start + i * H;
    const k = (t - Date.now() / 1000) / H;
    time.push(t);
    surface_pressure.push(k < 5 ? 1015 : k < 11 ? 1015 - (k - 5) : 1009);
  }
  return { hourly: { time, surface_pressure } };
}

async function openWithFake(site, locale) {
  const { page, logs, context } = await site.open(
    'tools/headache-forecast/headache-forecast.html',
    {
      permissions: ['geolocation'],
      locale,
    },
  );
  await context.setGeolocation({ latitude: 35.68, longitude: 139.76 });
  await context.route(/api\.open-meteo\.com/, (r) =>
    r.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(fakeForecast()),
    }),
  );
  await page.click('#useLocationBtn');
  await page.waitForSelector('#outlookCard:not([hidden])', { timeout: 5000 });
  return { page, logs };
}

(async () => {
  const site = await launch();
  const problems = [];
  try {
    const { page, logs } = await openWithFake(site, 'ja-JP');
    const text = (s) => page.textContent(s);
    if ((await text('#levelBadge')) !== '警戒') problems.push('見通しが警戒にならない');
    if (!/ごろから気圧が下がります/.test(await text('#outlookText')))
      problems.push('一言が出ない: ' + (await text('#outlookText')));
    if (!(await page.locator('#chart svg .band').count())) problems.push('グラフに帯が無い');
    if (!(await page.locator('#periodList li .level-badge').count()))
      problems.push('注意する時間の一覧が無い');

    /* グラフを触ると値が出る */
    const box = await page.locator('#chart svg').boundingBox();
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
    if (!/hPa/.test(await text('#chartTip'))) problems.push('グラフを触っても値が出ない');

    /* 記録して、残る・数える・消す */
    await page.click('#recordBtn');
    if ((await page.locator('#recordList li').count()) !== 1) problems.push('記録が一覧に出ない');
    if (!/注意以上の時間だったのは0件/.test(await text('#recordSummary')))
      problems.push('記録の数え方が違う: ' + (await text('#recordSummary')));

    /* 感じやすさ: 鈍感にすると警戒が下がり、読み込み直しても残る */
    await page.click('#sensitivity [data-value="low"]');
    if ((await text('#levelBadge')) !== '注意') problems.push('鈍感にしても段階が変わらない');
    if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
    await page.reload();
    await page.waitForTimeout(300);
    if ((await page.getAttribute('#sensitivity [data-value="low"]', 'aria-checked')) !== 'true')
      problems.push('感じやすさが残らない');
    if ((await page.locator('#recordList li').count()) !== 1) problems.push('記録が残らない');
    page.once('dialog', (d) => d.accept());
    await page.click('#recordList .remove');
    if (await page.locator('#recordList li').count()) problems.push('記録を消せない');

    const errors = splitErrors(logs).real;
    if (errors.length) problems.push('エラー: ' + errors.join(' / '));

    /* 英語の画面 */
    const en = await openWithFake(site, 'en-US');
    await en.page.waitForTimeout(500);
    const badge = await en.page.textContent('#levelBadge');
    if (badge !== 'Warning') problems.push('英語の画面で札が訳されない: ' + badge);
    const outlook = await en.page.textContent('#outlookText');
    if (!/Pressure starts falling around/.test(outlook))
      problems.push('英語の画面で一言が訳されない: ' + outlook);
  } finally {
    await site.close();
  }
  report('headache-forecast', problems);
})();
