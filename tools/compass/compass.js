/* 方位磁石の画面。端末の向きセンサーの方位で文字盤と北を指す針を回し、向いている方角を大きな文字で出す。
   方位の計算は compass-core.js */
(function () {
  'use strict';
  var C = window.CompassCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var dial = $('dial'),
    headingText = $('headingText'),
    dirLabel = $('dirLabel'),
    statusText = $('statusText'),
    startBtn = $('startBtn');
  var NS = 'http://www.w3.org/2000/svg';

  var raw = null /* センサーの最新の方位 */,
    shown = null /* 文字盤に表示している方位(なめらかに追う) */,
    level = { x: 0, y: 0, tilt: 0 },
    source = '',
    gotFirst = false,
    lastFrame = 0,
    lastText = 0,
    warned = false,
    history = []; /* 直近1秒の方位(ぶれの大きさを見る) */

  /* 文字盤を作る: 面、15° ごとの目盛り、東西南北の文字、北を指す細い針 */
  function el(name, attrs, parent, text) {
    var e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) {
      e.setAttribute(k, attrs[k]);
    });
    if (text) e.textContent = text;
    (parent || dial).appendChild(e);
    return e;
  }
  function buildDial() {
    el('circle', { class: 'face', r: 132 });
    for (var d = 0; d < 360; d += 15)
      el('line', {
        class: 'tick' + (d % 45 === 0 ? ' major' : ''),
        x1: 0,
        y1: -126,
        x2: 0,
        y2: d % 45 === 0 ? -115 : -120,
        transform: 'rotate(' + d + ')',
      });
    var CARD = { 0: '北', 90: '東', 180: '南', 270: '西' };
    Object.keys(CARD).forEach(function (a) {
      var g = el('g', { transform: 'rotate(' + a + ')' });
      cards[a] = el(
        'text',
        {
          class: 'card' + (a === '0' ? ' north' : ''),
          x: 0,
          y: -104,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          transform: 'rotate(' + -a + ' 0 -104)',
        },
        g,
        CARD[a],
      );
    });
    el('path', { class: 'needle-north', d: 'M0 -85 L7 0 L-7 0 Z' });
    el('path', { class: 'needle-south', d: 'M0 85 L7 0 L-7 0 Z' });
    el('circle', { class: 'cap', r: 6 });
  }
  var cards = {}; /* 回転中も東西南北の文字を正立させる */

  /* センサーの値を受け取る */
  function screenAngle() {
    var o = screen.orientation;
    return o && typeof o.angle === 'number'
      ? o.angle
      : typeof window.orientation === 'number'
        ? window.orientation
        : 0;
  }
  function onOrientation(e) {
    var r = C.headingOf(e, screenAngle());
    if (!r) return;
    raw = r.heading;
    source = r.source;
    if (shown === null) shown = raw;
    level = C.bubble(e.beta, e.gamma, 10);
    var now = performance.now();
    history.push({ t: now, h: raw });
    while (history.length && history[0].t < now - 1000) history.shift();
    checkAccuracy(e);
    if (!gotFirst) {
      gotFirst = true;
      document.querySelector('.app').classList.add('is-active');
      log(
        '方位を受信しました(' +
          { ios: 'iPhone のコンパス', absolute: '絶対方位', relative: '相対方位' }[source] +
          ' / ' +
          Math.round(raw) +
          '° ' +
          C.dirLabel(raw) +
          ' / 画面の向き ' +
          screenAngle() +
          '°)',
      );
    }
  }

  /* 精度の案内: iPhone の精度が悪い時・相対方位しか無い時・値が細かく揺れ続ける時は、8の字に振る補正を勧める */
  function checkAccuracy(e) {
    var acc = e.webkitCompassAccuracy,
      shake = C.jitter(
        history.map(function (x) {
          return x.h;
        }),
      );
    var bad =
      (typeof acc === 'number' && (acc < 0 || acc > 20)) ||
      source === 'relative' ||
      (history.length > 10 && shake > 6 && level.tilt < 15);
    if (bad) {
      statusText.textContent =
        source === 'relative'
          ? '相対方位です。北の方向は特定できません'
          : '方位が不安定です。端末を8の字に動かしてください';
      statusText.classList.add('warn');
      if (!warned) {
        warned = true;
        log.warn(
          '方位の精度が低いため補正を案内しました(' +
            (source === 'relative'
              ? '相対方位'
              : typeof acc === 'number'
                ? '精度 ' + Math.round(acc) + '°'
                : '揺れ ' + shake.toFixed(1) + '°') +
            ')',
        );
      }
    } else {
      statusText.classList.remove('warn');
      statusText.textContent = level.tilt > 15 ? '端末を水平にしてください' : '';
    }
  }

  /* 描く: 文字盤は表示中の方位をなめらかに追い、数字は少し間引いて書き換える(数字が細かく震えないように) */
  function frame(now) {
    requestAnimationFrame(frame);
    if (raw === null) return;
    var dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    shown = C.follow(shown, raw, dt, 0.12, 0.2);
    dial.setAttribute('transform', 'rotate(' + -shown.toFixed(2) + ')');
    Object.keys(cards).forEach(function (a) {
      cards[a].setAttribute('transform', 'rotate(' + (shown - a).toFixed(2) + ' 0 -104)');
    });
    if (now - lastText > 120) {
      lastText = now;
      var h = Math.round(shown) % 360;
      headingText.textContent = h;
      dirLabel.textContent = C.eightDirectionOf(shown);
    }
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    var name =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(name, onOrientation);
    $('permissionControls').hidden = true;
    statusText.textContent = '端末を水平に持って回してください';
    log('センサーを開始しました(' + name + ')');
    ToolKit.sensor.watchData(
      3000,
      function () {
        return gotFirst;
      },
      function () {
        statusText.textContent =
          '方位のデータが届きません。この端末には方位センサーが無いか、ブラウザが対応していない可能性があります。';
      },
      '方位',
    );
  }
  startBtn.addEventListener('click', async function () {
    startBtn.disabled = true;
    try {
      if (await ToolKit.sensor.permit('orientation')) start();
      else statusText.textContent = 'センサーの利用が許可されませんでした。ブラウザの設定を確認してください。';
    } catch (e) {
      statusText.textContent = 'センサーの許可を取得できませんでした。もう一度お試しください。';
      log.warn('方位センサーの許可に失敗しました', e);
    } finally {
      startBtn.disabled = false;
    }
  });

  function initialize() {
    if (!window.isSecureContext) {
      statusText.textContent = 'センサーの利用にはHTTPS接続が必要です。';
    } else if (typeof window.DeviceOrientationEvent === 'undefined') {
      statusText.textContent = 'この端末・ブラウザは向きセンサーに対応していません。';
    } else if (!window.ToolKit || !ToolKit.sensor) {
      statusText.textContent = 'センサーを準備できませんでした。ページを再読み込みしてください。';
    } else if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      $('permissionControls').hidden = false;
      statusText.textContent = '方位を表示するにはセンサーの許可が必要です';
    } else {
      start();
    }
  }

  buildDial();
  initialize();
  requestAnimationFrame(frame);
})();
