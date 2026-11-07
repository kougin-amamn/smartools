/* デッキ1台分の画面(盤・アーム・START/STOP・回転数・ピッチ・キュー)と指の扱い。
   dj-turntable-pro-core.js と dj-turntable-pro-textures.js を使う。音への命令は host.send で送る */
(function (root) {
  'use strict';
  var K = root.DJCore,
    T = root.DJTextures,
    P = K.PLINTH;
  var LONG_PRESS = 600;
  var SPEED_RATIO = { 33: 1, 45: 1.35, 78: 2.34 };

  function DeckView(section, index, host) {
    this.el = section;
    this.index = index;
    this.letter = index ? 'B' : 'A';
    this.host = host;
    this.track = null;
    this.rpm = 33;
    this.pitch = 0;
    this.motorOn = false;
    this.pos = 0;
    this.speed = 0;
    this.stateTime = 0;
    this.strobeAngle = 0;
    this.shownArm = null;
    this.shownSecond = -1;
    this.grab = null;
    this.armDrag = null;
    this.size = 0;
    var q = function (s) {
      return section.querySelector(s);
    };
    this.ui = {
      title: q('.deck-title'),
      bpm: q('.deck-bpm'),
      pitchText: q('.deck-pitch'),
      time: q('.deck-time'),
      status: q('.deck-status'),
      platter: q('.platter'),
      rim: q('.platter-rim'),
      strobe: q('.platter-strobe'),
      record: q('.platter-record'),
      glare: q('.platter-glare'),
      arm: q('.arm-move'),
      armHit: q('.arm-hit'),
      plinth: q('.plinth'),
      start: q('.start'),
      speeds: section.querySelectorAll('[data-rpm]'),
      fader: q('.pitch-fader'),
      led: q('.pitch-led'),
      cue: q('.cue'),
      hots: section.querySelectorAll('[data-hot]'),
    };
    section.setAttribute('data-log-group', 'デッキ ' + this.letter);
    q('.deck-letter').textContent = this.letter;
    this.bind();
    this.drawArm(P.restAngle);
  }

  DeckView.prototype.bind = function () {
    var self = this,
      ui = this.ui;
    q(this.el, '.deck-track').addEventListener('click', function () {
      self.host.openLibrary(self.index);
    });
    ui.start.addEventListener('click', function () {
      self.toggleMotor();
    });
    ui.speeds.forEach(function (b) {
      b.addEventListener('click', function () {
        self.setRpm(Number(b.dataset.rpm));
      });
    });
    ui.fader.addEventListener('input', function () {
      self.setPitchFader(Number(ui.fader.value));
    });
    q(this.el, '.pitch-reset').addEventListener('click', function () {
      ui.fader.value = 0;
      self.setPitchFader(0);
    });
    ui.cue.addEventListener('click', function () {
      self.pressCue();
    });
    ui.hots.forEach(function (b) {
      var timer = null,
        long = false;
      b.addEventListener('pointerdown', function () {
        long = false;
        timer = setTimeout(function () {
          long = true;
          self.clearHotCue(Number(b.dataset.hot));
        }, LONG_PRESS);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) {
        b.addEventListener(t, function () {
          clearTimeout(timer);
        });
      });
      b.addEventListener('click', function () {
        if (!long) self.pressHotCue(Number(b.dataset.hot));
      });
    });
    this.bindPlatter();
    this.bindArm();
  };

  function q(el, s) {
    return el.querySelector(s);
  }

  DeckView.prototype.send = function (message) {
    message.deck = this.index;
    this.host.send(message);
  };

  /* 曲名の下の小さな表示。何も無い時は LOAD(押すと曲の一覧) */
  DeckView.prototype.say = function (text) {
    this.ui.status.textContent = text || (this.track ? 'LOADED' : 'LOAD');
  };

  /* モーターと速さ */
  DeckView.prototype.toggleMotor = function (on) {
    this.host.ensure();
    this.motorOn = on == null ? !this.motorOn : on;
    this.send({ type: 'motor', on: this.motorOn });
    this.ui.start.setAttribute('aria-pressed', String(this.motorOn));
    ToolKit.vibrate(10);
    log(
      'デッキ ' +
        this.letter +
        (this.motorOn ? ' を回しました(' : ' を止めました(') +
        this.rpm +
        '回転 / ピッチ ' +
        K.formatPitch(this.pitch) +
        ')',
    );
    this.host.request();
  };

  DeckView.prototype.speedRatio = function () {
    return SPEED_RATIO[this.rpm] * (1 + this.pitch / 100);
  };

  DeckView.prototype.sendSpeed = function () {
    this.send({ type: 'speed', rpmRatio: SPEED_RATIO[this.rpm], pitch: this.pitch / 100 });
    this.ui.pitchText.textContent = K.formatPitch(this.pitch);
    this.ui.led.classList.toggle('on', this.pitch === 0);
    this.showBpm();
  };

  DeckView.prototype.setRpm = function (rpm) {
    this.rpm = rpm;
    this.ui.speeds.forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.rpm) === rpm));
    });
    this.sendSpeed();
  };

  DeckView.prototype.setPitchFader = function (value) {
    var before = this.pitch;
    this.pitch = K.pitchOfFader(value, this.host.settings.pitchRange);
    if (this.pitch === 0 && before !== 0) ToolKit.vibrate(8);
    this.sendSpeed();
  };

  DeckView.prototype.applyPitchRange = function () {
    this.setPitchFader(Number(this.ui.fader.value));
  };

  DeckView.prototype.showBpm = function () {
    var t = this.track;
    this.ui.bpm.textContent = t && t.bpm ? (t.bpm * this.speedRatio()).toFixed(1) : '---.-';
  };

  /* 曲 */
  DeckView.prototype.setTrack = function (track) {
    this.track = track;
    this.pos = 0;
    this.shownSecond = -1;
    this.ui.title.textContent = track.title;
    this.say('');
    this.showBpm();
    this.showHotCues();
    this.drawRecord();
    this.host.request();
  };

  DeckView.prototype.setSize = function (plinthWidth) {
    var platter = Math.round((plinthWidth * (P.platterRadius * 2)) / P.width);
    if (platter === this.size) return;
    this.size = platter;
    T.drawRim(this.ui.rim, platter);
    T.drawStrobe(this.ui.strobe, platter);
    T.drawGlare(this.ui.glare, platter);
    this.drawRecord();
  };

  DeckView.prototype.drawRecord = function () {
    if (!this.size) return;
    var t = this.track || {};
    T.drawRecord(this.ui.record, (this.size * P.recordRadius) / P.platterRadius, {
      title: t.title || '',
      color: t.title ? K.labelColorOf(t.title) : '#8d8f96',
      seed: t.key ? t.key.length * 7919 + (t.duration | 0) : 1,
      duration: t.duration,
      silences: t.silences,
      side: 'SIDE ' + this.letter,
    });
  };

  /* worklet からの知らせ */
  DeckView.prototype.applyState = function (m, now) {
    this.pos = m.pos;
    this.speed = m.speed;
    this.stateTime = now;
    if (m.motor !== this.motorOn) {
      this.motorOn = m.motor;
      this.ui.start.setAttribute('aria-pressed', String(m.motor));
    }
  };

  DeckView.prototype.positionAt = function (now) {
    var p = this.pos + (this.speed * (now - this.stateTime)) / 1000;
    if (this.track) p = K.clamp(p, 0, this.track.duration);
    return p;
  };

  DeckView.prototype.seek = function (seconds, mode) {
    this.host.ensure();
    this.send({ type: 'seek', pos: seconds, mode: mode || 'keep' });
    this.pos = seconds;
    this.stateTime = performance.now();
    if (mode === 'stop') this.speed = 0;
  };

  /* キュー(止まっている時に置き、回っている時はそこへ戻って止まる) */
  DeckView.prototype.pressCue = function () {
    if (!this.track) return this.say('先に曲を読み込んでください');
    var now = this.positionAt(performance.now());
    if (this.motorOn || Math.abs(this.speed) > 0.01) {
      this.seek(this.track.cue || 0, 'stop');
      log(
        'デッキ ' +
          this.letter +
          ' のキューへ戻りました(' +
          K.formatTime(this.track.cue || 0) +
          ')',
      );
    } else {
      this.track.cue = now;
      this.host.save(this);
      log('デッキ ' + this.letter + ' のキューを置きました(' + K.formatTime(now) + ')');
    }
  };

  DeckView.prototype.pressHotCue = function (i) {
    if (!this.track) return this.say('先に曲を読み込んでください');
    var hots = this.track.hotCues;
    if (hots[i] == null) {
      hots[i] = this.positionAt(performance.now());
      this.host.save(this);
      this.showHotCues();
      log(
        'デッキ ' +
          this.letter +
          ' のホットキュー ' +
          (i + 1) +
          ' を置きました(' +
          K.formatTime(hots[i]) +
          ')',
      );
    } else {
      this.seek(hots[i], 'start');
      this.motorOn = true;
      this.ui.start.setAttribute('aria-pressed', 'true');
      this.host.request();
    }
  };

  DeckView.prototype.clearHotCue = function (i) {
    if (!this.track || this.track.hotCues[i] == null) return;
    this.track.hotCues[i] = null;
    this.host.save(this);
    this.showHotCues();
    ToolKit.vibrate(20);
    log('デッキ ' + this.letter + ' のホットキュー ' + (i + 1) + ' を消しました');
  };

  DeckView.prototype.showHotCues = function () {
    var hots = (this.track && this.track.hotCues) || [];
    this.ui.hots.forEach(function (b, i) {
      b.classList.toggle('set', hots[i] != null);
    });
  };

  /* 盤: 内側を押さえて回すとスクラッチ、縁(外側 14%)をこすると速さを少し変える */
  DeckView.prototype.bindPlatter = function () {
    var self = this,
      el = this.ui.platter;
    function angleOf(e, rect) {
      return (
        (Math.atan2(
          e.clientY - rect.top - rect.height / 2,
          e.clientX - rect.left - rect.width / 2,
        ) *
          180) /
        Math.PI
      );
    }
    el.addEventListener('pointerdown', function (e) {
      if (self.grab) return;
      var rect = el.getBoundingClientRect();
      var dx = e.clientX - rect.left - rect.width / 2,
        dy = e.clientY - rect.top - rect.height / 2;
      var distance = Math.hypot(dx, dy) / (rect.width / 2);
      if (distance > 1) return;
      e.preventDefault();
      self.host.ensure();
      el.setPointerCapture(e.pointerId);
      var now = performance.now();
      self.grab = {
        id: e.pointerId,
        rect: rect,
        mode: distance > 0.86 ? 'nudge' : 'scratch',
        raw: angleOf(e, rect),
        total: 0,
        sentTotal: 0,
        sentTime: now,
        recordAngle: (self.positionAt(now) * K.DEGREES_PER_SECOND) % 360,
        nudge: 0,
      };
      if (self.grab.mode === 'scratch')
        self.send({ type: 'touch', down: true, angle: 0, stamp: now / 1000 });
      self.host.request();
    });
    el.addEventListener('pointermove', function (e) {
      var g = self.grab;
      if (!g || e.pointerId !== g.id) return;
      var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (list.length ? list : [e]).forEach(function (p) {
        var raw = angleOf(p, g.rect);
        g.total += K.unwrapDegrees(raw - g.raw);
        g.raw = raw;
      });
    });
    function release(e) {
      var g = self.grab;
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'scratch') {
        self.send({ type: 'touch', down: false, angle: g.total, stamp: performance.now() / 1000 });
        self.pos = (g.recordAngle + g.total) / K.DEGREES_PER_SECOND;
      } else self.send({ type: 'nudge', amount: 0 });
      self.grab = null;
      self.host.request();
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  };

  /* 毎フレーム: 押さえている間は指の角度を送る(動いていない時も送り、止まったことを伝える) */
  DeckView.prototype.sendGrab = function (now) {
    var g = this.grab;
    if (!g) return;
    if (g.mode === 'scratch') {
      this.send({ type: 'touch', down: true, angle: g.total, stamp: now / 1000 });
      return;
    }
    var dt = (now - g.sentTime) / 1000;
    if (dt <= 0) return;
    var amount = K.nudgeOf((g.total - g.sentTotal) / dt);
    g.sentTotal = g.total;
    g.sentTime = now;
    if (Math.abs(amount - g.nudge) > 0.002) {
      g.nudge = amount;
      this.send({ type: 'nudge', amount: amount });
    }
  };

  /* アーム: 押さえて盤の上へ動かし、離した所に針を落とす */
  DeckView.prototype.bindArm = function () {
    var self = this,
      hit = this.ui.armHit;
    function angleOf(e) {
      var rect = self.ui.plinth.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * P.width,
        y = ((e.clientY - rect.top) / rect.height) * P.height;
      var a = (Math.atan2(y - P.pivotY, x - P.pivotX) * 180) / Math.PI;
      return K.clamp(a, P.restAngle, K.armAngleOf(1) + 4);
    }
    hit.addEventListener('pointerdown', function (e) {
      if (!self.track) return self.say('先に曲を読み込んでください');
      e.preventDefault();
      hit.setPointerCapture(e.pointerId);
      self.armDrag = { id: e.pointerId, angle: angleOf(e) };
      self.ui.plinth.classList.add('lifting');
      self.host.request();
    });
    hit.addEventListener('pointermove', function (e) {
      if (self.armDrag && e.pointerId === self.armDrag.id) self.armDrag.angle = angleOf(e);
    });
    function drop(e) {
      var d = self.armDrag;
      if (!d || e.pointerId !== d.id) return;
      self.armDrag = null;
      self.ui.plinth.classList.remove('lifting');
      var progress = K.progressOfArmAngle(d.angle);
      if (progress != null && e.type === 'pointerup') {
        var at = progress * self.track.duration;
        self.seek(at, 'keep');
        log('デッキ ' + self.letter + ' の針を落としました(' + K.formatTime(at) + ')');
      }
      self.host.request();
    }
    hit.addEventListener('pointerup', drop);
    hit.addEventListener('pointercancel', drop);
  };

  DeckView.prototype.drawArm = function (angle) {
    if (this.shownArm != null && Math.abs(angle - this.shownArm) < 0.1) return;
    this.shownArm = angle;
    this.ui.arm.setAttribute(
      'transform',
      'translate(' + P.pivotX + ' ' + P.pivotY + ') rotate(' + angle.toFixed(2) + ')',
    );
  };

  /* 毎フレームの描画。動いている間は true を返す */
  DeckView.prototype.render = function (now, dt) {
    this.sendGrab(now);
    var pos = this.positionAt(now);
    var angle =
      this.grab && this.grab.mode === 'scratch'
        ? this.grab.recordAngle + this.grab.total
        : pos * K.DEGREES_PER_SECOND;
    this.ui.record.style.transform = 'rotate(' + (angle % 360).toFixed(2) + 'deg)';
    this.strobeAngle =
      (this.strobeAngle + K.strobeDriftOf(this.speed / SPEED_RATIO[this.rpm]) * dt) % 360;
    this.ui.strobe.style.transform = 'rotate(' + this.strobeAngle.toFixed(2) + 'deg)';
    if (this.armDrag) this.drawArm(this.armDrag.angle);
    else this.drawArm(this.track ? K.armAngleOf(pos / this.track.duration) : P.restAngle);
    var second = Math.floor(pos);
    if (second !== this.shownSecond && this.track) {
      this.shownSecond = second;
      this.ui.time.textContent = '-' + K.formatTime(this.track.duration - pos);
    }
    return !!(this.grab || this.armDrag || this.motorOn || Math.abs(this.speed) > 0.001);
  };

  root.DJDeckView = DeckView;
})(this);
