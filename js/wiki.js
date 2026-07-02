/**
 * Wiki - busca resumo tipo enciclopédia pra um objeto, via API pública da
 * Wikipedia (REST summary endpoint, com CORS liberado). Tenta PT primeiro,
 * cai pra EN se não achar.
 */
window.Wiki = (function () {
  async function fetchSummary(title, lang) {
    try {
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.type === 'disambiguation' || !data.extract) return null;
      return {
        extract: data.extract,
        pageUrl: data.content_urls && data.content_urls.desktop ? data.content_urls.desktop.page : null,
        lang,
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Tenta uma lista de nomes candidatos (ex: catálogo, depois nome comum),
   * primeiro em português, depois em inglês.
   */
  async function fetchBestSummary(candidateNames) {
    const names = candidateNames.filter(Boolean);
    for (const name of names) {
      const pt = await fetchSummary(name, 'pt');
      if (pt) return pt;
    }
    for (const name of names) {
      const en = await fetchSummary(name, 'en');
      if (en) return en;
    }
    return null;
  }

  return { fetchBestSummary };
})();
