/* 回線速度テストの画面。計算は speed-test-core.js */
(function () {
  const startBtn = document.getElementById('startBtn');
  const gaugeVal = document.getElementById('gaugeVal');
  const gaugeUnit = document.getElementById('gaugeUnit');
  const gaugePhase = document.getElementById('gaugePhase');
  const pingVal = document.getElementById('pingVal');
  const jitterVal = document.getElementById('jitterVal');
  const downVal = document.getElementById('downVal');
  const upVal = document.getElementById('upVal');

  const DOWN_URL = 'https://speed.cloudflare.com/__down';
  const UP_URL = 'https://speed.cloudflare.com/__up';
  const DOWNLOAD_BYTES = 25 * 1024 * 1024; // 25MB
  const UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

  const { bpsToMbps, median, jitter } = window.SpeedTestCore;

  function setGauge(value, unit, phase) {
    gaugeVal.textContent = value;
    gaugeUnit.textContent = unit;
    gaugePhase.textContent = phase;
  }

  // Ping/ジッター
  async function pingTest() {
    setGauge('-', 'ms', 'Pingを計測中…');
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      try {
        const r = await fetch(`${DOWN_URL}?bytes=0`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
      } catch (e) {
        log.warn(`Pingの計測に失敗しました(${i + 1}/10回目)`, e);
        continue;
      }
      const t = performance.now() - t0;
      samples.push(t);
      setGauge(t.toFixed(0), 'ms', `Ping計測中… (${i + 1}/10)`);
    }
    const usable = samples.slice(2); // 最初の数回は接続確立のオーバーヘッドが乗るため除外
    if (!usable.length) throw new Error('Pingの計測に失敗しました');
    return { ping: median(usable), jitter: jitter(usable) };
  }

  // XHRで進捗付きの転送を行う(fetchはアップロード進捗を取得できないため)
  function xhrTransfer(method, url, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      const progressTarget = method === 'POST' ? xhr.upload : xhr;
      const t0 = performance.now();
      let lastLoaded = 0;
      progressTarget.onprogress = (e) => {
        lastLoaded = e.loaded;
        onProgress(e.loaded, performance.now() - t0);
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        resolve({ bytes: lastLoaded || (body ? body.size : 0), ms: performance.now() - t0 });
      };
      xhr.onerror = () => reject(new Error('ネットワークエラー'));
      xhr.ontimeout = () => reject(new Error('タイムアウトしました'));
      xhr.timeout = 30000;
      xhr.send(body || null);
    });
  }

  async function downloadTest() {
    setGauge('0', 'Mbps', 'ダウンロードを計測中…');
    const result = await xhrTransfer(
      'GET',
      `${DOWN_URL}?bytes=${DOWNLOAD_BYTES}`,
      null,
      (loaded, ms) => {
        if (ms > 100) setGauge(bpsToMbps(loaded, ms).toFixed(1), 'Mbps', 'ダウンロードを計測中…');
      },
    );
    return bpsToMbps(result.bytes, result.ms);
  }

  async function uploadTest() {
    setGauge('0', 'Mbps', 'アップロードを計測中…');
    const blob = new Blob([new ArrayBuffer(UPLOAD_BYTES)]);
    const result = await xhrTransfer('POST', UP_URL, blob, (loaded, ms) => {
      if (ms > 100) setGauge(bpsToMbps(loaded, ms).toFixed(1), 'Mbps', 'アップロードを計測中…');
    });
    return bpsToMbps(result.bytes, result.ms);
  }

  async function runAll() {
    startBtn.disabled = true;
    const t0 = performance.now();
    log('計測を開始しました(Ping → ダウンロード → アップロード / 計測先 speed.cloudflare.com)');
    pingVal.textContent = '-';
    jitterVal.textContent = '-';
    downVal.textContent = '-';
    upVal.textContent = '-';
    try {
      const { ping, jitter: jit } = await pingTest();
      pingVal.textContent = ping.toFixed(0) + ' ms';
      jitterVal.textContent = jit.toFixed(1) + ' ms';
      log(`Pingを計測しました(${ping.toFixed(0)} ms / ジッター ${jit.toFixed(1)} ms)`);

      const down = await downloadTest();
      downVal.textContent = down.toFixed(1) + ' Mbps';
      setGauge(down.toFixed(1), 'Mbps', 'ダウンロード完了');
      log(`ダウンロード速度を計測しました(${down.toFixed(1)} Mbps)`);

      const up = await uploadTest();
      upVal.textContent = up.toFixed(1) + ' Mbps';
      setGauge(up.toFixed(1), 'Mbps', '計測完了');
      ToolKit.vibrate();
      log(
        `計測が完了しました(Ping ${pingVal.textContent} / 下り ${downVal.textContent} / 上り ${upVal.textContent} / ${((performance.now() - t0) / 1000).toFixed(1)}秒)`,
      );
    } catch (e) {
      setGauge('-', '', `計測に失敗しました(${e.message})`);
      log.error('回線速度の計測でエラーが発生しました(通信状況を確認してください)', e);
    }
    startBtn.disabled = false;
  }

  startBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    runAll();
  });
})();
