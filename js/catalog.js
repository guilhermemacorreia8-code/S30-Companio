/**
 * Catalog - catálogo embutido de objetos celestes (subset curado, focado em
 * targets populares pro SeeStar S30) + objetos customizados criados pelo usuário.
 */
window.Catalog = (function () {
  // Catálogo semente: nome comum, catálogo, tipo, constelação, RA/Dec (J2000), magnitude
  const SEED = [
    { id: 'M42', catalog: 'M42', commonName: 'Nebulosa de Órion', type: 'nebulosa', constellation: 'Orion', ra: '05h35m17s', dec: '-05°23′28″', magnitude: 4.0, sizeArcmin: 65 },
    { id: 'M31', catalog: 'M31', commonName: 'Galáxia de Andrômeda', type: 'galaxia', constellation: 'Andromeda', ra: '00h42m44s', dec: '+41°16′09″', magnitude: 3.4, sizeArcmin: 190 },
    { id: 'M45', catalog: 'M45', commonName: 'Plêiades', type: 'aglomerado', constellation: 'Taurus', ra: '03h47m24s', dec: '+24°07′00″', magnitude: 1.6, sizeArcmin: 110 },
    { id: 'M8', catalog: 'M8', commonName: 'Nebulosa Lagoa', type: 'nebulosa', constellation: 'Sagittarius', ra: '18h03m37s', dec: '-24°23′12″', magnitude: 6.0, sizeArcmin: 90 },
    { id: 'M16', catalog: 'M16', commonName: 'Nebulosa da Águia', type: 'nebulosa', constellation: 'Serpens', ra: '18h18m48s', dec: '-13°49′00″', magnitude: 6.0, sizeArcmin: 7 },
    { id: 'M17', catalog: 'M17', commonName: 'Nebulosa Ômega', type: 'nebulosa', constellation: 'Sagittarius', ra: '18h20m47s', dec: '-16°10′18″', magnitude: 6.0, sizeArcmin: 11 },
    { id: 'M20', catalog: 'M20', commonName: 'Nebulosa Trífida', type: 'nebulosa', constellation: 'Sagittarius', ra: '18h02m23s', dec: '-23°02′00″', magnitude: 6.3, sizeArcmin: 28 },
    { id: 'M27', catalog: 'M27', commonName: 'Nebulosa Dumbbell', type: 'nebulosa', constellation: 'Vulpecula', ra: '19h59m36s', dec: '+22°43′16″', magnitude: 7.5, sizeArcmin: 8 },
    { id: 'M57', catalog: 'M57', commonName: 'Nebulosa do Anel', type: 'nebulosa', constellation: 'Lyra', ra: '18h53m35s', dec: '+33°01′45″', magnitude: 8.8, sizeArcmin: 1.4 },
    { id: 'M13', catalog: 'M13', commonName: 'Aglomerado de Hércules', type: 'aglomerado', constellation: 'Hercules', ra: '16h41m41s', dec: '+36°27′35″', magnitude: 5.8, sizeArcmin: 20 },
    { id: 'M22', catalog: 'M22', commonName: 'Aglomerado M22', type: 'aglomerado', constellation: 'Sagittarius', ra: '18h36m24s', dec: '-23°54′12″', magnitude: 5.1, sizeArcmin: 32 },
    { id: 'M104', catalog: 'M104', commonName: 'Galáxia Sombrero', type: 'galaxia', constellation: 'Virgo', ra: '12h39m59s', dec: '-11°37′23″', magnitude: 8.0, sizeArcmin: 9 },
    { id: 'M51', catalog: 'M51', commonName: 'Galáxia Redemoinho', type: 'galaxia', constellation: 'Canes Venatici', ra: '13h29m52s', dec: '+47°11′43″', magnitude: 8.4, sizeArcmin: 11 },
    { id: 'M81', catalog: 'M81', commonName: 'Galáxia de Bode', type: 'galaxia', constellation: 'Ursa Major', ra: '09h55m33s', dec: '+69°03′55″', magnitude: 6.9, sizeArcmin: 27 },
    { id: 'M101', catalog: 'M101', commonName: 'Galáxia do Cata-vento', type: 'galaxia', constellation: 'Ursa Major', ra: '14h03m12s', dec: '+54°20′57″', magnitude: 7.9, sizeArcmin: 29 },
    { id: 'NGC7000', catalog: 'NGC 7000', commonName: 'Nebulosa Pelicano', type: 'nebulosa', constellation: 'Cygnus', ra: '20h58m48s', dec: '+44°20′00″', magnitude: 4.0, sizeArcmin: 120 },
    { id: 'NGC6960', catalog: 'NGC 6960', commonName: 'Nebulosa do Véu', type: 'nebulosa', constellation: 'Cygnus', ra: '20h45m38s', dec: '+30°42′30″', magnitude: 7.0, sizeArcmin: 70 },
    { id: 'IC434', catalog: 'IC 434', commonName: 'Cabeça de Cavalo', type: 'nebulosa', constellation: 'Orion', ra: '05h40m59s', dec: '-02°27′30″', magnitude: 6.8, sizeArcmin: 30 },
    { id: 'ETACAR', catalog: 'NGC 3372', commonName: 'Nebulosa de Carina', type: 'nebulosa', constellation: 'Carina', ra: '10h45m08s', dec: '-59°52′04″', magnitude: 1.0, sizeArcmin: 120 },
    { id: 'CENTAURUSA', catalog: 'NGC 5128', commonName: 'Centaurus A', type: 'galaxia', constellation: 'Centaurus', ra: '13h25m28s', dec: '-43°01′09″', magnitude: 6.8, sizeArcmin: 26 },
    { id: 'LUA', catalog: '—', commonName: 'Lua', type: 'planeta', constellation: '—', ra: '—', dec: '—', magnitude: -12.7, sizeArcmin: null },
    { id: 'JUPITER', catalog: '—', commonName: 'Júpiter', type: 'planeta', constellation: '—', ra: '—', dec: '—', magnitude: -2.9, sizeArcmin: null },
    { id: 'SATURNO', catalog: '—', commonName: 'Saturno', type: 'planeta', constellation: '—', ra: '—', dec: '—', magnitude: 0.5, sizeArcmin: null },
  ];

  function seedIfEmpty() {
    return window.DB.getAllObjects().then((existing) => {
      if (existing.length > 0) return;
      return Promise.all(SEED.map((o) => window.DB.upsertObject(o)));
    });
  }

  /**
   * Meta de integração sugerida — HEURÍSTICA baseada em prática comum da
   * comunidade Seestar (não é um cálculo fotométrico de SNR real).
   * Referência: sob céu Bortle 6, nebulosas/aglomerados brilhantes já ficam
   * bons com 30-60min de stacking; galáxias mais fracas exigem bem mais tempo.
   */
  function getExposureTarget(obj) {
    if (obj.type === 'planeta') {
      return {
        targetMinutes: null,
        filter: 'N/A',
        note: 'Planetas usam captura de vídeo (lucky imaging), não stacking de longa exposição.',
      };
    }

    const mag = obj.magnitude;
    let baseMinutes;
    if (mag == null) baseMinutes = 60;
    else if (mag <= 5) baseMinutes = 30;
    else if (mag <= 7) baseMinutes = 60;
    else if (mag <= 8.5) baseMinutes = 90;
    else baseMinutes = 150;

    // galáxias têm brilho superficial menor que a magnitude integrada sugere
    // aglomerados (estrelas pontuais) saturam o sinal muito mais rápido
    let factor = 1;
    if (obj.type === 'galaxia') factor = 1.4;
    if (obj.type === 'aglomerado') factor = 0.4;

    const targetMinutes = Math.round(baseMinutes * factor);
    const filter = obj.type === 'nebulosa' ? 'Duo-band (Hα + OIII)' : 'Broadband (UV/IR cut)';

    return { targetMinutes, filter, note: null };
  }

  function findById(list, id) {
    return list.find((o) => o.id === id) || null;
  }

  function createCustomObject({ id, commonName, catalog, type, constellation }) {
    return window.DB.upsertObject({
      id: id || commonName.trim().toUpperCase().replace(/\s+/g, '_'),
      commonName,
      catalog: catalog || '—',
      type: type || 'outro',
      constellation: constellation || '—',
      ra: '—',
      dec: '—',
      magnitude: null,
      custom: true,
    });
  }

  // FOV real medido: 150mm, sensor IMX662 1920×1080, ~3.99"/px
  const S30_FOV_ARCMIN = { width: 127.60, height: 71.78 };

  function getFovFillPercent(sizeArcmin) {
    if (!sizeArcmin) return null;
    return Math.round((sizeArcmin / S30_FOV_ARCMIN.height) * 100);
  }

  return { SEED, seedIfEmpty, findById, createCustomObject, getExposureTarget, S30_FOV_ARCMIN, getFovFillPercent };
})();
