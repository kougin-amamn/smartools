/* サイクルメーターの画面(GPSで速度・距離・時間)。計算は cycle-meter-core.js。位置の座標はログに出さない */
(function () {
  'use strict';
  const speedNum = document.getElementById('speedNum');
  const distVal = document.getElementById('distVal');
  const timeVal = document.getElementById('timeVal');
  const avgVal = document.getElementById('avgVal');
  const maxVal = document.getElementById('maxVal');
  const statusText = document.getElementById('statusText');
  const startStopBtn = document.getElementById('startStopBtn');
  const resetBtn = document.getElementById('resetBtn');

  const C = window.CycleMeterCore,
    meter = C.create(),
    st = meter.state;
  let watchId = null;
  let running = false;
  let elapsedMs = 0;
  let startedAt = 0;
  let timerId = null;
  let fixes = 0,
    lowAcc = 0;

  function nowElapsed() {
    return running ? elapsedMs + (Date.now() - startedAt) : elapsedMs;
  }
  function render(currentSpeedKmh) {
    speedNum.textContent = currentSpeedKmh.toFixed(1);
    distVal.textContent = `${(st.distM / 1000).toFixed(2)} km`;
    const ms = nowElapsed();
    timeVal.textContent = C.fmtTime(ms);
    avgVal.textContent = `${C.avgKmh(st.distM, ms).toFixed(1)} km/h`;
    maxVal.textContent = `${st.maxKmh.toFixed(1)} km/h`;
  }
  function summary() {
    return `${(st.distM / 1000).toFixed(2)} km / ${C.fmtTime(nowElapsed())} / 平均 ${C.avgKmh(st.distM, nowElapsed()).toFixed(1)} km/h / 最高 ${st.maxKmh.toFixed(1)} km/h`;
  }

  function onPosition(pos) {
    const { latitude, longitude, speed, accuracy } = pos.coords;
    const kmh = meter.update({ lat: latitude, lon: longitude, speed, accuracy, t: pos.timestamp });
    fixes++;
    if (accuracy > C.ACCURACY_LIMIT) lowAcc++;
    if (fixes === 1) log(`位置情報を受信しました(精度 約${Math.round(accuracy)}m)`);
    statusText.textContent =
      accuracy > C.ACCURACY_LIMIT ? `GPS精度が低いです(±${Math.round(accuracy)}m)` : '';
    render(kmh);
  }

  function onError(err) {
    if (err.code === err.PERMISSION_DENIED) {
      statusText.textContent = '位置情報の利用が許可されませんでした。';
      log.warn('位置情報の利用が許可されませんでした');
    } else {
      statusText.textContent = '位置情報を取得できませんでした。';
      log.warn('位置情報を取得できませんでした(電波の届く屋外で試してください)', err && err.message);
    }
  }

  function tick() {
    render(parseFloat(speedNum.textContent) || 0);
    timerId = requestAnimationFrame(tick);
  }

  function start() {
    var needHttps = Env.requireSecure('位置情報');
    if (needHttps) {
      statusText.textContent = needHttps;
      return;
    }
    if (!navigator.geolocation) {
      statusText.textContent = 'この端末・ブラウザは位置情報に対応していません。';
      log.warn('この端末・ブラウザは位置情報に対応していません');
      return;
    }
    running = true;
    startedAt = Date.now();
    meter.pause();
    fixes = 0;
    lowAcc = 0;
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 8000,
    });
    startStopBtn.textContent = '一時停止';
    statusText.textContent = '計測中…';
    tick();
    ToolKit.vibrate();
    log(`計測を${elapsedMs ? '再開' : '開始'}しました(${summary()})`);
  }

  function stop() {
    if (!running) return;
    elapsedMs += Date.now() - startedAt;
    running = false;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    cancelAnimationFrame(timerId);
    startStopBtn.textContent = '再開';
    statusText.textContent = '一時停止中';
    render(0);
    ToolKit.vibrate();
    log(
      `計測を一時停止しました(${summary()} / 測位 ${fixes}回${lowAcc ? ' うち精度低 ' + lowAcc + '回' : ''})`
    );
  }

  function reset() {
    stop();
    meter.reset();
    elapsedMs = 0;
    startStopBtn.textContent = '開始';
    statusText.textContent = '開始ボタンをタップしてください';
    render(0);
    log('リセットしました');
  }

  startStopBtn.addEventListener('click', () => {
    running ? stop() : start();
  });
  resetBtn.addEventListener('click', () => {
    reset();
  });

  window.addEventListener('pagehide', () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  });

  render(0);
  log('起動しました');
})();
