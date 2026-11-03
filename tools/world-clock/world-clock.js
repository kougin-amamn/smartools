/* 世界時計の画面。時差・都市の表は world-clock-core.js */
(function () {
  var C = window.WorldClockCore,
    KEY = 'world-clock-v1';
  var DEFAULT = ['newyork', 'london', 'paris', 'sydney'];
  var localTz = 'Asia/Tokyo';
  try {
    localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || localTz;
  } catch (e) {
    log.warn('端末のタイムゾーンを取得できませんでした(Asia/Tokyo として表示します)', e);
  }
  var st = { ids: DEFAULT.slice(), h12: false };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.ids)) {
      st.ids = s.ids.filter(function (i) {
        return C.CITIES.some(function (c) {
          return c.id === i;
        });
      });
      st.h12 = !!s.h12;
    }
  } catch (e) {
    log.warn('保存した都市の読み込みに失敗しました(初期の都市で表示します)', e);
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      log.warn('都市の保存に失敗しました', e);
    }
  }
  var $ = function (id) {
    return document.getElementById(id);
  };
  var byId = {};
  C.CITIES.forEach(function (c) {
    byId[c.id] = c;
  });
  var SUN =
    '<svg class="ico day" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON =
    '<svg class="ico night" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var X =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  $('localTz').textContent = '(' + localTz.replace(/_/g, ' ') + ')';
  $('h12').checked = st.h12;
  $('h12').onchange = function () {
    st.h12 = this.checked;
    save();
    tick();
  };

  function buildList() {
    var ul = $('list');
    ul.innerHTML = '';
    if (!st.ids.length) {
      ul.innerHTML = '<li class="empty">都市がありません。下から追加してください。</li>';
    }
    st.ids.forEach(function (id) {
      var c = byId[id];
      var li = document.createElement('li');
      li.className = 'city';
      li.dataset.id = id;
      li.innerHTML =
        '<span class="slot"></span><div class="info"><div class="name"></div><div class="meta"></div></div><div class="t"><div class="hm"></div><div class="sc"></div></div><button class="del" type="button" aria-label="' +
        c.name +
        'を削除">' +
        X +
        '</button>';
      li.querySelector('.name').textContent = c.name;
      li.querySelector('.del').onclick = function () {
        st.ids = st.ids.filter(function (i) {
          return i !== id;
        });
        save();
        buildList();
        buildSel();
        tick();
        log('「' + c.name + '」を削除しました(全 ' + st.ids.length + '都市)');
      };
      ul.appendChild(li);
    });
  }
  function buildSel() {
    var sel = $('addSel');
    sel.innerHTML = '';
    C.CITIES.forEach(function (c) {
      if (st.ids.indexOf(c.id) < 0) {
        var o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      }
    });
    $('addBtn').disabled = !sel.options.length;
  }
  $('addSel').onchange = function () {
    var o = this.options[this.selectedIndex];
    log('追加する都市に「' + (o ? o.text : '') + '」を選びました');
  };
  $('addBtn').onclick = function () {
    var v = $('addSel').value;
    if (v && st.ids.indexOf(v) < 0) {
      st.ids.push(v);
      save();
      buildList();
      buildSel();
      tick();
      log('「' + byId[v].name + '」を追加しました(全 ' + st.ids.length + '都市)');
    } else log.warn('追加できる都市がありませんでした');
  };

  function tick() {
    var now = new Date();
    var lp = C.parts(now, localTz),
      lt = C.timeText(lp, st.h12);
    $('localTime').innerHTML =
      (lt.pre ? '<small>' + lt.pre + '</small>' : '') + lt.hm + '<small>:' + lt.sec + '</small>';
    $('localDate').textContent = lp.y + '年' + C.dateText(lp);
    var items = $('list').querySelectorAll('.city');
    for (var i = 0; i < items.length; i++) {
      var li = items[i],
        c = byId[li.dataset.id],
        p = C.parts(now, c.tz),
        t = C.timeText(p, st.h12);
      li.querySelector('.hm').innerHTML = (t.pre ? '<small>' + t.pre + '</small>' : '') + t.hm;
      li.querySelector('.sc').textContent = ':' + t.sec;
      var dl = C.dayLabel(C.dayDiff(now, c.tz, localTz));
      li.querySelector('.meta').innerHTML =
        C.dateText(p) +
        ' <b>' +
        dl +
        '</b><br>' +
        C.diffLabel(now, c.tz, localTz) +
        ' ・ ' +
        C.utcLabel(now, c.tz);
      var day = C.isDay(p),
        slot = li.querySelector('.slot,.ico');
      if ((slot.dataset && slot.dataset.d !== String(day)) || slot.className === 'slot') {
        var tmp = document.createElement('span');
        tmp.innerHTML = day ? SUN : MOON;
        var n = tmp.firstChild;
        n.dataset.d = String(day);
        slot.replaceWith(n);
      }
    }
  }
  buildList();
  buildSel();
  tick();
  setInterval(tick, 1000);
  log(
    '起動しました(都市 ' +
      st.ids.length +
      ' / 端末 ' +
      localTz +
      ' / 12時間表示 ' +
      (st.h12 ? 'ON' : 'OFF') +
      ')'
  );
})();
