/* 暗視カメラの画面。明るさとコントラストを上げ、緑のモノクロにもできる */
(function () {
  const video = document.getElementById('video');
  const emptyState = document.getElementById('emptyState');
  const statusText = document.getElementById('statusText');
  const switchCamBtn = document.getElementById('switchCamBtn');
  const captureBtn = document.getElementById('captureBtn');
  const torchBtn = document.getElementById('torchBtn');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const contrastSlider = document.getElementById('contrastSlider');
  const nightModeChk = document.getElementById('nightModeChk');
  const capturedList = document.getElementById('capturedList');
  const canvas = document.getElementById('captureCanvas');

  let stream = null;
  let track = null;
  let devices = [];
  let deviceIndex = 0;
  let torchOn = false;
  let shotCount = 0;

  function buildFilter() {
    const b = brightnessSlider.value / 100;
    const c = contrastSlider.value / 100;
    let f = `brightness(${b}) contrast(${c})`;
    if (nightModeChk.checked) f += ' grayscale(1) sepia(1) hue-rotate(80deg) saturate(4)';
    return f;
  }
  function applyFilter() {
    video.style.filter = buildFilter();
  }

  async function startCamera(deviceId) {
    ToolKit.media.stop(stream);
    stream = null;
    track = null;
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } } }
      : { video: { facingMode: { ideal: 'environment' } } };
    const r = await ToolKit.media.open(constraints, 'カメラ');
    if (!r.stream) {
      statusText.textContent = r.message;
      return;
    }
    stream = r.stream;
    track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      log.warn('映像の再生を開始できませんでした', e);
    }
    emptyState.style.display = 'none';
    applyFilter();
    torchOn = false;
    torchBtn.classList.remove('active');

    if (!devices.length) {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        devices = all.filter((d) => d.kind === 'videoinput');
      } catch (e) {
        log.warn('カメラの一覧を取得できませんでした', e);
      }
    }
    log(`カメラを開始しました(${ToolKit.media.size(track)} / カメラ ${devices.length}台)`);
  }

  switchCamBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (devices.length < 2) {
      statusText.textContent = '切り替えられるカメラが見つかりませんでした。';
      setTimeout(() => (statusText.textContent = ''), 2000);
      log.warn(`切り替えられるカメラが見つかりませんでした(${devices.length}台)`);
      return;
    }
    deviceIndex = (deviceIndex + 1) % devices.length;
    log(`カメラを切り替えます(${deviceIndex + 1} / ${devices.length}台目)`);
    startCamera(devices[deviceIndex].deviceId).catch((e) =>
      log.error('カメラの切り替えでエラーが発生しました', e),
    );
  });

  torchBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    const r = await ToolKit.media.torch(track, !torchOn);
    if (!r.ok) {
      statusText.textContent = r.message;
      setTimeout(() => (statusText.textContent = ''), 2500);
      return;
    }
    torchOn = !torchOn;
    torchBtn.classList.toggle('active', torchOn);
  });

  captureBtn.addEventListener('click', () => {
    ToolKit.vibrate(30);
    if (!video.videoWidth) {
      log.warn('カメラの映像が無いため撮影できませんでした');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.filter = buildFilter();
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    shotCount += 1;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `night-shot-${shotCount}.png`;
    const img = document.createElement('img');
    img.src = url;
    a.appendChild(img);
    capturedList.prepend(a);
    log(
      `撮影しました(${shotCount}枚目 / ${canvas.width}×${canvas.height} / 暗視 ${nightModeChk.checked ? 'ON' : 'OFF'})`,
    );
  });
  capturedList.addEventListener('click', (e) => {
    if (e.target.closest('a')) log('撮影した写真を押下しました(保存します)');
  });

  brightnessSlider.addEventListener('input', applyFilter);
  contrastSlider.addEventListener('input', applyFilter);
  nightModeChk.addEventListener('change', () => {
    ToolKit.vibrate();
    applyFilter();
  });

  log('起動しました');
  startCamera().catch((e) => log.error('カメラの開始でエラーが発生しました', e));
})();
