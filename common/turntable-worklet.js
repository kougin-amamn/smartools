/* 2台の盤から音を読む部分(DJターンテーブル Pro と DJデッキが共有)。AudioWorklet から読み込まれ(出力2つ)、Node でも試せる。
   モーター(一定の加速度)・指(位置を追うばね)・スリップマット・4点補間・針を落とした時のつなぎを受け持つ */
(function () {
  'use strict';

  var STILL = 0.001;
  /* 指の位置へ追いつくばね。固有角周波数 約60Hz・臨界減衰で、行き過ぎずに素早く追う */
  var SPRING = 2 * Math.PI * 60;
  /* 指の知らせは 60〜120回/秒。最後の2点の速さで最大 30ms 先まで延ばし、間を埋める */
  var LOOKAHEAD = 0.03;
  /* スリップマットが盤を下の盤の速さへ引き戻す加速度(標準の速さ/秒) */
  var FRICTION = 10;
  var FADE_SECONDS = 0.005;
  var INT16_SCALE = 1 / 32768;

  function hermite(data, length, x) {
    var i = Math.floor(x),
      f = x - i;
    var y0 = data[i > 0 ? i - 1 : 0],
      y1 = data[i],
      y2 = data[i + 1 < length ? i + 1 : i],
      y3 = data[i + 2 < length ? i + 2 : i];
    var c1 = 0.5 * (y2 - y0),
      c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3,
      c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return (((c3 * f + c2) * f + c1) * f + y1) * INT16_SCALE;
  }

  function Deck(outputRate) {
    this.outputRate = outputRate;
    this.left = null;
    this.right = null;
    this.length = 0;
    this.sourceRate = outputRate;
    this.pos = 0;
    this.speed = 0;
    this.platter = 0;
    this.motorOn = false;
    this.rpmRatio = 1;
    this.pitch = 0;
    this.nudge = 0;
    this.startSeconds = 0.7;
    this.brakeSeconds = 0.6;
    this.slipmat = true;
    this.handDown = false;
    this.handOffset = 0;
    this.handPoint = 0;
    this.handVelocity = 0;
    this.handStamp = 0;
    this.handArrival = 0;
    this.velocity = 0;
    this.fadeLeft = 0;
    this.fadePos = 0;
  }

  Deck.prototype.load = function (left, right, sourceRate) {
    this.left = left;
    this.right = right || left;
    this.length = left.length;
    this.sourceRate = sourceRate;
    this.pos = 0;
    this.fadeLeft = 0;
    this.handDown = false;
  };

  Deck.prototype.motorTarget = function () {
    return this.motorOn ? this.rpmRatio * (1 + this.pitch) : 0;
  };

  Deck.prototype.seconds = function () {
    return this.pos / this.sourceRate;
  };

  /* mode: keep=今の回り方のまま / stop=止めて置く / start=すぐ標準の速さで鳴らす */
  Deck.prototype.seek = function (seconds, mode) {
    if (this.length) {
      this.fadePos = this.pos;
      this.fadeLeft = Math.round(FADE_SECONDS * this.outputRate);
    }
    this.pos = Math.max(
      0,
      Math.min(this.length ? this.length - 1 : Infinity, seconds * this.sourceRate),
    );
    if (mode === 'stop') {
      this.motorOn = false;
      this.platter = this.speed = 0;
    } else if (mode === 'start') {
      this.motorOn = true;
      this.platter = this.speed = this.motorTarget();
    }
    this.velocity = this.speed * this.sourceRate;
  };

  /* 指の角度(何周目も数えた度)を、曲の位置(サンプル)に直して追わせる。stamp は画面の時刻(秒) */
  Deck.prototype.touch = function (down, angle, stamp, now) {
    var point = (angle / 200) * this.sourceRate;
    if (!down) {
      this.handDown = false;
      return;
    }
    if (!this.handDown) {
      this.handDown = true;
      this.handOffset = this.pos - point;
      this.handPoint = this.pos;
      this.handVelocity = 0;
      this.velocity = this.speed * this.sourceRate;
    } else {
      var p = point + this.handOffset,
        dt = stamp - this.handStamp;
      if (dt > 0.002) this.handVelocity = (p - this.handPoint) / dt;
      this.handPoint = p;
    }
    this.handStamp = stamp;
    this.handArrival = now;
  };

  /* n フレーム分の音を書く。曲の最後に着いた時だけ true */
  Deck.prototype.process = function (outL, outR, n, now) {
    var dt = 1 / this.outputRate,
      ended = false;
    var target = this.motorTarget(),
      growing = Math.abs(target) > Math.abs(this.platter);
    var step = (n * dt) / (growing ? this.startSeconds : this.brakeSeconds);
    var diff = target - this.platter;
    this.platter += Math.abs(diff) <= step ? diff : diff > 0 ? step : -step;

    var frictionStep = FRICTION * dt,
      w2 = SPRING * SPRING,
      damp = 2 * SPRING;
    for (var i = 0; i < n; i++) {
      if (this.handDown) {
        var ahead = Math.min(now + i * dt - this.handArrival, LOOKAHEAD);
        var goal = this.handPoint + this.handVelocity * Math.max(0, ahead);
        this.velocity += (w2 * (goal - this.pos) - damp * this.velocity) * dt;
        this.speed = this.velocity / this.sourceRate;
      } else {
        var desired = this.platter * (1 + this.nudge);
        if (this.slipmat) {
          var d = desired - this.speed;
          this.speed += Math.abs(d) <= frictionStep ? d : d > 0 ? frictionStep : -frictionStep;
        } else this.speed = desired;
        this.velocity = this.speed * this.sourceRate;
      }
      this.pos += this.velocity * dt;
      if (this.length) {
        if (this.pos < 0) {
          this.pos = 0;
          if (this.velocity < 0) this.velocity = this.speed = 0;
        } else if (this.pos > this.length - 1) {
          this.pos = this.length - 1;
          if (this.velocity > 0) this.velocity = this.speed = 0;
          if (this.motorOn && !this.handDown) {
            this.motorOn = false;
            ended = true;
          }
        }
      }
      if (!this.length) {
        outL[i] = outR[i] = 0;
        continue;
      }
      /* ほぼ止まった時に一定の値(直流)が出ないよう、遅い所は音を小さくする */
      var level = Math.min(1, Math.abs(this.speed) * 100);
      var l = hermite(this.left, this.length, this.pos) * level,
        r = hermite(this.right, this.length, this.pos) * level;
      if (this.fadeLeft > 0) {
        this.fadePos = Math.max(0, Math.min(this.length - 1, this.fadePos + this.velocity * dt));
        var k = this.fadeLeft / (FADE_SECONDS * this.outputRate);
        l = l * (1 - k) + hermite(this.left, this.length, this.fadePos) * level * k;
        r = r * (1 - k) + hermite(this.right, this.length, this.fadePos) * level * k;
        this.fadeLeft--;
      }
      outL[i] = l;
      outR[i] = r;
    }
    /* 直結では、押さえた盤と一緒に下の盤も止まる */
    if (this.handDown && !this.slipmat) this.platter = this.speed;
    return ended;
  };

  Deck.prototype.isMoving = function () {
    return Math.abs(this.speed) > STILL || this.motorOn || this.handDown;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { Deck: Deck };

  if (typeof registerProcessor === 'function') {
    class TurntableDecks extends AudioWorkletProcessor {
      constructor() {
        super();
        this.decks = [new Deck(sampleRate), new Deck(sampleRate)];
        this.moving = [false, false];
        this.since = 0;
        this.port.onmessage = (e) => this.receive(e.data);
      }
      receive(m) {
        var d = this.decks[m.deck];
        if (m.type === 'settings') {
          this.decks.forEach(function (x) {
            x.startSeconds = m.startSeconds;
            x.brakeSeconds = m.brakeSeconds;
            x.slipmat = m.slipmat;
          });
          return;
        }
        if (!d) return;
        if (m.type === 'load') d.load(m.left, m.right, m.sampleRate);
        else if (m.type === 'motor') d.motorOn = m.on;
        else if (m.type === 'speed') {
          d.rpmRatio = m.rpmRatio;
          d.pitch = m.pitch;
        } else if (m.type === 'nudge') d.nudge = m.amount;
        else if (m.type === 'seek') d.seek(m.pos, m.mode);
        else if (m.type === 'touch') d.touch(m.down, m.angle, m.stamp, currentTime);
        if (m.type !== 'touch') this.report(m.deck);
      }
      report(i) {
        var d = this.decks[i];
        this.port.postMessage({
          type: 'state',
          deck: i,
          pos: d.seconds(),
          speed: d.speed,
          motor: d.motorOn,
        });
      }
      process(inputs, outputs) {
        for (var i = 0; i < 2; i++) {
          var out = outputs[i];
          if (!out || !out[0]) continue;
          if (this.decks[i].process(out[0], out[1] || out[0], out[0].length, currentTime)) {
            this.port.postMessage({ type: 'ended', deck: i });
          }
        }
        /* 約30回/秒で位置を知らせる。止まった直後にも1回送る */
        this.since += outputs[0][0].length;
        if (this.since >= sampleRate / 30) {
          this.since = 0;
          for (var j = 0; j < 2; j++) {
            var moving = this.decks[j].isMoving();
            if (moving || this.moving[j]) this.report(j);
            this.moving[j] = moving;
          }
        }
        return true;
      }
    }
    registerProcessor('turntable-decks', TurntableDecks);
  }
})();
