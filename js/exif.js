/**
 * ExifParser - wrapper fino sobre a lib exifr (CDN). Mesma interface pública
 * de antes (parse(file) -> {dateTimeOriginal, exposureTimeSeconds, fNumber,
 * iso, cameraMake, cameraModel}), agora com parsing muito mais robusto —
 * o parser caseiro anterior já causou bug de data por confiar demais em
 * formato exato do EXIF.
 */
window.ExifParser = (function () {
  async function parse(file) {
    if (!/^image\/(jpe?g|tiff?)$/.test(file.type) && !/\.(jpe?g|tiff?)$/i.test(file.name || '')) {
      return emptyResult(); // PNG geralmente não traz EXIF acessível assim
    }

    try {
      const tags = await exifr.parse(file, ['DateTimeOriginal', 'ExposureTime', 'FNumber', 'ISOSpeedRatings', 'ISO', 'Make', 'Model']);
      if (!tags) return emptyResult();

      const year = tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal.getFullYear() : null;
      const dateOk = year && year >= 2000 && year <= new Date().getFullYear() + 1; // descarta sentinela/corrompido

      return {
        dateTimeOriginal: dateOk ? tags.DateTimeOriginal.toISOString() : null,
        exposureTimeSeconds: typeof tags.ExposureTime === 'number' ? tags.ExposureTime : null,
        fNumber: typeof tags.FNumber === 'number' ? tags.FNumber : null,
        iso: tags.ISO ?? tags.ISOSpeedRatings ?? null,
        cameraMake: tags.Make || null,
        cameraModel: tags.Model || null,
      };
    } catch (e) {
      console.warn('[ExifParser] Falha ao ler EXIF, seguindo sem metadados:', e);
      return emptyResult();
    }
  }

  function emptyResult() {
    return {
      dateTimeOriginal: null,
      exposureTimeSeconds: null,
      fNumber: null,
      iso: null,
      cameraMake: null,
      cameraModel: null,
    };
  }

  return { parse };
})();
