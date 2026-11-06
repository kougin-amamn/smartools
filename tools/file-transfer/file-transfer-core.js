/* ファイル転送の計算(DOM を使わない)。接続の番号、端末名、大きさ・速度・残り時間の表示、受け取りの記録 */
(function () {
  'use strict';

  var PREFIX = 'smartools-ft-'; /* 公開サーバーの ID は世界で共有されるため、他のアプリと重ならない前置き */

  /* 6桁の番号。先頭が 0 でも 6 桁で扱う */
  function makeCode(rand) {
    var r = rand || Math.random;
    var s = '';
    for (var i = 0; i < 6; i++) s += Math.floor(r() * 10);
    return s;
  }
  /* 入力や URL の # から番号を取り出す。全角数字・空白・ハイフンも受け付ける。6桁でなければ null */
  function parseCode(text) {
    var s = String(text || '')
      .replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/[\s\-‐ー#]/g, '');
    return /^\d{6}$/.test(s) ? s : null;
  }
  function peerId(code) {
    return PREFIX + code;
  }
  /* 123456 → 123 456(読み上げやすくする) */
  function showCode(code) {
    return code.slice(0, 3) + ' ' + code.slice(3);
  }

  /* 相手に見せる端末名。個人を特定しない程度の大まかな名前 */
  function deviceName(ua) {
    ua = ua || '';
    var os = /iPhone/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))
        ? 'iPad'
        : /Android/.test(ua)
          ? 'Android'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X/.test(ua)
              ? 'Mac'
              : /CrOS/.test(ua)
                ? 'ChromeOS'
                : /Linux/.test(ua)
                  ? 'Linux'
                  : '端末';
    var br = /EdgA?\//.test(ua)
      ? 'Edge'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /CriOS|Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
    return br ? os + ' ' + br : os;
  }

  function bytes(n) {
    if (!(n >= 0)) return '-';
    if (n < 1024) return Math.round(n) + 'B';
    var u = ['KB', 'MB', 'GB', 'TB'],
      i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + u[i];
  }
  function seconds(s) {
    if (!isFinite(s) || s < 0) return '-';
    s = Math.round(s);
    if (s < 60) return s + '秒';
    if (s < 3600) return Math.floor(s / 60) + '分' + (s % 60) + '秒';
    return Math.floor(s / 3600) + '時間' + Math.floor((s % 3600) / 60) + '分';
  }

  /* 直近 windowMs の進み方から速度(バイト/秒)を出す。揺れを抑えるため1点ではなく区間で見る */
  function Speed(windowMs) {
    this.win = windowMs || 3000;
    this.pts = [];
  }
  Speed.prototype.add = function (t, done) {
    this.pts.push([t, done]);
    while (this.pts.length > 2 && t - this.pts[0][0] > this.win) this.pts.shift();
  };
  Speed.prototype.rate = function () {
    var p = this.pts;
    if (p.length < 2) return 0;
    var dt = (p[p.length - 1][0] - p[0][0]) / 1000;
    return dt > 0 ? (p[p.length - 1][1] - p[0][1]) / dt : 0;
  };
  function eta(rest, rate) {
    return rate > 0 ? rest / rate : Infinity;
  }

  /* 受け取り中の1ファイル。届いた順に部品をためる(1本の順番どおりの通信路なので並べ替えは不要) */
  function Receiving(meta) {
    this.id = meta.id;
    this.name = meta.name;
    this.size = meta.size;
    this.type = meta.type || '';
    this.got = 0;
    this.parts = [];
    this.cancelled = false;
  }
  Receiving.prototype.add = function (buf) {
    if (this.cancelled) return false;
    this.parts.push(buf);
    this.got += buf.byteLength;
    return true;
  };
  Receiving.prototype.complete = function () {
    return !this.cancelled && this.got === this.size;
  };

  /* 制御のメッセージ(JSON の文字列)を確かめる。形がおかしい物は null */
  var TYPES = { hello: 1, accept: 1, reject: 1, file: 1, end: 1, done: 1, cancel: 1, bye: 1 };
  function parseMsg(s) {
    if (typeof s !== 'string') return null;
    try {
      var m = JSON.parse(s);
      if (!m || !TYPES[m.t]) return null;
      if (m.t === 'file' && !(typeof m.id === 'string' && typeof m.name === 'string' && m.size >= 0))
        return null;
      return m;
    } catch (e) {
      return null;
    }
  }
  /* 受け取った名前を保存に使える形にする(フォルダの区切りや制御文字を除く) */
  function safeName(name) {
    var s = String(name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .trim()
      .slice(0, 150);
    return s && s !== '.' && s !== '..' ? s : 'file';
  }

  var api = {
    makeCode: makeCode,
    parseCode: parseCode,
    peerId: peerId,
    showCode: showCode,
    deviceName: deviceName,
    bytes: bytes,
    seconds: seconds,
    Speed: Speed,
    eta: eta,
    Receiving: Receiving,
    parseMsg: parseMsg,
    safeName: safeName,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TransferCore = api;
})();
