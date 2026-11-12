/* DJデッキの通し試験(設計: docs/design/dj-decks.md の T-02・T-03)。作った WAV を2台に読み込み、スクラッチ・
   波形・PLAY・CUE・LOOP・HOT CUE・STOP ALL・RESET MIXER と、読めない曲の案内、ログにファイル名が無いことを確かめる。
   使い方: node tests/scenarios/dj-decks.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, report, splitErrors } = require('../lib/harness');

/* 440Hz で音量が上がっていく、3 秒のモノラルの WAV */
function makeWav(seconds) {
  const rate = 8000,
    n = rate * seconds,
    buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * (i / n) * 30000),
      44 + i * 2,
    );
  return buffer;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-decks-'));
  const song = path.join(dir, 'secret-song-name.wav');
  const broken = path.join(dir, 'broken-file.wav');
  fs.writeFileSync(song, makeWav(3));
  fs.writeFileSync(broken, 'これは音のファイルではありません');

  const site = await launch(['--autoplay-policy=no-user-gesture-required']);
  const problems = [];
  try {
    const { page, logs } = await site.open('tools/dj-decks/dj-decks.html');
    const text = (id) => page.locator('#' + id).textContent();

    /* 読み込みと波形(R-01) */
    await page.setInputFiles('#fileA', song);
    await page.waitForFunction(
      () => document.getElementById('titleA').textContent !== 'LOADING…',
      null,
      {
        timeout: 5000,
      },
    );
    if ((await text('titleA')) !== 'secret-song-name.wav')
      problems.push(`曲名: ${await text('titleA')}`);
    if (!/00:03$/.test(await text('durationA'))) problems.push(`長さ: ${await text('durationA')}`);
    const waveDrawn = await page.evaluate(() => {
      const c = document.getElementById('waveA'),
        data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      return lit / (data.length / 4);
    });
    if (waveDrawn < 0.1)
      problems.push(`波形がほとんど描かれていない(${(waveDrawn * 100).toFixed(1)}%)`);

    /* PLAY・CUE(R-02・R-03)。回転は約 0.7 秒で立ち上がる */
    await page.click('#playA');
    await page.waitForTimeout(2000);
    if (!/PAUSE/.test(await text('playA')) || (await text('clockA')) === '00:00')
      problems.push(`PLAY で再生にならない(${await text('playA')} / ${await text('clockA')})`);
    await page.click('#hotA');
    await page.click('#cueA');
    await page.waitForTimeout(300);
    if ((await text('clockA')) !== '00:00' || /PAUSE/.test(await text('playA')))
      problems.push('CUE で止まって頭に戻らない');
    if ((await text('hotA')) !== 'CUE SET') problems.push('HOT CUE を覚えていない');

    /* LOOP(R-04): 3 秒の曲を 4 秒鳴らしても、頭に戻って鳴り続ける */
    await page.click('#loopA');
    if ((await page.getAttribute('#loopA', 'aria-pressed')) !== 'true')
      problems.push('LOOP が ON にならない');
    await page.click('#playA');
    await page.waitForTimeout(4000);
    if (!/PAUSE/.test(await text('playA'))) problems.push('LOOP で曲の終わりから続かない');
    await page.click('#stopAll');
    await page.waitForTimeout(1000);
    if (/PAUSE/.test(await text('playA'))) problems.push('STOP ALL で止まらない');

    /* スクラッチ(R-07): 止めた盤を時計回りに1周なぞると約 1.8 秒進み、反時計回りに半周で戻る */
    await page.click('#cueA');
    await page.waitForTimeout(300);
    const box = await page.locator('#platterWrapA').boundingBox();
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2,
      radius = box.width * 0.35;
    const seekOf = () =>
      page.evaluate(() => (Number(document.getElementById('seekA').value) / 1000) * 3);
    async function drag(fromDegrees, toDegrees) {
      const point = (deg) => [
        cx + radius * Math.cos((deg * Math.PI) / 180),
        cy + radius * Math.sin((deg * Math.PI) / 180),
      ];
      await page.mouse.move(...point(fromDegrees));
      await page.mouse.down();
      const steps = 40;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(...point(fromDegrees + ((toDegrees - fromDegrees) * i) / steps));
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(250);
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
    await drag(-90, 270);
    const forward = await seekOf();
    if (forward < 1.4 || forward > 2.2)
      problems.push(`時計回り1周で ${forward.toFixed(2)} 秒(約 1.8 秒のはず)`);
    await drag(270, 90);
    const back = await seekOf();
    if (!(back < forward - 0.6))
      problems.push(`反時計回りで戻らない(${forward.toFixed(2)} → ${back.toFixed(2)} 秒)`);
    if (/PAUSE/.test(await text('playA'))) problems.push('止めた盤が、なぞった後に回り出した');

    /* 読めない曲(R-12 / T-03) */
    await page.setInputFiles('#fileB', broken);
    await page.waitForFunction(
      () => document.getElementById('titleB').textContent !== 'LOADING…',
      null,
      {
        timeout: 5000,
      },
    );
    if ((await text('titleB')) !== 'この曲は読み込めませんでした')
      problems.push(`読めない曲: ${await text('titleB')}`);

    /* RESET MIXER・FILTER(R-10・R-11) */
    await page.click('#filter');
    await page.fill('#cross', '0');
    await page.click('#resetMix');
    const mixer = await page.evaluate(() => ({
      cross: document.getElementById('cross').value,
      filter: document.getElementById('filter').getAttribute('aria-pressed'),
    }));
    if (mixer.cross !== '50' || mixer.filter !== 'false') problems.push('RESET MIXER で戻らない');

    /* ログ */
    const all = logs.join('\n');
    if (!/曲を読み込みました\(デッキA \/ 00:03\)/.test(all)) problems.push('読み込みのログが無い');
    if (!/ホットキューを覚えました\(デッキA/.test(all)) problems.push('ホットキューのログが無い');
    if (!/ミキサーを最初の値に戻しました/.test(all)) problems.push('ミキサーのログが無い');
    if (!/曲を読み込めませんでした\(デッキB\)/.test(all)) problems.push('読めない曲の警告が無い');
    if (!/「デッキA」の「再生」ボタンを押下しました/.test(all))
      problems.push('押下の自動ログが無い');
    if (/secret-song-name|broken-file/.test(all)) problems.push('ログにファイル名が出ている');
    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー: ' + real.join(' / '));
  } finally {
    await site.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(report('DJデッキの通し試験', problems) ? 0 : 1);
})();
