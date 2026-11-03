/* 騒音計の計算(画面・マイクに依存しない。Node でテストできる)。window.NoiseMeterCore
   マイクの波形(0〜255、128が無音)から音の大きさの目安(dB相当の相対値)を出す。校正していないため実際の dB とは異なる */
(function (root) {
  'use strict';
  var OFFSET = 100;
  function levelDb(data) {
    var sum = 0;
    for (var i = 0; i < data.length; i++) {
      var v = (data[i] - 128) / 128;
      sum += v * v;
    }
    var rms = Math.sqrt(sum / (data.length || 1));
    return Math.max(0, 20 * Math.log10(rms || 0.00001) + OFFSET);
  }
  /* 最小・平均・最大の集計 */
  function stats() {
    var s = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    return {
      state: s,
      add: function (db) {
        s.min = Math.min(s.min, db);
        s.max = Math.max(s.max, db);
        s.sum += db;
        s.count++;
      },
      avg: function () {
        return s.count ? s.sum / s.count : NaN;
      },
      reset: function () {
        s.min = Infinity;
        s.max = -Infinity;
        s.sum = 0;
        s.count = 0;
      },
    };
  }
  function fmt(v) {
    return isFinite(v) ? v.toFixed(0) : '--';
  }
  var api = { levelDb: levelDb, stats: stats, fmt: fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NoiseMeterCore = api;
})(this);
