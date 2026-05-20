(function attachDDPCoveragePanel(global) {
  function createCoveragePanel(deps) {
    const {
      state,
      elements,
      documentRef,
      buildCanonicalHref,
      escapeHtml,
      renderSelectableLineMarkup,
      canSampleOpenLineWorkbench,
      handleCoverageRowSelection,
      handleCoverageLocusSelection,
      clearAnalysisSummary,
      formatNumber,
      renderModuleLabel,
    } = deps;

    function resetCoverageListViewport() {
      if (!elements.coverageList) {
        return;
      }
      const reset = () => {
        if (Number.isFinite(Number(state.selectedLine))) {
          return;
        }
        elements.coverageList.scrollTop = 0;
        elements.coverageList.scrollLeft = 0;
      };
      reset();
      const raf = typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : (callback) => globalThis.setTimeout(callback, 0);
      raf(() => {
        reset();
        raf(() => {
          reset();
        });
      });
    }

    function renderCoverage() {
      const isEnglish = state.uiLanguage === "en";
      const chooseText = (en, zh) => (isEnglish ? en : zh);
      if (!state.overview || !Array.isArray(state.overview.lines)) {
        elements.coverageList.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("This sample does not yet expose line-by-line coverage data for in-site reading.", "当前 sample 还没有可供站内读取的逐行 coverage 数据。"))}</div>`;
        return;
      }
      const buttons = state.overview.lines.map((line) => {
        const row = documentRef.createElement("article");
        const permalink = buildCanonicalHref(
          state.currentSampleEntry?.id || state.overview.sample,
          line.line_number,
        );
        row.className = "coverage-row";
        if (!canSampleOpenLineWorkbench(state.currentSampleEntry)) {
          row.classList.add("is-shell");
        }
        const coverageRatio = Number(line.coverage_ratio || 0);
        const visualRatio = Math.min(1, Math.pow(Math.max(0, coverageRatio), 0.72));
        row.style.setProperty("--ratio", String(coverageRatio));
        row.style.setProperty("--visual-ratio", String(visualRatio));
        row.dataset.lineNumber = String(line.line_number);
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.innerHTML = `
          <div class="coverage-row-main">
            <div class="line-text line-locus-stream coverage-line-locus-stream">${line.line_text ? renderSelectableLineMarkup(line, { dataAttribute: "data-coverage-locus-id", markInitialLetter: true }) : escapeHtml("No base text captured for this line.")}</div>
            <a class="line-number coverage-link" href="${permalink}" data-line-link="${line.line_number}" aria-label="${escapeHtml(chooseText(`Open line ${line.line_number}`, `打开第 ${line.line_number} 行`))}">${line.line_number}</a>
          </div>
        `;
        row.addEventListener("click", () => handleCoverageRowSelection(line.line_number));
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleCoverageRowSelection(line.line_number);
          }
        });
        row.querySelector("[data-line-link]")?.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await handleCoverageRowSelection(line.line_number);
        });
        row.querySelectorAll("[data-coverage-locus-id]").forEach((button) => {
          button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await handleCoverageLocusSelection(line.line_number, button.dataset.coverageLocusId);
          });
        });
        return row;
      });

      elements.coverageList.replaceChildren(...buttons);
      resetCoverageListViewport();
    }

    function renderShellSample(entry) {
      const enabledModules = Object.entries(entry.modules || {})
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => renderModuleLabel(key));
      const disabledModules = Object.entries(entry.modules || {})
        .filter(([, enabled]) => !enabled)
        .map(([key]) => renderModuleLabel(key));

      const statusBlock = `
        <div class="shell-status-card">
          <div class="analysis-kicker">Corpus Status</div>
          <h3>${escapeHtml(entry.title)}</h3>
          <p class="analysis-lead">${escapeHtml(entry.status_note || "This canto is mounted honestly with partial capability.")}</p>
          <div class="analysis-metrics">
            <div class="analysis-metric">
              <span class="analysis-label">Status</span>
              <strong>${escapeHtml(entry.status_label)}</strong>
              <p>${escapeHtml(entry.id)}</p>
            </div>
            <div class="analysis-metric">
              <span class="analysis-label">Available</span>
              <strong>${enabledModules.length ? escapeHtml(enabledModules.join(" / ")) : "No live modules"}</strong>
              <p>${formatNumber(entry.record_count || 0)} records currently visible in the corpus map.</p>
            </div>
            <div class="analysis-metric">
              <span class="analysis-label">Withheld</span>
              <strong>${disabledModules.length ? escapeHtml(disabledModules.join(" / ")) : "None"}</strong>
              <p>${escapeHtml(chooseText("Unready modules stay visibly unready.", "今晚不把未就绪模块伪装成已完成。"))}</p>
            </div>
          </div>
        </div>
      `;

      clearAnalysisSummary();
      elements.coverageList.innerHTML = `
        ${statusBlock}
        <div class="empty-state">${escapeHtml(chooseText("This canto does not currently expose a line-by-line coverage view. Please follow the status note above.", "这一 canto 目前没有开放逐行 coverage 视图；请以上方状态说明为准。"))}</div>
      `;
      elements.lineTitle.textContent = `${entry.title} · ${entry.status_label}`;
      elements.lineContext.innerHTML = `
        <strong>${escapeHtml(entry.title)}</strong><br />
        ${escapeHtml(chooseText("Current status:", "当前状态："))} <strong>${escapeHtml(entry.status_label)}</strong> ${escapeHtml(entry.status_note || "")}
      `;
      elements.semanticPanel.innerHTML = `
        <div class="shell-status-card">
          <div class="semantic-kicker">Honest Shell</div>
          <h3>Modules for ${escapeHtml(entry.title)}</h3>
          <p class="semantic-intro">${escapeHtml(chooseText("This canto is mounted in the demo, but only the modules that are genuinely ready are open. The interface does not pretend to be fuller than the data allows.", "这个 canto 已经挂进 demo 导航，但只开放当前真实就绪的模块，避免页面看起来“像完整”，实际却没有稳定数据支撑。"))}</p>
        </div>
      `;
      elements.locusPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("Dante word-level loci are not open for this sample yet.", "当前 sample 还没有开放 Dante word-level loci。"))}</div>`;
      elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(chooseText("Interpretive vocabulary opens only for samples with line-level data ready.", "Interpretive Vocabulary loci 只会在 line-level data ready 的 sample 中开放。"))}</div>`;
      elements.recordsList.innerHTML = `
        <div class="empty-state">${escapeHtml(chooseText("Close reading cards are not open for this canto yet.", "这一 canto 今晚不开放 commentary cards 细读。等语义层和行级入口都稳定后，再继续向前接。"))}</div>
      `;
      elements.compareSummary.textContent = chooseText(`This sample is ${entry.status_label}, so Compare stays closed.`, `当前 sample 为 ${entry.status_label}，比较区不开放。`);
      elements.compareList.innerHTML = `
        <div class="empty-state">${escapeHtml(chooseText("Compare opens only when both records and semantic fields are ready.", "只有当 records 与 semantic fields 都 ready 时，比较区才会开放。"))}</div>
      `;
    }

    function renderCoverageOnlyLine(lineNumber) {
      const isEnglish = state.uiLanguage === "en";
      const chooseText = (en, zh) => (isEnglish ? en : zh);
      const line = (state.overview?.lines || []).find((item) => item.line_number === lineNumber);
      const title = line?.line_text ? `Line ${line.line_number}: ${line.line_text}` : `Line ${lineNumber}`;
      clearAnalysisSummary();
      elements.lineTitle.textContent = `${title} · Coverage Only`;
      elements.lineContext.innerHTML = `
        <strong>${escapeHtml(title)}</strong><br />
        ${escapeHtml(chooseText("This canto currently exposes only line-by-line coverage. Record cards, semantic fields, and the comparison workspace are intentionally still withheld.", "这一 canto 当前只开放逐行 coverage 入口；record cards、semantic fields 和 comparison workspace 故意还没上站。"))}
      `;
      elements.semanticPanel.innerHTML = `
        <div class="shell-status-card">
          <div class="semantic-kicker">Coverage Only</div>
          <h3>${escapeHtml(state.currentSampleEntry?.title || "Current sample")}</h3>
          <p class="semantic-intro">${escapeHtml(chooseText("This is an honest shell: coverage is mounted, but commentary cards and semantic fields are still closed, so the page does not pretend that deep reading is available yet.", "你现在看到的是一个 honest shell：coverage 已经挂进站点，但 commentary cards 和 semantic fields 还没开放，所以这里不假装可以深读。"))}</p>
        </div>
      `;
      elements.locusPanel.innerHTML = `
        <div class="empty-state">${escapeHtml(chooseText("The Dante line remains visible here, but word-level loci open only when line-level record data is ready.", "当前 line 仍可见 Dante 原文，但 word-level loci 只在 line-level record data ready 后开放。"))}</div>
      `;
      elements.vocabularyPanel.innerHTML = `
        <div class="empty-state">${escapeHtml(chooseText("This sample currently stops at coverage, so the interpretive vocabulary panel remains closed.", "当前 sample 只到 coverage，因此还没有可支撑的 interpretive vocabulary panel。"))}</div>
      `;
      elements.recordsList.innerHTML = `
        <div class="empty-state">${escapeHtml(chooseText("There are no in-site line-level record cards available for this sample yet.", "当前 sample 还没有站内可读的 line-level record cards。请先把 semantic fields / cards 数据生成好，再继续开放细读区。"))}</div>
      `;
      elements.compareSummary.textContent = chooseText("Compare stays closed for a coverage-only sample.", "Coverage-only sample 不开放比较区。");
      elements.compareList.innerHTML = `
        <div class="empty-state">${escapeHtml(chooseText("Compare opens only when both records and semantic fields are ready.", "只有当 records 与 semantic fields 都 ready 时，比较区才会开放。"))}</div>
      `;
    }

    return Object.freeze({
      renderCoverage,
      renderShellSample,
      renderCoverageOnlyLine,
    });
  }

  global.DDPCoveragePanel = Object.freeze({
    createCoveragePanel,
  });
})(window);
