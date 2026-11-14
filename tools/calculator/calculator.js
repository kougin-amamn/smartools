/* 電卓の画面。計算と履歴の足し方は calculator-core.js。履歴はこの端末に保存する(設計: docs/design/calculator.md) */
function onTap(container, selector, handler) {
  container.addEventListener('click', function (e) {
    var el = e.target.closest(selector);
    if (el && container.contains(el)) handler(el, e);
  });
}
(function () {
  'use strict';
  var exprEl = document.getElementById('expr'),
    resEl = document.getElementById('result'),
    pad = document.getElementById('pad');
  var Core = window.CalculatorCore,
    calculator = Core.create(),
    state = calculator.state,
    group = Core.group;
  var historyListEl = document.getElementById('historyList'),
    historyEmptyEl = document.getElementById('historyEmpty'),
    historyClearEl = document.getElementById('historyClear');
  var HISTORY_KEY = 'calculator-history',
    HISTORY_MAX = 20,
    history = readHistory();

  /* 履歴: 保存できない時(プライベートブラウズなど)も、このページの中では使える */
  function readHistory() {
    try {
      var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      log.warn('計算の履歴の読み込みに失敗しました', e);
      return [];
    }
  }
  function saveHistory() {
    try {
      if (history.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      else localStorage.removeItem(HISTORY_KEY);
    } catch (e) {
      log.warn('計算の履歴の保存に失敗しました(このページを閉じるまでは使えます)', e);
    }
  }
  /* 古い順に並べ、いちばん新しい物(窓に近い下)が見えるように送る */
  function renderHistory() {
    historyListEl.textContent = '';
    history.forEach(function (item) {
      var li = document.createElement('li'),
        button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      button.dataset.result = item.result;
      button.dataset.log = '履歴の行';
      button.setAttribute('aria-label', item.expr + ' = ' + item.result + '(押すと答えを使う)');
      button.textContent = group(item.expr) + ' = ' + group(item.result);
      li.appendChild(button);
      historyListEl.appendChild(li);
    });
    historyEmptyEl.hidden = history.length > 0;
    historyClearEl.hidden = history.length === 0;
    historyListEl.scrollTop = historyListEl.scrollHeight;
  }
  /* 表示は桁区切り付き。長い時は文字を小さくして枠に収める */
  function render() {
    resEl.textContent = group(state.current);
    exprEl.textContent = group(state.justEvaluated ? state.expr : calculator.pending() || ' ');
    resEl.style.fontSize = '';
    var w = resEl.clientWidth;
    if (w && resEl.scrollWidth > w)
      resEl.style.fontSize = Math.max(22, Math.floor((44 * w) / resEl.scrollWidth)) + 'px';
  }
  /* 操作をひとつ実行して、結果をログに残す */
  function run(act, val) {
    if (act === 'num') calculator.num(val);
    else if (act === 'dot') calculator.dot();
    else if (act === 'op') {
      calculator.op(val);
      log('演算子を「' + val + '」にしました(' + calculator.pending() + ')');
    } else if (act === 'equals') {
      var r = calculator.equals();
      if (r) {
        if (r.result === 'エラー')
          log.warn('計算できませんでした(' + r.expr + ' / 0で割ることはできません)');
        else {
          log('計算しました(' + group(r.expr) + ' ' + group(r.result) + ')');
          history = Core.addHistory(
            history,
            { expr: r.expr.replace(/ =$/, ''), result: r.result },
            HISTORY_MAX,
          );
          saveHistory();
          renderHistory();
        }
      } else log('演算子が無いため計算しませんでした');
    } else if (act === 'clear') {
      calculator.clear();
      log('クリアしました');
    } else if (act === 'sign') {
      calculator.sign();
      log('符号を反転しました(' + state.current + ')');
    } else if (act === 'percent') {
      calculator.percent();
      log('パーセントにしました(' + state.current + ')');
    } else if (act === 'back') {
      calculator.back();
    }
    render();
  }

  onTap(pad, 'button', function (btn) {
    ToolKit.vibrate();
    run(btn.dataset.act, btn.dataset.val);
  });

  onTap(historyListEl, '.history-item', function (button) {
    ToolKit.vibrate();
    calculator.use(button.dataset.result);
    log('履歴の答えを使いました(' + button.dataset.result + ')');
    render();
  });
  historyClearEl.addEventListener('click', function () {
    var count = history.length;
    history = [];
    saveHistory();
    renderHistory();
    log('履歴を消しました(' + count + '件)');
  });

  /* キーボード: 画面のキーと同じ働き。押したキーに対応する画面のキーも、押した見た目にする */
  var KEYS = {
    '.': ['dot'],
    ',': ['dot'],
    '+': ['op', '+'],
    '-': ['op', '−'],
    '*': ['op', '×'],
    x: ['op', '×'],
    '/': ['op', '÷'],
    '%': ['percent'],
    Enter: ['equals'],
    '=': ['equals'],
    Escape: ['clear'],
    Delete: ['clear'],
    c: ['clear'],
    Backspace: ['back'],
  };
  function buttonOf(act, val) {
    return pad.querySelector('[data-act="' + act + '"]' + (val ? '[data-val="' + val + '"]' : ''));
  }
  function flash(button) {
    if (!button) return;
    button.classList.add('pressed');
    setTimeout(function () {
      button.classList.remove('pressed');
    }, 120);
  }
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var k = key >= '0' && key <= '9' && key.length === 1 ? ['num', key] : KEYS[key];
    if (!k) return;
    e.preventDefault();
    log('キーボードの「' + e.key + '」を押下しました');
    flash(buttonOf(k[0], k[1]));
    run(k[0], k[1]);
  });

  renderHistory();
  render();
})();
