/* ファイル転送の画面の動き。PeerJS(公開サーバーで相手を見つけ、WebRTC で直接つなぐ)と qrcodejs は CDN から。
   計算は file-transfer-core.js、ボタンの操作ログは tool-kit.js に任せる */
(function () {
  'use strict';
  var C = window.TransferCore;

  /* 送り方 */
  var CHUNK =
    64 * 1024; /* 1回に送る大きさ。Safari の上限(256KB)より小さく、往復の回数が増えすぎない値 */
  var READ =
    1024 * 1024; /* ファイルから一度に読み出す大きさ。圧縮する時はこの区切りごとに圧縮する */
  var HIGH =
    2 * 1024 * 1024; /* 送り待ちがこれを超えたら止める(PeerJS 自身がためこみ始める 8MB より下) */
  var LOW = 512 * 1024; /* ここまで減ったら再開 */
  /* 時間切れ(ms)
     どこで止まったかで案内を変えるため、段階ごとに分ける */
  var T_SIGNAL = 10000; /* 待ち合わせサーバーにつながるまで */
  var T_CONNECT = 20000; /* 相手の端末と直接つながるまで */
  var T_APPROVE = 60000; /* 許可の確認に答えるまで */
  var T_HOST_IDLE = 10 * 60000; /* 番号を出したまま誰も来ない時に番号を無効にするまで */
  var T_PING = 5000; /* 生きていることを知らせる間隔 */
  var T_DEAD = 20000; /* 相手から何も届かなければ切れたとみなすまで */
  var T_STALL = 10000; /* 転送の進みが止まったと表示するまで */
  var T_RECONNECT = 60000; /* 切れた後、自動でつなぎ直し続ける時間 */
  var UI_INTERVAL = 200; /* 進み具合の表示を更新する間隔 */

  var $ = function (id) {
    return document.getElementById(id);
  };
  var screens = { start: $('start'), host: $('host'), join: $('join'), linked: $('linked') },
    statusEl = $('status'),
    codeEl = $('code'),
    qrEl = $('qr'),
    hostWait = $('hostWait'),
    reissueBtn = $('reissueBtn'),
    askEl = $('ask'),
    askName = $('askName'),
    askSas = $('askSas'),
    codeIn = $('codeIn'),
    joinWait = $('joinWait'),
    joinSas = $('joinSas'),
    peerNameEl = $('peerName'),
    sasEl = $('sas'),
    linkState = $('linkState'),
    fileIn = $('file'),
    listEl = $('list'),
    emptyEl = $('empty');

  var myName = Env.deviceName(),
    canGzip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function',
    peer = null,
    conn = null,
    pending = null,
    role = '',
    code = '',
    session = null /* つながった相手 {token, name, gzip}。切れても再接続の間は残す */,
    linked = false,
    gen = 0 /* 接続ごとに増やし、古い接続の処理を止める目印にする */,
    timers = {},
    lastSeen = 0,
    reconnectUntil = 0,
    retries = 0,
    seq = 0,
    items = {},
    queue = [],
    sending = null,
    receiving = null,
    partials = {} /* 途中まで受け取ったファイル。key → {r, it} */,
    finished =
      {} /* 受け取り終えたファイル(相手の id|key)。完了の知らせが届かずに送り直された時に使う */,
    wake = null,
    wakeWarned = false;

  if (!window.Peer) {
    statusEl.textContent =
      '接続用のライブラリを読み込めませんでした。通信状態を確認して開き直してください';
    log.error('接続用のライブラリ(PeerJS)を読み込めませんでした');
  }
  var needHttps = Env.requireSecure('ファイル転送');
  if (needHttps) statusEl.textContent = needHttps;

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].hidden = k !== name;
    });
  }
  function say(text) {
    statusEl.textContent = text || '';
  }
  function later(name, ms, fn) {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(fn, ms);
  }
  function stop(name) {
    clearTimeout(timers[name]);
    clearInterval(timers[name]);
    timers[name] = 0;
  }
  function send(obj) {
    if (conn) conn.send(JSON.stringify(obj));
  }

  /* 待ち合わせサーバー */
  function newPeer(id) {
    var p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    later('signal', T_SIGNAL, function () {
      if (p !== peer || p.open) return;
      log.warn('待ち合わせ用のサーバーにつながりませんでした(' + T_SIGNAL / 1000 + '秒)');
      failSetup(
        '待ち合わせ用のサーバーにつながりませんでした。通信状態を確かめて、少し待ってからやり直してください',
      );
    });
    p.on('open', function () {
      if (p === peer) stop('signal');
    });
    p.on('error', function (e) {
      onPeerError(p, e);
    });
    /* 再接続を待つ間は、番号を出した側がサーバーとのつながりを保つ必要がある */
    p.on('disconnected', function () {
      if (p === peer && !p.destroyed && session)
        setTimeout(function () {
          if (p === peer && !p.destroyed && p.disconnected) p.reconnect();
        }, 1000);
    });
    return p;
  }
  /* PeerJS のエラーの種類ごとに、画面の言葉を変える */
  function onPeerError(p, e) {
    if (p !== peer) return;
    var t = (e && e.type) || '不明';
    if (t === 'unavailable-id' && role === 'host' && !session && retries < 3) {
      retries++;
      log.warn('番号が他の人と重なったため、別の番号にします');
      startHost();
      return;
    }
    if (session) {
      /* 再接続中の失敗は、時間内なら次の試みに任せる */
      log.warn('再接続の試みでエラーが発生しました(' + t + ')');
      return;
    }
    if (t === 'peer-unavailable') {
      log.warn('その番号の相手が見つかりませんでした');
      failSetup(
        'その番号の相手が見つかりませんでした。番号と、相手の画面に番号が出ているかを確かめてください',
      );
      return;
    }
    log.error('接続でエラーが発生しました(' + t + ')', e);
    failSetup(
      /network|server-error|socket/.test(t)
        ? '待ち合わせ用のサーバーにつながりませんでした。通信状態を確かめて、少し待ってからやり直してください'
        : t === 'browser-incompatible' || t === 'webrtc'
          ? 'このブラウザでは直接の接続が使えません'
          : 'つながりませんでした(' + t + ')',
    );
  }
  /* つなぐ前の失敗。最初の画面に戻して理由を出す */
  function failSetup(msg) {
    reset();
    say(msg);
  }

  /* 確認番号(両方の画面で同じなら、間に誰も入っていない) */
  function sasOf(c) {
    var pc = c && c.peerConnection,
      a = pc && pc.localDescription && C.fingerprint(pc.localDescription.sdp),
      b = pc && pc.remoteDescription && C.fingerprint(pc.remoteDescription.sdp);
    if (!a || !b || !window.crypto || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(C.sasInput(a, b))).then(
      function (h) {
        return C.sasDigits(new Uint8Array(h));
      },
      function (e) {
        log.warn('確認番号を作れませんでした', e);
        return '';
      },
    );
  }
  function showSas(el, c) {
    el.textContent = '';
    return sasOf(c).then(function (s) {
      el.textContent = s ? '確認番号 ' + s : '確認番号を出せませんでした';
      return s;
    });
  }

  /* 番号を出す側 */
  function startHost() {
    if (peer) peer.destroy();
    role = 'host';
    code = C.makeCode();
    show('host');
    askEl.hidden = true;
    reissueBtn.hidden = true;
    codeEl.textContent = '------';
    qrEl.textContent = '';
    hostWait.textContent = '準備しています…';
    say('');
    var p = (peer = newPeer(C.peerId(code)));
    p.on('open', function () {
      if (p !== peer) return;
      codeEl.textContent = C.showCode(code);
      drawQr(location.origin + location.pathname + '#' + code);
      hostWait.textContent = '相手を待っています…';
      log('番号を発行して、相手を待ち始めました');
      later('hostIdle', T_HOST_IDLE, expireCode);
    });
    p.on('connection', function (c) {
      incoming(p, c);
    });
  }
  /* 番号を出したまま放置された時は、他人に使われないよう無効にする */
  function expireCode() {
    if (role !== 'host' || session || pending) return;
    if (peer) peer.destroy();
    peer = null;
    codeEl.textContent = '------';
    qrEl.textContent = '';
    hostWait.textContent = '番号の有効期限(' + T_HOST_IDLE / 60000 + '分)が切れました';
    reissueBtn.hidden = false;
    log('番号の有効期限が切れたため、無効にしました');
  }
  reissueBtn.onclick = function () {
    retries = 0;
    startHost();
  };
  function refuse(c, why) {
    var go = function () {
      c.send(JSON.stringify({ t: 'reject', why: why }));
      setTimeout(function () {
        c.close();
      }, 500);
    };
    if (c.open) go();
    else c.on('open', go);
  }
  function incoming(p, c) {
    if (p !== peer) return;
    if (linked || pending) {
      refuse(c, 'busy');
      log.warn('つながっている間に別の申し込みがあったため断りました');
      return;
    }
    var opened = false;
    setTimeout(function () {
      if (!opened) c.close();
    }, T_CONNECT);
    c.on('open', function () {
      opened = true;
    });
    c.on('data', function (d) {
      var m = C.parseMsg(d);
      if (!m || m.t !== 'hello' || linked || c === conn) return;
      if (session) {
        /* 再接続。最初に渡した合言葉が合えば、確認なしで続ける */
        if (m.token === session.token) {
          c.send(
            JSON.stringify({ t: 'accept', name: myName, token: session.token, gzip: canGzip }),
          );
          attach(c, true);
        } else {
          refuse(c, 'busy');
          log.warn('再接続を待つ間に別の端末から申し込みがあったため断りました');
        }
        return;
      }
      if (pending) return;
      pending = c;
      stop('hostIdle');
      askName.textContent = String(m.name || '端末').slice(0, 40);
      pending.peerInfo = { name: askName.textContent, gzip: !!m.gzip };
      showSas(askSas, c);
      askEl.hidden = false;
      hostWait.textContent = '';
      ToolKit.vibrate(30);
      log('接続の申し込みがありました(' + askName.textContent + ')');
      later('approve', T_APPROVE, function () {
        if (pending !== c) return;
        deny('timeout');
        log.warn('許可の確認に答えがなかったため断りました(' + T_APPROVE / 1000 + '秒)');
      });
    });
    c.on('close', function () {
      if (c === pending) {
        pending = null;
        stop('approve');
        askEl.hidden = true;
        hostWait.textContent = '相手を待っています…';
        later('hostIdle', T_HOST_IDLE, expireCode);
        log('申し込みが取り下げられました');
      }
    });
  }
  function drawQr(url) {
    qrEl.textContent = '';
    if (!window.QRCode) {
      qrEl.textContent = 'QRコードを作れませんでした(番号を入力してもらってください)';
      log.warn('QRコードのライブラリを読み込めませんでした');
      return;
    }
    new QRCode(qrEl, { text: url, width: 176, height: 176, correctLevel: QRCode.CorrectLevel.M });
  }
  $('allowBtn').onclick = function () {
    var c = pending;
    if (!c) return;
    pending = null;
    stop('approve');
    askEl.hidden = true;
    var tk = new Uint8Array(16);
    crypto.getRandomValues(tk);
    session = { token: C.token(tk), name: c.peerInfo.name, gzip: c.peerInfo.gzip };
    c.send(JSON.stringify({ t: 'accept', name: myName, token: session.token, gzip: canGzip }));
    attach(c, false);
  };
  function deny(why) {
    var c = pending;
    if (!c) return;
    pending = null;
    stop('approve');
    askEl.hidden = true;
    hostWait.textContent = '相手を待っています…';
    refuse(c, why);
    later('hostIdle', T_HOST_IDLE, expireCode);
  }
  $('denyBtn').onclick = function () {
    deny('');
    log('接続を断りました');
  };

  /* 番号で参加する側 */
  function startJoin(c) {
    if (peer) peer.destroy();
    role = 'join';
    code = c;
    show('join');
    codeIn.value = C.showCode(c);
    joinWait.textContent = '待ち合わせ用のサーバーにつないでいます…';
    joinSas.textContent = '';
    say('');
    peer = newPeer();
    peer.on('open', dial);
  }
  /* 相手に申し込む。最初の接続と再接続の両方で使う */
  function dial() {
    var p = peer,
      g = gen,
      reconnect = !!session,
      c = p.connect(C.peerId(code), { reliable: true, serialization: 'raw' });
    if (!reconnect) joinWait.textContent = '相手の端末とつないでいます…';
    later('connect', T_CONNECT, function () {
      if (p !== peer || g !== gen || linked) return;
      c.close();
      if (reconnect) return;
      log.warn('相手の端末と時間内につながりませんでした(' + T_CONNECT / 1000 + '秒)');
      failSetup(
        '相手の端末とつながりませんでした。2台を同じWi-Fiにつないでやり直してください(携帯回線どうしではつながらないことがあります)',
      );
    });
    c.on('open', function () {
      if (p !== peer) return;
      stop('connect');
      c.send(
        JSON.stringify({
          t: 'hello',
          name: myName,
          gzip: canGzip,
          token: session ? session.token : '',
        }),
      );
      if (reconnect) return;
      joinWait.textContent = '相手の許可を待っています…';
      showSas(joinSas, c);
      log('相手を見つけました(許可を待っています)');
      /* 相手が断りも許可もしないまま閉じた時に備えて、相手の時間切れより少し長く待つ */
      later('approve', T_APPROVE + 10000, function () {
        if (p !== peer || linked) return;
        log.warn('許可の確認に答えがありませんでした');
        failSetup('相手が許可しませんでした。もう一度やり直してください');
      });
    });
    c.on('data', function (d) {
      if (linked || p !== peer) return;
      var m = C.parseMsg(d);
      if (!m) return;
      if (m.t === 'accept') {
        stop('approve');
        if (!session) session = { token: String(m.token || ''), name: '', gzip: false };
        session.name = String(m.name || '端末').slice(0, 40);
        session.gzip = !!m.gzip;
        attach(c, reconnect);
      } else if (m.t === 'reject') {
        stop('approve');
        if (reconnect) return;
        var msg =
          m.why === 'busy'
            ? '相手はほかの端末とつながっています'
            : m.why === 'timeout'
              ? '相手が時間内に許可しませんでした'
              : '相手が接続を断りました';
        log.warn(msg);
        failSetup(msg);
      }
    });
  }
  $('hostBtn').onclick = function () {
    retries = 0;
    startHost();
  };
  $('joinBtn').onclick = function () {
    role = 'join';
    show('join');
    joinWait.textContent = '';
    joinSas.textContent = '';
    codeIn.value = '';
    codeIn.focus();
  };
  $('connectBtn').onclick = function () {
    var c = C.parseCode(codeIn.value);
    if (!c) {
      joinWait.textContent = '6桁の数字を入れてください';
      log.warn('番号の形が正しくありませんでした');
      return;
    }
    startJoin(c);
  };
  codeIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      log('Enterキーを押下しました');
      $('connectBtn').click();
    }
  });
  $('hostCancel').onclick = $('joinCancel').onclick = function () {
    reset();
    log('接続をやめました');
  };

  /* つながった後 */
  function attach(c, resumed) {
    stop('connect');
    stop('reconnect');
    gen++;
    conn = c;
    linked = true;
    lastSeen = performance.now();
    if (c.dataChannel) {
      /* Blob で届くと順番を保ったまま扱いにくいため、ArrayBuffer で受け取る */
      c.dataChannel.binaryType = 'arraybuffer';
      c.dataChannel.bufferedAmountLowThreshold = LOW;
    }
    var g = gen;
    c.on('data', function (d) {
      if (g !== gen) return;
      lastSeen = performance.now();
      onData(d);
    });
    c.on('close', function () {
      if (g === gen) dropped('接続が切れました');
    });
    c.on('error', function (e) {
      log.error('接続でエラーが発生しました', e);
    });
    timers.ping = setInterval(function () {
      if (g !== gen) return;
      send({ t: 'ping' });
      watch();
    }, T_PING);
    show('linked');
    peerNameEl.textContent = session.name;
    linkState.textContent = 'つながっています';
    linkState.className = 'link-state';
    showSas(sasEl, c);
    say('');
    ToolKit.vibrate(30);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (resumed) {
      /* 切れる前に送り終えて完了の知らせを待っていた物は、相手に確かめ直す(受け取り済みならすぐ完了になる) */
      Object.keys(items).forEach(function (k) {
        var it = items[k];
        if (it.dir === 'out' && it.waitDone && queue.indexOf(it) < 0) {
          it.waitDone = false;
          queue.unshift(it);
        }
      });
      log('再接続しました(相手 ' + session.name + ')');
    } else
      log(
        'つながりました(相手 ' +
          session.name +
          ' / ' +
          (role === 'host' ? '番号を発行した側' : '番号で参加した側') +
          (session.gzip && canGzip ? ' / 圧縮あり' : '') +
          ')',
      );
    pump();
  }
  /* 相手から何も届かない時間と、転送の進みが止まった時間を見張る */
  function watch() {
    var now = performance.now();
    if (now - lastSeen > T_DEAD) {
      dropped('相手からの応答が' + T_DEAD / 1000 + '秒ありませんでした');
      return;
    }
    [sending, receiving && receiving.it].forEach(function (it) {
      if (it && it.moved && now - it.moved > T_STALL && !it.stalled) {
        it.stalled = true;
        setState(it, '止まっています(相手の画面が消えていないか確かめてください)');
        log.warn('転送が止まっています(' + T_STALL / 1000 + '秒)');
      }
    });
  }
  /* 思いがけず切れた時。送りかけのファイルは列の先頭に戻し、受け取りかけの分は残して、つなぎ直す */
  function dropped(why) {
    if (!linked) return;
    linked = false;
    gen++;
    stop('ping');
    var c = conn;
    conn = null;
    if (c) c.close();
    if (sending) {
      if (!sending.cancelled) {
        queue.unshift(sending);
        setState(sending, '中断しました(再接続を待っています)');
      }
      sending = null;
    }
    if (receiving) {
      setState(receiving.it, '中断しました(再接続を待っています)');
      receiving = null;
    }
    log.warn(why + '(再接続します)');
    reconnectUntil = performance.now() + T_RECONNECT;
    linkState.textContent = '接続が切れました。再接続しています…';
    linkState.className = 'link-state lost';
    sasEl.textContent = '';
    tryReconnect();
  }
  function tryReconnect() {
    stop('reconnect');
    if (linked || !session) return;
    var left = reconnectUntil - performance.now();
    if (left <= 0) {
      giveUp();
      return;
    }
    linkState.textContent =
      '接続が切れました。再接続しています…(残り ' + Math.ceil(left / 1000) + '秒)';
    if (role === 'join') {
      /* 待ち合わせサーバーとのつながりも切れていれば作り直す */
      if (!peer || peer.destroyed || peer.disconnected) {
        if (peer) peer.destroy();
        peer = newPeer();
        peer.on('open', dial);
      } else if (peer.open) dial();
    } else if (peer && !peer.destroyed && peer.disconnected) peer.reconnect();
    timers.reconnect = setTimeout(tryReconnect, role === 'join' ? T_CONNECT / 2 : 3000);
  }
  /* 自動のつなぎ直しを諦めた時。ファイルは残し、つなぎ直してから「再送」できるようにする */
  function giveUp() {
    log.warn('再接続できませんでした(' + T_RECONNECT / 1000 + '秒)');
    session = null;
    interruptAll('中断しました');
    reset();
    say('再接続できませんでした。もう一度つないでから「再送」を押すと、続きから送れます');
  }
  /* 状態を最初に戻す。一覧と途中まで受け取った分は残す */
  function reset() {
    Object.keys(timers).forEach(stop);
    linked = false;
    gen++;
    var c = conn;
    conn = null;
    if (pending) pending.close();
    pending = null;
    if (c) c.close();
    if (peer) peer.destroy();
    peer = null;
    session = null;
    role = '';
    show('start');
    releaseWake();
  }
  $('byeBtn').onclick = function () {
    send({ t: 'bye' });
    interruptAll('切断したため中断しました');
    var c = conn;
    conn = null;
    gen++;
    setTimeout(function () {
      if (c) c.close();
    }, 300);
    reset();
    log('切断しました');
  };

  /* 一覧 */
  function addItem(dir, name, size) {
    var id = String(++seq) + '-' + dir,
      li = document.createElement('li'),
      n = Object.keys(items).filter(function (k) {
        return items[k].dir === dir;
      }).length;
    li.className = 'item ' + dir;
    li.setAttribute('data-log-group', (dir === 'out' ? '送信 ' : '受信 ') + (n + 1));
    li.innerHTML =
      '<div class="head"><span class="dir"></span><span class="name"></span><span class="size"></span></div>' +
      '<div class="bar"><span></span></div><div class="foot"><span class="state"></span><span class="btns"></span></div>';
    li.querySelector('.dir').textContent = dir === 'out' ? '送信' : '受信';
    li.querySelector('.name').textContent = name;
    li.querySelector('.size').textContent = C.bytes(size);
    listEl.insertBefore(li, listEl.firstChild);
    emptyEl.hidden = true;
    var it = {
      id: id,
      dir: dir,
      name: name,
      size: size,
      done: 0,
      el: li,
      speed: new C.Speed(),
      t0: 0,
      ui: 0,
    };
    items[id] = it;
    return it;
  }
  function setState(it, text, cls) {
    it.el.querySelector('.state').textContent = text;
    it.el.classList.remove('ok', 'stopped', 'failed');
    if (cls) it.el.classList.add(cls);
  }
  function progress(it, force) {
    var now = performance.now();
    if (it.done !== it.last) {
      it.last = it.done;
      it.moved = now;
      it.stalled = false;
    }
    it.speed.add(now, it.done);
    if (!force && now - it.ui < UI_INTERVAL) return;
    it.ui = now;
    var r = it.speed.rate();
    it.el.querySelector('.bar span').style.width =
      (it.size ? (it.done / it.size) * 100 : 100) + '%';
    setState(
      it,
      C.bytes(it.done) +
        ' / ' +
        C.bytes(it.size) +
        (r > 0
          ? ' ・ ' + C.bytes(r) + '/秒 ・ 残り ' + C.seconds(C.eta(it.size - it.done, r))
          : ''),
    );
  }
  function buttons(it, list) {
    var box = it.el.querySelector('.btns');
    box.textContent = '';
    list.forEach(function (b) {
      var el = document.createElement(b.href ? 'a' : 'button');
      el.className = 'pill small' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      if (b.href) {
        el.href = b.href;
        el.download = b.download;
        el.setAttribute('role', 'button');
      } else el.type = 'button';
      if (b.on) el.addEventListener('click', b.on);
      box.appendChild(el);
    });
  }
  /* 速度は元のファイルの大きさで数える。圧縮した時は実際に流れた量も添える */
  function summary(it) {
    var sec = (performance.now() - it.t0) / 1000;
    return (
      C.bytes(it.size) +
      ' / ' +
      sec.toFixed(1) +
      '秒 / ' +
      C.bytes(sec > 0 ? it.size / sec : 0) +
      '/秒' +
      (it.enc && it.wire ? ' / 通信量 ' + C.bytes(it.wire) : '') +
      (it.resumed ? ' / 途中から再開' : '')
    );
  }

  /* 送信 */
  $('sendBtn').onclick = function () {
    fileIn.click();
  };
  fileIn.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileIn.files || []);
    fileIn.value = '';
    if (!files.length) return;
    var total = 0;
    files.forEach(function (f) {
      total += f.size;
      var it = addItem('out', f.name, f.size);
      it.file = f;
      enqueue(it);
    });
    log('送るファイルを追加しました(' + files.length + '件 / ' + C.bytes(total) + ')');
    pump();
  });
  function enqueue(it) {
    it.ended = false;
    it.cancelled = false;
    setState(it, linked ? '順番待ち' : 'つながるのを待っています');
    buttons(it, [{ label: '取り消し', on: cancelOut.bind(null, it) }]);
    queue.push(it);
  }
  function cancelOut(it) {
    if (it.ended) return;
    it.cancelled = true;
    var qi = queue.indexOf(it);
    if (qi >= 0) queue.splice(qi, 1);
    if (it !== sending) finishOut(it, '取り消しました', 'stopped');
    log('送信を取り消しました(' + C.bytes(it.size) + ')');
  }
  function finishOut(it, text, cls) {
    it.ended = true;
    it.waitDone = false;
    setState(it, text, cls || 'stopped');
    var list = [];
    /* 送れなかった物は、つなぎ直してから送り直せるようにファイルを持っておく */
    if (cls === 'failed' && it.file)
      list.push({ label: '再送', primary: true, on: resend.bind(null, it) });
    else it.file = null;
    buttons(it, list);
  }
  function resend(it) {
    if (!it.file) return;
    enqueue(it);
    log('送り直しを予約しました(' + C.bytes(it.size) + ')');
    pump();
  }
  function gzip(buf) {
    return new Response(
      new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
  }
  function gunzip(blob) {
    return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  function waitDrain(g) {
    var dc = conn && conn.dataChannel;
    if (!dc || dc.bufferedAmount <= HIGH) return Promise.resolve();
    return new Promise(function (ok) {
      var done = function () {
        dc.removeEventListener('bufferedamountlow', done);
        clearInterval(poll);
        ok();
      };
      /* bufferedamountlow が来ない実装に備えて、ときどき自分でも確かめる */
      var poll = setInterval(function () {
        if (g !== gen || dc.bufferedAmount <= LOW) done();
      }, 100);
      dc.addEventListener('bufferedamountlow', done);
    });
  }
  var DROP = new Error('接続が切れました'),
    ALREADY = new Error('受け取り済み');
  /* 1件を送る。ファイルを READ ずつ読み、圧縮する時はその区切りごとに gzip のストリームに通して、
     区切りの前に blk(元の大きさ・流す大きさ)を付けて流す。区切りが独立しているので、
     圧縮しても進み具合と再開の位置は元のファイルのバイト数で数えられ、全体をメモリにためずに済む */
  function pump() {
    if (sending || !linked || !queue.length) {
      if (!sending && !receiving) releaseWake();
      return;
    }
    holdWake();
    var it = (sending = queue.shift()),
      f = it.file,
      g = gen,
      off = 0,
      crc = 0;
    var alive = function () {
      if (g !== gen) throw DROP;
    };
    if (!it.t0) it.t0 = performance.now();
    it.enc =
      canGzip && session && session.gzip && C.shouldCompress(f.name, f.type, f.size) ? 'gzip' : '';
    it.wire = it.wire || 0; /* 通信量は再開をまたいで数える */
    it.key = C.fileKey(it.name, f.size, f.lastModified, it.enc);
    setState(it, '相手の準備を待っています');
    new Promise(function (ok, ng) {
      it.ready = { ok: ok, ng: ng };
      send({
        t: 'file',
        id: it.id,
        key: it.key,
        name: it.name,
        size: f.size,
        enc: it.enc,
        type: f.type,
      });
    })
      .then(function (from) {
        alive();
        if (from < 0) throw ALREADY;
        from = Math.min(from, f.size);
        if (from > 0) {
          it.resumed = true;
          log('続きから送ります(' + C.bytes(from) + ' まで届いています)');
        }
        /* 再開した時も、届いている分を読み直して全体の CRC を計算する */
        var pre = function (p) {
          if (p >= from) return Promise.resolve();
          return f
            .slice(p, Math.min(from, p + READ))
            .arrayBuffer()
            .then(function (b) {
              crc = C.crc32(crc, new Uint8Array(b));
              return pre(p + b.byteLength);
            });
        };
        off = from;
        it.speed.reset();
        return pre(0);
      })
      .then(function next() {
        alive();
        if (it.cancelled) return false;
        if (off >= f.size) return true;
        return f
          .slice(off, off + READ)
          .arrayBuffer()
          .then(function (buf) {
            crc = C.crc32(crc, new Uint8Array(buf));
            if (!it.enc) return { data: buf, raw: buf.byteLength, gz: false };
            /* 縮まない区切り(途中に写真が埋まった文書など)は元のまま流す */
            return gzip(buf).then(function (z) {
              return {
                data: z.byteLength < buf.byteLength ? z : buf,
                raw: buf.byteLength,
                gz: z.byteLength < buf.byteLength,
              };
            });
          })
          .then(function (b) {
            alive();
            var raw = b.raw,
              len = b.data.byteLength,
              p = Promise.resolve();
            if (it.enc) send({ t: 'blk', n: raw, z: len, gz: b.gz });
            for (let i = 0; i < len; i += CHUNK) {
              p = p
                .then(function () {
                  return waitDrain(g);
                })
                .then(function () {
                  alive();
                  if (it.cancelled) return;
                  conn.send(b.data.slice(i, i + CHUNK));
                  it.wire += Math.min(CHUNK, len - i);
                  /* 送り待ちの分を引いて、相手に届いた量に近づける(圧縮した時は元の大きさに換算) */
                  var dc = conn.dataChannel,
                    sent = Math.min(i + CHUNK, len) - (dc ? dc.bufferedAmount : 0);
                  it.done = Math.max(0, off + Math.round((sent / len) * raw));
                  progress(it);
                });
            }
            return p.then(function () {
              off += raw;
              return next();
            });
          });
      })
      .then(
        function (ok) {
          sending = null;
          send({ t: 'end', id: it.id, ok: ok, crc: crc });
          if (ok) {
            it.done = it.size;
            progress(it, true);
            it.waitDone = true;
            setState(it, '相手の受け取りを待っています');
          } else finishOut(it, '取り消しました', 'stopped');
          pump();
        },
        function (e) {
          if (e === DROP) return; /* dropped() が列に戻している */
          sending = null;
          if (e === ALREADY) {
            finishOut(it, '送りました(' + summary(it) + ')', 'ok');
            log('ファイルを送りました(相手が受け取り済みでした)');
            pump();
            return;
          }
          log.error('ファイルの送信でエラーが発生しました', e);
          finishOut(it, '送れませんでした', 'failed');
          pump();
        },
      );
  }

  /* 受信 */
  function onData(d) {
    if (d instanceof ArrayBuffer) {
      if (receiving) takeBytes(receiving, d);
      return;
    }
    var m = C.parseMsg(d);
    if (!m) {
      if (d && typeof d !== 'string')
        log.warn('想定していない形のデータが届きました(' + typeof d + ')');
      return;
    }
    if (m.t === 'ping') return;
    if (m.t === 'file') onFile(m);
    else if (m.t === 'blk') {
      if (receiving && receiving.r.enc)
        receiving.blk = { n: m.n, z: m.z, gz: !!m.gz, bufs: [], have: 0 };
    } else if (m.t === 'ready') {
      var s = items[m.id];
      if (s && s.ready) s.ready.ok(m.from);
    } else if (m.t === 'end') onEnd(m);
    else if (m.t === 'done') {
      var o = items[m.id];
      if (o && o.dir === 'out' && o.waitDone) {
        finishOut(o, '送りました(' + summary(o) + ')', 'ok');
        log('ファイルを送りました(' + summary(o) + ')');
      }
    } else if (m.t === 'bad') {
      var b = items[m.id];
      if (b && b.dir === 'out') {
        finishOut(b, '相手の受け取りで壊れていました(「再送」で送り直せます)', 'failed');
        log.warn('相手の受け取りでファイルが壊れていました');
      }
    } else if (m.t === 'cancel') {
      var c = items[m.id];
      if (c && c.dir === 'out' && !c.ended) {
        c.cancelled = true;
        var qi = queue.indexOf(c);
        if (qi >= 0) queue.splice(qi, 1);
        if (c !== sending) finishOut(c, '相手が取り消しました', 'stopped');
        log('相手が受け取りを取り消しました');
      }
    } else if (m.t === 'bye') {
      interruptAll('相手が切断したため中断しました');
      log.warn('相手が切断しました');
      reset();
      say('相手が切断しました');
    }
  }
  /* 届いたバイト列。圧縮なしはそのままためる。圧縮ありは区切り1つ分そろったら展開してためる。
     展開は非同期なので、区切りの順番が入れ替わらないよう chain に1本でつなぐ */
  function takeBytes(rc, d) {
    if (rc.r.cancelled) return;
    if (!rc.r.enc) {
      if (rc.r.add(d)) {
        rc.it.wire = rc.r.got;
        rc.it.done = rc.r.got;
        progress(rc.it);
      }
      return;
    }
    var b = rc.blk;
    if (!b) return;
    b.bufs.push(d);
    b.have += d.byteLength;
    rc.it.wire += d.byteLength;
    if (b.have < b.z) return;
    rc.blk = null;
    var data = new Blob(b.bufs);
    rc.chain = rc.chain
      .then(function () {
        if (rc.r.cancelled || rc.bad) return;
        return (b.gz ? gunzip(data) : data.arrayBuffer()).then(function (raw) {
          if (raw.byteLength !== b.n || !rc.r.add(raw))
            throw new Error('区切りの大きさが合いません');
          rc.it.done = rc.r.got;
          progress(rc.it);
        });
      })
      .catch(function (e) {
        rc.bad = true;
        log.error('届いた区切りの展開でエラーが発生しました', e);
      });
  }
  function onFile(m) {
    if (finished[m.id + '|' + m.key]) {
      send({ t: 'ready', id: m.id, from: -1 });
      return;
    }
    holdWake();
    var p = partials[m.key];
    if (p && p.r.size === m.size && !p.r.cancelled && !p.bad) {
      /* 前に途中まで受け取った同じファイル。展開し終えた分の続きから受け取る
         (切れた時に途中だった区切りは捨てて、その区切りの頭から送り直してもらう) */
      p.it.remote = m.id;
      p.it.resumed = true;
      p.blk = null;
      setState(p.it, '続きから受け取っています');
      buttons(p.it, [{ label: '取り消し', on: cancelIn.bind(null, p.it) }]);
    } else {
      var it = addItem('in', C.safeName(m.name), m.size);
      it.t0 = performance.now();
      it.remote = m.id;
      it.wire = 0;
      it.enc = m.enc === 'gzip' ? 'gzip' : '';
      p = partials[m.key] = {
        r: new C.Receiving(m),
        it: it,
        chain: Promise.resolve(),
        blk: null,
        bad: false,
      };
      buttons(it, [{ label: '取り消し', on: cancelIn.bind(null, it) }]);
      setState(it, '受け取っています');
      log('ファイルを受け取り始めました(' + C.bytes(m.size) + (it.enc ? ' / 圧縮あり' : '') + ')');
    }
    p.it.speed.reset();
    receiving = p;
    var g = gen;
    p.chain.then(function () {
      if (g !== gen) return;
      if (p.it.resumed && p.r.got)
        log('続きから受け取ります(' + C.bytes(p.r.got) + ' / ' + C.bytes(m.size) + ')');
      send({ t: 'ready', id: m.id, from: p.r.got });
    });
  }
  function onEnd(m) {
    var rc = receiving;
    receiving = null;
    if (!rc || rc.it.remote !== m.id) return;
    rc.chain.then(function () {
      if (!m.ok) {
        delete partials[rc.r.key];
        if (!rc.it.ended) {
          rc.it.ended = true;
          setState(rc.it, '相手が取り消しました', 'stopped');
          buttons(rc.it, []);
          log('相手が送信を取り消しました');
        }
      } else if (rc.r.cancelled) {
        delete partials[rc.r.key];
      } else if (!rc.bad && rc.r.complete(m.crc >>> 0)) {
        delete partials[rc.r.key];
        var blob = new Blob(rc.r.parts, { type: rc.r.type });
        rc.r.parts = null;
        finished[m.id + '|' + rc.r.key] = true;
        send({ t: 'done', id: m.id });
        received(rc.it, blob);
      } else {
        delete partials[rc.r.key];
        rc.r.parts = null;
        rc.it.ended = true;
        setState(rc.it, '壊れていたため受け取れませんでした(相手に送り直しを頼めます)', 'failed');
        buttons(rc.it, []);
        send({ t: 'bad', id: m.id });
        log.warn('届いたファイルが壊れていました(大きさか CRC が合いません)');
      }
      if (!sending && !receiving) releaseWake();
    });
  }
  function cancelIn(it) {
    var key = Object.keys(partials).filter(function (k) {
      return partials[k].it === it;
    })[0];
    if (key) {
      partials[key].r.cancelled = true;
      partials[key].r.parts = [];
      delete partials[key];
    }
    it.ended = true;
    setState(it, '取り消しました', 'stopped');
    buttons(it, []);
    send({ t: 'cancel', id: it.remote });
    log('受け取りを取り消しました(' + C.bytes(it.size) + ')');
  }
  function received(it, blob) {
    it.ended = true;
    it.blob = blob;
    it.url = URL.createObjectURL(blob);
    it.done = it.size;
    progress(it, true);
    setState(it, '受け取りました(' + summary(it) + ')', 'ok');
    log('ファイルを受け取りました(' + summary(it) + ')');
    ToolKit.vibrate(20);
    var file = null;
    try {
      file = new File([blob], it.name, { type: blob.type });
    } catch (e) {
      file = null;
    }
    var list = [{ label: '保存', href: it.url, download: it.name, primary: true }];
    /* iPhone では共有から「画像を保存」で写真に入れられる */
    if (file && navigator.canShare && navigator.canShare({ files: [file] }))
      list.push({
        label: '共有',
        on: function () {
          navigator.share({ files: [file] }).then(
            function () {
              log('共有しました(' + C.bytes(it.size) + ')');
            },
            function (e) {
              if (e && e.name === 'AbortError') log('共有をやめました');
              else log.warn('共有できませんでした', e);
            },
          );
        },
      });
    list.push({ label: '消す', on: removeItem.bind(null, it) });
    buttons(it, list);
  }
  /* 受け取ったファイルはメモリに置いたままなので、要らなくなったら消して空ける */
  function removeItem(it) {
    if (it.url) URL.revokeObjectURL(it.url);
    it.blob = null;
    it.el.remove();
    delete items[it.id];
    emptyEl.hidden = Object.keys(items).length > 0;
    log('一覧から消しました(' + C.bytes(it.size) + ')');
  }
  /* 再接続しない時。送る物は「再送」できる形で止め、受け取りかけの分は同じファイルが来た時のために残す */
  function interruptAll(text) {
    if (sending) {
      queue.unshift(sending);
      sending = null;
    }
    queue.forEach(function (it) {
      finishOut(it, text, 'failed');
    });
    queue = [];
    Object.keys(items).forEach(function (k) {
      var it = items[k];
      if (it.dir === 'out' && it.waitDone)
        finishOut(it, '相手が受け取ったか確かめられませんでした', 'failed');
    });
    Object.keys(partials).forEach(function (k) {
      var p = partials[k];
      setState(p.it, text + '(同じファイルが届けば続きから受け取ります)', 'stopped');
      buttons(p.it, [{ label: '取り消し', on: cancelIn.bind(null, p.it) }]);
    });
    receiving = null;
  }

  /* 転送中に画面が消えると止まるため、消えないようにする */
  function holdWake() {
    if (wake || !navigator.wakeLock || document.hidden) return;
    wake = 'pending';
    navigator.wakeLock.request('screen').then(
      function (w) {
        wake = w;
        w.addEventListener('release', function () {
          if (wake === w) wake = null;
        });
      },
      function (e) {
        wake = null;
        /* 断られた時は毎回同じになるため、1回だけ記録する */
        if (!wakeWarned) log.warn('画面を消えないようにできませんでした', e);
        wakeWarned = true;
      },
    );
  }
  function releaseWake() {
    if (wake && wake !== 'pending') wake.release();
    wake = null;
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && (sending || receiving)) holdWake();
    else if (document.hidden && (sending || receiving))
      log.warn('転送中に画面が隠れました(止まることがあります)');
  });

  /* 起動 */
  show('start');
  log.started(myName + (canGzip ? '' : ' / 圧縮なし'));
  var fromUrl = C.parseCode(location.hash);
  if (fromUrl && window.Peer && !needHttps) {
    log('QRコードのリンクから開いたため、つなぎます');
    startJoin(fromUrl);
  }
})();
