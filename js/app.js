/**
 * App - bootstrap e roteamento (hash-based, sem framework).
 * #/            -> catálogo
 * #/object/{id} -> detalhe + comparação
 */
window.App = (function () {
  let allObjects = [];
  let photosByObject = {}; // objectId -> [photo] (com objectUrl já criado)
  let activeTypeFilter = null;
  let searchTerm = '';
  let lastAtlasRanked = null; // fica em memória até um novo import, não se perde ao fechar o painel
  let atlasTopIds = new Set();

  async function init() {
    try {
      await window.Catalog.seedIfEmpty();
      await window.DB.dedupePhotos();
      await refreshData();
      wireGlobalEvents();
      wireLocationButton();
      initAuth();
      route();
      window.addEventListener('hashchange', route);
    } catch (err) {
      console.error('[S30 Cosmic Companion] Falha na inicialização:', err);
      renderFatalError(err);
    }
  }




  function renderSidebarStats() {
    const el = document.getElementById('sidebar-stats');
    if (!el) return;

    const allPhotos = Object.values(photosByObject).flat();
    const objectsWithPhotos = Object.keys(photosByObject).filter((id) => photosByObject[id].length > 0).length;
    const totalExposureSeconds = allPhotos.reduce((acc, p) => acc + (p.exposureSeconds || 0), 0);

    el.innerHTML = `
      <div class="sidebar-stat"><span class="sidebar-stat__label">Objetos fotografados</span><span class="sidebar-stat__value">${objectsWithPhotos}</span></div>
      <div class="sidebar-stat"><span class="sidebar-stat__label">Sessões registradas</span><span class="sidebar-stat__value">${allPhotos.length}</span></div>
      <div class="sidebar-stat"><span class="sidebar-stat__label">Integração total</span><span class="sidebar-stat__value">${window.UI.formatExposure(totalExposureSeconds)}</span></div>
    `;

    const locEl = document.getElementById('sidebar-location');
    if (locEl) {
      locEl.innerHTML = window.UI.renderLocationWidget(window.Locations.getActive());
    }
  }

  function wireLocationButton() {
    document.querySelector('.sidebar').addEventListener('click', (e) => {
      if (e.target.closest('#btn-manage-locations')) openLocationManager();
    });
  }

  function initAuth() {
    renderAuthWidget();
    window.Sync.onAuthChange(async (session) => {
      renderAuthWidget();
      if (session) {
        try {
          await window.Sync.fullSync((msg) => updateSyncStatus(msg));
          await refreshData();
          route();
          updateSyncStatus('Sincronizado ✓');
        } catch (e) {
          updateSyncStatus('Erro no sync: ' + e.message);
        }
      }
    });
  }

  function renderAuthWidget() {
    const el = document.getElementById('sidebar-auth');
    if (!el) return;
    const user = window.Sync.currentUser();
    if (user) {
      el.innerHTML = `
        <div class="auth-widget auth-widget--in">
          <div class="auth-widget__info">
            <span class="auth-widget__name">${escapeHtmlApp(user.user_metadata?.full_name || user.email)}</span>
            <div id="sync-status" class="auth-widget__status">—</div>
          </div>
          <div class="auth-widget__btns">
            <button class="btn-secondary auth-btn" id="btn-sync">⬆⬇ Sync</button>
            <button class="btn-secondary auth-btn" id="btn-signout">Sair</button>
          </div>
        </div>`;
      document.getElementById('btn-signout').addEventListener('click', () => window.Sync.signOut());
      document.getElementById('btn-sync').addEventListener('click', () => triggerManualSync());
    } else {
      el.innerHTML = `
        <button class="btn-secondary auth-btn" id="btn-signin" style="width:100%;">
          <svg width="14" height="14" viewBox="0 0 48 48" style="vertical-align:middle;margin-right:6px"><path fill="#4285F4" d="M43.6 20H24v8h11.3C33.6 33 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9L37 9.7C33.4 6.5 28.9 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5c11 0 20.5-8 20.5-20.5 0-1.4-.1-2.7-.4-4z"/><path fill="#34A853" d="M6.3 15.7l6.6 4.8C14.5 17 19 14 24 14c3 0 5.7 1.1 7.8 2.9L37 9.7C33.4 6.5 28.9 4.5 24 4.5c-7.7 0-14.3 4.6-17.7 11.2z"/><path fill="#FBBC05" d="M24 45.5c4.8 0 9.2-1.6 12.6-4.3l-5.8-4.9C28.9 37.9 26.6 38.5 24 38.5c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.6 41 16.3 45.5 24 45.5z"/><path fill="#EA4335" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l5.8 4.9C40.3 35.3 44 30.7 44 25c0-1.4-.1-2.7-.4-4z"/></svg>
          Entrar com Google
        </button>`;
      document.getElementById('btn-signin').addEventListener('click', () => window.Sync.signInWithGoogle());
    }
  }

  function updateSyncStatus(msg) {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = msg;
  }

  async function triggerManualSync() {
    updateSyncStatus('Enviando...');
    try {
      await window.Sync.pushAll((msg) => updateSyncStatus(msg));
      await window.Sync.fullSync((msg) => updateSyncStatus(msg));
      await refreshData();
      route();
      updateSyncStatus('Sincronizado ✓');
    } catch (e) {
      updateSyncStatus('Erro: ' + e.message);
    }
  }

  function escapeHtmlApp(str) {
    return String(str||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function openLocationManager() {
    window.UI.openLocationManager({
      locations: window.Locations.getAll(),
      activeId: window.Locations.getActiveId(),
      onSetActive: (id) => {
        window.Locations.setActive(id);
        window.UI.closeModal();
        renderSidebarStats();
      },
      onAdd: ({ name, lat, lon }) => {
        window.Locations.add({ name, lat, lon });
        window.UI.closeModal();
        openLocationManager();
      },
      onRemove: (id) => {
        window.Locations.remove(id);
        window.UI.closeModal();
        openLocationManager();
      },
    });
  }

  function renderFatalError(err) {
    const isStorageIssue = ['INDEXEDDB_UNAVAILABLE', 'INDEXEDDB_TIMEOUT'].includes(err.message);
    const isFileProtocol = location.protocol === 'file:';

    document.getElementById('app-root').innerHTML = `
      <div class="fatal-error">
        <div class="fatal-error__title">Não consegui iniciar o armazenamento local</div>
        <p>${isStorageIssue
          ? 'O navegador bloqueou o IndexedDB' + (isFileProtocol ? ' — isso é comum ao abrir o arquivo direto (<code>file://</code>).' : '.')
          : `Erro inesperado: <code>${escapeHtmlLite(err.message)}</code>`}
        </p>
        ${isFileProtocol ? `
          <p><strong>Solução:</strong> sirva a pasta por um servidor local em vez de abrir o HTML direto:</p>
          <pre>cd pasta-do-projeto
python3 -m http.server 8000</pre>
          <p>Depois acesse <code>http://localhost:8000</code> no navegador.</p>
        ` : `
          <p>Abre o console do navegador (F12 ou Cmd+Option+J) e confere o erro completo.</p>
        `}
      </div>`;
  }

  function escapeHtmlLite(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  async function refreshData() {
    const [objects, photos] = await Promise.all([window.DB.getAllObjects(), window.DB.getAllPhotos()]);
    allObjects = objects.sort((a, b) => a.commonName.localeCompare(b.commonName));

    // revoga URLs antigas antes de recriar (evita leak de memória)
    Object.values(photosByObject).flat().forEach((p) => {
      if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
      if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
    });

    photosByObject = {};
    photos
      .sort((a, b) => new Date(a.captureDate) - new Date(b.captureDate))
      .forEach((p) => {
        // grid/timeline usa só a miniatura leve; a foto em resolução plena
        // (objectUrl) é criada sob demanda ao abrir o lightbox, não aqui —
        // evita manter na memória o blob inteiro de toda foto o tempo todo.
        p.thumbUrl = p.thumbBlob ? URL.createObjectURL(p.thumbBlob) : (p.blob ? URL.createObjectURL(p.blob) : null);
        p.objectUrl = null;
        if (!photosByObject[p.objectId]) photosByObject[p.objectId] = [];
        photosByObject[p.objectId].push(p);
      });

    renderSidebarStats();
  }

  function route() {
    const hash = location.hash || '#/';
    if (hash === '#/coverage') { renderCoverageView(); return; }
    if (hash === '#/dashboard') { renderDashboardView(); return; }
    const match = hash.match(/^#\/object\/(.+)$/);
    if (match) {
      renderObjectView(decodeURIComponent(match[1]));
    } else {
      renderCatalogView();
    }
  }

  function renderCoverageView() {
    const data = computeCoverage();
    window.UI.renderCoveragePanel(data);
    document.getElementById('btn-back').addEventListener('click', () => { location.hash = '#/'; });
    window.UI.wireCoveragePanel(data, {
      onAddTarget: async (messierId, type) => {
        await window.Catalog.createCustomObject({ id: messierId, commonName: messierId, catalog: messierId, type });
        await refreshData();
        renderCoverageView(); // re-renderiza no lugar, mantendo o "caça" fluindo
      },
      onOpenObject: (objectId) => { location.hash = `#/object/${encodeURIComponent(objectId)}`; },
    });
  }

  function renderDashboardView() {
    window.UI.renderYearlyDashboard(computeYearlyStats());
    document.getElementById('btn-back').addEventListener('click', () => { location.hash = '#/'; });
  }

  function computeCoverage() {
    const messier = window.ReferenceCatalog.MESSIER;
    const objectsByNormId = new Map();
    allObjects.forEach((o) => {
      objectsByNormId.set(window.Atlas.normalizeCatalogId(o.id), o);
      objectsByNormId.set(window.Atlas.normalizeCatalogId(o.catalog), o);
    });

    const byConstellationMap = {};
    const byTypeMap = {};
    let ownedCount = 0;

    messier.forEach((m) => {
      const norm = window.Atlas.normalizeCatalogId(m.id);
      const existing = objectsByNormId.get(norm) || null;
      const hasPhoto = !!(existing && (photosByObject[existing.id] || []).length > 0);
      if (hasPhoto) ownedCount++;

      if (!byConstellationMap[m.constellation]) byConstellationMap[m.constellation] = { constellation: m.constellation, owned: 0, total: 0, targets: [] };
      byConstellationMap[m.constellation].total++;
      if (hasPhoto) byConstellationMap[m.constellation].owned++;
      byConstellationMap[m.constellation].targets.push({
        id: m.id,
        type: m.type,
        hasPhoto,
        existingObjectId: existing ? existing.id : null,
        commonName: existing ? existing.commonName : null,
      });

      if (!byTypeMap[m.type]) byTypeMap[m.type] = { type: m.type, owned: 0, total: 0 };
      byTypeMap[m.type].total++;
      if (hasPhoto) byTypeMap[m.type].owned++;
    });

    const byConstellation = Object.values(byConstellationMap)
      .map((c) => {
        const loc = window.Locations.getActive();
        const lat = loc ? loc.lat : null;
        return {
          ...c,
          pct: Math.round((c.owned / c.total) * 100),
          season: window.SkySeason.constellationSeasonStatus(c.constellation, new Date(), lat, 20),
        };
      })
      .sort((a, b) => a.pct - b.pct);
    const byType = Object.values(byTypeMap).map((t) => ({ ...t, pct: Math.round((t.owned / t.total) * 100) }));

    return { total: messier.length, ownedCount, pct: Math.round((ownedCount / messier.length) * 100), byConstellation, byType };
  }

  function computeYearlyStats() {
    const allPhotos = Object.values(photosByObject).flat();
    const firstYearByObject = {};
    allPhotos.forEach((p) => {
      const y = new Date(p.captureDate).getFullYear();
      if (!firstYearByObject[p.objectId] || y < firstYearByObject[p.objectId]) firstYearByObject[p.objectId] = y;
    });

    const yearsMap = {};
    allPhotos.forEach((p) => {
      const y = new Date(p.captureDate).getFullYear();
      if (!yearsMap[y]) yearsMap[y] = { year: y, totalExposureSeconds: 0, sessionsCount: 0, objectIds: new Set(), newObjectsCount: 0 };
      yearsMap[y].totalExposureSeconds += p.exposureSeconds || 0;
      yearsMap[y].sessionsCount++;
      yearsMap[y].objectIds.add(p.objectId);
    });

    Object.keys(firstYearByObject).forEach((objId) => {
      const y = firstYearByObject[objId];
      if (yearsMap[y]) yearsMap[y].newObjectsCount++;
    });

    return Object.values(yearsMap)
      .map((y) => ({ ...y, distinctObjectsCount: y.objectIds.size }))
      .sort((a, b) => b.year - a.year);
  }

  function renderCatalogView() {
    let filtered = allObjects;
    if (activeTypeFilter) filtered = filtered.filter((o) => o.type === activeTypeFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (o) => o.commonName.toLowerCase().includes(term) || o.catalog.toLowerCase().includes(term)
      );
    }
    window.UI.renderCatalogGrid(filtered, photosByObject, atlasTopIds);

    document.querySelectorAll('.object-card').forEach((card) => {
      const open = () => { location.hash = `#/object/${encodeURIComponent(card.dataset.objectId)}`; };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  function renderObjectView(objectId) {
    const obj = allObjects.find((o) => o.id === objectId);
    if (!obj) { location.hash = '#/'; return; }
    const photos = photosByObject[objectId] || [];
    window.UI.renderObjectDetail(obj, photos, {
      onSetCover: async (photoId) => {
        await window.DB.setCoverPhoto(obj.id, photoId);
        await refreshData();
        route();
      },
      onEdit: (photo, closeLightbox) => {
        window.UI.openEditPhotoForm({
          photo,
          objectsList: allObjects,
          onSubmit: async (photoId, fields) => {
            await window.DB.updatePhoto(photoId, fields);
            await refreshData();
            route();
          },
        });
      },
      onDelete: async (photo, closeLightbox) => {
        await window.DB.deletePhoto(photo.id);
        if (window.Sync.isLoggedIn() && photo.remoteId) {
          window.Sync.deletePhoto(photo.remoteId).catch(() => {});
        }
        closeLightbox();
        await refreshData();
        route();
      },
      onAddDetail: (parentPhoto, closeLightbox) => {
        closeLightbox();
        triggerDetailFilePick(parentPhoto.id);
      },
      onAnalyze: async (photo, result) => {
        await window.DB.updatePhoto(photo.id, result);
        if (window.Sync.isLoggedIn() && photo.remoteId) {
          window.Sync.uploadPhoto({ ...photo, ...result }).catch(() => {});
        }
        await refreshData();
        route();
      },
    });

    document.getElementById('btn-back').addEventListener('click', () => { location.hash = '#/'; });

    const addBtn = document.getElementById('btn-add-photo-to-object');
    if (addBtn) addBtn.addEventListener('click', () => triggerFilePick(objectId));

    const logSessionBtn = document.getElementById('btn-log-session');
    if (logSessionBtn) logSessionBtn.addEventListener('click', () => openSessionFlow(objectId));

    maybeFetchWiki(obj);
  }

  async function maybeFetchWiki(obj) {
    if (obj.wikiExtract) return; // já em cache no objeto
    const candidates = [obj.catalog, obj.commonName].filter((s) => s && s !== '—');
    if (!candidates.length) return;

    const result = await window.Wiki.fetchBestSummary(candidates);
    const contentEl = document.getElementById('wiki-content');
    if (!result) {
      if (contentEl) contentEl.innerHTML = '<p class="hint">Não encontramos um resumo pra esse alvo na Wikipédia.</p>';
      return;
    }
    if (contentEl) {
      contentEl.innerHTML = `<p class="wiki-text">${escapeHtmlLite(result.extract)}</p>${result.pageUrl ? `<a href="${result.pageUrl}" target="_blank" rel="noopener" class="wiki-link">Ler mais na Wikipédia →</a>` : ''}`;
    }
    // cacheia no objeto pra não buscar de novo
    await window.DB.upsertObject({ ...obj, wikiExtract: result.extract, wikiUrl: result.pageUrl });
    const idx = allObjects.findIndex((o) => o.id === obj.id);
    if (idx >= 0) allObjects[idx] = { ...obj, wikiExtract: result.extract, wikiUrl: result.pageUrl };
  }

  function wireGlobalEvents() {
    document.getElementById('btn-new-photo').addEventListener('click', () => triggerFilePick(null));

    document.getElementById('global-search').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      if (!location.hash.startsWith('#/object')) renderCatalogView();
    });

    document.querySelectorAll('.chip[data-type]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.type;
        activeTypeFilter = activeTypeFilter === type ? null : type;
        document.querySelectorAll('.chip[data-type]').forEach((c) => c.classList.toggle('is-active', c.dataset.type === activeTypeFilter));
        renderCatalogView();
      });
    });

    const fileInput = document.getElementById('global-dropzone-input');
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleIncomingFile(e.target.files[0], fileInput.dataset.objectIdHint || null);
      e.target.value = '';
      delete fileInput.dataset.objectIdHint;
    });

    const detailInput = document.getElementById('detail-upload-input');
    detailInput.addEventListener('change', (e) => {
      const parentPhotoId = Number(detailInput.dataset.parentPhotoId);
      if (e.target.files.length) handleIncomingDetailFile(e.target.files[0], parentPhotoId);
      e.target.value = '';
      delete detailInput.dataset.parentPhotoId;
    });

    document.getElementById('btn-import-atlas').addEventListener('click', () => {
      document.getElementById('atlas-file-input').click();
    });
    document.getElementById('atlas-file-input').addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      await handleAtlasImport(e.target.files[0]);
      e.target.value = '';
    });

    document.getElementById('btn-new-object').addEventListener('click', () => openAddObjectFlow());

    document.getElementById('btn-view-atlas-suggestion').addEventListener('click', () => {
      if (lastAtlasRanked) renderAtlasPanel(lastAtlasRanked);
    });

    document.getElementById('btn-view-coverage').addEventListener('click', () => { location.hash = '#/coverage'; });
    document.getElementById('btn-view-dashboard').addEventListener('click', () => { location.hash = '#/dashboard'; });

    document.getElementById('btn-backup').addEventListener('click', handleBackup);

    document.getElementById('btn-restore').addEventListener('click', () => {
      document.getElementById('restore-file-input').click();
    });
    document.getElementById('restore-file-input').addEventListener('change', async (e) => {
      if (e.target.files.length) await handleRestore(e.target.files[0]);
      e.target.value = '';
    });
  }

  async function handleBackup() {
    const data = await window.DB.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `s30-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleRestore(file) {
    if (!confirm('Isso vai adicionar os dados do backup ao que você já tem (objetos existentes são atualizados, fotos são adicionadas — pode duplicar se já tiver restaurado esse backup antes). Continuar?')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await window.DB.importAll(data);
      await refreshData();
      route();
      alert(`Restaurado: ${result.objectsCount} objetos, ${result.photosCount} fotos.`);
    } catch (err) {
      alert('Não consegui restaurar esse backup: ' + err.message);
    }
  }

  function openAddObjectFlow() {
    window.UI.openAddObjectForm({
      onSubmit: async (formData) => {
        const created = await window.Catalog.createCustomObject(formData);
        await refreshData();
        location.hash = `#/object/${encodeURIComponent(created.id)}`;
        route();
      },
    });
  }

  function triggerFilePick(objectIdHint) {
    const fileInput = document.getElementById('global-dropzone-input');
    if (objectIdHint) fileInput.dataset.objectIdHint = objectIdHint;
    fileInput.click();
  }

  function triggerDetailFilePick(parentPhotoId) {
    const detailInput = document.getElementById('detail-upload-input');
    detailInput.dataset.parentPhotoId = parentPhotoId;
    detailInput.click();
  }

  async function handleIncomingDetailFile(file, parentPhotoId) {
    const parentPhoto = Object.values(photosByObject).flat().find((p) => p.id === parentPhotoId);
    if (!parentPhoto) return;

    window.UI.openDetailUploadForm({
      file,
      parentPhoto,
      onSubmit: async ({ notes }) => {
        const photo = {
          objectId: parentPhoto.objectId,
          blob: file,
          fileName: file.name,
          captureDate: parentPhoto.captureDate,
          isDetail: true,
          parentPhotoId: parentPhoto.id,
          notes: notes || '',
          exposureSeconds: null,
          frames: null,
          secondsPerFrame: null,
          gain: null,
          filterUsed: null,
          dither: false,
          captureSoftware: null,
          location: null,
          exifRaw: null,
          addedAt: new Date().toISOString(),
        };
        const photoId = await window.DB.addPhoto(photo);
        if (window.Sync.isLoggedIn()) {
          window.Sync.uploadPhoto({ ...photo, id: photoId }).catch(() => {});
        }
        await refreshData();
        route();
      },
      onCancel: () => {},
    });
  }

  async function handleIncomingFile(file, objectIdHint) {
    const exif = await window.Upload.extractExif(file);
    const activeLoc = window.Locations.getActive();
    window.UI.openUploadForm({
      file,
      exif,
      objectIdHint,
      objectsList: allObjects,
      defaultLocation: activeLoc ? activeLoc.name : '',
      onSubmit: async (formData) => {
        const { objectId } = await window.Upload.savePhoto(file, exif, formData);
        if (window.Sync.isLoggedIn()) {
          const photos = await window.DB.getPhotosByObject(objectId);
          const newest = photos[photos.length - 1];
          if (newest) window.Sync.uploadPhoto(newest).catch(() => {});
          const obj = allObjects.find(o => o.id === objectId);
          if (obj) window.Sync.uploadObject(obj).catch(() => {});
        }
        await refreshData();
        location.hash = `#/object/${encodeURIComponent(objectId)}`;
        route();
      },
      onCancel: () => {},
    });
  }

  function openSessionFlow(objectId) {
    const activeLoc = window.Locations.getActive();
    window.UI.openSessionForm({
      objectId,
      objectsList: allObjects,
      defaultLocation: activeLoc ? activeLoc.name : '',
      onSubmit: async (formData) => {
        const { objectId: savedObjectId } = await window.Upload.saveSession(formData);
        await refreshData();
        location.hash = `#/object/${encodeURIComponent(savedObjectId)}`;
        route();
      },
    });
  }

  // ---------- Import do ATLAS ----------

  const ATLAS_SCORE_FLOOR = 70; // ignora "Tough"/score baixo — irrelevante pro S30
  const ATLAS_MAX_SUGGESTIONS = 20;

  async function handleAtlasImport(file) {
    let raw;
    try {
      const text = await file.text();
      raw = JSON.parse(text);
    } catch (err) {
      alert('Não consegui ler esse arquivo. Confere se é o JSON exportado do ATLAS.');
      return;
    }
    if (!Array.isArray(raw)) {
      alert('Formato inesperado — esperava uma lista de alvos do ATLAS.');
      return;
    }

    const targets = window.Atlas.parseExport(raw).filter((t) => t.score >= ATLAS_SCORE_FLOOR);
    const matches = window.Atlas.matchAgainstCatalog(targets, allObjects);

    const ranked = matches
      .map(({ target, matchedObject }) => {
        let accumulatedSeconds = 0;
        let priority = target.score;
        let reason = 'Alvo novo — ainda não catalogado';

        if (matchedObject) {
          const photos = photosByObject[matchedObject.id] || [];

          if (matchedObject.type === 'planeta') {
            // lucky imaging não acumula exposureSeconds — usa nº de sessões como
            // proxy de progresso; nunca zera prioridade (sempre vale repetir Lua/Sol)
            const sessionsCount = photos.length;
            const gapFactor = sessionsCount === 0 ? 1 : Math.max(0.2, 1 - sessionsCount * 0.15);
            priority = target.score * (0.4 + 0.6 * gapFactor);
            reason = sessionsCount === 0 ? 'Alvo novo (lucky imaging)' : `Repetir — ${sessionsCount} sessão(ões) já feitas`;
          } else {
            accumulatedSeconds = photos.reduce((acc, p) => acc + (p.exposureSeconds || 0), 0);
            const exposureTarget = window.Catalog.getExposureTarget(matchedObject);
            const targetMinutes = exposureTarget.targetMinutes || 60;
            const ratio = Math.min(1, (accumulatedSeconds / 60) / targetMinutes);
            const gapFactor = 1 - ratio; // 1 = não começou, 0 = meta batida
            priority = target.score * (0.4 + 0.6 * gapFactor);
            reason = photos.length === 0 ? 'Alvo novo — ainda não catalogado' : `Completar — ${Math.round(ratio * 100)}% da meta de exposição`;

            // se já tem histórico de SNR, pesa pelo retorno marginal real de continuar
            const withSnr = photos.filter((p) => p.snrProxy != null);
            if (withSnr.length >= 2) {
              const prediction = window.Analysis.predictImprovement(
                withSnr.map((p) => ({ exposureSeconds: p.exposureSeconds, snrProxy: p.snrProxy }))
              );
              if (prediction && prediction.improvementPct != null) {
                const snrFactor = Math.min(1, Math.max(0.3, prediction.improvementPct / 30));
                priority *= snrFactor;
                reason += ` · +30min deve render ~${prediction.improvementPct}% de SNR`;
              }
            }
          }
        }

        return { target, matchedObject, accumulatedSeconds, priority, reason };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, ATLAS_MAX_SUGGESTIONS);

    lastAtlasRanked = ranked;
    atlasTopIds = new Set(
      ranked.filter((r) => r.matchedObject).slice(0, 5).map((r) => r.matchedObject.id)
    );
    document.getElementById('btn-view-atlas-suggestion').style.display = 'block';

    renderAtlasPanel(ranked);
    route(); // reaplica a view atual pra já mostrar o destaque top5 no grid
  }

  function renderAtlasPanel(ranked) {
    const container = document.getElementById('atlas-panel-container');
    container.innerHTML = window.UI.renderAtlasSuggestions(ranked);
    window.UI.wireAtlasSuggestions(ranked, {
      onClose: () => { container.innerHTML = ''; }, // só esconde — lastAtlasRanked continua guardado
      onAddNew: async (target) => {
        const created = await window.Catalog.createCustomObject({
          id: target.catalogId,
          commonName: target.displayName,
          catalog: target.catalogIdRaw,
          type: target.type,
        });
        // guarda RA/Dec/tamanho vindos do ATLAS no objeto criado
        await window.DB.upsertObject({ ...created, ra: target.ra, dec: target.dec });
        await refreshData();
        renderCatalogView();
        alert(`${target.displayName} adicionado ao catálogo.`);
      },
    });
  }

  return { init, refreshData };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
