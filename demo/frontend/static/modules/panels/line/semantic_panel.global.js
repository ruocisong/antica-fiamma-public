(function attachDDPSemanticPanel(global) {
  function createSemanticPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
      selectLine,
      scrollToCoverageLine,
      scrollToCommentarySection,
      formatShortCommediaLocation,
    } = deps;

    function renderSemanticPanel(payload, semanticState) {
      const isEnglish = state.uiLanguage === "en";
      const chooseText = (en, zh) => (isEnglish ? en : zh);
      if (!semanticState.fields.length) {
        elements.semanticPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("No stable interpretive fields are available for this line yet.", "这一行暂时还没有足够稳定的 interpretive fields / 解释场。"))}</div>`;
        return;
      }

      const filterField = semanticState.fields.find((field) => field.id === state.activeSemanticField) || null;
      const filterNote = filterField
        ? `
          <div class="semantic-filter-note">
            ${escapeHtml(chooseText(`Now showing only "${filterField.displayHeading || filterField.label}" across ${filterField.recordCount} commentary records.`, `当前只显示「${filterField.displayHeading || filterField.label}」这一组解释方向，对应 ${filterField.recordCount} 条 commentary records。`))}
            <button class="ghost-button" type="button" id="clear-semantic-filter">${escapeHtml(chooseText("Show all fields", "显示全部 fields"))}</button>
          </div>
        `
        : `
          <p class="semantic-intro">${escapeHtml(chooseText("This panel gathers the commentary records reaching the current line into a few steadier local interpretive directions. These fields are derived from clustering of commentary language, not Dante's own text. Click any field to filter the related cards below.", "这一层会把真正覆盖当前行的 commentary records 收成几组更稳的局部解释方向。这些 fields 来自 commentary language 的局部聚类，不是但丁原文自己的主题分类。点击任一 field，就会直接过滤下方 related cards。"))}</p>
        `;

      const fieldCards = semanticState.fields
        .map((field) => {
          const referHtml = field.crossLineReferences.length
            ? `
              <div class="semantic-refer-title">${escapeHtml(chooseText("Cross-line Refer", "Cross-line Refer"))}</div>
              <div class="semantic-refer-list">
                ${field.crossLineReferences
                  .map(
                    (refer) => {
                      const referCantica = refer.cantica || state.currentSampleEntry?.cantica;
                      const referCanto = refer.canto || state.currentSampleEntry?.canto;
                      const sameCanto = String(referCantica || "") === String(state.currentSampleEntry?.cantica || "")
                        && String(referCanto || "") === String(state.currentSampleEntry?.canto || "");
                      const locationLabel = formatShortCommediaLocation(
                        referCantica,
                        referCanto,
                        refer.line_number,
                        ...(Array.isArray(refer.line_numbers) ? refer.line_numbers.filter((value) => Number(value) !== Number(refer.line_number)) : [])
                      );
                      return `
                        <div class="semantic-refer">
                          <button type="button" class="reading-result-link semantic-result-link" data-refer-line="${refer.line_number}">
                            ${escapeHtml(locationLabel)}: ${escapeHtml(refer.line_text || "")}
                          </button>
                          <span class="semantic-refer-score">${refer.shared_terms.join(", ")}</span>
                        </div>
                      `;
                    }
                  )
                  .join("")}
              </div>
            `
            : "";

          return `
            <article class="semantic-field ${state.activeSemanticField === field.id ? "is-active" : ""}" data-field-id="${field.id}">
              <div class="semantic-field-head">
                <div>
                  <h4>${escapeHtml(field.displayHeading || field.label)}</h4>
                  <p class="semantic-terms semantic-aka-line">${escapeHtml((field.displayRepresentativeTerms || field.representativeTerms || []).join(", "))}</p>
                </div>
                <span class="semantic-count">${field.recordCount} records</span>
              </div>
              <div class="semantic-action-row">
                <span class="analysis-label">Representative terms</span>
                <span class="semantic-count">${field.recordShare}%</span>
              </div>
              ${referHtml}
            </article>
          `;
        })
        .join("");

      elements.semanticPanel.innerHTML = `
        <div class="semantic-kicker">Interpretive Fields</div>
        <div class="title-with-help section-title-with-help">
          <h3 class="panel-location-heading panel-location-heading-inline">
            <span class="panel-location-title">${escapeHtml(formatShortCommediaLocation(state.currentSampleEntry?.cantica, state.currentSampleEntry?.canto, payload.line_number) || `Line ${payload.line_number}`)}:</span>${payload.line_text ? ` <span class="panel-location-text">${escapeHtml(payload.line_text)}</span>` : ""}
          </h3>
          ${renderHelpButton("semantic-fields", "Interpretive Fields Guide")}
        </div>
        <div class="locus-meta-row">
          <span class="pill coverage-pill">${escapeHtml(chooseText("Sentence / Record Layer", "句段 / record 层"))}</span>
          <span class="pill">${escapeHtml(chooseText("unit: commentary records reaching this line", "单位：真正覆盖到这一行的 commentary records"))}</span>
          <span class="pill">${escapeHtml(chooseText("goal: local interpretive directions, not raw token frequency", "目标：局部解释方向，不是原始 token 词频"))}</span>
        </div>
        ${filterNote}
        <div class="semantic-field-grid">${fieldCards}</div>
      `;

      elements.semanticPanel.querySelectorAll("[data-field-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const fieldId = button.dataset.fieldId;
          state.activeSemanticField = state.activeSemanticField === fieldId ? null : fieldId;
          deps.renderLineRecords(payload);
          if (state.activeSemanticField) {
            requestAnimationFrame(() => {
              const target = elements.recordsList?.querySelector(".record-card") || elements.commentarySection;
              target?.scrollIntoView({ behavior: "smooth", block: "start" });
              scrollToCommentarySection?.();
            });
          }
        });
      });

      const clearFilter = document.getElementById("clear-semantic-filter");
      if (clearFilter) {
        clearFilter.addEventListener("click", () => {
          state.activeSemanticField = null;
          deps.renderLineRecords(payload);
        });
      }

      elements.semanticPanel.querySelectorAll("[data-refer-line]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const lineNumber = Number(button.dataset.referLine);
          if (Number.isFinite(lineNumber)) {
            await selectLine(lineNumber);
            scrollToCoverageLine?.(lineNumber);
          }
        });
      });
    }

    return Object.freeze({
      renderSemanticPanel,
    });
  }

  global.DDPSemanticPanel = Object.freeze({
    createSemanticPanel,
  });
})(window);
