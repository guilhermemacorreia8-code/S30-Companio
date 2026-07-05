/**
 * Upload - lógica de gravação de foto no DB. Sem estado interno;
 * o app.js orquestra o fluxo (abrir form, coletar dados, chamar savePhoto).
 */
window.Upload = (function () {
  async function extractExif(file) {
    return window.ExifParser.parse(file);
  }

  /**
   * Grava a foto no DB. Se formData.isNewObject, cria o objeto no catálogo primeiro.
   * @returns {Promise<{photoId: number, objectId: string}>}
   */
  function dateInputToISO(v) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toISOString();
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function makeThumbnail(blob, maxSide) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function savePhoto(file, exif, formData) {
    let objectId = formData.objectId;

    if (formData.isNewObject) {
      const created = await window.Catalog.createCustomObject({
        commonName: formData.newObjectName,
        type: formData.newObjectType,
      });
      objectId = created.id;
    }

    // TIFF não renderiza em <img>/canvas nativamente — converte pra PNG só pra exibição/análise,
    // mas guarda o arquivo original intacto pra quando o usuário for baixar de volta.
    let displayBlob = file || null;
    let originalBlob = null;
    if (file && window.TiffDecode.isTiff(file)) {
      try {
        displayBlob = await window.TiffDecode.toPngBlob(file);
        originalBlob = file;
      } catch (e) {
        console.warn('[Upload] Falha ao decodificar TIFF, mantendo arquivo original sem preview:', e);
      }
    }

    let thumbBlob = null;
    if (displayBlob) {
      try {
        thumbBlob = await makeThumbnail(displayBlob, 480);
      } catch (e) {
        console.warn('[Upload] Falha ao gerar thumbnail:', e);
      }
    }

    const photo = {
      objectId,
      blob: displayBlob,
      thumbBlob,
      originalBlob,
      fileName: file ? file.name : null,
      captureDate: formData.captureDate
        ? dateInputToISO(formData.captureDate)
        : (exif && exif.dateTimeOriginal) || new Date().toISOString(),
      exposureSeconds: formData.isLuckyImaging ? null : (formData.exposureSeconds ?? (exif && exif.exposureTimeSeconds) ?? null),
      frames: formData.frames || null,
      secondsPerFrame: formData.secondsPerFrame || null,
      isLuckyImaging: !!formData.isLuckyImaging,
      videoSeconds: formData.videoSeconds || null,
      framesKeptPercent: formData.framesKeptPercent || null,
      framesStacked: formData.framesStacked || null,
      gain: formData.gain || null,
      filterUsed: formData.filterUsed || null,
      dither: !!formData.dither,
      captureSoftware: formData.captureSoftware || null,
      location: formData.location || null,
      notes: formData.notes || '',
      exifRaw: exif || null,
      addedAt: new Date().toISOString(),
    };

    const photoId = await window.DB.addPhoto(photo);
    return { photoId, objectId };
  }

  /**
   * Registra uma sessão sem foto (só frames/segundos), pra contar na meta de integração.
   */
  async function saveSession(formData) {
    return savePhoto(null, null, formData);
  }

  function setupDropZone(el, { onFiles }) {
    ['dragenter', 'dragover'].forEach((evt) =>
      el.addEventListener(evt, (e) => {
        e.preventDefault();
        el.classList.add('is-dragover');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      el.addEventListener(evt, (e) => {
        e.preventDefault();
        el.classList.remove('is-dragover');
      })
    );
    el.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /^image\//.test(f.type) || /\.(jpe?g|png|tiff?)$/i.test(f.name)
      );
      if (files.length) onFiles(files);
    });
  }

  return { extractExif, savePhoto, saveSession, setupDropZone };
})();
