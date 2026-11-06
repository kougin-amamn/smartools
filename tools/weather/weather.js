/* 天気予報の画面。起動時は現在地、地名でも探せる(データは Open-Meteo) */
(function () {
  const cityInput = document.getElementById('cityInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchResults = document.getElementById('searchResults');
  const useLocationBtn = document.getElementById('useLocationBtn');
  const currentCard = document.getElementById('currentCard');
  const placeName = document.getElementById('placeName');
  const currentIcon = document.getElementById('currentIcon');
  const currentTemp = document.getElementById('currentTemp');
  const currentDesc = document.getElementById('currentDesc');
  const currentSub = document.getElementById('currentSub');
  const dailyList = document.getElementById('dailyList');
  const statusText = document.getElementById('statusText');

  const WEATHER_MAP = {
    0: ['快晴', '☀️'],
    1: ['晴れ', '🌤️'],
    2: ['一部くもり', '⛅'],
    3: ['くもり', '☁️'],
    45: ['霧', '🌫️'],
    48: ['霧', '🌫️'],
    51: ['小雨', '🌦️'],
    53: ['雨', '🌦️'],
    55: ['強い雨', '🌧️'],
    56: ['みぞれ', '🌧️'],
    57: ['みぞれ', '🌧️'],
    61: ['小雨', '🌦️'],
    63: ['雨', '🌧️'],
    65: ['大雨', '🌧️'],
    66: ['凍雨', '🌧️'],
    67: ['凍雨', '🌧️'],
    71: ['小雪', '🌨️'],
    73: ['雪', '🌨️'],
    75: ['大雪', '❄️'],
    77: ['雪', '🌨️'],
    80: ['にわか雨', '🌦️'],
    81: ['にわか雨', '🌧️'],
    82: ['激しいにわか雨', '⛈️'],
    85: ['にわか雪', '🌨️'],
    86: ['にわか雪', '❄️'],
    95: ['雷雨', '⛈️'],
    96: ['雷雨(雹)', '⛈️'],
    99: ['雷雨(雹)', '⛈️'],
  };
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];

  function weatherInfo(code) {
    return WEATHER_MAP[code] || ['-', '❓'];
  }

  async function fetchForecast(lat, lon, label) {
    statusText.textContent = '取得中…';
    const t0 = performance.now();
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&wind_speed_unit=ms`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderCurrent(label, data.current);
      renderDaily(data.daily);
      statusText.textContent = '';
      log(
        `天気を取得しました(${label} / ${weatherInfo(data.current.weather_code)[0]} ${Math.round(data.current.temperature_2m)}° / ${data.daily.time.length}日分 / ${Math.round(performance.now() - t0)}ms)`
      );
    } catch (e) {
      log.error('天気の取得でエラーが発生しました', e);
      statusText.textContent = '天気情報を取得できませんでした。通信状況を確認してください。';
    }
  }

  function renderCurrent(label, cur) {
    const [desc, icon] = weatherInfo(cur.weather_code);
    placeName.textContent = label;
    currentIcon.textContent = icon;
    currentTemp.textContent = `${Math.round(cur.temperature_2m)}°`;
    currentDesc.textContent = desc;
    currentSub.textContent = `体感 ${Math.round(cur.apparent_temperature)}° / 湿度 ${cur.relative_humidity_2m}% / 風 ${cur.wind_speed_10m}m/s`;
    currentCard.hidden = false;
  }

  function renderDaily(daily) {
    dailyList.innerHTML = '';
    daily.time.forEach((dateStr, i) => {
      const [desc, icon] = weatherInfo(daily.weather_code[i]);
      const dow = DOW[new Date(dateStr).getDay()];
      const card = document.createElement('div');
      card.className = 'day-card';
      card.innerHTML = `
        <div class="dow">${i === 0 ? '今日' : dow}</div>
        <div class="icon" title="${desc}">${icon}</div>
        <div class="hi">${Math.round(daily.temperature_2m_max[i])}°</div>
        <div class="lo">${Math.round(daily.temperature_2m_min[i])}°</div>
        <div class="pop">☂${daily.precipitation_probability_max[i]}%</div>
      `;
      dailyList.appendChild(card);
    });
  }

  async function search() {
    const q = cityInput.value.trim();
    if (!q) {
      log.warn('地名が空のため検索しませんでした');
      return;
    }
    ToolKit.vibrate();
    statusText.textContent = '検索中…';
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=ja&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      searchResults.innerHTML = '';
      if (!data.results || !data.results.length) {
        statusText.textContent = '該当する地名が見つかりませんでした。';
        log.warn(`該当する地名が見つかりませんでした(${q.length}文字)`);
        searchResults.hidden = true;
        return;
      }
      data.results.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'item';
        const region = [r.admin1, r.country].filter(Boolean).join(' ');
        item.textContent = `${r.name}${region ? '(' + region + ')' : ''}`;
        item.addEventListener('click', () => {
          log(`検索結果の「${r.name}」を押下しました`);
          locateSeq++;
          searchResults.hidden = true;
          fetchForecast(r.latitude, r.longitude, r.name);
        });
        searchResults.appendChild(item);
      });
      searchResults.hidden = false;
      statusText.textContent = '';
      log(`地名を検索しました(${data.results.length}件)`);
    } catch (e) {
      log.error('地名の検索でエラーが発生しました', e);
      statusText.textContent = '検索できませんでした。通信状況を確認してください。';
    }
  }

  searchBtn.addEventListener('click', () => {
    search();
  });
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      log('検索欄でEnterキーを押下しました');
      search();
    }
  });

  /* 現在地の天気を表示する。auto=起動時の自動取得(取得中に地名を選んだ時は、あとから届いた現在地で上書きしない) */
  let locateSeq = 0;
  function locate(auto) {
    const seq = ++locateSeq;
    var needHttps = Env.requireSecure('現在地');
    if (needHttps) {
      statusText.textContent = needHttps + '。地名で検索してください。';
      return;
    }
    if (!navigator.geolocation) {
      statusText.textContent = 'この端末・ブラウザは位置情報に対応していません。地名で検索してください。';
      log.warn('この端末・ブラウザは位置情報に対応していません');
      return;
    }
    statusText.textContent = '現在地を取得中…';
    if (auto) log('起動時に現在地の取得を開始しました');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (seq !== locateSeq) {
          log('現在地が届きましたが、先に地名が選ばれていたため使いませんでした');
          return;
        }
        log(`現在地を取得しました(精度 約${Math.round(pos.coords.accuracy)}m)`);
        fetchForecast(pos.coords.latitude, pos.coords.longitude, '現在地');
      },
      (e) => {
        if (seq !== locateSeq) return;
        const denied = e && e.code === 1;
        statusText.textContent = denied
          ? '位置情報の利用が許可されていません。地名で検索してください。'
          : '位置情報を取得できませんでした。地名で検索してください。';
        log.warn(
          denied
            ? '位置情報の利用が許可されませんでした'
            : '現在地を取得できませんでした(時間切れか、電波が届きません)',
          e && e.message
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 } // 10分以内に取った位置があれば使い、すぐ表示する
    );
  }
  useLocationBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    locate(false);
  });
  log('起動しました(現在地から表示します)');
  locate(true);
})();
