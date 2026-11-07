/* tools/file-transfer の計算部分 */
const C = require('../../tools/file-transfer/file-transfer-core.js');
const a = require('assert');
let i = 0;
const seq = [0.05, 0.15, 0.95, 0.0, 0.5, 0.99];
a.equal(
  C.makeCode(() => seq[i++]),
  '019059',
);
a.equal(C.parseCode('１２３ ４５６'), '123456');
a.equal(C.parseCode('#123-456'), '123456');
a.equal(C.parseCode('12345'), null);
a.equal(C.showCode('012345'), '012 345');
a.equal(C.bytes(500), '500B');
a.equal(C.bytes(1536), '1.5KB');
a.equal(C.bytes(3 * 1073741824), '3.0GB');
a.equal(C.seconds(125), '2分5秒');
a.equal(C.seconds(Infinity), '-');
const s = new C.Speed(3000);
s.add(0, 0);
s.add(1000, 1e6);
s.add(2000, 3e6);
a.equal(s.rate(), 1.5e6);
a.equal(C.crc32(0, Buffer.from('123456789')), 0xcbf43926);
const big = Buffer.alloc(300000);
for (let k = 0; k < big.length; k++) big[k] = (k * 7) & 255;
a.equal(C.crc32(C.crc32(0, big.subarray(0, 1000)), big.subarray(1000)), C.crc32(0, big));
a.equal(C.fingerprint('a=fingerprint:SHA-256 ab:CD:01\r\n'), 'sha-256 AB:CD:01');
a.equal(C.sasInput('b', 'a'), C.sasInput('a', 'b'));
a.equal(C.sasDigits([0, 0, 0x04, 0xd2]), '1234');
a.ok(C.shouldCompress('a.csv', '', 5000));
a.ok(C.shouldCompress('big.csv', 'text/csv', 5e8));
a.ok(!C.shouldCompress('p.jpg', 'image/jpeg', 5e6));
a.equal(C.token([0, 15, 255]), '000fff');
const r = new C.Receiving({ key: 'k', name: 'a', size: 5 });
r.add(new Uint8Array([1, 2, 3]).buffer);
r.add(new Uint8Array([4, 5]).buffer);
a.ok(r.complete(C.crc32(0, new Uint8Array([1, 2, 3, 4, 5]))));
a.ok(!r.add(new ArrayBuffer(1)));
a.equal(C.parseMsg('{"t":"ready","id":"1","from":-1}').from, -1);
a.ok(C.parseMsg('{"t":"blk","n":1048576,"z":2000,"gz":true}'));
a.equal(C.parseMsg('{"t":"blk","n":0,"z":1}'), null);
a.equal(C.parseMsg('{"t":"evil"}'), null);
a.equal(C.safeName('../a/b:c.txt'), '.._a_b_c.txt');
