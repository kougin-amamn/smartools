/* レンズカメラの計算(画面に依存しない。Node でテストできる)。window.LensCameraCore
   レンズの一覧と調整項目、魚眼と広角の対応づけ、拡大鏡の倍率の分け方(カメラの拡大と画像の拡大)。シェーダーと同じ式 */
(function (root) {
  'use strict';

  function pct(key, label, value) {
    return { key: key, label: label, min: 0, max: 100, value: value, unit: '%' };
  }
  function choice(key, label, value, options) {
    return { key: key, label: label, type: 'choice', value: value, options: options };
  }
  /* レンズの一覧。params は調整(スライダーは値のまま、type:'choice' は選んだ番号をシェーダーの prm.x〜w に渡す)。
     scale は描く解像度の倍率(ぼかしを使うレンズは重いので下げる) */
  var LENSES = [
    { id: 'standard', name: '標準', params: [] },
    {
      id: 'fisheye',
      name: '魚眼',
      params: [
        choice('shape', '写り方', 'circle', [
          ['circle', '円周'],
          ['full', '対角'],
        ]),
        pct('strength', '強さ', 70),
      ],
    },
    {
      id: 'wide',
      name: '広角',
      params: [pct('distort', 'ゆがみ', 60), pct('vignette', '周辺減光', 40)],
    },
    {
      id: 'portrait',
      name: '望遠・ポートレート',
      scale: 0.6,
      params: [
        pct('bokeh', 'ボケの大きさ', 70),
        pct('focus', 'ピントの範囲', 40),
        { key: 'tele', label: '望遠', min: 10, max: 25, value: 15, scale: 0.1, unit: '倍' },
      ],
    },
    {
      id: 'macro',
      name: 'マクロ',
      scale: 0.6,
      params: [pct('bokeh', 'ボケの大きさ', 80), pct('focus', 'ピントの範囲', 30)],
    },
    {
      id: 'tiltshift',
      name: 'ティルトシフト',
      scale: 0.7,
      params: [
        pct('center', 'ピントの位置', 55),
        { key: 'band', label: 'ピントの幅', min: 5, max: 60, value: 18, unit: '%' },
        pct('blur', 'ぼかし', 70),
        { key: 'angle', label: 'ピントの傾き', min: -45, max: 45, value: 0, unit: '°' },
      ],
    },
    {
      id: 'soft',
      name: 'ソフトフォーカス',
      scale: 0.7,
      params: [pct('glow', 'にじみ', 60), pct('soft', '柔らかさ', 50)],
    },
    {
      id: 'oldlens',
      name: 'オールドレンズ',
      scale: 0.7,
      params: [
        pct('swirl', 'ぐるぐるボケ', 60),
        pct('fringe', '色にじみ', 40),
        pct('flare', 'フレア', 40),
      ],
    },
    {
      id: 'anamorphic',
      name: 'アナモルフィック',
      scale: 0.7,
      params: [
        pct('streak', '光の筋', 60),
        pct('oval', '縦長ボケ', 40),
        choice('bars', '黒帯', 'off', [
          ['on', 'あり'],
          ['off', 'なし'],
        ]),
      ],
    },
    {
      id: 'toy',
      name: 'トイカメラ',
      scale: 0.8,
      params: [pct('vignette', '周辺減光', 70), pct('leak', '光漏れ', 50)],
    },
    {
      id: 'pinhole',
      name: 'ピンホール',
      scale: 0.7,
      params: [pct('soft', '甘さ', 60), pct('vignette', '周辺減光', 70)],
    },
    {
      id: 'prism',
      name: 'プリズム',
      params: [
        { key: 'count', label: '像の数', min: 2, max: 6, value: 3, unit: '個' },
        pct('shift', 'ずれ', 40),
        pct('rainbow', '虹色', 50),
      ],
    },
    {
      id: 'magnify',
      name: '拡大鏡',
      params: [
        { key: 'zoom', label: '倍率', min: 10, max: 100, value: 30, scale: 0.1, unit: '倍' },
        pct('sharp', '輪郭', 50),
      ],
    },
  ];
  function lensIndex(id) {
    for (var i = 0; i < LENSES.length; i++) if (LENSES[i].id === id) return i;
    return 0;
  }

  /* 魚眼: 強さ 0〜100 を、レンズが写す半画角(ラジアン)に変える。90度に届くと tan が発散するため少し手前で止める */
  function halfAngle(strength) {
    var s = Math.max(0, Math.min(100, strength)) / 100;
    return 0.02 + s * 1.4;
  }
  /* 出力の点(0〜1)→ 映像の点(0〜1)。円周の外は null。
     等距離射影: 出力の半径を角度とみなし、普通のレンズの tan に戻して元の位置を求める(シェーダーと同じ式)。
     o = { width, height, strength, round(円周なら true) } */
  function fisheyeUV(u, v, o) {
    var w = o.width,
      h = o.height,
      px = (u - 0.5) * w,
      py = (v - 0.5) * h,
      R = o.round ? Math.min(w, h) / 2 : Math.hypot(w, h) / 2,
      r = Math.hypot(px, py) / R;
    if (o.round && r > 1) return null;
    var t = halfAngle(o.strength),
      k = r < 1e-4 ? t / Math.tan(t) : Math.tan(r * t) / Math.tan(t) / r;
    return [0.5 + (px * k) / w, 0.5 + (py * k) / h];
  }

  /* 広角の樽型のゆがみ: 出力の点の、中心からの距離 r(四隅で 1)に対し、映像のどこを写すかの倍率。
     四隅はそのまま、中ほどほど拡大して写すので、まっすぐな線が外へふくらむ(シェーダーの wide と同じ式)。k は 0〜0.6 */
  function barrel(r, k) {
    return (1 + k * r * r) / (1 + k);
  }

  /* 拡大鏡の倍率を、カメラ自体の拡大(画質が落ちにくい)と画像の拡大に分ける。
     camMin〜camMax はカメラが対応する拡大の範囲(対応しない時は 1〜1)。戻り値 [カメラの倍率, 画像の倍率] */
  function splitZoom(zoom, camMin, camMax) {
    var z = Math.max(1, zoom),
      cam = Math.max(camMin || 1, Math.min(camMax || 1, z));
    return [cam, z / cam];
  }

  /* 映像を枠いっぱいに切り抜くときの倍率(object-fit: cover と同じ) */
  function coverScale(cw, ch, vw, vh) {
    var ca = cw / ch,
      va = vw / vh;
    return va > ca ? [ca / va, 1] : [1, va / ca];
  }

  /* 調整の値をシェーダーに渡す4つの数にする(スライダーは値のまま、選ぶ物は番号) */
  function prmOf(id, values) {
    var out = [0, 0, 0, 0],
      v = values || {};
    LENSES[lensIndex(id)].params.forEach(function (p, i) {
      var x = v[p.key];
      if (p.type === 'choice') {
        var k = 0;
        p.options.forEach(function (o, j) {
          if (o[0] === (x === undefined ? p.value : x)) k = j;
        });
        out[i] = k;
      } else
        out[i] =
          typeof x === 'number' && isFinite(x) ? Math.max(p.min, Math.min(p.max, x)) : p.value;
    });
    return out;
  }

  var api = {
    LENSES: LENSES,
    lensIndex: lensIndex,
    halfAngle: halfAngle,
    barrel: barrel,
    fisheyeUV: fisheyeUV,
    splitZoom: splitZoom,
    coverScale: coverScale,
    prmOf: prmOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LensCameraCore = api;
})(this);
