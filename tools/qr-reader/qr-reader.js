/* QRコード読み取りの画面。カメラは ToolKit.media で開き、ZXing には読み取りだけをさせる */
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
  let stream = null;

  function isUrl(s) {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    } /* URL でない文字列(想定内) */
  }

  /* 読み取りの繰り返しとカメラを止める。止めたら true */
  function stopCamera() {
    if (codeReader) codeReader.reset();
    const stopped = ToolKit.media.stop(stream);
    stream = null;
    return stopped;
  }

  function showResult(text) {
    stopCamera();
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

    if (!window.ZXing) {
      statusText.textContent = 'ライブラリを読み込めませんでした。通信環境をご確認ください。';
      log.error('QRコード読み取りライブラリ(ZXing)を読み込めませんでした(通信が必要です)');
      return;
    }
    stopCamera();
    const r = await ToolKit.media.open(
      { video: { facingMode: { ideal: 'environment' } } },
      'カメラ',
    );
    if (!r.stream) {
      statusText.textContent = r.message;
      return;
    }
    stream = r.stream;

    try {
      if (!codeReader) codeReader = new ZXing.BrowserQRCodeReader();
      await codeReader.decodeFromStream(stream, video, (result, err) => {
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
      });
      statusText.textContent = 'QRコードを枠内に写してください';
      log(`カメラを開始しました(読み取り待ち / ${ToolKit.media.size(stream.getVideoTracks()[0])})`);
    } catch (e) {
      stopCamera();
      statusText.textContent = 'カメラの映像を読み取りに使えませんでした。';
      log.error('QRコードの読み取りの開始でエラーが発生しました', e);
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

  startCamera();
})();
