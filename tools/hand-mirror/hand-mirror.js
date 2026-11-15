/* 手鏡(前面カメラを左右反転で表示。拡大・明るさ・ライト) */
(function () {
  'use strict';
  const video = document.getElementById('video');
  const emptyState = document.getElementById('emptyState');
  const statusText = document.getElementById('statusText');
  const switchCamBtn = document.getElementById('switchCamBtn');
  const torchBtn = document.getElementById('torchBtn');
  const zoomSlider = document.getElementById('zoomSlider');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const mirrorWrap = document.getElementById('mirrorWrap');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const exitFsBtn = document.getElementById('exitFsBtn');

  let stream = null;
  let track = null;
  let facingMode = 'user';
  let torchOn = false;
  const CAM = { user: '前面', environment: '背面' };

  function applyStyle() {
    const zoom = zoomSlider.value / 100;
    const mirror = facingMode === 'user' ? -1 : 1;
    video.style.transform = `scaleX(${mirror}) scale(${zoom})`;
    video.style.filter = `brightness(${brightnessSlider.value / 100})`;
  }
  function showStatus(msg) {
    statusText.textContent = msg;
    emptyState.style.display = '';
  }

  async function startCamera() {
    ToolKit.media.stop(stream);
    stream = null;
    track = null;
    const r = await ToolKit.media.open({ video: { facingMode: { ideal: facingMode } } }, 'カメラ');
    if (!r.stream) {
      showStatus(r.message);
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
    applyStyle();
    torchOn = false;
    torchBtn.classList.remove('active');
    log(`カメラを開始しました(${CAM[facingMode]} / ${ToolKit.media.size(track)})`);
  }

  switchCamBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    log(`カメラを${CAM[facingMode]}に切り替えます`);
    startCamera().catch((e) => log.error('カメラの切り替えでエラーが発生しました', e));
  });

  torchBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    const r = await ToolKit.media.torch(track, !torchOn);
    if (!r.ok) {
      statusText.textContent = r.message;
      return;
    }
    torchOn = !torchOn;
    torchBtn.classList.toggle('active', torchOn);
  });

  /* 全画面: 鏡を画面いっぱいに広げる。端末の全画面表示が使える時は、ブラウザの帯も隠す(iPhone の Safari などは画面いっぱいだけ) */
  function isFullscreen() {
    return mirrorWrap.classList.contains('is-fullscreen');
  }
  function setFullscreen(on) {
    if (isFullscreen() === on) return;
    mirrorWrap.classList.toggle('is-fullscreen', on);
    exitFsBtn.hidden = !on;
    log(on ? '全画面表示にしました' : '全画面表示を終了しました');
    if (on && mirrorWrap.requestFullscreen && !document.fullscreenElement) {
      mirrorWrap
        .requestFullscreen()
        .catch((e) =>
          log.warn('端末の全画面表示にできなかったため、画面いっぱいの表示にします', e),
        );
    }
    if (!on && document.fullscreenElement) {
      document.exitFullscreen().catch((e) => log.warn('端末の全画面表示を終了できませんでした', e));
    }
  }
  fullscreenBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    setFullscreen(true);
  });
  exitFsBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    setFullscreen(false);
  });
  /* 端末の戻る操作などで全画面表示が終わった時も、画面いっぱいの表示を戻す */
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) setFullscreen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setFullscreen(false);
  });

  zoomSlider.addEventListener('input', applyStyle);
  brightnessSlider.addEventListener('input', applyStyle);

  startCamera().catch((e) => log.error('カメラの開始でエラーが発生しました', e));
})();
