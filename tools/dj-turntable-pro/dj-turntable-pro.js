/* DJターンテーブルの起動と各部のつなぎ(設定・曲の一覧・読み込み・描画の繰り返し・キーボード・保存)。
   dj-turntable-pro-core / textures / engine / deck-view / mixer-view / wave-view と common の log・ToolKit・Env を使う */
(function () {
  'use strict';
  var K = window.DJCore;
  var MAX_SECONDS = 15 * 60;
  /* 並べ方の隙間と、縦向きでミキサーに残す最低の高さ(CSS と合わせる) */
  var GAP = 6,
    MIXER_MIN = 340;
  var SETTINGS_KEY = 'dj-turntable-pro-settings',
    TRACKS_KEY = 'dj-turntable-pro-tracks';
  var DEFAULTS = {
    pitchRange: 8,
    startSeconds: 0.7,
    brakeSeconds: 0.6,
    slipmat: true,
    curve: 'smooth',
    use78: false,
    waves: true,
  };
  var MSG = {
    unsupported: 'このブラウザは音の処理(AudioWorklet)に対応していないため、鳴らせません',
    tooLong: '曲が長すぎるため読み込めません(15分まで)',
  };

  var $ = function (id) {
    return document.getElementById(id);
  };
  var settings = Object.assign({}, DEFAULTS, readJson(SETTINGS_KEY, {}));
  var tracks = readJson(TRACKS_KEY, {});
  var engine = new DJEngine();
  var library = [];
  var libraryDeck = 0;

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      log.warn('設定を保存できませんでした', e);
    }
  }

  /* 音の部品は最初の操作の中で作る */
  var warned = false;
  function ensure() {
    if (engine.ready) return true;
    var secure = Env.requireSecure('音の処理');
    if (secure || !DJEngine.isSupported()) {
      if (!warned) {
        warned = true;
        if (!secure) log.warn(MSG.unsupported);
        $('status').textContent = secure || MSG.unsupported;
      }
      return false;
    }
    engine.start().then(
      function (e) {
        mixer.applyTo(e);
        sendSettings();
        decks.forEach(function (d) {
          d.sendSpeed();
        });
        log(
          '音の準備をしました(' +
            e.context.sampleRate +
            'Hz / 遅れ ' +
            Math.round((e.context.baseLatency || 0) * 1000) +
            'ms)',
        );
      },
      function (err) {
        log.error('音の部品の準備でエラーが発生しました', err);
        $('status').textContent = '音の準備ができませんでした';
      },
    );
    return true;
  }

  engine.onMessage = function (m) {
    var d = decks[m.deck];
    if (!d) return;
    if (m.type === 'state') d.applyState(m, performance.now());
    else if (m.type === 'ended') {
      d.motorOn = false;
      d.ui.start.setAttribute('aria-pressed', 'false');
      log('デッキ ' + d.letter + ' の曲が終わりました');
    }
    request();
  };

  function sendSettings() {
    engine.send({
      type: 'settings',
      startSeconds: settings.startSeconds,
      brakeSeconds: settings.brakeSeconds,
      slipmat: settings.slipmat,
    });
  }

  /* デッキ・ミキサー・波形 */
  var host = {
    settings: settings,
    send: function (m) {
      engine.send(m);
    },
    ensure: ensure,
    openLibrary: openLibrary,
    save: saveTrack,
    request: request,
  };
  var template = $('deckTemplate');
  var decks = ['deckA', 'deckB'].map(function (id, i) {
    var slot = $(id);
    slot.appendChild(template.content.cloneNode(true));
    return new DJDeckView(slot.querySelector('.deck'), i, host);
  });
  var mixer = new DJMixerView($('mixer'), host);
  var waves = new DJWaveView($('waves'), function (deck, t) {
    if (!decks[deck].track) return;
    decks[deck].seek(t, 'keep');
    log('デッキ ' + decks[deck].letter + ' の針を落としました(' + K.formatTime(t) + ')');
    request();
  });

  /* 曲の保存(キュー・ホットキュー・BPM。曲の中身は保存しない) */
  function saveTrack(deck) {
    var t = deck.track;
    tracks[t.key] = {
      bpm: t.bpm,
      firstBeat: t.firstBeat,
      cue: t.cue,
      hotCues: t.hotCues,
      used: Date.now(),
    };
    tracks = K.pruneTracks(tracks, 200);
    writeJson(TRACKS_KEY, tracks);
    request();
  }

  /* 曲の一覧(シート) */
  var sheet = $('library');
  function openLibrary(deck) {
    libraryDeck = deck;
    $('libraryTitle').textContent = '曲の一覧(デッキ ' + (deck ? 'B' : 'A') + ' へ)';
    sheet.hidden = false;
    $('libraryClose').focus();
    log('曲の一覧を開きました');
  }
  function closeLibrary() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    log('曲の一覧を閉じました');
  }
  $('libraryClose').addEventListener('click', closeLibrary);
  sheet.addEventListener('click', function (e) {
    if (e.target === sheet) closeLibrary();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLibrary();
  });

  $('fileInput').addEventListener('change', function () {
    var files = Array.from(this.files || []).filter(function (f) {
      return /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(f.name);
    });
    this.value = '';
    if (!files.length) return log.warn('音楽ファイルが選ばれませんでした');
    files.forEach(function (f) {
      library.push({ file: f, title: K.titleOf(f.name) });
    });
    showLibrary();
    log('曲を一覧に足しました(' + files.length + '曲 / 合計 ' + library.length + '曲)');
  });

  function showLibrary() {
    var list = $('tracks');
    list.innerHTML = library
      .map(function (t, i) {
        return (
          '<li data-log-group="曲 ' +
          (i + 1) +
          '"><span class="track-name">' +
          ToolKit.esc(t.title) +
          '</span><button type="button" class="pill small" data-load="' +
          i +
          '" data-deck="0">A に読む</button><button type="button" class="pill small" data-load="' +
          i +
          '" data-deck="1">B に読む</button></li>'
        );
      })
      .join('');
    $('libraryEmpty').hidden = library.length > 0;
  }
  $('tracks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-load]');
    if (b) loadTrack(Number(b.dataset.deck), library[Number(b.dataset.load)]);
  });

  /* 解析は Web Worker で(画面を止めない) */
  var worker = null,
    jobs = {},
    nextJob = 1;
  function analyzeOf(input) {
    if (!worker) {
      worker = new Worker('./dj-turntable-pro-analysis.js');
      worker.onmessage = function (e) {
        var job = jobs[e.data.id];
        delete jobs[e.data.id];
        if (job) job.ok(e.data);
      };
      worker.onerror = function (e) {
        Object.keys(jobs).forEach(function (id) {
          jobs[id].ng(new Error(e.message || '解析が止まりました'));
          delete jobs[id];
        });
      };
    }
    return new Promise(function (ok, ng) {
      var id = nextJob++;
      jobs[id] = { ok: ok, ng: ng };
      worker.postMessage({ id: id, mono: input.mono, rate: input.rate }, [input.mono.buffer]);
    });
  }

  async function loadTrack(index, entry) {
    closeLibrary();
    if (!entry || !ensure()) return;
    var deck = decks[index];
    deck.say('曲を展開しています…');
    var r = await log.step(
      'デッキ ' + deck.letter + ' への曲の読み込み',
      async function () {
        await engine.ready;
        var audio = await engine.decode(entry.file);
        if (audio.duration > MAX_SECONDS) return { tooLong: true, duration: audio.duration };
        deck.say('波形と BPM を解析しています…');
        var a = await analyzeOf(engine.load(index, audio));
        var key = K.trackKeyOf(entry.file.name, entry.file.size, audio.duration);
        var saved = tracks[key] || {};
        return {
          key: key,
          title: entry.title,
          duration: audio.duration,
          bpm: a.bpm,
          firstBeat: a.firstBeat,
          silences: a.silences,
          points: a.points,
          cue: saved.cue || 0,
          hotCues: saved.hotCues || [null, null, null, null],
        };
      },
      function (v) {
        return v.tooLong
          ? '長すぎる曲'
          : K.formatTime(v.duration) + ' / ' + (v.bpm ? v.bpm.toFixed(1) + ' BPM' : 'BPM 不明');
      },
    );
    if (!r.ok) return deck.say('曲を読み込めませんでした(形式を確かめてください)');
    if (r.value.tooLong) {
      log.warn(MSG.tooLong + '(' + K.formatTime(r.value.duration) + ')');
      return deck.say(MSG.tooLong);
    }
    deck.say('');
    deck.setTrack(r.value);
    waves.setTrack(index, r.value);
    saveTrack(deck);
  }

  /* 画面の大きさ: 盤が入りきる一番大きな本体の幅を決める */
  function fit() {
    var content = document.querySelector('.content'),
      style = getComputedStyle(content);
    var landscape = window.innerWidth > window.innerHeight;
    var width =
        content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height =
        content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    $('waves').style.height = '';
    var wavesH = settings.waves ? $('waves').offsetHeight + GAP : 0;
    var deck = decks[0],
      extraW = deck.el.offsetWidth - deck.ui.plinth.offsetWidth,
      extraH = deck.el.offsetHeight - deck.ui.plinth.offsetHeight;
    var ratio = K.PLINTH.width / K.PLINTH.height,
      w;
    if (landscape) {
      w = Math.min(
        (width - $('mixer').offsetWidth - GAP * 2) / 2 - extraW,
        (height - wavesH - extraH) * ratio,
      );
    } else {
      /* 縦向きも2台を左右に並べ、下の残りをミキサーにする */
      w = Math.min(
        (width - GAP) / 2 - extraW,
        (height - wavesH - extraH - MIXER_MIN - GAP) * ratio,
      );
    }
    w = Math.round(K.clamp(w, 140, 520));
    document.documentElement.style.setProperty('--plinth', w + 'px');
    /* 横向きで高さが余る時(タブレット)は、余りを波形に回す */
    if (landscape && settings.waves) {
      var free = height - extraH - w / ratio - GAP;
      $('waves').style.height = Math.round(K.clamp(free, 44, 240)) + 'px';
    }
    decks.forEach(function (d) {
      d.setSize(w);
    });
    waves.resize();
    request();
  }
  var fitTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fit, 120);
  });

  /* 描画の繰り返し。動く物が無ければ止める */
  var frameId = 0,
    lastFrame = 0;
  function request() {
    if (!frameId && !document.hidden) frameId = requestAnimationFrame(frame);
  }
  function frame(now) {
    frameId = 0;
    var dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    var active = false;
    decks.forEach(function (d) {
      if (d.render(now, dt)) active = true;
    });
    if (settings.waves) waves.render([decks[0].positionAt(now), decks[1].positionAt(now)]);
    if (mixer.render(now)) active = true;
    if (active) request();
    else lastFrame = 0;
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) request();
  });

  /* 設定 */
  var fields = {
    pitchRange: Number,
    startSeconds: Number,
    brakeSeconds: Number,
    slipmat: function (v) {
      return v === 'true';
    },
    curve: String,
    use78: function (v) {
      return v === 'true';
    },
    waves: function (v) {
      return v === 'true';
    },
  };
  Object.keys(fields).forEach(function (name) {
    var el = $('set-' + name);
    el.value = String(settings[name]);
    el.addEventListener('change', function () {
      settings[name] = fields[name](el.value);
      writeJson(SETTINGS_KEY, settings);
      applySettings();
    });
  });
  function applySettings() {
    decks.forEach(function (d) {
      d.applyPitchRange();
      d.el.querySelector('[data-rpm="78"]').hidden = !settings.use78;
      if (!settings.use78 && d.rpm === 78) d.setRpm(33);
      d.el.querySelector('.pitch-scale').textContent = '±' + settings.pitchRange;
    });
    sendSettings();
    mixer.setCrossfader(mixer.values.crossfader);
    $('waves').hidden = !settings.waves;
    fit();
  }

  /* キーボード(パソコン) */
  var KEYS = {
    q: [0, 'start'],
    p: [1, 'start'],
    a: [0, 'cue'],
    l: [1, 'cue'],
    1: [0, 'hot', 0],
    2: [0, 'hot', 1],
    3: [0, 'hot', 2],
    4: [0, 'hot', 3],
    7: [1, 'hot', 0],
    8: [1, 'hot', 1],
    9: [1, 'hot', 2],
    0: [1, 'hot', 3],
    z: [0, 'nudge', -0.02],
    x: [0, 'nudge', 0.02],
    ',': [1, 'nudge', -0.02],
    '.': [1, 'nudge', 0.02],
  };
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))
      return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      mixer.setCrossfader(mixer.values.crossfader + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
      return e.preventDefault();
    }
    var k = KEYS[e.key.toLowerCase()];
    if (!k || e.repeat) return;
    var d = decks[k[0]];
    if (k[1] === 'start') d.toggleMotor();
    else if (k[1] === 'cue') d.pressCue();
    else if (k[1] === 'hot') d.pressHotCue(k[2]);
    else if (ensure()) d.send({ type: 'nudge', amount: k[2] });
    request();
  });
  document.addEventListener('keyup', function (e) {
    var k = KEYS[e.key.toLowerCase()];
    if (k && k[1] === 'nudge') decks[k[0]].send({ type: 'nudge', amount: 0 });
  });

  /* 長押しのメニューを出さない(盤を押さえ続けるスクラッチやホットキューの長押しと重なるため) */
  document.querySelector('.app').addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });
  applySettings();
  decks.forEach(function (d) {
    d.setRpm(33);
  });
  log.started(
    'ピッチ ±' +
      settings.pitchRange +
      '% / 起動 ' +
      settings.startSeconds +
      '秒 / ブレーキ ' +
      settings.brakeSeconds +
      '秒 / ' +
      (settings.slipmat ? 'スリップマット' : '直結'),
  );
})();
