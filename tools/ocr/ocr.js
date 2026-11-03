/* 文字認識の画面。画像やカメラから文字を読み取る(認識は Tesseract.js) */
(function () {
  const tabs = document.querySelectorAll('.tab');
  const filePanel = document.getElementById('filePanel');
  const cameraPanel = document.getElementById('cameraPanel');
  const fileInput = document.getElementById('fileInput');
  const video = document.getElementById('video');
  const camEmptyState = document.getElementById('camEmptyState');
  const camStatus = document.getElementById('camStatus');
  const shotBtn = document.getElementById('shotBtn');
  const previewWrap = document.getElementById('previewWrap');
  const previewImg = document.getElementById('previewImg');
  const langSelect = document.getElementById('langSelect');
  const recognizeBtn = document.getElementById('recognizeBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const statusText = document.getElementById('statusText');
  const resultBox = document.getElementById('resultBox');
  const resultText = document.getElementById('resultText');
  const copyBtn = document.getElementById('copyBtn');
  const speakBtn = document.getElementById('speakBtn');
  const workCanvas = document.getElementById('workCanvas');

  let currentImageSource = null; // dataURL
  let stream = null;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      const isFile = tab.dataset.mode === 'file';
      filePanel.hidden = !isFile;
      cameraPanel.hidden = isFile;
      if (!isFile) startCamera().catch((e) => log.error('カメラの開始でエラーが発生しました', e));
      else stopCamera();
    });
  });

  async function startCamera() {
    if (stream) return;
    const r = await ToolKit.media.open({ video: { facingMode: { ideal: 'environment' } } }, 'カメラ');
    if (!r.stream) {
      camStatus.textContent = r.message;
      return;
    }
    stream = r.stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      log.warn('映像の再生を開始できませんでした', e);
    }
    camEmptyState.style.display = 'none';
    log('カメラを開始しました(背面)');
  }
  function stopCamera() {
    if (ToolKit.media.stop(stream)) {
      stream = null;
      log('カメラを停止しました');
    }
  }

  function setPreview(dataUrl) {
    currentImageSource = dataUrl;
    previewImg.src = dataUrl;
    previewWrap.hidden = false;
    recognizeBtn.disabled = false;
    resultBox.hidden = true;
    statusText.textContent = '';
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.onerror = () => log.error('画像の読み込みでエラーが発生しました', reader.error);
    reader.readAsDataURL(file);
  });

  shotBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (!video.videoWidth) {
      log.warn('カメラの映像が無いため撮影できませんでした');
      return;
    }
    workCanvas.width = video.videoWidth;
    workCanvas.height = video.videoHeight;
    workCanvas.getContext('2d').drawImage(video, 0, 0);
    setPreview(workCanvas.toDataURL('image/png'));
    log(`撮影しました(${workCanvas.width}×${workCanvas.height})`);
  });

  recognizeBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    if (!currentImageSource) {
      log.warn('画像が無いため認識しませんでした');
      return;
    }
    if (!window.Tesseract) {
      statusText.textContent = '文字認識ライブラリを読み込めませんでした。通信環境をご確認ください。';
      log.error('文字認識ライブラリ(Tesseract.js)を読み込めませんでした(通信が必要です)');
      return;
    }
    let lastStatus = '';
    recognizeBtn.disabled = true;
    progressWrap.hidden = false;
    progressFill.style.width = '0%';
    progressLabel.textContent = '準備中…';
    statusText.textContent = '';
    resultBox.hidden = true;

    const r = await log.step(
      '文字認識',
      async () => {
        const worker = await Tesseract.createWorker(langSelect.value, 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const pct = Math.round(m.progress * 100);
              progressFill.style.width = pct + '%';
              progressLabel.textContent = `認識中… ${pct}%`;
            } else {
              progressLabel.textContent = m.status;
              if (m.status !== lastStatus) {
                lastStatus = m.status;
                log.debug(`文字認識の準備: ${m.status}`);
              }
            }
          },
        });
        const { data } = await worker.recognize(currentImageSource);
        await worker.terminate();
        return data;
      },
      (data) =>
        `${langSelect.options[langSelect.selectedIndex].text} / ${data.text.trim().length}文字 / 確からしさ ${Math.round(data.confidence || 0)}%`
    );
    progressWrap.hidden = true;
    if (r.ok) {
      resultText.value = r.value.text.trim();
      resultBox.hidden = false;
    } else
      statusText.textContent =
        '文字認識に失敗しました。通信環境や画像をご確認ください(初回は言語データの読み込みに通信が必要です)。';
    recognizeBtn.disabled = false;
  });

  copyBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    const ok = await ToolKit.copyText(resultText.value, '認識した文字', `${resultText.value.length}文字`);
    if (ok) {
      copyBtn.textContent = 'コピーしました';
      setTimeout(() => (copyBtn.textContent = 'コピー'), 1500);
    } else resultText.select();
  });

  speakBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (!('speechSynthesis' in window)) {
      log.warn('この端末・ブラウザは読み上げに対応していません');
      return;
    }
    if (!resultText.value) {
      log.warn('文字が無いため読み上げませんでした');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(resultText.value);
    u.lang = langSelect.value.includes('jpn') ? 'ja-JP' : 'en-US';
    u.onend = () => log('読み上げが終わりました');
    u.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted')
        log.warn('読み上げでエラーが発生しました', e.error);
    };
    window.speechSynthesis.speak(u);
    log(`読み上げを開始しました(${u.lang} / ${resultText.value.length}文字)`);
  });

  window.addEventListener('pagehide', () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  });
  log('起動しました');
})();
