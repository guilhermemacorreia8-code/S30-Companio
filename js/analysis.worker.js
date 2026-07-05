self.onmessage = async function (e) {
  const { blob, requestId } = e.data;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const lum = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const sorted = Float32Array.from(lum).sort();
    const clipped = sorted.filter((v) => v <= 1 || v >= 254).length / sorted.length;

    const bgSlice = sorted.slice(Math.floor(sorted.length * 0.05), Math.floor(sorted.length * 0.15));
    const bgMean = bgSlice.reduce((a, b) => a + b, 0) / bgSlice.length;
    const bgNoise = Math.sqrt(bgSlice.reduce((a, b) => a + (b - bgMean) ** 2, 0) / bgSlice.length);

    const cx0 = Math.floor(width * 0.2), cx1 = Math.floor(width * 0.8);
    const cy0 = Math.floor(height * 0.2), cy1 = Math.floor(height * 0.8);
    const central = [];
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) central.push(lum[y * width + x]);
    central.sort((a, b) => a - b);
    const sigSlice = central.slice(Math.floor(central.length * 0.9), Math.floor(central.length * 0.99));
    const signalLevel = sigSlice.reduce((a, b) => a + b, 0) / sigSlice.length;

    const snrProxy = bgNoise > 0 ? (signalLevel - bgMean) / bgNoise : null;

    self.postMessage({
      requestId,
      result: {
        bgNoise: Math.round(bgNoise * 100) / 100,
        signalLevel: Math.round(signalLevel * 100) / 100,
        snrProxy: snrProxy != null ? Math.round(snrProxy * 100) / 100 : null,
        analysisConfidence: clipped > 0.15 ? 'baixa' : 'ok',
      },
    });
  } catch (err) {
    self.postMessage({ requestId, error: err.message });
  }
};
