/* カラーピッカーの画面(「色を選ぶ」と「カメラで判定」の2つのモード)。色の計算は color-picker-core.js */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const tabs = document.querySelectorAll('.tab');
  const pickPanel = $('pickPanel'),
    camPanel = $('camPanel');
  const colorInput = $('colorInput');
  const video = $('video'),
    camWrap = $('camWrap'),
    sampleBox = $('sampleBox'),
    emptyState = $('emptyState'),
    camStatus = $('camStatus');
  const sizeSlider = $('sizeSlider'),
    freezeBtn = $('freezeBtn'),
    workCanvas = $('workCanvas');
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  const swatch = $('swatch'),
    hexInput = $('hexInput'),
    rgbText = $('rgbText'),
    hslText = $('hslText'),
    copyHexBtn = $('copyHexBtn');
  const nearestSwatch = $('nearestSwatch'),
    nearestEn = $('nearestEn'),
    nearestJa = $('nearestJa');
  const searchInput = $('searchInput'),
    resultsEl = $('results'),
    statusText = $('statusText');

  const MODE_KEY = 'color-picker-mode';
  const MODE_NAME = { pick: '色を選ぶ', cam: 'カメラで判定' };
  let dictionary = [];
  let mode = 'pick';
  let currentHex = '#7C3AED';
  let stream = null,
    rafId = null,
    frozen = false,
    lastNearestAt = 0;

  if (typeof chroma === 'undefined') {
    statusText.textContent =
      '色の計算に使うライブラリ(chroma.js)を読み込めませんでした。通信できる環境で開き直してください。';
    log.error('色の計算に使うライブラリ(chroma.js)を読み込めませんでした(通信が必要です)');
    return;
  }
  const CP = window.ColorPickerCore,
    CC = CP.create(chroma);

  /* 結果の表示(両モード共通) */
  function showColor(rgb, opts) {
    opts = opts || {};
    const hex = CC.rgbToHex(rgb),
      hsl = CC.rgbToHsl(rgb);
    currentHex = hex;
    swatch.style.background = hex;
    if (document.activeElement !== hexInput) hexInput.value = hex;
    rgbText.textContent = `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    hslText.textContent = `HSL(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    if (mode === 'pick') colorInput.value = hex.toLowerCase();
    // カメラは毎フレーム変わるため、近い色名の検索は 0.2 秒に1回にする
    const now = performance.now();
    if (dictionary.length && (!opts.live || now - lastNearestAt > 200)) {
      lastNearestAt = now;
      const n = CC.nearest(dictionary, rgb);
      nearestSwatch.style.background = n.hex;
      nearestEn.textContent = n.name_en;
      nearestJa.textContent = n.name_ja;
    }
  }
  function showHex(hex) {
    showColor(CC.hexToRgb(hex));
  }
  function colorSummary() {
    return (
      currentHex +
      (nearestJa.textContent && nearestJa.textContent !== '-' ? ' / ' + nearestJa.textContent : '')
    );
  }

  /* モードの切り替え */
  function setMode(m, opts) {
    opts = opts || {};
    if (m === mode && !opts.force) return;
    mode = m;
    tabs.forEach((t) => {
      const on = t.dataset.mode === m;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    pickPanel.hidden = m !== 'pick';
    camPanel.hidden = m !== 'cam';
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (e) {
      log.warn('モードの保存に失敗しました', e);
    }
    if (m === 'cam') startCamera().catch((e) => log.error('カメラの開始でエラーが発生しました', e));
    else {
      stopCamera();
      colorInput.value = currentHex.toLowerCase();
    }
    if (!opts.silent) log(`モードを「${MODE_NAME[m]}」にしました`);
  }
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      ToolKit.vibrate();
      setMode(t.dataset.mode);
    })
  );

  /* 色を選ぶ */
  colorInput.addEventListener('input', () => showHex(colorInput.value));
  colorInput.addEventListener('change', () => log(`色を選択しました(${colorSummary()})`));
  hexInput.addEventListener('change', () => {
    const v = CP.normalizeHex(hexInput.value);
    if (!v) {
      hexInput.value = currentHex;
      log.warn('HEXの形式ではないため反映しませんでした(#RRGGBB か #RGB で入力してください)');
      return;
    }
    if (mode === 'cam') setMode('pick');
    showHex(v);
    hexInput.value = currentHex;
    log(`HEXを入力しました(${colorSummary()})`);
  });

  /* カメラで判定 */
  async function startCamera() {
    if (stream) return;
    frozen = false;
    freezeBtn.textContent = '一時停止';
    freezeBtn.classList.remove('active');
    emptyState.classList.remove('hide');
    camStatus.textContent = 'カメラを起動しています…';
    const r = await ToolKit.media.open({ video: { facingMode: { ideal: 'environment' } } }, 'カメラ');
    if (!r.stream) {
      camStatus.textContent = r.message;
      return;
    }
    if (mode !== 'cam') {
      ToolKit.media.stop(r.stream);
      return;
    } // 起動中に「色を選ぶ」へ戻った
    stream = r.stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      log.warn('映像の再生を開始できませんでした', e);
    }
    emptyState.classList.add('hide');
    freezeBtn.disabled = false;
    loop();
    log('カメラを開始しました(背面 / 判定を開始)');
  }
  function stopCamera() {
    cancelAnimationFrame(rafId);
    rafId = null;
    freezeBtn.disabled = true;
    if (ToolKit.media.stop(stream)) {
      stream = null;
      video.srcObject = null;
      log(`カメラを停止しました(${colorSummary()})`);
    }
  }
  function sampleFrame() {
    if (!video.videoWidth) return;
    const scale = Math.min(1, 220 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale)),
      h = Math.max(1, Math.round(video.videoHeight * scale));
    workCanvas.width = w;
    workCanvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const box = Math.max(2, Math.round((Math.min(w, h) * parseInt(sizeSlider.value, 10)) / 100));
    const data = ctx.getImageData(
      Math.max(0, Math.round((w - box) / 2)),
      Math.max(0, Math.round((h - box) / 2)),
      box,
      box
    ).data;
    showColor(CP.average(data), { live: true });
  }
  function loop() {
    if (!frozen) sampleFrame();
    rafId = requestAnimationFrame(loop);
  }
  freezeBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    frozen = !frozen;
    freezeBtn.textContent = frozen ? '再開' : '一時停止';
    freezeBtn.classList.toggle('active', frozen);
    if (frozen) {
      lastNearestAt = 0;
      showHex(currentHex);
    } // 止めた色で近い色名を確定する
    log(frozen ? `判定を一時停止しました(${colorSummary()})` : '判定を再開しました');
  });
  sizeSlider.addEventListener('input', () => {
    sampleBox.style.width = sizeSlider.value + '%';
  });

  /* コピー */
  copyHexBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    const ok = await ToolKit.copyText(currentHex, 'HEX', currentHex);
    if (ok) {
      copyHexBtn.textContent = 'コピーしました';
      setTimeout(() => (copyHexBtn.textContent = 'コピー'), 1500);
    } else {
      hexInput.focus();
      hexInput.select();
    }
  });

  /* 色名で検索 */
  function renderResults(list) {
    resultsEl.innerHTML = '';
    list.slice(0, 60).forEach((c) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML =
        '<div class="sw"></div><div class="info"><div class="en"></div><div class="ja"></div></div><div class="hex"></div>';
      row.querySelector('.sw').style.background = c.hex;
      row.querySelector('.en').textContent = c.name_en;
      row.querySelector('.ja').textContent = c.name_ja;
      row.querySelector('.hex').textContent = c.hex;
      row.addEventListener('click', () => {
        ToolKit.vibrate();
        log(`検索結果の「${c.name_ja}」を押下しました`);
        if (mode === 'cam') setMode('pick');
        showHex(c.hex);
        log(`色を選択しました(${c.hex} / ${c.name_ja})`);
      });
      resultsEl.appendChild(row);
    });
  }
  let searchLogTimer = null;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    const matched = CP.search(dictionary, q);
    renderResults(matched);
    clearTimeout(searchLogTimer);
    if (q)
      searchLogTimer = setTimeout(
        () =>
          log(
            `色名を検索しました(${q.length}文字 / ${matched.length}件${matched.length > 60 ? ' / 先頭60件を表示' : ''})`
          ),
        600
      );
  });

  /* 色名の辞書(colors.json) */
  async function loadDictionary() {
    try {
      const res = await fetch('./colors.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' colors.json');
      dictionary = await res.json();
      statusText.textContent = '';
      showHex(currentHex);
      log(`色名の辞書を読み込みました(${dictionary.length}色)`);
    } catch (e) {
      log.error('色名の辞書(colors.json)を読み込めませんでした', e);
      statusText.textContent =
        location.protocol === 'file:'
          ? '辞書ファイル(colors.json)を読み込めませんでした。file:// で開いたページでは読めないため、https で配信したページで開いてください。'
          : '辞書ファイル(colors.json)を読み込めませんでした。';
    }
  }

  document.addEventListener('visibilitychange', () => {
    // 別のアプリに切り替えた時はカメラを止め、戻ったら再開する
    if (mode !== 'cam') return;
    if (document.hidden) stopCamera();
    else startCamera().catch((e) => log.error('カメラの再開でエラーが発生しました', e));
  });

  // よく使うカメラを最初のモードにする(前回「色を選ぶ」で終えた時だけそちら)
  let saved = 'cam';
  try {
    saved = localStorage.getItem(MODE_KEY) === 'pick' ? 'pick' : 'cam';
  } catch (e) {
    log.warn('前回のモードを読み込めませんでした', e);
  }
  showHex(currentHex);
  log(`起動しました(モード ${MODE_NAME[saved]})`);
  setMode(saved, { force: true, silent: true });
  loadDictionary();
})();
