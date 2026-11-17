/* ナイト統合: モード別調整・撮影時の効果・旧URLの引き継ぎ。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (file) => fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
const elements = {};
const makeElement = () => ({
  value: '100', checked: false, style: {}, children: [], dataset: {},
  classList: { toggle() {}, remove() {}, add() {} },
  listeners: {}, attributes: {},
  addEventListener(name, fn) { this.listeners[name] = fn; },
  setAttribute(name, value) { this.attributes[name] = value; },
  appendChild(child) { this.children.push(child); },
  prepend(child) { this.children.unshift(child); },
});
const get = (id) => elements[id] || (elements[id] = makeElement());
let drawnFilter;
const ctx = { setTransform() {}, drawImage() { drawnFilter = this.filter; } };
get('previewCanvas').getContext = () => ctx;
get('previewCanvas').toDataURL = () => 'data:image/png;base64,AAAA';
get('video').videoWidth = 640;
get('video').videoHeight = 480;
get('timerSelect').value = '0';
get('modeRow').children = ['normal', 'night', 'mono', 'sepia', 'invert'].map((mode) => {
  const button = makeElement();
  button.dataset.mode = mode;
  button.textContent = mode;
  return button;
});
const log = Object.assign(() => {}, { warn() {}, error() {} });
vm.runInNewContext(read('tools/multi-camera/multi-camera.js'), {
  document: { getElementById: get, createElement: makeElement },
  window: { location: { search: '?mode=night' } }, URLSearchParams,
  ToolKit: { vibrate() {}, media: { stop() {}, open: async () => ({ message: 'unavailable' }) } },
  log, requestAnimationFrame: () => 1,
});
assert.equal(get('brightnessSlider').value, '220');
assert.equal(get('contrastSlider').value, '120');
assert.equal(get('brightnessSlider').max, '400');
assert.equal(get('nightOptions').hidden, false);
assert.equal(get('modeRow').children[1].attributes['aria-pressed'], 'true');
get('brightnessSlider').value = '400';
get('nightModeChk').checked = true;
get('captureBtn').listeners.click();
assert.ok(drawnFilter.includes('brightness(400%)'));
assert.ok(drawnFilter.includes('hue-rotate(80deg)'));
assert.equal(get('capturedList').children[0].download, 'photo-1.png');
function select(mode) {
  const button = get('modeRow').children.find((b) => b.dataset.mode === mode);
  get('modeRow').listeners.click({ target: { closest: () => button } });
}
select('normal');
assert.equal(get('brightnessSlider').value, '100');
assert.equal(get('nightOptions').hidden, true);
assert.ok(!drawnFilter.includes('hue-rotate'));
get('brightnessSlider').value = '130';
select('night');
assert.equal(get('brightnessSlider').value, '400');
select('normal');
assert.equal(get('brightnessSlider').value, '130');
for (const suffix of ['.html', '']) {
  let redirected;
  vm.runInNewContext(read('tools/night-camera/night-camera.js'), {
    URL, window: { location: {
      href: `https://example.com/tools/night-camera/night-camera${suffix}?embed=1&lang=en#camera`,
      search: '?embed=1&lang=en', hash: '#camera', replace: (url) => { redirected = new URL(url); },
    } },
  });
  assert.equal(redirected.pathname, '/tools/multi-camera/multi-camera.html');
  assert.equal(redirected.searchParams.get('mode'), 'night');
  assert.equal(redirected.searchParams.get('embed'), '1');
  assert.equal(redirected.searchParams.get('lang'), 'en');
  assert.equal(redirected.hash, '#camera');
}
assert.ok(!JSON.parse(read('index-data.json')).some((tool) => tool.slug === 'night-camera'));
