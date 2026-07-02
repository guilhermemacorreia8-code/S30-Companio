/**
 * Atlas - integração com o export do planejador ATLAS (atlas.m102astro.com).
 * O export é o catálogo INTEIRO pontuado pra noite (pode ter 3000+ objetos,
 * a maioria "Tough" e irrelevante pro S30) — por isso filtramos agressivamente
 * antes de sugerir qualquer coisa.
 */
window.Atlas = (function () {
  const TYPE_MAP = {
    nebula: 'nebulosa',
    planetary_nebula: 'nebulosa',
    dark_nebula: 'nebulosa',
    open_cluster: 'aglomerado',
    globular_cluster: 'aglomerado',
    galaxy: 'galaxia',
    other: 'outro',
  };

  function normalizeCatalogId(raw) {
    return String(raw || '').replace(/\s+/g, '').toUpperCase();
  }

  function decimalHoursToRA(hours) {
    if (hours == null) return '—';
    const h = Math.floor(hours);
    const remMin = (hours - h) * 60;
    const m = Math.floor(remMin);
    const s = Math.round((remMin - m) * 60);
    return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  }

  function decimalDegreesToDec(deg) {
    if (deg == null) return '—';
    const sign = deg < 0 ? '-' : '+';
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const remMin = (abs - d) * 60;
    const m = Math.floor(remMin);
    const s = Math.round((remMin - m) * 60);
    return `${sign}${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
  }

  /**
   * Faz o parse do JSON exportado do ATLAS em uma lista normalizada.
   */
  function parseExport(jsonArray) {
    return jsonArray.map((raw) => {
      const catalogId = normalizeCatalogId(raw.catalogId);
      return {
        catalogId,
        catalogIdRaw: raw.catalogId,
        displayName: raw.name || raw.catalogId,
        catalogSource: raw.catalogSource,
        type: TYPE_MAP[raw.type] || 'outro',
        raDecimal: raw.ra,
        decDecimal: raw.dec,
        ra: decimalHoursToRA(raw.ra),
        dec: decimalDegreesToDec(raw.dec),
        score: raw.score,
        label: raw.label,
        bestTime: raw.bestTime ? new Date(raw.bestTime) : null,
        durationHours: raw.durationHours,
        integrationMultiplier: raw.integrationMultiplier,
      };
    });
  }

  /**
   * Cruza os alvos do ATLAS com o catálogo já existente do usuário.
   * Match por catalogId normalizado contra `id` ou `catalog` do nosso objeto.
   */
  function matchAgainstCatalog(atlasTargets, ourObjects) {
    const byNormalizedId = new Map();
    ourObjects.forEach((obj) => {
      byNormalizedId.set(normalizeCatalogId(obj.id), obj);
      byNormalizedId.set(normalizeCatalogId(obj.catalog), obj);
    });

    return atlasTargets.map((target) => ({
      target,
      matchedObject: byNormalizedId.get(target.catalogId) || null,
    }));
  }

  return { parseExport, matchAgainstCatalog, normalizeCatalogId, decimalHoursToRA, decimalDegreesToDec };
})();
