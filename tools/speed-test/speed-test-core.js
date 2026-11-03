/* 回線速度テストの計算(画面・通信に依存しない。Node でテストできる)。window.SpeedTestCore */
(function (root) {
  'use strict';
  /* 転送したバイト数と時間(ms)から Mbps */
  function bpsToMbps(bytes, ms) {
    return ms > 0 ? (bytes * 8) / (ms / 1000) / 1e6 : 0;
  }
  function median(arr) {
    if (!arr.length) return NaN;
    var s = arr.slice().sort(function (a, b) {
        return a - b;
      }),
      mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  /* ジッター = 連続する Ping の差の平均 */
  function jitter(arr) {
    if (arr.length < 2) return 0;
    var sum = 0;
    for (var i = 1; i < arr.length; i++) sum += Math.abs(arr[i] - arr[i - 1]);
    return sum / (arr.length - 1);
  }
  var api = { bpsToMbps: bpsToMbps, median: median, jitter: jitter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpeedTestCore = api;
})(this);
