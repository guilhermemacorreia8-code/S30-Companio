window.Analysis = (function () {
  function analyzePhoto(imgEl) {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const lum = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const sorted = Float32Array.from(lum).sort();
    const clipped = sorted.filter((v) => v <= 1 || v >= 254).length / sorted.length;

    // fundo: percentil 5–15 (evita preto puro clipado)
    const bgSlice = sorted.slice(Math.floor(sorted.length * 0.05), Math.floor(sorted.length * 0.15));
    const bgMean = bgSlice.reduce((a, b) => a + b, 0) / bgSlice.length;
    const bgNoise = Math.sqrt(bgSlice.reduce((a, b) => a + (b - bgMean) ** 2, 0) / bgSlice.length);

    // sinal: percentil 90–99, recorte central 60% (evita vinheta de borda)
    const cx0 = Math.floor(width * 0.2), cx1 = Math.floor(width * 0.8);
    const cy0 = Math.floor(height * 0.2), cy1 = Math.floor(height * 0.8);
    const central = [];
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) central.push(lum[y * width + x]);
    central.sort((a, b) => a - b);
    const sigSlice = central.slice(Math.floor(central.length * 0.9), Math.floor(central.length * 0.99));
    const signalLevel = sigSlice.reduce((a, b) => a + b, 0) / sigSlice.length;

    const snrProxy = bgNoise > 0 ? (signalLevel - bgMean) / bgNoise : null;

    return {
      bgNoise: Math.round(bgNoise * 100) / 100,
      signalLevel: Math.round(signalLevel * 100) / 100,
      snrProxy: snrProxy != null ? Math.round(snrProxy * 100) / 100 : null,
      analysisConfidence: clipped > 0.15 ? 'baixa' : 'ok',
    };
  }

  // ajusta snr = k·√t nos pontos reais do usuário e projeta +30min
  function predictImprovement(sessions) {
    const valid = sessions.filter((s) => s.snrProxy && s.exposureSeconds);
    if (valid.length < 2) return null;

    let sumTY = 0, sumTT = 0;
    valid.forEach((s) => {
      const t = Math.sqrt(s.exposureSeconds);
      sumTY += t * s.snrProxy;
      sumTT += t * t;
    });
    const k = sumTY / sumTT;
    const lastExposure = Math.max(...valid.map((s) => s.exposureSeconds));
    const currentSNR = k * Math.sqrt(lastExposure);
    const projectedSNR = k * Math.sqrt(lastExposure + 1800);
    const improvementPct = currentSNR > 0 ? Math.round(((projectedSNR - currentSNR) / currentSNR) * 100) : null;

    return { improvementPct };
  }

  return { analyzePhoto, predictImprovement };
})();
