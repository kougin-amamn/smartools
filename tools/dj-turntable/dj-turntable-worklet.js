/* ターンテーブルの音を作る部分。AudioWorklet から読み込まれ、Node でもテストできる。
   曲のデータを持ち、盤の回転速度(逆回転も含む)に合わせて読み出す */
(function (root) {
  'use strict';

  /* 速度が目標に追いつくまでの時間(秒)。モーターは立ち上がりが速く、止める時はゆっくり回転が落ちる。
     指で押さえている間はほぼ即座に追従させる */
  var TAU_UP = 0.25,
    TAU_DOWN = 0.5,
    TAU_HAND = 0.012;
  var STILL = 1e-3;

  function Deck(sampleRate) {
    this.sr = sampleRate;
    this.ch = [];
    this.len = 0;
    this.srcRate = sampleRate;
    this.pos = 0;
    this.cur = 0;
    this.motor = false;
    this.factor = 1;
    this.hand = false;
    this.handVel = 0;
  }

  Deck.prototype.load = function (channels, srcRate) {
    this.ch = channels;
    this.len = channels.length ? channels[0].length : 0;
    this.srcRate = srcRate;
    this.pos = 0;
    this.cur = 0;
    this.motor = false;
    this.hand = false;
  };
  Deck.prototype.setMotor = function (on, factor) {
    this.motor = on;
    this.factor = factor;
  };
  Deck.prototype.setHand = function (on, vel) {
    this.hand = on;
    this.handVel = vel;
  };
  Deck.prototype.seek = function (sec) {
    this.pos = Math.max(0, Math.min(this.len - 1, sec * this.srcRate));
  };
  Deck.prototype.seconds = function () {
    return this.srcRate ? this.pos / this.srcRate : 0;
  };

  /* n フレーム分の音を outL / outR に書き、最後まで進んだ時だけ true を返す */
  Deck.prototype.process = function (outL, outR, n) {
    var target = this.hand ? this.handVel : this.motor ? this.factor : 0;
    var tau = this.hand ? TAU_HAND : Math.abs(target) > Math.abs(this.cur) ? TAU_UP : TAU_DOWN;
    var a = 1 - Math.exp(-1 / (tau * this.sr));
    var step = this.srcRate / this.sr;
    var L = this.ch[0],
      Rr = this.ch[1] || this.ch[0];
    var ended = false;
    for (var i = 0; i < n; i++) {
      this.cur += (target - this.cur) * a;
      if (!this.len || (target === 0 && Math.abs(this.cur) < STILL)) {
        if (target === 0) this.cur = 0;
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      this.pos += this.cur * step;
      if (this.pos < 0) {
        this.pos = 0;
        if (this.cur < 0) this.cur = 0;
      } else if (this.pos > this.len - 1) {
        this.pos = this.len - 1;
        if (this.cur > 0) this.cur = 0;
        if (!this.hand && this.motor) {
          this.motor = false;
          ended = true;
        }
      }
      var i0 = Math.floor(this.pos),
        f = this.pos - i0,
        i1 = i0 + 1 < this.len ? i0 + 1 : i0;
      outL[i] = L[i0] + (L[i1] - L[i0]) * f;
      outR[i] = Rr[i0] + (Rr[i1] - Rr[i0]) * f;
    }
    return ended;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { Deck: Deck };

  if (typeof registerProcessor === 'function') {
    class TurntableDeck extends AudioWorkletProcessor {
      constructor() {
        super();
        this.deck = new Deck(sampleRate);
        this.since = 0;
        this.moved = false;
        this.port.onmessage = (e) => {
          var m = e.data;
          if (m.t === 'load') this.deck.load(m.ch, m.rate);
          else if (m.t === 'motor') this.deck.setMotor(m.on, m.factor);
          else if (m.t === 'hand') this.deck.setHand(m.on, m.vel);
          else if (m.t === 'seek') this.deck.seek(m.sec);
          this.report();
        };
      }
      report() {
        this.port.postMessage({ t: 'pos', pos: this.deck.seconds(), cur: this.deck.cur });
      }
      process(inputs, outputs) {
        var out = outputs[0];
        var n = out[0].length;
        var ended = this.deck.process(out[0], out[1] || out[0], n);
        if (ended) this.port.postMessage({ t: 'ended' });
        /* 約 30 回/秒で位置を知らせる。止まった直後に 1 回だけ最後の位置を送る */
        this.since += n;
        if (this.since >= sampleRate / 30) {
          this.since = 0;
          var moving = Math.abs(this.deck.cur) > STILL;
          if (moving || this.moved) this.report();
          this.moved = moving;
        }
        return true;
      }
    }
    registerProcessor('turntable-deck', TurntableDeck);
  }
})(this);
