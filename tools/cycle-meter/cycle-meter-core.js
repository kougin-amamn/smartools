/* サイクルメーターの計算(距離・速度。画面とGPSに依存しない。Node でテストできる)。window.CycleMeterCore */
(function (root) {
  'use strict';
  var ACCURACY_LIMIT = 30; /* これより精度が悪い測位は距離計算に使わない(m) */
  var MIN_MOVE = 2; /* これ未満の移動はGPSノイズとみなす(m) */
  var MAX_SPEED = 150; /* これを超える速度は測位の飛びとみなして最高速度に入れない(km/h) */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000,
      toRad = function (d) {
        return (d * Math.PI) / 180;
      };
    var dLat = toRad(lat2 - lat1),
      dLon = toRad(lon2 - lon1);
    var a =
      Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLon / 2), 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000),
      h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : pad(m) + ':' + pad(sec);
  }
  /* 平均速度(km/h) */
  function avgKmh(distM, ms) {
    var h = ms / 3600000;
    return h > 0 ? distM / 1000 / h : 0;
  }
  /* 測位を積み上げる。update(p) p={lat,lon,speed(m/s|null),accuracy,t(ms)} → 今の速度(km/h) */
  function create() {
    var st = { distM: 0, maxKmh: 0, last: null };
    return {
      state: st,
      update: function (p) {
        var kmh = 0,
          hasSpeed = typeof p.speed === 'number' && p.speed >= 0;
        if (hasSpeed) kmh = p.speed * 3.6;
        if (st.last && p.accuracy < ACCURACY_LIMIT) {
          var d = haversine(st.last.lat, st.last.lon, p.lat, p.lon),
            dt = (p.t - st.last.t) / 1000;
          if (d > MIN_MOVE) {
            st.distM += d;
            if (!hasSpeed && dt > 0) kmh = (d / dt) * 3.6;
          }
        }
        st.last = { lat: p.lat, lon: p.lon, t: p.t };
        if (kmh > st.maxKmh && kmh < MAX_SPEED) st.maxKmh = kmh;
        return kmh;
      },
      pause: function () {
        st.last = null;
      },
      reset: function () {
        st.distM = 0;
        st.maxKmh = 0;
        st.last = null;
      },
    };
  }
  var api = {
    ACCURACY_LIMIT: ACCURACY_LIMIT,
    MIN_MOVE: MIN_MOVE,
    haversine: haversine,
    fmtTime: fmtTime,
    avgKmh: avgKmh,
    create: create,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CycleMeterCore = api;
})(this);
