/* アナログ時計の画面処理(文字・針の計算や設定の検証は analog-clock-core.js)
   文字盤は SVG で描く(座標は中心が 0,0、外側の半径が 98) */
(function () {
  'use strict';
  var C = window.AClockCore,
    KEY = 'analog-clock-settings',
    NS = 'http://www.w3.org/2000/svg';
  var svg = document.getElementById('clockSvg'),
    st = C.DEFAULTS,
    hands = {},
    timer = 0;
  var R_OUT = 98;

  function load() {
    try {
      return C.sanitize(JSON.parse(localStorage.getItem(KEY)));
    } catch (e) {
      log.warn('設定を読み込めなかったので初期設定にしました', e);
      return C.sanitize(null);
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      log.warn('設定を保存できませんでした', e);
    }
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag),
      k;
    for (k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pol(r, deg) {
    var a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  function fontStack() {
    return C.FONTS.filter(function (f) {
      return f.id === st.font;
    })[0].stack;
  }

  /* 文字や針にかける効果(SVG フィルタ) */
  function defs(parent, color) {
    var d = el('defs', {}, parent),
      f;
    f = el('filter', { id: 'f-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, d);
    el(
      'feDropShadow',
      { dx: '1', dy: '1.6', stdDeviation: '1.1', 'flood-color': '#000', 'flood-opacity': '.65' },
      f
    );
    f = el('filter', { id: 'f-glow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, d);
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '2.2', result: 'b' }, f);
    var m = el('feMerge', {}, f);
    el('feMergeNode', { in: 'b' }, m);
    el('feMergeNode', { in: 'b' }, m);
    el('feMergeNode', { in: 'SourceGraphic' }, m);
    f = el('filter', { id: 'f-emboss', x: '-30%', y: '-30%', width: '160%', height: '160%' }, d);
    el(
      'feDropShadow',
      {
        in: 'SourceGraphic',
        dx: '.9',
        dy: '.9',
        stdDeviation: '.25',
        'flood-color': '#000',
        'flood-opacity': '.75',
        result: 'a',
      },
      f
    );
    el(
      'feDropShadow',
      { in: 'a', dx: '-.7', dy: '-.7', stdDeviation: '.25', 'flood-color': '#fff', 'flood-opacity': '.65' },
      f
    );
    var g = el('linearGradient', { id: 'g-bezel', x1: '0', y1: '0', x2: '1', y2: '1' }, d);
    [
      ['0', '#f2f2f5'],
      ['.25', '#8d8d95'],
      ['.5', '#e6e6ea'],
      ['.75', '#6f6f78'],
      ['1', '#d4d4da'],
    ].forEach(function (s) {
      el('stop', { offset: s[0], 'stop-color': s[1] }, g);
    });
  }

  /* フレームを描き、文字盤の半径を返す */
  function drawFrame(parent, color, face) {
    var w = st.frame === 'none' ? 0 : st.fwidth,
      rf = R_OUT - w;
    el('circle', { cx: 0, cy: 0, r: R_OUT, fill: face }, parent);
    if (st.frame === 'single')
      el(
        'circle',
        { cx: 0, cy: 0, r: R_OUT - w / 2, fill: 'none', stroke: color, 'stroke-width': w },
        parent
      );
    else if (st.frame === 'double') {
      el(
        'circle',
        { cx: 0, cy: 0, r: R_OUT - w * 0.18, fill: 'none', stroke: color, 'stroke-width': w * 0.36 },
        parent
      );
      el(
        'circle',
        { cx: 0, cy: 0, r: R_OUT - w * 0.82, fill: 'none', stroke: color, 'stroke-width': w * 0.36 },
        parent
      );
    } else if (st.frame === 'bezel') {
      el(
        'circle',
        { cx: 0, cy: 0, r: R_OUT - w / 2, fill: 'none', stroke: 'url(#g-bezel)', 'stroke-width': w },
        parent
      );
      el(
        'circle',
        { cx: 0, cy: 0, r: R_OUT - w - 0.4, fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 0.8 },
        parent
      );
    } else if (st.frame === 'neon') {
      el(
        'circle',
        {
          cx: 0,
          cy: 0,
          r: R_OUT - w / 2,
          fill: 'none',
          stroke: color,
          'stroke-width': Math.max(0.8, w * 0.5),
          filter: 'url(#f-glow)',
        },
        parent
      );
    } else if (st.frame === 'dots') {
      var rr = R_OUT - w / 2,
        circ = 2 * Math.PI * rr,
        n = Math.max(12, Math.round(circ / (w * 2)));
      el(
        'circle',
        {
          cx: 0,
          cy: 0,
          r: rr,
          fill: 'none',
          stroke: color,
          'stroke-width': w,
          'stroke-linecap': 'round',
          'stroke-dasharray': '0.01 ' + (circ / n - 0.01),
        },
        parent
      );
    }
    return rf;
  }

  function build() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var color = st.color,
      face = C.faceFor(color),
      g = el('g', { transform: 'translate(100 100)' }, svg);
    defs(g, color);
    var rf = drawFrame(g, color, face);
    var filt = { shadow: 'url(#f-shadow)', glow: 'url(#f-glow)', emboss: 'url(#f-emboss)' }[st.effect];

    /* 目盛り(分・時) */
    var ticks = el('g', { stroke: color, 'stroke-linecap': 'round' }, g),
      i,
      p1,
      p2;
    for (i = 0; i < 60; i++) {
      var big = i % 5 === 0;
      p1 = pol(rf - 2.5, i * 6);
      p2 = pol(rf - 2.5 - (big ? 5 : 2), i * 6);
      el(
        'line',
        {
          x1: p1[0],
          y1: p1[1],
          x2: p2[0],
          y2: p2[1],
          'stroke-width': big ? 1.6 : 0.6,
          opacity: big ? 1 : 0.7,
        },
        ticks
      );
    }

    /* 文字(時の位置に 12 個) */
    var fs = (rf * 0.16 * st.size) / 100,
      rr = rf - 10 - fs * 0.7;
    var tg = el(
      'g',
      { fill: color, 'font-family': fontStack(), 'text-anchor': 'middle', 'dominant-baseline': 'central' },
      g
    );
    if (filt) tg.setAttribute('filter', filt);
    if (st.effect === 'outline') {
      tg.setAttribute('fill', face);
      tg.setAttribute('stroke', color);
      tg.setAttribute('stroke-width', Math.max(0.5, fs * 0.04));
      tg.setAttribute('paint-order', 'stroke');
    }
    var labels = C.CHARS.filter(function (c) {
      return c.id === st.chars;
    })[0].labels;
    labels.forEach(function (text, k) {
      var deg = (k + 1) * 30,
        p = pol(rr, deg);
      var t = el('text', { x: p[0], y: p[1], 'font-size': fs * C.labelScale(text) }, tg);
      if (st.orient === 'radial')
        t.setAttribute('transform', 'rotate(' + deg + ' ' + p[0] + ' ' + p[1] + ')');
      t.textContent = text;
    });

    /* 針 */
    var hg = el('g', { stroke: color, 'stroke-linecap': 'round' }, g);
    if (filt) hg.setAttribute('filter', filt);
    hands.hour = el('line', { x1: 0, y1: 6, x2: 0, y2: -rf * 0.5, 'stroke-width': 4.2 }, hg);
    hands.minute = el('line', { x1: 0, y1: 8, x2: 0, y2: -rf * 0.74, 'stroke-width': 2.8 }, hg);
    hands.second = el('line', { x1: 0, y1: 12, x2: 0, y2: -rf * 0.84, 'stroke-width': 1.1 }, hg);
    el('circle', { cx: 0, cy: 0, r: 3.4, fill: color }, hg);
    el('circle', { cx: 0, cy: 0, r: 1.3, fill: face }, hg);
    update();
  }

  function update() {
    var a = C.handAngles(new Date());
    hands.hour.setAttribute('transform', 'rotate(' + a.hour + ')');
    hands.minute.setAttribute('transform', 'rotate(' + a.minute + ')');
    hands.second.setAttribute('transform', 'rotate(' + a.second + ')');
  }
  function tick() {
    update();
    timer = setTimeout(tick, C.msToNextSecond(Date.now()));
  }

  /* 設定の画面部品 */
  function $(id) {
    return document.getElementById(id);
  }
  function fill(id, list) {
    $(id).innerHTML = list
      .map(function (x) {
        return '<option value="' + x.id + '">' + x.name + '</option>';
      })
      .join('');
  }

  function refreshControls() {
    $('chars').value = st.chars;
    $('font').value = st.font;
    $('effect').value = st.effect;
    $('frame').value = st.frame;
    $('size').value = st.size;
    $('sizeVal').textContent = st.size + '%';
    $('fwidth').value = st.fwidth;
    $('fwidthVal').textContent = st.fwidth;
    $('fwidthRow').classList.toggle('off', st.frame === 'none');
    $('fwidth').disabled = st.frame === 'none';
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === st.orient);
    });
    document.querySelectorAll('.sw').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === st.color);
    });
    $('colorFree').value = st.color;
    var tid = C.matchTemplate(st);
    document.querySelectorAll('.tpl').forEach(function (b) {
      b.classList.toggle('on', b.dataset.id === tid);
    });
  }
  function apply() {
    refreshControls();
    build();
  }
  function set(key, val) {
    st[key] = val;
    save();
    apply();
  }

  fill('chars', C.CHARS);
  fill('font', C.FONTS);
  fill('effect', C.EFFECTS);
  fill('frame', C.FRAMES);
  $('orientSeg').innerHTML = C.ORIENTS.map(function (o) {
    return (
      '<button type="button" class="seg-btn" data-v="' +
      o.id +
      '" data-log="文字の向き ' +
      o.name +
      '">' +
      o.name +
      '</button>'
    );
  }).join('');
  $('colorSw').innerHTML =
    C.TEXT_COLORS.map(function (c) {
      return (
        '<button type="button" class="sw" data-v="' +
        c[1] +
        '" style="background:' +
        c[1] +
        '" aria-label="文字色 ' +
        c[0] +
        '" data-log="文字色 ' +
        c[0] +
        '"></button>'
      );
    }).join('') +
    '<label class="color-free">自由に選ぶ<input type="color" id="colorFree" data-log="文字色" aria-label="文字色 自由に選ぶ"></label>';
  $('tplList').innerHTML = C.TEMPLATES.map(function (t) {
    return (
      '<button type="button" class="tpl" data-id="' +
      t.id +
      '" data-log="テンプレート ' +
      t.name +
      '"><b>' +
      t.name +
      '</b><small>' +
      t.desc +
      '</small></button>'
    );
  }).join('');
  $('size').min = C.SIZE_MIN;
  $('size').max = C.SIZE_MAX;
  $('fwidth').min = C.FW_MIN;
  $('fwidth').max = C.FW_MAX;

  $('chars').onchange = function (e) {
    set('chars', e.target.value);
  };
  $('font').onchange = function (e) {
    set('font', e.target.value);
  };
  $('effect').onchange = function (e) {
    set('effect', e.target.value);
  };
  $('frame').onchange = function (e) {
    set('frame', e.target.value);
  };
  $('orientSeg').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (b) set('orient', b.dataset.v);
  });
  $('colorSw').addEventListener('click', function (e) {
    var b = e.target.closest('.sw');
    if (b) set('color', b.dataset.v);
  });
  $('colorFree').addEventListener('change', function (e) {
    set('color', e.target.value.toLowerCase());
  });
  $('size').oninput = function () {
    $('sizeVal').textContent = $('size').value + '%';
    st.size = Number($('size').value);
    build();
  };
  $('size').onchange = function () {
    set('size', Number($('size').value));
  };
  $('fwidth').oninput = function () {
    $('fwidthVal').textContent = $('fwidth').value;
    st.fwidth = Number($('fwidth').value);
    build();
  };
  $('fwidth').onchange = function () {
    set('fwidth', Number($('fwidth').value));
  };
  $('tplList').addEventListener('click', function (e) {
    var b = e.target.closest('.tpl');
    if (!b) return;
    var t = C.TEMPLATES.filter(function (x) {
      return x.id === b.dataset.id;
    })[0];
    st = C.sanitize(t.s);
    save();
    apply();
    log('テンプレート「' + t.name + '」を適用しました');
  });
  $('resetBtn').onclick = function () {
    st = C.sanitize(null);
    save();
    apply();
    log('設定を初期に戻しました');
  };

  st = load();
  apply();
  tick();
  log('起動しました (' + st.chars + ' / ' + st.orient + ' / ' + st.font + ' / ' + st.frame + ')');
})();
