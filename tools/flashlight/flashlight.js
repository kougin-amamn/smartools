/* 懐中電灯。背面カメラのライト(トーチ)を点ける。点いたカメラを覚えて次回は直接使う */
(function () {
  const powerBtn = document.getElementById('powerBtn');
  const statusText = document.getElementById('statusText');
  let torchStream = null;
  let torchTrack = null;
  let torchOn = false;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* 指定した条件でカメラを取得し、torchが使えるか試す。使えればストリームを返し、
   使えなければストリームを閉じてnullを返す(呼び出し側で後片付けを気にしなくてよい)。 */
  async function tryGetTorch(videoConstraints, label) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
    } catch (e) {
      log.warn(`カメラを取得できませんでした${label ? '(' + label + ')' : ''}`, e);
      return null;
    }
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : null;
    if (!caps || !('torch' in caps)) {
      log(`ライトの制御に対応していないカメラでした${label ? '(' + label + ')' : ''}`);
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: true }] });
      const settings = track.getSettings ? track.getSettings() : null;
      if (settings && settings.torch === true) {
        log(`ライトを点灯しました${label ? '(' + label + ')' : ''}`);
        if (settings.deviceId) {
          try {
            localStorage.setItem(KNOWN_DEVICE_KEY, settings.deviceId);
          } catch (e) {
            log.warn('点灯できたカメラの保存に失敗しました', e);
          }
        }
        return stream;
      }
      log.warn(`ライトをオンにしましたが点灯しませんでした${label ? '(' + label + ')' : ''}`);
    } catch (e) {
      log.warn(`ライトをオンにできませんでした${label ? '(' + label + ')' : ''}`, e);
    }
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  /* 背面カメラのtorchを探して点灯する。
   1. まずfacingMode指定で素直に試す(ほとんどの端末はこれで点く)
   2. ダメなら全カメラを列挙し、1台ずつ試す(背面カメラが複数あり、
      facingMode指定だとフラッシュの無い方が選ばれてしまう端末があるため)
   カメラの切り替え時は、前のストリームを確実に閉じてから少し待ってから次を試す
   (閉じないまま次を開こうとすると「使用中」エラーになる端末があるため)。 */
  const KNOWN_DEVICE_KEY = 'flashlight-known-torch-device';

  async function findAndEnableTorch() {
    log('本体のライトを探します');

    // 前回ライトが点いたカメラを覚えていれば、まずそこから直接試す(探索をスキップして高速化)
    let knownId = null;
    try {
      knownId = localStorage.getItem(KNOWN_DEVICE_KEY);
    } catch (e) {
      log.warn('前回のカメラの読み込みに失敗しました', e);
    }
    if (knownId) {
      const stream = await tryGetTorch({ deviceId: { exact: knownId } }, '前回成功したカメラ');
      if (stream) return stream;
      log('前回のカメラは使えなくなっていたため、通常の探索に切り替えます');
      try {
        localStorage.removeItem(KNOWN_DEVICE_KEY);
      } catch (e) {
        log.warn('前回のカメラの削除に失敗しました', e);
      }
      await sleep(120);
    }

    let stream = await tryGetTorch({ facingMode: { ideal: 'environment' } }, '標準');
    if (stream) return stream;

    await sleep(120);
    log('カメラを列挙して1台ずつ試します');
    let devices;
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (e) {
      log.error('カメラの列挙でエラーが発生しました', e);
      return null;
    }
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    // ライトは実質的に必ず背面カメラ側にあるため、ラベルから背面と分かるものを先に試す
    // (前面カメラを律儀に試して失敗させる分、無駄な待ち時間が発生するのを避ける)
    videoInputs.sort((a, b) => {
      const aBack = /back|rear/i.test(a.label) ? 0 : 1;
      const bBack = /back|rear/i.test(b.label) ? 0 : 1;
      return aBack - bBack;
    });
    log(`カメラを検出しました(${videoInputs.length}台 / 背面優先の順で試します)`);

    for (const dev of videoInputs) {
      const label = dev.label || dev.deviceId.slice(0, 8);
      stream = await tryGetTorch({ deviceId: { exact: dev.deviceId } }, label);
      if (stream) return stream;
      await sleep(120);
    }
    return null;
  }

  async function toggleTorch() {
    if (torchOn) {
      if (torchTrack) {
        try {
          await torchTrack.applyConstraints({ advanced: [{ torch: false }] });
        } catch (e) {
          log.warn('ライトのオフに失敗しました(カメラを閉じて消灯します)', e);
        }
      }
      if (torchStream) torchStream.getTracks().forEach((t) => t.stop());
      torchStream = null;
      torchTrack = null;
      torchOn = false;
      powerBtn.classList.remove('on');
      statusText.textContent = 'タップして点灯';
      log('ライトを消灯しました');
      return;
    }

    var needHttps = Env.requireSecure('ライト');
    if (needHttps) {
      statusText.textContent = needHttps;
      return;
    }

    statusText.textContent = '点灯を試しています…';
    const stream = await findAndEnableTorch();
    if (!stream) {
      statusText.textContent = 'この端末のカメラはライトの制御に対応していません。';
      log.warn('ライトを点灯できませんでした(この端末のカメラはブラウザからのライト制御に対応していません)');
      return;
    }
    torchStream = stream;
    torchTrack = stream.getVideoTracks()[0];
    torchOn = true;
    powerBtn.classList.add('on');
    statusText.textContent = '点灯中(タップして消灯)';
    ToolKit.vibrate(30);
  }

  powerBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    toggleTorch().catch((e) => log.error('ライトの切り替えでエラーが発生しました', e));
  });
  window.addEventListener('pagehide', () => {
    if (torchStream) {
      torchStream.getTracks().forEach((t) => t.stop());
      log('ページを離れるためライトを消灯しました');
    }
  });
  log('起動しました');
})();
