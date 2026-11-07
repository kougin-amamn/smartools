/* デスクトップ風ランチャー。ダブルクリック(タッチはタップ)で開き、ドラッグで移動、右クリック・長押しでメニュー。
   配置とアイコンの大きさは localStorage に保存する */
(function () {
  'use strict';
  if (!window.Launcher)
    return; /* launcher-common.js が無い時は、ページ末尾の確認でファイル名を表示する */
  var L =
    window.Launcher; /* 共通(launcher-common.js): 一覧の読み込み・リンク・開いた回数・読み込み中の表示 */
  L.loading(40, 'ツールの一覧を読み込んでいます…');
  L.run(main);

  /* 本体(list=ツール一覧 / source=読んだファイル名 / loadMsg・loadErr=読めなかった時の説明) */
  function main(list, source, loadMsg, loadErr) {
    var miss = L.missingParts({ DesktopCore: 'launcher-desktop-core.js' });
    if (miss.length) {
      var msg = L.missingMessage(miss);
      log.error(msg);
      L.loadingDone();
      var h = document.getElementById('hint'),
        st = document.getElementById('status');
      if (h) {
        h.textContent = msg;
        h.classList.add('err');
        h.classList.remove('off');
      }
      if (st) st.textContent = 'ファイルが足りません';
      return;
    }
    var core = window.DesktopCore;
    var $ = function (id) {
      return document.getElementById(id);
    };

    /* データ */
    var tools = (list || []).map(function (t) {
      return {
        id: t.slug,
        slug: t.slug,
        title: t.title || t.slug,
        desc: t.desc || '',
        cat: t.cat || '',
        mark: t.mark,
        icon: t.icon,
        href: t.href,
      };
    });
    var byId = {},
      toolOrder = [],
      order = []; /* order はデスクトップに出ているアイコン(フォルダの中のツールは除く) */
    tools.forEach(function (t) {
      if (byId[t.id]) return;
      byId[t.id] = t;
      toolOrder.push(t.id);
    });
    var hrefOf = L.hrefOf,
      iconOf = L.iconOf;
    function markOf(t) {
      return t.mark || String(t.title).charAt(0);
    }

    /* 保存(配置とアイコンの大きさ) */
    var KEY = 'launcher-desktop-state';
    var state = { size: 'medium', pos: {}, folders: [] };
    try {
      state = core.parseState(localStorage.getItem(KEY));
    } catch (e) {
      log.warn('保存済みの配置を読み込めませんでした(初期配置で始めます)', e);
    }
    var savedCount = Object.keys(state.pos).filter(function (id) {
      return byId[id];
    }).length;
    function save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        log.warn('配置を保存できませんでした', e);
      }
    }

    /* アイコンの要素 */
    var desk = $('desk'),
      sizer = $('sizer'),
      band = $('band'),
      menu = $('menu'),
      hint = $('hint'),
      statusEl = $('status');
    var sel = {},
      focusId = null;
    var els = {},
      iconStat = { ok: 0, ng: 0, pend: 0 };
    function iconDone() {
      if (--iconStat.pend === 0)
        log(
          'アイコン画像の読み込みが終わりました(使用 ' +
            iconStat.ok +
            ' / 使えず ' +
            iconStat.ng +
            ')',
        );
    }
    /* ツールの絵: 画像が無い時は頭文字のタイル */
    function toolMedia(t, count) {
      var img = new Image();
      img.alt = '';
      img.draggable = false;
      if (count) iconStat.pend++;
      img.onload = function () {
        if (!count) return;
        iconStat.ok++;
        iconDone();
      };
      img.onerror = function () {
        var mk = document.createElement('div');
        mk.className = 'mk';
        mk.textContent = markOf(t);
        var sz = m ? m.icon : 48;
        mk.style.width = mk.style.height = sz + 'px';
        mk.style.fontSize = Math.round(sz * 0.42) + 'px';
        if (img.parentNode) img.parentNode.replaceChild(mk, img);
        if (!count) return;
        iconStat.ng++;
        iconDone();
      };
      img.src = iconOf(t);
      return img;
    }
    function newIcon(id, media, title, tip) {
      var el = document.createElement('div');
      el.className = 'ic';
      el.dataset.id = id;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', 'false');
      el.title = tip;
      var lb = document.createElement('span');
      lb.className = 'lb';
      lb.textContent = title;
      el.appendChild(media);
      el.appendChild(lb);
      els[id] = el;
      return el;
    }
    toolOrder.forEach(function (id) {
      var t = byId[id];
      newIcon(id, toolMedia(t, true), t.title, t.title + (t.desc ? '\n' + t.desc : ''));
    });
    /* フォルダのアイコン: フォルダの絵の上に、中のツールのアイコンを小さく4つまで */
    var FOLDER_SVG =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v3H4z" fill="#e0b52f"/><rect x="4" y="16" width="40" height="25" rx="3" fill="#ffd43b"/></svg>';
    function folderItem(f) {
      var key = core.folderKey(f.id);
      byId[key] = {
        id: key,
        folder: f.id,
        title: f.name,
        desc: f.items.length + '個のツール',
        cat: '',
      };
      var el = els[key];
      if (!el) {
        var media = document.createElement('div');
        media.className = 'fd';
        media.innerHTML = FOLDER_SVG + '<div class="fdm"></div>';
        el = newIcon(key, media, f.name, '');
        el.classList.add('folder');
      }
      el.querySelector('.lb').textContent = f.name;
      el.title = f.name + '\n' + f.items.length + '個のツール';
      var mini = el.querySelector('.fdm');
      mini.innerHTML = '';
      f.items.slice(0, 4).forEach(function (id) {
        if (byId[id]) mini.appendChild(toolMedia(byId[id], false));
      });
    }
    /* デスクトップに出すアイコンを並べ直す(フォルダに入ったものは外し、フォルダを足す) */
    function refresh() {
      Object.keys(byId).forEach(function (id) {
        if (core.isFolderKey(id) && !core.folderById(state, byId[id].folder)) {
          if (els[id] && els[id].parentNode) els[id].parentNode.removeChild(els[id]);
          delete els[id];
          delete byId[id];
        }
      });
      state.folders.forEach(folderItem);
      order = core.desktopOrder(toolOrder, state);
      var show = {};
      order.forEach(function (id) {
        show[id] = 1;
        if (!els[id].parentNode) desk.appendChild(els[id]);
      });
      Object.keys(els).forEach(function (id) {
        if (!show[id] && els[id].parentNode) els[id].parentNode.removeChild(els[id]);
        if (!show[id]) delete sel[id];
      });
      if (m) {
        layout(true);
        paintSel();
      }
    }

    /* 配置 */
    var m = null,
      pos = {};
    function layout(animate) {
      m = core.metrics(desk.clientWidth, desk.clientHeight, state.size);
      pos = core.resolve(order, state.pos, m.cols, m.rows);
      var maxRow = 0;
      order.forEach(function (id) {
        var el = els[id],
          p = pos[id],
          xy = core.cellXY(p, m);
        el.classList.toggle('no-anim', !animate);
        el.classList.toggle('small', state.size === 'small');
        el.style.left = xy.x + 2 + 'px';
        el.style.top = xy.y + 2 + 'px';
        el.style.width = m.cw - 4 + 'px';
        var media = el.firstChild;
        media.style.width = media.style.height = m.icon + 'px';
        if (media.classList.contains('mk')) media.style.fontSize = Math.round(m.icon * 0.42) + 'px';
        if (p[1] > maxRow) maxRow = p[1];
      });
      sizer.style.height =
        m.oy + (maxRow + 1) * m.ch + 8 + 'px'; /* マスが足りずにはみ出した分はスクロールで見える */
      if (!animate)
        requestAnimationFrame(function () {
          order.forEach(function (id) {
            els[id].classList.remove('no-anim');
          });
        });
    }
    function cellRect(id) {
      var xy = core.cellXY(pos[id], m);
      return { x0: xy.x + 6, y0: xy.y + 4, x1: xy.x + m.cw - 6, y1: xy.y + m.ch - 4 };
    }
    function posText(p) {
      return p[0] + 1 + '列目 ' + (p[1] + 1) + '行目';
    }

    /* 選択 */
    function selIds() {
      return order.filter(function (id) {
        return sel[id];
      });
    }
    function paintSel() {
      order.forEach(function (id) {
        els[id].classList.toggle('sel', !!sel[id]);
        els[id].setAttribute('aria-selected', sel[id] ? 'true' : 'false');
        els[id].classList.toggle('focus', id === focusId && !sel[id]);
      });
      var n = selIds().length;
      statusEl.textContent = n ? n + '個 選択中' : order.length + '個のアイコン';
    }
    function selectOnly(id) {
      sel = {};
      if (id) sel[id] = 1;
      focusId = id || focusId;
      paintSel();
    }
    function toggleSel(id) {
      if (sel[id]) delete sel[id];
      else sel[id] = 1;
      focusId = id;
      paintSel();
    }

    /* 開く */
    function openTool(id) {
      if (core.isFolderKey(id)) openFolder(byId[id].folder);
      else L.openTool(byId[id]); /* 開いた回数を記録して開く(全モード共通) */
    }

    /* 元に戻す */
    var undo = [];
    function remember() {
      undo.push(JSON.stringify(pos));
      if (undo.length > 20) undo.shift();
    }
    function applyPos(p) {
      state.pos = p;
      save();
      layout(true);
    }
    function undoLast() {
      if (!undo.length) {
        log.warn('元に戻せる操作がありません');
        return;
      }
      applyPos(JSON.parse(undo.pop()));
      log('直前の並べ替えを元に戻しました');
    }

    /* 操作の案内(最初の操作で消える) */
    var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
    hint.innerHTML = coarse
      ? '<span>タップで開く ／</span> <span>長押しで移動 ／</span> <span>何もない所を長押しでメニュー</span>'
      : '<span>ダブルクリックで開く ／</span> <span>ドラッグで移動 ／</span> <span>右クリックでメニュー</span>';
    function hideHint() {
      hint.classList.add('off');
    }

    /* メニュー(右クリック / 長押し / タスクバーのボタン) */
    var menuIn = null /* ウインドウの中で開いたメニューの対象(ツールの id) */,
      menuAt = null; /* メニューを開いた位置(新しいフォルダを置く所) */
    var menuOpen = false,
      menuGuard = 0; /* 長押しで開いた直後は、指を離した時のクリックで項目が選ばれないようにする */
    function menuItems(onIcon) {
      var items = [];
      if (menuIn) {
        /* フォルダのウインドウの中のアイコン */
        items.push({ label: '開く', act: 'open' }, { label: 'デスクトップへ出す', act: 'out' });
        return items;
      }
      if (onIcon) {
        var ids = selIds(),
          oneFolder = ids.length === 1 && core.isFolderKey(ids[0]);
        items.push({
          label: ids.length > 1 ? '開く(最初の「' + byId[ids[0]].title + '」)' : '開く',
          act: 'open',
        });
        if (oneFolder) {
          items.push(
            { label: '名前を変更', act: 'rename' },
            { label: 'フォルダを削除', act: 'delfolder' },
          );
        } else if (!ids.some(core.isFolderKey)) {
          items.push({ sep: true }, { head: 'フォルダへ移動' });
          state.folders.forEach(function (f) {
            items.push({ label: '「' + f.name + '」へ', act: 'into:' + f.id });
          });
          items.push({ label: '新しいフォルダへ', act: 'newinto' });
        }
        items.push({ sep: true });
      } else {
        items.push({ label: '新しいフォルダ', act: 'newfolder' }, { sep: true });
      }
      items.push({ head: '表示' });
      ['large', 'medium', 'small'].forEach(function (s) {
        items.push({ label: core.SIZES[s].label, act: 'size:' + s, check: state.size === s });
      });
      items.push({ sep: true }, { head: '並べ替え' });
      items.push({ label: '名前順', act: 'sort:name' }, { label: 'カテゴリ順', act: 'sort:cat' });
      items.push({ sep: true });
      items.push({ label: 'すべて選択', act: 'all' });
      items.push({ label: '元に戻す', act: 'undo', off: !undo.length });
      items.push({ label: '初期配置に戻す', act: 'reset' });
      return items;
    }
    function showMenu(x, y, onIcon, inWin) {
      menuIn = inWin || null;
      menuAt = { x: x, y: y };
      menu.innerHTML = '';
      menuItems(onIcon).forEach(function (it) {
        var li = document.createElement('li');
        if (it.sep) {
          li.className = 'sep';
        } else if (it.head) {
          li.className = 'head';
          li.textContent = it.head;
        } else {
          li.setAttribute('role', 'menuitem');
          li.tabIndex = -1;
          li.dataset.act = it.act;
          if (it.off) li.className = 'off';
          var ck = document.createElement('span');
          ck.className = 'ck';
          ck.textContent = it.check ? '●' : '';
          var tx = document.createElement('span');
          tx.textContent = it.label;
          li.appendChild(ck);
          li.appendChild(tx);
        }
        menu.appendChild(li);
      });
      menu.hidden = false;
      menuOpen = true;
      var w = menu.offsetWidth,
        h = menu.offsetHeight;
      menu.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
      menu.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
      var first = menu.querySelector('li[data-act]');
      if (first) first.focus({ preventScroll: true });
      log(
        'メニューを表示しました(' +
          (menuIn ? 'フォルダの中' : onIcon ? 'アイコン' : 'デスクトップ') +
          ')',
      );
    }
    function closeMenu() {
      if (!menuOpen) return;
      menu.hidden = true;
      menuOpen = false;
      $('startBtn').classList.remove('on');
    }
    function runAct(act) {
      closeMenu();
      if (menuIn) {
        var tid = menuIn;
        menuIn = null;
        if (act === 'open') L.openTool(byId[tid]);
        if (act === 'out') takeOutOf([tid]);
        return;
      }
      if (act === 'open') {
        var ids = selIds();
        if (ids.length) openTool(ids[0]);
        return;
      }
      if (act === 'newfolder' || act === 'newinto') {
        var f = core.addFolder(state),
          key = core.folderKey(f.id);
        if (act === 'newfolder' && menuAt) {
          var r = desk.getBoundingClientRect();
          state.pos[key] = core.cellAt(
            menuAt.x - r.left + desk.scrollLeft,
            menuAt.y - r.top + desk.scrollTop,
            m,
          );
        }
        var moved = act === 'newinto' ? core.moveToFolder(state, selIds(), f.id) : 0;
        save();
        refresh();
        selectOnly(key);
        log(
          'フォルダ「' + f.name + '」を作りました' + (moved ? '(' + moved + '個を入れました)' : ''),
        );
        renameInline(key);
        return;
      }
      if (act.indexOf('into:') === 0) {
        var fid = act.slice(5),
          g = core.folderById(state, fid),
          n = core.moveToFolder(state, selIds(), fid);
        save();
        refresh();
        log('フォルダ「' + g.name + '」へ ' + n + '個 入れました');
        return;
      }
      if (act === 'rename') {
        renameInline(selIds()[0]);
        return;
      }
      if (act === 'delfolder') {
        var dk = selIds()[0],
          name = byId[dk].title,
          back = core.deleteFolder(state, byId[dk].folder);
        save();
        refresh();
        log(
          'フォルダ「' + name + '」を削除しました(中の ' + back + '個はデスクトップに戻しました)',
        );
        return;
      }
      if (act.indexOf('size:') === 0) {
        var s = act.slice(5);
        if (s === state.size) return;
        state.size = s;
        save();
        layout(false);
        log(
          '表示を「' + core.SIZES[s].label + '」に変更しました(マス ' + m.cols + '×' + m.rows + ')',
        );
        return;
      }
      if (act.indexOf('sort:') === 0) {
        var by = act.slice(5);
        remember();
        applyPos(
          core.sorted(
            order.map(function (id) {
              return byId[id];
            }),
            by,
            m.cols,
            m.rows,
          ),
        );
        log((by === 'cat' ? 'カテゴリ順' : '名前順') + 'に並べ替えました(' + order.length + '個)');
        return;
      }
      if (act === 'all') {
        sel = {};
        order.forEach(function (id) {
          sel[id] = 1;
        });
        paintSel();
        log('すべて選択しました(' + order.length + '個)');
        return;
      }
      if (act === 'undo') {
        undoLast();
        return;
      }
      if (act === 'reset') {
        remember();
        applyPos({});
        log('初期配置に戻しました(' + order.length + '個)');
      }
    }
    menu.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-act]');
      if (!li || li.classList.contains('off')) return;
      if (Date.now() < menuGuard) return;
      log('「メニュー」の「' + li.textContent.replace(/^●/, '') + '」を押下しました');
      runAct(li.dataset.act);
    });
    menu.addEventListener('keydown', function (e) {
      var items = [].slice.call(menu.querySelectorAll('li[data-act]:not(.off)')),
        i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        if (n) n.focus();
      } else if (e.key === 'Enter' && i >= 0) {
        e.preventDefault();
        items[i].click();
      }
    });
    $('startBtn').onclick = function () {
      if (menuOpen) {
        closeMenu();
        return;
      }
      var r = this.getBoundingClientRect();
      this.classList.add('on');
      showMenu(r.left, r.top - 8 - 260, selIds().length > 0);
      var h = menu.offsetHeight;
      menu.style.top = Math.max(4, r.top - 8 - h) + 'px';
    };
    document.addEventListener(
      'pointerdown',
      function (e) {
        if (
          menuOpen &&
          !menu.contains(e.target) &&
          e.target.id !== 'startBtn' &&
          !e.target.closest('#startBtn')
        )
          closeMenu();
      },
      true,
    );
    window.addEventListener('blur', closeMenu);

    /* ポインタ操作 */
    var ptr = null; /* 押している間の状態 */
    var LONG_MS = 420,
      MOVE_PX = 6,
      TOUCH_SLOP = 10;
    function deskXY(e) {
      var r = desk.getBoundingClientRect();
      return { x: e.clientX - r.left + desk.scrollLeft, y: e.clientY - r.top + desk.scrollTop };
    }
    function startDrag() {
      ptr.dragging = true;
      ptr.ids.forEach(function (id) {
        els[id].classList.add('drag');
      });
      if (window.Env && Env.canVibrate() && ptr.touch) {
        try {
          navigator.vibrate(10);
        } catch (x) {
          log.debug('振動を使えませんでした');
        }
      }
    }
    desk.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return; /* 右ボタンは contextmenu で扱う */
      hideHint();
      var icon = e.target.closest('.ic'),
        touch = e.pointerType !== 'mouse',
        p = deskXY(e);
      ptr = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        start: p,
        touch: touch,
        icon: icon ? icon.dataset.id : null,
        dragging: false,
        band: false,
        moved: false,
        timer: 0,
      };
      if (icon) {
        var id = icon.dataset.id;
        if (!touch) {
          if (e.ctrlKey || e.metaKey) {
            toggleSel(id);
            if (!sel[id]) {
              ptr.icon = null;
              return;
            }
          } else if (!sel[id]) selectOnly(id);
          else focusId = id;
        }
        var gp = core.cellXY(pos[id], m);
        ptr.off = { x: p.x - gp.x, y: p.y - gp.y };
        if (touch) {
          ptr.timer = setTimeout(function () {
            /* 長押し: そのアイコン(選択中ならその全部)を動かせる状態に */
            if (!ptr || ptr.moved) return;
            if (!sel[id]) selectOnly(id);
            ptr.ids = selIds();
            startDrag();
            log('アイコンを長押ししました(移動できます / ' + ptr.ids.length + '個)');
          }, LONG_MS);
        } else ptr.ids = selIds();
      } else {
        if (!touch) {
          if (!(e.ctrlKey || e.metaKey)) selectOnly(null);
          ptr.band = true;
          ptr.base = Object.assign({}, sel);
        } else {
          ptr.timer = setTimeout(function () {
            /* 何もない所の長押し: メニュー */
            if (!ptr || ptr.moved) return;
            ptr.menu = true;
            selectOnly(null);
            menuGuard = Date.now() + 600;
            showMenu(e.clientX, e.clientY, false);
          }, LONG_MS);
        }
      }
      try {
        desk.setPointerCapture(e.pointerId);
      } catch (x) {
        log.debug('ポインタの捕捉に失敗しました(操作は続けられます)');
      }
    });
    desk.addEventListener('pointermove', function (e) {
      if (!ptr || e.pointerId !== ptr.id) return;
      var dx = e.clientX - ptr.sx,
        dy = e.clientY - ptr.sy,
        dist = Math.hypot(dx, dy);
      if (!ptr.moved && dist > (ptr.touch ? TOUCH_SLOP : MOVE_PX)) {
        ptr.moved = true;
        if (ptr.touch && !ptr.dragging) {
          clearTimeout(ptr.timer);
          return;
        } /* 長押し前に動いた = スクロール */
        if (!ptr.touch && ptr.icon && !ptr.dragging) startDrag();
      }
      if (ptr.dragging) {
        ptr.ids.forEach(function (id) {
          els[id].style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
      } else if (ptr.band && ptr.moved) {
        var p = deskXY(e),
          r = {
            x0: Math.min(p.x, ptr.start.x),
            y0: Math.min(p.y, ptr.start.y),
            x1: Math.max(p.x, ptr.start.x),
            y1: Math.max(p.y, ptr.start.y),
          };
        band.hidden = false;
        band.style.left = r.x0 + 'px';
        band.style.top = r.y0 + 'px';
        band.style.width = r.x1 - r.x0 + 'px';
        band.style.height = r.y1 - r.y0 + 'px';
        sel = Object.assign({}, ptr.base);
        order.forEach(function (id) {
          if (core.overlaps(r, cellRect(id))) sel[id] = 1;
        });
        paintSel();
      }
    });
    /* 長押しで動かしている間は、指の動きでページがスクロールしないようにする */
    desk.addEventListener(
      'touchmove',
      function (e) {
        if (ptr && ptr.dragging) e.preventDefault();
      },
      { passive: false },
    );
    desk.addEventListener('contextmenu', function (e) {
      if (ptr && ptr.touch) {
        e.preventDefault();
        return;
      } /* タッチの長押しは自前で扱う(端末の長押しメニューは出さない) */
      e.preventDefault();
      hideHint();
      var icon = iconAt(e);
      if (icon) {
        var id = icon.dataset.id;
        if (!sel[id]) selectOnly(id);
      } else selectOnly(null);
      log(
        '右クリックしました(' +
          (icon ? '「' + byId[icon.dataset.id].title + '」' : 'デスクトップ') +
          ')',
      );
      showMenu(e.clientX, e.clientY, !!icon);
    });
    function endPointer(e, cancel) {
      if (!ptr || e.pointerId !== ptr.id) return;
      var P = ptr;
      ptr = null;
      clearTimeout(P.timer);
      if (P.dragging) {
        P.ids.forEach(function (id) {
          els[id].classList.remove('drag');
          els[id].style.transform = '';
        });
        if (cancel) return;
        var under = document.elementFromPoint(e.clientX, e.clientY),
          target = under && under.closest ? under.closest('.ic.folder') : null;
        if (target && P.ids.indexOf(target.dataset.id) < 0 && !P.ids.some(core.isFolderKey)) {
          var tf = core.folderById(state, byId[target.dataset.id].folder),
            nIn = core.moveToFolder(state, P.ids, tf.id);
          save();
          refresh();
          log('フォルダ「' + tf.name + '」へ ' + nIn + '個 入れました(ドラッグ)');
          return;
        }
        var p = deskXY(e),
          gid = P.icon && sel[P.icon] ? P.icon : P.ids[0],
          gp = pos[gid];
        var tc = core.cellAt(p.x - P.off.x + m.cw / 2, p.y - P.off.y + m.ch / 2, m),
          dc = tc[0] - gp[0],
          dr = tc[1] - gp[1];
        if (!dc && !dr) {
          log('移動を取りやめました(同じ位置)');
          return;
        }
        remember();
        var np = core.moveGroup(pos, P.ids, dc, dr, m.cols, m.rows);
        applyPos(np);
        if (P.ids.length === 1)
          log(
            'アイコンを移動しました(「' +
              byId[P.ids[0]].title +
              '」→ ' +
              posText(np[P.ids[0]]) +
              ')',
          );
        else
          log(
            'アイコンを移動しました(' +
              P.ids.length +
              '個 / 横 ' +
              (dc > 0 ? '+' : '') +
              dc +
              ' ・ 縦 ' +
              (dr > 0 ? '+' : '') +
              dr +
              ' マス)',
          );
        return;
      }
      if (P.band) {
        band.hidden = true;
        if (P.moved) {
          var n = selIds().length;
          if (n) log('範囲選択しました(' + n + '個)');
        }
        return;
      }
      if (cancel || P.menu) return;
      if (P.touch && P.icon && !P.moved) {
        /* タッチのタップ: 開く */
        selectOnly(P.icon);
        log('「' + byId[P.icon].title + '」をタップしました');
        openTool(P.icon);
      } else if (P.touch && !P.icon && !P.moved) selectOnly(null);
    }
    desk.addEventListener('pointerup', function (e) {
      endPointer(e, false);
    });
    desk.addEventListener('pointercancel', function (e) {
      endPointer(e, true);
    });
    /* ポインタを捕捉しているとダブルクリックの対象はデスクトップ全体になるため、押した位置の要素から探す */
    function iconAt(e) {
      var el = document.elementFromPoint(e.clientX, e.clientY);
      return el && el.closest ? el.closest('.ic') : null;
    }
    desk.addEventListener('dblclick', function (e) {
      var icon = iconAt(e);
      if (!icon) return;
      var id = icon.dataset.id;
      log('「' + byId[id].title + '」をダブルクリックしました');
      selectOnly(id);
      openTool(id);
    });

    /* キーボード */
    window.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        if (menuOpen) {
          closeMenu();
          return;
        }
        if (win) {
          closeFolder('Escapeキー');
          return;
        }
        if (selIds().length) {
          selectOnly(null);
          log('選択を解除しました');
        }
        return;
      }
      if (menuOpen || win) return;
      var ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'F2') {
        var fs = selIds();
        if (fs.length === 1 && core.isFolderKey(fs[0])) {
          e.preventDefault();
          log('F2キーを押下しました');
          renameInline(fs[0]);
        }
        return;
      }
      if (ctrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        log('Ctrl+A キーを押下しました');
        runAct('all');
        return;
      }
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        log('Ctrl+Z キーを押下しました');
        undoLast();
        return;
      }
      var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      if (dir) {
        e.preventDefault();
        hideHint();
        var cur = focusId && byId[focusId] ? focusId : null,
          next = cur
            ? core.neighbor(pos, cur, dir)
            : order.filter(function (id) {
                return pos[id][0] === 0 && pos[id][1] === 0;
              })[0] || order[0];
        if (next) {
          selectOnly(next);
          els[next].scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if (e.key === 'Enter') {
        var ids = selIds();
        if (!ids.length) return;
        e.preventDefault();
        log('Enterキーを押下しました');
        openTool(ids[0]);
      }
    });

    /* 名前の変更: ラベルをその場で入力欄にする(Enter で決定、Escape で取り消し) */
    function renameInline(key, labelEl) {
      var el = labelEl || (els[key] && els[key].querySelector('.lb'));
      if (!el) return;
      var f = core.folderById(state, byId[key].folder),
        input = document.createElement('input');
      input.className = 'rename';
      input.value = f.name;
      input.setAttribute('aria-label', 'フォルダの名前');
      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        var old = f.name;
        if (ok && core.renameFolder(state, f.id, input.value)) {
          save();
          if (old !== f.name)
            log('フォルダの名前を変更しました(「' + old + '」→「' + f.name + '」)');
        }
        refresh();
        if (win && win.fid === f.id) win.title.textContent = f.name;
      }
      ['pointerdown', 'dblclick', 'click'].forEach(function (ev) {
        input.addEventListener(ev, function (e) {
          e.stopPropagation();
        });
      });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', function () {
        finish(true);
      });
    }

    /* フォルダのウインドウ: 中のツールを並べる。ダブルクリック(タッチはタップ)で開く、右クリック・長押しでメニュー */
    var win = null;
    function openFolder(fid) {
      var f = core.folderById(state, fid);
      if (!f) return;
      closeFolder();
      var box = document.createElement('div');
      box.className = 'win';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'フォルダ ' + f.name);
      box.innerHTML =
        '<div class="win-head"><span class="win-title"></span>' +
        '<button class="win-btn" data-w="out" disabled>デスクトップへ出す</button>' +
        '<button class="win-btn win-x" data-w="close" aria-label="フォルダを閉じる">×</button></div>' +
        '<div class="win-grid"></div><div class="win-empty" hidden>空のフォルダです。アイコンをここへドラッグして入れられます</div>';
      document.querySelector('main').appendChild(box);
      win = { fid: fid, box: box, title: box.querySelector('.win-title'), pick: null };
      win.title.textContent = f.name;
      fillFolder();
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.win-btn');
        if (!b) return;
        if (b.dataset.w === 'close') {
          closeFolder();
        } else if (b.dataset.w === 'out' && win.pick) {
          takeOutOf([win.pick]);
        }
      });
      win.title.addEventListener('dblclick', function () {
        renameInline(core.folderKey(fid), win.title);
      });
      log('フォルダ「' + f.name + '」を開きました(' + f.items.length + '個)');
    }
    function fillFolder() {
      var f = core.folderById(state, win.fid),
        grid = win.box.querySelector('.win-grid');
      grid.innerHTML = '';
      win.pick = null;
      win.box.querySelector('[data-w="out"]').disabled = true;
      win.box.querySelector('.win-empty').hidden = f.items.length > 0;
      f.items.forEach(function (id) {
        var t = byId[id];
        if (!t) return;
        var it = document.createElement('div');
        it.className = 'wi';
        it.dataset.id = id;
        it.title = t.title + (t.desc ? '\n' + t.desc : '');
        var lb = document.createElement('span');
        lb.className = 'lb';
        lb.textContent = t.title;
        it.appendChild(toolMedia(t, false));
        it.appendChild(lb);
        grid.appendChild(it);
        var lp = 0;
        it.addEventListener('click', function () {
          [].forEach.call(grid.children, function (c) {
            c.classList.toggle('sel', c === it);
          });
          win.pick = id;
          win.box.querySelector('[data-w="out"]').disabled = false;
        });
        it.addEventListener('dblclick', function () {
          log('フォルダの中の「' + t.title + '」をダブルクリックしました');
          L.openTool(t);
        });
        it.addEventListener('pointerup', function (e) {
          clearTimeout(lp);
          if (e.pointerType !== 'mouse' && !it.dataset.long) {
            log('フォルダの中の「' + t.title + '」をタップしました');
            L.openTool(t);
          }
          delete it.dataset.long;
        });
        it.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'mouse') return;
          lp = setTimeout(function () {
            it.dataset.long = '1';
            menuGuard = Date.now() + 600;
            showMenu(e.clientX, e.clientY, true, id);
          }, LONG_MS);
        });
        it.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          log('フォルダの中の「' + t.title + '」を右クリックしました');
          showMenu(e.clientX, e.clientY, true, id);
        });
      });
    }
    function closeFolder(how) {
      if (!win) return;
      var name = (core.folderById(state, win.fid) || {}).name;
      win.box.parentNode.removeChild(win.box);
      win = null;
      if (name) log('フォルダ「' + name + '」を閉じました' + (how ? '(' + how + ')' : ''));
    }
    function takeOutOf(ids) {
      var n = core.takeOut(state, ids);
      save();
      refresh();
      if (win) fillFolder();
      log(n + '個をデスクトップへ出しました');
    }

    /* 時計(タスクバー) */
    function tick() {
      var d = new Date(),
        p = function (n) {
          return String(n).padStart(2, '0');
        };
      $('clockTime').textContent = d.getHours() + ':' + p(d.getMinutes());
      $('clockDate').textContent = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    }
    tick();
    setInterval(tick, 10000);

    /* 起動 */
    if (loadMsg || !toolOrder.length) L.loadingDone();
    if (loadMsg) {
      statusEl.textContent = '一覧データを読み込めませんでした';
      hint.textContent = loadMsg;
      hint.classList.remove('off');
      hint.classList.add('err');
      log.error(loadMsg, loadErr);
      return;
    }
    if (!toolOrder.length) {
      statusEl.textContent = '表示するツールがありません';
      log.warn('表示するツールがありません');
      return;
    }
    refresh();
    layout(false);
    paintSel();
    var lastW = desk.clientWidth,
      lastH = desk.clientHeight;
    function onResize() {
      if (desk.clientWidth === lastW && desk.clientHeight === lastH) return;
      lastW = desk.clientWidth;
      lastH = desk.clientHeight;
      closeMenu();
      layout(false);
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(desk);
    window.addEventListener('resize', onResize);
    L.loadingDone();
    log(
      '起動しました(アイコン ' +
        order.length +
        '個 / マス ' +
        m.cols +
        '×' +
        m.rows +
        ' / ' +
        core.SIZES[state.size].label +
        ' / 保存した配置 ' +
        savedCount +
        '件 / 元データ ' +
        source +
        ')',
    );
  }
})();
