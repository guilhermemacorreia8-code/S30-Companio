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
    const { target, matchedObject, accumulatedSeconds } = item;
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
        const photosWithImage = photos.filter((p) => p.objectUrl);
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
              ${cover ? `<img src="${cover.objectUrl}" alt="${escapeHtml(obj.commonName)}" loading="lazy" />` : 'SEM FOTO AINDA'}

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
    const totalExposure = photos.reduce((acc, p) => acc + (p.exposureSeconds || 0), 0);
    const target = window.Catalog.getExposureTarget(obj);
    const isSolarSystemBody = obj.type === 'planeta';

    const dataRows = isSolarSystemBody
      ? [
          ['MAGNITUDE', obj.magnitude ?? '—'],
          ['SESSÕES', photos.length],
          ['EXPOSIÇÃO TOTAL', formatExposure(totalExposure)],
        ]
      : [
          ['RA (J2000)', obj.ra],
          ['DEC (J2000)', obj.dec],
          ['CONSTELAÇÃO', obj.constellation],
          ['TAMANHO', obj.sizeArcmin ? `${obj.sizeArcmin}′` : '—'],
          ['MAGNITUDE', obj.magnitude ?? '—'],
          ['FILTRO RECOMENDADO', target.filter],
          ['SESSÕES', photos.length],
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
            ${photos.length ? `<div class="panel__subtitle">Contribuição por sessão</div>${renderSessionChart(photos)}` : ''}
          </div>
        </div>

        ${photos.length >= 2 ? renderComparePanel(photos) : ''}

        <div class="panel">
          <div class="panel__title">Linha do tempo (${photos.length})</div>
          ${photos.length ? renderTimeline(photos) : '<p style="color:var(--ink-dim); font-size:13px;">Nenhuma foto ainda.</p>'}
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

    if (photos.length >= 2) wireCompare(photos);
    wireTimeline(photos, handlers.onSetCover, handlers.onEdit);
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
          <img class="compare__before" id="compare-before-img" src="${first.objectUrl}" alt="antes" />
          <img class="compare__after" id="compare-after-img" src="${last.objectUrl}" alt="depois" />
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

  function renderTimeline(photos) {
    return `
      <div class="timeline">
        <div class="timeline__line"></div>
        ${photos.map((p, i) => {
          const moon = window.Moon.phaseForDate(new Date(p.captureDate));
          return `
          <div class="timeline-item" data-photo-index="${i}" tabindex="0" role="button">
            <div class="timeline-item__dot"></div>
            <div class="timeline-item__frame">
              ${p.objectUrl
                ? `<img src="${p.objectUrl}" alt="${formatDate(p.captureDate)}" loading="lazy" />`
                : `<div class="timeline-item__placeholder">Sem foto<br />só sessão</div>`}
              ${p.exposureSeconds ? `<span class="timeline-item__exposure">${formatExposure(p.exposureSeconds)}</span>` : ''}
              ${p.objectUrl ? `<button class="timeline-item__star ${p.isCover ? 'is-cover' : ''}" data-star-index="${i}" title="Definir como capa do alvo" aria-label="Definir como capa">★</button>` : ''}
            </div>
            <div class="timeline-item__date">${formatDate(p.captureDate)}</div>
            <div class="timeline-item__moon">🌙 ${moon.illumination}%</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function wireTimeline(photos, onSetCover, onEdit) {
    document.querySelectorAll('.timeline-item').forEach((el) => {
      const open = () => openLightbox(photos, Number(el.dataset.photoIndex), onEdit);
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
  }

  // ---------- Lightbox (visualização ampliada) ----------

  function openLightbox(photos, index, onEdit) {
    let current = index;

    function render() {
      const p = photos[current];
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
                    ${p.exposureSeconds ? `${p.frames ? `${p.frames} frames × ${p.secondsPerFrame}s = ` : ''}${formatExposure(p.exposureSeconds)}` : 'exposição não informada'}
                    ${p.location ? ` · ${escapeHtml(p.location)}` : ''}
                    · lua ${moon.illumination}% (${moon.phaseName})
                  </div>
                  ${techBits ? `<div class="lightbox-caption__meta">${escapeHtml(techBits)}</div>` : ''}
                  ${p.notes ? `<div class="lightbox-caption__notes">${escapeHtml(p.notes)}</div>` : ''}
                </div>
                <button class="lightbox-edit" id="lightbox-edit" title="Editar metadados">✏ Editar</button><button class="lightbox-delete" id="lightbox-delete" title="Deletar esta foto">🗑</button>  
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
             document.getElementById('lightbox-delete').addEventListener('click', function(e) {
          e.stopPropagation();
          if (confirm('Deletar esta foto? Não pode ser desfeito.')) {
            if (onDelete) onDelete(photos[current].id);
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
    // garante que o listener de teclado é removido ao fechar
    window.__lightboxKeydownCleanup = () => document.removeEventListener('keydown', onKeydown);
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
      beforeImg.src = p.objectUrl;
      labelBefore.textContent = formatDate(p.captureDate);
    });
    selAfter.addEventListener('change', () => {
      const p = findPhoto(selAfter.value);
      afterImg.src = p.objectUrl;
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
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          <div class="form-field">
            <label>Data da captura</label>
            <input type="date" id="field-date" value="${dateValue}" />
            <div class="hint">${exif.dateTimeOriginal ? 'Extraído do EXIF automaticamente' : 'Não encontrado no EXIF — confirme a data'}</div>
          </div>

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

    document.getElementById('btn-cancel-upload').addEventListener('click', () => {
      closeModal();
      URL.revokeObjectURL(previewUrl);
      if (onCancel) onCancel();
    });

    document.getElementById('btn-confirm-upload').addEventListener('click', async () => {
      const isNewObject = selectObj.value === '__new__';
      const frames = parseFloat(framesInput.value || '0');
      const secondsPerFrame = parseFloat(secondsInput.value || '0');
      const exposureSeconds = frames && secondsPerFrame ? frames * secondsPerFrame : null;

      const formData = {
        objectId: isNewObject ? null : selectObj.value,
        isNewObject,
        newObjectName: document.getElementById('field-new-name').value.trim(),
        newObjectType: document.getElementById('field-new-type').value,
        captureDate: document.getElementById('field-date').value,
        exposureSeconds,
        frames: frames || null,
        secondsPerFrame: secondsPerFrame || null,
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

    document.getElementById('btn-cancel-edit').addEventListener('click', closeModal);
    document.getElementById('edit-photo-overlay').addEventListener('click', e => {
      if (e.target.id === 'edit-photo-overlay') closeModal();
    });

    document.getElementById('btn-confirm-edit').addEventListener('click', async () => {
      const f   = parseFloat(framesInput.value || '0');
      const spf = parseFloat(spfInput.value || '0');
      const fields = {
        objectId:        document.getElementById('edit-field-object').value,
        captureDate:     new Date(document.getElementById('edit-field-date').value).toISOString(),
        frames:          f || null,
        secondsPerFrame: spf || null,
        exposureSeconds: (f && spf) ? f * spf : photo.exposureSeconds,
        location:        document.getElementById('edit-field-location').value.trim() || null,
        filterUsed:      document.getElementById('edit-field-filter').value || null,
        gain:            document.getElementById('edit-field-gain').value ? parseInt(document.getElementById('edit-field-gain').value) : null,
        captureSoftware: document.getElementById('edit-field-software').value.trim() || null,
        dither:          document.getElementById('edit-field-dither').checked,
        notes:           document.getElementById('edit-field-notes').value.trim(),
      };
      closeModal();
      await onSubmit(photo.id, fields);
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
    openUploadForm,
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
