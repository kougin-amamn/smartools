/* 端末・ブラウザ・接続の状態を調べる(window.Env。全ページ共通で log.js の次、site.js より先に読む)。
   設計は docs/design/env.md。UA の読み取りは DOM を使わない関数にして Node でもテストできるようにしている */
(function () {
  'use strict';
  /* メッセージの一覧({…} の所に log.format で値を入れる) */
  var MSG = Object.freeze({
    needSecure: '{用途}の利用には https 接続が必要です',
    needSecureLog: 'https 接続でないため、{用途}を使えませんでした',
  });

  /* 判定(Node でもテストする)
     platform は navigator.userAgentData.platform。「PC版サイト」表示の Android Chrome は UA が Linux になるが、
     platform は Android のままなので優先する。iPadOS 13 以降の Safari は UA が Mac と同じになるため、タッチで見分ける */
  var PLATFORM = {
    Android: 'Android',
    'Chrome OS': 'ChromeOS',
    ChromeOS: 'ChromeOS',
    Windows: 'Windows',
    macOS: 'macOS',
  };
  function osOf(ua, platform, touchPoints) {
    ua = ua || '';
    if (platform && PLATFORM[platform]) return PLATFORM[platform];
    if (/iPhone|iPod/.test(ua)) return 'iOS';
    if (/iPad/.test(ua)) return 'iPadOS';
    if (/Android/.test(ua)) return 'Android';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Macintosh|Mac OS X/.test(ua)) return touchPoints > 1 ? 'iPadOS' : 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return '不明';
  }
  /* Chrome 系の UA は Safari の文字も含み、Edge・Samsung Internet は Chrome の文字も含むため、この順に見る */
  function browserOf(ua) {
    ua = ua || '';
    if (/EdgA?\/|EdgiOS\//.test(ua)) return 'Edge';
    if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
    if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
    if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return '不明';
  }
  /* 相手に見せる大まかな端末名(機種名など個人に近い情報は使わない) */
  function deviceNameOf(os, browser) {
    var device = os === 'iOS' ? 'iPhone' : os === 'iPadOS' ? 'iPad' : os === '不明' ? '端末' : os;
    return browser && browser !== '不明' ? device + ' ' + browser : device;
  }

  var core = { MSG: MSG, osOf: osOf, browserOf: browserOf, deviceNameOf: deviceNameOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof window === 'undefined') return;

  /* この端末の値 */
  var log =
    window.log ||
    function () {
      /* log.js が無い時は記録しない */
    };
  var format =
    log.format ||
    function (text, vals) {
      return text.replace(/\{([^{}]+)\}/g, function (m, k) {
        return vals && vals[k] != null ? String(vals[k]) : '';
      });
    };
  var nav = navigator,
    uad = nav.userAgentData,
    os = osOf(nav.userAgent, uad && uad.platform, nav.maxTouchPoints || 0),
    browser = browserOf(nav.userAgent),
    osVersion = '';
  /* OS の版番号は Chromium 系だけが後から教えてくれる。Windows の版番号は表示と対応しないため Android だけ使う */
  var ready =
    uad && uad.getHighEntropyValues
      ? uad.getHighEntropyValues(['platformVersion']).then(
          function (v) {
            if (os === 'Android' && v.platformVersion) osVersion = v.platformVersion.split('.')[0];
          },
          function (e) {
            if (log.debug) log.debug('OS の版番号を取得できませんでした(' + (e && e.message) + ')');
          },
        )
      : Promise.resolve();

  function isSecure() {
    return !!window.isSecureContext;
  }
  function canStore() {
    try {
      localStorage.setItem('site-probe', '1');
      localStorage.removeItem('site-probe');
      return true;
    } catch (e) {
      return false;
    }
  }
  function timeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '不明';
    } catch (e) {
      return '不明';
    }
  }
  function network() {
    return (nav.connection && nav.connection.effectiveType) || '';
  }
  function yesNo(v) {
    return v ? 'あり' : 'なし';
  }

  window.Env = {
    os: function () {
      return os;
    },
    osVersion: function () {
      return osVersion;
    },
    browser: function () {
      return browser;
    },
    deviceName: function () {
      return deviceNameOf(os, browser);
    },
    isSecure: isSecure,
    /* https なら ''。違えば画面に出す文を返し、警告のログを残す */
    requireSecure: function (purpose) {
      if (isSecure()) return '';
      if (log.warn) log.warn(format(MSG.needSecureLog, { 用途: purpose }));
      return format(MSG.needSecure, { 用途: purpose });
    },
    canVibrate: function () {
      return typeof nav.vibrate === 'function';
    },
    isOnline: function () {
      return nav.onLine !== false;
    },
    network: network,
    canStore: canStore,
    language: function () {
      return nav.language || '不明';
    },
    timeZone: timeZone,
    screenSize: function () {
      return { height: screen.height, width: screen.width };
    },
    viewSize: function () {
      return { height: innerHeight, width: innerWidth };
    },
    pixelRatio: function () {
      return window.devicePixelRatio || 1;
    },
    orientation: function () {
      return innerWidth > innerHeight ? '横向き' : '縦向き';
    },
    /* 環境情報の画面に出す行([見出し, 値])。向きや通信は変わるため、呼ぶたびに読み直す */
    rows: function () {
      var net = network();
      return [
        ['OS', os + (osVersion ? ' ' + osVersion : '')],
        ['ブラウザ', browser],
        ['画面(縦×横)', screen.height + '×' + screen.width + 'px'],
        ['画面の倍率', String(window.devicePixelRatio || 1)],
        ['表示領域(縦×横)', innerHeight + '×' + innerWidth + 'px'],
        ['向き', innerWidth > innerHeight ? '横向き' : '縦向き'],
        ['https', yesNo(isSecure())],
        [
          '通信',
          (nav.onLine !== false ? 'オンライン' : 'オフライン') + (net ? '(' + net + ')' : ''),
        ],
        ['言語', nav.language || '不明'],
        ['タイムゾーン', timeZone()],
        ['振動', yesNo(typeof nav.vibrate === 'function')],
        ['保存領域', canStore() ? '使える' : '使えない'],
      ];
    },
    ready: ready,
    MSG: MSG,
  };
})();
