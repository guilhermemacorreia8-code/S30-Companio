/**
 * UI - funções de renderização puras + gerenciamento de modais.
 * Não guarda estado de dados (isso fica no app.js); só desenha.
 */
window.UI = (function () {
  const root = () => document.getElementById('app-root');
  const modalRoot = () => document.getElementById('modal-root');

  const TYPE_LABELS = {
    nebulosa: 'Nebulosa',
    galaxia: 'Galáxia',
    aglomerado: 'Aglomerado',
    planeta: 'Planeta',
    paisagem: 'Paisagem',
    outro: 'Outro',
  };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatExposure(totalSeconds) {
    if (!totalSeconds) return '—';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.round((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
    return `${m}m`;
  }

  function dateInputToISO(v) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toISOString();
  }

  // ---------- Barra de meta de integração (SNR heurístico) ----------

  function renderExposureBar(obj, accumulatedSeconds) {
    const target = window.Catalog.getExposureTarget(obj);

    if (target.targetMinutes == null) {
      return `<div class="exposure-bar exposure-bar--na"><span class="exposure-bar__label">${escapeHtml(target.note)}</span></div>`;
    }

    const accumulatedMinutes = Math.round(accumulatedSeconds / 60);
    const ratio = Math.min(1.2, accumulatedMinutes / target.targetMinutes);
    const pct = Math.min(100, ratio * 100);

    let state = 'low';
    let statusText = 'SNR baixo esperado — mais sessões vão ajudar bastante';
    if (ratio >= 1) { state = 'good'; statusText = 'Meta de integração atingida'; }
    else if (ratio >= 0.5) { state = 'mid'; statusText = 'Dentro da faixa útil — ainda dá pra ganhar SNR'; }

    return `
      <div class="exposure-bar exposure-bar--${state}">
        <div class="exposure-bar__track">
          <div class="exposure-bar__fill" style="width:${pct}%"></div>
        </div>
        <div class="exposure-bar__meta">
          <span>${accumulatedMinutes}min / ${target.targetMinutes}min sugeridos</span>
          <span>${Math.round(ratio * 100)}%</span>
        </div>
        <div class="exposure-bar__status">${statusText}</div>
      </div>`;
  }

  function renderSessionChart(photos) {
    if (!photos.length) return '';
    const withExposure = photos.filter((p) => p.exposureSeconds);
    if (!withExposure.length) return '<p style="color:var(--ink-faint); font-size:12px;">Nenhuma foto com exposição registrada ainda.</p>';

    const max = Math.max(...withExposure.map((p) => p.exposureSeconds));
    const bars = withExposure
      .map((p) => {
        const h = Math.max(6, Math.round((p.exposureSeconds / max) * 48));
        return `<div class="session-chart__bar" style="height:${h}px" title="${formatDate(p.captureDate)} · ${formatExposure(p.exposureSeconds)}"></div>`;
      })
      .join('');
    return `<div class="session-chart">${bars}</div>`;
  }

  // ---------- Painel de sugestão da sessão (import do ATLAS) ----------

  const LABEL_COLOR = {
    Outstanding: 'good',
    Great: 'mid',
    Challenging: 'low',
    Tough: 'low',
  };

  function renderAtlasSuggestions(rankedItems) {
    if (!rankedItems.length) {
      return `<div class="atlas-panel"><p style="color:var(--ink-dim); font-size:13px;">Nenhum alvo com score relevante encontrado pro céu de hoje.</p></div>`;
    }

    return `
      <div class="atlas-panel">
        <div class="atlas-panel__header">
          <div class="panel__title" style="margin:0;">Sugestão da sessão de hoje <span class="panel__title-hint">via ATLAS</span></div>
          <button class="btn-secondary" id="btn-close-atlas-panel">Fechar</button>
        </div>
        <div class="atlas-list">
          ${rankedItems.map((item, i) => renderAtlasRow(item, i)).join('')}
        </div>
      </div>`;
  }

  function renderAtlasRow(item, index) {
    const { target, matchedObject, accumulatedSeconds, reason } = item;
    const colorState = LABEL_COLOR[target.label] || 'mid';
    const bestTimeLocal = target.bestTime
      ? target.bestTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '—';

    const progressHtml = matchedObject
      ? renderExposureBar(matchedObject, accumulatedSeconds || 0)
      : `<div class="atlas-row__new">Novo — ainda não catalogado</div>`;

    return `
      <div class="atlas-row" data-atlas-index="${index}">
        <div class="atlas-row__score atlas-row__score--${colorState}">${target.score}</div>
        <div class="atlas-row__main">
          <div class="atlas-row__name">${escapeHtml(target.displayName)} <span class="atlas-row__catalog">${escapeHtml(target.catalogIdRaw)}</span></div>
          <div class="atlas-row__meta">melhor às ${bestTimeLocal} · visível ${target.durationHours ? target.durationHours.toFixed(1) : '—'}h · ${escapeHtml(target.label)}</div>
          ${reason ? `<div class="atlas-row__reason">${escapeHtml(reason)}</div>` : ''}
          ${progressHtml}
        </div>
        ${!matchedObject ? `<button class="btn-secondary atlas-row__add" data-add-index="${index}">+ Adicionar</button>` : ''}
      </div>`;
  }

  function wireAtlasSuggestions(rankedItems, { onClose, onAddNew }) {
    const closeBtn = document.getElementById('btn-close-atlas-panel');
    if (closeBtn) closeBtn.addEventListener('click', onClose);

    document.querySelectorAll('.atlas-row__add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.addIndex);
        onAddNew(rankedItems[idx].target);
      });
    });
  }

  function renderConstellationSvg(name) {
    const data = window.ConstellationData ? window.ConstellationData.get(name) : null;
    if (!data) return '<text x="50" y="55" fill="#5a6178" font-size="9" text-anchor="middle" font-family="monospace">—</text>';

    const { lines, hip } = data;
    const toRad = d => d * Math.PI / 180;

    // Coleta todas as estrelas únicas
    const ids = [...new Set(lines.flat())].filter(id => hip[id]);
    if (!ids.length) return '';

    const ras  = ids.map(id => hip[id][0]);
    const decs = ids.map(id => hip[id][1]);

    // Centróide — com wraparound de RA
    const ra0  = ras.reduce((a,b) => a+b, 0) / ras.length;
    const dec0 = decs.reduce((a,b) => a+b, 0) / decs.length;

    // Projeção gnômica
    function project(ra, dec) {
      const dra  = toRad(ra - ra0);
      const d    = toRad(dec);
      const d0   = toRad(dec0);
      const cosC = Math.sin(d0)*Math.sin(d) + Math.cos(d0)*Math.cos(d)*Math.cos(dra);
      if (cosC <= 0) return null;
      return [
        -(Math.cos(d)*Math.sin(dra)) / cosC,   // x: RA cresce pra esquerda no céu
        -(Math.cos(d0)*Math.sin(d) - Math.sin(d0)*Math.cos(d)*Math.cos(dra)) / cosC, // y: Dec+ pra cima, depois invertemos
      ];
    }

    const proj = {};
    ids.forEach(id => { const p = project(hip[id][0], hip[id][1]); if (p) proj[id] = p; });

    const xs = Object.values(proj).map(p => p[0]);
    const ys = Object.values(proj).map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 0.001;
    const rangeY = maxY - minY || 0.001;
    const scale  = 78 / Math.max(rangeX, rangeY); // escala UNIFORME
    const padX   = (78 - rangeX * scale) / 2;
    const padY   = (78 - rangeY * scale) / 2;

    function toSVG(id) {
      const [px, py] = proj[id];
      return [11 + padX + (px - minX) * scale, 11 + padY + (py - minY) * scale];
    }

    const svgLines = lines
      .filter(([a,b]) => proj[a] && proj[b])
      .map(([a,b]) => {
        const [x1,y1] = toSVG(a);
        const [x2,y2] = toSVG(b);
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(94,200,216,0.4)" stroke-width="1.2"/>`;
      }).join('');

    const svgDots = ids
      .filter(id => proj[id])
      .map(id => {
        const [x,y] = toSVG(id);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="#e8eaed" opacity="0.8"/>`;
      }).join('');

    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${svgLines}${svgDots}</svg>`;
  }

  // ---------- Cobertura do catálogo (gap analysis) ----------

  function renderCoveragePanel(data) {
    root().innerHTML = `
      <div class="detail-view">
        <button class="detail-back" id="btn-back">← Voltar ao catálogo</button>
        <h1 class="detail-title__name" style="margin-bottom:20px;">Cobertura do catálogo Messier</h1>

        <div class="panel">
          <div class="panel__title">Geral</div>
          <div class="exposure-bar exposure-bar--mid">
            <div class="exposure-bar__track"><div class="exposure-bar__fill" style="width:${data.pct}%"></div></div>
            <div class="exposure-bar__meta"><span>${data.ownedCount}/${data.total} Messier fotografados</span><span>${data.pct}%</span></div>
          </div>
        </div>

        <div class="panel">
          <div class="panel__title">Por constelação <span class="panel__title-hint">clique pra ver os alvos · ★ = boa época pra observar agora</span></div>
          <p class="panel__note">Baseado na posição do Sol pra hoje (estação do ano) — ainda não considera sua latitude, então pode marcar constelação que na prática fica baixa demais no seu horizonte.</p>
          <div class="coverage-list">
            ${data.byConstellation.map((c, i) => `
              <div class="coverage-group">
                <button class="coverage-row coverage-row--clickable" data-constellation-index="${i}">
                  <div class="coverage-row__left">
                    <span class="coverage-row__label">
                      ${escapeHtml(c.constellation)}
                      ${c.season && c.season.status === 'prime' ? '<span class="season-badge season-badge--prime" title="Boa época — visível a noite toda agora">★</span>' : ''}
                      ${c.season && c.season.status === 'ok' ? '<span class="season-badge season-badge--ok" title="Visível em parte da noite agora">·</span>' : ''}
                    </span>
                    <div class="coverage-row__bar">
                      <div class="coverage-row__bar-fill ${c.pct === 100 ? 'is-complete' : ''}" style="width:${c.pct}%"></div>
                    </div>
                  </div>
                  <span class="coverage-row__value">${c.owned}/${c.total}</span>
                </button>
                <div class="coverage-targets" id="coverage-targets-${i}" style="display:none;">
                  <div class="constellation-card">
                    <div class="constellation-card__svg">
                      ${renderConstellationSvg(c.constellation)}
                    </div>
                    <div class="constellation-card__info">
                      <div class="constellation-card__name">${escapeHtml(c.constellation)}</div>
                      <div class="constellation-card__meaning">${escapeHtml(window.ConstellationData.get(c.constellation)?.meaning || '')}</div>
                    </div>
                  </div>
                  ${c.targets.map((t) => `
                    <div class="coverage-target ${t.hasPhoto ? 'is-done' : ''}">
                      <span class="coverage-target__id">${escapeHtml(t.id)}</span>
                      <span class="coverage-target__name">${escapeHtml(t.commonName || '')}</span>
                      <span class="coverage-target__status">${t.hasPhoto ? '✓ Fotografado' : t.existingObjectId ? 'No catálogo, sem foto' : 'Não catalogado'}</span>
                      <a class="btn-secondary coverage-target__action coverage-target__wiki"
                         href="https://www.google.com/search?q=Messier+${encodeURIComponent(t.id.replace(/^M/,''))}+${encodeURIComponent(t.commonName || '')}+nebula+galaxy+astronomy"
                         target="_blank" rel="noopener" title="Saiba mais">🔎</a>
                      ${!t.existingObjectId
                        ? `<button class="btn-secondary coverage-target__action" data-add-messier="${escapeHtml(t.id)}" data-add-type="${escapeHtml(t.type)}">+ Adicionar</button>`
                        : !t.hasPhoto
                          ? `<button class="btn-secondary coverage-target__action" data-open-object="${escapeHtml(t.existingObjectId)}">Abrir →</button>`
                          : ''}
                    </div>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="panel">
          <div class="panel__title">Por tipo</div>
          <div class="coverage-list">
            ${data.byType.map((t) => `
              <div class="coverage-row">
                <span class="coverage-row__label">${escapeHtml(TYPE_LABELS[t.type] || t.type)}</span>
                <div class="exposure-bar__track" style="flex:1;"><div class="exposure-bar__fill" style="width:${t.pct}%"></div></div>
                <span class="coverage-row__value">${t.owned}/${t.total}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function wireCoveragePanel(data, { onAddTarget, onOpenObject }) {
    document.querySelectorAll('.coverage-row--clickable').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.constellationIndex;
        const targetsEl = document.getElementById(`coverage-targets-${idx}`);
        const isOpen = targetsEl.style.display !== 'none';
        targetsEl.style.display = isOpen ? 'none' : 'block';
        btn.classList.toggle('is-expanded', !isOpen);
      });
    });

    document.querySelectorAll('[data-add-messier]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onAddTarget(btn.dataset.addMessier, btn.dataset.addType);
      });
    });

    document.querySelectorAll('[data-open-object]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onOpenObject(btn.dataset.openObject);
      });
    });
  }

  // ---------- Dashboard anual ----------

  function renderLandscapeGallery(objects, photosByObject) {
    root().innerHTML = `
      <div class="detail-view">
        <button class="detail-back" id="btn-back">← Voltar ao catálogo</button>
        <h1 class="detail-title__name" style="margin-bottom:20px;">🌌 Via Láctea</h1>

        ${objects.length === 0 ? '<p style="color:var(--ink-dim);">Nenhuma paisagem cadastrada ainda — cria um objeto tipo "Paisagem" no + Novo alvo.</p>' : ''}

        <div class="landscape-grid">
          ${objects.map((obj) => {
            const photos = (photosByObject[obj.id] || []).filter((p) => !p.isDetail);
            const withThumb = photos.filter((p) => p.thumbUrl);
            const cover = withThumb[withThumb.length - 1];
            const last = photos[photos.length - 1];
            const compBits = last
              ? [
                  last.compositionType === 'panoramica' ? 'Panorâmica' : (last.compositionType === 'composicao' ? 'Composição' : (last.compositionType === 'ceu' ? 'Só céu' : null)),
                  last.panelCount ? `${last.panelCount} painéis` : null,
                  last.location || null,
                ].filter(Boolean).join(' · ')
              : '';
            return `
              <article class="landscape-card" tabindex="0" role="button" data-object-id="${escapeHtml(obj.id)}">
                <div class="landscape-card__frame">
                  ${cover ? `<img src="${cover.thumbUrl}" alt="${escapeHtml(obj.commonName)}" loading="lazy" />` : '<div class="landscape-card__empty">SEM FOTO AINDA</div>'}
                </div>
                <div class="landscape-card__info">
                  <div class="landscape-card__name">${escapeHtml(obj.commonName)}</div>
                  <div class="landscape-card__meta">${photos.length} sessão(ões)${compBits ? ' · ' + escapeHtml(compBits) : ''}</div>
                </div>
              </article>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderYearlyDashboard(yearStats) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const events = window.AstroEvents.getByMonth(currentMonth);
    const upcoming = window.AstroEvents.getUpcoming(14); // próximos 14 dias

    root().innerHTML = `
      <div class="detail-view">
        <button class="detail-back" id="btn-back">← Voltar ao catálogo</button>
        <h1 class="detail-title__name" style="margin-bottom:20px;">Dashboard anual</h1>

        ${yearStats.length === 0 ? '<p style="color:var(--ink-dim);">Nenhuma sessão registrada ainda.</p>' : ''}

        ${yearStats.map((y) => `
          <div class="panel year-panel">
            <div class="year-panel__year">${y.year}</div>
            <div class="data-grid">
              <div class="data-row"><span class="data-row__label">Integração total</span><span class="data-row__leader"></span><span class="data-row__value">${formatExposure(y.totalExposureSeconds)}</span></div>
              <div class="data-row"><span class="data-row__label">Sessões</span><span class="data-row__leader"></span><span class="data-row__value">${y.sessionsCount}</span></div>
              <div class="data-row"><span class="data-row__label">Objetos distintos</span><span class="data-row__leader"></span><span class="data-row__value">${y.distinctObjectsCount}</span></div>
              <div class="data-row"><span class="data-row__label">Objetos novos esse ano</span><span class="data-row__leader"></span><span class="data-row__value">${y.newObjectsCount}</span></div>
            </div>
          </div>`).join('')}

        ${upcoming.length ? `
        <div class="panel">
          <div class="panel__title">Próximos 14 dias</div>
          <div class="events-list">
            ${upcoming.map(e => renderEventRow(e, true)).join('')}
          </div>
        </div>` : ''}

        <div class="panel">
          <div class="panel__title">Eventos de ${monthName}</div>
          ${events.length
            ? `<div class="events-list">${events.map(e => renderEventRow(e, false)).join('')}</div>`
            : '<p style="color:var(--ink-dim);font-size:13px;">Nenhum evento registrado para este mês.</p>'}
        </div>

        <div class="panel">
          <div class="panel__title">Calendário completo 2026</div>
          ${renderEventsFullCalendar()}
        </div>
      </div>`;
  }

  function renderEventRow(e, showDate) {
    const icon = window.AstroEvents.TYPE_ICON[e.type] || '•';
    const label = window.AstroEvents.TYPE_LABEL[e.type] || e.type;
    const d = new Date(e.date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return `
      <div class="event-row ${e.photogenic ? 'event-row--photogenic' : ''}">
        <span class="event-row__icon">${icon}</span>
        <div class="event-row__body">
          <div class="event-row__name">${escapeHtml(e.name)} ${e.photogenic ? '<span class="event-row__photo-badge">📷</span>' : ''}</div>
          <div class="event-row__detail">${escapeHtml(e.detail)}</div>
        </div>
        <span class="event-row__date">${dateStr}</span>
      </div>`;
  }

  function renderEventsFullCalendar() {
    const months = Array.from({length: 12}, (_, i) => i + 1);
    return `<div class="events-months">
      ${months.map(m => {
        const evts = window.AstroEvents.getByMonth(m);
        if (!evts.length) return '';
        const mName = new Date(2026, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
        return `<div class="events-month">
          <div class="events-month__label">${mName}</div>
          ${evts.map(e => renderEventRow(e, true)).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ---------- Catálogo (grid) ----------

  function renderCatalogGrid(objects, photosByObject, atlasTopIds) {
    const topIds = atlasTopIds || new Set();

    if (objects.length === 0) {
      root().innerHTML = emptyStateHtml();
      return;
    }

    const cards = objects
      .map((obj) => {
        const photos = photosByObject[obj.id] || [];
        const photosWithImage = photos.filter((p) => p.thumbUrl);
        const coverPhoto = photosWithImage.find((p) => p.isCover);
        const cover = coverPhoto || photosWithImage[photosWithImage.length - 1]; // capa escolhida > mais recente com imagem
        const totalExposure = photos.reduce((acc, p) => acc + (p.exposureSeconds || 0), 0);
        const target = window.Catalog.getExposureTarget(obj);
        const isAtlasTop = topIds.has(obj.id);

        return `
          <article class="object-card ${isAtlasTop ? 'object-card--atlas-top' : ''}" tabindex="0" role="button" data-object-id="${escapeHtml(obj.id)}">
            <div class="object-card__frame ${cover ? '' : 'object-card__frame--empty'}">
              <span class="object-card__badge">${escapeHtml(TYPE_LABELS[obj.type] || obj.type)}</span>
              ${isAtlasTop ? '<span class="object-card__badge object-card__badge--atlas">Top hoje</span>' : ''}
              ${cover ? `<img src="${cover.thumbUrl}" alt="${escapeHtml(obj.commonName)}" loading="lazy" />` : 'SEM FOTO AINDA'}

              <div class="object-card__hover-panel">
                <div class="data-grid data-grid--compact">
                  <div class="data-row"><span class="data-row__label">RA</span><span class="data-row__leader"></span><span class="data-row__value">${escapeHtml(obj.ra)}</span></div>
                  <div class="data-row"><span class="data-row__label">DEC</span><span class="data-row__leader"></span><span class="data-row__value">${escapeHtml(obj.dec)}</span></div>
                  <div class="data-row"><span class="data-row__label">Tamanho</span><span class="data-row__leader"></span><span class="data-row__value">${obj.sizeArcmin ? `${obj.sizeArcmin}′` : '—'}</span></div>
                  <div class="data-row"><span class="data-row__label">Filtro</span><span class="data-row__leader"></span><span class="data-row__value">${escapeHtml(target.filter)}</span></div>
                </div>
                ${renderExposureBar(obj, totalExposure)}
              </div>
            </div>
            <div class="object-card__body">
              <div class="object-card__catalog">${escapeHtml(obj.catalog)}</div>
              <h3 class="object-card__name">${escapeHtml(obj.commonName)}</h3>
              <div class="object-card__stats">
                <span>${photos.length} sessão${photos.length === 1 ? '' : 'ões'}</span>
                <span>${formatExposure(totalExposure)}</span>
              </div>
            </div>
          </article>`;
      })
      .join('');

    root().innerHTML = `<div class="catalog-grid">${cards}</div>`;
  }

  function emptyStateHtml() {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Nenhum objeto catalogado ainda</div>
        <p>Clique em "Nova foto" pra começar seu catálogo.</p>
      </div>`;
  }

  // ---------- Detalhe do objeto + comparação ----------

  function renderObjectDetail(obj, photos, handlers) {
    handlers = handlers || {};
    const mainPhotos = photos.filter((p) => !p.isDetail);
    const detailsByParent = {};
    photos.filter((p) => p.isDetail).forEach((d) => {
      (detailsByParent[d.parentPhotoId] = detailsByParent[d.parentPhotoId] || []).push(d);
    });
    const totalExposure = photos.reduce((acc, p) => acc + (p.exposureSeconds || 0), 0);
    const target = window.Catalog.getExposureTarget(obj);
    const isSolarSystemBody = obj.type === 'planeta';
    const isLandscape = obj.type === 'paisagem';

    const dataRows = isLandscape
      ? (() => {
          const lastCapture = mainPhotos.length ? mainPhotos[mainPhotos.length - 1].captureDate : null;
          const panels = mainPhotos.map((p) => p.panelCount || 0);
          return [
            ['SESSÕES', mainPhotos.length],
            ['ÚLTIMA CAPTURA', lastCapture ? formatDate(lastCapture) : '—'],
            ['LOCAL MAIS RECENTE', mainPhotos.length ? (mainPhotos[mainPhotos.length - 1].location || '—') : '—'],
            ['MAIOR PANORÂMICA', panels.some(Boolean) ? `${Math.max(...panels)} painéis` : '—'],
          ];
        })()
      : isSolarSystemBody
      ? (() => {
          const stacked = mainPhotos.map((p) => p.framesStacked || 0);
          const kept = mainPhotos.map((p) => p.framesKeptPercent || 0);
          const lastCapture = mainPhotos.length ? mainPhotos[mainPhotos.length - 1].captureDate : null;
          return [
            ['SESSÕES', mainPhotos.length],
            ['ÚLTIMA CAPTURA', lastCapture ? formatDate(lastCapture) : '—'],
            ['FRAMES EMPILHADOS (TOTAL)', stacked.reduce((a, b) => a + b, 0) || '—'],
            ['MELHOR % APROVEITADO', kept.length ? `${Math.max(...kept)}%` : '—'],
          ];
        })()
      : [
          ['RA (J2000)', obj.ra],
          ['DEC (J2000)', obj.dec],
          ['CONSTELAÇÃO', obj.constellation],
          ['TAMANHO', obj.sizeArcmin ? `${obj.sizeArcmin}′` : '—'],
          ['MAGNITUDE', obj.magnitude ?? '—'],
          ['FILTRO RECOMENDADO', target.filter],
          ['SESSÕES', mainPhotos.length],
          ['EXPOSIÇÃO TOTAL', formatExposure(totalExposure)],
        ];

    root().innerHTML = `
      <div class="detail-view">
        <button class="detail-back" id="btn-back">← Voltar ao catálogo</button>

        <div class="detail-header">
          <div>
            <div class="detail-title__catalog">${escapeHtml(obj.catalog)} · ${escapeHtml(TYPE_LABELS[obj.type] || obj.type)}</div>
            <h1 class="detail-title__name">${escapeHtml(obj.commonName)}</h1>
            <div class="detail-title__meta">${escapeHtml(obj.constellation)}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-secondary" id="btn-log-session">+ Registrar sessão</button>
            <button class="btn-primary" id="btn-add-photo-to-object" style="margin-left:0;">+ Foto</button>
          </div>
        </div>

        <div class="detail-grid-2col">
          <div class="panel">
            <div class="panel__title">Ficha do objeto</div>
            ${isSolarSystemBody ? '<p class="panel__note">Corpo do sistema solar — posição varia dia a dia (efeméride), por isso não mostramos RA/Dec fixos aqui.</p>' : ''}
            ${isLandscape ? '<p class="panel__note">Paisagem/céu amplo — sem alvo pontual fixo, por isso não mostramos RA/Dec/magnitude aqui.</p>' : ''}
            <div class="data-grid">
              ${dataRows.map(([label, value]) => `
                <div class="data-row">
                  <span class="data-row__label">${label}</span>
                  <span class="data-row__leader"></span>
                  <span class="data-row__value">${escapeHtml(value)}</span>
                </div>`).join('')}
            </div>
          </div>

          <div class="panel">
            <div class="panel__title">Meta de integração <span class="panel__title-hint">heurística, não é SNR calculado</span></div>
            ${renderExposureBar(obj, totalExposure)}
            ${mainPhotos.length ? `<div class="panel__subtitle">Contribuição por sessão</div>${renderSessionChart(mainPhotos)}` : ''}
          </div>
        </div>

        ${mainPhotos.length >= 2 ? renderComparePanel(mainPhotos) : ''}
        ${!isSolarSystemBody && !isLandscape ? renderSignalPanel(mainPhotos) : ''}

        <div class="panel">
          <div class="panel__title">Linha do tempo (${mainPhotos.length})</div>
          ${mainPhotos.length ? renderTimeline(mainPhotos, detailsByParent) : '<p style="color:var(--ink-dim); font-size:13px;">Nenhuma foto ainda.</p>'}
        </div>

        <div class="panel">
          <div class="panel__title">Sobre</div>
          <div id="wiki-content">
            ${obj.wikiExtract
              ? `<p class="wiki-text">${escapeHtml(obj.wikiExtract)}</p>${obj.wikiUrl ? `<a href="${obj.wikiUrl}" target="_blank" rel="noopener" class="wiki-link">Ler mais na Wikipédia →</a>` : ''}`
              : '<p class="hint">Buscando informações na Wikipédia...</p>'}
          </div>
          <a class="wiki-link wiki-link--inspiration" target="_blank" rel="noopener"
             href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`"Seestar S30" ${obj.commonName}`)}">
            🔎 Ver fotos feitas com o S30 deste alvo (inspiração) →
          </a>
        </div>
      </div>`;

    if (mainPhotos.length >= 2) wireCompare(mainPhotos);
    wireTimeline(mainPhotos, handlers.onSetCover, handlers.onEdit, handlers.onDelete, handlers.onAddDetail, detailsByParent, obj, handlers.onAnalyze);
  }

  function renderSignalPanel(photos) {
    const withSnr = photos.filter((p) => p.snrProxy != null);
    if (!withSnr.length) return '';
    const prediction = window.Analysis.predictImprovement(
      withSnr.map((p) => ({ exposureSeconds: p.exposureSeconds, snrProxy: p.snrProxy }))
    );
    return `
      <div class="panel">
        <div class="panel__title">Análise de sinal/ruído</div>
        <div class="data-grid">
          ${withSnr.map((p) => `
            <div class="data-cell">
              <div class="data-cell__label">${formatDate(p.captureDate)}</div>
              <div class="data-cell__value">SNR proxy: ${p.snrProxy}${p.analysisConfidence === 'baixa' ? ' ⚠️' : ''}</div>
            </div>`).join('')}
        </div>
        ${prediction && prediction.improvementPct != null
          ? `<p class="panel__note">Nesse ritmo, +30min de integração deve melhorar o SNR em ~${prediction.improvementPct}%.</p>`
          : ''}
      </div>`;
  }

  function renderComparePanel(photos) {
    const first = photos[0];
    const last = photos[photos.length - 1];
    const options = (selectedId) =>
      photos.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${formatDate(p.captureDate)}</option>`).join('');

    return `
      <div class="panel">
        <div class="panel__title">Evolução</div>
        <div class="compare" id="compare-frame">
          <img class="compare__before" id="compare-before-img" src="${first.thumbUrl}" alt="antes" />
          <img class="compare__after" id="compare-after-img" src="${last.thumbUrl}" alt="depois" />
          <div class="compare__label compare__label--before">${formatDate(first.captureDate)}</div>
          <div class="compare__label compare__label--after">${formatDate(last.captureDate)}</div>
          <div class="compare__handle" id="compare-handle"></div>
        </div>
        <div class="compare-picker">
          <select id="compare-select-before">${options(first.id)}</select>
          <select id="compare-select-after">${options(last.id)}</select>
        </div>
      </div>`;
  }

  function renderTimeline(photos, detailsByParent) {
    detailsByParent = detailsByParent || {};
    return `
      <div class="timeline">
        <div class="timeline__line"></div>
        ${photos.map((p, i) => {
          const moon = window.Moon.phaseForDate(new Date(p.captureDate));
          const details = detailsByParent[p.id] || [];
          return `
          <div class="timeline-item" data-photo-index="${i}" tabindex="0" role="button">
            <div class="timeline-item__dot"></div>
            <div class="timeline-item__frame">
              ${p.thumbUrl
                ? `<img src="${p.thumbUrl}" alt="${formatDate(p.captureDate)}" loading="lazy" />`
                : `<div class="timeline-item__placeholder">Sem foto<br />só sessão</div>`}
              ${p.exposureSeconds ? `<span class="timeline-item__exposure">${formatExposure(p.exposureSeconds)}</span>` : ''}
              ${p.thumbUrl ? `<button class="timeline-item__star ${p.isCover ? 'is-cover' : ''}" data-star-index="${i}" title="Definir como capa do alvo" aria-label="Definir como capa">★</button>` : ''}
              ${details.length ? `<button class="timeline-item__detail-badge" data-detail-parent-index="${i}" title="${details.length} detalhe(s)">🔍 ${details.length}</button>` : ''}
            </div>
            <div class="timeline-item__date">${formatDate(p.captureDate)}</div>
            <div class="timeline-item__moon">🌙 ${moon.illumination}%</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function wireTimeline(photos, onSetCover, onEdit, onDelete, onAddDetail, detailsByParent, obj, onAnalyze) {
    detailsByParent = detailsByParent || {};
    document.querySelectorAll('.timeline-item').forEach((el) => {
      const open = () => openLightbox(photos, Number(el.dataset.photoIndex), onEdit, onDelete, onAddDetail, obj, onAnalyze);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });

    document.querySelectorAll('.timeline-item__star').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.starIndex);
        if (onSetCover) onSetCover(photos[idx].id);
      });
    });

    document.querySelectorAll('.timeline-item__detail-badge').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.detailParentIndex);
        const parent = photos[idx];
        const group = [parent, ...(detailsByParent[parent.id] || [])];
        openLightbox(group, 0, onEdit, onDelete, onAddDetail, obj, onAnalyze);
      });
    });
  }

  // ---------- Lightbox (visualização ampliada) ----------

  function openLightbox(photos, index, onEdit, onDelete, onAddDetail, obj, onAnalyze) {
    let current = index;

    function render() {
      const p = photos[current];
      if (!p.objectUrl && p.blob) p.objectUrl = URL.createObjectURL(p.blob);
      const moon = window.Moon.phaseForDate(new Date(p.captureDate));
      const techBits = [
        p.filterUsed ? { duoband: 'Duo-band', broadband: 'Broadband', lp: 'Filtro LP', outro: 'Filtro outro' }[p.filterUsed] || p.filterUsed : null,
        p.gain != null ? `gain ${p.gain}` : null,
        p.dither ? 'dither' : null,
        p.captureSoftware || null,
      ].filter(Boolean).join(' · ');

      modalRoot().innerHTML = `
        <div class="lightbox-overlay" id="lightbox-overlay">
          <button class="lightbox-close" id="lightbox-close" aria-label="Fechar">✕</button>
          ${photos.length > 1 ? '<button class="lightbox-nav lightbox-nav--prev" id="lightbox-prev" aria-label="Anterior">‹</button>' : ''}
          <div class="lightbox-content">
            ${p.objectUrl
              ? `<img src="${p.objectUrl}" alt="${formatDate(p.captureDate)}" />`
              : `<div class="lightbox-placeholder">Sessão sem foto registrada</div>`}
            <div class="lightbox-caption">
              <div class="lightbox-caption__top">
                <div>
                  <div class="lightbox-caption__date">${formatDate(p.captureDate)}</div>
                  <div class="lightbox-caption__meta">
                    ${p.isLuckyImaging
                      ? [p.videoSeconds ? `vídeo ${p.videoSeconds}s` : null, p.framesKeptPercent ? `${p.framesKeptPercent}% aproveitados` : null, p.framesStacked ? `${p.framesStacked} frames empilhados` : null].filter(Boolean).join(' · ') || 'lucky imaging'
                      : (p.exposureSeconds ? `${p.frames ? `${p.frames} frames × ${p.secondsPerFrame}s = ` : ''}${formatExposure(p.exposureSeconds)}` : 'exposição não informada')}
                    ${p.location ? ` · ${escapeHtml(p.location)}` : ''}
                    · lua ${moon.illumination}% (${moon.phaseName})
                  </div>
                  ${techBits ? `<div class="lightbox-caption__meta">${escapeHtml(techBits)}</div>` : ''}
                  ${p.notes ? `<div class="lightbox-caption__notes">${escapeHtml(p.notes)}</div>` : ''}
                </div>
                ${p.objectUrl && !p.isDetail && !p.isLuckyImaging && (!obj || obj.type !== 'paisagem') ? `<button class="lightbox-analyze" id="lightbox-analyze" title="Analisar ruído/sinal">🔬 Analisar</button>` : ''}${p.objectUrl ? `<button class="lightbox-share" id="lightbox-share" title="Exportar pro Instagram">📤 Compartilhar</button>` : ''}${p.objectUrl && !p.isDetail ? `<button class="lightbox-add-detail" id="lightbox-add-detail" title="Adicionar detalhe desta foto">🔍 Detalhe</button>` : ''}${p.objectUrl ? `<button class="lightbox-download" id="lightbox-download" title="Baixar foto">⬇ Baixar</button>` : ''}<button class="lightbox-edit" id="lightbox-edit" title="Editar metadados">✏ Editar</button><button class="lightbox-delete" id="lightbox-delete" title="Deletar esta foto">🗑</button>  
              </div>
            </div>
          </div>
          ${photos.length > 1 ? '<button class="lightbox-nav lightbox-nav--next" id="lightbox-next" aria-label="Próxima">›</button>' : ''}
        </div>`;

      document.getElementById('lightbox-close').addEventListener('click', closeModal);
      document.getElementById('lightbox-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'lightbox-overlay') closeModal();
      });
      document.getElementById('lightbox-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        if (onEdit) onEdit(photos[current], () => closeModal());
      });
      if (p.objectUrl && !p.isDetail && !p.isLuckyImaging && (!obj || obj.type !== 'paisagem')) {
        document.getElementById('lightbox-analyze').addEventListener('click', async (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '🔬 Analisando...';
          try {
            const result = await window.Analysis.analyzePhoto(p.blob);
            if (onAnalyze) onAnalyze(p, result);
          } catch (err) {
            console.error('[Lightbox] Falha ao analisar foto:', err);
            btn.disabled = false;
            btn.textContent = '🔬 Analisar';
          }
        });
      }
      if (p.objectUrl) {
        document.getElementById('lightbox-share').addEventListener('click', (e) => {
          e.stopPropagation();
          openInstagramExport(p, obj);
        });
      }
      if (p.objectUrl && !p.isDetail) {
        document.getElementById('lightbox-add-detail').addEventListener('click', (e) => {
          e.stopPropagation();
          if (onAddDetail) onAddDetail(p, () => closeModal());
        });
      }
      if (p.objectUrl) {
        document.getElementById('lightbox-download').addEventListener('click', (e) => {
          e.stopPropagation();
          const downloadUrl = p.originalBlob ? URL.createObjectURL(p.originalBlob) : p.objectUrl;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = p.fileName || `${p.objectId || 'foto'}.jpg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          if (p.originalBlob) URL.revokeObjectURL(downloadUrl);
        });
      }
      document.getElementById('lightbox-delete').addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Deletar esta foto? Não pode ser desfeito.')) {
          if (onDelete) onDelete(photos[current], () => closeModal());
        }
      });
      if (photos.length > 1) {
        document.getElementById('lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); current = (current - 1 + photos.length) % photos.length; render(); });
        document.getElementById('lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); current = (current + 1) % photos.length; render(); });
      }
    }
 
    render();

    function onKeydown(e) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowLeft' && photos.length > 1) { current = (current - 1 + photos.length) % photos.length; render(); }
      if (e.key === 'ArrowRight' && photos.length > 1) { current = (current + 1) % photos.length; render(); }
    }
    document.addEventListener('keydown', onKeydown);

    const originalClose = closeModal;
    // garante que o listener de teclado é removido ao fechar, e libera a memória
    // das fotos em resolução plena que foram carregadas sob demanda neste lightbox
    window.__lightboxKeydownCleanup = () => {
      document.removeEventListener('keydown', onKeydown);
      photos.forEach((p) => {
        if (p.objectUrl) { URL.revokeObjectURL(p.objectUrl); p.objectUrl = null; }
      });
    };
  }

  function wireCompare(photos) {
    const frame = document.getElementById('compare-frame');
    const handle = document.getElementById('compare-handle');
    const beforeImg = document.getElementById('compare-before-img');
    const afterImg = document.getElementById('compare-after-img');
    const selBefore = document.getElementById('compare-select-before');
    const selAfter = document.getElementById('compare-select-after');
    const labelBefore = frame.querySelector('.compare__label--before');
    const labelAfter = frame.querySelector('.compare__label--after');

    function setSplit(pct) {
      frame.style.setProperty('--split', `${pct}%`);
    }

    let dragging = false;
    handle.addEventListener('mousedown', () => (dragging = true));
    window.addEventListener('mouseup', () => (dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = frame.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      setSplit(pct);
    });
    // touch
    handle.addEventListener('touchstart', () => (dragging = true));
    window.addEventListener('touchend', () => (dragging = false));
    window.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const rect = frame.getBoundingClientRect();
      const x = e.touches[0].clientX;
      const pct = Math.min(100, Math.max(0, ((x - rect.left) / rect.width) * 100));
      setSplit(pct);
    });

    function findPhoto(id) {
      return photos.find((p) => String(p.id) === String(id));
    }

    selBefore.addEventListener('change', () => {
      const p = findPhoto(selBefore.value);
      beforeImg.src = p.thumbUrl;
      labelBefore.textContent = formatDate(p.captureDate);
    });
    selAfter.addEventListener('change', () => {
      const p = findPhoto(selAfter.value);
      afterImg.src = p.thumbUrl;
      labelAfter.textContent = formatDate(p.captureDate);
    });
  }

  // ---------- Modal de novo alvo manual (sem foto nem sessão) ----------

  function openAddObjectForm({ onSubmit }) {
    modalRoot().innerHTML = `
      <div class="modal-overlay" id="add-object-overlay">
        <div class="modal">
          <h2 class="modal__title">Novo alvo</h2>
          <p class="hint" style="margin-bottom:16px;">Cadastra um alvo que você pretende fotografar, mesmo sem foto ainda.</p>

          <div class="form-field">
            <label>Nome comum</label>
            <input type="text" id="newobj-field-name" placeholder="ex: Rosette Nebula" />
          </div>

          <div class="form-field">
            <label>Catálogo (opcional)</label>
            <input type="text" id="newobj-field-catalog" placeholder="ex: NGC 2237" />
          </div>

          <div class="form-field">
            <label>Tipo</label>
            <select id="newobj-field-type">
              <option value="nebulosa">Nebulosa</option>
              <option value="galaxia">Galáxia</option>
              <option value="aglomerado">Aglomerado</option>
              <option value="planeta">Planeta</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div class="modal__actions">
            <button class="btn-secondary" id="btn-cancel-newobj">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-newobj" style="margin-left:0;">Adicionar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-cancel-newobj').addEventListener('click', closeModal);

    document.getElementById('btn-confirm-newobj').addEventListener('click', async () => {
      const commonName = document.getElementById('newobj-field-name').value.trim();
      if (!commonName) {
        alert('Dá um nome pro alvo.');
        return;
      }
      const formData = {
        commonName,
        catalog: document.getElementById('newobj-field-catalog').value.trim() || '—',
        type: document.getElementById('newobj-field-type').value,
      };
      closeModal();
      await onSubmit(formData);
    });
  }

  // ---------- Widget de local ativo (sidebar) ----------

  function renderLocationWidget(active) {
    return `
      <div class="location-widget">
        <div class="sidebar-section-label">Local de observação</div>
        ${active
          ? `<div class="location-widget__active">
               <span class="location-widget__name">📍 ${escapeHtml(active.name)}</span>
               <span class="location-widget__coords">${active.lat.toFixed(2)}° ${active.lon.toFixed(2)}°</span>
             </div>`
          : `<div class="location-widget__empty">Nenhum local definido</div>`}
        <button class="btn-secondary" id="btn-manage-locations">Gerenciar locais</button>
      </div>`;
  }

  function openLocationManager({ locations, activeId, onSetActive, onAdd, onRemove }) {
    modalRoot().innerHTML = `
      <div class="modal-overlay" id="loc-overlay">
        <div class="modal">
          <h2 class="modal__title">Locais de observação</h2>

          <div class="loc-list" id="loc-list">
            ${locations.length === 0
              ? '<p class="hint">Nenhum local salvo ainda.</p>'
              : locations.map((l) => `
                <div class="loc-row ${l.id === activeId ? 'is-active' : ''}" data-loc-id="${l.id}">
                  <div class="loc-row__info">
                    <span class="loc-row__name">${escapeHtml(l.name)}</span>
                    <span class="loc-row__coords">${l.lat.toFixed(4)}°, ${l.lon.toFixed(4)}°</span>
                  </div>
                  <div class="loc-row__actions">
                    <button class="btn-secondary loc-btn-activate" data-loc-id="${l.id}">${l.id === activeId ? '✓ Ativo' : 'Ativar'}</button>
                    <button class="btn-secondary loc-btn-remove" data-loc-id="${l.id}">✕</button>
                  </div>
                </div>`).join('')}
          </div>

          <div style="border-top: 1px solid var(--border-hairline); margin: 16px 0; padding-top: 16px;">
            <div class="sidebar-section-label" style="margin-bottom:10px;">Adicionar local</div>
            <div class="form-field">
              <label>Nome</label>
              <input type="text" id="loc-field-name" placeholder="ex: Bocaina, SP" />
            </div>
            <div class="form-field--row">
              <div class="form-field">
                <label>Latitude</label>
                <input type="number" id="loc-field-lat" step="0.0001" placeholder="-22.8473" />
              </div>
              <div class="form-field">
                <label>Longitude</label>
                <input type="number" id="loc-field-lon" step="0.0001" placeholder="-44.5156" />
              </div>
            </div>
            <button class="btn-secondary" id="loc-btn-add" style="width:100%;">Salvar local</button>
          </div>

          <div class="modal__actions">
            <button class="btn-primary" id="loc-btn-close" style="margin-left:0;">Fechar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('loc-btn-close').addEventListener('click', closeModal);
    document.getElementById('loc-overlay').addEventListener('click', (e) => { if (e.target.id === 'loc-overlay') closeModal(); });

    document.querySelectorAll('.loc-btn-activate').forEach((btn) => {
      btn.addEventListener('click', () => onSetActive(btn.dataset.locId));
    });
    document.querySelectorAll('.loc-btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => onRemove(btn.dataset.locId));
    });

    document.getElementById('loc-btn-add').addEventListener('click', () => {
      const name = document.getElementById('loc-field-name').value.trim();
      const lat = parseFloat(document.getElementById('loc-field-lat').value);
      const lon = parseFloat(document.getElementById('loc-field-lon').value);
      if (!name || isNaN(lat) || isNaN(lon)) { alert('Preenche nome, latitude e longitude.'); return; }
      onAdd({ name, lat, lon });
    });
  }

  // ---------- Modal de upload/formulário ----------

  function openUploadForm({ file, exif, objectIdHint, onSubmit, onCancel, objectsList, defaultLocation }) {
    const previewUrl = URL.createObjectURL(file);
    const dateValue = exif.dateTimeOriginal
      ? exif.dateTimeOriginal.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    modalRoot().innerHTML = `
      <div class="modal-overlay" id="upload-overlay">
        <div class="modal">
          <h2 class="modal__title">Nova foto</h2>

          <div class="form-field">
            <label>Objeto</label>
            <select id="field-object">
              <option value="__new__">+ Novo objeto</option>
              ${(objectsList || []).map((o) => `<option value="${o.id}" ${o.id === objectIdHint ? 'selected' : ''}>${escapeHtml(o.catalog)} — ${escapeHtml(o.commonName)}</option>`).join('')}
            </select>
          </div>

          <div id="new-object-fields" style="display:none;">
            <div class="form-field">
              <label>Nome do objeto</label>
              <input type="text" id="field-new-name" placeholder="ex: NGC 2237 - Rosette" />
            </div>
            <div class="form-field">
              <label>Tipo</label>
              <select id="field-new-type">
                <option value="nebulosa">Nebulosa</option>
                <option value="galaxia">Galáxia</option>
                <option value="aglomerado">Aglomerado</option>
                <option value="planeta">Planeta</option>
                <option value="paisagem">Paisagem (Via Láctea/céu amplo)</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          <div class="form-field">
            <label>Data da captura</label>
            <input type="date" id="field-date" value="${dateValue}" />
            <div class="hint">${exif.dateTimeOriginal ? 'Extraído do EXIF automaticamente' : 'Não encontrado no EXIF — confirme a data'}</div>
          </div>

          <div id="deepsky-fields">
            <div class="form-field form-field--row">
              <div>
                <label>Frames</label>
                <input type="number" id="field-frames" min="0" step="1" placeholder="ex: 120" />
              </div>
              <div>
                <label>Segundos/frame</label>
                <input type="number" id="field-seconds-per-frame" min="0" step="1" value="${exif.exposureTimeSeconds ? Math.round(exif.exposureTimeSeconds) : ''}" placeholder="ex: 10" />
              </div>
            </div>
            <div class="form-field__computed" id="exposure-computed">= 0min de exposição total</div>
          </div>

          <div id="lucky-fields" class="form-field--row" style="display:none;">
            <div class="form-field">
              <label>Duração do vídeo (s)</label>
              <input type="number" id="field-video-seconds" min="0" step="1" placeholder="ex: 60" />
            </div>
            <div class="form-field">
              <label>% frames aproveitados</label>
              <input type="number" id="field-frames-kept-pct" min="0" max="100" step="1" placeholder="ex: 30" />
            </div>
            <div class="form-field">
              <label>Frames empilhados</label>
              <input type="number" id="field-frames-stacked" min="0" step="1" placeholder="ex: 800" />
            </div>
          </div>

          <div id="landscape-fields" style="display:none;">
            <div class="form-field">
              <label>Tipo de composição</label>
              <select id="field-composition-type">
                <option value="ceu">Só céu</option>
                <option value="composicao">Composição (céu + primeiro plano)</option>
                <option value="panoramica">Panorâmica</option>
              </select>
            </div>
            <div class="form-field form-field--row">
              <div>
                <label>Lente/distância focal</label>
                <input type="text" id="field-focal-length" placeholder="ex: 14mm f/2.8" />
              </div>
              <div>
                <label>Nº de painéis (se panorâmica)</label>
                <input type="number" id="field-panel-count" min="0" step="1" placeholder="ex: 5" />
              </div>
            </div>
          </div>

          <div class="form-field">
            <label>Local</label>
            <input type="text" id="field-location" placeholder="ex: São Paulo, SP" value="${escapeHtml(defaultLocation || '')}" />
          </div>

          <div class="form-field--row">
            <div class="form-field">
              <label>Filtro usado</label>
              <select id="field-filter">
                <option value="">—</option>
                <option value="duoband">Duo-band (Hα+OIII)</option>
                <option value="broadband">Broadband (UV/IR cut)</option>
                <option value="lp">Poluição luminosa</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div class="form-field">
              <label>Gain</label>
              <input type="number" id="field-gain" min="0" step="1" placeholder="ex: 80" />
            </div>
          </div>

          <div class="form-field--row">
            <div class="form-field">
              <label>Software de captura</label>
              <input type="text" id="field-software" placeholder="ex: App SeeStar" />
            </div>
            <div class="form-field" style="display:flex; align-items:center; gap:8px; padding-top:22px;">
              <input type="checkbox" id="field-dither" style="width:auto;" />
              <label style="margin:0; text-transform:none; font-family:var(--font-body); font-size:13px; color:var(--ink-primary);">Usou dither</label>
            </div>
          </div>

          <div class="form-field">
            <label>Notas</label>
            <textarea id="field-notes" rows="2" placeholder="processamento, condições, etc."></textarea>
          </div>

          <div class="modal__actions">
            <button class="btn-secondary" id="btn-cancel-upload">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-upload" style="margin-left:0;">Salvar</button>
          </div>
        </div>
      </div>`;

    const overlay = document.getElementById('upload-overlay');
    const selectObj = document.getElementById('field-object');
    const newFields = document.getElementById('new-object-fields');
    const framesInput = document.getElementById('field-frames');
    const secondsInput = document.getElementById('field-seconds-per-frame');
    const computedEl = document.getElementById('exposure-computed');

    function updateComputed() {
      const frames = parseFloat(framesInput.value || '0');
      const seconds = parseFloat(secondsInput.value || '0');
      const totalSeconds = frames * seconds;
      computedEl.textContent = `= ${formatExposure(totalSeconds) === '—' ? '0min' : formatExposure(totalSeconds)} de exposição total`;
    }
    framesInput.addEventListener('input', updateComputed);
    secondsInput.addEventListener('input', updateComputed);

    selectObj.addEventListener('change', () => {
      newFields.style.display = selectObj.value === '__new__' ? 'block' : 'none';
    });
    if (selectObj.value === '__new__') newFields.style.display = 'block';

    const newTypeSelect = document.getElementById('field-new-type');
    function isPlanetSelected() {
      if (selectObj.value === '__new__') return newTypeSelect.value === 'planeta';
      const obj = (objectsList || []).find((o) => o.id === selectObj.value);
      return !!obj && obj.type === 'planeta';
    }
    function isLandscapeSelected() {
      if (selectObj.value === '__new__') return newTypeSelect.value === 'paisagem';
      const obj = (objectsList || []).find((o) => o.id === selectObj.value);
      return !!obj && obj.type === 'paisagem';
    }
    function updateCaptureFieldsVisibility() {
      const planet = isPlanetSelected();
      const landscape = isLandscapeSelected();
      document.getElementById('deepsky-fields').style.display = (planet || landscape) ? 'none' : 'block';
      document.getElementById('lucky-fields').style.display = planet ? 'flex' : 'none';
      document.getElementById('landscape-fields').style.display = landscape ? 'block' : 'none';
    }
    updateCaptureFieldsVisibility();
    selectObj.addEventListener('change', updateCaptureFieldsVisibility);
    newTypeSelect.addEventListener('change', updateCaptureFieldsVisibility);

    document.getElementById('btn-cancel-upload').addEventListener('click', () => {
      closeModal();
      URL.revokeObjectURL(previewUrl);
      if (onCancel) onCancel();
    });

    document.getElementById('btn-confirm-upload').addEventListener('click', async () => {
      const isNewObject = selectObj.value === '__new__';
      const planetSession = isPlanetSelected();
      const landscapeSession = isLandscapeSelected();
      const frames = (planetSession || landscapeSession) ? null : (parseFloat(framesInput.value || '0') || null);
      const secondsPerFrame = (planetSession || landscapeSession) ? null : (parseFloat(secondsInput.value || '0') || null);
      const exposureSeconds = frames && secondsPerFrame ? frames * secondsPerFrame : null;
      const videoSeconds = planetSession ? (parseFloat(document.getElementById('field-video-seconds').value || '0') || null) : null;
      const framesKeptPercent = planetSession ? (parseFloat(document.getElementById('field-frames-kept-pct').value || '0') || null) : null;
      const framesStacked = planetSession ? (parseInt(document.getElementById('field-frames-stacked').value || '0', 10) || null) : null;
      const compositionType = landscapeSession ? document.getElementById('field-composition-type').value : null;
      const focalLength = landscapeSession ? document.getElementById('field-focal-length').value.trim() || null : null;
      const panelCount = landscapeSession ? (parseInt(document.getElementById('field-panel-count').value || '0', 10) || null) : null;

      const formData = {
        objectId: isNewObject ? null : selectObj.value,
        isNewObject,
        newObjectName: document.getElementById('field-new-name').value.trim(),
        newObjectType: document.getElementById('field-new-type').value,
        captureDate: document.getElementById('field-date').value,
        exposureSeconds,
        frames,
        secondsPerFrame,
        isLuckyImaging: planetSession,
        videoSeconds,
        framesKeptPercent,
        framesStacked,
        compositionType,
        focalLength,
        panelCount,
        gain: document.getElementById('field-gain').value ? parseInt(document.getElementById('field-gain').value, 10) : null,
        filterUsed: document.getElementById('field-filter').value || null,
        dither: document.getElementById('field-dither').checked,
        captureSoftware: document.getElementById('field-software').value.trim() || null,
        location: document.getElementById('field-location').value.trim(),
        notes: document.getElementById('field-notes').value.trim(),
      };

      if (isNewObject && !formData.newObjectName) {
        alert('Dá um nome pro objeto novo.');
        return;
      }

      closeModal();
      await onSubmit(formData);
    });
  }

  function closeModal() {
    modalRoot().innerHTML = '';
    if (window.__lightboxKeydownCleanup) {
      window.__lightboxKeydownCleanup();
      window.__lightboxKeydownCleanup = null;
    }
  }

  // ---------- Modal de edição de foto/sessão existente ----------

  function openEditPhotoForm({ photo, objectsList, onSubmit }) {
    const dateValue = photo.captureDate ? photo.captureDate.slice(0, 10) : '';
    const frames = photo.frames || '';
    const spf = photo.secondsPerFrame || '';

    modalRoot().innerHTML = `
      <div class="modal-overlay" id="edit-photo-overlay">
        <div class="modal">
          <h2 class="modal__title">Editar sessão</h2>

          <div class="form-field">
            <label>Objeto</label>
            <select id="edit-field-object">
              ${(objectsList || []).map(o =>
                `<option value="${o.id}" ${o.id === photo.objectId ? 'selected' : ''}>${escapeHtml(o.catalog)} — ${escapeHtml(o.commonName)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="form-field">
            <label>Data da captura</label>
            <input type="date" id="edit-field-date" value="${dateValue}" />
          </div>

          <div id="edit-deepsky-fields">
            <div class="form-field form-field--row">
              <div>
                <label>Frames</label>
                <input type="number" id="edit-field-frames" min="0" step="1" value="${frames}" placeholder="ex: 120" />
              </div>
              <div>
                <label>Segundos/frame</label>
                <input type="number" id="edit-field-spf" min="0" step="1" value="${spf}" placeholder="ex: 10" />
              </div>
            </div>
            <div class="form-field__computed" id="edit-exposure-computed">= ${formatExposure((frames && spf) ? frames * spf : photo.exposureSeconds || 0)}</div>
          </div>

          <div id="edit-lucky-fields" class="form-field--row" style="display:none;">
            <div class="form-field">
              <label>Duração do vídeo (s)</label>
              <input type="number" id="edit-field-video-seconds" min="0" step="1" value="${photo.videoSeconds || ''}" placeholder="ex: 60" />
            </div>
            <div class="form-field">
              <label>% frames aproveitados</label>
              <input type="number" id="edit-field-frames-kept-pct" min="0" max="100" step="1" value="${photo.framesKeptPercent || ''}" placeholder="ex: 30" />
            </div>
            <div class="form-field">
              <label>Frames empilhados</label>
              <input type="number" id="edit-field-frames-stacked" min="0" step="1" value="${photo.framesStacked || ''}" placeholder="ex: 800" />
            </div>
          </div>

          <div id="edit-landscape-fields" style="display:none;">
            <div class="form-field">
              <label>Tipo de composição</label>
              <select id="edit-field-composition-type">
                <option value="ceu" ${photo.compositionType === 'ceu' ? 'selected' : ''}>Só céu</option>
                <option value="composicao" ${photo.compositionType === 'composicao' ? 'selected' : ''}>Composição (céu + primeiro plano)</option>
                <option value="panoramica" ${photo.compositionType === 'panoramica' ? 'selected' : ''}>Panorâmica</option>
              </select>
            </div>
            <div class="form-field form-field--row">
              <div>
                <label>Lente/distância focal</label>
                <input type="text" id="edit-field-focal-length" value="${escapeHtml(photo.focalLength || '')}" placeholder="ex: 14mm f/2.8" />
              </div>
              <div>
                <label>Nº de painéis (se panorâmica)</label>
                <input type="number" id="edit-field-panel-count" min="0" step="1" value="${photo.panelCount || ''}" placeholder="ex: 5" />
              </div>
            </div>
          </div>

          <div class="form-field">
            <label>Local</label>
            <input type="text" id="edit-field-location" value="${escapeHtml(photo.location || '')}" placeholder="ex: São Paulo, SP" />
          </div>

          <div class="form-field--row">
            <div class="form-field">
              <label>Filtro usado</label>
              <select id="edit-field-filter">
                <option value="">—</option>
                <option value="duoband" ${photo.filterUsed === 'duoband' ? 'selected' : ''}>Duo-band (Hα+OIII)</option>
                <option value="broadband" ${photo.filterUsed === 'broadband' ? 'selected' : ''}>Broadband (UV/IR cut)</option>
                <option value="lp" ${photo.filterUsed === 'lp' ? 'selected' : ''}>Poluição luminosa</option>
                <option value="outro" ${photo.filterUsed === 'outro' ? 'selected' : ''}>Outro</option>
              </select>
            </div>
            <div class="form-field">
              <label>Gain</label>
              <input type="number" id="edit-field-gain" min="0" step="1" value="${photo.gain ?? ''}" placeholder="ex: 80" />
            </div>
          </div>

          <div class="form-field--row">
            <div class="form-field">
              <label>Software de captura</label>
              <input type="text" id="edit-field-software" value="${escapeHtml(photo.captureSoftware || '')}" placeholder="ex: App SeeStar" />
            </div>
            <div class="form-field" style="display:flex;align-items:center;gap:8px;padding-top:22px;">
              <input type="checkbox" id="edit-field-dither" style="width:auto;" ${photo.dither ? 'checked' : ''} />
              <label style="margin:0;text-transform:none;font-family:var(--font-body);font-size:13px;color:var(--ink-primary);">Usou dither</label>
            </div>
          </div>

          <div class="form-field">
            <label>Notas</label>
            <textarea id="edit-field-notes" rows="2">${escapeHtml(photo.notes || '')}</textarea>
          </div>

          <div class="modal__actions">
            <button class="btn-secondary" id="btn-cancel-edit">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-edit" style="margin-left:0;">Salvar alterações</button>
          </div>
        </div>
      </div>`;

    const framesInput = document.getElementById('edit-field-frames');
    const spfInput    = document.getElementById('edit-field-spf');
    const computed    = document.getElementById('edit-exposure-computed');
    function updateComputed() {
      const f = parseFloat(framesInput.value || '0');
      const s = parseFloat(spfInput.value || '0');
      computed.textContent = `= ${formatExposure(f && s ? f * s : 0)}`;
    }
    framesInput.addEventListener('input', updateComputed);
    spfInput.addEventListener('input', updateComputed);

    const editObjSelect = document.getElementById('edit-field-object');
    function editIsPlanetSelected() {
      const obj = (objectsList || []).find((o) => o.id === editObjSelect.value);
      return !!obj && obj.type === 'planeta';
    }
    function editIsLandscapeSelected() {
      const obj = (objectsList || []).find((o) => o.id === editObjSelect.value);
      return !!obj && obj.type === 'paisagem';
    }
    function updateEditFieldsVisibility() {
      const planet = editIsPlanetSelected();
      const landscape = editIsLandscapeSelected();
      document.getElementById('edit-deepsky-fields').style.display = (planet || landscape) ? 'none' : 'block';
      document.getElementById('edit-lucky-fields').style.display = planet ? 'flex' : 'none';
      document.getElementById('edit-landscape-fields').style.display = landscape ? 'block' : 'none';
    }
    updateEditFieldsVisibility();
    editObjSelect.addEventListener('change', updateEditFieldsVisibility);

    document.getElementById('btn-cancel-edit').addEventListener('click', closeModal);
    document.getElementById('edit-photo-overlay').addEventListener('click', e => {
      if (e.target.id === 'edit-photo-overlay') closeModal();
    });

    document.getElementById('btn-confirm-edit').addEventListener('click', async () => {
      const planetSession = editIsPlanetSelected();
      const landscapeSession = editIsLandscapeSelected();
      const f   = (planetSession || landscapeSession) ? null : (parseFloat(framesInput.value || '0') || null);
      const spf = (planetSession || landscapeSession) ? null : (parseFloat(spfInput.value || '0') || null);
      const fields = {
        objectId:          document.getElementById('edit-field-object').value,
        captureDate:       dateInputToISO(document.getElementById('edit-field-date').value),
        frames:            f,
        secondsPerFrame:   spf,
        exposureSeconds:   (planetSession || landscapeSession) ? null : ((f && spf) ? f * spf : photo.exposureSeconds),
        isLuckyImaging:    planetSession,
        videoSeconds:      planetSession ? (parseFloat(document.getElementById('edit-field-video-seconds').value || '0') || null) : null,
        framesKeptPercent: planetSession ? (parseFloat(document.getElementById('edit-field-frames-kept-pct').value || '0') || null) : null,
        framesStacked:     planetSession ? (parseInt(document.getElementById('edit-field-frames-stacked').value || '0', 10) || null) : null,
        compositionType:   landscapeSession ? document.getElementById('edit-field-composition-type').value : null,
        focalLength:       landscapeSession ? document.getElementById('edit-field-focal-length').value.trim() || null : null,
        panelCount:        landscapeSession ? (parseInt(document.getElementById('edit-field-panel-count').value || '0', 10) || null) : null,
        location:          document.getElementById('edit-field-location').value.trim() || null,
        filterUsed:        document.getElementById('edit-field-filter').value || null,
        gain:              document.getElementById('edit-field-gain').value ? parseInt(document.getElementById('edit-field-gain').value) : null,
        captureSoftware:   document.getElementById('edit-field-software').value.trim() || null,
        dither:            document.getElementById('edit-field-dither').checked,
        notes:             document.getElementById('edit-field-notes').value.trim(),
      };
      closeModal();
      await onSubmit(photo.id, fields);
    });
  }

  // ---------- Exportar card pro Instagram ----------

  const INSTAGRAM_HANDLE = '@monte.universo';
  const IG_FORMATS = {
    square: { w: 1080, h: 1080, label: '1:1' },
    portrait: { w: 1080, h: 1350, label: '4:5' },
    story: { w: 1080, h: 1920, label: '9:16' },
  };

  function openInstagramExport(photo, obj) {
    let format = 'portrait';
    let layout = 'classico';

    modalRoot().innerHTML = `
      <div class="modal-overlay" id="ig-export-overlay">
        <div class="modal" style="max-width:420px;">
          <h2 class="modal__title">Exportar pro Instagram</h2>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <button class="btn-secondary ig-format-btn" data-format="square" style="flex:1;">1:1</button>
            <button class="btn-secondary ig-format-btn" data-format="portrait" style="flex:1;">4:5</button>
            <button class="btn-secondary ig-format-btn" data-format="story" style="flex:1;">9:16</button>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <button class="btn-secondary ig-layout-btn" data-layout="classico" style="flex:1;">Clássico</button>
            <button class="btn-secondary ig-layout-btn" data-layout="polaroid" style="flex:1;">Polaroid</button>
            <button class="btn-secondary ig-layout-btn" data-layout="telemetria" style="flex:1;">Telemetria</button>
          </div>
          <canvas id="ig-preview-canvas" style="width:100%; border-radius:8px; display:block;"></canvas>
          <div class="modal__actions">
            <button class="btn-secondary" id="btn-cancel-ig">Cancelar</button>
            <button class="btn-primary" id="btn-download-ig" style="margin-left:0;">Baixar</button>
          </div>
        </div>
      </div>`;

    const canvas = document.getElementById('ig-preview-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = photo.objectUrl;

    function commonData() {
      const moon = window.Moon.phaseForDate(new Date(photo.captureDate));
      return {
        statsLine1: photo.frames
          ? `${photo.frames} frames × ${photo.secondsPerFrame}s = ${formatExposure(photo.exposureSeconds)}`
          : (photo.exposureSeconds ? formatExposure(photo.exposureSeconds) : null),
        statsLine2: [photo.location || null, `🌙 ${moon.illumination}% (${moon.phaseName})`].filter(Boolean).join('   ·   '),
      };
    }

    function drawWatermark(w, h) {
      ctx.fillStyle = '#e8eaed';
      ctx.font = `600 ${Math.round(w * 0.034)}px Arial`;
      ctx.fillText('◎ S30 Cosmic Companion', w * 0.05, h * 0.045);
    }

    function drawHandleFooter(x, y, maxW, w) {
      ctx.strokeStyle = 'rgba(139,147,167,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + maxW, y);
      ctx.stroke();
      y += w * 0.045;

      ctx.fillStyle = '#5a6178';
      ctx.font = `${Math.round(w * 0.022)}px monospace`;
      ctx.fillText('via SeeStar S30', x, y);

      ctx.fillStyle = '#5ec8d8';
      ctx.font = `600 ${Math.round(w * 0.024)}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(INSTAGRAM_HANDLE, x + maxW, y);
      ctx.textAlign = 'left';
    }

    // ---- Layout 1: Clássico — foto full-bleed, texto sobre gradiente ----
    function drawClassico(w, h, data) {
      if (format === 'story') {
        const frameX = w * 0.06, frameY = h * 0.09;
        const frameW = w * 0.88, frameH = h * 0.48;
        const scale = Math.min(frameW / img.width, frameH / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        const ix = frameX + (frameW - iw) / 2, iy = frameY + (frameH - ih) / 2;

        ctx.save();
        roundRect(ctx, frameX, frameY, frameW, frameH, w * 0.02);
        ctx.clip();
        ctx.fillStyle = '#131826';
        ctx.fillRect(frameX, frameY, frameW, frameH);
        ctx.drawImage(img, ix, iy, iw, ih);
        ctx.restore();

        drawInfoBlock(w * 0.06, h * 0.62, w * 0.88, w, data);
      } else {
        const scale = Math.max(w / img.width, h / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);

        const scrimH = h * 0.34;
        const grad = ctx.createLinearGradient(0, h - scrimH, 0, h);
        grad.addColorStop(0, 'rgba(11,14,20,0)');
        grad.addColorStop(0.35, 'rgba(11,14,20,0.82)');
        grad.addColorStop(1, 'rgba(11,14,20,0.97)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h - scrimH, w, scrimH);

        drawInfoBlock(w * 0.05, h - scrimH * 0.78, w * 0.9, w, data);
      }
    }

    function drawInfoBlock(x, y, maxW, w, data) {
      ctx.fillStyle = '#e8935a';
      ctx.font = `600 ${Math.round(w * 0.026)}px monospace`;
      ctx.fillText(obj.catalog, x, y);
      y += w * 0.055;

      ctx.fillStyle = '#e8eaed';
      ctx.font = `700 ${Math.round(w * 0.058)}px Arial`;
      ctx.fillText(obj.commonName, x, y);
      y += w * 0.07;

      if (data.statsLine1) {
        ctx.fillStyle = '#c7cbd6';
        ctx.font = `${Math.round(w * 0.026)}px monospace`;
        ctx.fillText(data.statsLine1, x, y);
        y += w * 0.042;
      }

      ctx.fillStyle = '#8b93a7';
      ctx.font = `${Math.round(w * 0.026)}px monospace`;
      ctx.fillText(data.statsLine2, x, y);
      y += w * 0.06;

      drawHandleFooter(x, y, maxW, w);
    }

    // ---- Layout 2: Polaroid — foto emoldurada com respiro, legenda abaixo ----
    function drawPolaroid(w, h, data) {
      ctx.fillStyle = '#131826';
      ctx.fillRect(0, 0, w, h);
      drawWatermark(w, h);

      const pad = w * 0.06;
      const frameY = h * 0.11;
      const frameH = h * 0.52;
      const frameW = w - pad * 2;
      const scale = Math.max(frameW / img.width, frameH / img.height);
      const iw = img.width * scale, ih = img.height * scale;

      ctx.save();
      roundRect(ctx, pad, frameY, frameW, frameH, w * 0.015);
      ctx.clip();
      ctx.drawImage(img, pad - (iw - frameW) / 2, frameY - (ih - frameH) / 2, iw, ih);
      ctx.restore();

      let y = frameY + frameH + w * 0.08;
      ctx.fillStyle = '#e8935a';
      ctx.font = `600 ${Math.round(w * 0.024)}px monospace`;
      ctx.fillText(obj.catalog, pad, y);
      y += w * 0.05;

      ctx.fillStyle = '#e8eaed';
      ctx.font = `700 ${Math.round(w * 0.05)}px Arial`;
      ctx.fillText(obj.commonName, pad, y);
      y += w * 0.045;

      ctx.fillStyle = '#8b93a7';
      ctx.font = `${Math.round(w * 0.022)}px monospace`;
      ctx.fillText([data.statsLine1, photo.location].filter(Boolean).join(' · '), pad, y);
      y += w * 0.055;

      drawHandleFooter(pad, y, w - pad * 2, w);
    }

    // ---- Layout 3: Telemetria — foto contida no topo, painel de dados tipo ficha técnica ----
    function drawTelemetria(w, h, data) {
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, w, h);
      drawWatermark(w, h);

      const pad = w * 0.06;
      const frameY = h * 0.09;
      const frameH = h * 0.34;
      const frameW = w - pad * 2;
      const scale = Math.min(frameW / img.width, frameH / img.height);
      const iw = img.width * scale, ih = img.height * scale;

      ctx.save();
      roundRect(ctx, pad, frameY, frameW, frameH, w * 0.015);
      ctx.clip();
      ctx.fillStyle = '#131826';
      ctx.fillRect(pad, frameY, frameW, frameH);
      ctx.drawImage(img, pad + (frameW - iw) / 2, frameY + (frameH - ih) / 2, iw, ih);
      ctx.restore();

      let y = frameY + frameH + w * 0.07;
      ctx.fillStyle = '#e8eaed';
      ctx.font = `700 ${Math.round(w * 0.05)}px Arial`;
      ctx.fillText(obj.commonName, pad, y);
      y += w * 0.035;
      ctx.fillStyle = '#e8935a';
      ctx.font = `${Math.round(w * 0.022)}px monospace`;
      ctx.fillText(obj.catalog, pad, y);
      y += w * 0.05;

      const moon = window.Moon.phaseForDate(new Date(photo.captureDate));
      const grid = [
        ['EXPOSIÇÃO', photo.exposureSeconds ? formatExposure(photo.exposureSeconds) : '—'],
        ['FRAMES', photo.frames ? `${photo.frames} × ${photo.secondsPerFrame}s` : '—'],
        ['LOCAL', photo.location || '—'],
        ['LUA', `${moon.illumination}%`],
      ];
      const gridW = w - pad * 2, gridH = h * 0.17, colW = gridW / 2;
      ctx.fillStyle = '#131826';
      roundRect(ctx, pad, y, gridW, gridH, w * 0.015);
      ctx.fill();
      ctx.strokeStyle = 'rgba(139,147,167,0.16)';
      roundRect(ctx, pad, y, gridW, gridH, w * 0.015);
      ctx.stroke();

      grid.forEach(([label, value], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const cx = pad + w * 0.03 + col * colW;
        const cy = y + gridH * 0.32 + row * gridH * 0.48;
        ctx.fillStyle = '#5a6178';
        ctx.font = `${Math.round(w * 0.015)}px monospace`;
        ctx.fillText(label, cx, cy);
        ctx.fillStyle = '#e8eaed';
        ctx.font = `600 ${Math.round(w * 0.021)}px monospace`;
        ctx.fillText(value, cx, cy + w * 0.032);
      });

      ctx.fillStyle = '#5ec8d8';
      ctx.font = `600 ${Math.round(w * 0.022)}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(INSTAGRAM_HANDLE, w - pad, h - pad * 0.6);
      ctx.textAlign = 'left';
    }

    function draw() {
      const { w, h } = IG_FORMATS[format];
      canvas.width = w;
      canvas.height = h;
      const data = commonData();

      if (layout === 'polaroid') drawPolaroid(w, h, data);
      else if (layout === 'telemetria') drawTelemetria(w, h, data);
      else {
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, w, h);
        drawWatermark(w, h);
        drawClassico(w, h, data);
      }
    }

    function roundRect(context, x, y, width, height, r) {
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + width, y, x + width, y + height, r);
      context.arcTo(x + width, y + height, x, y + height, r);
      context.arcTo(x, y + height, x, y, r);
      context.arcTo(x, y, x + width, y, r);
      context.closePath();
    }

    img.onload = draw;

    document.querySelectorAll('.ig-format-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        format = btn.dataset.format;
        draw();
      });
    });
    document.querySelectorAll('.ig-layout-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        layout = btn.dataset.layout;
        draw();
      });
    });

    document.getElementById('btn-cancel-ig').addEventListener('click', closeModal);
    document.getElementById('ig-export-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'ig-export-overlay') closeModal();
    });
    document.getElementById('btn-download-ig').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${obj.id}_${layout}_${IG_FORMATS[format].label.replace(':', 'x')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
  }

  // ---------- Modal de detalhe (crop já pronto, vinculado a uma foto existente) ----------

  function openDetailUploadForm({ file, parentPhoto, onSubmit, onCancel }) {
    const previewUrl = URL.createObjectURL(file);

    modalRoot().innerHTML = `
      <div class="modal-overlay" id="detail-upload-overlay">
        <div class="modal">
          <h2 class="modal__title">Adicionar detalhe</h2>
          <p class="hint" style="margin-bottom:16px;">Recorte de ${formatDate(parentPhoto.captureDate)} — não conta como sessão nova nem soma exposição.</p>
          <img src="${previewUrl}" style="width:100%;border-radius:8px;margin-bottom:16px;display:block;" />
          <div class="form-field">
            <label>Notas (opcional)</label>
            <textarea id="detail-field-notes" rows="2" placeholder="ex: close no pilar central"></textarea>
          </div>
          <div class="modal__actions">
            <button class="btn-secondary" id="btn-cancel-detail">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-detail" style="margin-left:0;">Salvar detalhe</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-cancel-detail').addEventListener('click', () => { closeModal(); if (onCancel) onCancel(); });
    document.getElementById('detail-upload-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'detail-upload-overlay') { closeModal(); if (onCancel) onCancel(); }
    });
    document.getElementById('btn-confirm-detail').addEventListener('click', async () => {
      const notes = document.getElementById('detail-field-notes').value.trim();
      closeModal();
      await onSubmit({ notes });
    });
  }

  // ---------- Modal de registro de sessão (sem foto, só pra preencher a barra) ----------

  function openSessionForm({ objectId, objectsList, onSubmit, defaultLocation }) {
    const dateValue = new Date().toISOString().slice(0, 10);

    modalRoot().innerHTML = `
      <div class="modal-overlay" id="session-overlay">
        <div class="modal">
          <h2 class="modal__title">Registrar sessão</h2>
          <p class="hint" style="margin-bottom:16px;">Sem foto ainda? Registra os frames que você já capturou pra já contar na meta de integração.</p>

          <div class="form-field">
            <label>Objeto</label>
            <select id="session-field-object">
              ${(objectsList || []).map((o) => `<option value="${o.id}" ${o.id === objectId ? 'selected' : ''}>${escapeHtml(o.catalog)} — ${escapeHtml(o.commonName)}</option>`).join('')}
            </select>
          </div>

          <div class="form-field">
            <label>Data da sessão</label>
            <input type="date" id="session-field-date" value="${dateValue}" />
          </div>

          <div class="form-field form-field--row">
            <div>
              <label>Frames</label>
              <input type="number" id="session-field-frames" min="0" step="1" placeholder="ex: 60" />
            </div>
            <div>
              <label>Segundos/frame</label>
              <input type="number" id="session-field-seconds" min="0" step="1" placeholder="ex: 10" />
            </div>
          </div>
          <div class="form-field__computed" id="session-exposure-computed">= 0min de exposição total</div>

          <div class="form-field">
            <label>Local</label>
            <input type="text" id="session-field-location" placeholder="ex: São Paulo, SP" value="${escapeHtml(defaultLocation || '')}" />
          </div>

          <div class="form-field">
            <label>Notas</label>
            <textarea id="session-field-notes" rows="2" placeholder="condições do céu, filtro usado, etc."></textarea>
          </div>

          <div class="modal__actions">
            <button class="btn-secondary" id="btn-cancel-session">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-session" style="margin-left:0;">Registrar</button>
          </div>
        </div>
      </div>`;

    const framesInput = document.getElementById('session-field-frames');
    const secondsInput = document.getElementById('session-field-seconds');
    const computedEl = document.getElementById('session-exposure-computed');

    function updateComputed() {
      const frames = parseFloat(framesInput.value || '0');
      const seconds = parseFloat(secondsInput.value || '0');
      const totalSeconds = frames * seconds;
      computedEl.textContent = `= ${formatExposure(totalSeconds) === '—' ? '0min' : formatExposure(totalSeconds)} de exposição total`;
    }
    framesInput.addEventListener('input', updateComputed);
    secondsInput.addEventListener('input', updateComputed);

    document.getElementById('btn-cancel-session').addEventListener('click', closeModal);

    document.getElementById('btn-confirm-session').addEventListener('click', async () => {
      const frames = parseFloat(framesInput.value || '0');
      const secondsPerFrame = parseFloat(secondsInput.value || '0');

      if (!frames || !secondsPerFrame) {
        alert('Preenche frames e segundos por frame.');
        return;
      }

      const formData = {
        objectId: document.getElementById('session-field-object').value,
        isNewObject: false,
        captureDate: document.getElementById('session-field-date').value,
        exposureSeconds: frames * secondsPerFrame,
        frames,
        secondsPerFrame,
        location: document.getElementById('session-field-location').value.trim(),
        notes: document.getElementById('session-field-notes').value.trim(),
      };

      closeModal();
      await onSubmit(formData);
    });
  }

  return {
    renderCatalogGrid,
    renderObjectDetail,
    renderLocationWidget,
    openLocationManager,
    renderCoveragePanel,
    wireCoveragePanel,
    renderYearlyDashboard,
    renderLandscapeGallery,
    openUploadForm,
    openDetailUploadForm,
    openEditPhotoForm,
    openSessionForm,
    openAddObjectForm,
    renderAtlasSuggestions,
    wireAtlasSuggestions,
    closeModal,
    formatDate,
    formatExposure,
  };
})();
