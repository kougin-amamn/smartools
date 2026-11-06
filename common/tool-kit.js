/* ツールのページ共通の部品(window.ToolKit)。振動・コピー・カメラとマイク・ライト・センサー・設定シート・ランチャーへ戻るボタン。
   ランチャーでは読まない。ログ(log / log.step / 操作の自動ログ)は log.js にある */
(function (root) {
  'use strict';
  var log = root.log || function () {};
  if (!log.warn) {
    log.warn = log.error = log.debug = function () {};
  }

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

  /* 文字を HTML に入れる時の無害化 */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
        }
      );
    }
    return Promise.resolve(fallback());
  }

  /* カメラ・マイク
     open(constraints, label) → {stream} か {stream:null, message}。label は「カメラ」「マイク」。
     https でない・ブラウザが非対応・許可されない・使用中・見つからない、をログと画面用の文に分ける */
  var opened = []; /* 開いたカメラ・マイク(ページを離れる時に自動で止める) */
  window.addEventListener('pagehide', function () {
    opened.forEach(function (o) {
      var live = o.stream.getTracks().filter(function (t) {
        return t.readyState === 'live';
      });
      if (!live.length) return;
      live.forEach(function (t) {
        t.stop();
      });
      log(o.label + 'を停止しました(ページを離れたため)');
    });
    opened = [];
  });
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
      return Promise.resolve({ stream: null, message: 'このブラウザは' + label + 'に対応していません。' });
    }
    return navigator.mediaDevices.getUserMedia(constraints).then(
      function (stream) {
        opened = opened.filter(function (o) {
          return o.stream.active;
        });
        opened.push({ stream: stream, label: label });
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
      }
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
      }
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
      }
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
          'のデータが届きませんでした(センサーが無いか、ブラウザが対応していません)'
      );
      if (onTimeout) onTimeout();
    }, ms);
  }

  /* 設定シート: ヘッダの #setBtn で #settings を開く。閉じるボタン・背景・Escape で閉じる */
  function initSettings() {
    var btn = document.getElementById('setBtn'),
      sheet = document.getElementById('settings');
    if (!btn || !sheet) return;
    var close = document.getElementById('settingsClose');
    // 埋め込み表示はヘッダが隠れるため、同じボタンを画面の右上に複製して出す
    if (document.documentElement.classList.contains('embed')) {
      var f = btn.cloneNode(true);
      f.id = 'setBtnFloat';
      f.classList.add('set-float');
      document.body.appendChild(f);
      f.addEventListener('click', toggle);
    }
    function show() {
      sheet.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (close || sheet).focus();
      log('設定を開きました');
    }
    function hide(how) {
      if (sheet.hidden) return;
      sheet.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      log('設定を閉じました' + (how ? '(' + how + ')' : ''));
    }
    function toggle() {
      if (sheet.hidden) show();
      else hide();
    }
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', toggle);
    if (close)
      close.addEventListener('click', function () {
        hide();
      });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet) hide('背景を押下');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hide('Escapeキー');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSettings);
  else initSettings();

  /* ランチャーへ戻る: ランチャーから開いた時は、ヘッダの左に戻るボタンを出す */
  function initBack() {
    var bar = document.querySelector('.site-bar');
    if (!bar || document.documentElement.classList.contains('embed')) return;
    var ret = null;
    try {
      ret = JSON.parse(localStorage.getItem('launcher-return') || 'null');
    } catch (e) {
      log.debug('戻り先のランチャーを読めませんでした');
    }
    if (!ret || !ret.href) return;
    var b = document.createElement('button');
    b.className = 'dbg-btn back-btn';
    b.id = 'backBtn';
    b.setAttribute('aria-label', (ret.title || 'ランチャー') + 'へ戻る');
    b.title = b.getAttribute('aria-label');
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    bar.insertBefore(b, bar.firstChild);
    b.addEventListener('click', function () {
      // ランチャーから来たばかりなら履歴で戻る(3Dの位置などがそのまま残る)。それ以外はランチャーを開く
      var fromIt = document.referrer && document.referrer.split('#')[0] === ret.href;
      log('ランチャーへ戻ります(' + (ret.title || ret.href) + (fromIt ? ' / 履歴で戻る' : '') + ')');
      if (fromIt && history.length > 1) history.back();
      else location.href = ret.href;
    });
  }
  initBack();

  root.ToolKit = {
    vibrate: vibrate,
    esc: esc,
    copyText: copyText,
    media: { open: open, stop: stop, size: size, torch: torch },
    sensor: { permit: permit, watchData: watchData },
  };
})(this);
