/* QRコード読み取りの画面(読み取りは ZXing) */
(function () {
  const video = document.getElementById('video');
  const statusText = document.getElementById('statusText');
  const scanLine = document.getElementById('scanLine');
  const resultCard = document.getElementById('resultCard');
  const resultText = document.getElementById('resultText');
  const copyBtn = document.getElementById('copyBtn');
  const openBtn = document.getElementById('openBtn');
  const rescanBtn = document.getElementById('rescanBtn');

  let codeReader = null;
  let controls = null; // decodeFromConstraints() が返す、停止用のコントローラ

  function isUrl(s) {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    } /* URL でない文字列(想定内) */
  }

  function errText(e) {
    if (!e) return '不明なエラー';
    return `${e.name || 'Error'}: ${e.message || String(e)}`;
  }

  function showResult(text) {
    if (controls) {
      controls.stop();
      controls = null;
    }
    scanLine.style.display = 'none';
    resultText.textContent = text;
    if (isUrl(text)) {
      openBtn.href = text;
      openBtn.hidden = false;
    } else {
      openBtn.hidden = true;
    }
    resultCard.hidden = false;
    statusText.textContent = '';
    ToolKit.vibrate(60);
    log(`QRコードを読み取りました(${text.length}文字 / ${isUrl(text) ? 'URL' : 'テキスト'})`);
  }

  async function startCamera() {
    resultCard.hidden = true;
    scanLine.style.display = '';
    statusText.textContent = 'カメラを起動しています…';

    var needHttps = Env.requireSecure('カメラ');
    if (needHttps) {
      statusText.textContent = needHttps;
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.textContent = 'このブラウザはカメラ機能に対応していません。';
      log.warn('このブラウザはカメラ機能に対応していません');
      return;
    }
    if (!window.ZXing) {
      statusText.textContent = 'ライブラリを読み込めませんでした。通信環境をご確認ください。';
      log.error('QRコード読み取りライブラリ(ZXing)を読み込めませんでした(通信が必要です)');
      return;
    }

    try {
      if (!codeReader) codeReader = new ZXing.BrowserQRCodeReader();
      controls = await codeReader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result, err) => {
          if (result) {
            showResult(result.getText());
            return;
          }
          // 見つからなかった場合は毎フレーム NotFoundException が来る(想定内の動作、エラー扱いしない)
          if (
            err &&
            err.name &&
            err.name !== 'NotFoundException' &&
            err.name !== 'NotFoundException2'
          ) {
            log.warn('QRコードの読み取り中にエラーが発生しました', err);
          }
        },
      );
      statusText.textContent = 'QRコードを枠内に写してください';
      log('カメラを開始しました(読み取り待ち)');
    } catch (e) {
      if (e && e.name === 'NotAllowedError') {
        statusText.textContent =
          'カメラへのアクセスが許可されていません。ブラウザの設定から許可してください。';
      } else if (e && e.name === 'NotFoundError') {
        statusText.textContent = '利用できるカメラが見つかりませんでした。';
      } else {
        statusText.textContent = `カメラを起動できませんでした(${errText(e)})`;
      }
      log.error('カメラの起動でエラーが発生しました', e);
    }
  }

  function stopCamera() {
    if (controls) {
      controls.stop();
      controls = null;
      log('カメラを停止しました');
    }
  }

  copyBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    const ok = await ToolKit.copyText(
      resultText.textContent,
      '読み取った内容',
      `${resultText.textContent.length}文字`,
    );
    if (ok) {
      copyBtn.textContent = 'コピーしました';
      setTimeout(() => (copyBtn.textContent = 'コピー'), 1500);
    } else statusText.textContent = 'コピーできませんでした。内容を手で選んでコピーしてください。';
  });

  rescanBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    startCamera();
  });

  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('beforeunload', stopCamera);

  log('起動しました');
  startCamera();
})();
