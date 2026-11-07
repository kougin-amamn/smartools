(function () {
  function E() {
    this.h = {};
  }
  E.prototype.on = function (e, f) {
    (this.h[e] = this.h[e] || []).push(f);
    return this;
  };
  E.prototype.emit = function (e) {
    var a = [].slice.call(arguments, 1);
    (this.h[e] || []).forEach(function (f) {
      f.apply(null, a);
    });
  };
  function fp(id) {
    var h = '';
    for (var i = 0; i < id.length; i++) h += ('0' + id.charCodeAt(i).toString(16)).slice(-2);
    return 'a=fingerprint:sha-256 ' + h.slice(-24).toUpperCase() + '\r\n';
  }
  var all = (window.__conns = []);
  function Conn(peer, cid, other) {
    E.call(this);
    this.peer = peer;
    this.cid = cid;
    this.other = other;
    this.open = false;
    all.push(this);
    this.dataChannel = {
      bufferedAmount: 0,
      binaryType: 'blob',
      addEventListener: function () {},
      removeEventListener: function () {},
    };
    this.peerConnection = {
      localDescription: { sdp: fp(peer.id) },
      remoteDescription: { sdp: fp(other) },
    };
    this.q = [];
  }
  Conn.prototype = Object.create(E.prototype);
  Conn.prototype.send = function (d) {
    if (!this.open) return;
    this.peer.bc.postMessage({ type: 'data', cid: this.cid, to: this.other, data: d });
  };
  Conn.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.peer.bc.postMessage({ type: 'close', cid: this.cid, to: this.other });
    this.emit('close');
  };
  /* 届くまでの遅れ(途中で切る試験のため) */
  Conn.prototype.deliver = function (d) {
    var c = this;
    if (window.__silent) return;
    c.q.push(d);
    if (c.q.length === 1)
      (function run() {
        setTimeout(function () {
          if (!c.open) {
            c.q = [];
            return;
          }
          c.emit('data', c.q.shift());
          if (c.q.length) run();
        }, window.__delay || 0);
      })();
  };
  function Peer(id) {
    E.call(this);
    var self = this;
    this.id = typeof id === 'string' ? id : 'rand' + Math.random().toString(36).slice(2);
    this.conns = {};
    this.open = false;
    this.destroyed = false;
    this.disconnected = false;
    this.bc = new BroadcastChannel('fakepeer');
    this.bc.onmessage = function (ev) {
      var m = ev.data;
      if (m.to !== self.id || self.destroyed) return;
      var c = self.conns[m.cid];
      if (m.type === 'connect') {
        c = self.conns[m.cid] = new Conn(self, m.cid, m.from);
        self.emit('connection', c);
        self.bc.postMessage({ type: 'accepted', cid: m.cid, to: m.from });
        setTimeout(function () {
          c.open = true;
          c.emit('open');
        }, 20);
      } else if (m.type === 'accepted' && c) {
        c.ok = true;
        setTimeout(function () {
          c.open = true;
          c.emit('open');
        }, 30);
      } else if (m.type === 'data' && c) c.deliver(m.data);
      else if (m.type === 'close' && c && c.open) {
        c.open = false;
        c.emit('close');
      }
    };
    setTimeout(function () {
      self.open = true;
      self.emit('open', self.id);
    }, 50);
  }
  Peer.prototype = Object.create(E.prototype);
  Peer.prototype.connect = function (to) {
    var self = this,
      cid = 'c' + Math.random(),
      c = (this.conns[cid] = new Conn(this, cid, to));
    this.bc.postMessage({ type: 'connect', cid: cid, to: to, from: this.id });
    setTimeout(function () {
      if (!c.ok) self.emit('error', { type: 'peer-unavailable' });
    }, 400);
    return c;
  };
  Peer.prototype.destroy = function () {
    var cs = this.conns;
    Object.keys(cs).forEach(function (k) {
      cs[k].close();
    });
    this.destroyed = true;
    this.open = false;
    this.bc.close();
  };
  Peer.prototype.reconnect = function () {};
  window.__drop = function () {
    all.forEach(function (c) {
      if (c.open) c.close();
    });
  };
  window.Peer = Peer;
})();
