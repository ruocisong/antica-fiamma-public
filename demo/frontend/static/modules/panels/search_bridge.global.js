(function initDDPSearchBridgeModule() {
  const SEARCH_LAYER_PRIORITY = Object.freeze({
    line_text: 0,
    commentary: 1,
  });

  const SEARCH_LAYER_CODE_MAP = Object.freeze({
    0: "line_text",
    1: "commentary",
  });

  const CANTICA_ORDER = new Map([
    ["inferno", 0],
    ["purgatorio", 1],
    ["paradiso", 2],
  ]);

  const MIN_AUTO_PREFIX_LENGTH = 5;

  function normalizeQuickJumpQuery(value) {
    return String(value || "").trim().toLowerCase().replace(/[,./_-]+/g, " ").replace(/\s+/g, " ");
  }

  function normalizeSearchTokenSurface(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9']/g, "")
      .replace(/^'+|'+$/g, "");
  }

  function parseSearchTerms(query) {
    const rawTokens = String(query || "").match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9']+-?/g) || [];
    return rawTokens
      .map((rawToken) => {
        const isPrefix = /-$/.test(rawToken);
        const token = normalizeSearchTokenSurface(rawToken.replace(/-+$/g, ""));
        return token ? { token, isPrefix } : null;
      })
      .filter(Boolean);
  }

  function normalizeSearchTokens(query) {
    const terms = parseSearchTerms(query);
    if (terms.length) {
      return terms.map((term) => term.token);
    }
    return normalizeQuickJumpQuery(query)
      .split(/\s+/)
      .map(normalizeSearchTokenSurface)
      .filter(Boolean);
  }

  function normalizeSearchPhrase(value) {
    return normalizeSearchTokens(value).join(" ");
  }

  function parseSampleIdentity(sampleId) {
    const value = String(sampleId || "").toLowerCase();
    const match = value.match(/^(inferno|purgatorio|paradiso)(\d{1,2})$/);
    if (!match) {
      return { cantica: value, canto: Number.NaN };
    }
    return { cantica: match[1], canto: Number(match[2]) };
  }

  function compareSampleIdsByCommedia(leftSampleId, rightSampleId) {
    const left = parseSampleIdentity(leftSampleId);
    const right = parseSampleIdentity(rightSampleId);
    return (CANTICA_ORDER.get(left.cantica) ?? 99) - (CANTICA_ORDER.get(right.cantica) ?? 99)
      || (left.canto || 999) - (right.canto || 999)
      || String(leftSampleId || "").localeCompare(String(rightSampleId || ""));
  }

  function normalizeExternalResult(result = {}) {
    return {
      id: result.id || `${result.sampleId || result.sample_id || result.sample || "sample"}:${result.lineNumber || result.line_number || "0"}`,
      title: result.title || result.label || result.line_text || "Search Result",
      sampleId: result.sampleId || result.sample_id || result.sample || result.sample_key || result.jumpTarget?.sampleId || result.jump_target?.sample_id || null,
      lineNumber: Number.isFinite(result.lineNumber)
        ? result.lineNumber
        : Number.isFinite(result.line_number)
          ? result.line_number
          : Number.isFinite(result.jumpTarget?.lineNumber)
            ? result.jumpTarget.lineNumber
            : Number.isFinite(result.jump_target?.line_number)
              ? result.jump_target.line_number
              : null,
      snippet: result.snippet || result.lineText || result.line_text || "",
      lineText: result.lineText || result.line_text || "",
      cantoLabel: result.cantoLabel || result.canto_label || (result.cantica && result.canto ? `${result.cantica} ${result.canto}` : ""),
      locusNormalized: result.locusNormalized || result.locus_normalized || result.jumpTarget?.locusNormalized || null,
      sourceLayer: result.sourceLayer || result.source_layer || "",
      sourceIndex: Number.isFinite(result.sourceIndex)
        ? result.sourceIndex
        : Number.isFinite(result.source_index)
          ? result.source_index
          : 0,
      sourceText: result.sourceText || result.source_text || "",
      recordId: result.recordId || result.record_id || "",
      matchType: result.matchType || result.match_type || "",
      matchedText: result.matchedText || result.matched_text || "",
      matchedToken: result.matchedToken || result.matched_token || "",
      score: Number.isFinite(result.score) ? result.score : Number.NEGATIVE_INFINITY,
    };
  }

  function getCommentaryRecordId(document, sourceRef) {
    const targets = Array.isArray(document?.commentary_targets) ? document.commentary_targets : [];
    const match = targets.find((item) => Array.isArray(item) && Number(item[0]) === Number(sourceRef));
    return match?.[1] ? String(match[1]) : "";
  }

  function buildSearchSnippet(sourceText, queryText, maxLength = 180) {
    const compact = String(sourceText || "").replace(/\s+/g, " ").trim();
    if (!compact) {
      return "";
    }
    if (compact.length <= maxLength) {
      return compact;
    }

    const foldedText = compact.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const foldedQuery = String(queryText || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const index = foldedQuery ? foldedText.indexOf(foldedQuery) : -1;
    if (index < 0) {
      return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
    }

    const start = Math.max(0, index - 48);
    const end = Math.min(compact.length, start + maxLength);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < compact.length ? "…" : "";
    return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
  }

  function getSearchSourceText(searchIndex, document, sourceLayer, sourceIndex) {
    if (sourceLayer === "line_text") {
      return document?.line_text || "";
    }
    if (sourceLayer === "commentary") {
      return searchIndex?.source_pools?.commentary?.[sourceIndex] || "";
    }
    return document?.line_text || "";
  }

  function parseRawSearchHit(hit) {
    if (!Array.isArray(hit) || hit.length < 1) {
      return null;
    }
    if (hit.length >= 5) {
      const [documentId, rawSourceLayer, matchedText, sourceIndex, supportingMatchCount] = hit;
      const sourceLayer = typeof rawSourceLayer === "number" ? SEARCH_LAYER_CODE_MAP[rawSourceLayer] : rawSourceLayer;
      if ((documentId ?? "") === "" || !sourceLayer) {
        return null;
      }
      return {
        documentId,
        sourceLayer,
        matchedText: String(matchedText || ""),
        sourceIndex: Number(sourceIndex || 0),
        supportingMatchCount: Number(supportingMatchCount || 0),
      };
    }
    if (hit.length === 4) {
      const [documentId, rawSourceLayer, sourceIndex, supportingMatchCount] = hit;
      const sourceLayer = typeof rawSourceLayer === "number" ? SEARCH_LAYER_CODE_MAP[rawSourceLayer] : rawSourceLayer;
      if ((documentId ?? "") === "" || !sourceLayer) {
        return null;
      }
      return {
        documentId,
        sourceLayer,
        matchedText: "",
        sourceIndex: Number(sourceIndex || 0),
        supportingMatchCount: Number(supportingMatchCount || 0),
      };
    }
    if (hit.length === 3) {
      const [documentId, rawSourceLayer, sourceIndex] = hit;
      const sourceLayer = typeof rawSourceLayer === "number" ? SEARCH_LAYER_CODE_MAP[rawSourceLayer] : rawSourceLayer;
      if ((documentId ?? "") === "" || !sourceLayer) {
        return null;
      }
      return {
        documentId,
        sourceLayer,
        matchedText: "",
        sourceIndex: Number(sourceIndex || 0),
        supportingMatchCount: 1,
      };
    }
    if (hit.length === 2) {
      const [documentId, supportingMatchCount] = hit;
      if ((documentId ?? "") === "") {
        return null;
      }
      return {
        documentId,
        sourceLayer: "line_text",
        matchedText: "",
        sourceIndex: 0,
        supportingMatchCount: Number(supportingMatchCount || 0) || 1,
      };
    }
    const [documentId] = hit;
    if ((documentId ?? "") === "") {
      return null;
    }
    return {
      documentId,
      sourceLayer: "line_text",
      matchedText: "",
      sourceIndex: 0,
      supportingMatchCount: 1,
    };
  }

  function parseSearchHit(token, hit) {
    const parsed = parseRawSearchHit(hit);
    if (!parsed) {
      return null;
    }
    return {
      documentId: parsed.documentId,
      sourceLayer: parsed.sourceLayer,
      matchedText: parsed.matchedText,
      matchedToken: String(token || ""),
      sourceIndex: parsed.sourceIndex,
      supportingMatchCount: parsed.supportingMatchCount,
    };
  }

  function compareSearchHitPriority(left, right) {
    return (SEARCH_LAYER_PRIORITY[left.sourceLayer] ?? 99) - (SEARCH_LAYER_PRIORITY[right.sourceLayer] ?? 99)
      || (Number(right.supportingMatchCount || 0) - Number(left.supportingMatchCount || 0))
      || Number(left.sourceIndex || 0) - Number(right.sourceIndex || 0);
  }

  function groupHitsBySource(token, hits) {
    const grouped = new Map();
    for (const hit of hits || []) {
      const parsed = parseSearchHit(token, hit);
      if (!parsed) {
        continue;
      }
      const sourceKey = `${parsed.documentId}::${parsed.sourceLayer}::${parsed.sourceIndex}`;
      const candidate = {
        ...parsed,
        sourceKey,
      };
      const existing = grouped.get(sourceKey);
      if (!existing || compareSearchHitPriority(candidate, existing) < 0) {
        grouped.set(sourceKey, candidate);
      }
    }
    return grouped;
  }

  function scoreSearchResult(result) {
    const sourceBoost = result.sourceLayer === "line_text" ? 400 : 0;
    const phraseBoost = result.matchType === "exact_phrase_normalized" ? 240 : 0;
    const repeatBoost = Math.min(40, Number(result.supportingMatchCount || 0) * 8);
    const exactSurfaceBoost = result.matchedText ? 12 : 0;
    const snippetLengthPenalty = Math.min(30, Math.floor(String(result.sourceText || "").length / 40));
    return sourceBoost + phraseBoost + repeatBoost + exactSurfaceBoost - snippetLengthPenalty;
  }

  function sortResults(results) {
    return [...results].sort((left, right) =>
      (Number(right.score || Number.NEGATIVE_INFINITY) - Number(left.score || Number.NEGATIVE_INFINITY))
      || compareSampleIdsByCommedia(left.sampleId, right.sampleId)
      || (left.lineNumber || 0) - (right.lineNumber || 0)
      || String(left.id || "").localeCompare(String(right.id || ""))
    );
  }

  function buildHydratedResult(searchIndex, documentId, primaryHit, queryText, matchType, normalizedPhrase) {
    const document = searchIndex?.documents?.[documentId];
    if (!document) {
      return null;
    }
    const sourceText = getSearchSourceText(searchIndex, document, primaryHit.sourceLayer, primaryHit.sourceIndex);
    if (!sourceText) {
      return null;
    }
    if (matchType === "exact_phrase_normalized" && !normalizeSearchPhrase(sourceText).includes(normalizedPhrase)) {
      return null;
    }

    const snippet = buildSearchSnippet(sourceText, queryText);
    const result = normalizeExternalResult({
      id: matchType === "exact_phrase_normalized"
        ? `${documentId}:${primaryHit.sourceLayer}:${primaryHit.sourceIndex}:${normalizedPhrase}`
        : `${documentId}:${primaryHit.matchedToken}:${primaryHit.sourceLayer}`,
      title: `${document.cantica} ${document.canto}`,
      sample_id: document.sample_key,
      line_number: document.line_number,
      line_text: document.line_text,
      snippet,
      source_text: sourceText,
      record_id: primaryHit.sourceLayer === "commentary" ? getCommentaryRecordId(document, primaryHit.sourceIndex) : "",
      canto_label: `${document.cantica} ${document.canto}`,
      source_layer: primaryHit.sourceLayer,
      match_type: matchType,
      matched_text: matchType === "exact_phrase_normalized" ? queryText.trim() : primaryHit.matchedText,
      matched_token: matchType === "exact_phrase_normalized" ? normalizedPhrase : primaryHit.matchedToken,
      source_index: primaryHit.sourceIndex,
      jump_target: {
        sample_id: document.jump_target?.sample_id || document.sample_key,
        line_number: document.jump_target?.line_number || document.line_number,
      },
    });
    result.supportingMatchCount = primaryHit.supportingMatchCount;
    result.score = scoreSearchResult(result);
    return result;
  }

  function runSingleTokenSearch(searchIndex, token, limit) {
    const tokenIndex = searchIndex?.token_index || {};
    const groupedHits = groupHitsBySource(token, tokenIndex[token] || []);
    if (!groupedHits.size) {
      return [];
    }
    const results = [];
    for (const primaryHit of groupedHits.values()) {
      const result = buildHydratedResult(
        searchIndex,
        primaryHit.documentId,
        primaryHit,
        primaryHit.matchedText || primaryHit.matchedToken,
        "exact_token_normalized",
        ""
      );
      if (result) {
        results.push(result);
      }
    }
    const sorted = sortResults(results);
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  function collectPrefixTokens(tokenIndex, prefixes) {
    const normalizedPrefixes = [...new Set((prefixes || [])
      .map(normalizeSearchTokenSurface)
      .filter((prefix) => prefix.length >= 3))];
    if (!normalizedPrefixes.length) {
      return [];
    }
    return Object.keys(tokenIndex || {})
      .filter((token) => normalizedPrefixes.some((prefix) => token.startsWith(prefix)))
      .sort((left, right) => left.length - right.length || left.localeCompare(right));
  }

  function runPrefixTokenSearch(searchIndex, prefixes, limit) {
    const tokenIndex = searchIndex?.token_index || {};
    const matchedTokens = collectPrefixTokens(tokenIndex, prefixes);
    if (!matchedTokens.length) {
      return [];
    }

    const groupedHits = new Map();
    for (const token of matchedTokens) {
      for (const [sourceKey, hit] of groupHitsBySource(token, tokenIndex[token] || [])) {
        const existing = groupedHits.get(sourceKey);
        if (!existing || compareSearchHitPriority(hit, existing) < 0) {
          groupedHits.set(sourceKey, hit);
        }
      }
    }

    const results = [];
    for (const primaryHit of groupedHits.values()) {
      const result = buildHydratedResult(
        searchIndex,
        primaryHit.documentId,
        primaryHit,
        primaryHit.matchedText || primaryHit.matchedToken,
        "prefix_token_normalized",
        ""
      );
      if (result) {
        results.push(result);
      }
    }

    const sorted = sortResults(results);
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  function runExactPhraseSearch(searchIndex, query, tokens, limit) {
    const tokenIndex = searchIndex?.token_index || {};
    const normalizedPhrase = normalizeSearchPhrase(query);
    if (!normalizedPhrase) {
      return [];
    }

    const groupedHitLists = tokens.map((token) => groupHitsBySource(token, tokenIndex[token] || []));
    if (groupedHitLists.some((hits) => hits.size === 0)) {
      return [];
    }

    const candidateKeys = new Set(groupedHitLists[0].keys());
    for (const hits of groupedHitLists.slice(1)) {
      for (const sourceKey of [...candidateKeys]) {
        if (!hits.has(sourceKey)) {
          candidateKeys.delete(sourceKey);
        }
      }
    }

    const results = [];
    for (const sourceKey of candidateKeys) {
      const primaryHit = groupedHitLists
        .map((hits) => hits.get(sourceKey))
        .filter(Boolean)
        .sort(compareSearchHitPriority)[0];
      if (!primaryHit) {
        continue;
      }
      const result = buildHydratedResult(
        searchIndex,
        primaryHit.documentId,
        primaryHit,
        query,
        "exact_phrase_normalized",
        normalizedPhrase
      );
      if (result) {
        results.push(result);
      }
    }

    const sorted = sortResults(results);
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  async function resolveShell(explicitShell) {
    if (explicitShell) {
      return explicitShell;
    }
    if (window.DDPAppShellReady) {
      return window.DDPAppShellReady;
    }
    return window.DDPAppShell || null;
  }

  async function search(query, options = {}) {
    const shell = await resolveShell(options.shell);
    if (!shell?.ensureSearchIndexLoaded) {
      return [];
    }
    const searchIndex = options.searchIndex || await shell.ensureSearchIndexLoaded();
    const terms = parseSearchTerms(query);
    const tokens = normalizeSearchTokens(query);
    if (!tokens.length) {
      return [];
    }
    const limit = Number.isFinite(options.limit) ? options.limit : Number.POSITIVE_INFINITY;
    const prefixTerms = terms.filter((term) => term.isPrefix).map((term) => term.token);
    if (prefixTerms.length) {
      return runPrefixTokenSearch(searchIndex, prefixTerms, limit);
    }
    if (tokens.length === 1 && tokens[0].length >= MIN_AUTO_PREFIX_LENGTH) {
      return runPrefixTokenSearch(searchIndex, [tokens[0]], limit);
    }
    if (tokens.length >= 2) {
      return runExactPhraseSearch(searchIndex, query, tokens, limit);
    }
    return runSingleTokenSearch(searchIndex, tokens[0], limit);
  }

  window.DDPSearchBridgeModule = Object.freeze({
    version: "search-bridge/v1",
    normalizeSearchTokens,
    normalizeSearchPhrase,
    normalizeExternalResult,
    search,
  });
})();
