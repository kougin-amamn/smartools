/* DJデッキの画面と音。2台の <audio> を Web Audio のミキサーにつなぐ。計算は dj-decks-core.js(DjDecksCore)、
   ログ・Env・ToolKit は共通の物を使う。設計: docs/design/dj-decks.md */
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
    mixer = null; /* { bus, eq: [low, mid, hi], filter, delay, feedback, master } */
  var effects = { filter: false, echo: false };
  var decks = {};

  /* 音のつながり
     デッキ → チャンネル(音量×クロスフェーダー)→ 混ぜる → LOW → MID → HI → FILTER → MASTER → スピーカー
                                                                        └→ ECHO(遅れ⇄戻り)→ MASTER */
  function startAudio() {
    if (audioContext) return audioContext;
    audioContext = new AudioContextClass();
    var c = audioContext;
    var bus = c.createGain();
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
    mixer = { bus: bus, eq: [low, mid, hi], filter: filter, wet: wet, master: master };
    Object.keys(decks).forEach(function (k) {
      connectDeck(decks[k]);
    });
    applyMixer();
    return c;
  }
  function connectDeck(d) {
    if (d.channel || !audioContext) return;
    d.source = audioContext.createMediaElementSource(d.audio);
    d.channel = audioContext.createGain();
    d.source.connect(d.channel);
    d.channel.connect(mixer.bus);
  }

  /* ミキサーのつまみを音に当てる */
  function applyMixer() {
    if (!mixer) return;
    var x = C.crossfadeGainsOf(Number($('cross').value) / 100);
    if (decks.A.channel) decks.A.channel.gain.value = Number($('gainA').value) * x.a;
    if (decks.B.channel) decks.B.channel.gain.value = Number($('gainB').value) * x.b;
    mixer.master.gain.value = Number($('master').value);
    ['low', 'mid', 'hi'].forEach(function (id, i) {
      mixer.eq[i].gain.value = Number($(id).value);
    });
    mixer.filter.frequency.value = effects.filter ? 900 : 20000;
    mixer.wet.gain.value = effects.echo ? 0.5 : 0;
  }

  /* デッキ */
  function makeDeck(key) {
    var audio = new Audio();
    audio.preload = 'metadata';
    audio.preservesPitch = audio.webkitPreservesPitch = audio.mozPreservesPitch = false;
    var d = {
      key: key,
      audio: audio,
      url: '',
      peaks: null,
      hot: null,
      scratching: false,
      wasPlaying: false,
      lastAngle: 0,
    };
    var el = function (name) {
      return $(name + key);
    };
    d.el = el;
    decks[key] = d;

    audio.addEventListener('loadedmetadata', function () {
      showTime(d);
      log(`曲を読み込みました(デッキ${key} / ${C.formatTime(audio.duration)})`);
    });
    audio.addEventListener('timeupdate', function () {
      showTime(d);
      if (!isPlaying(d)) drawWave(d);
    });
    audio.addEventListener('play', function () {
      showPlay(d);
      animate();
    });
    audio.addEventListener('pause', function () {
      showPlay(d);
    });
    audio.addEventListener('ended', function () {
      showPlay(d);
    });
    audio.addEventListener('error', function () {
      if (!d.url) return;
      el('title').textContent = 'この曲は読み込めませんでした';
      log.warn(`曲を読み込めませんでした(デッキ${key})`);
    });

    el('load').addEventListener('click', function () {
      el('file').click();
    });
    el('file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (file) load(d, file);
    });
    el('play').addEventListener('click', function () {
      if (!d.url) {
        el('file').click();
        return;
      }
      startAudio();
      if (audioContext.state === 'suspended') audioContext.resume();
      if (isPlaying(d)) audio.pause();
      else
        audio.play().catch(function (err) {
          log.warn(`再生できませんでした(デッキ${key})`, err);
        });
    });
    el('cue').addEventListener('click', function () {
      if (!d.url) return;
      audio.pause();
      audio.currentTime = 0;
    });
    el('back').addEventListener('click', function () {
      if (d.url) audio.currentTime = 0;
    });
    el('loop').addEventListener('click', function () {
      audio.loop = !audio.loop;
      setToggle(el('loop'), audio.loop, 'LOOP ON', 'LOOP OFF');
    });
    el('hot').addEventListener('click', function () {
      if (!d.url) return;
      if (d.hot === null) {
        d.hot = audio.currentTime;
        setToggle(el('hot'), true, 'CUE SET', 'HOT CUE');
        log(`ホットキューを覚えました(デッキ${key} / ${C.formatTime(d.hot)})`);
      } else audio.currentTime = d.hot;
    });
    el('seek').addEventListener('input', function (e) {
      if (audio.duration) audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
    });
    el('pitch').addEventListener('input', function (e) {
      var p = Number(e.target.value);
      audio.playbackRate = C.rateOf(p);
      el('pitchValue').textContent = el('pitchRead').textContent = p.toFixed(1) + '%';
      el('rate').textContent = audio.playbackRate.toFixed(2) + '×';
    });
    bindScratch(d);
    return d;
  }

  function isPlaying(d) {
    return !d.audio.paused && !d.audio.ended;
  }
  function setToggle(button, on, onText, offText) {
    button.textContent = on ? onText : offText;
    button.classList.toggle('active', on);
    if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(on));
  }
  function showPlay(d) {
    var playing = isPlaying(d) || (d.scratching && d.wasPlaying);
    d.el('play').textContent = playing ? 'Ⅱ PAUSE' : '▶ PLAY';
    d.el('play').classList.toggle('active', playing);
    d.el('platter').classList.toggle('spinning', isPlaying(d));
  }
  function showTime(d) {
    var a = d.audio;
    d.el('clock').textContent = C.formatTime(a.currentTime);
    d.el('duration').textContent = C.formatTime(a.currentTime) + ' / ' + C.formatTime(a.duration);
    if (!d.scratching) d.el('seek').value = a.duration ? (a.currentTime / a.duration) * 1000 : 0;
  }

  /* 曲を読み込む。前の曲の URL は解放する。波形は曲を一度だけ解析して作る */
  function load(d, file) {
    startAudio();
    var a = d.audio;
    a.pause();
    if (d.url) URL.revokeObjectURL(d.url);
    d.url = URL.createObjectURL(file);
    d.peaks = null;
    d.hot = null;
    a.loop = false;
    setToggle(d.el('loop'), false, 'LOOP ON', 'LOOP OFF');
    setToggle(d.el('hot'), false, 'CUE SET', 'HOT CUE');
    d.el('title').textContent = 'LOADING…';
    d.el('fileName').textContent = file.name;
    a.src = d.url;
    a.playbackRate = C.rateOf(Number(d.el('pitch').value));
    drawWave(d);
    file
      .arrayBuffer()
      .then(function (buffer) {
        return audioContext.decodeAudioData(buffer);
      })
      .then(function (decoded) {
        var channels = [];
        for (var i = 0; i < decoded.numberOfChannels; i++) channels.push(decoded.getChannelData(i));
        d.peaks = C.peaksOf(channels, PEAK_COUNT);
        d.el('title').textContent = file.name;
        drawWave(d);
      })
      .catch(function (err) {
        d.el('title').textContent = 'この曲は読み込めませんでした';
        log.warn(`曲を読み込めませんでした(デッキ${d.key})`, err);
      });
  }

  /* 波形: 山の高さを中央から上下に描き、再生した所はデッキの色、まだの所は薄く。今の位置に白い線 */
  function drawWave(d) {
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
    var a = d.audio,
      played = a.duration ? (a.currentTime / a.duration) * w : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(0, h / 2, w, Math.max(1, ratio / 2));
    if (d.peaks) {
      for (var x = 0; x < w; x++) {
        var p = d.peaks[Math.floor((x / w) * d.peaks.length)] * h * 0.45;
        ctx.fillStyle = x < played ? color : 'rgba(255,255,255,0.28)';
        ctx.fillRect(x, h / 2 - p, 1, p * 2 || 1);
      }
    }
    if (a.duration) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.min(w - 2 * ratio, played), 0, 2 * ratio, h);
    }
  }
  /* 再生中・スクラッチ中だけ、画面の更新に合わせて波形を描き直す */
  var animating = false;
  function animate() {
    if (animating) return;
    animating = true;
    (function frame() {
      var busy = false;
      Object.keys(decks).forEach(function (k) {
        var d = decks[k];
        if (isPlaying(d) || d.scratching) {
          busy = true;
          drawWave(d);
        }
      });
      if (busy) requestAnimationFrame(frame);
      else animating = false;
    })();
  }

  /* スクラッチ: なぞった角度を秒に直して再生位置を前後させ、離すと元の状態(再生・停止)に戻す */
  function bindScratch(d) {
    var wrap = d.el('platterWrap');
    function angleOf(e) {
      var r = wrap.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    }
    wrap.addEventListener('pointerdown', function (e) {
      if (!d.url) return;
      wrap.setPointerCapture(e.pointerId);
      d.scratching = true;
      d.wasPlaying = isPlaying(d);
      d.lastAngle = angleOf(e);
      d.audio.pause();
      animate();
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!d.scratching) return;
      var angle = angleOf(e),
        a = d.audio;
      var next = a.currentTime + C.secondsOfAngle(angle - d.lastAngle);
      d.lastAngle = angle;
      a.currentTime = Math.max(0, Math.min(a.duration || 0, next));
    });
    function end() {
      if (!d.scratching) return;
      d.scratching = false;
      if (d.wasPlaying) d.audio.play().catch(function () {});
      showPlay(d);
    }
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
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
      Object.keys(decks).forEach(function (k) {
        decks[k].audio.pause();
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
  makeDeck('A');
  makeDeck('B');
  if (!AudioContextClass) {
    statusEl.textContent = 'このブラウザは音の処理に対応していません。';
    log.warn('このブラウザは音の処理(Web Audio)に対応していません');
    document.querySelectorAll('.app button, .app input').forEach(function (el) {
      el.disabled = true;
    });
    return;
  }
  bindMixer();
  window.addEventListener('resize', function () {
    Object.keys(decks).forEach(function (k) {
      drawWave(decks[k]);
    });
  });
  Object.keys(decks).forEach(function (k) {
    drawWave(decks[k]);
  });
  /* ページを離れる時: 曲の URL を解放し、音の処理を閉じる。鳴っていた時は停止のログ */
  ToolKit.addCleanup(function () {
    var playing = false;
    Object.keys(decks).forEach(function (k) {
      var d = decks[k];
      if (isPlaying(d)) playing = true;
      d.audio.pause();
      if (d.url) URL.revokeObjectURL(d.url);
      d.url = '';
    });
    if (audioContext) audioContext.close();
    audioContext = null;
    return playing;
  }, '曲');
})();
