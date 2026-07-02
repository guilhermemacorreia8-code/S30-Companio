/**
 * Moon - fase lunar aproximada por data, cálculo puro (sem API).
 * Precisão de ~1 dia, suficiente pra correlacionar sessão x condição do céu.
 * Baseado no ciclo sinódico médio (29.53058867 dias) a partir de uma lua
 * nova de referência conhecida.
 */
window.Moon = (function () {
  const SYNODIC_MONTH = 29.53058867;
  const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

  function phaseForDate(date) {
    const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
    const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH; // 0..29.53
    const illumination = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH)) / 2) * 100);

    let phaseName;
    if (age < 1.84566) phaseName = 'Nova';
    else if (age < 5.53699) phaseName = 'Crescente';
    else if (age < 9.22831) phaseName = 'Quarto Crescente';
    else if (age < 12.91963) phaseName = 'Crescente Gibosa';
    else if (age < 16.61096) phaseName = 'Cheia';
    else if (age < 20.30228) phaseName = 'Minguante Gibosa';
    else if (age < 23.99361) phaseName = 'Quarto Minguante';
    else if (age < 27.68493) phaseName = 'Minguante';
    else phaseName = 'Nova';

    return { illumination, phaseName, ageDays: Math.round(age * 10) / 10 };
  }

  return { phaseForDate };
})();
