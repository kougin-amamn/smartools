/* 先に1回だけ描いておく絵(盤の縁・ストロボの点・レコードとラベル・動かない光)。dj-turntable-pro-core.js を使う。
   毎フレームは CSS の rotate で回すだけにして、描き直さない */
(function (root) {
  'use strict';
  var K = root.DJCore,
    P = K.PLINTH;

  /* 画面の大きさ(CSS px)に端末の倍率を掛け、長い辺 1024px までにする */
  function prepare(canvas, cssSize) {
    var px = Math.min(1024, Math.round(cssSize * Math.min(root.devicePixelRatio || 1, 2.5)));
    canvas.width = canvas.height = px;
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, px, px);
    return { g: g, size: px, c: px / 2 };
  }

  /* 同じ曲で同じ模様になる乱数(溝のむら) */
  function randomOf(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  /* 盤の縁: 削り出しのアルミを、細い同心円の明暗と斜めの光で。中は黒いスリップマット */
  function drawRim(canvas, cssSize) {
    var t = prepare(canvas, cssSize),
      g = t.g,
      c = t.c,
      r = c;
    var inner = (r * P.recordRadius) / P.platterRadius;
    var grad = g.createRadialGradient(c, c, inner, c, c, r);
    grad.addColorStop(0, '#6f737b');
    grad.addColorStop(0.18, '#c9ccd2');
    grad.addColorStop(0.6, '#eef0f3');
    grad.addColorStop(0.86, '#a7abb3');
    grad.addColorStop(1, '#4d5057');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    var rand = randomOf(7);
    g.lineWidth = Math.max(0.5, t.size / 1600);
    for (var x = inner; x < r; x += g.lineWidth * 1.5) {
      g.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)';
      g.beginPath();
      g.arc(c, c, x, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#0d0d0f';
    g.beginPath();
    g.arc(c, c, inner * 1.004, 0, Math.PI * 2);
    g.fill();
  }

  /* ストロボの点: 2列(外が 0% の 180個 = 2度おき、内が +3.3% の 174個)。
     出っ張った点を、上の縁を明るく下を暗くして描く。CSS で見かけの流れだけ回す */
  function drawStrobe(canvas, cssSize) {
    var t = prepare(canvas, cssSize),
      g = t.g,
      c = t.c;
    var rim = c * (1 - P.recordRadius / P.platterRadius);
    [
      [c - rim * 0.3, 180],
      [c - rim * 0.68, 174],
    ].forEach(function (row) {
      var ring = row[0],
        count = row[1],
        w = Math.max(1, rim * 0.22),
        h = Math.max(1, (Math.PI * 2 * ring) / count / 2.1);
      for (var i = 0; i < count; i++) {
        var a = (i * Math.PI * 2) / count;
        g.save();
        g.translate(c + Math.cos(a) * ring, c + Math.sin(a) * ring);
        g.rotate(a);
        g.fillStyle = 'rgba(28,29,33,0.92)';
        g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(-w / 2, -h / 2, w, Math.max(0.5, h * 0.25));
        g.restore();
      }
    });
  }

  /* レコード: 黒い盤に溝の明暗、曲の切れ目(無音)を光る帯で。真ん中にラベル */
  function drawRecord(canvas, cssSize, info) {
    var t = prepare(canvas, cssSize),
      g = t.g,
      c = t.c,
      scale = c / P.recordRadius;
    g.fillStyle = '#0c0c0e';
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();
    var rand = randomOf(info.seed || 1);
    var outer = P.grooveOuter * scale,
      inner = P.grooveInner * scale;
    g.lineWidth = Math.max(0.5, t.size / 1600);
    for (var x = inner; x < outer; x += g.lineWidth * 1.4) {
      g.strokeStyle = 'rgba(255,255,255,' + (0.025 + rand() * 0.045).toFixed(3) + ')';
      g.beginPath();
      g.arc(c, c, x, 0, Math.PI * 2);
      g.stroke();
    }
    var span = outer - inner;
    (info.silences || []).forEach(function (s) {
      if (!info.duration) return;
      var r0 = outer - (s[0] / info.duration) * span,
        r1 = outer - (s[1] / info.duration) * span;
      g.strokeStyle = '#18181c';
      g.lineWidth = Math.max(1, r0 - r1);
      g.beginPath();
      g.arc(c, c, (r0 + r1) / 2, 0, Math.PI * 2);
      g.stroke();
    });
    /* 縁の盛り上がりと、溝の無い所(内側の送り溝) */
    g.lineWidth = Math.max(1, t.size / 300);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(c, c, c - g.lineWidth, 0, Math.PI * 2);
    g.stroke();
    drawLabel(g, c, P.labelRadius * scale, info, t.size);
  }

  function drawLabel(g, c, r, info, size) {
    g.fillStyle = info.color || '#c9b28a';
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    var rand = randomOf((info.seed || 1) + 3);
    for (var i = 0; i < 260; i++) {
      var a = rand() * Math.PI * 2,
        d = Math.sqrt(rand()) * r;
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
      g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, size / 700, size / 700);
    }
    g.strokeStyle = 'rgba(20,20,24,0.35)';
    g.lineWidth = Math.max(0.5, size / 1200);
    g.beginPath();
    g.arc(c, c, r * 0.9, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(20,20,24,0.85)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var lines = linesOf(info.title || '', 9);
    var font = Math.max(6, r * 0.2);
    g.font = '600 ' + font + 'px system-ui, sans-serif';
    lines.forEach(function (line, k) {
      g.fillText(line, c, c - r * 0.42 + k * font * 1.15, r * 1.5);
    });
    g.font = '500 ' + font * 0.7 + 'px system-ui, sans-serif';
    g.fillText(info.side || '', c, c + r * 0.5);
    g.fillText('33⅓ RPM', c, c + r * 0.7);
  }

  function linesOf(title, width) {
    var chars = Array.from(title);
    if (chars.length <= width) return [title];
    var rest = chars.slice(width);
    return [
      chars.slice(0, width).join(''),
      rest.length > width ? rest.slice(0, width - 1).join('') + '…' : rest.join(''),
    ];
  }

  /* 動かない光: 溝に当たる斜めの反射と、左下のストロボの灯り。盤が回っても光は動かない */
  function drawGlare(canvas, cssSize) {
    var t = prepare(canvas, cssSize),
      g = t.g,
      c = t.c;
    var recordR = (c * P.recordRadius) / P.platterRadius,
      labelR = (c * P.labelRadius) / P.platterRadius;
    g.save();
    g.beginPath();
    g.arc(c, c, recordR, 0, Math.PI * 2);
    g.arc(c, c, labelR, 0, Math.PI * 2, true);
    g.clip('evenodd');
    if (g.createConicGradient) {
      var sheen = g.createConicGradient(-Math.PI / 4, c, c);
      [0, 0.06, 0.12, 0.5, 0.56, 0.62, 1].forEach(function (p, k) {
        sheen.addColorStop(p, k % 3 === 1 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0)');
      });
      g.fillStyle = sheen;
      g.fillRect(0, 0, t.size, t.size);
    }
    g.restore();
    var lamp = g.createRadialGradient(c * 0.2, c * 1.8, 0, c * 0.2, c * 1.8, c * 0.35);
    lamp.addColorStop(0, 'rgba(255,120,60,0.2)');
    lamp.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, t.size, t.size);
  }

  root.DJTextures = {
    drawRim: drawRim,
    drawStrobe: drawStrobe,
    drawRecord: drawRecord,
    drawGlare: drawGlare,
  };
})(this);
