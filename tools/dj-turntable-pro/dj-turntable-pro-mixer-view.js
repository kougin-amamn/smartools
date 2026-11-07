/* ミキサーの画面: つまみ(ゲイン・HI/MID/LOW・フィルター・マスター)、フェーダー、クロスフェーダー、メーター。
   値は覚えておき、音の部品ができたら applyTo(engine) でまとめて入れる */
(function (root) {
  'use strict';
  var K = root.DJCore;
  var DRAG_RANGE = 160;
  var LEDS = 16;

  function Knob(el, onChange) {
    this.el = el;
    this.min = Number(el.getAttribute('aria-valuemin'));
    this.max = Number(el.getAttribute('aria-valuemax'));
    this.center = Number(el.dataset.center || 0);
    this.value = this.center;
    this.onChange = onChange;
    this.cap = el.querySelector('.knob-cap');
    var self = this,
      drag = null,
      lastTap = 0;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      var now = performance.now();
      /* 2回続けて押すと中央(初期値)に戻る */
      if (now - lastTap < 300) {
        self.set(self.center);
        lastTap = 0;
        return;
      }
      lastTap = now;
      drag = { id: e.pointerId, y: e.clientY, value: self.value };
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      self.set(drag.value + ((drag.y - e.clientY) / DRAG_RANGE) * (self.max - self.min));
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      el.addEventListener(t, function () {
        drag = null;
      });
    });
    el.addEventListener('keydown', function (e) {
      var step = (self.max - self.min) / 40;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') self.set(self.value + step);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') self.set(self.value - step);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    this.show();
  }
  Knob.prototype.set = function (v) {
    v = K.clamp(v, this.min, this.max);
    /* 中央の近くは吸い付かせる(EQ を元に戻しやすく) */
    if (Math.abs(v - this.center) < (this.max - this.min) * 0.015) v = this.center;
    if (v === this.value) return;
    this.value = v;
    this.show();
    this.onChange(v);
  };
  Knob.prototype.show = function () {
    var turn = -135 + ((this.value - this.min) / (this.max - this.min)) * 270;
    this.cap.style.transform = 'rotate(' + turn.toFixed(1) + 'deg)';
    this.el.setAttribute('aria-valuenow', this.value.toFixed(2));
  };

  function MixerView(el, host) {
    var self = this;
    this.host = host;
    this.engine = null;
    this.values = { master: 0.8, crossfader: 0.5, decks: [{}, {}] };
    this.knobs = [];
    el.querySelectorAll('.knob').forEach(function (k) {
      var param = k.dataset.param,
        deck = Number(k.dataset.deck);
      self.knobs.push(
        new Knob(k, function (v) {
          if (param === 'master') self.values.master = v;
          else self.values.decks[deck][param] = v;
          self.apply(param, deck, v);
        }),
      );
    });
    this.knobs.forEach(function (k) {
      if (k.el.dataset.param === 'master') k.value = 0.8;
      k.show();
    });
    el.querySelectorAll('.channel-fader').forEach(function (f) {
      var deck = Number(f.dataset.deck);
      self.values.decks[deck].fader = Number(f.value);
      f.addEventListener('input', function () {
        self.values.decks[deck].fader = Number(f.value);
        self.apply('fader', deck, Number(f.value));
      });
    });
    this.crossfader = el.querySelector('#crossfader');
    this.crossfader.addEventListener('input', function () {
      self.setCrossfader(Number(self.crossfader.value));
    });
    this.meters = [0, 1, 'master'].map(function (which) {
      var m = el.querySelector('[data-meter="' + which + '"]');
      return {
        which: which,
        el: m,
        off: m.querySelector('.meter-off'),
        peak: m.querySelector('.meter-peak'),
        lit: -1,
        hold: 0,
        holdTime: 0,
      };
    });
  }

  MixerView.prototype.setCrossfader = function (x) {
    x = K.clamp(x, 0, 1);
    this.values.crossfader = x;
    this.crossfader.value = x;
    if (this.engine) this.engine.setCrossfader(x, this.host.settings.curve);
  };

  MixerView.prototype.apply = function (param, deck, v) {
    var e = this.engine;
    if (!e) return;
    if (param === 'master') e.setMaster(v);
    else if (param === 'gain') e.setTrim(deck, v);
    else if (param === 'filter') e.setFilter(deck, v);
    else if (param === 'fader') e.setFader(deck, v);
    else e.setBand(deck, param, v);
  };

  MixerView.prototype.applyTo = function (engine) {
    var self = this;
    this.engine = engine;
    this.values.decks.forEach(function (d, i) {
      Object.keys(d).forEach(function (p) {
        self.apply(p, i, d[p]);
      });
    });
    this.apply('master', 0, this.values.master);
    this.setCrossfader(this.values.crossfader);
  };

  /* メーター: -48〜0dB を LED 16個で。最大の所を 0.8秒残す */
  MixerView.prototype.render = function (now) {
    var e = this.engine,
      active = false;
    if (!e) return false;
    this.meters.forEach(function (m) {
      var peak = e.levelOf(m.which);
      var db = peak > 0 ? 20 * Math.log10(peak) : -100;
      var lit = Math.round(K.clamp((db + 48) / 48, 0, 1) * LEDS);
      if (lit >= m.hold || now - m.holdTime > 800) {
        m.hold = lit;
        m.holdTime = now;
        m.peak.style.transform = 'translateY(' + -(m.hold - 1) * 100 + '%)';
        m.peak.hidden = m.hold === 0;
      }
      if (lit !== m.lit) {
        m.lit = lit;
        m.off.style.transform = 'scaleY(' + (1 - lit / LEDS) + ')';
        m.el.dataset.level = lit;
      }
      if (lit > 0 || m.hold > 0) active = true;
    });
    return active;
  };

  root.DJMixerView = MixerView;
})(this);
