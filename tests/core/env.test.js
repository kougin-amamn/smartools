/* common/env.js の端末判定 */
const E = require('../../common/env.js');
const a = require('assert');
const U = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  desktopMode:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
const name = (ua, platform, touch) => E.deviceNameOf(E.osOf(ua, platform, touch), E.browserOf(ua));
a.equal(name(U.androidChrome, 'Android'), 'Android Chrome');
a.equal(name(U.desktopMode, 'Android'), 'Android Chrome');
a.equal(name(U.desktopMode, 'Linux'), 'Linux Chrome');
a.equal(name(U.iphoneSafari), 'iPhone Safari');
a.equal(name(U.iphoneChrome), 'iPhone Chrome');
a.equal(name(U.macSafari, undefined, 5), 'iPad Safari');
a.equal(name(U.macSafari, undefined, 0), 'macOS Safari');
a.equal(name(U.windowsEdge, 'Windows'), 'Windows Edge');
a.equal(name(U.samsung, 'Android'), 'Android Samsung Internet');
a.equal(name(U.firefox), 'Android Firefox');
a.equal(name(U.chromeOs, 'Chrome OS'), 'ChromeOS Chrome');
a.equal(name(''), '端末');
