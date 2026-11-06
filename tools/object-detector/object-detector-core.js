/* 物体検出の計算部分(日本語名・集計・枠の座標変換・大きさ合わせ)。画面にもライブラリにも触れない */
(function () {
  'use strict';

  /* 検出結果は COCO-SSD の形 { bbox: [x, y, 幅, 高さ](元画像の画素), class: 英語名, score: 0〜1 } */
  function jaName(cls, labels) {
    return (labels && labels[cls]) || cls;
  }
  function filterByScore(list, minScore) {
    return (list || []).filter(function (d) {
      return d.score >= minScore;
    });
  }
  /* 同じ物をまとめて「人 ×2(最高 92%)」の材料にする。数の多い順、同じなら確からしさの高い順 */
  function summarize(list, labels) {
    var map = {},
      out = [];
    (list || []).forEach(function (d) {
      var e = map[d.class];
      if (!e) {
        e = map[d.class] = { cls: d.class, name: jaName(d.class, labels), count: 0, best: 0 };
        out.push(e);
      }
      e.count++;
      if (d.score > e.best) e.best = d.score;
    });
    return out.sort(function (a, b) {
      return b.count - a.count || b.best - a.best;
    });
  }
  function summaryText(sum) {
    if (!sum.length) return 'なし';
    return sum
      .map(function (e) {
        return e.name + (e.count > 1 ? ' ×' + e.count : '');
      })
      .join('、');
  }
  function pct(score) {
    return Math.round(score * 100) + '%';
  }
  /* 元画像の枠を、scale 倍した表示用の絵の座標に直す。前面カメラは左右反転して描くので枠も反転する */
  function mapBox(bbox, scale, drawW, mirror) {
    var x = bbox[0] * scale,
      w = bbox[2] * scale;
    return { x: mirror ? drawW - x - w : x, y: bbox[1] * scale, w: w, h: bbox[3] * scale };
  }
  /* 長い辺が max を超える時だけ縮める倍率 */
  function fitScale(w, h, max) {
    return Math.min(1, max / Math.max(w, h));
  }
  /* 枠の色: 同じ物はいつも同じ色になるよう、英語名から色相を決める */
  function hueOf(cls) {
    var h = 0;
    for (var i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) % 360;
    return h;
  }

  var api = {
    jaName: jaName,
    filterByScore: filterByScore,
    summarize: summarize,
    summaryText: summaryText,
    pct: pct,
    mapBox: mapBox,
    fitScale: fitScale,
    hueOf: hueOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DetectCore = api;
})();
