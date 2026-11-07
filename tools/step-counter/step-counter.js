/* 万歩計の画面(モーションセンサーで歩数を数える)。歩数の検出は step-counter-core.js */
(function () {
  'use strict';
  const countVal = document.getElementById('countVal');
  const distVal = document.getElementById('distVal');
  const calVal = document.getElementById('calVal');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const wakeLockChk = document.getElementById('wakeLockChk');
  const statusText = document.getElementById('statusText');

  const S = window.StepCounterCore;
  let counter = S.createStepCounter();
  let running = false;
  let wakeLock = null;
  let samples = 0,
    startSteps = 0;

  function summary() {
    const n = counter.getCount();
    return `${n.toLocaleString()}歩 / ${S.distanceKm(n).toFixed(2)} km / ${S.kcal(n)} kcal`;
  }
  function updateDisplay() {
    const steps = counter.getCount();
    countVal.textContent = steps.toLocaleString();
    distVal.textContent = S.distanceKm(steps).toFixed(2) + ' km';
    calVal.textContent = S.kcal(steps) + ' kcal';
  }

  function onMotion(event) {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (++samples === 1) log('モーションセンサーのデータを受信しました');
    counter.addSample(a.x, a.y, a.z, performance.now());
    updateDisplay();
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      log.warn('この端末・ブラウザはスリープ防止(Wake Lock)に対応していません');
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      log('スリープ防止を開始しました');
      wakeLock.addEventListener('release', () => {
        log('スリープ防止が解除されました');
        wakeLock = null;
      });
    } catch (e) {
      log.warn('スリープ防止を開始できませんでした', e);
    }
  }
  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch((e) => log.warn('スリープ防止の解除に失敗しました', e));
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', async () => {
    // バックグラウンドに行くとWake Lockは自動解除されるため、戻ってきたら再取得する
    if (running && wakeLockChk.checked && document.visibilityState === 'visible' && !wakeLock) {
      log('画面に戻ったため、スリープ防止をかけ直します');
      await requestWakeLock();
    }
  });

  async function start() {
    if (!(await ToolKit.sensor.permit('motion'))) {
      // iOS 13以降は押した時に許可を求める
      statusText.textContent =
        'モーションセンサーの利用が許可されませんでした。https で開いているか確認してください。';
      return;
    }

    window.addEventListener('devicemotion', onMotion);
    running = true;
    samples = 0;
    startSteps = counter.getCount();
    startBtn.hidden = true;
    stopBtn.hidden = false;
    statusText.textContent = '計測中…';
    log(`計測を開始しました(${summary()})`);
    ToolKit.sensor.watchData(
      3000,
      () => !running || samples > 0,
      () => {
        statusText.textContent =
          'センサーのデータが届きません。この端末にはモーションセンサーが無いか、ブラウザが対応していない可能性があります。';
      },
      'モーションセンサー',
    );

    if (wakeLockChk.checked) await requestWakeLock();
  }

  function stop() {
    window.removeEventListener('devicemotion', onMotion);
    running = false;
    startBtn.hidden = false;
    stopBtn.hidden = true;
    statusText.textContent = '';
    releaseWakeLock();
    log(
      `計測を停止しました(今回 ${(counter.getCount() - startSteps).toLocaleString()}歩 / 合計 ${summary()})`,
    );
  }

  startBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    start().catch((e) => log.error('計測の開始でエラーが発生しました', e));
  });
  stopBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    stop();
  });
  resetBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    counter.setCount(0);
    startSteps = 0;
    updateDisplay();
    log('歩数をリセットしました');
  });
  wakeLockChk.addEventListener('change', () => {
    ToolKit.vibrate();
    if (running) {
      if (wakeLockChk.checked) requestWakeLock();
      else releaseWakeLock();
    }
  });

  window.addEventListener('pagehide', () => {
    releaseWakeLock();
  });

  if (typeof DeviceMotionEvent === 'undefined') {
    statusText.textContent = 'この端末・ブラウザはモーションセンサーに対応していません。';
    startBtn.disabled = true;
    log.warn('この端末・ブラウザはモーションセンサーに対応していません');
  }
  updateDisplay();
  log.started(`スリープ防止 ${'wakeLock' in navigator ? '対応' : '非対応'}`);
})();
