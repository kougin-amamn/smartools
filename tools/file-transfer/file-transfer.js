/* ファイル転送の画面の動き。PeerJS(公開サーバーで相手を見つけ、WebRTC で直接つなぐ)と qrcodejs は CDN から。
   計算は file-transfer-core.js、ボタンの操作ログは tool-kit.js に任せる */
(function () {
  'use strict';
  var C = window.TransferCore;

  /* 設定 */
  var CHUNK = 64 * 1024; /* 1回に送る大きさ。Safari の上限(256KB)より小さく、往復の回数が増えすぎない値 */
  var READ = 1024 * 1024; /* ファイルから一度に読み出す大きさ */
  var HIGH = 4 * 1024 * 1024; /* 送り待ちがこれを超えたら止める(PeerJS 自身がためこみ始める 8MB より下) */
  var LOW = 1024 * 1024; /* ここまで減ったら再開 */
  var CONNECT_TIMEOUT = 20000; /* つながらない時に諦めるまでの時間(ms) */
  var UI_INTERVAL = 200; /* 進み具合の表示を更新する間隔(ms) */

  var $ = function (id) {
    return document.getElementById(id);
  };
  var screens = { start: $('start'), host: $('host'), join: $('join'), linked: $('linked') },
    statusEl = $('status'),
    codeEl = $('code'),
    qrEl = $('qr'),
    hostWait = $('hostWait'),
    askEl = $('ask'),
    askName = $('askName'),
    codeIn = $('codeIn'),
    joinWait = $('joinWait'),
    peerNameEl = $('peerName'),
    fileIn = $('file'),
    listEl = $('list'),
    emptyEl = $('empty');

  var myName = C.deviceName(navigator.userAgent),
    peer = null,
    conn = null,
    pending = null,
    role = '',
    code = '',
    peerName = '',
    linked = false,
    timer = 0,
    retries = 0,
    seq = 0,
    items = {},
    queue = [],
    sending = null,
    receiving = null,
    wake = null,
    wakeWarned = false;

  if (!window.Peer) {
    statusEl.textContent = '接続用のライブラリを読み込めませんでした。通信状態を確認して開き直してください';
    log.error('接続用のライブラリ(PeerJS)を読み込めませんでした');
  }
  if (!window.isSecureContext) {
    statusEl.textContent = 'https で開いたページでのみ使えます';
    log.warn('https 接続でないため、ファイル転送を使えませんでした');
  }

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].hidden = k !== name;
    });
  }
  function say(text) {
    statusEl.textContent = text || '';
  }

  /* 接続 */
  function newPeer(id) {
    var p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    p.on('error', function (e) {
      onPeerError(p, e);
    });
    return p;
  }
  /* PeerJS のエラーの種類ごとに、画面の言葉を変える */
  function onPeerError(p, e) {
    if (p !== peer) return;
    var t = e && e.type;
    if (t === 'unavailable-id' && role === 'host' && retries < 3) {
      retries++;
      log.warn('番号が他の人と重なったため、別の番号にします');
      startHost();
      return;
    }
    clearTimeout(timer);
    var msg =
      t === 'peer-unavailable'
        ? 'その番号の相手が見つかりませんでした。番号と、相手の画面に番号が出ているかを確かめてください'
        : t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed'
          ? '待ち合わせ用のサーバーにつながりませんでした。通信状態を確かめて、少し待ってからやり直してください'
          : t === 'browser-incompatible' || t === 'webrtc'
            ? 'このブラウザでは直接の接続が使えません'
            : 'つながりませんでした(' + (t || '不明') + ')';
    if (t === 'peer-unavailable') log.warn('その番号の相手が見つかりませんでした');
    else log.error('接続でエラーが発生しました(' + (t || '不明') + ')', e);
    if (!linked) {
      reset();
      say(msg);
    } else say(msg);
  }
  function startHost() {
    if (peer) peer.destroy();
    role = 'host';
    code = C.makeCode();
    show('host');
    askEl.hidden = true;
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
    });
    p.on('connection', function (c) {
      if (conn || pending) {
        /* つながっている間の別の申し込みは断る */
        c.on('open', function () {
          c.send(JSON.stringify({ t: 'reject', why: 'busy' }));
          setTimeout(function () {
            c.close();
          }, 500);
        });
        log.warn('別の端末から接続の申し込みがあったため断りました');
        return;
      }
      pending = c;
      c.on('data', function (d) {
        var m = C.parseMsg(d);
        if (c !== pending || !m || m.t !== 'hello') return;
        peerName = String(m.name || '端末').slice(0, 40);
        askName.textContent = peerName;
        askEl.hidden = false;
        hostWait.textContent = '';
        ToolKit.vibrate(30);
        log('接続の申し込みがありました(' + peerName + ')');
      });
      c.on('close', function () {
        if (c === pending) {
          pending = null;
          askEl.hidden = true;
          hostWait.textContent = '相手を待っています…';
          log('申し込みが取り下げられました');
        }
      });
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
    askEl.hidden = true;
    c.send(JSON.stringify({ t: 'accept', name: myName }));
    attach(c);
    onLinked();
  };
  $('denyBtn').onclick = function () {
    var c = pending;
    if (!c) return;
    pending = null;
    askEl.hidden = true;
    hostWait.textContent = '相手を待っています…';
    c.send(JSON.stringify({ t: 'reject' }));
    setTimeout(function () {
      c.close();
    }, 500);
    log('接続を断りました(' + peerName + ')');
  };

  function startJoin(c) {
    if (peer) peer.destroy();
    role = 'join';
    code = c;
    show('join');
    codeIn.value = C.showCode(c);
    joinWait.textContent = 'つないでいます…';
    say('');
    var p = (peer = newPeer());
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (p !== peer || linked) return;
      log.warn('時間内につながりませんでした(' + CONNECT_TIMEOUT / 1000 + '秒)');
      reset();
      say(
        'つながりませんでした。2台を同じWi-Fiにつないでやり直してください(携帯回線どうしではつながらないことがあります)'
      );
    }, CONNECT_TIMEOUT);
    p.on('open', function () {
      if (p !== peer) return;
      var c2 = p.connect(C.peerId(code), { reliable: true, serialization: 'raw' });
      c2.on('open', function () {
        c2.send(JSON.stringify({ t: 'hello', name: myName }));
        joinWait.textContent = '相手の許可を待っています…';
        log('相手を見つけました(許可を待っています)');
      });
      c2.on('data', function (d) {
        if (linked) return;
        var m = C.parseMsg(d);
        if (!m) return;
        if (m.t === 'accept') {
          peerName = String(m.name || '端末').slice(0, 40);
          attach(c2);
          onLinked();
        } else if (m.t === 'reject') {
          log.warn('相手が接続を断りました' + (m.why === 'busy' ? '(ほかの端末とつながっています)' : ''));
          reset();
          say(m.why === 'busy' ? '相手はほかの端末とつながっています' : '相手が接続を断りました');
        }
      });
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
  function attach(c) {
    clearTimeout(timer);
    conn = c;
    if (c.dataChannel) {
      /* Blob で届くと順番を保ったまま扱いにくいため、ArrayBuffer で受け取る */
      c.dataChannel.binaryType = 'arraybuffer';
      c.dataChannel.bufferedAmountLowThreshold = LOW;
    }
    c.on('data', onData);
    c.on('close', function () {
      if (c === conn) lost('相手との接続が切れました');
    });
    c.on('error', function (e) {
      log.error('接続でエラーが発生しました', e);
    });
  }
  function onLinked() {
    linked = true;
    show('linked');
    peerNameEl.textContent = peerName;
    say('');
    ToolKit.vibrate(30);
    log(
      'つながりました(相手 ' +
        peerName +
        ' / ' +
        (role === 'host' ? '番号を発行した側' : '番号で参加した側') +
        ')'
    );
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  function lost(msg) {
    if (!linked) return;
    failActive('接続が切れたため中断しました');
    log.warn(msg);
    reset();
    say(msg);
  }
  /* 状態を最初に戻す。受け取ったファイルは一覧に残す */
  function reset() {
    clearTimeout(timer);
    linked = false;
    var c = conn;
    conn = null;
    pending = null;
    if (c) c.close();
    if (peer) peer.destroy();
    peer = null;
    role = '';
    show('start');
    releaseWake();
  }
  $('byeBtn').onclick = function () {
    if (conn) conn.send(JSON.stringify({ t: 'bye' }));
    failActive('切断したため中断しました');
    var c = conn;
    conn = null;
    setTimeout(function () {
      if (c) c.close();
    }, 300);
    linked = false;
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
    if (cls) it.el.classList.add(cls);
  }
  function progress(it, force) {
    var now = performance.now();
    it.speed.add(now, it.done);
    if (!force && now - it.ui < UI_INTERVAL) return;
    it.ui = now;
    var r = it.speed.rate();
    it.el.querySelector('.bar span').style.width = (it.size ? (it.done / it.size) * 100 : 100) + '%';
    setState(
      it,
      C.bytes(it.done) +
        ' / ' +
        C.bytes(it.size) +
        (r > 0 ? ' ・ ' + C.bytes(r) + '/秒 ・ 残り ' + C.seconds(C.eta(it.size - it.done, r)) : '')
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
  function summary(it) {
    var sec = (performance.now() - it.t0) / 1000;
    return C.bytes(it.size) + ' / ' + sec.toFixed(1) + '秒 / ' + C.bytes(sec > 0 ? it.size / sec : 0) + '/秒';
  }

  /* 送信 */
  $('sendBtn').onclick = function () {
    fileIn.click();
  };
  fileIn.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileIn.files || []);
    fileIn.value = '';
    if (!files.length || !conn) return;
    var total = 0;
    files.forEach(function (f) {
      total += f.size;
      var it = addItem('out', f.name, f.size);
      it.file = f;
      setState(it, '順番待ち');
      buttons(it, [{ label: '取り消し', on: cancelOut.bind(null, it) }]);
      queue.push(it);
    });
    log('送るファイルを追加しました(' + files.length + '件 / ' + C.bytes(total) + ')');
    pump();
  });
  function cancelOut(it) {
    if (it.ended) return;
    it.cancelled = true;
    var qi = queue.indexOf(it);
    if (qi >= 0) {
      queue.splice(qi, 1);
      finishOut(it, '取り消しました');
    }
    log('送信を取り消しました(' + C.bytes(it.size) + ')');
  }
  function finishOut(it, text, cls) {
    it.ended = true;
    it.file = null;
    setState(it, text, cls || 'stopped');
    buttons(it, []);
  }
  function waitDrain() {
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
        if (!conn || dc.bufferedAmount <= LOW) done();
      }, 100);
      dc.addEventListener('bufferedamountlow', done);
    });
  }
  function pump() {
    if (sending || !queue.length || !conn) {
      if (!sending && !receiving) releaseWake();
      return;
    }
    holdWake();
    var it = (sending = queue.shift()),
      c = conn,
      off = 0;
    it.t0 = performance.now();
    c.send(JSON.stringify({ t: 'file', id: it.id, name: it.name, size: it.size, type: it.file.type }));
    setState(it, '送っています');
    function next() {
      if (c !== conn) return Promise.reject(new Error('接続が切れました'));
      if (it.cancelled) return Promise.resolve(false);
      if (off >= it.size) return Promise.resolve(true);
      return it.file
        .slice(off, off + READ)
        .arrayBuffer()
        .then(function (buf) {
          var p = Promise.resolve();
          for (let i = 0; i < buf.byteLength; i += CHUNK) {
            p = p.then(waitDrain).then(function () {
              if (c !== conn || it.cancelled) return;
              c.send(buf.slice(i, i + CHUNK));
              var dc = c.dataChannel;
              it.done = Math.max(0, off + Math.min(i + CHUNK, buf.byteLength) - (dc ? dc.bufferedAmount : 0));
              progress(it);
            });
          }
          return p.then(function () {
            off += buf.byteLength;
            return next();
          });
        });
    }
    next().then(
      function (ok) {
        sending = null;
        if (!conn) return;
        conn.send(JSON.stringify({ t: 'end', id: it.id, ok: ok }));
        if (ok) {
          it.done = it.size;
          progress(it, true);
          setState(it, '相手の受け取りを待っています');
          buttons(it, []);
        } else finishOut(it, '取り消しました');
        pump();
      },
      function (e) {
        sending = null;
        if (it.ended) return;
        log.error('ファイルの送信でエラーが発生しました', e);
        finishOut(it, '送れませんでした', 'failed');
        pump();
      }
    );
  }

  /* 受信 */
  function onData(d) {
    if (d instanceof ArrayBuffer) {
      if (receiving && receiving.r.add(d)) {
        receiving.it.done = receiving.r.got;
        progress(receiving.it);
      }
      return;
    }
    var m = C.parseMsg(d);
    if (!m) {
      if (d && typeof d !== 'string') log.warn('想定していない形のデータが届きました(' + typeof d + ')');
      return;
    }
    if (m.t === 'file') {
      holdWake();
      var it = addItem('in', C.safeName(m.name), m.size);
      it.t0 = performance.now();
      it.remote = m.id;
      receiving = { r: new C.Receiving(m), it: it };
      buttons(it, [{ label: '取り消し', on: cancelIn.bind(null, it) }]);
      setState(it, '受け取っています');
      log('ファイルを受け取り始めました(' + C.bytes(m.size) + ')');
    } else if (m.t === 'end') {
      var rc = receiving;
      receiving = null;
      if (!rc || rc.r.id !== m.id) return;
      if (m.ok && rc.r.complete()) {
        var blob = new Blob(rc.r.parts, { type: rc.r.type });
        rc.r.parts = null;
        conn.send(JSON.stringify({ t: 'done', id: m.id }));
        received(rc.it, blob);
      } else {
        rc.r.parts = null;
        if (!rc.it.ended) {
          rc.it.ended = true;
          setState(rc.it, rc.r.cancelled ? '取り消しました' : '相手が取り消しました', 'stopped');
          buttons(rc.it, []);
          if (!rc.r.cancelled) log('相手が送信を取り消しました');
        }
      }
      if (!sending) releaseWake();
    } else if (m.t === 'done') {
      var o = items[m.id];
      if (o && o.dir === 'out') {
        finishOut(o, '送りました(' + summary(o) + ')', 'ok');
        log('ファイルを送りました(' + summary(o) + ')');
      }
    } else if (m.t === 'cancel') {
      var s = items[m.id];
      if (s && s.dir === 'out' && !s.ended) {
        s.cancelled = true;
        var qi = queue.indexOf(s);
        if (qi >= 0) queue.splice(qi, 1);
        finishOut(s, '相手が取り消しました');
        log('相手が受け取りを取り消しました');
      }
    } else if (m.t === 'bye') {
      lost('相手が切断しました');
    }
  }
  function cancelIn(it) {
    if (!receiving || receiving.it !== it) return;
    receiving.r.cancelled = true;
    receiving.r.parts = [];
    it.ended = true;
    setState(it, '取り消しました', 'stopped');
    buttons(it, []);
    if (conn) conn.send(JSON.stringify({ t: 'cancel', id: it.remote }));
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
            }
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
  function failActive(text) {
    queue.forEach(function (it) {
      finishOut(it, text, 'failed');
    });
    queue = [];
    if (sending) {
      sending.cancelled = true;
      finishOut(sending, text, 'failed');
      sending = null;
    }
    if (receiving) {
      receiving.r.parts = null;
      receiving.it.ended = true;
      setState(receiving.it, text, 'failed');
      buttons(receiving.it, []);
      receiving = null;
    }
    Object.keys(items).forEach(function (k) {
      var it = items[k];
      if (it.dir === 'out' && !it.ended) finishOut(it, '相手が受け取ったか確かめられませんでした', 'failed');
    });
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
      }
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
  log('起動しました(' + myName + ')');
  var fromUrl = C.parseCode(location.hash);
  if (fromUrl && window.Peer && window.isSecureContext) {
    log('QRコードのリンクから開いたため、つなぎます');
    startJoin(fromUrl);
  }
})();
