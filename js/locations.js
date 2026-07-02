/**
 * Locations - gerencia locais de observação (casa, Bocaina, etc.).
 * Dados pequenos (só texto + coords), usa localStorage diretamente.
 * O local ativo é usado pelo SkySeason e aparece na sidebar.
 */
window.Locations = (function () {
  const KEY_LIST = 's30-locations';
  const KEY_ACTIVE = 's30-location-active';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY_LIST) || '[]'); } catch { return []; }
  }

  function save(locations) {
    localStorage.setItem(KEY_LIST, JSON.stringify(locations));
  }

  function add({ name, lat, lon }) {
    const locations = getAll();
    const id = 'loc_' + Date.now();
    locations.push({ id, name: name.trim(), lat: parseFloat(lat), lon: parseFloat(lon) });
    save(locations);
    return id;
  }

  function remove(id) {
    const locations = getAll().filter((l) => l.id !== id);
    save(locations);
    if (getActiveId() === id) clearActive();
  }

  function getActiveId() {
    return localStorage.getItem(KEY_ACTIVE) || null;
  }

  function setActive(id) {
    localStorage.setItem(KEY_ACTIVE, id);
  }

  function clearActive() {
    localStorage.removeItem(KEY_ACTIVE);
  }

  function getActive() {
    const id = getActiveId();
    if (!id) return null;
    return getAll().find((l) => l.id === id) || null;
  }

  return { getAll, add, remove, getActive, setActive, clearActive };
})();
