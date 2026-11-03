/* メトロノームの計算(画面・音に依存しない。Node でテストできる)。window.MetronomeCore */
(function (root) {
  'use strict';
  var MIN = 30,
    MAX = 240,
    TAP_WINDOW = 2500;
  function clampBpm(v) {
    return Math.max(MIN, Math.min(MAX, Math.round(v)));
  }
  /* タップした時刻(ms)の並びから BPM を出す。2.5秒より前のタップは捨てる。2回未満なら null */
  function tapBpm(times, now) {
    var t = times.filter(function (x) {
      return now - x < TAP_WINDOW;
    });
    if (t.length < 2) return { times: t, bpm: null };
    var sum = 0;
    for (var i = 1; i < t.length; i++) sum += t[i] - t[i - 1];
    return { times: t, bpm: clampBpm(60000 / (sum / (t.length - 1))) };
  }
  var api = { MIN: MIN, MAX: MAX, clampBpm: clampBpm, tapBpm: tapBpm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.MetronomeCore = api;
})(this);
