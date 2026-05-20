(function attachDDPLineLevelPanel(global) {
  function createLineLevelPanel(deps) {
    const {
      state,
      elements,
      escapeHtml,
      renderHelpButton,
      buildRecurrenceCandidates,
      buildLineEchoSourceTerms,
      buildLineEchoSourceFields,
      formatShortCommediaLocation,
      jumpToSampleLine,
    } = deps;

    function chooseText(english, chinese) {
      return state.uiLanguage === "en" ? english : chinese;
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
          <h3 class="panel-location-heading panel-location-heading-inline">
            <span class="panel-location-title">${escapeHtml(formatShortCommediaLocation(state.currentSampleEntry?.cantica, state.currentSampleEntry?.canto, payload.line_number) || `Line ${payload.line_number}`)}:</span>${payload.line_text ? ` <span class="panel-location-text">${escapeHtml(payload.line_text)}</span>` : ""}
          </h3>
          ${renderHelpButton("recurrence-candidates", "Cross-Canto Echoes Guide")}
        </div>
        <div class="locus-meta-row">
          <span class="pill coverage-pill">${escapeHtml(chooseText("Sentence / Echo Layer", "句段 / echo 层"))}</span>
          <span class="pill">${escapeHtml(chooseText("unit: this line + terzina", "单位：当前这一行 + terzina"))}</span>
          <span class="pill">${escapeHtml(chooseText("goal: lines worth reading beside it", "目标：找值得与这一行并读的 lines"))}</span>
          <span class="pill">${escapeHtml(chooseText("text-first ranking", "text-first 排序"))}</span>
          <span class="pill">${escapeHtml(chooseText("commentary: light support", "commentary：轻辅助"))}</span>
        </div>
        <p class="semantic-intro">${escapeHtml(chooseText(
          "This text-first layer looks for other lines that genuinely deserve to be read beside the current line. It shows the strongest visible echoes first: reviewable echoes when they exist, and thinner but still readable echoes when they do not.",
          "这一层会去找那些真的值得和当前这一行并读的别的 lines，并优先显示当前最可见的 echoes：有 reviewable echoes 时先显示它们；没有时就直接显示 thinner 但仍可读的 echoes。"
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
      renderRecurrencePanel,
    });
  }

  global.DDPLineLevelPanel = Object.freeze({
    createLineLevelPanel,
  });
})(window);
