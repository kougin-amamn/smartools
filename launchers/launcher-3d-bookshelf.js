/* 本棚ランチャーの画面まわり(一覧・説明カード・ボタン・キー)。本をタップで引き出し、もう一度タップでツールを開く。
   3Dは -textures / -scene / -view、配置の計算は -core、共通は launcher-common.js */

import BookshelfCore from './launcher-3d-bookshelf-core.js';
import BookshelfTextures from './launcher-3d-bookshelf-textures.js';
import BookshelfScene from './launcher-3d-bookshelf-scene.js';
import BookshelfView from './launcher-3d-bookshelf-view.js';

/* three.js は import map の 'three'(HTML で版を固定)から読む。読めない時は null のまま、2D の一覧にする */
var THREE = null;
var threeReady = import('three').then(
  function (m) {
    THREE = m;
  },
  function (e) {
    log.warn('3D表示用のライブラリ(three.js)を読み込めませんでした(通信が必要です)', e);
  },
);
var L = window.Launcher,
  loading = L.loading,
  loadingDone = L.loadingDone,
  next = L.next; /* 共通(launcher-common.js) */
loading(30, 'ツールの一覧を読み込んでいます…');
/* テクスチャの見本と対応表(launcher-3d-bookshelf-textures.json)。読めない時は既定の見た目で続ける */
var texDefs = fetch('./launcher-3d-bookshelf-textures.json', { cache: 'no-cache' })
  .then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' launcher-3d-bookshelf-textures.json');
    return r.json();
  })
  .then(
    function (d) {
      log(
        'テクスチャの設定を読み込みました(見本 ' +
          (d.swatches || []).length +
          '種類 / 対応表 ' +
          Object.keys(d.assign || {}).length +
          'か所)',
      );
      return d;
    },
    function (e) {
      log.warn(
        'テクスチャの設定(launcher-3d-bookshelf-textures.json)を読み込めませんでした(既定の見た目で表示します)',
        e,
      );
      return null;
    },
  );
Promise.all([L.loadTools(), threeReady]).then(
  function (all) {
    var r = all[0];
    return texDefs.then(function (d) {
      main(r.list, r.src, null, null, d);
    });
  },
  function (e) {
    main(null, '', L.loadErrorMessage(), e);
  },
);

/* 本体(list=ツール一覧 / source=読んだファイル名 / loadMsg・loadErr=読めなかった時の説明 / texDefs=テクスチャの設定) */
function main(list, source, loadMsg, loadErr, texDefs) {
  var core = BookshelfCore;
  var $ = function (id) {
    return document.getElementById(id);
  };
  var tools = (list || []).slice(),
    N = tools.length;
  var hrefOf = L.hrefOf,
    iconOf = L.iconOf,
    markOf = L.markOf,
    nameOf = L.nameOf;
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /* 一覧(3Dが使えない時の代替も兼ねる) */
  var listPanel = $('listPanel');
  (function buildList() {
    var ul = $('list');
    ul.innerHTML = '';
    tools.forEach(function (t) {
      var li = document.createElement('li'),
        a = document.createElement('a');
      a.href = hrefOf(t);
      var mk = L.markEl(t);
      var tx = document.createElement('span');
      tx.className = 'tx';
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = nameOf(t);
      var ds = document.createElement('div');
      ds.className = 'ds';
      ds.textContent = t.desc || '';
      tx.appendChild(nm);
      tx.appendChild(ds);
      a.appendChild(mk);
      a.appendChild(tx);
      li.appendChild(a);
      ul.appendChild(li);
      a.setAttribute('data-log', nameOf(t));
    });
  })();
  $('listBtn').onclick = function () {
    listPanel.hidden = false;
    log('一覧を表示しました(' + N + '件)');
  };
  $('listClose').onclick = function () {
    listPanel.hidden = true;
    log('一覧を閉じました');
  };
  function fallback(msg, err, level) {
    /* 想定内(three.js や WebGL が使えない)は warn、それ以外は error */
    (level === 'warn' ? log.warn : log.error)(msg, err);
    $('gl').hidden = true;
    $('hint').hidden = true;
    $('bar').hidden = true;
    $('card').hidden = true;
    $('listClose').hidden = true;
    var note = $('listNote');
    note.textContent = msg + (N ? '。代わりに一覧を表示しています。' : '。');
    note.hidden = false;
    listPanel.hidden = false;
    loadingDone();
  }
  if (loadMsg) {
    fallback(loadMsg, loadErr);
    return;
  }
  if (!N) {
    fallback('表示するツールがありません');
    return;
  }
  if (!THREE) {
    fallback('3D表示用のライブラリ(three.js)を読み込めませんでした(通信が必要です)', null, 'warn');
    return;
  }

  /* 3D(描画の準備 → 絵 → 組み立て → カメラと操作) */
  var stage = $('stage'),
    canvas = $('gl'),
    renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    fallback('このブラウザでは3D表示(WebGL)を開始できませんでした', e, 'warn');
    return;
  }
  /* 色の扱い: テクスチャは sRGB、出力はフィルム調のトーンマッピング(明るい所が白飛びしにくい) */
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  var maxAniso = 1;
  try {
    maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
  } catch (e) {
    log.warn('テクスチャの異方性フィルタ上限を取得できませんでした(既定値を使います)', e);
  }
  loading(50, '本の絵と部屋を描いています…');
  next(build);
  function build() {
    var t0 = performance.now();
    var groups = core.packShelves(tools, core.capacity());
    var T = BookshelfTextures.create(THREE, core, {
      maxAniso: maxAniso,
      nameOf: nameOf,
      markOf: markOf,
      defs: texDefs || {},
    });
    /* よく使うツール: 開いた回数(localStorage)の多い順に3つ。まだ記録が無い時は一覧の先頭から */
    var usage = L.usage.all(); /* 開いた回数(全モード共通) */
    var ranked = tools
      .filter(function (t) {
        return usage[t.slug] > 0;
      })
      .sort(function (a, b) {
        return usage[b.slug] - usage[a.slug];
      });
    var favorites = (ranked.length ? ranked : tools).slice(0, 3);
    log(
      'よく使うツールを机に置きます(' +
        favorites.map(nameOf).join(' / ') +
        (ranked.length ? ' / 開いた回数の多い順' : ' / 記録がまだ無いため一覧の先頭から') +
        ')',
    );
    var world = BookshelfScene.create({
      THREE: THREE,
      core: core,
      T: T,
      groups: groups,
      favorites: favorites,
      aspect: (stage.clientWidth || 1) / (stage.clientHeight || 1),
      iconOf: iconOf,
      nameOf: nameOf,
    });
    var books = world.books,
      plan = world.plan();
    log(
      '本棚を組み立てました(本棚 ' +
        groups.length +
        'マス / ツールの本 ' +
        books.length +
        '冊 / ブックエンド ' +
        world.ends() +
        '組 / 本棚 ' +
        plan.cases +
        '台(4段×2列 / 1マス=1カテゴリ / 幅 ' +
        plan.caseW.toFixed(2) +
        'm) / 机の本 ' +
        world.deskCount() +
        '冊 / ' +
        Math.round(performance.now() - t0) +
        'ms)',
    );

    var zoomBtn = $('zoomBtn'),
      hint = $('hint'),
      card = $('card'),
      prevBtn = $('prevBtn'),
      nextBtn = $('nextBtn'),
      homeBtn = $('homeBtn'),
      openBtn = $('openBtn');
    function hideHint() {
      hint.classList.add('off');
    }
    var view = BookshelfView.create({
      THREE: THREE,
      core: core,
      renderer: renderer,
      stage: stage,
      canvas: canvas,
      world: world,
      card: card,
      zoomBtn: zoomBtn,
      onFirstMove: hideHint,
      onEmpty: function () {
        /* 本を選んでいる間に本以外を押したら、本を棚に戻す */
        if (view.focus() < 0) return;
        log('本以外の所をタップしました');
        goHome();
      },
      onTap: function (i) {
        log('「' + nameOf(books[i].tool) + '」の本をタップしました');
        if (view.focus() === i) {
          if (!view.moving()) openTool(books[i].tool);
        } else focusOn(i);
      },
      onDeskTap: function (i) {
        log('机の上の「' + nameOf(books[i].tool) + '」の本をタップしました');
        openTool(books[i].tool);
      } /* 机の本は棚に行かずにそのまま開く */,
      onThing: function (kind) {
        if (kind !== 'door') goHome(); /* 照明を押した時も、選んでいた本は棚に戻す */
        if (kind === 'pendant') {
          log('天井の照明をタップしました');
          log('天井の照明を' + (world.togglePendant() ? '点けました' : '消しました'));
        } else if (kind === 'desklamp') {
          log('机のアームライトをタップしました');
          log('机のアームライトを' + (world.toggleDeskLamp() ? '点けました' : '消しました'));
        } else if (kind === 'floorlamp') {
          log('フロアランプをタップしました');
          log('フロアランプを' + (world.toggleFloorLamp() ? '点けました' : '消しました'));
        } else if (kind === 'door') {
          log('扉をタップしました');
          leave();
        }
      },
      onSwipe: function (dir) {
        log('横スワイプで' + (dir > 0 ? '次' : '前') + 'の本へ移動します');
        step(dir);
      },
      onFirstRender: function () {
        loading(100, 'できました');
        loadingDone();
        log('最初の描画が終わりました(ページを開いてから ' + Math.round(performance.now()) + 'ms)');
      },
    });

    /* 扉: 前の画面があれば戻る。このランチャーから始まった時はタブを閉じ、閉じられなければサイトの入口へ */
    function leave() {
      var back =
        document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1;
      log(back ? '前の画面へ戻ります' : 'ランチャーを閉じます');
      if (back) {
        history.back();
        return;
      }
      window.close();
      setTimeout(function () {
        if (!window.closed) {
          log('タブを閉じられなかったため、サイトの入口を開きます');
          location.href = L.fromRoot('');
        }
      }, 300);
    }

    /* 説明カードと移動 */
    function showNav(on) {
      prevBtn.hidden = nextBtn.hidden = homeBtn.hidden = !on;
    }
    function showCard(i) {
      var rec = books[i],
        t = rec.tool,
        tg = $('cardTags');
      $('cardNo').textContent = rec.cat + ' ・ ' + pad2(i + 1) + ' / ' + books.length;
      $('cardTitle').textContent = nameOf(t);
      $('cardDesc').textContent = t.desc || '';
      tg.innerHTML = '';
      (t.tags || []).forEach(function (x) {
        var s = document.createElement('span');
        s.textContent = x;
        tg.appendChild(s);
      });
      card.hidden = false;
    }
    function focusOn(i) {
      hideHint();
      showNav(true);
      showCard(i);
      var t = books[i].tool;
      log('「' + nameOf(t) + '」の本を引き出します');
      view.setFocus(i, function () {
        log(
          '「' +
            nameOf(t) +
            '」の表紙を表示しました(' +
            (i + 1) +
            '/' +
            books.length +
            ' / ' +
            books[i].cat +
            ')',
        );
      });
    }
    function goHome() {
      if (view.focus() < 0) return;
      card.hidden = true;
      showNav(false);
      view.setFocus(-1, function () {
        log('本を棚に戻して、全体の表示に戻りました');
      });
    }
    function step(dir) {
      var f = view.focus();
      if (f < 0) return;
      focusOn(core.nextIndex(f, books.length, dir));
    }
    function openTool(t) {
      L.openTool(t);
    }
    openBtn.onclick = function () {
      if (view.focus() >= 0) openTool(books[view.focus()].tool);
    };
    homeBtn.onclick = function () {
      goHome();
    };
    prevBtn.onclick = function () {
      step(-1);
    };
    nextBtn.onclick = function () {
      step(1);
    };
    zoomBtn.onclick = function () {
      view.resetZoom(function (z0) {
        log('拡大率を等倍に戻しました(' + view.zoomLabel(z0) + ' → 1.0倍)');
      });
    };

    /* キー */
    window.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName,
        f = view.focus();
      if (e.key === 'Escape') {
        if (!listPanel.hidden && !$('listClose').hidden) {
          $('listClose').click();
        } else if (f >= 0) {
          log('Escapeキーを押下しました');
          goHome();
        }
        return;
      }
      if (!listPanel.hidden) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (f >= 0) {
          log('「' + (e.key === 'ArrowRight' ? '→' : '←') + '」キーを押下しました');
          step(e.key === 'ArrowRight' ? 1 : -1);
        } else view.look((e.key === 'ArrowRight' ? -1 : 1) * 0.15);
      } else if ((e.key === '+' || e.key === ';' || e.key === '-') && tag !== 'INPUT') {
        view.zoomBy(
          e.key === '-' ? 1 / 1.25 : 1.25,
          '「' + (e.key === '-' ? '−' : '＋') + '」キー',
        );
      } else if (e.key === 'Enter' && f >= 0 && tag !== 'BUTTON' && tag !== 'A' && !view.moving()) {
        log('Enterキーを押下しました');
        openTool(books[f].tool);
      }
    });

    new MutationObserver(world.applyTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    loading(85, '描画の準備をしています…');
    next(function () {
      view.start();
      log(
        '起動しました(ツール ' +
          N +
          '冊 / 本棚 ' +
          groups.length +
          'マス / 一覧の元データ ' +
          source +
          ')',
      );
    });
  }
}
