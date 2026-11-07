/* 小説読み上げの通し試験。偽のカクヨムの話のページ(https://kakuyomu.jp に見せかける)でブックマークレットを動かし、
   新しいタブのツールへ本文とルビが届くか、1文ずつ読み上げが進むか、読みの渡し方、ログに本文が出ないかを確かめる。
   音声合成と kuromoji は偽物(tests/stubs/fake-kuromoji.js)。使い方: node tests/scenarios/novel-reader.js */
const { launch, report, collect, splitErrors } = require('../lib/harness');

const URL = 'tools/novel-reader/novel-reader.html';
const EPISODE = 'https://kakuyomu.jp/works/1/episodes/2';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>第1話 説明のない転生 - 試験の作品</title></head><body>
<h1>試験の作品</h1><div class="widget-episodeBody">
<p>刺された。</p><p>腹が痛い、というより熱い。<ruby>鍋<rp>(</rp><rt>なべ</rt><rp>)</rp></ruby>か。</p>
<p>　　　　　◇</p><p>「<ruby><rb>魔法使い</rb><rt>ウィザード</rt></ruby>だ！」</p></div></body></html>`;

/* 音声合成の偽物: 渡された文を記録し、少し待って読み終える */
function fakeSpeech() {
  window.__spoken = [];
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
  };
  let timer = null,
    now = null;
  const fake = {
    getVoices: () => [{ name: '日本語の声', lang: 'ja-JP', voiceURI: 'ja-test' }],
    addEventListener() {},
    cancel() {
      clearTimeout(timer);
      if (now && now.onerror) now.onerror({ error: 'canceled' });
      now = null;
    },
    speak(u) {
      now = u;
      window.__spoken.push(u.text);
      timer = setTimeout(() => {
        now = null;
        if (u.onend) u.onend();
      }, 20);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
}

(async () => {
  const site = await launch();
  const problems = [];
  const first = await site.open(URL, { stubs: { '@patdx/kuromoji': 'fake-kuromoji.js' } });
  const ctx = first.context;
  await ctx.addInitScript(fakeSpeech);
  await ctx.route('https://kakuyomu.jp/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await first.page.reload();
  await first.page.waitForFunction(() => window.__kuromojiBuilt);
  await first.page.waitForFunction(() =>
    document.getElementById('bookmarklet').href.startsWith('javascript:')
  );
  const href = await first.page.getAttribute('#bookmarklet', 'href');

  /* カクヨムのページでブックマークレットを押す → 新しいタブにツールが開き、本文が届く */
  const K = await ctx.newPage();
  await K.goto(EPISODE);
  const [tool] = await Promise.all([
    ctx.waitForEvent('page'),
    K.evaluate((code) => new Function(code)(), decodeURIComponent(href.slice('javascript:'.length))),
  ]);
  const logs = collect(tool);
  await tool.waitForSelector('#text .sentence', { timeout: 10000 });
  const count = await tool.$$eval('#text .sentence', (e) => e.length);
  if (count !== 5) problems.push('文の数が ' + count + '(期待 5)');
  const rubies = await tool.$$eval('#text rt', (e) => e.map((x) => x.textContent).join(','));
  if (rubies !== 'なべ,ウィザード') problems.push('ルビが ' + rubies);
  if (!/試験の作品/.test(await tool.textContent('#sourceTitle'))) problems.push('題名が出ていません');

  /* 再生: 最後まで1文ずつ進む(初期は「ルビだけかな」) */
  await tool.waitForFunction(() => window.__kuromojiBuilt);
  await tool.click('#playBtn');
  await tool.waitForFunction(() => window.__spoken.length >= 5, null, { timeout: 5000 });
  const spoken = await tool.evaluate(() => window.__spoken);
  if (spoken[2] !== 'なべか。') problems.push('ルビの読みが渡っていません: ' + spoken[2]);
  if (spoken[4] !== '「ウィザードだ！」') problems.push('ルビの読みが渡っていません: ' + spoken[4]);
  await tool.waitForFunction(() => document.getElementById('playBtn').getAttribute('aria-label') === '再生');

  /* すべてかな: 形態素解析の読み(偽物)で、助詞以外の語がかなになる */
  await tool.click('#setBtn');
  await tool.selectOption('#mode', 'kana');
  await tool.click('#settingsClose');
  await tool.click('#text .sentence[data-index="0"]');
  await tool.waitForFunction(() => window.__spoken.length >= 6);
  const kana = await tool.evaluate(() => window.__spoken[5]);
  if (kana !== 'さされた。') problems.push('すべてかなの読みが ' + kana);
  await tool.click('#stopBtn');

  /* ログに本文が出ていない */
  if (logs.some((l) => /刺された|ウィザード|試験の作品/.test(l))) problems.push('ログに本文が出ています');
  if (
    !logs.some((l) =>
      /本文を受け取りました\(ブックマークレット \/ 段落 4 \/ 5文 \/ \d+字 \/ ルビ 2\)/.test(l)
    )
  )
    problems.push('受け取りのログがありません');
  splitErrors(logs).real.forEach((l) => problems.push('エラー: ' + l.split('\n')[0]));

  /* カクヨム以外のページで押した時は何もしない */
  const other = await ctx.newPage();
  await other.goto(site.base + '/index.html');
  let alerted = '';
  other.on('dialog', (d) => {
    alerted = d.message();
    d.dismiss();
  });
  await other.evaluate((code) => new Function(code)(), decodeURIComponent(href.slice('javascript:'.length)));
  if (!/カクヨム/.test(alerted)) problems.push('カクヨム以外での案内が出ません');

  const ok = report('小説読み上げの通し試験', problems);
  if (process.argv.includes('--logs')) console.log('  ' + logs.join('\n  '));
  await site.close();
  process.exitCode = ok ? 0 : 1;
})();
