/* キッチンタイマーの時間の計算(画面に依存しない。Node でテストできる)。window.KitchenTimerCore */
(function (root) {
  'use strict';
  var MAX = 99 * 60 + 59,
    DEFAULT = 180;
  /* ±の調整(0〜99:59 で止める)。changed=false なら変えられなかった */
  function adjust(total, delta) {
    var v = Math.max(0, Math.min(MAX, total + delta));
    return {
      value: v,
      changed: v !== total,
      limit: v === total ? (delta > 0 ? '上限' : '下限') : null,
    };
  }
  function adjustLabel(delta) {
    var a = Math.abs(delta);
    return (delta > 0 ? '+' : '−') + (a >= 60 ? a / 60 + '分' : a + '秒');
  }
  var api = { MAX: MAX, DEFAULT: DEFAULT, adjust: adjust, adjustLabel: adjustLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KitchenTimerCore = api;
})(this);
