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
    return (
      String(m).padStart(2, '0') +
      ':' +
      String(s).padStart(2, '0') +
      '.' +
      String(cs).padStart(2, '0')
    );
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
  /* 今の分の中の進み(0〜1)。外の輪は 60 秒で 1 周する */
  function secondProgressOf(ms) {
    return (Math.max(0, ms) % 60000) / 60000;
  }
  /* 前のラップに対する今のラップ。ratio は内の輪の長さ(1 で 1 周)、over は前より遅い時、difference は差(ms) */
  function paceOf(currentSplit, previousSplit) {
    if (!(previousSplit > 0)) return null;
    return {
      ratio: Math.min(1, currentSplit / previousSplit),
      over: currentSplit > previousSplit,
      difference: currentSplit - previousSplit,
    };
  }
  /* いちばん速い・遅いラップの番号。2つ未満の時と、全部同じ時は null */
  function extremesOf(laps) {
    if (!laps || laps.length < 2) return null;
    var fastest = laps[0],
      slowest = laps[0];
    laps.forEach(function (l) {
      if (l.split < fastest.split) fastest = l;
      if (l.split > slowest.split) slowest = l;
    });
    if (fastest.split === slowest.split) return null;
    return { fastest: fastest.no, slowest: slowest.no };
  }
  var api = {
    fmt: fmt,
    create: create,
    secondProgressOf: secondProgressOf,
    paceOf: paceOf,
    extremesOf: extremesOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StopwatchCore = api;
})(this);
