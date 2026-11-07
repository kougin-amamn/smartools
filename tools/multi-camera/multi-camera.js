/* 多機能カメラの画面。色の効果・グリッド・水平ガイド・タイマー・連写 */
(function () {
  const video = document.getElementById('video');
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const emptyState = document.getElementById('emptyState');
  const statusText = document.getElementById('statusText');
  const gridOverlay = document.getElementById('gridOverlay');
  const levelLine = document.getElementById('levelLine');
  const countdownText = document.getElementById('countdownText');

  const modeRow = document.getElementById('modeRow');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const contrastSlider = document.getElementById('contrastSlider');
  const saturateSlider = document.getElementById('saturateSlider');
  const zoomSlider = document.getElementById('zoomSlider');
  const gridChk = document.getElementById('gridChk');
  const levelChk = document.getElementById('levelChk');
  const mirrorChk = document.getElementById('mirrorChk');

  const switchCamBtn = document.getElementById('switchCamBtn');
  const torchBtn = document.getElementById('torchBtn');
  const timerSelect = document.getElementById('timerSelect');
  const burstBtn = document.getElementById('burstBtn');
  const captureBtn = document.getElementById('captureBtn');
  const capturedList = document.getElementById('capturedList');

  let stream = null,
    track = null;
  let facingMode = 'environment';
  let mode = 'normal';
  let torchOn = false;
  let shotCount = 0;
  let rafId = null;

  const MODE_FILTERS = {
    normal: '',
    night: 'brightness(180%) contrast(115%)',
    mono: 'grayscale(1)',
    sepia: 'sepia(1)',
    invert: 'invert(1)',
  };

  function buildFilter() {
    const base = MODE_FILTERS[mode] || '';
    const b = brightnessSlider.value,
      c = contrastSlider.value,
      s = saturateSlider.value;
    return `${base} brightness(${b}%) contrast(${c}%) saturate(${s}%)`.trim();
  }

  function drawFrame() {
    if (video.videoWidth) {
      const W = (canvas.width = video.videoWidth);
      const H = (canvas.height = video.videoHeight);
      const zoom = zoomSlider.value / 100;
      const sw = W / zoom,
        sh = H / zoom;
      const sx = (W - sw) / 2,
        sy = (H - sh) / 2;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = buildFilter();

      if (facingMode === 'user') {
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
        ctx.restore();
      } else {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      }

      if (mirrorChk.checked) {
        ctx.filter = 'none';
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(canvas, 0, 0, W / 2, H, W / 2, 0, W / 2, H);
        ctx.restore();
      }
    }
    rafId = requestAnimationFrame(drawFrame);
  }

  async function startCamera() {
    ToolKit.media.stop(stream);
    stream = null;
    track = null;
    const r = await ToolKit.media.open({ video: { facingMode: { ideal: facingMode } } }, 'カメラ');
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
    log(
      `カメラを開始しました(${facingMode === 'user' ? '前面' : '背面'} / ${ToolKit.media.size(track)})`,
    );
    emptyState.style.display = 'none';
    torchOn = false;
    torchBtn.classList.remove('active');
    if (!rafId) drawFrame();
  }

  switchCamBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera().catch((e) => log.error('カメラの切り替えでエラーが発生しました', e));
  });

  torchBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    const r = await ToolKit.media.torch(track, !torchOn);
    if (!r.ok) {
      flashStatus(r.message);
      return;
    }
    torchOn = !torchOn;
    torchBtn.classList.toggle('active', torchOn);
  });

  function flashStatus(msg) {
    statusText.textContent = msg;
    emptyState.style.display = 'flex';
    setTimeout(() => {
      emptyState.style.display = 'none';
    }, 2200);
  }

  modeRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    ToolKit.vibrate();
    mode = btn.dataset.mode;
    [...modeRow.children].forEach((c) => c.classList.toggle('active', c === btn));
    log(`モードを「${btn.textContent.trim()}」にしました`);
  });

  // グリッド・水平ガイド
  gridChk.addEventListener('change', () => {
    gridOverlay.hidden = !gridChk.checked;
  });

  let orientationAttached = false;
  function handleOrientation(e) {
    const gamma = e.gamma || 0;
    levelLine.style.transform = `translateY(-50%) rotate(${-gamma}deg)`;
    levelLine.classList.toggle('ok', Math.abs(gamma) < 2.5);
  }
  levelChk.addEventListener('change', async () => {
    ToolKit.vibrate();
    if (!levelChk.checked) {
      levelLine.hidden = true;
      return;
    }
    if (!orientationAttached) {
      if (!(await ToolKit.sensor.permit('orientation'))) {
        levelChk.checked = false;
        return;
      }
      window.addEventListener('deviceorientation', handleOrientation);
      orientationAttached = true;
    }
    levelLine.hidden = false;
    log('水平ガイドを表示しました');
  });

  // 撮影(タイマー・連写)
  function captureOnce() {
    shotCount += 1;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo-${shotCount}.png`;
    const img = document.createElement('img');
    img.src = url;
    a.appendChild(img);
    capturedList.prepend(a);
    ToolKit.vibrate(30);
    log(
      `撮影しました(${shotCount}枚目 / ${canvas.width}×${canvas.height} / ${Math.round((url.length * 0.75) / 1024)}KB)`,
    );
  }

  function countdownThen(seconds, cb) {
    if (seconds <= 0) {
      cb();
      return;
    }
    countdownText.hidden = false;
    let n = seconds;
    countdownText.textContent = n;
    const id = setInterval(() => {
      n -= 1;
      ToolKit.vibrate(15);
      if (n <= 0) {
        clearInterval(id);
        countdownText.hidden = true;
        cb();
      } else countdownText.textContent = n;
    }, 1000);
  }

  captureBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (!video.videoWidth) {
      log.warn('カメラの映像が無いため撮影できませんでした');
      return;
    }
    const seconds = parseInt(timerSelect.value, 10);
    if (seconds > 0) log(`${seconds}秒後に撮影します`);
    countdownThen(seconds, captureOnce);
  });

  let burstActive = false;
  burstBtn.addEventListener('click', () => {
    if (burstActive) {
      log.warn('連写中のため受け付けませんでした');
      return;
    }
    if (!video.videoWidth) {
      log.warn('カメラの映像が無いため撮影できませんでした');
      return;
    }
    ToolKit.vibrate();
    burstActive = true;
    burstBtn.classList.add('active');
    const seconds = parseInt(timerSelect.value, 10);
    countdownThen(seconds, () => {
      let shots = 0;
      const id = setInterval(() => {
        captureOnce();
        shots += 1;
        if (shots >= 5) {
          clearInterval(id);
          burstActive = false;
          burstBtn.classList.remove('active');
          log('連写が完了しました(5枚)');
        }
      }, 500);
    });
  });

  capturedList.addEventListener('click', (e) => {
    if (e.target.closest('a')) log('撮影した写真を押下しました(保存します)');
  });

  log('起動しました');
  startCamera().catch((e) => log.error('カメラの開始でエラーが発生しました', e));
})();
