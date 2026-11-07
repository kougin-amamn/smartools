/* 画像編集の計算(画面に依存しない。Node でテストできる)。window.ImageEditorCore
   効果・色のフィルターの一覧と調整項目、網点(Bayer)と誤差拡散、減色のパレット、処理する大きさ、保存するファイル名。
   シェーダーと同じ式 */
(function (root) {
  'use strict';

  function pct(key, label, value) {
    return { key: key, label: label, min: 0, max: 100, value: value, unit: '%' };
  }
  function choice(key, label, value, options) {
    return { key: key, label: label, type: 'choice', value: value, options: options };
  }
  /* 効果の分類(選ぶ時のタブ) */
  var GROUPS = [
    ['paint', '絵画'],
    ['line', '線・ドット'],
    ['print', '印刷・表示'],
    ['pattern', '模様'],
  ];
  /* 効果の一覧。params の値は prm.x〜w としてシェーダーにそのまま渡す(選ぶ物は番号)。
     大きさ(px)は「長い辺が 1000 画素の画像」での大きさ。実際の画像では長い辺に比例させる(effectScale) */
  var EFFECTS = [
    { id: 'none', name: 'なし', group: 'all', params: [] },
    {
      id: 'anime',
      name: 'アニメ調',
      group: 'paint',
      params: [
        { key: 'levels', label: '塗りの段階', min: 2, max: 6, value: 3, unit: '段' },
        pct('line', '輪郭線', 70),
      ],
    },
    {
      id: 'oil',
      name: '油絵風',
      group: 'paint',
      params: [{ key: 'brush', label: '筆の大きさ', min: 2, max: 10, value: 5, unit: 'px' }],
    },
    {
      id: 'watercolor',
      name: '水彩風',
      group: 'paint',
      params: [pct('bleed', 'にじみ', 55), pct('paper', '紙の質感', 50)],
    },
    {
      id: 'pointillism',
      name: '点描',
      group: 'paint',
      params: [{ key: 'dot', label: '点の大きさ', min: 3, max: 16, value: 6, unit: 'px' }],
    },
    { id: 'crayon', name: 'クレヨン', group: 'paint', params: [pct('pressure', '筆圧', 55)] },
    {
      id: 'pixel',
      name: 'ドット絵',
      group: 'line',
      params: [
        { key: 'block', label: 'ドットの大きさ', min: 2, max: 32, value: 8, unit: 'px' },
        { key: 'levels', label: '色の段階', min: 2, max: 8, value: 5, unit: '段' },
      ],
    },
    {
      id: 'sketch',
      name: '線画',
      group: 'line',
      params: [
        pct('edge', '線の濃さ', 60),
        pct('tone', '陰影', 30),
        choice('ink', '線の色', 'black', [
          ['black', '黒'],
          ['color', '元の色'],
        ]),
        choice('fill', '塗り', 'none', [
          ['none', 'なし'],
          ['light', '淡く'],
          ['color', '元の色'],
        ]),
      ],
    },
    {
      id: 'reduce',
      name: '減色',
      group: 'line',
      params: [
        { key: 'colors', label: '色の数', min: 2, max: 256, value: 256, unit: '色' },
        pct('dither', 'ディザ', 50),
        choice('palette', 'パレット', 'auto', [
          ['auto', '映像に合わせる'],
          ['even', '均等'],
        ]),
      ],
    },
    {
      id: 'dither2',
      name: '2色ディザ',
      group: 'line',
      params: [
        choice('method', '点の並べ方', 'bayer', [
          ['bayer', '網点'],
          ['fs', '誤差拡散'],
          ['atkinson', 'アトキンソン'],
        ]),
        { key: 'dot', label: '点の大きさ', min: 1, max: 6, value: 2, unit: 'px' },
        pct('bright', '明るさ', 50),
        choice('pair', '2色', 'mono', [
          ['mono', '白黒'],
          ['ink', '紙とインク'],
          ['green', '緑の画面'],
          ['blue', '青写真'],
          ['amber', 'こはく色'],
        ]),
      ],
    },
    {
      id: 'halftone',
      name: 'ハーフトーン',
      group: 'print',
      params: [
        { key: 'dot', label: '網点の大きさ', min: 3, max: 16, value: 6, unit: 'px' },
        choice('ink', 'インク', 'cmyk', [
          ['cmyk', 'カラー'],
          ['mono', '黒'],
        ]),
      ],
    },
    {
      id: 'led',
      name: '電光掲示板',
      group: 'print',
      params: [
        { key: 'size', label: '粒の大きさ', min: 4, max: 20, value: 8, unit: 'px' },
        choice('color', '粒の色', 'color', [
          ['color', '元の色'],
          ['amber', '単色'],
        ]),
      ],
    },
    {
      id: 'mosaic',
      name: 'モザイク',
      group: 'pattern',
      params: [
        { key: 'size', label: 'タイルの大きさ', min: 4, max: 48, value: 14, unit: 'px' },
        choice('shape', '形', 'square', [
          ['square', '四角'],
          ['hex', '六角'],
        ]),
      ],
    },
    {
      id: 'stained',
      name: 'ステンドグラス',
      group: 'pattern',
      params: [{ key: 'size', label: 'ガラスの大きさ', min: 10, max: 60, value: 26, unit: 'px' }],
    },
    {
      id: 'emboss',
      name: '浮き彫り',
      group: 'pattern',
      params: [
        pct('depth', '強さ', 60),
        choice('color', '色', 'gray', [
          ['gray', '灰色'],
          ['color', '元の色'],
        ]),
      ],
    },
    {
      id: 'neon',
      name: 'ネオン輪郭',
      group: 'pattern',
      params: [pct('bright', '明るさ', 60), pct('width', '太さ', 40)],
    },
  ];
  function effectIndex(id) {
    for (var i = 0; i < EFFECTS.length; i++) if (EFFECTS[i].id === id) return i;
    return 0;
  }
  /* 調整の値をシェーダーに渡す4つの数にする(範囲の外は端に寄せ、無い物は初期値。選ぶ物は選んだ番号) */
  function prmOf(id, values) {
    var out = [0, 0, 0, 0],
      v = values || {};
    EFFECTS[effectIndex(id)].params.forEach(function (p, i) {
      var x = v[p.key];
      if (p.type === 'choice') {
        var k = -1;
        p.options.forEach(function (o, j) {
          if (o[0] === x) k = j;
        });
        if (k < 0)
          p.options.forEach(function (o, j) {
            if (o[0] === p.value) k = j;
          });
        out[i] = k;
      } else
        out[i] =
          typeof x === 'number' && isFinite(x) ? Math.max(p.min, Math.min(p.max, x)) : p.value;
    });
    return out;
  }
  /* 色のフィルター。番号はシェーダーの colorFilter の並び */
  var FILTERS = [
    ['none', 'なし'],
    ['sepia', 'セピア'],
    ['mono', '白黒'],
    ['cyanotype', '青写真'],
    ['vintage', '退色フィルム'],
    ['cross', 'クロスプロセス'],
    ['tealorange', '映画調'],
    ['duotone', '2色刷り'],
    ['infrared', '赤外線風'],
    ['night', '暗視スコープ風'],
    ['green4', '緑4階調'],
  ];
  function filterIndex(id) {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i][0] === id) return i;
    return 0;
  }

  /* ドット絵の網点: 4×4 の Bayer 行列の値(0〜15)。x,y は網点の升目の番号
     2×2 の値 2*(x xor y)+y を2段に重ねる(シェーダーも同じ式) */
  function bayer2(x, y) {
    x = x & 1;
    y = y & 1;
    return 2 * (x ^ y) + y;
  }
  function bayer4(x, y) {
    return 4 * bayer2(x, y) + bayer2(x >> 1, y >> 1);
  }
  /* 2色ディザ
     網点: 8×8 の Bayer 行列(0〜63)。4×4 を2段に重ねる(シェーダーの bayer8 と同じ式)。65段の濃淡を表せる */
  function bayer8(x, y) {
    return 16 * bayer2(x, y) + bayer4(x >> 1, y >> 1);
  }
  /* 明るさ 0〜100 を、明るさの曲がり具合(ガンマ)に変える。50 で そのまま、大きいほど明るく */
  function ditherGamma(bright) {
    return Math.pow(2, (50 - bright) / 25);
  }
  /* 誤差拡散: 明るさ(0〜1)の並び lum を、左上から順に白か黒に決め、丸めた誤差をまだ決めていない隣へ回す。
     fs は Floyd–Steinberg(右 7/16・左下 3/16・下 5/16・右下 1/16。行ごとに向きを変えて筋を防ぐ)、
     atkinson は誤差の 6/8 だけを6か所に 1/8 ずつ回す(残りは捨てるので、明るい所は白・暗い所は黒にまとまり、すっきりした絵になる)。戻り値は 0 か 255 */
  function diffuse(lum, w, h, method) {
    var e = new Float32Array(lum),
      out = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      var rev = method === 'fs' && y % 2 === 1;
      for (var i = 0; i < w; i++) {
        var x = rev ? w - 1 - i : i,
          j = y * w + x,
          v = e[j],
          b = v >= 0.5 ? 1 : 0,
          err = v - b,
          d = rev ? -1 : 1;
        out[j] = b * 255;
        if (method === 'fs') {
          add(x + d, y, (err * 7) / 16);
          add(x - d, y + 1, (err * 3) / 16);
          add(x, y + 1, (err * 5) / 16);
          add(x + d, y + 1, err / 16);
        } else {
          var q = err / 8;
          add(x + 1, y, q);
          add(x + 2, y, q);
          add(x - 1, y + 1, q);
          add(x, y + 1, q);
          add(x + 1, y + 1, q);
          add(x, y + 2, q);
        }
      }
    }
    function add(x, y, v) {
      if (x >= 0 && x < w && y < h) e[y * w + x] += v;
    }
    return out;
  }

  /* 減色
     パレット(使う色の一覧)を作り、各色をいちばん近いパレットの色に置き換える。
     映像に合わせる時は、GIF などと同じメディアンカット: 色の集まりを、いちばん幅の広い色の軸の中央値で2つに分けることを
     n 個になるまでくり返し、それぞれの平均の色を使う。px は [r,g,b,(a)] の並び(stride 個ずつ)、値は 0〜255 */
  function medianCut(px, n, stride) {
    stride = stride || 4;
    var count = Math.floor(px.length / stride),
      all = new Array(count);
    for (var i = 0; i < count; i++) all[i] = i * stride;
    function range(box) {
      var lo = [255, 255, 255],
        hi = [0, 0, 0];
      box.forEach(function (o) {
        for (var c = 0; c < 3; c++) {
          var v = px[o + c];
          if (v < lo[c]) lo[c] = v;
          if (v > hi[c]) hi[c] = v;
        }
      });
      var ax = 0;
      for (var c2 = 1; c2 < 3; c2++) if (hi[c2] - lo[c2] > hi[ax] - lo[ax]) ax = c2;
      return { ax: ax, w: hi[ax] - lo[ax] };
    }
    var boxes = [{ px: all, r: range(all) }];
    while (boxes.length < n) {
      /* 分ける箱: 色の幅が広く、点の多いもの(幅 × 点の数の平方根が最大) */
      var bi = -1,
        best = 0;
      boxes.forEach(function (b, i2) {
        var sc = b.r.w * Math.sqrt(b.px.length);
        if (b.r.w > 0 && b.px.length > 1 && sc > best) {
          best = sc;
          bi = i2;
        }
      });
      if (bi < 0) break;
      var b = boxes[bi],
        ax2 = b.r.ax;
      b.px.sort(function (p, q) {
        return px[p + ax2] - px[q + ax2];
      });
      var mid = b.px.length >> 1,
        lo2 = b.px.slice(0, mid),
        hi2 = b.px.slice(mid);
      boxes.splice(bi, 1, { px: lo2, r: range(lo2) }, { px: hi2, r: range(hi2) });
    }
    return boxes.map(function (bx) {
      var s = [0, 0, 0];
      bx.px.forEach(function (o) {
        s[0] += px[o];
        s[1] += px[o + 1];
        s[2] += px[o + 2];
      });
      return s.map(function (v) {
        return Math.round(v / bx.px.length);
      });
    });
  }
  /* 均等なパレット: 赤・緑・青の段の数の積が n 以下で最大になるように、緑→赤→青の順に段を増やす(256 なら 6×7×6=252色) */
  function evenLevels(n) {
    var l = [1, 1, 1],
      order = [1, 0, 2],
      i = 0,
      stuck = 0;
    while (stuck < 3) {
      var c = order[i % 3],
        t = l.slice();
      t[c]++;
      if (t[0] * t[1] * t[2] <= n) {
        l = t;
        stuck = 0;
      } else stuck++;
      i++;
    }
    return l;
  }
  function evenPalette(n) {
    var l = evenLevels(n),
      out = [];
    function lv(i, k) {
      return k === 1 ? 128 : Math.round((i * 255) / (k - 1));
    }
    for (var r = 0; r < l[0]; r++)
      for (var g = 0; g < l[1]; g++)
        for (var b = 0; b < l[2]; b++) out.push([lv(r, l[0]), lv(g, l[1]), lv(b, l[2])]);
    return out;
  }
  /* 色の近さ: 人の目は緑の違いに敏感なので、緑を重く量る(赤2・緑4・青3) */
  function nearest(pal, r, g, b) {
    var bi = 0,
      bd = Infinity;
    for (var i = 0; i < pal.length; i++) {
      var p = pal[i],
        dr = p[0] - r,
        dg = p[1] - g,
        db = p[2] - b,
        d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  }
  /* 置き換え表: 赤・緑・青をそれぞれ LUT 段に分けた立方体の各点に、いちばん近いパレットの色を入れる。
     シェーダーで引けるよう (LUT×LUT)×LUT の画像(RGBA)にする。横は 赤+青×LUT、縦は 緑 */
  var LUT = 32;
  /* g0〜g1 の緑の段だけを作ることもできる(画面が止まらないよう、数コマに分けて作るため) */
  function buildLut(pal, out, g0, g1) {
    out = out || new Uint8Array(LUT * LUT * LUT * 4);
    var n = pal.length,
      P = new Int32Array(n * 3);
    for (var k = 0; k < n; k++) {
      P[k * 3] = pal[k][0];
      P[k * 3 + 1] = pal[k][1];
      P[k * 3 + 2] = pal[k][2];
    }
    /* nearest と同じ量り方を、配列を平らにして速く回す(スマホでも 0.7 秒ごとに作り直すため) */
    for (var g = g0 || 0; g < (g1 === undefined ? LUT : g1); g++) {
      var gv = (g * 255) / (LUT - 1);
      for (var b = 0; b < LUT; b++) {
        var bv = (b * 255) / (LUT - 1);
        for (var r = 0; r < LUT; r++) {
          var rv = (r * 255) / (LUT - 1),
            bi = 0,
            bd = Infinity;
          for (var q = 0; q < n * 3; q += 3) {
            var dg = P[q + 1] - gv,
              d = 4 * dg * dg;
            if (d >= bd) continue;
            var dr = P[q] - rv,
              db = P[q + 2] - bv;
            d += 2 * dr * dr + 3 * db * db;
            if (d < bd) {
              bd = d;
              bi = q;
            }
          }
          var o = (g * LUT * LUT + b * LUT + r) * 4;
          out[o] = P[bi];
          out[o + 1] = P[bi + 1];
          out[o + 2] = P[bi + 2];
          out[o + 3] = 255;
        }
      }
    }
    return out;
  }
  function lutLookup(lut, r, g, b) {
    function q(v) {
      return Math.max(0, Math.min(LUT - 1, Math.floor((v / 255) * (LUT - 1) + 0.5)));
    }
    var o = (q(g) * LUT * LUT + q(b) * LUT + q(r)) * 4;
    return [lut[o], lut[o + 1], lut[o + 2]];
  }

  /* 縦横比を保ったまま、長い辺を max 以下にした大きさ(拡大はしない) */
  function fitSize(w, h, max) {
    var k = Math.min(1, max / Math.max(w, h));
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  }
  /* 効果の大きさの倍率: 長い辺 1000 画素で 1。小さい画像でも点や筆が潰れないよう 0.5 より小さくはしない */
  function effectScale(w, h) {
    return Math.max(0.5, Math.max(w, h) / 1000);
  }
  /* 保存するファイル名: 元の名前(拡張子を除く)-効果の id.拡張子 */
  function outName(name, effect, ext) {
    var base = String(name || 'image').replace(/\.[^.]*$/, '') || 'image';
    return base + (effect && effect !== 'none' ? '-' + effect : '') + '.' + ext;
  }
  /* 画像の大きさ(バイト)の表示 */
  function bytes(n) {
    return n < 1024 * 1024
      ? Math.max(1, Math.round(n / 1024)) + 'KB'
      : (n / 1024 / 1024).toFixed(1) + 'MB';
  }

  var api = {
    EFFECTS: EFFECTS,
    GROUPS: GROUPS,
    FILTERS: FILTERS,
    filterIndex: filterIndex,
    bayer4: bayer4,
    bayer8: bayer8,
    ditherGamma: ditherGamma,
    diffuse: diffuse,
    medianCut: medianCut,
    evenLevels: evenLevels,
    evenPalette: evenPalette,
    nearest: nearest,
    buildLut: buildLut,
    lutLookup: lutLookup,
    LUT: LUT,
    effectIndex: effectIndex,
    prmOf: prmOf,
    fitSize: fitSize,
    effectScale: effectScale,
    outName: outName,
    bytes: bytes,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ImageEditorCore = api;
})(this);
