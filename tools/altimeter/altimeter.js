/* 高度計の画面。位置情報で GPS の高さを測り、Open-Meteo の地図データで標高(海抜)を調べる。計算は altimeter-core.js */
(function () {
  'use strict';
  var $ = function (id) {
    return document.getElementById(id);
  };
  var C = window.AltimeterCore;
  var elevationEl = $('elevation'),
    startBtn = $('startBtn'),
    baseBtn = $('baseBtn'),
    clearBtn = $('clearBtn'),
    differenceEl = $('difference'),
    differenceSub = $('differenceSub'),
    gpsHeightEl = $('gpsHeight'),
    accuracyEl = $('accuracy'),
    qualityMark = $('qualityMark'),
    chart = $('chart'),
    chartEmpty = $('chartEmpty'),
    statusEl = $('status');

  var HISTORY_MS = 10 * 60 * 1000;
  var watchId = null,
    last = null /* { h: GPS の高さ, a: 精度 } */,
    base = null,
    history = [],
    elevationAt = null /* 標高を調べた所 */,
    elevationSeq = 0,
    loggedFirst = false;

  function metersOf(v) {
    return Number.isFinite(v) ? v.toFixed(1) : '—';
  }

  /* 表示 */
  function render() {
    gpsHeightEl.textContent = last ? metersOf(last.h) + ' m' : '—';
    var quality = last ? C.qualityOf(last.a) : 'unknown';
    accuracyEl.textContent =
      last && last.a !== null ? '精度 ±' + Math.round(last.a) + ' m' : '精度 —';
    qualityMark.hidden = !(quality === 'poor');
    differenceEl.textContent = last && base !== null ? C.signedMetersOf(last.h - base) : '—';
    differenceSub.textContent = base !== null ? 'GPS の高さの差' : '基準を決めると出ます';
    var running = watchId !== null;
    startBtn.hidden = running;
    baseBtn.hidden = !running || base !== null;
    baseBtn.disabled = !last;
    clearBtn.hidden = base === null;
    drawChart();
  }

  /* 推移のグラフ(色は画面の色の役割から取る) */
  function drawChart() {
    var ctx = chart.getContext('2d');
    if (!ctx) return;
    var ratio = window.devicePixelRatio || 1,
      w = (chart.width = Math.max(1, Math.round(chart.clientWidth * ratio))),
      h = (chart.height = Math.round(120 * ratio));
    ctx.clearRect(0, 0, w, h);
    chartEmpty.hidden = history.length >= 2;
    if (history.length < 2) return;
    var style = getComputedStyle(document.documentElement),
      values = history.map(function (p) {
        return p.h;
      });
    if (base !== null) values.push(base);
    var min = Math.min.apply(null, values),
      max = Math.max.apply(null, values),
      pad = Math.max(2, (max - min) * 0.2),
      lo = min - pad,
      hi = max + pad,
      t0 = history[0].t,
      t1 = history[history.length - 1].t;
    var yOf = function (v) {
      return 8 * ratio + (h - 16 * ratio) * (1 - (v - lo) / (hi - lo));
    };
    if (base !== null) {
      ctx.strokeStyle = style.getPropertyValue('--outline').trim() || '#79747e';
      ctx.lineWidth = 1 * ratio;
      ctx.setLineDash([4 * ratio, 4 * ratio]);
      ctx.beginPath();
      ctx.moveTo(0, yOf(base));
      ctx.lineTo(w, yOf(base));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    history.forEach(function (p, i) {
      var x = 4 * ratio + (w - 8 * ratio) * ((p.t - t0) / Math.max(1, t1 - t0)),
        y = yOf(p.h);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = style.getPropertyValue('--primary').trim() || '#6750a4';
    ctx.lineWidth = 3 * ratio;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  /* 標高(海抜)を地図のデータで調べる。最初と、60m 以上動いた時だけ */
  function fetchElevation(lat, lon) {
    var at = { lat: lat, lon: lon };
    if (!C.needsElevationOf(elevationAt, at)) return;
    elevationAt = at;
    var seq = ++elevationSeq;
    fetch(C.elevationUrlOf(lat, lon))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (seq !== elevationSeq) return;
        var v = data && data.elevation && data.elevation[0];
        if (!Number.isFinite(v)) throw new Error('標高が入っていません');
        elevationEl.textContent = Math.round(v);
        log('標高を取得しました');
      })
      .catch(function (e) {
        if (seq !== elevationSeq) return;
        elevationAt = null; // 次の測位で取り直す
        statusEl.textContent = '標高を調べられませんでした。通信を確かめてください';
        log.warn('標高を取得できませんでした', e && e.message);
      });
  }

  /* 測位 */
  function onPosition(p) {
    var c = p.coords;
    fetchElevation(c.latitude, c.longitude);
    if (!Number.isFinite(c.altitude)) {
      last = null;
      statusEl.textContent = 'この端末では GPS の高さが取れません(標高だけ出します)';
      if (!loggedFirst) log.warn('GPS の高さが取れませんでした(端末が高さを返しません)');
      loggedFirst = true;
      render();
      return;
    }
    last = { h: c.altitude, a: Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy : null };
    var t = p.timestamp || Date.now();
    history.push({ h: c.altitude, t: t });
    history = C.recentOf(history, t, HISTORY_MS);
    var quality = C.qualityOf(last.a);
    statusEl.textContent =
      quality === 'poor'
        ? '高さの精度が低いので参考値です。空の開けた所で待つと良くなります'
        : quality === 'unknown'
          ? '測っています(この端末は高さの精度を返しません)'
          : '測っています';
    if (!loggedFirst)
      log(
        '測位しました(高さの精度 ' +
          (last.a === null ? '不明' : '±' + Math.round(last.a) + 'm') +
          ')',
      );
    loggedFirst = true;
    render();
  }

  function onError(e) {
    var denied = e && e.code === 1;
    statusEl.textContent = denied
      ? '位置情報の利用が許可されていません。ブラウザの設定で許可してください'
      : '位置情報を取れませんでした。空の開けた所でもう一度試してください';
    log.warn(
      denied ? '位置情報の利用が許可されませんでした' : '位置情報を取れませんでした',
      e && e.message,
    );
    stop();
  }

  function start() {
    var needHttps = Env.requireSecure('位置情報');
    if (needHttps) {
      statusEl.textContent = needHttps;
      return;
    }
    if (!navigator.geolocation) {
      statusEl.textContent = 'この端末・ブラウザは位置情報に対応していません';
      log.warn('この端末・ブラウザは位置情報に対応していません');
      return;
    }
    statusEl.textContent = '位置を取っています…';
    loggedFirst = false;
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
    log('測定を開始しました');
    render();
  }

  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    render();
  }

  startBtn.addEventListener('click', function () {
    ToolKit.vibrate();
    start();
  });
  baseBtn.addEventListener('click', function () {
    if (!last) return;
    base = last.h;
    ToolKit.vibrate();
    log('今の高さを基準にしました');
    render();
  });
  clearBtn.addEventListener('click', function () {
    base = null;
    log('基準を解除しました');
    render();
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('resize', drawChart);

  render();
})();
