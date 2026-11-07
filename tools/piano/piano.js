/* ピアノの画面と音(Web Audio)。音名・コード・曲・MIDIは piano-core.js */
(function () {
  var P = window.PianoCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var KEY = 'piano-v2';
  var S = { inst: 'piano', vol: 70, rev: true, octs: 2, base: 4, lbl: 'none' };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (sv) for (var k in S) if (sv[k] !== undefined) S[k] = sv[k];
  } catch (e) {
    log.warn('保存した設定の読み込みに失敗しました(初期設定で始めます)', e);
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      log.warn('設定の保存に失敗しました', e);
    }
  }
  function optText(id) {
    var el = $(id);
    return el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value;
  }

  // オーディオ
  var ctx = null,
    master,
    dry,
    wet,
    conv,
    comp;
  function impulse(sec) {
    var n = Math.floor(ctx.sampleRate * sec),
      b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return b;
  }
  function ensureAudio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      dry = ctx.createGain();
      wet = ctx.createGain();
      conv = ctx.createConvolver();
      conv.buffer = impulse(1.8);
      master.connect(dry);
      master.connect(conv);
      conv.connect(wet);
      dry.connect(comp);
      wet.connect(comp);
      comp.connect(ctx.destination);
      applyMix();
      log('音の準備ができました(' + ctx.sampleRate + 'Hz)');
    }
    if (ctx.state === 'suspended')
      ctx.resume().catch(function (e) {
        log.warn('音の再生を再開できませんでした', e);
      });
  }
  function applyMix() {
    if (!ctx) return;
    master.gain.value = Math.pow(S.vol / 100, 1.6) * 0.9;
    dry.gain.value = 1;
    wet.gain.value = S.rev ? 0.45 : 0;
  }

  // 音色定義: 各関数は {out(Gain), nodes[]} を返す。release時間はREL
  var REL = { piano: 0.3, epiano: 0.35, organ: 0.08, synth: 0.25, bell: 0.6 };
  function osc(type, f, t0) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    return o;
  }
  function g(v) {
    var x = ctx.createGain();
    x.gain.value = v;
    return x;
  }
  var MAKE = {
    piano: function (m, f, t0, env, nodes) {
      var tau = Math.max(0.5, 2.2 - (m - 36) * 0.022);
      [
        [1, 1],
        [2, 0.45],
        [3, 0.25],
        [4, 0.14],
        [5, 0.08],
        [6, 0.05],
      ].forEach(function (p, i) {
        var o = osc('sine', f * p[0] * (1 + 0.0003 * p[0] * p[0]), t0),
          a = g(0);
        o.connect(a);
        a.connect(env);
        a.gain.setValueAtTime(0, t0);
        a.gain.linearRampToValueAtTime(p[1] * 0.5, t0 + 0.004);
        a.gain.setTargetAtTime(0, t0 + 0.004, tau / (1 + i * 0.6));
        o.start(t0);
        nodes.push(o);
      });
    },
    epiano: function (m, f, t0, env, nodes) {
      var c = osc('sine', f, t0),
        mo = osc('sine', f, t0),
        mg = g(0),
        a = g(0);
      mg.gain.setValueAtTime(f * 1.6, t0);
      mg.gain.setTargetAtTime(f * 0.15, t0, 0.35);
      mo.connect(mg);
      mg.connect(c.frequency);
      c.connect(a);
      a.connect(env);
      a.gain.setValueAtTime(0, t0);
      a.gain.linearRampToValueAtTime(0.55, t0 + 0.005);
      a.gain.setTargetAtTime(0.12, t0 + 0.005, 1.1);
      var t = osc('sine', f * 2, t0),
        tg = g(0);
      t.connect(tg);
      tg.connect(env);
      tg.gain.setValueAtTime(0.12, t0);
      tg.gain.setTargetAtTime(0, t0, 0.25);
      c.start(t0);
      mo.start(t0);
      t.start(t0);
      nodes.push(c, mo, t);
    },
    organ: function (m, f, t0, env, nodes) {
      [
        [1, 0.55],
        [2, 0.4],
        [3, 0.22],
        [4, 0.15],
        [0.5, 0.3],
      ].forEach(function (p) {
        var o = osc('sine', f * p[0], t0),
          a = g(p[1] * 0.6);
        o.connect(a);
        a.connect(env);
        o.start(t0);
        nodes.push(o);
      });
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + 0.012);
    },
    synth: function (m, f, t0, env, nodes) {
      var flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.Q.value = 4;
      flt.frequency.setValueAtTime(Math.min(8000, f * 10), t0);
      flt.frequency.setTargetAtTime(Math.min(3000, f * 3), t0, 0.25);
      [-7, 7].forEach(function (d) {
        var o = osc('sawtooth', f, t0);
        o.detune.value = d;
        var a = g(0.22);
        o.connect(a);
        a.connect(flt);
        o.start(t0);
        nodes.push(o);
      });
      flt.connect(env);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + 0.01);
      env.gain.setTargetAtTime(0.7, t0 + 0.01, 0.2);
    },
    bell: function (m, f, t0, env, nodes) {
      var c = osc('sine', f, t0),
        mo = osc('sine', f * 3.5, t0),
        mg = g(0),
        a = g(0);
      mg.gain.setValueAtTime(f * 2.2, t0);
      mg.gain.setTargetAtTime(0, t0, 0.9);
      mo.connect(mg);
      mg.connect(c.frequency);
      c.connect(a);
      a.connect(env);
      a.gain.setValueAtTime(0, t0);
      a.gain.linearRampToValueAtTime(0.5, t0 + 0.003);
      a.gain.setTargetAtTime(0, t0 + 0.003, 2.2);
      c.start(t0);
      mo.start(t0);
      nodes.push(c, mo);
    },
  };
  function makeVoice(m) {
    var t0 = ctx.currentTime,
      f = P.noteToFreq(m),
      env = g(1),
      rel = g(1),
      nodes = [],
      inst = S.inst;
    MAKE[inst](m, f, t0, env, nodes);
    env.connect(rel);
    rel.connect(master);
    var ended = false;
    return {
      release: function () {
        if (ended) return;
        ended = true;
        var now = ctx.currentTime,
          r = REL[inst];
        rel.gain.cancelScheduledValues(now);
        rel.gain.setValueAtTime(1, now);
        rel.gain.setTargetAtTime(0, now, r / 3);
        setTimeout(
          function () {
            nodes.forEach(function (o) {
              try {
                o.stop();
              } catch (e) {
                /* 停止済み(想定内) */
              }
            });
            try {
              rel.disconnect();
            } catch (e) {
              /* 切断済み(想定内) */
            }
          },
          r * 1000 + 400,
        );
      },
    };
  }

  // 発音管理
  var voices = {},
    held = {},
    sustained = [],
    pedal = false;
  var recording = false,
    recEvents = [],
    recT0 = 0,
    lastRec = null;
  var keyEls = {},
    activeCnt = {};
  function setActive(m, on) {
    activeCnt[m] = (activeCnt[m] || 0) + (on ? 1 : -1);
    if (activeCnt[m] < 0) activeCnt[m] = 0;
    var el = keyEls[m];
    if (el) el.classList.toggle('active', activeCnt[m] > 0);
  }
  function startVoice(id, m, user) {
    ensureAudio();
    stopVoice(id, true);
    voices[id] = { m: m, v: makeVoice(m) };
    held[m] = (held[m] || 0) + 1;
    setActive(m, true);
    if (user) {
      log.debug('鍵盤を押下しました(' + P.midiFull(m) + ')');
      if (recording) {
        recEvents.push({ t: performance.now() - recT0, midi: m, on: true });
      }
      practiceHit(m);
    }
  }
  function stopVoice(id, silent, user) {
    var x = voices[id];
    if (!x) return;
    delete voices[id];
    held[x.m]--;
    setActive(x.m, false);
    if (user && recording) recEvents.push({ t: performance.now() - recT0, midi: x.m, on: false });
    if (pedal && !silent) {
      sustained.push(x.v);
    } else x.v.release();
  }
  function setPedal(on) {
    if (pedal !== on) log.debug('サステインを ' + (on ? 'ON' : 'OFF') + ' にしました');
    pedal = on;
    $('pedal').classList.toggle('on', on);
    if (!on) {
      sustained.forEach(function (v) {
        v.release();
      });
      sustained = [];
    }
  }

  // 鍵盤
  var kb = $('keyboard'),
    ptr = {}; // pointerId -> midi
  function build() {
    var L = P.buildLayout(S.base, S.octs);
    kb.innerHTML = '';
    keyEls = {};
    var wn = L.whites.length;
    L.whites.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'white';
      d.dataset.midi = w.midi;
      kb.appendChild(d);
      keyEls[w.midi] = d;
    });
    L.blacks.forEach(function (b) {
      var d = document.createElement('div');
      d.className = 'black';
      d.dataset.midi = b.midi;
      var inner = kb.clientWidth - 12 || 300,
        ww = inner / wn;
      d.style.width = ww * 0.62 + 'px';
      d.style.left = 6 + ww * (b.after + 1) - ww * 0.31 + 'px';
      kb.appendChild(d);
      keyEls[b.midi] = d;
    });
    labels();
    for (var m in activeCnt) if (activeCnt[m] > 0 && keyEls[m]) keyEls[m].classList.add('active');
    $('octLabel').textContent = 'C' + S.base + ' 〜 B' + (S.base + S.octs - 1);
    applyHighlights();
  }
  function labels() {
    for (var m in keyEls) {
      var el = keyEls[m],
        mm = +m,
        t = '';
      if (S.lbl !== 'none') {
        if (!P.isBlack(mm)) {
          t = P.midiName(mm, S.lbl);
          if (P.pc(mm) === 0) t += Math.floor(mm / 12) - 1;
        }
      }
      el.textContent = t;
    }
  }
  function keyAt(x, y) {
    var el = document.elementFromPoint(x, y);
    return el && el.dataset && el.dataset.midi && kb.contains(el) ? +el.dataset.midi : null;
  }
  kb.addEventListener('pointerdown', function (e) {
    var m = keyAt(e.clientX, e.clientY);
    if (m === null) return;
    e.preventDefault();
    ptr[e.pointerId] = m;
    startVoice('p' + e.pointerId, m, true);
  });
  kb.addEventListener('pointermove', function (e) {
    if (ptr[e.pointerId] === undefined) return;
    var m = keyAt(e.clientX, e.clientY);
    if (m !== null && m !== ptr[e.pointerId]) {
      stopVoice('p' + e.pointerId, false, true);
      ptr[e.pointerId] = m;
      startVoice('p' + e.pointerId, m, true);
    }
  });
  function up(e) {
    if (ptr[e.pointerId] === undefined) return;
    delete ptr[e.pointerId];
    stopVoice('p' + e.pointerId, false, true);
  }
  kb.addEventListener('pointerup', up);
  kb.addEventListener('pointercancel', up);
  window.addEventListener('pointerup', up);
  kb.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // PCキーボード
  var down = {};
  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) setPedal(true);
      return;
    }
    var k = e.key.toLowerCase();
    if (!(k in P.KEYMAP) || e.repeat) return;
    e.preventDefault();
    var m = (S.base + 1) * 12 + P.KEYMAP[k];
    down[k] = m;
    startVoice('k' + k, m, true);
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') {
      setPedal(false);
      return;
    }
    var k = e.key.toLowerCase();
    if (down[k] === undefined) return;
    delete down[k];
    stopVoice('k' + k, false, true);
  });
  var pd = $('pedal');
  pd.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    setPedal(true);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
    pd.addEventListener(n, function () {
      setPedal(false);
    });
  });

  // オクターブ移動・設定
  function shift(d) {
    var nb = S.base + d;
    if (nb < 1 || nb + S.octs - 1 > 7) {
      log.warn(
        'オクターブは' +
          (d > 0 ? '上限' : '下限') +
          'のため移動できませんでした(' +
          $('octLabel').textContent +
          ')',
      );
      return;
    }
    S.base = nb;
    save();
    build();
    log('オクターブを移動しました(' + $('octLabel').textContent + ')');
  }
  $('octDown').onclick = function () {
    shift(-1);
  };
  $('octUp').onclick = function () {
    shift(1);
  };
  $('inst').value = S.inst;
  $('inst').onchange = function () {
    S.inst = this.value;
    save();
    ensureAudio();
  };
  $('vol').value = S.vol;
  $('vol').oninput = function () {
    S.vol = +this.value;
    applyMix();
    save();
  };
  $('rev').checked = S.rev;
  $('rev').onchange = function () {
    S.rev = this.checked;
    applyMix();
    save();
  };
  $('octs').value = S.octs;
  $('octs').onchange = function () {
    S.octs = +this.value;
    if (S.base + S.octs - 1 > 7) S.base = 8 - S.octs;
    save();
    build();
  };
  $('lbl').value = S.lbl;
  $('lbl').onchange = function () {
    S.lbl = this.value;
    save();
    labels();
  };
  window.addEventListener('resize', function () {
    build();
  });

  // コード・スケール
  var chordOn = false;
  (function () {
    var r = $('chRoot'),
      k = $('chKind');
    for (var i = 0; i < 12; i++) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = P.EN[i] + '(' + P.JP[i] + ')';
      r.appendChild(o);
    }
    var g1 = document.createElement('optgroup');
    g1.label = 'コード';
    for (var c in P.CHORDS) {
      var o1 = document.createElement('option');
      o1.value = 'chord:' + c;
      o1.textContent = P.CHORDS[c][2] + (P.CHORDS[c][0] ? ' (' + P.CHORDS[c][0] + ')' : '');
      g1.appendChild(o1);
    }
    var g2 = document.createElement('optgroup');
    g2.label = 'スケール';
    for (var s in P.SCALES) {
      var o2 = document.createElement('option');
      o2.value = 'scale:' + s;
      o2.textContent = P.SCALES[s][0];
      g2.appendChild(o2);
    }
    k.appendChild(g1);
    k.appendChild(g2);
  })();
  function chordSel() {
    return { root: +$('chRoot').value, kind: $('chKind').value };
  }
  function applyHighlights() {
    for (var m in keyEls) {
      keyEls[m].classList.remove('chord', 'root', 'hint');
    }
    if (chordOn) {
      var c = chordSel(),
        pcs = P.pitchClasses(c.root, c.kind);
      for (var m2 in keyEls) {
        var p = P.pc(+m2);
        if (pcs.indexOf(p) >= 0) keyEls[m2].classList.add(p === c.root ? 'root' : 'chord');
      }
    }
    if (pr && !pr.done()) {
      var e = keyEls[pr.expected()];
      if (e) e.classList.add('hint');
    }
  }
  function chInfo() {
    var c = chordSel();
    $('chInfo').textContent =
      P.label(c.root, c.kind, 'en') +
      '(' +
      P.label(c.root, c.kind, 'jp') +
      ') = ' +
      P.noteList(c.root, c.kind, 'jp') +
      '(' +
      P.noteList(c.root, c.kind, 'en') +
      ')';
  }
  $('chRoot').onchange = $('chKind').onchange = function () {
    chInfo();
    applyHighlights();
    log('コード・スケールを「' + $('chInfo').textContent + '」にしました');
  };
  $('chShow').onclick = function () {
    chordOn = !chordOn;
    this.classList.toggle('on', chordOn);
    this.textContent = chordOn ? '表示を消す' : '鍵盤に表示';
    applyHighlights();
    log(chordOn ? '鍵盤にコード・スケールを表示しました' : '鍵盤の表示を消しました');
  };
  $('chPlay').onclick = function () {
    var c = chordSel(),
      base = (S.base + 1) * 12 + c.root,
      notes = P.playNotes(base, c.kind),
      isScale = c.kind.indexOf('scale:') === 0;
    stopAuto();
    notes.forEach(function (m, i) {
      later(
        function () {
          startVoice('auto' + i, m, false);
        },
        isScale ? i * 260 : 0,
      );
      later(
        function () {
          stopVoice('auto' + i);
        },
        isScale ? i * 260 + 240 : 1300,
      );
    });
    log('コード・スケールを再生しました(' + $('chInfo').textContent + ')');
  };
  chInfo();

  // 自動演奏(お手本・コード・録音再生)共通
  var timers = [];
  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }
  function stopAuto() {
    timers.forEach(clearTimeout);
    timers = [];
    Object.keys(voices).forEach(function (id) {
      if (id.indexOf('auto') === 0 || id.indexOf('pb') === 0) stopVoice(id, true);
    });
    $('playBtn').textContent = '▶ 再生';
    playing = false;
  }

  // 曲の練習
  var pr = null,
    curSong = null;
  (function () {
    var s = $('song');
    P.SONGS.forEach(function (x) {
      var o = document.createElement('option');
      o.value = x.id;
      o.textContent = x.name;
      s.appendChild(o);
    });
  })();
  function songSel() {
    var id = $('song').value;
    return P.SONGS.filter(function (s) {
      return s.id === id;
    })[0];
  }
  function fitSong(song) {
    var r = P.songRange(song.notes),
      b = P.fitOctave(r.lo, r.hi, S.octs, S.base);
    if (b === null) {
      S.octs = Math.min(4, S.octs + 1);
      $('octs').value = S.octs;
      b = P.fitOctave(r.lo, r.hi, S.octs, S.base);
    }
    if (b !== null && b !== S.base) {
      S.base = b;
    }
    build();
  }
  function prUpdate() {
    if (!pr) return;
    if (pr.done()) {
      $('prInfo').textContent = '「' + curSong.name + '」を最後まで弾けました!';
      log('練習が完了しました(「' + curSong.name + '」 / ' + pr.length() + '音)');
      pr = null;
      applyHighlights();
      return;
    }
    $('prInfo').textContent =
      '「' +
      curSong.name +
      '」 ' +
      (pr.index() + 1) +
      ' / ' +
      pr.length() +
      '  次は ' +
      P.midiName(pr.expected(), 'jp') +
      '(' +
      P.midiFull(pr.expected()) +
      ')';
    applyHighlights();
  }
  function practiceHit(m) {
    if (!pr) return;
    var r = pr.press(m);
    if (r === 'hit' || r === 'done') prUpdate();
  }
  $('prStart').onclick = function () {
    stopAuto();
    curSong = songSel();
    fitSong(curSong);
    pr = P.createPractice(curSong.notes);
    prUpdate();
    log(
      '練習を開始しました(「' +
        curSong.name +
        '」 / ' +
        pr.length() +
        '音 / ' +
        $('octLabel').textContent +
        ')',
    );
  };
  $('prStop').onclick = function () {
    stopAuto();
    var had = !!pr;
    pr = null;
    $('prInfo').textContent = 'やめました。';
    applyHighlights();
    log(had ? '練習をやめました' : '練習していないため、お手本の再生だけ止めました');
  };
  $('prDemo').onclick = function () {
    stopAuto();
    pr = null;
    var song = songSel();
    curSong = song;
    fitSong(song);
    applyHighlights();
    var beat = 60000 / +$('bpm').value,
      t = 0;
    song.notes.forEach(function (n, i) {
      var d = n.beats * beat;
      later(function () {
        startVoice('auto' + i, n.midi, false);
      }, t);
      later(
        function () {
          stopVoice('auto' + i);
        },
        t + d * 0.9,
      );
      t += d;
    });
    later(function () {
      $('prInfo').textContent = 'お手本の再生が終わりました。';
      log('お手本の再生が終わりました(「' + song.name + '」)');
    }, t + 200);
    $('prInfo').textContent = 'お手本を再生中…「' + song.name + '」';
    log(
      'お手本を再生しました(「' +
        song.name +
        '」 / ' +
        $('bpm').value +
        ' BPM / ' +
        (t / 1000).toFixed(1) +
        '秒)',
    );
  };

  // 録音・再生
  var playing = false;
  function recUi() {
    var n = lastRec ? lastRec.length : 0;
    $('playBtn').disabled = !n || recording;
    $('midiBtn').disabled = !n || recording;
    $('shareBtn').disabled = !n || recording;
    if (!recording)
      $('recInfo').textContent = n
        ? '録音: ' + (lastRec[lastRec.length - 1].t / 1000).toFixed(1) + '秒 / ' + n / 2 + '音'
        : '録音すると、再生・MIDI保存ができます。';
  }
  try {
    var lr = JSON.parse(localStorage.getItem(KEY + '-rec') || 'null');
    if (Array.isArray(lr) && lr.length) lastRec = lr;
  } catch (e) {
    log.warn('保存した録音の読み込みに失敗しました', e);
  }
  $('recBtn').onclick = function () {
    ensureAudio();
    if (!recording) {
      stopAuto();
      recEvents = [];
      recording = true;
      recT0 = performance.now();
      this.textContent = '■ 停止';
      this.classList.add('on');
      $('recInfo').textContent = '録音中…鍵盤を弾いてください。';
      $('playBtn').disabled = true;
      $('midiBtn').disabled = true;
      $('shareBtn').disabled = true;
      log('録音を開始しました');
    } else {
      recording = false;
      this.textContent = '● 録音';
      this.classList.remove('on');
      // 押されたままの音を閉じ、先頭の空白を詰める
      var end = performance.now() - recT0;
      Object.keys(voices).forEach(function (id) {
        var x = voices[id];
        if (x && (id[0] === 'p' || id[0] === 'k')) recEvents.push({ t: end, midi: x.m, on: false });
      });
      if (recEvents.length) {
        var t0 = recEvents[0].t;
        lastRec = recEvents.map(function (e) {
          return { t: Math.round(e.t - t0), midi: e.midi, on: e.on };
        });
        try {
          localStorage.setItem(KEY + '-rec', JSON.stringify(lastRec.slice(0, 4000)));
        } catch (e) {
          log.warn('録音の保存に失敗しました(このページを閉じると消えます)', e);
        }
      }
      recUi();
      if (recEvents.length)
        log('録音を停止しました(' + $('recInfo').textContent.replace('録音: ', '') + ')');
      else log.warn('音が無かったため録音を残しませんでした');
    }
  };
  $('playBtn').onclick = function () {
    if (playing) {
      stopAuto();
      log('録音の再生を停止しました');
      return;
    }
    if (!lastRec || !lastRec.length) {
      log.warn('録音が無いため再生できませんでした');
      return;
    }
    ensureAudio();
    stopAuto();
    playing = true;
    this.textContent = '■ 停止';
    var sp = +$('speed').value,
      tail = 0;
    lastRec.forEach(function (e, i) {
      var t = e.t / sp;
      tail = Math.max(tail, t);
      later(function () {
        e.on ? startVoice('pb' + e.midi, e.midi, false) : stopVoice('pb' + e.midi);
      }, t);
    });
    later(function () {
      stopAuto();
      log('録音の再生が終わりました');
    }, tail + 600);
    log('録音を再生しました(速度 ' + sp + 'x / ' + (tail / 1000).toFixed(1) + '秒)');
  };
  $('midiBtn').onclick = function () {
    var bytes = P.eventsToMidi(lastRec),
      blob = new Blob([bytes], { type: 'audio/midi' });
    var a = document.createElement('a'),
      u = URL.createObjectURL(blob);
    a.href = u;
    a.download = 'piano-recording.mid';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(u);
      a.remove();
    }, 1000);
    $('recInfo').textContent = 'piano-recording.mid を保存しました。';
    log('MIDIを保存しました(piano-recording.mid / ' + bytes.length + 'バイト)');
  };
  (function () {
    var f = null;
    try {
      f = new File([new Uint8Array([0])], 'a.mid', { type: 'audio/midi' });
    } catch (e) {
      log.debug('ファイルの共有に対応していません');
    }
    if (navigator.share && navigator.canShare && f && navigator.canShare({ files: [f] }))
      $('shareBtn').hidden = false;
  })();
  $('shareBtn').onclick = function () {
    var file = new File([P.eventsToMidi(lastRec)], 'piano-recording.mid', { type: 'audio/midi' });
    navigator.share({ files: [file], title: 'ピアノの録音' }).then(
      function () {
        log('録音を共有しました(piano-recording.mid)');
      },
      function (e) {
        if (e && e.name === 'AbortError') {
          log('共有をやめました');
          return;
        }
        $('recInfo').textContent = '共有できませんでした。「MIDIで保存」をお使いください。';
        log.warn('共有できませんでした', e);
      },
    );
  };
  recUi();

  build();
  log.started(
    '音色 ' +
      optText('inst') +
      ' / ' +
      $('octLabel').textContent +
      ' / 録音 ' +
      (lastRec ? lastRec.length / 2 + '音' : 'なし'),
  );
})();
