/* ZXing(@zxing/library 0.21.3)の偽物。QR 読み取りの試験用。
   decodeFromStream で受け取った映像を video に映し、window.__qr('文字') で「読めた」ことにする。
   reset は本物と同じく、映像のトラックを止めて読み取りをやめる */
(function () {
  function BrowserQRCodeReader() {
    window.__zxing = this;
    this.stream = null;
    this.callback = null;
  }
  BrowserQRCodeReader.prototype.decodeFromStream = function (stream, video, callback) {
    this.reset();
    this.stream = stream;
    this.callback = callback;
    video.srcObject = stream;
    return Promise.resolve();
  };
  BrowserQRCodeReader.prototype.reset = function () {
    if (this.stream)
      this.stream.getVideoTracks().forEach(function (t) {
        t.stop();
      });
    this.stream = null;
    this.callback = null;
  };
  window.__qr = function (text) {
    var reader = window.__zxing;
    if (reader && reader.callback)
      reader.callback({
        getText: function () {
          return text;
        },
      });
  };
  window.ZXing = { BrowserQRCodeReader: BrowserQRCodeReader };
})();
