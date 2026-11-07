/* エフェクトカメラの計算(画面に依存しない。Node でテストできる)。window.EffectCameraCore
   効果の一覧と調整項目、色温度の色、サーモ風の色の並び、チルトのぼかし。シェーダーと同じ式 */
(function (root) {
  'use strict';

  /* 効果の一覧。scale は描く解像度の倍率(重い効果はスマホのため下げる)。
     params は調整(スライダーは min〜max の値をそのままシェーダーの prm.x〜w に渡す。type:'choice' は選んだ番号を渡す) */
  function pct(key, label, value) {
    return { key: key, label: label, min: 0, max: 100, value: value, unit: '%' };
  }
  function choice(key, label, value, options) {
    return { key: key, label: label, type: 'choice', value: value, options: options };
  }
  var MODES = [
    { id: 'normal', name: '通常', params: [] },
    {
      id: 'thermo',
      name: 'サーモ風',
      params: [pct('contrast', '感度', 55), pct('res', '粗さ', 45)],
    },
    {
      id: 'tilt',
      name: 'チルト',
      scale: 0.75,
      params: [
        pct('center', 'ピントの位置', 55),
        { key: 'band', label: 'ピントの幅', min: 5, max: 60, value: 18, unit: '%' },
        pct('blur', 'ぼかし', 70),
      ],
    },
    {
      id: 'vhs',
      name: 'VHS',
      params: [pct('noise', 'ノイズ', 45), pct('shift', '色ずれ', 50)],
    },
    {
      id: 'crt',
      name: 'ブラウン管',
      params: [pct('curve', '画面の丸み', 50), pct('glow', 'にじみ', 50)],
    },
    { id: 'trail', name: '残像', params: [pct('length', '残る長さ', 70)] },
    {
      id: 'slit',
      name: 'スリットスキャン',
      params: [
        choice('dir', '時間のずれる向き', 'x', [
          ['x', '左右'],
          ['y', '上下'],
        ]),
        { key: 'step', label: '時間の幅', min: 1, max: 4, value: 2, unit: '' },
      ],
    },
    { id: 'motion', name: '動いた所に色', params: [pct('sense', '感度', 55)] },
    { id: 'glitch', name: 'グリッチ', params: [pct('amount', '崩れ', 50)] },
  ];
  /* 効果の調整を、シェーダーに渡す4つの数にする(スライダーは値のまま、選ぶ物は番号) */
  function prmOf(mode, values) {
    var m = MODES[modeIndex(mode)],
      v = values || {},
      out = [0, 0, 0, 0];
    m.params.forEach(function (p, i) {
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
      } else out[i] = typeof x === 'number' ? Math.max(p.min, Math.min(p.max, x)) : p.value;
    });
    return out;
  }

  function modeIndex(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return i;
    return 0;
  }

  /* 色温度(ケルビン)の光の色 [r,g,b] 0〜1。黒体の色を近似した Tanner Helland の式 */
  function kelvinToRgb(k) {
    var t = Math.max(1000, Math.min(40000, k)) / 100,
      r,
      g,
      b;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
      b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
      b = 255;
    }
    function c(v) {
      return Math.max(0, Math.min(255, v)) / 255;
    }
    return [c(r), c(g), c(b)];
  }
  /* 映像に掛ける色の倍率。6500K(昼の光)を基準に、低いほど暖かく(赤み)、高いほど青みにする。
     明るさが変わらないよう、緑を 1 にそろえる */
  function wbGains(k) {
    var a = kelvinToRgb(k),
      n = kelvinToRgb(6500);
    var g = [a[0] / n[0], a[1] / n[1], a[2] / n[2]];
    return [g[0] / g[1], 1, g[2] / g[1]];
  }

  /* サーモ風の色: 明るさ 0〜1 → 黒・紫・赤・橙・黄・白 と並ぶ色(鉄が熱せられる色に近い並び) */
  var THERMO_STOPS = [
    [0, [0, 0, 0.08]],
    [0.18, [0.25, 0, 0.45]],
    [0.38, [0.7, 0.05, 0.45]],
    [0.55, [0.93, 0.25, 0.1]],
    [0.72, [1, 0.6, 0]],
    [0.88, [1, 0.9, 0.3]],
    [1, [1, 1, 0.95]],
  ];
  function thermoColor(v) {
    v = Math.max(0, Math.min(1, v));
    for (var i = 1; i < THERMO_STOPS.length; i++) {
      var a = THERMO_STOPS[i - 1],
        b = THERMO_STOPS[i];
      if (v <= b[0]) {
        var f = (v - a[0]) / (b[0] - a[0]);
        return [0, 1, 2].map(function (j) {
          return a[1][j] + (b[1][j] - a[1][j]) * f;
        });
      }
    }
    return THERMO_STOPS[THERMO_STOPS.length - 1][1].slice();
  }
  /* シェーダーに渡す 256×1 の色の帯(RGBA の Uint8Array) */
  function thermoTable() {
    var out = new Uint8Array(256 * 4);
    for (var i = 0; i < 256; i++) {
      var c = thermoColor(i / 255);
      out[i * 4] = Math.round(c[0] * 255);
      out[i * 4 + 1] = Math.round(c[1] * 255);
      out[i * 4 + 2] = Math.round(c[2] * 255);
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  /* チルトのぼかしの半径(0〜1): ピントの帯の中は 0、帯から離れるほど大きくなる。y・center・band は画面の高さに対する割合 */
  function tiltAmount(y, center, band) {
    var d = Math.abs(y - center) - band / 2;
    if (d <= 0) return 0;
    return Math.min(1, d / 0.35);
  }

  /* 映像を枠いっぱいに切り抜くときの倍率(object-fit: cover と同じ) */
  function coverScale(cw, ch, vw, vh) {
    var ca = cw / ch,
      va = vw / vh;
    return va > ca ? [ca / va, 1] : [1, va / ca];
  }

  /* 色温度の表示名 */
  function kelvinLabel(k) {
    return k + 'K' + (k < 5000 ? '(暖かい)' : k > 7500 ? '(青み)' : '');
  }

  var api = {
    MODES: MODES,
    modeIndex: modeIndex,
    prmOf: prmOf,
    kelvinToRgb: kelvinToRgb,
    wbGains: wbGains,
    thermoColor: thermoColor,
    thermoTable: thermoTable,
    tiltAmount: tiltAmount,
    coverScale: coverScale,
    kelvinLabel: kelvinLabel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.EffectCameraCore = api;
})(this);
