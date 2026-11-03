/* 方位磁石の画面。端末の向きセンサーの方位で計器風の文字盤を回し、水平の気泡と目標の方位を表示する。
   方位の計算は compass-core.js */
(function () {
  'use strict';
  var C = window.CompassCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var dial = $('dial'),
    bubbleEl = $('bubble'),
    headingText = $('headingText'),
    dirLabel = $('dirLabel'),
    targetTextEl = $('targetText'),
    statusText = $('statusText'),
    startBtn = $('startBtn'),
    targetBtn = $('targetBtn');
  var NS = 'http://www.w3.org/2000/svg';

  var raw = null /* センサーの最新の方位 */,
    shown = null /* 文字盤に表示している方位(なめらかに追う) */,
    target = null /* 目標の方位 */,
    level = { x: 0, y: 0, tilt: 0 },
    source = '',
    gotFirst = false,
    lastFrame = 0,
    lastText = 0,
    warned = false,
    history = []; /* 直近1秒の方位(ぶれの大きさを見る) */

  /* 文字盤を作る: 1°ごとの目盛り(5°・10°は長く)、30°ごとの数字、東西南北と北東などの文字。目標の印もここに入れる */
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
    el('circle', { class: 'face-glow', r: 146 });
    el('circle', { class: 'face', r: 140 });
    for (var d = 0; d < 360; d++) {
      var len = d % 10 === 0 ? 16 : d % 5 === 0 ? 10 : 6,
        cls = d % 10 === 0 ? 't10' + (d === 0 ? ' north' : '') : d % 5 === 0 ? 't5' : 't1';
      el('line', { class: cls, x1: 0, y1: -136, x2: 0, y2: -136 + len, transform: 'rotate(' + d + ')' });
    }
    var CARD = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' },
      INTER = { 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' };
    for (var a = 0; a < 360; a += 15) {
      var g = el('g', { transform: 'rotate(' + a + ')' });
      if (CARD[a] !== undefined)
        el(
          'text',
          {
            class: 'card' + (a === 0 ? ' north' : ''),
            x: 0,
            y: -96,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          },
          g,
          CARD[a]
        );
      else if (INTER[a] !== undefined)
        el(
          'text',
          { class: 'inter', x: 0, y: -98, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
          g,
          INTER[a]
        );
      else if (a % 30 === 0)
        el(
          'text',
          { class: 'num', x: 0, y: -106, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
          g,
          String(a)
        );
    }
    targetMark = el('path', { class: 'target', d: 'M0 -138 L7 -150 L-7 -150 Z', visibility: 'hidden' });
  }
  var targetMark = null;

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
      targetBtn.hidden = false;
      log(
        '方位を受信しました(' +
          { ios: 'iPhone のコンパス', absolute: '絶対方位', relative: '相対方位' }[source] +
          ' / ' +
          Math.round(raw) +
          '° ' +
          C.dirLabel(raw) +
          ' / 画面の向き ' +
          screenAngle() +
          '°)'
      );
    }
  }

  /* 精度の案内: iPhone の精度が悪い時・相対方位しか無い時・値が細かく揺れ続ける時は、8の字に振る補正を勧める */
  function checkAccuracy(e) {
    var acc = e.webkitCompassAccuracy,
      shake = C.jitter(
        history.map(function (x) {
          return x.h;
        })
      );
    var bad =
      (typeof acc === 'number' && (acc < 0 || acc > 20)) ||
      source === 'relative' ||
      (history.length > 10 && shake > 6 && level.tilt < 15);
    if (bad) {
      statusText.textContent =
        source === 'relative'
          ? 'この端末では北の向きが正確に分かりません。端末を8の字にゆっくり振ると良くなることがあります'
          : '方位が不安定です。端末を8の字にゆっくり振って、磁気センサーを補正してください';
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
            ')'
        );
      }
    } else if (statusText.classList.contains('warn') || statusText.textContent) {
      statusText.classList.remove('warn');
      statusText.textContent = level.tilt > 20 ? '端末を水平に近づけると、方位が正確になります' : '';
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
    bubbleEl.setAttribute('cx', (level.x * 26).toFixed(1));
    bubbleEl.setAttribute('cy', (level.y * 26).toFixed(1));
    bubbleEl.classList.toggle('off', level.tilt > 3);
    if (now - lastText > 120) {
      lastText = now;
      var h = Math.round(shown) % 360;
      headingText.textContent = String(h);
      dirLabel.textContent = C.dirLabel(shown);
      if (target !== null) {
        var t = C.targetText(shown, target, 2);
        targetTextEl.textContent = '目標 ' + Math.round(target) + '° ・ ' + t;
        targetTextEl.classList.toggle('on', t === '目標の方位です');
      }
    }
  }

  function start() {
    var name = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(name, onOrientation);
    startBtn.hidden = true;
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
      '方位'
    );
  }
  startBtn.addEventListener('click', async function () {
    ToolKit.vibrate();
    if (await ToolKit.sensor.permit('orientation')) start();
    else
      statusText.textContent =
        typeof DeviceOrientationEvent === 'undefined'
          ? 'この端末・ブラウザは向きセンサーに対応していません。'
          : 'センサーの利用が許可されませんでした。https で開いているか確認してください。';
  });

  /* 目標の方位: 今の向きを目標にして、文字盤に印を付け、ずれを表示する。もう一度押すと解除 */
  targetBtn.addEventListener('click', function () {
    ToolKit.vibrate();
    if (target === null && shown !== null) {
      target = Math.round(shown) % 360;
      targetMark.setAttribute('transform', 'rotate(' + target + ')');
      targetMark.setAttribute('visibility', 'visible');
      targetTextEl.hidden = false;
      targetBtn.textContent = '目標を解除';
      targetBtn.setAttribute('aria-pressed', 'true');
      log('目標の方位を決めました(' + target + '° ' + C.dirLabel(target) + ')');
    } else {
      var was = target;
      target = null;
      targetMark.setAttribute('visibility', 'hidden');
      targetTextEl.hidden = true;
      targetBtn.textContent = 'この方位を目標にする';
      targetBtn.setAttribute('aria-pressed', 'false');
      if (was !== null) log('目標の方位を解除しました(' + was + '°)');
    }
  });

  buildDial();
  requestAnimationFrame(frame);
  log('起動しました(https ' + (window.isSecureContext ? 'あり' : 'なし') + ')');
})();
