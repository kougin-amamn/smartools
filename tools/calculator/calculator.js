/* 電卓の画面。計算は calculator-core.js */
function onTap(c, sel, h) {
  c.addEventListener('click', function (e) {
    var el = e.target.closest(sel);
    if (el && c.contains(el)) h(el, e);
  });
}
(function () {
  'use strict';
  var exprEl = document.getElementById('expr'),
    resEl = document.getElementById('result'),
    pad = document.getElementById('pad');
  var C = window.CalculatorCore.create(),
    st = C.state;

  var G = window.CalculatorCore.group;
  /* 表示は桁区切り付き。長い時は文字を小さくして枠に収める */
  function render() {
    resEl.textContent = G(st.current);
    exprEl.textContent = G(st.justEvaluated ? st.expr : C.pending() || ' ');
    resEl.style.fontSize = '';
    var w = resEl.clientWidth;
    if (w && resEl.scrollWidth > w)
      resEl.style.fontSize = Math.max(22, Math.floor((44 * w) / resEl.scrollWidth)) + 'px';
  }
  /* 操作をひとつ実行して、結果をログに残す */
  function run(act, val) {
    if (act === 'num') C.num(val);
    else if (act === 'dot') C.dot();
    else if (act === 'op') {
      C.op(val);
      log('演算子を「' + val + '」にしました(' + C.pending() + ')');
    } else if (act === 'equals') {
      var r = C.equals();
      if (r) {
        if (r.result === 'エラー')
          log.warn('計算できませんでした(' + r.expr + ' / 0で割ることはできません)');
        else log('計算しました(' + G(r.expr) + ' ' + G(r.result) + ')');
      } else log('演算子が無いため計算しませんでした');
    } else if (act === 'clear') {
      C.clear();
      log('クリアしました');
    } else if (act === 'sign') {
      C.sign();
      log('符号を反転しました(' + st.current + ')');
    } else if (act === 'percent') {
      C.percent();
      log('パーセントにしました(' + st.current + ')');
    } else if (act === 'back') {
      C.back();
    }
    render();
  }

  onTap(pad, 'button', function (btn) {
    ToolKit.vibrate();
    run(btn.dataset.act, btn.dataset.val);
  });

  var KEYS = {
    '.': ['dot'],
    '+': ['op', '+'],
    '-': ['op', '−'],
    '*': ['op', '×'],
    '/': ['op', '÷'],
    Enter: ['equals'],
    '=': ['equals'],
    Escape: ['clear'],
    Backspace: ['back'],
  };
  window.addEventListener('keydown', function (e) {
    var k = e.key >= '0' && e.key <= '9' && e.key.length === 1 ? ['num', e.key] : KEYS[e.key];
    if (!k) return;
    if (e.key === 'Enter' || e.key === '/') e.preventDefault();
    log('キーボードの「' + e.key + '」を押下しました');
    run(k[0], k[1]);
  });

  render();
})();
