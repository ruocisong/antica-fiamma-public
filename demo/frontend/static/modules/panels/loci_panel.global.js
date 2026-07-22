(function attachDDPLociPanel(global) {
  function createLociPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
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
      formatShortCommediaLocation,
      highlightDualTerms,
    } = deps;

    function renderLocusPanel() {
      elements.locusPanel.innerHTML = "";
      elements.locusPanel.hidden = true;
    }

    function renderVocabularyPanel(payload) {
      if (!state.selectedLocus) {
        elements.vocabularyPanel.innerHTML = `
          <div class="empty-state">先在 Dante 原文这一行里点击一个可选 content word，再打开它的 Dante Word Locus Layer：occurrence explorer、weighted micro-context concurrence 与 exact local phrase expansions 都会在这里显示。</div>
        `;
        return;
      }

      const bundle = getSelectedWordProfileBundle();
      const family = bundle?.family || null;
      const familyIsActive = Boolean(bundle?.familyIsActive);
      const profile = bundle?.danteProfile || null;
      const researchProfile = bundle?.researchProfile || null;

      if (!profile && canAttemptLocusProfileLoad(bundle, state.selectedLocus.normalized_form)) {
        const locusId = state.selectedLocus.id;
        elements.vocabularyPanel.innerHTML = `<div class="empty-state">正在按词加载 Dante word-locus profile：<strong>${escapeHtml(state.selectedLocus.surface_form)}</strong>。</div>`;
        ensureWordFamilyProfilesLoaded(state.selectedLocus.normalized_form)
          .then(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              const currentPayload = state.lineCache.get(payload.line_number) || payload;
              deps.renderLineRecords(currentPayload);
            }
          })
          .catch(() => {
            if (state.selectedLocus?.id === locusId && state.selectedLine === payload.line_number) {
              elements.vocabularyPanel.innerHTML = `<div class="empty-state">当前 locus 还没有接到前端可消费的 Dante word-locus profile。</div>`;
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
      const concurrence = profile
        ? (profile.weighted_micro_context_concurrence?.top_terms || [])
            .filter((item) => isMeaningfulConcurrenceTerm(item.word, state.selectedLocus?.normalized_form))
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
              return Number(rightLocal) - Number(leftLocal)
                || compareCanticaLocations((left.sample_occurrences || [])[0] || {}, (right.sample_occurrences || [])[0] || {})
                || right.occurrence_count - left.occurrence_count
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
                <strong>${escapeHtml(item.displayTerm || item.term)}</strong>
                <span class="pill">contrastive ${item.contrastiveScore.toFixed(1)}</span>
              </div>
              <p class="semantic-intro">${escapeHtml(getContrastiveBand(item.corpusShare))} · ${item.corpusLineCount} / ${state.corpusInterpretiveStats?.totalLines || 0} line profiles (${corpusPct}%)</p>
              <div class="locus-meta-row">
                ${renderContrastiveEvidencePills(item)}
              </div>
              <div class="semantic-action-row">
                <button type="button" class="ghost-button" data-interpretive-term="${escapeHtml(item.term)}">${state.activeInterpretiveTerm === item.term ? "取消过滤" : "过滤 related cards"}</button>
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
                    ${renderConcurrenceWindowRow(window, terms) || `<div class="empty-state">当前共现行组还没有保留可展示的 sample window。</div>`}
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
                ${(item.sample_windows || []).map((window) => renderConcurrenceWindowRow(window, item.word)).join("") || `<div class="empty-state">当前共现词还没有保留可展示的 sample windows。</div>`}
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
            <p class="semantic-intro">这一层不再只看“这一词位附近出现了什么词”，而是把当前 locus 的局部 interpretive terms 放回全《神曲》 line profiles 里比较，优先显示更能区分这个 locus 的词。点击任一 term 会直接过滤并带你到下方 related cards。</p>
            ${state.activeInterpretiveTerm
              ? `<div class="semantic-filter-note">当前只显示 term <strong>${escapeHtml(state.activeInterpretiveTerm)}</strong> 命中的 commentary cards。<button class="ghost-button" type="button" id="clear-interpretive-filter">显示全部</button></div>`
              : ""}
            <div class="field-grid contrastive-grid">${
              researchProfile
                ? (contrastiveRows || `<div class="empty-state">当前这个 locus 还没有足够稳定的 contrastive interpretive terms。</div>`)
                : `<div class="empty-state">当前词位还没有接到可用的 interpretive commentary profile，所以这一层先不展开。</div>`
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
        <p class="semantic-intro">这是长在 Line Interpretation Layer 里的一个 Dante Word Locus 子层。当前仍只处理单个 Dante content word；但对一小批高价值实词，前端会开启保守的 word-family pilot，把显性的词形变化一起读。列表坐标统一按 Inferno → Purgatorio → Paradiso 排序。</p>
        <div class="locus-meta-row">
          <span class="pill coverage-pill">normalized: ${escapeHtml(profile?.normalized_form || state.selectedLocus.normalized_form)}</span>
          <span class="pill">${profile?.occurrence_count || 0} ${familyIsActive ? "family-level" : "exact-form"} occurrences</span>
          ${familyIsActive ? `<span class="pill is-active">word family pilot · ${escapeHtml(family.label)}</span>` : ""}
          ${familyIsActive ? `<span class="pill">members: ${escapeHtml(family.members.join(" / "))}</span>` : ""}
        </div>
        <div class="vocabulary-section-grid">
          <div class="vocabulary-section">
            <div>
              <div class="title-with-help section-title-with-help">
                <h4>${familyIsActive ? "Occurrence Explorer (Word Family Pilot)" : "Occurrence Explorer"}</h4>
                ${renderHelpButton("occurrence-explorer", "Occurrence Explorer 说明")}
              </div>
              <p class="semantic-intro">${profile ? (familyIsActive ? `当前 locus 命中了 top-20 实词族 pilot，所以这里展示的是 <strong>${escapeHtml(family.label)}</strong> 的 family-level occurrences；它仍然只是保守词形聚合，不假装已经是完整 lemma system。` : "这里只列《神曲》内其他 exact-form occurrences；如果某个 canto 还没挂进 workbench，会保留坐标但禁用跳转。") : "这一层更偏向 Dante 原文词位本身的再出现。如果当前词位没有接到前端可消费的 Dante word-locus profile，这一部分就先诚实留空。 "}</p>
              <div class="occurrence-list">${profile ? (occurrenceRows || `<div class="empty-state">当前这个词在已索引语料里没有别的 ${familyIsActive ? "family-level" : "exact-form"} occurrence。</div>`) : `<div class="empty-state">当前 locus 还没有接到前端可消费的 Dante word-locus profile。</div>`}</div>
            </div>
          </div>
          <div class="vocabulary-section">
            <div>
              <div class="title-with-help section-title-with-help">
                <h4>${familyIsActive ? "Weighted Micro-Context Concurrence (Family Pilot)" : "Weighted Micro-Context Concurrence"}</h4>
                ${renderHelpButton("micro-context-concurrence", "Weighted Micro-Context Concurrence 说明")}
              </div>
              <p class="semantic-intro">${profile ? `这是围绕 “<mark class="locus-target-highlight">${escapeHtml(state.selectedLocus.surface_form)}</mark>” 的小窗口 micro-context concurrence。这里会额外过滤 stopwords、function words 和低语义权重残留，只保留更像实义词的 concurrence terms。${familyIsActive ? `当前这组 concurrence 也是按 <strong>${escapeHtml(family.label)}</strong> 聚合后的 family-level 结果。` : ""}` : "这一层仍然是从 Dante 原文词位出发的局部窗口共现；如果当前词位没有接到前端可消费的 locus profile，就不会假装这里已经有结果。"}</p>
              <div class="occurrence-list">${profile ? (concurrenceRows || `<div class="empty-state">当前这个词还没有足够稳定的 micro-context concurrence 结果。</div>`) : `<div class="empty-state">当前 locus 还没有可展开的 micro-context concurrence 结果。</div>`}</div>
            </div>
          </div>
        </div>
        <div class="vocabulary-section">
          <div>
            <div class="title-with-help section-title-with-help">
              <h4>${familyIsActive ? "Local Phrase Expansions (Family Pilot)" : "Exact Local Phrase Expansions"}</h4>
              ${renderHelpButton("phrase-expansions", "Exact Local Phrase Expansions 说明")}
            </div>
            <p class="semantic-intro">${profile ? (familyIsActive ? `这里会把 <strong>${escapeHtml(family.label)}</strong> 相关的 local phrase expansions 合并展示；它仍然是 exact local phrase 的保守合集，不是完整 phrase-level locus system。` : "这里只展示 exact local phrase expansions；如果短语在别处有 exact occurrence，会给出 occurrence jump，但这还不是完整 phrase-level locus system。") : "这一层同样更偏向 Dante 原文词位长出来的局部短语。如果当前词位还没有可消费的 locus profile，这部分会先保留为空。 "}</p>
            <div class="occurrence-list phrase-expansion-grid">${profile ? (phraseRows || `<div class="empty-state">当前这个词还没有可展示的 exact local phrase expansions。</div>`) : `<div class="empty-state">当前 locus 还没有可展示的 exact local phrase expansions。</div>`}</div>
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
        button.addEventListener("click", () => {
          const term = button.dataset.interpretiveTerm || "";
          state.activeInterpretiveTerm = state.activeInterpretiveTerm === term ? null : term;
          deps.renderLineRecords(payload);
          scrollToRecordsSection();
        });
      });

      const clearInterpretiveFilter = document.getElementById("clear-interpretive-filter");
      if (clearInterpretiveFilter) {
        clearInterpretiveFilter.addEventListener("click", () => {
          state.activeInterpretiveTerm = null;
          deps.renderLineRecords(payload);
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
      if (!state.selectedLocus) {
        elements.recurrencePanel.innerHTML = `
          <div class="empty-state">选中某个 Dante content word 后，这里会显示这条子层的诚实边界说明：当前做的是 occurrence explorer、weighted micro-context concurrence 与 exact local phrase expansions，不把它包装成 recurrence engine 或完整 morphology layer。</div>
        `;
        return;
      }

      const bundle = getSelectedWordProfileBundle();
      const profile = bundle?.danteProfile || null;
      const researchProfile = bundle?.researchProfile || null;
      const family = bundle?.family || null;
      const familyIsActive = Boolean(bundle?.familyIsActive);
      if (!profile || !researchProfile) {
        elements.recurrencePanel.innerHTML = `
          <div class="empty-state">当前 Dante word locus 正在按词加载。occurrence explorer 与 boundary note 会在对应词位 profile 到达后更新。</div>
        `;
        return;
      }
      const sourceTerms = buildContrastiveInterpretiveTerms(payload, researchProfile).slice(0, 5);
      const candidates = buildRecurrenceCandidates(payload, bundle);
      const candidateCards = candidates
        .map((candidate) => {
          const highlightTerms = [state.selectedLocus?.surface_form, state.selectedLocus?.normalized_form, ...(candidate.sharedTerms || [])].filter(Boolean);
          const fieldPills = (candidate.sharedFields || [])
            .map((field) => `<span class="pill">${escapeHtml(field)}</span>`)
            .join("");
          const termPills = (candidate.sharedTerms || [])
            .map((term) => `<span class="pill">${escapeHtml(term)}</span>`)
            .join("");

          return `
            <article class="micro-context-card">
              <div class="micro-context-head">
                <strong>${escapeHtml(formatShortCommediaLocation(candidate.cantica, candidate.canto, candidate.line_number))}</strong>
                <span class="pill">echo score ${candidate.score.toFixed(1)}</span>
              </div>
              <p class="semantic-intro">${escapeHtml(candidate.reason || "candidate semantic echo")}</p>
              <div class="occurrence-context-line">${highlightDualTerms(candidate.line_text, highlightTerms)}</div>
              <div class="locus-meta-row">
                ${candidate.sameForm ? `<span class="pill">same exact-form word</span>` : ""}
                ${candidate.sameFamily ? `<span class="pill">same word family</span>` : ""}
                ${termPills}
                ${fieldPills}
              </div>
              <div class="semantic-action-row">
                <button type="button" class="ghost-button" data-occurrence-sample="${candidate.sample}" data-occurrence-line="${candidate.line_number}" data-occurrence-locus="${escapeHtml(candidate.jumpLocusNormalized || state.selectedLocus?.normalized_form || "")}">跳到这一 locus</button>
              </div>
            </article>
          `;
        })
        .join("");

      elements.recurrencePanel.innerHTML = `
        <div class="semantic-kicker">Cross-Canto Echoes</div>
        <div class="title-with-help section-title-with-help">
          <h3>Candidate Echoes for “${escapeHtml(state.selectedLocus.surface_form)}”</h3>
          ${renderHelpButton("recurrence-candidates", "Candidate Echoes 说明")}
        </div>
        <p class="semantic-intro">这里现在不再只是 boundary note，而是把当前词位的 top contrastive interpretive terms 放回全《神曲》 line profiles 里做 cross-canto ranking。它仍然只是 candidate semantic echo / recurrence hint，不是 philological verdict。${familyIsActive ? `当前 locus 同时开启了 <strong>${escapeHtml(family.label)}</strong> 的 word-family pilot，所以 ranking 也会把这一小组显性词形变化一并算入。` : ""}</p>
        <div class="locus-meta-row">
          <span class="pill coverage-pill">Line ${payload.line_number}</span>
          ${familyIsActive ? `<span class="pill is-active">family pilot · ${escapeHtml(family.label)}</span>` : ""}
        </div>
        <p class="semantic-intro">当前 ranking 的证据主要来自三层：${familyIsActive ? "word-family / exact-form locus" : "exact-form locus"}、shared contrastive terms、shared local field labels。也就是说，我们是在做 corpus-scale echo suggestion，而不是自动判定真正的跨 canto 互文。</p>
        <div class="semantic-action-row">
          <span class="analysis-label">Source contrastive terms</span>
        </div>
        <div class="locus-meta-row">
          ${sourceTerms.map((item) => `<span class="pill">${escapeHtml(item.term)} · ${item.contrastiveScore.toFixed(1)}</span>`).join("") || `<span class="pill">contrastive terms pending</span>`}
        </div>
        <div class="vocabulary-section">
          <div>
            <h4>Cross-Canto Candidate Echoes</h4>
            <div class="field-grid recurrence-grid">${candidateCards || `<div class="empty-state">当前这个 locus 还没有足够稳定的 cross-canto echo candidates。</div>`}</div>
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
