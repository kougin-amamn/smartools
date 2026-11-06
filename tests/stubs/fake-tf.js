(function () {
  var calls = (window.__tfCalls = { load: [], save: [], predict: 0 });
  function T(shape, d) {
    this.shape = shape;
    this.d = d;
  }
  ['toFloat', 'div', 'sub', 'expandDims'].forEach(function (k) {
    T.prototype[k] = function () {
      return this;
    };
  });
  T.prototype.slice = function () {
    return new T([1, 1000], this.d.slice(1));
  };
  T.prototype.data = function () {
    var d = this.d;
    return new Promise(function (r) {
      setTimeout(function () {
        r(Float32Array.from(d));
      }, 20);
    });
  };
  T.prototype.dispose = function () {};
  function model(n) {
    return {
      predict: function () {
        calls.predict++;
        var d = new Array(n).fill(0.0001);
        d[n - 1000 + 281] = 0.8;
        d[n - 1000 + 282] = 0.1;
        d[n - 1000 + 285] = 0.05;
        return new T([1, n], d);
      },
      save: function (k) {
        calls.save.push(k);
        return Promise.resolve();
      },
      dispose: function () {},
    };
  }
  function load(url) {
    calls.load.push(url);
    if (url.indexOf('indexeddb://') === 0) return Promise.reject(new Error('none'));
    return new Promise(function (r) {
      setTimeout(function () {
        r(model(/savedmodel/.test(url) ? 1001 : 1000));
      }, 300);
    });
  }
  window.tf = {
    ready: function () {
      return Promise.resolve();
    },
    getBackend: function () {
      return 'webgl';
    },
    loadLayersModel: load,
    loadGraphModel: load,
    tidy: function (f) {
      return f();
    },
    browser: {
      fromPixels: function () {
        return new T([224, 224, 3], []);
      },
    },
    zeros: function () {
      return new T([224, 224, 3], []);
    },
    softmax: function (t) {
      return t;
    },
  };
})();
