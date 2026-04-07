(function attachDDPRecordsPanel(global) {
  function createRecordsPanel(deps) {
    const {
      state,
      elements,
      documentRef,
      escapeHtml,
      fetchJson,
      getPayloadLoci,
      isLocusSelectableInWorkbench,
      renderLineContext,
      renderAnalysisSummary,
      getSemanticStateForPayload,
      getActiveHighlightTerms,
      buildAuthorityLexiconHighlightGroupsForText,
      makeRecordSorter,
      recordMatchesInterpretiveTerm,
      shouldShowExpandToggle,
      togglePin,
      toggleExpanded,
      buildPills,
      renderRecordBody,
      renderReadingBody,
      jumpToSampleLine,
      formatShortCommediaLocation,
      tokenizeCompareText,
      getSelectedWordProfileBundle,
      getLocalizedInterpretiveTerms,
      buildContrastiveInterpretiveTerms,
      getRelatedFieldsForLocus,
      ensureAuthorityLayerLoaded,
      ensureAuthorityHighlightLexiconLoaded,
      normalizeAuthorityCommentaryName,
      openAuthorityAuthorFromCompare,
      parseNavigationQuery,
    } = deps;

    function chooseText(english, chinese) {
      return state.uiLanguage === "en" ? english : chinese;
    }

    function truncateText(text, maxLength = 140) {
      const normalized = String(text || "").replace(/\s+/g, " ").trim();
      if (!normalized || normalized.length <= maxLength) {
        return normalized;
      }
      return `${normalized.slice(0, maxLength - 1).trim()}…`;
    }

    function normalizeRecordDisplayText(text) {
      return String(text || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function dedupeRecordsForDisplay(records) {
      const seen = new Set();
      return (records || []).filter((record) => {
        const signature = [
          record?.commentary_name || "",
          record?.line_info || "",
          record?.date_label || "",
          record?.century_label || "",
          normalizeRecordDisplayText(record?.record_summary || ""),
          normalizeRecordDisplayText(record?.record_text_preview || ""),
        ].join("||");
        if (seen.has(signature)) {
          return false;
        }
        seen.add(signature);
        return true;
      });
    }

    function summarizeLocationLabel(item) {
      if (item.locationLabel) {
        return item.locationLabel;
      }
      if (item.record?.cantica && item.record?.canto && Number.isFinite(item.activeLineNumber)) {
        return formatShortCommediaLocation(item.record.cantica, item.record.canto, item.activeLineNumber);
      }
      if (Number.isFinite(item.activeLineNumber)) {
        return chooseText(`Line ${item.activeLineNumber}`, `第 ${item.activeLineNumber} 行`);
      }
      return chooseText("Pinned context", "pin 时上下文");
    }

    function buildSharedCompareHeading(items) {
      if (!Array.isArray(items) || !items.length) {
        return "";
      }
      const locationLabels = [...new Set(items.map((item) => summarizeLocationLabel(item)).filter(Boolean))];
      const lineTexts = [...new Set(items.map((item) => normalizeRecordDisplayText(item.lineText || "")).filter(Boolean))];
      if (locationLabels.length !== 1 || lineTexts.length !== 1) {
        return "";
      }
      return `${locationLabels[0]} · ${truncateText(lineTexts[0], 88)}`;
    }

    function buildTermCountMap(tokens = []) {
      const counts = new Map();
      tokens.forEach((token) => {
        counts.set(token, (counts.get(token) || 0) + 1);
      });
      return counts;
    }

    const READING_FOCUS_STOPWORDS = new Set([
      "auctor",
      "autor",
      "autore",
      "capitolo",
      "capitulo",
      "capitulum",
      "capituli",
      "commento",
      "commentary",
      "dice",
      "dicit",
      "dictum",
      "dico",
      "ecetera",
      "idem",
      "igitur",
      "incipit",
      "incipiente",
      "linea",
      "littera",
      "literal",
      "litteral",
      "materia",
      "modo",
      "nunc",
      "primo",
      "prima",
      "primum",
      "primi",
      "princepio",
      "principio",
      "proemialis",
      "proemium",
      "quasi",
      "secundo",
      "tertio",
      "text",
      "testo",
      "verso",
      "verses",
      "virgilio",
    ]);

    function buildReadableCardHighlightTerms(item) {
      const compareText = `${item.record?.record_summary || ""} ${item.record?.record_text_preview || ""}`;
      const tokens = tokenizeCompareText ? tokenizeCompareText(compareText) : [];
      if (!tokens.length) {
        return [];
      }
      const textLength = String(compareText || "").replace(/\s+/g, " ").trim().length;
      const highlightLimit = Math.max(2, Math.min(5, Math.ceil(textLength / 220)));

      const tokenCounts = buildTermCountMap(tokens);
      const lineTokens = new Set(tokenizeCompareText ? tokenizeCompareText(item.lineText || "") : []);
      const leadingTokens = new Set(
        tokenizeCompareText ? tokenizeCompareText(String(compareText).slice(0, 220)) : []
      );

      return [...tokenCounts.entries()]
        .filter(([term]) => !lineTokens.has(term))
        .filter(([term]) => !READING_FOCUS_STOPWORDS.has(term))
        .filter(([term]) => String(term || "").length >= 5)
        .map(([term, count]) => {
          let score = count * 3;
          if (leadingTokens.has(term)) {
            score += 2;
          }
          if (count >= 2) {
            score += 2;
          }
          if (term.length >= 6 && term.length <= 10) {
            score += 1;
          }
          return { term, score, count };
        })
        .filter((item) => item.score >= 4)
        .sort((left, right) => right.score - left.score || right.count - left.count || left.term.localeCompare(right.term))
        .slice(0, highlightLimit)
        .map((item) => item.term);
    }

    function buildAuthorityHighlightTerms(authorityHits = []) {
      return [...new Set(
        (authorityHits || []).flatMap((hit) => [
          hit?.canonicalName || "",
          ...(hit?.works || []).slice(0, 2),
          ...(hit?.mentions || [])
            .map((term) => String(term || "").trim())
            .filter((term) => term && term.length <= 48 && term.split(/\s+/).length <= 5)
            .slice(0, 2),
        ])
          .map((term) => String(term || "").trim())
          .filter(Boolean)
      )].slice(0, 6);
    }

    function renderTermChip(label, note = "") {
      return `
        <span class="term-chip">
          <strong>${escapeHtml(label)}</strong>
          ${note ? `<small>${escapeHtml(note)}</small>` : ""}
        </span>
      `;
    }

    function renderFieldChip(label, note = "") {
      return `
        <span class="related-field-chip">
          <strong>${escapeHtml(label)}</strong>
          ${note ? `<small>${escapeHtml(note)}</small>` : ""}
        </span>
      `;
    }

    function renderSignalSection(title, markup, modifier = "") {
      if (!markup) {
        return "";
      }
      return `
        <section class="compare-card-section ${modifier}">
          <span class="analysis-label">${escapeHtml(title)}</span>
          ${markup}
        </section>
      `;
    }

    let authorityIndex = null;
    let authorityIndexPromise = null;

    function normalizeCompareCommentaryName(name) {
      const normalized = normalizeAuthorityCommentaryName
        ? normalizeAuthorityCommentaryName(name)
        : String(name || "").trim();
      return normalized.toLowerCase().replace(/\s+/g, " ").trim();
    }

    function inferOccurrenceSampleId(occurrence) {
      if (occurrence?.sample_id) {
        return occurrence.sample_id;
      }
      if (occurrence?.sample_name) {
        return occurrence.sample_name;
      }
      const cantica = String(occurrence?.cantica || "").trim().toLowerCase();
      const canto = Number(occurrence?.canto);
      if (!cantica || !Number.isFinite(canto)) {
        return null;
      }
      return `${cantica}${canto}`;
    }

    function parseLineInfoRange(lineInfo) {
      const matches = String(lineInfo || "").match(/\d+/g) || [];
      const numbers = matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
      if (!numbers.length) {
        return null;
      }
      return {
        start: numbers[0],
        end: numbers.length > 1 ? numbers[1] : numbers[0],
      };
    }

    function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
      return Math.max(leftStart, rightStart) <= Math.min(leftEnd, rightEnd);
    }

    function escapeAttribute(value) {
      return escapeHtml(String(value ?? "")).replace(/"/g, "&quot;");
    }

    function renderCompareActionChip(label, attributes = "", note = "") {
      return `
        <button type="button" class="compare-link-chip" ${attributes}>
          <strong>${escapeHtml(label)}</strong>
          ${note ? `<small>${escapeHtml(note)}</small>` : ""}
        </button>
      `;
    }

    function formatContextLabel(item) {
      const pieces = [];
      pieces.push(chooseText(`Pinned ${item.record?.commentary_name || "record"}`, `已 pin：${item.record?.commentary_name || "record"}`));
      if (Number.isFinite(item.activeLineNumber)) {
        pieces.push(chooseText(`line ${item.activeLineNumber}`, `line ${item.activeLineNumber}`));
      }
      if (Number.isFinite(item.record?.line_span)) {
        pieces.push(item.record.line_span === 1
          ? chooseText("single-line", "单行")
          : chooseText(`${item.record.line_start}-${item.record.line_end}`, `${item.record.line_start}-${item.record.line_end}`));
      }
      if (item.record?.date_label || item.record?.century_label) {
        pieces.push([item.record.date_label, item.record.century_label].filter(Boolean).join(" / "));
      }
      return pieces.join(" · ");
    }

    function cleanSummaryCandidate(text) {
      return String(text || "")
        .replace(/\[[^\]]{1,80}\]\s*/g, "")
        .replace(/\{[^}]{0,120}\}/g, "")
        .replace(/\((?:Esposizione|Interpretazione|Parafrasi|Literal|Litteral|Allegor)[^)]+\)\s*/giu, "")
        .replace(/\s+/g, " ")
        .replace(/^[,;:.!?'"“”‘’()\-[\]\s]+/u, "")
        .replace(/[,;:.!?'"“”‘’()\-[\]\s]+$/u, "")
        .trim();
    }

    function extractTextDrivenSummary(item, cardModel) {
      if (item.record?.commentary_name === "Text of the Divine Comedy") {
        return "";
      }

      const sourceText = cleanSummaryCandidate(item.record?.record_text_preview || item.record?.record_summary || "");
      if (!sourceText) {
        return "";
      }

      const lineTextNeedle = String(item.lineText || "").replace(/\s+/g, " ").trim().toLowerCase();
      const lineTextTokens = new Set(tokenizeCompareText ? tokenizeCompareText(item.lineText || "") : []);
      const boilerplatePattern = /\b(?:dice adunque|in questo cominciamento|nunc ergo|breviter|dico che|appresso|qui l'autore|qui auctor|l'autore dice|autor dice|è da sapere|e da sapere|sciendum est|et cetera|\bec\b)\b/iu;
      const interpretivePattern = /\b(?:significa|mostra|vuol|vuole|intende|considera|dimostra|figura|allegor|litteral|literal|parla|chiama|interpreta|intitol|espone|denota)\b/iu;
      const sentenceCandidates = sourceText
        .split(/(?<=[.!?;:])\s+/u)
        .flatMap((sentence) => sentence.split(/\s+(?=onde\b|dove\b|ma\b|perch[eé]\b|cos[iì]\b)/iu))
        .map((candidate) => cleanSummaryCandidate(candidate))
        .filter(Boolean);

      const signalTokens = new Set([
        ...(item.semanticField?.terms || []),
        ...cardModel.sharedTermsForCard.map((entry) => entry.term),
        ...cardModel.distinctiveTerms,
        ...cardModel.locusMatches,
      ].flatMap((term) => tokenizeCompareText ? tokenizeCompareText(term) : [term]));

      let bestCandidate = "";
      let bestScore = -Infinity;
      sentenceCandidates.slice(0, 8).forEach((candidate, index) => {
        const words = candidate.split(/\s+/).filter(Boolean);
        if (words.length < 7) {
          return;
        }
        const lower = candidate.toLowerCase();
        const candidateTokens = new Set(tokenizeCompareText ? tokenizeCompareText(candidate) : words.map((word) => word.toLowerCase()));
        let score = 0;
        score += Math.max(0, 16 - index * 2);
        score += words.length >= 8 && words.length <= 28 ? 16 : words.length <= 36 ? 8 : -4;
        if (interpretivePattern.test(candidate)) {
          score += 10;
        }
        if (boilerplatePattern.test(candidate)) {
          score -= 12;
        }
        if (lineTextNeedle && lower.includes(lineTextNeedle)) {
          score -= 18;
        }
        if (lineTextTokens.size) {
          let overlap = 0;
          lineTextTokens.forEach((token) => {
            if (candidateTokens.has(token)) {
              overlap += 1;
            }
          });
          const overlapRatio = overlap / Math.max(1, Math.min(lineTextTokens.size, candidateTokens.size));
          if (overlapRatio >= 0.75) {
            score -= 36;
          } else if (overlapRatio >= 0.45) {
            score -= 14;
          }
        }
        if (/[{}[\]]/.test(candidate) || /\b(?:comm|cap|lib|ethic|somnio|psalmista)\b/iu.test(candidate)) {
          score -= 10;
        }
        let signalMatches = 0;
        signalTokens.forEach((token) => {
          if (candidateTokens.has(token)) {
            signalMatches += 1;
          }
        });
        score += Math.min(signalMatches, 5) * 4;
        score -= Math.max(0, words.length - 32);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      });

      if (!bestCandidate) {
        return "";
      }

      const trimmed = truncateText(bestCandidate, 180);
      if (!trimmed) {
        return "";
      }
      const lastChar = trimmed.slice(-1);
      const sentence = /[.!?…]$/u.test(lastChar) ? trimmed : `${trimmed}.`;
      return sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }

    function buildSignalFallbackSummary(item, cardModel, compareModel) {
      if (item.record?.commentary_name === "Text of the Divine Comedy") {
        return chooseText(
          "Directly cites the tercet to anchor the compare set on the poem's wording.",
          "直接引出诗句原文，把比较锚回诗面措辞。"
        );
      }

      if (item.semanticField?.label) {
        const support = compareModel.fieldCounts.get(item.semanticField.label) || 0;
        return support > 1
          ? chooseText(
              `Reads the passage through the shared ${item.semanticField.label} semantic field.`,
              `主要从共享的「${item.semanticField.label}」semantic field 来读这段。`
            )
          : chooseText(
              `Centers the passage on the ${item.semanticField.label} semantic field.`,
              `主要把这段读在「${item.semanticField.label}」这个 semantic field 上。`
            );
      }

      if (cardModel.authorityHits.length) {
        return chooseText(
          `Builds the reading around ${cardModel.authorityHits[0].canonicalName}.`,
          `阅读重心落在 ${cardModel.authorityHits[0].canonicalName} 上。`
        );
      }

      if (cardModel.pointers.length) {
        return chooseText(
          `Extends the reading outward toward ${cardModel.pointers[0].label}.`,
          `把阅读往 ${cardModel.pointers[0].label} 延伸出去。`
        );
      }

      const terms = cardModel.distinctiveTerms.slice(0, 2);
      if (terms.length) {
        return chooseText(
          `Keeps returning to ${terms.join(" / ")} as its local emphasis.`,
          `它的局部重心反复落在 ${terms.join(" / ")} 上。`
        );
      }

      return chooseText(
        "Offers a concentrated local reading of the pinned passage.",
        "对当前 pin 段落给出一条较集中的局部阅读。"
      );
    }

    function extractPointerTargets(item) {
      const compareText = `${item.record?.record_summary || ""} ${item.record?.record_text_preview || ""}`;
      const results = [];
      const seen = new Set();
      const currentStart = Number(item.record?.line_start || item.activeLineNumber || 0);
      const currentEnd = Number(item.record?.line_end || item.activeLineNumber || currentStart);

      const cantoRegex = /\b(?:Dante\s+)?(Inferno|Inf\.?|Purgatorio|Purg\.?|Paradiso|Par\.?)\s*([IVXLCDM]+|\d{1,2})(?:[.,]\s*|\s+)(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/giu;
      for (const match of compareText.matchAll(cantoRegex)) {
        const cantica = String(match[1] || "").toLowerCase().replace(/\./g, "");
        const alias = cantica.startsWith("inf")
          ? "inf"
          : cantica.startsWith("purg")
            ? "purg"
            : "par";
        const cantoRaw = String(match[2] || "");
        const lineRaw = Number(match[3]);
        const endRaw = Number(match[4] || match[3]);
        const request = parseNavigationQuery ? parseNavigationQuery(`${alias} ${cantoRaw} ${lineRaw}`) : null;
        if (request?.kind !== "line" || !request.sampleId || !Number.isFinite(request.lineNumber)) {
          continue;
        }
        if (request.sampleId === item.sampleId && rangesOverlap(currentStart, currentEnd, request.lineNumber, endRaw || request.lineNumber)) {
          continue;
        }
        const key = `${request.sampleId}:${request.lineNumber}:${endRaw || request.lineNumber}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push({
          matchedText: match[0],
          sampleId: request.sampleId,
          lineNumber: request.lineNumber,
          lineEnd: endRaw || request.lineNumber,
          label: formatShortCommediaLocation(
            request.entry?.cantica || request.sampleId.replace(/\d+$/, ""),
            request.entry?.canto || Number.NaN,
            request.lineNumber,
            ...(Number.isFinite(endRaw) && endRaw !== request.lineNumber ? [endRaw] : [])
          ),
        });
      }

      const localRegex = /\b(?:v\.\s*|vv\.\s*|vers(?:e|es)?\.?\s+)(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/giu;
      for (const match of compareText.matchAll(localRegex)) {
        if (!item.sampleId) {
          continue;
        }
        const lineNumber = Number(match[1]);
        const lineEnd = Number(match[2] || match[1]);
        if (!Number.isFinite(lineNumber)) {
          continue;
        }
        if (item.sampleId === state.currentSampleEntry?.id && rangesOverlap(currentStart, currentEnd, lineNumber, lineEnd)) {
          continue;
        }
        const key = `${item.sampleId}:${lineNumber}:${lineEnd}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push({
          matchedText: match[0],
          sampleId: item.sampleId,
          lineNumber,
          lineEnd,
          label: chooseText(`Line ${lineNumber}${lineEnd !== lineNumber ? `-${lineEnd}` : ""}`, `第 ${lineNumber}${lineEnd !== lineNumber ? `-${lineEnd}` : ""} 行`),
        });
      }

      return results.slice(0, 4);
    }

    function bindCompareInteractiveElements(root) {
      root.querySelectorAll("[data-compare-authority]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          await openAuthorityAuthorFromCompare?.(button.dataset.compareAuthority || "");
        });
      });

      root.querySelectorAll("[data-compare-pointer-sample]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const sampleId = button.dataset.comparePointerSample || "";
          const lineNumber = Number(button.dataset.comparePointerLine);
          if (!sampleId || !Number.isFinite(lineNumber)) {
            return;
          }
          await jumpToSampleLine(sampleId, lineNumber, null);
        });
      });
    }

    function ensureAuthorityIndexPrimed() {
      if (authorityIndex || authorityIndexPromise || !state.pinned.size) {
        return;
      }
      ensureCompareAuthorityIndexLoaded().then(() => {
        if (state.pinned.size) {
          renderPinned();
        }
      });
    }

    function ensureAuthorityHighlightLexiconPrimed() {
      if (state.authorityHighlightLexicon || state.authorityHighlightLexiconPromise || !ensureAuthorityHighlightLexiconLoaded) {
        return;
      }
      Promise.resolve(ensureAuthorityHighlightLexiconLoaded())
        .then(() => {
          if (state.selectedLine != null && state.lineCache.has(state.selectedLine)) {
            renderLineRecords(state.lineCache.get(state.selectedLine));
          }
          if (state.pinned.size) {
            renderPinned();
          }
        })
        .catch(() => {
          state.authorityHighlightLexicon = null;
        });
    }

    async function ensureCompareAuthorityIndexLoaded() {
      if (authorityIndex) {
        return authorityIndex;
      }
      if (authorityIndexPromise) {
        return authorityIndexPromise;
      }
      if (!ensureAuthorityLayerLoaded || !fetchJson) {
        authorityIndex = new Map();
        return authorityIndex;
      }

      authorityIndexPromise = Promise.resolve(ensureAuthorityLayerLoaded())
        .then((layer) => Promise.all(
          (layer?.authors || []).map(async (author) => {
            if (!author?.detail_path) {
              return author;
            }
            try {
              const payload = await fetchJson(author.detail_path);
              return payload?.author || author;
            } catch (error) {
              return author;
            }
          })
        ))
        .then((authors) => {
          const index = new Map();
          authors.forEach((author) => {
            (author?.occurrences || []).forEach((occurrence) => {
              const sampleId = inferOccurrenceSampleId(occurrence);
              const commentaryKey = normalizeCompareCommentaryName(occurrence.commentary_name);
              if (!sampleId || !commentaryKey) {
                return;
              }
              const key = `${sampleId}::${commentaryKey}`;
              if (!index.has(key)) {
                index.set(key, []);
              }
              index.get(key).push({
                ...occurrence,
                author_id: author.author_id || occurrence.author_id || "",
                canonical_name: author.canonical_name || occurrence.author || "",
              });
            });
          });
          authorityIndex = index;
          return index;
        })
        .catch(() => {
          authorityIndex = new Map();
          return authorityIndex;
        })
        .finally(() => {
          authorityIndexPromise = null;
        });
      return authorityIndexPromise;
    }

    function getAuthorityHitsForItem(item) {
      if (!authorityIndex) {
        ensureAuthorityIndexPrimed();
        return [];
      }
      const sampleId = item.sampleId;
      const commentaryKey = normalizeCompareCommentaryName(item.record?.commentary_name);
      if (!sampleId || !commentaryKey) {
        return [];
      }

      const start = Number(item.record?.line_start || item.activeLineNumber || 0);
      const end = Number(item.record?.line_end || item.activeLineNumber || start);
      const authorMap = new Map();

      (authorityIndex.get(`${sampleId}::${commentaryKey}`) || []).forEach((occurrence) => {
        const range = parseLineInfoRange(occurrence.line_info);
        if (range && !rangesOverlap(start, end, range.start, range.end)) {
          return;
        }
        const key = occurrence.author_id || occurrence.canonical_name || occurrence.author;
        if (!key) {
          return;
        }
        const existing = authorMap.get(key) || {
          authorId: occurrence.author_id || "",
          canonicalName: occurrence.canonical_name || occurrence.author || "Authority",
          works: [],
          mentions: [],
          count: 0,
        };
        existing.count += 1;
        if (occurrence.work && !existing.works.includes(occurrence.work)) {
          existing.works.push(occurrence.work);
        }
        if (occurrence.raw_mention && !existing.mentions.includes(occurrence.raw_mention)) {
          existing.mentions.push(occurrence.raw_mention);
        }
        authorMap.set(key, existing);
      });

      return [...authorMap.values()]
        .sort((left, right) => right.count - left.count || left.canonicalName.localeCompare(right.canonicalName))
        .slice(0, 4);
    }

    function buildLocusCompareSignal() {
      if (!state.selectedLocus || state.selectedLine == null) {
        return null;
      }

      const payload = state.lineCache.get(state.selectedLine);
      if (!payload) {
        return null;
      }

      const bundle = getSelectedWordProfileBundle?.() || null;
      const profile = bundle?.researchProfile || null;
      const localizedTerms = getLocalizedInterpretiveTerms
        ? getLocalizedInterpretiveTerms(payload, profile)
        : [];
      const contrastiveTerms = buildContrastiveInterpretiveTerms
        ? buildContrastiveInterpretiveTerms(payload, profile, localizedTerms)
        : [];
      const anchorTerms = [...new Set([
        state.selectedLocus.normalized_form,
        ...contrastiveTerms.slice(0, 5).map((item) => item.term),
        ...localizedTerms.slice(0, 5).map((item) => item.term),
      ].filter(Boolean))].slice(0, 6);

      if (!anchorTerms.length) {
        return null;
      }

      const relatedFields = getRelatedFieldsForLocus
        ? getRelatedFieldsForLocus(payload, localizedTerms)
        : [];

      return {
        surfaceForm: state.selectedLocus.surface_form || state.selectedLocus.normalized_form,
        normalizedForm: state.selectedLocus.normalized_form,
        anchorTerms,
        relatedFields,
      };
    }

    function buildCompareModel(items) {
      ensureAuthorityIndexPrimed();
      const cardModels = items.map((item) => {
        const compareText = `${item.record?.record_summary || ""} ${item.record?.record_text_preview || ""}`;
        const tokens = tokenizeCompareText ? tokenizeCompareText(compareText) : [];
        const tokenCounts = buildTermCountMap(tokens);
        const tokenSet = new Set(tokenCounts.keys());
        const authorityHits = getAuthorityHitsForItem(item);
        const pointers = extractPointerTargets(item);
        return {
          item,
          tokens,
          tokenCounts,
          tokenSet,
          authorityHits,
          pointers,
        };
      });

      const tokenSupport = new Map();
      const tokenTotals = new Map();
      cardModels.forEach((card) => {
        card.tokenSet.forEach((token) => {
          tokenSupport.set(token, (tokenSupport.get(token) || 0) + 1);
        });
        card.tokenCounts.forEach((count, token) => {
          tokenTotals.set(token, (tokenTotals.get(token) || 0) + count);
        });
      });

      const sharedTerms = [...tokenSupport.entries()]
        .filter(([, support]) => support >= 2)
        .sort((left, right) =>
          right[1] - left[1]
          || (tokenTotals.get(right[0]) || 0) - (tokenTotals.get(left[0]) || 0)
          || left[0].localeCompare(right[0]))
        .slice(0, 8)
        .map(([term, support]) => ({ term, support }));

      const fieldCounts = new Map();
      items.forEach((item) => {
        const label = item.semanticField?.label;
        if (label) {
          fieldCounts.set(label, (fieldCounts.get(label) || 0) + 1);
        }
      });

      const sharedFields = [...fieldCounts.entries()]
        .filter(([, support]) => support >= 2)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 5)
        .map(([label, support]) => ({ label, support }));

      const locusSignal = buildLocusCompareSignal();
      const commentatorCount = new Set(items.map((item) => item.record?.commentary_name).filter(Boolean)).size;
      const locationLabels = [...new Set(items.map((item) => summarizeLocationLabel(item)))];
      const singleCount = items.filter((item) => Number(item.record?.line_span || 0) === 1).length;
      const rangeCount = items.length - singleCount;
      const datedItems = items
        .map((item) => {
          const start = item.record?.year_start;
          const end = item.record?.year_end;
          const sortYear = start ?? end ?? null;
          return sortYear == null ? null : { item, sortYear };
        })
        .filter(Boolean)
        .sort((left, right) => left.sortYear - right.sortYear);
      const earliest = datedItems[0] || null;
      const latest = datedItems[datedItems.length - 1] || null;
      const centuryLabels = [...new Set(items.map((item) => item.record?.century_label).filter(Boolean))];
      const dateHeadline = earliest && latest
        ? (earliest.sortYear === latest.sortYear ? String(earliest.sortYear) : `${earliest.sortYear}-${latest.sortYear}`)
        : chooseText("date span pending", "年代跨度待定");

      const authorityCounts = new Map();
      cardModels.forEach((card) => {
        const seen = new Set();
        card.authorityHits.forEach((hit) => {
          const key = hit.authorId || hit.canonicalName;
          if (!key || seen.has(key)) {
            return;
          }
          seen.add(key);
          authorityCounts.set(key, {
            key,
            canonicalName: hit.canonicalName,
            authorId: hit.authorId,
            support: (authorityCounts.get(key)?.support || 0) + 1,
          });
        });
      });

      const sharedAuthorities = [...authorityCounts.values()]
        .filter((item) => item.support >= 2)
        .sort((left, right) => right.support - left.support || left.canonicalName.localeCompare(right.canonicalName))
        .slice(0, 5);

      const cards = cardModels.map((card) => {
        const distinctiveTerms = [...card.tokenCounts.entries()]
          .filter(([term]) => (tokenSupport.get(term) || 0) === 1)
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 4)
          .map(([term]) => term);
        const sharedTermsForCard = sharedTerms
          .filter((item) => card.tokenSet.has(item.term))
          .slice(0, 4);
        const locusMatches = locusSignal
          ? locusSignal.anchorTerms.filter((term) => recordMatchesInterpretiveTerm(card.item.record, term)).slice(0, 4)
          : [];
        return {
          ...card,
          distinctiveTerms,
          sharedTermsForCard,
          locusMatches,
          highlightTerms: buildReadableCardHighlightTerms(card.item),
          authorityHighlightTerms: buildAuthorityHighlightTerms(card.authorityHits),
        };
      });

      const cardsEchoingLocus = cards.filter((card) => card.locusMatches.length).length;
      const alignmentRows = cards.map((card) => {
        const fieldLabel = card.item.semanticField?.label || chooseText("No stable local field", "无稳定 local field");
        const isDistinctiveField = card.item.semanticField?.label
          ? (fieldCounts.get(card.item.semanticField.label) || 0) === 1
          : false;
        return {
          recordId: card.item.record.id,
          commentaryName: card.item.record.commentary_name,
          fieldLabel,
          isDistinctiveField,
        };
      });

      return {
        count: items.length,
        commentatorCount,
        locationLabels,
        singleCount,
        rangeCount,
        earliest,
        latest,
        centuryLabels,
        dateHeadline,
        sharedTerms,
        sharedFields,
        sharedAuthorities,
        fieldCounts,
        alignmentRows,
        locusSignal,
        cardsEchoingLocus,
        cards,
      };
    }

    function renderRecordCard(record, activeLineNumber, highlightTerms = [], options = {}) {
      const card = documentRef.createElement("article");
      card.className = `record-card ${state.activeSearchRecordId === record.id ? "is-search-target" : ""}`;
      card.dataset.recordId = record.id;
      card.id = `record-${record.id}`;
      const isExpanded = state.expanded.has(record.id);
      const canToggleExpand = shouldShowExpandToggle(record);
      const authorityHighlightTerms = Array.isArray(options.authorityHighlightTerms) ? options.authorityHighlightTerms : [];

      const pinButton = documentRef.createElement("button");
      pinButton.type = "button";
      pinButton.className = "pin-button";
      pinButton.textContent = state.pinned.has(record.id)
        ? chooseText("Pinned", "已 pin")
        : chooseText("Pin to Compare", "Pin 到比较区");
      pinButton.classList.toggle("is-active", state.pinned.has(record.id));
      pinButton.addEventListener("click", () => togglePin(record, activeLineNumber));

      card.innerHTML = `
        <div class="record-top">
          <div class="record-top-main">
            <div class="record-heading-row">
              <h3>${escapeHtml(record.commentary_name)}</h3>
              <div class="pill-row record-heading-pills">${buildPills(record, activeLineNumber)}</div>
            </div>
          </div>
        </div>
        <div class="record-preview ${isExpanded ? "is-expanded" : ""}">${renderRecordBody(
          record,
          isExpanded,
          highlightTerms,
          authorityHighlightTerms.length
            ? [{ terms: authorityHighlightTerms, className: "authority-citation-highlight" }]
            : []
        )}</div>
        <div class="record-actions"></div>
      `;

      card.querySelector(".record-top").appendChild(pinButton);
      if (canToggleExpand) {
        const expandButton = documentRef.createElement("button");
        expandButton.type = "button";
        expandButton.className = "inline-text-button";
        expandButton.textContent = isExpanded
          ? chooseText("↑ Collapse", "↑ Collapse")
          : chooseText("↘ Expand full text", "↘ Expand full text");
        expandButton.addEventListener("click", () => toggleExpanded(record.id));
        card.querySelector(".record-actions").appendChild(expandButton);
      } else {
        card.querySelector(".record-actions")?.remove();
      }

      return card;
    }

    function renderLineRecords(payload) {
      if (!payload) {
        return;
      }
      elements.locusPanel.hidden = true;
      const loci = getPayloadLoci(payload);
      if (state.selectedLocus && !loci.some((locus) => locus.id === state.selectedLocus.id && isLocusSelectableInWorkbench(locus))) {
        state.selectedLocus = null;
        state.activeInterpretiveTerm = null;
      }

      const lineLabel = payload.line_text ? `Line ${payload.line_number}: ${payload.line_text}` : `Line ${payload.line_number}`;
      elements.lineTitle.textContent = lineLabel;
      renderLineContext(payload);
      renderAnalysisSummary(payload);
      deps.renderLocusPanel(payload);
      deps.renderVocabularyPanel(payload);
      const semanticState = getSemanticStateForPayload(payload);
      deps.renderSemanticPanel(payload, semanticState);
      deps.renderRecurrencePanel(payload);
      const highlightTerms = getActiveHighlightTerms(semanticState);

      const records = [...payload.records].sort(makeRecordSorter(state.sortMode, state.sortDirection));
      const filteredRecords = records.filter((record) => {
        if (state.activeSemanticField && semanticState.recordToField.get(record.id) !== state.activeSemanticField) {
          return false;
        }
        if (state.activeInterpretiveTerm && !recordMatchesInterpretiveTerm(record, state.activeInterpretiveTerm)) {
          return false;
        }
        return true;
      });
      const visibleRecords = dedupeRecordsForDisplay(filteredRecords);

      if (!authorityIndex && !authorityIndexPromise && visibleRecords.length) {
        ensureCompareAuthorityIndexLoaded().then(() => {
          if (state.selectedLine === payload.line_number) {
            renderLineRecords(state.lineCache.get(payload.line_number));
          }
        });
      }

      if (state.activeSearchRecordId && !visibleRecords.some((record) => record.id === state.activeSearchRecordId)) {
        state.activeSearchRecordId = null;
      }

      if (visibleRecords.length === 0) {
        elements.recordsList.innerHTML = `<div class="empty-state">${
          state.activeSemanticField || state.activeInterpretiveTerm
            ? escapeHtml(chooseText("No commentary cards match the current filter.", "当前筛选条件下还没有匹配到注释卡片。"))
            : escapeHtml(chooseText("No in-site commentary cards are currently available for this line.", "这一行暂时没有站内可读的注释卡片。"))
        }</div>`;
        return;
      }

      const fieldLookup = new Map((semanticState.fields || []).map((field) => [field.id, field]));
      const summaryItems = visibleRecords.map((record) => {
        const fieldId = semanticState.recordToField.get(record.id) || null;
        const field = fieldLookup.get(fieldId) || null;
        return {
          record,
          activeLineNumber: payload.line_number,
          sampleId: state.currentSampleEntry?.id || null,
          sampleTitle: state.currentSampleEntry?.title || null,
          lineText: payload?.line_text || "",
          locationLabel: formatShortCommediaLocation(record.cantica, record.canto, payload.line_number),
          signatureTerms: Array.isArray(payload?.signature_terms) ? payload.signature_terms.slice(0, 8) : [],
          semanticField: field
            ? {
                id: field.id,
                label: field.displayHeading || field.label,
                terms: (field.displayRepresentativeTerms || field.representativeTerms || []).slice(0, 5),
              }
            : null,
          selectedLocus: state.selectedLocus
            ? {
                id: state.selectedLocus.id,
                surfaceForm: state.selectedLocus.surface_form,
                normalizedForm: state.selectedLocus.normalized_form,
              }
            : null,
        };
      });
      const authorityHighlightTermsByRecordId = new Map(
        summaryItems.map((item) => [item.record.id, buildAuthorityHighlightTerms(getAuthorityHitsForItem(item))])
      );
      ensureAuthorityHighlightLexiconPrimed();
      const cards = visibleRecords.map((record) =>
        renderRecordCard(
          record,
          payload.line_number,
          highlightTerms,
          { authorityHighlightTerms: authorityHighlightTermsByRecordId.get(record.id) || [] }
        ));
      elements.recordsList.replaceChildren(...cards);
    }

    function renderPinnedCard(item, compareModel = buildCompareModel([item])) {
      const { record, activeLineNumber } = item;
      const cardModel = compareModel.cards.find((entry) => entry.item.record.id === record.id) || null;
      const locationLabel = summarizeLocationLabel(item);
      const locationNote = [locationLabel, truncateText(item.lineText, 96)].filter(Boolean).join(" · ");
      const originMarkup = compareModel.sharedHeading
        ? ""
        : `<p class="compare-origin">${escapeHtml(locationNote)}</p>`;
      const authorityMarkup = cardModel?.authorityHits?.length
          ? `<div class="compare-chip-row compare-action-row">${cardModel.authorityHits.map((hit) => renderCompareActionChip(
              hit.canonicalName,
              `data-compare-authority="${escapeAttribute(hit.authorId)}"`,
              hit.works[0] || chooseText(`${hit.count} mentions`, `${hit.count} 处引用`)
            )).join("")}</div>`
          : "";
      const pointerMarkup = cardModel?.pointers?.length
        ? `<div class="compare-chip-row compare-action-row">${cardModel.pointers.map((pointer) => renderCompareActionChip(
            pointer.label,
            `data-compare-pointer-sample="${escapeAttribute(pointer.sampleId)}" data-compare-pointer-line="${escapeAttribute(pointer.lineNumber)}"`,
            pointer.matchedText
          )).join("")}</div>`
        : "";
      const card = documentRef.createElement("article");
      card.className = "compare-card";

      const removeButton = documentRef.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-button";
      removeButton.textContent = chooseText("Remove", "移除");
      removeButton.addEventListener("click", () => {
        state.pinned.delete(record.id);
        renderPinned();
        if (state.selectedLine !== null) {
          renderLineRecords(state.lineCache.get(state.selectedLine));
        }
      });

      card.innerHTML = `
        <div class="compare-top">
          <div>
            <h3>${escapeHtml(record.commentary_name)}</h3>
            <div class="pill-row">${buildPills(record, activeLineNumber)}</div>
          </div>
        </div>
        ${originMarkup}
        ${renderSignalSection(chooseText("Authority Usage", "Authority 使用"), authorityMarkup)}
        ${renderSignalSection(chooseText("Pointers", "Pointer 指针"), pointerMarkup)}
        <div class="compare-preview">${renderReadingBody(
          record.record_text_preview || record.record_summary,
          { chunkLongParagraphs: true, maxParagraphs: 3 },
          cardModel?.highlightTerms || [],
          [
            ...(cardModel?.authorityHighlightTerms?.length
              ? [{ terms: cardModel.authorityHighlightTerms, className: "authority-citation-highlight" }]
              : []),
            ...(buildAuthorityLexiconHighlightGroupsForText
              ? buildAuthorityLexiconHighlightGroupsForText(record.record_text_preview || record.record_summary || "", record)
              : []),
          ]
        )}</div>
      `;

      card.querySelector(".compare-top").appendChild(removeButton);
      bindCompareInteractiveElements(card);
      return card;
    }

    function renderPinned() {
      const items = [...state.pinned.values()];
      const count = items.length;

      if (count === 0) {
        elements.compareSummary.textContent = chooseText("No pinned cards yet.", "还没有 pin 的 cards。");
        elements.compareList.innerHTML = `<div class="empty-state">${escapeHtml(chooseText('Pin a commentary card from Close Reading to begin comparison.', '从 Close Reading 里 pin 一张 commentary card，再开始比较。'))}</div>`;
        return;
      }

      const compareModel = buildCompareModel(items);
      compareModel.sharedHeading = buildSharedCompareHeading(items);
      const lead = compareModel.count === 1
        ? chooseText(
            "One record is pinned. Add another and compare from source lines, authority usage, and outward pointers when they appear.",
            "目前只 pin 了 1 张卡。再加 1 张，就能从原行、authority 使用和 outward pointer 开始比较。"
          )
        : chooseText(
            `${compareModel.count} records are pinned. Compare them through source-aware jumps, authority use, and outward references when they surface.`,
            `当前已 pin ${compareModel.count} 张卡。默认前台只保留原行跳转、authority 使用和 outward reference 这些更成熟的比较动作。`
          );
      const authorityRows = compareModel.cards
        .filter((card) => card.authorityHits.length)
        .map((card) => `
          <article class="compare-alignment-row">
            <strong>${escapeHtml(card.item.record.commentary_name)}</strong>
            <div class="compare-chip-row compare-action-row">
              ${card.authorityHits.map((hit) => renderCompareActionChip(
                hit.canonicalName,
                `data-compare-authority="${escapeAttribute(hit.authorId)}"`,
                hit.works[0] || chooseText(`${hit.count} mentions`, `${hit.count} 处引用`)
              )).join("")}
            </div>
          </article>
        `)
        .join("");
      const authorityMarkup = compareModel.sharedAuthorities.length
        ? `
          <div class="compare-chip-row compare-action-row">
            ${compareModel.sharedAuthorities.map((item) => renderCompareActionChip(
              item.canonicalName,
              `data-compare-authority="${escapeAttribute(item.authorId)}"`,
              chooseText(`${item.support} cards`, `${item.support} 张卡`)
            )).join("")}
          </div>
          ${authorityRows}
        `
        : authorityRows;
      const pointerRows = compareModel.cards
        .filter((card) => card.pointers.length)
        .map((card) => `
          <article class="compare-alignment-row">
            <strong>${escapeHtml(card.item.record.commentary_name)}</strong>
            <div class="compare-chip-row compare-action-row">
              ${card.pointers.map((pointer) => renderCompareActionChip(
                pointer.label,
                `data-compare-pointer-sample="${escapeAttribute(pointer.sampleId)}" data-compare-pointer-line="${escapeAttribute(pointer.lineNumber)}"`,
                pointer.matchedText
              )).join("")}
            </div>
          </article>
        `)
        .join("");
      const pointerMarkup = pointerRows;
      elements.compareSummary.innerHTML = `
        <div class="compare-summary-shell">
          <strong class="compare-summary-title">${escapeHtml(compareModel.sharedHeading ? `${chooseText("Compare", "Compare")}: ${compareModel.sharedHeading}` : chooseText("Compare", "Compare"))}</strong>
          <p class="compare-lead">${escapeHtml(lead)}</p>
          ${renderSignalSection(chooseText("Authority Usage", "Authority 使用"), authorityMarkup, "compare-summary-section")}
          ${renderSignalSection(chooseText("Pointers", "Pointer 指针"), pointerMarkup, "compare-summary-section")}
        </div>
      `;
      bindCompareInteractiveElements(elements.compareSummary);

      const cards = items.map((item) => renderPinnedCard(item, compareModel));
      elements.compareList.replaceChildren(...cards);
    }

    return Object.freeze({
      renderLineRecords,
      renderRecordCard,
      renderPinned,
      renderPinnedCard,
    });
  }

  global.DDPRecordsPanel = Object.freeze({
    createRecordsPanel,
  });
})(window);
