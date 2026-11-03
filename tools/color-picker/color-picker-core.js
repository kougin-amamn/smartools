/* カラーピッカーの色の計算(画面・カメラに依存しない。Node でテストできる)。window.ColorPickerCore
   色の変換と近い色の検索は chroma.js に任せる(create(chroma) で渡す)。近さは見た目に近い Lab 色空間の距離で測る */
(function (root) {
  'use strict';
  /* HEX の入力を #RRGGBB にそろえる。形式が違う時は null */
  function normalizeHex(v) {
    v = String(v || '').trim();
    if (v.charAt(0) !== '#') v = '#' + v;
    if (/^#[0-9a-f]{3}$/i.test(v))
      v =
        '#' +
        v
          .slice(1)
          .split('')
          .map(function (c) {
            return c + c;
          })
          .join('');
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null;
  }
  /* カメラ画像の範囲(RGBA の並び)の平均色 */
  function average(data) {
    var r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (var i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : { r: 0, g: 0, b: 0 };
  }
  /* 色名で探す(英名は大文字小文字を区別しない) */
  function search(dict, q) {
    q = String(q || '').trim();
    if (!q) return [];
    var lq = q.toLowerCase();
    return dict.filter(function (c) {
      return c.name_en.toLowerCase().indexOf(lq) >= 0 || c.name_ja.indexOf(q) >= 0;
    });
  }
  function create(chroma) {
    return {
      hexToRgb: function (hex) {
        var a = chroma(hex).rgb();
        return { r: a[0], g: a[1], b: a[2] };
      },
      rgbToHex: function (c) {
        return chroma(c.r, c.g, c.b).hex().toUpperCase();
      },
      rgbToHsl: function (c) {
        var a = chroma(c.r, c.g, c.b).hsl();
        return { h: Math.round(a[0] || 0), s: Math.round(a[1] * 100), l: Math.round(a[2] * 100) };
      } /* 無彩色は h が NaN になるため 0 で補う */,
      nearest: function (dict, c) {
        var best = null,
          bd = Infinity,
          t = chroma(c.r, c.g, c.b);
        for (var i = 0; i < dict.length; i++) {
          var d = chroma.distance(t, dict[i].hex, 'lab');
          if (d < bd) {
            bd = d;
            best = dict[i];
          }
        }
        return best;
      },
    };
  }
  var api = { normalizeHex: normalizeHex, average: average, search: search, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ColorPickerCore = api;
})(this);
