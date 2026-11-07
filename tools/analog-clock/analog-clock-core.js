/* アナログ時計の画面に依存しない処理(文字盤の文字・針の角度・設定の検証・テンプレート)。Node でテストできる */
(function (root) {
  'use strict';

  /* 文字の種類。labels[i] は「i+1 時の位置」の文字(i=11 が 12 時の位置=真上)。
     干支は 12 時の位置が子(ね)、3 時の位置が卯、6 時の位置が午、9 時の位置が酉 */
  var CHARS = [
    {
      id: 'roman',
      name: 'ローマ数字',
      labels: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
    },
    {
      id: 'kyu',
      name: '旧漢数字',
      labels: ['壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾', '拾壱', '拾弐'],
    },
    {
      id: 'eto',
      name: '干支',
      labels: ['丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子'],
    },
    {
      id: 'arabic',
      name: '数字',
      labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
  ];
  var ORIENTS = [
    { id: 'upright', name: '正' },
    { id: 'radial', name: '時計むき' },
  ];
  var FONTS = [
    {
      id: 'gothic',
      name: 'ゴシック',
      stack:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Yu Gothic",sans-serif',
    },
    {
      id: 'serif',
      name: '明朝',
      stack: '"Hiragino Mincho ProN","Yu Mincho",Georgia,"Times New Roman",serif',
    },
    {
      id: 'mono',
      name: '等幅',
      stack: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace',
    },
    {
      id: 'round',
      name: '丸ゴシック',
      stack: '"Hiragino Maru Gothic ProN","Yu Gothic","M PLUS Rounded 1c",ui-rounded,sans-serif',
    },
    { id: 'hand', name: '手書き風', stack: '"Segoe Print","Bradley Hand","Zapfino",cursive' },
  ];
  var EFFECTS = [
    { id: 'none', name: 'なし' },
    { id: 'shadow', name: '影' },
    { id: 'glow', name: '光る' },
    { id: 'outline', name: '縁取り(中抜き)' },
    { id: 'emboss', name: '立体' },
  ];
  var FRAMES = [
    { id: 'none', name: 'なし' },
    { id: 'single', name: '単線' },
    { id: 'double', name: '二重線' },
    { id: 'bezel', name: 'ベゼル(金属調)' },
    { id: 'neon', name: 'ネオン' },
    { id: 'dots', name: '点線' },
  ];
  var TEXT_COLORS = [
    ['白', '#ffffff'],
    ['黒', '#111111'],
    ['ミント', '#7fe0d2'],
    ['金', '#e8c15a'],
    ['赤', '#c0392b'],
    ['水色', '#5ac8fa'],
    ['桃', '#ff8fb1'],
    ['緑', '#39ff88'],
  ];

  var SIZE_MIN = 50,
    SIZE_MAX = 150,
    FW_MIN = 1,
    FW_MAX = 10;
  var DEFAULTS = {
    chars: 'arabic',
    orient: 'upright',
    size: 100,
    font: 'gothic',
    color: '#ffffff',
    effect: 'none',
    frame: 'single',
    fwidth: 3,
  };

  /* おすすめテンプレート(設定をまとめて切り替える) */
  var TEMPLATES = [
    {
      id: 'classic',
      name: '定番ローマ数字',
      desc: '明朝のローマ数字。落ち着いた壁掛け時計風',
      s: {
        chars: 'roman',
        orient: 'upright',
        size: 100,
        font: 'serif',
        color: '#111111',
        effect: 'none',
        frame: 'double',
        fwidth: 5,
      },
    },
    {
      id: 'wafu',
      name: '和風 旧漢数字',
      desc: '壱弐参…を明朝で。生成り色の文字盤',
      s: {
        chars: 'kyu',
        orient: 'upright',
        size: 95,
        font: 'serif',
        color: '#111111',
        effect: 'none',
        frame: 'single',
        fwidth: 3,
      },
    },
    {
      id: 'eto',
      name: '干支の和時計',
      desc: '子丑寅…を時計むきに並べる',
      s: {
        chars: 'eto',
        orient: 'radial',
        size: 115,
        font: 'serif',
        color: '#c0392b',
        effect: 'none',
        frame: 'double',
        fwidth: 4,
      },
    },
    {
      id: 'neon',
      name: 'ネオンナイト',
      desc: '暗い部屋でも見やすい、光る数字',
      s: {
        chars: 'arabic',
        orient: 'upright',
        size: 100,
        font: 'mono',
        color: '#7fe0d2',
        effect: 'glow',
        frame: 'neon',
        fwidth: 3,
      },
    },
    {
      id: 'modern',
      name: 'シンプルモダン',
      desc: '白いゴシック数字と細い枠',
      s: {
        chars: 'arabic',
        orient: 'upright',
        size: 90,
        font: 'gothic',
        color: '#ffffff',
        effect: 'none',
        frame: 'single',
        fwidth: 2,
      },
    },
    {
      id: 'gold',
      name: '金のベゼル',
      desc: 'ローマ数字+金の立体文字+金属調の枠',
      s: {
        chars: 'roman',
        orient: 'radial',
        size: 100,
        font: 'serif',
        color: '#e8c15a',
        effect: 'emboss',
        frame: 'bezel',
        fwidth: 7,
      },
    },
    {
      id: 'pop',
      name: 'かわいい',
      desc: '丸文字の桃色。点線の枠',
      s: {
        chars: 'arabic',
        orient: 'upright',
        size: 120,
        font: 'round',
        color: '#ff8fb1',
        effect: 'outline',
        frame: 'dots',
        fwidth: 5,
      },
    },
    {
      id: 'easy',
      name: '見やすさ重視',
      desc: '大きな太めの数字。遠くからでも読める',
      s: {
        chars: 'arabic',
        orient: 'upright',
        size: 145,
        font: 'gothic',
        color: '#e8c15a',
        effect: 'shadow',
        frame: 'single',
        fwidth: 2,
      },
    },
  ];

  function hasId(list, id) {
    return list.some(function (x) {
      return x.id === id;
    });
  }
  function clamp(v, lo, hi, d) {
    var n = Number(v);
    return isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
  }
  function validColor(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  /* 保存データを安全な設定に直す */
  function sanitize(o) {
    var r = {},
      k;
    o = o && typeof o === 'object' ? o : {};
    for (k in DEFAULTS) r[k] = DEFAULTS[k];
    if (hasId(CHARS, o.chars)) r.chars = o.chars;
    if (hasId(ORIENTS, o.orient)) r.orient = o.orient;
    if (hasId(FONTS, o.font)) r.font = o.font;
    if (hasId(EFFECTS, o.effect)) r.effect = o.effect;
    if (hasId(FRAMES, o.frame)) r.frame = o.frame;
    if (validColor(o.color)) r.color = o.color.toLowerCase();
    r.size = clamp(o.size, SIZE_MIN, SIZE_MAX, DEFAULTS.size);
    r.fwidth = clamp(o.fwidth, FW_MIN, FW_MAX, DEFAULTS.fwidth);
    return r;
  }

  /* いまの設定がどのテンプレートと同じか(なければ ''。選択中の表示に使う) */
  function matchTemplate(s) {
    var hit = '';
    TEMPLATES.forEach(function (t) {
      if (
        Object.keys(t.s).every(function (k) {
          return t.s[k] === s[k];
        })
      )
        hit = t.id;
    });
    return hit;
  }

  function lum(hex) {
    var v = [1, 3, 5].map(function (i) {
      var c = parseInt(hex.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  /* 文字色が明るければ暗い文字盤、暗ければ生成り色の文字盤にして、必ず読めるようにする */
  function faceFor(color) {
    return lum(color) > 0.3 ? '#111318' : '#f4ecd8';
  }

  /* 針の角度(度。真上が 0、時計回り)。秒に合わせて分針・時針もなめらかに進む */
  function handAngles(d) {
    var s = d.getSeconds(),
      m = d.getMinutes() + s / 60,
      h = (d.getHours() % 12) + m / 60;
    return { hour: h * 30, minute: m * 6, second: s * 6 };
  }
  function msToNextSecond(now) {
    return 1000 - (now % 1000) + 5;
  }

  /* 2 文字以上の文字(XII・拾弐など)が収まるよう、文字サイズにかける倍率 */
  function labelScale(text) {
    return [1, 1, 0.82, 0.7, 0.6][Math.min(text.length, 4)];
  }

  var api = {
    CHARS: CHARS,
    ORIENTS: ORIENTS,
    FONTS: FONTS,
    EFFECTS: EFFECTS,
    FRAMES: FRAMES,
    TEXT_COLORS: TEXT_COLORS,
    TEMPLATES: TEMPLATES,
    DEFAULTS: DEFAULTS,
    SIZE_MIN: SIZE_MIN,
    SIZE_MAX: SIZE_MAX,
    FW_MIN: FW_MIN,
    FW_MAX: FW_MAX,
    sanitize: sanitize,
    matchTemplate: matchTemplate,
    faceFor: faceFor,
    handAngles: handAngles,
    msToNextSecond: msToNextSecond,
    labelScale: labelScale,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AClockCore = api;
})(this);
