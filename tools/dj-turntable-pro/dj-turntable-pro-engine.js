/* 音の部品をつなぐ(AudioContext・2台分の worklet・ミキサー・リミッター・メーター)。dj-turntable-pro-core.js を使う。
   画面からは send() と set…() だけを呼ぶ */
(function (root) {
  'use strict';
  var K = root.DJCore;
  var SMOOTH = 0.012;

  function DJEngine() {
    this.context = null;
    this.node = null;
    this.queue = [];
    this.channels = [];
    this.curve = 'smooth';
    this.crossfader = 0.5;
    this.onMessage = function () {};
    this.buffer = new Float32Array(512);
  }

  DJEngine.isSupported = function () {
    var AC = root.AudioContext || root.webkitAudioContext;
    return !!AC && 'audioWorklet' in AC.prototype && typeof AudioWorkletNode !== 'undefined';
  };

  /* タップの中で呼ぶ(AudioContext は利用者の操作の中で作って鳴らす決まり) */
  DJEngine.prototype.start = function () {
    if (this.ready) return this.ready;
    var AC = root.AudioContext || root.webkitAudioContext;
    var ctx = (this.context = new AC({ latencyHint: 'interactive' }));
    ctx.resume();
    var self = this;
    this.ready = ctx.audioWorklet.addModule('../../common/turntable-worklet.js').then(function () {
      self.build();
      return self;
    });
    return this.ready;
  };

  DJEngine.prototype.build = function () {
    var ctx = this.context,
      self = this;
    this.node = new AudioWorkletNode(ctx, 'turntable-decks', {
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.node.port.onmessage = function (e) {
      self.onMessage(e.data);
    };
    this.master = ctx.createGain();
    this.master.gain.value = K.volumeOf(0.8);
    /* 音割れを防ぐリミッター(ほぼ天井で止める) */
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.masterMeter = this.meterOf(limiter);
    for (var i = 0; i < 2; i++) this.channels.push(this.channelOf(i));
    this.setCrossfader(this.crossfader, this.curve);
    this.queue.forEach(function (q) {
      self.node.port.postMessage(q.message, q.transfer);
    });
    this.queue = [];
  };

  DJEngine.prototype.meterOf = function (source) {
    var a = this.context.createAnalyser();
    a.fftSize = 512;
    source.connect(a);
    return a;
  };

  /* 1チャンネル: ゲイン → アイソレーター(LR4 で3帯域) → フィルター → フェーダー → クロスフェーダー */
  DJEngine.prototype.channelOf = function (index) {
    var ctx = this.context;
    function biquad(type, frequency) {
      var b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = frequency;
      b.Q.value = Math.SQRT1_2;
      return b;
    }
    function chain(source, list) {
      return list.reduce(function (from, to) {
        from.connect(to);
        return to;
      }, source);
    }
    var trim = ctx.createGain(),
      sum = ctx.createGain();
    var bands = { low: ctx.createGain(), mid: ctx.createGain(), high: ctx.createGain() };
    chain(trim, [biquad('lowpass', 250), biquad('lowpass', 250), bands.low, sum]);
    chain(trim, [
      biquad('highpass', 250),
      biquad('highpass', 250),
      biquad('lowpass', 2500),
      biquad('lowpass', 2500),
      bands.mid,
      sum,
    ]);
    chain(trim, [biquad('highpass', 2500), biquad('highpass', 2500), bands.high, sum]);
    var filter = biquad('lowpass', 22000),
      fader = ctx.createGain(),
      cross = ctx.createGain();
    chain(sum, [filter, fader, cross, this.master]);
    fader.gain.value = K.volumeOf(0.8);
    this.node.connect(trim, index, 0);
    return {
      trim: trim,
      bands: bands,
      filter: filter,
      fader: fader,
      cross: cross,
      meter: this.meterOf(fader),
    };
  };

  DJEngine.prototype.send = function (message, transfer) {
    if (this.node) this.node.port.postMessage(message, transfer || []);
    else this.queue.push({ message: message, transfer: transfer || [] });
  };

  DJEngine.prototype.ramp = function (param, value) {
    if (this.context) param.setTargetAtTime(value, this.context.currentTime, SMOOTH);
  };

  DJEngine.prototype.setTrim = function (deck, value) {
    if (this.channels[deck]) this.ramp(this.channels[deck].trim.gain, K.trimGainOf(value));
  };
  DJEngine.prototype.setBand = function (deck, band, value) {
    if (this.channels[deck])
      this.ramp(this.channels[deck].bands[band].gain, K.isolatorGainOf(value));
  };
  DJEngine.prototype.setFilter = function (deck, value) {
    var ch = this.channels[deck];
    if (!ch) return;
    var f = K.filterOf(value);
    ch.filter.type = f.type;
    this.ramp(ch.filter.frequency, f.frequency);
    this.ramp(ch.filter.Q, f.q);
  };
  DJEngine.prototype.setFader = function (deck, value) {
    if (this.channels[deck]) this.ramp(this.channels[deck].fader.gain, K.volumeOf(value));
  };
  DJEngine.prototype.setCrossfader = function (x, curve) {
    this.crossfader = x;
    this.curve = curve || this.curve;
    if (!this.channels.length) return;
    var g = K.crossfaderGainsOf(x, this.curve);
    this.ramp(this.channels[0].cross.gain, g.a);
    this.ramp(this.channels[1].cross.gain, g.b);
  };
  DJEngine.prototype.setMaster = function (value) {
    if (this.master) this.ramp(this.master.gain, K.volumeOf(value));
  };

  /* メーターの最大の振れ(0〜1)。which は 0 / 1 / 'master' */
  DJEngine.prototype.levelOf = function (which) {
    var a =
      which === 'master' ? this.masterMeter : this.channels[which] && this.channels[which].meter;
    if (!a) return 0;
    a.getFloatTimeDomainData(this.buffer);
    var m = 0;
    for (var i = 0; i < this.buffer.length; i++) {
      var v = Math.abs(this.buffer[i]);
      if (v > m) m = v;
    }
    return m;
  };

  DJEngine.prototype.decode = function (file) {
    var ctx = this.context;
    return file.arrayBuffer().then(function (data) {
      return ctx.decodeAudioData(data);
    });
  };

  /* 展開した音を Int16 にして worklet へ所有ごと渡す(記憶領域が半分になる)。解析用のモノラル 約11kHz も作る */
  DJEngine.prototype.load = function (deck, audio) {
    function int16Of(f) {
      var out = new Int16Array(f.length);
      for (var i = 0; i < f.length; i++) {
        var v = f[i];
        out[i] = (v > 1 ? 1 : v < -1 ? -1 : v) * 32767;
      }
      return out;
    }
    var left = audio.getChannelData(0),
      right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
    var factor = Math.max(1, Math.round(audio.sampleRate / 11025)),
      mono = new Float32Array(Math.floor(left.length / factor));
    for (var i = 0; i < mono.length; i++) {
      var s = 0;
      for (var j = 0; j < factor; j++) {
        var k = i * factor + j;
        s += right ? (left[k] + right[k]) * 0.5 : left[k];
      }
      mono[i] = s / factor;
    }
    var l16 = int16Of(left),
      r16 = right ? int16Of(right) : null;
    this.send(
      { type: 'load', deck: deck, left: l16, right: r16, sampleRate: audio.sampleRate },
      r16 ? [l16.buffer, r16.buffer] : [l16.buffer],
    );
    return { mono: mono, rate: audio.sampleRate / factor };
  };

  root.DJEngine = DJEngine;
})(this);
