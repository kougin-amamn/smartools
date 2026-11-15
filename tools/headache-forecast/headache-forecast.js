/* 頭痛予報の画面。現在地か地名の気圧の予報を Open-Meteo から取り、計算(headache-forecast-core.js)の段階をグラフと文で出す。記録と感じやすさは localStorage */
(function () {
  'use strict';
  var C = window.HeadacheForecastCore;
  var $ = function (id) {
    return document.getElementById(id);
  };
  var statusEl = $('status');
  var cityInput = $('cityInput');
  var searchResults = $('searchResults');
  var RECORDS_KEY = 'headache-forecast-records';
  var SENSITIVITY_KEY = 'headache-forecast-sensitivity';
  var PAST_HOURS = 24;
  var FUTURE_HOURS = 48;
  var LIST_RECORDS = 10;

  var place = null; /* { lat, lon, label } */
  var forecast = null; /* { times, pressures } */
  var hours = [];
  var locateSeq = 0;
  var fetchedAt = 0;

  /* 画面の言語の文(common/i18n.js)。英語の画面では en.json の対応表で訳す */
  function say(text, vars) {
    vars = vars || {};
    return window.I18n
      ? I18n.say(text, vars)
      : text.replace(/\{(\S+?)\}/g, function (m, k) {
          return vars[k];
        });
  }

  /* 保存と読み出し */
  function loadJson(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      log.warn('保存した内容を読めませんでした(初めの状態で始めます)', e);
      return fallback;
    }
  }
  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      log.warn('保存できませんでした(ブラウザの保存領域が使えません)', e);
    }
  }
  var records = loadJson(RECORDS_KEY, []);
  var sensitivity = loadJson(SENSITIVITY_KEY, 'normal');
  if (!C.SENSITIVITY_FACTORS[sensitivity]) sensitivity = 'normal';

  /* 時刻の文字(「今日 15時」「明日 3時」「11/18 9時」) */
  function dayOf(ms) {
    var d = new Date(ms);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diff = Math.round((new Date(ms).setHours(0, 0, 0, 0) - today) / 86400000);
    if (diff === 0) return say('今日');
    if (diff === 1) return say('明日');
    if (diff === -1) return say('昨日');
    return d.getMonth() + 1 + '/' + d.getDate();
  }
  function hourOf(ms) {
    return say('{時}時', { 時: new Date(ms).getHours() });
  }
  function whenOf(ms) {
    return dayOf(ms) + ' ' + hourOf(ms);
  }
  function signed(n) {
    return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(1);
  }

  /* 気圧の予報を取る(過去7日も取り、記録した時の変化を出せるようにする) */
  async function fetchPressure(lat, lon, label) {
    statusEl.textContent = say('取得中…');
    fetchedAt = Date.now();
    var t0 = performance.now();
    try {
      var url =
        'https://api.open-meteo.com/v1/forecast?latitude=' +
        lat +
        '&longitude=' +
        lon +
        '&hourly=surface_pressure&past_days=7&forecast_days=3&timeformat=unixtime&timezone=auto';
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (!data.hourly || !data.hourly.time || !data.hourly.surface_pressure)
        throw new Error('気圧のデータがありません');
      place = { lat: lat, lon: lon, label: label };
      forecast = { times: data.hourly.time, pressures: data.hourly.surface_pressure };
      renderAll();
      statusEl.textContent = '';
      var outlook = C.outlookOf(hours, Date.now());
      log(
        '気圧の予報を取得しました(' +
          forecast.times.length +
          '時間分 / 24時間の見通し ' +
          C.LEVEL_NAMES[outlook.maxLevel] +
          ' / ' +
          Math.round(performance.now() - t0) +
          'ms)',
      );
    } catch (e) {
      log.error('気圧の予報の取得でエラーが発生しました', e);
      statusEl.textContent = say('気圧の予報を取得できませんでした。通信状況を確認してください。');
    }
  }

  function renderAll() {
    if (!forecast) return;
    hours = C.hourlyLevelsOf(forecast.times, forecast.pressures, sensitivity);
    var now = Date.now();
    renderOutlook(C.outlookOf(hours, now));
    renderChart(now);
    renderPeriods(now);
    renderRecords();
  }

  function renderOutlook(outlook) {
    $('placeName').textContent = place.label;
    var badge = $('levelBadge');
    badge.textContent = say(C.LEVEL_NAMES[outlook.maxLevel]);
    badge.className = 'level-badge level-' + outlook.maxLevel;
    var text;
    if (!outlook.maxLevel) text = say('24時間以内に大きな気圧の低下はありません');
    else if (outlook.firstStart <= Date.now() + 30 * 60 * 1000)
      text = say('今、気圧が下がっています');
    else text = say('{時刻}ごろから気圧が下がります', { 時刻: whenOf(outlook.firstStart) });
    $('outlookText').textContent = text;
    var h = outlook.now;
    $('nowPressure').textContent = h
      ? say('今 {気圧} hPa / 3時間で {差3} / 24時間で {差24}', {
          気圧: Math.round(h.pressure),
          差3: h.drop3 == null ? '-' : signed(-h.drop3),
          差24: h.drop24 == null ? '-' : signed(-h.drop24),
        })
      : '';
    $('outlookCard').hidden = false;
  }

  /* グラフ: 過去24時間〜48時間先の気圧の線。注意・警戒の時間に帯、今に縦線。触ると値を出す */
  var W = 360;
  var HT = 170;
  var PAD = { left: 34, right: 8, top: 10, bottom: 34 };
  function renderChart(now) {
    var from = now - PAST_HOURS * 3600 * 1000;
    var to = now + FUTURE_HOURS * 3600 * 1000;
    var shown = hours.filter(function (h) {
      return h.time >= from && h.time <= to && h.pressure != null;
    });
    var chart = $('chart');
    if (shown.length < 2) {
      chart.innerHTML = '';
      $('chartCard').hidden = true;
      return;
    }
    var values = shown.map(function (h) {
      return h.pressure;
    });
    var min = Math.floor(Math.min.apply(null, values) - 1);
    var max = Math.ceil(Math.max.apply(null, values) + 1);
    var t0 = shown[0].time;
    var t1 = shown[shown.length - 1].time;
    var x = function (t) {
      return PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    };
    var y = function (v) {
      return PAD.top + ((max - v) / (max - min)) * (HT - PAD.top - PAD.bottom);
    };
    var step = (W - PAD.left - PAD.right) / (shown.length - 1);
    var parts = [];
    shown.forEach(function (h) {
      if (h.level)
        parts.push(
          '<rect class="band level-' +
            h.level +
            '" x="' +
            (x(h.time) - step / 2).toFixed(1) +
            '" y="' +
            PAD.top +
            '" width="' +
            step.toFixed(1) +
            '" height="' +
            (HT - PAD.top - PAD.bottom) +
            '"/>',
        );
    });
    [min, Math.round((min + max) / 2), max].forEach(function (v) {
      parts.push(
        '<line class="grid" x1="' +
          PAD.left +
          '" x2="' +
          (W - PAD.right) +
          '" y1="' +
          y(v).toFixed(1) +
          '" y2="' +
          y(v).toFixed(1) +
          '"/><text class="axis" x="' +
          (PAD.left - 4) +
          '" y="' +
          (y(v) + 3.5).toFixed(1) +
          '" text-anchor="end">' +
          v +
          '</text>',
      );
    });
    shown.forEach(function (h) {
      var hr = new Date(h.time).getHours();
      /* 端の目盛りは切れるので出さない */
      if (hr % 6 || x(h.time) > W - PAD.right - 12 || x(h.time) < PAD.left + 8) return;
      var label = hr === 0 ? dayOf(h.time) : hourOf(h.time);
      parts.push(
        '<text class="axis' +
          (hr === 0 ? ' day' : '') +
          '" x="' +
          x(h.time).toFixed(1) +
          '" y="' +
          (HT - PAD.bottom + 14) +
          '" text-anchor="middle">' +
          ToolKit.esc(label) +
          '</text>',
      );
    });
    var path = shown
      .map(function (h, i) {
        return (i ? 'L' : 'M') + x(h.time).toFixed(1) + ' ' + y(h.pressure).toFixed(1);
      })
      .join(' ');
    parts.push('<path class="line" d="' + path + '"/>');
    parts.push(
      '<line class="now" x1="' +
        x(now).toFixed(1) +
        '" x2="' +
        x(now).toFixed(1) +
        '" y1="' +
        PAD.top +
        '" y2="' +
        (HT - PAD.bottom) +
        '"/>',
    );
    parts.push(
      '<line class="cursor" id="chartCursor" y1="' +
        PAD.top +
        '" y2="' +
        (HT - PAD.bottom) +
        '" visibility="hidden"/><circle class="dot" id="chartDot" r="4" visibility="hidden"/>',
    );
    parts.push('<text class="axis unit" x="2" y="' + (HT - 4) + '">hPa</text>');
    chart.innerHTML =
      '<svg viewBox="0 0 ' +
      W +
      ' ' +
      HT +
      '" role="img" aria-label="' +
      ToolKit.esc(say('気圧のグラフ')) +
      '">' +
      parts.join('') +
      '</svg>';
    chart.onpointerdown = chart.onpointermove = function (e) {
      var svg = chart.firstChild;
      var rect = svg.getBoundingClientRect();
      var px = ((e.clientX - rect.left) / rect.width) * W;
      var i = Math.round((px - PAD.left) / step);
      var h = shown[Math.max(0, Math.min(shown.length - 1, i))];
      var cx = x(h.time).toFixed(1);
      var cursor = $('chartCursor');
      var dot = $('chartDot');
      cursor.setAttribute('x1', cx);
      cursor.setAttribute('x2', cx);
      cursor.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', y(h.pressure).toFixed(1));
      dot.setAttribute('visibility', 'visible');
      $('chartTip').textContent = say('{時刻} {気圧} hPa / 3時間で {差3} / {段階}', {
        時刻: whenOf(h.time),
        気圧: h.pressure.toFixed(1),
        差3: h.drop3 == null ? '-' : signed(-h.drop3),
        段階: C.LEVEL_NAMES[h.level],
      });
    };
    $('chartTip').textContent = say('グラフを触ると、その時間の気圧が出ます');
    $('chartCard').hidden = false;
  }

  /* 注意以上の時間の一覧(今から48時間) */
  function renderPeriods(now) {
    var list = $('periodList');
    var periods = C.periodsOf(hours, now - 30 * 60 * 1000, now + FUTURE_HOURS * 3600 * 1000);
    list.innerHTML = '';
    if (!periods.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = say('48時間以内に注意する時間はありません');
      list.appendChild(li);
      return;
    }
    periods.forEach(function (p) {
      var li = document.createElement('li');
      var end = p.end + 3600 * 1000;
      li.innerHTML =
        '<span class="level-badge small level-' +
        p.level +
        '">' +
        ToolKit.esc(say(C.LEVEL_NAMES[p.level])) +
        '</span><span>' +
        ToolKit.esc(
          say('{開始}〜{終了}', {
            開始: whenOf(p.start),
            終了: dayOf(end) === dayOf(p.start) ? hourOf(end) : whenOf(end),
          }),
        ) +
        '</span><small>' +
        ToolKit.esc(say('3時間で最大 {差} hPa', { 差: signed(-p.maxDrop3) })) +
        '</small>';
      list.appendChild(li);
    });
  }

  /* 記録: 最近の10件と、その時の気圧の変化 */
  function renderRecords() {
    var stats = C.recordStatsOf(records, hours);
    var summary = $('recordSummary');
    if (!records.length)
      summary.textContent = say('頭痛が出た時に押すと、その時の気圧の変化と比べられます');
    else if (!forecast || !stats.matched)
      summary.textContent = say('記録 {数}件', { 数: records.length });
    else
      summary.textContent = say(
        '記録 {数}件。この7日の{合う}件のうち、注意以上の時間だったのは{注意}件です',
        { 数: records.length, 合う: stats.matched, 注意: stats.inCaution },
      );
    var list = $('recordList');
    list.innerHTML = '';
    stats.rows.slice(0, LIST_RECORDS).forEach(function (row, i) {
      var li = document.createElement('li');
      li.setAttribute('data-log-group', '記録 ' + (i + 1));
      var d = new Date(row.time);
      var time =
        d.getMonth() +
        1 +
        '/' +
        d.getDate() +
        ' ' +
        String(d.getHours()).padStart(2, '0') +
        ':' +
        String(d.getMinutes()).padStart(2, '0');
      var detail = row.hour
        ? say('{段階} / 3時間で {差3} / 24時間で {差24} hPa', {
            段階: C.LEVEL_NAMES[row.hour.level],
            差3: row.hour.drop3 == null ? '-' : signed(-row.hour.drop3),
            差24: row.hour.drop24 == null ? '-' : signed(-row.hour.drop24),
          })
        : say('気圧のデータの範囲外');
      li.innerHTML =
        '<span class="time">' +
        time +
        '</span><small>' +
        ToolKit.esc(detail) +
        '</small><button class="remove" data-index="' +
        i +
        '" aria-label="削除" title="削除">×</button>';
      list.appendChild(li);
    });
  }

  $('recordList').addEventListener('click', function (e) {
    var btn = e.target.closest('.remove');
    if (!btn) return;
    if (!confirm(say('この記録を削除しますか?'))) return;
    records.splice(Number(btn.dataset.index), 1);
    saveJson(RECORDS_KEY, records);
    renderRecords();
    log('記録を削除しました(残り ' + records.length + '件)');
  });

  $('recordBtn').addEventListener('click', function () {
    ToolKit.vibrate();
    records = C.addRecord(records, Date.now());
    saveJson(RECORDS_KEY, records);
    renderRecords();
    log('記録を追加しました(' + records.length + '件)');
  });

  /* 感じやすさ */
  function renderSensitivity() {
    Array.prototype.forEach.call($('sensitivity').children, function (b) {
      var on = b.dataset.value === sensitivity;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  $('sensitivity').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.dataset.value === sensitivity) return;
    ToolKit.vibrate();
    sensitivity = b.dataset.value;
    saveJson(SENSITIVITY_KEY, sensitivity);
    renderSensitivity();
    renderAll();
  });

  /* 地名の検索(Open-Meteo の地名検索) */
  async function search() {
    var q = cityInput.value.trim();
    if (!q) {
      log.warn('地名が空のため検索しませんでした');
      return;
    }
    ToolKit.vibrate();
    statusEl.textContent = say('検索中…');
    try {
      var language = window.I18n ? I18n.language : 'ja';
      var res = await fetch(
        'https://geocoding-api.open-meteo.com/v1/search?name=' +
          encodeURIComponent(q) +
          '&count=5&language=' +
          language +
          '&format=json',
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      searchResults.innerHTML = '';
      if (!data.results || !data.results.length) {
        statusEl.textContent = say('該当する地名が見つかりませんでした。');
        log.warn('該当する地名が見つかりませんでした(' + q.length + '文字)');
        searchResults.hidden = true;
        return;
      }
      data.results.forEach(function (r, i) {
        var item = document.createElement('button');
        item.className = 'item';
        item.setAttribute('data-log-group', '検索結果 ' + (i + 1));
        var region = [r.admin1, r.country].filter(Boolean).join(' ');
        item.textContent = r.name + (region ? '(' + region + ')' : '');
        item.addEventListener('click', function () {
          locateSeq++;
          searchResults.hidden = true;
          fetchPressure(r.latitude, r.longitude, r.name);
        });
        searchResults.appendChild(item);
      });
      searchResults.hidden = false;
      statusEl.textContent = '';
      log('地名を検索しました(' + data.results.length + '件)');
    } catch (e) {
      log.error('地名の検索でエラーが発生しました', e);
      statusEl.textContent = say('検索できませんでした。通信状況を確認してください。');
    }
  }
  $('searchBtn').addEventListener('click', search);
  cityInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') search();
  });

  /* 現在地(取得中に地名を選んだ時は、あとから届いた現在地で上書きしない) */
  function locate() {
    var seq = ++locateSeq;
    var needHttps = Env.requireSecure('現在地');
    if (needHttps) {
      statusEl.textContent = say('{理由}。地名で検索してください。', { 理由: needHttps });
      return;
    }
    if (!navigator.geolocation) {
      statusEl.textContent = say(
        'この端末・ブラウザは位置情報に対応していません。地名で検索してください。',
      );
      log.warn('この端末・ブラウザは位置情報に対応していません');
      return;
    }
    statusEl.textContent = say('現在地を取得中…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        if (seq !== locateSeq) return;
        log('現在地を取得しました(精度 約' + Math.round(pos.coords.accuracy) + 'm)');
        /* 気圧は数km ずれても変わらないので、位置は 0.01 度(約1km)に丸めて送る */
        fetchPressure(
          Math.round(pos.coords.latitude * 100) / 100,
          Math.round(pos.coords.longitude * 100) / 100,
          '📍 ' + say('現在地'),
        );
      },
      function (e) {
        if (seq !== locateSeq) return;
        var denied = e && e.code === 1;
        statusEl.textContent = denied
          ? say('位置情報の利用が許可されていません。地名で検索してください。')
          : say('位置情報を取得できませんでした。地名で検索してください。');
        log.warn(
          denied
            ? '位置情報の利用が許可されませんでした'
            : '現在地を取得できませんでした(時間切れか、電波が届きません)',
          e && e.message,
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }
  $('useLocationBtn').addEventListener('click', function () {
    ToolKit.vibrate();
    locate();
  });

  /* 画面に戻った時に「今」の位置と見通しを直す(取り直しは30分以上たった時だけ) */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !place) return;
    if (Date.now() - fetchedAt > 30 * 60 * 1000) fetchPressure(place.lat, place.lon, place.label);
    else renderAll();
  });

  renderSensitivity();
  renderRecords();
  log.started('現在地から表示します(感じやすさ ' + sensitivity + ')');
  locate();
})();
