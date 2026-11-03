/* ストップウォッチの計時(画面に依存しない。Node でテストできる)。window.StopwatchCore
   now() には時刻(ms)を返す関数を渡す(テストでは時刻を差し替える) */
(function (root) {
  'use strict';
  function fmt(ms) {
    ms = Math.max(0, ms);
    var cs = Math.floor(ms / 10) % 100,
      totalSec = Math.floor(ms / 1000),
      m = Math.floor(totalSec / 60),
      s = totalSec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
  }
  function create(now) {
    now = now || Date.now;
    var st = { running: false, elapsed: 0, startedAt: 0, laps: [], lastLap: 0 };
    var api = {
      state: st,
      current: function () {
        return st.running ? st.elapsed + (now() - st.startedAt) : st.elapsed;
      },
      start: function () {
        if (st.running) return;
        st.running = true;
        st.startedAt = now();
      },
      stop: function () {
        if (!st.running) return;
        st.elapsed = api.current();
        st.running = false;
      },
      /* ラップ: {no, split(前回からの時間), total} */
      lap: function () {
        var t = api.current(),
          l = { no: st.laps.length + 1, split: t - st.lastLap, total: t };
        st.lastLap = t;
        st.laps.push(l);
        return l;
      },
      reset: function () {
        st.running = false;
        st.elapsed = 0;
        st.startedAt = 0;
        st.laps = [];
        st.lastLap = 0;
      },
    };
    return api;
  }
  var api = { fmt: fmt, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StopwatchCore = api;
})(this);
