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
  async function savePhoto(file, exif, formData) {
    let objectId = formData.objectId;

    if (formData.isNewObject) {
      const created = await window.Catalog.createCustomObject({
        commonName: formData.newObjectName,
        type: formData.newObjectType,
      });
      objectId = created.id;
    }

    const photo = {
      objectId,
      blob: file || null,
      fileName: file ? file.name : null,
      captureDate: formData.captureDate
        ? new Date(formData.captureDate).toISOString()
        : (exif && exif.dateTimeOriginal) || new Date().toISOString(),
      exposureSeconds: formData.exposureSeconds ?? (exif && exif.exposureTimeSeconds) ?? null,
      frames: formData.frames || null,
      secondsPerFrame: formData.secondsPerFrame || null,
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
      const files = Array.from(e.dataTransfer.files).filter((f) => /^image\//.test(f.type));
      if (files.length) onFiles(files);
    });
  }

  return { extractExif, savePhoto, saveSession, setupDropZone };
})();
