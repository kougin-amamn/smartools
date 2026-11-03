/* カレンダーの画面。月の表に六曜・祝日・吉日・月の形を出し、日付を押すと詳しい暦を表示する。暦の計算は calendar-core.js */
(function () {
  'use strict';
  var C = window.CalendarCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var grid = $('grid'),
    title = $('title'),
    detail = $('detail'),
    weekStartSel = $('weekStart'),
    showRokuyo = $('showRokuyo'),
    showLucky = $('showLucky'),
    showMoon = $('showMoon');
  var KEY = 'calendar-settings',
    WD = '日月火水木金土';

  var now = new Date(),
    today = C.jdn(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    view = { y: now.getFullYear(), m: now.getMonth() + 1 },
    selected = today,
    infoCache = {};

  function info(c) {
    var key = c.y * 10000 + c.m * 100 + c.d;
    return infoCache[key] || (infoCache[key] = C.dayInfo(c.y, c.m, c.d));
  }
  /* 月の形の小さな絵(毎日出す)。月齢から光っている形を描く: 外側の半円(光る側)と、明暗の境目の楕円の弧で囲む。
     月齢 0〜14.8 は右側から満ち(上弦)、14.8〜29.5 は右側から欠ける(下弦は左半分が光る)。
     境目の楕円の横の半径は 5×|cos(月齢の角度)|。三日月は境目が光る側へ、半月より太い時は暗い側へふくらむ。
     新月・上弦・満月・下弦の日は縁を濃くし、少し大きくして目立たせる */
  var SYNODIC = 29.530589;
  function moonSvg(age, phase) {
    var p = (((age / SYNODIC) % 1) + 1) % 1,
      k = Math.cos(p * 2 * Math.PI),
      rx = Math.abs(k) * 5,
      right = p < 0.5,
      lit = '#f6e7a8',
      shape;
    if (1 - k < 0.03) shape = '';
    else if (1 + k < 0.03) shape = '<circle cx="6" cy="6" r="5" fill="' + lit + '"/>';
    else
      shape =
        '<path d="M6 1A5 5 0 0 ' +
        (right ? 1 : 0) +
        ' 6 11A' +
        rx.toFixed(2) +
        ' 5 0 0 ' +
        (right === k > 0 ? 0 : 1) +
        ' 6 1z" fill="' +
        lit +
        '"/>';
    return (
      '<svg class="moon' +
      (phase ? ' key' : '') +
      '" viewBox="0 0 12 12" role="img" aria-label="' +
      (phase || '月齢 ' + age.toFixed(1)) +
      '"><circle cx="6" cy="6" r="5" fill="#2f3550"/>' +
      shape +
      '<circle cx="6" cy="6" r="5" fill="none" stroke="' +
      (phase ? '#c9b25a' : '#8a90b8') +
      '" stroke-width="' +
      (phase ? 1.1 : 0.7) +
      '"/></svg>'
    );
  }

  function render() {
    var ws = +weekStartSel.value,
      cells = C.monthGrid(view.y, view.m, ws),
      html = '';
    title.innerHTML = view.y + '年' + view.m + '月<small>' + japaneseEra(view.y) + '</small>';
    for (var i = 0; i < 7; i++) {
      var w = (i + ws) % 7;
      html += '<div class="wd' + (w === 0 ? ' sun' : w === 6 ? ' sat' : '') + '">' + WD[w] + '</div>';
    }
    cells.forEach(function (c) {
      var d = info(c),
        cls = ['cell'];
      if (!c.inMonth) cls.push('out');
      if (d.wd === 0) cls.push('sun');
      if (d.wd === 6) cls.push('sat');
      if (d.holiday) cls.push('hol');
      if (d.day === today) cls.push('today');
      if (d.day === selected) cls.push('sel');
      var body = '<span class="n">' + c.d + '</span>';
      if (showRokuyo.checked)
        body += '<span class="rk' + (d.rokuyo === '大安' ? ' taian' : '') + '">' + d.rokuyo + '</span>';
      if (d.holiday) body += '<span class="hn">' + d.holiday + '</span>';
      else if (d.sekki) body += '<span class="sk">' + d.sekki + '</span>';
      if (showMoon.checked) body += moonSvg(d.age, d.phase);
      if (showLucky.checked && (d.ichiryu || d.tensha))
        body +=
          '<span class="marks">' +
          (d.tensha ? '<i class="mk ten"></i>' : '') +
          (d.ichiryu ? '<i class="mk ichi"></i>' : '') +
          '</span>';
      html +=
        '<button class="' +
        cls.join(' ') +
        '" data-day="' +
        d.day +
        '" aria-label="' +
        c.m +
        '月' +
        c.d +
        '日 ' +
        d.rokuyo +
        (d.holiday ? ' ' + d.holiday : '') +
        '">' +
        body +
        '</button>';
    });
    grid.innerHTML = html;
    renderDetail();
  }

  /* 元号(2019年5月1日から令和) */
  function japaneseEra(y) {
    if (y >= 2019) return y === 2019 ? '平成31年/令和元年' : '令和' + (y - 2018) + '年';
    if (y >= 1989) return '平成' + (y === 1989 ? '元' : y - 1988) + '年';
    return '昭和' + (y - 1925) + '年';
  }

  function renderDetail() {
    var g = C.fromJdn(selected),
      d = info(g),
      tags = [];
    if (d.holiday) tags.push('<span class="tag hol">' + d.holiday + '</span>');
    if (d.rokuyo === '大安') tags.push('<span class="tag taian">大安</span>');
    if (d.tensha) tags.push('<span class="tag ten">天赦日</span>');
    if (d.ichiryu) tags.push('<span class="tag ichi">一粒万倍日</span>');
    if (d.sekki) tags.push('<span class="tag">' + d.sekki + '</span>');
    if (d.phase) tags.push('<span class="tag">' + d.phase + '</span>');
    detail.innerHTML =
      '<h2>' +
      g.y +
      '年' +
      g.m +
      '月' +
      g.d +
      '日(' +
      WD[d.wd] +
      ')' +
      (selected === today ? ' 今日' : '') +
      '</h2><dl>' +
      '<dt>六曜</dt><dd>' +
      d.rokuyo +
      '</dd><dt>干支</dt><dd>' +
      d.kanshi +
      '</dd><dt>月齢</dt><dd>' +
      d.age.toFixed(1) +
      '</dd><dt>和暦</dt><dd>' +
      japaneseEra(g.y) +
      '</dd></dl>' +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '');
  }

  function go(dy, dm, how) {
    var m = view.m + dm,
      y = view.y + dy;
    while (m < 1) {
      m += 12;
      y--;
    }
    while (m > 12) {
      m -= 12;
      y++;
    }
    view = { y: y, m: m };
    render();
    log((how || '') + y + '年' + m + '月を表示しました');
  }
  $('prevBtn').addEventListener('click', function () {
    go(0, -1);
  });
  $('nextBtn').addEventListener('click', function () {
    go(0, 1);
  });
  $('todayBtn').addEventListener('click', function () {
    selected = today;
    var g = C.fromJdn(today);
    view = { y: g.y, m: g.m };
    render();
    log('今日の月に戻りました(' + g.y + '年' + g.m + '月' + g.d + '日 / ' + info(g).rokuyo + ')');
  });
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.cell');
    if (!b) return;
    ToolKit.vibrate();
    selected = +b.dataset.day;
    var g = C.fromJdn(selected),
      d = info(g);
    log('日付を押下しました(' + g.m + '月' + g.d + '日)');
    if (g.m !== view.m) {
      view = { y: g.y, m: g.m };
      log(g.y + '年' + g.m + '月を表示しました');
    }
    render();
    log(
      '暦を表示しました(' +
        g.y +
        '/' +
        g.m +
        '/' +
        g.d +
        ' / ' +
        d.rokuyo +
        (d.holiday ? ' / ' + d.holiday : '') +
        (d.tensha ? ' / 天赦日' : '') +
        (d.ichiryu ? ' / 一粒万倍日' : '') +
        ')'
    );
  });

  /* 左右のスワイプで月を変える */
  var sx = null,
    sy = 0;
  grid.addEventListener(
    'touchstart',
    function (e) {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    },
    { passive: true }
  );
  grid.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx,
      dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      log((dx < 0 ? '左' : '右') + 'にスワイプしました');
      go(0, dx < 0 ? 1 : -1);
    }
  });
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      log((e.key === 'ArrowLeft' ? '←' : '→') + 'キーを押下しました');
      go(0, e.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  /* 設定(端末に保存) */
  var boxes = [showRokuyo, showLucky, showMoon];
  function save() {
    var s = { weekStart: +weekStartSel.value };
    boxes.forEach(function (b) {
      s[b.id] = b.checked;
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      log.warn('設定の保存に失敗しました', e);
    }
  }
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      weekStartSel.value = String(s.weekStart === 1 ? 1 : 0);
      boxes.forEach(function (b) {
        if (typeof s[b.id] === 'boolean') b.checked = s[b.id];
      });
    }
  } catch (e) {
    log.warn('設定の読み込みに失敗しました', e);
  }
  [weekStartSel].concat(boxes).forEach(function (el) {
    el.addEventListener('change', function () {
      save();
      render();
    });
  });

  var t0 = performance.now();
  render();
  var td = info(C.fromJdn(today));
  log(
    '起動しました(' +
      view.y +
      '年' +
      view.m +
      '月 / 今日は' +
      td.rokuyo +
      ' / 週の始まり ' +
      (weekStartSel.value === '1' ? '月' : '日') +
      ' / ' +
      Math.round(performance.now() - t0) +
      'ms)'
  );
})();
