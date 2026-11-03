/* ペイントの計算部分(塗りつぶし・元に戻す履歴・読み込み画像の縮小)。画面には触れない */
(function () {
  'use strict';

  /* 塗りつぶし
     data は RGBA の並び(ImageData.data)。始点と似た色(各色の差が tol 以内)を fill で塗り、塗った画素数を返す。
     線のふちはぼかしで少し色が違うため、tol を持たせて塗り残しの縁を減らす */
  function floodFill(data, w, h, sx, sy, fill, tol) {
    sx = Math.floor(sx);
    sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
    var p0 = (sy * w + sx) * 4,
      tr = data[p0],
      tg = data[p0 + 1],
      tb = data[p0 + 2],
      ta = data[p0 + 3];
    function near(p) {
      return (
        Math.abs(data[p] - tr) <= tol &&
        Math.abs(data[p + 1] - tg) <= tol &&
        Math.abs(data[p + 2] - tb) <= tol &&
        Math.abs(data[p + 3] - ta) <= tol
      );
    }
    var seen = new Uint8Array(w * h),
      stack = [sx, sy],
      count = 0;
    while (stack.length) {
      var y = stack.pop(),
        x = stack.pop();
      if (seen[y * w + x] || !near((y * w + x) * 4)) continue;
      var l = x,
        r = x;
      while (l > 0 && !seen[y * w + l - 1] && near((y * w + l - 1) * 4)) l--;
      while (r < w - 1 && !seen[y * w + r + 1] && near((y * w + r + 1) * 4)) r++;
      for (var i = l; i <= r; i++) {
        var p = (y * w + i) * 4;
        seen[y * w + i] = 1;
        data[p] = fill[0];
        data[p + 1] = fill[1];
        data[p + 2] = fill[2];
        data[p + 3] = 255;
        count++;
      }
      for (var yy = y - 1; yy <= y + 1; yy += 2) {
        if (yy < 0 || yy >= h) continue;
        var up = false;
        for (var j = l; j <= r; j++) {
          var ok = !seen[yy * w + j] && near((yy * w + j) * 4);
          if (ok && !up) stack.push(j, yy);
          up = ok;
        }
      }
    }
    return count;
  }

  /* 元に戻す履歴
     画像の控えは大きいので、件数ではなく合計のバイト数で古いものから捨てる(最低でも minKeep 件は残す) */
  function History(maxBytes, minKeep) {
    this.maxBytes = maxBytes;
    this.minKeep = minKeep || 3;
    this.items = [];
    this.index = -1;
  }
  History.prototype.reset = function (item, bytes) {
    this.items = [{ v: item, b: bytes }];
    this.index = 0;
  };
  History.prototype.push = function (item, bytes) {
    this.items.length = this.index + 1;
    this.items.push({ v: item, b: bytes });
    this.index = this.items.length - 1;
    var total = 0;
    this.items.forEach(function (e) {
      total += e.b;
    });
    while (this.items.length > this.minKeep + 1 && total > this.maxBytes) {
      total -= this.items.shift().b;
      this.index--;
    }
  };
  History.prototype.canUndo = function () {
    return this.index > 0;
  };
  History.prototype.canRedo = function () {
    return this.index < this.items.length - 1;
  };
  History.prototype.undo = function () {
    return this.canUndo() ? this.items[--this.index].v : null;
  };
  History.prototype.redo = function () {
    return this.canRedo() ? this.items[++this.index].v : null;
  };
  History.prototype.current = function () {
    return this.index >= 0 ? this.items[this.index].v : null;
  };

  /* 読み込む画像の大きさ: 長い辺が max を超える時だけ縮める */
  function fitSize(w, h, max) {
    var s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  /* '#rrggbb' → [r, g, b] */
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return [0, 0, 0];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  var api = { floodFill: floodFill, History: History, fitSize: fitSize, hexToRgb: hexToRgb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PaintCore = api;
})();
