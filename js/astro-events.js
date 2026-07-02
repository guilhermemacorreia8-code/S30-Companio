/**
 * AstroEvents - calendário curado de eventos astronômicos 2026 relevantes
 * para astrofotografia. Fontes: NASA, AMS, Planetary Society, SeaSky.
 * Hardcoded (offline-first). Atualizar anualmente.
 */
window.AstroEvents = (function () {
  // tipo: 'meteor' | 'conjunction' | 'eclipse' | 'comet' | 'planet' | 'special'
  // photogenic: true = particularmente relevante pra astrofotografia
  const EVENTS_2026 = [
    // Janeiro
    { date: '2026-01-03', type: 'meteor',      name: 'Quadrantídeos', detail: 'Pico: até 40 meteoros/h. Lua quase cheia prejudica visualização.', photogenic: false },
    { date: '2026-01-07', type: 'comet',       name: 'Cometa 24P/Schaumasse', detail: 'Periélio. Visível no céu do amanhecer com binóculo.', photogenic: true },
    { date: '2026-01-10', type: 'planet',      name: 'Júpiter em oposição', detail: 'Melhor noite do ano para fotografar Júpiter. Brilho máximo.', photogenic: true },
    // Fevereiro
    { date: '2026-02-28', type: 'conjunction', name: 'Parada planetária', detail: 'Mercúrio, Vênus, Netuno, Saturno, Urano e Júpiter visíveis juntos após o pôr do sol.', photogenic: true },
    // Março
    { date: '2026-03-02', type: 'eclipse',     name: 'Eclipse total lunar', detail: 'Visível na Oceania, Ásia Oriental e Pacífico. Melhor para o hemisfério sul ao amanhecer.', photogenic: true },
    { date: '2026-03-08', type: 'conjunction', name: 'Conjunção Vênus–Saturno', detail: 'Apenas ~1° de separação. Grande alvo de campo largo.', photogenic: true },
    { date: '2026-03-18', type: 'comet',       name: 'Cometa 88P/Howell', detail: 'Periélio. Potencial alvo para telescope.', photogenic: true },
    // Abril
    { date: '2026-04-04', type: 'planet',      name: 'Mercúrio em maior elongação', detail: 'Melhor janela do ano para fotografar Mercúrio.', photogenic: true },
    { date: '2026-04-22', type: 'meteor',      name: 'Líridas', detail: 'Pico: ~20 meteoros/h. Lua crescente não interfere muito. Boa noite!', photogenic: true },
    { date: '2026-04-22', type: 'conjunction', name: 'Lua–Júpiter (Líridas)', detail: 'Mesma noite das Líridas: Lua e Júpiter a ~3,5° em Gêmeos.', photogenic: true },
    // Maio
    { date: '2026-05-06', type: 'meteor',      name: 'Eta Aquarídeos', detail: 'Pico: até 60 meteoros/h. Detritos do Cometa Halley. Lua prejudica.', photogenic: false },
    { date: '2026-05-31', type: 'special',     name: 'Lua Azul', detail: 'Segunda lua cheia de maio. 2026 terá 13 luas cheias.', photogenic: true },
    // Junho
    { date: '2026-06-09', type: 'conjunction', name: 'Conjunção Vênus–Júpiter', detail: 'Os dois planetas mais brilhantes a ~1° de distância. Espetacular a olho nu e em campo largo.', photogenic: true },
    { date: '2026-06-21', type: 'special',     name: 'Solstício de junho', detail: 'Menor noite do ano. Boa época: Sagittarius e Via Láctea em evidência.', photogenic: false },
    // Julho
    { date: '2026-07-30', type: 'meteor',      name: 'Delta Aquarídeos Sul', detail: 'Pico: ~25 meteoros/h. Lua cheia quase cheia prejudica MUITO este ano.', photogenic: false },
    // Agosto
    { date: '2026-08-02', type: 'comet',       name: 'Cometa 10P/Tempel 2', detail: 'Periélio. Deve atingir magnitude ~8 — alvo viável para S30. Visível em ambos os hemisférios.', photogenic: true },
    { date: '2026-08-02', type: 'planet',      name: 'Mercúrio em maior elongação (2ª)', detail: 'Segunda janela do ano para Mercúrio.', photogenic: false },
    { date: '2026-08-12', type: 'eclipse',     name: 'Eclipse total solar', detail: 'Caminho de totalidade: Islândia, Groenlândia, Espanha. Parcial na Europa e norte da África.', photogenic: true },
    { date: '2026-08-12', type: 'meteor',      name: 'Perseídeos', detail: 'MELHOR NOITE DO ANO para chuva de meteoros! Lua nova = céu escuro. 60–120 meteoros/h.', photogenic: true },
    // Setembro
    { date: '2026-09-15', type: 'planet',      name: 'Saturno em oposição', detail: 'Melhor noite do ano para fotografar Saturno e seus anéis.', photogenic: true },
    // Outubro
    { date: '2026-10-08', type: 'meteor',      name: 'Dracônidas', detail: 'Pico curto mas intenso possível. Melhor no hemisfério norte.', photogenic: false },
    { date: '2026-10-15', type: 'conjunction', name: 'Conjunção Júpiter–Urano', detail: 'Rara conjunção entre os dois planetas gigantes.', photogenic: true },
    { date: '2026-10-21', type: 'meteor',      name: 'Oriônidas', detail: 'Pico: ~20 meteoros/h. Detritos do Cometa Halley.', photogenic: true },
    // Novembro
    { date: '2026-11-17', type: 'meteor',      name: 'Leônidas', detail: 'Pico: ~15 meteoros/h. Lua minguante = boa janela após meia-noite.', photogenic: true },
    // Dezembro
    { date: '2026-12-04', type: 'special',     name: 'Superlua de dezembro', detail: 'Lua cheia próxima do perigeu — aparece maior e mais brilhante.', photogenic: true },
    { date: '2026-12-07', type: 'planet',      name: 'Mercúrio em maior elongação (3ª)', detail: 'Terceira e última janela do ano para Mercúrio.', photogenic: false },
    { date: '2026-12-13', type: 'meteor',      name: 'Gemínidas', detail: 'MELHOR CHUVA DE METEOROS DO ANO! Até 120 meteoros/h brilhantes e coloridos. Lua nova.', photogenic: true },
    { date: '2026-12-21', type: 'special',     name: 'Solstício de dezembro', detail: 'Maior noite do ano. Pico da temporada de inverno para objetos de hemisfério norte.', photogenic: false },
    { date: '2026-12-22', type: 'meteor',      name: 'Ursídeos', detail: 'Pico: ~10 meteoros/h. Lua quase cheia prejudica.', photogenic: false },
    { date: '2026-12-24', type: 'special',     name: 'Superlua de Natal', detail: 'Lua cheia no perigeu na véspera de natal.', photogenic: true },
  ];

  const TYPE_ICON = {
    meteor: '☄️', conjunction: '🪐', eclipse: '🌑', comet: '🌠', planet: '🔭', special: '⭐',
  };
  const TYPE_LABEL = {
    meteor: 'Chuva de meteoros', conjunction: 'Conjunção', eclipse: 'Eclipse',
    comet: 'Cometa', planet: 'Planeta', special: 'Evento especial',
  };

  function getByMonth(month1based) {
    const prefix = `2026-${String(month1based).padStart(2, '0')}`;
    return EVENTS_2026.filter(e => e.date.startsWith(prefix));
  }

  function getUpcoming(days) {
    const now = new Date();
    const limit = new Date(now.getTime() + (days || 30) * 86400000);
    return EVENTS_2026.filter(e => {
      const d = new Date(e.date);
      return d >= now && d <= limit;
    });
  }

  return { EVENTS_2026, TYPE_ICON, TYPE_LABEL, getByMonth, getUpcoming };
})();
