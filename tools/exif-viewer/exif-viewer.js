/* Exif ビューアの画面。写真の撮影情報を表にする(読み取りは exifr) */
(function () {
  const fileInput = document.getElementById('fileInput');
  const tableWrap = document.getElementById('tableWrap');
  const headRow = document.getElementById('headRow');
  const bodyRows = document.getElementById('bodyRows');
  const statusText = document.getElementById('statusText');

  let lastUrls = [];
  const esc = ToolKit.esc;

  const ORIENTATION_LABELS = {
    1: '通常',
    2: '左右反転',
    3: '180度回転',
    4: '上下反転',
    5: '左右反転+反時計90度',
    6: '時計回り90度',
    7: '左右反転+時計90度',
    8: '反時計回り90度',
  };

  function formatShutter(t) {
    if (!t) return null;
    if (t >= 1) return t.toFixed(1) + '秒';
    return '1/' + Math.round(1 / t) + '秒';
  }
  function formatGPS(lat, lon) {
    if (lat == null || lon == null) return null;
    const latDir = lat >= 0 ? 'N' : 'S',
      lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lon).toFixed(5)}°${lonDir}`;
  }
  function formatDate(d) {
    if (!d) return null;
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return null;
      return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
      return null;
    } /* 日付として読めない値(想定内) */
  }

  // 項目定義:1つにまとめておき、表の行生成と値取得の両方で使う
  const FIELD_DEFS = [
    { label: '撮影日時', get: (e) => formatDate(e.DateTimeOriginal || e.CreateDate) },
    { label: 'メーカー', get: (e) => (e.Make ? esc(e.Make) : null) },
    { label: '機種', get: (e) => (e.Model ? esc(e.Model) : null) },
    { label: 'レンズ', get: (e) => (e.LensModel ? esc(e.LensModel) : null) },
    { label: '焦点距離', get: (e) => (e.FocalLength ? `${e.FocalLength}mm` : null) },
    { label: 'F値', get: (e) => (e.FNumber ? `f/${e.FNumber}` : null) },
    { label: 'シャッタースピード', get: (e) => formatShutter(e.ExposureTime) },
    { label: 'ISO感度', get: (e) => (e.ISO ? `ISO ${e.ISO}` : null) },
    {
      label: '露出補正',
      get: (e) =>
        e.ExposureCompensation
          ? `${e.ExposureCompensation > 0 ? '+' : ''}${e.ExposureCompensation}`
          : null,
    },
    { label: 'フラッシュ', get: (e) => (typeof e.Flash === 'string' ? esc(e.Flash) : null) },
    {
      label: '画像サイズ',
      get: (e, w, h) => {
        const ww = e.ExifImageWidth || e.PixelXDimension || w;
        const hh = e.ExifImageHeight || e.PixelYDimension || h;
        return ww && hh ? `${ww}×${hh}px` : null;
      },
    },
    {
      label: '向き',
      get: (e) =>
        e.Orientation ? ORIENTATION_LABELS[e.Orientation] || String(e.Orientation) : null,
    },
    { label: '色空間', get: (e) => (e.ColorSpace === 1 ? 'sRGB' : e.ColorSpace || null) },
    { label: 'ソフトウェア', get: (e) => (e.Software ? esc(e.Software) : null) },
    {
      label: 'GPS位置',
      get: (e) => {
        const g = formatGPS(e.latitude, e.longitude);
        if (!g) return null;
        return `<a href="https://www.google.com/maps?q=${e.latitude},${e.longitude}" target="_blank" rel="noopener">${g} ↗</a>`;
      },
    },
    { label: 'GPS高度', get: (e) => (e.GPSAltitude ? `${Math.round(e.GPSAltitude)}m` : null) },
  ];

  async function readOne(file) {
    const url = URL.createObjectURL(file);
    let exif = null;
    try {
      exif = await window.exifr.parse(file, { gps: true, exif: true, ifd0: true });
    } catch (e) {
      exif = null;
      log.warn(`Exif情報を読めませんでした(${(file.size / 1024).toFixed(0)}KB)`, e);
    }
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    return {
      file,
      url,
      exif: exif || {},
      hasExif: !!exif,
      w: img.naturalWidth,
      h: img.naturalHeight,
    };
  }

  function buildTable(photos) {
    headRow.innerHTML =
      '<th class="field-col">項目</th>' +
      photos
        .map(
          (p) => `
      <th><div class="photo-head"><img src="${p.url}" alt=""><span class="fname">${esc(p.file.name)}</span></div></th>
    `,
        )
        .join('');

    bodyRows.innerHTML = '';
    FIELD_DEFS.forEach((def) => {
      const values = photos.map((p) => def.get(p.exif, p.w, p.h));
      if (values.every((v) => !v)) return; // どの写真にも値が無い項目は行ごと省略
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td class="field-col">${def.label}</td>` +
        values.map((v) => (v ? `<td>${v}</td>` : '<td class="empty-cell">-</td>')).join('');
      bodyRows.appendChild(tr);
    });

    if (photos.some((p) => !p.hasExif)) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="field-col">備考</td>' +
        photos
          .map((p) => (p.hasExif ? '<td>-</td>' : '<td class="empty-cell">Exif情報なし</td>'))
          .join('');
      bodyRows.appendChild(tr);
    }
  }

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    if (!window.exifr) {
      statusText.textContent = 'ライブラリを読み込めませんでした。通信環境をご確認ください。';
      log.error('Exif読み取りライブラリ(exifr)を読み込めませんでした(通信が必要です)');
      return;
    }
    ToolKit.vibrate();
    statusText.textContent = '解析中…';
    tableWrap.hidden = true;
    const t0 = performance.now();
    try {
      lastUrls.forEach((u) => URL.revokeObjectURL(u));
      const photos = await Promise.all(files.map(readOne));
      lastUrls = photos.map((p) => p.url);
      buildTable(photos);
      tableWrap.hidden = false;
      statusText.textContent = '';
      const withExif = photos.filter((p) => p.hasExif).length,
        withGps = photos.filter((p) => p.exif.latitude != null).length;
      log(
        `写真の情報を表示しました(${photos.length}枚 / Exifあり ${withExif}枚 / 位置情報あり ${withGps}枚 / ${Math.round(performance.now() - t0)}ms)`,
      );
    } catch (e) {
      statusText.textContent = '写真を読み込めませんでした。';
      log.error('写真の解析でエラーが発生しました', e);
    }
    fileInput.value = '';
  });
  tableWrap.addEventListener('click', (e) => {
    if (e.target.closest('a')) log('GPS位置のリンクを押下しました(地図を開きます)');
  });
})();
