const {
  DATA_BASE,
  SEARCH_LAYER_PRIORITY,
  SEARCH_LAYER_CODE_MAP,
  CANTICA_SHELLS,
  CANTICA_ORDER,
  CANTICA_SHORT_LABELS,
  SEMANTIC_STOPWORDS,
  DANTE_STOPWORDS,
  CANONICAL_SEMANTIC_TERMS,
  RESIDUAL_FUNCTION_PATTERNS,
  WORD_PROFILE_NOISE,
  CORPUS_DRIFT_TERMS,
  LOW_SEMANTIC_CONCURRENCE,
  TOP_COMMENTARY_TERM_NOISE,
  PROPER_TERM_LABELS,
  WORD_FAMILY_PILOT,
  WORD_FAMILY_LOOKUP,
  UI_COPY,
} = window.DDPConfig;

const state = window.DDPState.createInitialState();

const elements = window.DDPDom.getElements(document);

function hideInitialLoadingOverlay() {
  if (!elements.pageLoadingOverlay) {
    return;
  }
  elements.pageLoadingOverlay.classList.add("is-hidden");
  window.setTimeout(() => {
    elements.pageLoadingOverlay?.setAttribute("hidden", "");
  }, 220);
}

let coreBackgroundWarmScheduled = false;
let coreBackgroundWarmStarted = false;
let isRestoringViewportState = false;
const VIEWPORT_BACK_STACK_LIMIT = 40;
let deferredInitialLineSelectionToken = 0;
let activeLineSelectionToken = 0;

async function init() {
  try {
    state.uiLanguage = getInitialUiLanguage();
    state.manifest = await fetchJson(`${DATA_BASE}/manifest.json`);
    state.manifestMap = new Map((state.manifest.samples || []).map((sample) => [sample.id, sample]));
    applyUiLanguage();
    renderSampleBrowser();
    renderFigurePanel();
    bindEvents();
    syncBackButtonState();
    registerSearchBridge();
    renderSearchResultsShell();
    setupAnchorObserver();
    ensureAuthorityHighlightLexiconLoaded()
      .then(() => {
        if (state.selectedLine != null && state.lineCache.has(state.selectedLine)) {
          renderLineRecords(state.lineCache.get(state.selectedLine));
        }
      })
      .catch((error) => {
        console.warn("Background load failed for authority_highlight_lexicon.json", error);
        state.authorityHighlightLexicon = null;
      });
    await loadSample(getInitialSampleId());
    hideInitialLoadingOverlay();
    scheduleCoreBackgroundWarm();
  } catch (error) {
    renderFatal(error);
    hideInitialLoadingOverlay();
  }
}

function scheduleCoreBackgroundWarm() {
  if (coreBackgroundWarmScheduled || coreBackgroundWarmStarted) {
    return;
  }
  coreBackgroundWarmScheduled = true;

  const runWarm = () => {
    if (coreBackgroundWarmStarted) {
      return;
    }
    coreBackgroundWarmStarted = true;
    warmCoreBackgroundData();
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(runWarm, { timeout: 4000 });
    return;
  }

  window.setTimeout(runWarm, 2500);
}

async function warmCoreBackgroundData() {
  try {
    await ensureDanteWordLociIndexLoaded();
  } catch (error) {
    console.warn("Background load failed for dante_word_loci index", error);
    state.danteWordLociIndex = null;
  }
}

async function ensureResearchLayerLoaded() {
  if (state.researchLayer) {
    return state.researchLayer;
  }
  if (!state.researchLayerPromise) {
    state.researchLayerPromise = fetchJson(`${DATA_BASE}/research_layer.json`)
      .then((payload) => {
        state.researchLayer = payload;
        state.lineProfileMap = new Map((payload.line_profiles || []).map((profile) => [profile.id, profile]));
        state.corpusInterpretiveStats = buildCorpusInterpretiveStats(payload.line_profiles || []);
        return payload;
      })
      .catch((error) => {
        state.researchLayer = null;
        throw error;
      })
      .finally(() => {
        state.researchLayerPromise = null;
      });
  }

  try {
    const payload = await state.researchLayerPromise;
    if (state.selectedLine && state.lineCache.has(state.selectedLine)) {
      renderLineRecords(state.lineCache.get(state.selectedLine));
    }
    return payload;
  } catch (error) {
    console.warn("Background load failed for research_layer.json", error);
    state.researchLayer = null;
    return null;
  }
}

async function ensureSampleLineEchoProfilesLoaded(sampleId = state.currentSampleEntry?.id) {
  if (!sampleId) {
    return null;
  }
  if (state.sampleLineEchoProfileCache.has(sampleId)) {
    return state.sampleLineEchoProfileCache.get(sampleId);
  }
  if (!state.sampleLineEchoProfilePromises.has(sampleId)) {
    const request = fetchJson(`./data/${sampleId}/line_echoes.json`)
      .then((payload) => {
        const profileMap = new Map(
          (payload?.line_echo_profiles || []).map((item) => [
            Number(item.line_number),
            {
              id: `${sampleId}:${Number(item.line_number)}`,
              sample: sampleId,
              line_number: Number(item.line_number),
              line_echo_profile: item.line_echo_profile || null,
            },
          ])
        );
        state.sampleLineEchoProfileCache.set(sampleId, profileMap);
        return profileMap;
      })
      .catch(() => {
        state.sampleLineEchoProfileCache.set(sampleId, null);
        return null;
      })
      .finally(() => {
        state.sampleLineEchoProfilePromises.delete(sampleId);
      });
    state.sampleLineEchoProfilePromises.set(sampleId, request);
  }
  const payload = await state.sampleLineEchoProfilePromises.get(sampleId);
  if (state.currentSampleEntry?.id === sampleId && state.selectedLine && state.lineCache.has(state.selectedLine)) {
    renderLineRecords(state.lineCache.get(state.selectedLine));
  }
  return payload;
}

function choose(english, chinese) {
  return state.uiLanguage === "en" ? english : chinese;
}

function renderHelpButton(key, label = "Guide") {
  return `<button type="button" class="help-trigger" data-help-key="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">i</button>`;
}

function getCollectionSize(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 0;
}

function getHelpStatsSnapshot() {
  const samples = state.manifest?.samples || [];
  const statusCounts = new Map();
  const canticaCounts = new Map();
  const searchShards = Array.isArray(state.searchIndex?.shards) ? state.searchIndex.shards : [];
  const searchDocCount = searchShards.length
    ? searchShards.reduce((sum, shard) => sum + Number(shard.document_count || 0), 0)
    : getCollectionSize(state.searchIndex?.documents);
  const searchTokenCount = Number(state.searchIndex?.stats?.unique_token_count_across_shards || 0)
    || getCollectionSize(state.searchIndex?.token_index);
  for (const sample of samples) {
    statusCounts.set(sample.status, (statusCounts.get(sample.status) || 0) + 1);
    canticaCounts.set(sample.cantica, (canticaCounts.get(sample.cantica) || 0) + 1);
  }

  return {
    sampleCount: samples.length,
    statusCounts,
    canticaCounts,
    searchDocCount,
    searchTokenCount,
    searchModes: state.searchIndex?.query_modes || [],
    researchSampleCount: getCollectionSize(state.researchLayer?.samples),
    lineProfileCount: getCollectionSize(state.researchLayer?.line_profiles),
    figureProfileCount: getCollectionSize(state.researchLayer?.figure_profiles),
    personaggioCount: Number(state.authorityPersonaggioAliasAtlas?.personaggio_count || 0)
      || getCollectionSize(state.authorityPersonaggioAliasAtlas?.rows)
      || getCollectionSize(state.authorityPersonaggioScan?.standalone_personaggi),
    authorityAuthorCount: getCollectionSize(state.authorityLayer?.authors),
    authoritySourceCount: Number(state.authorityCommentarySources?.source_count || 0),
    danteWordProfileCount: getCollectionSize(state.danteWordLociIndex?.profiles),
    researchNotes: state.researchLayer?.notes || {},
    authorityNotes: state.authorityLayer?.notes || {},
    currentSampleTitle: state.currentSampleEntry?.title || "current sample",
    selectedLine: state.selectedLine,
  };
}

async function ensureHelpDataForKey(key) {
  if (key === "quick-jump") {
    await ensureSearchIndexLoaded();
    return;
  }
  if (["semantic-fields", "recurrence-candidates"].includes(key)) {
    await ensureResearchLayerLoaded();
    return;
  }
  if ([
    "dante-word-locus",
    "occurrence-explorer",
    "micro-context-concurrence",
    "phrase-expansions",
    "contrastive-vocabulary",
  ].includes(key)) {
    await Promise.all([
      ensureDanteWordLociIndexLoaded(),
      ensureResearchLayerLoaded(),
    ]);
    return;
  }
  if (["authority-panel", "authority-lens", "figure-navigation"].includes(key)) {
    await Promise.all([
      ensureAuthorityLayerLoaded(),
      ensureAuthorityCommentarySourcesLoaded(),
      ensureAuthorityCuratedRoomAnchorsLoaded(),
      ensureAuthorityPersonaggioScanLoaded(),
      ensureAuthorityPersonaggioAliasAtlasLoaded(),
    ]);
  }
}

function formatHelpList(items = []) {
  return `
    <ul class="help-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function formatHelpParagraphs(paragraphs = []) {
  return paragraphs
    .map((paragraph) => `<p class="help-paragraph">${renderGuideInlineMarkup(paragraph)}</p>`)
    .join("");
}

const GUIDE_SEMANTIC_FOCUS_TERMS = [
  "commentary language 的局部聚类",
  "density, spread, and historical span",
  "clustering of commentary language",
  "commentary language",
  "line-level surface",
  "line-bound witness set",
  "line-bound record set",
  "reading material",
  "comparison desk",
  "authority reading",
  "authority object",
  "reception contour",
  "lexical contour",
  "diachronic span",
  "rarity weighting",
  "text-first",
  "personaggi",
  "Candidate lines",
  "Dante's own text",
  "Dante's line",
  "direct navigation",
  "lexical search",
  "逐行表面",
  "阅读材料",
  "比较桌面",
  "authority 阅读",
  "authority object",
  "接受史轮廓",
  "词汇轮廓",
  "历史跨度",
  "稀有度加权",
  "密度、分布和历史跨度",
  "候选行",
  "但丁原文自己的主题分类",
  "Dante 原文这一行",
  "直接跳转",
  "词语搜索",
];

function renderGuideInlineMarkup(text) {
  const source = String(text || "");
  if (!source) {
    return "";
  }
  if (!source.includes("[[")) {
    return renderGuideFallbackFocus(source);
  }
  let result = "";
  let lastIndex = 0;
  const markerPattern = /\[\[(.+?)\]\]/g;
  let match;
  while ((match = markerPattern.exec(source)) !== null) {
    result += renderGuideFallbackFocus(source.slice(lastIndex, match.index));
    result += `<span class="guide-focus">${escapeHtml(match[1])}</span>`;
    lastIndex = match.index + match[0].length;
  }
  result += renderGuideFallbackFocus(source.slice(lastIndex));
  return result;
}

function renderGuideFallbackFocus(text) {
  const source = String(text || "");
  const ranges = findGuideFocusRanges(source);
  if (!ranges.length) {
    return escapeHtml(source);
  }
  let result = "";
  let cursor = 0;
  for (const range of ranges) {
    result += escapeHtml(source.slice(cursor, range.start));
    result += `<span class="guide-focus">${escapeHtml(source.slice(range.start, range.end))}</span>`;
    cursor = range.end;
  }
  result += escapeHtml(source.slice(cursor));
  return result;
}

function findGuideFocusRanges(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return [];
  }
  const lower = source.toLowerCase();
  const ranges = [];
  const sortedTerms = GUIDE_SEMANTIC_FOCUS_TERMS
    .slice()
    .sort((left, right) => right.length - left.length);

  for (const term of sortedTerms) {
    const needle = term.toLowerCase();
    let startIndex = 0;
    while (startIndex < lower.length) {
      const matchIndex = lower.indexOf(needle, startIndex);
      if (matchIndex === -1) {
        break;
      }
      const nextRange = { start: matchIndex, end: matchIndex + term.length };
      const overlaps = ranges.some((range) => !(nextRange.end <= range.start || nextRange.start >= range.end));
      if (!overlaps) {
        ranges.push(nextRange);
      }
      startIndex = matchIndex + term.length;
      if (ranges.length >= 3) {
        break;
      }
    }
    if (ranges.length >= 3) {
      break;
    }
  }
  return ranges.sort((left, right) => left.start - right.start);
}

function renderHelpModalMarkup(title, lead, sections) {
  return {
    title: title || (state.uiLanguage === "en" ? "Guide" : "功能说明"),
    lead: lead || "",
    body: renderHelpModalBody(sections),
  };
}

const METHOD_DENSE_HELP_KEYS = new Set([
  "quick-jump",
  "canto-browser",
  "entry-panel",
  "close-reading",
  "commentary-panel",
  "compare-panel",
  "authority-panel",
  "analysis-layer",
  "commentary-terms",
  "semantic-fields",
  "dante-word-locus",
  "occurrence-explorer",
  "micro-context-concurrence",
  "phrase-expansions",
  "contrastive-vocabulary",
  "recurrence-candidates",
  "figure-navigation",
  "authority-lens",
]);

function isMethodDenseHelpKey(key) {
  return METHOD_DENSE_HELP_KEYS.has(String(key || "").trim());
}

function getHelpAudienceLabel() {
  return state.uiLanguage === "en" ? "Reading angle" : "阅读视角";
}

function syncHelpAudienceToggle(key = state.activeHelpKey) {
  if (!elements.helpAudienceRow || !elements.helpAudienceToggle) {
    return;
  }
  const enabled = isMethodDenseHelpKey(key);
  elements.helpAudienceRow.hidden = !enabled;
  if (elements.helpAudienceLabel) {
    elements.helpAudienceLabel.textContent = getHelpAudienceLabel();
  }
  elements.helpAudienceToggle.querySelectorAll("[data-help-audience]").forEach((button) => {
    const audience = button.dataset.helpAudience || "";
    button.classList.toggle("is-active", audience === state.helpAudience);
  });
}

function renderCurrentHelpContent() {
  const key = state.activeHelpKey;
  if (!key || !elements.helpOverlayTitle || !elements.helpOverlayLead || !elements.helpOverlayBody) {
    return;
  }
  const content = buildHelpContent(key);
  const rendered = renderHelpModalMarkup(content.title, content.lead, content.sections);
  elements.helpOverlayTitle.textContent = rendered.title;
  elements.helpOverlayLead.innerHTML = renderGuideInlineMarkup(rendered.lead);
  elements.helpOverlayBody.innerHTML = rendered.body;
  syncHelpAudienceToggle(key);
}

function buildHelpContent(key) {
  const stats = getHelpStatsSnapshot();
  const currentLineLabel = Number.isFinite(stats.selectedLine) ? `Line ${stats.selectedLine}` : "the current line";
  const isEnglish = state.uiLanguage === "en";
  const choose = (en, bilingual) => (isEnglish ? en : bilingual);
  const makeBody = (...lines) => formatHelpParagraphs(lines);
  const composeAudienceSections = (shared = [], philologist = [], dh = [], options = {}) => {
    if (state.helpAudience === "dh") {
      return options.dhReplacesShared ? [...dh] : [...shared, ...dh];
    }
    return options.philologistReplacesShared ? [...philologist] : [...shared, ...philologist];
  };
  const pickAudienceLead = (sharedLead, philologistLead, dhLead) => {
    if (state.helpAudience === "dh" && dhLead) {
      return dhLead;
    }
    if (state.helpAudience === "philologist" && philologistLead) {
      return philologistLead;
    }
    return sharedLead;
  };

  const helpMap = {
    manicula: {
      title: "Manicula",
      lead: "A medieval pointing hand used by readers and scribes to mark passages of special importance. Here, the manicula signals a place where Dante's text opens into commentary, sources, or intertextual traces.",
      sections: [
        {
          label: "",
          body: `
            <figure class="help-image-figure">
              <img src="/static/assets/manicula-hrc-45.png" alt="" aria-hidden="true" />
            </figure>
            ${makeBody("HRC 45, Divina Commedia by Dante Alighieri (1363).")}
          `,
        },
      ],
    },
    "homepage-image": {
      title: "Vestigia/Segni",
      lead: "This homepage image evokes Dante’s snow-covered plain: a hidden path, a distant dwelling, and the vestiges of earlier footsteps as a guide for later readers.",
      sections: [
        {
          label: "",
          body: `
            <p class="help-paragraph">Una <span class="guide-focus">pianura</span> è con certi sentieri: campo con siepi, con fossati, con pietre, con legname, con tutti quasi impedimenti fuori delli suoi stretti sentieri. <span class="guide-focus">Nevato</span> è sì che tutto cuopre la <span class="guide-focus">neve</span>, e rende una figura in ogni parte, sì che d’alcuno sentiero <span class="guide-focus">vestigio</span> non si vede.</p>
            <p class="help-paragraph">Viene alcuno dall’una parte della <span class="guide-focus">campagna</span> e vuole andare a una <span class="guide-focus">magione</span> che è dall’altra parte; e per sua industria, cioè per accorgimento e per bontade d’ingegno, solo da sé guidato, per lo diritto <span class="guide-focus">cammino</span> si va là dove intende, lasciando le <span class="guide-focus">vestigie</span> delli suoi passi diretro da sé. Viene un altro appresso costui, e vuole a questa magione andare, e non li è mestiere se non seguire li <span class="guide-focus">vestigi</span> lasciati; e, per suo difetto, lo <span class="guide-focus">cammino</span>, che altri sanza scorta ha saputo tenere, questo, scorto, erra, e tortisce per li pruni e per le ruine, e alla parte dove dee non va.</p>
            <p class="help-paragraph">Dante, <em>Convivio</em> IV, vii, 6–7</p>
          `,
        },
      ],
    },
    "quick-jump": {
      title: "Quick Jump / Search",
      lead: choose(
        `This entry combines [[direct navigation]] with [[lexical search]]. In the current local build it is reading across ${formatNumber(stats.searchDocCount)} line-based documents and ${formatNumber(stats.searchTokenCount)} indexed tokens, but it still tries to behave like a reading doorway rather than a detached search console.`,
        `这个入口把[[直接跳转]]和[[词语搜索]]放在一起。按当前本地构建，它会穿过 ${formatNumber(stats.searchDocCount)} 条按行组织的 document 和 ${formatNumber(stats.searchTokenCount)} 个已索引 token，但它的目标仍然是做一扇阅读入口，而不是一个脱离现场的检索控制台。`
      ),
      sections: [
        { label: choose("How it works", "它怎么工作"), body: makeBody(
          choose("If you type a canto or line reference, the interface treats it as navigation. It only falls back to the search index when the query is genuinely lexical.", "如果你输入的是 canto 或 line 的坐标，它会先把它当成导航；只有当输入真的像词语搜索时，才会转去查索引。"),
          choose("The point is not to split reading into a separate search page. The point is to move you back into the poem as quickly as possible.", "它不是要把阅读拆成一个独立的搜索页面，而是要尽快把你送回诗的现场。")
        )},
        { label: choose("Parsing order", "解析顺序"), body: makeBody(
          choose("The parser now tries the most concrete reading first: explicit canto references, then line references, then approved exact-phrase shortcuts, and only after that the lexical index. This order matters because coordinates are claims about place, while search terms are claims about language.", "解析器会先尝试最具体的读法：明确的 canto 坐标、line 坐标、已经批准的 exact-phrase 快捷入口，最后才进入 lexical index。这个顺序很重要，因为坐标是在宣告“我想去哪里”，而搜索词是在宣告“我想追什么语言”。"),
          choose("When search does fire, the result is still routed back into the workbench so that line, card, and panel context stay intact.", "即便真的走到 search，结果也会被重新送回 workbench 内部，这样 line、card 和 panel 的上下文不会断掉。")
        )},
        { label: choose("Reading contract", "阅读契约"), body: makeBody(
          choose("For a philologist, this box should feel trustworthy because it tells you whether it is navigating or searching. For a digital humanist, the key point is that search remains line-addressable and mounted against the current local shard structure rather than against a generic site-wide blob.", "对 philologist 来说，这个入口应该是可信的，因为它会让你知道自己现在到底是在导航还是在搜索。对 digital humanist 来说，关键则是：search 仍然是按 line 可寻址的，并且挂在当前本地 shard 结构上，而不是压成一个通用的大块全文索引。")
        )},
      ],
    },
    "canto-browser": {
      title: "Canto Browser",
      lead: choose(
        `The current local manifest mounts all ${formatNumber(stats.sampleCount)} canto shells, so this now works as a full map of the Commedia.`,
        `当前本地 manifest 已经挂上全部 ${formatNumber(stats.sampleCount)} 个 canto shell，所以这块现在已经是一张完整的《神曲》地图。`
      ),
      sections: [
        { label: choose("Why it is here", "它为什么在这里"), body: makeBody(
          choose("The browser restores the poem as a navigable whole. You decide where you are in the Commedia before you decide which line deserves your attention.", "它把整部诗重新还原成一张可直接进入的地图。你先决定自己站在哪一 canto，再决定哪一行值得停下。"),
          choose("That order matters because it keeps the interface close to textual reading, not to a generic dashboard logic.", "这个顺序很重要，因为它让界面始终贴着文本，而不是慢慢滑向一个通用 dashboard 的逻辑。")
        )},
        { label: choose("What the browser now covers", "这一层现在覆盖什么"), body: makeBody(
          choose(`The manifest currently mounts all ${formatNumber(stats.sampleCount)} canto shells across Inferno, Purgatorio, and Paradiso. That means the browser is no longer a demo stub; it is the actual topography of the public workbench.`, `当前 manifest 已经挂上 Inferno、Purgatorio、Paradiso 全部 ${formatNumber(stats.sampleCount)} 个 canto shell。这意味着它已经不是一个演示用 stub，而是当前公开 workbench 的真实地形图。`),
          choose("You should therefore read it as orientation infrastructure: it is where the page re-establishes literary scale before any local interpretation begins.", "所以这层最好被当成方位基础设施来读：在任何局部解释动作开始之前，它先把文学尺度重新立起来。")
        )},
        { label: choose("Why it matters for method", "为什么它对方法论重要"), body: makeBody(
          choose("A philological reading often begins by re-locating a line inside canto architecture. A computational reading also needs this frame, because the rest of the interface is line-addressed and sample-bound. The browser is where those two needs meet.", "philological 阅读常常要先把一行重新放回 canto 架构里。computational 阅读同样需要这个框架，因为后面的很多层都是 line-addressed、sample-bound 的。browser 正是这两种需要交会的地方。")
        )},
      ],
    },
    "entry-panel": {
      title: choose("Entry", "正文入口 / Entry"),
      lead: choose(
        `${stats.currentSampleTitle} first appears here as a [[line-level surface]], line by line. Direct line URLs keep the page at the canto entrance while pinning the requested row inside the Main Entry panel.`,
        `${stats.currentSampleTitle} 在这里先作为一张[[逐行表面]]出现。直接打开某一行 URL 时，页面仍停在 canto 入口，但 Main Entry 内部会把请求的那一行固定到可读位置。`
      ),
      sections: [
        { label: choose("How to read it", "怎么读这一层"), body: makeBody(
          choose("Color and bar length show where commentary attention gathers. Clicking a row changes the selected line inside the entry panel; clicking a selectable word opens the word-locus path.", "颜色和横条长度先告诉你评论密度落在哪里。点一行会在 entry panel 内部切换当前选中行；点一个可选词，才会继续走到词位层。"),
          choose("That split matters because choosing a line and following a word are not the same act of reading.", "这个区分很重要，因为“先选一行”和“继续追一个词”并不是同一类阅读动作。")
        )},
        { label: choose("What the bar encodes", "横条在编码什么"), body: makeBody(
          choose("The bar is a local density cue, not an evaluative score. It tells you how many commentary records touch the line and how strongly the current canto's attention gathers there.", "这根横条是局部密度提示，不是评价分数。它告诉你有多少 commentary records 落到这一行，以及当前 canto 的注意力怎样在这里聚起来。"),
          choose("That makes Entry a diagnostic surface for reading order: you can decide whether to begin with a dense knot, a thin hinge line, or a quieter transition.", "所以 Entry 更像一层阅读诊断表面：你可以决定自己是先从一个高密度结点开始，还是从一条较薄的枢纽行、或一个较安静的过渡处开始。")
        )},
        { label: choose("Interpretability", "可解释性"), body: makeBody(
          choose("For philological use, Entry is helpful precisely because it still keeps Dante's line in front and does not dissolve it into aggregate metadata. For digital-humanities use, it is the primary line-addressable surface that binds overview, records, and word-level routes to the same selected line.", "对 philological 用法来说，Entry 的价值恰恰在于它仍然把 Dante 的行放在前面，没有把它溶成抽象元数据。对 digital humanities 用法来说，它则是第一层 line-addressable 表面，把 overview、records 和 word-level routes 绑到同一条被选中的行上。")
        )},
      ],
    },
    "close-reading": {
      title: choose("Close Reading", "注释细读 / Close Reading"),
      lead: choose(
        `This panel opens around ${currentLineLabel}. It is where summaries, previews, dates, spans, and full cards begin to behave like [[reading material]] rather than metadata.`,
        `这一层围绕${Number.isFinite(stats.selectedLine) ? `第 ${stats.selectedLine} 行` : "当前选中行"}展开。summary、preview、年代、span 和完整注释卡，不再只是元数据，而开始真正进入[[阅读材料]]。`
      ),
      sections: [
        { label: choose("What happens here", "这里发生什么"), body: makeBody(
          choose("The commentary records opened here are the records that actually reach the selected line. Entry gives you orientation; the tradition opens here as readable material rather than as distant metadata.", "这里打开的 commentary records，是那些真实覆盖到当前行的 records。Entry 负责先给你方位；真正打开解释传统的，是这里作为可读材料的展开，而不是一组遥远元数据。"),
          choose("Sorting and highlighting exist to support reading, not to turn the page into a database console.", "排序和高亮是为了帮助阅读，不是为了把页面做成数据库控制台。")
        )},
        { label: choose("What counts as evidence here", "这里什么算证据"), body: makeBody(
          choose("Dates, line spans, summaries, previews, and full text are staged together so that you can move from metadata to textual evidence without changing pages. That staging matters because commentary interpretation usually depends on both provenance and wording.", "日期、line span、summary、preview 和全文被放在同一层，是为了让你在不换页的情况下从 metadata 走到文本证据。这个分层很关键，因为 commentary interpretation 常常同时依赖出处与措辞。"),
          choose("The page therefore treats previews as invitations, not substitutes. When the wording matters, the full card remains the authority.", "所以这里的 preview 只是邀请，不是替身。真正到措辞重要的时候，完整 card 仍然是权威文本。")
        )},
        { label: choose("Why it matters for different readers", "为什么对不同读者都重要"), body: makeBody(
          choose("For a philologist, this is where interpretability becomes concrete: you can still inspect the wording that grounds any later claim. For a digital humanist, this is the layer where aggregation resolves back into inspectable records rather than staying a black-box output.", "对 philologist 来说，这里是 interpretability 真正落地的地方：你仍然能回看支撑后续判断的原始措辞。对 digital humanist 来说，这也是聚合结果重新落回可检查 records 的地方，而不是一直停留在 black-box output。")
        )},
      ],
    },
    "commentary-panel": {
      title: choose("Commentary", "评论区 / Commentary"),
      lead: choose(
        "The commentary cards for the selected line now live here, with Compare kept as a second subsection below rather than mixed into the card stack itself.",
        "当前所选行的 commentary cards 现在集中放在这里；Compare 被保留在下方的第二子区，而不再和卡片堆混在一起。"
      ),
      sections: [
        { label: choose("How to use it", "怎么用这一层"), body: makeBody(
          choose("Read this section first when you want the actual card stack reaching the line. Sorting here controls the commentary cards directly, while Compare remains a separate workspace below.", "如果你要看真正覆盖这一行的卡片堆，就先看这一层。这里的排序会直接作用在 commentary cards 上，而 Compare 仍然作为下方独立工作区存在。"),
          choose("The split is deliberate: Commentary is for reading what reaches the line; Compare is for pinning and laying cards side by side after you have chosen them.", "这个拆分是有意的：Commentary 负责读真正落到这一行的材料；Compare 负责在你选好之后，把卡片 pin 出来并排比较。")
        )},
        { label: choose("What the cards preserve", "这些卡片保留了什么"), body: makeBody(
          choose("The cards keep commentary name, date, span, preview, and expandable full text together because scholarly use often depends on being able to move between identity, chronology, and wording without leaving the local reading scene.", "这些卡片把 commentary 名称、年代、span、preview 和可展开全文放在一起，是因为学术阅读经常需要在作者身份、时间层和措辞之间来回切换，而不离开当前局部阅读现场。"),
          choose("Pinned cards, highlights, and inline expansion are therefore reading conveniences, not ornamental UI features.", "因此 pin、highlights 和原地展开，都应被看成阅读便利，而不是装饰性的 UI 动作。")
        )},
      ],
    },
    "compare-panel": {
      title: choose("Comparison Workspace", "比较区 / Comparison Workspace"),
      lead: choose(
        "This panel is not an automatic comparison engine. It is a [[comparison desk]] for the cards you choose to keep side by side.",
        "这不是一个自动比较引擎，而是一张把你亲手挑中的 cards 放进[[比较桌面]]的地方。"
      ),
      sections: [
        { label: choose("Why it helps", "它为什么有用"), body: makeBody(
          choose("Many strong Dante readings begin when two or three traditions sit beside each other. This panel turns that mental burden into a comparison space.", "很多真正有意思的 Dante 阅读，都是从两三条传统解释并排坐在一起开始的。这一层会把那种脑内负担变成一块真正可用的比较空间。")
        )},
        { label: choose("What it is not", "它不是什么"), body: makeBody(
          choose("Compare does not decide what belongs together. It waits for you to pin cards and then preserves that choice long enough for contrast, convergence, chronology, and vocabulary to become legible.", "Compare 不会替你决定什么应该并排。它会等待你自己 pin 住 cards，然后把这个选择保留得足够久，让差异、趋同、时间层和词汇偏向都能真正显形。"),
          choose("That restraint matters because comparison in commentary work is interpretive, not automatic.", "这种克制很重要，因为 commentary 的比较本身就是解释动作，而不是自动过程。")
        )},
      ],
    },
    "authority-panel": {
      title: choose("Authority", "人物层 / Authority"),
      lead: choose(
        `Authority is now a line-first reading surface with three scopes: Line, Canto Map, and Full Authority Page. The current local build exposes ${formatNumber(stats.authorityAuthorCount)} tracked authority authors, ${formatNumber(stats.personaggioCount)} personaggi, and ${formatNumber(stats.authoritySourceCount)} preserved commentary-source rows.`,
        `Authority 现在是一张 line-first 的阅读表面，有三个尺度：Line、Canto Map、Full Authority Page。按当前本地文件状态，它接上 ${formatNumber(stats.authorityAuthorCount)} 位 tracked authority authors、${formatNumber(stats.personaggioCount)} 个 personaggi，以及 ${formatNumber(stats.authoritySourceCount)} 条保留的 commentary-source rows。`
      ),
      sections: [
        { label: choose("What opens first", "最先打开什么"), body: makeBody(
          choose("When a line is selected, Authority opens on the Line scope. It shows the Dante line, the authorities and works detected in commentary records reaching that line, and a small reader that can open either one commentary record or a filtered work-specific record list.", "选中一行时，Authority 默认打开 Line 尺度。这里会显示 Dante 诗行、覆盖该行的 commentary records 中检测到的 authorities 与 works，并提供一个小 reader：既能打开单条注释全文，也能打开某个作品对应的记录列表。")
        )},
        { label: choose("How the scopes differ", "三个尺度怎么分工"), body: makeBody(
          choose("Line is for local accountability: who or what is invoked in records touching this line. Canto Map widens to the whole canto and shows which lines and authorities carry the strongest signals. Full Authority Page returns to the larger author/personaggio room with text, commentary, and work-layer tabs.", "Line 负责局部核查：覆盖这一行的 records 调用了谁、调用了哪些作品。Canto Map 放宽到整个 canto，显示哪些行和哪些 authorities 信号最强。Full Authority Page 则回到更大的 author/personaggio 房间，包含正文层、注释层与 work-layer tabs。")
        )},
        { label: choose("What is currently mounted", "当前已经挂上什么"), body: makeBody(
          choose(`The mounted layer currently includes ${formatNumber(stats.authorityAuthorCount)} tracked authors, ${formatNumber(stats.personaggioCount)} personaggi, per-canto authority indexes, line-level work mentions, author rooms, static autore pages, and commentary-source rows. Those pieces do not all make the same claim; they provide different routes back to the records that invoked them.`, `当前挂载层包含 ${formatNumber(stats.authorityAuthorCount)} 位 tracked authors、${formatNumber(stats.personaggioCount)} 个 personaggi、逐 canto 的 authority indexes、逐行 work mentions、author rooms、静态 autore pages，以及 commentary-source rows。这些部件并不支持同一种强度的判断；它们提供的是不同层级的回证路径。`)
        )},
      ],
    },
    "analysis-layer": {
      title: "Analysis Layer / Line Snapshot",
      lead: choose(
        "This is a first contour of the selected line. It lets you feel [[density, spread, and historical span]] before you enter the full card stack.",
        "这是当前选中行的一层第一轮轮廓。它先让你摸到[[密度、分布和历史跨度]]，再决定要不要往下面的大堆 cards 深读。"
      ),
      sections: [
        { label: choose("What it gathers", "它先拢什么"), body: makeBody(
          choose("It gathers coverage, granularity, top commentary terms, diachronic span, and century distribution from the records already attached to the line.", "它把这行已经落地的 records 拢成几类可读信号：coverage、granularity、top commentary terms、diachronic span 和 century distribution。")
        )},
        { label: choose("Why this layer comes first", "为什么它要先出现"), body: makeBody(
          choose("The snapshot is deliberately fast and thin. It is meant to answer whether the line is sparsely touched, densely saturated, temporally broad, or clustered in certain centuries before you commit to the full card stack.", "这层快照被故意做得又快又薄。它的作用是在你下潜到完整 card stack 之前，先回答这行到底是稀薄、饱和、跨时很广，还是集中在某些世纪。"),
          choose("It is a contour layer, not an argument layer. Its job is to orient, not to settle interpretation.", "它是 contour layer，不是 argument layer。它的任务是定向，而不是替你结束解释。")
        )},
      ],
    },
    "commentary-terms": {
      title: choose("Commentary Terms", "Commentary Terms / 注释词汇"),
      lead: choose(
        "These are weighted terms that recur across the commentary records touching the current line.",
        "这些词是从覆盖当前行的 commentary records 里收出来的加权高频词。"
      ),
      sections: [
        { label: choose("How they are built", "它怎么来"), body: makeBody(
          choose("When backend-generated terms are available, the panel uses the line-span-weighted contour already prepared from record summaries and preview text.", "如果后端已经生成这组词，前端会直接使用那份基于 record summary 和 preview text 的 line-span-weighted contour。"),
          choose("The list is filtered to remove stopwords, thin function-word residue, weak commentary noise, and low-value verb leftovers, so what remains is meant to be a small reading handle rather than a raw frequency dump.", "这组词会过滤掉 stopwords、功能词残片、较弱 commentary noise 和价值很低的动词残留，所以最后留下来的不是原始词频，而是一小组更适合阅读的把手。")
        )},
        { label: choose("How to interpret them", "怎么解释这些词"), body: makeBody(
          choose("These terms do not claim to be Dante's own semantic center. They summarize the commentary language clustering around the line. Read them as a local lexical contour of reception, not as a doctrinal definition of the verse.", "这些词并不声称自己就是 Dante 原文的语义中心。它们总结的是围绕这行聚集起来的 commentary language。最稳妥的读法，是把它们当作接受史的局部词汇轮廓，而不是诗句教义意义的定义。"),
          choose("For a digital humanist, the important point is that this is already a filtered, weighted output. For a philologist, the important point is that the cards below remain available for verification.", "对 digital humanist 来说，关键在于这已经是一组被过滤、加权后的输出；对 philologist 来说，关键则在于下面的 cards 仍然随时可以拿来核对。")
        )},
      ],
    },
    "semantic-fields": {
      title: "Interpretive Fields",
      lead: choose(
        `This panel gathers the commentary records reaching ${currentLineLabel} into a few steadier local interpretive directions. The fields come from [[clustering of commentary language]], not from [[Dante's own text]].`,
        `这一层会把覆盖 ${Number.isFinite(stats.selectedLine) ? `第 ${stats.selectedLine} 行` : "当前选中行"} 的 commentary records 收成几组更稳的局部解释方向。这些 fields 来自[[commentary language 的局部聚类]]，不是[[但丁原文自己的主题分类]]。`
      ),
      sections: [
        { label: choose("How to read it", "怎么读这一层"), body: makeBody(
          choose("Treat each field as a local commentary cluster, not as a named Dante theme. It points to a recurring direction in the commentary tradition around this line.", "把每个 field 当作局部 commentary cluster 来读，而不要把它直接当作但丁主题名称。它指向的是围绕这一行反复出现的一种注释方向。"),
          choose("A field name is only a reading handle. It points you toward a local interpretive direction; it does not replace the cards themselves.", "field 名称只是阅读把手。它指向的是一种局部解释方向，本身并不替代下面的 cards。")
        )},
        { label: choose("Why it is more selective now", "为什么现在更克制"), body: makeBody(
          choose("Representative terms are now weighted more by line anchoring, commentator spread, and label stability, not just by cluster mass.", "现在 representative terms 更看重 line anchoring、commentator spread 和 label stability，而不只是 cluster 自身的体量。"),
          choose("If a field looks too broad, too token-like, or too close to commentary residue, it can be pushed down or hidden. The goal is fewer but more usable local directions.", "如果一个 field 太泛、太像 token residue、或太接近 commentary residue，它就会被压后甚至隐藏。目标是让这层变成“更少但更能拿来读”的局部解释方向。")
        )},
        { label: choose("What clicking does", "点击之后会发生什么"), body: makeBody(
          choose("Clicking a field filters the related cards below, so this panel acts as a thematic doorway into Close Reading rather than a detached dashboard.", "点击任一 field，会直接过滤下方 related cards，所以这层更像通往细读区的主题入口，不是脱离现场的小 dashboard。")
        )},
      ],
    },
    "dante-word-locus": {
      title: "Dante Word Locus Layer",
      lead: choose(
        `The local Dante word-locus index currently exposes ${formatNumber(stats.danteWordProfileCount)} profiles. This layer begins from [[one selected content word]] in the poem and follows what grows around it in the poem and in the commentary.`,
        `当前本地 Dante word-locus index 有 ${formatNumber(stats.danteWordProfileCount)} 个 profile。这一层从诗里[[一个被选中的 content word]]出发，继续追它在正文和注释层周围长出来的东西。`
      ),
      sections: [
        { label: choose("What it is for", "这层是做什么的"), body: makeBody(
          choose("It lets a single word open a reading path through recurrence, local concurrence, phrase growth, and commentary vocabulary.", "它会让一个词继续长出 recurrence、局部 concurrence、phrase growth 和 commentary vocabulary 这些阅读路径。"),
          choose("Its value comes from honesty: it does not pretend to be a finished morphology engine or a complete recurrence system.", "它的价值来自诚实：它不会假装自己已经是一个完整 morphology engine，或一个收工了的 recurrence system。")
        )},
      ],
    },
    "occurrence-explorer": {
      title: "Occurrence Explorer",
      lead: choose(
        "This panel begins with exact-form recurrence, with a cautious family-level pilot for a small set of words.",
        "这一层先从 exact-form recurrence 开始；对少量词，再开放一个很保守的 family-level pilot。"
      ),
      sections: [
        { label: choose("Why it matters", "为什么这层重要"), body: makeBody(
          choose("Before interpretation, it asks a factual question: does this word come back elsewhere in the poem? That confirmation is already a meaningful step.", "在解释之前，它先问一个事实问题：这个词会不会在别处回来？这个确认本身已经是有意义的一步。")
        )},
      ],
    },
    "micro-context-concurrence": {
      title: "Weighted Micro-Context Concurrence",
      lead: choose(
        "This is a local co-occurrence window around the current word. It is not a topic model and not a global semantic cluster.",
        "这是围绕当前词的一层局部共现窗口。它不是 topic model，也不是全局语义聚类。"
      ),
      sections: [
        { label: choose("What you see here", "这里看什么"), body: makeBody(
          choose("It keeps the scale deliberately small, so you can notice which content words gather near the current locus without drifting too far away from the poem.", "它故意把尺度压小，让你看见哪些 content words 会在当前 loci 附近聚起来，而不至于一下子离诗太远。")
        )},
        { label: choose("Current filtering", "当前过滤规则"), body: makeBody(
          choose("Very weak items are hidden by default, ties prefer terms with more surviving windows, and the displayed windows try to keep at least one line that still contains the current focus word.", "默认会隐藏很弱的项；同分时，保留下来的窗口更多的 term 会排前；展示窗口也会尽量保留至少一行仍然明确包含当前 focus word。")
        )},
      ],
    },
    "phrase-expansions": {
      title: "Exact Local Phrase Expansions",
      lead: choose(
        "This panel widens the scale slightly, moving from one word to a local phrase that repeats exactly.",
        "这一层会把尺度轻轻抬高一点，从一个词走到一个会 exact 重复出现的局部短语。"
      ),
      sections: [
        { label: choose("Why this helps", "它为什么有帮助"), body: makeBody(
          choose("A single word can be suggestive, but a repeated local phrase is often more stable. This layer lets you see that firmer return.", "单个词有时只是一个信号，但一个会重复出现的局部短语通常更稳。这层让你看到这种更稳的回返。")
        )},
      ],
    },
    "figure-navigation": {
      title: "Figure Navigation",
      lead: choose(
        `Figure Navigation now reads from the authority/personaggio layer rather than the old research-only shelf. The current local atlas exposes ${formatNumber(stats.personaggioCount)} personaggi with poem-side and commentary-side routes where available.`,
        `Figure Navigation 现在读取 authority/personaggio layer，而不是旧的 research-only shelf。当前本地 atlas 暴露 ${formatNumber(stats.personaggioCount)} 个 personaggi；可用时会同时保留 poem-side 和 commentary-side 路径。`
      ),
      sections: [
        { label: choose("Why it belongs here", "为什么它适合在这里"), body: makeBody(
          choose("It keeps figure-based reading close to the poem and the cards, instead of forcing you into a detached encyclopaedic index. Personaggi now open through poem hits, commentary aliases, and figure-specific bands rather than through a thin profile shelf.", "它让人物阅读始终贴着诗句和 cards 走，而不是把你突然扔进一张脱离现场的人物索引表。现在 personaggi 会通过 poem hits、commentary aliases 和 figure-specific bands 打开，而不是靠一层很薄的旧 profile shelf。")
        )},
        { label: choose("Why figures need their own path", "为什么人物需要自己的路径"), body: makeBody(
          choose("Figures are not just authorities with different labels. They belong to the dramatic economy of the poem as well as to the commentary tradition. Figure Navigation matters because it lets those two roles stay visible together.", "人物并不只是换了标签的 authority。它们既属于诗的戏剧现场，也属于评论传统。Figure Navigation 的意义就在于：它让这两种身份能够同时保持可见。"),
          choose("That makes it especially useful for readers who need to move from a named figure in the verse to the commentary habits that accrete around that figure.", "所以它尤其适合那些需要从诗句里的某个人物，一路追到围绕这个人物长出来的 commentary 习惯的读者。")
        )},
      ],
    },
    "authority-lens": {
      title: "Authority Lens",
      lead: choose(
        "Full Authority Page is the wider authority room: author chips, a biblical shelf, Text Layer, Commentary Layer, Work Layer, and links out to static autore or personaggio pages when those rooms exist.",
        "Full Authority Page 是更大的 authority room：这里有 author chips、Biblical shelf、Text Layer、Commentary Layer、Work Layer；如果静态 autore 或 personaggio 页面已经存在，也会从这里连出去。"
      ),
      sections: [
        { label: choose("How it reads", "它怎么组织阅读"), body: makeBody(
          choose("The aim is not to drown you in a giant tree. The room first states the selected authority's current contract, then lets you move through text hits, commentary evidence, and work-layer drill-down according to what is actually mounted for that author.", "它不是要用一棵巨大的树淹没你。这个房间会先说明当前 authority 的入口契约，再让你按该作者真实挂载的状态进入正文命中、注释证据和 work-layer drill-down。"),
          choose("The path is deliberately staged: author identity first, text/commentary evidence next, and works-tree or flat work overview only where that layer is present.", "这条路径刻意分层：先确认 author identity，再看正文 / commentary 证据；只有当 works-tree 或 flat work overview 真实存在时，才进入作品层。")
        )},
      ],
    },
    "contrastive-vocabulary": {
      title: "Contrastive Interpretive Vocabulary",
      lead: choose(
        "This panel is not a simple frequency list. It shows which interpretive words are doing more real work around the current locus.",
        "这一层不是普通词频表，而是在看当前 loci 周围哪些 interpretive words 真正更有解释分量。"
      ),
      sections: [
        { label: choose("What it gives you", "它给你什么"), body: makeBody(
          choose("It reconnects word-based reading to commentary language, so you can see not only that a word returns, but what explanatory vocabulary tends to gather around it.", "它会把词位阅读重新接回 commentary 语言本身。你不只是看到一个词会不会回来，也会开始看到围绕它的解释性词汇通常偏向哪里。")
        )},
      ],
    },
    "recurrence-candidates": {
      title: "Cross-Canto Echoes",
      lead: choose(
        "This is the current sentence-level Cross-Canto Echoes layer in the local workbench: a [[text-first]] line-comparison surface that starts from [[Dante's line]], then widens through nearby terzina context, with commentary kept lighter in support.",
        "这是当前本地 workbench 里的句段级 Cross-Canto Echoes 层：它是一张[[text-first]] 的并读表面，先看[[Dante 原文这一行]]，再放宽到附近 terzina 上下文，commentary 只作为较轻辅助。"
      ),
      sections: [
        { label: choose("How it reads", "它怎么读"), body: makeBody(
          choose("The current line remains the anchor. [[Candidate lines]] are shown only as prompts for controlled parallel reading, not as final claims that the poem has already declared a formal intertext.", "当前行仍然是锚点。[[候选行]]只是受控制的并读提示，不是诗本身已经宣布 formal intertext 的最终判断。")
        )},
        { label: choose("How to read the pills and tags", "顶部 pills 和卡片标签怎么读"), body: makeBody(
          choose("The pills summarize how to approach the result: whether it is reviewable or thinner, whether it looks backward or forward, and which overlap terms made it visible. Read the tags as workflow-aware prompts rather than universal literary taxonomies.", "这些 pills 会提示你怎么接近结果：它是 reviewable 还是 thinner，是回望还是前指，以及哪些 overlap terms 让它留在台面上。请把这些标签读成 workflow-aware 的工作提示，而不是普适性的文学 taxonomy。")
        )},
      ],
    },
  };

  const audienceAdditions = {
    "quick-jump": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["quick-jump"]?.lead,
        choose(
          "Philologically, Quick Jump is a controlled citation doorway: it should make clear whether you arrived by place in the poem or by a word-form search.",
          "从 philological 角度，Quick Jump 是一个受控 citation 入口：它应该让你分清自己是按诗中位置抵达，还是按某个词形搜索抵达。"
        ),
        choose(
          "Algorithmically, Quick Jump first decides what kind of claim the query is making: a claim about place in the poem or a claim about lexical recurrence.",
          "从算法上说，Quick Jump 会先判断这条输入在提出什么主张：它是在声称一个诗中坐标，还是在声称一个词语回返。"
        )
      ),
      philologist: [
        { label: choose("Citation first", "先保证 citation"), body: makeBody(
          choose("A coordinate query should land on a verifiable canto or line, not on an approximate search result. A lexical query should still return you to a line, record, or locus that can be inspected in context.", "坐标查询应该落到可核查的 canto 或 line，而不是近似搜索结果。词语查询也应该回到可检查的 line、record 或 locus，而不是脱离现场的 snippet。"),
          choose("The useful distinction is simple: location queries cite place; lexical queries cite recurrence. Both need to remain visible before interpretation begins.", "最有用的区分很简单：location query 引用位置；lexical query 引用回返。解释开始之前，这两种入口都应该保持可见。")
        )},
        { label: choose("Verification path", "核查路径"), body: makeBody(
          choose("After a jump, the philological check is the same: read the displayed Dante line, then inspect the cards or word-locus layer that the route opened.", "跳转之后，philological 核查路径是一样的：先读显示出来的 Dante 诗行，再检查这条 route 打开的 cards 或 word-locus layer。"),
          choose("If a result cannot be followed back to a visible line or preserved record wording, it should not be treated as evidence.", "如果某个结果不能追回到可见诗行或保留下来的 record wording，就不应该被当作证据。")
        )},
      ],
      dh: [
        { label: choose("Classification rule", "分类规则"), body: makeBody(
          choose("The query is normalized once, then tested in a strict order: exact mounted sample id, cantica+canto, cantica+canto+line, and only after that lexical search. The reason is methodological: a coordinate claim should beat a token match.", "query 会先 normalize 一次，再按严格顺序测试：exact mounted sample id、cantica+canto、cantica+canto+line，最后才是 lexical search。理由是方法论上的：坐标主张应该优先于 token match。"),
          choose("Roman and Arabic numerals collapse into the same canto/line coordinates before any result is returned, so `Purgatorio XXX 48` and `Purg 30 48` are treated as the same citation request.", "Roman 数字和 Arabic 数字会先折叠到同一套 canto/line 坐标里，所以 `Purgatorio XXX 48` 和 `Purg 30 48` 会被当作同一类 citation 请求。")
        )},
        { label: choose("Why a result appears", "为什么这个结果会出现"), body: makeBody(
          choose("If the parser recognizes a citation, the result appears because the query resolved to a mounted sample/line, not because it won a relevance contest. If the parser fails, search results appear because the static index found a token match in line text or commentary text.", "如果 parser 识别出 citation，结果出现是因为 query 解析到了 mounted sample/line，不是因为它赢了某种 relevance 竞赛。若 parser 失败，search results 出现则是因为静态索引在 line text 或 commentary text 里找到了 token match。"),
          choose("Commentary hits can focus a record only when the indexed hit carries enough location metadata or record identity to justify that jump.", "只有当 indexed hit 携带了足够的位置 metadata 或 record identity 时，commentary hit 才会被允许聚焦到某条 record。")
        )},
        { label: choose("Interpretive boundary", "解释边界"), body: makeBody(
          choose("Quick Jump does not decide meaning. It only decides whether your input is better read as citation or lexical recall, then sends you back to inspectable line/card context.", "Quick Jump 不决定意义。它只决定你的输入更像 citation 还是 lexical recall，然后把你送回可检查的 line/card 语境。")
        )},
      ],
    },
    "canto-browser": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["canto-browser"]?.lead,
        choose(
          "Philologically, the browser restores the poem's architecture before any local reading layer starts interpreting a line.",
          "从 philological 角度，browser 会在任何局部阅读层开始解释之前，先把诗的整体架构重新立起来。"
        ),
        choose(
          "Algorithmically, the browser is not a ranking layer at all. It exposes only what the mounted Commedia shell and manifest actually admit.",
          "从算法上说，browser 根本不是一层 ranking。它只暴露 mounted Commedia shell 与 manifest 真正承认存在的部分。"
        )
      ),
      philologist: [
        { label: choose("Poem architecture", "诗的架构"), body: makeBody(
          choose("A line should not first appear as an isolated data point. The browser places it inside cantica, canto, and the visible sequence of the poem before density or commentary evidence enters.", "一行诗不应该首先以孤立数据点出现。browser 会先把它放回 cantica、canto 和诗的可见顺序里，然后才轮到 density 或 commentary evidence。"),
          choose("That placement is already part of the evidence chain: it tells you where the line stands before you ask how commentators treated it.", "这种位置关系本身就是证据链的一部分：它先告诉你这行诗站在哪里，然后你才去问 commentators 怎样处理它。")
        )},
        { label: choose("Reading scale", "阅读尺度"), body: makeBody(
          choose("Use the browser to keep local interpretation from losing scale. A dense line in one canto means something different from the same density at another point in the poem's movement.", "用 browser 来防止局部解释失去尺度。同样的高密度，落在某个 canto 的某处，和落在另一处，意义并不一样。")
        )},
      ],
      dh: [
        { label: choose("Availability rule", "可用规则"), body: makeBody(
          choose("Each canto tile exists because it belongs to the fixed Commedia shell. It becomes active only if its expected sample id is mounted in the manifest. So a missing tile is a corpus boundary, not a low-relevance result.", "每个 canto tile 的存在是因为它属于固定 Commedia shell。只有当它对应的 sample id 在 manifest 里被挂上时，它才会变成 active。因此缺失 tile 代表的是语料边界，不是低相关结果。"),
          choose("Counts shown on the tile come from mounted sample metadata, so the browser is summarizing declared coverage rather than inferring it from downstream panels.", "tile 上显示的 counts 来自 mounted sample metadata，所以 browser 总结的是已声明的 coverage，而不是从下游 panels 倒推出来的。")
        )},
        { label: choose("Why this line opens first", "为什么先打开这一行"), body: makeBody(
          choose("The opening line is chosen by a deterministic rule: requested line first, then line 1, then the first mounted overview line. The point is to avoid any hidden relevance heuristic at the moment of entry.", "初始行由确定性规则选出：先 requested line，再 line 1，再 overview 里的第一条 mounted line。目的就是在入口处避免任何隐藏 relevance heuristic。"),
          choose("So the first line you see is a contract decision about entry order, not a claim that the system has identified the most important line in the canto.", "所以你最先看到的行，是一个关于 entry order 的契约决定，而不是系统在声称自己找到了 canto 里最重要的一行。")
        )},
        { label: choose("Interpretive boundary", "解释边界"), body: makeBody(
          choose("The browser tells you what canto is mounted and where entry begins. It does not yet say how strongly any line was read; that claim begins only once line-level counts are computed.", "browser 告诉你的只是哪个 canto 被挂上、入口从哪里开始。它还没有开始声称哪一行被强烈阅读；那个判断要等到 line-level counts 真正被计算出来才成立。")
        )},
      ],
    },
    "entry-panel": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["entry-panel"]?.lead,
        choose(
          "Philologically, Entry keeps Dante's verse in front of the apparatus: line first, metadata second.",
          "从 philological 角度，Entry 会把 Dante 诗句放在 apparatus 前面：先有 line，再有 metadata。"
        ),
        choose(
          "Algorithmically, Entry is a line-density layer: each row is here because commentary records touch that line, and each bar is scaled by a local counting rule rather than by literary judgment.",
          "从算法上说，Entry 是一层 line-density 层：每一行会出现在这里，是因为 commentary records 触及了它；每一根 bar 也只是遵循局部计数规则，而不是文学判断。"
        )
      ),
      philologist: [
        { label: choose("Line as citation", "line 作为 citation"), body: makeBody(
          choose("The visible verse is the first object of reading. Density bars can guide attention, but they should not replace the line as the citation anchor.", "可见诗句是第一阅读对象。density bar 可以引导注意力，但不应该替代诗行成为 citation anchor。"),
          choose("Clicking the row asks what commentary tradition reaches this line; clicking a word asks a narrower lexical question. Those are different philological gestures.", "点整行是在问有哪些 commentary tradition 覆盖到这一行；点某个词是在提出更窄的 lexical question。这是两种不同的 philological gestures。")
        )},
        { label: choose("How to use density", "怎样使用密度"), body: makeBody(
          choose("Read density as attention, not value. A thin line may be interpretively crucial; a dense line may simply have attracted conventional explanation.", "把 density 读成 attention，而不是 value。一条很薄的行可能解释上很关键；一条很密的行也可能只是吸引了常规解释。")
        )},
      ],
      dh: [
        { label: choose("Density calculation", "密度计算"), body: makeBody(
          choose("The line count is a direct coverage count: every record whose span reaches the line contributes one unit. Single-line notes and broader range notes therefore both count, because both are part of the reception pressure touching that line.", "line count 是一个直接 coverage count：凡是 span 触到这一行的 record，都贡献一个单位。所以 single-line note 和更宽的 range note 都会被计入，因为它们都属于触及此行的 reception pressure。"),
          choose("Bar width is normalized against the densest line in the current canto, which is why Entry compares local attention within one canto rather than across the entire site.", "bar width 会按当前 canto 里最密的一行归一化，这也是为什么 Entry 比较的是单一 canto 内的局部 attention，而不是全站统一排名。")
        )},
        { label: choose("Why a word is selectable", "为什么这个词可点"), body: makeBody(
          choose("A token opens the word-locus path only when the current line payload marks it as a selectable locus or the fallback locus builder can normalize it into a safe content-word target. In practice that means the page is trying to open only loci that can support recurrence-style reading.", "一个 token 只有在当前 line payload 把它标成 selectable locus，或 fallback locus builder 能把它 normalize 成安全的 content-word target 时，才会打开 word-locus path。实际上，这意味着页面只想打开那些足以支撑 recurrence-style reading 的 loci。")
        )},
        { label: choose("Interpretive boundary", "解释边界"), body: makeBody(
          choose("Entry supports one limited conclusion: this line attracted more or fewer commentary records than its neighbors. It does not yet tell you why that happened, nor whether the line is more important in any absolute literary sense.", "Entry 只支持一个有限结论：这一行比附近行吸引了更多或更少 commentary records。它还不能告诉你为什么会这样，也不能把它直接升级成绝对文学重要性的判断。")
        )},
      ],
    },
    "close-reading": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["close-reading"]?.lead,
        choose(
          "Philologically, Close Reading is the verification surface where a claim can move from Dante's line to record identity, date, span, and preserved wording.",
          "从 philological 角度，Close Reading 是核查表面：一个判断应该能从 Dante 行走到 record identity、date、span 和 preserved wording。"
        ),
        choose(
          "Algorithmically, Close Reading shows the evidence stack justified by the selected line: records are here because their stored spans include this line, not because a later theme label pulled them in.",
          "从算法上说，Close Reading 展示的是被当前 line 正当化的 evidence stack：records 会在这里，是因为它们的存储 span 包含这条 line，而不是因为后来的主题标签把它们拉了进来。"
        )
      ),
      philologist: [
        { label: choose("Evidence chain", "证据链"), body: makeBody(
          choose("The reliable path is line, record, date/span, preview, then full text. Each step should preserve enough provenance to let you decide whether the reading is usable.", "可靠路径是 line、record、date/span、preview、再到 full text。每一步都应该保留足够 provenance，让你判断这条材料是否可用。"),
          choose("A preview can orient you, but if the argument depends on wording, the expandable text is where the philological check happens.", "preview 可以定向；但只要论证依赖措辞，可展开文本才是 philological check 真正发生的地方。")
        )},
        { label: choose("Span discipline", "span 纪律"), body: makeBody(
          choose("Single-line notes and range-based records do not carry the same evidentiary weight. Always check whether the record speaks directly to the line or reaches it through a broader span.", "single-line notes 和 range-based records 的证据重量并不一样。一定要检查 record 是直接谈这一行，还是通过更宽的 span 覆盖到它。")
        )},
      ],
      dh: [
        { label: choose("Inclusion rule", "纳入规则"), body: makeBody(
          choose("A record appears here because the selected line lies inside that record's stored line span. That rule is deliberately literal: the page is surfacing what reaches the line, not what a later summarizer thinks is thematically relevant.", "一条 record 会出现在这里，是因为 selected line 落在它的存储 line span 内。这个规则被故意保持得很字面：页面想浮出的是确实覆盖到此行的材料，而不是后来某个 summarizer 觉得“主题相关”的材料。"),
          choose("Single-line versus range status is computed directly from line_span, so span breadth remains part of the evidence rather than being hidden.", "single-line 与 range status 直接由 line_span 计算，因此 span 宽度本身会保留成证据的一部分，而不是被隐藏。")
        )},
        { label: choose("Sorting and filters", "排序与过滤"), body: makeBody(
          choose("Sorting changes order over the same line-bound set; it does not create new evidence. Date sort foregrounds chronology, commentary sort foregrounds witness identity, and span-aware views foreground how narrowly or broadly a commentator was reading.", "排序改变的是同一批 line-bound records 的顺序；它不会制造新证据。date sort 让 chronology 更醒目，commentary sort 让 witness identity 更醒目，span-aware 的视图则让 commentator 读得多窄或多宽更醒目。"),
          choose("Field and term filters narrow the visible slice, but they inherit the same line-bound source set. So filtered cards are still records touching this line, not cross-line recommendations.", "field 和 term filters 会缩小可见切片，但它们继承的仍是同一批 line-bound source set。因此被过滤后留下的 cards，依然是触及此行的 records，而不是跨行推荐。")
        )},
        { label: choose("Interpretive boundary", "解释边界"), body: makeBody(
          choose("Close Reading justifies one strong claim: these are preserved commentary witnesses that actually reach the selected line. Any stronger literary claim still has to be argued by reading them.", "Close Reading 只足以支撑一个强结论：这些是确实覆盖到 selected line 的保留 commentary witnesses。任何更强的文学结论，仍然必须靠阅读这些 witnesses 本身去论证。")
        )},
      ],
    },
    "commentary-panel": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["commentary-panel"]?.lead,
        choose(
          "Philologically, the commentary card stack should be read as witnesses with provenance, date, span, and wording.",
          "从 philological 角度，commentary card stack 应该被读作一组带 provenance、date、span 和 wording 的 witnesses。"
        ),
        choose(
          "Algorithmically, Commentary is the filtered witness set for the selected line: the important question is not how the cards were drawn, but why these records survived into view.",
          "从算法上说，Commentary 是当前 line 的过滤后 witness set：重要问题不是 cards 怎样被画出来，而是为什么这些 records 能留在视野里。"
        )
      ),
      philologist: [
        { label: choose("Cards as witnesses", "cards 作为 witnesses"), body: makeBody(
          choose("Each card is a commentary witness, not an extracted fact. Read author/commentary name, date, span, summary, preview, and full text together.", "每张 card 都是一条 commentary witness，不是抽取出来的事实。要把 author/commentary name、date、span、summary、preview 和全文一起读。"),
          choose("Highlights can help you find pressure points, but the record's own language remains the authority.", "高亮可以帮你找到压力点，但解释权威仍然在 record 自己的语言里。")
        )},
        { label: choose("Use of pinning", "pin 的用法"), body: makeBody(
          choose("Pinning means keeping a witness on the desk for comparison. It should not feel like accepting an automatic conclusion from the system.", "pin 的意思是把一个 witness 留在桌面上方便比较，而不是接受系统替你给出的自动结论。")
        )},
      ],
      dh: [
        { label: choose("Visible-card formula", "visible-card 公式"), body: makeBody(
          choose("A card survives into view only if it first belongs to the selected line's record set and then survives the active semantic-field, interpretive-term, focus, and search filters. So visibility means 'still justified by the current rule stack,' not 'best in the whole corpus.'", "一张 card 只有在先属于 selected line 的 record set、再通过当前 semantic-field、interpretive-term、focus 与 search filters 之后，才会留在视野里。所以可见性的意思是“仍被当前规则栈正当化”，不是“全库最佳”。"),
          choose("Display deduplication is only a safeguard against near-identical card surfaces. It does not mean the underlying record disappeared from the payload.", "display deduplication 只是防止近似重复的 card surface 反复出现；它不意味着底层 record 从 payload 里消失。")
        )},
        { label: choose("Sort comparators", "排序比较器"), body: makeBody(
          choose("The comparators answer different scholarly questions over the same witnesses: chronology, commentator identity, or span breadth. They do not change what counts as evidence; they only change which evidentiary dimension rises first to the eye.", "这些 comparators 是在同一批 witnesses 上回答不同学术问题：chronology、commentator identity 或 span breadth。它们不改变什么算证据，只改变哪一维证据先跳到眼前。")
        )},
        { label: choose("Interpretive boundary", "解释边界"), body: makeBody(
          choose("Commentary can justify that certain witnesses belong to the current local reading scene under the current filters. It cannot by itself justify a theme or argument until the reader returns to wording and provenance.", "Commentary 足以证明某些 witnesses 在当前过滤条件下属于当前局部阅读现场；但在读者重新回到 wording 与 provenance 之前，它本身还不足以证明某个主题或论证。")
        )},
      ],
    },
    "compare-panel": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["compare-panel"]?.lead,
        choose(
          "Philologically, Compare is a workspace for holding selected witnesses side by side long enough to inspect wording, chronology, and disagreement.",
          "从 philological 角度，Compare 是让选中的 witnesses 并排停留足够久，以便核查措辞、年代和分歧的工作区。"
        ),
        choose(
          "Algorithmically, Compare is deliberately thin: it preserves a reader-chosen dossier rather than computing a fresh similarity judgment.",
          "从算法上说，Compare 被故意做得很薄：它保留的是读者自己选出的 dossier，而不是重新计算一轮相似性判断。"
        )
      ),
      philologist: [
        { label: choose("Comparison as judgment support", "comparison 作为判断辅助"), body: makeBody(
          choose("The system does not decide which witnesses belong together. You choose them, then Compare keeps wording, chronology, span, and authority signals visible long enough for judgment.", "系统不会替你决定哪些 witnesses 应该放在一起。你选择它们，Compare 负责把措辞、时间、span 和 authority signals 保持可见，供你判断。"),
          choose("Agreement in theme is not the same as agreement in wording. Compare is useful because it keeps those differences visible.", "主题相近不等于措辞相同。Compare 的价值就在于让这些差异保持可见。")
        )},
        { label: choose("Evidence boundary", "证据边界"), body: makeBody(
          choose("A pinned set is a working dossier, not a conclusion. If a contrast matters, return to each full card before citing it.", "pin 出来的集合是工作 dossier，不是结论。若某个差异重要，引用前仍要回到每张完整 card。")
        )},
      ],
      dh: [
        { label: choose("Dossier calculation", "dossier 计算"), body: makeBody(
          choose("Compare begins from pinned record identities. The panel resolves those ids back into preserved witnesses, keeps their sample/line provenance, and computes shared headings only where the chosen witnesses really share a location.", "Compare 从 pinned record identities 开始。panel 会把这些 ids 解析回保留下来的 witnesses，保留 sample/line provenance，并且只在这些 witnesses 真正共享 location 时才计算 shared heading。"),
          choose("So the panel's core claim is reader-curated adjacency, not system-discovered similarity.", "因此这层的核心主张是 reader-curated adjacency，而不是 system-discovered similarity。")
        )},
        { label: choose("Why they stay side by side", "为什么它们会并排"), body: makeBody(
          choose("Cards stay side by side because the reader pinned them, not because the system decided they belong to one latent cluster. Metadata pills and origin notes simply keep the reasons for comparison legible.", "cards 会并排停留，是因为读者亲手 pin 住了它们，而不是系统替你决定它们属于同一个 latent cluster。metadata pills 和 origin notes 只是让比较理由保持可读。")
        )},
        { label: choose("Interpretive boundary", "解释边界"), body: makeBody(
          choose("Compare supports contrast once the witnesses are chosen, but it does not justify the choice itself. The argument for putting them together still belongs to the reader.", "Compare 可以在 witnesses 已选定之后支持对比，但它并不替这次选择本身背书。把它们放在一起的论证仍然属于读者。")
        )},
      ],
    },
    "authority-panel": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["authority-panel"]?.lead,
        choose(
          "Philologically, Authority should keep names and works accountable to the exact line, record, and wording that made them visible.",
          "从 philological 角度，Authority 应该让 names 与 works 对让它们显形的具体 line、record 和 wording 负责。"
        ),
        choose(
          "Algorithmically, the inline Authority panel now begins from line-bound work mentions and per-canto authority indexes, then routes outward only when a mounted object or stored sidecar justifies the path.",
          "从算法上说，inline Authority panel 现在从 line-bound work mentions 和 per-canto authority indexes 开始；只有 mounted object 或已存储 sidecar 能正当化路径时，才继续向外路由。"
        )
      ),
      philologist: [
        { label: choose("Line first", "line 先行"), body: makeBody(
          choose("Start with the line card. The authority names and work chips shown there are not freestanding references; they are summaries of commentary records that reach the selected line.", "先从 line card 读起。这里的 authority names 和 work chips 不是脱离现场的参考书目，而是覆盖当前行的 commentary records 的压缩摘要。"),
          choose("Clicking a work chip, such as Vita Nuova or Convivio, opens the record list that produced that count. Clicking Open in reader opens one preserved commentary record. Those two gestures should stay distinct.", "点击 Vita Nuova 或 Convivio 这样的 work chip，会打开产生该计数的 records 列表；点击 Open in reader 则打开单条保留注释。两种动作应该保持区分。")
        )},
        { label: choose("Do not detach authority", "不要把 authority 拆离现场"), body: makeBody(
          choose("Authority should widen the reading scene without leaving it. Use Line to inspect the local invocation, Canto Map to see where the same authority gathers across the canto, and Full Authority Page only after you need the larger author room.", "Authority 应该扩展阅读现场，而不是离开现场。用 Line 核查局部调用，用 Canto Map 看同一 authority 在整个 canto 的聚集位置；只有需要更大的 author room 时，再进入 Full Authority Page。")
        )},
      ],
      dh: [
        { label: choose("Admission rule", "准入规则"), body: makeBody(
          choose("Line-scope authority cards are built from the selected line payload plus the sample's work_mentions sidecar. Canto Map is built from the sample's authority_canto_index sidecar. Full Authority Page is built from the mounted authority layer and curated room anchors.", "Line 尺度的 authority cards 来自当前 line payload 加该 sample 的 work_mentions sidecar。Canto Map 来自该 sample 的 authority_canto_index sidecar。Full Authority Page 则来自 mounted authority layer 与 curated room anchors。"),
          choose("That separation matters: a line work chip, a canto heat row, and an author room are related surfaces, not interchangeable proof objects.", "这个分离很重要：line work chip、canto heat row 和 author room 是相关表面，但不是可以互换的证据对象。")
        )},
        { label: choose("What the route means", "这条 route 意味着什么"), body: makeBody(
          choose("A route means the commentary scene can be connected to a tracked author, work, figure, or source object at the displayed scope. It does not automatically mean Dante himself is citing that authority; often it means the commentary tradition is invoking it.", "一条 route 的意思是：当前 commentary scene 能在所显示的尺度上连接到某个 tracked author、work、figure 或 source object。它并不自动意味着 Dante 本人在引用这位 authority；很多时候，它只意味着 commentary tradition 在调用它。")
        )},
        { label: choose("Boundary", "边界"), body: makeBody(
          choose("Bare string hits can help with highlighting, but they are not enough to justify navigation. The boundary is strict on purpose, because authority claims are stronger than ordinary lexical matches.", "裸字符串命中可以帮助高亮，但不足以正当化导航。这个边界被刻意收紧，因为 authority claims 比普通 lexical matches 要强得多。")
        )},
      ],
    },
    "analysis-layer": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["analysis-layer"]?.lead,
        choose(
          "Philologically, the Analysis Layer is useful only if each condensed signal can still be walked back to dated witnesses, spans, and commentary wording touching the selected line.",
          "从 philological 角度，Analysis Layer 只有在每个压缩信号都还能一路走回触及当前行的 dated witnesses、spans 与 commentary wording 时才有意义。"
        ),
        choose(
          "Algorithmically, the Analysis Layer is not a fresh model verdict. It is a compression of the same line-bound record set into count, span, lexical contour, and date-range summaries.",
          "从算法上说，Analysis Layer 不是一轮新的模型判决，而是把同一批绑定当前行的 record set 压缩成 count、span、lexical contour 与 date-range summaries。"
        )
      ),
      philologist: [
        { label: choose("Textual basis", "原文与记录依据"), body: makeBody(
          choose("Every number on this snapshot is downstream of the same question: which preserved commentary records actually reach the selected line? Coverage, granularity, date span, and term contour are all secondary descriptions of that witness set.", "这张 snapshot 上的每个数字都下游于同一个问题：哪些保留下来的 commentary records 真实覆盖到当前行？coverage、granularity、date span 和 term contour 都只是这批 witness set 的次级描述。"),
          choose("Philologically, that matters because the panel does not invent a new object. It keeps the line and its attached witnesses as the primary evidence surface.", "这点在 philological 上很重要，因为这层并没有发明一个新的对象；它仍然让诗行与附着其上的 witnesses 保持为第一证据表面。")
        )},
        { label: choose("Filological meaning", "Filologico 意义"), body: makeBody(
          choose("A dense line can mark exegetical pressure, doctrinal difficulty, a canonical crux, or simply a point where many broader records pass through. A broad diachronic span can mean lasting interest, but not necessarily stable agreement.", "一条密集的行可能标记 exegetical pressure、doctrinal difficulty、canonical crux，也可能只是许多宽 span 记录都会经过的地方。一个很长的 diachronic span 可能意味着持续关注，但不等于稳定共识。"),
          choose("The panel is therefore a contour of reception history around one line, not a ranking of literary importance.", "因此这层提供的是围绕单行形成的 reception-history contour，而不是文学重要性的排序。")
        )},
        { label: choose("Interpretability", "可解释性"), body: makeBody(
          choose("The safe use is: read the contour, identify which branch matters, then return to cards and full wording. If a term, count, or century bar cannot be checked against visible witnesses, it should remain orientation rather than proof.", "稳妥用法是：先读 contour，判断哪一支值得追，再回到 cards 与完整措辞。只要某个 term、count 或 century bar 不能回到可见 witnesses 核查，它就应该停留在 orientation，而不是 proof。")
        )},
      ],
      dh: [
        { label: choose("Algorithmic reduction", "算法还原"), body: makeBody(
          choose("Coverage is a direct count of records whose stored line span includes the selected line. Granularity reuses that same set and splits it into line_span = 1 versus line_span > 1. Diachronic span takes the earliest and latest dated witnesses from that same set; century bars simply bin those dated witnesses by century.", "coverage 是一个直接计数：凡是存储 line span 包含当前行的 record 都算进去。granularity 不换数据源，只把同一批记录拆成 line_span = 1 与 line_span > 1。diachronic span 则从同一批记录里取最早与最晚的 dated witnesses；century bars 只是把这些 dated witnesses 按世纪分箱。"),
          choose("Commentary terms prefer the stored weighted contour. Only when that contour is unavailable does fallback rebuild a thinner local contour from summaries and previews with span-sensitive weighting.", "commentary terms 会优先读取已存储的 weighted contour。只有当这份 contour 不可用时，fallback 才会用 summaries 与 previews 结合 span-sensitive weighting 重建一份较薄的局部 contour。")
        )},
        { label: choose("What the algorithm supports", "算法支持什么判断"), body: makeBody(
          choose("Because every metric is tied back to the same line-bound witness set, the card supports one limited claim: this line sits under a particular pattern of reception pressure, span breadth, lexical concentration, and dated spread.", "因为所有指标都绑回同一批 line-bound witness set，所以这张卡只支持一个有限判断：这一行承受着某种特定的 reception pressure、span breadth、lexical concentration 与 dated spread。"),
          choose("It does not support a stronger claim about theme or poetic value until the reader returns to the underlying witnesses.", "在读者回到底层 witnesses 之前，它并不支持更强的主题判断或诗学价值判断。")
        )},
        { label: choose("Audit boundary", "可审计边界"), body: makeBody(
          choose("The panel is honest only because it keeps the reduction local: one line, one attached record set, multiple secondary summaries. If the card were allowed to drift away from that set, it would become an opaque model layer rather than an auditable synopsis.", "这层之所以还算诚实，是因为它把压缩保持在局部：一条行、一批附着其上的记录、几种次级摘要。只要它脱离这批记录，它就会从可审计 synopsis 变成不透明模型层。")
        )},
      ],
    },
    "commentary-terms": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["commentary-terms"]?.lead,
        choose(
          "Philologically, Commentary Terms are reception cues around a line, not a replacement for Dante's wording or for the commentary records.",
          "从 philological 角度，Commentary Terms 是围绕一行的 reception cues，不是 Dante 措辞或 commentary records 的替代品。"
        ),
        choose(
          "Algorithmically, Commentary Terms answer a narrow question: what words recur in the commentary language around this line strongly enough to survive weighting and noise filters?",
          "从算法上说，Commentary Terms 在回答一个很窄的问题：围绕这一行的 commentary language 里，哪些词反复出现得足够强，以至于能通过加权和噪音过滤？"
        )
      ),
      philologist: [
        { label: choose("Textual basis", "原文与记录依据"), body: makeBody(
          choose("These terms come from commentary language attached to the line, not from Dante's own verse. The relevant evidence is therefore not the token alone, but the records, spans, and preserved wording through which that token gathers around the line.", "这些 terms 来自附着在该行周围的 commentary language，而不是 Dante 自己的诗句。因此这里相关的证据不是 token 本身，而是那些让该 token 围绕此行聚起来的 records、spans 与保留下来的 wording。")
        )},
        { label: choose("Filological meaning", "Filologico 意义"), body: makeBody(
          choose("A surviving term says something about how the commentary tradition repeatedly names, frames, or explains this line. It does not automatically say that Dante's own lexical center is the same as the commentators' vocabulary.", "一个最终留下来的 term，说的是 commentary tradition 如何反复命名、框定或解释这一行；它并不自动意味着 Dante 自身的词汇中心就等于 commentators 的词汇。"),
          choose("This is why a term can be philologically useful as a reception cue while remaining unsafe as a summary of the verse itself.", "所以一个 term 可以作为 reception cue 在 philological 上有用，却仍然不适合作为诗句本身的总结。")
        )},
        { label: choose("Interpretability", "可解释性"), body: makeBody(
          choose("The correct use is to treat each term as a path back into cards. If you cannot answer who used it, in what wording, and across what span, the term should remain an orientation handle rather than a thesis label.", "正确用法是把每个 term 当作回到 cards 的路径。如果你答不出是谁用了它、用什么措辞、跨了怎样的 span，它就应当停留在 orientation handle，而不是 thesis label。")
        )},
      ],
      dh: [
        { label: choose("Algorithmic reduction", "算法还原"), body: makeBody(
          choose("The preferred path reads the line's stored lexical contour. If fallback is needed, the page tokenizes record_summary + record_text_preview for every record touching the line, counts token recurrence per record, and weights each record by 1 / line_span so narrow close readings contribute more than broad range notes.", "首选路径是读取该行已存储的 lexical contour。若需要 fallback，页面会对每条触及该行的 record 的 record_summary + record_text_preview 进行分词，在 record 内统计 token recurrence，并按 1 / line_span 给每条 record 加权，使窄而聚焦的 close reading 比宽而散的 range note 贡献更高。"),
          choose("The surviving terms then pass noise filters for stopwords, function residue, malformed fragments, and low-semantic commentary filler.", "随后留下来的 terms 还要通过 stopwords、function residue、坏碎片与低语义 commentary filler 的过滤。")
        )},
        { label: choose("What the algorithm supports", "算法支持什么判断"), body: makeBody(
          choose("The algorithm supports a narrow claim: certain commentary words are disproportionately concentrated around this line once span breadth and lexical noise are discounted.", "这个算法支持的是一个很窄的判断：在扣除了 span breadth 与 lexical noise 之后，某些 commentary words 在这条 line 周围呈现出不成比例的集中。"),
          choose("That is why the output is a reception contour rather than a doctrinal label or theme summary for Dante's verse.", "所以输出应被读成 reception contour，而不是给 Dante 诗句贴上的 doctrinal label 或主题摘要。")
        )},
        { label: choose("Audit boundary", "可审计边界"), body: makeBody(
          choose("The panel remains honest only because it never claims more than its inputs can bear: stored contour first, fallback contour second, records underneath. If a term cannot be walked back into those records, it should not be treated as evidence.", "这层之所以还能保持诚实，是因为它始终不比自己的输入说得更强：先是 stored contour，再是 fallback contour，底下始终是 records。只要某个 term 走不回这些 records，它就不该被当成 evidence。")
        )},
      ],
    },
    "semantic-fields": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["semantic-fields"]?.lead,
        choose(
          `Philologically, Interpretive Fields are local commentary clusters around ${currentLineLabel}; they are not theme labels for Dante's verse.`,
          `从 philological 角度，Interpretive Fields 是围绕 ${Number.isFinite(stats.selectedLine) ? `第 ${stats.selectedLine} 行` : "当前行"} 的局部 commentary clusters，不是 Dante 诗句的主题标签。`
        ),
        choose(
          `Algorithmically, Semantic Fields should be read as local commentary clusters around ${currentLineLabel}, not as Dante's own themes.`,
          `从算法上说，Semantic Fields 应该被读成围绕 ${Number.isFinite(stats.selectedLine) ? `第 ${stats.selectedLine} 行` : "当前行"} 的局部 commentary clusters，而不是 Dante 自己的主题。`
        )
      ),
      philologist: [
        { label: choose("Textual basis", "原文与记录依据"), body: makeBody(
          choose("A field only matters insofar as it remains grounded in the commentary records touching the line. The evidence is not the label by itself, but the clustered records, their wording, and the local terms through which the cluster becomes legible.", "一个 field 只有在仍然扎根于触及当前行的 commentary records 时才有意义。这里的证据不是 label 本身，而是那批被聚在一起的 records、它们的措辞，以及让这一团变得可读的局部 terms。")
        )},
        { label: choose("Filological meaning", "Filologico 意义"), body: makeBody(
          choose("What the field can honestly say is not 'Dante is about X here,' but 'the commentary tradition around this line repeatedly organizes itself through a cluster of related explanatory vocabulary.'", "这个 field 能诚实表达的，不是“Dante 在这里谈 X”，而是“围绕此行的 commentary tradition 会反复通过一簇相关 explanatory vocabulary 来组织自己”。"),
          choose("That is useful for reception history, but it is a weaker and more mediated claim than a statement about the poem's own semantic center.", "这对 reception history 有用，但它比关于诗本身语义中心的判断更弱，也更经过中介。")
        )},
        { label: choose("Interpretability", "可解释性"), body: makeBody(
          choose("The safe path is field label, representative terms, supporting cards, then full wording. If you cannot identify which records are carrying the field, the field should remain a navigation aid rather than a thesis.", "稳妥路径是：field label、representative terms、supporting cards、最后回到完整措辞。只要你不能说出是哪批 records 在支撑这个 field，它就该停留在导航辅助，而不是 thesis。")
        )},
      ],
      dh: [
        { label: choose("Algorithmic reduction", "算法还原"), body: makeBody(
          choose("The page is not clustering the corpus live. It reads stored canto-local field assignments already produced upstream, then admits only those fields that survive local confidence rules: provisional residue drops out, weak labels drop out, and line_semantic / figure_anchor assignments are preferred before broader commentarial_discourse fallbacks.", "页面并没有在前端现场重新聚类全库；它读取的是上游已经产出的 canto-local field assignments，然后只准入那些通过本地置信规则的 fields：provisional residue 会被丢掉，弱标签会被丢掉，而且会优先选 line_semantic / figure_anchor assignments，只有不足时才退到更宽的 commentarial_discourse fallback。"),
          choose("So the line inherits a stored local cluster from its witness set; it is not being assigned an arbitrary topic label on the fly.", "因此这条 line 继承的是其 witness set 已有的局部 cluster，而不是现场被随手贴上一个主题标签。")
        )},
        { label: choose("What the algorithm supports", "算法支持什么判断"), body: makeBody(
          choose("The claim is intentionally weak: among the commentary witnesses touching this line, there exists a recurring lexical-explanatory cluster that can be named, followed, and checked. It is not a claim about Dante's own timeless theme taxonomy.", "这里的判断被刻意收窄：在触及此行的 commentary witnesses 中，存在一团可以被命名、追踪和核查的 recurring lexical-explanatory cluster；它并不是 Dante 自身永恒主题分类的声明。")
        )},
        { label: choose("Audit boundary", "可审计边界"), body: makeBody(
          choose("The field remains usable only because the claim stays local: one canto-local clustering regime, one line's witness set, a visible subset of inherited labels. Once the field is detached from those records, it loses interpretability fast.", "这个 field 之所以还能用，是因为判断始终被限制在局部：单一 canto-local clustering regime、单行的 witness set、以及一组可见的继承 labels。只要它脱离这些 records，可解释性就会迅速塌掉。")
        )},
      ],
    },
    "dante-word-locus": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["dante-word-locus"]?.lead,
        choose(
          "Philologically, the Dante Word Locus Layer begins from a visible word in the verse and keeps normalized routing subordinate to the written form.",
          "从 philological 角度，Dante Word Locus Layer 从诗句里可见的词开始，并让 normalized routing 从属于实际写出的 surface form。"
        ),
        choose(
          "Algorithmically, the Dante Word Locus layer begins only when the selected token is strong enough to count as a reusable locus rather than a one-off surface accident.",
          "从算法上说，Dante Word Locus 这一层只有在被选 token 足够强、足以算作可重复使用的 locus，而不是一次性的 surface accident 时才会开始。"
        )
      ),
      philologist: [
        { label: choose("Textual basis", "原文依据"), body: makeBody(
          choose("The clicked word remains the first evidence object. Normalization and family routing are secondary operations that help the page connect repeated forms, but they do not replace the visible surface form in Dante's verse.", "被点击的词仍然是第一证据对象。normalization 与 family routing 只是帮助页面连接重复形式的次级操作，不能替代 Dante 诗句里可见的 surface form。"),
          choose("A thin locus profile is still information, because it records that this word currently has little stable recurrence or commentary uptake in the mounted corpus.", "一个很薄的 locus profile 仍然是信息，因为它说明这个词在当前挂载语料中尚未形成稳定的 recurrence 或 commentary uptake。")
        )},
        { label: choose("Filological meaning", "Filologico 意义"), body: makeBody(
          choose("What this layer can support is a textual recurrence claim: the same form, or an explicitly sanctioned family form, recurs elsewhere in the poem strongly enough to justify renewed reading. It is not automatically a claim about symbol, allegory, or theme.", "这一层能够支撑的，是一个 textual recurrence claim：同一形式，或被明确允许的 family form，会在诗中别处再次出现得足够稳，从而值得重新阅读。它并不会自动升级成象征、寓意或主题判断。")
        )},
        { label: choose("Interpretability", "可解释性"), body: makeBody(
          choose("Use each branch as a route back to evidence: occurrence lines for recurrence, context windows for neighborhood, commentary cards for uptake. If the route can no longer be checked against visible lines and preserved wording, the locus has become too abstract.", "把每个分支都当成回证据的路径：occurrence lines 看 recurrence，context windows 看邻域，commentary cards 看 uptake。只要这条路径已经无法回到可见诗行和保留下来的 wording，这个 locus 就已经变得过于抽象。")
        )},
      ],
      dh: [
        { label: choose("Algorithmic reduction", "算法还原"), body: makeBody(
          choose("A token is selectable only if it can be normalized into a stable locus with mounted profile support. In practice that means recurrence evidence, family support, or indexed locus metadata already exist strongly enough for the page to route through them.", "一个 token 之所以可选，前提是它能被 normalize 成稳定的 locus，并且有挂载好的 profile 支撑。换句话说，只有当 recurrence evidence、family support 或 indexed locus metadata 已经足够强时，页面才会继续沿这条 route 走下去。")
        )},
        { label: choose("What the algorithm supports", "算法支持什么判断"), body: makeBody(
          choose("The supported claim is narrow and textual: this normalized word-form is stable enough to be tracked across occurrences, local contexts, and commentary uptake. It is not a guarantee that every recurrence is interpretively meaningful.", "这里支持的是一个狭义、文本性的判断：这个 normalized word-form 足够稳定，因而可以跨 occurrences、局部 contexts 与 commentary uptake 被追踪。它并不保证每一次 recurrence 都有解释意义。")
        )},
        { label: choose("Audit boundary", "可审计边界"), body: makeBody(
          choose("Missing profile or empty branches are coverage facts, not inference failures. The layer stays honest by showing absence rather than fabricating live lexical relations it did not inherit from the mounted data.", "缺 profile 或 branch 为空，都是 coverage facts，不是推理失败。这层之所以还算诚实，是因为它宁可展示缺席，也不愿捏造那些并未从挂载数据中继承来的 live lexical relation。")
        )},
      ],
    },
    "occurrence-explorer": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["occurrence-explorer"]?.lead,
        choose(
          "Philologically, Occurrence Explorer asks the most factual word-level question first: where else does this written or supported family form occur?",
          "从 philological 角度，Occurrence Explorer 先问最事实的词位问题：这个 written form 或受支持的 family form 还在哪里出现？"
        ),
        choose(
          "Algorithmically, Occurrence Explorer asks the simplest possible recurrence question first: where else does this selectable form recur, before any broader semantic claim is made?",
          "从算法上说，Occurrence Explorer 先问一个最简单的 recurrence 问题：在任何更宽的语义主张之前，这个 selectable form 还在哪里回返？"
        )
      ),
      philologist: [
        { label: choose("Exact before family", "exact 先于 family"), body: makeBody(
          choose("Exact recurrence is the safest evidence because it stays closest to what Dante wrote. Family-level recurrence is a secondary widening and should be cited as such.", "exact recurrence 是最稳的证据，因为它最贴近 Dante 写出的形式。family-level recurrence 是次级放宽，引用时也应该这样说明。")
        )},
        { label: choose("Evidence discipline", "证据纪律"), body: makeBody(
          choose("A hit is only a location. It becomes evidence after you open the returned line and read whether its local wording can bear comparison with the source line.", "命中只是位置。只有打开返回行、读它的局部措辞是否能和 source line 承担并读之后，它才变成证据。")
        )},
      ],
      dh: [
        { label: choose("Recurrence rule", "回返规则"), body: makeBody(
          choose("An occurrence appears because it belongs to the selected form's stored occurrence list in the word profile. The current locus is removed from the comparison rows but still counted in the total, because the algorithm is measuring recurrence class size rather than visible card count.", "一个 occurrence 会出现，是因为它属于当前选中 form 在词语 profile 里的存储 occurrence list。当前 locus 会从比较 rows 里移除，但仍保留在总数里，因为算法衡量的是 recurrence class 的大小，而不是可见 card 数。")
        )},
        { label: choose("Why poem order wins", "为什么按诗序"), body: makeBody(
          choose("Rows are ordered by Commedia location, not by relevance score, because this layer is claiming factual return, not semantic closeness. Poem order is therefore more honest than an opaque ranking.", "rows 按 Commedia location 排序，而不是按 relevance score，因为这层主张的是事实性的 return，而不是语义上的 closeness。因此诗序比一个不透明 ranking 更诚实。")
        )},
        { label: choose("Family gate", "family 门槛"), body: makeBody(
          choose("Family widening appears only when the selected form belongs to a stored family config. That gate matters because the page should not invent a morphological relation it did not explicitly inherit.", "只有 selected form 属于一套已存储的 family config 时，family widening 才会出现。这个 gate 很重要，因为页面不应该发明一条自己并未显式继承的 morphological relation。")
        )},
      ],
    },
    "micro-context-concurrence": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["micro-context-concurrence"]?.lead,
        choose(
          "Philologically, Micro-Context Concurrence is a cautious neighborhood signal around the selected word, not a theme statement about the canto.",
          "从 philological 角度，Micro-Context Concurrence 是围绕被选词的谨慎邻域信号，不是关于整个 canto 的主题判断。"
        ),
        choose(
          "Algorithmically, Micro-Context Concurrence is trying to preserve repeated local neighborhood pressure around the selected word, not to propose a global theme.",
          "从算法上说，Micro-Context Concurrence 想保留的是围绕被选词反复出现的局部邻域压力，而不是提出一个全局主题。"
        )
      ),
      philologist: [
        { label: choose("Local weather", "局部 verbal weather"), body: makeBody(
          choose("Use this as a small window into the word's local verbal weather. It is not evidence until the displayed window remains recognizable as poetic context.", "把它当成被选词周围局部 verbal weather 的小窗口。只有展示窗口仍能被认作诗句语境时，它才可能成为证据。")
        )},
        { label: choose("Window check", "窗口核查"), body: makeBody(
          choose("Do not cite a co-occurrence term alone. Open or read the retained sample window and verify that the focus word and concurrence term are actually meaningful together.", "不要单独引用 co-occurrence term。要打开或阅读保留下来的 sample window，确认 focus word 和 concurrence term 真的在一起产生意义。")
        )},
      ],
      dh: [
        { label: choose("Score algorithm", "分数算法"), body: makeBody(
          choose("A concurrence term survives because it carries repeated weighted co-presence around the selected word across local windows. Low-score and low-information terms drop out because one accidental adjacency should not count as a pattern.", "一个 concurrence term 能留下来，是因为它在多个局部窗口里围绕被选词表现出重复的 weighted co-presence。低分或低信息 terms 会掉出去，因为一次偶然挨近不该算模式。")
        )},
        { label: choose("Window gate", "窗口门槛"), body: makeBody(
          choose("A sample window is shown only if the focus term is still visibly present inside it. That gate protects interpretability: a co-occurrence claim without the visible focus word would be hard to audit philologically.", "一个 sample window 只有在 focus term 仍然可见地留在里面时才会显示。这个 gate 是为了保护 interpretability：如果看不见 focus word，本来就很难做 philological audit。")
        )},
        { label: choose("Conclusion boundary", "结论边界"), body: makeBody(
          choose("The algorithm supports only a narrow conclusion: these words repeatedly occur in inspectable micro-contexts around the locus. It does not say they are synonyms, themes, or concepts of the canto.", "这个算法只支持一个很窄的结论：这些词会在可检查的 locus 微语境附近反复出现。它并不声称它们是同义词、主题，或整支 canto 的概念。")
        )},
      ],
    },
    "phrase-expansions": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["phrase-expansions"]?.lead,
        choose(
          "Philologically, Phrase Expansions matter because repeated local wording can be firmer than a single token while still staying close to Dante's text.",
          "从 philological 角度，Phrase Expansions 重要，是因为重复的局部措辞往往比单个 token 更稳，同时仍然贴着 Dante 文本。"
        ),
        choose(
          "Algorithmically, Phrase Expansions are allowed onto the page only when recurrence survives at the level of short wording, not just isolated token overlap.",
          "从算法上说，Phrase Expansions 只有在回返上升到短语措辞层面、而不只是孤立 token overlap 时，才会被允许进入页面。"
        )
      ),
      philologist: [
        { label: choose("Exact wording", "exact wording"), body: makeBody(
          choose("Read phrase expansion as exact local wording first. Its value comes from preserving a repeatable verbal shape, not from paraphrase similarity.", "phrase expansion 首先应读作 exact local wording。它的价值来自保留可重复的 verbal shape，而不是 paraphrase similarity。")
        )},
        { label: choose("Context check", "语境核查"), body: makeBody(
          choose("A repeated phrase is only useful after you read its occurrence lines. The same verbal shape can carry different force in different local contexts.", "重复短语只有在读过它出现的诗行之后才有用。同一个 verbal shape 在不同局部语境里可能力量不同。")
        )},
      ],
      dh: [
        { label: choose("Phrase algorithm", "短语算法"), body: makeBody(
          choose("A phrase appears because it survives upstream as a retained exact local phrase around the selected word. That means this layer is making an exact-wording claim, not a paraphrase claim.", "一个 phrase 会出现，是因为它在上游以围绕 selected word 的 retained exact local phrase 形式存活下来。这意味着这层做的是 exact-wording claim，而不是 paraphrase claim。")
        )},
        { label: choose("Ordering formula", "排序公式"), body: makeBody(
          choose("Ordering prefers broader exact recurrence first, then phrases already present in the active sample/line. The rationale is simple: repeated wording that is both recurrent and locally active deserves to be seen before equally real but more distant wording.", "排序会先偏向更广泛的 exact recurrence，再偏向已经在 active sample/line 里活跃的短语。理由很简单：既反复出现、又在本地活跃的重复措辞，应该比同样真实但更远的措辞先被看见。")
        )},
        { label: choose("Output boundary", "输出边界"), body: makeBody(
          choose("An empty branch means the system has no retained exact phrase evidence for this locus. It does not prove there is no looser semantic resemblance elsewhere.", "branch 为空，只表示系统手里没有这个 locus 的 retained exact phrase evidence；它不等于别处不存在更松的语义相似。")
        )},
      ],
    },
    "contrastive-vocabulary": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["contrastive-vocabulary"]?.lead,
        choose(
          "Philologically, Contrastive Vocabulary is about commentary uptake around the selected word-locus, not about Dante's own semantics by itself.",
          "从 philological 角度，Contrastive Vocabulary 关注被选 word-locus 周围的 commentary uptake，而不是 Dante 自身语义。"
        ),
        choose(
          "Algorithmically, Contrastive Vocabulary is asking why certain commentary words deserve to stand out around this locus instead of dissolving into ordinary corpus background noise.",
          "从算法上说，Contrastive Vocabulary 在追问：为什么有些 commentary words 在这个 locus 周围值得凸显，而不是溶进普通的全库背景噪音里。"
        )
      ),
      philologist: [
        { label: choose("Commentary uptake", "commentary uptake"), body: makeBody(
          choose("The question is not simply which words are frequent. It is which commentary terms cluster around this locus with enough local force to guide card reading.", "问题不只是哪些词频高，而是哪类 commentary terms 围绕这个 locus 聚得足够强，足以引导 card reading。")
        )},
        { label: choose("Verification path", "核查路径"), body: makeBody(
          choose("Filtering by a term should lead back to records that actually use related vocabulary. If it cannot be checked in card wording, keep it as a weak hint.", "按 term 过滤应该能带你回到真正使用相关词汇的 records。如果它不能在 card wording 里核查，就只把它当成弱提示。")
        )},
      ],
      dh: [
        { label: choose("Score formula", "分数公式"), body: makeBody(
          choose("Each candidate term starts with its local profile score. The code multiplies that by 1 + log((total corpus lines + 1) / (term corpus-line count + 1)), then adds capped boosts for local record count and selected-word occurrence spread.", "每个 candidate term 先取 local profile score。代码会把它乘以 1 + log((全库总行数 + 1) / (该 term 的 corpus-line count + 1))，再给 local record count 和 selected-word occurrence spread 加上有上限的 boosts。"),
          choose("This is why a rare but locally supported term can outrank a common word: the algorithm is measuring contrastive explanatory pressure, not raw frequency.", "所以一个稀有但本地支持强的 term 可以排在常见词前面：算法衡量的是 contrastive explanatory pressure，不是原始词频。")
        )},
        { label: choose("Filters and order", "过滤与排序"), body: makeBody(
          choose("Terms matching the selected locus itself, malformed terms, and low-information terms are removed. The remaining list sorts by contrastive score, then lower corpus frequency, then higher local record count, then alphabetically.", "与 selected locus 本身相同的 terms、坏 terms 和低信息 terms 会被移除。剩余列表按 contrastive score 排序，再按更低 corpus frequency、更高 local record count、字母序排序。")
        )},
        { label: choose("Why this supports the panel", "为什么能支持 panel"), body: makeBody(
          choose("The conclusion is limited but useful: these are commentary terms unusually concentrated around this locus compared with their corpus spread. That is why they are valid handles for filtering local witnesses, but not free-standing interpretations of Dante's line.", "这个结论有限但有用：这些 commentary terms 相对于全库分布，异常集中在当前 locus 周围。这也就是为什么它们适合作为过滤局部 witnesses 的把手，却不足以单独解释 Dante 的诗行。")
        )},
      ],
    },
    "recurrence-candidates": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["recurrence-candidates"]?.lead,
        choose(
          "Philologically, this layer now needs to be read as a text-first line-comparison surface: the current line stands first, and the echoed line must earn its place beside it.",
          "从 philological 角度，这层现在应被读成一个 text-first 的 line-comparison 表面：当前行先站住，echoed line 必须自己赢得并排的位置。"
        ),
        choose(
          "Algorithmically, Cross-Canto Echoes is trying to answer one question only: which other lines survive a text-first echo test strongly enough to deserve parallel reading beside this line?",
          "从算法上说，Cross-Canto Echoes 只想回答一个问题：哪些别的诗行足够强地通过了 text-first echo test，因此值得并排放到这条 line 旁边？"
        )
      ),
      philologist: [
        { label: choose("Philological use", "Philological 用法"), body: makeBody(
          choose("A candidate line should be read as a prompt for controlled parallel reading, not as a verdict that the poem itself has declared a formal intertext. The line earns visibility when shared wording, local poetic context, and reviewer discipline keep the relation readable.", "候选行应该被读成一种受控制的并读提示，而不是诗本身已经宣布的 formal intertext verdict。只有当 shared wording、局部诗歌上下文和 reviewer discipline 一起把关系维持在可读范围内，这行才配获得可见度。")
        )},
        { label: choose("Why the filter stays strict", "为什么过滤要保持严格"), body: makeBody(
          choose("The code explicitly distrusts broad recurrence terms, meta-discourse fillers, and weak overlap. That strictness matters philologically because a line should not become an echo just because it shares vague religious, rhetorical, or grammatical vocabulary with half the poem.", "代码会明确不信任 broad recurrence terms、meta-discourse filler 和很弱的 overlap。这个严格度对 philological 读法很重要，因为一条线不能只因为和半部诗共享一些泛泛的宗教词、修辞词或语法词，就被轻率地叫成 echo。")
        )},
        { label: choose("Line-to-line verification", "逐行核查"), body: makeBody(
          choose("The source line and candidate line must both remain readable as lines of Dante. A strong filological use compares their actual wording, local poetic context, and visible overlap before asking whether commentary support strengthens the relation.", "source line 和 candidate line 都必须仍然作为 Dante 的诗行可读。强的 filologico 用法，会先比较两者的实际措辞、局部诗歌语境和可见 overlap，再去问 commentary support 是否能加强这层关系。"),
          choose("If the shared cue is not visible in the verse, or if it survives only as a broad abstraction, the candidate should stay a prompt rather than hard evidence.", "如果 shared cue 不能在诗行里看见，或者只剩下一层很宽泛的抽象关系，这个 candidate 就应该停留在 prompt，而不是升级成硬证据。")
        )},
      ],
      dh: [
        { label: choose("Algorithmic reduction", "算法还原"), body: makeBody(
          choose("The preferred path reads the selected line's stored line_echo_profile. Candidate lines are inherited from top_echoes, then filtered again so a surviving card must still expose shared_terms, shared_fields, or another visible overlap cue. In thinner cases, fallback rebuilds source cues from the current line, rarity-weights them against corpus spread, and scores candidates by shared cue strength, shared field strength, mixed-evidence bonuses, and overlap breadth.", "首选路径是读取 selected line 已存储的 line_echo_profile。candidate lines 先继承自 top_echoes，再被重新过滤，要求存活下来的卡片仍然能展示 shared_terms、shared_fields 或其他可见的 overlap cue。若数据较薄，fallback 会从当前行重建 source cues，并按全库分布做 rarity weighting，再用 shared cue strength、shared field strength、mixed-evidence bonuses 与 overlap breadth 给候选计分。"),
          choose("So eligibility means more than generic similarity: the card must still be able to show why the line got in.", "因此准入并不等于泛泛相似；卡片必须仍然能展示自己为什么能进来。")
        )},
        { label: choose("What the algorithm supports", "算法支持什么判断"), body: makeBody(
          choose("The page supports a deliberately conservative claim: these lines deserve controlled parallel reading because they survive an inspectable evidence test strongly enough to remain readable. It does not claim intentional allusion, identity of meaning, or thematic equivalence.", "页面支持的是一个刻意保守的判断：这些诗行值得被放进受控并读，因为它们足够强地通过了可审查证据测试，并且仍保持可读。它并不主张 intentional allusion、意义同一，或主题等值。"),
          choose("Ranking stays explicit: score first, overlap_count second, then poem order. That choice prefers stronger evidence but refuses noisy pseudo-precision when candidates are close.", "排序规则保持显式：先 score，再 overlap_count，最后回到诗序。这个选择既偏向更强证据，也拒绝在候选很接近时假装自己拥有不可靠的细密精度。")
        )},
        { label: choose("Audit boundary", "可审计边界"), body: makeBody(
          choose("The panel stays interpretable only because the card retains a short audit trail: target line, score tier, overlap pills, direction, and lane. Direction is positional metadata, not proof; lane placement is evidence strength management, not literary judgment.", "这层之所以还能保持可解释，是因为卡片保留了简短的审计线索：target line、score tier、overlap pills、direction 与 lane。direction 是位置 metadata，不是证明；lane placement 管理的是证据强弱，不是文学判断。"),
          choose("Where a candidate survives only through broad cues or weak overlap, the algorithm deliberately pushes it outward rather than letting it pose as the main line of proof.", "只要某个 candidate 主要靠宽泛 cues 或弱 overlap 才活下来，算法就会刻意把它往外推，而不是让它冒充主证据线。")
        )},
      ],
    },
    "figure-navigation": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["figure-navigation"]?.lead,
        choose(
          "Philologically, Figure Navigation should stay accountable to the poem scene in which a figure appears, then to the commentary wording that gathers around that figure.",
          "从 philological 角度，Figure Navigation 应该先对人物出现的诗歌现场负责，再对围绕这个人物聚起来的 commentary wording 负责。"
        ),
        choose(
          "Algorithmically, Figure Navigation admits a figure only when poem-side or commentary-side evidence can resolve it as a real tracked figure rather than a loose name mention.",
          "从算法上说，Figure Navigation 只有在 poem-side 或 commentary-side 的证据能够把它解析成一个真实被追踪的 figure，而不是松散名字提及时，才会准入。"
        )
      ),
      philologist: [
        { label: choose("Figure as textual role", "figure 作为文本角色"), body: makeBody(
          choose("A figure route should stay accountable to the poem scene in which the figure appears. Personaggio reading asks how a named figure functions inside Dante's dramatic and interpretive situation.", "figure route 应该对人物出现的诗歌现场负责。personaggio reading 问的是这个被命名的人物怎样在 Dante 的戏剧与解释场景中发生作用。"),
          choose("This is not only authority lookup. A figure may be a character in the poem, a cited authority in commentary, or both; those roles should stay distinguishable.", "这不只是 authority lookup。一个 figure 可能是诗中的人物、commentary 里的被引 authority，或两者兼具；这些角色应该保持可区分。")
        )},
        { label: choose("Check the evidence surface", "核查证据表面"), body: makeBody(
          choose("Poem hits, aliases, and commentary mentions are useful only when they can be checked against a visible line or concrete commentary wording.", "poem hits、aliases 和 commentary mentions 只有在能回到可见诗行或具体 commentary wording 核查时才真正有用。")
        )},
      ],
      dh: [
        { label: choose("Signal algorithm", "信号算法"), body: makeBody(
          choose("A figure item survives because poem hits, aliases, or linked authority evidence can resolve it to a known figure id. This matters because the conclusion is not 'a name appears,' but 'a tracked figure relation can be audited here.'", "一个 figure item 能留下来，是因为 poem hits、aliases 或 linked authority evidence 能把它解析成已知 figure id。这个差别很重要，因为页面在说的不是“这里有个名字出现”，而是“这里有一条可审计的 tracked figure relation”。")
        )},
        { label: choose("Why surfaces stay separate", "为什么分开显示"), body: makeBody(
          choose("Poem hits, commentary aliases, and figure paths stay separate because they support different claims: textual presence, reception naming, and navigable identity. Keeping them distinct is part of the algorithmic honesty of the layer.", "poem hits、commentary aliases 和 figure paths 会分开，因为它们支持的是不同判断：文本在场、接受史命名与可导航身份。把它们区分开，本身就是这层的算法诚实。")
        )},
        { label: choose("Boundary", "边界"), body: makeBody(
          choose("The boundary is intentionally strict: a figure appears because the current scene can route to it, not just because the corpus contains a similar name somewhere.", "这里的边界是故意收紧的：figure 会出现，是因为当前 scene 可以路由到它，而不只是因为全库某处有个相似名字。")
        )},
      ],
    },
    "authority-lens": {
      dhReplacesShared: true,
      lead: pickAudienceLead(
        helpMap["authority-lens"]?.lead,
        choose(
          "Philologically, Full Authority Page is useful when it keeps the author room tied to text hits, commentary witnesses, and work-layer contracts rather than turning into an encyclopedia page.",
          "从 philological 角度，Full Authority Page 只有在 author room 仍然绑着 text hits、commentary witnesses 与 work-layer contracts 时才有用，而不是变成百科页面。"
        ),
        choose(
          "Algorithmically, Full Authority Page exposes the staged contract for each author: text layer, commentary layer, works tree or flat overview, and any special-case or commentary-sensitive entry mode.",
          "从算法上说，Full Authority Page 会暴露每位作者的分层契约：text layer、commentary layer、works tree 或 flat overview，以及任何 special-case / commentary-sensitive 的入口模式。"
        )
      ),
      philologist: [
        { label: choose("Textual basis", "原文与记录依据"), body: makeBody(
          choose("Read the room from its contract pill outward. Text Layer records poem-side hits; Commentary Layer gathers witness-side invocations; Work Layer appears only as far as the mounted works data allows.", "先从房间里的 contract pill 往外读。Text Layer 记录 poem-side hits；Commentary Layer 聚合 witness-side invocations；Work Layer 只在已挂载作品数据允许的范围内出现。"),
          choose("The relevant evidence is therefore staged: author identity first, visible text or witness evidence second, work branch third.", "因此这里的证据是分层的：先确认 author identity，再看可见 text / witness evidence，最后才进入 work branch。")
        )},
        { label: choose("Filological meaning", "Filologico 意义"), body: makeBody(
          choose("The room's honest scope is reception and staged evidence, not direct fontes proof. A work branch can show how the commentary tradition organizes an author, but it still needs the witness wording beneath it.", "这个房间诚实的 scope 是 reception 与分层证据，不是直接 fontes proof。一个 work branch 可以显示 commentary tradition 怎样组织某位作者，但它仍然需要下方 witness wording 支撑。"),
          choose("Where the bridge is indirect, special-case, or commentary-sensitive, that mediation should remain visible rather than being flattened into a neat citation chain.", "只要 bridge 是间接的、special-case 的、或依赖 commentary 语境，这种中介性就应该保留可见，而不该被抹平成漂亮却虚假的 citation chain。")
        )},
        { label: choose("Interpretability", "可解释性"), body: makeBody(
          choose("The strongest use is staged: author room, tab-specific evidence, invoked object, then back to the sentence or line that made the route visible. If that path cannot be retraced, the authority claim has become too strong for the evidence.", "最强用法必须分层回走：author room、对应 tab 的证据、被调用对象，然后回到让这条 route 显形的句子或诗行。只要这条路径已经无法回走，authority claim 就已经比证据更强了。")
        )},
      ],
      dh: [
        { label: choose("Algorithmic reduction", "算法还原"), body: makeBody(
          choose("An author room survives only when it is admitted into the mounted authority layer. Its displayed mode then depends on stored fields such as works_layer_mode, entry_mode, curated anchors, and available works-tree or flat-object payloads.", "一个 author room 只有在进入 mounted authority layer 后才会出现。它的展示模式随后取决于已存字段，例如 works_layer_mode、entry_mode、curated anchors，以及可用的 works-tree / flat-object payloads。")
        )},
        { label: choose("What the algorithm supports", "算法支持什么判断"), body: makeBody(
          choose("Because different author rooms expose different contracts, the layer supports a graded claim rather than a binary one. A works-tree route means the relation is stable enough to travel through mounted branches; a commentary-sensitive route means the relation still depends on particular witnesses and their wording.", "因为不同 author rooms 暴露的是不同契约，所以这层支持的是分级判断，而不是二元判断。works-tree route 表示关系已经稳定到可以穿过已挂载分支；commentary-sensitive route 则表示这条关系仍依赖特定 witnesses 及其措辞。")
        )},
        { label: choose("Audit boundary", "可审计边界"), body: makeBody(
          choose("The design is staged because authority claims are not equally strong. By preserving contract labels, tab boundaries, and links back to witness evidence, the room explains not only what authority is here, but what level of claim the current data can honestly support.", "之所以要分层，是因为 authority claims 的强度并不相等。通过保留 contract labels、tab boundaries 和回到 witness evidence 的路径，这个房间解释的不只是“什么 authority 在这里”，而是当前数据诚实地支持到哪一层判断。")
        )},
      ],
    },
  };

  const audienceEntry = audienceAdditions[key];
  if (audienceEntry) {
    return {
      ...helpMap[key],
      lead: audienceEntry.lead,
      sections: composeAudienceSections(
        helpMap[key].sections || [],
        audienceEntry.philologist || [],
        audienceEntry.dh || [],
        {
          dhReplacesShared: Boolean(audienceEntry.dhReplacesShared),
          philologistReplacesShared: audienceEntry.philologistReplacesShared !== false,
        }
      ),
    };
  }

  return helpMap[key] || {
    title: choose("Guide", "功能说明"),
    lead: choose(
      "This note has not been expanded yet, but it still follows the current local data rather than an old project memory.",
      "这条说明暂时还没有单独展开，但它仍然会尽量跟着当前本地数据走，而不是照着旧记忆说话。"
    ),
    sections: [],
  };
}

function renderHelpModalBody(sections = []) {
  return sections.map((section) => `
    <section class="help-section">
      ${section.label ? `<h3>${escapeHtml(section.label)}</h3>` : ""}
      ${section.body}
    </section>
  `).join("");
}

async function openHelpModal(key) {
  if (!key) {
    return;
  }
  if (!elements.helpOverlay || !elements.helpOverlayTitle || !elements.helpOverlayLead || !elements.helpOverlayBody) {
    return;
  }
  state.activeHelpKey = key;
  const loadingMarkup = renderHelpModalMarkup(
    state.uiLanguage === "en" ? "Guide" : "功能说明",
    state.uiLanguage === "en"
      ? "Loading this note from the current local build. Please give it a moment."
      : "正在根据当前本地版本整理这一块的说明，请稍等一下。",
    []
  );
  elements.helpOverlayTitle.textContent = loadingMarkup.title;
  if (elements.helpOverlayClose) {
    elements.helpOverlayClose.textContent = state.uiLanguage === "en" ? "Close" : "关闭";
  }
  elements.helpOverlayLead.textContent = loadingMarkup.lead;
  elements.helpOverlayBody.innerHTML = loadingMarkup.body;
  elements.helpOverlay.classList.remove("is-hidden");
  elements.helpOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("help-overlay-open");
  syncHelpAudienceToggle(key);

  try {
    await ensureHelpDataForKey(key);
    renderCurrentHelpContent();
  } catch (error) {
    const fallback = renderHelpModalMarkup(
      state.uiLanguage === "en" ? "Guide" : "功能说明",
      state.uiLanguage === "en"
        ? "This note did not finish opening, but the panel itself may still be usable. You can close this note and try once more."
        : "这块说明刚才没有顺利打开，但功能本身不一定因此失效。你可以关掉这层说明，再点一次试试看。",
      []
    );
    elements.helpOverlayTitle.textContent = fallback.title;
    elements.helpOverlayLead.textContent = fallback.lead;
    elements.helpOverlayBody.innerHTML = fallback.body;
    syncHelpAudienceToggle(key);
  }
}

function closeHelpModal() {
  if (!elements.helpOverlay) {
    return;
  }
  elements.helpOverlay.classList.add("is-hidden");
  elements.helpOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("help-overlay-open");
  state.activeHelpKey = null;
  syncHelpAudienceToggle(null);
}

function buildCorpusInterpretiveStats(lineProfiles = []) {
  const termDocFreq = new Map();
  const fieldDocFreq = new Map();

  for (const line of lineProfiles) {
    const termSet = new Set(
      (line.semantic_terms || [])
        .map((term) => normalizeLocusForm(term))
        .filter((term) => term && !looksLikeBadWordProfileTerm(term))
    );
    const fieldSet = new Set(
      (line.field_labels || [])
        .map((label) => normalizeLocusForm(label))
        .filter((label) => label && !looksLikeBadWordProfileTerm(label))
    );

    for (const term of termSet) {
      termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
    }
    for (const label of fieldSet) {
      fieldDocFreq.set(label, (fieldDocFreq.get(label) || 0) + 1);
    }
  }

  return {
    totalLines: lineProfiles.length,
    termDocFreq,
    fieldDocFreq,
  };
}

function getWordFamilyConfig(normalizedForm) {
  return WORD_FAMILY_LOOKUP.get(String(normalizedForm || "").trim()) || null;
}

function getWordFamilyMembersInIndex(family) {
  if (!family) {
    return [];
  }
  return family.members.filter((member) => Boolean(state.danteWordLociIndex?.profiles?.[member]));
}

function getWordFamilyIndexedOccurrenceCount(family) {
  return getWordFamilyMembersInIndex(family)
    .reduce((sum, member) => sum + Number(state.danteWordLociIndex?.profiles?.[member]?.occurrence_count || 0), 0);
}

function getCachedDanteWordProfile(normalizedForm) {
  const key = String(normalizedForm || "").trim();
  if (!key) {
    return null;
  }
  return state.danteWordProfileCache.get(key) || null;
}

async function ensureWordFamilyProfilesLoaded(normalizedForm) {
  const family = getWordFamilyConfig(normalizedForm);
  if (!family) {
    return ensureDanteWordProfileLoaded(normalizedForm);
  }
  await Promise.all(getWordFamilyMembersInIndex(family).map((member) => ensureDanteWordProfileLoaded(member)));
  return family;
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest("#help-overlay-close") || eventTarget?.closest("#help-overlay-backdrop")) {
      event.preventDefault();
      event.stopPropagation();
      closeHelpModal();
      return;
    }
    const helpAudienceTrigger = eventTarget?.closest("[data-help-audience]");
    if (helpAudienceTrigger && elements.helpOverlay && !elements.helpOverlay.classList.contains("is-hidden")) {
      const nextAudience = helpAudienceTrigger.dataset.helpAudience || "";
      if (nextAudience === "philologist" || nextAudience === "dh") {
        event.preventDefault();
        event.stopPropagation();
        if (state.helpAudience !== nextAudience) {
          state.helpAudience = nextAudience;
        }
        renderCurrentHelpContent();
      }
      return;
    }
    const authorityHighlight = eventTarget?.closest("mark");
    if (authorityHighlight && isAuthorityHighlightMark(authorityHighlight)) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      await handleAuthorityHighlightClick(authorityHighlight);
      return;
    }
    const helpTrigger = eventTarget?.closest("[data-help-key]");
    if (helpTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openHelpModal(helpTrigger.dataset.helpKey || "");
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.helpOverlay && !elements.helpOverlay.classList.contains("is-hidden")) {
      closeHelpModal();
    }
  });

  elements.quickJumpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleQuickJump();
  });

  elements.sampleBrowser.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-sample-id]");
    if (!button || !button.dataset.sampleId || button.disabled) {
      return;
    }
    rememberViewportState();
    await loadSample(button.dataset.sampleId);
    clearSearchPresentation();
    scrollToCoverageLine(state.selectedLine || 1);
  });

  elements.quickJumpInput.addEventListener("input", () => {
    state.searchQuery = elements.quickJumpInput.value.trim();
    const request = parseNavigationQuery(state.searchQuery);
    if (request.kind === "search") {
      state.searchResults = [];
      setSearchStatus(
        state.searchIndex ? "search-ready" : "search-lazy",
        state.uiLanguage === "en"
          ? (state.searchIndex
              ? "Press Vai! to run the static search."
              : "This input will load the static search index on submit.")
          : (state.searchIndex
              ? "按 Vai! 执行静态搜索。"
              : "这条输入会在提交后按需读取静态 search index。")
      );
    } else if (!state.searchQuery) {
      state.searchResults = [];
      setSearchStatus("idle", "Search UI ready.");
    } else {
      state.searchResults = [];
      setSearchStatus(
        "navigation-ready",
        state.uiLanguage === "en"
          ? "This input will use quick jump and go straight to the sample or line."
          : "当前输入会走 quick jump 导航；提交后直接跳 sample 或 line。"
      );
    }
    renderSearchResultsShell();
  });

  elements.sortMode.addEventListener("change", async (event) => {
    state.sortMode = event.target.value;
    if (state.selectedLine !== null) {
      renderLineRecords(state.lineCache.get(state.selectedLine));
    }
  });

  elements.commentarySortMode?.addEventListener("change", async (event) => {
    state.sortMode = event.target.value;
    if (state.selectedLine !== null) {
      renderLineRecords(state.lineCache.get(state.selectedLine));
    }
  });

  elements.sortDirection.addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    elements.sortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
    if (state.selectedLine !== null) {
      renderLineRecords(state.lineCache.get(state.selectedLine));
    }
  });

  elements.commentarySortDirection?.addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    syncSortControls();
    if (state.selectedLine !== null) {
      renderLineRecords(state.lineCache.get(state.selectedLine));
    }
  });

  elements.clearPins.addEventListener("click", () => {
    state.pinned.clear();
    renderPinned();
    if (state.selectedLine !== null) {
      renderLineRecords(state.lineCache.get(state.selectedLine));
    }
  });

  elements.openCompareLine?.addEventListener("click", async () => {
    if (!(state.currentSampleEntry?.id && Number.isFinite(state.selectedLine))) {
      return;
    }
    rememberViewportState();
    await jumpToSampleLine(
      state.currentSampleEntry.id,
      state.selectedLine,
      state.selectedLocus?.normalized_form || null,
    );
    window.location.hash = "#commentary-section";
  });

  elements.openCommentaryPanel?.addEventListener("click", () => {
    rememberViewportState();
    scrollToCommentarySection();
  });

  elements.uiLanguageToggle?.querySelectorAll("[data-ui-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      setUiLanguage(button.dataset.uiLang || "bilingual");
    });
  });

  elements.backNavButton?.addEventListener("click", () => {
    restorePreviousViewportState();
  });

  for (const link of elements.anchorLinks) {
    link.addEventListener("click", (event) => {
      if (link.dataset.section === "coverage-section" && Number.isFinite(state.selectedLine)) {
        event.preventDefault();
        rememberViewportState();
        scrollToCoverageLine(state.selectedLine);
        return;
      }
      rememberViewportState();
      setActiveAnchor(link.dataset.section);
    });
  }
}

function getCurrentAnchorSection() {
  return document.querySelector(".anchor-link.is-active")?.dataset.section || "";
}

function captureViewportState() {
  return {
    sampleId: state.currentSampleEntry?.id || null,
    selectedLine: Number.isFinite(Number(state.selectedLine)) ? Number(state.selectedLine) : null,
    selectedLocus: state.selectedLocus?.normalized_form || null,
    scrollY: Math.max(0, Number(window.scrollY || 0)),
    hash: String(window.location.hash || ""),
    activeAnchor: getCurrentAnchorSection(),
  };
}

function viewportStatesEqual(left, right) {
  if (!left || !right) {
    return false;
  }
  return left.sampleId === right.sampleId
    && left.selectedLine === right.selectedLine
    && left.selectedLocus === right.selectedLocus
    && left.hash === right.hash
    && left.activeAnchor === right.activeAnchor
    && Math.abs(Number(left.scrollY || 0) - Number(right.scrollY || 0)) < 12;
}

function syncBackButtonState() {
  if (!elements.backNavButton) {
    return;
  }
  const enabled = Array.isArray(state.viewportBackStack) && state.viewportBackStack.length > 0;
  elements.backNavButton.disabled = !enabled;
  elements.backNavButton.classList.toggle("is-disabled", !enabled);
  elements.backNavButton.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function rememberViewportState() {
  if (isRestoringViewportState) {
    return;
  }
  const snapshot = captureViewportState();
  const stack = state.viewportBackStack || (state.viewportBackStack = []);
  const lastSnapshot = stack[stack.length - 1];
  if (viewportStatesEqual(lastSnapshot, snapshot)) {
    syncBackButtonState();
    return;
  }
  stack.push(snapshot);
  if (stack.length > VIEWPORT_BACK_STACK_LIMIT) {
    stack.shift();
  }
  syncBackButtonState();
}

async function restorePreviousViewportState() {
  const stack = state.viewportBackStack || [];
  if (!stack.length) {
    window.location.href = "#top";
    return;
  }
  const snapshot = stack.pop();
  syncBackButtonState();
  if (!snapshot) {
    return;
  }

  isRestoringViewportState = true;
  try {
    if (snapshot.sampleId && state.currentSampleEntry?.id !== snapshot.sampleId) {
      await loadSample(snapshot.sampleId);
    }

    if (Number.isFinite(snapshot.selectedLine)) {
      await selectLine(snapshot.selectedLine);
    }

    if (snapshot.selectedLocus && Number.isFinite(snapshot.selectedLine)) {
      const payload = state.lineCache.get(snapshot.selectedLine);
      if (payload) {
        const match = getPayloadLoci(payload).find((locus) => normalizeLocusForm(locus.normalized_form) === normalizeLocusForm(snapshot.selectedLocus));
        state.selectedLocus = match || null;
        state.activeInterpretiveTerm = null;
        renderLineRecords(payload);
        if (state.selectedLocus) {
          ensureResearchLayerLoaded();
        }
      }
    }

    if (snapshot.activeAnchor) {
      setActiveAnchor(snapshot.activeAnchor);
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.hash = snapshot.hash || "";
    window.history.replaceState({}, "", nextUrl);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: Math.max(0, Number(snapshot.scrollY || 0)),
          behavior: "smooth",
        });
      });
    });
  } finally {
    window.setTimeout(() => {
      isRestoringViewportState = false;
      syncBackButtonState();
    }, 180);
  }
}

function getInitialSampleId() {
  const requested = getRequestedSampleId(state.manifestMap);
  if (requested && state.manifestMap.has(requested)) {
    return requested;
  }
  return state.manifest.default_sample;
}

function getInitialUiLanguage() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("ui_lang");
  if (requested && UI_COPY[requested]) {
    return requested === "zh" ? "bilingual" : requested;
  }
  try {
    const stored = window.localStorage.getItem("ddp-ui-language");
    if (stored && UI_COPY[stored]) {
      return stored === "zh" ? "bilingual" : stored;
    }
  } catch (error) {
    return "en";
  }
  return "en";
}

function getUiText(key) {
  const current = UI_COPY[state.uiLanguage] || UI_COPY.bilingual;
  return current[key] || UI_COPY.bilingual[key] || key;
}

function applyUiLanguage() {
  document.querySelectorAll("[data-ui-key]").forEach((node) => {
    node.textContent = getUiText(node.dataset.uiKey);
  });
  document.querySelectorAll("[data-ui-key-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", getUiText(node.dataset.uiKeyPlaceholder));
  });
  elements.anchorLinks.forEach((link) => {
    const sectionKey = link.dataset.section?.replace("-section", "");
    const key = `nav.${sectionKey}`;
    if (UI_COPY.bilingual[key]) {
      link.textContent = getUiText(key);
    }
  });
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    const url = new URL(link.href, window.location.href);
    url.searchParams.set("ui_lang", state.uiLanguage);
    link.href = url.pathname + url.search;
  });
  if (elements.sortMode) {
    const options = [...elements.sortMode.options];
    options.forEach((option) => {
      const key = option.dataset.uiKey;
      if (key) {
        option.textContent = getUiText(key);
      }
    });
  }
  if (elements.commentarySortMode) {
    const options = [...elements.commentarySortMode.options];
    options.forEach((option) => {
      const key = option.dataset.uiKey;
      if (key) {
        option.textContent = getUiText(key);
      }
    });
  }
  if (elements.sortDirection) {
    elements.sortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
  }
  if (elements.commentarySortDirection) {
    elements.commentarySortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
  }
  elements.uiLanguageToggle?.querySelectorAll("[data-ui-lang]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.uiLang === state.uiLanguage);
  });
  if (elements.commentarySummary && !Number.isFinite(state.selectedLine)) {
    elements.commentarySummary.textContent = getUiText("commentary.summary.idle");
  }
  renderHeader();
}

function setUiLanguage(language) {
  if (!UI_COPY[language]) {
    return;
  }
  state.uiLanguage = language;
  try {
    window.localStorage.setItem("ddp-ui-language", language);
  } catch (error) {
    // noop
  }
  const url = new URL(window.location.href);
  if (language === "bilingual") {
    url.searchParams.delete("ui_lang");
  } else {
    url.searchParams.set("ui_lang", language);
  }
  window.history.replaceState({}, "", url);
  applyUiLanguage();
  if (state.manifest) {
    renderSampleBrowser();
  }
}

async function loadSample(sampleId) {
  const entry = state.manifestMap.get(sampleId);
  if (!entry) {
    throw new Error(`Unknown sample: ${sampleId}`);
  }
  const requestedLineNumber = getRequestedLineNumber(sampleId);
  const requestedLocusNormalized = getRequestedLocusNormalized(sampleId);

  state.currentSampleEntry = entry;
  resetSampleState();
  ensureSampleLineEchoProfilesLoaded(sampleId);
  ensureSampleAuthorityCantoIndexLoaded(sampleId);
  renderFigurePanel();
  syncSampleSelection();
  updateSampleUrl(sampleId, requestedLineNumber, { locusNormalized: requestedLocusNormalized });
  renderPinned();

  if (entry.overview_available && entry.overview_path) {
    state.overview = await fetchJson(entry.overview_path);
    renderHeader();
    renderCoverage();
    renderFutureHooks(state.overview.future_lenses || []);
    setWorkspaceInteractive(canSampleOpenLineWorkbench(entry));

    const defaultLine = state.overview.lines.find((line) => line.line_number === requestedLineNumber)
      || state.overview.lines.find((line) => line.line_number === 1)
      || state.overview.lines[0];
    if (defaultLine) {
      renderLineLoadingState(defaultLine.line_number);
      const token = ++deferredInitialLineSelectionToken;
      const schedule = typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);
      schedule(() => {
        if (token !== deferredInitialLineSelectionToken) {
          return;
        }
        if (state.currentSampleEntry?.id !== sampleId) {
          return;
        }
        jumpToSampleLine(sampleId, defaultLine.line_number, requestedLocusNormalized, {
          suppressCoverageScroll: true,
          pinCoverageRow: true,
        }).then(() => {
          settlePinnedCoverageRow(defaultLine.line_number);
        }).catch((error) => {
          console.warn(`Deferred line selection failed for ${sampleId} line ${defaultLine.line_number}`, error);
          renderCoverageOnlyLine(defaultLine.line_number);
        });
      });
    }
    return;
  }

  deferredInitialLineSelectionToken += 1;
  state.overview = null;
  renderHeader();
  renderShellSample(entry);
  renderFutureHooks([]);
  setWorkspaceInteractive(false);
}

function resetSampleState() {
  state.overview = null;
  state.selectedLine = null;
  state.selectedLocus = null;
  state.activeSearchRecordId = null;
  state.lineCache.clear();
  state.semanticCache.clear();
  state.activeSemanticField = null;
  state.activeInterpretiveTerm = null;
  state.expanded.clear();
  state.fullTextCache.clear();
  state.loadingFullText.clear();
  state.pinned.clear();
  state.authorityInlineScope = "line";
  state.authorityInlineReturnScope = null;
  state.authorityInlineOpenRecordId = null;
  state.authorityInlineOpenRecordScope = null;
  state.authorityInlineOpenWorkKey = null;
  state.activeSearchRecordId = null;
  state.activeSearchHighlightTerms = [];
  if (elements.coverageList) {
    elements.coverageList.scrollTop = 0;
  }
}

function clearSearchPresentation(options = {}) {
  const {
    preserveHighlights = false,
    preserveInput = false,
    preserveResults = false,
    preserveQuery = false,
    preserveStatus = false,
  } = options;

  if (!preserveInput && elements.quickJumpInput) {
    elements.quickJumpInput.value = "";
  }
  if (!preserveQuery) {
    state.searchQuery = "";
    state.searchSubmittedQuery = "";
  }
  if (!preserveResults) {
    state.searchResults = [];
  }
  if (!preserveHighlights) {
    state.activeSearchRecordId = null;
    state.activeSearchHighlightTerms = [];
  }
  if (!preserveStatus) {
    setSearchStatus("idle", "Search UI ready.");
  }

  updateQuickJumpResults();
  renderSearchResultsShell();
}

function clearSearchFocus() {
  state.activeSearchRecordId = null;
  state.activeSearchHighlightTerms = [];
}

function getLinePayloadPath(sampleId, lineNumber) {
  const entry = state.manifestMap.get(sampleId) || {};
  const basePath = entry.line_data_path || `./data/${sampleId}/lines`;
  return `${basePath}/${String(lineNumber).padStart(3, "0")}.json`;
}

function canSampleOpenLineWorkbench(entry = state.currentSampleEntry) {
  if (!entry) {
    return false;
  }
  if (entry.overview_available || entry.overview_path) {
    return true;
  }
  if (entry.line_data_available || entry.record_store_available) {
    return true;
  }
  if (entry.line_data_path || entry.record_store_path || entry.record_store_index_path) {
    return true;
  }
  return Boolean(entry.modules?.records || entry.modules?.semantic_fields || entry.modules?.comparison);
}

let semanticPanel;
let wordLevelPanel;
let lineLevelPanel;
let recordsPanel;

const {
  buildCanonicalHref,
  updateSampleUrl,
  getRequestedLineNumber,
  getRequestedLocusNormalized,
  getRequestedSampleId,
} = window.DDPRouting.createShellRouting();

const coveragePanel = window.DDPCoveragePanel.createCoveragePanel({
  state,
  elements,
  documentRef: document,
  buildCanonicalHref,
  escapeHtml,
  renderSelectableLineMarkup,
  canSampleOpenLineWorkbench,
  handleCoverageRowSelection,
  handleCoverageLocusSelection,
  clearAnalysisSummary,
  formatNumber,
  renderModuleLabel,
});

function getAuthorityWorksTreeMeta(author) {
  return author?.works_tree || null;
}

function ensureAuthorityAuthorDetailState() {
  if (!state.authorityAuthorDetailCache) {
    state.authorityAuthorDetailCache = new Map();
  }
  if (!state.authorityAuthorDetailPromises) {
    state.authorityAuthorDetailPromises = new Map();
  }
}

function getLoadedAuthorityAuthorDetail(author) {
  const authorId = String(author?.author_id || "").trim();
  if (!authorId) {
    return null;
  }
  ensureAuthorityAuthorDetailState();
  return state.authorityAuthorDetailCache.get(authorId) || null;
}

async function ensureAuthorityAuthorDetailLoaded(author) {
  const authorId = String(author?.author_id || "").trim();
  const detailPath = String(author?.detail_path || "").trim();
  if (!authorId || !detailPath) {
    return author || null;
  }
  ensureAuthorityAuthorDetailState();
  if (state.authorityAuthorDetailCache.has(authorId)) {
    return state.authorityAuthorDetailCache.get(authorId);
  }
  if (!state.authorityAuthorDetailPromises.has(authorId)) {
    const request = fetchJson(detailPath)
      .then((payload) => {
        const resolved = payload?.author || payload || author;
        state.authorityAuthorDetailCache.set(authorId, resolved);
        return resolved;
      })
      .finally(() => {
        state.authorityAuthorDetailPromises.delete(authorId);
      });
    state.authorityAuthorDetailPromises.set(authorId, request);
  }
  return state.authorityAuthorDetailPromises.get(authorId);
}

function mergeAuthorityAuthor(baseAuthor, detailAuthor) {
  if (!detailAuthor) {
    return baseAuthor;
  }
  const flatWorkMeta = detailAuthor?.flat_work_object
    || detailAuthor?.flat_work_meta
    || baseAuthor?.flat_work_object
    || baseAuthor?.flat_work_meta;
  return {
    ...baseAuthor,
    ...detailAuthor,
    author_id: baseAuthor?.author_id || detailAuthor.author_id,
    canonical_name: baseAuthor?.canonical_name || detailAuthor.canonical_name,
    detail_path: baseAuthor?.detail_path || detailAuthor.detail_path,
    works_tree: detailAuthor?.works_tree || baseAuthor?.works_tree,
    commentary_line_index: detailAuthor?.commentary_line_index || baseAuthor?.commentary_line_index,
    flat_work_object: flatWorkMeta,
    partial_tree_object: detailAuthor?.partial_tree_object || baseAuthor?.partial_tree_object,
    occurrence_sample_object: detailAuthor?.occurrence_sample_object || baseAuthor?.occurrence_sample_object,
    reading_contract_meta: detailAuthor?.reading_contract_meta || baseAuthor?.reading_contract_meta,
    pressure_meta: detailAuthor?.pressure_meta || baseAuthor?.pressure_meta,
    maturity_meta: detailAuthor?.maturity_meta || baseAuthor?.maturity_meta,
    wave21_frontline_meta: detailAuthor?.wave21_frontline_meta || baseAuthor?.wave21_frontline_meta,
    wave22_frontline_meta: detailAuthor?.wave22_frontline_meta || baseAuthor?.wave22_frontline_meta,
    wave23_drilldown_meta: detailAuthor?.wave23_drilldown_meta || baseAuthor?.wave23_drilldown_meta,
    wave24_drilldown_meta: detailAuthor?.wave24_drilldown_meta || baseAuthor?.wave24_drilldown_meta,
  };
}

function getResolvedAuthorityAuthor(author) {
  if (!author) {
    return null;
  }
  return mergeAuthorityAuthor(author, getLoadedAuthorityAuthorDetail(author));
}

function ensureAuthorityFlatObjectState() {
  if (!state.authorityFlatObjectCache) {
    state.authorityFlatObjectCache = new Map();
  }
  if (!state.authorityFlatObjectPromises) {
    state.authorityFlatObjectPromises = new Map();
  }
}

function getAuthorityFlatWorkMeta(author) {
  return author?.flat_work_object || author?.flat_work_meta || null;
}

function getLoadedAuthorityFlatWorkObject(author) {
  const meta = getAuthorityFlatWorkMeta(author);
  if (!meta) {
    return null;
  }
  if (meta.path) {
    ensureAuthorityFlatObjectState();
    return state.authorityFlatObjectCache.get(author.author_id) || null;
  }
  return meta;
}

async function ensureAuthorityFlatWorkObjectLoaded(author) {
  const meta = getAuthorityFlatWorkMeta(author);
  if (!meta?.available || !meta?.path || !author?.author_id) {
    return meta || null;
  }
  ensureAuthorityFlatObjectState();
  if (state.authorityFlatObjectCache.has(author.author_id)) {
    return state.authorityFlatObjectCache.get(author.author_id);
  }
  if (!state.authorityFlatObjectPromises.has(author.author_id)) {
    const request = fetchJson(meta.path)
      .then((payload) => {
        state.authorityFlatObjectCache.set(author.author_id, payload);
        window.__authorityFlatLoadDebug = {
          authorId: author.author_id,
          status: "resolved",
          workCardCount: Array.isArray(payload?.work_cards) ? payload.work_cards.length : 0,
          occurrenceSampleCount: Array.isArray(payload?.work_occurrence_samples) ? payload.work_occurrence_samples.length : 0,
        };
        return payload;
      })
      .catch((error) => {
        window.__authorityFlatLoadDebug = {
          authorId: author.author_id,
          status: "rejected",
          message: error?.message || String(error),
        };
        throw error;
      })
      .finally(() => {
        state.authorityFlatObjectPromises.delete(author.author_id);
      });
    state.authorityFlatObjectPromises.set(author.author_id, request);
  }
  return state.authorityFlatObjectPromises.get(author.author_id);
}

function getAuthorityGenericDrilldownAuthor(author) {
  const flat = getLoadedAuthorityFlatWorkObject(author);
  if (!flat) {
    return author;
  }
  return {
    ...author,
    ...flat,
    author_id: author?.author_id || flat.author_id,
    canonical_name: author?.canonical_name || flat.canonical_name,
    reading_contract_meta: author?.reading_contract_meta || flat.reading_contract_meta,
    pressure_meta: author?.pressure_meta || flat.pressure_meta,
    maturity_meta: author?.maturity_meta || flat.maturity_meta,
    wave21_frontline_meta: author?.wave21_frontline_meta || flat.wave21_frontline_meta,
    wave22_frontline_meta: author?.wave22_frontline_meta || flat.wave22_frontline_meta,
    wave23_drilldown_meta: author?.wave23_drilldown_meta || flat.wave23_drilldown_meta,
    wave24_drilldown_meta: author?.wave24_drilldown_meta || flat.wave24_drilldown_meta,
    flat_work_object: author?.flat_work_object || author?.flat_work_meta || flat.flat_work_object || flat.flat_work_meta,
    partial_tree_object: author?.partial_tree_object || flat.partial_tree_object,
    works_layer_note: author?.works_layer_note || flat.works_layer_note,
    frontend_notes: author?.frontend_notes || flat.frontend_notes,
  };
}

function getLoadedAuthorityWorksTree(author) {
  const meta = getAuthorityWorksTreeMeta(author);
  if (!meta) {
    return null;
  }
  if (meta.path) {
    return state.authorityWorksTreeCache.get(author.author_id) || null;
  }
  return meta;
}

function getAuthorityCommentaryLineMeta(author) {
  return author?.commentary_line_index || null;
}

function getLoadedAuthorityCommentaryLineIndex(author) {
  const meta = getAuthorityCommentaryLineMeta(author);
  if (!meta) {
    return null;
  }
  if (meta.path) {
    return state.authorityCommentaryLineCache.get(author.author_id) || null;
  }
  return meta;
}

async function ensureAuthorityCommentaryLineIndexLoaded(author) {
  const meta = getAuthorityCommentaryLineMeta(author);
  if (!meta?.available || !meta?.path || !author?.author_id) {
    return meta || null;
  }
  if (state.authorityCommentaryLineCache.has(author.author_id)) {
    return state.authorityCommentaryLineCache.get(author.author_id);
  }
  if (!state.authorityCommentaryLinePromises.has(author.author_id)) {
    const request = fetchJson(meta.path)
      .then((payload) => {
        state.authorityCommentaryLineCache.set(author.author_id, payload);
        return payload;
      })
      .finally(() => {
        state.authorityCommentaryLinePromises.delete(author.author_id);
      });
    state.authorityCommentaryLinePromises.set(author.author_id, request);
  }
  return state.authorityCommentaryLinePromises.get(author.author_id);
}

async function ensureAuthorityWorksTreeLoaded(author) {
  const meta = getAuthorityWorksTreeMeta(author);
  if (!meta?.available || !meta?.path || !author?.author_id) {
    return meta || null;
  }
  if (state.authorityWorksTreeCache.has(author.author_id)) {
    return state.authorityWorksTreeCache.get(author.author_id);
  }
  if (!state.authorityWorksTreePromises.has(author.author_id)) {
    const request = fetchJson(meta.path)
      .then((payload) => {
        state.authorityWorksTreeCache.set(author.author_id, payload);
        return payload;
      })
      .finally(() => {
        state.authorityWorksTreePromises.delete(author.author_id);
      });
    state.authorityWorksTreePromises.set(author.author_id, request);
  }
  return state.authorityWorksTreePromises.get(author.author_id);
}

function inferAuthorityOccurrenceSampleName(occurrence) {
  if (occurrence?.sample_name) {
    return occurrence.sample_name;
  }
  const cantica = String(occurrence?.cantica || "").toLowerCase();
  const canto = Number(occurrence?.canto);
  if (!cantica || !Number.isFinite(canto)) {
    return null;
  }
  return `${cantica}${canto}`;
}

async function ensureAuthorityCommentarySampleLoaded(sampleName) {
  const key = String(sampleName || "").trim();
  if (!key) {
    return null;
  }
  if (state.authorityCommentarySourceCache.has(key)) {
    return state.authorityCommentarySourceCache.get(key);
  }
  const manifestEntry = state.authorityCommentarySources?.by_sample?.[key];
  if (!manifestEntry?.path) {
    return null;
  }
  if (!state.authorityCommentarySourcePromises.has(key)) {
    const request = fetchJson(manifestEntry.path)
      .then((payload) => {
        state.authorityCommentarySourceCache.set(key, payload);
        return payload;
      })
      .finally(() => {
        state.authorityCommentarySourcePromises.delete(key);
      });
    state.authorityCommentarySourcePromises.set(key, request);
  }
  return state.authorityCommentarySourcePromises.get(key);
}

async function ensureAuthorityCommentarySourceLoaded(occurrence) {
  const sampleName = inferAuthorityOccurrenceSampleName(occurrence);
  if (!sampleName) {
    return null;
  }
  await ensureAuthorityCommentarySourcesLoaded();
  const shard = await ensureAuthorityCommentarySampleLoaded(sampleName);
  return shard?.by_result_url?.[occurrence?.result_url] || null;
}

function mergeSearchIndexShards(manifest, shardPayloads) {
  const documents = {};
  const tokenIndex = {};
  const sourcePools = {
    commentary: [],
  };
  const samples = [];

  for (const [index, shardPayload] of (shardPayloads || []).entries()) {
    const descriptor = manifest?.shards?.[index] || {};
    const shardKey = descriptor.cantica_key || shardPayload?.cantica_key || `shard${index}`;
    const commentaryOffset = sourcePools.commentary.length;
    const commentaryPool = Array.isArray(shardPayload?.source_pools?.commentary)
      ? shardPayload.source_pools.commentary
      : [];
    sourcePools.commentary.push(...commentaryPool);

    for (const sample of shardPayload?.samples || []) {
      samples.push(sample);
    }

    const shardDocuments = Array.isArray(shardPayload?.documents)
      ? shardPayload.documents
      : [];
    shardDocuments.forEach((document, localDocumentId) => {
      const adjustedDocument = { ...document };
      if (Array.isArray(document?.commentary_targets)) {
        adjustedDocument.commentary_targets = document.commentary_targets.map((item) => {
          if (!Array.isArray(item) || item.length < 2) {
            return item;
          }
          return [Number(item[0] || 0) + commentaryOffset, item[1]];
        });
      }
      documents[`${shardKey}:${localDocumentId}`] = adjustedDocument;
    });

    for (const [token, hits] of Object.entries(shardPayload?.token_index || {})) {
      tokenIndex[token] ||= [];
      for (const hit of hits || []) {
        const parsedHit = parseRawSearchHit(hit);
        if (!parsedHit) {
          continue;
        }
        const globalDocumentId = `${shardKey}:${parsedHit.documentId}`;
        const globalSourceRef = parsedHit.sourceLayer === "commentary"
          ? Number(parsedHit.sourceIndex || 0) + commentaryOffset
          : Number(parsedHit.sourceIndex || 0);
        tokenIndex[token].push([
          globalDocumentId,
          parsedHit.sourceLayer,
          globalSourceRef,
          parsedHit.supportingMatchCount,
        ]);
      }
    }
  }

  return {
    ...manifest,
    samples,
    documents,
    token_index: tokenIndex,
    source_pools: sourcePools,
  };
}

const {
  fetchJson,
  getRecordStoreMeta,
  getFullTextStoreMeta,
  getRecordSummaryStoreMeta,
  ensureSampleRecordStoreLoaded,
  ensureSampleRecordSummaryStoreLoaded,
  ensureSampleFullTextStoreLoaded,
  ensureSampleRecordWorkMentionStoreLoaded,
  ensureSampleAuthorityCantoIndexLoaded,
  resolveLineRecords,
  hydrateLinePayload,
  ensureAuthorityLayerLoaded,
  ensureAuthorityCommentarySourcesLoaded,
  ensureAuthorityHighlightLexiconLoaded,
  ensureAuthorityPersonaggioScanLoaded,
  ensureAuthorityPersonaggioAliasAtlasLoaded,
  ensureAuthorityPersonaggioPoemAliasScanLoaded,
  ensureAuthorityCuratedRoomAnchorsLoaded,
  ensureVirgilioAppendixLedgerLoaded,
  ensureSearchIndexLoaded,
} = window.DDPLoaders.createShellLoaders({
  state,
  config: window.DDPConfig,
  mergeSearchIndexShards,
});

async function ensureDanteWordLociIndexLoaded() {
  if (state.danteWordLociIndex) {
    return state.danteWordLociIndex;
  }
  if (!state.danteWordLociIndexPromise) {
    state.danteWordLociIndexPromise = fetchJson(`${DATA_BASE}/dante_word_loci/index.json`)
      .then((payload) => {
        state.danteWordLociIndex = payload;
        return payload;
      })
      .finally(() => {
        state.danteWordLociIndexPromise = null;
      });
  }
  return state.danteWordLociIndexPromise;
}

async function ensureDanteWordProfileLoaded(normalizedForm) {
  const key = String(normalizedForm || "").trim();
  if (!key) {
    return null;
  }
  if (state.danteWordProfileCache.has(key)) {
    return state.danteWordProfileCache.get(key);
  }

  const index = await ensureDanteWordLociIndexLoaded();
  const descriptor = index?.profiles?.[key];
  if (!descriptor?.profile_path) {
    return null;
  }

  if (!state.danteWordProfilePromises.has(key)) {
    const request = fetchJson(descriptor.profile_path)
      .then((payload) => {
        state.danteWordProfileCache.set(key, payload);
        return payload;
      })
      .finally(() => {
        state.danteWordProfilePromises.delete(key);
      });
    state.danteWordProfilePromises.set(key, request);
  }

  return state.danteWordProfilePromises.get(key);
}

function renderHeader() {
  const titleNode = document.getElementById("coverage-title");
  if (titleNode) {
    titleNode.textContent = formatCurrentCantoLabel();
  }
  return state.currentSampleEntry;
}

function renderCoverage() {
  return coveragePanel.renderCoverage();
}

async function handleCoverageRowSelection(lineNumber) {
  rememberViewportState();
  clearSearchFocus();
  await selectLine(lineNumber);
  settlePinnedCoverageRow(lineNumber);
  if (isApprovedUiEasterEggLine(state.currentSampleEntry?.id || state.overview?.sample, lineNumber)) {
    requestAnimationFrame(() => {
      maybeTriggerApprovedUiEasterEgg("coverage-row-click");
      window.setTimeout(() => {
        maybeTriggerApprovedUiEasterEgg("coverage-row-settle");
      }, 220);
    });
  }
}

async function handleCoverageLocusSelection(lineNumber, locusId) {
  rememberViewportState();
  clearSearchFocus();
  await selectLine(lineNumber);
  const payload = state.lineCache.get(lineNumber);
  if (payload) {
    const locus = getPayloadLoci(payload).find((item) => item.id === locusId);
    if (locus && isLocusSelectableInWorkbench(locus)) {
      state.selectedLocus = locus;
      state.activeInterpretiveTerm = null;
      updateSampleUrl(state.currentSampleEntry?.id || state.overview?.sample, lineNumber, {
        locusNormalized: state.selectedLocus.normalized_form,
      });
      renderLineRecords(payload);
      ensureResearchLayerLoaded();
    }
  }
  scrollToRecordsSection();
}

function scrollToRecordsSection() {
  setActiveAnchor("records-section");
  elements.recordsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToCommentarySection() {
  setActiveAnchor("commentary-section");
  elements.commentarySection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToCoverageSection() {
  setActiveAnchor("coverage-section");
  document.getElementById("coverage-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToRequestedHashTarget() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (!hash) {
    return false;
  }
  const target = document.getElementById(hash);
  if (!target) {
    return false;
  }
  if (hash === "coverage-section") {
    setActiveAnchor("coverage-section");
  } else if (
    hash === "analysis-summary"
    || hash === "line-context"
  ) {
    setActiveAnchor("coverage-section");
  } else if (
    hash === "records-section"
    || hash === "commentary-section"
    || hash === "commentary-cards-section"
    || hash === "commentary-summary"
    || hash === "records-list"
    || hash === "compare-section"
    || hash === "locus-panel"
    || hash === "vocabulary-panel"
    || hash === "occurrence-explorer-panel"
    || hash === "micro-context-panel"
    || hash === "phrase-expansions-panel"
    || hash === "contrastive-vocabulary-panel"
    || hash === "semantic-panel"
    || hash === "recurrence-panel"
  ) {
    setActiveAnchor(
      hash === "commentary-section"
      || hash === "commentary-cards-section"
      || hash === "commentary-summary"
      || hash === "records-list"
      || hash === "compare-section"
        ? "commentary-section"
        : "records-section"
    );
  } else if (hash.startsWith("record-")) {
    setActiveAnchor("commentary-section");
  } else if (hash === "scholar-section") {
    setActiveAnchor(hash);
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-jump-focus");
  window.setTimeout(() => target.classList.remove("is-jump-focus"), 1800);
  return true;
}

function scrollToCoverageLine(lineNumber) {
  if (!Number.isFinite(Number(lineNumber))) {
    return;
  }
  setActiveAnchor("coverage-section");
  scrollToCoverageSection();
  requestAnimationFrame(() => {
    const section = document.getElementById("coverage-section");
    section?.classList.add("is-jump-focus");
    window.setTimeout(() => section?.classList.remove("is-jump-focus"), 1400);
    const row = elements.coverageList.querySelector(`.coverage-row[data-line-number="${CSS.escape(String(lineNumber))}"]`);
    if (!row) {
      return;
    }
    settlePinnedCoverageRow(lineNumber);
    row.classList.add("is-jump-focus");
    window.setTimeout(() => row.classList.remove("is-jump-focus"), 1400);
  });
}

function scrollToSemanticPanel() {
  setActiveAnchor("records-section");
  const panel = elements.semanticPanel;
  if (!panel) {
    return;
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  panel.classList.add("is-jump-focus");
  window.setTimeout(() => panel.classList.remove("is-jump-focus"), 1400);
}

function renderSampleBrowser() {
  const samples = state.manifest.samples || [];
  const totalSlots = CANTICA_SHELLS.reduce((sum, shell) => sum + shell.total, 0);
  elements.browserSummary.innerHTML = renderBrowserSummary(samples.length, totalSlots);
  elements.sampleLegend.innerHTML = "";
  elements.sampleLegend.hidden = true;

  const shellColumns = CANTICA_SHELLS.map((shell) => {
    const column = document.createElement("section");
    column.className = "cantica-column";
    column.innerHTML = `
      <div class="cantica-column-head">
        <div>
          <h3>${escapeHtml(shell.label)}</h3>
        </div>
      </div>
      <div class="cantica-grid" data-cantica="${shell.key}"></div>
    `;

    const grid = column.querySelector(".cantica-grid");
    const slots = [];
    for (let canto = 1; canto <= shell.total; canto += 1) {
      const sampleId = `${shell.key}${canto}`;
      const sample = state.manifestMap.get(sampleId) || null;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `canto-chip ${sample ? `status-${sample.status}` : "status-not-mounted"}`;
      button.dataset.sampleId = sample?.id || "";
      button.dataset.cantica = shell.key;
      button.dataset.canto = String(canto);
      button.setAttribute(
        "aria-label",
        sample
          ? sample.title
          : `${shell.label} ${canto} · Not Mounted`
      );

      if (sample) {
        button.title = sample.title;
        button.innerHTML = `
          <span class="canto-chip-number">${escapeHtml(toRomanNumeral(canto))}</span>
        `;
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          rememberViewportState();
          await loadSample(sample.id);
          scrollToCoverageSection();
        });
      } else {
        button.disabled = true;
        button.title = `${shell.label} ${canto} 暂未挂载`;
        button.innerHTML = `
          <span class="canto-chip-number">${escapeHtml(toRomanNumeral(canto))}</span>
        `;
      }

      slots.push(button);
    }
    grid.replaceChildren(...slots);
    return column;
  });

  elements.sampleBrowser.replaceChildren(...shellColumns);
  syncSampleSelection();
}

function renderLocusPanel(payload) {
  return wordLevelPanel.renderLocusPanel(payload);
}

function renderVocabularyPanel(payload) {
  return wordLevelPanel.renderVocabularyPanel(payload);
}

const authorityPanel = window.DDPAuthorityPanel.createAuthorityPanel({
  state,
  elements,
  escapeHtml,
  renderHelpButton,
  ensureResearchLayerLoaded,
  ensureAuthorityLayerLoaded,
  ensureAuthorityPersonaggioScanLoaded,
  ensureAuthorityPersonaggioAliasAtlasLoaded,
  ensureAuthorityPersonaggioPoemAliasScanLoaded,
  ensureAuthorityCuratedRoomAnchorsLoaded,
  ensureVirgilioAppendixLedgerLoaded,
  bindScholarLensEvents,
  getAuthorityAuthors,
  renderAuthorityLensMarkup,
});

function normalizeLineAuthorityRecordId(record) {
  return String(record?.id || record?.record_id || record?.recordId || "").trim();
}

function getLineAuthorityMentionRecord(record) {
  const recordId = normalizeLineAuthorityRecordId(record);
  const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
  if (!recordId || !sampleId) {
    return null;
  }
  return state.sampleRecordWorkMentionCache.get(sampleId)?.records?.[recordId] || null;
}

function compactLineAuthorityText(text, maxLength = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function prettifyAuthorityId(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function getLineAuthorityRecordPreview(record) {
  return compactLineAuthorityText(
    record?.record_text_preview ||
    record?.record_summary ||
    record?.one_line_summary ||
    "",
    260
  );
}

function getLineAuthorityFullTextRecord(recordId) {
  const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
  if (!sampleId || !recordId) {
    return null;
  }
  return state.sampleFullTextStoreCache.get(sampleId)?.records?.[recordId] || null;
}

function renderLineAuthorityRecordBody(text) {
  return escapeHtml(text || "").replace(/\n{2,}/g, "\n\n").replace(/\n/g, "<br>");
}

function renderAuthorityPlainLineMarkup(payload) {
  const text = String(payload?.line_text || "");
  if (!text) {
    return escapeHtml(choose("No base text captured for this line.", "这一行暂时没有原文。"));
  }
  const match = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ']/);
  if (!match || !Number.isFinite(match.index)) {
    return escapeHtml(text);
  }
  const index = match.index;
  return `${escapeHtml(text.slice(0, index))}<span class="line-initial-letter">${escapeHtml(text[index])}</span>${escapeHtml(text.slice(index + 1))}`;
}

function renderLineAuthorityExpandedBody(record, fullText) {
  const summary = compactLineAuthorityText(record?.one_line_summary || "", 280);
  const summaryMarkup = summary
    ? `<span class="authority-inline-record-summary">${escapeHtml(summary)}</span>`
    : "";
  const textMarkup = fullText ? renderLineAuthorityRecordBody(fullText) : "";
  return `${summaryMarkup}${textMarkup ? `<span class="authority-inline-record-fulltext">${textMarkup}</span>` : ""}`;
}

function renderAuthorityInlineRecordReading(record, fullText) {
  const summary = compactLineAuthorityText(record?.one_line_summary || "", 320);
  const text = fullText || record?.record_text || record?.record_text_preview || record?.preview || record?.record_summary || "";
  const meta = [
    record?.commentary_name,
    record?.date_label || record?.century_label,
    record?.line_info ? `line ${record.line_info}` : "",
  ].filter(Boolean).join(" · ");
  return `
    <aside class="authority-inline-open-reader" aria-live="polite">
      <div class="authority-inline-open-reader-head">
        <div>
          <span class="analysis-label">Opened commentary record</span>
          <h4>${escapeHtml(meta || "Commentary record")}</h4>
        </div>
        <button type="button" class="authority-inline-reader-close" data-authority-inline-close>Close</button>
      </div>
      ${summary ? `<div class="record-inline-summary"><div class="record-inline-summary-copy">${renderReadingBody(summary, { chunkLongParagraphs: false, maxParagraphs: 1 })}</div></div>` : ""}
      ${renderReadingBody(
        text,
        { chunkLongParagraphs: true },
        [],
        buildAuthorityTextHighlightGroups(text, [], record)
      )}
    </aside>
  `;
}

function renderAuthorityInlineWorkReading(authority, work) {
  const records = (work.records || []).slice().sort((left, right) =>
    Number(left.year_start || 9999) - Number(right.year_start || 9999) ||
    String(left.commentary_name || "").localeCompare(String(right.commentary_name || ""))
  );
  const surfaces = [...(work.surfaces || [])].slice(0, 8);
  const recordMarkup = records.map((record) => {
    const recordId = normalizeLineAuthorityRecordId(record);
    const meta = [record.commentary_name, record.date_label || record.century_label]
      .filter(Boolean)
      .join(" · ");
    const preview = getLineAuthorityRecordPreview(record);
    return `
      <button type="button" class="authority-inline-record" data-line-authority-record-id="${escapeHtml(recordId)}" aria-label="${escapeHtml(`Open ${meta || "commentary record"} full text`)}">
        <strong>${escapeHtml(meta || "Commentary record")}</strong>
        ${preview ? `<span class="authority-inline-record-body">${renderLineAuthorityRecordBody(preview)}</span>` : ""}
        <span class="authority-inline-record-action">Open full text</span>
      </button>
    `;
  }).join("");

  return `
    <aside class="authority-inline-open-reader authority-inline-work-reader" aria-live="polite">
      <div class="authority-inline-open-reader-head">
        <div>
          <span class="analysis-label">Filtered commentary records</span>
          <h4>${escapeHtml(work.label)}${authority?.displayName ? ` · ${escapeHtml(authority.displayName)}` : ""}</h4>
        </div>
        <button type="button" class="authority-inline-reader-close" data-authority-inline-close>Close</button>
      </div>
      <div class="authority-inline-work-reader-meta">
        <strong>${escapeHtml(String(work.recordIds?.size || records.length))} records</strong>
        <span>${escapeHtml(choose(
          "touch this line through this work signal.",
          "条注释通过这个作品信号触及这一行。"
        ))}</span>
      </div>
      ${surfaces.length ? `<div class="authority-inline-surfaces">${surfaces.map((surface) => `<span>${escapeHtml(surface)}</span>`).join("")}</div>` : ""}
      ${recordMarkup
        ? `<div class="authority-inline-work-record-list">${recordMarkup}</div>`
        : `<div class="empty-state">${escapeHtml(choose("No commentary records are available for this work signal yet.", "这个作品信号暂时没有可展示的注释记录。"))}</div>`}
    </aside>
  `;
}

function renderAuthorityInlineScopeControls(activeScope = "line") {
  const canOpenLine = state.selectedLine != null && state.lineCache.has(state.selectedLine);
  return `
    <div class="authority-inline-scope-row" aria-label="Authority reading scope">
      <button
        type="button"
        class="authority-inline-scope-chip ${activeScope === "line" ? "is-active" : ""}"
        data-authority-inline-scope="line"
        ${canOpenLine ? "" : "disabled"}>
        Line
      </button>
      <button
        type="button"
        class="authority-inline-scope-chip ${activeScope === "canto" ? "is-active" : ""}"
        data-authority-inline-scope="canto">
        Canto Map
      </button>
      <button
        type="button"
        class="authority-inline-scope-chip ${activeScope === "full" ? "is-active" : ""}"
        data-authority-inline-scope="full">
        Full Authority Page
      </button>
    </div>
  `;
}

function collectLineAuthorityItems(payload) {
  const authorMap = new Map();
  const totalRecordIds = new Set();

  for (const record of payload?.records || []) {
    const recordId = normalizeLineAuthorityRecordId(record);
    const mentionRecord = getLineAuthorityMentionRecord(record);
    const rawMentions = (
      Array.isArray(mentionRecord?.raw_work_mentions)
        ? mentionRecord.raw_work_mentions
        : getRawWorkMentionsForRecord(record)
    ).filter((row) => row && !isDanteCommediaWorkRow(row));
    if (!rawMentions.length) {
      continue;
    }

    const authorMetaById = new Map(
      (mentionRecord?.authority_authors || record?.authority_authors || []).map((author) => [
        String(author?.author_id || "").trim(),
        author,
      ])
    );
    const workMetaByKey = new Map(
      (mentionRecord?.authority_works || record?.authority_works || []).map((work) => [
        `${String(work?.author_id || "").trim()}::${String(work?.canonical_work || work?.display_label || "").trim()}`,
        work,
      ])
    );

    rawMentions.forEach((row) => {
      const authorId = String(row.author_id || "unknown").trim();
      const canonicalWork = String(row.canonical_work || "").trim();
      const authorMeta = authorMetaById.get(authorId) || {};
      const authorKey = authorId || authorMeta.display_name || "unknown";
      if (!authorMap.has(authorKey)) {
        authorMap.set(authorKey, {
          authorId,
          displayName: authorMeta.display_name || authorMeta.canonical_name || prettifyAuthorityId(authorId),
          canonicalName: authorMeta.canonical_name || "",
          publicSlug: authorMeta.public_slug_it || "",
          recordIds: new Set(),
          mentionCount: 0,
          stableCount: 0,
          caveatedCount: 0,
          surfaces: new Set(),
          works: new Map(),
          records: [],
        });
      }

      const authorItem = authorMap.get(authorKey);
      if (recordId && !authorItem.recordIds.has(recordId)) {
        authorItem.records.push(record);
      }
      if (recordId) {
        authorItem.recordIds.add(recordId);
        totalRecordIds.add(recordId);
      }
      const surfaceCount = Math.max(1, (row.raw_surfaces || []).length);
      authorItem.mentionCount += surfaceCount;
      if (row.work_bucket === "caveated") {
        authorItem.caveatedCount += surfaceCount;
      } else {
        authorItem.stableCount += surfaceCount;
      }
      (row.raw_surfaces || []).forEach((surface) => {
        const label = String(surface || "").trim();
        if (label) {
          authorItem.surfaces.add(label);
        }
      });

      if (canonicalWork) {
        const workMeta = workMetaByKey.get(`${authorId}::${canonicalWork}`) || {};
        const workKey = `${authorId}::${canonicalWork}`;
        if (!authorItem.works.has(workKey)) {
          authorItem.works.set(workKey, {
            key: workKey,
            label: workMeta.display_label || canonicalWork,
            bucket: row.work_bucket === "caveated" ? "caveated" : "stable",
            surfaces: new Set(),
            recordIds: new Set(),
            records: [],
          });
        }
        const workItem = authorItem.works.get(workKey);
        if (recordId && !workItem.recordIds.has(recordId)) {
          workItem.records.push(record);
          workItem.recordIds.add(recordId);
        }
        (row.raw_surfaces || []).forEach((surface) => {
          const label = String(surface || "").trim();
          if (label) {
            workItem.surfaces.add(label);
          }
        });
      }
    });
  }

  const authors = [...authorMap.values()].map((item) => ({
    ...item,
    records: [...item.records].sort((left, right) =>
      Number(left.year_start || 9999) - Number(right.year_start || 9999) ||
      String(left.commentary_name || "").localeCompare(String(right.commentary_name || ""))
    ),
    works: [...item.works.values()].sort((left, right) =>
      right.recordIds.size - left.recordIds.size || left.label.localeCompare(right.label)
    ),
  })).sort((left, right) =>
    right.recordIds.size - left.recordIds.size ||
    right.mentionCount - left.mentionCount ||
    left.displayName.localeCompare(right.displayName)
  );

  return {
    authors,
    recordCount: totalRecordIds.size,
  };
}

function renderLineAuthorityCard(authority) {
  const workMarkup = authority.works.slice(0, 6).map((work) => `
    <button type="button" class="authority-inline-work ${work.bucket === "caveated" ? "is-caveated" : ""} ${state.authorityInlineOpenWorkKey === work.key ? "is-active" : ""}" data-line-authority-work-key="${escapeHtml(work.key)}" aria-expanded="${state.authorityInlineOpenWorkKey === work.key ? "true" : "false"}">
      <strong>${escapeHtml(work.label)}</strong>
      <small>${escapeHtml(String(work.recordIds.size))}</small>
    </button>
  `).join("");
  const surfaceMarkup = [...authority.surfaces].slice(0, 8).map((surface) =>
    `<span>${escapeHtml(surface)}</span>`
  ).join("");
  const recordMarkup = authority.records.slice(0, 3).map((record) => {
    const recordId = normalizeLineAuthorityRecordId(record);
    const isOpen = state.authorityInlineOpenRecordScope === "line" && state.authorityInlineOpenRecordId === recordId;
    const meta = [record.commentary_name, record.date_label || record.century_label]
      .filter(Boolean)
      .join(" · ");
    const preview = getLineAuthorityRecordPreview(record);
    return `
      <button type="button" class="authority-inline-record ${isOpen ? "is-open" : ""}" data-line-authority-record-id="${escapeHtml(recordId)}" aria-expanded="${isOpen ? "true" : "false"}">
        <strong>${escapeHtml(meta || "Commentary record")}</strong>
        ${preview ? `<span class="authority-inline-record-body">${renderLineAuthorityRecordBody(preview)}</span>` : ""}
        <span class="authority-inline-record-action">${isOpen ? "Close reader" : "Open in reader"}</span>
      </button>
    `;
  }).join("");
  const overflow = Math.max(0, authority.records.length - 3);
  const pageLink = authority.publicSlug
    ? `<a class="authority-inline-page-link" href="/autore/${escapeHtml(authority.publicSlug)}.html">Open authority room</a>`
    : "";

  return `
    <article class="authority-inline-card">
      <div class="authority-inline-card-head">
        <div>
          <h4>${escapeHtml(authority.displayName)}</h4>
          ${authority.canonicalName && authority.canonicalName !== authority.displayName
            ? `<p>${escapeHtml(authority.canonicalName)}</p>`
            : ""}
        </div>
        <div class="authority-inline-counts">
          <span>${escapeHtml(String(authority.recordIds.size))} records</span>
          <span>${escapeHtml(String(authority.mentionCount))} signals</span>
        </div>
      </div>
      ${workMarkup ? `<div class="authority-inline-work-row">${workMarkup}</div>` : ""}
      ${surfaceMarkup ? `<div class="authority-inline-surfaces">${surfaceMarkup}</div>` : ""}
      ${recordMarkup ? `<div class="authority-inline-records">${recordMarkup}</div>` : ""}
      <div class="authority-inline-card-foot">
        ${overflow ? `<span>${escapeHtml(String(overflow))} more commentary records</span>` : "<span>Local commentary evidence shown above</span>"}
        ${pageLink}
      </div>
    </article>
  `;
}

function renderLineAuthorityPanel(payload) {
  if (!elements.figurePanel || !payload) {
    return;
  }
  const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
  const lineLabel = formatShortCommediaLocation(
    state.currentSampleEntry?.cantica,
    state.currentSampleEntry?.canto,
    payload.line_number
  ) || `Line ${payload.line_number}`;
  const lineMarkup = renderAuthorityPlainLineMarkup(payload);

  if (sampleId && !state.sampleRecordWorkMentionCache.has(sampleId)) {
    elements.figurePanel.innerHTML = `
      <section class="line-authority-panel">
        ${renderAuthorityInlineScopeControls("line")}
        <div class="line-authority-current-line">
          <span class="line-title-location">${escapeHtml(lineLabel)}:</span>
          <span class="line-title-text line-locus-stream">${lineMarkup}</span>
        </div>
        <div class="empty-state">Loading authority signals for this line…</div>
      </section>
    `;
    bindAuthorityInlineScopeControls();
    bindLineAuthorityLocusButtons(payload);
    bindLineAuthorityRecordButtons(payload);
    ensureSampleRecordWorkMentionStoreLoaded(sampleId)
      .then(() => {
        if (state.selectedLine === payload.line_number) {
          renderFigurePanel();
        }
      })
      .catch(() => {
        if (state.selectedLine === payload.line_number) {
          renderFigurePanel();
        }
      });
    return;
  }

  const summary = collectLineAuthorityItems(payload);
  const cardMarkup = summary.authors.map(renderLineAuthorityCard).join("");
  elements.figurePanel.innerHTML = `
    <section class="line-authority-panel">
      ${renderAuthorityInlineScopeControls("line")}
      <div class="line-authority-current-line">
        <span class="line-title-location">${escapeHtml(lineLabel)}:</span>
        <span class="line-title-text line-locus-stream">${lineMarkup}</span>
      </div>
      <div class="line-authority-summary">
        <div>
          <span class="analysis-label">Authority signals</span>
          <h3>${escapeHtml(choose("Authorities touching this line", "这一行中的 authority"))}</h3>
        </div>
        <div class="line-authority-summary-copy">
          <p>${escapeHtml(choose(
            `${summary.authors.length} authorities appear across ${summary.recordCount} commentary records reaching this line.`,
            `这一行的 commentary records 中出现了 ${summary.authors.length} 个 authority，分布在 ${summary.recordCount} 条注释里。`
          ))}</p>
        </div>
      </div>
      ${renderActiveLineAuthorityReader(payload)}
      ${cardMarkup
        ? `<div class="line-authority-grid">${cardMarkup}</div>`
        : `<div class="empty-state">${escapeHtml(choose(
          "No mounted authority mentions have been detected in the commentary records for this line yet.",
          "这一行的注释里暂时没有检测到已挂载的 authority mention。"
        ))}</div>`}
    </section>
  `;
  bindAuthorityInlineScopeControls();
  bindLineAuthorityWorkButtons(payload);
  bindLineAuthorityRecordButtons(payload);
  bindAuthorityInlineReaderClose();
}

function bindLineAuthorityLocusButtons(payload) {
  elements.figurePanel?.querySelectorAll("[data-authority-line-locus-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const locus = getPayloadLoci(payload).find((item) => item.id === button.dataset.authorityLineLocusId);
      state.selectedLocus = locus || null;
      state.activeInterpretiveTerm = null;
      renderLineRecords(payload);
      renderFigurePanel();
      if (state.selectedLocus) {
        ensureResearchLayerLoaded();
      }
    });
  });
}

function bindLineAuthorityRecordButtons(payload) {
  elements.figurePanel?.querySelectorAll("[data-line-authority-record-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const recordId = button.dataset.lineAuthorityRecordId;
      const record = (payload?.records || []).find((item) => normalizeLineAuthorityRecordId(item) === recordId);
      if (!record) {
        return;
      }
      const action = button.querySelector(".authority-inline-record-action");
      if (state.authorityInlineOpenRecordId === recordId && state.authorityInlineOpenRecordScope === "line") {
        state.authorityInlineOpenRecordId = null;
        state.authorityInlineOpenRecordScope = null;
        state.authorityInlineOpenWorkKey = null;
        renderFigurePanel();
        return;
      }
      if (action) {
        action.textContent = "Opening…";
      }
      const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
      if (sampleId) {
        await ensureSampleFullTextStoreLoaded(sampleId).catch(() => null);
      }
      state.authorityInlineOpenRecordId = recordId;
      state.authorityInlineOpenRecordScope = "line";
      state.authorityInlineOpenWorkKey = null;
      renderFigurePanel();
      scrollAuthorityInlineReaderIntoView();
    });
  });
}

function bindLineAuthorityWorkButtons(payload) {
  elements.figurePanel?.querySelectorAll("[data-line-authority-work-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const workKey = button.dataset.lineAuthorityWorkKey;
      if (!workKey) {
        return;
      }
      if (state.authorityInlineOpenWorkKey === workKey) {
        state.authorityInlineOpenWorkKey = null;
        renderFigurePanel();
        return;
      }
      state.authorityInlineOpenWorkKey = workKey;
      state.authorityInlineOpenRecordId = null;
      state.authorityInlineOpenRecordScope = null;
      renderFigurePanel();
      scrollAuthorityInlineReaderIntoView();
    });
  });
}

function renderActiveLineAuthorityReader(payload) {
  if (state.authorityInlineOpenWorkKey) {
    const summary = collectLineAuthorityItems(payload);
    const authority = summary.authors.find((item) =>
      (item.works || []).some((work) => work.key === state.authorityInlineOpenWorkKey)
    );
    const work = authority?.works?.find((item) => item.key === state.authorityInlineOpenWorkKey);
    if (work) {
      return renderAuthorityInlineWorkReading(authority, work);
    }
  }
  if (state.authorityInlineOpenRecordScope !== "line" || !state.authorityInlineOpenRecordId) {
    return "";
  }
  const record = (payload?.records || []).find((item) => normalizeLineAuthorityRecordId(item) === state.authorityInlineOpenRecordId);
  if (!record) {
    return "";
  }
  const recordId = normalizeLineAuthorityRecordId(record);
  const fullText = getLineAuthorityFullTextRecord(recordId)?.record_text ||
    record.record_text ||
    record.record_text_preview ||
    record.record_summary ||
    "";
  return renderAuthorityInlineRecordReading(record, fullText);
}

function renderCantoAuthorityHeat(authority, indexPayload) {
  const lineStats = new Map((authority.lines || []).map((line) => [Number(line.line_number), line]));
  const lineCount = Math.max(1, Number(indexPayload?.line_count || state.overview?.line_count || 0));
  const maxSignal = Math.max(1, Number(indexPayload?.max_line_signal_count || 1));
  return Array.from({ length: lineCount }, (_, offset) => {
    const lineNumber = offset + 1;
    const line = lineStats.get(lineNumber);
    const signal = Number(line?.signal_count || 0);
    const opacity = signal ? Math.max(0.18, Math.min(1, signal / maxSignal)) : 0;
    const label = signal
      ? `${authority.display_name} · line ${lineNumber}: ${line.record_count} records, ${signal} signals`
      : `Line ${lineNumber}`;
    return `
      <button
        type="button"
        class="canto-authority-line-cell ${signal ? "has-signal" : ""}"
        data-canto-authority-line="${escapeHtml(String(lineNumber))}"
        style="--authority-heat-opacity: ${opacity.toFixed(3)}"
        aria-label="${escapeHtml(label)}"
        title="${escapeHtml(label)}">
        <span>${escapeHtml(String(lineNumber))}</span>
      </button>
    `;
  }).join("");
}

function renderCantoAuthorityRecord(record) {
  const isOpen = state.authorityInlineOpenRecordScope === "canto" && state.authorityInlineOpenRecordId === record.id;
  const meta = [record.commentary_name, record.date_label || record.century_label]
    .filter(Boolean)
    .join(" · ");
  return `
    <button type="button" class="authority-inline-record ${isOpen ? "is-open" : ""}" data-canto-authority-record-id="${escapeHtml(record.id)}" aria-expanded="${isOpen ? "true" : "false"}">
      <strong>${escapeHtml(meta || "Commentary record")}</strong>
      ${record.preview ? `<span class="authority-inline-record-body">${renderLineAuthorityRecordBody(record.preview)}</span>` : ""}
      <span class="authority-inline-record-action">${isOpen ? "Close reader" : "Open in reader"}</span>
    </button>
  `;
}

function renderCantoAuthorityLineIndex(indexPayload) {
  const lineMap = new Map();
  (indexPayload?.authors || []).forEach((authority) => {
    (authority.lines || []).forEach((line) => {
      const lineNumber = Number(line.line_number);
      if (!Number.isFinite(lineNumber)) {
        return;
      }
      if (!lineMap.has(lineNumber)) {
        lineMap.set(lineNumber, {
          lineNumber,
          signalCount: 0,
          recordCount: 0,
          authorities: [],
        });
      }
      const item = lineMap.get(lineNumber);
      item.signalCount += Number(line.signal_count || 0);
      item.recordCount += Number(line.record_count || 0);
      item.authorities.push({
        name: authority.display_name,
        signals: Number(line.signal_count || 0),
        records: Number(line.record_count || 0),
      });
    });
  });

  const rows = [...lineMap.values()]
    .sort((left, right) =>
      right.signalCount - left.signalCount ||
      right.recordCount - left.recordCount ||
      left.lineNumber - right.lineNumber
    )
    .slice(0, 12);

  if (!rows.length) {
    return "";
  }

  return `
    <div class="canto-authority-line-index">
      <div class="canto-authority-line-index-head">
        <span class="analysis-label">Line → authority paths</span>
        <p>Highest-signal lines in this canto and the authorities most often attached to them.</p>
      </div>
      <div class="canto-authority-line-index-list">
        ${rows.map((row) => {
          const authorities = row.authorities
            .sort((left, right) => right.signals - left.signals || left.name.localeCompare(right.name))
            .slice(0, 5);
          return `
            <button type="button" class="canto-authority-line-index-row" data-canto-authority-line="${escapeHtml(String(row.lineNumber))}">
              <strong>${escapeHtml(`Line ${row.lineNumber}`)}</strong>
              <span>${authorities.map((authority) => escapeHtml(authority.name)).join(" · ")}</span>
              <small>${escapeHtml(`${row.signalCount} signals`)}</small>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderCantoAuthorityCard(authority, indexPayload) {
  const workMarkup = (authority.works || []).slice(0, 5).map((work) => `
    <span class="authority-inline-work ${work.bucket === "caveated" ? "is-caveated" : ""}">
      <strong>${escapeHtml(work.label)}</strong>
      <small>${escapeHtml(String(work.record_count))}</small>
    </span>
  `).join("");
  const surfaceMarkup = (authority.surfaces || []).slice(0, 7).map((surface) =>
    `<span>${escapeHtml(surface.label)}</span>`
  ).join("");
  const records = (authority.records || []).slice(0, 2).map(renderCantoAuthorityRecord).join("");
  const overflow = Math.max(0, Number(authority.record_count || 0) - 2);
  const pageLink = authority.public_slug_it
    ? `<a class="authority-inline-page-link" href="/autore/${escapeHtml(authority.public_slug_it)}.html">Open authority room</a>`
    : "";
  return `
    <article class="canto-authority-card">
      <div class="authority-inline-card-head">
        <div>
          <h4>${escapeHtml(authority.display_name)}</h4>
          ${authority.canonical_name && authority.canonical_name !== authority.display_name
            ? `<p>${escapeHtml(authority.canonical_name)}</p>`
            : ""}
        </div>
        <div class="authority-inline-counts">
          <span>${escapeHtml(String(authority.record_count))} records</span>
          <span>${escapeHtml(String(authority.line_count))} lines</span>
          <span>${escapeHtml(String(authority.signal_count))} signals</span>
        </div>
      </div>
      ${workMarkup ? `<div class="authority-inline-work-row">${workMarkup}</div>` : ""}
      <div class="canto-authority-heat" style="--authority-line-count: ${escapeHtml(String(indexPayload.line_count || 1))}">
        ${renderCantoAuthorityHeat(authority, indexPayload)}
      </div>
      ${surfaceMarkup ? `<div class="authority-inline-surfaces">${surfaceMarkup}</div>` : ""}
      ${records ? `<div class="authority-inline-records">${records}</div>` : ""}
      <div class="authority-inline-card-foot">
        ${overflow ? `<span>${escapeHtml(String(overflow))} more commentary records</span>` : "<span>Local commentary evidence shown above</span>"}
        ${pageLink}
      </div>
    </article>
  `;
}

function renderCantoAuthorityPanel() {
  if (!elements.figurePanel) {
    return;
  }
  const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
  const indexPayload = sampleId ? state.sampleAuthorityCantoIndexCache.get(sampleId) : null;

  if (sampleId && !state.sampleAuthorityCantoIndexCache.has(sampleId)) {
    elements.figurePanel.innerHTML = `
      <section class="line-authority-panel canto-authority-panel">
        ${renderAuthorityInlineScopeControls("canto")}
        <div class="empty-state">Loading canto authority map…</div>
      </section>
    `;
    bindAuthorityInlineScopeControls();
    ensureSampleAuthorityCantoIndexLoaded(sampleId)
      .then(() => {
        if (state.currentSampleEntry?.id === sampleId && state.authorityInlineScope === "canto") {
          renderFigurePanel();
        }
      })
      .catch(() => {
        if (state.currentSampleEntry?.id === sampleId && state.authorityInlineScope === "canto") {
          renderFigurePanel();
        }
      });
    return;
  }

  if (!indexPayload) {
    elements.figurePanel.innerHTML = `
      <section class="line-authority-panel canto-authority-panel">
        ${renderAuthorityInlineScopeControls("canto")}
        <div class="empty-state">No cached canto authority map is available for this canto yet.</div>
      </section>
    `;
    bindAuthorityInlineScopeControls();
    return;
  }

  const cantoLabel = [indexPayload.cantica, indexPayload.canto].filter(Boolean).join(" ");
  const cardMarkup = (indexPayload.authors || []).map((authority) =>
    renderCantoAuthorityCard(authority, indexPayload)
  ).join("");
  elements.figurePanel.innerHTML = `
    <section class="line-authority-panel canto-authority-panel">
      ${renderAuthorityInlineScopeControls("canto")}
      <div class="line-authority-summary canto-authority-summary">
        <div>
          <span class="analysis-label">Canto authority map</span>
          <h3>${escapeHtml(`${cantoLabel} · Authority Map`)}</h3>
        </div>
        <div class="line-authority-summary-copy">
          <p>${escapeHtml(choose(
            `${indexPayload.authority_count} authorities, ${indexPayload.authority_record_count} commentary records, and ${indexPayload.record_count} total records are indexed for this canto.`,
            `这个 canto 的缓存里有 ${indexPayload.authority_count} 个 authority、${indexPayload.authority_record_count} 条带 authority 的 commentary records；总 records 为 ${indexPayload.record_count}。`
          ))}</p>
        </div>
      </div>
      ${renderCantoAuthorityLineIndex(indexPayload)}
      ${renderActiveCantoAuthorityReader(indexPayload)}
      <div class="canto-authority-grid">${cardMarkup}</div>
    </section>
  `;
  bindAuthorityInlineScopeControls();
  bindCantoAuthorityLineButtons();
  bindCantoAuthorityRecordButtons(indexPayload);
  bindAuthorityInlineReaderClose();
}

function findCantoAuthorityRecord(indexPayload, recordId) {
  for (const authority of indexPayload?.authors || []) {
    const record = (authority.records || []).find((item) => item.id === recordId);
    if (record) {
      return record;
    }
  }
  return null;
}

function bindAuthorityInlineScopeControls() {
  elements.figurePanel?.querySelectorAll("[data-authority-inline-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      const requestedScope = button.dataset.authorityInlineScope;
      const scope = requestedScope === "canto" || requestedScope === "full" ? requestedScope : "line";
      if (scope === "line" && !(state.selectedLine != null && state.lineCache.has(state.selectedLine))) {
        return;
      }
      state.authorityInlineReturnScope = scope === "full"
        ? (state.authorityInlineScope === "canto" ? "canto" : "line")
        : null;
      state.authorityInlineScope = scope;
      state.authorityInlineOpenRecordId = null;
      state.authorityInlineOpenRecordScope = null;
      state.authorityInlineOpenWorkKey = null;
      renderFigurePanel();
    });
  });
  elements.figurePanel?.querySelectorAll("[data-authority-inline-back]").forEach((button) => {
    button.addEventListener("click", () => {
      const fallbackScope = state.selectedLine != null && state.lineCache.has(state.selectedLine) ? "line" : "canto";
      const returnScope = state.authorityInlineReturnScope || fallbackScope;
      state.authorityInlineScope = returnScope === "line" && !(state.selectedLine != null && state.lineCache.has(state.selectedLine))
        ? "canto"
        : returnScope;
      state.authorityInlineReturnScope = null;
      renderFigurePanel();
    });
  });
}

function bindCantoAuthorityLineButtons() {
  elements.figurePanel?.querySelectorAll("[data-canto-authority-line]").forEach((button) => {
    button.addEventListener("click", async () => {
      const lineNumber = Number(button.dataset.cantoAuthorityLine);
      if (!Number.isFinite(lineNumber)) {
        return;
      }
      state.authorityInlineScope = "line";
      await selectLine(lineNumber);
    });
  });
}

function bindCantoAuthorityRecordButtons(indexPayload) {
  elements.figurePanel?.querySelectorAll("[data-canto-authority-record-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const recordId = button.dataset.cantoAuthorityRecordId;
      const record = findCantoAuthorityRecord(indexPayload, recordId);
      if (!record) {
        return;
      }
      const action = button.querySelector(".authority-inline-record-action");
      if (state.authorityInlineOpenRecordId === recordId && state.authorityInlineOpenRecordScope === "canto") {
        state.authorityInlineOpenRecordId = null;
        state.authorityInlineOpenRecordScope = null;
        renderFigurePanel();
        return;
      }
      if (action) {
        action.textContent = "Opening…";
      }
      const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
      if (sampleId) {
        await ensureSampleFullTextStoreLoaded(sampleId).catch(() => null);
      }
      state.authorityInlineOpenRecordId = recordId;
      state.authorityInlineOpenRecordScope = "canto";
      renderFigurePanel();
      scrollAuthorityInlineReaderIntoView();
    });
  });
}

function renderActiveCantoAuthorityReader(indexPayload) {
  if (state.authorityInlineOpenRecordScope !== "canto" || !state.authorityInlineOpenRecordId) {
    return "";
  }
  const record = findCantoAuthorityRecord(indexPayload, state.authorityInlineOpenRecordId);
  if (!record) {
    return "";
  }
  const fullText = getLineAuthorityFullTextRecord(state.authorityInlineOpenRecordId)?.record_text || record.preview || "";
  return renderAuthorityInlineRecordReading(record, fullText);
}

function bindAuthorityInlineReaderClose() {
  elements.figurePanel?.querySelector("[data-authority-inline-close]")?.addEventListener("click", () => {
    state.authorityInlineOpenRecordId = null;
    state.authorityInlineOpenRecordScope = null;
    state.authorityInlineOpenWorkKey = null;
    renderFigurePanel();
  });
}

function scrollAuthorityInlineReaderIntoView() {
  requestAnimationFrame(() => {
    elements.figurePanel?.querySelector(".authority-inline-open-reader")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function renderFigurePanel() {
  if (state.authorityInlineScope === "full") {
    return renderLegacyAuthorityInlinePanel();
  }
  if (state.authorityInlineScope !== "canto" && state.selectedLine != null && state.lineCache.has(state.selectedLine)) {
    return renderLineAuthorityPanel(state.lineCache.get(state.selectedLine));
  }
  state.authorityInlineScope = "canto";
  return renderCantoAuthorityPanel();
}

function renderLegacyAuthorityInlinePanel() {
  if (!elements.figurePanel) {
    return;
  }
  const loadingMarkup = `
    <section class="line-authority-panel authority-legacy-inline-panel">
      <div class="authority-legacy-return-row">
        <button type="button" class="authority-inline-scope-chip authority-inline-back-chip" data-authority-inline-back>← Back</button>
        ${renderAuthorityInlineScopeControls("full")}
      </div>
      <div class="empty-state">${escapeHtml(choose("Loading the original Authority panel…", "正在载入原来的 Authority 面板。"))}</div>
    </section>
  `;
  const requiredLoads = [
    state.authorityPersonaggioScan ? null : ensureAuthorityPersonaggioScanLoaded(),
    state.authorityPersonaggioAliasAtlas ? null : ensureAuthorityPersonaggioAliasAtlasLoaded(),
    state.authorityPersonaggioPoemAliasScan ? null : ensureAuthorityPersonaggioPoemAliasScanLoaded(),
    state.authorityLayer ? null : ensureAuthorityLayerLoaded(),
    state.authorityCuratedRoomAnchors ? null : ensureAuthorityCuratedRoomAnchorsLoaded(),
  ].filter(Boolean);

  if (requiredLoads.length) {
    elements.figurePanel.innerHTML = loadingMarkup;
    bindAuthorityInlineScopeControls();
    Promise.allSettled(requiredLoads).then(() => {
      if (state.authorityInlineScope === "full") {
        renderFigurePanel();
      }
    });
    return;
  }

  authorityPanel.renderFigurePanel();
  if (elements.figurePanel) {
    const controls = document.createElement("div");
    controls.innerHTML = `
      <div class="authority-legacy-return-row">
        <button type="button" class="authority-inline-scope-chip authority-inline-back-chip" data-authority-inline-back>← Back</button>
        ${renderAuthorityInlineScopeControls("full")}
      </div>
    `;
    const row = controls.firstElementChild;
    if (row) {
      row.classList.add("authority-legacy-scope-row");
      elements.figurePanel.prepend(row);
      bindAuthorityInlineScopeControls();
    }
  }
}

semanticPanel = window.DDPSemanticPanel.createSemanticPanel({
  state,
  elements,
  escapeHtml,
  renderHelpButton,
  selectLine: (...args) => {
    rememberViewportState();
    return selectLine(...args);
  },
  scrollToCoverageLine: (...args) => scrollToCoverageLine(...args),
  scrollToCommentarySection,
  formatShortCommediaLocation,
  renderLineRecords: (...args) => recordsPanel.renderLineRecords(...args),
});

wordLevelPanel = window.DDPWordLevelPanel.createWordLevelPanel({
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
  jumpToSampleLine: (...args) => {
    rememberViewportState();
    return jumpToSampleLine(...args);
  },
  scrollToRecordsSection,
  scrollToCommentarySection,
  renderLineRecords: (...args) => recordsPanel.renderLineRecords(...args),
});

lineLevelPanel = window.DDPLineLevelPanel.createLineLevelPanel({
  state,
  elements,
  escapeHtml,
  renderHelpButton,
  buildRecurrenceCandidates,
  buildLineEchoSourceTerms,
  buildLineEchoSourceFields,
  formatShortCommediaLocation,
  jumpToSampleLine: (...args) => {
    rememberViewportState();
    return jumpToSampleLine(...args);
  },
});

recordsPanel = window.DDPRecordsPanel.createRecordsPanel({
  state,
  elements,
  documentRef: document,
  escapeHtml,
  fetchJson,
  getPayloadLoci,
  isLocusSelectableInWorkbench,
  renderSelectableLineMarkup,
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
  jumpToSampleLine: (...args) => {
    rememberViewportState();
    return jumpToSampleLine(...args);
  },
  formatShortCommediaLocation,
  tokenizeCompareText: tokenizeSemanticText,
  ensureSampleRecordSummaryStoreLoaded,
  getSelectedWordProfileBundle,
  getLocalizedInterpretiveTerms,
  buildContrastiveInterpretiveTerms,
  getRelatedFieldsForLocus,
  ensureAuthorityLayerLoaded,
  ensureAuthorityHighlightLexiconLoaded,
  normalizeAuthorityCommentaryName,
  openAuthorityAuthorFromCompare,
  parseNavigationQuery,
  renderLocusPanel: (...args) => wordLevelPanel.renderLocusPanel(...args),
  renderVocabularyPanel: (...args) => wordLevelPanel.renderVocabularyPanel(...args),
  renderSemanticPanel: (...args) => semanticPanel.renderSemanticPanel(...args),
  renderRecurrencePanel: (...args) => lineLevelPanel.renderRecurrencePanel(...args),
});

function renderAuthorityLensMarkup() {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const featuredAuthors = getAuthorityAuthors();
  const allAuthors = getAllAuthorityAuthors();
  if (!allAuthors.length) {
    return `<div class="empty-state">${escapeHtml(chooseText("No frontend-ready authority data is currently available.", "当前还没有可接入的 authority frontend-ready 数据。"))}</div>`;
  }

  const selectedAuthor = allAuthors.find((author) => author.author_id === state.activeAuthority) || featuredAuthors[0] || allAuthors[0];
  if ((!state.activeAuthority || !allAuthors.some((author) => author.author_id === state.activeAuthority)) && selectedAuthor) {
    state.activeAuthority = selectedAuthor.author_id;
  }
  if (!state.authorityCuratedRoomAnchors && !state.authorityCuratedRoomAnchorsPromise) {
    ensureAuthorityCuratedRoomAnchorsLoaded()
      .then(() => renderFigurePanel())
      .catch(() => renderFigurePanel());
  }
  if (selectedAuthor?.detail_path && !getLoadedAuthorityAuthorDetail(selectedAuthor)) {
    ensureAuthorityAuthorDetailLoaded(selectedAuthor)
      .then(() => renderFigurePanel())
      .catch(() => renderFigurePanel());
  }

  const activeView = state.activeAuthorityView || "text";

  const scripturalAuthorIds = new Set([
    "moses",
    "samuel",
    "psalmist",
    "salomone",
    "isaiah",
    "jeremiah",
    "ezekiel",
    "daniel",
    "zechariah",
    "joshua",
    "sirach",
    "baruch",
    "hosea",
    "job",
    "tobit",
    "judith",
    "jonah",
    "micah",
    "habakkuk",
    "zephaniah",
    "amos",
    "joel",
    "malachi",
    "matthew",
    "mark",
    "luke",
    "john_the_evangelist",
    "paul_the_apostle",
    "san_pietro",
  ]);
  const renderAuthorityChip = (author) => `
        <button type="button" class="figure-chip ${author.author_id === selectedAuthor?.author_id ? "is-active" : ""}" data-authority-id="${author.author_id}">
          ${escapeHtml(getAuthorityDisplayName(author))}
        </button>
      `;
  const primaryAuthors = featuredAuthors.filter((author) => !scripturalAuthorIds.has(author.author_id));
  const scripturalAuthors = featuredAuthors.filter((author) => scripturalAuthorIds.has(author.author_id));
  const distribution = {
    worksTree: allAuthors.filter((author) => author?.works_layer_mode === "works_tree").length,
    flatOverview: allAuthors.filter((author) => author?.works_layer_mode === "flat_work_overview").length,
    specialCase: allAuthors.filter((author) => String(author?.reading_contract_meta?.entry_contract_type || "") === "special_case_entry").length,
    commentarySensitive: allAuthors.filter((author) => {
      const entryMode = String(author?.entry_mode || "");
      return entryMode === "author_commentary_special_case"
        || entryMode === "author_commentary_special_case_candidate"
        || entryMode === "author_commentary_entry";
    }).length,
  };
  const buttons = primaryAuthors.map((author) => renderAuthorityChip(author)).join("");
  const scripturalShelf = scripturalAuthors.length
    ? `
      <details class="authority-secondary-shelf" ${scripturalAuthorIds.has(selectedAuthor?.author_id) ? "open" : ""}>
        <summary>${escapeHtml(chooseText(`Biblical Authors (${scripturalAuthors.length})`, `圣经作者（${scripturalAuthors.length}）`))}</summary>
        <p class="semantic-intro">${escapeHtml(chooseText("Open this shelf for scriptural authors and biblical book-owners. The main row stays focused on the non-scriptural authority core.", "这里集中收纳圣经作者与 scriptural book-owners；主排保留给非圣经的 authority 核心。"))}</p>
        <div class="figure-chip-row">${scripturalAuthors.map((author) => renderAuthorityChip(author)).join("")}</div>
      </details>
    `
    : "";

  const statusLabel = renderAuthorityStatusLabel(selectedAuthor?.frontend_status);
  const workLayerLabel = getAuthorityWorkLayerLabel(selectedAuthor);
  const autorePageHref = getAuthorityAutorePageHref(selectedAuthor);
  const personaggioPageHref = getAuthorityPersonaggioPageHref(selectedAuthor);
  const roleBreakdown = selectedAuthor?.mention_role_breakdown
    ? Object.entries(selectedAuthor.mention_role_breakdown)
        .map(([key, value]) => `<span class="pill">${escapeHtml(key)}: ${value}</span>`)
        .join("")
    : "";

  const viewButtons = [
    { id: "text", label: chooseText("Text Layer", "正文层") },
    { id: "commentary", label: chooseText("Commentary Layer", "注释层") },
    { id: "drilldown", label: chooseText("Work Layer", "Work Layer") },
  ]
    .map(
      (view) => `
        <button type="button" class="lens-tab ${activeView === view.id ? "is-active" : ""}" data-authority-view="${view.id}">
          ${escapeHtml(view.label)}
        </button>
      `
    )
    .join("");

  const authorityIntro = chooseText(
    "This layer now mounts author-side works trees across the live universe, but entry contracts still differ: some rooms remain explicitly special-case or commentary-sensitive. Read the contract pill and the work-layer pill together before assuming every author should be read in the same way.",
    "这一层现在已经在整个 live universe 里挂出了 author-side works tree，但入口契约仍然不完全相同：有些房间依然保留 special-case 或 commentary-sensitive 的进入方式。进入前先一起看状态 pill 和 work-layer pill，不要把所有 author 都当成同一种入口。"
  );
  const maturityClarifier = chooseText(
    `In the current live universe, Ready means admitted into the authority layer, not identical staging. The active mix is ${distribution.worksTree} author-side works trees, ${distribution.specialCase} special-case entry contracts, and ${distribution.commentarySensitive} commentary-sensitive entries that still require scoped reading discipline.`,
    `在当前 live universe 里，Ready 表示已经进入 authority layer，不表示 staging 完全相同。当前盘面是 ${distribution.worksTree} 个 author-side works tree、${distribution.specialCase} 个 special-case 入口契约，以及 ${distribution.commentarySensitive} 个仍需保留 scoped reading discipline 的 commentary-sensitive 入口。`
  );

  return `
    <div class="title-with-help section-title-with-help">
      <h3>Authority Lens</h3>
      ${renderHelpButton("authority-lens", "Authority Lens 说明")}
    </div>
    <p class="semantic-intro">${escapeHtml(authorityIntro)}</p>
    <p class="semantic-intro">${escapeHtml(maturityClarifier)}</p>
    <div class="figure-chip-row">${buttons}</div>
    ${scripturalShelf}
    <div class="figure-summary">
      <div class="quick-jump-card-head" style="margin-bottom: 10px;">
        <strong>${escapeHtml(getAuthorityDisplayName(selectedAuthor))}</strong>
        ${autorePageHref ? `<a class="ghost-link-button" href="${escapeHtml(autorePageHref)}" target="_blank" rel="noreferrer">${escapeHtml(chooseText("→ Autore page", "→ Pagina autore"))}</a>` : ""}
        ${personaggioPageHref ? `<a class="ghost-link-button" href="${escapeHtml(personaggioPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(chooseText("→ Personaggio page", "→ Pagina personaggio"))}</a>` : ""}
      </div>
      <div class="locus-meta-row">
        <span class="pill coverage-pill">${escapeHtml(statusLabel)}</span>
        <span class="pill">${escapeHtml(workLayerLabel)}</span>
        <span class="pill">${selectedAuthor?.total_mentions || 0} mentions</span>
        <span class="pill">${selectedAuthor?.total_work_mentions || 0} work mentions</span>
        <span class="pill">${selectedAuthor?.text_occurrence_total || 0} direct text hits</span>
      </div>
      ${renderAuthorityReadingContractBanner(selectedAuthor)}
      ${getAuthorityFrontendIntro(selectedAuthor) ? `<p class="semantic-intro">${escapeHtml(getAuthorityFrontendIntro(selectedAuthor))}</p>` : ""}
      ${roleBreakdown ? `<div class="locus-meta-row">${roleBreakdown}</div>` : ""}
      <div class="authority-path-note">
        <strong>${escapeHtml(chooseText("Reading order", "Reading order / 阅读顺序"))}</strong>
        <span>${escapeHtml(chooseText("Step A: Text Layer", "Step A：正文层 / Text Layer"))}</span>
        <span>${escapeHtml(chooseText("Step B: Commentary Layer", "Step B：注释层 / Commentary Layer"))}</span>
        <span>${escapeHtml(chooseText("Step C: Work Layer / occurrences", "Step C：Work Layer / occurrences"))}</span>
      </div>
      <div class="lens-tab-row authority-view-row">${viewButtons}</div>
      <div class="authority-stage-shell">${renderAuthorityStageMarkup(selectedAuthor, activeView)}</div>
    </div>
  `;
}

const AUTHORITY_DISPLAY_NAME_OVERRIDES = {
  aristotle: "Aristotele",
  paul_the_apostle: "Paolo Apostolo",
  psalmist: "Salmista",
  augustine: "Agostino",
  boethius: "Boezio",
  cicero: "Cicerone",
  ovid: "Ovidio",
  virgil: "Virgilio",
  statius: "Stazio",
  hugo_of_st_victor: "Ugo di San Vittore",
  plinius: "Plinio",
  orosius: "Orosio",
  gratianus: "Graziano",
  seneca: "Seneca",
  averroe: "Averroè",
  avicenna: "Avicenna",
  albumasar: "Albumasar",
  alfragano: "Alfragano",
  beda: "Beda",
  papia: "Papia",
  salustio: "Salustio",
  svetonio: "Svetonio",
  tolomeo: "Tolomeo",
};

const AUTHORITY_WORK_DISPLAY_OVERRIDES = {
  "aristotle::Nicomachean Ethics": "Etica Nicomachea",
  "aristotle::Metaphysics": "Metafisica",
  "aristotle::Physics": "Fisica",
  "aristotle::Poetics": "Poetica",
  "augustine::City of God": "De civitate Dei",
  "augustine::Confessions": "Confessiones",
  "boethius::Consolation of Philosophy": "De consolatione Philosophiae",
  "cicero::Tusculan Disputations": "Tusculanae Disputationes",
  "paul_the_apostle::Epistle to the Romans": "Lettera ai Romani",
  "paul_the_apostle::First Corinthians": "Prima lettera ai Corinzi",
  "psalmist::Psalms": "Salmi",
  "statius::Thebaid": "Thebais",
  "statius::Achilleid": "Achilleis",
  "virgil::Aeneid": "Aeneis",
  "virgil::Georgics": "Georgica",
  "virgil::Eclogues": "Eclogae",
};

const AUTHORITY_PERSONAGGIO_AUTHOR_IDS = new Set([
  "paul_the_apostle",
  "virgil",
  "statius",
  "tommaso_daquino",
  "san_pietro",
  "salomone",
  "aristotle",
  "omero",
  "orazio",
  "ovid",
  "lucano",
  "platone",
  "seneca",
  "averroe",
  "avicenna",
  "tolomeo",
]);

function slugifyAuthorityStaticSegment(value) {
  return (String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['.]/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")) || "autore";
}

function getAuthorityDisplayName(authorOrName) {
  if (!authorOrName) {
    return "";
  }
  if (typeof authorOrName === "string") {
    return authorOrName;
  }
  const authorId = String(authorOrName.author_id || "").trim();
  if (authorId && AUTHORITY_DISPLAY_NAME_OVERRIDES[authorId]) {
    return AUTHORITY_DISPLAY_NAME_OVERRIDES[authorId];
  }
  return String(authorOrName.display_name || authorOrName.canonical_name || authorId || "").trim();
}

function getAuthorityAutorePageHref(author) {
  if (!author) {
    return "";
  }
  const slug = String(author.public_slug_it || "").trim() || slugifyAuthorityStaticSegment(getAuthorityDisplayName(author));
  return `/autore/${slug}.html`;
}

function getAuthorityPersonaggioPageHref(author) {
  const authorId = String(author?.author_id || "").trim();
  if (!authorId || !AUTHORITY_PERSONAGGIO_AUTHOR_IDS.has(authorId)) {
    return "";
  }
  const slug = String(author.public_slug_it || "").trim() || slugifyAuthorityStaticSegment(getAuthorityDisplayName(author));
  return `/personaggio/${slug}.html`;
}

function getAuthorityWorkDisplayName(author, workOrName) {
  const workName = typeof workOrName === "string" ? workOrName : workOrName?.canonical_work;
  if (!workName) {
    return "";
  }
  const authorId = String(author?.author_id || "").trim();
  return AUTHORITY_WORK_DISPLAY_OVERRIDES[`${authorId}::${workName}`] || workName;
}

function isDanteConvivioWork(author, workOrName) {
  const authorId = String(author?.author_id || "").trim();
  const workName = typeof workOrName === "string" ? workOrName : workOrName?.canonical_work;
  return authorId === "dante" && workName === "Convivio";
}

function getAuthorityProseLocatorLabel(author, workOrName) {
  if (isDanteConvivioWork(author, workOrName)) {
    return "Trattati / Capitoli";
  }
  return "Prose locator";
}

function getAuthorityProseLocatorCountLabel(author, workOrName) {
  if (isDanteConvivioWork(author, workOrName)) {
    return "trattati/capitoli";
  }
  return "prose";
}

function getAuthorityWorkBucketSummary(author, work) {
  const counts = work?.locator_bucket_counts || {};
  const locatorCount = Number(counts.structured_passage || 0) + Number(counts.prose_locator || 0);
  const workLevelCount = Number(counts.work_only || 0);
  const reviewCount = Number(counts.pseudo_passage || 0);
  const locatorLabel = isDanteConvivioWork(author, work) ? "locator/trattati" : "locator";
  const parts = [];
  if (locatorCount) {
    parts.push(`${locatorLabel} ${locatorCount}`);
  }
  if (workLevelCount) {
    parts.push(`work-level ${workLevelCount}`);
  }
  if (reviewCount) {
    parts.push(`review ${reviewCount}`);
  }
  return parts.join(" · ") || "no local occurrences yet";
}

function getAuthorityWorkPageHref(author, workOrName) {
  const workName = typeof workOrName === "string" ? workOrName : workOrName?.canonical_work;
  if (!author || !workName) {
    return "";
  }
  const authorSlug = String(author.public_slug_it || "").trim() || slugifyAuthorityStaticSegment(getAuthorityDisplayName(author));
  return `/autore/${authorSlug}/${slugifyAuthorityStaticSegment(getAuthorityWorkDisplayName(author, workName))}.html`;
}

function getAuthorityCuratedAuthorAnchors(author) {
  const authorId = String(author?.author_id || "").trim();
  const payload = state.authorityCuratedRoomAnchors?.author_work_anchors || {};
  return (authorId && payload[authorId]) || null;
}

function getAuthorityCuratedWorkAnchors(author, workOrName) {
  const authorSlug = String(author?.public_slug_it || "").trim() || slugifyAuthorityStaticSegment(getAuthorityDisplayName(author));
  const workName = typeof workOrName === "string" ? workOrName : workOrName?.canonical_work;
  const workSlug = slugifyAuthorityStaticSegment(getAuthorityWorkDisplayName(author, workName));
  const payload = state.authorityCuratedRoomAnchors?.work_branch_anchors || {};
  return payload[`${authorSlug}/${workSlug}`] || null;
}

function renderAuthorityCuratedAnchorCards(anchorSet) {
  if (!anchorSet) {
    return "";
  }
  const bilingual = state.uiLanguage !== "en";
  const lead = bilingual ? anchorSet.lead_bi : anchorSet.lead_en;
  const items = bilingual ? anchorSet.items_bi : anchorSet.items_en;
  const itemCards = (items || []).slice(0, 6).map((item) => `
    <div class="authority-work-card authority-work-card-static">
      <strong>${escapeHtml(item.label || "")}</strong>
      <small>${escapeHtml(item.note || "")}</small>
    </div>
  `).join("");
  return `
    <div class="authority-curated-fallback">
      ${lead ? `<p class="semantic-intro">${escapeHtml(lead)}</p>` : ""}
      <div class="occurrence-list authority-curated-anchor-list">${itemCards}</div>
    </div>
  `;
}

function containsAuthorityCjk(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

function getAuthorityFrontendIntro(author) {
  const rawNote = String(author?.frontend_notes || "").trim();
  if (!rawNote) {
    return "";
  }
  if (state.uiLanguage !== "en") {
    return rawNote;
  }
  const name = getAuthorityDisplayName(author);
  const mentionCount = Number(author?.total_mentions || 0);
  const workMentionCount = Number(author?.total_work_mentions || 0);
  const textHitCount = Number(author?.text_occurrence_total || 0);
  const workMode = String(author?.works_layer_mode || "");
  if (!mentionCount && !workMentionCount && !textHitCount) {
    return `${name} is mounted as a completed authority room, but the local sample does not currently expose commentary occurrences, work mentions, or direct poem-layer hits. Use the curated anchors and static rooms below as the current reading path.`;
  }
  if (workMode === "no_work_layer") {
    return `${name} is mounted as a completed authority room. The present reading path stays commentary-first: start from local text hits when they exist, then commentary traffic, and only then move into curated work anchors.`;
  }
  if (workMode === "special_case_object") {
    return `${name} is mounted as a completed authority room. This object still reads best through a controlled special-case path rather than through a generic work tree.`;
  }
  return `${name} is mounted as a completed authority room. Start from the local text layer when available, then move through commentary occurrences and the current work layer.`;
}

function getAuthorityTextLayerIntro(author) {
  const rawNote = String(author?.text_layer_note || "").trim();
  if (!rawNote) {
    return "";
  }
  if (state.uiLanguage !== "en") {
    return rawNote;
  }
  const name = getAuthorityDisplayName(author);
  const textHitCount = Number(author?.text_occurrence_total || 0);
  if (textHitCount > 0) {
    return `${name} currently exposes ${textHitCount} direct poem-layer hit${textHitCount === 1 ? "" : "s"} in the mounted sample. Start from those lines before moving back into commentary and curated work anchors.`;
  }
  return `No stable direct poem-layer alias hit is currently mounted for ${name}; this room currently opens more honestly through commentary traffic and curated work anchors.`;
}

function getAuthorityWorkLayerIntro(author) {
  const rawNote = String(author?.works_layer_note || "").trim();
  if (!rawNote) {
    return "";
  }
  if (state.uiLanguage !== "en") {
    return rawNote;
  }
  const name = getAuthorityDisplayName(author);
  const workMode = String(author?.works_layer_mode || "");
  const workCount = Array.isArray(author?.work_cards)
    ? author.work_cards.length
    : Array.isArray(author?.works)
      ? author.works.length
      : 0;
  const occurrenceSampleCount = Array.isArray(author?.work_occurrence_samples)
    ? author.work_occurrence_samples.length
    : Array.isArray(author?.occurrences)
      ? author.occurrences.length
      : 0;
  if (workMode === "no_work_layer" && !workCount && !occurrenceSampleCount) {
    return `${name} currently opens through a curated work layer: no mounted local work bundle is exposed here yet, so use the named anchors and static rooms below as the present reading path.`;
  }
  if (workMode === "no_work_layer") {
    return `${name} still opens through a curated work layer: keep the room readable through the current anchors and sampled commentary occurrences, without pretending that a full local work tree is already mounted.`;
  }
  if (workMode === "flat_work_overview") {
    return `${name} currently opens through a lighter mounted work room: keep the main works visible and readable, but do not overstate the room as a deeper locator tree than the local payload can honestly support.`;
  }
  if (
    workMode === "works_tree"
    && (
      String(author?.entry_mode || "") === "author_commentary_special_case"
      || String(author?.entry_mode || "") === "author_commentary_special_case_candidate"
    )
  ) {
    return `${name} now exposes a mounted author-side works tree, but the commentary contract still keeps role pressure and special-case staging explicit where needed.`;
  }
  if (workMode === "special_case_object") {
    return `${name} currently opens through a controlled special-case work path rather than a generic work tree.`;
  }
  if (workMode === "works_tree") {
    return `${name} currently opens through the mounted works tree that belongs to this room. Work nodes and sampled commentary occurrences are live here without promising a deeper locator backbone than the local payload actually supports.`;
  }
  return `${name} currently exposes the mounted work layer that belongs to this room.`;
}

function getAuthorityWorkAttributionNote(work) {
  if (!work) {
    return "";
  }
  const status = String(work.attribution_status || "").trim();
  const note = String(work.attribution_note_en || "").trim();
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (note) {
    return note;
  }
  if (status === "secure") {
    return chooseText(
      "This author/work pairing is treated here as secure.",
      "这里把这条作者/作品归属当作稳定成立。"
    );
  }
  if (["traditional", "traditional_heading", "composite_traditional"].includes(status)) {
    return chooseText(
      "This room keeps the traditional attribution used by commentary practice, without claiming a fully settled modern historical authorship.",
      "这里保留注释传统里的归属路径，但不把它说成现代学术上已经完全坐实的单一历史作者。"
    );
  }
  if (["pseudonymous_traditional", "disputed_traditional"].includes(status)) {
    return chooseText(
      "This room stays navigable under traditional commentary attribution, but the work should not be read here as a simple secure historical author/work pairing.",
      "这里保留传统注释中的归属导航，但不应把它简单读成已经坐实的历史作者/作品配对。"
    );
  }
  return "";
}

function getAuthorityBranchPageHref(author, work, nodeSelection) {
  if (!author || !work || !nodeSelection?.staticPageLabel) {
    return "";
  }
  const authorSlug = String(author.public_slug_it || "").trim() || slugifyAuthorityStaticSegment(getAuthorityDisplayName(author));
  return `/autore/${authorSlug}/${slugifyAuthorityStaticSegment(getAuthorityWorkDisplayName(author, work))}/${slugifyAuthorityStaticSegment(nodeSelection.staticPageLabel)}.html`;
}

function getAuthorityReadingContractMeta(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const meta = author?.reading_contract_meta;
  if (meta && meta.available) {
    return {
      ...meta,
      entry_contract_headline: chooseText(
        meta.entry_contract_headline_en || meta.entry_contract_headline || "",
        meta.entry_contract_headline_zh || meta.entry_contract_headline || ""
      ),
      maturity_band: chooseText(
        meta.maturity_band_en || meta.maturity_band || "",
        meta.maturity_band_zh || meta.maturity_band || ""
      ),
      pressure_band: chooseText(
        meta.pressure_band_en || meta.pressure_band || "",
        meta.pressure_band_zh || meta.pressure_band || ""
      ),
      frontline_status: chooseText(
        meta.frontline_status_en || meta.frontline_status || "",
        meta.frontline_status_zh || meta.frontline_status || ""
      ),
      drilldown_status: chooseText(
        meta.drilldown_status_en || meta.drilldown_status || "",
        meta.drilldown_status_zh || meta.drilldown_status || ""
      ),
    };
  }
  if (author?.special_case || author?.special_case_object?.available) {
    const focusWorkCount = Array.isArray(author?.work_branch_bundle?.focus_works)
      ? author.work_branch_bundle.focus_works.length
      : 0;
    return {
      available: true,
      entry_contract_type: "special_case_entry",
      entry_contract_headline: "Open this author through special-case backbones and scoped commentary zones, not through a fake ordinary works tree.",
      focus_work_count: focusWorkCount,
    };
  }
  const worksLayerMode = String(author?.works_layer_mode || "").trim();
  if (worksLayerMode === "works_tree") {
    return {
      available: true,
      entry_contract_type: "works_tree_entry",
      entry_contract_headline: chooseText(
        "Open this author through local work rooms and branch cards. This is one of the mounted authority objects with a real works tree.",
        "这个 author 应该从本地 work room 和 branch cards 进入；它属于已经挂出真实 works tree 的对象。"
      ),
      maturity_band: chooseText("mounted works tree", "已挂载 works tree"),
      drilldown_status: chooseText("local tree live", "本地 tree 已接通"),
    };
  }
  if (worksLayerMode === "flat_work_overview") {
    return {
      available: true,
      entry_contract_type: "flat_overview_entry",
      entry_contract_headline: chooseText(
        "Open this author through a lighter mounted work room: work cards and sampled occurrences are readable, but the branch layer stays lighter than a full works tree.",
        "这个 author 通过更轻的 mounted work room 进入：work cards 和 sampled occurrences 已经可读，但 branch 层仍比完整 works tree 更轻。"
      ),
      maturity_band: chooseText("flat overview", "flat overview"),
      drilldown_status: chooseText("cards and samples live", "cards 与 samples 已接通"),
      focus_work_count: Array.isArray(author?.works) ? author.works.length : 0,
    };
  }
  if (worksLayerMode === "no_work_layer") {
    return {
      available: true,
      entry_contract_type: "commentary_first_entry",
      entry_contract_headline: chooseText(
        "Start from text or commentary evidence, then use the curated room path. This object does not yet expose a mounted local work room in the live panel.",
        "先从正文或 commentary 证据进入，再走 curated room path。这个对象在当前 live panel 里还没有挂出本地 work room。"
      ),
      maturity_band: chooseText("commentary-first room", "commentary-first 房间"),
      drilldown_status: chooseText("no local work room", "没有本地 work room"),
    };
  }
  if (worksLayerMode === "no_works_tree") {
    return {
      available: true,
      entry_contract_type: "special_backbone_entry",
      entry_contract_headline: chooseText(
        "Open this object through a controlled special-case backbone, not through an ordinary work tree.",
        "这个对象应通过受控的 special-case backbone 进入，而不是按普通 work tree 进入。"
      ),
      maturity_band: chooseText("special-case backbone", "special-case backbone"),
      drilldown_status: chooseText("scoped backbone live", "受控 backbone 已接通"),
    };
  }
  return null;
}

function getAuthorityEntryContractLabel(entryType) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (entryType === "drilldown_entry_live") {
    return chooseText("Drilldown entry live", "可直接下钻入口");
  }
  if (entryType === "frontline_only") {
    return chooseText("Frontline-only entry", "仅前线入口");
  }
  if (entryType === "legacy_entry") {
    return chooseText("Legacy entry", "旧式入口");
  }
  if (entryType === "special_case_entry") {
    return chooseText("Special-case entry", "特殊入口");
  }
  if (entryType === "works_tree_entry") {
    return chooseText("Works-tree entry", "works-tree 入口");
  }
  if (entryType === "flat_overview_entry") {
    return chooseText("Flat-overview entry", "flat-overview 入口");
  }
  if (entryType === "commentary_first_entry") {
    return chooseText("Commentary-first entry", "commentary-first 入口");
  }
  if (entryType === "special_backbone_entry") {
    return chooseText("Special-backbone entry", "special-backbone 入口");
  }
  return chooseText("Entry contract", "入口契约");
}

function renderAuthorityReadingContractBanner(author, options = {}) {
  const { compact = false, activeView = null } = options;
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const meta = getAuthorityReadingContractMeta(author);
  if (!meta) {
    return "";
  }

  const headline = String(meta.entry_contract_headline || "").trim();
  const pills = [
    meta.maturity_band ? `<span class="pill">${escapeHtml(`maturity: ${meta.maturity_band}`)}</span>` : "",
    meta.pressure_band ? `<span class="pill">${escapeHtml(`pressure: ${meta.pressure_band}`)}</span>` : "",
    meta.frontline_status ? `<span class="pill">${escapeHtml(`frontline: ${meta.frontline_status}`)}</span>` : "",
    meta.drilldown_status ? `<span class="pill">${escapeHtml(`drilldown: ${meta.drilldown_status}`)}</span>` : "",
    `<span class="pill">${escapeHtml(getAuthorityEntryContractLabel(meta.entry_contract_type))}</span>`,
    Number.isFinite(Number(meta.focus_work_count)) && Number(meta.focus_work_count) > 0
      ? `<span class="pill">${escapeHtml(chooseText(`${meta.focus_work_count} focus works`, `${meta.focus_work_count} 个 focus works`))}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const viewHint = activeView === "drilldown"
    ? chooseText(
        "Step C should follow this entry contract directly, rather than treating every bucket as the same kind of passage.",
        "Step C 现在应该直接顺着这个入口契约往里走，而不是把所有 bucket 都当成同一种 passage。"
      )
    : chooseText(
        "This author now carries an explicit entry contract: not just where it appears, but how it should be opened for reading.",
        "这个 author 现在已经带了明确的入口契约：不只是它出现在哪里，还包括现在应该怎么进入阅读。"
      );

  return `
    <div class="authority-caveat-banner authority-reading-contract ${compact ? "is-compact" : ""}">
      <strong>${escapeHtml(chooseText("Entry Contract", "入口契约"))}</strong>
      ${headline ? `<div>${escapeHtml(headline)}</div>` : ""}
      <small>${escapeHtml(viewHint)}</small>
      ${pills ? `<div class="locus-meta-row">${pills}</div>` : ""}
    </div>
  `;
}

function renderAuthorityStageMarkup(author, activeView) {
  if (activeView === "commentary") {
    return renderAuthorityCommentaryStage(author);
  }
  if (activeView === "drilldown") {
    return renderAuthorityDrilldownStage(author);
  }
  return renderAuthorityTextStage(author);
}

function renderAuthorityTextStage(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const cantoRows = (author?.text_occurrences_by_canto || []).slice(0, 8)
    .map((row) => {
      const canJump = row.sample_available && Number.isFinite(row.jump_line_number);
      const lineRows = (row.line_occurrences || []).slice(0, 3)
        .map(
          (line) => `
            <div class="authority-line-snippet">
              <strong>${escapeHtml(line.line_label)}</strong>
              <span>${escapeHtml(line.line_text)}</span>
            </div>
          `
        )
        .join("");
      return `
        <button
          type="button"
          class="occurrence-row authority-canto-card ${canJump ? "" : "is-disabled"}"
          ${canJump ? `data-occurrence-sample="${row.sample_name}" data-occurrence-line="${row.jump_line_number}"` : "disabled"}>
          <div class="authority-card-top">
            <strong>${escapeHtml(row.canto_label)}</strong>
            <span>${escapeHtml(`${row.occurrence_count} direct line hit${row.occurrence_count === 1 ? "" : "s"}`)}</span>
          </div>
          <small>${escapeHtml(`matched aliases: ${(row.matched_aliases || []).join(", ") || "n/a"}`)}</small>
          <div class="authority-line-snippets">${lineRows}</div>
        </button>
      `;
    })
    .join("");

  if (!cantoRows) {
    return `
      <div class="authority-stage-block">
        <div class="semantic-kicker">Step A</div>
        <h4>${escapeHtml(chooseText("Text Layer: Commedia text layer", "正文层：Commedia text layer"))}</h4>
        <p class="semantic-intro">${escapeHtml(getAuthorityTextLayerIntro(author) || chooseText("No direct text hits are currently available in the poem layer.", "当前正文层还没有可用的 direct text hit。"))}</p>
        <div class="empty-state">
          ${escapeHtml(chooseText("This figure currently reads more naturally through commentary and authority material. That does not make it invalid; it only means the present alias sweep does not catch it stably in the poem itself.", "这个对象目前更适合先从 commentary / authority layer 阅读；这并不等于它“无效”，只是说明它在当前字面 alias sweep 里没有稳定命中。"))}
        </div>
        <div class="authority-inline-actions">
          <button type="button" class="lens-tab is-active" data-authority-view="commentary">${escapeHtml(chooseText("Go to Commentary Layer", "转到注释层"))}</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="authority-stage-block">
      <div class="semantic-kicker">Step A</div>
      <h4>${escapeHtml(chooseText("Text Layer: where does this figure appear in the poem?", "正文层：这个对象在《神曲》正文里出现在哪些 canto？"))}</h4>
      <p class="semantic-intro">${escapeHtml(getAuthorityTextLayerIntro(author) || chooseText("This view shows direct alias hits in canto / line form.", "当前按 direct alias sweep 展示字面命中的 canto / line。"))}</p>
      <div class="occurrence-list">${cantoRows}</div>
    </div>
  `;
}

function getSelectedAuthorityCommentarySample(author) {
  const payload = getLoadedAuthorityCommentaryLineIndex(author);
  const samples = payload?.samples || [];
  if (!samples.length) {
    return null;
  }
  const requested = state.activeAuthorityCommentarySample;
  return samples.find((sample) => sample.sample_name === requested) || samples[0];
}

function getSelectedAuthorityCommentaryLine(sampleEntry) {
  const groups = sampleEntry?.line_groups || [];
  if (!groups.length) {
    return null;
  }
  const requested = state.activeAuthorityCommentaryLineKey;
  return groups.find((group) => group.line_key === requested) || groups[0];
}

function getAuthorityCommentaryLineDisplay(group) {
  if (!group) {
    return "line unavailable";
  }
  const lineInfo = String(group.line_info || "").trim() || "line unavailable";
  if (/[-–]/.test(lineInfo)) {
    return lineInfo;
  }
  const sampleId = group.sample_name || state.activeAuthorityCommentarySample || null;
  const lineNumber = Number(group.line_number || group.jump_target?.line_number || group.line_start);
  if (!sampleId || !Number.isFinite(lineNumber)) {
    return lineInfo;
  }
  const overviewLine = state.currentSampleEntry?.id === sampleId
    ? (state.overview?.lines || []).find((line) => Number(line?.line_number) === lineNumber) || null
    : null;
  const overviewText = String(overviewLine?.line_text || "").trim();
  if (overviewText) {
    return `${lineInfo}: ${overviewText}`;
  }
  const payload = state.currentSampleEntry?.id === sampleId
    ? state.lineCache.get(lineNumber) || null
    : null;
  const lineText = String(payload?.line_text || "").trim();
  if (!lineText) {
    return lineInfo;
  }
  return `${lineInfo}: ${lineText}`;
}

function getAuthorityCommentaryLineNumberFromOccurrence(occurrence) {
  const lineInfo = String(occurrence?.line_info || "").trim();
  const firstLineMatch = lineInfo.match(/\d+/);
  if (firstLineMatch) {
    const parsed = Number(firstLineMatch[0]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const fallback = Number(occurrence?.line_number);
  return Number.isFinite(fallback) ? fallback : null;
}

function findAuthorityCommentaryLineGroupForOccurrence(author, occurrence) {
  if (!author || !occurrence) {
    return null;
  }
  const payload = getLoadedAuthorityCommentaryLineIndex(author);
  const sampleName = inferAuthorityOccurrenceSampleName(occurrence);
  if (!payload?.samples?.length || !sampleName) {
    return null;
  }
  const sampleEntry = payload.samples.find((sample) => sample.sample_name === sampleName) || null;
  if (!sampleEntry?.line_groups?.length) {
    return null;
  }
  const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
  const directMatch = sampleEntry.line_groups.find((group) =>
    (group.occurrences || []).some((item) => makeAuthorityOccurrenceKey(item) === occurrenceKey)
  );
  if (directMatch) {
    return directMatch;
  }
  const lineNumber = getAuthorityCommentaryLineNumberFromOccurrence(occurrence);
  if (Number.isFinite(lineNumber)) {
    return sampleEntry.line_groups.find((group) => {
      const groupLineNumber = Number(group.line_number || group.jump_target?.line_number || group.line_start);
      return Number.isFinite(groupLineNumber) && groupLineNumber === lineNumber;
    }) || null;
  }
  return null;
}

function syncAuthorityCommentarySelectionToOccurrence(author, occurrence) {
  if (!author || !occurrence) {
    return;
  }
  const sampleName = inferAuthorityOccurrenceSampleName(occurrence);
  if (sampleName) {
    state.activeAuthorityCommentarySample = sampleName;
  }
  const lineGroup = findAuthorityCommentaryLineGroupForOccurrence(author, occurrence);
  if (lineGroup?.line_key) {
    state.activeAuthorityCommentaryLineKey = lineGroup.line_key;
  }
}

function getCurrentAuthorityCommentaryStageOccurrences(author) {
  const selectedSample = getSelectedAuthorityCommentarySample(author);
  const selectedLineGroup = getSelectedAuthorityCommentaryLine(selectedSample);
  return selectedLineGroup?.occurrences || [];
}

function getAuthorityCommentaryStageEntries(group) {
  if (!group) {
    return [];
  }
  const commentaryCounts = new Map();
  for (const item of (group.commentary_index || [])) {
    const label = normalizeAuthorityCommentaryName(item.commentary_name || item.abbr || "") || item.commentary_name || item.abbr || "Commentary";
    commentaryCounts.set(label, Number(item.mention_count) || 0);
  }

  const grouped = new Map();
  for (const occurrence of (group.occurrences || [])) {
    const commentaryName = normalizeAuthorityCommentaryName(occurrence.commentary_name || "") || occurrence.commentary_name || "Commentary";
    const entry = grouped.get(commentaryName) || {
      label: commentaryName,
      mentionCount: commentaryCounts.get(commentaryName) || 0,
      occurrenceCount: 0,
      rawMentions: new Set(),
      primaryOccurrence: occurrence,
    };
    entry.occurrenceCount += 1;
    if (occurrence.raw_mention) {
      entry.rawMentions.add(String(occurrence.raw_mention).trim());
    }
    grouped.set(commentaryName, entry);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if ((b.mentionCount || 0) !== (a.mentionCount || 0)) {
        return (b.mentionCount || 0) - (a.mentionCount || 0);
      }
      return a.label.localeCompare(b.label);
    })
    .map((entry) => ({
      ...entry,
      rawMentionSummary: Array.from(entry.rawMentions).filter(Boolean).slice(0, 3).join(" · "),
    }));
}

function renderAuthorityCommentaryStage(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const curatedAuthorAnchors = getAuthorityCuratedAuthorAnchors(author);
  const authorPageHref = getAuthorityAutorePageHref(author);
  const personaggioPageHref = getAuthorityPersonaggioPageHref(author);
  const staticLinks = [
    authorPageHref ? `<a href="${escapeHtml(authorPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(chooseText("Open static autore room", "打开静态 autore 房间"))}</a>` : "",
    personaggioPageHref ? `<a href="${escapeHtml(personaggioPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(chooseText("Open static personaggio room", "打开静态 personaggio 房间"))}</a>` : "",
  ].filter(Boolean).join(" · ");
  if (author?.commentary_line_index?.available && !getLoadedAuthorityCommentaryLineIndex(author)) {
    ensureAuthorityCommentaryLineIndexLoaded(author)
      .then(() => renderFigurePanel())
      .catch(() => renderFigurePanel());
  }

  const densityRows = (author?.by_canto_density || []).slice(0, 12)
    .map(
      (row) => `
        <button
          type="button"
          class="occurrence-row ${row.sample_name === state.activeAuthorityCommentarySample ? "is-active" : ""} ${row.sample_available ? "" : "is-disabled"}"
          ${row.sample_available ? `data-authority-commentary-sample="${row.sample_name}"` : "disabled"}>
          <strong>${escapeHtml(row.canto_label)}</strong>
          <span>${escapeHtml(`${row.total_mentions} commentary mentions`)}</span>
        </button>
      `
    )
    .join("");

  const workChips = (author?.works || []).slice(0, 6)
    .map(
      (work) => `
        <span class="pill">
          ${escapeHtml(work.canonical_work)}: ${work.count}
        </span>
      `
    )
    .join("");

  const roleBreakdown = author?.mention_role_breakdown
    ? Object.entries(author.mention_role_breakdown)
        .map(([key, value]) => `<span class="pill">${escapeHtml(key)}: ${value}</span>`)
        .join("")
    : "";
  const specialCase = renderAuthoritySpecialCasePanel(author);
  const commentaryLineIndex = getLoadedAuthorityCommentaryLineIndex(author);
  const selectedSample = getSelectedAuthorityCommentarySample(author);
  if (selectedSample && state.activeAuthorityCommentarySample !== selectedSample.sample_name) {
    state.activeAuthorityCommentarySample = selectedSample.sample_name;
  }
  const selectedLineGroup = getSelectedAuthorityCommentaryLine(selectedSample);
  if (selectedLineGroup && state.activeAuthorityCommentaryLineKey !== selectedLineGroup.line_key) {
    state.activeAuthorityCommentaryLineKey = selectedLineGroup.line_key;
  }
  const commentaryEntries = getAuthorityCommentaryStageEntries(selectedLineGroup);
  const hasMountedCommentaryLayer = Boolean(
    (author?.by_canto_density || []).length
    || selectedSample
    || selectedLineGroup
    || commentaryEntries.length
  );
  if (!hasMountedCommentaryLayer) {
    return `
      <div class="authority-stage-block">
        <div class="semantic-kicker">Step B</div>
        <h4>${escapeHtml(chooseText("Commentary Layer: where do commentary traditions speak about this figure?", "注释层：评论传统围绕这个对象在哪些 canto 说话？"))}</h4>
        ${roleBreakdown ? `<div class="locus-meta-row">${roleBreakdown}</div>` : ""}
        ${specialCase}
        <div class="vocabulary-section-grid">
          <div>
            <h4>Commentary Occurrences by Canto</h4>
            <div class="occurrence-list">
              <div class="empty-state">${escapeHtml(chooseText("No mounted commentary-by-canto overview is currently available for this author.", "这个 author 当前还没有挂出的 commentary canto overview。"))}</div>
            </div>
          </div>
          <div>
            <h4>${escapeHtml(chooseText("Current Reading Path", "当前阅读路径"))}</h4>
            ${renderAuthorityCuratedAnchorCards(curatedAuthorAnchors) || `<div class="empty-state">${escapeHtml(chooseText("No mounted commentary path is available yet. Continue through the static authority rooms below.", "这里还没有挂出的 commentary path；请先沿下面的静态 authority 房间继续阅读。"))}</div>`}
            ${staticLinks ? `<p class="semantic-intro">${staticLinks}</p>` : ""}
          </div>
        </div>
        <div class="authority-stage-block authority-stage-block-secondary">
          <h4>${escapeHtml(chooseText("Current Work Layer", "当前 Work Layer"))}</h4>
          <div class="locus-meta-row">${workChips || `<div class="empty-state">${escapeHtml(chooseText("Use the curated room path and static author room below: this figure does not expose a local work overview in the live panel yet.", "请先走 curated room path 和下面的静态 autore room；这个对象在当前 live panel 里还没有本地 work overview。"))}</div>`}</div>
        </div>
      </div>
    `;
  }
  const lineRows = (selectedSample?.line_groups || []).slice(0, 24)
    .map((group) => {
      const indexPills = (group.commentary_index || []).slice(0, 4)
        .map((item) => `<span class="pill" title="${escapeHtml(item.commentary_name || "")}">${escapeHtml(normalizeAuthorityCommentaryName(item.commentary_name || item.abbr || "?"))}</span>`)
        .join("");
      return `
        <button
          type="button"
          class="occurrence-row authority-line-group-row ${group.line_key === state.activeAuthorityCommentaryLineKey ? "is-active" : ""}"
          data-authority-commentary-line="${escapeHtml(group.line_key)}">
          <strong>${escapeHtml(getAuthorityCommentaryLineDisplay(group))}</strong>
          <span>${escapeHtml(`${group.total_mentions} mentions · ${group.commentary_count} commentaries`)}</span>
          <div class="locus-meta-row authority-abbr-row">${indexPills}</div>
        </button>
      `;
    })
    .join("");
  const occurrenceRows = commentaryEntries.slice(0, 24)
    .map((entry) => {
      const occurrence = entry.primaryOccurrence;
      const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
      const lineInfo = String(occurrence?.line_info || "").trim();
      const location = `${occurrence.cantica} ${occurrence.canto}${lineInfo ? ` · ${lineInfo}` : ""}`;
      const mentionLine = entry.mentionCount
        ? `${entry.mentionCount} mention${entry.mentionCount === 1 ? "" : "s"}`
        : `${entry.occurrenceCount} occurrence${entry.occurrenceCount === 1 ? "" : "s"}`;
      return `
        <div class="authority-occurrence-card ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""}">
          <button
            type="button"
            class="occurrence-row authority-occurrence-row ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""}"
            data-authority-occurrence-key="${escapeHtml(occurrenceKey)}">
            <strong>${escapeHtml(`${entry.label} · ${location}`)}</strong>
            <span>${escapeHtml(entry.rawMentionSummary || occurrence.raw_mention || "commentary mention")}</span>
            <small>${escapeHtml(mentionLine)}</small>
          </button>
          <a
            href="#authority-commentary-source"
            class="authority-occurrence-source-link"
            data-authority-commentary-chip-key="${escapeHtml(occurrenceKey)}">
            ${escapeHtml(chooseText("Commentary Source", "跳到 Commentary Source"))}
          </a>
        </div>
      `;
    })
    .join("");
  const selectedOccurrence = getAuthoritySelectedOccurrence(selectedLineGroup?.occurrences || [])
    || commentaryEntries[0]?.primaryOccurrence
    || null;
  if (
    selectedOccurrence
    && (selectedOccurrence.result_url || selectedOccurrence.commentary_record_id)
    && !getAuthorityCommentarySource(selectedOccurrence)
  ) {
    ensureAuthorityCommentarySourceLoaded(selectedOccurrence)
      .then(() => renderFigurePanel())
      .catch(() => renderFigurePanel());
  }
  const commentaryIndexButtons = (() => {
    return commentaryEntries
      .slice(0, 16)
      .map((entry) => {
        const occurrence = entry.primaryOccurrence;
        const label = entry.label;
        const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
        const locationLabel = getAuthorityOccurrenceLocationLabel(occurrence);
        return `
          <span class="authority-commentary-name-chip-wrap">
            <a
              href="#authority-commentary-source"
              class="authority-commentary-name-chip ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""}"
              data-authority-commentary-chip-key="${escapeHtml(occurrenceKey)}">
              ${escapeHtml(label)}
            </a>
            <a
              href="#authority-commentary-source"
              class="authority-commentary-source-chip"
              data-authority-commentary-chip-key="${escapeHtml(occurrenceKey)}">
              ${escapeHtml(locationLabel)}
            </a>
          </span>
        `;
      })
      .join("");
  })();

  return `
    <div class="authority-stage-block">
      <div class="semantic-kicker">Step B</div>
      <h4>${escapeHtml(chooseText("Commentary Layer: where do commentary traditions speak about this figure?", "注释层：评论传统围绕这个对象在哪些 canto 说话？"))}</h4>
      ${roleBreakdown ? `<div class="locus-meta-row">${roleBreakdown}</div>` : ""}
      ${specialCase}
      <div class="vocabulary-section-grid">
        <div>
          <h4>Commentary Occurrences by Canto</h4>
          <div class="occurrence-list">${densityRows || `<div class="empty-state">${escapeHtml(chooseText("No commentary canto overview is currently available.", "当前没有可展示的 commentary canto overview。"))}</div>`}</div>
        </div>
        <div>
          <h4>${escapeHtml(selectedSample ? `${selectedSample.canto_label} · line index` : "Line index")}</h4>
          <div class="occurrence-list">${
            commentaryLineIndex
              ? (lineRows || `<div class="empty-state">${escapeHtml(chooseText("This canto does not currently expose a line-level commentary index.", "当前这个 canto 暂时没有 line-level commentary index。"))}</div>`)
              : `<div class="empty-state">${escapeHtml(
                author?.commentary_line_index?.available && ((author?.by_canto_density || []).length || selectedSample)
                  ? chooseText("Loading the line-level commentary index for this author.", "正在加载这个 author 的 line-level commentary index…")
                  : chooseText("No mounted line-level commentary index is currently available for this author.", "这个 author 当前还没有挂出的 line-level commentary index。")
              )}</div>`
          }</div>
        </div>
      </div>
      <div class="authority-stage-block authority-stage-block-secondary">
        <h4>${escapeHtml(selectedLineGroup ? `${getAuthorityCommentaryLineDisplay(selectedLineGroup)} · commentary index` : "Selected line")}</h4>
        ${commentaryIndexButtons ? `<div class="locus-meta-row authority-commentary-name-row">${commentaryIndexButtons}</div>` : ""}
        <div class="occurrence-list">${occurrenceRows || `<div class="empty-state">${escapeHtml(chooseText("No line-level commentary occurrences are currently available.", "当前还没有可用的 line-level commentary occurrence。"))}</div>`}</div>
        ${selectedLineGroup?.mention_role_breakdown ? `<div class="locus-meta-row">${
          Object.entries(selectedLineGroup.mention_role_breakdown).map(([key, value]) => `<span class="pill">${escapeHtml(`${key}: ${value}`)}</span>`).join("")
        }</div>` : ""}
      </div>
      <div class="authority-stage-block authority-stage-block-secondary">
        <div id="authority-commentary-source"></div>
        <h4>Commentary Source</h4>
        ${renderAuthoritySourcePanel(author, selectedOccurrence)}
      </div>
      <div class="authority-stage-block authority-stage-block-secondary">
        <h4>${escapeHtml(chooseText("Current Work Layer", "当前 Work Layer"))}</h4>
        <div class="locus-meta-row">${workChips || `<div class="empty-state">${escapeHtml(chooseText("Use the curated room path and static author room below: this figure does not expose a local work overview in the live panel yet.", "请先走 curated room path 和下面的静态 autore room；这个对象在当前 live panel 里还没有本地 work overview。"))}</div>`}</div>
      </div>
    </div>
  `;
}

function renderAuthorityDrilldownStage(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (author?.works_tree?.available || author?.works_tree?.works?.length) {
    return renderAuthorityWorksLens(author);
  }

  const flatMeta = getAuthorityFlatWorkMeta(author);
  const loadedFlat = getLoadedAuthorityFlatWorkObject(author);
  if (flatMeta?.available && flatMeta?.path && !loadedFlat) {
    ensureAuthorityFlatWorkObjectLoaded(author)
      .then(() => renderFigurePanel())
      .catch(() => renderFigurePanel());
    return `
      <div class="authority-stage-block">
        <div class="semantic-kicker">Step C</div>
        <h4>${escapeHtml(chooseText("Work Layer: works / passages / commentary occurrences", "Work Layer：works / passages / commentary occurrences"))}</h4>
        <div class="empty-state">${escapeHtml(chooseText(
          "Loading the flat-work drilldown object for this author.",
          "正在加载这个 author 的 flat-work drilldown object。"
        ))}</div>
      </div>
    `;
  }

  return renderGenericAuthorityDrilldownStage(getAuthorityGenericDrilldownAuthor(author));
}

function renderGenericAuthorityDrilldownStage(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  try {
    const works = author?.work_cards || author?.works || [];
    const sampledWorkOccurrences = author?.work_occurrence_samples || [];
    const curatedAuthorAnchors = getAuthorityCuratedAuthorAnchors(author);
    window.__authorityGenericDrilldownDebug = {
      authorId: author?.author_id || null,
      worksCount: works.length,
      occurrenceSampleCount: sampledWorkOccurrences.length,
      activeView: state.activeAuthorityView,
    };
    const allOccurrences = (author?.occurrences && author.occurrences.length)
      ? author.occurrences
      : [
          ...sampledWorkOccurrences.flatMap((entry) => entry?.occurrences || []),
          ...(author?.unresolved_occurrences || []),
        ];
    const selectedScope = getSelectedGenericScope(author, allOccurrences);
    const selectedRole = getSelectedGenericRole(author, selectedScope.occurrences);
    const scopedOccurrences = selectedRole.occurrences;
    const unresolvedCount = scopedOccurrences.filter((occurrence) => !String(occurrence.work || "").trim()).length;
    const selectedGenericWork = getSelectedGenericWork(author, scopedOccurrences);
    const selectedGenericWorkHref = selectedGenericWork.mode === "work" ? getAuthorityWorkPageHref(author, selectedGenericWork.work) : "";
    const selectedCuratedWorkAnchors = selectedGenericWork.mode === "work"
      ? getAuthorityCuratedWorkAnchors(author, selectedGenericWork.work)
      : null;
    const selectedGenericWorkAttribution = selectedGenericWork.mode === "work"
      ? getAuthorityWorkAttributionNote(selectedGenericWork.work)
      : "";
    const selectedGenericWorkAttributionModel = selectedGenericWork.mode === "work"
      ? String(selectedGenericWork.work?.attribution_model || "").trim()
      : "";
    const authorPageHref = getAuthorityAutorePageHref(author);
    const personaggioPageHref = getAuthorityPersonaggioPageHref(author);
    const curatedMarkup = renderAuthorityCuratedAnchorCards(selectedCuratedWorkAnchors || curatedAuthorAnchors);
    const staticLinks = [
      authorPageHref ? `<a href="${escapeHtml(authorPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static autore room", "打开静态 autore 房间"))}</a>` : "",
      personaggioPageHref ? `<a href="${escapeHtml(personaggioPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static personaggio room", "打开静态 personaggio 房间"))}</a>` : "",
    ].filter(Boolean).join(" · ");

    if (!works.length && !sampledWorkOccurrences.length && !allOccurrences.length && (curatedMarkup || staticLinks)) {
      return `
        <div class="authority-stage-block">
          <div class="semantic-kicker">Step C</div>
          <h4>${escapeHtml(chooseText("Work Layer: curated room anchors", "Work Layer：curated room anchors"))}</h4>
          <p class="semantic-intro">${escapeHtml(getAuthorityWorkLayerIntro(author) || choose(
            "This room does not yet expose mounted local work occurrences here. Use the curated work anchors and static rooms below as the present reading path.",
            "这间房这里还没有挂出本地 work occurrences；请先沿下面的 curated work anchors 和静态房间继续阅读。"
          ))}</p>
          <div class="vocabulary-section-grid">
            <div>
              <h4>${escapeHtml(chooseText("Curated Work Anchors", "Curated Work Anchors"))}</h4>
              ${curatedMarkup || `<div class="empty-state">${escapeHtml(choose(
                "No mounted local work anchor set is currently exposed here. Continue through the static authority rooms on the right.",
                "这里当前还没有挂出的本地 work anchor 集；请先沿右侧静态 authority 房间继续阅读。"
              ))}</div>`}
            </div>
            <div>
              <h4>${escapeHtml(chooseText("Static Rooms", "静态房间"))}</h4>
              <div class="empty-state">${escapeHtml(choose(
                "No mounted sampled work occurrences are currently available for this author in the local runtime.",
                "这个 author 在本地 runtime 里当前没有挂出的 sampled work occurrence。"
              ))}</div>
              ${staticLinks ? `<p class="semantic-intro">${staticLinks}</p>` : ""}
            </div>
          </div>
        </div>
      `;
    }

    const workRows = [
      `
        <button
          type="button"
          class="authority-work-card authority-work-button ${selectedGenericWork.mode === "all" ? "is-active" : ""}"
          data-authority-work="__all__">
          <strong>All occurrences</strong>
            <span>${escapeHtml(`${scopedOccurrences.length} sampled occurrences`)}</span>
            <small>${escapeHtml(choose(
              "Start with the full sampled commentary set currently readable for this author.",
              "先看这个 author 当前可读的全部 sampled commentary occurrences。"
            ))}</small>
          </button>
        `,
      ...works.slice(0, 8).map(
        (work) => `
          <button
            type="button"
            class="authority-work-card authority-work-button ${selectedGenericWork.mode === "work" && selectedGenericWork.work?.canonical_work === work.canonical_work ? "is-active" : ""}"
            data-authority-work="${escapeHtml(work.canonical_work)}">
            <strong>${escapeHtml(getAuthorityWorkDisplayName(author, work))}</strong>
            <span>${escapeHtml(`${work.count} total mentions`)}</span>
            <small>${escapeHtml(choose(
              `${work.passage_mentions || 0} passage-level mentions`,
              `${work.passage_mentions || 0} 条 passage-level mentions`
            ))}</small>
          </button>
        `
      ),
      unresolvedCount
        ? `
          <button
            type="button"
            class="authority-work-card authority-work-button ${selectedGenericWork.mode === "unresolved" ? "is-active" : ""}"
            data-authority-work="__unresolved__">
            <strong>Author-only / unresolved</strong>
            <span>${escapeHtml(`${unresolvedCount} sampled occurrences`)}</span>
            <small>${escapeHtml(choose(
              "These occurrences still remain at the author-only or unresolved-work level.",
              "这些 occurrence 仍停在 author-only 或 work unresolved。"
            ))}</small>
          </button>
        `
        : "",
    ]
      .filter(Boolean)
      .join("");
    const workColumnFallback = (!works.length && curatedAuthorAnchors)
      ? renderAuthorityCuratedAnchorCards(curatedAuthorAnchors)
      : "";

    const scopeButtons = renderGenericScopeButtons(author, allOccurrences, selectedScope.mode);
    const roleButtons = renderGenericRoleButtons(author, selectedScope.occurrences, selectedRole.mode);
    const flatBanner = renderFlatWorkObjectBanner(author, selectedScope);

    const occurrenceRows = selectedGenericWork.occurrences.slice(0, 18)
      .map(
        (occurrence) => {
        const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
        const workLabel = String(occurrence.work || "").trim();
        const resolutionLabel = getAuthorityResolutionLabel(occurrence);
        return `
          <button
            type="button"
            class="occurrence-row authority-occurrence-row ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""}"
            data-authority-occurrence-key="${escapeHtml(occurrenceKey)}">
            <strong>${escapeHtml(`${occurrence.canto_label}${occurrence.line_info ? ` · ${occurrence.line_info}` : ""}`)}</strong>
            <span>${escapeHtml(`${occurrence.commentary_name} · ${workLabel || resolutionLabel}`)}</span>
            <small>${escapeHtml(`${occurrence.raw_mention} · ${occurrence.mention_role || "role n/a"} · ${resolutionLabel} · conf ${Number(occurrence.confidence || 0).toFixed(2)}`)}</small>
          </button>
        `;
      })
      .join("");
    const selectedOccurrence = getAuthoritySelectedOccurrence(selectedGenericWork.occurrences);
  const occurrenceFallback = occurrenceRows || (() => {
      const links = staticLinks;
      if (curatedMarkup || links) {
        return `
          <div class="authority-stage-block authority-stage-block-secondary">
            <div class="empty-state">${escapeHtml(choose("No sampled commentary occurrences are mounted here yet. Use the curated room anchors and static rooms below as the current reading path.", "这里还没有挂出可读的 sampled commentary occurrences；先沿下面的 curated room anchors 和静态房间继续进入。"))}</div>
            ${curatedMarkup || ""}
            ${links ? `<p class="semantic-intro">${links}</p>` : ""}
          </div>
        `;
      }
      return `<div class="empty-state">${escapeHtml(choose("No commentary occurrence sample is currently available here.", "当前没有可用的 commentary occurrence sample。"))}</div>`;
    })();

    return `
        <div class="authority-stage-block">
        <div class="semantic-kicker">Step C</div>
        <h4>${escapeHtml(chooseText("Work Layer: works / passages / commentary occurrences", "Work Layer：works / passages / commentary occurrences"))}</h4>
        <p class="semantic-intro">${escapeHtml(getAuthorityWorkLayerIntro(author) || choose(
          "This stage opens the work layer and specific commentary samples only here, so author detail does not collapse into a data pile too early.",
          "只有走到这一步，才把 work layer 和具体 commentary samples 展开，避免 author detail 一上来就掉进数据堆里。"
        ))}</p>
        ${renderAuthorityReadingContractBanner(author, { compact: true, activeView: "drilldown" })}
        ${flatBanner}
        ${author?.entry_mode === "author_commentary_special_case_candidate" ? `<div class="authority-caveat-banner">${escapeHtml(choose(
          "This author now has a real works tree, but from certain canti onward the author / character double identity must still remain explicit.",
          "这个 author 现在已经有真实 works tree，但从特定 canto 起仍必须保留作者 / personaggio 双重身份 caveat。"
        ))}</div>` : ""}
        ${scopeButtons}
        ${roleButtons}
        <div class="vocabulary-section-grid">
          <div>
            <h4>Works</h4>
            <div class="occurrence-list">${workRows || workColumnFallback || `<div class="empty-state">${escapeHtml(choose("No stable work cards are currently available.", "当前没有稳定的 work cards。"))}</div>`}</div>
          </div>
          <div>
            <h4>${escapeHtml(`${selectedScope.heading} · ${selectedRole.heading} · ${selectedGenericWork.heading}`)}</h4>
            <p class="semantic-intro">${escapeHtml(`${selectedScope.note} ${selectedRole.note}`)}</p>
            ${selectedGenericWorkHref ? `<p class="semantic-intro"><a href="${escapeHtml(selectedGenericWorkHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static opera page", "打开静态 opera 页面"))}</a></p>` : ""}
            ${selectedGenericWorkAttribution ? `<div class="authority-caveat-banner"><strong>${escapeHtml(choose("Attribution", "归属"))}</strong><div>${escapeHtml(selectedGenericWorkAttribution)}</div>${selectedGenericWorkAttributionModel ? `<small>${escapeHtml(selectedGenericWorkAttributionModel.replaceAll("_", " "))}</small>` : ""}</div>` : ""}
            <div class="occurrence-list">${occurrenceFallback}</div>
          </div>
        </div>
        <div class="authority-stage-block authority-stage-block-secondary">
          <div id="authority-commentary-source"></div>
          ${renderAuthoritySourcePanel(author, selectedOccurrence)}
        </div>
      </div>
    `;
  } catch (error) {
    window.__authorityGenericDrilldownDebug = {
      ...(window.__authorityGenericDrilldownDebug || {}),
      error: error?.message || String(error),
    };
    return `
      <div class="authority-stage-block">
        <div class="semantic-kicker">Step C</div>
        <h4>${escapeHtml(chooseText("Work Layer: works / passages / commentary occurrences", "Work Layer：works / passages / commentary occurrences"))}</h4>
        <div class="empty-state">${escapeHtml(choose(
          `Work Layer render failed: ${error?.message || String(error)}`,
          `Work Layer 渲染失败：${error?.message || String(error)}`
        ))}</div>
      </div>
    `;
  }
}

function getSelectedGenericWork(author, occurrencePool = null) {
  const works = author?.work_cards || author?.works || [];
  const sampledWorkOccurrences = author?.work_occurrence_samples || [];
  const allOccurrences = occurrencePool || author?.occurrences || [];
  const requested = state.activeAuthorityWork || "__all__";

  if (requested === "__unresolved__") {
    return {
      mode: "unresolved",
      heading: "Author-only / unresolved occurrences",
      note: choose(
        "These sampled occurrences do not yet have a stable work binding. They can still open commentary source, but they should not be presented as stable work nodes.",
        "这些 sampled occurrences 还没有稳定 work 绑定；它们仍然可以点开注释原文，但当前不应被假装成稳定 work node。"
      ),
      occurrences: allOccurrences.filter((occurrence) => !String(occurrence.work || "").trim()),
    };
  }

  const matchedWork = works.find((work) => work.canonical_work === requested);
  if (matchedWork) {
    const sampledEntry = sampledWorkOccurrences.find((entry) => entry.canonical_work === matchedWork.canonical_work) || null;
    return {
      mode: "work",
      work: matchedWork,
      heading: `${getAuthorityWorkDisplayName(author, matchedWork)} occurrences`,
      note: choose(
        "This step drills down through the mounted work room for this author. Use the current work node to filter commentary occurrences without assuming a deeper locator tree than the payload actually exposes.",
        "这一步会沿着当前 author 的 mounted work room 下钻；可以用当前 work node 过滤 commentary occurrences，但不要假定它已经暴露出比 payload 实际更深的 locator tree。"
      ),
      occurrences: sampledEntry?.occurrences?.length
        ? sampledEntry.occurrences
        : allOccurrences.filter((occurrence) => occurrence.work === matchedWork.canonical_work),
    };
  }

  return {
    mode: "all",
    heading: "Representative Commentary Occurrences",
    note: choose(
      "Start with the full set of sampled commentary occurrences currently readable for this author, then decide whether to filter by work.",
      "先看这个 author 当前可读的 sampled commentary occurrences 全貌，再决定是否按 work 继续过滤。"
    ),
    occurrences: allOccurrences,
  };
}

function getStatiusSpecialScope(occurrence) {
  const sampleName = String(occurrence?.sample_name || "").toLowerCase();
  const canto = Number(occurrence?.canto);
  if (sampleName.startsWith("purgatorio") && Number.isFinite(canto) && canto >= 21) {
    return "purg21_plus";
  }
  return "outside_purg21_plus";
}

function getSelectedGenericScope(author, occurrences = []) {
  if (author?.author_id !== "statius" || author?.entry_mode !== "author_commentary_special_case_candidate") {
    return {
      mode: "__all__",
      heading: "All scope",
      note: choose(
        "This object does not currently require an extra scope layer, so the full sampled occurrence set stays visible.",
        "当前对象没有额外的 scope 层，直接看全部 sampled occurrences。"
      ),
      occurrences,
    };
  }
  const mode = state.activeAuthorityScope || "__all__";
  const purg21Plus = occurrences.filter((occurrence) => getStatiusSpecialScope(occurrence) === "purg21_plus");
  const outside = occurrences.filter((occurrence) => getStatiusSpecialScope(occurrence) === "outside_purg21_plus");
  if (mode === "purg21_plus") {
    return {
      mode,
      heading: "Purgatorio 21+ special-case zone",
      note: choose(
        "This view keeps only sampled occurrences from Purgatorio 21 onward. From here on, Statius should not be read only as a generic authority author; the author / character double identity stays in play.",
        "这里只看 Purgatorio 21+ 的 sampled occurrences。这里开始不应只把 Statius 读成一般 authority author，而要保留 author / personaggio 双重身份的观察。"
      ),
      occurrences: purg21Plus,
    };
  }
  if (mode === "outside_purg21_plus") {
    return {
      mode,
      heading: "Outside Purgatorio 21+",
      note: choose(
        "This view keeps only sampled occurrences before Purgatorio 21 or elsewhere, where the object behaves more like ordinary author/work commentary use.",
        "这里只看 Purgatorio 21 之前或别处的 sampled occurrences，它们更接近普通 author/work commentary use。"
      ),
      occurrences: outside,
    };
  }
  return {
    mode: "__all__",
    heading: "All scope",
    note: choose(
      "Start from the full sampled set, then decide whether to move into the special Purgatorio 21+ scope.",
      "先看全部 sampled occurrences，再决定是否切进 Purgatorio 21+ 的特殊观察区。"
    ),
    occurrences,
  };
}

function getSelectedGenericRole(author, occurrences = []) {
  if (author?.author_id !== "statius" || author?.entry_mode !== "author_commentary_special_case_candidate") {
    return {
      mode: "__all__",
      heading: "All roles",
      note: choose(
        "This object does not currently require an extra role layer, so all occurrences stay together.",
        "当前对象没有额外的角色层，直接看全部 occurrences。"
      ),
      occurrences,
    };
  }

  const mode = state.activeAuthorityRole || "__all__";
  const roleBuckets = {
    authority_citation: occurrences.filter((occurrence) => occurrence.mention_role === "authority_citation"),
    character_mention: occurrences.filter((occurrence) => occurrence.mention_role === "character_mention"),
    ambiguous_author_character: occurrences.filter((occurrence) => occurrence.mention_role === "ambiguous_author_character"),
  };

  if (mode === "authority_citation") {
    return {
      mode,
      heading: "Authority-biased occurrences",
      note: choose(
        "This view keeps only the sampled occurrences that read more like Statius as author / textual authority.",
        "这里只看更像把 Statius 当作 author / textual authority 调用的 sampled occurrences。"
      ),
      occurrences: roleBuckets.authority_citation,
    };
  }
  if (mode === "character_mention") {
    return {
      mode,
      heading: "Character-biased occurrences",
      note: choose(
        "This view keeps only the sampled occurrences that read more like Statius as a character inside the Commedia narrative.",
        "这里只看更像在说《神曲》叙事中的 Stazio personaggio 的 sampled occurrences。"
      ),
      occurrences: roleBuckets.character_mention,
    };
  }
  if (mode === "ambiguous_author_character") {
    return {
      mode,
      heading: "Ambiguous author / character occurrences",
      note: choose(
        "This view keeps only the sampled occurrences that remain genuinely ambiguous; they still carry mixed cues and should not be forced into a hard judgement.",
        "这里只看当前仍然保留为模糊层的 sampled occurrences；它们带有混合 cue，还不适合硬判。"
      ),
      occurrences: roleBuckets.ambiguous_author_character,
    };
  }

  return {
    mode: "__all__",
    heading: "All roles",
    note: choose(
      "Start with the full sampled set inside the current scope, then decide whether to split by author / character / ambiguous.",
      "先看当前 scope 里的全部 sampled occurrences，再决定是否切到 author / character / ambiguous。"
    ),
    occurrences,
  };
}

function renderGenericScopeButtons(author, occurrences, activeMode) {
  if (author?.author_id !== "statius" || author?.entry_mode !== "author_commentary_special_case_candidate") {
    return "";
  }
  const purg21PlusCount = occurrences.filter((occurrence) => getStatiusSpecialScope(occurrence) === "purg21_plus").length;
  const outsideCount = occurrences.filter((occurrence) => getStatiusSpecialScope(occurrence) === "outside_purg21_plus").length;
  const buttons = [
    { id: "__all__", label: "All scope", count: occurrences.length },
    { id: "outside_purg21_plus", label: "Outside Purg. 21+", count: outsideCount },
    { id: "purg21_plus", label: "Purg. 21+ zone", count: purg21PlusCount },
  ].map((item) => `
    <button
      type="button"
      class="authority-scope-chip ${activeMode === item.id ? "is-active" : ""}"
      data-authority-scope="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(String(item.count))}</span>
    </button>
  `).join("");
  return `
    <div class="authority-scope-shell">
      <div class="semantic-kicker">Scope</div>
      <p class="semantic-intro">${escapeHtml(choose(
        "Statius is not treated here as an ordinary flat author. The Purgatorio 21+ special zone is separated first.",
        "Statius 在这里不再被当作普通 flat author 统一处理，而是先把 Purgatorio 21+ 特殊观察区单独拎出来。"
      ))}</p>
      <div class="authority-scope-row">${buttons}</div>
    </div>
  `;
}

function renderGenericRoleButtons(author, occurrences, activeMode) {
  if (author?.author_id !== "statius" || author?.entry_mode !== "author_commentary_special_case_candidate") {
    return "";
  }
  const authorityCount = occurrences.filter((occurrence) => occurrence.mention_role === "authority_citation").length;
  const characterCount = occurrences.filter((occurrence) => occurrence.mention_role === "character_mention").length;
  const ambiguousCount = occurrences.filter((occurrence) => occurrence.mention_role === "ambiguous_author_character").length;
  const buttons = [
    { id: "__all__", label: "All roles", count: occurrences.length },
    { id: "authority_citation", label: "Authority", count: authorityCount },
    { id: "character_mention", label: "Character", count: characterCount },
    { id: "ambiguous_author_character", label: "Ambiguous", count: ambiguousCount },
  ]
    .filter((item) => item.id === "__all__" || item.count > 0)
    .map((item) => `
      <button
        type="button"
        class="authority-scope-chip ${activeMode === item.id ? "is-active" : ""}"
        data-authority-role="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(String(item.count))}</span>
      </button>
    `)
    .join("");
  return `
    <div class="authority-scope-shell">
      <div class="semantic-kicker">Role layer</div>
      <p class="semantic-intro">${escapeHtml(choose(
        "Inside Statius's special zone, this layer then splits the evidence by judgement: whether a mention reads more like author authority or more like character reference.",
        "在 Statius 的特殊范围里，再按当前 judgement layer 切一层：先区分更像 author authority 的 mention，还是更像 personaggio 的 mention。"
      ))}</p>
      <div class="authority-scope-row">${buttons}</div>
    </div>
  `;
}

function renderFlatWorkObjectBanner(author, selectedScope) {
  const contractHeadline = String(author?.reading_contract_meta?.entry_contract_headline || "").trim();
  const rolloutKind = String(author?.rollout_kind || author?.flat_work_object?.rollout_kind || "").trim();
  const isReviewFirstFlat = author?.object_rollout_status === "review_first"
    || rolloutKind === "review_first_flat_work_object";
  if (author?.author_id === "cicero" && author?.works_layer_mode === "flat_work_overview") {
    return `<div class="authority-flat-banner">${escapeHtml(choose(
      "Cicero currently enters through a lighter mounted work room: first filter by work cards, then return from occurrences to commentary source. It is not being presented as a deeper locator tree than the payload supports.",
      "Cicero 当前通过更轻的 mounted work room 前推：先按 work cards 过滤，再点 occurrence 回到注释原文。当前不把它描述成比 payload 实际更深的 locator tree。"
    ))}</div>`;
  }
  if (author?.author_id === "statius") {
    return `<div class="authority-flat-banner">${escapeHtml(choose(
      `Statius now enters the works layer through a real author-side works tree, but the sensitive distinction still lives in the current scope layer: ${selectedScope.heading}.`,
      `Statius 现在已经通过真实的 author-side works tree 进入 works 层，但真正敏感的仍是 ${selectedScope.heading} 这层范围。`
    ))}</div>`;
  }
  if (author?.object_rollout_status === "partial" && author?.works_layer_mode === "flat_work_overview") {
    return `<div class="authority-flat-banner">${escapeHtml(choose(
      "This object currently opens through a partial flat-work overview: works and occurrences are already readable, while the branch layer is still growing.",
      "这个对象当前以 partial flat-work overview 进入系统：works 与 occurrence 已经可读，但 branch 层还在继续长厚。"
    ))}</div>`;
  }
  if (isReviewFirstFlat && author?.works_layer_mode === "flat_work_overview") {
    return `<div class="authority-flat-banner">${escapeHtml(choose(
      contractHeadline
        ? `This object currently opens through a commentary-first flat-work overview: ${contractHeadline}`
        : "This object currently opens through a commentary-first flat-work overview: work cards and sampled occurrences are live, while the branch layer remains intentionally lighter than a full tree.",
      contractHeadline
        ? `这个对象当前通过 commentary-first flat-work overview 进入：${contractHeadline}`
        : "这个对象当前通过 commentary-first flat-work overview 进入：work cards 与 sampled occurrences 已经可读，但 branch 层仍刻意比完整 tree 更轻。"
    ))}</div>`;
  }
  return "";
}

function getSelectedAuthorityWork(author) {
  const works = getLoadedAuthorityWorksTree(author)?.works || author?.works_tree?.works || [];
  if (!works.length) {
    return null;
  }
  return works.find((work) => work.canonical_work === state.activeAuthorityWork) || works[0];
}

function makeAuthorityNodeId(scope, parts = []) {
  return [scope, ...parts].join("|");
}

function makeAuthorityOccurrenceKey(occurrence) {
  return [
    occurrence?.result_url || "no-url",
    occurrence?.commentary_record_id || "no-record-id",
    occurrence?.raw_mention || "no-mention",
    occurrence?.commentary_name || "no-commentary",
    occurrence?.line_info || "no-line-info",
  ].join("|");
}

function getAuthoritySelectedOccurrence(occurrences = []) {
  if (!Array.isArray(occurrences) || !occurrences.length) {
    return null;
  }
  return occurrences.find((occurrence) => makeAuthorityOccurrenceKey(occurrence) === state.activeAuthorityOccurrenceKey) || null;
}

function getAuthorityCommentarySource(occurrence) {
  if (!occurrence?.result_url) {
    return null;
  }
  const sampleName = inferAuthorityOccurrenceSampleName(occurrence);
  if (!sampleName) {
    return null;
  }
  return state.authorityCommentarySourceCache.get(sampleName)?.by_result_url?.[occurrence.result_url] || null;
}

function getAuthorityTreeNodeKey(node) {
  if (!node) {
    return "UNSPECIFIED";
  }
  return String(
    node.node_key
      ?? node.book
      ?? node.chapter
      ?? node.section
      ?? node.verse
      ?? node.label
      ?? "UNSPECIFIED",
  );
}

function getAuthorityTreeObjectFamily(author) {
  return getLoadedAuthorityWorksTree(author)?.object_family || author?.works_tree?.object_family || "generic_authority";
}

function getAuthorityTreeBucketLabel(scope) {
  if (scope === "structured_passage") {
    return "Exact passage";
  }
  if (scope === "prose_locator") {
    return "Internal locator";
  }
  if (scope === "work_only") {
    return "Work-level";
  }
  return "Weak locator";
}

function getAuthorityWorksLensIntro(author) {
  const family = getAuthorityTreeObjectFamily(author);
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (family === "scriptural_epistolary") {
    return chooseText(
      "Choose the work, open a chapter or chapter -> verse node, then return to the commentary occurrence below.",
      "先选 work，再进 chapter 或 chapter -> verse 节点，最后回到下方 commentary occurrence。"
    );
  }
  if (family === "scriptural_psalmic") {
    return chooseText(
      "Choose the work, open a Psalm or Psalm -> Verse node, then return to the commentary occurrence below.",
      "先选 work，再进 Psalm 或 Psalm -> Verse 节点，最后回到下方 commentary occurrence。"
    );
  }
  return chooseText(
    "Choose the work, open a locator node, then return to the commentary occurrence below.",
    "先选 work，再进 locator 节点，最后回到下方 commentary occurrence。"
  );
}

function getAuthorityStructuredBucketNote(author) {
  const family = getAuthorityTreeObjectFamily(author);
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (family === "scriptural_epistolary") {
    return chooseText("Exact chapter -> verse targets.", "可直接落到稳定的 chapter -> verse。");
  }
  if (family === "scriptural_psalmic") {
    return chooseText("Exact Psalm or Psalm -> Verse targets.", "可直接落到稳定的 Psalm 或 Psalm -> Verse。");
  }
  return chooseText("Exact passage targets parsed from local commentary evidence.", "从本地 commentary 证据中解析出的精确 passage 节点。");
}

function getAuthorityLocatorBucketNote(author, work) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (isDanteConvivioWork(author, work)) {
    return chooseText(
      "Open the strongest Convivio locator lane; Trattato / Capitolo nodes stay visible below.",
      "打开最稳的 Convivio locator；Trattato / Capitolo 节点保留在下方。"
    );
  }
  return chooseText(
    "Open the strongest local locator lane; exact passage targets and readable internal locators stay visible below.",
    "打开最稳的本地 locator；精确 passage 和可读内部 locator 都保留在下方。"
  );
}

function getAuthorityProseBucketNote(author, work) {
  const family = getAuthorityTreeObjectFamily(author);
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (isDanteConvivioWork(author, work)) {
    return chooseText(
      "Convivio-internal Trattato -> Capitolo locators; paragraph numbers stay on the occurrence evidence.",
      "这里放 Convivio 内部的 Trattato -> Capitolo 节点；段落号保留在 occurrence 证据里。"
    );
  }
  if (family === "scriptural_epistolary") {
    return chooseText("Readable chapter-level locators when verse detail is not stable.", "verse 不够稳时，保留可读的 chapter-level locator。");
  }
  if (family === "scriptural_psalmic") {
    return chooseText("Readable Psalm-level locators when verse detail is not stable.", "verse 不够稳时，保留可读的 Psalm-level locator。");
  }
  return chooseText("Readable internal locators that stop short of an exact passage node.", "可读的作品内部 locator，但不假装成精确 passage。");
}

function getAuthorityWorkOnlyBucketNote(author, work) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  return chooseText(
    "Stable work citation; no reliable internal locator is exposed yet.",
    "稳定的作品引用；暂时没有足够可靠的作品内部 locator。"
  );
}

function getAuthorityPseudoPassageBucketNote(author, work) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  return chooseText(
    "Locator-like evidence kept visible, but weaker than the stable locator lanes.",
    "保留看起来像 locator 的证据，但它弱于稳定 locator 层。"
  );
}

function getAuthorityChildNodeNote(author, scope) {
  const family = getAuthorityTreeObjectFamily(author);
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (scope === "structured_passage") {
    if (family === "scriptural_epistolary") {
      return chooseText(
        "Exact chapter -> verse targets.",
        "可直接落到稳定的 chapter -> verse。"
      );
    }
    if (family === "scriptural_psalmic") {
      return chooseText(
        "Exact Psalm -> Verse targets.",
        "可直接落到稳定的 Psalm -> Verse。"
      );
    }
    return chooseText(
      "Exact passage targets.",
      "精确 passage 节点。"
    );
  }
  if (family === "scriptural_psalmic") {
    return chooseText(
      "Readable Psalm-level locators when verse detail is not stable.",
      "verse 不够稳时，保留可读的 Psalm-level locator。"
    );
  }
  return chooseText(
    "Readable internal locators that stop short of an exact passage node.",
    "可读的作品内部 locator，但不假装成精确 passage。"
  );
}

function getDefaultAuthorityNodeId(work) {
  if ((work?.structured_locator_tree || []).length) {
    const firstNode = work.structured_locator_tree[0];
    return makeAuthorityNodeId("structured_passage", [getAuthorityTreeNodeKey(firstNode)]);
  }
  if ((work?.prose_locator_tree || []).length) {
    const firstNode = work.prose_locator_tree[0];
    return makeAuthorityNodeId("prose_locator", [getAuthorityTreeNodeKey(firstNode)]);
  }
  if ((work?.work_only_occurrences || []).length) {
    return makeAuthorityNodeId("work_only");
  }
  if ((work?.pseudo_passage_occurrences || []).length) {
    return makeAuthorityNodeId("pseudo_passage");
  }
  return null;
}

function getAuthorityNodeSelection(author, work, nodeId) {
  if (!work || !nodeId) {
    return null;
  }
  const [scope, primary, childKey] = nodeId.split("|");

  if (scope === "work_only") {
    return {
      scope: "work_only",
      label: "Work-level citations",
      staticPageLabel: null,
      note: getAuthorityWorkOnlyBucketNote(author, work),
      occurrences: work.work_only_occurrences || [],
    };
  }

  if (scope === "pseudo_passage") {
    return {
      scope: "pseudo_passage",
      label: "Weak locator evidence",
      staticPageLabel: null,
      note: getAuthorityPseudoPassageBucketNote(author, work),
      occurrences: work.pseudo_passage_occurrences || [],
    };
  }

  const sourceNodes = scope === "structured_passage"
    ? (work.structured_locator_tree || [])
    : (work.prose_locator_tree || []);

  const matchNode = sourceNodes.find((node) => getAuthorityTreeNodeKey(node) === primary);
  if (!matchNode) {
    return null;
  }

  if (!childKey) {
    const nodeOccurrences = matchNode.occurrences || [];
    const childOccurrences = (matchNode.children || []).flatMap((child) => child?.occurrences || []);
    return {
      scope,
      label: matchNode.label,
      staticPageLabel: matchNode.label,
      note: scope === "structured_passage"
        ? getAuthorityStructuredBucketNote(author)
        : getAuthorityProseBucketNote(author, work),
      occurrences: nodeOccurrences.length ? nodeOccurrences : childOccurrences,
    };
  }

  const child = (matchNode.children || []).find((item) => getAuthorityTreeNodeKey(item) === childKey);
  if (!child) {
    return null;
  }

  return {
    scope,
    label: `${matchNode.label} -> ${child.label}`,
    staticPageLabel: child.label,
    note: getAuthorityChildNodeNote(author, scope),
    occurrences: child.occurrences || [],
  };
}

function renderAuthorityBucketButton(label, count, isActive, nodeId, extraClass = "", disabled = false, note = "") {
  return `
    <button
      type="button"
      class="authority-bucket-card ${extraClass} ${isActive ? "is-active" : ""}"
      ${nodeId && !disabled ? `data-authority-node="${nodeId}"` : ""}
      ${disabled ? "disabled" : ""}>
      <strong>${escapeHtml(label)}</strong>
      <span>${count} occurrences</span>
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
    </button>
  `;
}

function renderAuthorityTreeNodes(scope, nodes, activeNodeId) {
  return (nodes || [])
    .map((node) => {
      const baseNodeId = makeAuthorityNodeId(scope, [getAuthorityTreeNodeKey(node)]);
      const childRows = (node.children || [])
        .map((child) => {
          const childNodeId = makeAuthorityNodeId(
            scope,
            [getAuthorityTreeNodeKey(node), getAuthorityTreeNodeKey(child)],
          );
          return `
            <button
              type="button"
              class="authority-tree-child ${childNodeId === activeNodeId ? "is-active" : ""}"
              data-authority-node="${childNodeId}">
              <strong>${escapeHtml(child.label)}</strong>
              <span>${child.count}</span>
            </button>
          `;
        })
        .join("");
      return `
        <article class="authority-tree-node">
          <button
            type="button"
            class="authority-tree-parent ${baseNodeId === activeNodeId ? "is-active" : ""}"
            data-authority-node="${baseNodeId}">
            <strong>${escapeHtml(node.label)}</strong>
            <span>${node.count}</span>
          </button>
          ${childRows ? `<div class="authority-tree-children">${childRows}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderAuthorityOccurrenceRows(occurrences, limit = 18) {
  return (occurrences || []).slice(0, limit)
    .map((occurrence) => {
      const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
      const canOpenSource = Boolean(occurrence.result_url || occurrence.commentary_record_id);
      const lineInfo = String(occurrence.line_info || "").trim();
      const commentaryName = normalizeAuthorityCommentaryName(occurrence.commentary_name);
      const workLabel = String(occurrence.work || "").trim();
      return `
        <button
          type="button"
          class="occurrence-row authority-occurrence-row ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""} ${canOpenSource ? "" : "is-source-missing"}"
          data-authority-occurrence-key="${escapeHtml(occurrenceKey)}">
          <strong>${escapeHtml(`${commentaryName || occurrence.commentary_name} · ${occurrence.cantica} ${occurrence.canto}${lineInfo ? ` · ${lineInfo}` : ""}`)}</strong>
          <span>${escapeHtml(occurrence.raw_mention || "raw mention unavailable")}</span>
          <small>${escapeHtml([workLabel, canOpenSource ? "" : "local source not currently bridged"].filter(Boolean).join(" · "))}</small>
        </button>
      `;
    })
    .join("");
}

function locateAuthorityHighlight(text, query) {
  const sourceText = String(text || "");
  const rawQuery = String(query || "").trim();
  if (!sourceText || !rawQuery) {
    return null;
  }

  const exactIndex = sourceText.indexOf(rawQuery);
  if (exactIndex >= 0) {
    return { start: exactIndex, end: exactIndex + rawQuery.length, matched: sourceText.slice(exactIndex, exactIndex + rawQuery.length) };
  }

  const escaped = rawQuery
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join("\\s+");
  if (!escaped) {
    return null;
  }
  const regex = new RegExp(escaped, "i");
  const match = regex.exec(sourceText);
  if (!match) {
    return null;
  }
  return { start: match.index, end: match.index + match[0].length, matched: match[0] };
}

function renderAuthorityHighlightedSourceText(sourceText, occurrence) {
  const text = String(sourceText || "");
  if (!text) {
    return `<p>${escapeHtml(choose("Source text is not currently available.", "原文文本当前不可用。"))}</p>`;
  }

  const candidates = [
    occurrence?.raw_mention,
    occurrence?.raw_passage,
    occurrence?.work,
    occurrence?.author,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return renderReadingBody(
    text,
    { chunkLongParagraphs: true },
    [],
    buildAuthorityTextHighlightGroups(text, [
      { terms: candidates.slice(0, 3), className: "authority-citation-highlight" },
    ])
  );
}

function getAuthorityResolutionLabel(occurrence) {
  const resolution = String(occurrence?.resolution_status || "").trim();
  if (resolution === "resolved_author_and_work") {
    return "author + work resolved";
  }
  if (resolution === "resolved_work_plus_inferred_author") {
    return "work resolved / author inferred";
  }
  if (resolution === "resolved_author_only") {
    return "author-only citation";
  }
  if (resolution) {
    return resolution.replaceAll("_", " ");
  }
  return "resolution unknown";
}

function getAuthorityOccurrenceLocationLabel(occurrence) {
  const cantica = String(occurrence?.cantica || "").trim();
  const shortCantica = CANTICA_SHORT_LABELS[String(cantica || "").toLowerCase()] || cantica;
  const cantoValue = Number(occurrence?.canto);
  const canto = Number.isFinite(cantoValue) ? String(cantoValue) : "";
  const lineInfo = String(occurrence?.line_info || "").trim();
  if (shortCantica && canto) {
    return `${shortCantica} ${canto}${lineInfo ? ` · ${lineInfo}` : ""}`;
  }
  const sampleName = inferAuthorityOccurrenceSampleName(occurrence);
  if (sampleName) {
    return `${sampleName}${lineInfo ? ` · ${lineInfo}` : ""}`;
  }
  if (lineInfo) {
    return lineInfo;
  }
  return "location unavailable";
}

function renderAuthoritySourcePanel(author, occurrence, options = {}) {
  const { inline = false } = options;
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (!occurrence) {
    return `
      <div class="authority-source-panel empty-state">
        ${escapeHtml(chooseText("Select an occurrence to open the local commentary source here.", "点一条 occurrence，这里会打开对应的注释原文，并尽量高亮当前 citation。"))}
      </div>
    `;
  }

  const source = getAuthorityCommentarySource(occurrence);
  const sampleName = occurrence.sample_name || `${String(occurrence.cantica || "").toLowerCase()}${occurrence.canto}`;
  const lineInfo = String(occurrence.line_info || "").trim();
  const firstLineMatch = lineInfo.match(/\d+/);
  const lineNumber = firstLineMatch ? Number(firstLineMatch[0]) : null;
  const canJump = Boolean(sampleName) && Number.isFinite(lineNumber);
  const commentaryName = normalizeAuthorityCommentaryName(occurrence.commentary_name || author?.canonical_name || "Commentary");
  const workLabel = String(occurrence.work || "").trim();
  const locationLabel = getAuthorityOccurrenceLocationLabel(occurrence);
  const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
  const isExpanded = inline ? true : Boolean(state.activeAuthoritySourceExpanded);

  return `
    <div
      class="authority-source-panel ${inline ? "is-inline" : ""} ${isExpanded ? "is-expanded" : "is-collapsed"}"
      ${inline ? "" : 'data-authority-source-toggle="true"'}>
      <div class="authority-source-head">
        <div>
          <h5>${escapeHtml(`${commentaryName} · ${locationLabel}`)}</h5>
          ${inline ? "" : `<p class="semantic-intro">${escapeHtml(chooseText("This panel reads from the local commentary-source bridge. Highlighting first tries the raw mention, then falls back to a conservative citation surface.", "这一层读取本地 commentary-source bridge 的注释原文；高亮会先尝试 raw mention，命不中时再退回更保守的 citation surface。"))}</p>`}
        </div>
        <div class="authority-inline-actions">
          ${canJump ? `<button type="button" class="lens-tab is-active" data-authority-open-line-key="${escapeHtml(occurrenceKey)}" data-occurrence-sample="${sampleName}" data-occurrence-line="${lineNumber}">${escapeHtml(chooseText("Open This Line", "打开这一行"))}</button>` : ""}
        </div>
      </div>
      <div class="locus-meta-row">
        <span class="pill">${escapeHtml(getAuthorityDisplayName(author) || occurrence.author || "Authority")}</span>
        ${workLabel ? `<span class="pill">${escapeHtml(workLabel)}</span>` : ""}
      </div>
      <div class="authority-source-body">
        ${
          source?.record_text
            ? renderAuthorityHighlightedSourceText(source.record_text, occurrence)
            : `<div class="empty-state">${escapeHtml(chooseText("The local commentary-source bridge does not currently expose source text for this occurrence.", "当前本地 commentary-source bridge 还没有找到这条 occurrence 的原文文本；这一层现在不再外跳 Dartmouth result，只保留本地原文口径。"))}</div>`
        }
      </div>
    </div>
  `;
}

function renderAuthoritySpecialCasePanel(author) {
  const specialCase = author?.special_case;
  if (!specialCase) {
    return "";
  }

  const textRows = (specialCase.text_occurrences_by_canto || []).slice(0, 4)
    .map((row) => `<span class="pill">${escapeHtml(`${row.canto_label}: ${row.occurrence_count} text hit${row.occurrence_count === 1 ? "" : "s"}`)}</span>`)
    .join("");
  const commentaryRows = (specialCase.commentary_occurrences_by_canto || []).slice(0, 4)
    .map((row) => `<span class="pill">${escapeHtml(`${row.canto_label}: ${row.total_mentions} commentary mentions`)}</span>`)
    .join("");
  const roleSummary = Object.entries(specialCase.mention_role_breakdown || {})
    .map(([key, value]) => {
      const label = key
        .replaceAll("_", " ")
        .replace("authority citation", "authority")
        .replace("character mention", "character")
        .replace("ambiguous author character", "ambiguous");
      return `<span class="pill">${escapeHtml(`${label}: ${value}`)}</span>`;
    })
    .join("");
  const heading = specialCase.status === "active" ? "Special-case active" : "Special-case candidate";

  return `
    <div class="authority-special-case-panel">
      <div class="semantic-kicker">${escapeHtml(heading)}</div>
      <h5>${escapeHtml(specialCase.scope_label || "special-case scope")}</h5>
      <p class="semantic-intro">${escapeHtml(specialCase.explanation || "")}</p>
      <div class="locus-meta-row">
        <span class="pill">${escapeHtml(`text cantos: ${specialCase.text_canto_total || 0}`)}</span>
        <span class="pill">${escapeHtml(`commentary cantos: ${specialCase.commentary_canto_total || 0}`)}</span>
      </div>
      ${roleSummary ? `<div class="locus-meta-row">${roleSummary}</div>` : ""}
      ${textRows ? `<div class="locus-meta-row">${textRows}</div>` : ""}
      ${commentaryRows ? `<div class="locus-meta-row">${commentaryRows}</div>` : ""}
    </div>
  `;
}

function renderAuthorityWorksLens(author) {
  const worksTree = getLoadedAuthorityWorksTree(author);
  if (!worksTree?.works?.length) {
    const summaryCards = (author?.works_tree?.works || [])
      .map(
        (work) => `
          <div class="authority-work-card">
            <strong>${escapeHtml(getAuthorityWorkDisplayName(author, work))}</strong>
            <span>${escapeHtml(`${work.total_mentions || 0} total mentions`)}</span>
            <small>${escapeHtml(`structured ${work.locator_bucket_counts?.structured_passage || 0} · ${getAuthorityProseLocatorCountLabel(author, work)} ${work.locator_bucket_counts?.prose_locator || 0} · work-only ${work.locator_bucket_counts?.work_only || 0} · pseudo ${work.locator_bucket_counts?.pseudo_passage || 0}`)}</small>
          </div>
        `
      )
      .join("");
    return `
        <div class="authority-stage-block">
          <div class="semantic-kicker">Step C</div>
          <h4>${escapeHtml(`${getAuthorityDisplayName(author) || "Authority"} Works Lens`)}</h4>
        <p class="semantic-intro">${escapeHtml(choose("The works tree loads on demand, so this stage begins with a lighter overview. Once you enter it, the front end fetches the corresponding tree for that author.", "works tree 现在按需加载，所以这一层会先显示一个更轻的 overview；只要进入这里，前端就会去拉对应 author 的树文件。"))}</p>
        ${renderAuthorityReadingContractBanner(author, { compact: true, activeView: "drilldown" })}
        ${renderAuthoritySpecialCasePanel(author)}
        <div class="vocabulary-section-grid">
          <div>
            <h4>Works Overview</h4>
            <div class="occurrence-list">${summaryCards || `<div class="empty-state">${escapeHtml(choose("No works-tree summary is available yet.", "当前还没有可读的 works tree summary。"))}</div>`}</div>
          </div>
          <div>
            <h4>Tree Status</h4>
            <div class="empty-state">${escapeHtml(choose("The works tree is loading on demand. If you have already entered this stage, give it a brief moment and the expandable nodes should appear.", "当前 works tree 正在按需加载；如果你已经点进这一层，再等一瞬就会切成可展开节点。"))}</div>
          </div>
        </div>
      </div>
    `;
  }
  const works = worksTree.works || [];
  const selectedWork = getSelectedAuthorityWork(author);
  if (!selectedWork) {
    return renderGenericAuthorityDrilldownStage(author);
  }

  if (state.activeAuthorityWork !== selectedWork.canonical_work) {
    state.activeAuthorityWork = selectedWork.canonical_work;
  }

  const defaultNodeId = getDefaultAuthorityNodeId(selectedWork);
  const requestedNodeId = state.activeAuthorityNode || defaultNodeId;
  const resolvedNodeId = getAuthorityNodeSelection(author, selectedWork, requestedNodeId) ? requestedNodeId : defaultNodeId;
  const selectedNode = getAuthorityNodeSelection(author, selectedWork, resolvedNodeId);
  if (resolvedNodeId && state.activeAuthorityNode !== resolvedNodeId) {
    state.activeAuthorityNode = resolvedNodeId;
  }

  const structuredDefaultNodeId = (selectedWork.structured_locator_tree || []).length
    ? makeAuthorityNodeId("structured_passage", [getAuthorityTreeNodeKey(selectedWork.structured_locator_tree[0])])
    : null;
  const proseDefaultNodeId = (selectedWork.prose_locator_tree || []).length
    ? makeAuthorityNodeId("prose_locator", [getAuthorityTreeNodeKey(selectedWork.prose_locator_tree[0])])
    : null;
  const objectFamily = getAuthorityTreeObjectFamily(author);
  const selectedWorkHref = getAuthorityWorkPageHref(author, selectedWork);
  const structuredHeading = objectFamily === "scriptural_epistolary"
    ? "Exact locators (chapter -> verse)"
    : objectFamily === "scriptural_psalmic"
      ? "Exact locators (psalm -> verse)"
      : "Exact locators";
  const proseHeading = objectFamily === "scriptural_epistolary"
    ? "Readable locators (chapter-level)"
    : objectFamily === "scriptural_psalmic"
      ? "Readable locators (psalm-level)"
      : isDanteConvivioWork(author, selectedWork)
        ? "Trattati / Capitoli"
        : "Readable locators";

  const workButtons = works
    .map((work) => {
      const bucketSummary = getAuthorityWorkBucketSummary(author, work);
      return `
        <button
          type="button"
          class="authority-work-card authority-work-button ${work.canonical_work === selectedWork.canonical_work ? "is-active" : ""}"
          data-authority-work="${escapeHtml(work.canonical_work)}">
          <strong>${escapeHtml(getAuthorityWorkDisplayName(author, work))}</strong>
          <span>${escapeHtml(`${work.total_mentions} total mentions`)}</span>
          <small>${escapeHtml(bucketSummary)}</small>
        </button>
      `;
    })
    .join("");

  const locatorCount = Number(selectedWork.locator_bucket_counts.structured_passage || 0)
    + Number(selectedWork.locator_bucket_counts.prose_locator || 0);
  const locatorDefaultNodeId = structuredDefaultNodeId || proseDefaultNodeId;
  const activeScope = selectedNode?.scope || "";
  const bucketButtons = [
    locatorCount
      ? renderAuthorityBucketButton(
        "Locator",
        locatorCount,
        ["structured_passage", "prose_locator"].includes(activeScope),
        locatorDefaultNodeId,
        "is-strong",
        !locatorDefaultNodeId,
        getAuthorityLocatorBucketNote(author, selectedWork),
      )
      : "",
    (selectedWork.locator_bucket_counts.work_only || (selectedWork.work_only_occurrences || []).length)
      ? renderAuthorityBucketButton(
        "Work-level",
        selectedWork.locator_bucket_counts.work_only,
        (resolvedNodeId || "") === makeAuthorityNodeId("work_only"),
        makeAuthorityNodeId("work_only"),
        "is-neutral",
        !(selectedWork.work_only_occurrences || []).length,
        getAuthorityWorkOnlyBucketNote(author, selectedWork),
      )
      : "",
    (selectedWork.locator_bucket_counts.pseudo_passage || (selectedWork.pseudo_passage_occurrences || []).length)
      ? renderAuthorityBucketButton(
        "Review",
        selectedWork.locator_bucket_counts.pseudo_passage,
        (resolvedNodeId || "") === makeAuthorityNodeId("pseudo_passage"),
        makeAuthorityNodeId("pseudo_passage"),
        "is-warning",
        !(selectedWork.pseudo_passage_occurrences || []).length,
        getAuthorityPseudoPassageBucketNote(author, selectedWork),
      )
      : "",
  ].filter(Boolean).join("");

  const structuredTree = renderAuthorityTreeNodes("structured_passage", selectedWork.structured_locator_tree || [], resolvedNodeId || "");
  const proseTree = renderAuthorityTreeNodes("prose_locator", selectedWork.prose_locator_tree || [], resolvedNodeId || "");
  const occurrenceRows = renderAuthorityOccurrenceRows(selectedNode?.occurrences || []);
  const selectedOccurrence = getAuthoritySelectedOccurrence(selectedNode?.occurrences || []);
  const selectedBranchHref = getAuthorityBranchPageHref(author, selectedWork, selectedNode);

  return `
    <div class="authority-stage-block">
      <div class="semantic-kicker">Step C</div>
      <h4>${escapeHtml(`${getAuthorityDisplayName(author)} Works Lens`)}</h4>
      <p class="semantic-intro">${escapeHtml(getAuthorityWorksLensIntro(author))}</p>
      ${renderAuthorityReadingContractBanner(author, { compact: true, activeView: "drilldown" })}
      ${renderAuthoritySpecialCasePanel(author)}
      <div class="vocabulary-section-grid">
        <div>
          <h4>Works Overview</h4>
          <div class="occurrence-list">${workButtons}</div>
        </div>
        <div>
          <h4>${escapeHtml(getAuthorityWorkDisplayName(author, selectedWork))}</h4>
          ${selectedWorkHref ? `<p class="semantic-intro"><a href="${escapeHtml(selectedWorkHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static opera page", "打开静态 opera 页面"))}</a></p>` : ""}
          <div class="authority-bucket-grid">${bucketButtons}</div>
          <div class="authority-tree-columns">
            <div class="authority-tree-panel">
              <h5>${escapeHtml(structuredHeading)}</h5>
              <div class="authority-tree-list">${structuredTree || `<div class="empty-state">${escapeHtml(choose("This work does not currently expose a stable structured passage tree.", "当前这个 work 还没有稳定的 structured passage tree。"))}</div>`}</div>
            </div>
            <div class="authority-tree-panel">
              <h5>${escapeHtml(proseHeading)}</h5>
              <div class="authority-tree-list">${proseTree || `<div class="empty-state">${escapeHtml(choose("This work does not currently expose an expandable prose locator tree.", "当前这个 work 还没有可展开的 prose locator tree。"))}</div>`}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="authority-stage-block authority-stage-block-secondary">
        <div id="authority-selected-node"></div>
        <div class="semantic-kicker">Selected Node</div>
        <h4>${escapeHtml(selectedNode?.label || choose("Select a node", "选择一个 node"))}</h4>
        <p class="semantic-intro">${escapeHtml(selectedNode?.note || choose("Choose a bucket or node to open the commentary occurrences gathered here.", "选择一个 bucket 或 node，这里就会展开对应的 commentary occurrences。"))}</p>
        ${selectedBranchHref ? `<p class="semantic-intro"><a href="${escapeHtml(selectedBranchHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static branch page", "打开静态 branch 页面"))}</a></p>` : ""}
        <div class="occurrence-list">${occurrenceRows || `<div class="empty-state">${escapeHtml(choose("No readable occurrences are available under this node yet.", "当前这个节点下还没有可读的 occurrences。"))}</div>`}</div>
      </div>
      <div class="authority-stage-block authority-stage-block-secondary">
        ${renderAuthoritySourcePanel(author, selectedOccurrence)}
      </div>
    </div>
  `;
}

function getActiveAuthorityAuthor() {
  const authors = getAllAuthorityAuthors();
  return authors.find((author) => author.author_id === state.activeAuthority) || authors[0] || null;
}

function findAuthorityOccurrenceByKey(author, occurrenceKey) {
  if (!author || !occurrenceKey) {
    return null;
  }
  const key = String(occurrenceKey);
  const seen = [];
  seen.push(...getCurrentAuthorityCommentaryStageOccurrences(author));
  seen.push(...(author?.occurrences || []));
  const worksTree = getLoadedAuthorityWorksTree(author);
  for (const work of worksTree?.works || []) {
    seen.push(...(work.work_only_occurrences || []));
    seen.push(...(work.pseudo_passage_occurrences || []));
    const walk = (nodes) => {
      for (const node of nodes || []) {
        seen.push(...(node.occurrences || []));
        walk(node.children || []);
      }
    };
    walk(work.structured_locator_tree || []);
    walk(work.prose_locator_tree || []);
  }
  return seen.find((occurrence) => makeAuthorityOccurrenceKey(occurrence) === key) || null;
}

async function activateAuthorityOccurrenceKey(occurrenceKey, { scrollToSource = false } = {}) {
  state.activeAuthorityOccurrenceKey = occurrenceKey || null;
  state.activeAuthoritySourceExpanded = Boolean(scrollToSource);
  const author = getActiveAuthorityAuthor();
  await ensureAuthorityCommentaryLineIndexLoaded(author);
  await ensureAuthorityWorksTreeLoaded(author);
  const occurrence = getCurrentAuthorityCommentaryStageOccurrences(author)
    .find((item) => makeAuthorityOccurrenceKey(item) === state.activeAuthorityOccurrenceKey)
    || findAuthorityOccurrenceByKey(author, state.activeAuthorityOccurrenceKey);
  if (occurrence) {
    syncAuthorityCommentarySelectionToOccurrence(author, occurrence);
  }
  if (occurrence && (occurrence.result_url || occurrence.commentary_record_id)) {
    await ensureAuthorityCommentarySourceLoaded(occurrence);
  }
  renderFigurePanel();
  if (scrollToSource) {
    requestAnimationFrame(() => {
      const panel = elements.figurePanel.querySelector("#authority-commentary-source");
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function bindScholarLensEvents() {
  if (elements.figurePanel && !elements.figurePanel.dataset.authorityDelegatedBound) {
    elements.figurePanel.dataset.authorityDelegatedBound = "true";
    elements.figurePanel.addEventListener("click", async (event) => {
      const lensTabButton = event.target.closest("[data-lens-tab]");
      if (lensTabButton && elements.figurePanel.contains(lensTabButton)) {
        state.activeScholarTab = lensTabButton.dataset.lensTab;
        if (state.activeScholarTab === "authority") {
          try {
            await ensureAuthorityLayerLoaded();
          } catch (error) {
            // Keep the panel honest; renderFigurePanel will show the fallback empty state.
          }
        }
        renderFigurePanel();
        return;
      }

      const figureButton = event.target.closest("[data-figure-id]");
      if (figureButton && elements.figurePanel.contains(figureButton)) {
        state.activeFigure = figureButton.dataset.figureId;
        state.activeFigureFilterBandKey = null;
        state.activeFigureFilterLabel = null;
        renderFigurePanel();
        return;
      }

      const figureFilterButton = event.target.closest("[data-figure-filter-band]");
      if (figureFilterButton && elements.figurePanel.contains(figureFilterButton)) {
        const nextBandKey = figureFilterButton.dataset.figureFilterBand || null;
        const nextLabel = figureFilterButton.dataset.figureFilterLabel || null;
        const isSameFilter = String(state.activeFigureFilterBandKey || "") === String(nextBandKey || "")
          && String(state.activeFigureFilterLabel || "") === String(nextLabel || "");
        state.activeFigureFilterBandKey = isSameFilter ? null : nextBandKey;
        state.activeFigureFilterLabel = isSameFilter ? null : nextLabel;
        renderFigurePanel();
        if (!isSameFilter && nextBandKey) {
          requestAnimationFrame(() => {
            const band = elements.figurePanel.querySelector(`[data-figure-band-panel="${CSS.escape(nextBandKey)}"]`);
            if (band) {
              band.scrollIntoView({ behavior: "smooth", block: "nearest" });
              return;
            }
            elements.figurePanel.querySelector(".figure-occurrence-anchor")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
        return;
      }

      const authorityButton = event.target.closest("[data-authority-id]");
      if (authorityButton && elements.figurePanel.contains(authorityButton)) {
        state.activeAuthority = authorityButton.dataset.authorityId;
        state.activeAuthorityView = "text";
        state.activeAuthorityWork = null;
        state.activeAuthorityNode = null;
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthorityScope = null;
        state.activeAuthorityRole = null;
        state.activeAuthorityCommentarySample = null;
        state.activeAuthorityCommentaryLineKey = null;
        state.activeAuthoritySourceExpanded = false;
        await ensureAuthorityAuthorDetailLoaded(getActiveAuthorityAuthor());
        renderFigurePanel();
        return;
      }

      const authorityViewButton = event.target.closest("[data-authority-view]");
      if (authorityViewButton && elements.figurePanel.contains(authorityViewButton)) {
        state.activeAuthorityView = authorityViewButton.dataset.authorityView || "text";
        state.activeAuthorityOccurrenceKey = null;
        if (state.activeAuthorityView !== "drilldown") {
          state.activeAuthorityScope = null;
          state.activeAuthorityRole = null;
        }
        if (state.activeAuthorityView !== "commentary") {
          state.activeAuthorityCommentarySample = null;
          state.activeAuthorityCommentaryLineKey = null;
        }
        state.activeAuthoritySourceExpanded = false;
        await ensureAuthorityAuthorDetailLoaded(getActiveAuthorityAuthor());
        renderFigurePanel();

        const activeAuthor = getActiveAuthorityAuthor();
        if (state.activeAuthorityView === "commentary") {
          ensureAuthorityCommentaryLineIndexLoaded(activeAuthor)
            .then(() => renderFigurePanel())
            .catch(() => renderFigurePanel());
        }
        if (state.activeAuthorityView === "drilldown") {
          Promise.allSettled([
            ensureAuthorityWorksTreeLoaded(activeAuthor),
            ensureAuthorityFlatWorkObjectLoaded(activeAuthor),
          ]).then(() => renderFigurePanel());
        }
        return;
      }

      const commentarySampleButton = event.target.closest("[data-authority-commentary-sample]");
      if (commentarySampleButton && elements.figurePanel.contains(commentarySampleButton)) {
        await ensureAuthorityCommentaryLineIndexLoaded(getActiveAuthorityAuthor());
        state.activeAuthorityCommentarySample = commentarySampleButton.dataset.authorityCommentarySample || null;
        state.activeAuthorityCommentaryLineKey = null;
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthoritySourceExpanded = false;
        renderFigurePanel();
        return;
      }

      const commentaryLineButton = event.target.closest("[data-authority-commentary-line]");
      if (commentaryLineButton && elements.figurePanel.contains(commentaryLineButton)) {
        state.activeAuthorityCommentaryLineKey = commentaryLineButton.dataset.authorityCommentaryLine || null;
        const author = getActiveAuthorityAuthor();
        const selectedSample = getSelectedAuthorityCommentarySample(author);
        const selectedLineGroup = getSelectedAuthorityCommentaryLine(selectedSample);
        const firstOccurrence = selectedLineGroup?.occurrences?.[0] || null;
        if (firstOccurrence) {
          await activateAuthorityOccurrenceKey(makeAuthorityOccurrenceKey(firstOccurrence), { scrollToSource: false });
        } else {
          state.activeAuthorityOccurrenceKey = null;
          state.activeAuthoritySourceExpanded = false;
          renderFigurePanel();
        }
        return;
      }

      const authorityScopeButton = event.target.closest("[data-authority-scope]");
      if (authorityScopeButton && elements.figurePanel.contains(authorityScopeButton)) {
        state.activeAuthorityScope = authorityScopeButton.dataset.authorityScope || "__all__";
        state.activeAuthorityRole = null;
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthoritySourceExpanded = false;
        renderFigurePanel();
        return;
      }

      const authorityRoleButton = event.target.closest("[data-authority-role]");
      if (authorityRoleButton && elements.figurePanel.contains(authorityRoleButton)) {
        state.activeAuthorityRole = authorityRoleButton.dataset.authorityRole || "__all__";
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthoritySourceExpanded = false;
        renderFigurePanel();
        return;
      }

      const authorityWorkButton = event.target.closest("[data-authority-work]");
      if (authorityWorkButton && elements.figurePanel.contains(authorityWorkButton)) {
        await ensureAuthorityWorksTreeLoaded(getActiveAuthorityAuthor());
        await ensureAuthorityFlatWorkObjectLoaded(getActiveAuthorityAuthor());
        state.activeAuthorityWork = authorityWorkButton.dataset.authorityWork || null;
        state.activeAuthorityNode = null;
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthoritySourceExpanded = false;
        renderFigurePanel();
        return;
      }

      const authorityNodeButton = event.target.closest("[data-authority-node]");
      if (authorityNodeButton && elements.figurePanel.contains(authorityNodeButton)) {
        rememberViewportState();
        state.activeAuthorityNode = authorityNodeButton.dataset.authorityNode || null;
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthoritySourceExpanded = false;
        renderFigurePanel();
        requestAnimationFrame(() => {
          const panel = elements.figurePanel.querySelector("#authority-selected-node");
          panel?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }

      const authorityOpenLineButton = event.target.closest("[data-authority-open-line-key]");
      if (authorityOpenLineButton && elements.figurePanel.contains(authorityOpenLineButton)) {
        event.preventDefault();
        rememberViewportState();
        const occurrenceKey = authorityOpenLineButton.dataset.authorityOpenLineKey || null;
        if (occurrenceKey) {
          await activateAuthorityOccurrenceKey(occurrenceKey, { scrollToSource: true });
        }
        const sampleName = authorityOpenLineButton.dataset.occurrenceSample || null;
        const lineNumber = Number(authorityOpenLineButton.dataset.occurrenceLine);
        if (sampleName && Number.isFinite(lineNumber)) {
          await jumpToSampleLine(sampleName, lineNumber, null, { suppressCoverageScroll: true });
        }
        requestAnimationFrame(() => {
          const panel = elements.figurePanel.querySelector("#authority-commentary-source");
          panel?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }

      const authorityOccurrenceButton = event.target.closest("[data-authority-occurrence-key]");
      if (authorityOccurrenceButton && elements.figurePanel.contains(authorityOccurrenceButton)) {
        rememberViewportState();
        await activateAuthorityOccurrenceKey(authorityOccurrenceButton.dataset.authorityOccurrenceKey || null, { scrollToSource: true });
        requestAnimationFrame(() => {
          const panel = elements.figurePanel.querySelector("[data-authority-source-toggle]");
          panel?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }

      const lineJumpButton = event.target.closest("[data-occurrence-sample]");
      if (lineJumpButton && elements.figurePanel.contains(lineJumpButton)) {
        rememberViewportState();
        await jumpToSampleLine(
          lineJumpButton.dataset.occurrenceSample,
          Number(lineJumpButton.dataset.occurrenceLine)
        );
        return;
      }

      const chip = event.target.closest("[data-authority-commentary-chip-key]");
      if (chip && elements.figurePanel.contains(chip)) {
        event.preventDefault();
        event.stopPropagation();
        rememberViewportState();
        await activateAuthorityOccurrenceKey(chip.dataset.authorityCommentaryChipKey || null, { scrollToSource: true });
        return;
      }

      const sourcePanel = event.target.closest("[data-authority-source-toggle]");
      if (sourcePanel && elements.figurePanel.contains(sourcePanel) && !event.target.closest("[data-occurrence-sample]")) {
        state.activeAuthoritySourceExpanded = !state.activeAuthoritySourceExpanded;
        renderFigurePanel();
      }
    });
  }
}

function renderRecurrencePanel(payload) {
  return lineLevelPanel.renderRecurrencePanel(payload);
}

function syncSampleSelection() {
  for (const button of elements.sampleBrowser.querySelectorAll(".canto-chip")) {
    const isActive = Boolean(button.dataset.sampleId) && button.dataset.sampleId === state.currentSampleEntry?.id;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  }
}

function renderStatusLabel(status) {
  const labels = {
    "full-demo-ready": "Full Demo Ready",
    "semantic-fields-ready": "Semantic Fields Ready",
    "coverage-only": "Coverage Only",
    "shell-only": "Shell Only",
    incomplete: "Incomplete",
  };
  return labels[status] || status;
}

function renderBrowserSummary(mountedCount, totalSlots) {
  if (state.uiLanguage === "en") {
    if (mountedCount === totalSlots) {
      return "Open any canto directly from the full <em>Commedia</em> map. Then select a line and pin cards to compare.";
    }
    return "Open any available canto directly from the <em>Commedia</em> map. Then select a line and pin cards to compare.";
  }
  if (state.uiLanguage === "zh") {
    if (mountedCount === totalSlots) {
      return "现在可以直接从这里进入整部《神曲》的任一 canto，然后选一行，再把 cards pin 到比较区。";
    }
    return "现在可以直接从这里进入当前已开放的 canto，然后选一行，再把 cards pin 到比较区。";
  }
  if (mountedCount === totalSlots) {
    return "现在可以直接从这里进入整部《神曲》的任一 canto，然后选一行，再把 cards pin 到比较区。";
  }
  return "现在可以直接从这里进入当前已开放的 canto，然后选一行，再把 cards pin 到比较区。";
}

function formatCurrentCantoLabel() {
  const entry = state.currentSampleEntry;
  if (!entry) {
    return getUiText("coverage.title");
  }
  const cantica = String(entry.cantica || entry.title || "").trim();
  const cantoNumber = Number(entry.canto);
  const cantoLabel = Number.isFinite(cantoNumber)
    ? toRomanNumeral(cantoNumber)
    : String(entry.canto || "").trim();
  return [cantica, cantoLabel].filter(Boolean).join(" ");
}

function toRomanNumeral(value) {
  const numerals = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Number(value) || 0;
  let result = "";
  for (const [amount, symbol] of numerals) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }
  return result || String(value);
}

function normalizeEasterEggQuery(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === "oh" ? "o" : token))
    .join(" ");
}

const APPROVED_UI_EASTER_EGG_PILOTS = Object.freeze([
  Object.freeze({
    id: "purgatorio30-line21-lily",
    sampleId: "purgatorio30",
    lineNumber: 21,
    effect: "lily",
    statusMessage: "Approved lily pilot triggered.",
    feedbackTone: "success",
    feedback: {
      en: "Jumped to Purgatorio 30, line 21. The approved lily pilot has been triggered.",
      zh: "已跳到 Purgatorio 30 第 21 行，并触发已批准的百合彩蛋。",
    },
    acceptedQueries: new Set([
      "manibus o lilia date plenis",
      "manibus o date lilia plenis",
      "manibus oh date lilia plenis",
      "manibus date lilia plenis",
    ].map((query) => normalizeEasterEggQuery(query))),
  }),
  Object.freeze({
    id: "purgatorio30-line48-fire",
    sampleId: "purgatorio30",
    lineNumber: 48,
    effect: "fire",
    statusMessage: "Approved antica fiamma pilot triggered.",
    feedbackTone: "success",
    feedback: {
      en: "Jumped to Purgatorio 30, line 48. The approved antica fiamma pilot has been triggered.",
      zh: "已跳到 Purgatorio 30 第 48 行，并触发已批准的 antica fiamma 彩蛋。",
    },
    acceptedQueries: new Set([
      "conosco i segni de l'antica fiamma",
      "conosco i segni de l antica fiamma",
      "conosco i segni de lantica fiamma",
    ].map((query) => normalizeEasterEggQuery(query))),
  }),
]);

let approvedUiEasterEggCleanupTimer = 0;
let lastApprovedUiEasterEggTriggerKey = "";
let lastApprovedUiEasterEggTriggerAt = 0;

function getApprovedUiEasterEggPilotForLine(sampleId, lineNumber) {
  return APPROVED_UI_EASTER_EGG_PILOTS.find((pilot) =>
    pilot.sampleId === sampleId && Number(lineNumber) === pilot.lineNumber) || null;
}

function getApprovedUiEasterEggMatch(rawValue) {
  const normalizedQuery = normalizeEasterEggQuery(rawValue);
  if (!normalizedQuery) {
    return null;
  }
  const pilot = APPROVED_UI_EASTER_EGG_PILOTS.find((candidate) => candidate.acceptedQueries.has(normalizedQuery));
  if (!pilot) {
    return null;
  }
  return {
    ...pilot,
    normalizedQuery,
  };
}

function isApprovedUiEasterEggLine(sampleId, lineNumber) {
  return Boolean(getApprovedUiEasterEggPilotForLine(sampleId, lineNumber));
}

function ensureApprovedUiEasterEggOverlay(effect = "lily") {
  const host = document.body;
  if (!host) {
    return null;
  }
  let overlay = host.querySelector(".lily-fall-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "lily-fall-overlay";
    overlay.setAttribute("aria-hidden", "true");
    host.appendChild(overlay);
  }
  overlay.dataset.effect = effect;
  overlay.classList.toggle("effect-lily", effect === "lily");
  overlay.classList.toggle("effect-fire", effect === "fire");
  return overlay;
}

function clearApprovedUiEasterEggOverlay() {
  if (approvedUiEasterEggCleanupTimer) {
    window.clearTimeout(approvedUiEasterEggCleanupTimer);
    approvedUiEasterEggCleanupTimer = 0;
  }
  const overlay = document.querySelector("body > .lily-fall-overlay");
  if (!overlay) {
    return;
  }
  overlay.classList.remove("is-active");
  overlay.classList.remove("effect-lily", "effect-fire");
  overlay.dataset.effect = "";
  overlay.replaceChildren();
}

function appendLilyPilotItems(fragment, dropDistance) {
  for (let index = 0; index < 22; index += 1) {
    const item = document.createElement("span");
    item.className = "lily-fall-item";
    const scale = 0.7 + Math.random() * 0.95;
    const opacity = 0.48 + Math.random() * 0.36;
    item.style.setProperty("--lily-left", `${2 + Math.random() * 96}%`);
    item.style.setProperty("--lily-delay", `${(Math.random() * 0.9).toFixed(2)}s`);
    item.style.setProperty("--lily-duration", `${(3.4 + Math.random() * 1.9).toFixed(2)}s`);
    item.style.setProperty("--lily-rotate", `${(-10 + Math.random() * 20).toFixed(1)}deg`);
    item.style.setProperty("--lily-spin", `${(-18 + Math.random() * 36).toFixed(1)}deg`);
    item.style.setProperty("--lily-drift-end", `${(-56 + Math.random() * 112).toFixed(1)}px`);
    item.style.setProperty("--lily-bloom-tilt", `${(-12 + Math.random() * 24).toFixed(1)}deg`);
    item.style.setProperty("--lily-drop-distance", `${dropDistance}px`);
    item.style.setProperty("--lily-scale", scale.toFixed(2));
    item.style.setProperty("--lily-opacity", opacity.toFixed(2));
    item.innerHTML = `
      <span class="lily-fall-bloom">
        <span class="lily-fall-petal is-left"></span>
        <span class="lily-fall-petal is-center"></span>
        <span class="lily-fall-petal is-right"></span>
      </span>
      <span class="lily-fall-stem"></span>
    `;
    fragment.appendChild(item);
  }
}

function appendFirePilotItems(fragment, dropDistance) {
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 960);
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0, 720);
  const centerX = viewportWidth * 0.5;
  const centerY = viewportHeight * 0.5;
  const clusterSize = Math.min(Math.max(Math.min(viewportWidth * 0.56, viewportHeight * 0.64), 320), 590);

  const item = document.createElement("span");
  item.className = "fire-bloom-item";
  item.style.setProperty("--fire-left", `${centerX.toFixed(1)}px`);
  item.style.setProperty("--fire-top", `${centerY.toFixed(1)}px`);
  item.style.setProperty("--fire-delay", "0.08s");
  item.style.setProperty("--fire-duration", "3.1s");
  item.style.setProperty("--fire-rotate", `${(-8 + Math.random() * 16).toFixed(1)}deg`);
  item.style.setProperty("--fire-spin", `${(-10 + Math.random() * 20).toFixed(1)}deg`);
  item.style.setProperty("--fire-drift-x", `${(-10 + Math.random() * 20).toFixed(1)}px`);
  item.style.setProperty("--fire-drift-y", `${(-22 - Math.random() * 18).toFixed(1)}px`);
  item.style.setProperty("--fire-scale-end", `${(1.16 + Math.random() * 0.22).toFixed(2)}`);
  item.style.setProperty("--fire-opacity", `${(0.54 + Math.random() * 0.12).toFixed(2)}`);
  item.style.setProperty("--fire-cluster-size", `${clusterSize.toFixed(1)}px`);
  item.style.setProperty("--fire-core-size", `${(clusterSize * (0.48 + Math.random() * 0.06)).toFixed(1)}px`);
  item.style.setProperty("--fire-small-back-size", `${(clusterSize * (0.16 + Math.random() * 0.025)).toFixed(1)}px`);
  item.style.setProperty("--fire-small-front-size", `${(clusterSize * (0.22 + Math.random() * 0.03)).toFixed(1)}px`);
  item.innerHTML = `
    <span class="fire-bloom-glow"></span>
    <span class="fire-bloom-core">🔥</span>
    <span class="fire-bloom-satellite is-back">🔥</span>
    <span class="fire-bloom-satellite is-front">🔥</span>
  `;
  fragment.appendChild(item);
}

function maybeTriggerApprovedUiEasterEgg(reason = "line-open") {
  const sampleId = state.currentSampleEntry?.id || state.overview?.sample || null;
  const lineNumber = Number(state.selectedLine);
  const pilot = getApprovedUiEasterEggPilotForLine(sampleId, lineNumber);
  if (!pilot) {
    if (reason === "line-open") {
      clearApprovedUiEasterEggOverlay();
    }
    return;
  }

  const overlay = ensureApprovedUiEasterEggOverlay(pilot.effect);
  if (!overlay) {
    return;
  }

  const triggerKey = `${pilot.id}:${sampleId}:${lineNumber}`;
  const now = Date.now();
  const overlayAlreadyPopulated = overlay.childElementCount > 0;
  const forceRetrigger = reason === "coverage-row-click" || reason === "coverage-row-settle" || reason === "analysis-layer-click";
  if (!forceRetrigger && lastApprovedUiEasterEggTriggerKey === triggerKey && now - lastApprovedUiEasterEggTriggerAt < 1600 && overlayAlreadyPopulated) {
    return;
  }
  lastApprovedUiEasterEggTriggerKey = triggerKey;
  lastApprovedUiEasterEggTriggerAt = now;

  if (approvedUiEasterEggCleanupTimer) {
    window.clearTimeout(approvedUiEasterEggCleanupTimer);
    approvedUiEasterEggCleanupTimer = 0;
  }

  overlay.replaceChildren();
  const fragment = document.createDocumentFragment();
  const overlayRect = overlay.getBoundingClientRect();
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0, 720);
  const dropDistance = Math.min(
    Math.max(Math.min(overlayRect.height * 0.72, viewportHeight * 0.92), 420),
    980,
  );

  if (pilot.effect === "fire") {
    appendFirePilotItems(fragment, dropDistance);
  } else {
    appendLilyPilotItems(fragment, dropDistance);
  }

  overlay.appendChild(fragment);
  overlay.classList.remove("is-active");
  void overlay.offsetWidth;
  overlay.classList.add("is-active");

  approvedUiEasterEggCleanupTimer = window.setTimeout(() => {
    overlay.classList.remove("is-active");
    overlay.replaceChildren();
    approvedUiEasterEggCleanupTimer = 0;
  }, 6400);
}

async function handleQuickJump() {
  const rawValue = elements.quickJumpInput.value.trim();
  state.searchQuery = rawValue;
  state.searchSubmittedQuery = "";
  const navigation = parseNavigationQuery(rawValue);

  if (navigation.kind === "sample" || navigation.kind === "line") {
    rememberViewportState();
    const jump = await executeNavigationQuery(navigation);
    setQuickJumpFeedback(jump.message, jump.tone);
    setSearchStatus(jump.status, jump.searchStatusMessage);
    state.searchResults = [];
    updateQuickJumpResults();
    renderSearchResultsShell();
    return;
  }

  if (navigation.kind === "invalid" && !rawValue) {
    state.searchResults = [];
    setSearchStatus("idle", "Search UI ready.");
    updateQuickJumpResults();
    renderSearchResultsShell();
    return;
  }

  const approvedUiPilot = getApprovedUiEasterEggMatch(rawValue);
  if (approvedUiPilot) {
    rememberViewportState();
    await jumpToSampleLine(
      approvedUiPilot.sampleId,
      approvedUiPilot.lineNumber,
      null,
      { suppressCoverageScroll: true },
    );
    scrollToRecordsSection();
    clearSearchPresentation();
    setSearchStatus("idle", approvedUiPilot.statusMessage);
    setQuickJumpFeedback(
      choose(
        approvedUiPilot.feedback.en,
        approvedUiPilot.feedback.zh
      ),
      approvedUiPilot.feedbackTone
    );
    return;
  }

  if (!state.searchIndex) {
    setQuickJumpFeedback(choose("Loading the search index…", "正在加载搜索索引，请稍候…"), "info");
  }
  await ensureSearchIndexLoaded();
  state.searchResults = rawValue ? await runSearchQuery(rawValue) : [];
  state.searchSubmittedQuery = rawValue;
  setSearchStatusFromQuery(rawValue, state.searchResults.length);
  setQuickJumpFeedback(
    rawValue
      ? choose(
          `Loaded search_index.json on demand${state.searchResults.length ? ` and found ${state.searchResults.length} line-centric result${state.searchResults.length === 1 ? "" : "s"}.` : ", but there are no matches yet."}`,
          `已按需加载 search_index.json${state.searchResults.length ? `，找到 ${state.searchResults.length} 条 line-centric 结果。` : "，但当前没有命中。"}`
        )
      : "Search UI ready.",
    state.searchResults.length ? "success" : "warning"
  );
  updateQuickJumpResults();
  renderSearchResultsShell();
}

function parseNavigationQuery(value) {
  if (!value) {
    return {
      kind: "invalid",
      message: choose(
        "Enter a canto or line reference, for example `Inferno 1`, `Inf 1`, `I1`, or `Purg 21 112`.",
        "请输入 canto / line，例如 `Inferno 1`、`Inf 1`、`I1`、`Purg 21 112`。"
      ),
    };
  }

  const normalized = normalizeQuickJumpQuery(value);
  const compact = normalized.replace(/\s+/g, "");
  if (state.manifestMap.has(compact)) {
    const entry = state.manifestMap.get(compact);
    return { kind: "sample", sampleId: entry.id, entry, label: entry.title, canto: Number(entry.canto) };
  }

  const tokenized = normalized
    .replace(/[.:]/g, " ")
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokenized.length >= 2 && tokenized.length <= 3) {
    const shell = CANTICA_SHELLS.find((candidate) => candidate.aliases.includes(tokenized[0]));
    const canto = parseNavigationNumber(tokenized[1]);
    const lineNumber = tokenized.length === 3 ? parseNavigationNumber(tokenized[2]) : null;
    if (shell && Number.isInteger(canto) && canto >= 1 && canto <= shell.total) {
      if (tokenized.length === 3 && (!Number.isInteger(lineNumber) || lineNumber < 1)) {
        return {
          kind: "invalid",
          message: choose(
            "The line number in this navigation query could not be recognized.",
            "这一条导航输入里的 line 编号无法识别。"
          ),
        };
      }
      return {
        kind: tokenized.length === 3 ? "line" : "sample",
        sampleId: `${shell.key}${canto}`,
        entry: state.manifestMap.get(`${shell.key}${canto}`) || null,
        label: formatQuickJumpPreviewLabel(`${shell.label} ${canto}`, tokenized.length === 3 ? lineNumber : null),
        canto,
        lineNumber,
      };
    }
  }

  const lineMatch = compact.match(/^(inferno|inf|i|purgatorio|purg|p|paradiso|par)(\d{1,2})(\d{1,3})$/);
  if (lineMatch) {
    const [, alias, cantoRaw, lineRaw] = lineMatch;
    const shell = CANTICA_SHELLS.find((candidate) => candidate.aliases.includes(alias));
    const canto = Number(cantoRaw);
    const lineNumber = Number(lineRaw);
    if (!shell || !Number.isInteger(canto) || canto < 1 || canto > shell.total) {
      return { kind: "invalid", message: choose("This navigation query falls outside the current canto range.", "这个导航输入超出了当前 canto 范围。") };
    }
    return {
      kind: "line",
      sampleId: `${shell.key}${canto}`,
      entry: state.manifestMap.get(`${shell.key}${canto}`) || null,
      label: formatQuickJumpPreviewLabel(`${shell.label} ${canto}`, lineNumber),
      canto,
      lineNumber,
    };
  }

  const spaced = normalized.match(/^(inferno|inf|i|purgatorio|purg|p|paradiso|par)\s+(\d{1,2})(?:\s+(\d{1,3}))?$/);
  if (spaced) {
    const [, alias, cantoRaw, lineRaw] = spaced;
    const shell = CANTICA_SHELLS.find((candidate) => candidate.aliases.includes(alias));
    const canto = Number(cantoRaw);
    if (!shell || !Number.isInteger(canto) || canto < 1 || canto > shell.total) {
      return { kind: "invalid", message: choose("This navigation query falls outside the current canto range.", "这个导航输入超出了当前 canto 范围。") };
    }
    return {
      kind: lineRaw ? "line" : "sample",
      sampleId: `${shell.key}${canto}`,
      entry: state.manifestMap.get(`${shell.key}${canto}`) || null,
      label: formatQuickJumpPreviewLabel(`${shell.label} ${canto}`, lineRaw ? Number(lineRaw) : null),
      canto,
      lineNumber: lineRaw ? Number(lineRaw) : null,
    };
  }

  const match = compact.match(/^(inferno|inf|i|purgatorio|purg|p|paradiso|par)(\d{1,2})$/);
  if (!match) {
    return {
      kind: "search",
      query: value,
    };
  }

  const [, alias, cantoRaw] = match;
  const shell = CANTICA_SHELLS.find((candidate) => candidate.aliases.includes(alias));
  const canto = Number(cantoRaw);
  if (!shell || !Number.isInteger(canto) || canto < 1 || canto > shell.total) {
    return {
      kind: "invalid",
      message: choose(
        "This navigation query falls outside the current canto range. Please enter cantica + canto number.",
        "这个导航输入超出了当前 canto 编号范围，请按 cantica + canto number 输入。"
      ),
    };
  }

  const sampleId = `${shell.key}${canto}`;
  const entry = state.manifestMap.get(sampleId) || null;
  return {
    kind: "sample",
    sampleId,
    entry,
    label: `${shell.label} ${canto}`,
    canto,
  };
}

function parseNavigationNumber(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) {
    return Number.NaN;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  if (!/^[ivxlcdm]+$/.test(value)) {
    return Number.NaN;
  }
  return romanToInteger(value);
}

function romanToInteger(value) {
  const romanValues = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0;
  let previous = 0;
  for (const symbol of value.split("").reverse()) {
    const current = romanValues[symbol] || 0;
    if (!current) {
      return Number.NaN;
    }
    if (current < previous) {
      total -= current;
    } else {
      total += current;
      previous = current;
    }
  }
  return total;
}

function setQuickJumpFeedback(message, tone = "neutral") {
  if (!elements.quickJumpFeedback) {
    return;
  }
  elements.quickJumpFeedback.textContent = message || "";
  elements.quickJumpFeedback.dataset.tone = tone;
}

function updateQuickJumpResults() {
  if (!elements.quickJumpResults) {
    return;
  }
  const rawValue = elements.quickJumpInput.value.trim();
  if (!rawValue) {
    elements.quickJumpResults.innerHTML = "";
    return;
  }

  const request = parseNavigationQuery(rawValue);
  if (request.kind === "sample" || request.kind === "line") {
    if (!request.entry) {
      elements.quickJumpResults.innerHTML = `
        <div class="quick-jump-empty">
          ${escapeHtml(choose(
            `${request.label} is reserved on the map, but there is no mounted sample there yet.`,
            `${request.label} 位置已保留，但当前还没有 mounted sample。`
          ))}
        </div>
      `;
      return;
    }
    elements.quickJumpResults.innerHTML = renderQuickJumpResultButton(
      request.entry,
      request.kind === "line" ? "Line Ready" : "Quick Jump Ready",
      request.kind === "line" ? request.label : null,
    );
    elements.quickJumpResults.querySelectorAll("[data-sample-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadSample(button.dataset.sampleId);
      });
    });
    return;
  }

  elements.quickJumpResults.innerHTML = `
    <div class="quick-jump-empty">
      ${request.kind === "search"
        ? choose("This query will run as a token search against the static index; search_index.json loads only on submit.", "这条输入会走静态索引 token search；提交后才会按需加载 search_index.json。")
        : choose("Enter a canto / line reference for quick jump; other queries run on-demand search.", "输入 canto / line 可 quick jump；其他查询提交后会走按需 search。")}
    </div>
  `;
}

function renderQuickJumpResultButton(sample, matchType, titleOverride = null) {
  return `
    <button type="button" class="quick-jump-result" data-sample-id="${sample.id}" data-sample-title="${escapeHtml(sample.title)}">
      <div class="quick-jump-result-top">
        <strong>${escapeHtml(titleOverride || sample.title)}</strong>
      </div>
      <div class="quick-jump-result-meta">
        <span>${escapeHtml(matchType)}</span>
        <span>${sample.line_count || "—"} lines</span>
        <span>${formatNumber(sample.record_count || 0)} records</span>
      </div>
    </button>
  `;
}

function normalizeQuickJumpQuery(value) {
  return value.trim().toLowerCase().replace(/[,./_-]+/g, " ").replace(/\s+/g, " ");
}

function parseSampleIdentity(sampleId) {
  const value = String(sampleId || "").toLowerCase();
  const match = value.match(/^(inferno|purgatorio|paradiso)(\d{1,2})$/);
  if (!match) {
    return { cantica: value, canto: Number.NaN };
  }
  return { cantica: match[1], canto: Number(match[2]) };
}

function formatQuickJumpPreviewLabel(baseLabel, lineNumber = null) {
  const label = String(baseLabel || "").trim();
  if (!Number.isFinite(lineNumber)) {
    return label;
  }
  return `${label}, ${lineNumber}`;
}

function compareSampleIdsByCommedia(leftSampleId, rightSampleId) {
  const left = parseSampleIdentity(leftSampleId);
  const right = parseSampleIdentity(rightSampleId);
  return (CANTICA_ORDER.get(left.cantica) ?? 99) - (CANTICA_ORDER.get(right.cantica) ?? 99)
    || (left.canto || 999) - (right.canto || 999)
    || String(leftSampleId || "").localeCompare(String(rightSampleId || ""));
}

async function executeNavigationQuery(request) {
  if (!request.sampleId || !request.entry) {
    return {
      tone: "warning",
      status: "awaiting-index",
      message: choose(
        `${request.label} does not have a mounted sample yet, so the position remains visible but cannot be opened.`,
        `${request.label} 当前还没有 mounted sample，可见位置保留但不能跳。`
      ),
      searchStatusMessage: "Navigation target not mounted.",
    };
  }

  if (request.kind === "sample") {
    await loadSample(request.sampleId);
    clearSearchPresentation();
    return {
      tone: "success",
      status: "idle",
      message: choose(`Jumped to ${request.entry.title}.`, `已跳到 ${request.entry.title}。`),
      searchStatusMessage: "Quick jump completed.",
    };
  }

  const modules = request.entry.modules || {};
  if (!request.entry.overview_available || !modules.coverage) {
    await loadSample(request.sampleId);
    return {
      tone: "warning",
      status: "navigation-limited",
      message: choose(
        `${request.entry.title} does not currently expose a line-level jump, so the view falls back to the sample.`,
        `${request.entry.title} 当前没有可用的 line-level jump，只能先落到 sample。`
      ),
      searchStatusMessage: "Sample mounted, but direct line jump is not available.",
    };
  }

  if (!canSampleOpenLineWorkbench(request.entry)) {
    await loadSample(request.sampleId);
    return {
      tone: "warning",
      status: "navigation-limited",
      message: choose(
        `${request.entry.title} is mounted, but direct line jump is not fully wired yet, so the view falls back to the sample.`,
        `${request.entry.title} 已 mounted，但 line-level direct jump 还没有完全 wired，先跳到 sample。`
      ),
      searchStatusMessage: "Sample mounted, but direct line jump is not fully wired.",
    };
  }

  if (Number.isFinite(request.lineNumber) && Number.isFinite(request.entry.line_count) && request.lineNumber > request.entry.line_count) {
    await loadSample(request.sampleId);
    return {
      tone: "warning",
      status: "navigation-limited",
      message: choose(
        `${request.entry.title} is currently known to have only ${request.entry.line_count} lines, so the interface cannot honestly jump to line ${request.lineNumber}. It falls back to the sample.`,
        `${request.entry.title} 当前已知只有 ${request.entry.line_count} 行，不能诚实地跳到 line ${request.lineNumber}。先落到 sample。`
      ),
      searchStatusMessage: "Requested line exceeds current known line_count.",
    };
  }

  await jumpToSampleLine(request.sampleId, request.lineNumber);
  scrollToRecordsSection();
  clearSearchPresentation();
  return {
    tone: "success",
    status: "idle",
    message: choose(`Jumped to ${request.entry.title}, line ${request.lineNumber}.`, `已跳到 ${request.entry.title} line ${request.lineNumber}。`),
    searchStatusMessage: "Structured line jump completed.",
  };
}

function setSearchStatus(status, message) {
  state.searchStatus = status;
  state.searchStatusMessage = message;
}

function renderSearchResultsShell() {
  const liveInputValue = String(elements.quickJumpInput?.value || "").trim();
  const query = liveInputValue || state.searchQuery.trim();
  if (elements.searchResultsStatus) {
    elements.searchResultsStatus.textContent = state.searchStatusMessage;
  }

  if (!liveInputValue) {
    state.searchQuery = "";
    elements.searchResultsShell.setAttribute("hidden", "");
    elements.searchResultsShell.hidden = true;
    elements.searchResultsList.innerHTML = "";
    return;
  }

  elements.searchResultsShell.removeAttribute("hidden");
  elements.searchResultsShell.hidden = false;

  const isUnsubmittedSearchDraft = Boolean(liveInputValue)
    && parseNavigationQuery(liveInputValue).kind === "search"
    && liveInputValue !== state.searchSubmittedQuery;

  if (isUnsubmittedSearchDraft) {
    elements.searchResultsList.innerHTML = `
      <div class="search-result-empty">
        ${escapeHtml(state.searchStatusMessage || (state.uiLanguage === "en" ? "Press Vai! to run the static search." : "按 Vai! 执行静态搜索。"))}
      </div>
    `;
    return;
  }

  if (!state.searchResults.length) {
    elements.searchResultsList.innerHTML = `
      <div class="search-result-empty">
        ${escapeHtml(renderEmptySearchCopy(query))}
      </div>
    `;
    return;
  }

  const cards = state.searchResults.map((result) => renderSearchResultCard(result));
  elements.searchResultsList.replaceChildren(...cards);
}

function renderSearchResultCard(result) {
  const card = document.createElement("a");
  card.className = `search-result-card source-${result.sourceLayer || "unknown"}`;
  card.href = buildSearchResultHref(result);
  const highlightTerms = getSearchHighlightTerms(result);
  card.innerHTML = `
    <div class="search-result-top">
      <strong>${escapeHtml(result.cantoLabel || result.title || "Search Result")}</strong>
      <span class="search-layer-badge source-${result.sourceLayer || "unknown"}">${escapeHtml(renderSourceLayerLabel(result.sourceLayer) || "result")}</span>
    </div>
    <div class="search-result-meta">
      <span>${escapeHtml(renderSearchLineMeta(result.lineNumber))}</span>
    </div>
    <p>${renderSearchResultSnippet(result, highlightTerms)}</p>
  `;
  card.addEventListener("click", async (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    await jumpToSearchResult(result);
  });
  return card;
}

async function jumpToSearchResult(result) {
  if (!result?.sampleId) {
    return;
  }
  rememberViewportState();
  state.activeSemanticField = null;
  state.activeInterpretiveTerm = null;
  state.activeSearchHighlightTerms = getSearchHighlightTerms(result);
  const isApprovedUiPilotResult = isApprovedUiEasterEggLine(result.sampleId, result.lineNumber);
  if (Number.isFinite(result.lineNumber)) {
    await jumpToSampleLine(
      result.sampleId,
      Number(result.lineNumber),
      result.locusNormalized || null,
      { suppressCoverageScroll: result.sourceLayer === "commentary" || isApprovedUiPilotResult },
    );
    clearSearchPresentation({
      preserveHighlights: true,
      preserveStatus: true,
    });
    if (isApprovedUiPilotResult) {
      scrollToCommentarySection();
      return;
    }
    if (result.sourceLayer === "line_text") {
      scrollToCoverageSection();
      return;
    }
    const focused = await focusSearchResultRecord(result);
    if (!focused) {
      scrollToCommentarySection();
    }
    return;
  }
  await loadSample(result.sampleId);
  clearSearchPresentation({
    preserveHighlights: true,
    preserveStatus: true,
  });
  scrollToCommentarySection();
}

function buildSearchResultHref(result) {
  if (!result?.sampleId) {
    return "#";
  }
  const targetHash = isApprovedUiEasterEggLine(result.sampleId, result.lineNumber)
    ? "commentary-section"
    : (result.sourceLayer === "line_text" ? "coverage-section" : "commentary-section");
  if (result.sourceLayer === "commentary" && result.recordId) {
    return buildCanonicalHref(result.sampleId, result.lineNumber, {
      hash: `#record-${encodeURIComponent(result.recordId)}`,
    });
  }
  return buildCanonicalHref(result.sampleId, result.lineNumber, {
    hash: `#${targetHash}`,
  });
}

function getSearchHighlightTerms(result) {
  return [result.matchedText, result.matchedToken]
    .map((term) => String(term || "").trim())
    .filter(Boolean);
}

function renderSearchResultSnippet(result, highlightTerms) {
  const snippet = result.snippet || result.lineText || "No snippet provided.";
  return highlightParagraph(snippet, highlightTerms, "search-hit-highlight");
}

async function focusSearchResultRecord(result) {
  if (!result || result.sourceLayer === "line_text" || !Number.isFinite(result.lineNumber)) {
    return false;
  }

  const payload = state.lineCache.get(Number(result.lineNumber));
  if (!payload?.records?.length) {
    return false;
  }

  const exactRecordId = String(result.recordId || "").trim();
  const recordId = exactRecordId && payload.records.some((record) => record.id === exactRecordId)
    ? exactRecordId
    : findBestMatchingRecordId(payload.records, result);
  if (!recordId) {
    return false;
  }

  state.activeSearchRecordId = recordId;
  state.expanded.add(recordId);
  renderLineRecords(payload);
  scrollToCommentarySection();
  const url = new URL(window.location.href);
  url.hash = `record-${recordId}`;
  window.history.replaceState({}, "", url);
  requestAnimationFrame(() => {
    const target = elements.recordsList.querySelector(`[data-record-id="${CSS.escape(recordId)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  return recordId;
}

function findBestMatchingRecordId(records, result) {
  const sourceKey = result.sourceLayer === "commentary" ? "record_text_preview" : "record_summary";
  const snippetNeedle = normalizeCompareText(result.snippet || "");
  const matchedNeedle = normalizeCompareText(result.matchedText || result.matchedToken || "");
  const sourceTextNeedle = normalizeCompareText(result.sourceText || "");
  let bestRecord = null;
  let bestScore = -1;

  for (const record of records) {
    const sourceText = normalizeCompareText(record[sourceKey] || "");
    const combinedText = normalizeCompareText(`${record.record_summary || ""} ${record.record_text_preview || ""}`);
    let score = 0;

    if (result.sourceLayer === "commentary" && record.commentary_name === "Text of the Divine Comedy") {
      score -= 100;
    }
    if (sourceTextNeedle && sourceText === sourceTextNeedle) {
      score += 20;
    }
    if (snippetNeedle && sourceText.includes(snippetNeedle)) {
      score += 6;
    }
    if (snippetNeedle && combinedText.includes(snippetNeedle)) {
      score += 4;
    }
    if (matchedNeedle && sourceText.includes(matchedNeedle)) {
      score += 3;
    }
    if (matchedNeedle && combinedText.includes(matchedNeedle)) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRecord = record;
    }
  }

  return bestScore > 0 ? bestRecord?.id || null : null;
}

function registerSearchBridge() {
  window.DDPWorkbenchSearch = {
    setPending(query, message = "Search request pending from index thread.") {
      state.searchQuery = String(query || "").trim();
      state.searchResults = [];
      setSearchStatus("pending", message);
      renderSearchResultsShell();
    },
    setResults(payload = {}) {
      state.searchQuery = String(payload.query || state.searchQuery || "").trim();
      state.searchResults = (payload.results || []).map(normalizeIncomingSearchResult).filter((result) => result.sampleId);
      setSearchStatus(
        "results-ready",
        payload.message || `${state.searchResults.length} search result(s) ready from index thread.`
      );
      renderSearchResultsShell();
    },
    clear(message = "Search UI ready; waiting for index.") {
      state.searchResults = [];
      setSearchStatus("idle", message);
      renderSearchResultsShell();
    },
    getContract() {
      return {
        acceptedFields: [
          "id",
          "title",
          "sampleId|sample_id|sample",
          "lineNumber|line_number",
          "snippet|lineText|line_text",
          "cantoLabel|canto_label",
          "locusNormalized|locus_normalized",
        ],
      };
    },
  };
}

function normalizeIncomingSearchResult(result = {}) {
  if (window.DDPSearchBridgeModule?.normalizeExternalResult) {
    return window.DDPSearchBridgeModule.normalizeExternalResult(result);
  }
  return normalizeSearchResult(result);
}

async function runSearchQuery(query) {
  const bridge = window.DDPSearchBridgeModule;
  if (bridge?.search && window.DDPAppShell) {
    return bridge.search(query, { shell: window.DDPAppShell });
  }
  return runTokenSearch(query);
}

function normalizeSearchResult(result = {}) {
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
  };
}

function runTokenSearch(query) {
  const tokenIndex = state.searchIndex?.token_index;
  const documents = state.searchIndex?.documents;
  if (!tokenIndex || !documents) {
    return [];
  }

  const tokens = normalizeSearchTokens(query);
  if (!tokens.length) {
    return [];
  }

  if (tokens.length >= 2) {
    return runExactPhraseSearch(query, tokens, tokenIndex, documents);
  }

  return runSingleTokenSearch(tokens[0], documents, tokenIndex);
}

function runSingleTokenSearch(token, documents, tokenIndex) {
  const groupedHitLists = [groupHitsBySource(token, tokenIndex[token] || [])];
  if (groupedHitLists.some((hits) => hits.size === 0)) {
    return [];
  }

  const candidateIds = new Set(groupedHitLists[0].keys());
  const results = [];
  for (const sourceKey of candidateIds) {
    const primaryHit = groupedHitLists[0].get(sourceKey);
    if (!primaryHit) {
      continue;
    }
    const document = documents[primaryHit.documentId];
    if (!document) {
      continue;
    }
    const sourceText = getSearchSourceText(document, primaryHit.sourceLayer, primaryHit.sourceIndex);
    const snippet = buildSearchSnippet(sourceText, primaryHit.matchedText || primaryHit.matchedToken);
    results.push(
      normalizeSearchResult({
        id: `${primaryHit.documentId}:${token}:${primaryHit.sourceLayer}:${primaryHit.sourceIndex}`,
        title: `${document.cantica} ${document.canto}`,
        sample_id: document.sample_key,
        line_number: document.line_number,
        line_text: document.line_text,
        snippet,
        source_text: sourceText,
        canto_label: `${document.cantica} ${document.canto}`,
        source_layer: primaryHit.sourceLayer,
        match_type: "exact_token_normalized",
        matched_text: primaryHit.matchedText,
        matched_token: primaryHit.matchedToken,
        source_index: primaryHit.sourceIndex,
        jump_target: {
          sample_id: document.jump_target?.sample_id || document.sample_key,
          line_number: document.jump_target?.line_number || document.line_number,
        },
      })
    );
  }

  return results
    .sort((left, right) =>
      (Number(right.score || Number.NEGATIVE_INFINITY) - Number(left.score || Number.NEGATIVE_INFINITY))
      || (SEARCH_LAYER_PRIORITY[left.sourceLayer] ?? 99) - (SEARCH_LAYER_PRIORITY[right.sourceLayer] ?? 99)
      || compareSampleIdsByCommedia(left.sampleId, right.sampleId)
      || (left.lineNumber || 0) - (right.lineNumber || 0)
    );
}

function runExactPhraseSearch(query, tokens, tokenIndex, documents) {
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
    const document = documents[primaryHit.documentId];
    if (!document) {
      continue;
    }
    const sourceText = getSearchSourceText(document, primaryHit.sourceLayer, primaryHit.sourceIndex);
    if (!sourceText) {
      continue;
    }
    if (!normalizeSearchPhrase(sourceText).includes(normalizedPhrase)) {
      continue;
    }
    const snippet = buildSearchSnippet(sourceText, query);
    results.push(
      normalizeSearchResult({
        id: `${primaryHit.documentId}:${primaryHit.sourceLayer}:${primaryHit.sourceIndex}:${normalizedPhrase}`,
        title: `${document.cantica} ${document.canto}`,
        sample_id: document.sample_key,
        line_number: document.line_number,
        line_text: document.line_text,
        snippet,
        source_text: sourceText,
        canto_label: `${document.cantica} ${document.canto}`,
        source_layer: primaryHit.sourceLayer,
        match_type: "exact_phrase_normalized",
        matched_text: query.trim(),
        matched_token: normalizedPhrase,
        source_index: primaryHit.sourceIndex,
        jump_target: {
          sample_id: document.jump_target?.sample_id || document.sample_key,
          line_number: document.jump_target?.line_number || document.line_number,
        },
      })
    );
  }

  return results
    .sort((left, right) =>
      (Number(right.score || Number.NEGATIVE_INFINITY) - Number(left.score || Number.NEGATIVE_INFINITY))
      || (SEARCH_LAYER_PRIORITY[left.sourceLayer] ?? 99) - (SEARCH_LAYER_PRIORITY[right.sourceLayer] ?? 99)
      || compareSampleIdsByCommedia(left.sampleId, right.sampleId)
      || (left.lineNumber || 0) - (right.lineNumber || 0)
    );
}

function groupHitsBySource(token, hits) {
  const grouped = new Map();
  for (const hit of hits || []) {
    const parsed = parseSearchHit(token, hit);
    if (!parsed) {
      continue;
    }
    const sourceKey = `${parsed.documentId}::${parsed.sourceLayer}::${Number(parsed.sourceIndex || 0)}`;
    const candidate = {
      sourceKey,
      documentId: parsed.documentId,
      sourceLayer: parsed.sourceLayer,
      matchedText: parsed.matchedText,
      matchedToken: parsed.matchedToken,
      sourceIndex: parsed.sourceIndex,
      supportingMatchCount: parsed.supportingMatchCount,
    };
    const existing = grouped.get(sourceKey);
    if (!existing || compareSearchHitPriority(candidate, existing) < 0) {
      grouped.set(sourceKey, candidate);
    }
  }
  return grouped;
}

function groupHitsByDocument(token, hits) {
  const grouped = new Map();
  for (const hit of hits || []) {
    const parsed = parseSearchHit(token, hit);
    if (!parsed) {
      continue;
    }
    const candidate = {
      documentId: parsed.documentId,
      sourceLayer: parsed.sourceLayer,
      matchedText: parsed.matchedText,
      matchedToken: parsed.matchedToken,
      sourceIndex: parsed.sourceIndex,
      supportingMatchCount: parsed.supportingMatchCount,
    };
    const existing = grouped.get(parsed.documentId);
    if (!existing || compareSearchHitPriority(candidate, existing) < 0) {
      grouped.set(parsed.documentId, candidate);
    }
  }
  return grouped;
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
    || String(left.matchedText || "").localeCompare(String(right.matchedText || ""));
}

function getSearchSourceText(document, sourceLayer, sourceIndex) {
  if (sourceLayer === "line_text") {
    return document?.line_text || "";
  }
  if (sourceLayer === "commentary") {
    const pooledText = state.searchIndex?.source_pools?.commentary?.[sourceIndex];
    if (pooledText) {
      return pooledText;
    }
  }
  return document.search_layer_sources?.[sourceLayer]?.[sourceIndex]
    || document.search_layer_snippets?.[sourceLayer]
    || document.snippet
    || document.line_text
    || "";
}

function normalizeSearchPhrase(value) {
  return normalizeQuickJumpQuery(value)
    .split(/\s+/)
    .map((token) => token.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9']/g, ""))
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .join(" ");
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

function renderSourceLayerLabel(sourceLayer) {
  const labels = {
    line_text: state.uiLanguage === "zh" ? "正文" : "Line",
    commentary: state.uiLanguage === "zh" ? "注释" : "Commentary",
  };
  return labels[sourceLayer] || sourceLayer || "";
}

function renderSearchLineMeta(lineNumber) {
  if (!Number.isFinite(lineNumber)) {
    return state.uiLanguage === "zh" ? "行号未知" : "line unknown";
  }
  return state.uiLanguage === "zh" ? `第 ${lineNumber} 行` : `line ${lineNumber}`;
}

function renderEmptySearchCopy(query) {
  if (state.uiLanguage === "en") {
    return `No static-index results for “${query}”.`;
  }
  if (state.uiLanguage === "zh") {
    return `“${query}” 在当前静态索引里没有命中。`;
  }
  return `当前查询为 “${query}”。如果这不是导航型 query，那么当前静态索引里还没有命中结果。`;
}

function normalizeSearchTokens(query) {
  return normalizeQuickJumpQuery(query)
    .split(/\s+/)
    .map((token) => token.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9']/g, ""))
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function setSearchStatusFromQuery(query, resultCount) {
  if (!query) {
    setSearchStatus("idle", "Search UI ready.");
    return;
  }
  if (resultCount > 0) {
    setSearchStatus("results-ready", `${resultCount} result(s) loaded from static search shards.`);
    return;
  }
  setSearchStatus(
    "no-results",
    state.uiLanguage === "en"
      ? `No static-shard results for “${query}”.`
      : `没有在当前静态搜索分片中找到 “${query}” 的结果。`
  );
}

function renderAuthorityStatusLabel(status) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const labels = {
    ready: chooseText("Ready", "Ready"),
    ready_with_caveat: chooseText("Ready with caveat", "Ready with caveat"),
    partial: chooseText("Partial", "Partial"),
    review_first: chooseText("Review first", "Review first"),
  };
  return labels[status] || status || chooseText("Unknown", "Unknown");
}

function getAuthorityWorkLayerLabel(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const mode = String(author?.works_layer_mode || "").trim();
  const labels = {
    works_tree: chooseText("Works Tree", "Works Tree"),
    flat_work_overview: chooseText("Flat Work Overview", "Flat Work Overview"),
    no_work_layer: chooseText("No Local Work Layer", "No Local Work Layer"),
    no_works_tree: chooseText("Special-Case Work Layer", "Special-Case Work Layer"),
  };
  return labels[mode] || chooseText("Work Layer", "Work Layer");
}

function getAllAuthorityAuthors() {
  const authors = state.authorityLayer?.authors || [];
  const preferred = ["virgil", "aristotle", "paul_the_apostle", "psalmist", "cicero", "statius", "augustine"];
  return authors
    .map((author) => getResolvedAuthorityAuthor(author))
    .sort((left, right) => {
      const leftPriority = preferred.includes(left.author_id) ? 0 : (left.priority_author ? 1 : 2);
      const rightPriority = preferred.includes(right.author_id) ? 0 : (right.priority_author ? 1 : 2);
      return leftPriority - rightPriority
        || left.canonical_name.localeCompare(right.canonical_name);
    });
}

function getAuthorityAuthors() {
  return getAllAuthorityAuthors();
}

async function openAuthorityAuthorFromCompare(authorId) {
  if (!authorId) {
    return;
  }
  await Promise.all([
    ensureAuthorityLayerLoaded(),
    ensureAuthorityCuratedRoomAnchorsLoaded(),
  ]);
  const authors = getAllAuthorityAuthors();
  const author = authors.find((item) => item.author_id === authorId);
  if (!author) {
    return;
  }
  state.activeScholarTab = "authority";
  state.activeAuthority = author.author_id;
  state.activeAuthorityView = "text";
  state.activeAuthorityWork = null;
  state.activeAuthorityNode = null;
  state.activeAuthorityOccurrenceKey = null;
  state.activeAuthorityCommentarySample = null;
  state.activeAuthorityCommentaryLineKey = null;
  state.activeAuthoritySourceExpanded = false;
  renderFigurePanel();
  setActiveAnchor("scholar-section");
  document.getElementById("scholar-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function selectLine(lineNumber) {
  if (!state.overview) {
    return;
  }
  const selectionToken = ++activeLineSelectionToken;
  updateSampleUrl(state.currentSampleEntry?.id || state.overview.sample, lineNumber);
  state.selectedLine = lineNumber;
  state.authorityInlineScope = "line";
  state.authorityInlineOpenRecordId = null;
  state.authorityInlineOpenRecordScope = null;
  state.authorityInlineOpenWorkKey = null;
  syncCompareHeadActions();
  state.activeSemanticField = null;
  syncCoverageSelection();
  settlePinnedCoverageRow(lineNumber);

  if (!state.lineCache.has(lineNumber)) {
    const sampleId = state.overview.sample;
    try {
      const rawPayload = await fetchJson(getLinePayloadPath(sampleId, lineNumber));
      const payload = await hydrateLinePayload(sampleId, rawPayload);
      if (selectionToken !== activeLineSelectionToken) {
        return;
      }
      state.lineCache.set(lineNumber, payload);
    } catch (error) {
      if (selectionToken !== activeLineSelectionToken) {
        return;
      }
      console.warn(`Line payload unavailable for ${sampleId} line ${lineNumber}`, error);
      renderCoverageOnlyLine(lineNumber);
      return;
    }
  }

  if (selectionToken !== activeLineSelectionToken) {
    return;
  }
  renderLineRecords(state.lineCache.get(lineNumber));
  renderFigurePanel();
  maybeTriggerApprovedUiEasterEgg("line-open");
}

function syncCoverageSelection() {
  for (const button of elements.coverageList.querySelectorAll(".coverage-row")) {
    button.classList.toggle("is-active", Number(button.dataset.lineNumber) === state.selectedLine);
  }
}

function pinSelectedCoverageRow(lineNumber) {
  const row = elements.coverageList.querySelector(`.coverage-row[data-line-number="${CSS.escape(String(lineNumber))}"]`);
  if (!row) {
    return;
  }
  const offset = 6;
  const listRect = elements.coverageList.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  elements.coverageList.scrollTop = Math.max(0, elements.coverageList.scrollTop + rowRect.top - listRect.top - offset);
}

function settlePinnedCoverageRow(lineNumber) {
  const pin = () => pinSelectedCoverageRow(lineNumber);
  pin();
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(pin);
  });
}

function renderLineRecords(payload) {
  return recordsPanel.renderLineRecords(payload);
}

function renderLineContext(payload) {
  elements.lineContext.innerHTML = `
    ${choose(
      `This line currently carries <strong>${payload.coverage_count}</strong> commentary records. The cards below include both single-line notes and records whose spans extend across multiple lines.`,
      `当前对应 <strong>${payload.coverage_count}</strong> 条 commentary records。下面展示的是所有覆盖到该行的记录，包含单行注释和跨多行的 span 注释。`
    )}
  `;
  if (elements.commentarySummary) {
    elements.commentarySummary.innerHTML = choose(
      `<strong>${payload.coverage_count}</strong> commentary cards currently reach this line. Sorting and filters below apply to the cards gathered for it.`,
      `当前有 <strong>${payload.coverage_count}</strong> 张 commentary cards 覆盖到这一行。下方的排序和筛选会直接作用在这些卡片上。`
    );
  }

  const approvedUiPilot = getApprovedUiEasterEggPilotForLine(state.currentSampleEntry?.id || state.overview?.sample, payload.line_number);
  if (approvedUiPilot) {
    ensureApprovedUiEasterEggOverlay(approvedUiPilot.effect);
    requestAnimationFrame(() => {
      maybeTriggerApprovedUiEasterEgg("line-render");
    });
  }

  elements.lineTitle.querySelectorAll("[data-line-locus-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const locus = getPayloadLoci(payload).find((item) => item.id === button.dataset.lineLocusId);
      state.selectedLocus = locus || null;
      state.activeInterpretiveTerm = null;
      renderLineRecords(payload);
      if (state.selectedLocus) {
        ensureResearchLayerLoaded();
      }
    });
  });
}

function getActiveLocusHighlightTerms() {
  if (!state.selectedLocus) {
    return [];
  }
  const family = getWordFamilyConfig(state.selectedLocus.normalized_form);
  const familyMembers = family?.members || [];
  return [...new Set([
    state.selectedLocus.surface_form,
    state.selectedLocus.normalized_form,
    ...familyMembers,
  ].filter(Boolean))];
}

function renderRecordCard(record, activeLineNumber, highlightTerms = []) {
  return recordsPanel.renderRecordCard(record, activeLineNumber, highlightTerms);
}

function renderPinned() {
  return recordsPanel.renderPinned();
}

function renderPinnedCard(item) {
  return recordsPanel.renderPinnedCard(item);
}

function renderFutureHooks(hooks) {
  if (!elements.futureHooks) {
    return;
  }
  if (!hooks.length) {
    elements.futureHooks.innerHTML = "";
    return;
  }

  const cards = hooks.map((hook) => {
    const element = document.createElement("article");
    element.className = "future-hook";
    element.innerHTML = `
      <strong>${escapeHtml(hook.label)}</strong>
      <span class="future-status">${escapeHtml(hook.status)}</span>
      <p>${escapeHtml(choose("The shell and layout are already prepared for this hook, so it can plug in directly once the data is ready.", "已在数据结构和布局上预留位置，下一步可直接接入。"))}</p>
    `;
    return element;
  });
  elements.futureHooks.replaceChildren(...cards);
}

function getSelectedWordProfile() {
  if (!state.selectedLocus) {
    return null;
  }
  return getWordLocusProfile(state.selectedLocus.normalized_form);
}

function getSelectedWordProfileBundle() {
  if (!state.selectedLocus) {
    return null;
  }

  const normalizedForm = state.selectedLocus.normalized_form;
  const family = getWordFamilyConfig(normalizedForm);
  if (!family) {
    return {
      family: null,
      familyIsActive: false,
      normalizedForms: [normalizedForm],
      danteProfile: getWordLocusProfile(normalizedForm),
      researchProfile: state.researchLayer?.word_profiles?.[normalizedForm] || null,
    };
  }

  const indexedMembers = getWordFamilyMembersInIndex(family);
  const allMembersLoaded = indexedMembers.every((member) => Boolean(getCachedDanteWordProfile(member)));
  return {
    family,
    familyIsActive: Boolean(allMembersLoaded && indexedMembers.length > 1),
    normalizedForms: indexedMembers.length ? indexedMembers : family.members,
    danteProfile: allMembersLoaded ? buildWordFamilyDanteProfile(family) : null,
    researchProfile: buildWordFamilyResearchProfile(family),
  };
}

function canAttemptLocusProfileLoad(bundle, normalizedForm) {
  const family = bundle?.family || getWordFamilyConfig(normalizedForm);
  if (!family) {
    return Boolean(state.danteWordLociIndex?.profiles?.[normalizedForm]?.profile_path);
  }
  const indexedMembers = getWordFamilyMembersInIndex(family);
  return indexedMembers.some((member) => !getCachedDanteWordProfile(member));
}

function buildWordFamilyDanteProfile(family) {
  if (!family) {
    return null;
  }

  const profiles = getWordFamilyMembersInIndex(family)
    .map((member) => getCachedDanteWordProfile(member))
    .filter(Boolean);
  if (!profiles.length) {
    return null;
  }

  const occurrenceMap = new Map();
  const concurrenceMap = new Map();
  for (const profile of profiles) {
    for (const occurrence of profile.occurrences || []) {
      const key = [
        occurrence.sample_id || occurrence.sample,
        occurrence.line_number,
        occurrence.locus_id || occurrence.normalized_form,
      ].join("|");
      if (!occurrenceMap.has(key)) {
        occurrenceMap.set(key, occurrence);
      }
    }

    for (const item of profile.weighted_micro_context_concurrence?.top_terms || []) {
      const word = normalizeLocusForm(item.word);
      if (!isMeaningfulConcurrenceTerm(word, family.head)) {
        continue;
      }
      const existing = concurrenceMap.get(word) || {
        word,
        weighted_score: 0,
        sampleWindowMap: new Map(),
      };
      existing.weighted_score += Number(item.weighted_score || 0);
      for (const window of item.sample_windows || []) {
        const key = [
          window.sample_id,
          window.line_number,
          window.candidate_line_number,
          window.candidate_line_text,
        ].join("|");
        const current = existing.sampleWindowMap.get(key);
        if (!current || Number(window.weight || 0) > Number(current.weight || 0)) {
          existing.sampleWindowMap.set(key, window);
        }
      }
      concurrenceMap.set(word, existing);
    }

  }

  return {
    normalized_form: family.head,
    display_form: family.label,
    occurrence_count: occurrenceMap.size,
    occurrences: Array.from(occurrenceMap.values()).sort(compareCanticaLocations),
    weighted_micro_context_concurrence: {
      top_terms: Array.from(concurrenceMap.values())
        .map((item) => ({
          word: item.word,
          weighted_score: item.weighted_score,
          sample_windows: Array.from(item.sampleWindowMap.values())
            .sort(compareCanticaLocations)
            .slice(0, 8),
        }))
        .sort((left, right) =>
          Number(right.weighted_score || 0) - Number(left.weighted_score || 0)
          || Number((right.sample_windows || []).length || 0) - Number((left.sample_windows || []).length || 0)
          || left.word.localeCompare(right.word))
        .slice(0, 12),
    },
    exact_local_phrase_expansions: normalizePhraseExpansionEntries(
      profiles.flatMap((profile) => profile.exact_local_phrase_expansions || [])
    ).slice(0, 10),
    future_slots: profiles[0].future_slots || {},
    word_family_pilot: {
      label: family.label,
      members: family.members,
      review: family.review,
    },
  };
}

function buildWordFamilyResearchProfile(family) {
  if (!family) {
    return null;
  }

  const profiles = family.members
    .map((member) => state.researchLayer?.word_profiles?.[member])
    .filter(Boolean);
  if (!profiles.length) {
    return null;
  }

  const interpretiveTermMap = new Map();
  let occurrenceCount = 0;
  let sampleCount = 0;

  for (const profile of profiles) {
    occurrenceCount += Number(profile.occurrence_count || 0);
    sampleCount += Number(profile.sample_count || 0);
    for (const item of profile.interpretive_terms || []) {
      const term = normalizeLocusForm(item.term);
      if (!term || looksLikeBadWordProfileTerm(term, family.head)) {
        continue;
      }
      const existing = interpretiveTermMap.get(term) || {
        term,
        score: 0,
        count: 0,
        line_count: 0,
      };
      existing.score += Number(item.score || 0);
      existing.count += Number(item.count || 0);
      existing.line_count += Number(item.line_count || 0);
      interpretiveTermMap.set(term, existing);
    }
  }

  return {
    normalized_form: family.head,
    display_form: family.label,
    occurrence_count: occurrenceCount,
    sample_count: sampleCount,
    interpretive_terms: Array.from(interpretiveTermMap.values())
      .sort((left, right) =>
        Number(right.score || 0) - Number(left.score || 0)
        || Number(right.line_count || 0) - Number(left.line_count || 0)
        || left.term.localeCompare(right.term))
      .slice(0, 20),
    future_slots: {
      lemma: "family pilot pending",
    },
    word_family_pilot: {
      label: family.label,
      members: family.members,
      review: family.review,
    },
  };
}

function getLocalizedInterpretiveTerms(payload, profile) {
  const termMap = new Map();
  const locusForm = state.selectedLocus?.normalized_form;
  const lineProfile = state.lineProfileMap.get(`${state.currentSampleEntry?.id}:${payload.line_number}`);
  const signatureTerms = ((payload.signature_terms && payload.signature_terms.length)
    ? payload.signature_terms
    : (lineProfile?.signature_terms || []))
    .map((term) => normalizeLocusForm(term))
    .filter((term) => term && !looksLikeBadWordProfileTerm(term, locusForm));

  signatureTerms.forEach((term, index) => {
    const existing = termMap.get(term) || { term, score: 0, line_count: 0 };
    existing.score += Math.max(1.2, 4 - index * 0.3);
    existing.line_count = Math.max(existing.line_count, 1);
    termMap.set(term, existing);
  });

  (profile?.interpretive_terms || []).forEach((item, index) => {
    const term = normalizeLocusForm(item.term);
    if (!term || looksLikeBadWordProfileTerm(term, locusForm)) {
      return;
    }
    const existing = termMap.get(term) || { term, score: 0, line_count: 0 };
    existing.score += Math.max(0.4, Number(item.count || 0)) * 0.45;
    existing.score += Math.max(0, 8 - index) * 0.12;
    existing.line_count = Math.max(existing.line_count, Number(item.line_count || 0));
    termMap.set(term, existing);
  });

  return Array.from(termMap.values())
    .sort((left, right) => right.score - left.score || right.line_count - left.line_count || left.term.localeCompare(right.term))
    .slice(0, 8);
}

function getCorpusTermDocFreq(term) {
  const normalized = normalizeLocusForm(term);
  if (!normalized) {
    return 0;
  }
  return state.corpusInterpretiveStats?.termDocFreq?.get(normalized) || 0;
}

function getCorpusFieldDocFreq(label) {
  const normalized = normalizeLocusForm(label);
  if (!normalized) {
    return 0;
  }
  return state.corpusInterpretiveStats?.fieldDocFreq?.get(normalized) || 0;
}

function getCurrentLineProfile(payload) {
  const currentKey = `${state.currentSampleEntry?.id}:${payload.line_number}`;
  const researchProfile = state.lineProfileMap.get(currentKey);
  if (researchProfile) {
    return researchProfile;
  }
  const sampleMap = state.sampleLineEchoProfileCache.get(state.currentSampleEntry?.id || "");
  return sampleMap?.get(Number(payload.line_number)) || null;
}

function getCurrentLineEchoProfile(payload) {
  return getCurrentLineProfile(payload)?.line_echo_profile || null;
}

function getOverviewLineByNumber(lineNumber) {
  if (!state.overview?.lines || !Number.isFinite(Number(lineNumber))) {
    return null;
  }
  return state.overview.lines.find((line) => Number(line?.line_number) === Number(lineNumber)) || null;
}

function getTerzinaContextLines(payload) {
  const lineNumber = Number(payload?.line_number || 0);
  if (!Number.isFinite(lineNumber) || !state.overview?.lines?.length) {
    return [];
  }
  const terzinaStart = Math.floor((lineNumber - 1) / 3) * 3 + 1;
  return [terzinaStart, terzinaStart + 1, terzinaStart + 2]
    .map((value) => getOverviewLineByNumber(value))
    .filter(Boolean);
}

function getSelectableLineTokens(lineLike) {
  const loci = Array.isArray(lineLike?.dante_loci) && lineLike.dante_loci.length
    ? lineLike.dante_loci
    : buildDanteLociFromLineText(lineLike?.line_text || "", state.currentSampleEntry?.id || "sample", lineLike?.line_number || 0);
  return loci
    .filter((locus) => locus?.is_selectable_locus)
    .map((locus) => normalizeLocusForm(locus.normalized_form || locus.surface_form))
    .filter(Boolean);
}

function getTextFirstAnchorTerms(payload, currentLineProfile = getCurrentLineProfile(payload)) {
  const anchorMap = new Map();
  const add = (rawTerm, score) => {
    const term = normalizeEchoSignalKey(rawTerm);
    if (!term || looksLikeBadWordProfileTerm(term)) {
      return;
    }
    anchorMap.set(term, Math.max(anchorMap.get(term) || 0, score));
  };

  getSelectableLineTokens(payload).forEach((term, index) => add(term, Math.max(2.8, 6.0 - index * 0.45)));

  const terzinaLines = getTerzinaContextLines(payload);
  terzinaLines.forEach((line) => {
    const distance = Math.abs(Number(line?.line_number || 0) - Number(payload?.line_number || 0));
    const baseScore = distance === 0 ? 4.4 : distance === 1 ? 2.6 : 1.8;
    getSelectableLineTokens(line).forEach((term, index) => add(term, Math.max(0.9, baseScore - index * 0.18)));
    (line?.signature_terms || []).slice(0, 6).forEach((term, index) => add(term, Math.max(0.6, baseScore * 0.65 - index * 0.14)));
  });

  (payload?.signature_terms || []).slice(0, 10).forEach((term, index) => add(term, Math.max(1.0, 2.8 - index * 0.2)));
  (currentLineProfile?.signature_terms || []).slice(0, 8).forEach((term, index) => add(term, Math.max(0.7, 1.8 - index * 0.14)));

  return anchorMap;
}

const BROAD_LINE_ECHO_REVIEW_TERMS = new Set([
  "grande",
  "bene",
  "amore",
  "cerchio",
  "circulus",
  "cielo",
  "luce",
  "lume",
  "santo",
  "occhi",
  "mezzo",
  "luogo",
  "sole",
  "anima",
  "tempo",
  "corpo",
  "ragione",
  "gente",
  "voce",
  "acqua",
  "terra",
  "mare",
  "poco",
  "altre",
  "parlare",
  "hanno",
]);

const LINE_ECHO_META_REVIEW_TERMS = new Set([
  "mentre",
  "quando",
  "come",
  "poi",
  "dove",
  "quindi",
  "secundum",
  "secundus",
  "descrive",
  "seguendo",
  "anno",
  "semper",
  "item",
  "auctor",
  "autor",
  "dicit",
  "dicunt",
  "primo",
  "primaio",
  "primoe",
  "primoe",
  "primoio",
  "maggiore",
  "minorem",
]);

function looksLikeBroadLineEchoSignal(term, corpusCount = 0) {
  const normalized = normalizeLocusForm(term);
  if (!normalized) {
    return false;
  }
  if (BROAD_LINE_ECHO_REVIEW_TERMS.has(normalized)) {
    return true;
  }
  const totalLines = Math.max(state.corpusInterpretiveStats?.totalLines || 0, 1);
  return (Number(corpusCount || 0) / totalLines) >= 0.008;
}

function looksLikeMetaLineEchoSignal(term) {
  const normalized = normalizeLocusForm(term);
  return Boolean(normalized && LINE_ECHO_META_REVIEW_TERMS.has(normalized));
}

function filterLineEchoSourceTerms(items = []) {
  return (items || []).filter((item) => {
    if (looksLikeMetaLineEchoSignal(item.term)) {
      return Number(item.echoScore || 0) >= 18 && Number(item.localRecordCount || 0) >= 3;
    }
    if (!looksLikeBroadLineEchoSignal(item.term, item.corpusLineCount || 0)) {
      return true;
    }
    return Number(item.echoScore || 0) >= 18 || Number(item.localRecordCount || 0) >= 3;
  });
}

function filterLineEchoSourceFields(items = []) {
  return (items || []).filter((item) => {
    if (looksLikeMetaLineEchoSignal(item.label || item.displayLabel)) {
      return Number(item.echoScore || 0) >= 16 && Number(item.support || 0) >= 32;
    }
    if (!looksLikeBroadLineEchoSignal(item.label || item.displayLabel, item.corpusFieldCount || 0)) {
      return true;
    }
    return Number(item.echoScore || 0) >= 16 || Number(item.support || 0) >= 32;
  });
}

function buildContrastiveInterpretiveTerms(payload, profile, localizedTerms = getLocalizedInterpretiveTerms(payload, profile)) {
  const totalLines = Math.max(state.corpusInterpretiveStats?.totalLines || 0, 1);
  const profileTermIndex = new Map(
    (profile?.interpretive_terms || [])
      .map((item) => [normalizeLocusForm(item.term), item])
      .filter(([term]) => term)
  );

  return localizedTerms
    .map((item) => {
      const term = normalizeLocusForm(item.term);
      if (!term || looksLikeBadWordProfileTerm(term, state.selectedLocus?.normalized_form)) {
        return null;
      }
      const profileItem = profileTermIndex.get(term) || {};
      const corpusLineCount = getCorpusTermDocFreq(term);
      const corpusShare = corpusLineCount / totalLines;
      const rarityScore = Math.log((totalLines + 1) / ((corpusLineCount || 0) + 1));
      const localRecordCount = countRecordsForTerm(payload.records || [], term);
      const occurrenceLineCount = Math.max(
        Number(profileItem.line_count || 0),
        Number(item.line_count || 0),
        localRecordCount ? 1 : 0,
      );
      const contrastiveScore = Number(item.score || 0) * (1 + rarityScore)
        + Math.min(localRecordCount, 6) * 0.55
        + Math.min(occurrenceLineCount, 6) * 0.28;

      return {
        term,
        localScore: Number(item.score || 0),
        contrastiveScore,
        corpusLineCount,
        corpusShare,
        rarityScore,
        localRecordCount,
        occurrenceLineCount,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.contrastiveScore - left.contrastiveScore
      || left.corpusLineCount - right.corpusLineCount
      || right.localRecordCount - left.localRecordCount
      || left.term.localeCompare(right.term))
    .slice(0, 8);
}

function getContrastiveBand(corpusShare) {
  if (corpusShare <= 0.0025) {
    return "rare in corpus";
  }
  if (corpusShare <= 0.01) {
    return "uncommon in corpus";
  }
  if (corpusShare <= 0.03) {
    return "mid-frequency in corpus";
  }
  return "widespread in corpus";
}

function getPayloadLoci(payload) {
  if (Array.isArray(payload?.dante_loci) && payload.dante_loci.length) {
    return payload.dante_loci;
  }
  return buildDanteLociFromLineText(payload?.line_text || "", state.currentSampleEntry?.id || "sample", payload?.line_number || 0);
}

function buildDanteLociFromLineText(lineText, sampleId, lineNumber) {
  const matches = String(lineText || "").match(/[A-Za-zÀ-ÖØ-öø-ÿ']+/g) || [];
  return matches
    .map((token, tokenIndex) => {
      const normalizedForm = normalizeLocusForm(token);
      if (!normalizedForm) {
        return null;
      }
      const isStopword = DANTE_STOPWORDS.has(normalizedForm);
      return {
        id: `${sampleId}-l${String(lineNumber).padStart(3, "0")}-w${tokenIndex}-${normalizedForm}`,
        surface_form: token,
        normalized_form: normalizedForm,
        lemma: null,
        pos: null,
        morph_features: null,
        normalization_method: "lower_ascii_exact_form",
        is_stopword: isStopword,
        is_selectable_locus: !isStopword && normalizedForm.length >= 3,
        token_index: tokenIndex,
      };
    })
    .filter(Boolean);
}

function countRecordsForTerm(records, term) {
  return records.filter((record) => recordMatchesInterpretiveTerm(record, term)).length;
}

function looksLikeBadWordProfileTerm(term, locusForm = null) {
  const normalized = normalizeLocusForm(term);
  if (!normalized || normalized === locusForm) {
    return true;
  }
  if (DANTE_STOPWORDS.has(normalized) || SEMANTIC_STOPWORDS.has(normalized)) {
    return true;
  }
  if (WORD_PROFILE_NOISE.has(normalized) || CORPUS_DRIFT_TERMS.has(normalized)) {
    return true;
  }
  return RESIDUAL_FUNCTION_PATTERNS.some((prefix) => normalized.startsWith(prefix));
}

function isMeaningfulConcurrenceTerm(term, locusForm = null) {
  const normalized = normalizeLocusForm(term);
  if (!normalized || normalized === normalizeLocusForm(locusForm || "")) {
    return false;
  }
  if (DANTE_STOPWORDS.has(normalized) || SEMANTIC_STOPWORDS.has(normalized)) {
    return false;
  }
  if (WORD_PROFILE_NOISE.has(normalized) || CORPUS_DRIFT_TERMS.has(normalized)) {
    return false;
  }
  if (LOW_SEMANTIC_CONCURRENCE.has(normalized)) {
    return false;
  }
  if (RESIDUAL_FUNCTION_PATTERNS.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  if (normalized.length <= 2) {
    return false;
  }
  return true;
}

function recordMatchesInterpretiveTerm(record, term) {
  const normalizedTerm = String(term || "").toLowerCase();
  if (!normalizedTerm) {
    return false;
  }
  const haystack = normalizeCompareText(`${record.record_summary || ""} ${record.record_text_preview || ""}`).toLowerCase();
  return haystack.includes(normalizedTerm);
}

function getRelatedFieldsForLocus(payload, termItems) {
  const semanticState = getSemanticStateForPayload(payload);
  const targetTerms = new Set((termItems || []).slice(0, 8).map((item) => item.term));
  return semanticState.fields
    .map((field) => {
      const overlap = field.representativeTerms.filter((term) => targetTerms.has(term));
      return {
        id: field.id,
        label: field.label,
        overlap,
      };
    })
    .filter((field) => field.overlap.length)
    .sort((left, right) => right.overlap.length - left.overlap.length || left.label.localeCompare(right.label))
    .slice(0, 4);
}

function getEchoEligiblePayloadFields(payload) {
  const fields = (payload?.semantic_fields?.fields || [])
    .filter((field) => field && field.field_kind !== "residual_provisional")
    .filter((field) => Number(field.label_confidence || 0) >= 0.4);
  const preferred = fields.filter((field) => field.field_kind === "line_semantic" || field.field_kind === "figure_anchor");
  if (preferred.length) {
    return preferred;
  }
  return fields.filter((field) => field.field_kind === "commentarial_discourse");
}

function buildLineEchoSourceFields(payload, currentLineProfile = getCurrentLineProfile(payload)) {
  const precomputed = currentLineProfile?.line_echo_profile;
  if (precomputed?.mode === "text_first_line_similarity_v2" && precomputed?.source_local_fields?.length) {
    return filterLineEchoSourceFields(precomputed.source_local_fields.map((item) => ({
      label: normalizeEchoSignalKey(item.label || item.display_label),
      displayLabel: getEchoSignalDisplayLabel(item.display_label || item.label),
      support: Number(item.support || 0),
      corpusFieldCount: Number(item.corpus_field_count || 0),
      echoScore: Number(item.echo_score || 0),
    })));
  }
  const textAnchorTerms = getTextFirstAnchorTerms(payload, currentLineProfile);
  const overlapsTextAnchor = (label, representativeTerms = []) => {
    const tokens = [label, ...representativeTerms]
      .map((item) => normalizeEchoSignalKey(item))
      .filter(Boolean);
    return tokens.some((token) => textAnchorTerms.has(token));
  };
  if (precomputed?.source_local_fields?.length) {
    return filterLineEchoSourceFields(precomputed.source_local_fields.map((item) => ({
      label: normalizeEchoSignalKey(item.label || item.display_label),
      displayLabel: getEchoSignalDisplayLabel(item.display_label || item.label),
      support: Number(item.support || 0),
      corpusFieldCount: Number(item.corpus_field_count || 0),
      echoScore: Number(item.echo_score || 0),
    }))
      .filter((item) => item.label && overlapsTextAnchor(item.label))
      .slice(0, 4));
  }
  const totalLines = Math.max(state.corpusInterpretiveStats?.totalLines || 0, 1);
  const fieldMap = new Map();
  const payloadFields = getEchoEligiblePayloadFields(payload);

  payloadFields.forEach((field, index) => {
    const displayLabel = String(field.display_label || field.label || field.internal_label || "").trim();
    const label = normalizeEchoSignalKey(displayLabel);
    const representativeTerms = field.representative_terms || field.representativeTerms || [];
    if (!label || looksLikeBadWordProfileTerm(label) || !overlapsTextAnchor(label, representativeTerms)) {
      return;
    }
    const existing = fieldMap.get(label) || {
      label,
      displayLabel: getEchoSignalDisplayLabel(displayLabel),
      localScore: 0,
      support: 0,
    };
    existing.localScore += Number(field.quality_score || 0) * 0.7;
    existing.localScore += Math.min(Number(field.record_count || 0), 80) * 0.035;
    existing.localScore += Math.max(0, 4 - index) * 0.4;
    existing.support = Math.max(existing.support, Number(field.record_count || 0));
    fieldMap.set(label, existing);
  });

  (currentLineProfile?.field_labels || []).forEach((rawLabel, index) => {
    const label = normalizeEchoSignalKey(rawLabel);
    if (!label || looksLikeBadWordProfileTerm(label) || !overlapsTextAnchor(label)) {
      return;
    }
    const existing = fieldMap.get(label) || {
      label,
      displayLabel: getEchoSignalDisplayLabel(rawLabel) || String(rawLabel || "").trim() || label,
      localScore: 0,
      support: 0,
    };
    existing.localScore += Math.max(0.4, 1.4 - index * 0.14);
    fieldMap.set(label, existing);
  });

  return filterLineEchoSourceFields(Array.from(fieldMap.values())
    .map((item) => {
      const corpusFieldCount = getCorpusFieldDocFreq(item.label);
      const rarityScore = Math.log((totalLines + 1) / ((corpusFieldCount || 0) + 1));
      return {
        ...item,
        corpusFieldCount,
        rarityScore,
        echoScore: item.localScore + rarityScore * 0.9,
      };
    })
    .filter((item) => {
      const corpusShare = (item.corpusFieldCount || 0) / totalLines;
      return corpusShare <= 0.03 || item.support >= 12 || item.echoScore >= 8;
    })
    .sort((left, right) =>
      right.echoScore - left.echoScore
      || right.support - left.support
      || left.displayLabel.localeCompare(right.displayLabel))
    .slice(0, 4));
}

function buildLineEchoSourceTerms(payload, currentLineProfile = getCurrentLineProfile(payload)) {
  const precomputed = currentLineProfile?.line_echo_profile;
  if (precomputed?.mode === "text_first_line_similarity_v2" && precomputed?.source_line_cues?.length) {
    return filterLineEchoSourceTerms(precomputed.source_line_cues.map((item) => ({
      term: normalizeEchoSignalKey(item.term),
      corpusLineCount: Number(item.corpus_line_count || 0),
      localRecordCount: countRecordsForTerm(payload.records || [], item.term),
      echoScore: Number(item.echo_score || 0),
    }))).slice(0, 6);
  }
  const totalLines = Math.max(state.corpusInterpretiveStats?.totalLines || 0, 1);
  const termMap = new Map();
  const textAnchorTerms = getTextFirstAnchorTerms(payload, currentLineProfile);
  const addTerm = (rawTerm, score, lineCount = 1) => {
    const term = normalizeEchoSignalKey(rawTerm);
    if (!term || looksLikeBadWordProfileTerm(term)) {
      return;
    }
    const existing = termMap.get(term) || {
      term,
      localScore: 0,
      lineCount: 0,
    };
    existing.localScore += score;
    existing.lineCount = Math.max(existing.lineCount, Number(lineCount || 0));
    termMap.set(term, existing);
  };

  for (const [term, score] of textAnchorTerms.entries()) {
    addTerm(term, score, 1);
  }

  const sourceFields = getEchoEligiblePayloadFields(payload)
    .filter((field) => Number(field.label_confidence || 0) >= 0.45)
    .slice(0, 4);
  sourceFields.forEach((field, fieldIndex) => {
    (field.representative_terms || []).slice(0, 4).forEach((term, termIndex) => {
      const anchorBoost = textAnchorTerms.has(normalizeEchoSignalKey(term)) ? 0.8 : 0;
      addTerm(term, Math.max(0.2, 0.8 - fieldIndex * 0.12 - termIndex * 0.1) + anchorBoost, 1);
    });
  });

  (currentLineProfile?.semantic_terms || []).forEach((term, index) => {
    const anchorBoost = textAnchorTerms.has(normalizeEchoSignalKey(term)) ? 0.9 : 0;
    addTerm(term, Math.max(0.12, 0.5 - index * 0.05) + anchorBoost, 1);
  });

  let ranked = filterLineEchoSourceTerms(Array.from(termMap.values())
    .map((item) => {
      const corpusLineCount = getCorpusTermDocFreq(item.term);
      const rarityScore = Math.log((totalLines + 1) / ((corpusLineCount || 0) + 1));
      const localRecordCount = countRecordsForTerm(payload.records || [], item.term);
      return {
        ...item,
        corpusLineCount,
        rarityScore,
        localRecordCount,
        echoScore: item.localScore * (1 + rarityScore) + Math.min(localRecordCount, 6) * 0.4,
      };
    })
    .filter((item) => {
      const corpusShare = (item.corpusLineCount || 0) / totalLines;
      return corpusShare <= 0.015 || item.localRecordCount >= 2 || item.echoScore >= 9;
    })
    .sort((left, right) =>
      right.echoScore - left.echoScore
      || right.localRecordCount - left.localRecordCount
      || left.corpusLineCount - right.corpusLineCount
      || left.term.localeCompare(right.term))
    .slice(0, 8));

  if (precomputed?.source_line_cues?.length) {
    const precomputedMap = new Map(precomputed.source_line_cues.map((item) => [
      normalizeEchoSignalKey(item.term),
      {
        term: normalizeEchoSignalKey(item.term),
        corpusLineCount: Number(item.corpus_line_count || 0),
        localRecordCount: countRecordsForTerm(payload.records || [], item.term),
        echoScore: Number(item.echo_score || 0),
      },
    ]));
    ranked = ranked.map((item) => {
      const existing = precomputedMap.get(item.term);
      if (!existing) {
        return item;
      }
      return {
        ...item,
        echoScore: Math.max(item.echoScore, existing.echoScore * 0.6),
      };
    });
  }

  return ranked.slice(0, 6);
}

async function jumpToSampleLine(sampleId, lineNumber, locusNormalized = null, options = {}) {
  if (!sampleId || !Number.isFinite(lineNumber)) {
    return;
  }

  const { suppressCoverageScroll = false, pinCoverageRow = false } = options || {};
  const hasExplicitHashTarget = Boolean(String(window.location.hash || "").replace(/^#/, ""));

  if (state.currentSampleEntry?.id !== sampleId) {
    await loadSample(sampleId);
  }
  if (!state.currentSampleEntry?.overview_available) {
    return;
  }
  await selectLine(lineNumber);
  if (locusNormalized) {
    const payload = state.lineCache.get(lineNumber);
    if (!payload) {
      if (!suppressCoverageScroll) {
        requestAnimationFrame(() => scrollToCoverageLine(lineNumber));
      }
      return;
    }
    const match = getPayloadLoci(payload).find((locus) => locus.normalized_form === locusNormalized);
    state.selectedLocus = match || null;
    state.activeInterpretiveTerm = null;
    if (state.selectedLocus) {
      updateSampleUrl(state.currentSampleEntry?.id || state.overview?.sample, lineNumber, {
        locusNormalized: state.selectedLocus.normalized_form,
      });
    }
    renderLineRecords(payload);
    if (state.selectedLocus) {
      ensureResearchLayerLoaded();
    }
  }
  if (hasExplicitHashTarget) {
    requestAnimationFrame(() => {
      scrollToRequestedHashTarget();
    });
    return;
  }
  if (pinCoverageRow) {
    requestAnimationFrame(() => {
      settlePinnedCoverageRow(lineNumber);
    });
  }
  if (!suppressCoverageScroll) {
    requestAnimationFrame(() => {
      if (Number.isFinite(lineNumber)) {
        scrollToCoverageLine(lineNumber);
      } else {
        scrollToCoverageSection();
      }
    });
  }
}

function buildRecurrenceCandidates(payload) {
  const currentLineProfile = getCurrentLineProfile(payload);
  if (!currentLineProfile && !(payload?.semantic_fields?.fields || []).length) {
    return {
      coreCandidates: [],
      extendedCandidates: [],
    };
  }

  const precomputed = currentLineProfile?.line_echo_profile;
  const withTier = (item, tier) => ({
    ...item,
    tier,
    tierLabel: tier === "extended" ? "extended echo" : "core echo",
  });
  if (precomputed?.mode === "text_first_line_similarity_v2" && Array.isArray(precomputed?.top_echoes)) {
    const candidates = precomputed.top_echoes
      .map((candidate) => {
        const sharedTerms = normalizeEchoSignalList(candidate.shared_terms || []);
        const sharedFields = normalizeEchoSignalList(candidate.shared_fields || []);
        const echoStrength = String(candidate.echo_strength || candidate.echo_type || "thin");
        const labelMap = {
          reviewable: "reviewable echo",
          thin: "thin echo",
          formulaic_recurrence: "formulaic recurrence",
          weak: "weak echo",
        };
        return {
          sample: candidate.sample,
          cantica: candidate.cantica,
          canto: candidate.canto,
          line_number: Number(candidate.line_number || 0),
          line_text: candidate.line_text || "",
          score: Number(candidate.score || 0),
          sharedTerms,
          sharedFields,
          overlapCount: Number(candidate.overlap_count || (sharedTerms.length + sharedFields.length)),
          hasMixedEvidence: Boolean(candidate.has_mixed_evidence || (sharedTerms.length && sharedFields.length)),
          strongFieldEcho: Boolean(candidate.strong_field_echo || sharedFields.length >= 1),
          strongCueEcho: Boolean(candidate.strong_cue_echo || sharedTerms.length >= 2),
          echoType: echoStrength,
          echoTypeLabel: candidate.echo_type_label || labelMap[echoStrength] || echoStrength.replaceAll("_", " "),
          echoStrength,
          direction: String(candidate.direction || ""),
          directionLabel: String(candidate.direction_label || ""),
          axisExplanation: String(candidate.axis_explanation || ""),
          axisLabels: Array.isArray(candidate.axis_labels) ? candidate.axis_labels : [],
          relationNote: String(candidate.relation_note || ""),
        };
      })
      .filter((candidate) => candidate.line_number && (candidate.sharedTerms.length || candidate.sharedFields.length))
      .sort((left, right) =>
        right.score - left.score
        || right.overlapCount - left.overlapCount
        || compareSampleIdsByCommedia(left.sample, right.sample)
        || left.line_number - right.line_number
      );

    const coreCandidates = candidates
      .filter((candidate) => candidate.echoStrength === "reviewable")
      .map((candidate) => withTier(candidate, "core"))
      .slice(0, 8);
    const extendedCandidates = candidates
      .filter((candidate) => candidate.echoStrength !== "reviewable")
      .map((candidate) => withTier(candidate, "extended"))
      .slice(0, 8);

    if (coreCandidates.length || extendedCandidates.length) {
      return {
        coreCandidates,
        extendedCandidates,
      };
    }
  }
  const getCandidateKey = (item) => `${item?.sample || item?.sample_id || ""}:${Number(item?.line_number || 0)}`;
  const compareEchoCandidates = (left, right) =>
    right.score - left.score
    || Number(right.hasMixedEvidence) - Number(left.hasMixedEvidence)
    || Number(right.strongFieldEcho) - Number(left.strongFieldEcho)
    || Number(right.strongCueEcho) - Number(left.strongCueEcho)
    || right.overlapCount - left.overlapCount
    || right.sharedFields.length - left.sharedFields.length
    || right.sharedTerms.length - left.sharedTerms.length
    || compareSampleIdsByCommedia(left.sample, right.sample)
    || left.line_number - right.line_number;
  const normalizeEchoType = (item) => {
    const sharedTerms = normalizeEchoSignalList(item.shared_terms || item.sharedTerms || []);
    const sharedFields = normalizeEchoSignalList(item.shared_fields || item.sharedFields || []);
    const hasMixedEvidence = Boolean(
      item.has_mixed_evidence
      || item.hasMixedEvidence
      || (sharedTerms.length && sharedFields.length)
    );
    const strongFieldEcho = Boolean(item.strong_field_echo || item.strongFieldEcho || sharedFields.length >= 2);
    const strongCueEcho = Boolean(item.strong_cue_echo || item.strongCueEcho || sharedTerms.length >= 3);
    let echoType = item.echo_type || item.echoType || "cue-echo";
    let echoTypeLabel = item.echo_type_label || item.echoTypeLabel || "cue echo";
    if (hasMixedEvidence) {
      echoType = "mixed-echo";
      echoTypeLabel = "mixed echo";
    } else if (sharedFields.length) {
      echoType = "field-echo";
      echoTypeLabel = "field echo";
    }
    return {
      ...item,
      score: Number(item.score || 0),
      sharedTerms,
      sharedFields,
      echoType,
      echoTypeLabel,
      overlapCount: Number(item.overlap_count || item.overlapCount || (sharedTerms.length + sharedFields.length) || 0),
      hasMixedEvidence,
      strongFieldEcho,
      strongCueEcho,
    };
  };
  const getOverlapSignalMeta = (candidate) => {
    const normalizedTerms = (candidate.sharedTerms || [])
      .map((term) => normalizeEchoSignalKey(term))
      .filter(Boolean);
    const normalizedFields = (candidate.sharedFields || [])
      .map((label) => normalizeEchoSignalKey(label))
      .filter(Boolean);
    const uniqueOverlap = new Set([...normalizedTerms, ...normalizedFields]);
    const nonBroadOverlap = new Set(
      [...normalizedTerms, ...normalizedFields].filter((item) => !looksLikeBroadLineEchoSignal(item) && !looksLikeMetaLineEchoSignal(item))
    );
    return {
      uniqueOverlapCount: uniqueOverlap.size,
      nonBroadOverlapCount: nonBroadOverlap.size,
      hasNonBroadOverlap: nonBroadOverlap.size > 0,
    };
  };

  const sourceTermItems = buildLineEchoSourceTerms(payload, currentLineProfile).slice(0, 6);
  const sourceTermWeights = new Map(sourceTermItems.map((item) => [item.term, item.echoScore]));
  const sourceFieldItems = buildLineEchoSourceFields(payload, currentLineProfile).slice(0, 4);
  const sourceFieldWeights = new Map(sourceFieldItems.map((item) => [item.label, item.echoScore]));
  const allowedSourceTerms = new Set(sourceTermItems.map((item) => item.term));
  const allowedSourceFields = new Set(sourceFieldItems.map((item) => item.label));
  const currentKey = `${state.currentSampleEntry?.id}:${payload.line_number}`;

  const runtimeCandidates = (state.researchLayer?.line_profiles || [])
    .filter((line) => line.id !== currentKey && line.sample !== state.currentSampleEntry?.id)
    .map((line) => {
      const candidateCueSet = new Set([
        ...(line.semantic_terms || []),
        ...(line.signature_terms || []),
        ...((line.dante_loci || []).filter((locus) => locus?.is_selectable_locus).map((locus) => locus.normalized_form)),
      ].map((term) => normalizeEchoSignalKey(term)).filter(Boolean));
      const fieldLabelSet = new Set((line.field_labels || []).map((label) => normalizeEchoSignalKey(label)).filter(Boolean));
      const sharedTerms = sourceTermItems
        .filter((item) => candidateCueSet.has(item.term))
        .slice(0, 4);
      const sharedFields = sourceFieldItems
        .filter((item) => fieldLabelSet.has(item.label))
        .slice(0, 3);
      const sharedTermScore = sharedTerms.reduce((sum, item) => sum + Math.min(5.2, (sourceTermWeights.get(item.term) || 0) / 2.6), 0);
      const sharedFieldScore = sharedFields.reduce((sum, item) => sum + Math.min(4.6, (sourceFieldWeights.get(item.label) || 0) / 1.8), 0);
      const overlapCount = sharedTerms.length + sharedFields.length;
      const hasMixedEvidence = Boolean(sharedTerms.length && sharedFields.length);
      const strongFieldEcho = sharedFields.length >= 2;
      const strongCueEcho = sharedTerms.length >= 3 && sharedTermScore >= 6.2;
      const passesEvidenceGate = hasMixedEvidence || strongFieldEcho || strongCueEcho;
      const score = sharedTermScore
        + sharedFieldScore
        + (hasMixedEvidence ? 1.1 : 0)
        + (strongFieldEcho ? 0.7 : 0)
        + (strongCueEcho ? 0.5 : 0)
        + (overlapCount >= 3 ? 0.6 : 0)
        + Math.min(sharedFields.length, 3) * 0.2;
      const reasons = [];
      if (sharedTerms.length) {
        reasons.push(`shared line cues: ${sharedTerms.map((item) => item.term).join(", ")}`);
      }
      if (sharedFields.length) {
        reasons.push(`shared local fields: ${sharedFields.map((item) => item.displayLabel).join(", ")}`);
      }
      let echoType = "cue-echo";
      let echoTypeLabel = "cue echo";
      if (hasMixedEvidence) {
        echoType = "mixed-echo";
        echoTypeLabel = "mixed echo";
      } else if (sharedFields.length) {
        echoType = "field-echo";
        echoTypeLabel = "field echo";
      }
      return {
        ...line,
        sharedTerms: normalizeEchoSignalList(sharedTerms.map((item) => item.term)),
        sharedFields: normalizeEchoSignalList(sharedFields.map((item) => item.displayLabel)),
        sharedTermCount: sharedTerms.length,
        sharedFieldCount: sharedFields.length,
        sharedTermScore,
        sharedFieldScore,
        overlapCount,
        hasMixedEvidence,
        strongFieldEcho,
        strongCueEcho,
        passesEvidenceGate,
        echoType,
        echoTypeLabel,
        score,
        reason: reasons.join(" · "),
      };
    })
    .filter((line) => line.sharedFields.length || line.sharedTerms.length >= 2)
    .map((line) => {
      const signalMeta = getOverlapSignalMeta(line);
      return {
        ...line,
        ...signalMeta,
        coreEligible: line.passesEvidenceGate
          && line.score >= 4.2
          && signalMeta.hasNonBroadOverlap
          && (signalMeta.uniqueOverlapCount >= 2 || line.strongFieldEcho || line.strongCueEcho),
        extendedEligible: line.score >= 3.0
          && (
            line.hasMixedEvidence
            || line.strongFieldEcho
            || line.strongCueEcho
            || (line.sharedFieldCount >= 1 && line.sharedFieldScore >= 2.4)
            || (line.sharedTermCount >= 2 && line.sharedTermScore >= 4.2)
            || (line.sharedFieldCount >= 1 && line.sharedTermCount >= 1)
            || line.overlapCount >= 3
          )
          && (
            signalMeta.hasNonBroadOverlap
            || signalMeta.uniqueOverlapCount >= 3
          ),
      };
    })
    .sort(compareEchoCandidates);

  const coreCandidateMap = new Map();
  const addCoreCandidate = (candidate) => {
    const key = getCandidateKey(candidate);
    if (!key || coreCandidateMap.has(key)) {
      return;
    }
    coreCandidateMap.set(key, withTier(candidate, "core"));
  };

  (precomputed?.echo_candidates || [])
    .map(normalizeEchoType)
    .map((candidate) => ({
      ...candidate,
      sharedTerms: normalizeEchoSignalList((candidate.sharedTerms || []).filter((term) => allowedSourceTerms.has(normalizeEchoSignalKey(term) || term))),
      sharedFields: normalizeEchoSignalList((candidate.sharedFields || []).filter((label) => allowedSourceFields.has(normalizeEchoSignalKey(label) || label))),
    }))
    .map((candidate) => normalizeEchoType({
      ...candidate,
      overlap_count: (candidate.sharedTerms || []).length + (candidate.sharedFields || []).length,
      has_mixed_evidence: Boolean((candidate.sharedTerms || []).length && (candidate.sharedFields || []).length),
      strong_field_echo: (candidate.sharedFields || []).length >= 2,
      strong_cue_echo: (candidate.sharedTerms || []).length >= 3,
    }))
    .filter((candidate) => (candidate.sharedTerms || []).length || (candidate.sharedFields || []).length)
    .map((candidate) => ({ ...candidate, ...getOverlapSignalMeta(candidate) }))
    .filter((candidate) =>
      (
        candidate.uniqueOverlapCount >= 2
        || candidate.strongFieldEcho
        || candidate.strongCueEcho
      )
      && candidate.hasNonBroadOverlap
    )
    .forEach(addCoreCandidate);

  runtimeCandidates
    .filter((candidate) => candidate.coreEligible)
    .forEach(addCoreCandidate);

  const coreCandidates = Array.from(coreCandidateMap.values())
    .sort(compareEchoCandidates)
    .slice(0, 8);
  const coreKeys = new Set(coreCandidates.map(getCandidateKey));

  const extendedCandidates = runtimeCandidates
    .filter((candidate) => !coreKeys.has(getCandidateKey(candidate)))
    .filter((candidate) => candidate.extendedEligible)
    .map((candidate) => withTier(candidate, "extended"))
    .sort(compareEchoCandidates)
    .slice(0, 8);

  return {
    coreCandidates,
    extendedCandidates,
  };
}

function renderSelectableLineMarkup(payload, options = {}) {
  const text = String(payload?.line_text || "");
  const loci = getPayloadLoci(payload);
  const dataAttribute = options.dataAttribute || "data-line-locus-id";
  const activeLocusId = options.activeLocusId || state.selectedLocus?.id;
  const shouldMarkInitialLetter = Boolean(options.markInitialLetter);
  const tokenPattern = /[A-Za-zÀ-ÖØ-öø-ÿ']+/g;
  let cursor = 0;
  let locusIndex = 0;
  let didMarkInitialLetter = false;
  let markup = "";

  function renderTokenSurface(surface) {
    const normalizedSurface = String(surface || "");
    const escapedSurface = escapeHtml(normalizedSurface);
    if (!shouldMarkInitialLetter || didMarkInitialLetter || !normalizedSurface) {
      return escapedSurface;
    }
    didMarkInitialLetter = true;
    return `<span class="line-initial-letter">${escapeHtml(normalizedSurface[0])}</span>${escapeHtml(normalizedSurface.slice(1))}`;
  }

  for (const match of text.matchAll(tokenPattern)) {
    markup += escapeHtml(text.slice(cursor, match.index));
    const locus = loci[locusIndex];
    if (isLocusSelectableInWorkbench(locus)) {
      markup += `
        <button
          type="button"
          class="line-locus-token is-selectable ${activeLocusId === locus.id ? "is-active" : ""}"
          ${dataAttribute}="${locus.id}">
          ${renderTokenSurface(locus.surface_form)}
        </button>
      `;
    } else {
      markup += `<span class="line-locus-token is-stopword">${renderTokenSurface(locus?.surface_form || match[0])}</span>`;
    }
    cursor = (match.index || 0) + match[0].length;
    locusIndex += 1;
  }

  markup += escapeHtml(text.slice(cursor));
  return markup;
}

function renderLocusJumpRow(occurrence, locusNormalized = state.selectedLocus?.normalized_form, phraseText = "") {
  const availability = getMountedSampleAvailability(occurrence.sample_id);
  const canJump = availability.canJump;
  const targetTerms = phraseText
    ? []
    : [state.selectedLocus?.surface_form, locusNormalized, occurrence.normalized_form].filter(Boolean);
  const phraseTerms = phraseText ? [phraseText] : [];
  return `
    <button
      type="button"
      class="occurrence-row ${canJump ? "" : "is-disabled"}"
      ${canJump ? `data-occurrence-sample="${occurrence.sample_id}" data-occurrence-line="${occurrence.line_number}" data-occurrence-locus="${escapeHtml(locusNormalized || occurrence.normalized_form || "")}"` : "disabled"}>
      <strong>${escapeHtml(formatShortCommediaLocation(occurrence.cantica, occurrence.canto, occurrence.line_number))}</strong>
      <span class="occurrence-context-line">${highlightDualTerms(occurrence.line_text, targetTerms, phraseTerms)}</span>
      ${canJump ? "" : `<small>${escapeHtml(availability.note)}</small>`}
    </button>
  `;
}

function textContainsFocusTerm(text, targetTerms = []) {
  const normalizedTargets = new Set((targetTerms || []).map((term) => normalizeLocusForm(term)).filter(Boolean));
  if (!normalizedTargets.size) {
    return false;
  }
  const tokens = String(text || "").match(/[A-Za-zÀ-ÖØ-öø-ÿ']+/g) || [];
  return tokens.some((token) => normalizedTargets.has(normalizeLocusForm(token)));
}

function windowContainsFocusTerm(window, targetTerms = []) {
  return textContainsFocusTerm(window?.center_line_text, targetTerms)
    || textContainsFocusTerm(window?.candidate_line_text, targetTerms);
}

function renderConcurrenceWindowRow(window, concurrenceWord = "") {
  const availability = getMountedSampleAvailability(window.sample_id);
  const canJump = availability.canJump;
  const targetTerms = getActiveLocusHighlightTerms();
  if (!windowContainsFocusTerm(window, targetTerms)) {
    return "";
  }
  const concurrenceTerms = [concurrenceWord];
  const weight = Number(window.weight || 0);
  const contextMarkup = renderConcurrenceContextMarkup(window, weight, targetTerms, concurrenceTerms);
  return `
    <button
      type="button"
      class="occurrence-row ${canJump ? "" : "is-disabled"}"
      ${canJump ? `data-occurrence-sample="${window.sample_id}" data-occurrence-line="${window.candidate_line_number}" data-occurrence-locus="${escapeHtml(state.selectedLocus?.normalized_form || "")}"` : "disabled"}>
      <strong>${escapeHtml(formatShortCommediaLocation(window.cantica, window.canto, window.candidate_line_number, window.line_number))}</strong>
      ${contextMarkup}
      ${canJump ? "" : `<small>${escapeHtml(availability.note)}</small>`}
    </button>
  `;
}

function renderConcurrenceContextMarkup(window, weight, targetTerms = [], concurrenceTerms = []) {
  const sourceRows = [
    {
      lineNumber: window.line_number,
      text: window.center_line_text,
      targetTerms,
      concurrenceTerms: weight >= 3 ? concurrenceTerms : [],
      hasFocus: textContainsFocusTerm(window.center_line_text, targetTerms),
    },
    {
      lineNumber: window.candidate_line_number,
      text: window.candidate_line_text,
      targetTerms: [],
      concurrenceTerms,
      hasFocus: textContainsFocusTerm(window.candidate_line_text, targetTerms),
    },
  ]
    .filter((row) => String(row.text || "").trim())
    .reduce((rows, row) => {
      const existing = rows.find((candidate) =>
        Number(candidate.lineNumber) === Number(row.lineNumber)
        && String(candidate.text || "").trim() === String(row.text || "").trim()
      );
      if (!existing) {
        rows.push({
          ...row,
          targetTerms: [...new Set(row.targetTerms || [])],
          concurrenceTerms: [...new Set(row.concurrenceTerms || [])],
        });
        return rows;
      }
      existing.targetTerms = [...new Set([...(existing.targetTerms || []), ...(row.targetTerms || [])])];
      existing.concurrenceTerms = [...new Set([...(existing.concurrenceTerms || []), ...(row.concurrenceTerms || [])])];
      existing.hasFocus = Boolean(existing.hasFocus || row.hasFocus);
      return rows;
    }, []);

  if (!sourceRows.length) {
    return `<span class="occurrence-context-line">暂无上下文。</span>`;
  }

  const prioritizedRows = [...sourceRows].sort((left, right) =>
    Number(Boolean(right.hasFocus)) - Number(Boolean(left.hasFocus))
    || Number(right.lineNumber === window.line_number) - Number(left.lineNumber === window.line_number)
  );
  const focusAnchoredRows = prioritizedRows.filter((row) => row.hasFocus);
  const rows = weight >= 3
    ? [focusAnchoredRows[0] || prioritizedRows[0]]
    : (focusAnchoredRows.length
        ? [focusAnchoredRows[0], ...prioritizedRows.filter((row) => row !== focusAnchoredRows[0]).slice(0, 1)]
        : prioritizedRows.slice(0, 2));
  if (rows.length === 1) {
    return renderConcurrenceContextLine(rows[0].text, rows[0].targetTerms, rows[0].concurrenceTerms);
  }

  return `
    <div class="occurrence-context-lines">
      ${rows.map((row) => renderConcurrenceContextLine(row.text, row.targetTerms, row.concurrenceTerms)).join("")}
    </div>
  `;
}

function renderConcurrenceContextLine(text, targetTerms = [], concurrenceTerms = []) {
  return `<span class="occurrence-context-line">${highlightDualTerms(text, targetTerms, concurrenceTerms)}</span>`;
}

function renderPhraseExpansionCard(item) {
  const localHere = (item.sample_occurrences || []).some(
    (occurrence) => occurrence.sample_id === state.currentSampleEntry?.id && occurrence.line_number === state.selectedLine
  );
  const sortedOccurrences = [...(item.sample_occurrences || [])].sort(compareCanticaLocations);
  const occurrenceCount = Number(item.occurrence_count || 0);
  const occurrenceLabel = choose(
    `${occurrenceCount} exact occurrence${occurrenceCount === 1 ? "" : "s"}`,
    `${occurrenceCount} exact occurrences`
  );

  return `
    <article class="phrase-expansion-card ${localHere ? "is-local" : ""}">
      <div class="micro-context-head">
        <strong>${escapeHtml(item.phrase)}</strong>
        <span class="pill">${occurrenceLabel}</span>
      </div>
      <div class="occurrence-list phrase-occurrence-grid">
        ${sortedOccurrences.map((occurrence) => renderLocusJumpRow(occurrence, state.selectedLocus?.normalized_form, occurrence.phrase || item.phrase)).join("") || `<div class="empty-state">${choose(
          "No retained occurrences are available for this phrase yet.",
          "当前短语还没有保留可展示的 occurrence。"
        )}</div>`}
      </div>
    </article>
  `;
}

function formatCommediaLineSpan(...lineNumbers) {
  const normalized = [...new Set(
    lineNumbers
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  )].sort((left, right) => left - right);

  if (!normalized.length) {
    return "";
  }
  if (normalized.length === 1) {
    return String(normalized[0]);
  }
  return `${normalized[0]}-${normalized[normalized.length - 1]}`;
}

function formatShortCommediaLocation(cantica, canto, lineNumber, ...additionalLineNumbers) {
  const shortCantica = CANTICA_SHORT_LABELS[String(cantica || "").toLowerCase()] || cantica || "";
  const spanLabel = formatCommediaLineSpan(lineNumber, ...additionalLineNumbers);
  const cantoLabel = [shortCantica, canto].filter(Boolean).join(" ").trim();
  if (!spanLabel) {
    return cantoLabel;
  }
  if (!cantoLabel) {
    return spanLabel;
  }
  return `${cantoLabel}, ${spanLabel}`;
}

function getWordLocusProfile(normalizedForm) {
  const key = String(normalizedForm || "").trim();
  if (!key) {
    return null;
  }
  const profile = state.danteWordProfileCache.get(key) || null;
  if (!profile || Number(profile.occurrence_count || 0) <= 1) {
    return null;
  }
  return {
    ...profile,
    exact_local_phrase_expansions: normalizePhraseExpansionEntries(profile.exact_local_phrase_expansions || []),
  };
}

function getMountedSampleAvailability(sampleId) {
  const entry = state.manifestMap.get(String(sampleId || ""));
  if (!entry) {
    return { canJump: false, note: choose("This target is not available for jumping yet.", "当前还不能跳到这一处。") };
  }
  if (!canSampleOpenLineWorkbench(entry)) {
    return { canJump: false, note: choose("Direct line jump is not available here yet.", "当前还不能直接跳到这一行。") };
  }
  return { canJump: true, note: "" };
}

function isLocusSelectableInWorkbench(locus) {
  if (!locus?.is_selectable_locus) {
    return false;
  }
  if (!state.danteWordLociIndex) {
    return true;
  }
  const family = getWordFamilyConfig(locus.normalized_form);
  if (family) {
    return getWordFamilyIndexedOccurrenceCount(family) > 1;
  }
  const descriptor = state.danteWordLociIndex?.profiles?.[locus.normalized_form];
  if (!descriptor) {
    return false;
  }
  return Number(descriptor.occurrence_count || 0) > 1;
}

function compareCanticaLocations(left = {}, right = {}) {
  const leftCantica = CANTICA_ORDER.get(String(left.cantica || left.cantica_slug || "").toLowerCase()) ?? 99;
  const rightCantica = CANTICA_ORDER.get(String(right.cantica || right.cantica_slug || "").toLowerCase()) ?? 99;
  return leftCantica - rightCantica
    || Number(left.canto || 0) - Number(right.canto || 0)
    || Number(left.line_number || left.candidate_line_number || 0) - Number(right.line_number || right.candidate_line_number || 0)
    || Number(left.token_start || left.token_index || 0) - Number(right.token_start || right.token_index || 0)
    || String(left.phrase || left.line_text || "").localeCompare(String(right.phrase || right.line_text || ""));
}

function renderShellSample(entry) {
  return coveragePanel.renderShellSample(entry);
}

function renderLineLoadingState(lineNumber) {
  const lineLabel = Number.isFinite(lineNumber) ? `Line ${lineNumber}` : "Selected line";
  const loadingCopy = state.uiLanguage === "en"
    ? {
        title: `${lineLabel}: loading close reading…`,
        context: "Preparing the selected line, cards, and local analysis.",
        records: "Loading the line-level commentary cards for this sample…",
        loci: "Loading Dante word-locus signals for this line…",
        vocabulary: "Loading interpretive vocabulary for this line…",
        recurrence: "Loading recurrence hints for this line…",
      }
    : {
        title: `${lineLabel}：正在载入细读层…`,
        context: "正在准备这一行对应的 cards、line snapshot 和局部分析。",
        records: "正在加载这一行的 commentary cards…",
        loci: "正在加载这一行的 Dante 词位信号…",
        vocabulary: "正在加载这一行的 interpretive vocabulary…",
        recurrence: "正在加载这一行的 recurrence 提示…",
      };

  elements.lineTitle.textContent = loadingCopy.title;
  elements.lineContext.innerHTML = `<div class="empty-state">${escapeHtml(loadingCopy.context)}</div>`;
  if (elements.commentarySummary) {
    elements.commentarySummary.innerHTML = `<div class="empty-state">${escapeHtml(loadingCopy.records)}</div>`;
  }
  elements.recordsList.innerHTML = `<div class="empty-state">${escapeHtml(loadingCopy.records)}</div>`;
  elements.locusPanel.innerHTML = `<div class="empty-state">${escapeHtml(loadingCopy.loci)}</div>`;
  elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(loadingCopy.vocabulary)}</div>`;
  elements.recurrencePanel.innerHTML = `<div class="empty-state">${escapeHtml(loadingCopy.recurrence)}</div>`;
  clearAnalysisSummary();
}

function renderCoverageOnlyLine(lineNumber) {
  return coveragePanel.renderCoverageOnlyLine(lineNumber);
}

function renderModuleLabel(key) {
  const labels = {
    coverage: "coverage",
    records: "record cards",
    semantic_fields: "semantic fields",
    comparison: "comparison",
  };
  return labels[key] || key;
}

function setWorkspaceInteractive(enabled) {
  elements.sortMode.disabled = !enabled;
  elements.sortDirection.disabled = !enabled;
  elements.commentarySortMode && (elements.commentarySortMode.disabled = !enabled);
  elements.commentarySortDirection && (elements.commentarySortDirection.disabled = !enabled);
  elements.openCommentaryPanel && (elements.openCommentaryPanel.disabled = !enabled);
  elements.clearPins.disabled = !enabled;
  syncCompareHeadActions(enabled);
}

function syncCompareHeadActions(workspaceEnabled = Boolean(state.overview)) {
  if (!elements.openCompareLine) {
    return;
  }
  const canOpenLine = workspaceEnabled && Boolean(state.currentSampleEntry?.id) && Number.isFinite(state.selectedLine);
  elements.openCompareLine.disabled = !canOpenLine;
}

function renderAnalysisSummary(payload) {
  const analysis = computeLineAnalysis(payload);
  const eraListHtml = analysis.eras.length
    ? analysis.eras
        .map(
          (era) => `
            <button
              type="button"
              class="analysis-era"
              data-century-label="${escapeHtml(era.label)}"
              style="--era-strength: ${era.strength}">
              <span class="analysis-label">${escapeHtml(era.label)}</span>
              <strong>${era.count} records</strong>
            </button>
          `
        )
        .join("")
    : `<div class="analysis-era"><span class="analysis-label">Undated</span><strong>No dated records</strong></div>`;

  const summary = ensureAnalysisSummaryElement();
  summary.dataset.lineNumber = String(payload.line_number);
  summary.innerHTML = `
    <div class="analysis-kicker">Analysis Layer</div>
    <div class="title-with-help section-title-with-help">
      <h3>Line ${payload.line_number} Snapshot</h3>
      ${renderHelpButton("analysis-layer", "Analysis Layer 说明")}
    </div>
    <p class="analysis-lead">${escapeHtml(analysis.lead)}</p>
    <div class="analysis-metrics">
      <div class="analysis-metric">
        <span class="analysis-label">Coverage</span>
        <strong>${analysis.coverageCount} records</strong>
        <p>${escapeHtml(analysis.coverageHint)}</p>
      </div>
      <div class="analysis-metric">
        <span class="analysis-label">Granularity</span>
        <strong>${analysis.singleCount} single / ${analysis.rangeCount} range</strong>
        <p>${escapeHtml(analysis.granularityHint)}</p>
      </div>
      <div class="analysis-metric">
        <span class="analysis-label analysis-label-with-help">
          <span>Commentary Terms</span>
          ${renderHelpButton("commentary-terms", "Commentary Terms 说明")}
        </span>
        <strong>${escapeHtml(analysis.topTermsLabel)}</strong>
        <p>${escapeHtml(analysis.topTermsHint)}</p>
      </div>
      <div class="analysis-metric">
        <span class="analysis-label">Diachronic Span</span>
        <strong>${escapeHtml(analysis.spanLabel)}</strong>
        <p>${escapeHtml(`Earliest: ${analysis.earliestLabel}`)}</p>
        <p>${escapeHtml(`Latest: ${analysis.latestLabel}`)}</p>
      </div>
    </div>
    <div class="analysis-era-list">${eraListHtml}</div>
  `;

  const activeRow = elements.coverageList.querySelector(`.coverage-row[data-line-number="${payload.line_number}"]`);
  if (activeRow) {
    activeRow.insertAdjacentElement("afterend", summary);
  }

  summary.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest("[data-century-label]") || target.closest(".help-trigger"))) {
      return;
    }
    if (isApprovedUiEasterEggLine(state.currentSampleEntry?.id || state.overview?.sample, payload.line_number)) {
      maybeTriggerApprovedUiEasterEgg("analysis-layer-click");
    }
    scrollToRecordsSection();
  });

  summary.querySelectorAll("[data-century-label]").forEach((button) => {
    button.addEventListener("click", () => {
      focusCenturyRecords(payload, button.dataset.centuryLabel || "");
    });
  });

  if (isApprovedUiEasterEggLine(state.currentSampleEntry?.id || state.overview?.sample, payload.line_number)) {
    requestAnimationFrame(() => {
      maybeTriggerApprovedUiEasterEgg("analysis-layer-render");
    });
  }
}

function syncSortControls() {
  if (elements.sortMode) {
    elements.sortMode.value = state.sortMode;
  }
  if (elements.commentarySortMode) {
    elements.commentarySortMode.value = state.sortMode;
  }
  if (elements.sortDirection) {
    elements.sortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
  }
  if (elements.commentarySortDirection) {
    elements.commentarySortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
  }
}

function focusCenturyRecords(payload, centuryLabel) {
  const normalizedCentury = String(centuryLabel || "").trim();
  if (!normalizedCentury) {
    return;
  }

  const targetRecord = [...(payload.records || [])]
    .sort(makeRecordSorter("chronological", "asc"))
    .find((record) => String(record.century_label || "Undated") === normalizedCentury);

  if (!targetRecord) {
    return;
  }

  state.activeSemanticField = null;
  state.activeInterpretiveTerm = null;
  state.sortMode = "chronological";
  state.sortDirection = "asc";
  state.activeSearchRecordId = targetRecord.id;
  syncSortControls();
  renderLineRecords(payload);
  scrollToCommentarySection();

  requestAnimationFrame(() => {
    const card = elements.recordsList.querySelector(`.record-card[data-record-id="${CSS.escape(targetRecord.id)}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderSemanticPanel(payload, semanticState) {
  return semanticPanel.renderSemanticPanel(payload, semanticState);
}

function togglePin(record, activeLineNumber) {
  if (state.pinned.has(record.id)) {
    state.pinned.delete(record.id);
  } else {
    const payload = state.lineCache.get(state.selectedLine) || null;
    const semanticState = payload ? getSemanticStateForPayload(payload) : { fields: [], recordToField: new Map() };
    const fieldId = semanticState.recordToField.get(record.id) || null;
    const field = semanticState.fields.find((item) => item.id === fieldId) || null;
    state.pinned.set(record.id, {
      record,
      activeLineNumber,
      sampleId: state.currentSampleEntry?.id || null,
      sampleTitle: state.currentSampleEntry?.title || null,
      lineText: payload?.line_text || "",
      locationLabel: formatShortCommediaLocation(record.cantica, record.canto, activeLineNumber),
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
    });
  }
  renderPinned();
  renderLineRecords(state.lineCache.get(state.selectedLine));
}

async function toggleExpanded(recordId) {
  if (state.expanded.has(recordId)) {
    state.expanded.delete(recordId);
    renderLineRecords(state.lineCache.get(state.selectedLine));
    return;
  }

  state.expanded.add(recordId);
  const record = findRecordById(recordId);
  if (!record) {
    renderLineRecords(state.lineCache.get(state.selectedLine));
    return;
  }

  if (state.fullTextCache.has(recordId) || state.loadingFullText.has(recordId)) {
    renderLineRecords(state.lineCache.get(state.selectedLine));
    return;
  }

  state.loadingFullText.add(recordId);
  renderLineRecords(state.lineCache.get(state.selectedLine));

  try {
    const fulltextStore = await ensureSampleFullTextStoreLoaded(state.overview.sample);
    const fulltext = fulltextStore?.records?.[recordId]?.record_text || "";
    state.fullTextCache.set(recordId, fulltext || record.record_text_preview || record.record_summary);
  } catch (error) {
    state.fullTextCache.set(recordId, record.record_text_preview || record.record_summary);
  } finally {
    state.loadingFullText.delete(recordId);
    renderLineRecords(state.lineCache.get(state.selectedLine));
  }
}

function buildPills(record, activeLineNumber) {
  const pills = [];
  const rangeClass = Number(record.line_span || 0) === 1 ? "single-pill" : "range-pill";
  pills.push(`<span class="pill ${rangeClass}">${escapeHtml(formatRangeNote(record, activeLineNumber))}</span>`);

  if (record.date_label) {
    pills.push(`<span class="pill">${escapeHtml(record.date_label)}</span>`);
  }
  if (record.century_label) {
    pills.push(`<span class="pill">${escapeHtml(record.century_label)}</span>`);
  }
  const authorityLabels = [...new Set(
    (Array.isArray(record.authority_authors) ? record.authority_authors : [])
      .map((row) => String(row?.display_name || row?.canonical_name || row?.author_id || "").trim())
      .filter(Boolean)
  )].slice(0, 3);
  authorityLabels.forEach((label) => {
    pills.push(`<span class="pill authority-pill">${escapeHtml(label)}</span>`);
  });

  return pills.join("");
}

function formatRangeNote(record, activeLineNumber) {
  if (record.line_span === 1) {
    return Number.isFinite(activeLineNumber) ? `Single-line note ${activeLineNumber}` : "Single-line note";
  }
  return `Range note ${record.line_start}-${record.line_end}`;
}

function renderRecordBody(record, isExpanded, highlightTerms = [], highlightGroups = []) {
  const chooseText = (english, chinese) => (state.uiLanguage === "en" ? english : chinese);
  const renderInlineSummary = (summaryText) => {
    const normalized = normalizeCompareText(summaryText);
    if (!normalized) {
      return "";
    }
    const summaryMarkup = renderReadingBody(
      normalized,
      { chunkLongParagraphs: false, maxParagraphs: 1 },
      highlightTerms,
      buildAuthorityTextHighlightGroups(normalized, highlightGroups, record)
    );
    const llmDisclosure = chooseText("One-line summary generated by LLM from the commentary text.", "由 LLM 基于注释正文生成的一句话摘要。");
    const llmDisclosureLabel = chooseText("Show LLM disclaimer", "显示 LLM 免责声明");
    return `
      <div class="record-inline-summary">
        <div class="record-inline-summary-row">
          <details class="record-inline-summary-disclosure">
            <summary class="record-inline-summary-disclosure-toggle" aria-label="${escapeHtml(llmDisclosureLabel)}">
              <span class="record-inline-summary-disclosure-icon" aria-hidden="true">i</span>
            </summary>
            <div class="record-inline-summary-disclosure-copy">${escapeHtml(llmDisclosure)}</div>
          </details>
          <div class="record-inline-summary-copy">
            ${summaryMarkup}
          </div>
        </div>
      </div>
    `;
  };

  if (state.activeSearchRecordId === record.id) {
    const searchText = state.fullTextCache.get(record.id) || record.record_text_preview || record.record_summary;
    return renderReadingBody(
      searchText,
      { chunkLongParagraphs: true },
      highlightTerms,
      buildAuthorityTextHighlightGroups(searchText, highlightGroups, record)
    );
  }

  if (!isExpanded || !shouldShowExpandToggle(record)) {
    return renderReadingBody(
      record.record_summary,
      { chunkLongParagraphs: true, maxParagraphs: 2 },
      highlightTerms,
      buildAuthorityTextHighlightGroups(record.record_summary, highlightGroups, record)
    );
  }

  if (state.loadingFullText.has(record.id)) {
    return `<div class="reading-body"><p class="loading-copy">${state.uiLanguage === "en" ? "Loading full text..." : "Loading full text..."}</p></div>`;
  }

  const fullText = state.fullTextCache.get(record.id) || record.record_text_preview || record.record_summary;
  return `
    ${renderInlineSummary(record.one_line_summary || record.record_summary)}
    ${renderReadingBody(
      fullText,
      { chunkLongParagraphs: true },
      highlightTerms,
      buildAuthorityTextHighlightGroups(fullText, highlightGroups, record)
    )}
  `;
}

function shouldShowExpandToggle(record) {
  if (record.record_summary && record.record_summary.endsWith("…")) {
    return true;
  }

  const cachedText = state.fullTextCache.get(record.id);
  if (cachedText) {
    return normalizeCompareText(cachedText) !== normalizeCompareText(record.record_summary || "");
  }

  return false;
}

function normalizeCompareText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizePhraseFamilyKey(text) {
  const normalized = normalizeCompareText(text)
    .split(" ")
    .map((token) => normalizeLocusForm(token))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return normalized.join(" ");
}

function normalizePhraseExpansionEntries(expansions = []) {
  const phraseMap = new Map();

  for (const expansion of expansions || []) {
    const phraseKey = normalizePhraseFamilyKey(expansion.phrase || expansion.surface_phrase || "");
    if (!phraseKey) {
      continue;
    }
    const existing = phraseMap.get(phraseKey) || {
      phraseVariants: new Map(),
      sampleOccurrenceMap: new Map(),
    };
    for (const occurrence of expansion.sample_occurrences || []) {
      const occurrencePhrase = occurrence.phrase || occurrence.surface_phrase || expansion.phrase || expansion.surface_phrase || "";
      const key = [
        occurrence.sample_id,
        occurrence.line_number,
        occurrencePhrase,
        occurrence.token_start,
        occurrence.token_end,
      ].join("|");
      if (!existing.sampleOccurrenceMap.has(key)) {
        existing.sampleOccurrenceMap.set(key, occurrence);
      }
      if (occurrencePhrase) {
        existing.phraseVariants.set(
          occurrencePhrase,
          (existing.phraseVariants.get(occurrencePhrase) || 0) + 1
        );
      }
    }
    phraseMap.set(phraseKey, existing);
  }

  return Array.from(phraseMap.values())
    .map((item) => {
      const sample_occurrences = Array.from(item.sampleOccurrenceMap.values()).sort(compareCanticaLocations);
      const localOccurrence = sample_occurrences.find(
        (occurrence) => occurrence.sample_id === state.currentSampleEntry?.id && occurrence.line_number === state.selectedLine
      );
      const phrase = localOccurrence?.phrase
        || Array.from(item.phraseVariants.entries())
          .sort((left, right) =>
            Number(right[1] || 0) - Number(left[1] || 0)
            || left[0].localeCompare(right[0]))
          .map(([label]) => label)[0]
        || "";
      return {
        phrase,
        occurrence_count: item.sampleOccurrenceMap.size,
        sample_occurrences,
      };
    })
    .sort((left, right) =>
      Number(right.occurrence_count || 0) - Number(left.occurrence_count || 0)
      || left.phrase.localeCompare(right.phrase));
}

function normalizeLocusForm(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z']/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/'/g, "");
}

const SEMANTIC_FIELD_THEME_HINTS = Object.freeze([
  {
    label: "Darkness / Lostness",
    gloss: "Darkness, error, and fearful disorientation.",
    tokens: ["oscura", "oscuro", "selva", "smarrita", "ignoranzia", "ignorantie", "paura", "amara", "ritrovai"],
    minimumMatches: 2,
  },
  {
    label: "Life / Midpoint Framing",
    gloss: "Midlife counting, half-life framing, or life-course measure.",
    tokens: ["vita", "vitae", "dimidium", "anni", "mezzo", "cammin"],
    minimumMatches: 2,
  },
  {
    label: "Age / Midpoint Count",
    gloss: "Year-counting, midpoint reckoning, or age-based framing.",
    tokens: ["anni", "dimidium", "estremita", "mezzo"],
    minimumMatches: 2,
  },
  {
    label: "Kinds of Life / Soul Faculties",
    gloss: "Vegetative, sensitive, or rational life distinctions.",
    tokens: ["vegetabile", "sensibile", "intendere", "gente", "considera"],
    minimumMatches: 2,
  },
]);

const SEMANTIC_FIELD_RESIDUE_TERMS = new Set([
  "autor",
  "auctor",
  "item",
  "secundum",
  "dicunt",
  "dicit",
  "dicens",
  "dicitur",
  "nichilominus",
  "litterale",
  "pare",
  "posto",
  "ponit",
  "ponunt",
  "breviter",
  "qualiter",
  "finaliter",
  "finalmente",
  "hucusque",
  "quomodo",
  "modus",
  "auctore",
  "nunc",
  "which",
  "from",
  "says",
  "saying",
  "called",
  "therefore",
  "namely",
  "astrology",
  "esclamazione",
  "dimostra",
  "posto",
]);

const SEMANTIC_TERM_NORMALIZATION_MAP = Object.freeze({
  oratio: "orazione",
  oratione: "orazione",
  orationem: "orazione",
  orationis: "orazione",
  pater: "padre",
  patrem: "padre",
  patris: "padre",
  patri: "padre",
  deus: "dio",
  deum: "dio",
  deo: "dio",
  dei: "dio",
  deos: "dio",
  iddio: "dio",
  celum: "cielo",
  celi: "cielo",
  celo: "cielo",
  coeli: "cielo",
  coelo: "cielo",
  caeli: "cielo",
  caelo: "cielo",
  ciel: "cielo",
  cieli: "cielo",
  lumen: "luce",
  lucem: "luce",
  lucis: "luce",
  animae: "anima",
  animam: "anima",
  animas: "anima",
  anime: "anima",
  spiritus: "spirito",
  spiritum: "spirito",
  spiritui: "spirito",
  amor: "amore",
  amorem: "amore",
  gratia: "grazia",
  signum: "segno",
  civitatem: "citta",
  fides: "fede",
  angelus: "angelo",
  angelorum: "angelo",
  terram: "terra",
  peccati: "peccato",
  peccatum: "peccato",
  comparationem: "comparazione",
  corpus: "corpo",
  virtus: "virtu",
  virtutem: "virtu",
  poenam: "pena",
  umbram: "ombra",
  naturam: "natura",
  voluntas: "volonta",
  materiam: "materia",
  tempus: "tempo",
  ignis: "fuoco",
  ratio: "ragione",
  bonum: "bene",
  verbum: "verbo",
  settentrion: "settentrione",
  septentrione: "settentrione",
  septentrionem: "settentrione",
  septentrionis: "settentrione",
  cesere: "Cesare",
  cesare: "Cesare",
  cesari: "Cesare",
  marcello: "Marcello",
  mercellus: "Marcello",
  virgile: "Virgilio",
  virgilio: "Virgilio",
  vergilio: "Virgilio",
  virgilius: "Virgilio",
  virgil: "Virgilio",
  beatrice: "Beatrice",
  beatricie: "Beatrice",
  biatrice: "Beatrice",
  beatrix: "Beatrice",
  vitae: "vita",
  dimidium: "mezzo",
  annum: "anni",
  etade: "eta",
  mezo: "mezzo",
  ignoranzia: "ignoranza",
  ignorantie: "ignoranza",
  ignorantie: "ignoranza",
});

const SEMANTIC_FIELD_LABEL_PROPOSALS = Object.freeze([
  { label: "Prayer / Oration", gloss: "Prayer language, invocation, or explicitly devotional address.", tokens: ["oratio", "oratione", "orationem", "orationis", "orazione"] },
  { label: "Father / Paternal Address", gloss: "Father-language, paternal invocation, or paternal authority.", tokens: ["pater", "patrem", "patris", "patri", "padre"] },
  { label: "God / Divine Agency", gloss: "God-language, divine action, or explicitly theological reference to God.", tokens: ["deus", "deum", "deo", "dei", "deos", "iddio", "dio"] },
  { label: "Heaven / Celestial Order", gloss: "Heaven, celestial hierarchy, or upper-world orientation.", tokens: ["celum", "celi", "celo", "coeli", "coelo", "caeli", "caelo", "ciel", "cieli", "cielo"] },
  { label: "Light / Illumination", gloss: "Light, radiance, illumination, or visionary brightness.", tokens: ["lumen", "lucem", "lucis", "luce"] },
  { label: "Soul / Interior Life", gloss: "Soul-language, interior state, or animate spiritual life.", tokens: ["animae", "animam", "animas", "anime", "anima"] },
  { label: "Spirit / Spiritual Being", gloss: "Spirit-language, spiritual presence, or non-corporeal agency.", tokens: ["spiritus", "spiritum", "spiritui", "spirito"] },
  { label: "Love / Charity", gloss: "Love, caritas, affective attraction, or charity-like motive force.", tokens: ["amor", "amorem", "amore"] },
  { label: "Grace", gloss: "Grace, gifted assistance, or salvific favor.", tokens: ["gratia", "grazia"] },
  { label: "Sign / Signification", gloss: "Sign, token, emblem, or interpretive indication.", tokens: ["signum", "segno"] },
  { label: "City / Civic Polity", gloss: "City-language, civic order, polity, or urban collective identity.", tokens: ["civitatem", "citta"] },
  { label: "Faith / Belief", gloss: "Faith, doctrinal belief, or confessional assent.", tokens: ["fides", "fede"] },
  { label: "Angel / Angelic Order", gloss: "Angelic presence, heavenly messenger, or angelic order.", tokens: ["angelus", "angelorum", "angelo"] },
  { label: "Earth / Worldly Ground", gloss: "Earth, land, worldly place, or terrestrial condition.", tokens: ["terram", "terra"] },
  { label: "Sin / Fault", gloss: "Sin, culpability, transgression, or fallen moral condition.", tokens: ["peccati", "peccatum", "peccato"] },
  { label: "Comparison / Simile", gloss: "Comparison-language, simile construction, or explanatory likeness.", tokens: ["comparationem", "comparazione"] },
  { label: "Body / Embodiment", gloss: "Body, embodiment, corporeal condition, or bodily form.", tokens: ["corpus", "corpo"] },
  { label: "Virtue / Potency", gloss: "Virtue, power, potency, or active excellence.", tokens: ["virtus", "virtutem", "virtu"] },
  { label: "Punishment / Pain", gloss: "Punishment, suffering, pain, or penal consequence.", tokens: ["poenam", "pena"] },
  { label: "Shadow / Shade", gloss: "Shadow, shade, spectral presence, or dimmed form.", tokens: ["umbram", "ombra"] },
  { label: "Nature / Natural Order", gloss: "Nature, natural order, created order, or natural disposition.", tokens: ["naturam", "natura"] },
  { label: "Will / Volition", gloss: "Will, volition, consent, or directed desire.", tokens: ["voluntas", "volonta"] },
  { label: "Matter / Subject Matter", gloss: "Matter, substrate, or the thematic material under discussion.", tokens: ["materiam", "materia"] },
  { label: "Glory", gloss: "Glory, exalted radiance, honor, or heavenly splendor.", tokens: ["gloria"] },
  { label: "Form / Figure", gloss: "Form, figure, shape, or structuring likeness.", tokens: ["forma"] },
  { label: "Time / Temporal Order", gloss: "Time, temporal sequence, duration, or historical order.", tokens: ["tempus", "tempo"] },
  { label: "Fire / Flame", gloss: "Fire, flame, burning force, or ardent intensity.", tokens: ["ignis", "fuoco"] },
  { label: "Reason / Rational Order", gloss: "Reason, rational judgment, or ordered intelligibility.", tokens: ["ratio", "ragione"] },
  { label: "Good / The Good", gloss: "Goodness, the good, desirable end, or axiological center.", tokens: ["bonum", "bene"] },
  { label: "Word / Logos", gloss: "Word-language, logos, utterance, or incarnational verbal theology.", tokens: ["verbum", "verbo"] },
  { label: "Caesar / Marcellus", gloss: "Roman exempla, imperial names, or civic-historical comparison.", tokens: ["Cesare", "Marcello"] },
  { label: "Dice Play / Crowd and Chance", gloss: "Gaming, casting lots, crowding, or distributive social motion.", tokens: ["giuoco", "giuoco", "ludus", "taxillorum", "zara", "dado", "asso", "vincita"] },
  { label: "Church / Ecclesial Office", gloss: "Churchly office, ecclesial order, or institutional religious rank.", tokens: ["ecclesiae", "cardinalatum", "custodes", "cappellum"] },
  { label: "Ascent / Ladder of Light", gloss: "Ladder, ascent, descending lights, or ordered heavenly motion.", tokens: ["scala", "grado", "fiammelle", "descendere", "lucente"] },
  { label: "Peter Damian / Monastic Witness", gloss: "Peter Damian, monastic witness, or reforming saintly authority.", tokens: ["piero", "pier", "damiano", "adriano", "santa"] },
]);

function titleCaseSemanticPhrase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function normalizeSemanticDisplayToken(token) {
  const normalized = normalizeLocusForm(token);
  if (!normalized || SEMANTIC_FIELD_RESIDUE_TERMS.has(normalized)) {
    return null;
  }
  return SEMANTIC_TERM_NORMALIZATION_MAP[normalized] || normalized;
}

function normalizeEchoSignalKey(token) {
  const displayToken = normalizeSemanticDisplayToken(token) || normalizeLocusForm(token);
  return displayToken ? normalizeLocusForm(displayToken) : null;
}

function getEchoSignalDisplayLabel(token) {
  return normalizeSemanticDisplayToken(token) || normalizeLocusForm(token) || "";
}

function normalizeEchoSignalList(values = []) {
  const seen = new Set();
  const normalized = [];
  for (const value of values || []) {
    const key = normalizeEchoSignalKey(value);
    const label = getEchoSignalDisplayLabel(value);
    if (!key || !label || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(label);
  }
  return normalized;
}

function getSemanticFieldDisplayTerms(field) {
  const seen = new Set();
  const displayTerms = [];
  for (const term of field.representativeTerms || []) {
    const normalized = normalizeSemanticDisplayToken(term);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      displayTerms.push(normalized);
    }
  }
  if (!displayTerms.length) {
    const fallback = normalizeSemanticDisplayToken(field.displayLabel || field.label || field.internalLabel || field.seedTerm || "");
    if (fallback) {
      displayTerms.push(fallback);
    }
  }
  return displayTerms.slice(0, 5);
}

function getSemanticFieldHeadingKey(field) {
  return normalizeLocusForm(field.displayHeading || field.label || field.displayLabel || field.internalLabel || "");
}

function mergeSemanticCrossLineReferences(references = [], currentSampleEntry = state.currentSampleEntry) {
  const byKey = new Map();
  for (const refer of references || []) {
    const cantica = refer.cantica || currentSampleEntry?.cantica || "";
    const canto = refer.canto || currentSampleEntry?.canto || "";
    const lineNumber = Number(refer.line_number || 0);
    const key = `${cantica}:${canto}:${lineNumber}`;
    if (!lineNumber) {
      continue;
    }
    const existing = byKey.get(key);
    const mergedTerms = new Set([...(existing?.shared_terms || []), ...(refer.shared_terms || [])].map((term) => normalizeSemanticDisplayToken(term) || String(term || "").trim()).filter(Boolean));
    byKey.set(key, {
      ...(existing || refer),
      cantica,
      canto,
      line_number: lineNumber,
      shared_terms: [...mergedTerms].slice(0, 4),
    });
  }
  return [...byKey.values()].sort((left, right) =>
    String(left.cantica || "").localeCompare(String(right.cantica || ""))
    || Number(left.canto || 0) - Number(right.canto || 0)
    || Number(left.line_number || 0) - Number(right.line_number || 0)
  );
}

function mergeSemanticFieldsForDisplay(fields = [], payload = null) {
  const totalRecords = Math.max((payload?.records || []).length, 1);
  const grouped = new Map();

  fields.forEach((field, index) => {
    const headingKey = getSemanticFieldHeadingKey(field);
    const mergeKey = headingKey || `field:${field.id || index}`;
    const existing = grouped.get(mergeKey);
    if (!existing) {
      grouped.set(mergeKey, {
        ...field,
        __originalIndex: index,
        __recordIdSet: new Set(field.recordIds || []),
        __displayTermSet: new Set(field.displayRepresentativeTerms || field.representativeTerms || []),
        __representativeTermSet: new Set(field.representativeTerms || []),
        __commentarySet: new Set(field.exampleCommentaries || []),
        __qaFlags: new Set((field.qa?.flags || []).map(String)),
      });
      return;
    }

    (field.recordIds || []).forEach((id) => existing.__recordIdSet.add(id));
    (field.displayRepresentativeTerms || field.representativeTerms || []).forEach((term) => existing.__displayTermSet.add(term));
    (field.representativeTerms || []).forEach((term) => existing.__representativeTermSet.add(term));
    (field.exampleCommentaries || []).forEach((item) => existing.__commentarySet.add(item));
    (field.qa?.flags || []).forEach((flag) => existing.__qaFlags.add(String(flag)));

    existing.crossLineReferences = mergeSemanticCrossLineReferences(
      [...(existing.crossLineReferences || []), ...(field.crossLineReferences || [])],
      state.currentSampleEntry
    );
    existing.recordIds = [...existing.__recordIdSet];
    existing.recordCount = existing.__recordIdSet.size || Math.max(existing.recordCount || 0, field.recordCount || 0);
    existing.recordShare = Math.round((existing.recordCount / totalRecords) * 100);
    existing.uniqueCommentatorCount = Math.max(existing.uniqueCommentatorCount || 0, field.uniqueCommentatorCount || 0);
    existing.exampleCommentaries = [...existing.__commentarySet].slice(0, 3);
    existing.representativeTerms = [...existing.__representativeTermSet].slice(0, 5);
    existing.displayRepresentativeTerms = [...existing.__displayTermSet].slice(0, 5);
    existing.qa = {
      ...(existing.qa || { review_needed: false, flags: [], note: "" }),
      review_needed: Boolean(existing.qa?.review_needed || field.qa?.review_needed),
      flags: [...existing.__qaFlags],
      note: existing.qa?.note || field.qa?.note || "",
    };
  });

  return [...grouped.values()]
    .map((field) => {
      delete field.__recordIdSet;
      delete field.__displayTermSet;
      delete field.__representativeTermSet;
      delete field.__commentarySet;
      delete field.__qaFlags;
      return field;
    })
    .sort((left, right) =>
      (right.recordCount || 0) - (left.recordCount || 0)
      || (right.uniqueCommentatorCount || 0) - (left.uniqueCommentatorCount || 0)
      || (left.__originalIndex || 0) - (right.__originalIndex || 0)
    )
    .slice(0, 4);
}

function getSemanticFieldDisplayMeta(field) {
  const displayTerms = getSemanticFieldDisplayTerms(field);
  const tokens = new Set(
    [
      field.displayLabel,
      field.label,
      field.internalLabel,
      field.seedTerm,
      ...(field.representativeTerms || []),
      ...displayTerms,
    ]
      .map((token) => normalizeSemanticDisplayToken(token) || normalizeLocusForm(token))
      .filter(Boolean)
  );
  const tokenList = [...tokens];

  let bestHint = null;
  for (const hint of SEMANTIC_FIELD_THEME_HINTS) {
    const score = hint.tokens.reduce((sum, token) => sum + (tokens.has(token) ? 1 : 0), 0);
    if (score >= hint.minimumMatches && (!bestHint || score > bestHint.score)) {
      bestHint = { score, label: hint.label, gloss: hint.gloss };
    }
  }
  if (bestHint) {
    return { heading: bestHint.label, gloss: bestHint.gloss };
  }

  for (const proposal of SEMANTIC_FIELD_LABEL_PROPOSALS) {
    if (proposal.tokens.some((token) => tokens.has(token))) {
      return { heading: proposal.label, gloss: proposal.gloss };
    }
  }

  const rawLabel = String(field.displayLabel || field.label || field.internalLabel || "").trim();
  if (displayTerms.length >= 2) {
    return {
      heading: `${titleCaseSemanticPhrase(displayTerms[0])} / ${titleCaseSemanticPhrase(displayTerms[1])}`,
      gloss: "",
    };
  }
  if (rawLabel && tokenList.length > 1) {
    const rawNorm = normalizeSemanticDisplayToken(rawLabel) || normalizeLocusForm(rawLabel);
    const alternates = displayTerms.filter((token) => token !== rawNorm).slice(0, 2);
    if (alternates.length) {
      return {
        heading: alternates.map(titleCaseSemanticPhrase).join(" / "),
        gloss: "",
      };
    }
  }

  return {
    heading: rawLabel ? titleCaseSemanticPhrase(rawLabel) : "",
    gloss: "",
  };
}

function renderReadingBody(text, options = {}, highlightTerms = [], highlightGroups = []) {
  const paragraphs = toReadableParagraphs(text, options);
  const html = paragraphs
    .map((paragraph) => `<p>${
      highlightGroups.length
        ? highlightParagraphByGroups(paragraph, highlightGroups, highlightTerms)
        : highlightParagraph(paragraph, highlightTerms)
    }</p>`)
    .join("");
  return `<div class="reading-body">${html}</div>`;
}

function getActiveHighlightTerms(semanticState) {
  const aliases = new Set();
  if (state.activeSemanticField) {
    const activeField = semanticState.fields.find((field) => field.id === state.activeSemanticField);
    if (activeField) {
      for (const term of activeField.representativeTerms) {
        aliases.add(term);
        for (const [variant, canonical] of CANONICAL_SEMANTIC_TERMS.entries()) {
          if (canonical === term) {
            aliases.add(variant);
          }
        }
      }
    }
  }
  if (state.activeInterpretiveTerm) {
    aliases.add(state.activeInterpretiveTerm);
  }
  for (const term of state.activeSearchHighlightTerms || []) {
    aliases.add(term);
  }
  return [...aliases];
}

function highlightParagraph(text, highlightTerms = [], markerClass = "semantic-highlight") {
  const regex = buildHighlightRegex(highlightTerms);
  if (!regex) {
    return escapeHtml(text);
  }
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] || "";
    const term = match[2] || "";
    const matchStart = match.index + prefix.length;
    result += escapeHtml(text.slice(lastIndex, match.index));
    result += escapeHtml(prefix);
    result += `<mark class="${escapeHtml(markerClass)}">${escapeHtml(term)}</mark>`;
    lastIndex = matchStart + term.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function highlightParagraphByGroups(text, highlightGroups = [], fallbackTerms = [], fallbackClass = "semantic-highlight") {
  const groupedEntries = (highlightGroups || []).flatMap((group, index) =>
    (group?.terms || [])
      .map((term) => String(term || "").trim())
      .filter(Boolean)
      .map((term) => ({
        term,
        normalized: term.toLowerCase(),
        className: group.className || fallbackClass,
        data: group.resolveMap?.[normalizeAuthorityHighlightTerm(term)] || null,
        priority: index,
      }))
  );
  const seen = new Set(groupedEntries.map((entry) => entry.normalized));
  const fallbackEntries = (fallbackTerms || [])
    .map((term) => String(term || "").trim())
    .filter(Boolean)
    .map((term) => ({
      term,
      normalized: term.toLowerCase(),
      className: fallbackClass,
      priority: Number.MAX_SAFE_INTEGER,
    }))
    .filter((entry) => !seen.has(entry.normalized));
  const entries = [...groupedEntries, ...fallbackEntries];
  const regex = buildHighlightRegex(entries.map((entry) => entry.term));
  if (!regex) {
    return escapeHtml(text);
  }

  const classMap = new Map();
  const dataMap = new Map();
  entries
    .sort((left, right) => left.priority - right.priority || right.term.length - left.term.length)
    .forEach((entry) => {
      if (!classMap.has(entry.normalized)) {
        classMap.set(entry.normalized, entry.className);
        dataMap.set(entry.normalized, entry.data);
      }
    });

  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] || "";
    const term = match[2] || "";
    const matchStart = match.index + prefix.length;
    result += escapeHtml(text.slice(lastIndex, match.index));
    result += escapeHtml(prefix);
    const markerClass = classMap.get(String(term).trim().toLowerCase()) || fallbackClass;
    const markerData = dataMap.get(String(term).trim().toLowerCase());
    const dataAttrs = markerData
      ? Object.entries(markerData)
          .filter(([, value]) => value != null && String(value).trim())
          .map(([key, value]) => ` data-${escapeHtml(key)}="${escapeHtml(value)}"`)
          .join("")
      : "";
    result += `<mark class="${escapeHtml(markerClass)}"${dataAttrs}>${escapeHtml(term)}</mark>`;
    lastIndex = matchStart + term.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function filterAuthorityHighlightTermsForText(text, terms = []) {
  const source = String(text || "");
  if (!source) {
    return [];
  }
  const normalizedSource = normalizeAuthorityHighlightTerm(source);
  return [...new Set(
    (terms || [])
      .map((term) => String(term || "").trim())
      .filter(Boolean)
      .filter((term) => normalizedSource.includes(normalizeAuthorityHighlightTerm(term)))
  )];
}

function filterGlobalPersonaggioTermsForText(text, terms = []) {
  return filterAuthorityHighlightTermsForText(text, terms).filter((term) => {
    const normalized = normalizeAuthorityHighlightTerm(term);
    return !AUTHORITY_GLOBAL_PERSONAGGIO_SINGLETON_EXCLUSIONS.has(normalized)
      && !isExcludedVirgilioGlobalPersonaggioTerm(term);
  });
}

function partitionVirgilioPersonaggioTerms(terms = []) {
  const virgilioTerms = [];
  const otherTerms = [];
  for (const term of terms || []) {
    const normalized = normalizeAuthorityHighlightTerm(term);
    if (AUTHORITY_VIRGILIO_PERSONAGGIO_TERMS.has(normalized)) {
      virgilioTerms.push(term);
    } else {
      otherTerms.push(term);
    }
  }
  return { virgilioTerms, otherTerms };
}

function partitionVirgilioAuthorityTerms(terms = []) {
  return partitionVirgilioPersonaggioTerms(terms);
}

function normalizeAuthorityHighlightTerm(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const AUTHORITY_WORK_CONNECTORS = new Set(["de", "del", "della", "delle", "dei", "di", "of", "the"]);
const AUTHORITY_RISKY_WORK_SINGLETONS = new Set(["leggi", "laws", "repubblica", "republic", "ars", "fasti", "poetica", "carmina", "sapienza", "sapientia", "wisdom"]);
const AUTHORITY_DANTE_COMMEDIA_WORKS = new Set([
  "dante::inferno",
  "dante::purgatorio",
  "dante::paradiso",
  "dante::commedia",
]);
const AUTHORITY_GLOBAL_PERSONAGGIO_SINGLETON_EXCLUSIONS = new Set(["poeta", "duca", "maestro", "padre", "dottore", "segnore", "mantoan"]);
const AUTHORITY_VIRGILIO_PERSONAGGIO_TERMS = new Set([
  "virgilio",
  "vergilio",
  "virgile",
  "virgilius",
  "virgil",
]);

function isExcludedVirgilioGlobalPersonaggioTerm(term) {
  const payload = state.authorityHighlightLexicon;
  const normalized = normalizeAuthorityHighlightTerm(term);
  if (!payload || !normalized || AUTHORITY_VIRGILIO_PERSONAGGIO_TERMS.has(normalized)) {
    return false;
  }
  const matches = (payload.personaggio_poem || []).filter((row) =>
    ["stable_terms", "cue_terms", "caveated_terms"].some((bucketKey) =>
      (row[bucketKey] || []).some((item) => normalizeAuthorityHighlightTerm(item) === normalized)
    )
  );
  return matches.length === 1 && matches[0]?.page_slug === "virgilio";
}

function isRiskySingletonWorkSurfaceTerm(term) {
  const tokens = String(term || "")
    .trim()
    .split(/\s+/)
    .map((token) => token.toLowerCase().replace(/\.$/, ""))
    .filter((token) => token && !AUTHORITY_WORK_CONNECTORS.has(token));
  return tokens.length === 1 && AUTHORITY_RISKY_WORK_SINGLETONS.has(tokens[0]);
}

function getAuthorityTermsForAuthorId(authorId) {
  const payload = state.authorityHighlightLexicon;
  if (!payload || !authorId) {
    return [];
  }
  const row = [...(payload.stable_authors || []), ...(payload.caveated_authors || [])]
    .find((item) => item.author_id === authorId);
  return Array.isArray(row?.terms) ? row.terms : [];
}

function hasNearbyAuthorityAuthorContext(text, row, term) {
  const authorTerms = getAuthorityTermsForAuthorId(row?.author_id)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => item.length >= 4);
  if (!authorTerms.length) {
    return false;
  }
  const regex = buildHighlightRegex([term]);
  if (!regex) {
    return false;
  }
  let match;
  while ((match = regex.exec(String(text || ""))) !== null) {
    const prefix = match[1] || "";
    const matchedTerm = match[2] || "";
    const start = match.index + prefix.length;
    const end = start + matchedTerm.length;
    const windowText = String(text || "").slice(Math.max(0, start - 96), Math.min(String(text || "").length, end + 96)).toLowerCase();
    if (authorTerms.some((item) => windowText.includes(item.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function hasBookishRiskyWorkContext(text, row, term) {
  if (!isRiskySingletonWorkSurfaceTerm(term)) {
    return true;
  }
  if (hasNearbyAuthorityAuthorContext(text, row, term)) {
    return true;
  }
  const escaped = escapeRegExp(String(term || "").trim());
  if (!escaped) {
    return false;
  }
  const bookishContext = new RegExp(
    `(?:lib(?:ro|ri|\\.?)|cap(?:itolo|ituli|\\.?)|epist(?:ola|ole|\\.?)|dialog(?:o|i|us)?|tractat(?:o|i|us)?|decret(?:o|i)|quest(?:ione|ioni)|secundum|secondo|nel(?:le)?|nella|nelle|in)\\s+${escaped}(?=$|[^\\p{L}\\p{M}])`,
    "iu",
  );
  return bookishContext.test(String(text || ""));
}

function isDanteCommediaWorkRow(row) {
  const authorId = String(row?.author_id || "").trim().toLowerCase();
  const canonicalWork = String(row?.canonical_work || "").trim().toLowerCase();
  return AUTHORITY_DANTE_COMMEDIA_WORKS.has(`${authorId}::${canonicalWork}`);
}

function collectAuthorityWorkHighlightTermsForText(text, bucket = "stable") {
  const payload = state.authorityHighlightLexicon;
  const source = String(text || "");
  if (!payload || !source) {
    return [];
  }
  const normalizedSource = normalizeAuthorityHighlightTerm(source);
  const rows = bucket === "caveated" ? (payload.caveated_works || []) : (payload.stable_works || []);
  const allRows = [...(payload.stable_works || []), ...(payload.caveated_works || [])];
  const acceptedTerms = [];
  const seen = new Set();

  const isUniqueWorkSurface = (term) => {
    const normalized = normalizeAuthorityHighlightTerm(term);
    if (!normalized) {
      return false;
    }
    const matches = allRows.filter((row) =>
      (row.terms || []).some((item) => normalizeAuthorityHighlightTerm(item) === normalized)
    );
    return matches.length === 1;
  };

  rows.forEach((row) => {
    if (isDanteCommediaWorkRow(row)) {
      return;
    }
    (row.terms || []).forEach((term) => {
      const label = String(term || "").trim();
      const normalized = normalizeAuthorityHighlightTerm(label);
      if (!label || !normalized || seen.has(normalized)) {
        return;
      }
      if (!normalizedSource.includes(normalized)) {
        return;
      }
      if (!isUniqueWorkSurface(label)) {
        return;
      }
      seen.add(normalized);
      acceptedTerms.push(label);
    });
  });

  return acceptedTerms.sort((left, right) => right.length - left.length);
}

function collectAuthorityWorkHighlightGroupForRecord(text, record, bucket = "stable") {
  const terms = collectAuthorityWorkHighlightTermsForRecord(text, record, bucket);
  const mentions = getRawWorkMentionsForRecord(record);
  const resolveMap = {};
  const rows = mentions.filter((item) => (bucket === "caveated"
    ? item?.work_bucket === "caveated"
    : item?.work_bucket !== "caveated"));
  rows.forEach((row) => {
    if (isDanteCommediaWorkRow(row)) {
      return;
    }
    const authorId = String(row?.author_id || "").trim();
    const canonicalWork = String(row?.canonical_work || "").trim();
    if (!authorId || !canonicalWork) {
      return;
    }
    (row?.raw_surfaces || []).forEach((surface) => {
      const normalized = normalizeAuthorityHighlightTerm(surface);
      if (!normalized || !terms.some((term) => normalizeAuthorityHighlightTerm(term) === normalized)) {
        return;
      }
      resolveMap[normalized] = {
        "authority-author-id": authorId,
        "authority-canonical-work": canonicalWork,
      };
    });
  });
  return { terms, resolveMap };
}

function getRawWorkMentionsForRecord(record) {
  if (!record || typeof record !== "object") {
    return [];
  }
  if (Array.isArray(record.raw_work_mentions) && record.raw_work_mentions.length) {
    return record.raw_work_mentions;
  }
  const recordId = record.id || record.record_id || null;
  const sampleId = state.currentSampleEntry?.id || null;
  if (!recordId || !sampleId) {
    return [];
  }
  const mentionPayload = state.sampleRecordWorkMentionCache.get(sampleId);
  const mentionRecord = mentionPayload?.records?.[recordId];
  if (Array.isArray(mentionRecord?.raw_work_mentions) && mentionRecord.raw_work_mentions.length) {
    return mentionRecord.raw_work_mentions;
  }
  const storeRecord = state.sampleRecordStoreCache.get(sampleId)?.records?.[recordId];
  if (Array.isArray(storeRecord?.raw_work_mentions) && storeRecord.raw_work_mentions.length) {
    return storeRecord.raw_work_mentions;
  }
  const fullTextRecord = state.sampleFullTextStoreCache.get(sampleId)?.records?.[recordId];
  if (Array.isArray(fullTextRecord?.raw_work_mentions) && fullTextRecord.raw_work_mentions.length) {
    return fullTextRecord.raw_work_mentions;
  }
  return [];
}

function collectAuthorityWorkHighlightTermsForRecord(text, record, bucket = "stable") {
  const source = String(text || "");
  const mentions = getRawWorkMentionsForRecord(record);
  if (!source || !mentions.length) {
    return [];
  }
  const normalizedSource = normalizeAuthorityHighlightTerm(source);
  const acceptedTerms = [];
  const seen = new Set();
  const rows = mentions.filter((item) => (bucket === "caveated"
    ? item?.work_bucket === "caveated"
    : item?.work_bucket !== "caveated"));

  rows.forEach((row) => {
    if (isDanteCommediaWorkRow(row)) {
      return;
    }
    (row?.raw_surfaces || []).forEach((surface) => {
      const label = String(surface || "").trim();
      const normalized = normalizeAuthorityHighlightTerm(label);
      if (!label || !normalized || seen.has(normalized)) {
        return;
      }
      if (!normalizedSource.includes(normalized)) {
        return;
      }
      if (!hasBookishRiskyWorkContext(source, row, label)) {
        return;
      }
      seen.add(normalized);
      acceptedTerms.push(label);
    });
  });

  return acceptedTerms.sort((left, right) => right.length - left.length);
}

function mergeAuthorityHighlightTerms(...groups) {
  const seen = new Set();
  const merged = [];
  groups.forEach((group) => {
    (group || []).forEach((term) => {
      const label = String(term || "").trim();
      const normalized = normalizeAuthorityHighlightTerm(label);
      if (!label || !normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      merged.push(label);
    });
  });
  return merged.sort((left, right) => right.length - left.length);
}

function normalizeDanteCitationAlias(rawValue) {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/[.\s]+/g, "");
  if (!normalized) {
    return null;
  }
  if (["inferno", "infer", "inf"].includes(normalized)) {
    return "inferno";
  }
  if (["inferni"].includes(normalized)) {
    return "inferno";
  }
  if (["purgatorio", "purg"].includes(normalized)) {
    return "purgatorio";
  }
  if (["purgatorii", "purgatorij"].includes(normalized)) {
    return "purgatorio";
  }
  if (["paradiso", "parad", "par"].includes(normalized)) {
    return "paradiso";
  }
  if (["paradisi"].includes(normalized)) {
    return "paradiso";
  }
  return null;
}

function collectExplicitDanteCitationTermsForText(text) {
  return collectExplicitDanteCitationGroupForText(text).terms;
}

function collectInheritedDanteCitationItems(source, start, shellKey) {
  const shell = CANTICA_SHELLS.find((candidate) => candidate.key === shellKey);
  if (!shell) {
    return [];
  }
  const items = [];
  const tail = String(source || "").slice(start, start + 180);
  const segmentPattern = /\s*;\s*([IVXLCDM]+|\d{1,2})\s*[,.;:]?\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/giu;
  let cursor = 0;
  while (true) {
    segmentPattern.lastIndex = cursor;
    const match = segmentPattern.exec(tail);
    if (!match || match.index !== cursor) {
      break;
    }
    const canto = parseNavigationNumber(match[1]);
    const lineNumber = parseNavigationNumber(match[2]);
    if (!Number.isInteger(canto) || canto < 1 || canto > shell.total || !Number.isInteger(lineNumber) || lineNumber < 1) {
      break;
    }
    items.push({
      term: String(match[1] + ", " + match[2] + (match[3] ? `-${match[3]}` : "")).trim(),
      start: start + match.index + match[0].indexOf(match[1]),
      end: start + match.index + match[0].length,
      shell,
      canto,
      lineNumber,
      sampleId: `${shell.key}${canto}`,
    });
    cursor = segmentPattern.lastIndex;
  }
  return items;
}

function collectExplicitDanteCitationGroupForText(text) {
  const source = String(text || "");
  if (!source) {
    return { terms: [], resolveMap: {} };
  }

  const results = [];
  const resolveMap = {};
  const seen = new Set();
  const occupiedRanges = [];
  const addMatch = (label, start, end, request = null) => {
    const value = String(label || "").trim();
    if (!value || start < 0 || end <= start) {
      return;
    }
    if (occupiedRanges.some((range) => start < range.end && end > range.start)) {
      return;
    }
    const dedupeKey = `${start}:${end}:${value.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    occupiedRanges.push({ start, end });
    results.push(value);
    if (request) {
      resolveMap[normalizeAuthorityHighlightTerm(value)] = {
        "dante-sample-id": request.sampleId,
        "dante-line-number": request.lineNumber,
      };
    }
  };

  const linePattern = /\b(Inferno|Infer\.?|Inf\.?|Purgatorio|Purg\.?|Paradiso|Parad\.?|Par\.?)\s*(?:[,.;:)\]]\s*|\s+)+([IVXLCDM]+|\d{1,2})\s*(?:[,.;:)\]]\s*|\s+)+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\b/giu;
  for (const match of source.matchAll(linePattern)) {
    const shellKey = normalizeDanteCitationAlias(match[1]);
    const shell = CANTICA_SHELLS.find((candidate) => candidate.key === shellKey);
    const canto = parseNavigationNumber(match[2]);
    const lineNumber = parseNavigationNumber(match[3]);
    addMatch(match[0], match.index ?? -1, (match.index ?? 0) + match[0].length, shell ? {
      sampleId: `${shell.key}${canto}`,
      lineNumber,
    } : null);
    for (const inherited of collectInheritedDanteCitationItems(source, (match.index ?? 0) + match[0].length, shellKey)) {
      addMatch(inherited.term, inherited.start, inherited.end, inherited);
    }
  }

  const latinCapituloPattern = /\b(Inferni|Purgatorii?|Paradisi)\s+cap(?:itolo|itulo)?\.?\s+([IVXLCDM]+|\d{1,2})(?:[ºo])?\b/giu;
  for (const match of source.matchAll(latinCapituloPattern)) {
    addMatch(match[0], match.index ?? -1, (match.index ?? 0) + match[0].length);
  }

  // For canto-only Dante citations, keep the parser conservative:
  // accept abbreviation-style references such as `Inf. V` / `Purg I` / `Par. XI`,
  // but do not globally light up bare `Inferno / Purgatorio / Paradiso` + canto mentions.
  const cantoPattern = /\b(Infer\.?|Inf\.?|Purg\.?|Parad\.?|Par\.?)\s+([IVXLCDM]+|\d{1,2})\b/giu;
  for (const match of source.matchAll(cantoPattern)) {
    addMatch(match[0], match.index ?? -1, (match.index ?? 0) + match[0].length);
  }

  return { terms: results.sort((left, right) => right.length - left.length), resolveMap };
}

function parseDanteCitationReference(term) {
  const source = String(term || "").trim();
  if (!source) {
    return null;
  }

  const lineMatch = source.match(/^(Inferno|Infer\.?|Inf\.?|Purgatorio|Purg\.?|Paradiso|Parad\.?|Par\.?)\s*(?:[,.;:)\]]\s*|\s+)+([IVXLCDM]+|\d{1,2})\s*(?:[,.;:)\]]\s*|\s+)+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/iu);
  const latinCapituloMatch = source.match(/^(Inferni|Purgatorii?|Paradisi)\s+cap(?:itolo|itulo)?\.?\s+([IVXLCDM]+|\d{1,2})(?:[ºo])?$/iu);
  const cantoMatch = source.match(/^(Infer\.?|Inf\.?|Purg\.?|Parad\.?|Par\.?)\s+([IVXLCDM]+|\d{1,2})$/iu);
  const match = lineMatch || latinCapituloMatch || cantoMatch;
  if (!match) {
    return null;
  }

  const shellKey = normalizeDanteCitationAlias(match[1]);
  const canto = parseNavigationNumber(match[2]);
  const lineNumber = lineMatch ? parseNavigationNumber(lineMatch[3]) : null;
  const shell = CANTICA_SHELLS.find((candidate) => candidate.key === shellKey);
  if (!shell || !Number.isInteger(canto) || canto < 1 || canto > shell.total) {
    return null;
  }
  if (lineMatch && (!Number.isInteger(lineNumber) || lineNumber < 1)) {
    return null;
  }

  const sampleId = `${shell.key}${canto}`;
  const entry = state.manifestMap.get(sampleId) || null;
  return {
    kind: lineMatch ? "line" : "sample",
    sampleId,
    entry,
    label: formatQuickJumpPreviewLabel(`${shell.label} ${canto}`, lineMatch ? lineNumber : null),
    canto,
    lineNumber,
  };
}

function isAuthorityHighlightMark(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  return [
    "authority-hit-author",
    "authority-hit-work",
    "authority-hit-author-caveated",
    "authority-hit-work-caveated",
    "authority-hit-personaggio",
    "authority-hit-personaggio-cue",
    "authority-hit-personaggio-caveated",
    "authority-hit-dante-line",
  ].some((className) => element.classList.contains(className));
}

function getAuthorityHighlightKind(mark) {
  if (!(mark instanceof HTMLElement)) {
    return null;
  }
  if (mark.classList.contains("authority-hit-author") || mark.classList.contains("authority-hit-author-caveated")) {
    return "author";
  }
  if (mark.classList.contains("authority-hit-work") || mark.classList.contains("authority-hit-work-caveated")) {
    return "work";
  }
  if (
    mark.classList.contains("authority-hit-personaggio")
    || mark.classList.contains("authority-hit-personaggio-cue")
    || mark.classList.contains("authority-hit-personaggio-caveated")
  ) {
    return "personaggio";
  }
  if (mark.classList.contains("authority-hit-dante-line")) {
    return "dante_line";
  }
  return null;
}

function resolveAuthorityHighlightAuthor(term) {
  const payload = state.authorityHighlightLexicon;
  if (!payload) {
    return null;
  }
  const normalized = normalizeAuthorityHighlightTerm(term);
  if (!normalized) {
    return null;
  }
  if (["paolo", "paul"].includes(normalized)) {
    return null;
  }
  const rows = [...(payload.stable_authors || []), ...(payload.caveated_authors || [])];
  return rows.find((row) => (row.terms || []).some((item) => normalizeAuthorityHighlightTerm(item) === normalized)) || null;
}

function resolveAuthorityHighlightWork(term) {
  const payload = state.authorityHighlightLexicon;
  if (!payload) {
    return null;
  }
  const normalized = normalizeAuthorityHighlightTerm(term);
  if (!normalized) {
    return null;
  }
  const rows = [...(payload.stable_works || []), ...(payload.caveated_works || [])];
  const matches = rows.filter((row) => (row.terms || []).some((item) => normalizeAuthorityHighlightTerm(item) === normalized));
  return matches.length === 1 ? matches[0] : null;
}

function resolveAuthorityHighlightPersonaggio(term, kind = "stable") {
  const payload = state.authorityHighlightLexicon;
  if (!payload) {
    return null;
  }
  const normalized = normalizeAuthorityHighlightTerm(term);
  if (!normalized) {
    return null;
  }
  const bucketKey = kind === "cue"
    ? "cue_terms"
    : kind === "caveated"
      ? "caveated_terms"
      : "stable_terms";
  const matches = (payload.personaggio_poem || []).filter((row) =>
    (row[bucketKey] || []).some((item) => normalizeAuthorityHighlightTerm(item) === normalized)
  );
  return matches.length === 1 ? matches[0] : null;
}

async function openAuthorityWorkFromHighlight(authorId, canonicalWork) {
  if (!authorId || !canonicalWork) {
    return;
  }
  await Promise.all([
    ensureAuthorityLayerLoaded(),
    ensureAuthorityCuratedRoomAnchorsLoaded(),
  ]);
  const authors = getAllAuthorityAuthors();
  const author = authors.find((item) => item.author_id === authorId);
  if (!author) {
    return;
  }
  state.activeScholarTab = "authority";
  state.activeAuthority = author.author_id;
  state.activeAuthorityView = "drilldown";
  state.activeAuthorityWork = null;
  state.activeAuthorityNode = null;
  state.activeAuthorityOccurrenceKey = null;
  state.activeAuthorityCommentarySample = null;
  state.activeAuthorityCommentaryLineKey = null;
  state.activeAuthoritySourceExpanded = false;
  renderFigurePanel();
  setActiveAnchor("scholar-section");
  document.getElementById("scholar-section")?.scrollIntoView({ behavior: "smooth", block: "start" });

  await ensureAuthorityAuthorDetailLoaded(getActiveAuthorityAuthor());
  await Promise.allSettled([
    ensureAuthorityWorksTreeLoaded(getActiveAuthorityAuthor()),
    ensureAuthorityFlatWorkObjectLoaded(getActiveAuthorityAuthor()),
  ]);
  state.activeAuthorityWork = canonicalWork;
  renderFigurePanel();
}

function getPersonaggioStaticPageHref(pageSlug) {
  const rawSlug = String(pageSlug || "").trim();
  if (!rawSlug) {
    return "";
  }
  const slug = slugifyAuthorityStaticSegment(rawSlug);
  return slug ? `/personaggio/${slug}.html` : "";
}

async function handleAuthorityHighlightClick(mark) {
  if (!(mark instanceof HTMLElement)) {
    return;
  }
  await ensureAuthorityHighlightLexiconLoaded();
  const term = mark.textContent || "";
  const kind = getAuthorityHighlightKind(mark);
  if (kind === "author") {
    const row = resolveAuthorityHighlightAuthor(term);
    if (row?.author_id) {
      await openAuthorityAuthorFromCompare(row.author_id);
    }
    return;
  }
  if (kind === "work") {
    const mappedAuthorId = mark.dataset.authorityAuthorId || "";
    const mappedCanonicalWork = mark.dataset.authorityCanonicalWork || "";
    if (mappedAuthorId && mappedCanonicalWork) {
      await openAuthorityWorkFromHighlight(mappedAuthorId, mappedCanonicalWork);
      return;
    }
    const row = resolveAuthorityHighlightWork(term);
    if (row?.author_id && row?.canonical_work) {
      await openAuthorityWorkFromHighlight(row.author_id, row.canonical_work);
    }
    return;
  }
  if (kind === "dante_line") {
    const mappedSampleId = mark.dataset.danteSampleId || "";
    const mappedLineNumber = parseNavigationNumber(mark.dataset.danteLineNumber || "");
    if (mappedSampleId && Number.isInteger(mappedLineNumber)) {
      const entry = state.manifestMap.get(mappedSampleId) || null;
      await executeNavigationQuery({
        kind: "line",
        sampleId: mappedSampleId,
        entry,
        label: formatQuickJumpPreviewLabel(entry ? `${entry.label} ${entry.canto}` : mappedSampleId, mappedLineNumber),
        lineNumber: mappedLineNumber,
      });
      return;
    }
    const request = parseDanteCitationReference(term);
    if (request) {
      await executeNavigationQuery(request);
    }
    return;
  }
  if (kind === "personaggio") {
    const personaggioKind = mark.classList.contains("authority-hit-personaggio-cue")
      ? "cue"
      : mark.classList.contains("authority-hit-personaggio-caveated")
        ? "caveated"
        : "stable";
    const row = resolveAuthorityHighlightPersonaggio(term, personaggioKind);
    const href = getPersonaggioStaticPageHref(row?.page_slug);
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }
}

function buildAuthorityLexiconHighlightGroupsForText(text, record = null, options = {}) {
  const includePersonaggioCueTerms = options.includePersonaggioCueTerms === true;
  const includePersonaggioCaveatedTerms = options.includePersonaggioCaveatedTerms === true;
  const groups = state.authorityHighlightLexicon?.groups || {};
  const stableAuthorPartition = partitionVirgilioAuthorityTerms(
    filterAuthorityHighlightTermsForText(text, groups.author_terms_stable || [])
  );
  const caveatedAuthorPartition = partitionVirgilioAuthorityTerms(
    filterAuthorityHighlightTermsForText(text, groups.author_terms_caveated || [])
  );
  const stableWorkGroup = collectAuthorityWorkHighlightGroupForRecord(text, record, "stable");
  const caveatedWorkGroup = collectAuthorityWorkHighlightGroupForRecord(text, record, "caveated");
  const stablePersonaggioTerms = filterGlobalPersonaggioTermsForText(text, groups.personaggio_poem_terms_stable || []);
  const stablePersonaggioPartition = partitionVirgilioPersonaggioTerms(stablePersonaggioTerms);
  const danteCitationGroup = collectExplicitDanteCitationGroupForText(text);
  const highlightGroups = [
    {
      terms: danteCitationGroup.terms,
      className: "authority-hit-dante-line",
      resolveMap: danteCitationGroup.resolveMap,
    },
    {
      terms: stableAuthorPartition.virgilioTerms,
      className: "authority-hit-author authority-hit-personaggio-virgilio",
    },
    {
      terms: stableAuthorPartition.otherTerms,
      className: "authority-hit-author",
    },
    {
      terms: stableWorkGroup.terms,
      className: "authority-hit-work",
      resolveMap: stableWorkGroup.resolveMap,
    },
    {
      terms: caveatedAuthorPartition.virgilioTerms,
      className: "authority-hit-author-caveated authority-hit-personaggio-virgilio",
    },
    {
      terms: caveatedAuthorPartition.otherTerms,
      className: "authority-hit-author-caveated",
    },
    {
      terms: caveatedWorkGroup.terms,
      className: "authority-hit-work-caveated",
      resolveMap: caveatedWorkGroup.resolveMap,
    },
    {
      terms: stablePersonaggioPartition.virgilioTerms,
      className: "authority-hit-personaggio authority-hit-personaggio-virgilio",
    },
    {
      terms: stablePersonaggioPartition.otherTerms,
      className: "authority-hit-personaggio",
    },
  ];

  if (includePersonaggioCueTerms) {
    const cuePersonaggioPartition = partitionVirgilioPersonaggioTerms(
      filterGlobalPersonaggioTermsForText(text, groups.personaggio_poem_terms_cue || [])
    );
    highlightGroups.push({
      terms: cuePersonaggioPartition.virgilioTerms,
      className: "authority-hit-personaggio-cue authority-hit-personaggio-virgilio",
    });
    highlightGroups.push({
      terms: cuePersonaggioPartition.otherTerms,
      className: "authority-hit-personaggio-cue",
    });
  }

  if (includePersonaggioCaveatedTerms) {
    const caveatedPersonaggioPartition = partitionVirgilioPersonaggioTerms(
      filterGlobalPersonaggioTermsForText(text, groups.personaggio_poem_terms_caveated || [])
    );
    highlightGroups.push({
      terms: caveatedPersonaggioPartition.virgilioTerms,
      className: "authority-hit-personaggio-caveated authority-hit-personaggio-virgilio",
    });
    highlightGroups.push({
      terms: caveatedPersonaggioPartition.otherTerms,
      className: "authority-hit-personaggio-caveated",
    });
  }

  return highlightGroups.filter((group) => Array.isArray(group.terms) && group.terms.length);
}

function buildAuthorityTextHighlightGroups(text, highlightGroups = [], record = null) {
  return [
    ...(Array.isArray(highlightGroups) ? highlightGroups : []),
    ...buildAuthorityLexiconHighlightGroupsForText(text, record),
  ];
}

function highlightDualTerms(text, primaryTerms = [], secondaryTerms = []) {
  const source = String(text || "");
  if (!source) {
    return "";
  }

  const classifyTerm = (term) => {
    const normalized = String(term || "").trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (primaryTerms.some((item) => String(item || "").trim().toLowerCase() === normalized)) {
      return "locus-target-highlight";
    }
    if (secondaryTerms.some((item) => String(item || "").trim().toLowerCase() === normalized)) {
      return "concurrence-highlight";
    }
    return null;
  };

  const regex = buildHighlightRegex([...primaryTerms, ...secondaryTerms]);
  if (!regex) {
    return escapeHtml(source);
  }
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const prefix = match[1] || "";
    const term = match[2] || "";
    const matchStart = match.index + prefix.length;
    result += escapeHtml(source.slice(lastIndex, match.index));
    result += escapeHtml(prefix);
    const markerClass = classifyTerm(term);
    if (markerClass) {
      result += `<mark class="${markerClass}">${escapeHtml(term)}</mark>`;
    } else {
      result += escapeHtml(term);
    }
    lastIndex = matchStart + term.length;
  }

  result += escapeHtml(source.slice(lastIndex));
  return result;
}

function buildHighlightRegex(terms) {
  const escapedTerms = [...new Set((terms || []).filter(Boolean))]
    .sort((left, right) => String(right).length - String(left).length)
    .map((term) => buildFlexibleHighlightPattern(term));

  if (!escapedTerms.length) {
    return null;
  }

  return new RegExp(`(^|[^\\p{L}\\p{M}])(${escapedTerms.join("|")})(?=$|[^\\p{L}\\p{M}])`, "giu");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFlexibleHighlightPattern(term) {
  const source = String(term || "").trim();
  if (!source) {
    return "";
  }
  return escapeRegExp(source)
    .replace(/\\ /g, "\\s+")
    .replace(/\\([,.;:!?])/g, "\\s*\\$1");
}

function normalizeAuthorityCommentaryName(name) {
  const source = String(name || "").trim();
  if (!source) {
    return "";
  }
  return source
    .replace(/^(?:The\s+)?Rev\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toReadableParagraphs(text, options = {}) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return ["暂无正文。"];
  }

  const rawParagraphs = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const mergedParagraphs = rawParagraphs.flatMap((paragraph) => {
    const merged = paragraph
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!merged) {
      return [];
    }
    if (options.chunkLongParagraphs === false) {
      return [merged];
    }
    return chunkParagraph(merged);
  });

  if (options.maxParagraphs && mergedParagraphs.length > options.maxParagraphs) {
    return mergedParagraphs.slice(0, options.maxParagraphs);
  }
  return mergedParagraphs;
}

function chunkParagraph(paragraph) {
  if (paragraph.length <= 420) {
    return [paragraph];
  }

  const sentences = paragraph.split(/(?<=[.!?;:])\s+/);
  if (sentences.length === 1) {
    return hardChunkParagraph(paragraph, 420);
  }

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > 420 && current) {
      chunks.push(current);
      current = sentence;
      continue;
    }
    current = candidate;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.flatMap((chunk) => (chunk.length > 520 ? hardChunkParagraph(chunk, 420) : [chunk]));
}

function hardChunkParagraph(paragraph, size) {
  const chunks = [];
  let remaining = paragraph;
  while (remaining.length > size) {
    let slicePoint = remaining.lastIndexOf(" ", size);
    if (slicePoint < size * 0.6) {
      slicePoint = size;
    }
    chunks.push(remaining.slice(0, slicePoint).trim());
    remaining = remaining.slice(slicePoint).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

function findRecordById(recordId) {
  const payload = state.lineCache.get(state.selectedLine);
  if (!payload) {
    return null;
  }
  if (Array.isArray(payload.records)) {
    const inline = payload.records.find((record) => record.id === recordId);
    if (inline) {
      return inline;
    }
  }
  const sampleId = state.currentSampleEntry?.id || state.overview?.sample;
  const store = sampleId ? state.sampleRecordStoreCache.get(sampleId) : null;
  return store?.records?.[recordId] || null;
}

function computeLineAnalysis(payload) {
  const coverageCount = payload.coverage_count;
  const singleCount = payload.records.filter((record) => record.line_span === 1).length;
  const rangeCount = payload.records.length - singleCount;
  const datedRecords = payload.records.filter((record) => record.year_start != null || record.year_end != null);
  const earliestEligibleRecords = datedRecords.filter((record) => record.commentary_name !== "Text of the Divine Comedy");
  const earliestRecord = earliestEligibleRecords.reduce((earliest, record) => {
    if (!earliest) return record;
    const earliestYear = earliest.year_start ?? earliest.year_end ?? Number.POSITIVE_INFINITY;
    const currentYear = record.year_start ?? record.year_end ?? Number.POSITIVE_INFINITY;
    return currentYear < earliestYear ? record : earliest;
  }, null);
  const latestRecord = datedRecords.reduce((latest, record) => {
    if (!latest) return record;
    const latestYear = latest.year_end ?? latest.year_start ?? Number.NEGATIVE_INFINITY;
    const currentYear = record.year_end ?? record.year_start ?? Number.NEGATIVE_INFINITY;
    return currentYear > latestYear ? record : latest;
  }, null);

  const earliestYear = earliestRecord ? earliestRecord.year_start ?? earliestRecord.year_end : null;
  const latestYear = latestRecord ? latestRecord.year_end ?? latestRecord.year_start : null;
  const lineCoverages = state.overview.lines.map((line) => line.coverage_count).sort((left, right) => left - right);
  const q1 = percentile(lineCoverages, 0.25);
  const median = percentile(lineCoverages, 0.5);
  const q3 = percentile(lineCoverages, 0.75);

  let coverageHint = `Canto median is ${median} records for a line.`;
  let coverageTone = "mid-range attention";
  if (coverageCount <= q1) {
    coverageTone = "low-attention locus";
    coverageHint = `Low-coverage hint: this line sits near the lower attention band of the canto.`;
  } else if (coverageCount >= q3) {
    coverageTone = "high-attention locus";
    coverageHint = `High-coverage hint: this line sits in the upper attention band of the canto.`;
  }

  const rangeRatio = payload.records.length ? Math.round((rangeCount / payload.records.length) * 100) : 0;
  const granularityHint =
    rangeCount === 0
      ? "All records on this locus are single-line notes."
      : singleCount === 0
        ? "This locus is read almost entirely through multi-line spans."
        : `${rangeRatio}% of the records reaching this line are span-based readings.`;

  const eras = buildEraDistribution(payload.records);
  const topTermsPayloadIsCurrent = String(payload.top_commentary_terms_note || "").includes("line-span-weighted lexical contour");
  const topTerms = Array.isArray(payload.top_commentary_terms) && payload.top_commentary_terms.length && topTermsPayloadIsCurrent
    ? payload.top_commentary_terms.map((token) => formatTopCommentaryTerm(token)).filter(Boolean)
    : buildTopCommentaryTerms(payload.records);
  const earliestLabel = earliestRecord
    ? `${earliestRecord.commentary_name} (${earliestRecord.date_label || earliestYear})`
    : "No dated commentary";
  const latestLabel = latestRecord
    ? `${latestRecord.commentary_name} (${latestRecord.date_label || latestYear})`
    : "No dated commentary";
  const spanLabel =
    earliestYear != null && latestYear != null
      ? `${latestYear - earliestYear} years`
      : "Date span unavailable";

  return {
    coverageCount,
    singleCount,
    rangeCount,
    earliestLabel,
    latestLabel,
    spanLabel,
    coverageHint,
    granularityHint,
    eras,
    topTermsLabel: topTerms.length ? topTerms.join(" · ") : "No stable lexical contour yet",
    topTermsHint: topTerms.length
      ? (topTermsPayloadIsCurrent
        ? choose("Weighted terms recurring across commentary on this line.", "这行 commentary 里反复出现的加权词。")
        : choose("Weighted terms inferred from records touching this line.", "从覆盖这行的 records 里推出来的加权词。"))
      
      : "Current commentary set is too thin for a stable lexical signal.",
    lead: `This is a ${coverageTone}: ${coverageCount} records touch line ${payload.line_number}, with ${singleCount} single-line readings and ${rangeCount} range-based readings.`,
  };
}

function ensureAnalysisSummaryElement() {
  let summary = elements.coverageList.querySelector(".analysis-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "analysis-summary";
  }
  summary.id = "analysis-summary";
  return summary;
}

function clearAnalysisSummary() {
  const summary = elements.coverageList.querySelector(".analysis-summary");
  if (summary) {
    summary.remove();
  }
}

function buildEraDistribution(records) {
  const counts = new Map();
  for (const record of records) {
    const label = record.century_label || "Undated";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const maxCount = Math.max(1, ...counts.values());
  return [...counts.entries()]
    .sort((left, right) => compareCenturyLabels(left[0], right[0]) || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([label, count]) => ({ label, count, strength: Math.max(0.18, count / maxCount) }));
}

function buildTopCommentaryTerms(records) {
  const counts = new Map();
  for (const record of records || []) {
    const source = `${record.record_summary || ""} ${record.record_text_preview || ""}`;
    const contributionWeight = 1 / Math.max(Number(record.line_span) || 1, 1);
    const tokenCounts = new Map();
    for (const token of tokenizeSemanticText(source)) {
      if (!token || token.length <= 3 || TOP_COMMENTARY_TERM_NOISE.has(token) || looksLikeBadWordProfileTerm(token)) {
        continue;
      }
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
    for (const [token, count] of tokenCounts.entries()) {
      counts.set(token, (counts.get(token) || 0) + (count * contributionWeight));
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([token]) => formatTopCommentaryTerm(token));
}

function formatTopCommentaryTerm(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (PROPER_TERM_LABELS.has(normalized)) {
    return PROPER_TERM_LABELS.get(normalized);
  }
  return normalized;
}

function compareCenturyLabels(left, right) {
  return getCenturySortKey(left) - getCenturySortKey(right);
}

function getCenturySortKey(label) {
  if (!label || label === "Undated") {
    return Number.POSITIVE_INFINITY;
  }
  const match = String(label).match(/(\d+)(?:st|nd|rd|th)\s*c\./i);
  if (!match) {
    return Number.POSITIVE_INFINITY;
  }
  return Number(match[1]);
}

function getSemanticStateForPayload(payload) {
  if (payload.semantic_fields) {
    const normalizedFields = (payload.semantic_fields.fields || []).map((field) => {
      const normalizedField = {
        id: field.id,
        internalLabel: field.internalLabel || field.internal_label || field.seedTerm || field.seed_term || null,
        rawDisplayLabel: field.displayLabel || field.display_label || field.label,
        displayLabel: field.displayLabel || field.display_label || field.label,
        label: field.displayLabel || field.display_label || field.label,
        seedTerm: field.seedTerm || field.seed_term || null,
        fieldKind: field.fieldKind || field.field_kind || null,
        representativeTerms: field.representativeTerms || field.representative_terms || [],
        recordCount: field.recordCount ?? field.record_count ?? 0,
        recordShare: field.recordShare ?? field.record_share ?? 0,
        recordIds: field.recordIds || field.record_ids || [],
        exampleCommentaries: field.exampleCommentaries || field.example_commentaries || [],
        uniqueCommentatorCount: field.uniqueCommentatorCount ?? field.unique_commentator_count ?? 0,
        qa: field.qa || { review_needed: false, flags: [], note: "" },
        crossLineReferences: field.crossLineReferences || field.cross_line_references || [],
      };
      const displayMeta = getSemanticFieldDisplayMeta(normalizedField);
      normalizedField.displayRepresentativeTerms = getSemanticFieldDisplayTerms(normalizedField);
      normalizedField.displayHeading = displayMeta.heading || normalizedField.displayLabel;
      normalizedField.displayGloss = displayMeta.gloss || "";
      normalizedField.label = normalizedField.displayHeading;
      return normalizedField;
    });
    const mergedFields = mergeSemanticFieldsForDisplay(normalizedFields, payload);
    const mergedRecordToField = new Map();
    mergedFields.forEach((field) => {
      (field.recordIds || []).forEach((recordId) => {
        mergedRecordToField.set(recordId, field.id);
      });
    });
    return {
      schemaVersion: payload.semantic_fields.schemaVersion || payload.semantic_fields.schema_version || "legacy",
      fields: mergedFields,
      recordToField: mergedRecordToField,
    };
  }
  const cacheKey = `${state.overview.sample}:${payload.line_number}`;
  if (!state.semanticCache.has(cacheKey)) {
    state.semanticCache.set(cacheKey, buildSemanticFields(payload));
  }
  return state.semanticCache.get(cacheKey);
}

function buildSemanticFields(payload) {
  const recordProfiles = buildRecordProfiles(payload.records);
  if (!recordProfiles.length) {
    return { fields: [], recordToField: new Map() };
  }

  const documentFrequencies = new Map();
  for (const profile of recordProfiles) {
    for (const token of profile.tokenSet) {
      documentFrequencies.set(token, (documentFrequencies.get(token) || 0) + 1);
    }
  }

  const totalRecords = recordProfiles.length;
  const tokenCoverage = new Map();
  const tokenScores = new Map();

  for (const profile of recordProfiles) {
    profile.weights = new Map();
    for (const [token, count] of profile.tokenCounts.entries()) {
      const df = documentFrequencies.get(token) || 1;
      const idf = Math.log(1 + totalRecords / (1 + df));
      const weight = profile.contributionWeight * count * idf;
      profile.weights.set(token, weight);
      tokenScores.set(token, (tokenScores.get(token) || 0) + weight);
      if (weight > 0) {
        tokenCoverage.set(token, (tokenCoverage.get(token) || 0) + profile.contributionWeight);
      }
    }
  }

  const totalContribution = recordProfiles.reduce((sum, profile) => sum + profile.contributionWeight, 0);
  const minRecords = Math.max(1.2, totalContribution * 0.08);
  const maxCoverage = Math.max(minRecords + 0.5, totalContribution * 0.72);
  const candidates = [...tokenScores.entries()]
    .map(([token, score]) => ({ token, score, coverage: tokenCoverage.get(token) || 0 }))
    .filter((item) => item.coverage >= minRecords && item.coverage <= maxCoverage)
    .sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.token.localeCompare(right.token));

  const seedFields = [];
  for (const candidate of candidates) {
    if (seedFields.length >= 6) {
      break;
    }

    const memberIndices = recordProfiles
      .map((profile, index) => ({ profile, index }))
      .filter(({ profile }) => profile.weights.has(candidate.token))
      .map(({ index }) => index);

    if (memberIndices.length < minRecords) {
      continue;
    }

    const overlapsExisting = seedFields.some((field) => {
      const overlap = memberIndices.filter((index) => field.memberIndices.includes(index)).length;
      const denominator = Math.min(field.memberIndices.length, memberIndices.length) || 1;
      return overlap / denominator > 0.88;
    });

    if (overlapsExisting) {
      continue;
    }

    const topTerms = summarizeTermsForMembers(recordProfiles, memberIndices, 5);
    seedFields.push({
      id: `field-${seedFields.length + 1}-${candidate.token}`,
      seedTerm: candidate.token,
      label: formatFieldLabel(topTerms, candidate.token),
      representativeTerms: topTerms,
      memberIndices,
    });
  }

  if (!seedFields.length) {
    const fallbackTerms = summarizeTermsForMembers(
      recordProfiles,
      recordProfiles.map((_, index) => index),
      5
    );
    seedFields.push({
      id: "field-1-fallback",
      seedTerm: fallbackTerms[0] || "field",
      label: formatFieldLabel(fallbackTerms, fallbackTerms[0]),
      representativeTerms: fallbackTerms,
      memberIndices: recordProfiles.map((_, index) => index),
    });
  }

  const recordToField = new Map();
  for (const profile of recordProfiles) {
    let bestField = null;
    let bestScore = 0;
    for (const field of seedFields) {
      const score = field.representativeTerms.reduce((sum, term) => sum + (profile.weights.get(term) || 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }
    if (bestField) {
      recordToField.set(profile.record.id, bestField.id);
    }
  }

  const finalizedFields = seedFields
    .map((field) => {
      const assignedIndices = recordProfiles
        .map((profile, index) => ({ profile, index }))
        .filter(({ profile }) => recordToField.get(profile.record.id) === field.id)
        .map(({ index }) => index);
      if (!assignedIndices.length) {
        return null;
      }
      const representativeTerms = summarizeTermsForMembers(recordProfiles, assignedIndices, 5);
      return {
        id: field.id,
        label: formatFieldLabel(representativeTerms, field.seedTerm),
        representativeTerms,
        recordCount: assignedIndices.length,
        recordShare: Math.round((assignedIndices.length / totalRecords) * 100),
        recordIds: assignedIndices.map((index) => recordProfiles[index].record.id),
        crossLineReferences: buildCrossLineReferences(representativeTerms, payload.line_number),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.recordCount - left.recordCount || left.label.localeCompare(right.label));

  return { fields: finalizedFields, recordToField };
}

function buildRecordProfiles(records) {
  return records
    .map((record) => {
      const semanticText = `${record.record_summary || ""} ${record.record_text_preview || ""}`;
      const tokens = tokenizeSemanticText(semanticText);
      return {
        record,
        tokenCounts: countTokens(tokens),
        tokenSet: new Set(tokens),
        contributionWeight: 1 / Math.max(Number(record.line_span) || 1, 1),
        weights: new Map(),
      };
    })
    .filter((profile) => profile.tokenCounts.size > 0);
}

function tokenizeSemanticText(text) {
  const normalized = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matches = normalized.match(/[a-z]{4,}/g) || [];
  return matches
    .filter((token) => !SEMANTIC_STOPWORDS.has(token))
    .map((token) => CANONICAL_SEMANTIC_TERMS.get(token) || token);
}

function countTokens(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function summarizeTermsForMembers(recordProfiles, indices, limit) {
  const aggregate = new Map();
  for (const index of indices) {
    const profile = recordProfiles[index];
    for (const [token, weight] of profile.weights.entries()) {
      aggregate.set(token, (aggregate.get(token) || 0) + weight);
    }
  }
  return [...aggregate.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function formatFieldLabel(terms, seedTerm = null) {
  if (seedTerm) {
    return seedTerm;
  }
  if (!terms.length) {
    return "Loose semantic cluster";
  }
  return terms[0];
}

function buildCrossLineReferences(fieldTerms, currentLineNumber) {
  const fieldSet = new Set(fieldTerms);
  return (state.overview.lines || [])
    .filter((line) => line.line_number !== currentLineNumber)
    .map((line) => {
      const signatureTerms = Array.isArray(line.signature_terms) ? line.signature_terms : [];
      const sharedTerms = signatureTerms.filter((term) => fieldSet.has(term));
      return {
        line_number: line.line_number,
        line_text: line.line_text,
        score: sharedTerms.length,
        shared_terms: sharedTerms.slice(0, 3),
      };
    })
    .filter((line) => line.score > 0)
    .sort((left, right) => right.score - left.score || left.line_number - right.line_number)
    .slice(0, 3);
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) {
    return 0;
  }
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = index - lower;
  return Math.round(sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight);
}

function setupAnchorObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

      if (visible.length) {
        setActiveAnchor(visible[0].target.id);
      }
    },
    {
      rootMargin: "-20% 0px -45% 0px",
      threshold: [0.2, 0.45, 0.7],
    }
  );

  for (const section of elements.anchorSections) {
    observer.observe(section);
  }
}

function setActiveAnchor(sectionId) {
  for (const link of elements.anchorLinks) {
    link.classList.toggle("is-active", link.dataset.section === sectionId);
  }
}

function makeRecordSorter(mode, direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;
  switch (mode) {
    case "commentary":
      return (left, right) => left.commentary_name.localeCompare(right.commentary_name) * multiplier;
    case "span":
      return (left, right) => (left.line_span - right.line_span || left.commentary_name.localeCompare(right.commentary_name)) * multiplier;
    case "length":
      return (left, right) => (left.record_text_length - right.record_text_length || left.commentary_name.localeCompare(right.commentary_name)) * multiplier;
    case "chronological":
    default:
      return (left, right) =>
        (compareNullable(left.year_start, right.year_start) ||
          left.commentary_name.localeCompare(right.commentary_name) ||
          left.line_span - right.line_span) * multiplier;
  }
}

function compareNullable(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function renderFatal(error) {
  elements.coverageList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  elements.locusPanel.innerHTML = `<div class="empty-state">${escapeHtml(choose("Word-locus data could not be loaded.", "无法加载 word-locus 数据。"))}</div>`;
  elements.vocabularyPanel.innerHTML = `<div class="empty-state">${escapeHtml(choose("Interpretive-vocabulary data could not be loaded.", "无法加载 interpretive vocabulary 数据。"))}</div>`;
  elements.figurePanel.innerHTML = `<div class="empty-state">${escapeHtml(choose("Figure-navigation data could not be loaded.", "无法加载人物导航数据。"))}</div>`;
  elements.recurrencePanel.innerHTML = `<div class="empty-state">${escapeHtml(choose("Recurrence prototype data could not be loaded.", "无法加载 recurrence prototype 数据。"))}</div>`;
  elements.recordsList.innerHTML = `<div class="empty-state">${escapeHtml(choose("Demo data could not be loaded.", "无法加载 demo 数据。"))}</div>`;
  elements.compareList.innerHTML = `<div class="empty-state">${escapeHtml(choose("Please run the data build step first.", "请先运行数据构建脚本。"))}</div>`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getShellSnapshot() {
  return {
    currentSampleId: state.currentSampleEntry?.id || null,
    selectedLine: state.selectedLine,
    selectedLocusId: state.selectedLocus?.id || null,
    selectedLocusNormalized: state.selectedLocus?.normalized_form || null,
    activeSemanticField: state.activeSemanticField,
    activeInterpretiveTerm: state.activeInterpretiveTerm,
    activeScholarTab: state.activeScholarTab,
    activeAuthority: state.activeAuthority?.author_id || state.activeAuthority?.canonical_name || null,
    sortMode: state.sortMode,
    sortDirection: state.sortDirection,
    uiLanguage: state.uiLanguage,
    searchStatus: state.searchStatus,
  };
}

function getCurrentWorkbenchContext() {
  const payload = state.selectedLine != null ? state.lineCache.get(state.selectedLine) || null : null;
  return {
    manifestEntry: state.currentSampleEntry || null,
    overview: state.overview || null,
    payload,
    selectedLine: state.selectedLine,
    selectedLocus: state.selectedLocus || null,
    activeSemanticField: state.activeSemanticField,
    activeInterpretiveTerm: state.activeInterpretiveTerm,
  };
}

function getManifestEntry(sampleId) {
  return state.manifestMap.get(sampleId) || null;
}

function getCurrentLinePayload() {
  if (state.selectedLine == null) {
    return null;
  }
  return state.lineCache.get(state.selectedLine) || null;
}

function hasModule(sampleId, moduleKey) {
  const entry = sampleId ? getManifestEntry(sampleId) : state.currentSampleEntry;
  if (!entry) {
    return false;
  }
  if (entry.modules?.[moduleKey]) {
    return true;
  }
  if (["records", "semantic_fields", "comparison"].includes(moduleKey)) {
    return canSampleOpenLineWorkbench(entry);
  }
  if (moduleKey === "coverage") {
    return Boolean(entry.overview_available || entry.overview_path || entry.modules?.coverage);
  }
  return false;
}

const DDPAppShell = Object.freeze({
  version: "app-shell/v1",
  getSnapshot: getShellSnapshot,
  getCurrentContext: getCurrentWorkbenchContext,
  getManifestEntry,
  getCurrentLinePayload,
  hasModule,
  loadSample,
  selectLine,
  jumpToSampleLine,
  ensureSearchIndexLoaded,
  ensureAuthorityLayerLoaded,
  ensureAuthorityCommentarySourcesLoaded,
  ensureSampleRecordStoreLoaded,
  ensureSampleRecordSummaryStoreLoaded,
  ensureSampleFullTextStoreLoaded,
  ensureDanteWordLociIndexLoaded,
  getFullTextStoreMeta,
  getRecordSummaryStoreMeta,
});

window.DDPAppShell = DDPAppShell;
window.DDPAppShellReady = init().then(() => {
  renderPinned();
  return DDPAppShell;
});
