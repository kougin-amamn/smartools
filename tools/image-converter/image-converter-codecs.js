/* 標準で書き出せない形式(BMP・ICO・GIF)の符号化。入力は RGBA の Uint8ClampedArray で、DOM非依存。
   PNG・JPEG・WebP は Canvas の toBlob で作るので、ここには無い */
(function (root) {
  // BMP (24bit, 無圧縮)
  function encodeBMP(width, height, rgba) {
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const padding = rowSize - width * 3;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize;
    const buf = new Uint8Array(fileSize);
    const dv = new DataView(buf.buffer);
    buf[0] = 0x42;
    buf[1] = 0x4d; // 'BM'
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, 54, true); // ピクセルデータのオフセット
    dv.setUint32(14, 40, true); // BITMAPINFOHEADERサイズ
    dv.setInt32(18, width, true);
    dv.setInt32(22, height, true);
    dv.setUint16(26, 1, true); // planes
    dv.setUint16(28, 24, true); // bpp
    dv.setUint32(30, 0, true); // 無圧縮(BI_RGB)
    dv.setUint32(34, pixelArraySize, true);
    dv.setInt32(38, 2835, true); // 72dpi相当
    dv.setInt32(42, 2835, true);
    let offset = 54;
    for (let y = height - 1; y >= 0; y--) {
      // BMPは下から上に並ぶ
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        buf[offset++] = rgba[i + 2]; // B
        buf[offset++] = rgba[i + 1]; // G
        buf[offset++] = rgba[i]; // R
      }
      for (let p = 0; p < padding; p++) buf[offset++] = 0; // 4byte境界に padding
    }
    return buf;
  }

  // ICO(PNGをそのまま包む。Vista以降/現行ブラウザはPNG格納に対応)
  function encodeICOFromPNG(pngBytes, width, height) {
    const out = new Uint8Array(6 + 16 + pngBytes.length);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, 0, true); // reserved
    dv.setUint16(2, 1, true); // type=1(icon)
    dv.setUint16(4, 1, true); // image count=1
    out[6] = width >= 256 ? 0 : width; // 0は256pxを意味する
    out[7] = height >= 256 ? 0 : height;
    out[8] = 0;
    out[9] = 0; // パレット・予約
    dv.setUint16(10, 1, true); // color planes
    dv.setUint16(12, 32, true); // bits per pixel
    dv.setUint32(14, pngBytes.length, true);
    dv.setUint32(18, 22, true); // 画像データの開始オフセット(6+16)
    out.set(pngBytes, 22);
    return out;
  }

  // GIF (単一フレーム、パレット量子化 + LZW圧縮)
  function quantizeImage(rgba, width, height, maxColors) {
    maxColors = maxColors || 256;
    const n = width * height;
    const hist = new Map();
    for (let i = 0; i < n; i++) {
      const r = rgba[i * 4],
        g = rgba[i * 4 + 1],
        b = rgba[i * 4 + 2];
      const key = (r << 16) | (g << 8) | b;
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    let palette;
    if (hist.size <= maxColors) {
      palette = [...hist.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
    } else {
      // 簡易量子化:各チャンネル上位4bitでバケツに丸め、頻度上位maxColors色を採用
      const buckets = new Map();
      for (const [key, count] of hist) {
        const r = (key >> 16) & 255,
          g = (key >> 8) & 255,
          b = key & 255;
        const qk = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const prev = buckets.get(qk);
        if (prev) {
          prev.count += count;
          prev.rSum += r * count;
          prev.gSum += g * count;
          prev.bSum += b * count;
        } else buckets.set(qk, { count, rSum: r * count, gSum: g * count, bSum: b * count });
      }
      palette = [...buckets.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, maxColors)
        .map((b) => [
          Math.round(b.rSum / b.count),
          Math.round(b.gSum / b.count),
          Math.round(b.bSum / b.count),
        ]);
    }
    while (palette.length < 2) palette.push([0, 0, 0]);

    // 色数は2のべき乗に切り上げる必要がある(GIFのグローバルカラーテーブル仕様)
    let tableSize = 2;
    while (tableSize < palette.length) tableSize *= 2;
    while (palette.length < tableSize) palette.push([0, 0, 0]);

    const indices = new Uint8Array(n);
    // 量子化バケツ単位でキャッシュして、同じ色の再探索を避ける(速度対策)
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      const r = rgba[i * 4],
        g = rgba[i * 4 + 1],
        b = rgba[i * 4 + 2];
      const key = (r << 16) | (g << 8) | b;
      let idx = cache.get(key);
      if (idx === undefined) {
        let best = 0,
          bestD = Infinity;
        for (let p = 0; p < palette.length; p++) {
          const [pr, pg, pb] = palette[p];
          const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        idx = best;
        cache.set(key, idx);
      }
      indices[i] = idx;
    }
    return { palette, indices };
  }

  function gifLZWEncode(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    const bytes = [];
    let bitBuffer = 0,
      bitCount = 0;
    function emit(code, size) {
      bitBuffer |= code << bitCount;
      bitCount += size;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    }
    let dict, codeSize, nextCode;
    function resetDict() {
      dict = new Map();
      for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    }
    resetDict();
    emit(clearCode, codeSize);
    let w = String(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const wk = w + ',' + k;
      if (dict.has(wk)) {
        w = wk;
        continue;
      }
      emit(dict.get(w), codeSize);
      if (nextCode < 4096) {
        dict.set(wk, nextCode);
        nextCode++;
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clearCode, codeSize);
        resetDict();
      }
      w = String(k);
    }
    emit(dict.get(w), codeSize);
    emit(endCode, codeSize);
    if (bitCount > 0) bytes.push(bitBuffer & 0xff);
    return bytes;
  }

  function minCodeSizeFor(paletteLength) {
    return Math.max(2, Math.ceil(Math.log2(Math.max(2, paletteLength))));
  }

  function encodeGIF(width, height, rgba, maxColors) {
    const { palette, indices } = quantizeImage(rgba, width, height, maxColors || 256);
    const minCodeSize = minCodeSizeFor(palette.length);
    const lzwBytes = gifLZWEncode(Array.from(indices), minCodeSize);

    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // 'GIF89a'
    const gct = [];
    for (const [r, g, b] of palette) gct.push(r, g, b);
    const gctSizeBits = Math.ceil(Math.log2(palette.length)) - 1; // 0=2色,1=4色...7=256色

    const lsd = new Uint8Array(7);
    const dvLsd = new DataView(lsd.buffer);
    dvLsd.setUint16(0, width, true);
    dvLsd.setUint16(2, height, true);
    lsd[4] = 0x80 | (gctSizeBits & 0x07); // GCTあり + サイズ
    lsd[5] = 0; // 背景色インデックス
    lsd[6] = 0; // pixel aspect ratio

    const imgDesc = new Uint8Array(10);
    const dvImg = new DataView(imgDesc.buffer);
    imgDesc[0] = 0x2c; // Image Separator
    dvImg.setUint16(1, 0, true); // left
    dvImg.setUint16(3, 0, true); // top
    dvImg.setUint16(5, width, true);
    dvImg.setUint16(7, height, true);
    imgDesc[9] = 0; // ローカルカラーテーブルなし

    // LZWデータは255byteごとのサブブロックに分割する必要がある
    const blocks = [];
    for (let i = 0; i < lzwBytes.length; i += 255) {
      const chunk = lzwBytes.slice(i, i + 255);
      blocks.push(chunk.length, ...chunk);
    }
    blocks.push(0); // ブロック終端

    const out = [
      ...header,
      ...lsd,
      ...gct,
      ...imgDesc,
      minCodeSize,
      ...blocks,
      0x3b, // トレーラー
    ];
    return new Uint8Array(out);
  }

  root.ImageCodecs = { encodeBMP, encodeICOFromPNG, encodeGIF, quantizeImage, gifLZWEncode, minCodeSizeFor };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = typeof window !== 'undefined' ? window.ImageCodecs : global.ImageCodecs;
}
