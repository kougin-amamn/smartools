/* ファイル転送の通し試験。PeerJS を tests/stubs/fake-peer.js(同じブラウザのタブ間を BroadcastChannel でつなぐ偽物)に差し替え、
   番号の発行・QR のリンクからの参加・確認番号・許可・圧縮・途中で切って続きから再開・切断を確かめる。
   使い方: node tests/scenarios/file-transfer.js */
const { launch, report, collect, splitErrors } = require('../lib/harness');

const URL = 'tools/file-transfer/file-transfer.html';
const STUBS = { peerjs: 'fake-peer.js' };

function checksum(buf) {
  let s = 0;
  for (const v of buf) s = (s * 31 + v) % 1000003;
  return s;
}

(async () => {
  const site = await launch();
  const problems = [];
  /* 2つのタブは同じブラウザの文脈で開く(BroadcastChannel を共有するため) */
  const first = await site.open(URL, { stubs: STUBS });
  const ctx = first.context;
  const A = first.page;

  await A.click('#hostBtn');
  await A.waitForFunction(() => /\d/.test(document.getElementById('code').textContent));
  const code = (await A.textContent('#code')).replace(/\s/g, '');
  const B = await ctx.newPage();
  const logsB = collect(B);
  await B.goto(site.base + '/' + URL + '#' + code);
  await A.waitForSelector('#ask:not([hidden])');
  await A.waitForTimeout(100);
  const sasA = await A.textContent('#askSas'),
    sasB = await B.textContent('#joinSas');
  if (!/\d{4}/.test(sasA) || sasA !== sasB)
    problems.push('確認番号が一致しません(' + sasA + ' / ' + sasB + ')');
  await A.click('#allowBtn');
  await B.waitForSelector('#linked:not([hidden])');

  /* 文字のファイル(圧縮される)と、途中で切る大きなファイル */
  const text = Buffer.from('こんにちは,1234,abc\n'.repeat(20000));
  const big = Buffer.alloc(6 * 1024 * 1024 + 77);
  for (let i = 0; i < big.length; i++) big[i] = (i * 31 + (i >> 9)) & 255;
  await B.setInputFiles('#file', [{ name: 'data.csv', mimeType: 'text/csv', buffer: text }]);
  await A.waitForFunction(() => document.querySelectorAll('.item.in.ok').length === 1, null, {
    timeout: 10000,
  });
  await A.evaluate(() => (window.__delay = 8));
  await B.setInputFiles('#file', [{ name: 'video.mp4', mimeType: 'video/mp4', buffer: big }]);
  await A.waitForFunction(
    () => {
      const s = document.querySelector('.item.in .state');
      return s && /MB \//.test(s.textContent) && parseFloat(s.textContent) > 1.5;
    },
    null,
    { timeout: 20000 }
  );
  await B.evaluate(() => window.__drop());
  await A.waitForTimeout(300);
  await A.evaluate(() => (window.__delay = 0));
  await A.waitForFunction(() => document.querySelectorAll('.item.in.ok').length === 2, null, {
    timeout: 30000,
  });
  const got = await A.evaluate(async () =>
    Promise.all(
      [...document.querySelectorAll('.item.in a')].map(async (a) => {
        const buf = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
        let s = 0;
        for (const v of buf) s = (s * 31 + v) % 1000003;
        return { name: a.download, size: buf.length, sum: s };
      })
    )
  );
  const want = { 'data.csv': text, 'video.mp4': big };
  for (const g of got)
    if (g.size !== want[g.name].length || g.sum !== checksum(want[g.name]))
      problems.push(g.name + ' の中身が一致しません');
  const states = await A.$$eval('.item.in .state', (e) => e.map((x) => x.textContent));
  if (!states.some((s) => /途中から再開/.test(s))) problems.push('続きからの再開になっていません');
  if (!states.some((s) => /通信量/.test(s))) problems.push('圧縮されていません');

  await B.click('#byeBtn');
  await A.waitForSelector('#start:not([hidden])', { timeout: 3000 }).catch(() =>
    problems.push('切断が相手に伝わりません')
  );
  splitErrors(first.logs.concat(logsB)).real.forEach((l) => problems.push('エラー: ' + l.split('\n')[0]));
  await site.close();
  process.exitCode = report('ファイル転送の通し試験', problems) ? 0 : 1;
})();
