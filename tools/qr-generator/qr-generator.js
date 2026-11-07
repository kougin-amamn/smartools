/* QRコード作成の画面 */
(function () {
  const textInput = document.getElementById('textInput');
  const qrBox = document.getElementById('qrBox');
  const downloadBtn = document.getElementById('downloadBtn');
  const statusText = document.getElementById('statusText');

  let qrcode = null;
  let debounceId = null;

  function ensureQrcode(text) {
    if (!qrcode) {
      qrcode = new QRCode(qrBox, {
        text: text || ' ',
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } else {
      qrcode.clear();
      qrcode.makeCode(text || ' ');
    }
  }

  function render() {
    const text = textInput.value.trim();
    if (!text) {
      qrBox.innerHTML = '';
      qrcode = null;
      downloadBtn.disabled = true;
      statusText.textContent = 'テキストを入力すると自動生成されます';
      return;
    }
    if (typeof QRCode === 'undefined') {
      statusText.textContent =
        'QRコード生成ライブラリを読み込めませんでした。通信環境をご確認ください。';
      log.error('QRコード生成ライブラリ(qrcodejs)を読み込めませんでした(通信が必要です)');
      return;
    }
    try {
      ensureQrcode(text);
    } catch (e) {
      qrBox.innerHTML = '';
      qrcode = null;
      downloadBtn.disabled = true;
      statusText.textContent = '文字数が多すぎるため、QRコードを作れませんでした。';
      log.warn(`文字数が多すぎるため、QRコードを作れませんでした(${text.length}文字)`, e);
      return;
    }
    downloadBtn.disabled = false;
    statusText.textContent = '';
    log(`QRコードを生成しました(${text.length}文字)`);
  }

  textInput.addEventListener('input', () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(render, 250);
  });

  downloadBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const canvas = qrBox.querySelector('canvas');
    if (!canvas) {
      statusText.textContent = '保存できる画像がありません。';
      log.warn('保存できる画像がありませんでした');
      return;
    }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'qrcode.png';
    a.click();
    log(`QRコードを保存しました(qrcode.png / ${canvas.width}×${canvas.height})`);
  });
})();
