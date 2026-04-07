(function attachDDPLociPanel(global) {
  function createLociPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
      ensureDanteWordLociIndexLoaded,
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
      buildRecurrenceCandidates,
      buildLineEchoSourceTerms,
      buildLineEchoSourceFields,
      formatShortCommediaLocation,
      highlightDualTerms,
    } = deps;

    function chooseText(english, chinese) {
      return state.uiLanguage === "en" ? english : chinese;
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

      if (!state.danteWordLociIndex) {
        const locusId = state.selectedLocus.id;
        elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText(`Loading the Dante word-locus index for ${state.selectedLocus.surface_form}.`, `正在载入 ${state.selectedLocus.surface_form} 对应的 Dante word-locus index。`))}</div>`;
        ensureDanteWordLociIndexLoaded()
          .then(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              const currentPayload = state.lineCache.get(payload.line_number) || payload;
              deps.renderLineRecords(currentPayload);
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
              deps.renderLineRecords(currentPayload);
            }
          })
          .catch(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("The current locus does not yet expose a front-end-readable Dante word-locus profile.", "当前这个 locus 还没有接到前端可消费的 Dante word-locus profile。"))}</div>`;
            }
          });
        return;
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
                  <strong>${escapeHtml(item.term)}</strong>
                  <button type="button" class="inline-filter-link" data-interpretive-term="${escapeHtml(item.term)}">${escapeHtml(state.activeInterpretiveTerm === item.term ? chooseText("Clear filter", "清除过滤") : chooseText("Filter related cards", "过滤相关 cards"))}</button>
                </div>
                <span class="pill">contrastive ${item.contrastiveScore.toFixed(1)}</span>
              </div>
              <p class="semantic-intro">${escapeHtml(getContrastiveBand(item.corpusShare))} · ${item.corpusLineCount} / ${state.corpusInterpretiveStats?.totalLines || 0} line profiles (${corpusPct}%)</p>
              <div class="locus-meta-row">
                <span class="pill">${item.localRecordCount} local records</span>
                <span class="pill">${item.occurrenceLineCount} ${item.occurrenceLineCount === 1 ? "locus" : "loci"} for this word</span>
                <span class="pill">rarity ${item.rarityScore.toFixed(1)}</span>
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
      const concurrenceRows = concurrence.slice(0, 10)
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
        )
        .join("");
      const phraseRows = phraseExpansions.slice(0, 6).map((item) => renderPhraseExpansionCard(item)).join("");
      const contrastiveSectionMarkup = `
        <div class="vocabulary-section vocabulary-section-interpretive">
          <div>
            <div class="title-with-help section-title-with-help">
              <h4>Contrastive Interpretive Vocabulary</h4>
              ${renderHelpButton("contrastive-vocabulary", "Contrastive Interpretive Vocabulary 说明")}
            </div>
            <div class="locus-meta-row">
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
        <div class="title-with-help section-title-with-help">
          <h3>Locus Panel for “<mark class="locus-target-highlight">${escapeHtml(state.selectedLocus.surface_form)}</mark>”</h3>
          ${renderHelpButton("dante-word-locus", "Dante Word Locus Layer 说明")}
        </div>
        <div class="locus-meta-row">
          <span class="pill coverage-pill">${escapeHtml(chooseText(`normalized: ${profile?.normalized_form || state.selectedLocus.normalized_form}`, `normalized：${profile?.normalized_form || state.selectedLocus.normalized_form}`))}</span>
          <span class="pill">${escapeHtml(chooseText(`${otherOccurrenceCount} other ${familyIsActive ? "family-level" : "exact-form"} occurrence${otherOccurrenceCount === 1 ? "" : "s"}`, `另有 ${otherOccurrenceCount} 条${familyIsActive ? " family-level" : " exact-form"} occurrence`))}</span>
          <span class="pill">${escapeHtml(chooseText(`${totalOccurrenceCount} total ${familyIsActive ? "family-level" : "exact-form"} occurrence${totalOccurrenceCount === 1 ? "" : "s"} incl. current locus`, `共 ${totalOccurrenceCount} 条${familyIsActive ? " family-level" : " exact-form"} occurrence（含当前 locus）`))}</span>
          ${familyIsActive ? `<span class="pill is-active">${escapeHtml(chooseText(`word family pilot · ${family.label}`, `word family pilot · ${family.label}`))}</span>` : ""}
          ${familyIsActive ? `<span class="pill">${escapeHtml(chooseText(`members: ${family.members.join(" / ")}`, `members：${family.members.join(" / ")}`))}</span>` : ""}
        </div>
        <div class="vocabulary-section-grid">
          <div class="vocabulary-section">
            <div>
              <div class="title-with-help section-title-with-help">
                <h4>${familyIsActive ? "Occurrence Explorer (Word Family Pilot)" : "Occurrence Explorer"}</h4>
                ${renderHelpButton("occurrence-explorer", "Occurrence Explorer 说明")}
              </div>
              <div class="occurrence-list">${profile ? (occurrenceRows || `<div class="empty-state">${escapeHtml(chooseText(`No other ${familyIsActive ? "family-level" : "exact-form"} occurrences are currently indexed for this word.`, `当前这个词在已索引语料里没有别的 ${familyIsActive ? "family-level" : "exact-form"} occurrence。`))}</div>`) : `<div class="empty-state">${escapeHtml(chooseText("The current locus does not yet expose a front-end-readable Dante word-locus profile.", "当前这个 locus 还没有接到前端可消费的 Dante word-locus profile。"))}</div>`}</div>
            </div>
          </div>
          <div class="vocabulary-section">
            <div>
              <div class="title-with-help section-title-with-help">
                <h4>${familyIsActive ? "Weighted Micro-Context Concurrence (Family Pilot)" : "Weighted Micro-Context Concurrence"}</h4>
                ${renderHelpButton("micro-context-concurrence", "Weighted Micro-Context Concurrence 说明")}
              </div>
              <div class="occurrence-list">${profile ? (concurrenceRows || `<div class="empty-state">${escapeHtml(chooseText("No stable micro-context concurrence results have emerged for this word yet.", "当前这个词还没有长出足够稳定的 micro-context concurrence 结果。"))}</div>`) : `<div class="empty-state">${escapeHtml(chooseText("No micro-context concurrence results are currently available for this locus.", "当前这个 locus 还没有可展开的 micro-context concurrence 结果。"))}</div>`}</div>
            </div>
          </div>
        </div>
        <div class="vocabulary-section">
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
          deps.renderLineRecords(payload);
          const target = elements.recordsList || elements.recordsSection;
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      const clearInterpretiveFilter = document.getElementById("clear-interpretive-filter");
      if (clearInterpretiveFilter) {
        clearInterpretiveFilter.addEventListener("click", () => {
          state.activeInterpretiveTerm = null;
          deps.renderLineRecords(payload);
          const target = elements.recordsList || elements.recordsSection;
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      elements.vocabularyPanel.querySelectorAll("[data-related-field-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const fieldId = button.dataset.relatedFieldId || "";
          state.activeSemanticField = state.activeSemanticField === fieldId ? null : fieldId;
          deps.renderLineRecords(payload);
        });
      });
    }

    function renderRecurrencePanel(payload) {
      const sourceTerms = buildLineEchoSourceTerms(payload).slice(0, 5);
      const sourceFields = buildLineEchoSourceFields(payload).slice(0, 4);
      const recurrence = buildRecurrenceCandidates(payload);
      const coreCandidates = recurrence.coreCandidates || [];
      const extendedCandidates = recurrence.extendedCandidates || [];
      const renderCandidateCards = (candidates) => {
        const distinctEchoTypes = new Set(candidates.map((candidate) => candidate.echoTypeLabel).filter(Boolean));
        const showEchoTypeTag = distinctEchoTypes.size > 1;
        return candidates
          .map((candidate) => {
            const seenOverlapLabels = new Set();
            const overlapPills = [...(candidate.sharedFields || []), ...(candidate.sharedTerms || [])]
              .filter((label) => {
                const normalized = String(label || "").trim().toLowerCase();
                if (!normalized || seenOverlapLabels.has(normalized)) {
                  return false;
                }
                seenOverlapLabels.add(normalized);
                return true;
              })
              .map((label) => `<span class="pill">${escapeHtml(label)}</span>`)
              .join("");
            const lineTextMarkup = escapeHtml(candidate.line_text || "");
            const directionClass = candidate.direction === "backward"
              ? "echo-direction-pill backward-pill"
              : (candidate.direction === "forward"
                ? "echo-direction-pill forward-pill"
                : "echo-direction-pill lateral-pill");
            const directionPill = candidate.directionLabel
              ? `<span class="pill ${directionClass}">${escapeHtml(candidate.directionLabel)}</span>`
              : "";
            const axisPill = candidate.axisExplanation
              ? `<span class="pill coverage-pill">${escapeHtml(candidate.axisExplanation)}</span>`
              : "";
            const relationNote = candidate.relationNote
              ? `<div class="semantic-intro recurrence-relation-note">${escapeHtml(candidate.relationNote)}</div>`
              : "";

            return `
              <article class="micro-context-card">
                <div class="micro-context-head">
                  <strong>${escapeHtml(formatShortCommediaLocation(candidate.cantica, candidate.canto, candidate.line_number))}</strong>
                  <span class="pill">echo score ${candidate.score.toFixed(1)}</span>
                </div>
                <button type="button" class="reading-result-link occurrence-inline-link" data-occurrence-sample="${candidate.sample}" data-occurrence-line="${candidate.line_number}">${lineTextMarkup}</button>
                <div class="locus-meta-row">
                  ${showEchoTypeTag ? `<span class="pill coverage-pill">${escapeHtml(candidate.echoTypeLabel || "line echo")}</span>` : ""}
                  ${directionPill}
                  ${axisPill}
                  ${overlapPills}
                </div>
                ${relationNote}
              </article>
            `;
          })
          .join("");
      };
      const coreCards = renderCandidateCards(coreCandidates);
      const extendedCards = renderCandidateCards(extendedCandidates);
      const lineEchoStatus = String(payload?.line_echo_profile?.line_status || "").trim();
      const sourceAxisExplanation = String(payload?.line_echo_profile?.source_axis_explanation || "").trim();
      const hasReviewable = Boolean(coreCandidates.length);
      const hasThinner = Boolean(extendedCandidates.length);
      const primaryEchoTitle = hasReviewable
        ? "Reviewable Echoes"
        : (hasThinner ? "Current Visible Echoes" : "Reviewable Echoes");
      const primaryEchoIntro = hasReviewable
        ? ""
        : (hasThinner
          ? `<p class="semantic-intro">${escapeHtml(chooseText(
              "This line currently yields thinner but still readable echoes. They are shown here first because no reviewable echoes have emerged yet.",
              "这一行当前先长出了 thinner 但仍可读的 echoes。因为还没有 reviewable echoes，所以这里先把这些结果直接显示出来。"
            ))}</p>`
          : "");
      const primaryEchoCards = hasReviewable
        ? coreCards
        : (hasThinner ? extendedCards : "");
      const showSecondaryThinnerSection = hasReviewable && hasThinner;

      elements.recurrencePanel.innerHTML = `
        <div class="semantic-kicker">Cross-Canto Echoes</div>
        <div class="title-with-help section-title-with-help">
          <h3>Cross-Canto Echoes for Line ${payload.line_number}: ${escapeHtml(payload.line_text || "")}</h3>
          ${renderHelpButton("recurrence-candidates", "Cross-Canto Echoes 说明")}
        </div>
        <p class="semantic-intro">${escapeHtml(chooseText(
          "This layer now follows the text-first line similarity baseline and looks for other lines that genuinely deserve to be read beside the current line.",
          "这一层现在采用 text-first 的 line similarity baseline，去找那些真的值得和当前行并读的别的 lines。"
        ))}</p>
        <p class="semantic-intro">${chooseText(
          "Line evidence still follows Dante line first, then nearby terzina context, with commentary kept lighter in the background. Reviewer rollback can directly remove obviously unrelated candidate lines.",
          "证据顺序仍然是 Dante 原文这一行优先，其次是附近 terzina 上下文，commentary 退到更轻的背景层。reviewer rollback 也可以直接删掉那些明显无关的候选行。"
        )}</p>
        <p class="semantic-intro">${escapeHtml(chooseText(
          "The panel now shows the strongest visible echoes for the current line right away: reviewable echoes first when they exist, and thinner but still readable echoes when they do not.",
          "这个 panel 现在会尽量直接显示当前这行最可见的 echoes：如果有 reviewable echoes，就先显示它们；如果没有，就直接显示 thinner 但仍可读的 echoes。"
        ))}</p>
        <p class="semantic-intro">${escapeHtml(chooseText(
          "Direction labels now show whether the current line looks back on an earlier line or looks forward to a later one. Axis language, when present, is explanatory only and does not drive the ranking.",
          "现在的方向标签会直接告诉你：当前这一行是在回望更早的 line，还是在前指更晚的 line。若出现 axis language，它只负责解释，不参与排序。"
        ))}</p>
        ${(lineEchoStatus || sourceAxisExplanation) ? `<div class="locus-meta-row">
          ${lineEchoStatus ? `<span class="pill">${escapeHtml(chooseText(`status: ${lineEchoStatus.replaceAll("_", " ")}`, `状态：${lineEchoStatus.replaceAll("_", " ")}`))}</span>` : ""}
          ${sourceAxisExplanation ? `<span class="pill coverage-pill">${escapeHtml(chooseText(`axis explanation: ${sourceAxisExplanation}`, `解释轴：${sourceAxisExplanation}`))}</span>` : ""}
        </div>` : ""}
        <div class="vocabulary-section">
          <div>
            <h4>${escapeHtml(primaryEchoTitle)}</h4>
            ${primaryEchoIntro}
            <div class="field-grid recurrence-grid">${primaryEchoCards || `<div class="empty-state">${escapeHtml(chooseText("No strong line-level echoes have emerged for this line yet.", "当前这一行还没有足够扎实的 line-level echoes。"))}</div>`}</div>
          </div>
          ${showSecondaryThinnerSection ? `
          <div>
            <h4>Thinner Echoes</h4>
            <p class="semantic-intro">${escapeHtml(chooseText(
              "These candidates still share readable evidence with the current line, but they are intentionally lighter than the reviewable set.",
              "这些候选与当前行仍然共享可读证据，但会刻意比上面的 reviewable set 更轻。"
            ))}</p>
            <div class="field-grid recurrence-grid">${extendedCards}</div>
          </div>` : ""}
          </div>
        </div>
      `;

      elements.recurrencePanel.querySelectorAll("[data-occurrence-sample]").forEach((button) => {
        button.addEventListener("click", async () => {
          await jumpToSampleLine(
            button.dataset.occurrenceSample,
            Number(button.dataset.occurrenceLine),
            button.dataset.occurrenceLocus
          );
        });
      });
    }

    return Object.freeze({
      renderLocusPanel,
      renderVocabularyPanel,
      renderRecurrencePanel,
    });
  }

  global.DDPLociPanel = Object.freeze({
    createLociPanel,
  });
})(window);
