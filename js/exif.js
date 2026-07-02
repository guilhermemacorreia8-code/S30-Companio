/**
 * ExifParser - leitor mínimo de EXIF em JPEG, sem dependências externas.
 * Extrai apenas os campos úteis pro catálogo: data de captura e tempo de exposição.
 * Retorna null nos campos que não existirem no arquivo (comum em exports do
 * Siril/PixInsight, que muitas vezes removem EXIF).
 */
window.ExifParser = (function () {
  const TAGS = {
    DateTimeOriginal: 0x9003,
    ExposureTime: 0x829a,
    FNumber: 0x829d,
    ISOSpeedRatings: 0x8827,
    Make: 0x010f,
    Model: 0x0110,
  };

  async function parse(file) {
    if (!/image\/jpe?g/.test(file.type)) {
      return emptyResult(); // PNG/TIFF geralmente não trazem EXIF acessível assim
    }

    const buffer = await file.slice(0, 128 * 1024).arrayBuffer(); // primeiros 128KB bastam
    const view = new DataView(buffer);

    if (view.getUint16(0) !== 0xffd8) return emptyResult(); // não é JPEG válido

    let offset = 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset);
      if (marker === 0xffe1) {
        return readExifSegment(view, offset + 4); // pula marker + length
      }
      if ((marker & 0xff00) !== 0xff00) break;
      const segmentLength = view.getUint16(offset + 2);
      offset += 2 + segmentLength;
    }

    return emptyResult();
  }

  function readExifSegment(view, start) {
    // "Exif\0\0" + TIFF header
    const tiffStart = start + 6;
    const littleEndian = view.getUint16(tiffStart) === 0x4949;
    const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);

    const entries = readIFD(view, tiffStart, tiffStart + ifdOffset, littleEndian);

    return {
      dateTimeOriginal: parseExifDate(entries[TAGS.DateTimeOriginal]),
      exposureTimeSeconds: parseRational(entries[TAGS.ExposureTime]),
      fNumber: parseRational(entries[TAGS.FNumber]),
      iso: entries[TAGS.ISOSpeedRatings] || null,
      cameraMake: entries[TAGS.Make] || null,
      cameraModel: entries[TAGS.Model] || null,
    };
  }

  function readIFD(view, tiffStart, ifdStart, le) {
    const result = {};
    const count = view.getUint16(ifdStart, le);

    for (let i = 0; i < count; i++) {
      const entryOffset = ifdStart + 2 + i * 12;
      const tag = view.getUint16(entryOffset, le);
      const type = view.getUint16(entryOffset + 2, le);
      const numValues = view.getUint32(entryOffset + 4, le);
      const valueOffset = entryOffset + 8;

      if (!Object.values(TAGS).includes(tag)) continue;

      result[tag] = readValue(view, tiffStart, valueOffset, type, numValues, le);
    }

    return result;
  }

  function readValue(view, tiffStart, offset, type, count, le) {
    // type 2 = ASCII, 3 = SHORT, 5 = RATIONAL
    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
    const size = (typeSizes[type] || 1) * count;
    const dataOffset = size > 4 ? tiffStart + view.getUint32(offset, le) : offset;

    if (type === 2) {
      let str = '';
      for (let i = 0; i < count - 1; i++) str += String.fromCharCode(view.getUint8(dataOffset + i));
      return str;
    }
    if (type === 3) {
      return view.getUint16(dataOffset, le);
    }
    if (type === 5) {
      const numerator = view.getUint32(dataOffset, le);
      const denominator = view.getUint32(dataOffset + 4, le);
      return { numerator, denominator };
    }
    return null;
  }

  function parseRational(val) {
    if (!val || !val.denominator) return null;
    return val.numerator / val.denominator;
  }

  function parseExifDate(str) {
    // formato EXIF: "YYYY:MM:DD HH:MM:SS"
    if (!str) return null;
    const m = str.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).toISOString();
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
