window.Analysis = (function () {
  let worker = null;
  let nextRequestId = 0;
  const pending = {};

  function getWorker() {
    if (!worker) {
      worker = new Worker('js/analysis.worker.js');
      worker.onmessage = (e) => {
        const { requestId, result, error } = e.data;
        const entry = pending[requestId];
        if (!entry) return;
        delete pending[requestId];
        if (error) entry.reject(new Error(error));
        else entry.resolve(result);
      };
    }
    return worker;
  }

  function analyzePhoto(blob) {
    return new Promise((resolve, reject) => {
      const requestId = ++nextRequestId;
      pending[requestId] = { resolve, reject };
      getWorker().postMessage({ blob, requestId });
    });
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
