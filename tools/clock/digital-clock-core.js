/* デジタル時計の画面に依存しない処理(時刻の整形・設定の検証)。Node でテストできる */
(function (root) {
  'use strict';

  /* 表示形式。id は保存・判定に使い、name は画面に出す */
  var FORMATS = [
    { id: 'h24s', name: '24時間 (13:05:09)' },
    { id: 'h24', name: '24時間・秒なし (13:05)' },
    { id: 'h12s', name: '12時間 (午後 1:05:09)' },
    { id: 'h12', name: '12時間・秒なし (午後 1:05)' },
    { id: 'jp', name: '日本語 (13時05分09秒)' },
    { id: 'date', name: '日付つき (2026年10月25日(日))' },
  ];
  /* 文字フォント。stack は CSS の font-family。seg は専用の7セグメント描画 */
  var FONTS = [
    { id: 'seg', name: '7セグメント', stack: 'ui-monospace,Menlo,Consolas,monospace' },
    {
      id: 'gothic',
      name: 'ゴシック',
      stack:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Yu Gothic",sans-serif',
    },
    {
      id: 'mono',
      name: '等幅',
      stack: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace',
    },
    {
      id: 'serif',
      name: '明朝',
      stack: '"Hiragino Mincho ProN","Yu Mincho",Georgia,"Times New Roman",serif',
    },
    {
      id: 'round',
      name: '丸ゴシック',
      stack: '"Hiragino Maru Gothic ProN","Yu Gothic","M PLUS Rounded 1c",ui-rounded,sans-serif',
    },
    { id: 'hand', name: '手書き風', stack: '"Segoe Print","Bradley Hand","Zapfino",cursive' },
  ];
  /* フレーム(時計の枠) */
  var FRAMES = [
    { id: 'none', name: 'なし' },
    { id: 'thin', name: '細い線' },
    { id: 'thick', name: '太い線' },
    { id: 'double', name: '二重線' },
    { id: 'round', name: '角丸' },
    { id: 'neon', name: 'ネオン' },
    { id: 'bezel', name: 'ベゼル' },
  ];
  var TEXT_COLORS = [
    ['白', '#ffffff'],
    ['黒', '#111111'],
    ['ミント', '#7fe0d2'],
    ['黄', '#ffd166'],
    ['赤', '#ff6b6b'],
    ['水色', '#5ac8fa'],
    ['紫', '#b388ff'],
    ['緑', '#39ff88'],
  ];
  var BG_COLORS = [
    ['黒', '#000000'],
    ['白', '#ffffff'],
    ['墨', '#15161c'],
    ['紺', '#1b1f4b'],
    ['濃紫', '#2b1b3a'],
    ['深緑', '#0b3d2e'],
    ['生成り', '#f5e6c8'],
    ['藍紫', '#4a4e7a'],
  ];

  var DEFAULTS = {
    format: 'h24s',
    color: '#7fe0d2',
    font: 'seg',
    size: 80,
    bg: '#000000',
    frame: 'thin',
  };
  var SIZE_MIN = 20,
    SIZE_MAX = 100;
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  function p2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* 時刻を整形する。戻り値: { date: 日付行(なければ ''), ampm: 午前/午後(なければ ''), time: 時刻の文字列 } */
  function formatClock(d, format) {
    var h = d.getHours(),
      m = d.getMinutes(),
      s = d.getSeconds();
    var out = { date: '', ampm: '', time: '' };
    var h12 = h % 12 === 0 ? 12 : h % 12;
    switch (format) {
      case 'h24':
        out.time = p2(h) + ':' + p2(m);
        break;
      case 'h12s':
        out.ampm = h < 12 ? '午前' : '午後';
        out.time = h12 + ':' + p2(m) + ':' + p2(s);
        break;
      case 'h12':
        out.ampm = h < 12 ? '午前' : '午後';
        out.time = h12 + ':' + p2(m);
        break;
      case 'jp':
        out.time = p2(h) + '時' + p2(m) + '分' + p2(s) + '秒';
        break;
      case 'date':
        out.date =
          d.getFullYear() +
          '年' +
          (d.getMonth() + 1) +
          '月' +
          d.getDate() +
          '日(' +
          WEEK[d.getDay()] +
          ')';
        out.time = p2(h) + ':' + p2(m) + ':' + p2(s);
        break;
      default:
        out.time = p2(h) + ':' + p2(m) + ':' + p2(s);
    }
    return out;
  }

  /* 次の「秒が変わる瞬間」までのミリ秒(表示のずれを小さくするため、秒の頭に合わせて更新する) */
  function msToNextSecond(now) {
    return 1000 - (now % 1000) + 5;
  }

  function hasId(list, id) {
    return list.some(function (x) {
      return x.id === id;
    });
  }
  function validColor(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  /* 保存データ(壊れている・古い可能性がある)を安全な設定に直す */
  function sanitize(o) {
    var r = {},
      k;
    o = o && typeof o === 'object' ? o : {};
    for (k in DEFAULTS) r[k] = DEFAULTS[k];
    if (hasId(FORMATS, o.format)) r.format = o.format;
    if (hasId(FONTS, o.font)) r.font = o.font;
    if (hasId(FRAMES, o.frame)) r.frame = o.frame;
    if (validColor(o.color)) r.color = o.color.toLowerCase();
    if (validColor(o.bg)) r.bg = o.bg.toLowerCase();
    var n = Number(o.size);
    if (isFinite(n)) r.size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(n)));
    return r;
  }

  /* 文字色と背景色の明るさの差(見えにくい組み合わせの警告に使う。0〜1) */
  function lum(hex) {
    var v = [1, 3, 5].map(function (i) {
      var c = parseInt(hex.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    var x = lum(a),
      y = lum(b),
      hi = Math.max(x, y),
      lo = Math.min(x, y);
    return (hi + 0.05) / (lo + 0.05);
  }

  var api = {
    FORMATS: FORMATS,
    FONTS: FONTS,
    FRAMES: FRAMES,
    TEXT_COLORS: TEXT_COLORS,
    BG_COLORS: BG_COLORS,
    DEFAULTS: DEFAULTS,
    SIZE_MIN: SIZE_MIN,
    SIZE_MAX: SIZE_MAX,
    formatClock: formatClock,
    msToNextSecond: msToNextSecond,
    sanitize: sanitize,
    contrast: contrast,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ClockCore = api;
})(this);
