/**
 * SkySeason - indica se uma constelação está "em época" de observação
 * noturna numa data, usando só a posição aproximada do Sol (efeméride
 * simplificada, sem API). Não considera latitude do observador ainda —
 * é um indicador de estação do ano, não de visibilidade exata do seu local.
 */
window.SkySeason = (function () {
  // RA central aproximada (horas, 0-24) de cada constelação do nosso catálogo Messier.
  // Aproximação pra fins de "época do ano", não pra apontar telescópio.
  const CONSTELLATION_RA = {
    Andromeda: 1.0, Aquarius: 22.5, Auriga: 6.0, Cancer: 8.5, 'Canes Venatici': 13.0,
    'Canis Major': 6.8, Capricornus: 21.0, Cassiopeia: 1.0, Cetus: 1.5, 'Coma Berenices': 12.8,
    Cygnus: 20.5, Draco: 15.0, Gemini: 7.0, Hercules: 17.0, Hydra: 10.5, Leo: 10.5,
    Lepus: 5.5, Lyra: 18.8, Monoceros: 7.0, Ophiuchus: 17.0, Orion: 5.5, Pegasus: 22.5,
    Perseus: 3.0, Pisces: 0.5, Puppis: 7.5, Sagitta: 19.7, Sagittarius: 19.0, Scorpius: 16.5,
    Scutum: 18.7, Serpens: 16.5, Taurus: 4.5, Triangulum: 2.0, 'Ursa Major': 11.0,
    Virgo: 13.0, Vulpecula: 20.0,
  };

  /**
   * RA aproximada do Sol (em horas) pra uma data, via efeméride solar
   * simplificada (precisão de ~0.01°, mais que suficiente aqui).
   */
  function sunRAHours(date) {
    const J2000 = new Date('2000-01-01T12:00:00Z').getTime();
    const d = (date.getTime() - J2000) / 86400000;

    const g = ((357.529 + 0.98560028 * d) % 360) * (Math.PI / 180);
    const q = (280.459 + 0.98564736 * d) % 360;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180);
    const eps = (23.439 - 0.00000036 * d) * (Math.PI / 180);

    let ra = Math.atan2(Math.cos(eps) * Math.sin(L), Math.cos(L));
    if (ra < 0) ra += 2 * Math.PI;

    return (ra * 12) / Math.PI; // rad -> horas
  }

  function hourDiff(a, b) {
    let diff = Math.abs(a - b) % 24;
    if (diff > 12) diff = 24 - diff;
    return diff;
  }

  /**
   * Altitude máxima aproximada de uma constelação dado lat do observador.
   * Dec estimada a partir da RA central (aproximação pra céu eclíptico).
   */
  const CONSTELLATION_DEC = {
    Andromeda: 40, Aquarius: -10, Auriga: 42, Cancer: 20, 'Canes Venatici': 40,
    'Canis Major': -20, Capricornus: -20, Cassiopeia: 62, Cetus: -10, 'Coma Berenices': 22,
    Cygnus: 42, Draco: 67, Gemini: 22, Hercules: 30, Hydra: -10, Leo: 15,
    Lepus: -20, Lyra: 36, Monoceros: 0, Ophiuchus: -8, Orion: 5, Pegasus: 20,
    Perseus: 45, Pisces: 15, Puppis: -30, Sagitta: 20, Sagittarius: -28, Scorpius: -30,
    Scutum: -10, Serpens: 5, Taurus: 20, Triangulum: 33, 'Ursa Major': 55,
    Virgo: -5, Vulpecula: 24,
  };

  /**
   * Altitude máxima (graus) de um objeto com dada Dec, observado de dada lat.
   * alt_max = 90 - |lat - dec|, nunca acima de 90 e nunca abaixo de 0.
   */
  function maxAltitude(decDeg, latDeg) {
    return Math.max(0, Math.min(90, 90 - Math.abs(latDeg - decDeg)));
  }

  /**
   * 'prime' = culmina perto da meia-noite (visível a noite toda)
   * 'ok'    = visível em parte da noite
   * 'low'   = em época mas altitude máxima < altMin (muito perto do horizonte)
   * 'none'  = fora de época (de dia)
   */
  function constellationSeasonStatus(constellationName, date, latDeg, altMin) {
    const ra = CONSTELLATION_RA[constellationName];
    if (ra == null) return { status: 'unknown', diffHours: null, maxAlt: null };

    const sunRA = sunRAHours(date);
    const midnightMeridianRA = (sunRA + 12) % 24;
    const diff = hourDiff(ra, midnightMeridianRA);

    const dec = CONSTELLATION_DEC[constellationName];
    const maxAlt = dec != null && latDeg != null ? maxAltitude(dec, latDeg) : null;
    const tooLow = maxAlt != null && maxAlt < (altMin || 20);

    if (diff > 6) return { status: 'none', diffHours: diff, maxAlt };
    if (tooLow)  return { status: 'low',  diffHours: diff, maxAlt };
    if (diff <= 3) return { status: 'prime', diffHours: diff, maxAlt };
    return { status: 'ok', diffHours: diff, maxAlt };
  }

  return { sunRAHours, constellationSeasonStatus };
})();
