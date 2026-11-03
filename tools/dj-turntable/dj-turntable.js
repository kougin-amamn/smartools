/* ターンテーブル風プレーヤーの画面処理。音の読み出しは dj-turntable-worklet.js、計算は dj-turntable-core.js */
(function () {
  'use strict';
  var K = window.DJCore,
    G = K.GEO;
  var $ = function (id) {
    return document.getElementById(id);
  };

  var tracks = [],
    current = -1,
    loadToken = 0;
  var ctx = null,
    node = null,
    gain = null,
    ready = null;
  var duration = 0,
    peaks = null;
  var view = { pos: 0, cur: 0, at: 0 };
  var motorOn = false,
    armDown = false,
    armDeg = G.restDeg,
    rpm = 33,
    pitch = 0,
    volume = 0.8;
  var raf = 0,
    lastFrame = 0,
    lastMsg = 0,
    lastShown = '';
  var drag = null;

  /* 音の準備(最初の操作の時に 1 回だけ。ブラウザは操作の前に音を出す準備をさせない) */
  function ensureAudio() {
    if (ready) return ready;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !('audioWorklet' in AC.prototype) || typeof AudioWorkletNode === 'undefined') {
      log.warn('このブラウザは音の処理(AudioWorklet)に対応していません');
      return (ready = Promise.reject(new Error('AudioWorklet 非対応')));
    }
    ctx = new AC();
    ready = ctx.audioWorklet.addModule('./dj-turntable-worklet.js').then(function () {
      node = new AudioWorkletNode(ctx, 'turntable-deck', { numberOfInputs: 0, outputChannelCount: [2] });
      node.port.onmessage = onMessage;
      gain = ctx.createGain();
      gain.gain.value = volume;
      node.connect(gain);
      gain.connect(ctx.destination);
      log('音の準備をしました(' + ctx.sampleRate + 'Hz)');
    });
    return ready;
  }

  function send(msg, transfer) {
    if (node) node.port.postMessage(msg, transfer || []);
  }

  function onMessage(e) {
    var m = e.data;
    if (m.t === 'pos') {
      view = { pos: m.pos, cur: m.cur, at: performance.now() };
      lastMsg = view.at;
      kick();
    } else if (m.t === 'ended') {
      onEnded();
    }
  }

  function curPos(now) {
    var p = view.pos + (view.cur * (now - view.at)) / 1000;
    return Math.max(0, Math.min(duration || 0, p));
  }

  /* 画面の更新 */
  function kick() {
    if (!raf) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    raf = 0;
    var pos = curPos(now),
      dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    $('rot').setAttribute(
      'transform',
      'rotate(' + K.platterAngle(pos).toFixed(2) + ' ' + G.cx + ' ' + G.cy + ')'
    );

    var target = armDown ? K.armAngle(duration ? pos / duration : 0) : G.restDeg;
    armDeg += (target - armDeg) * (1 - Math.exp(-dt / 0.22));
    $('arm').setAttribute(
      'transform',
      'translate(' + G.px + ' ' + G.py + ') rotate(' + armDeg.toFixed(2) + ')'
    );

    var txt = K.fmtTime(pos) + ' / ' + K.fmtTime(duration);
    if (txt !== lastShown) {
      lastShown = txt;
      $('timeText').textContent = txt;
    }
    var pct = duration ? (pos / duration) * 100 : 0;
    $('played').style.width = pct + '%';
    $('head').style.left = 'calc(' + pct + '% - 1px)';

    var moving = Math.abs(view.cur) > 1e-3 || drag || Math.abs(target - armDeg) > 0.05 || now - lastMsg < 300;
    if (moving) raf = requestAnimationFrame(frame);
  }

  /* 波形 */
  function drawWave() {
    var c = $('wave'),
      box = c.parentNode,
      dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(box.clientWidth * dpr)),
      h = Math.max(1, Math.round(box.clientHeight * dpr));
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (!peaks) return;
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4a4e7a';
    var n = peaks.length,
      bw = w / n;
    for (var i = 0; i < n; i++) {
      var bh = Math.max(2 * dpr, peaks[i] * (h - 8 * dpr));
      g.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.6), bh);
    }
  }

  /* ラベル(題名は盤と一緒に回る) */
  function setLabel(title) {
    var lines = K.labelLines(title);
    var t = $('labelText');
    t.innerHTML = '';
    lines.forEach(function (s, i) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.setAttribute('x', G.cx);
      el.setAttribute('y', G.cy - 4 + i * 11 - (lines.length === 1 ? -4 : 0));
      el.textContent = s;
      t.appendChild(el);
    });
  }

  function setStatus(s) {
    $('status').textContent = s;
  }

  /* 曲の読み込み */
  function renderList() {
    var ul = $('tracks');
    ul.innerHTML = tracks
      .map(function (t, i) {
        return (
          '<li><button type="button" data-i="' +
          i +
          '" data-log="曲 ' +
          (i + 1) +
          '" class="' +
          (i === current ? 'on' : '') +
          (t.bad ? ' bad' : '') +
          '"><span class="no">' +
          (i + 1) +
          '</span><span class="nm">' +
          ToolKit.esc(K.trackTitle(t.file.name)) +
          '</span></button></li>'
        );
      })
      .join('');
    $('prevBtn').disabled = $('nextBtn').disabled = tracks.length < 2;
  }

  function setPlayUi() {
    $('playBtn').classList.toggle('on', motorOn);
    $('playBtn').setAttribute('aria-pressed', motorOn ? 'true' : 'false');
    $('playBtn').setAttribute('aria-label', motorOn ? '一時停止' : '再生');
    $('playBtn').title = motorOn ? '一時停止' : '再生';
  }

  function factor() {
    return K.speedFactor(rpm, pitch);
  }
  function setMotor(on) {
    motorOn = on;
    send({ t: 'motor', on: on, factor: factor() });
    if (on) armDown = true;
    setPlayUi();
    kick();
  }

  async function loadTrack(i, autoplay) {
    var token = ++loadToken,
      t = tracks[i];
    current = i;
    renderList();
    setMotor(false);
    armDown = false;
    duration = 0;
    peaks = null;
    drawWave();
    $('trackTitle').textContent = K.trackTitle(t.file.name);
    setLabel(K.trackTitle(t.file.name));
    setStatus('読み込み中…');
    kick();
    try {
      await ensureAudio();
    } catch (e) {
      setStatus('このブラウザでは再生できません(AudioWorklet 非対応)');
      return;
    }
    if (ctx.state === 'suspended') ctx.resume();
    var r = await log.step(
      '曲の読み込み',
      async function () {
        var buf = await ctx.decodeAudioData(await t.file.arrayBuffer());
        var chs = [];
        for (var c = 0; c < Math.min(2, buf.numberOfChannels); c++) chs.push(buf.getChannelData(c).slice());
        return {
          chs: chs,
          rate: buf.sampleRate,
          sec: buf.duration,
          peaks: K.peaks(chs[0], chs[1], 600),
        };
      },
      function (v) {
        return K.fmtTime(v.sec) + ' / ' + Math.round((v.chs.length * v.chs[0].length * 4) / 1048576) + 'MB';
      }
    );
    if (token !== loadToken) return;
    if (!r.ok) {
      t.bad = true;
      renderList();
      setStatus('この曲は読み込めませんでした(対応していない形式かもしれません)');
      return;
    }
    var v = r.value;
    duration = v.sec;
    peaks = v.peaks;
    view = { pos: 0, cur: 0, at: performance.now() };
    send(
      { t: 'load', ch: v.chs, rate: v.rate },
      v.chs.map(function (a) {
        return a.buffer;
      })
    );
    drawWave();
    setStatus('');
    if (autoplay) setMotor(true);
    else kick();
  }

  function onEnded() {
    motorOn = false;
    armDown = false;
    setPlayUi();
    log('曲の最後まで再生しました');
    if (current + 1 < tracks.length) loadTrack(current + 1, true);
    else kick();
  }

  function step(d) {
    if (tracks.length < 2) return;
    var n = (current + d + tracks.length) % tracks.length;
    loadTrack(n, motorOn);
  }

  /* 操作 */
  $('fileInput').addEventListener('change', function (e) {
    var files = Array.prototype.filter.call(e.target.files, function (f) {
      return /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|webm)$/i.test(f.name);
    });
    e.target.value = '';
    if (!files.length) {
      log.warn('音楽ファイルが選ばれませんでした');
      return;
    }
    var first = tracks.length;
    files.forEach(function (f) {
      tracks.push({ file: f, bad: false });
    });
    log('曲を追加しました(' + files.length + '曲 / 合計 ' + tracks.length + '曲)');
    renderList();
    if (current < 0) loadTrack(first, false);
  });

  $('tracks').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (b) loadTrack(Number(b.dataset.i), motorOn);
  });

  $('playBtn').onclick = async function () {
    if (current < 0) {
      setStatus('先に曲を選んでください');
      return;
    }
    try {
      await ensureAudio();
    } catch (e) {
      return;
    }
    if (ctx.state === 'suspended') await ctx.resume();
    if (!duration) return;
    setMotor(!motorOn);
    log(
      motorOn
        ? '再生を始めました(' + K.fmtTime(curPos(performance.now())) + ')'
        : '一時停止しました(' + K.fmtTime(curPos(performance.now())) + ')'
    );
  };
  $('cueBtn').onclick = function () {
    if (!duration) return;
    setMotor(false);
    send({ t: 'seek', sec: 0 });
    armDown = true;
    log('曲の頭に戻りました');
    kick();
  };
  $('prevBtn').onclick = function () {
    step(-1);
  };
  $('nextBtn').onclick = function () {
    step(1);
  };

  document.querySelectorAll('.seg-btn').forEach(function (b) {
    b.onclick = function () {
      rpm = Number(b.dataset.rpm);
      document.querySelectorAll('.seg-btn').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
      send({ t: 'motor', on: motorOn, factor: factor() });
      log('回転数を ' + rpm + ' 回転にしました(速さ ' + factor().toFixed(2) + ' 倍)');
    };
  });

  function showPitch() {
    $('pitchVal').textContent = (pitch > 0 ? '+' : '') + pitch.toFixed(1) + '%';
  }
  $('pitch').oninput = function () {
    pitch = Number($('pitch').value);
    showPitch();
    send({ t: 'motor', on: motorOn, factor: factor() });
  };
  $('pitchReset').onclick = function () {
    pitch = 0;
    $('pitch').value = 0;
    showPitch();
    send({ t: 'motor', on: motorOn, factor: factor() });
    log('ピッチを 0% に戻しました');
  };
  $('volume').oninput = function () {
    volume = Number($('volume').value);
    if (gain) gain.gain.value = volume;
  };

  /* 盤を指で回す(スクラッチ)。指の角速度を再生速度にして、止めていれば音も止まり、逆に回せば逆再生になる */
  var hit = $('hit');
  function pointerAngle(e) {
    var r = $('deck').getBoundingClientRect(),
      s = r.width / 400;
    var cx = r.left + G.cx * s,
      cy = r.top + G.cy * s;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  }
  hit.addEventListener('pointerdown', function (e) {
    if (!duration) return;
    hit.setPointerCapture(e.pointerId);
    hit.classList.add('grab');
    drag = { angle: pointerAngle(e), t: performance.now(), rate: 0, timer: 0 };
    send({ t: 'hand', on: true, vel: 0 });
    log('盤に指を置きました');
    kick();
  });
  hit.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now(),
      a = pointerAngle(e);
    var rate = K.scratchRate(K.unwrap(a - drag.angle), (now - drag.t) / 1000);
    drag.rate = drag.rate * 0.4 + rate * 0.6;
    drag.angle = a;
    drag.t = now;
    send({ t: 'hand', on: true, vel: drag.rate });
    clearTimeout(drag.timer);
    drag.timer = setTimeout(function () {
      if (drag) {
        drag.rate = 0;
        send({ t: 'hand', on: true, vel: 0 });
      }
    }, 60);
  });
  function release() {
    if (!drag) return;
    clearTimeout(drag.timer);
    drag = null;
    hit.classList.remove('grab');
    send({ t: 'hand', on: false, vel: 0 });
    log('盤から指を離しました');
    kick();
  }
  hit.addEventListener('pointerup', release);
  hit.addEventListener('pointercancel', release);

  /* 波形を押して再生位置を動かす */
  var seeking = false;
  function seekTo(e) {
    var r = $('waveBox').getBoundingClientRect();
    var sec = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
    send({ t: 'seek', sec: sec });
    armDown = true;
    view = { pos: sec, cur: view.cur, at: performance.now() };
    kick();
  }
  $('waveBox').addEventListener('pointerdown', function (e) {
    if (!duration) return;
    seeking = true;
    $('waveBox').setPointerCapture(e.pointerId);
    seekTo(e);
  });
  $('waveBox').addEventListener('pointermove', function (e) {
    if (seeking) seekTo(e);
  });
  function seekEnd() {
    if (seeking) {
      seeking = false;
      log('再生位置を動かしました(' + K.fmtTime(curPos(performance.now())) + ')');
    }
  }
  $('waveBox').addEventListener('pointerup', seekEnd);
  $('waveBox').addEventListener('pointercancel', seekEnd);

  window.addEventListener('resize', drawWave);
  new MutationObserver(drawWave).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  setPlayUi();
  showPitch();
  renderList();
  setLabel('');
  kick();
  log('起動しました(33回転 / ピッチ 0% / 音量 80%)');
})();
