window.TiffDecode = (function () {
  function isTiff(file) {
    return /\.tiff?$/i.test((file && file.name) || '');
  }

  async function toPngBlob(file) {
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    UTIF.decodeImage(buf, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);

    const canvas = document.createElement('canvas');
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(ifds[0].width, ifds[0].height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  return { isTiff, toPngBlob };
})();
