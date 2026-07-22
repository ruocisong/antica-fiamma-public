(function attachDDPWordLevelPanel(global) {
  function createWordLevelPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
      ensureDanteWordLociIndexLoaded,
      isDanteWordLociIndexShardSettled,
      ensureTreccaniDantescaWordLinksLoaded,
      hasTreccaniDantescaWordLinkShardState,
      getTreccaniDantescaLink,
      ensureWordFamilyProfilesLoaded,
      getSelectedWordProfileBundle,
      canAttemptLocusProfileLoad,
      getLocalizedInterpretiveTerms,
      buildContrastiveInterpretiveTerms,
      getRelatedFieldsForLocus,
      compareCanticaLocations,
      isMeaningfulConcurrenceTerm,
      renderLocusJumpRow,
      getContrastiveBand,
      getCorpusFieldDocFreq,
      renderConcurrenceWindowRow,
      renderPhraseExpansionCard,
      jumpToSampleLine,
      scrollToRecordsSection,
      renderLineRecords,
    } = deps;

    function chooseText(english, chinese) {
      return state.uiLanguage === "en" ? english : chinese;
    }

    function scrollToRequestedVocabularySubsection() {
      const hash = String(window.location.hash || "").replace(/^#/, "");
      if (!hash) return;
      const target = elements.vocabularyPanel.querySelector(`#${CSS.escape(hash)}`);
      if (!target) return;
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    function renderLocusPanel() {
      elements.locusPanel.innerHTML = "";
      elements.locusPanel.hidden = true;
    }

    function renderVocabularyPanel(payload) {
      const isEnglish = state.uiLanguage === "en";
      const chooseText = (en, zh) => (isEnglish ? en : zh);
      if (!state.selectedLocus) {
        elements.vocabularyPanel.innerHTML = `
          <div class="empty-state">${escapeHtml(chooseText("Select a Dante content word in the current line to open the Dante Word Locus Layer.", "先在当前这一行 Dante 原文里点一个可选 content word，Dante Word Locus Layer 才会展开。"))}</div>
        `;
        return;
      }

      const bundle = getSelectedWordProfileBundle();
      const family = bundle?.family || null;
      const familyIsActive = Boolean(bundle?.familyIsActive);
      const profile = bundle?.danteProfile || null;
      const researchProfile = bundle?.researchProfile || null;
      const treccaniLink = getTreccaniDantescaLink(state.selectedLocus.normalized_form);
      const treccaniEntries = treccaniLink
        ? [
            {
              entry_title: treccaniLink.entry_title,
              canonical_url: treccaniLink.canonical_url,
              entry_role: "main_official_entry",
            },
            ...(treccaniLink.related_official_entries || []),
          ]
        : [];
      const treccaniLinksMarkup = treccaniEntries
        .map((entry, index) => {
          const isSecondary = index > 0;
          const visibleLabel = isSecondary
            ? chooseText(
                `Enciclopedia Dantesca: ${entry.entry_title} (altra voce)`,
                `Enciclopedia Dantesca：${entry.entry_title}（另一词条）`,
              )
            : `Enciclopedia Dantesca: ${entry.entry_title}`;
          const title = isSecondary
            ? chooseText(
                `Open the other official Enciclopedia Dantesca entry “${entry.entry_title}” on Treccani`,
                `在 Treccani 打开另一条官方《Enciclopedia Dantesca》词条“${entry.entry_title}”`,
              )
            : chooseText(
                `Open the main official Enciclopedia Dantesca entry “${entry.entry_title}” on Treccani`,
                `在 Treccani 打开主要官方《Enciclopedia Dantesca》词条“${entry.entry_title}”`,
              );
          return `<a class="word-locus-external-link${isSecondary ? " is-secondary" : ""}" href="${escapeHtml(entry.canonical_url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${visibleLabel}: ${entry.entry_title} (${chooseText("opens in a new tab", "新标签页打开")})`)}">${escapeHtml(visibleLabel)}</a>`;
        })
        .join("");

      if (!isDanteWordLociIndexShardSettled(state.selectedLocus.normalized_form)) {
        const locusId = state.selectedLocus.id;
        const normalizedForm = state.selectedLocus.normalized_form;
        elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText(`Loading the Dante word-locus index for ${state.selectedLocus.surface_form}.`, `正在载入 ${state.selectedLocus.surface_form} 对应的 Dante word-locus index。`))}</div>`;
        ensureDanteWordLociIndexLoaded(normalizedForm)
          .then(() => ensureWordFamilyProfilesLoaded(normalizedForm))
          .then(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              const currentPayload = state.lineCache.get(payload.line_number) || payload;
              renderLineRecords(currentPayload);
            }
          })
          .catch(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("The Dante word-locus index is not available right now.", "当前 Dante word-locus index 暂时不可用。"))}</div>`;
            }
          });
        return;
      }

      if (!profile && canAttemptLocusProfileLoad(bundle, state.selectedLocus.normalized_form)) {
        const locusId = state.selectedLocus.id;
        elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText(`Loading the Dante word-locus profile for ${state.selectedLocus.surface_form}.`, `正在为 ${state.selectedLocus.surface_form} 载入 Dante word-locus profile。`))}</div>`;
        ensureWordFamilyProfilesLoaded(state.selectedLocus.normalized_form)
          .then(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              const currentPayload = state.lineCache.get(payload.line_number) || payload;
              renderLineRecords(currentPayload);
            }
          })
          .catch(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("The current locus does not yet expose a front-end-readable Dante word-locus profile.", "当前这个 locus 还没有接到前端可消费的 Dante word-locus profile。"))}</div>`;
            }
          });
        return;
      }

      // Keep the small, locus-specific profile on the critical path. The full
      // Treccani sidecar is optional enrichment and must not compete with it.
      if (!hasTreccaniDantescaWordLinkShardState(state.selectedLocus.normalized_form)) {
        const locusId = state.selectedLocus.id;
        const normalizedForm = state.selectedLocus.normalized_form;
        window.setTimeout(() => {
          if (hasTreccaniDantescaWordLinkShardState(normalizedForm)) return;
          ensureTreccaniDantescaWordLinksLoaded(normalizedForm).then((linksPayload) => {
            if (linksPayload && state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              const currentPayload = state.lineCache.get(payload.line_number) || payload;
              renderLineRecords(currentPayload);
            }
          });
        }, 0);
      }

      const localizedTerms = researchProfile ? getLocalizedInterpretiveTerms(payload, researchProfile) : [];
      const contrastiveTerms = researchProfile ? buildContrastiveInterpretiveTerms(payload, researchProfile, localizedTerms) : [];
      const relatedFields = researchProfile ? getRelatedFieldsForLocus(payload, contrastiveTerms) : [];
      const occurrences = profile
        ? (profile.occurrences || [])
            .filter((occurrence) => occurrence.locus_id !== state.selectedLocus.id)
            .sort(compareCanticaLocations)
        : [];
      const totalOccurrenceCount = Number(profile?.occurrence_count || 0);
      const otherOccurrenceCount = occurrences.length;
      const concurrence = profile
        ? (profile.weighted_micro_context_concurrence?.top_terms || [])
            .filter((item) => Number(item.weighted_score || 0) > 1.0)
            .filter((item) => isMeaningfulConcurrenceTerm(item.word, state.selectedLocus?.normalized_form))
            .sort((left, right) =>
              Number(right.weighted_score || 0) - Number(left.weighted_score || 0)
              || Number((right.sample_windows || []).length || 0) - Number((left.sample_windows || []).length || 0)
              || String(left.word || "").localeCompare(String(right.word || ""))
            )
        : [];
      const concurrenceLineGroups = profile
        ? (profile.weighted_micro_context_concurrence?.line_evidence_groups || [])
            .map((group) => ({
              ...group,
              terms: (group.terms || []).filter((term) =>
                isMeaningfulConcurrenceTerm(term.word, state.selectedLocus?.normalized_form)
              ),
            }))
            .filter((group) => group.terms.length)
        : [];
      const phraseExpansions = profile
        ? [...(profile.exact_local_phrase_expansions || [])]
            .sort((left, right) => {
              const leftLocal = (left.sample_occurrences || []).some(
                (item) => item.sample_id === state.currentSampleEntry?.id && item.line_number === payload.line_number
              );
              const rightLocal = (right.sample_occurrences || []).some(
                (item) => item.sample_id === state.currentSampleEntry?.id && item.line_number === payload.line_number
              );
              return Number(right.occurrence_count || 0) - Number(left.occurrence_count || 0)
                || Number(rightLocal) - Number(leftLocal)
                || compareCanticaLocations((left.sample_occurrences || [])[0] || {}, (right.sample_occurrences || [])[0] || {})
                || left.phrase.localeCompare(right.phrase);
            })
        : [];

      const occurrenceRows = occurrences
        .slice(0, 16)
        .map((occurrence) => renderLocusJumpRow(occurrence, occurrence.normalized_form))
        .join("");
      const contrastiveRows = contrastiveTerms.slice(0, 6)
        .map((item) => {
          const corpusPct = ((item.corpusShare || 0) * 100).toFixed(item.corpusShare < 0.01 ? 2 : 1);
          return `
            <article class="micro-context-card ${state.activeInterpretiveTerm === item.term ? "is-active" : ""}">
              <div class="micro-context-head">
                <div class="title-with-inline-action">
                  <strong>${escapeHtml(item.displayTerm || item.term)}</strong>
                  <button type="button" class="inline-filter-link" data-interpretive-term="${escapeHtml(item.term)}">${escapeHtml(state.activeInterpretiveTerm === item.term ? chooseText("Clear filter", "清除过滤") : chooseText("Filter related cards", "过滤相关 cards"))}</button>
                </div>
                <span class="pill">contrastive ${item.contrastiveScore.toFixed(1)}</span>
              </div>
              <p class="semantic-intro">${escapeHtml(getContrastiveBand(item.corpusShare))} · ${item.corpusLineCount} / ${state.corpusInterpretiveStats?.totalLines || 0} line profiles (${corpusPct}%)</p>
              <div class="locus-meta-row">
                ${renderContrastiveEvidencePills(item)}
              </div>
            </article>
          `;
        })
        .join("");
      const relatedFieldRows = relatedFields.map((field) => {
        const corpusFieldCount = getCorpusFieldDocFreq(field.label);
        return `
          <button type="button" class="pill ${state.activeSemanticField === field.id ? "is-active" : ""}" data-related-field-id="${field.id}">
            ${escapeHtml(field.label)} · overlap ${escapeHtml(field.overlap.join(", "))}${corpusFieldCount ? ` · corpus ${corpusFieldCount}` : ""}
          </button>
        `;
      }).join("");
      const concurrenceRows = (concurrenceLineGroups.length
        ? concurrenceLineGroups.slice(0, 10)
            .map((group) => {
              const terms = group.terms.map((term) => term.word).filter(Boolean);
              const window = {
                ...group,
                weight: Number(group.group_score || 0),
              };
              return `
                <article class="micro-context-card">
                  <div class="micro-context-head">
                    <strong>${escapeHtml(group.label || terms.join(" / "))}</strong>
                    <span class="pill">score ${Number(group.group_score || 0).toFixed(1)}</span>
                  </div>
                  <div class="occurrence-list">
                    ${renderConcurrenceWindowRow(window, terms) || `<div class="empty-state">${escapeHtml(chooseText("No readable sample windows are currently retained for this concurrence line group.", "当前这个 concurrence line group 还没有保留下来可读的 sample window。"))}</div>`}
                  </div>
                </article>
              `;
            })
        : concurrence.slice(0, 10)
            .map(
              (item) => `
            <article class="micro-context-card">
              <div class="micro-context-head">
                <strong>${escapeHtml(item.word)}</strong>
                <span class="pill">score ${Number(item.weighted_score || 0).toFixed(1)}</span>
              </div>
              <div class="occurrence-list">
                ${(item.sample_windows || []).map((window) => renderConcurrenceWindowRow(window, item.word)).join("") || `<div class="empty-state">${escapeHtml(chooseText("No readable sample windows are currently retained for this concurrence term.", "当前这个 concurrence term 还没有保留下来可读的 sample windows。"))}</div>`}
              </div>
            </article>
          `
            ))
        .join("");
      const phraseRows = phraseExpansions.slice(0, 6).map((item) => renderPhraseExpansionCard(item)).join("");
      const contrastiveSectionMarkup = `
        <div class="vocabulary-section vocabulary-section-interpretive">
          <div>
            <div class="title-with-help section-title-with-help">
              <h4>Contrastive Interpretive Vocabulary</h4>
              ${renderHelpButton("contrastive-vocabulary", "Contrastive Interpretive Vocabulary 说明")}
            </div>
            <div class="locus-meta-row contrastive-layer-note-row">
              <span class="pill coverage-pill">${escapeHtml(chooseText("Word / Term Layer", "词位 / interpretive term 层"))}</span>
              <span class="pill">${escapeHtml(chooseText("unit: interpretive terms around the selected Dante locus", "单位：围绕当前 Dante locus 聚起来的 interpretive terms"))}</span>
              <span class="pill">${escapeHtml(chooseText("goal: contrastive cues, not raw word frequency", "目标：看更有区分度的解释线索，而不是原始词频"))}</span>
            </div>
            ${state.activeInterpretiveTerm
              ? `<div class="semantic-filter-note">${escapeHtml(chooseText(`Now showing only cards that match ${state.activeInterpretiveTerm}.`, `当前只显示命中 ${state.activeInterpretiveTerm} 的 commentary cards。`))}<button class="ghost-button" type="button" id="clear-interpretive-filter">${escapeHtml(chooseText("Show all", "显示全部"))}</button></div>`
              : ""}
            <div class="field-grid contrastive-grid">${
              researchProfile
                ? (contrastiveRows || `<div class="empty-state">${escapeHtml(chooseText("No stable contrastive interpretive terms have emerged for this locus yet.", "当前这个 locus 还没有长出足够稳定的 contrastive interpretive terms。"))}</div>`)
                : `<div class="empty-state">${escapeHtml(chooseText("No interpretive commentary profile is currently available for this locus.", "当前这个 locus 还没有接到可读的 interpretive commentary profile，所以这一层暂时不会展开。"))}</div>`
            }</div>
            ${relatedFieldRows
              ? `
                <div class="semantic-action-row">
                  <span class="analysis-label">Related local fields</span>
                </div>
                <div class="locus-meta-row">${relatedFieldRows}</div>
              `
              : ""}
          </div>
        </div>
      `;

      elements.vocabularyPanel.innerHTML = `
        <div class="semantic-kicker">Dante Word Locus Layer</div>
        <div class="title-with-help section-title-with-help word-locus-title-row">
          <div class="word-locus-heading-with-help">
            <h3>Locus Panel for “<mark class="locus-target-highlight">${escapeHtml(state.selectedLocus.surface_form)}</mark>”</h3>
            ${renderHelpButton("dante-word-locus", "Dante Word Locus Layer 说明")}
          </div>
          <div class="word-locus-title-actions">
            ${treccaniLinksMarkup}
          </div>
        </div>
        <div class="locus-meta-row">
          <span class="pill coverage-pill">${escapeHtml(chooseText(`normalized: ${profile?.normalized_form || state.selectedLocus.normalized_form}`, `normalized：${profile?.normalized_form || state.selectedLocus.normalized_form}`))}</span>
          <span class="pill">${escapeHtml(chooseText(`${otherOccurrenceCount} other ${familyIsActive ? "family-level" : "exact-form"} occurrence${otherOccurrenceCount === 1 ? "" : "s"}`, `另有 ${otherOccurrenceCount} 条${familyIsActive ? " family-level" : " exact-form"} occurrence`))}</span>
          <span class="pill">${escapeHtml(chooseText(`${totalOccurrenceCount} total ${familyIsActive ? "family-level" : "exact-form"} occurrence${totalOccurrenceCount === 1 ? "" : "s"} incl. current locus`, `共 ${totalOccurrenceCount} 条${familyIsActive ? " family-level" : " exact-form"} occurrence（含当前 locus）`))}</span>
          ${familyIsActive ? `<span class="pill is-active">${escapeHtml(chooseText(`word family pilot · ${family.label}`, `word family pilot · ${family.label}`))}</span>` : ""}
          ${familyIsActive ? `<span class="pill">${escapeHtml(chooseText(`members: ${family.members.join(" / ")}`, `members：${family.members.join(" / ")}`))}</span>` : ""}
        </div>
        <div class="vocabulary-section-grid">
          <div class="vocabulary-section" id="occurrence-explorer-panel">
            <div>
              <div class="title-with-help section-title-with-help">
                <h4>${familyIsActive ? "Occurrence Explorer (Word Family Pilot)" : "Occurrence Explorer"}</h4>
                ${renderHelpButton("occurrence-explorer", "Occurrence Explorer 说明")}
              </div>
              <div class="occurrence-list">${profile ? (occurrenceRows || `<div class="empty-state">${escapeHtml(chooseText(`No other ${familyIsActive ? "family-level" : "exact-form"} occurrences are currently indexed for this word.`, `当前这个词在已索引语料里没有别的 ${familyIsActive ? "family-level" : "exact-form"} occurrence。`))}</div>`) : `<div class="empty-state">${escapeHtml(chooseText("The current locus does not yet expose a front-end-readable Dante word-locus profile.", "当前这个 locus 还没有接到前端可消费的 Dante word-locus profile。"))}</div>`}</div>
            </div>
          </div>
          <div class="vocabulary-section" id="micro-context-panel">
            <div>
              <div class="title-with-help section-title-with-help">
                <h4>${familyIsActive ? "Weighted Micro-Context Concurrence (Family Pilot)" : "Weighted Micro-Context Concurrence"}</h4>
                ${renderHelpButton("micro-context-concurrence", "Weighted Micro-Context Concurrence 说明")}
              </div>
              <div class="occurrence-list">${profile ? (concurrenceRows || `<div class="empty-state">${escapeHtml(chooseText("No stable micro-context concurrence results have emerged for this word yet.", "当前这个词还没有长出足够稳定的 micro-context concurrence 结果。"))}</div>`) : `<div class="empty-state">${escapeHtml(chooseText("No micro-context concurrence results are currently available for this locus.", "当前这个 locus 还没有可展开的 micro-context concurrence 结果。"))}</div>`}</div>
            </div>
          </div>
        </div>
        <div class="vocabulary-section" id="phrase-expansions-panel">
          <div>
            <div class="title-with-help section-title-with-help">
              <h4>${familyIsActive ? "Local Phrase Expansions (Family Pilot)" : "Exact Local Phrase Expansions"}</h4>
              ${renderHelpButton("phrase-expansions", "Exact Local Phrase Expansions 说明")}
            </div>
            <div class="occurrence-list phrase-expansion-grid">${profile ? (phraseRows || `<div class="empty-state">${escapeHtml(chooseText("No exact local phrase expansions are currently available for this word.", "当前这个词还没有可展示的 exact local phrase expansions。"))}</div>`) : `<div class="empty-state">${escapeHtml(chooseText("No exact local phrase expansions are currently available for this locus.", "当前这个 locus 还没有可展示的 exact local phrase expansions。"))}</div>`}</div>
          </div>
        </div>
        ${contrastiveSectionMarkup}
      `;

      const contrastiveSection = elements.vocabularyPanel.querySelector(".vocabulary-section-interpretive");
      if (contrastiveSection) {
        contrastiveSection.id = "contrastive-vocabulary-panel";
      }

      elements.vocabularyPanel.querySelectorAll("[data-occurrence-sample]").forEach((button) => {
        button.addEventListener("click", async () => {
          await jumpToSampleLine(
            button.dataset.occurrenceSample,
            Number(button.dataset.occurrenceLine),
            button.dataset.occurrenceLocus
          );
        });
      });

      elements.vocabularyPanel.querySelectorAll("[data-interpretive-term]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const term = button.dataset.interpretiveTerm || "";
          state.activeInterpretiveTerm = state.activeInterpretiveTerm === term ? null : term;
          renderLineRecords(payload);
          const target = elements.recordsList || elements.recordsSection;
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      const clearInterpretiveFilter = document.getElementById("clear-interpretive-filter");
      if (clearInterpretiveFilter) {
        clearInterpretiveFilter.addEventListener("click", () => {
          state.activeInterpretiveTerm = null;
          renderLineRecords(payload);
          const target = elements.recordsList || elements.recordsSection;
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      elements.vocabularyPanel.querySelectorAll("[data-related-field-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const fieldId = button.dataset.relatedFieldId || "";
          state.activeSemanticField = state.activeSemanticField === fieldId ? null : fieldId;
          renderLineRecords(payload);
        });
      });

      scrollToRequestedVocabularySubsection();
    }

    return Object.freeze({
      renderLocusPanel,
      renderVocabularyPanel,
    });
  }

  global.DDPWordLevelPanel = Object.freeze({
    createWordLevelPanel,
  });
})(window);
