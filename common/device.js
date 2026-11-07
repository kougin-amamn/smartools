/* 端末の機能(振動・コピー・カメラとマイク・ライト・センサー)を window.ToolKit に足す。tool-kit.js が読み込む(HTML には書かない)。
   ツールのページだけ。https の判定は env.js、ログは log.js を使う */
(function (root) {
  'use strict';
  var log = root.log || function () {};
  if (!log.warn) {
    log.warn = log.error = log.debug = function () {};
  }
  if (!root.ToolKit) return;

  /* 振動(対応しない端末では何もしない。iPhone は非対応) */
  function vibrate(ms) {
    if (!('vibrate' in navigator)) return;
    // 画面に一度も触れていない時の振動はブラウザに止められ、エラーが出るため鳴らさない
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      navigator.vibrate(ms || 10);
    } catch (e) {
      /* 振動できない端末(想定内) */
    }
  }

  /* コピー
     what=何をコピーしたか(ログ用、例「HEX」)、detail=ログに添える値(中身を出してよい時だけ。出さない時は文字数など)。
     クリップボードが使えない時は、選択してコピーする方法を試す。成功で true */
  function copyText(text, what, detail) {
    var tail = detail !== undefined ? '(' + detail + ')' : '';
    function fallback(err) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        err = e;
      }
      ta.remove();
      if (ok) log(what + 'をコピーしました' + tail);
      else log.warn(what + 'をコピーできませんでした(手で選んでコピーしてください)', err);
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () {
          log(what + 'をコピーしました' + tail);
          return true;
        },
        function (e) {
          log.debug('クリップボードが使えないため、別の方法でコピーします');
          return fallback(e);
        },
      );
    }
    return Promise.resolve(fallback());
  }

  /* ページを離れる時の終了処理と保存(設計: docs/design/page-exit.md)
     addCleanup(fn, name): pagehide の時に fn() を呼ぶ。true を返したら「name を停止しました(ページを離れたため)」
     addSave(fn): 画面が隠れた時と pagehide の時に fn() を呼ぶ。どちらの fn も、何度呼ばれても困らないように書く */
  var cleanups = [],
    saves = [],
    cleaned = false;
  function addCleanup(fn, name) {
    cleanups.push({ fn: fn, name: name || '処理' });
  }
  function addSave(fn) {
    saves.push(fn);
  }
  function runSaves() {
    saves.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        log.error('保存でエラーが発生しました', e);
      }
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) runSaves();
  });
  window.addEventListener('pagehide', function () {
    runSaves();
    cleanups.forEach(function (c) {
      try {
        if (c.fn() === true) log(c.name + 'を停止しました(ページを離れたため)');
      } catch (e) {
        log.error(c.name + 'の終了処理でエラーが発生しました', e);
      }
    });
    if (cleanups.length) cleaned = true;
  });
  /* 戻るボタンで復元された時、止めた物を使ったままの画面にしないため、読み込み直す */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && cleaned) location.reload();
  });

  /* カメラ・マイク
     open(constraints, label) → {stream} か {stream:null, message}。label は「カメラ」「マイク」。
     https でない・ブラウザが非対応・許可されない・使用中・見つからない、をログと画面用の文に分ける。
     開いた物は終了処理に登録し、ページを離れる時に自動で止める */
  function stopLive(stream) {
    var live = stream.getTracks().filter(function (t) {
      return t.readyState === 'live';
    });
    live.forEach(function (t) {
      t.stop();
    });
    return live.length > 0;
  }
  function open(constraints, label) {
    label = label || (constraints && constraints.video ? 'カメラ' : 'マイク');
    var needHttps = root.Env
      ? root.Env.requireSecure(label)
      : window.isSecureContext
        ? ''
        : label + 'の利用には https 接続が必要です';
    if (needHttps) return Promise.resolve({ stream: null, message: needHttps });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      log.warn('このブラウザは' + label + 'に対応していません');
      return Promise.resolve({
        stream: null,
        message: 'このブラウザは' + label + 'に対応していません。',
      });
    }
    return navigator.mediaDevices.getUserMedia(constraints).then(
      function (stream) {
        addCleanup(function () {
          return stopLive(stream);
        }, label);
        return { stream: stream };
      },
      function (e) {
        var n = e && e.name,
          msg;
        if (n === 'NotAllowedError' || n === 'SecurityError') {
          msg = label + 'へのアクセスが許可されませんでした。';
          log.warn(label + 'の利用が許可されませんでした', e);
        } else if (n === 'NotFoundError' || n === 'OverconstrainedError') {
          msg = '使える' + label + 'が見つかりませんでした。';
          log.warn('使える' + label + 'が見つかりませんでした', e);
        } else if (n === 'NotReadableError' || n === 'AbortError') {
          msg = label + 'を開けませんでした(ほかのアプリが使用中の可能性があります)。';
          log.warn(label + 'を開けませんでした(ほかのアプリが使用中の可能性があります)', e);
        } else {
          msg = label + 'を開けませんでした。';
          log.error(label + 'の起動でエラーが発生しました', e);
        }
        return { stream: null, message: msg };
      },
    );
  }
  /* 止める。止めたら true(ログは呼ぶ側の言い方に任せる) */
  function stop(stream) {
    if (!stream) return false;
    stream.getTracks().forEach(function (t) {
      t.stop();
    });
    return true;
  }
  /* 映像の大きさ(ログ用 例「1280×720」) */
  function size(track) {
    var s = track && track.getSettings ? track.getSettings() : {};
    return (s.width || '?') + '×' + (s.height || '?');
  }
  /* ライト(トーチ)。on=true/false。→ {ok:true} / {ok:false, reason:'none'|'unsupported'|'error', message} */
  function torch(track, on) {
    if (!track) {
      log.warn('カメラが開いていないため、ライトを切り替えられませんでした');
      return Promise.resolve({ ok: false, reason: 'none', message: 'カメラが開いていません。' });
    }
    var caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) {
      log.warn('このカメラはライトの制御に対応していません');
      return Promise.resolve({
        ok: false,
        reason: 'unsupported',
        message: 'この端末・カメラはライトの制御に対応していません。',
      });
    }
    return track.applyConstraints({ advanced: [{ torch: on }] }).then(
      function () {
        log('ライトを' + (on ? '点灯' : '消灯') + 'しました');
        return { ok: true };
      },
      function (e) {
        log.warn('ライトを切り替えられませんでした', e);
        return { ok: false, reason: 'error', message: 'ライトを切り替えられませんでした。' };
      },
    );
  }

  /* 傾き・方位・動きのセンサー
     permit('orientation'|'motion') → true/false。iPhone(iOS 13以降)は押した時に許可を求める必要がある */
  function permit(kind) {
    var Ev = kind === 'motion' ? window.DeviceMotionEvent : window.DeviceOrientationEvent,
      name = kind === 'motion' ? 'モーションセンサー' : '傾き・方位センサー';
    if (typeof Ev === 'undefined') {
      log.warn('この端末・ブラウザは' + name + 'に対応していません');
      return Promise.resolve(false);
    }
    if (typeof Ev.requestPermission !== 'function') return Promise.resolve(true);
    return Ev.requestPermission().then(
      function (r) {
        if (r === 'granted') {
          log(name + 'の利用が許可されました');
          return true;
        }
        log.warn(name + 'の利用が許可されませんでした');
        return false;
      },
      function (e) {
        log.warn(name + 'の許可を取得できませんでした(https で開いているか確認してください)', e);
        return false;
      },
    );
  }
  /* データ待ち: ms ミリ秒たっても got() が true にならなければ onTimeout() を呼んでログを残す */
  function watchData(ms, got, onTimeout, name) {
    return setTimeout(function () {
      if (got()) return;
      log.warn(
        ms / 1000 +
          '秒たっても' +
          (name || 'センサー') +
          'のデータが届きませんでした(センサーが無いか、ブラウザが対応していません)',
      );
      if (onTimeout) onTimeout();
    }, ms);
  }

  root.ToolKit.addCleanup = addCleanup;
  root.ToolKit.addSave = addSave;
  root.ToolKit.vibrate = vibrate;
  root.ToolKit.copyText = copyText;
  root.ToolKit.media = { open: open, stop: stop, size: size, torch: torch };
  root.ToolKit.sensor = { permit: permit, watchData: watchData };
})(this);
