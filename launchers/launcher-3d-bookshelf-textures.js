/* 本棚ランチャーの絵(テクスチャ)を Canvas で描く。見本は launcher-3d-bookshelf-textures.json の「種類 + 値」。
   BookshelfTextures.create(THREE, core, {maxAniso, nameOf, markOf, defs}) */
var FONT = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif',
  SANS = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
var CAT_HEX = [
  '#1e2c4a',
  '#4a1c22',
  '#1e3a2e',
  '#4a3620',
  '#33284a',
  '#1e3a40',
  '#5a4a1e',
  '#3a3a3e',
]; /* ジャンル(カテゴリ)ごとの本の色 */

/* 種類と、調整できる値(見本帳のスライダーもこの表から作る) */
var KINDS = {
  wood: '木目',
  plaster: '漆喰',
  cloth: '布',
  leather: '革',
  paper: '紙',
  metal: '金属',
  glass: 'ガラス',
  water: '水',
  grass: '草',
  rug: 'ラグ',
};
var COMMON = [
  { k: 'color', type: 'color', label: '地の色' },
  { k: 'contrast', min: 0, max: 1, step: 0.01, label: '濃淡', help: '明るい所と暗い所の差' },
  {
    k: 'grain',
    min: 0,
    max: 1,
    step: 0.01,
    label: '模様の細かさ',
    help: '木目の本数・布目や草の密度など',
  },
  {
    k: 'scale',
    min: 0.1,
    max: 5,
    step: 0.1,
    label: '大きさ(m)',
    help: '模様1回分が何mか(3Dで貼る時のくり返し)',
  },
  {
    k: 'gloss',
    min: 0,
    max: 1,
    step: 0.01,
    label: 'ツヤ',
    help: '光の照り返し(3Dの材質で効く。金属・ガラスは絵の光の帯にも効く)',
  },
  { k: 'bump', min: 0, max: 1, step: 0.01, label: '凹凸', help: '表面のざらつき(3Dで効く)' },
  {
    k: 'seed',
    min: 1,
    max: 999,
    step: 1,
    label: '柄の番号',
    help: '同じ設定で別の柄にしたい時に変える',
  },
];
var EXTRA = {
  wood: [{ k: 'planks', min: 1, max: 12, step: 1, label: '板の枚数' }],
  metal: [
    {
      k: 'finish',
      type: 'select',
      label: '仕上げ',
      options: [
        ['brushed', 'ヘアライン(細い筋)'],
        ['polished', '鏡面(磨き)'],
        ['hammered', '槌目(叩いた凹み)'],
      ],
    },
  ],
  glass: [
    {
      k: 'opacity',
      min: 0,
      max: 1,
      step: 0.01,
      label: '不透明度',
      help: '0で透明、1で向こうが見えない',
    },
  ],
  grass: [{ k: 'length', min: 0, max: 1, step: 0.01, label: '草の長さ' }],
  rug: [
    { k: 'accent', type: 'color', label: '柄の色' },
    { k: 'border', type: 'color', label: '縁の色' },
  ],
};
function paramsOf(kind) {
  return COMMON.concat(EXTRA[kind] || []);
}
var DEFAULTS = {
  contrast: 0.5,
  grain: 0.5,
  scale: 1,
  gloss: 0.2,
  bump: 0.4,
  seed: 1,
  planks: 2,
  finish: 'brushed',
  opacity: 0.2,
  length: 0.4,
  accent: '#a8573e',
  border: '#e8dcc4',
};
function val(d, k) {
  return d[k] === undefined ? DEFAULTS[k] : d[k];
}

/* 描画の部品 */
function rng(seed) {
  seed = seed >>> 0 || 1;
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function canvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h || w;
  return c;
}
function rgbOf(hex) {
  var n = parseInt(String(hex || '#808080').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function css(rgb, k, a) {
  k = k === undefined ? 1 : k;
  return (
    'rgba(' +
    Math.round(Math.min(255, rgb[0] * k)) +
    ',' +
    Math.round(Math.min(255, rgb[1] * k)) +
    ',' +
    Math.round(Math.min(255, rgb[2] * k)) +
    ',' +
    (a === undefined ? 1 : a) +
    ')'
  );
}
/* くり返して貼っても継ぎ目が出ないよう、はみ出す絵は反対側にも描く */
function wrap(S, x, y, r, fn) {
  for (var dx = -1; dx <= 1; dx++)
    for (var dy = -1; dy <= 1; dy++) {
      var px = x + dx * S,
        py = y + dy * S;
      if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue;
      fn(px, py);
    }
}

/* 木目: 縦に並ぶ板を、板ごとの明暗・サイン波でゆらした木目の線・継ぎ目で描く */
function paintWood(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    planks = Math.max(1, Math.round(val(d, 'planks')));
  var streaks = Math.round(20 + val(d, 'grain') * 80),
    ct = val(d, 'contrast') / 0.5,
    pw = S / planks,
    p,
    i,
    y;
  for (p = 0; p < planks; p++) {
    var k = 0.97 + (R() * 0.26 - 0.13) * ct;
    g.fillStyle = css(base, k);
    g.fillRect(p * pw, 0, pw, S);
    for (i = 0; i < streaks; i++) {
      var x = p * pw + R() * pw,
        a = (0.04 + R() * 0.1) * ct,
        dark = R() < 0.7,
        ph = R() * 6,
        amp = 0.6 + R() * 2.2;
      g.strokeStyle = dark ? 'rgba(40,22,10,' + a + ')' : 'rgba(255,225,185,' + a * 0.7 + ')';
      g.lineWidth = ((0.6 + R() * 1.4) * S) / 1024;
      g.beginPath();
      g.moveTo(x, 0);
      for (y = 0; y <= S; y += S / 64)
        g.lineTo(x + (Math.sin((y / S) * Math.PI * 4 + ph) * amp * S) / 1024, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(25,12,5,' + Math.min(0.7, 0.5 * ct) + ')';
    g.fillRect(p * pw, 0, Math.max(1, (1.5 * S) / 1024), S);
  }
  return c;
}
/* 漆喰: 地の色に細かい点のむら */
function paintPlaster(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    a = 0.07 * val(d, 'contrast'),
    sz = ((1 + val(d, 'grain') * 2) * S) / 512;
  g.fillStyle = d.color || '#f1ebe0';
  g.fillRect(0, 0, S, S);
  for (var i = 0; i < (S * S) / 40; i++) {
    g.fillStyle = 'rgba(0,0,0,' + R() * a + ')';
    g.fillRect(R() * S, R() * S, sz, sz);
  }
  return c;
}
/* 布: 縦横の糸(平織り)と細かいむら */
function paintCloth(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    ct = val(d, 'contrast');
  var n = Math.round(S / (9 - val(d, 'grain') * 6)),
    step = S / n,
    i; /* 糸の本数(細かいほど多い) */
  g.fillStyle = css(base);
  g.fillRect(0, 0, S, S);
  for (i = 0; i < n; i++) {
    /* 横糸と縦糸: 1本ずつ明暗を少しだけ変える(強すぎるとチェック柄に見える) */
    var a = (0.015 + R() * 0.045) * ct * 2;
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,' + a * 0.8 + ')' : 'rgba(0,0,0,' + a + ')';
    g.fillRect(0, i * step, S, step * 0.5);
    a = (0.015 + R() * 0.045) * ct * 2;
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a * 0.7 + ')';
    g.fillRect(i * step, 0, step * 0.5, S);
  }
  g.fillStyle = 'rgba(0,0,0,' + 0.06 * ct + ')'; /* 糸の交差の小さな陰 */
  for (i = 0; i < n; i += 1)
    for (var j = i % 2; j < n; j += 2) g.fillRect(i * step, j * step, step * 0.5, step * 0.5);
  for (i = 0; i < (S * S) / 60; i++) {
    g.fillStyle = 'rgba(' + (R() < 0.5 ? '255,255,255' : '0,0,0') + ',' + R() * 0.06 * ct * 2 + ')';
    g.fillRect(R() * S, R() * S, 1, 1 + R() * 2);
  }
  return c;
}
/* 革: 細かいシボ(粒)、色むら、細いしわ */
function paintLeather(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    ct = val(d, 'contrast'),
    i;
  g.fillStyle = css(base);
  g.fillRect(0, 0, S, S);
  for (i = 0; i < 40; i++) {
    var x = R() * S,
      y = R() * S,
      r = S * (0.08 + R() * 0.18),
      dk = R() < 0.5;
    wrap(S, x, y, r, function (px, py) {
      var gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(
        0,
        dk ? 'rgba(0,0,0,' + 0.18 * ct + ')' : 'rgba(255,230,200,' + 0.12 * ct + ')',
      );
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  var cells = Math.round((S * S) / (260 - val(d, 'grain') * 200));
  for (i = 0; i < cells; i++) {
    var cx = R() * S,
      cy = R() * S,
      cr = S * (0.004 + R() * 0.006);
    wrap(S, cx, cy, cr, function (px, py) {
      g.beginPath();
      g.arc(px, py, cr, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,' + (0.12 * ct + R() * 0.1 * ct) + ')';
      g.fill();
      g.beginPath();
      g.arc(px - cr * 0.3, py - cr * 0.3, cr * 0.5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,240,220,' + 0.08 * ct + ')';
      g.fill();
    });
  }
  g.strokeStyle = 'rgba(0,0,0,' + 0.25 * ct + ')';
  g.lineWidth = Math.max(1, S / 700);
  for (i = 0; i < 18; i++) {
    var sx = R() * S,
      sy = R() * S,
      len = S * (0.05 + R() * 0.12),
      an = R() * Math.PI;
    wrap(S, sx, sy, len, function (px, py) {
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(
        px + Math.cos(an) * len * 0.5 + R() * 8,
        py + Math.sin(an) * len * 0.5,
        px + Math.cos(an) * len,
        py + Math.sin(an) * len,
      );
      g.stroke();
    });
  }
  return c;
}
/* 紙: 繊維と、うっすらしたむら */
function paintPaper(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    ct = val(d, 'contrast'),
    i;
  g.fillStyle = css(base);
  g.fillRect(0, 0, S, S);
  for (i = 0; i < 14; i++) {
    var x = R() * S,
      y = R() * S,
      r = S * (0.15 + R() * 0.3);
    wrap(S, x, y, r, function (px, py) {
      var gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(120,90,40,' + 0.06 * ct + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  var fibers = Math.round((S * S) / (300 - val(d, 'grain') * 220));
  g.lineWidth = Math.max(0.6, S / 1000);
  for (i = 0; i < fibers; i++) {
    var fx = R() * S,
      fy = R() * S,
      fl = S * (0.01 + R() * 0.03),
      fa = R() * Math.PI * 2;
    g.strokeStyle =
      R() < 0.6 ? 'rgba(110,90,60,' + 0.25 * ct + ')' : 'rgba(255,255,255,' + 0.4 * ct + ')';
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
    g.stroke();
  }
  return c;
}
/* 金属: ヘアライン(横の細い筋)/鏡面(映り込みの光の帯)/槌目(叩いた凹み) */
function paintMetal(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    ct = val(d, 'contrast'),
    gl = val(d, 'gloss'),
    fin = val(d, 'finish'),
    i;
  var gr = g.createLinearGradient(0, 0, 0, S);
  if (fin === 'polished') {
    gr.addColorStop(0, css(base, 0.75));
    gr.addColorStop(0.28, css(base, 1 + 0.7 * gl));
    gr.addColorStop(0.36, css(base, 0.95));
    gr.addColorStop(0.62, css(base, 0.55 + 0.2 * (1 - ct)));
    gr.addColorStop(0.8, css(base, 1 + 0.35 * gl));
    gr.addColorStop(1, css(base, 0.75));
  } else {
    gr.addColorStop(0, css(base, 0.92));
    gr.addColorStop(0.5, css(base, 1 + 0.15 * gl));
    gr.addColorStop(1, css(base, 0.92));
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  if (fin === 'brushed') {
    var lines = Math.round(S * (0.6 + val(d, 'grain') * 1.6));
    for (i = 0; i < lines; i++) {
      var y = R() * S,
        a = (0.03 + R() * 0.1) * ct * 2;
      g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')';
      g.fillRect(0, y, S, Math.max(1, (S / 1024) * (1 + R() * 2)));
    }
  } else if (fin === 'hammered') {
    var n = Math.round(30 + val(d, 'grain') * 90);
    for (i = 0; i < n; i++) {
      var x = R() * S,
        yy = R() * S,
        r = S * (0.04 + R() * 0.05);
      wrap(S, x, yy, r, function (px, py) {
        var hg = g.createRadialGradient(px - r * 0.35, py - r * 0.35, r * 0.1, px, py, r);
        hg.addColorStop(0, 'rgba(255,255,255,' + 0.35 * gl * ct * 2 + ')');
        hg.addColorStop(0.6, 'rgba(0,0,0,0)');
        hg.addColorStop(1, 'rgba(0,0,0,' + 0.28 * ct + ')');
        g.fillStyle = hg;
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
      });
    }
  } else {
    for (i = 0; i < S / 8; i++) {
      var py2 = R() * S;
      g.fillStyle = 'rgba(255,255,255,' + 0.03 * ct + ')';
      g.fillRect(0, py2, S, 1);
    }
  }
  return c;
}
/* ガラス: 透ける地(不透明度)、くもり(細かい点)、斜めの映り込みの筋。透けるので、絵の外側は透明 */
function paintGlass(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    op = val(d, 'opacity'),
    gl = val(d, 'gloss'),
    fr = val(d, 'grain'),
    i;
  g.clearRect(0, 0, S, S);
  g.fillStyle = css(base, 1, op);
  g.fillRect(0, 0, S, S);
  for (i = 0; i < ((S * S) / 12) * fr; i++) {
    g.fillStyle = 'rgba(255,255,255,' + R() * 0.22 * fr + ')';
    g.fillRect(R() * S, R() * S, 1.5, 1.5);
  }
  var bands = [
    [0.18, 0.06, 0.5],
    [0.3, 0.02, 0.35],
    [0.66, 0.1, 0.25],
  ];
  bands.forEach(function (b) {
    [-S, 0, S].forEach(function (off) {
      g.save();
      g.beginPath();
      g.moveTo(b[0] * S + off, 0);
      g.lineTo(b[0] * S + b[1] * S + off, 0);
      g.lineTo(b[0] * S + b[1] * S + off + S, S);
      g.lineTo(b[0] * S + off + S, S);
      g.closePath();
      g.fillStyle =
        'rgba(255,255,255,' + Math.min(0.85, b[2] * gl * val(d, 'contrast') * 2 * 1.2) + ')';
      g.fill();
      g.restore();
    });
  });
  return c;
}
/* 水: 水の色と、底に映る光の網目(コースティクス)。整数倍の波を重ねるので継ぎ目なくくり返せる */
function paintWater(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    ct = val(d, 'contrast');
  var f = Math.round(2 + val(d, 'grain') * 6),
    p1 = R() * 6,
    p2 = R() * 6,
    p3 = R() * 6;
  var img = g.createImageData(S, S),
    D = img.data,
    TAU = Math.PI * 2;
  for (var y = 0; y < S; y++)
    for (var x = 0; x < S; x++) {
      var u = (x / S) * TAU,
        v = (y / S) * TAU;
      var A = f * u + 2.4 * Math.sin(f * v + p1),
        B = f * v + 2.4 * Math.sin((f + 1) * u + p2),
        C = f * (u + v) + 2.4 * Math.sin(f * (u - v) + p3); /* ゆがみ 2.4: 縦横の筋が並ばない */
      var w = (Math.sin(A) + Math.sin(B) + Math.sin(C)) / 3,
        l = Math.pow(1 - Math.abs(w), 6) * ct * 1.6,
        dp = 0.85 + 0.15 * Math.sin(B); /* 波と同じ周期にして継ぎ目を出さない */
      var o = (y * S + x) * 4;
      D[o] = Math.min(255, base[0] * dp + 255 * l * 0.8);
      D[o + 1] = Math.min(255, base[1] * dp + 255 * l * 0.9);
      D[o + 2] = Math.min(255, base[2] * dp + 255 * l);
      D[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}
/* 草: 土の上に、色と長さのばらついた葉を下から重ねる */
function paintGrass(d, S) {
  var c = canvas(S),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    base = rgbOf(d.color),
    ct = val(d, 'contrast'),
    len = val(d, 'length');
  g.fillStyle = css([base[0] * 0.45 + 30, base[1] * 0.4 + 22, base[2] * 0.3 + 12]);
  g.fillRect(0, 0, S, S);
  var n = Math.round((S * S) / (900 - val(d, 'grain') * 780)),
    blades = [],
    i;
  for (i = 0; i < n; i++)
    blades.push({
      x: R() * S,
      y: R() * S,
      l: S * (0.03 + len * 0.12) * (0.6 + R() * 0.8),
      bend: (R() - 0.5) * 0.9,
      k: 1 + (R() - 0.5) * 0.6 * ct * 2,
      w: Math.max(1, (S / 512) * (1 + R() * 1.6)),
    });
  blades.sort(function (a, b) {
    return a.y - b.y;
  });
  blades.forEach(function (b) {
    wrap(S, b.x, b.y, b.l, function (px, py) {
      g.strokeStyle = css(base, b.k);
      g.lineWidth = b.w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + b.bend * b.l * 0.3, py - b.l * 0.6, px + b.bend * b.l, py - b.l);
      g.stroke();
    });
  });
  return c;
}
/* ラグ: 地の色に縁と幾何の柄(くり返さない1枚の絵) */
function paintRug(d, S) {
  var W = S,
    H = Math.round(S * 0.766),
    c = canvas(W, H),
    g = c.getContext('2d'),
    R = rng(val(d, 'seed')),
    k = W / 1024,
    ct = val(d, 'contrast');
  g.fillStyle = d.color || '#2f3a52';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = val(d, 'border');
  g.lineWidth = 28 * k;
  g.strokeRect(40 * k, 40 * k, W - 80 * k, H - 80 * k);
  g.strokeStyle = val(d, 'accent');
  g.lineWidth = 10 * k;
  g.strokeRect(82 * k, 82 * k, W - 164 * k, H - 164 * k);
  var bc = rgbOf(val(d, 'border'));
  g.strokeStyle = css(bc, 1, 0.55);
  g.lineWidth = 4 * k;
  var sp = 70 + (1 - val(d, 'grain')) * 40;
  for (var y = 150 * k; y < H - 130 * k; y += sp * k)
    for (var x = 150 * k; x < W - 120 * k; x += sp * 1.3 * k) {
      g.beginPath();
      g.moveTo(x, y - 22 * k);
      g.lineTo(x + 22 * k, y);
      g.lineTo(x, y + 22 * k);
      g.lineTo(x - 22 * k, y);
      g.closePath();
      g.stroke();
    }
  for (var i = 0; i < (W * H) / 90; i++) {
    g.fillStyle = 'rgba(' + (R() < 0.5 ? '255,255,255' : '0,0,0') + ',' + R() * 0.14 * ct + ')';
    g.fillRect(R() * W, R() * H, 2 * k, 2 * k);
  }
  return c;
}
var PAINTERS = {
  wood: paintWood,
  plaster: paintPlaster,
  cloth: paintCloth,
  leather: paintLeather,
  paper: paintPaper,
  metal: paintMetal,
  glass: paintGlass,
  water: paintWater,
  grass: paintGrass,
  rug: paintRug,
};
/* 見本 → 絵(Canvas)。S は1辺の画素数 */
function paint(d, S) {
  var fn = PAINTERS[d.kind];
  if (!fn) throw new Error('知らない種類のテクスチャです: ' + d.kind);
  return fn(d, S || 512);
}

/* JSON が読めない時の見た目(本番の見本は launcher-3d-bookshelf-textures.json) */
var SLOT_FALLBACK = {
  case: {
    id: 'wood.walnut',
    kind: 'wood',
    color: '#764e2e',
    grain: 0.625,
    planks: 2,
    scale: 1,
    gloss: 0.3,
    bump: 0.5,
    seed: 21,
  },
  floor: {
    id: 'wood.oak-floor',
    kind: 'wood',
    color: '#a87c52',
    grain: 0.25,
    planks: 6,
    scale: 1.6,
    gloss: 0.45,
    bump: 0.5,
    seed: 7,
  },
  wall: {
    id: 'plaster.warm-white',
    kind: 'plaster',
    color: '#f1ebe0',
    scale: 2,
    gloss: 0.05,
    bump: 0.3,
    seed: 5,
  },
  curtain: {
    id: 'cloth.linen',
    kind: 'cloth',
    color: '#c9bfa8',
    scale: 0.5,
    gloss: 0.05,
    bump: 0.4,
    seed: 31,
  },
  brass: {
    id: 'metal.brass',
    kind: 'metal',
    finish: 'brushed',
    color: '#b08d4a',
    grain: 0.6,
    scale: 0.5,
    gloss: 0.7,
    bump: 0.2,
    seed: 61,
  },
  glass: {
    id: 'glass.clear',
    kind: 'glass',
    color: '#dfeaf4',
    opacity: 0.15,
    grain: 0,
    scale: 1.5,
    gloss: 0.8,
    seed: 71,
  },
  rug: { id: 'rug.navy', kind: 'rug', color: '#2f3a52', scale: 3.4, bump: 0.6, seed: 23 },
};

/* 3D用 */
function create(THREE, core, o) {
  o = o || {};
  var maxAniso = o.maxAniso || 1,
    nameOf = o.nameOf,
    markOf = o.markOf,
    defs = o.defs || {};
  var byId = {};
  (defs.swatches || []).forEach(function (s) {
    byId[s.id] = s;
  });
  /* 貼る場所(slot)の見本。対応表に無い・見本が無い時は既定の見た目 */
  function slot(name) {
    var id = (defs.assign || {})[name];
    return byId[id] || SLOT_FALLBACK[name];
  }
  function tex(c, rep, linear) {
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    if (!linear) t.encoding = THREE.sRGBEncoding;
    if (rep) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
    return t;
  }
  function lin(v) {
    return Math.pow(v, 2.2);
  }
  function linHex(h) {
    var c = new THREE.Color(h);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
  }
  /* 見本の値 → 材質の値(ツヤ・凹凸) */
  function shininess(d) {
    return 6 + val(d, 'gloss') * 80;
  }
  function bumpScale(d) {
    return val(d, 'bump') * 0.012;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function clothNoise(g, w, h, a) {
    var R = rng(w * 7 + h);
    for (var i = 0; i < (w * h) / 90; i++) {
      g.fillStyle = 'rgba(' + (R() < 0.5 ? '255,255,255' : '0,0,0') + ',' + a * R() + ')';
      g.fillRect(R() * w, R() * h, 1, 1 + R() * 2);
    }
  }
  function goldBands(g, w, y) {
    var gr = g.createLinearGradient(0, y, 0, y + 10);
    gr.addColorStop(0, '#f1d79a');
    gr.addColorStop(1, '#a8823e');
    g.fillStyle = gr;
    g.fillRect(0, y, w, 3);
    g.fillRect(0, y + 7, w, 3);
  }
  function wrapText(g, text, maxW, maxLines) {
    var lines = [],
      line = '';
    Array.from(String(text || '')).forEach(function (ch) {
      if (g.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    }
    return lines;
  }
  /* 背表紙: 布の地、丸背の陰影、金の帯、アイコン、縦書きの題名(128×512 の座標で描く) */
  function drawSpine(c, t, color, img) {
    var g = c.getContext('2d'),
      W = 128,
      H = Math.round((128 * c.height) / c.width);
    g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0); /* 縦横比は本に合わせる */
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    clothNoise(g, W, H, 0.08);
    var sh = g.createLinearGradient(0, 0, W, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.6)');
    sh.addColorStop(0.2, 'rgba(255,255,255,.18)');
    sh.addColorStop(0.42, 'rgba(255,255,255,.05)');
    sh.addColorStop(0.8, 'rgba(0,0,0,.15)');
    sh.addColorStop(1, 'rgba(0,0,0,.6)'); /* 丸背: 左上から光が当たったような明暗 */
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
    goldBands(g, W, 22);
    goldBands(g, W, H - 36);
    rr(g, 18, 48, 92, 92, 20);
    g.fillStyle = '#4a4e7a';
    g.fill();
    if (img) {
      g.save();
      rr(g, 18, 48, 92, 92, 20);
      g.clip();
      g.drawImage(img, 18, 48, 92, 92);
      g.restore();
    } else {
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 46px ' + SANS;
      g.fillText(markOf(t), 64, 96);
    }
    var title = Array.from(nameOf(t)),
      top = 166,
      bottom = H - 56,
      size = Math.min(60, Math.floor((bottom - top) / Math.max(1, title.length)));
    g.fillStyle = '#ecd59a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 ' + size + 'px ' + FONT;
    title.forEach(function (ch, i) {
      var y = top + size * (i + 0.5);
      if (/[ー〜～\-－—]/.test(ch)) {
        g.save();
        g.translate(64, y);
        g.rotate(Math.PI / 2);
        g.fillText(ch, 0, 0);
        g.restore();
      } else g.fillText(ch, 64, y);
    });
  }
  /* 表紙: 布の地、金の二重枠、アイコン、題名、説明、カテゴリ(384×512 の座標で描く) */
  function drawCover(c, t, color, cat, img) {
    var g = c.getContext('2d'),
      W = 384,
      H = Math.round((384 * c.height) / c.width);
    g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    clothNoise(g, W, H, 0.07);
    var sh = g.createLinearGradient(0, 0, W, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.28)');
    sh.addColorStop(0.08, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9a45a';
    g.lineWidth = 3;
    g.strokeRect(30, 26, W - 52, H - 52);
    g.lineWidth = 1.5;
    g.strokeRect(38, 34, W - 68, H - 68);
    rr(g, W / 2 - 74 + 8, 74, 148, 148, 32);
    g.fillStyle = '#4a4e7a';
    g.fill();
    if (img) {
      g.save();
      rr(g, W / 2 - 74 + 8, 74, 148, 148, 32);
      g.clip();
      g.drawImage(img, W / 2 - 74 + 8, 74, 148, 148);
      g.restore();
    } else {
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 76px ' + SANS;
      g.fillText(markOf(t), W / 2 + 8, 150);
    }
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#f1dc9f';
    var ts = 34;
    g.font = '700 ' + ts + 'px ' + FONT;
    while (g.measureText(nameOf(t)).width > W - 96 && ts > 20) {
      ts -= 2;
      g.font = '700 ' + ts + 'px ' + FONT;
    }
    var tl = wrapText(g, nameOf(t), W - 96, 2);
    tl.forEach(function (l, i) {
      g.fillText(l, W / 2 + 8, 268 + i * (ts + 8));
    });
    g.fillStyle = '#c9a45a';
    g.fillRect(W / 2 - 22, 286 + (tl.length - 1) * (ts + 8), 60, 2);
    g.fillStyle = 'rgba(245,236,214,.88)';
    g.font = '500 20px ' + SANS;
    wrapText(g, t.desc || '', W - 110, 3).forEach(function (l, i) {
      g.fillText(l, W / 2 + 8, 330 + (tl.length - 1) * (ts + 8) + i * 28);
    });
    g.fillStyle = 'rgba(241,220,159,.75)';
    g.font = '600 16px ' + SANS;
    g.fillText(cat, W / 2 + 8, H - 50);
  }
  /* 本の絵。背表紙はすぐ描き、表紙は本を引き出した時に初めて描く(見えない間はメモリを使わない) */
  function bookArt(t, color, cat) {
    var ar = core.TOOL.h / core.TOOL.w,
      sc = canvas(192, Math.round(192 * ar)),
      st = tex(sc),
      cc = null,
      ct = null,
      icon = null;
    drawSpine(sc, t, color, null);
    return {
      spine: st,
      cover: function () {
        if (!ct) {
          cc = canvas(512, Math.round((512 * core.TOOL.h) / core.TOOL.d));
          drawCover(cc, t, color, cat, icon);
          ct = tex(cc);
        }
        return ct;
      },
      redraw: function (img) {
        icon = img;
        drawSpine(sc, t, color, img);
        st.needsUpdate = true;
        if (cc) {
          drawCover(cc, t, color, cat, img);
          ct.needsUpdate = true;
        }
      },
    };
  }
  /* 布の凹凸(本の布装に使う細かいむら) */
  function clothBump() {
    var c = canvas(256),
      g = c.getContext('2d'),
      R = rng(17);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < (256 * 256) / 40; i++) {
      g.fillStyle = 'rgba(0,0,0,' + R() * 0.18 + ')';
      g.fillRect(R() * 256, R() * 256, 2, 2);
    }
    return tex(c, true, true);
  }
  /* 棚板の下の影(本の上の方を少し暗くする) */
  function shelfShadow() {
    var c = canvas(8, 128),
      g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(0,0,0,.62)');
    gr.addColorStop(0.35, 'rgba(0,0,0,.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 128);
    return tex(c, false, true);
  }
  return {
    CAT_HEX: CAT_HEX,
    slot: slot,
    paint: paint,
    tex: tex,
    lin: lin,
    linHex: linHex,
    shininess: shininess,
    bumpScale: bumpScale,
    val: val,
    bookArt: bookArt,
    clothBump: clothBump,
    shelfShadow: shelfShadow,
  };
}

var api = {
  create: create,
  paint: paint,
  paramsOf: paramsOf,
  KINDS: KINDS,
  DEFAULTS: DEFAULTS,
  val: val,
  CAT_HEX: CAT_HEX,
};

export default api;
