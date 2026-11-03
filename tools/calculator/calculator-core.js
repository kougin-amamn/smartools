/* 電卓の計算(画面に依存しない。Node でテストできる)。window.CalculatorCore */
(function (root) {
  'use strict';
  /* 表示用の文字列(桁あふれは10桁の精度に丸める / 計算できない時は「エラー」) */
  function formatNumber(n, maxLen) {
    maxLen = maxLen || 12;
    if (!isFinite(n)) return 'エラー';
    var s = String(n);
    if (s.length > maxLen) s = parseFloat(n.toPrecision(10)).toString();
    return s;
  }
  /* 桁区切り: 数字の整数部に3桁ごとに「,」を入れる(入力途中の「12.」や指数表記の「1.2e+21」もそのまま扱う) */
  function group(s) {
    return String(s).replace(/-?\d+(\.\d*)?(e[+-]?\d+)?/g, function (num) {
      if (/e/.test(num)) return num;
      var neg = num[0] === '-',
        body = neg ? num.slice(1) : num,
        dot = body.indexOf('.'),
        int = dot < 0 ? body : body.slice(0, dot),
        rest = dot < 0 ? '' : body.slice(dot);
      return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
    });
  }
  function calc(x, y, o) {
    switch (o) {
      case '+':
        return x + y;
      case '−':
        return x - y;
      case '×':
        return x * y;
      case '÷':
        return y === 0 ? NaN : x / y;
    }
    return NaN;
  }
  /* 電卓の状態(a=前の値 / op=演算子 / current=入力中の値 / justEvaluated=直前に=を押した) */
  function create() {
    var st = { a: null, op: null, current: '0', justEvaluated: false, expr: '' };
    function resetIfDone() {
      if (st.justEvaluated) {
        st.current = '0';
        st.a = null;
        st.op = null;
        st.justEvaluated = false;
      }
    }
    var api = {
      state: st,
      num: function (d) {
        resetIfDone();
        if (st.current === '0') st.current = d === '00' ? '0' : d;
        else if (st.current.length < 12) st.current += d;
        st.expr = api.pending();
      },
      dot: function () {
        resetIfDone();
        if (st.current.indexOf('.') < 0) st.current += '.';
      },
      op: function (o) {
        if (st.a !== null && st.op && !st.justEvaluated) {
          st.a = calc(st.a, parseFloat(st.current), st.op);
          st.current = formatNumber(st.a);
        } else st.a = parseFloat(st.current);
        st.op = o;
        st.justEvaluated = false;
        st.current = '0';
        st.expr = api.pending();
      },
      /* = の結果。演算子が無い時は null */
      equals: function () {
        if (st.op === null) return null;
        var b = parseFloat(st.current),
          r = calc(st.a, b, st.op);
        st.expr = formatNumber(st.a) + ' ' + st.op + ' ' + formatNumber(b) + ' =';
        st.current = formatNumber(r);
        st.a = null;
        st.op = null;
        st.justEvaluated = true;
        return { expr: st.expr, result: st.current };
      },
      clear: function () {
        st.a = null;
        st.op = null;
        st.current = '0';
        st.justEvaluated = false;
        st.expr = '';
      },
      sign: function () {
        st.current = formatNumber(parseFloat(st.current) * -1);
      },
      percent: function () {
        st.current = formatNumber(parseFloat(st.current) / 100);
      },
      back: function () {
        st.current = st.current.length > 1 ? st.current.slice(0, -1) : '0';
      },
      pending: function () {
        return st.a !== null && st.op ? formatNumber(st.a) + ' ' + st.op : '';
      },
    };
    return api;
  }
  var api = { formatNumber: formatNumber, group: group, calc: calc, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CalculatorCore = api;
})(this);
