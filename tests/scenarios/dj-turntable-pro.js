/* DJターンテーブル Pro の通し試験。作った曲(120 BPM の打音と 440Hz)を2台に読み込み、BPM・START・メーター・
   クロスフェーダー・スクラッチ・ホットキュー・ログを確かめる。横向き(844×390)で開く。
   使い方: node tests/scenarios/dj-turntable-pro.js [--shot 画像の保存先] */
const { launch, report, splitErrors } = require('../lib/harness');

/* 10秒・44.1kHz・ステレオの WAV。120 BPM の低い打音に 440Hz を重ねる */
function wav(seconds) {
  const rate = 44100,
    n = rate * seconds,
    data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const inBeat = i % (rate / 2);
    let v = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.15;
    if (inBeat < rate * 0.06)
      v += Math.sin((2 * Math.PI * 60 * inBeat) / rate) * Math.exp(-inBeat / (rate * 0.02)) * 0.7;
    const s = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    data.writeInt16LE(s, 44 + i * 4);
    data.writeInt16LE(s, 46 + i * 4);
  }
  return data;
}

(async () => {
  const h = await launch(['--autoplay-policy=no-user-gesture-required']);
  const problems = [];
  try {
    const { page, logs } = await h.open('tools/dj-turntable-pro/dj-turntable-pro.html', {
      width: 844,
      wait: 500,
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const file = { name: '試験の曲.wav', mimeType: 'audio/wav', buffer: wav(10) };
    const level = (w) => page.$eval(`[data-meter="${w}"]`, (m) => Number(m.dataset.level || 0));

    /* 曲の一覧からデッキ A と B に読み込む */
    for (const deck of [0, 1]) {
      await page.locator('.deck-track').nth(deck).click();
      if (deck === 0) await page.setInputFiles('#fileInput', file);
      await page.locator(`[data-load="0"][data-deck="${deck}"]`).click();
      await page.waitForFunction(
        (d) => document.querySelectorAll('.deck-bpm')[d].textContent !== '---.-',
        deck,
        {
          timeout: 8000,
        },
      );
    }
    const bpm = await page.locator('.deck-bpm').first().textContent();
    if (bpm !== '120.0') problems.push('BPM が 120.0 ではありません: ' + bpm);

    /* デッキ A を回す(クロスフェーダーは中央)と、A とマスターのメーターが振れ、B は静か */
    await page.locator('.start').first().click();
    await page.waitForTimeout(2000);
    const [a, b, m] = [await level(0), await level(1), await level('master')];
    if (!(a >= 6 && m >= 6)) problems.push(`回したのにメーターが振れません(A ${a} / M ${m})`);
    if (b !== 0) problems.push('止まっているデッキ B のメーターが振れています: ' + b);
    const time = await page.locator('.deck-time').first().textContent();
    if (!/^-0:0[7-9]$/.test(time)) problems.push('再生位置が進んでいません: ' + time);

    /* クロスフェーダーを B 側いっぱいにすると、マスターが静かになる */
    await page.$eval('#crossfader', (x) => {
      x.value = 1;
      x.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    const quiet = await level('master');
    if (quiet > 2) problems.push('クロスフェーダーを B に寄せてもマスターが鳴っています: ' + quiet);
    await page.$eval('#crossfader', (x) => {
      x.value = 0.5;
      x.dispatchEvent(new Event('input', { bubbles: true }));
    });

    /* スクラッチ: 盤を押さえて止めると、位置がほぼ止まる */
    const box = await page.locator('.platter').first().boundingBox();
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    await page.mouse.move(cx + box.width * 0.3, cy);
    await page.mouse.down();
    await page.waitForTimeout(400);
    const held1 = await page.evaluate(() => document.querySelector('.deck-time').textContent);
    await page.waitForTimeout(1100);
    const held2 = await page.evaluate(() => document.querySelector('.deck-time').textContent);
    if (held1 !== held2) problems.push(`押さえているのに進みました(${held1} → ${held2})`);
    /* 指で半周、逆に回す */
    for (let k = 1; k <= 10; k++) {
      const ang = (-Math.PI * k) / 10;
      await page.mouse.move(
        cx + Math.cos(ang) * box.width * 0.3,
        cy + Math.sin(ang) * box.width * 0.3,
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);

    /* ホットキュー 1 を置き、押すとそこから鳴る */
    await page.locator('.hot').first().click();
    const set = await page.locator('.hot').first().getAttribute('class');
    if (!/set/.test(set)) problems.push('ホットキューが点きません');
    await page.locator('.hot').first().click();

    if (process.argv[2] === '--shot') await page.screenshot({ path: process.argv[3] });

    const text = logs.join('\n');
    [
      /音の準備をしました\(\d+Hz/,
      /デッキ A への曲の読み込みが終わりました\(0:10 \/ 120\.0 BPM/,
      /デッキ A を回しました\(33回転 \/ ピッチ 0\.0%\)/,
      /「デッキ A」の「START\/STOP」ボタンを押下しました/,
      /デッキ A のホットキュー 1 を置きました/,
    ].forEach((re) => {
      if (!re.test(text)) problems.push('ログがありません: ' + re);
    });
    if (/試験の曲/.test(text)) problems.push('ログに曲名が出ています');
    splitErrors(logs).real.forEach((e) => problems.push(e));
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await h.close();
  }
  process.exitCode = report('dj-turntable-pro シナリオ', problems) ? 0 : 1;
})();
