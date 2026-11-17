/* 高度計の画面に依存しない計算(座標の丸め・距離・標高を取り直すか・精度の段階・表示の形)。Node でテストできる */
(function (root) {
  'use strict';

  var ELEVATION_REFETCH_METERS = 60;

  /* 送る前に小数3桁(約 100m)に丸める。標高のデータは約 90m の網目なので、これで足りる */
  function roundedCoordinateOf(v) {
    return Math.round(v * 1000) / 1000;
  }

  /* 2点の距離(m)。短い距離なので球として計算する */
  function distanceOf(a, b) {
    var R = 6371000,
      rad = Math.PI / 180,
      dLat = (b.lat - a.lat) * rad,
      dLon = (b.lon - a.lon) * rad,
      s =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function needsElevationOf(last, now) {
    return !last || distanceOf(last, now) >= ELEVATION_REFETCH_METERS;
  }

  function elevationUrlOf(lat, lon) {
    return (
      'https://api.open-meteo.com/v1/elevation?latitude=' +
      roundedCoordinateOf(lat) +
      '&longitude=' +
      roundedCoordinateOf(lon)
    );
  }

  /* 高さの精度(m)の段階 */
  function qualityOf(accuracy) {
    if (accuracy === null || accuracy === undefined || !(accuracy >= 0)) return 'unknown';
    if (accuracy <= 10) return 'good';
    if (accuracy <= 30) return 'fair';
    return 'poor';
  }

  /* 「+12.3 m」の形(0 は符号なし) */
  function signedMetersOf(v) {
    var r = Math.round(v * 10) / 10;
    if (r === 0) return '0.0 m';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1) + ' m';
  }

  function recentOf(history, now, windowMs) {
    return history.filter(function (p) {
      return now - p.t <= windowMs;
    });
  }

  var api = {
    ELEVATION_REFETCH_METERS: ELEVATION_REFETCH_METERS,
    roundedCoordinateOf: roundedCoordinateOf,
    distanceOf: distanceOf,
    needsElevationOf: needsElevationOf,
    elevationUrlOf: elevationUrlOf,
    qualityOf: qualityOf,
    signedMetersOf: signedMetersOf,
    recentOf: recentOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') root.AltimeterCore = api;
})(typeof window !== 'undefined' ? window : this);
