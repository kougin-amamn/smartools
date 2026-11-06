/* 水平器の画面。端末の傾きセンサーで気泡を動かす */
(function () {
  const bubble = document.getElementById('bubble');
  const levelOuter = document.getElementById('levelOuter');
  const angles = document.getElementById('angles');
  const statusText = document.getElementById('statusText');
  const startBtn = document.getElementById('startBtn');

  const RADIUS = 90; // 移動できる最大距離(px)
  const MAX_DEG = 45; // この角度でバブルが端に到達
  const OK_THRESHOLD = 2.5; // 水平とみなす角度
  let wasOk = false,
    gotFirst = false;

  function handleOrientation(e) {
    const beta = e.beta || 0;
    const gamma = e.gamma || 0;
    const x = Math.max(-1, Math.min(1, gamma / MAX_DEG)) * RADIUS;
    const y = Math.max(-1, Math.min(1, beta / MAX_DEG)) * RADIUS;
    bubble.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

    const isOk = Math.abs(beta) < OK_THRESHOLD && Math.abs(gamma) < OK_THRESHOLD;
    bubble.classList.toggle('ok', isOk);
    if (isOk && !wasOk) {
      ToolKit.vibrate(30);
      log.debug('水平になりました');
    }
    wasOk = isOk;

    angles.textContent = `前後 ${beta.toFixed(1)}° / 左右 ${gamma.toFixed(1)}°`;
    statusText.textContent = '';
    if (!gotFirst && (e.beta !== null || e.gamma !== null)) {
      gotFirst = true;
      log(`傾きを受信しました(前後 ${beta.toFixed(1)}° / 左右 ${gamma.toFixed(1)}°)`);
    }
  }

  function attachListener() {
    window.addEventListener('deviceorientation', handleOrientation);
    statusText.textContent = '端末を平らな面に置いてください';
    startBtn.hidden = true;
    log('センサーを開始しました');
    ToolKit.sensor.watchData(
      3000,
      () => gotFirst,
      () => {
        statusText.textContent =
          '傾きのデータが届きません。この端末には傾きセンサーが無いか、ブラウザが対応していない可能性があります。';
      },
      '傾き'
    );
  }

  startBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    if (await ToolKit.sensor.permit('orientation')) attachListener();
    else
      statusText.textContent =
        typeof DeviceOrientationEvent === 'undefined'
          ? 'この端末・ブラウザは向きセンサーに対応していません。'
          : 'センサーの利用が許可されませんでした。https で開いているか確認してください。';
  });
  log('起動しました');
})();
