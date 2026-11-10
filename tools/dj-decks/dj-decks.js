/* DJデッキの画面と音。音は common/turntable-worklet.js(Toolbox Pro の DJターンテーブル Pro と同じ部品。モーター・指のばね・スリップマット)が2台分を鳴らし、
   ここで Web Audio のミキサーにつなぐ。計算は dj-decks-core.js(DjDecksCore)。設計: docs/design/dj-decks.md */
(function () {
  'use strict';
  var C = window.DjDecksCore;
  var $ = function (id) {
    return document.getElementById(id);
  };
  var statusEl = $('status');
  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  var PEAK_COUNT = 800;

  var audioContext = null,
    node = null,
    ready = null,
    queue = [],
    mixer = null; /* { channels: [A, B], eq: [low, mid, hi], filter, wet, master } */
  var effects = { filter: false, echo: false };
  var decks = [];

  function isSupported() {
    return (
      !!AudioContextClass &&
      'audioWorklet' in AudioContextClass.prototype &&
      typeof AudioWorkletNode !== 'undefined'
    );
  }

  /* 音の処理を始める(押した時の中で呼ぶ。AudioContext は利用者の操作の中で作る決まり)。
     worklet の出力 A・B → チャンネル(音量×クロスフェーダー)→ 混ぜる → LOW → MID → HI → FILTER → MASTER → スピーカー
                                                                              └→ ECHO(遅れ⇄戻り)→ MASTER */
  function startAudio() {
    if (ready) return ready;
    audioContext = new AudioContextClass({ latencyHint: 'interactive' });
    ready = audioContext.audioWorklet
      .addModule('../../common/turntable-worklet.js')
      .then(build)
      .catch(function (err) {
        statusEl.textContent = '音の処理を始められませんでした。ページを読み込み直してください。';
        log.error('音の処理の開始でエラーが発生しました', err);
        throw err;
      });
    return ready;
  }
  function build() {
    var c = audioContext;
    node = new AudioWorkletNode(c, 'turntable-decks', {
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    node.port.onmessage = function (e) {
      receive(e.data);
    };
    var bus = c.createGain();
    var channels = [c.createGain(), c.createGain()];
    channels.forEach(function (g, i) {
      node.connect(g, i, 0);
      g.connect(bus);
    });
    var low = c.createBiquadFilter(),
      mid = c.createBiquadFilter(),
      hi = c.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 180;
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    hi.type = 'highshelf';
    hi.frequency.value = 5000;
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    var delay = c.createDelay(1),
      feedback = c.createGain(),
      wet = c.createGain();
    delay.delayTime.value = 0.28;
    feedback.gain.value = 0.35;
    wet.gain.value = 0;
    var master = c.createGain();
    bus.connect(low);
    low.connect(mid);
    mid.connect(hi);
    hi.connect(filter);
    filter.connect(master);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    master.connect(c.destination);
    mixer = { channels: channels, eq: [low, mid, hi], filter: filter, wet: wet, master: master };
    applyMixer();
    queue.forEach(function (q) {
      node.port.postMessage(q.message, q.transfer);
    });
    queue = [];
  }
  /* worklet へ送る。まだ準備中なら、できた時に順に送る */
  function send(message, transfer) {
    if (node) node.port.postMessage(message, transfer || []);
    else queue.push({ message: message, transfer: transfer || [] });
  }
  /* worklet から: state(約 30 回/秒の位置・速さ・モーター)と ended(曲の終わり) */
  function receive(m) {
    var d = decks[m.deck];
    if (!d) return;
    if (m.type === 'state') {
      d.pos = m.pos;
      d.speed = m.speed;
      d.motor = m.motor;
      d.posAt = performance.now();
      showPlay(d);
      animate();
    } else if (m.type === 'ended') {
      if (d.loop) send({ type: 'seek', deck: d.index, pos: 0, mode: 'start' });
      else {
        d.motor = false;
        showPlay(d);
      }
    }
  }

  /* ミキサーのつまみを音に当てる */
  function applyMixer() {
    if (!mixer) return;
    var x = C.crossfadeGainsOf(Number($('cross').value) / 100);
    mixer.channels[0].gain.value = Number($('gainA').value) * x.a;
    mixer.channels[1].gain.value = Number($('gainB').value) * x.b;
    mixer.master.gain.value = Number($('master').value);
    ['low', 'mid', 'hi'].forEach(function (id, i) {
      mixer.eq[i].gain.value = Number($(id).value);
    });
    mixer.filter.frequency.value = effects.filter ? 900 : 20000;
    mixer.wet.gain.value = effects.echo ? 0.5 : 0;
  }

  /* デッキ */
  function makeDeck(key, index) {
    var d = {
      key: key,
      index: index,
      loaded: false,
      duration: 0,
      pos: 0,
      speed: 0,
      motor: false,
      posAt: 0,
      peaks: null,
      hot: null,
      loop: false,
      grab: null,
    };
    var el = function (name) {
      return $(name + key);
    };
    d.el = el;
    decks.push(d);

    el('load').addEventListener('click', function () {
      startAudio();
      el('file').click();
    });
    el('file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (file) load(d, file);
    });
    el('play').addEventListener('click', function () {
      if (!d.loaded) {
        startAudio();
        el('file').click();
        return;
      }
      audioContext.resume();
      d.motor = !d.motor;
      send({ type: 'motor', deck: index, on: d.motor });
      showPlay(d);
      animate();
    });
    el('cue').addEventListener('click', function () {
      if (d.loaded) seek(d, 0, 'stop');
    });
    el('back').addEventListener('click', function () {
      if (d.loaded) seek(d, 0, 'keep');
    });
    el('loop').addEventListener('click', function () {
      d.loop = !d.loop;
      setToggle(el('loop'), d.loop, 'LOOP ON', 'LOOP OFF');
    });
    el('hot').addEventListener('click', function () {
      if (!d.loaded) return;
      if (d.hot === null) {
        d.hot = positionOf(d);
        setToggle(el('hot'), true, 'CUE SET', 'HOT CUE');
        log(`ホットキューを覚えました(デッキ${key} / ${C.formatTime(d.hot)})`);
      } else seek(d, d.hot, 'keep');
    });
    el('seek').addEventListener('input', function (e) {
      if (d.duration) seek(d, (Number(e.target.value) / 1000) * d.duration, 'keep');
    });
    el('pitch').addEventListener('input', function (e) {
      var p = Number(e.target.value);
      send({ type: 'speed', deck: index, rpmRatio: 1, pitch: p / 100 });
      el('pitchValue').textContent = el('pitchRead').textContent = p.toFixed(1) + '%';
      el('rate').textContent = C.rateOf(p).toFixed(2) + '×';
    });
    bindScratch(d);
    return d;
  }

  function seek(d, seconds, mode) {
    d.pos = seconds;
    d.posAt = performance.now();
    if (mode === 'stop') d.motor = false;
    send({ type: 'seek', deck: d.index, pos: seconds, mode: mode });
    showPlay(d);
    draw(d);
  }
  /* 今の位置(秒)。worklet の知らせ(約 30 回/秒)の間は、速さから延ばして滑らかにする */
  function positionOf(d) {
    var p = d.pos + (d.speed * (performance.now() - d.posAt)) / 1000;
    return Math.max(0, Math.min(d.duration, p));
  }
  function isMoving(d) {
    return d.motor || Math.abs(d.speed) > 0.001 || !!d.grab;
  }
  function setToggle(button, on, onText, offText) {
    button.textContent = on ? onText : offText;
    button.classList.toggle('active', on);
    if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(on));
  }
  function showPlay(d) {
    d.el('play').textContent = d.motor ? 'Ⅱ PAUSE' : '▶ PLAY';
    d.el('play').classList.toggle('active', d.motor);
  }

  /* 曲を読み込む。展開して波形の山を作り、Int16 にして worklet へ所有ごと渡す */
  function load(d, file) {
    d.loaded = false;
    d.peaks = null;
    d.hot = null;
    d.loop = false;
    d.duration = d.pos = d.speed = 0;
    d.motor = false;
    setToggle(d.el('loop'), false, 'LOOP ON', 'LOOP OFF');
    setToggle(d.el('hot'), false, 'CUE SET', 'HOT CUE');
    showPlay(d);
    d.el('title').textContent = 'LOADING…';
    d.el('fileName').textContent = file.name;
    draw(d);
    startAudio()
      .then(function () {
        return file.arrayBuffer();
      })
      .then(function (buffer) {
        return audioContext.decodeAudioData(buffer);
      })
      .then(function (decoded) {
        var channels = [];
        for (var i = 0; i < Math.min(2, decoded.numberOfChannels); i++)
          channels.push(decoded.getChannelData(i));
        d.peaks = C.peaksOf(channels, PEAK_COUNT);
        var left = C.int16Of(channels[0]),
          right = channels[1] ? C.int16Of(channels[1]) : null;
        send({ type: 'motor', deck: d.index, on: false });
        send(
          { type: 'load', deck: d.index, left: left, right: right, sampleRate: decoded.sampleRate },
          right ? [left.buffer, right.buffer] : [left.buffer],
        );
        send({
          type: 'speed',
          deck: d.index,
          rpmRatio: 1,
          pitch: Number(d.el('pitch').value) / 100,
        });
        d.duration = decoded.duration;
        d.loaded = true;
        d.el('title').textContent = file.name;
        draw(d);
        log(`曲を読み込みました(デッキ${d.key} / ${C.formatTime(d.duration)})`);
      })
      .catch(function (err) {
        d.el('title').textContent = 'この曲は読み込めませんでした';
        log.warn(`曲を読み込めませんでした(デッキ${d.key})`, err);
      });
  }

  /* 1 デッキ分の絵: 盤の角度、時間、シーク、波形 */
  function draw(d) {
    var p = positionOf(d);
    d.el('platter').style.transform = `rotate(${C.platterAngleOf(p)}deg)`;
    d.el('clock').textContent = C.formatTime(p);
    d.el('duration').textContent = C.formatTime(p) + ' / ' + C.formatTime(d.duration);
    d.el('seek').value = d.duration ? (p / d.duration) * 1000 : 0;
    drawWave(d, p);
  }
  /* 波形: 山の高さを中央から上下に描き、再生した所はデッキの色、まだの所は薄く。今の位置に白い線 */
  function drawWave(d, position) {
    var canvas = d.el('wave'),
      ratio = window.devicePixelRatio || 1,
      w = Math.round(canvas.clientWidth * ratio),
      h = Math.round(canvas.clientHeight * ratio);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    var color = getComputedStyle(d.el('deck')).getPropertyValue('--deck').trim();
    var played = d.duration ? (position / d.duration) * w : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(0, h / 2, w, Math.max(1, ratio / 2));
    if (d.peaks) {
      for (var x = 0; x < w; x++) {
        var peak = d.peaks[Math.floor((x / w) * d.peaks.length)] * h * 0.45;
        ctx.fillStyle = x < played ? color : 'rgba(255,255,255,0.28)';
        ctx.fillRect(x, h / 2 - peak, 1, peak * 2 || 1);
      }
    }
    if (d.duration) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.min(w - 2 * ratio, played), 0, 2 * ratio, h);
    }
  }
  /* 動いている間だけ、画面の更新に合わせて描き直す。押さえている盤は、指の角度を毎フレーム送る */
  var animating = false;
  function animate() {
    if (animating) return;
    animating = true;
    (function frame() {
      var busy = false,
        now = performance.now();
      decks.forEach(function (d) {
        if (d.grab)
          send({
            type: 'touch',
            deck: d.index,
            down: true,
            angle: d.grab.total,
            stamp: now / 1000,
          });
        if (isMoving(d)) {
          busy = true;
          draw(d);
        }
      });
      if (busy) requestAnimationFrame(frame);
      else animating = false;
    })();
  }

  /* スクラッチ: なぞった角度を何周目も数えて worklet へ送る。worklet がばねで追い、音がこすれる */
  function bindScratch(d) {
    var wrap = d.el('platterWrap');
    function angleOf(e) {
      var r = wrap.getBoundingClientRect();
      return (
        (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
        Math.PI
      );
    }
    wrap.addEventListener('pointerdown', function (e) {
      if (!d.loaded || d.grab) return;
      wrap.setPointerCapture(e.pointerId);
      audioContext.resume();
      d.grab = { id: e.pointerId, raw: angleOf(e), total: 0 };
      send({ type: 'touch', deck: d.index, down: true, angle: 0, stamp: performance.now() / 1000 });
      animate();
    });
    wrap.addEventListener('pointermove', function (e) {
      var g = d.grab;
      if (!g || e.pointerId !== g.id) return;
      var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (list.length ? list : [e]).forEach(function (p) {
        var raw = angleOf(p);
        g.total += C.unwrapDegrees(raw - g.raw);
        g.raw = raw;
      });
    });
    function release(e) {
      var g = d.grab;
      if (!g || e.pointerId !== g.id) return;
      send({
        type: 'touch',
        deck: d.index,
        down: false,
        angle: g.total,
        stamp: performance.now() / 1000,
      });
      d.grab = null;
    }
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);
  }

  /* ミキサー */
  function bindMixer() {
    ['master', 'gainA', 'gainB', 'cross'].forEach(function (id) {
      $(id).addEventListener('input', applyMixer);
    });
    ['hi', 'mid', 'low'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        $(id + 'Value').textContent = $(id).value + ' dB';
        applyMixer();
      });
    });
    $('filter').addEventListener('click', function () {
      effects.filter = !effects.filter;
      setToggle($('filter'), effects.filter, 'FILTER ON', 'FILTER OFF');
      applyMixer();
    });
    $('echo').addEventListener('click', function () {
      effects.echo = !effects.echo;
      setToggle($('echo'), effects.echo, 'ECHO ON', 'ECHO OFF');
      applyMixer();
    });
    $('stopAll').addEventListener('click', function () {
      decks.forEach(function (d) {
        d.motor = false;
        send({ type: 'motor', deck: d.index, on: false });
        showPlay(d);
      });
    });
    $('resetMix').addEventListener('click', function () {
      $('cross').value = 50;
      $('master').value = 0.85;
      $('gainA').value = $('gainB').value = 0.85;
      ['hi', 'mid', 'low'].forEach(function (id) {
        $(id).value = 0;
        $(id + 'Value').textContent = '0 dB';
      });
      effects.filter = effects.echo = false;
      setToggle($('filter'), false, 'FILTER ON', 'FILTER OFF');
      setToggle($('echo'), false, 'ECHO ON', 'ECHO OFF');
      applyMixer();
      log('ミキサーを最初の値に戻しました');
    });
  }

  /* 始める */
  makeDeck('A', 0);
  makeDeck('B', 1);
  var needHttps = Env.requireSecure('音の処理');
  if (needHttps || !isSupported()) {
    statusEl.textContent =
      needHttps || 'このブラウザは、この DJ に必要な音の処理に対応していません。';
    if (!needHttps) log.warn('このブラウザは AudioWorklet に対応していません');
    document.querySelectorAll('.app button, .app input').forEach(function (el) {
      el.disabled = true;
    });
    return;
  }
  bindMixer();
  window.addEventListener('resize', function () {
    decks.forEach(draw);
  });
  decks.forEach(draw);
  /* ページを離れる時: 音の処理を閉じる。鳴っていた時は停止のログ */
  ToolKit.addCleanup(function () {
    var playing = decks.some(isMoving);
    if (audioContext) audioContext.close();
    audioContext = null;
    return playing;
  }, '曲');
})();
