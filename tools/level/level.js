/* 画面の左右方向を測る一軸の水平器。 */
(function () {
  const $ = (id) => document.getElementById(id);
  let raw = null, baseline = 0, calibrated = false, wasOk = false, started = false;
  let lastSample = 0;
  const rotation = () => window.screen?.orientation?.angle ?? window.orientation ?? 0;
  function render() {
    if (raw === null) return;
    const angle = LevelCore.difference(raw, baseline);
    const ok = Math.abs(angle) <= Number($('toleranceSelect').value);
    $('bubble').hidden = false;
    $('bubble').style.setProperty('--offset', String(Math.max(-1, Math.min(1, angle / 10))));
    $('angles').innerHTML = LevelCore.format(angle) + '<span class="degree">°</span>';
    $('instrument').classList.toggle('is-level', ok);
    const state = ok ? (calibrated ? '✓ 基準一致' : '✓ 水平') : (calibrated ? '基準からの傾き' : '');
    if ($('levelState').textContent !== state) $('levelState').textContent = state;
    if (ok && !wasOk && $('vibrationChk').checked) ToolKit.vibrate(30);
    wasOk = ok;
    $('calibrateBtn').disabled = false;
    $('resetBtn').disabled = !calibrated;
  }
  function invalidate() {
    raw = null;
    wasOk = false;
    $('bubble').hidden = true;
    $('angles').innerHTML = '—<span class="degree">°</span>';
    $('instrument').classList.remove('is-level');
    $('levelState').textContent = '';
    $('calibrateBtn').disabled = true;
  }
  function handleOrientation(event) {
    const angle = LevelCore.angle(event.beta, event.gamma, rotation());
    if (angle === null) return;
    raw = angle;
    lastSample = Date.now();
    $('statusText').textContent = '';
    render();
  }
  $('calibrateBtn').addEventListener('click', () => {
    if (raw === null || Date.now() - lastSample > 3000) return;
    baseline = raw; calibrated = true; render();
  });
  $('resetBtn').addEventListener('click', () => {
    baseline = 0; calibrated = false; $('resetBtn').disabled = true; render();
  });
  $('toleranceSelect').addEventListener('change', render);
  const onRotate = () => {
    baseline = 0; calibrated = false; $('resetBtn').disabled = true; invalidate();
    $('statusText').textContent = '傾きを取得しています…';
  };
  if (window.screen?.orientation?.addEventListener) window.screen.orientation.addEventListener('change', onRotate);
  else window.addEventListener('orientationchange', onRotate);
  function start() {
    if (started) return;
    started = true;
    $('startBtn').hidden = true;
    $('statusText').textContent = '傾きを取得しています…';
    window.addEventListener('deviceorientation', handleOrientation);
    lastSample = Date.now();
    setInterval(() => {
      if (Date.now() - lastSample <= 3000) return;
      invalidate();
      $('statusText').textContent = '傾きを取得できません。センサーの対応とブラウザの設定を確認してください。';
    }, 1000);
  }
  $('startBtn').addEventListener('click', async () => {
    $('startBtn').disabled = true;
    try {
      if (await ToolKit.sensor.permit('orientation')) start();
      else $('statusText').textContent = 'センサーの利用が許可されませんでした。ブラウザの設定を確認してください。';
    } catch (error) {
      $('statusText').textContent = 'センサーの許可を取得できませんでした。もう一度お試しください。';
      log.warn('センサーの許可を取得できませんでした', error);
    } finally { $('startBtn').disabled = false; }
  });
  if (!window.isSecureContext) $('statusText').textContent = 'センサーの利用にはHTTPS接続が必要です。';
  else if (typeof window.DeviceOrientationEvent === 'undefined') $('statusText').textContent = 'この端末・ブラウザは向きセンサーに対応していません。';
  else if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
    $('startBtn').hidden = false;
    $('statusText').textContent = '傾きを表示するにはセンサーの許可が必要です';
  } else start();
})();
