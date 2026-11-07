/* 波形の画面: 2台分の拡大波形を上下に重ね、拍の線・キュー・今の位置を描く。dj-turntable-pro-core.js を使う。
   波形は読み込み時に幅 4096 のタイルへ帯域の色で描いておき、毎フレームは写すだけにする */
(function (root) {
  'use strict';
  var K = root.DJCore;
  var TILE = 4096;
  var PX_PER_SECOND = 75;
  /* 低=赤寄り・中=緑寄り・高=青寄り(rekordbox の3色の考え方を淡くした物) */
  var BAND_COLORS = ['rgba(232,104,96,0.9)', 'rgba(132,214,150,0.85)', 'rgba(150,190,255,0.85)'];

  function WaveView(canvas, onSeek) {
    var self = this;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.lanes = [null, null];
    this.ratio = 1;
    this.resize();
    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var deck = e.clientY - rect.top < rect.height / 2 ? 0 : 1,
        lane = self.lanes[deck];
      if (!lane) return;
      var t = lane.shownPos + (e.clientX - rect.left - rect.width / 2) / PX_PER_SECOND;
      onSeek(deck, K.clamp(t, 0, lane.duration));
    });
  }

  WaveView.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var ratio = Math.min(root.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    if (ratio !== this.ratio) {
      this.ratio = ratio;
      for (var i = 0; i < 2; i++) if (this.lanes[i]) this.setTrack(i, this.lanes[i].source);
    }
  };

  WaveView.prototype.laneHeight = function () {
    return Math.floor(this.canvas.height / 2);
  };

  /* source: { points(Uint8Array: 振れ・低・中・高), duration, bpm, firstBeat, cue } */
  WaveView.prototype.setTrack = function (deck, source) {
    var count = source.points.length / 4,
      h = Math.max(8, Math.round(30 * this.ratio)),
      mid = h / 2,
      tiles = [];
    for (var start = 0; start < count; start += TILE) {
      var w = Math.min(TILE, count - start);
      var tile = document.createElement('canvas');
      tile.width = w;
      tile.height = h;
      var g = tile.getContext('2d');
      for (var band = 0; band < 3; band++) {
        g.fillStyle = BAND_COLORS[band];
        for (var x = 0; x < w; x++) {
          var o = (start + x) * 4;
          var size = (source.points[o + 1 + band] / 255) * (band === 0 ? 1 : 0.8) * mid;
          var peak = (source.points[o] / 255) * mid;
          size = Math.min(peak, size);
          if (size >= 0.5) g.fillRect(x, mid - size, 1, size * 2);
        }
      }
      tiles.push(tile);
    }
    this.lanes[deck] = { source: source, tiles: tiles, duration: source.duration, shownPos: 0 };
  };

  WaveView.prototype.render = function (positions) {
    var g = this.g,
      W = this.canvas.width,
      H = this.laneHeight(),
      r = this.ratio;
    g.clearRect(0, 0, W, this.canvas.height);
    var scale = (PX_PER_SECOND * r) / 150;
    for (var deck = 0; deck < 2; deck++) {
      var lane = this.lanes[deck],
        y = deck * H;
      g.fillStyle = deck ? '#141519' : '#17181d';
      g.fillRect(0, y, W, H);
      if (!lane) continue;
      var pos = (lane.shownPos = positions[deck]);
      var t0 = pos - W / 2 / (PX_PER_SECOND * r),
        t1 = pos + W / 2 / (PX_PER_SECOND * r);
      var s = lane.source;
      K.beatsBetween(s.bpm, s.firstBeat, t0, t1).forEach(function (b) {
        g.fillStyle = b.isBar ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
        g.fillRect(Math.round((b.time - t0) * PX_PER_SECOND * r), y, Math.max(1, r), H);
      });
      lane.tiles.forEach(function (tile, i) {
        var ts = (i * TILE) / 150,
          te = ts + tile.width / 150;
        if (te < t0 || ts > t1) return;
        g.drawImage(tile, (ts - t0) * PX_PER_SECOND * r, y, tile.width * scale, H);
      });
      g.fillStyle = 'rgba(10,10,12,0.45)';
      g.fillRect(0, y, W / 2, H);
      [s.cue].concat(s.hotCues || []).forEach(function (c, i) {
        if (c == null || c < t0 || c > t1) return;
        var x = (c - t0) * PX_PER_SECOND * r;
        g.fillStyle = i ? '#7fe0d2' : '#ffd43b';
        g.beginPath();
        g.moveTo(x - 4 * r, y);
        g.lineTo(x + 4 * r, y);
        g.lineTo(x, y + 6 * r);
        g.fill();
      });
    }
    g.fillStyle = '#ffffff';
    g.fillRect(
      Math.round(W / 2) - Math.round(r / 2),
      0,
      Math.max(1, Math.round(r)),
      this.canvas.height,
    );
  };

  root.DJWaveView = WaveView;
})(this);
