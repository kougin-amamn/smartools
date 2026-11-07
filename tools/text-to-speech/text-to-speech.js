/* 読み上げの画面。ブラウザの音声合成で文章を読む */
(function () {
  const textInput = document.getElementById('textInput');
  const langSelect = document.getElementById('langSelect');
  const rateSlider = document.getElementById('rateSlider');
  const rateLabel = document.getElementById('rateLabel');
  const pitchSlider = document.getElementById('pitchSlider');
  const pitchLabel = document.getElementById('pitchLabel');
  const playBtn = document.getElementById('playBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusText = document.getElementById('statusText');

  if (!('speechSynthesis' in window)) {
    statusText.textContent = 'この端末・ブラウザは読み上げ機能に対応していません。';
    playBtn.disabled = true;
    log.warn('この端末・ブラウザは読み上げ機能に対応していません');
  }

  rateSlider.addEventListener('input', () => {
    rateLabel.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x';
  });
  pitchSlider.addEventListener('input', () => {
    pitchLabel.textContent = parseFloat(pitchSlider.value).toFixed(1);
  });

  playBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const text = textInput.value.trim();
    if (!('speechSynthesis' in window)) {
      log.warn('この端末・ブラウザは読み上げ機能に対応していません');
      return;
    }
    if (!text) {
      log.warn('文字が無いため読み上げませんでした');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langSelect.value;
    u.rate = parseFloat(rateSlider.value);
    u.pitch = parseFloat(pitchSlider.value);
    u.onend = () => {
      statusText.textContent = '';
      log('読み上げが終わりました');
    };
    u.onerror = (e) => {
      statusText.textContent = '';
      if (e.error !== 'canceled' && e.error !== 'interrupted')
        log.warn(
          '読み上げでエラーが発生しました(端末にこの言語の音声が無い可能性があります)',
          e.error,
        );
    };
    statusText.textContent = '読み上げ中…';
    window.speechSynthesis.speak(u);
    log(
      `読み上げを開始しました(${u.lang} / ${text.length}文字 / 速さ ${u.rate}x / 高さ ${u.pitch})`,
    );
  });

  stopBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    statusText.textContent = '';
    log('読み上げを停止しました');
  });

  window.addEventListener('pagehide', () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  });
  if ('speechSynthesis' in window) {
    const countVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length)
        log(
          `読み上げの音声を確認しました(${v.length}種類 / 日本語 ${v.filter((x) => /^ja/.test(x.lang)).length}種類)`,
        );
      return v.length;
    };
    if (!countVoices())
      speechSynthesis.addEventListener('voiceschanged', countVoices, { once: true });
  }
})();
