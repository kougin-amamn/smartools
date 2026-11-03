/* デジタル時計の画面処理(整形・設定の検証は digital-clock-core.js) */
(function () {
  'use strict';
  var C = window.ClockCore,
    KEY = 'digital-clock-settings';
  var screenEl = document.getElementById('screen'),
    clockEl = document.getElementById('clock');
  var sizeEl = document.getElementById('size'),
    sizeVal = document.getElementById('sizeVal'),
    warnEl = document.getElementById('warn');
  var st = C.DEFAULTS,
    timer = 0,
    lastKey = '';

  /* 保存・読み込み */
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

  /* 7セグメント文字(SVG) */
  /* 各桁の点灯する部分 a上 b右上 c右下 d下 e左下 f左上 g中 */
  var SEG = {
    0: 'abcdef',
    1: 'bc',
    2: 'abged',
    3: 'abgcd',
    4: 'fgbc',
    5: 'afgcd',
    6: 'afgedc',
    7: 'abc',
    8: 'abcdefg',
    9: 'abcdfg',
  };
  var POLY = {
    a: '10,6 14,2 46,2 50,6 46,10 14,10',
    d: '10,94 14,90 46,90 50,94 46,98 14,98',
    g: '10,50 14,46 46,46 50,50 46,54 14,54',
    f: '6,10 10,14 10,46 6,50 2,46 2,14',
    e: '6,54 10,58 10,86 6,90 2,86 2,58',
    b: '54,10 58,14 58,46 54,50 50,46 50,14',
    c: '54,54 58,58 58,86 54,90 50,86 50,58',
  };
  function digitSvg(ch) {
    var on = SEG[ch],
      out = '<svg viewBox="0 0 60 100" aria-hidden="true">';
    'abcdefg'.split('').forEach(function (s) {
      out +=
        '<polygon points="' +
        POLY[s] +
        '" fill="currentColor"' +
        (on.indexOf(s) < 0 ? ' opacity=".09"' : '') +
        '/>';
    });
    return out + '</svg>';
  }
  var COLON =
    '<svg class="colon" viewBox="0 0 20 100" aria-hidden="true"><circle cx="10" cy="32" r="6" fill="currentColor"/><circle cx="10" cy="68" r="6" fill="currentColor"/></svg>';

  var esc = ToolKit.esc;
  function timeHtml(text, seg) {
    if (!seg) return esc(text);
    return text
      .split('')
      .map(function (ch) {
        if (SEG[ch]) return digitSvg(ch);
        if (ch === ':') return COLON;
        return '<span class="u">' + esc(ch) + '</span>'; // 時・分・秒の文字
      })
      .join('');
  }

  /* 描画 */
  function fontStack() {
    return C.FONTS.filter(function (f) {
      return f.id === st.font;
    })[0].stack;
  }

  function render() {
    var o = C.formatClock(new Date(), st.format),
      seg = st.font === 'seg';
    var html =
      (o.date ? '<div class="date">' + esc(o.date) + '</div>' : '') +
      '<div class="row">' +
      (o.ampm ? '<span class="ampm">' + o.ampm + '</span>' : '') +
      '<span class="t">' +
      timeHtml(o.time, seg) +
      '</span></div>';
    /* 桁が変わらない限り中身は同じ構造。毎秒の書き換えでも幅は変わらない(等幅数字) */
    clockEl.innerHTML = html;
  }

  /* 画面の幅に対する割合(size)になるよう文字サイズを合わせる。形式・フォント・サイズ・画面幅が変わった時だけ測り直す */
  function fit() {
    var avail =
      screenEl.clientWidth -
      parseFloat(getComputedStyle(screenEl).paddingLeft) * 2 -
      2 * (parseFloat(getComputedStyle(screenEl).borderLeftWidth) || 0);
    clockEl.style.fontSize = '100px';
    var natural = clockEl.scrollWidth || 1;
    var px = Math.max(8, (100 * avail * (st.size / 100)) / natural);
    clockEl.style.fontSize = px + 'px';
    screenEl.style.minHeight = Math.round(px * 1.8) + 'px';
  }

  function apply() {
    screenEl.style.background = st.bg;
    screenEl.style.setProperty('--fg', st.color);
    screenEl.dataset.frame = st.frame;
    clockEl.style.fontFamily = fontStack();
    sizeEl.value = st.size;
    sizeVal.textContent = st.size + '%';
    document.getElementById('format').value = st.format;
    document.getElementById('font').value = st.font;
    document.getElementById('frame').value = st.frame;
    document.querySelectorAll('.sw').forEach(function (b) {
      b.classList.toggle('on', b.dataset.kind === 'color' ? b.dataset.v === st.color : b.dataset.v === st.bg);
    });
    document.getElementById('colorFree').value = st.color;
    document.getElementById('bgFree').value = st.bg;
    var low = C.contrast(st.color, st.bg) < 2;
    warnEl.textContent = low ? '文字色と背景色が近く、見えにくい可能性があります' : '';
    if (low && lastKey !== 'low') log.warn('文字色と背景色が近く、見えにくい可能性があります');
    lastKey = low ? 'low' : '';
    render();
    fit();
  }

  /* 1秒ごとの更新(秒の切り替わりに合わせる。裏タブで遅れても次回に補正される) */
  function tick() {
    render();
    timer = setTimeout(tick, C.msToNextSecond(Date.now()));
  }

  /* 操作 */
  function set(key, val) {
    st[key] = val;
    save();
    apply();
  }
  function fill(id, list) {
    document.getElementById(id).innerHTML = list
      .map(function (x) {
        return '<option value="' + x.id + '">' + x.name + '</option>';
      })
      .join('');
  }
  function swatches(id, kind, list, free, label) {
    var box = document.getElementById(id);
    box.innerHTML =
      list
        .map(function (c) {
          return (
            '<button type="button" class="sw" data-kind="' +
            kind +
            '" data-v="' +
            c[1] +
            '" style="background:' +
            c[1] +
            '" aria-label="' +
            label +
            ' ' +
            c[0] +
            '" data-log="' +
            label +
            ' ' +
            c[0] +
            '"></button>'
          );
        })
        .join('') +
      '<label class="color-free">自由に選ぶ<input type="color" id="' +
      free +
      '" data-log="' +
      label +
      '" aria-label="' +
      label +
      ' 自由に選ぶ"></label>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.sw');
      if (b) set(kind, b.dataset.v);
    });
    document.getElementById(free).addEventListener('change', function (e) {
      set(kind, e.target.value.toLowerCase());
    });
  }

  fill('format', C.FORMATS);
  fill('font', C.FONTS);
  fill('frame', C.FRAMES);
  swatches('colorSw', 'color', C.TEXT_COLORS, 'colorFree', '文字色');
  swatches('bgSw', 'bg', C.BG_COLORS, 'bgFree', '背景色');
  sizeEl.min = C.SIZE_MIN;
  sizeEl.max = C.SIZE_MAX;
  document.getElementById('format').onchange = function (e) {
    set('format', e.target.value);
  };
  document.getElementById('font').onchange = function (e) {
    set('font', e.target.value);
  };
  document.getElementById('frame').onchange = function (e) {
    set('frame', e.target.value);
  };
  sizeEl.oninput = function () {
    st.size = Number(sizeEl.value);
    sizeVal.textContent = st.size + '%';
    fit();
  }; /* ドラッグ中は軽く反映 */
  sizeEl.onchange = function () {
    set('size', Number(sizeEl.value));
  };
  document.getElementById('resetBtn').onclick = function () {
    st = C.sanitize(null);
    save();
    apply();
    log('設定を初期に戻しました');
  };
  window.addEventListener('resize', fit);

  st = load();
  apply();
  tick();
  log('起動しました (' + st.format + ' / ' + st.font + ' / ' + st.size + '% / ' + st.frame + ')');
})();
