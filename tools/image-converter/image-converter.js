/* 画像変換の画面。複数の画像をまとめて別の形式に変換し、ZIP でも保存できる */
(function () {
  const fileInput = document.getElementById('fileInput');
  const settingsPanel = document.getElementById('settingsPanel');
  const formatSelect = document.getElementById('formatSelect');
  const qualityRow = document.getElementById('qualityRow');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityVal = document.getElementById('qualityVal');
  const resizeChk = document.getElementById('resizeChk');
  const maxSideInput = document.getElementById('maxSideInput');
  const convertBtn = document.getElementById('convertBtn');
  const list = document.getElementById('list');
  const batchRow = document.getElementById('batchRow');
  const zipBtn = document.getElementById('zipBtn');

  const EXT_BY_MIME = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/x-icon': 'ico',
  };
  const CANVAS_NATIVE = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const GIF_MAX_SIDE = 600; // 量子化・LZWが重いため、GIF変換時は内部的に上限を設ける

  function isHeic(file) {
    const t = (file.type || '').toLowerCase();
    return t === 'image/heic' || t === 'image/heif' || (!t && /\.hei[cf]$/i.test(file.name));
  }
  const FMT_NAME = {
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/webp': 'WebP',
    'image/bmp': 'BMP',
    'image/gif': 'GIF',
    'image/x-icon': 'ICO',
  };
  const esc = ToolKit.esc;
  let items = [];
  let seq = 0;

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  function calcSize(w, h, maxSide) {
    if (!maxSide || Math.max(w, h) <= maxSide) return { w, h };
    const scale = maxSide / Math.max(w, h);
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }
  function renameExt(filename, ext) {
    const dot = filename.lastIndexOf('.');
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return base + '.' + ext;
  }

  function updateQualityVisibility() {
    qualityRow.hidden = formatSelect.value !== 'image/jpeg' && formatSelect.value !== 'image/webp';
  }
  formatSelect.addEventListener('change', () => {
    updateQualityVisibility();
  });
  qualitySlider.addEventListener('input', () => {
    qualityVal.textContent = Math.round(qualitySlider.value * 100) + '%';
  });
  maxSideInput.addEventListener('change', () => log(`リサイズの長辺を ${maxSideInput.value}px にしました`));
  updateQualityVisibility();

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    settingsPanel.hidden = false;
    const t0 = performance.now();
    // HEICの変換(WASM)は同時に走らせると重いため1件ずつ処理する
    for (const file of files) {
      try {
        await addItem(file);
      } catch (e) {
        log.error('画像の読み込みでエラーが発生しました', e);
      }
    }
    log(`画像を読み込みました(全 ${items.length}件 / ${Math.round(performance.now() - t0)}ms)`);
    fileInput.value = '';
  });

  async function addItem(file) {
    const id = ++seq;
    const row = document.createElement('div');
    row.className = 'item';
    row.dataset.id = id;
    row.innerHTML = `
      <img alt="">
      <div class="meta">
        <div class="name">${esc(file.name)}</div>
        <div class="sizes"><span class="orig">${formatBytes(file.size)}</span> → <span class="new">読み込み中…</span></div>
      </div>
      <a class="dl" href="#" aria-disabled="true">待機中</a>
    `;
    list.appendChild(row);

    let sourceUrl;
    let heicConverted = false;
    if (isHeic(file)) {
      if (!window.heic2any) {
        row.querySelector('.new').textContent = 'HEIC変換ライブラリを読み込めませんでした';
        log.error('HEIC変換ライブラリ(heic2any)を読み込めませんでした(通信が必要です)');
        return;
      }
      row.querySelector('.new').textContent = 'HEICを変換中…';
      try {
        const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
        const blob = Array.isArray(result) ? result[0] : result; // 複数画像入りHEICは1枚目のみ扱う
        sourceUrl = URL.createObjectURL(blob);
        heicConverted = true;
        log(`HEICをJPEGに変換して読み込みました(${formatBytes(file.size)})`);
      } catch (e) {
        log.error('HEICの変換でエラーが発生しました', e);
        row.querySelector('.new').textContent =
          `HEICの変換に失敗しました(${e && e.message ? e.message : '不明なエラー'})`;
        return;
      }
    } else {
      sourceUrl = URL.createObjectURL(file);
    }

    const img = new Image();
    const item = { id, file, img, url: sourceUrl, origSize: file.size, converted: null };
    items.push(item);
    row.querySelector('img').src = sourceUrl;
    row.querySelector('.new').textContent = heicConverted ? 'HEIC→JPEGで読込済み' : '未変換';

    img.onload = () => {
      item.origW = img.naturalWidth;
      item.origH = img.naturalHeight;
    };
    img.onerror = () => {
      row.querySelector('.new').textContent = '画像を読み込めませんでした';
      item.broken = true;
      log.warn(`画像を読み込めませんでした(${formatBytes(file.size)} / 形式 ${file.type || '不明'})`);
    };
    img.src = sourceUrl;
  }

  function finishWithBlob(item, blob) {
    const ext = EXT_BY_MIME[formatSelect.value] || 'png';
    const name = renameExt(item.file.name, ext);
    const url = URL.createObjectURL(blob);
    item.converted = { blob, url, name, size: blob.size };
    return item.converted;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  }

  async function convertOne(item) {
    const format = formatSelect.value;
    const maxSide =
      format === 'image/gif'
        ? Math.min(
            resizeChk.checked ? parseInt(maxSideInput.value, 10) || GIF_MAX_SIDE : GIF_MAX_SIDE,
            GIF_MAX_SIDE
          )
        : resizeChk.checked
          ? parseInt(maxSideInput.value, 10)
          : 0;
    const { w, h } = calcSize(
      item.origW || item.img.naturalWidth,
      item.origH || item.img.naturalHeight,
      maxSide
    );

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (format === 'image/jpeg' || format === 'image/bmp') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(item.img, 0, 0, w, h);

    if (CANVAS_NATIVE.has(format)) {
      const quality = parseFloat(qualitySlider.value);
      const blob = await canvasToBlob(canvas, format, format === 'image/png' ? undefined : quality);
      if (blob) return finishWithBlob(item, blob);
      return null;
    }

    const rgba = ctx.getImageData(0, 0, w, h).data;
    if (format === 'image/bmp') {
      const bytes = ImageCodecs.encodeBMP(w, h, rgba);
      return finishWithBlob(item, new Blob([bytes], { type: 'image/bmp' }));
    }
    if (format === 'image/gif') {
      const bytes = ImageCodecs.encodeGIF(w, h, rgba, 256);
      return finishWithBlob(item, new Blob([bytes], { type: 'image/gif' }));
    }
    if (format === 'image/x-icon') {
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      const bytes = ImageCodecs.encodeICOFromPNG(pngBytes, w, h);
      return finishWithBlob(item, new Blob([bytes], { type: 'image/x-icon' }));
    }
    return null;
  }

  convertBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    if (!items.length) {
      log.warn('画像が無いため変換しませんでした');
      return;
    }
    convertBtn.disabled = true;
    convertBtn.textContent = '変換中…';
    const t0 = performance.now();
    let ok = 0,
      ng = 0,
      before = 0,
      after = 0;
    for (const item of items) {
      if (item.broken) {
        ng++;
        continue;
      }
      try {
        await convertOne(item);
      } catch (e) {
        item.converted = null;
        log.error('画像の変換でエラーが発生しました', e);
      }
      if (item.converted) {
        ok++;
        before += item.origSize;
        after += item.converted.size;
      } else ng++;
      const row = list.querySelector(`.item[data-id="${item.id}"]`);
      if (row && item.converted) {
        row.querySelector('.new').textContent = formatBytes(item.converted.size);
        const dl = row.querySelector('.dl');
        dl.href = item.converted.url;
        dl.download = item.converted.name;
        dl.textContent = '保存';
        dl.classList.add('ready');
        dl.removeAttribute('aria-disabled');
      }
    }
    convertBtn.disabled = false;
    convertBtn.textContent = 'すべて変換';
    if (items.some((i) => i.converted)) batchRow.hidden = false;
    (ng ? log.warn : log)(
      `変換しました(${FMT_NAME[formatSelect.value]} / 成功 ${ok}件${ng ? ' / 失敗 ' + ng + '件' : ''} / ${formatBytes(before)} → ${formatBytes(after)} / ${Math.round(performance.now() - t0)}ms)`
    );
  });

  zipBtn.addEventListener('click', async () => {
    ToolKit.vibrate();
    if (!window.JSZip) {
      log.error('ZIP作成ライブラリ(JSZip)を読み込めませんでした(通信が必要です)');
      return;
    }
    const zip = new JSZip();
    items.forEach((item) => {
      if (item.converted) zip.file(item.converted.name, item.converted.blob);
    });
    zipBtn.disabled = true;
    zipBtn.textContent = '作成中…';
    let blob;
    try {
      blob = await zip.generateAsync({ type: 'blob' });
    } catch (e) {
      log.error('ZIPの作成でエラーが発生しました', e);
      zipBtn.disabled = false;
      zipBtn.textContent = 'まとめてZIPでダウンロード';
      return;
    }
    zipBtn.disabled = false;
    zipBtn.textContent = 'まとめてZIPでダウンロード';
    log(`ZIPを作成しました(${Object.keys(zip.files).length}件 / ${formatBytes(blob.size)})`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'converted-images.zip';
    a.click();
  });
  list.addEventListener('click', (e) => {
    const dl = e.target.closest('.dl.ready');
    if (dl) log(`保存ボタンを押下しました(${dl.download.split('.').pop().toUpperCase()})`);
  });
  log(
    '起動しました(HEIC変換 ' +
      (window.heic2any ? 'あり' : 'なし') +
      ' / ZIP ' +
      (window.JSZip ? 'あり' : 'なし') +
      ')'
  );
})();
