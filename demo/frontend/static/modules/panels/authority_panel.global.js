(function attachDDPAuthorityPanel(global) {
  function createAuthorityPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
      ensureAuthorityLayerLoaded,
      ensureAuthorityPersonaggioScanLoaded,
      ensureAuthorityPersonaggioAliasAtlasLoaded,
      ensureAuthorityPersonaggioPoemAliasScanLoaded,
      ensureAuthorityCuratedRoomAnchorsLoaded,
      ensureVirgilioAppendixLedgerLoaded,
      bindScholarLensEvents,
      getAuthorityAuthors,
      renderAuthorityLensMarkup,
    } = deps;

    function extractLeadingLineNumber(value) {
      const match = String(value || "").match(/\d+/);
      return match ? Number(match[0]) : null;
    }

    function formatCompactCommediaLocation(example) {
      const canticaRaw = String(example?.cantica || "").trim().toLowerCase();
      const canticaMap = {
        inferno: "Inf",
        purgatorio: "Purg",
        paradiso: "Par",
      };
      const cantica = canticaMap[canticaRaw] || String(example?.cantica || "").trim();
      const canto = Number(example?.canto);
      const line = Number(example?.line_number);
      if (cantica && Number.isFinite(canto) && Number.isFinite(line)) {
        return `${cantica} ${canto}, ${line}`;
      }
      return String(example?.line_text || "").trim();
    }

    function normalizeFigureBandKey(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    function normalizeFigureFilterLabel(value) {
      return String(value || "").trim().toLowerCase();
    }

    function getAllPersonaggioRows(scan) {
      const authorRows = Array.isArray(scan?.autore_personaggio_rows)
        ? scan.autore_personaggio_rows
        : (Array.isArray(scan?.autore_personaggi)
        ? scan.autore_personaggi
        : (Array.isArray(scan?.author_personaggi) ? scan.author_personaggi : []));
      const standaloneRows = Array.isArray(scan?.standalone_personaggi) ? scan.standalone_personaggi : [];
      const allRows = [...authorRows, ...standaloneRows];
      const preferredNames = Array.isArray(scan?.recommended_first_personaggi)
        ? scan.recommended_first_personaggi
        : [];
      if (!preferredNames.length) {
        return allRows;
      }
      const rowMap = new Map(allRows.map((row) => [String(row.display_name || "").trim(), row]));
      return preferredNames
        .map((name) => rowMap.get(String(name || "").trim()))
        .filter(Boolean);
    }

    function getFigurePoemAliasTerms(entries = []) {
      return (entries || [])
        .map((item) => String(item?.term || item || "").trim())
        .filter(Boolean);
    }

    function filterFigureExamplesByLabel(examples = [], label = "", chooseText) {
      const normalizedLabel = normalizeFigureFilterLabel(label);
      return (examples || [])
        .filter((item) => {
          const haystack = [
            item?.excerpt,
            item?.surface,
            item?.commentary_name,
          ].filter(Boolean).join(" ").toLowerCase();
          return normalizedLabel && haystack.includes(normalizedLabel);
        })
        .slice(0, 12)
        .map((item) => {
          const lineNumber = extractLeadingLineNumber(item.line_info);
          return {
            sampleId: item.sample_name || "",
            lineNumber,
            title: `${item.commentary_name || chooseText("Commentary witness", "注释见证")} · ${item.line_info || item.sample_name || ""}`,
            text: item.excerpt || item.surface || chooseText("Open this witness.", "打开这个见证。"),
          };
        });
    }

    function buildRowsFromPoemAliasEntry(entry) {
      const sourceRows = Array.isArray(entry?.all_occurrences) && entry.all_occurrences.length
        ? entry.all_occurrences
        : (Array.isArray(entry?.sample_occurrences) ? entry.sample_occurrences : []);
      return sourceRows
        .slice(0, 80)
        .map((example) => {
          const lineNumber = Number(example?.line_number);
          const sampleId = String(example?.cantica || "").trim() && Number.isFinite(example?.canto)
            ? `${String(example.cantica).toLowerCase()}${example.canto}`
            : "";
          return {
            sampleId,
            lineNumber,
            title: formatCompactCommediaLocation(example),
            text: example?.line_text || "",
            highlightTerm: String(entry?.term || entry?.label || entry?.source_term || "").trim(),
          };
        });
    }

    function escapeRegExp(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function renderOccurrenceLineHtml(line, highlightTerm) {
      const text = String(line || "");
      const term = String(highlightTerm || "").trim();
      if (!term) {
        return escapeHtml(text);
      }
      const pattern = new RegExp(escapeRegExp(term), "ig");
      let cursor = 0;
      let output = "";
      let match = pattern.exec(text);
      while (match) {
        output += escapeHtml(text.slice(cursor, match.index));
        output += `<mark class="figure-inline-hit">${escapeHtml(match[0])}</mark>`;
        cursor = match.index + match[0].length;
        match = pattern.exec(text);
      }
      output += escapeHtml(text.slice(cursor));
      return output;
    }

    function getFilteredFigureOccurrenceRows(personaggioRow, authorityAuthor, poemAliasRow, chooseText) {
      const activeBandKey = String(state.activeFigureFilterBandKey || "");
      const activeLabel = String(state.activeFigureFilterLabel || "").trim();
      if (!activeBandKey || !activeLabel) {
        return null;
      }

      if (activeBandKey === "poem_exact_aliases") {
        const entry = (poemAliasRow?.poem_layer_exact_aliases || [])
          .find((item) => normalizeFigureFilterLabel(item?.term) === normalizeFigureFilterLabel(activeLabel));
        return entry ? buildRowsFromPoemAliasEntry(entry) : [];
      }

      if (activeBandKey === "poem_role_cues") {
        const entry = (poemAliasRow?.poem_layer_role_cues || [])
          .find((item) => normalizeFigureFilterLabel(item?.term) === normalizeFigureFilterLabel(activeLabel));
        return entry ? buildRowsFromPoemAliasEntry(entry) : [];
      }

      if (activeBandKey === "commentary_aliases") {
        const normalizedLabel = normalizeFigureFilterLabel(activeLabel);
        const authorityRows = Array.isArray(authorityAuthor?.occurrences) ? authorityAuthor.occurrences : [];
        const filteredAuthorityRows = authorityRows
          .filter((item) => {
            const haystack = [
              item?.raw_mention,
              item?.raw_passage,
              item?.author,
              item?.work,
            ].filter(Boolean).join(" ").toLowerCase();
            return normalizedLabel && haystack.includes(normalizedLabel);
          })
          .slice(0, 12)
          .map((item) => ({
            sampleId: item.sample_name || item.jump_target?.sample_id || "",
            lineNumber: Number(item.line_number || item.jump_target?.line_number || 0),
            title: `${item.commentary_name || chooseText("Commentary witness", "注释见证")} · ${item.line_info || item.canto_label || item.sample_name || ""}`,
            text: item.raw_mention || item.raw_passage || chooseText("Open this commentary occurrence.", "打开这条注释命中。"),
            highlightTerm: activeLabel,
          }));
        if (filteredAuthorityRows.length) {
          return filteredAuthorityRows;
        }
        if (authorityRows.length) {
          return authorityRows.slice(0, 12).map((item) => ({
            sampleId: item.sample_name || item.jump_target?.sample_id || "",
            lineNumber: Number(item.line_number || item.jump_target?.line_number || 0),
            title: `${item.commentary_name || chooseText("Commentary witness", "注释见证")} · ${item.line_info || item.canto_label || item.sample_name || ""}`,
            text: item.raw_mention || item.raw_passage || chooseText("Open this commentary occurrence.", "打开这条注释命中。"),
            highlightTerm: activeLabel,
          }));
        }
        const filteredExamples = filterFigureExamplesByLabel(personaggioRow?.examples || [], activeLabel, chooseText);
        return filteredExamples.length ? filteredExamples : filterFigureExamplesByLabel(personaggioRow?.examples || [], personaggioRow?.display_name || "", chooseText);
      }

      return null;
    }

    function findAuthorityAuthorForFigure(personaggioRow) {
      if (!personaggioRow || !Array.isArray(state.authorityLayer?.authors)) {
        return null;
      }
      const bySlug = String(personaggioRow.page_slug || personaggioRow.public_slug_it || "").trim();
      const byAuthorId = String(personaggioRow.author_id || "").trim();
      return state.authorityLayer.authors.find((author) => {
        const authorSlug = String(author?.public_slug_it || "").trim();
        const authorId = String(author?.author_id || "").trim();
        return (bySlug && authorSlug === bySlug) || (byAuthorId && authorId === byAuthorId);
      }) || null;
    }

    function getFigureDensityItems(personaggioRow, authorityAuthor) {
      const textHits = Array.isArray(authorityAuthor?.text_occurrences_by_canto)
        ? authorityAuthor.text_occurrences_by_canto.slice(0, 6).map((item) => ({
          label: `${item.canto_label || item.sample_name}: ${item.occurrence_count || 0}`,
          active: false,
        }))
        : [];
      if (textHits.length) {
        return textHits;
      }
      const examples = Array.isArray(personaggioRow?.examples) ? personaggioRow.examples : [];
      const counts = new Map();
      examples.forEach((item) => {
        const key = String(item.sample_name || "").trim();
        if (!key) {
          return;
        }
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      return [...counts.entries()]
        .slice(0, 6)
        .map(([sampleName, count]) => ({
          label: `${sampleName}: ${count}`,
          active: false,
        }));
    }

    function renderDensityPills(items) {
      return (items || [])
        .map((item) => `<span class="pill${item.active ? " is-active" : ""}">${escapeHtml(item.label)}</span>`)
        .join("");
    }

    function getFigureOccurrenceRows(personaggioRow, authorityAuthor, chooseText) {
      const textRows = Array.isArray(authorityAuthor?.text_occurrences_by_canto)
        ? authorityAuthor.text_occurrences_by_canto.slice(0, 8).map((item) => {
          const firstLine = Array.isArray(item.line_occurrences) ? item.line_occurrences[0] : null;
          const lineNumber = Number(item.jump_line_number || firstLine?.line_number || 0);
          const sampleId = item.sample_id || item.sample_name;
          return {
            sampleId,
            lineNumber,
            title: formatCompactCommediaLocation({
              cantica: item.cantica,
              canto: item.canto,
              line_number: lineNumber,
            }),
            text: firstLine?.line_text || chooseText("Open this canto-level personaggio hit.", "打开这个角色在正文里的命中。"),
          };
        })
        : [];
      if (textRows.length) {
        return textRows;
      }
      return (Array.isArray(personaggioRow?.examples) ? personaggioRow.examples : [])
        .slice(0, 8)
        .map((item) => {
          const lineNumber = extractLeadingLineNumber(item.line_info);
          return {
            sampleId: item.sample_name || "",
            lineNumber,
            title: `${item.commentary_name || chooseText("Commentary witness", "注释见证")} · ${item.line_info || item.sample_name || ""}`,
            text: item.excerpt || item.surface || chooseText("Open this witness.", "打开这个见证。"),
          };
        });
    }

    function renderOccurrenceRows(items, chooseText) {
      if (!items.length) {
        return `<div class="empty-state">${escapeHtml(chooseText("This personaggio does not yet expose a readable local path through the mounted samples.", "当前这个 personaggio 还没有接到可读的 sample 入口。"))}</div>`;
      }
      return items
        .map((item) => {
          const title = escapeHtml(item.title || "");
          const lines = [item.text, item.secondaryText].filter(Boolean);
          const highlightTerm = String(item.highlightTerm || "").trim();
          const highlightedBody = lines.map((line) => `<span>${renderOccurrenceLineHtml(line, highlightTerm)}</span>`).join("");
          if (item.sampleId && Number.isFinite(item.lineNumber) && item.lineNumber > 0) {
            return `
              <button type="button" class="occurrence-row" data-occurrence-sample="${escapeHtml(item.sampleId)}" data-occurrence-line="${item.lineNumber}">
                <strong>${title}</strong>
                ${highlightedBody}
              </button>
            `;
          }
          return `
            <div class="occurrence-row is-static">
              <strong>${title}</strong>
              ${highlightedBody}
            </div>
          `;
        })
        .join("");
    }

    function renderSimpleAliasSection(title, intro, items, options = {}) {
      if (!Array.isArray(items) || !items.length) {
        return "";
      }
      const {
        href = "",
        filterBandKey = "",
      } = options;
      const pills = items
        .map((item) => {
          const label = escapeHtml(item);
          const normalizedLabel = normalizeFigureFilterLabel(item);
          const isActive = normalizeFigureBandKey(filterBandKey) === String(state.activeFigureFilterBandKey || "")
            && normalizedLabel === normalizeFigureFilterLabel(state.activeFigureFilterLabel);
          if (filterBandKey) {
            return `<button type="button" class="pill pill-button ${isActive ? "is-active" : ""}" data-figure-filter-band="${escapeHtml(filterBandKey)}" data-figure-filter-label="${escapeHtml(item)}">${label}</button>`;
          }
          if (href) {
            return `<a class="pill pill-button" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
          }
          return `<span class="pill">${label}</span>`;
        })
        .join("");
      return `
        <section class="figure-band-block">
          <h4>${escapeHtml(title)}</h4>
          ${intro ? `<p class="semantic-intro">${escapeHtml(intro)}</p>` : ""}
          <div class="locus-meta-row">${pills}</div>
        </section>
      `;
    }

    function renderBandItemPills(items, bandKey) {
      return items
        .map((item) => {
          const rawLabel = item.label || item.source_term || "";
          const label = escapeHtml(rawLabel);
          const isActive = normalizeFigureBandKey(bandKey) === String(state.activeFigureFilterBandKey || "")
            && normalizeFigureFilterLabel(rawLabel) === normalizeFigureFilterLabel(state.activeFigureFilterLabel);
          if (rawLabel) {
            return `<button type="button" class="pill pill-button ${isActive ? "is-active" : ""}" data-figure-filter-band="${escapeHtml(bandKey)}" data-figure-filter-label="${escapeHtml(rawLabel)}">${label}</button>`;
          }
          return `<span class="pill">${label}</span>`;
        })
        .join("");
    }

    function renderBandDetails(bands, chooseTitleKey, chooseIntroKey, options = {}) {
      if (!Array.isArray(bands) || !bands.length) {
        return "";
      }
      const selectedFigureSlug = String(options.selectedFigureSlug || "").trim();
      const activeBandKey = normalizeFigureBandKey(state.activeFigureFilterBandKey || "");
      const activeLabel = normalizeFigureFilterLabel(state.activeFigureFilterLabel);
      return `
        <div class="figure-band-list">
          ${bands.map((band) => {
            const title = band?.[chooseTitleKey] || band?.title_en || band?.key || "Band";
            const intro = band?.[chooseIntroKey] || band?.intro_en || "";
            const items = Array.isArray(band?.items) ? band.items : [];
            const bandKey = normalizeFigureBandKey(band?.key || title);
            const activeItemLabel = bandKey === activeBandKey
              ? normalizeFigureFilterLabel(state.activeFigureFilterLabel)
              : "";
            const isVirgilioLemmaTree = selectedFigureSlug === "virgilio"
              && ["phrase_expansions", "frasal_apostrophes_periphrases"].includes(bandKey)
              && activeBandKey === "single_words"
              && activeLabel;
            const visibleItems = isVirgilioLemmaTree
              ? items.filter((item) => normalizeFigureFilterLabel(item.source_term || "") === activeLabel)
              : (activeItemLabel
                  ? items.filter((item) => normalizeFigureFilterLabel(item.label || item.source_term || "") === activeItemLabel)
                  : items);
            const itemPills = renderBandItemPills(isVirgilioLemmaTree ? visibleItems : items, bandKey);
            const examples = activeItemLabel
              ? visibleItems.flatMap((item) => {
                  const rawExamples = Array.isArray(item.all_occurrences) && item.all_occurrences.length
                    ? item.all_occurrences
                    : (Array.isArray(item.examples) ? item.examples : []);
                  return rawExamples.map((example) => {
                    const lineNumber = Number(example?.line_number);
                    const sampleId = String(example?.cantica || "").trim() && Number.isFinite(example?.canto)
                      ? `${String(example.cantica).toLowerCase()}${example.canto}`
                      : "";
                    const titleLabel = formatCompactCommediaLocation(example);
                    const body = [example?.line_text]
                      .filter(Boolean)
                      .map((line) => `<span>${renderOccurrenceLineHtml(line, item.label || item.source_term || "")}</span>`)
                      .join("");
                    if (sampleId && Number.isFinite(lineNumber) && lineNumber > 0) {
                      return `
                        <button type="button" class="occurrence-row" data-occurrence-sample="${escapeHtml(sampleId)}" data-occurrence-line="${lineNumber}">
                          <strong>${escapeHtml(titleLabel)}</strong>
                          ${body}
                        </button>
                      `;
                    }
                    return `
                      <div class="occurrence-row is-static">
                        <strong>${escapeHtml(titleLabel)}</strong>
                        ${body}
                      </div>
                    `;
                  });
                }).join("")
              : isVirgilioLemmaTree
                ? visibleItems
                    .map((item) => {
                      const itemExamples = Array.isArray(item.examples) ? item.examples.slice(0, 2) : [];
                      const firstExample = itemExamples[0] || null;
                      if (!firstExample) {
                        return "";
                      }
                      const secondExample = itemExamples[1] || null;
                      const lineNumber = Number(firstExample?.line_number);
                      const sampleId = String(firstExample?.cantica || "").trim() && Number.isFinite(firstExample?.canto)
                        ? `${String(firstExample.cantica).toLowerCase()}${firstExample.canto}`
                        : "";
                      const titleLabel = formatCompactCommediaLocation(firstExample);
                      const body = [firstExample?.line_text, secondExample?.line_text]
                        .filter(Boolean)
                        .map((line) => `<span>${renderOccurrenceLineHtml(line, item.label || "")}</span>`)
                        .join("");
                      if (sampleId && Number.isFinite(lineNumber) && lineNumber > 0) {
                        return `
                          <button type="button" class="occurrence-row" data-occurrence-sample="${escapeHtml(sampleId)}" data-occurrence-line="${lineNumber}">
                            <strong>${escapeHtml(titleLabel)}</strong>
                            ${body}
                          </button>
                        `;
                      }
                      return `
                        <div class="occurrence-row is-static">
                          <strong>${escapeHtml(titleLabel)}</strong>
                          ${body}
                        </div>
                      `;
                    })
                    .join("")
              : items
                  .slice(0, 3)
                  .map((item) => {
                    const itemExamples = Array.isArray(item.examples) ? item.examples.slice(0, 2) : [];
                    const firstExample = itemExamples[0] || null;
                    if (!firstExample) {
                      return "";
                    }
                    const secondExample = itemExamples[1] || null;
                    const lineNumber = Number(firstExample?.line_number);
                    const sampleId = String(firstExample?.cantica || "").trim() && Number.isFinite(firstExample?.canto)
                      ? `${String(firstExample.cantica).toLowerCase()}${firstExample.canto}`
                      : "";
                    const titleLabel = formatCompactCommediaLocation(firstExample);
                    const body = [firstExample?.line_text, secondExample?.line_text]
                      .filter(Boolean)
                      .map((line) => `<span>${renderOccurrenceLineHtml(line, item.label || "")}</span>`)
                      .join("");
                    if (sampleId && Number.isFinite(lineNumber) && lineNumber > 0) {
                      return `
                        <button type="button" class="occurrence-row" data-occurrence-sample="${escapeHtml(sampleId)}" data-occurrence-line="${lineNumber}">
                          <strong>${escapeHtml(titleLabel)}</strong>
                          ${body}
                        </button>
                      `;
                    }
                    return `
                      <div class="occurrence-row is-static">
                        <strong>${escapeHtml(titleLabel)}</strong>
                        ${body}
                      </div>
                    `;
                  })
                  .join("");
            return `
              <details class="figure-band" data-figure-band-panel="${escapeHtml(bandKey)}" open>
                <summary>${escapeHtml(title)} (${items.length})</summary>
                ${intro ? `<p class="semantic-intro">${escapeHtml(intro)}</p>` : ""}
                ${itemPills ? `<div class="locus-meta-row">${itemPills}</div>` : ""}
                ${examples ? `<div class="occurrence-list">${examples}</div>` : ""}
              </details>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderVirgilioLedgerSummary(ledger, chooseText) {
      return "";
    }

    function renderFigurePanel() {
      const isEnglish = state.uiLanguage === "en";
      const chooseText = (en, zh) => (isEnglish ? en : zh);
      const tabs = `
        <div class="lens-tab-row">
          <button type="button" class="lens-tab ${state.activeScholarTab === "figure" ? "is-active" : ""}" data-lens-tab="figure">Figure Navigation</button>
          <button type="button" class="lens-tab ${state.activeScholarTab === "authority" ? "is-active" : ""}" data-lens-tab="authority">Authority Lens</button>
        </div>
      `;

      if (state.activeScholarTab === "authority") {
        const needsAuthorityLayer = !state.authorityLayer;
        const needsCuratedAnchors = !state.authorityCuratedRoomAnchors;
        if (needsAuthorityLayer || needsCuratedAnchors) {
          if (state.authorityLayerPromise || state.authorityCuratedRoomAnchorsPromise) {
            elements.figurePanel.innerHTML = `${tabs}<div class="empty-state">${escapeHtml(chooseText("Loading Authority Lens data on demand.", "正在按需加载 Authority Lens 数据，请稍等。"))}</div>`;
            bindScholarLensEvents();
            return;
          }
          Promise.allSettled([
            ensureAuthorityLayerLoaded(),
            ensureAuthorityCuratedRoomAnchorsLoaded(),
          ])
            .then(() => {
              renderFigurePanel();
            })
            .catch(() => {
              renderFigurePanel();
            });
          elements.figurePanel.innerHTML = `${tabs}<div class="empty-state">${escapeHtml(chooseText("Loading Authority Lens data on demand.", "正在按需加载 Authority Lens 数据，请稍等。"))}</div>`;
          bindScholarLensEvents();
          return;
        }
        elements.figurePanel.innerHTML = `${tabs}${renderAuthorityLensMarkup()}`;
        bindScholarLensEvents();
        return;
      }

      const needsScan = !state.authorityPersonaggioScan;
      const needsAtlas = !state.authorityPersonaggioAliasAtlas;
      const needsPoemAliasScan = !state.authorityPersonaggioPoemAliasScan;
      const needsAuthority = !state.authorityLayer;
      const needsCuratedAnchors = !state.authorityCuratedRoomAnchors;
      if (needsScan || needsAtlas || needsPoemAliasScan || needsAuthority || needsCuratedAnchors) {
        const pending = [
          ensureAuthorityPersonaggioScanLoaded(),
          ensureAuthorityPersonaggioAliasAtlasLoaded(),
          ensureAuthorityPersonaggioPoemAliasScanLoaded(),
          ensureAuthorityLayerLoaded(),
          ensureAuthorityCuratedRoomAnchorsLoaded(),
        ];
        Promise.allSettled(pending)
          .then(() => {
            renderFigurePanel();
          })
          .catch(() => {
            renderFigurePanel();
          });
        elements.figurePanel.innerHTML = `${tabs}<div class="empty-state">${escapeHtml(chooseText("Loading personaggio navigation from the authority layer.", "正在从 authority layer 载入 personaggio navigation。"))}</div>`;
        bindScholarLensEvents();
        return;
      }

      const scan = state.authorityPersonaggioScan;
      const atlasRows = Array.isArray(state.authorityPersonaggioAliasAtlas?.rows)
        ? state.authorityPersonaggioAliasAtlas.rows
        : [];
      const poemAliasRows = Array.isArray(state.authorityPersonaggioPoemAliasScan?.rows)
        ? state.authorityPersonaggioPoemAliasScan.rows
        : [];
      const atlasMap = new Map(atlasRows.map((row) => [String(row.page_slug || "").trim(), row]));
      const poemAliasMap = new Map(poemAliasRows.map((row) => [String(row.page_slug || "").trim(), row]));
      const sourceFigures = getAllPersonaggioRows(scan);

      if (!sourceFigures.length) {
        elements.figurePanel.innerHTML = `${tabs}<div class="empty-state">${escapeHtml(chooseText("The current authority slice does not yet expose a front-stage personaggio navigation shell.", "当前这部分 authority layer 还没有接出可前台展开的 personaggio navigation shell。"))}</div>`;
        bindScholarLensEvents();
        return;
      }

      const defaultFigure = sourceFigures.find((figure) => figure.page_slug === "virgilio") || sourceFigures[0];
      const selectedFigure = sourceFigures.find((figure) => figure.page_slug === state.activeFigure) || defaultFigure;
      if (selectedFigure && state.activeFigure !== selectedFigure.page_slug) {
        state.activeFigure = selectedFigure.page_slug;
      }

      if (selectedFigure?.page_slug === "virgilio" && !state.virgilioAppendixLedger && !state.virgilioAppendixLedgerPromise) {
        ensureVirgilioAppendixLedgerLoaded()
          .then(() => renderFigurePanel())
          .catch(() => renderFigurePanel());
      }

      const selectedAtlas = atlasMap.get(String(selectedFigure?.page_slug || "").trim()) || null;
      const selectedPoemAliasRow = poemAliasMap.get(String(selectedFigure?.page_slug || "").trim()) || null;
      const selectedAuthor = findAuthorityAuthorForFigure(selectedFigure);
      const personaggioHref = selectedFigure?.page_slug ? `/personaggio/${selectedFigure.page_slug}.html` : "";
      const authorHref = selectedAuthor?.public_slug_it ? `/autore/${selectedAuthor.public_slug_it}.html` : "";
      const metaPills = [
        selectedFigure?.corridor_group ? { label: selectedFigure.corridor_group } : null,
        selectedFigure?.lane ? { label: selectedFigure.lane.replace(/_/g, " ") } : null,
        selectedFigure?.frontend_status ? { label: selectedFigure.frontend_status } : null,
        selectedFigure?.author_id ? { label: chooseText("Autore-personaggio", "双层 autore/personaggio") } : { label: chooseText("Standalone personaggio", "独立角色房") },
        Number.isFinite(selectedFigure?.total_mentions) ? { label: chooseText(`${selectedFigure.total_mentions} commentary mentions`, `${selectedFigure.total_mentions} 条 commentary mentions`) } : null,
        Number.isFinite(selectedAuthor?.text_occurrence_total) ? { label: chooseText(`${selectedAuthor.text_occurrence_total} text hits`, `${selectedAuthor.text_occurrence_total} 个正文命中`) } : null,
      ].filter(Boolean);

      const densityItems = getFigureDensityItems(selectedFigure, selectedAuthor);
      const occurrenceRows = getFilteredFigureOccurrenceRows(selectedFigure, selectedAuthor, selectedPoemAliasRow, chooseText)
        || getFigureOccurrenceRows(selectedFigure, selectedAuthor, chooseText);
      const firstOccurrence = occurrenceRows[0] || null;
      const chipButtons = sourceFigures
        .map((figure) => `
          <button type="button" class="figure-chip ${figure.page_slug === selectedFigure?.page_slug ? "is-active" : ""}" data-figure-id="${escapeHtml(figure.page_slug || "")}">
            ${escapeHtml(figure.display_name || figure.page_slug || "")}
          </button>
        `)
        .join("");

      const simpleAliasSections = [
        renderSimpleAliasSection(
          chooseText("Poem-layer exact aliases", "正文层直接别名"),
          chooseText("Direct poem-layer names that already behave like stable personaggio surfaces.", "已经能稳定指向这个 personaggio 的正文直接别名。"),
          getFigurePoemAliasTerms(selectedPoemAliasRow?.poem_layer_exact_aliases || []),
          {
            filterBandKey: "poem_exact_aliases",
          }
        ),
        renderSimpleAliasSection(
          chooseText("Poem-layer role cues", "正文层角色称呼"),
          chooseText("Role cues that keep pointing toward this figure inside the poem.", "正文里会反复把这个 figure 推出来的角色性称呼。"),
          getFigurePoemAliasTerms(selectedPoemAliasRow?.poem_layer_role_cues || []),
          {
            filterBandKey: "poem_role_cues",
          }
        ),
        renderSimpleAliasSection(
          chooseText("Commentary-layer aliases", "注释层别名"),
          chooseText("Commentary names and devotional/citation surfaces already frozen in the local atlas.", "本地 atlas 里已经冻结下来的注释层名字、devotional surface 和 citation surface。"),
          selectedAtlas?.commentary_layer_stable_aliases || [],
          {
            filterBandKey: "commentary_aliases",
          }
        ),
      ].filter(Boolean).join("");

      const structuredBands = renderBandDetails(
        selectedAtlas?.poem_layer_structured_bands || [],
        isEnglish ? "title_en" : "title_bi",
        isEnglish ? "intro_en" : "intro_bi",
        { selectedFigureSlug: selectedFigure?.page_slug || "" }
      );
      const referenceBands = selectedFigure?.page_slug === "virgilio"
        ? ""
        : renderBandDetails(
            selectedAtlas?.poem_layer_reference_bands || [],
            isEnglish ? "title_en" : "title_bi",
            isEnglish ? "intro_en" : "intro_bi",
            { selectedFigureSlug: selectedFigure?.page_slug || "" }
          );
      const ledgerSummary = selectedFigure?.page_slug === "virgilio"
        ? renderVirgilioLedgerSummary(state.virgilioAppendixLedger, chooseText)
        : "";

      elements.figurePanel.innerHTML = `
        ${tabs}
        <div class="title-with-help section-title-with-help">
          <h3>Figure Navigation</h3>
          ${renderHelpButton("figure-navigation", "Figure Navigation 说明")}
        </div>
        <p class="semantic-intro">${escapeHtml(chooseText(
          "This panel now reads directly from the authority/personaggio layer rather than from the old research-only figure profile shelf. It keeps all current personaggi together, then opens each room through poem hits, commentary aliases, and figure-specific bands.",
          "这一层现在直接读取 authority/personaggio，而不是旧的 research-only figure profile。当前 personaggi 会一起出现，然后再用正文命中、commentary aliases、以及 figure-specific bands 来打开每一间房。"
        ))}</p>
        <div class="figure-chip-row">${chipButtons}</div>
        <div class="figure-summary">
          <strong>${escapeHtml(selectedFigure?.display_name || "")}</strong>
          <div class="locus-meta-row">${renderDensityPills(metaPills)}</div>
          ${selectedFigure?.note ? `<p class="semantic-intro">${escapeHtml(selectedFigure.note)}</p>` : ""}
          <div class="figure-link-row">
            ${personaggioHref ? `<a class="figure-chip figure-chip-secondary" href="${escapeHtml(personaggioHref)}" target="_blank" rel="noreferrer">${escapeHtml(chooseText("Open personaggio page", "打开角色页"))}</a>` : ""}
            ${authorHref ? `<a class="figure-chip figure-chip-secondary" href="${escapeHtml(authorHref)}" target="_blank" rel="noreferrer">${escapeHtml(chooseText("Open autore page", "打开作者页"))}</a>` : ""}
          </div>
          ${densityItems.length ? `<div class="locus-meta-row">${renderDensityPills(densityItems)}</div>` : ""}
          <div class="occurrence-list figure-occurrence-anchor">${renderOccurrenceRows(occurrenceRows, chooseText)}</div>
          ${simpleAliasSections}
          ${structuredBands}
          ${referenceBands}
          ${ledgerSummary}
        </div>
      `;

      bindScholarLensEvents();
    }

    return Object.freeze({
      renderFigurePanel,
      getAuthorityAuthors,
      renderAuthorityLensMarkup,
    });
  }

  global.DDPAuthorityPanel = Object.freeze({
    createAuthorityPanel,
  });
})(window);
