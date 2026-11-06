/* 画像分類の計算(DOM を使わない)。上位の取り出し、カメラの結果のならし、切り抜く範囲、表示用の文字。
   ラベルは [英語名, 日本語名] の配列で、モデルの出力の順(ImageNet の 1000 種類)に並ぶ */
(function () {
  'use strict';

  /* probs は長さ 1000 の確率の配列。確率の高い順に k 件 */
  function topK(probs, k) {
    var idx = [];
    for (var i = 0; i < probs.length; i++) {
      if (idx.length < k || probs[i] > probs[idx[idx.length - 1]]) {
        var j = idx.length < k ? idx.length : k - 1;
        while (j > 0 && probs[idx[j - 1]] < probs[i]) {
          idx[j] = idx[j - 1];
          j--;
        }
        idx[j] = i;
      }
    }
    return idx.map(function (n) {
      return { index: n, p: probs[n] };
    });
  }

  /* カメラでは1回ごとの結果が揺れるため、前回までの値と混ぜて表示を落ち着かせる。
     a は新しい値の重み(1 で混ぜない) */
  function smooth(prev, next, a) {
    if (!prev || prev.length !== next.length || a >= 1) return Array.prototype.slice.call(next);
    var out = new Array(next.length);
    for (var i = 0; i < next.length; i++) out[i] = prev[i] + (next[i] - prev[i]) * a;
    return out;
  }

  /* 中央の正方形の範囲。モデルの入力は正方形なので、縦横比を崩さずに真ん中を使う */
  function centerSquare(w, h) {
    var s = Math.min(w, h);
    return { x: Math.round((w - s) / 2), y: Math.round((h - s) / 2), s: s };
  }

  /* 長い辺が max に収まる倍率(拡大はしない) */
  function fitScale(w, h, max) {
    return Math.min(1, max / Math.max(w, h, 1));
  }

  function name(labels, i, lang) {
    var e = labels && labels[i];
    if (!e) return '#' + i;
    return lang === 'en' ? e[0] : e[1] || e[0];
  }

  function pct(p) {
    return Math.round(p * 100) + '%';
  }

  /* 一番上の確からしさから、どのくらい当てになるかの段階を決める */
  function confidence(p, min) {
    if (p >= Math.max(min, 0.6)) return 'high';
    if (p >= min) return 'mid';
    return 'low';
  }

  var api = {
    topK: topK,
    smooth: smooth,
    centerSquare: centerSquare,
    fitScale: fitScale,
    name: name,
    pct: pct,
    confidence: confidence,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ClassifyCore = api;
})();
