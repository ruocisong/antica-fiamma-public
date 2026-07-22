(function attachDDPSemanticPanel(global) {
  function createSemanticPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
      selectLine,
    } = deps;

    function renderSemanticPanel(payload, semanticState) {
      if (!semanticState.fields.length) {
        elements.semanticPanel.innerHTML = `<div class="empty-state">这一行暂时还没有足够稳定的 semantic fields。</div>`;
        return;
      }

      const filterField = semanticState.fields.find((field) => field.id === state.activeSemanticField) || null;
      const filterNote = filterField
        ? `
          <div class="semantic-filter-note">
            当前只显示 field <strong>${escapeHtml(filterField.label)}</strong> 对应的 ${filterField.recordCount} 条 records。
            <button class="ghost-button" type="button" id="clear-semantic-filter">显示全部</button>
          </div>
        `
        : `<p class="semantic-intro">这些 interpretive semantic fields 现在优先基于当前 locus 覆盖 records 的局部语义表示来分组；词项、canonical map 和 span 权重仍然保留为辅助解释层。点击任一 field 可直接过滤下方 cards。</p>`;

      const fieldCards = semanticState.fields
        .map((field) => {
          const referHtml = field.crossLineReferences.length
            ? `
              <div class="semantic-refer-title">Cross-line Refer</div>
              <div class="semantic-refer-list">
                ${field.crossLineReferences
                  .map(
                    (refer) => `
                      <div class="semantic-refer">
                        <button type="button" data-refer-line="${refer.line_number}">
                          Line ${refer.line_number}: ${escapeHtml(refer.line_text || "")}
                        </button>
                        <span class="semantic-refer-score">${refer.shared_terms.join(", ")}</span>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : "";

          return `
            <article class="semantic-field ${state.activeSemanticField === field.id ? "is-active" : ""}" data-field-id="${field.id}">
              <div class="semantic-field-head">
                <div>
                  <h4>${escapeHtml(field.label)}</h4>
                  <p class="semantic-terms">${escapeHtml(field.representativeTerms.join(", "))}</p>
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
        <h3>Local Semantic Fields for Line ${payload.line_number}</h3>
        ${filterNote}
        <div class="semantic-field-grid">${fieldCards}</div>
      `;

      elements.semanticPanel.querySelectorAll("[data-field-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const fieldId = button.dataset.fieldId;
          state.activeSemanticField = state.activeSemanticField === fieldId ? null : fieldId;
          deps.renderLineRecords(payload);
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
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const lineNumber = Number(button.dataset.referLine);
          if (Number.isFinite(lineNumber)) {
            selectLine(lineNumber);
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
