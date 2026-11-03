/* 照度計の画面。照度センサーが無い時はカメラの明るさから推定する */
(function () {
  const luxNum = document.getElementById('luxNum');
  const luxUnit = document.getElementById('luxUnit');
  const gaugeFill = document.getElementById('gaugeFill');
  const labelText = document.getElementById('labelText');
  const statusText = document.getElementById('statusText');
  const startStopBtn = document.getElementById('startStopBtn');
  const noteText = document.getElementById('noteText');

  let running = false;
  let stream = null,
    video = null,
    canvas = null,
    ctx = null,
    rafId = null;
  let sensor = null,
    gotFirst = false;
  /* カメラ推定の lx 表示に使う状態 */
  const L = window.LightCore;
  const CAL_KEY = 'light-meter-cal';
  let cal = L.DEFAULT_CAL,
    smoothSv = null,
    lastSv = null,
    lastExpoAt = -Infinity,
    expo = null,
    luxMode = false,
    warnedNoExpo = false;
  const calib = document.getElementById('calib');
  const refLux = document.getElementById('refLux');

  try {
    const saved = Number(localStorage.getItem(CAL_KEY));
    if (saved > 0) cal = saved;
  } catch (e) {
    log.warn('補正値を読み込めなかったので初期値にしました', e);
  }

  function labelFor(pct) {
    if (pct < 10) return '暗い';
    if (pct < 30) return 'やや暗い';
    if (pct < 60) return '普通';
    if (pct < 85) return '明るい';
    return '非常に明るい';
  }

  function renderPercent(pct) {
    luxNum.textContent = Math.round(pct);
    gaugeFill.style.width = pct + '%';
    labelText.textContent = labelFor(pct);
  }

  function renderLux(lux) {
    luxNum.textContent = Math.round(lux);
    const pct = Math.max(0, Math.min(100, (lux / 1000) * 100));
    gaugeFill.style.width = pct + '%';
    labelText.textContent = labelFor(pct);
  }

  /* カメラの露出(露出時間・ISO)を 0.5 秒ごとに読み、映像の明るさから「場面の明るさ」の値を返す。読めない端末では null */
  function exposureNow(avg) {
    const now = performance.now();
    if (now - lastExpoAt > 500 && stream) {
      lastExpoAt = now;
      const s = stream.getVideoTracks()[0].getSettings();
      expo = s.exposureTime > 0 && s.iso > 0 ? { t: s.exposureTime, iso: s.iso } : null;
    }
    return expo ? L.sceneValue(avg, expo.t, expo.iso) : null;
  }

  function showMode() {
    if (luxMode) {
      luxUnit.textContent = 'lx(カメラ推定の目安)';
      noteText.textContent =
        'カメラの映像と露出から換算した目安です。端末や補正によって、実際の照度と数倍ずれることがあります。';
    } else {
      luxUnit.textContent = '%(相対値・カメラ推定)';
      noteText.textContent =
        'この端末のカメラは露出の情報を取れないため、lx には換算できません。カメラ映像の明るさの相対値を表示しています。';
      if (!warnedNoExpo) {
        warnedNoExpo = true;
        log.warn('カメラから露出情報(露出時間・ISO)を取れないため、lx に換算できません');
      }
    }
    calib.hidden = !luxMode;
  }

  function cameraLoop() {
    if (!running) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      ctx.drawImage(video, 0, 0, 32, 32);
      const data = ctx.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const avg = sum / (data.length / 4); // 0-255
      const sv = exposureNow(avg);
      if (sv === null) {
        luxMode = false;
        renderPercent((avg / 255) * 100);
      } else {
        luxMode = true;
        smoothSv = smoothSv === null ? sv : smoothSv * 0.8 + sv * 0.2;
        lastSv = smoothSv;
        renderLux(L.estimateLux(smoothSv, cal));
      }
      showMode();
    }
    rafId = requestAnimationFrame(cameraLoop);
  }

  async function startCameraFallback() {
    log('照度センサーが使えないため、カメラの明るさで推定します');
    const r = await ToolKit.media.open({ video: { facingMode: 'environment' } }, 'カメラ');
    if (!r.stream) {
      statusText.textContent = r.message;
      return;
    }
    stream = r.stream;
    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      log.warn('映像の再生を開始できませんでした', e);
    }
    canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    smoothSv = null;
    warnedNoExpo = false;
    statusText.textContent = '計測中…';
    running = true;
    startStopBtn.textContent = '停止';
    cameraLoop();
    log('計測を開始しました(カメラ推定)');
  }

  async function startSensor() {
    try {
      sensor = new AmbientLightSensor({ frequency: 4 });
      sensor.addEventListener('reading', () => {
        luxUnit.textContent = 'lx';
        renderLux(sensor.illuminance);
        if (!gotFirst) {
          gotFirst = true;
          log(`照度を受信しました(${Math.round(sensor.illuminance)} lx)`);
        }
      });
      sensor.addEventListener('error', (e) => {
        log.warn('照度センサーでエラーが発生しました(カメラ推定に切り替えます)', e.error || e);
        sensor = null;
        running = false;
        startCameraFallback().catch((er) => log.error('カメラの開始でエラーが発生しました', er));
      });
      sensor.start();
      statusText.textContent = '計測中…';
      running = true;
      startStopBtn.textContent = '停止';
      log('計測を開始しました(照度センサー / lx)');
    } catch (e) {
      log.warn('照度センサーを開始できませんでした', e);
      await startCameraFallback();
    }
  }

  async function start() {
    if ('AmbientLightSensor' in window) {
      await startSensor();
    } else {
      await startCameraFallback();
    }
    ToolKit.vibrate();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    if (sensor) {
      try {
        sensor.stop();
      } catch (e) {
        log.warn('照度センサーの停止に失敗しました', e);
      }
      sensor = null;
    }
    ToolKit.media.stop(stream);
    stream = null;
    startStopBtn.textContent = '開始';
    statusText.textContent = '停止しました';
    calib.hidden = true;
    ToolKit.vibrate();
    log(`計測を停止しました(最後の値 ${luxNum.textContent} ${luxUnit.textContent})`);
  }

  function saveCal(v) {
    cal = v;
    try {
      if (v === L.DEFAULT_CAL) localStorage.removeItem(CAL_KEY);
      else localStorage.setItem(CAL_KEY, String(v));
    } catch (e) {
      log.warn('補正値を保存できませんでした(このページだけ有効です)', e);
    }
  }
  document.getElementById('calBtn').addEventListener('click', () => {
    const next = L.calibrate(Number(refLux.value), lastSv);
    if (next === null) {
      log.warn('補正できませんでした(基準の明るさか、カメラの値が正しくありません)');
      statusText.textContent = '補正できませんでした。基準の明るさを確認してください';
      return;
    }
    saveCal(next);
    smoothSv = lastSv;
    log(`補正しました(基準 ${refLux.value} lx / 補正値 ${Math.round(next)})`);
  });
  document.getElementById('calResetBtn').addEventListener('click', () => {
    saveCal(L.DEFAULT_CAL);
    log('補正値を初期値に戻しました');
  });

  startStopBtn.addEventListener('click', () => {
    running ? stop() : start().catch((e) => log.error('計測の開始でエラーが発生しました', e));
  });
  log(`起動しました(照度センサー ${'AmbientLightSensor' in window ? 'あり' : 'なし'})`);
})();
