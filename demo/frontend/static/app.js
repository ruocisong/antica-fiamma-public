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
  if (["authority-panel", "authority-lens"].includes(key)) {
    await Promise.all([
      ensureAuthorityLayerLoaded(),
      ensureAuthorityCommentarySourcesLoaded(),
      ensureAuthorityCuratedRoomAnchorsLoaded(),
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
    .map((paragraph) => `<p class="help-paragraph">${escapeHtml(paragraph)}</p>`)
    .join("");
}

function renderHelpModalMarkup(title, lead, sections) {
  return {
    title: title || (state.uiLanguage === "en" ? "Guide" : "功能说明"),
    lead: lead || "",
    body: renderHelpModalBody(sections),
  };
}

function buildHelpContent(key) {
  const stats = getHelpStatsSnapshot();
  const currentLineLabel = Number.isFinite(stats.selectedLine) ? `Line ${stats.selectedLine}` : "the current line";
  const isEnglish = state.uiLanguage === "en";
  const choose = (en, bilingual) => (isEnglish ? en : bilingual);
  const makeBody = (...lines) => formatHelpParagraphs(lines);

  const helpMap = {
    "quick-jump": {
      title: "Quick Jump / Search",
      lead: choose(
        `This entry combines direct navigation with lexical search. The current local index covers ${formatNumber(stats.searchDocCount)} line-based documents and ${formatNumber(stats.searchTokenCount)} indexed tokens.`,
        `这个入口把直接跳转和词语搜索放在一起。当前本地索引覆盖了 ${formatNumber(stats.searchDocCount)} 条按行组织的 document，以及 ${formatNumber(stats.searchTokenCount)} 个可搜索 token。`
      ),
      sections: [
        { label: choose("How it works", "它怎么工作"), body: makeBody(
          choose("If you type a canto or line reference, the interface treats it as navigation. It only falls back to the search index when the query is genuinely lexical.", "如果你输入的是 canto 或 line 的坐标，它会先把它当成导航；只有当输入真的像词语搜索时，才会转去查索引。"),
          choose("The point is not to split reading into a separate search page. The point is to move you back into the poem as quickly as possible.", "它不是要把阅读拆成一个独立的搜索页面，而是要尽快把你送回诗的现场。")
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
      ],
    },
    "entry-panel": {
      title: choose("Entry", "正文入口 / Entry"),
      lead: choose(
        `${stats.currentSampleTitle} first appears here as a readable surface, line by line. This panel is the doorway into the canto, not the commentary itself.`,
        `${stats.currentSampleTitle} 在这里先作为一张可以读的逐行表面出现。这一层是进入 canto 的门，不是 commentary 本身。`
      ),
      sections: [
        { label: choose("How to read it", "怎么读这一层"), body: makeBody(
          choose("Color and bar length show where commentary attention gathers. Clicking the row itself opens the line snapshot; clicking a selectable word opens the word-locus path.", "颜色和横条长度先告诉你评论密度落在哪里。点一行本身会展开 line snapshot；点一个可选词，才会继续走到词位层。"),
          choose("That split matters because choosing a line and following a word are not the same act of reading.", "这个区分很重要，因为“先选一行”和“继续追一个词”并不是同一类阅读动作。")
        )},
      ],
    },
    "close-reading": {
      title: choose("Close Reading", "注释细读 / Close Reading"),
      lead: choose(
        `This panel opens around ${currentLineLabel}. It is where summaries, previews, dates, spans, and full cards begin to behave like reading material rather than metadata.`,
        `这一层围绕 ${Number.isFinite(stats.selectedLine) ? `第 ${stats.selectedLine} 行` : "当前选中行"} 展开。summary、preview、年代、span 和完整注释卡，不再只是元数据，而开始真正进入阅读。`
      ),
      sections: [
        { label: choose("What happens here", "这里发生什么"), body: makeBody(
          choose("The cards gathered here are the commentary objects that actually reach the selected line. Entry gives you orientation; Close Reading is where the tradition truly opens.", "这里聚到一起的 cards，是那些真实覆盖到当前行的 commentary 对象。Entry 负责给你方位；Close Reading 才真正把解释传统打开。"),
          choose("Sorting and highlighting exist to support reading, not to turn the page into a database console.", "排序和高亮是为了帮助阅读，不是为了把页面做成数据库控制台。")
        )},
      ],
    },
    "compare-panel": {
      title: choose("Comparison Workspace", "比较区 / Comparison Workspace"),
      lead: choose(
        "This panel is not an automatic comparison engine. It is a quiet surface for the cards you choose to keep side by side.",
        "这不是一个自动比较引擎，而是一张把你亲手挑中的 cards 并排摆开的桌面。"
      ),
      sections: [
        { label: choose("Why it helps", "它为什么有用"), body: makeBody(
          choose("Many strong Dante readings begin when two or three traditions sit beside each other. This panel turns that mental burden into visible space.", "很多真正有意思的 Dante 阅读，都是从两三条传统解释并排坐在一起开始的。这一层会把那种脑内负担变成眼前可见的空间。")
        )},
      ],
    },
    "authority-panel": {
      title: choose("Authority", "人物层 / Authority"),
      lead: choose(
        `This panel now joins personaggio navigation and authority reading in one path. The current local build exposes ${formatNumber(stats.authorityAuthorCount)} tracked authority authors, ${formatNumber(stats.figureProfileCount)} active personaggi, and ${formatNumber(stats.authoritySourceCount)} local authority-source texts.`,
        `这一层现在把 personaggio navigation 和 authority 阅读并到同一条路径里。按当前本地文件状态，它已经接上 ${formatNumber(stats.authorityAuthorCount)} 位 tracked authority authors、${formatNumber(stats.figureProfileCount)} 个 active personaggi，以及 ${formatNumber(stats.authoritySourceCount)} 条本地 authority-source texts。`
      ),
      sections: [
        { label: choose("Why it is separate", "为什么要单独拎出来"), body: makeBody(
          choose("Authority is not a footnote to Compare. It is its own reading path through figures, commentators, works, and citation habits, and it now has enough thickness to stand as a real environment rather than a side experiment.", "Authority 不是 Compare 的脚注，而是一条独立的阅读路径：人物、commentator、works、citation 习惯都会在这里自己长成环境，而不再只是侧边的小试验。")
        )},
      ],
    },
    "analysis-layer": {
      title: "Analysis Layer / Line Snapshot",
      lead: choose(
        "This is a low-pressure summary of the selected line. It lets you feel density, spread, and historical span before you enter the full card stack.",
        "这是当前选中行的一层低压力快照。它先让你摸到这行的密度、分布和历史跨度，再决定要不要往下面的大堆 cards 深读。"
      ),
      sections: [
        { label: choose("What it gathers", "它先拢什么"), body: makeBody(
          choose("It gathers coverage, granularity, top commentary terms, diachronic span, and century distribution from the records already attached to the line.", "它把这行已经落地的 records 拢成几类可读信号：coverage、granularity、top commentary terms、diachronic span 和 century distribution。")
        )},
      ],
    },
    "semantic-fields": {
      title: "Interpretive Fields",
      lead: choose(
        `This panel gathers the commentary records reaching ${currentLineLabel} into a few steadier local interpretive directions. The fields come from clustering of commentary language, not from Dante's own text.`,
        `这一层会把覆盖 ${Number.isFinite(stats.selectedLine) ? `第 ${stats.selectedLine} 行` : "当前选中行"} 的 commentary records 收成几组更稳的局部解释方向。这些 fields 来自 commentary language 的局部聚类，不是但丁原文自己的主题分类。`
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
        `The local Dante word-locus index currently exposes ${formatNumber(stats.danteWordProfileCount)} profiles. This layer begins from one selected content word in the poem and follows what grows around it in the poem and in the commentary.`,
        `当前本地 Dante word-locus index 有 ${formatNumber(stats.danteWordProfileCount)} 个 profile。这一层从诗里一个被选中的 content word 出发，继续追它在正文和注释层周围长出来的东西。`
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
        `Figure Navigation now reads directly from the local authority/personaggio layer and surfaces the figures that genuinely matter for the current sample.`,
        `Figure Navigation 现在直接读取本地 authority/personaggio layer，只显示对当前 sample 真正有帮助的人物入口。`
      ),
      sections: [
        { label: choose("Why it belongs here", "为什么它适合在这里"), body: makeBody(
          choose("It keeps figure-based reading close to the poem and the cards, instead of forcing you into a detached encyclopaedic index. Personaggi now open through poem hits, commentary aliases, and figure-specific bands rather than through a thin profile shelf.", "它让人物阅读始终贴着诗句和 cards 走，而不是把你突然扔进一张脱离现场的人物索引表。现在 personaggi 会通过 poem hits、commentary aliases 和 figure-specific bands 打开，而不是靠一层很薄的旧 profile shelf。")
        )},
      ],
    },
    "authority-lens": {
      title: "Authority Lens",
      lead: choose(
        "Authority Lens follows a commedia-text-first order: start from the poem and the commentary scene, then move outward to authors, works, and source traditions.",
        "Authority Lens 采用 commedia-text-first 的顺序：先从诗和 commentary 现场开始，再慢慢走向 author、works 和 source tradition。"
      ),
      sections: [
        { label: choose("How it reads", "它怎么组织阅读"), body: makeBody(
          choose("The aim is not to drown you in a giant tree, but to show which textual and intellectual traditions stand behind the line you are reading.", "它不是要用一棵巨大的树淹没你，而是让你看见眼前这一行背后站着哪些文本传统和解释传统。"),
          choose("The path is now deliberately staged: poem layer first, commentary layer next, and work / passage drill-down only after that.", "这条路径现在刻意分成几步：先看 poem layer，再看 commentary layer，最后才进入 work / passage 的 drill-down。")
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
        "This layer now follows the text-first Cross-Canto Echoes baseline used in the current local workbench: start from Dante's line, then terzina context, and only then use commentary as a lighter support layer.",
        "这一层现在采用当前本地 workbench 正在使用的 text-first Cross-Canto Echoes baseline：先看 Dante 原文这一行，再看 terzina 上下文，commentary 只作为较轻的辅助层。"
      ),
      sections: [
        { label: choose("How it reads", "它怎么读"), body: makeBody(
          choose("The current line is the main unit. Ranking first checks overlap in Dante's own wording, then nearby terzina context, and only after that allows lighter commentary support. Candidate lines are prompts for reading, not philological verdicts.", "当前行是主要单位。ranking 先检查 Dante 原文措辞的重叠，再看附近 terzina 的上下文，最后才允许较轻的 commentary support。候选行是继续追读的提示，不是 philological verdict。")
        )},
        { label: choose("What it compares", "它根据什么"), body: makeBody(
          choose("The current panel compares line-level evidence in a fixed order: Dante line wording first, terzina context next, commentary support last. The reviewer loop is allowed to delete obviously unrelated candidate lines instead of preserving them just because they surfaced in the top five.", "当前 panel 会按固定顺序比较 line-level 证据：先看 Dante 原文措辞，再看 terzina 上下文，最后才看较轻的 commentary support。reviewer loop 可以直接删掉明显无关的候选行，不会因为它们挤进 top five 就被礼貌保留。")
        )},
        { label: choose("What you currently see", "当前会先看到什么"), body: makeBody(
          choose("The panel now tries to show the strongest visible echoes for the current line right away. When reviewable echoes exist, they stay first. When they do not, the panel surfaces thinner but still readable echoes instead of showing a blank block.", "这个 panel 现在会尽量先把当前这一行最可见的 echoes 直接放出来。若有 reviewable echoes，它们会排在最前；若没有，panel 会直接显示 thinner 但仍可读的 echoes，而不是留下一整块空白。")
        )},
        { label: choose("How to read direction and axis", "方向和 axis 怎么读"), body: makeBody(
          choose("Direction labels show whether the current line looks back on an earlier line or looks forward to a later one. When axis language appears, it is there only to help explain the relation that the text-first baseline has already surfaced; it does not drive the ranking.", "方向标签会告诉你：当前这一行是在回望更早的 line，还是在前指更晚的 line。若出现 axis language，它只是帮助解释 text-first baseline 已经挑出来的关系，不参与排序。")
        )},
        { label: choose("How to read the tags", "标签怎么读"), body: makeBody(
          choose("Candidate cards use light reading labels only when they help distinguish the visible results. These tags reflect the current text-first baseline plus reviewer rollback, so they should be read as workflow-aware prompts rather than automatic literary judgements.", "候选卡只会在这些标签真的有区分度时才显示。这些标签反映的是当前 text-first baseline 加 reviewer rollback 的工作流，所以它们应该被读成 workflow-aware 的阅读提示，而不是自动文学判断。")
        )},
      ],
    },
  };

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
      <h3>${escapeHtml(section.label)}</h3>
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

  try {
    await ensureHelpDataForKey(key);
    const content = buildHelpContent(key);
    const rendered = renderHelpModalMarkup(content.title, content.lead, content.sections);
    elements.helpOverlayTitle.textContent = rendered.title;
    elements.helpOverlayLead.innerHTML = escapeHtml(rendered.lead);
    elements.helpOverlayBody.innerHTML = rendered.body;
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
  }
}

function closeHelpModal() {
  if (!elements.helpOverlay) {
    return;
  }
  elements.helpOverlay.classList.add("is-hidden");
  elements.helpOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("help-overlay-open");
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

  elements.sortDirection.addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    elements.sortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
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
    window.location.hash = "#records-section";
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
  if (elements.sortDirection) {
    elements.sortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
  }
  elements.uiLanguageToggle?.querySelectorAll("[data-ui-lang]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.uiLang === state.uiLanguage);
  });
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
  state.activeSearchRecordId = null;
  state.activeSearchHighlightTerms = [];
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
let lociPanel;
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
  return {
    ...baseAuthor,
    ...detailAuthor,
    author_id: baseAuthor?.author_id || detailAuthor.author_id,
    canonical_name: baseAuthor?.canonical_name || detailAuthor.canonical_name,
    detail_path: baseAuthor?.detail_path || detailAuthor.detail_path,
    works_tree: detailAuthor?.works_tree || baseAuthor?.works_tree,
    commentary_line_index: detailAuthor?.commentary_line_index || baseAuthor?.commentary_line_index,
    flat_work_object: detailAuthor?.flat_work_object || baseAuthor?.flat_work_object,
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
  return author?.flat_work_object || null;
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
    flat_work_object: author?.flat_work_object || flat.flat_work_object,
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
  scrollToCoverageLine(lineNumber);
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

function scrollToCoverageSection() {
  setActiveAnchor("coverage-section");
  document.getElementById("coverage-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToCoverageLine(lineNumber) {
  if (!Number.isFinite(Number(lineNumber))) {
    return;
  }
  scrollToCoverageSection();
  requestAnimationFrame(() => {
    const section = document.getElementById("coverage-section");
    section?.classList.add("is-jump-focus");
    window.setTimeout(() => section?.classList.remove("is-jump-focus"), 1400);
    const row = elements.coverageList.querySelector(`.coverage-row[data-line-number="${CSS.escape(String(lineNumber))}"]`);
    if (!row) {
      return;
    }
    row.scrollIntoView({ behavior: "smooth", block: "start" });
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
  return lociPanel.renderLocusPanel(payload);
}

function renderVocabularyPanel(payload) {
  return lociPanel.renderVocabularyPanel(payload);
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

function renderFigurePanel() {
  return authorityPanel.renderFigurePanel();
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
  formatShortCommediaLocation,
  renderLineRecords: (...args) => recordsPanel.renderLineRecords(...args),
});

lociPanel = window.DDPLociPanel.createLociPanel({
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
  buildRecurrenceCandidates,
  buildLineEchoSourceTerms,
  buildLineEchoSourceFields,
  formatShortCommediaLocation,
  highlightDualTerms,
  renderLineRecords: (...args) => recordsPanel.renderLineRecords(...args),
});

recordsPanel = window.DDPRecordsPanel.createRecordsPanel({
  state,
  elements,
  documentRef: document,
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
  renderLocusPanel: (...args) => lociPanel.renderLocusPanel(...args),
  renderVocabularyPanel: (...args) => lociPanel.renderVocabularyPanel(...args),
  renderSemanticPanel: (...args) => semanticPanel.renderSemanticPanel(...args),
  renderRecurrencePanel: (...args) => lociPanel.renderRecurrencePanel(...args),
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

  const buttons = featuredAuthors
    .map(
      (author) => `
        <button type="button" class="figure-chip ${author.author_id === selectedAuthor?.author_id ? "is-active" : ""}" data-authority-id="${author.author_id}">
          ${escapeHtml(getAuthorityDisplayName(author))}
        </button>
      `
    )
    .join("");

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

  return `
    <div class="title-with-help section-title-with-help">
      <h3>Authority Lens</h3>
      ${renderHelpButton("authority-lens", "Authority Lens 说明")}
    </div>
    <p class="semantic-intro">${escapeHtml(chooseText("This layer now follows a clearer reading order: first where the figure appears in the poem, then where commentary traditions gather around it, and only then the works / passages / occurrence drill-down.", "这一层现在按更清楚的阅读顺序来组织：先看《神曲》正文里对象出现在哪些 canto / line，再看 commentary tradition 围绕它在哪些 canto 说话，最后才 drill down 到 works / passages / occurrences。"))}</p>
    <div class="figure-chip-row">${buttons}</div>
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
  if (state.uiLanguage !== "en" || !containsAuthorityCjk(rawNote)) {
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
  if (state.uiLanguage !== "en" || !containsAuthorityCjk(rawNote)) {
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
  if (state.uiLanguage !== "en" || !containsAuthorityCjk(rawNote)) {
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
    return `${name} currently opens through a flat work overview: keep the main works visible and readable, but do not overstate the room as a fully branched local tree.`;
  }
  if (workMode === "special_case_object") {
    return `${name} currently opens through a controlled special-case work path rather than a generic work tree.`;
  }
  return `${name} currently exposes the mounted work layer that belongs to this room.`;
}

function getAuthorityBranchPageHref(author, work, nodeSelection) {
  if (!author || !work || !nodeSelection?.staticPageLabel) {
    return "";
  }
  const authorSlug = String(author.public_slug_it || "").trim() || slugifyAuthorityStaticSegment(getAuthorityDisplayName(author));
  return `/autore/${authorSlug}/${slugifyAuthorityStaticSegment(getAuthorityWorkDisplayName(author, work))}/${slugifyAuthorityStaticSegment(nodeSelection.staticPageLabel)}.html`;
}

function getAuthorityReadingContractMeta(author) {
  const meta = author?.reading_contract_meta;
  if (meta && meta.available) {
    return meta;
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
            ${renderAuthorityCuratedAnchorCards(curatedAuthorAnchors) || `<div class="empty-state">${escapeHtml(chooseText("No curated commentary path is mounted here yet. Use the static autore room as the current reading path.", "这里还没有挂出 curated commentary path；请先沿静态 autore 房间继续阅读。"))}</div>`}
          </div>
        </div>
        <div class="authority-stage-block authority-stage-block-secondary">
          <h4>${escapeHtml(chooseText("Selected line", "当前选中行"))}</h4>
          <div class="occurrence-list">
            <div class="empty-state">${escapeHtml(chooseText("No line-level commentary occurrence is currently mounted for this author.", "这个 author 当前还没有挂出的 line-level commentary occurrence。"))}</div>
          </div>
        </div>
        <div class="authority-stage-block authority-stage-block-secondary">
          <div id="authority-commentary-source"></div>
          <h4>Commentary Source</h4>
          <div class="empty-state">${escapeHtml(chooseText("No local commentary-source bridge is currently mounted here.", "这里当前还没有挂出本地 commentary-source bridge。"))}</div>
        </div>
        <div class="authority-stage-block authority-stage-block-secondary">
          <h4>${escapeHtml(chooseText("Current Work Layer", "当前 Work Layer"))}</h4>
          <div class="locus-meta-row">${workChips || `<div class="empty-state">${escapeHtml(chooseText("No stable work overview is currently available for this figure.", "当前这个对象还没有足够稳定的 work overview。"))}</div>`}</div>
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
        <button
          type="button"
          class="occurrence-row authority-occurrence-row ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""}"
          data-authority-occurrence-key="${escapeHtml(occurrenceKey)}">
          <strong>${escapeHtml(`${entry.label} · ${location}`)}</strong>
          <span>${escapeHtml(entry.rawMentionSummary || occurrence.raw_mention || "commentary mention")}</span>
          <small>${escapeHtml(mentionLine)}</small>
        </button>
      `;
    })
    .join("");
  const selectedOccurrence = getAuthoritySelectedOccurrence(selectedLineGroup?.occurrences || [])
    || commentaryEntries[0]?.primaryOccurrence
    || null;
  const commentaryIndexButtons = (() => {
    return commentaryEntries
      .slice(0, 16)
      .map((entry) => {
        const occurrence = entry.primaryOccurrence;
        const label = entry.label;
        const occurrenceKey = makeAuthorityOccurrenceKey(occurrence);
        return `
          <a
            href="#authority-commentary-source"
            class="authority-commentary-name-chip ${occurrenceKey === state.activeAuthorityOccurrenceKey ? "is-active" : ""}"
            data-authority-commentary-chip-key="${escapeHtml(occurrenceKey)}">
            ${escapeHtml(label)}
          </a>
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
        <div class="locus-meta-row">${workChips || `<div class="empty-state">${escapeHtml(chooseText("No stable work overview is currently available for this figure.", "当前这个对象还没有足够稳定的 work overview。"))}</div>`}</div>
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
    const authorPageHref = getAuthorityAutorePageHref(author);
    const personaggioPageHref = getAuthorityPersonaggioPageHref(author);
    const curatedMarkup = renderAuthorityCuratedAnchorCards(selectedCuratedWorkAnchors || curatedAuthorAnchors);
    const staticLinks = [
      authorPageHref ? `<a href="${escapeHtml(authorPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static autore room", "打开静态 autore 房间"))}</a>` : "",
      personaggioPageHref ? `<a href="${escapeHtml(personaggioPageHref)}" target="_blank" rel="noreferrer">${escapeHtml(choose("Open static personaggio room", "打开静态 personaggio 房间"))}</a>` : "",
    ].filter(Boolean).join(" · ");

    if (!works.length && !sampledWorkOccurrences.length && !allOccurrences.length && curatedMarkup) {
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
              ${curatedMarkup}
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
          "This object still enters through a flat work overview, but from certain canti onward the author / character double identity must remain explicit.",
          "当前对象仍按 flat work overview 呈现，但从特定 canto 起必须保留作者 / personaggio 双重身份 caveat。"
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
        "This step drills down from a flat work overview. The object is not yet a full works tree, but stable work cards can already filter commentary occurrences.",
        "这一步先按 flat work overview 下钻；当前对象还没有完整 works tree，但已经可以按 stable work cards 过滤 commentary occurrences。"
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
  if (author?.author_id === "cicero") {
    return `<div class="authority-flat-banner">${escapeHtml(choose(
      "Cicero currently enters as a stable flat-work object: first filter by work cards, then return from occurrences to commentary source. It is not being presented as a full works tree.",
      "Cicero 现在作为稳定 flat-work object 前推：先按 work cards 过滤，再点 occurrence 回到注释原文。当前不把它伪装成完整 works tree。"
    ))}</div>`;
  }
  if (author?.author_id === "statius") {
    return `<div class="authority-flat-banner">${escapeHtml(choose(
      `Statius enters the works layer through a flat-work overview, but the sensitive distinction remains the current scope layer: ${selectedScope.heading}.`,
      `Statius 当前通过 flat-work overview 进入 works 层，但真正敏感的是 ${selectedScope.heading} 这层范围。`
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
    return "Structured passage";
  }
  if (scope === "prose_locator") {
    return "Prose locator";
  }
  if (scope === "work_only") {
    return "Work-only";
  }
  return "Pseudo-passage";
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
    return chooseText("Stable chapter -> verse nodes.", "这里放稳定的 chapter -> verse 节点。");
  }
  if (family === "scriptural_psalmic") {
    return chooseText("Stable Psalm or Psalm -> Verse nodes.", "这里放稳定的 Psalm 或 Psalm -> Verse 节点。");
  }
  return chooseText("Stable structured locator nodes.", "这里放当前最稳的结构化 locator 节点。");
}

function getAuthorityProseBucketNote(author) {
  const family = getAuthorityTreeObjectFamily(author);
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (family === "scriptural_epistolary") {
    return chooseText("Chapter-only or weaker locator nodes.", "这里放 chapter-only 或较弱的 locator 节点。");
  }
  if (family === "scriptural_psalmic") {
    return chooseText("Psalm subsets or weaker internal locators.", "这里放 Psalm subset 或较弱的内部 locator。");
  }
  return chooseText("Readable internal locators, but not full structured passages.", "这里放可读的内部 locator，但不假装成完整 structured passage。");
}

function getAuthorityWorkOnlyBucketNote(author, work) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  return chooseText(
    "Stable at work level, without a stronger passage node.",
    "这些 citation 已稳定在 work 层，但还没有更强的 passage 节点。"
  );
}

function getAuthorityPseudoPassageBucketNote(author, work) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  return chooseText(
    "Passage-like, but still weaker than stable locator nodes.",
    "这些看起来像 passage，但仍弱于稳定 locator 节点。"
  );
}

function getAuthorityChildNodeNote(author, scope) {
  const family = getAuthorityTreeObjectFamily(author);
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  if (scope === "structured_passage") {
    if (family === "scriptural_epistolary") {
      return chooseText(
        "Stable chapter -> verse nodes.",
        "这里放稳定的 chapter -> verse 节点。"
      );
    }
    if (family === "scriptural_psalmic") {
      return chooseText(
        "Stable Psalm -> Verse nodes.",
        "这里放稳定的 Psalm -> Verse 节点。"
      );
    }
    return chooseText(
      "Stable locator nodes.",
      "这里放稳定的 locator 节点。"
    );
  }
  if (family === "scriptural_psalmic") {
    return chooseText(
      "Psalm subsets or weaker internal locators.",
      "这里放 Psalm subset 或较弱的内部 locator。"
    );
  }
  return chooseText(
    "Readable internal locators, but not full structured passages.",
    "这里放可读的内部 locator，但不假装成完整 structured passage。"
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
      label: "Work-only bucket",
      staticPageLabel: null,
      note: getAuthorityWorkOnlyBucketNote(author, work),
      occurrences: work.work_only_occurrences || [],
    };
  }

  if (scope === "pseudo_passage") {
    return {
      scope: "pseudo_passage",
      label: "Pseudo-passage bucket",
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
    return {
      scope,
      label: matchNode.label,
      staticPageLabel: matchNode.label,
      note: scope === "structured_passage"
        ? getAuthorityStructuredBucketNote(author)
        : getAuthorityProseBucketNote(author),
      occurrences: matchNode.occurrences || [],
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
      ${nodeId ? `data-authority-node="${nodeId}"` : ""}
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
          ${canJump ? `<button type="button" class="lens-tab is-active" data-occurrence-sample="${sampleName}" data-occurrence-line="${lineNumber}">${escapeHtml(chooseText("Open This Line", "打开这一行"))}</button>` : ""}
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
            <small>${escapeHtml(`structured ${work.locator_bucket_counts?.structured_passage || 0} · prose ${work.locator_bucket_counts?.prose_locator || 0} · work-only ${work.locator_bucket_counts?.work_only || 0} · pseudo ${work.locator_bucket_counts?.pseudo_passage || 0}`)}</small>
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
    ? "Structured passage (chapter -> verse)"
    : objectFamily === "scriptural_psalmic"
      ? "Structured passage (psalm -> verse)"
      : "Structured passage";
  const proseHeading = objectFamily === "scriptural_epistolary"
    ? "Prose locator (chapter-only / weaker locator)"
    : objectFamily === "scriptural_psalmic"
      ? "Prose locator (psalm subset / weaker locator)"
      : "Prose locator";

  const workButtons = works
    .map(
      (work) => `
        <button
          type="button"
          class="authority-work-card authority-work-button ${work.canonical_work === selectedWork.canonical_work ? "is-active" : ""}"
          data-authority-work="${escapeHtml(work.canonical_work)}">
          <strong>${escapeHtml(getAuthorityWorkDisplayName(author, work))}</strong>
          <span>${escapeHtml(`${work.total_mentions} total mentions`)}</span>
          <small>${escapeHtml(`structured ${work.locator_bucket_counts.structured_passage} · prose ${work.locator_bucket_counts.prose_locator} · work-only ${work.locator_bucket_counts.work_only} · pseudo ${work.locator_bucket_counts.pseudo_passage}`)}</small>
        </button>
      `
    )
    .join("");

  const bucketButtons = [
    renderAuthorityBucketButton(
      "Structured passage",
      selectedWork.locator_bucket_counts.structured_passage,
      Boolean(structuredDefaultNodeId && (resolvedNodeId || "") === structuredDefaultNodeId),
      structuredDefaultNodeId,
      selectedWork.locator_bucket_counts.structured_passage ? "is-strong" : "is-muted",
      !structuredDefaultNodeId,
      getAuthorityStructuredBucketNote(author),
    ),
    renderAuthorityBucketButton(
      "Prose locator",
      selectedWork.locator_bucket_counts.prose_locator,
      Boolean(proseDefaultNodeId && (resolvedNodeId || "") === proseDefaultNodeId),
      proseDefaultNodeId,
      selectedWork.locator_bucket_counts.prose_locator ? "is-soft" : "is-muted",
      !proseDefaultNodeId,
      getAuthorityProseBucketNote(author),
    ),
    renderAuthorityBucketButton(
      "Work-only",
      selectedWork.locator_bucket_counts.work_only,
      (resolvedNodeId || "") === makeAuthorityNodeId("work_only"),
      makeAuthorityNodeId("work_only"),
      "is-neutral",
      false,
      getAuthorityWorkOnlyBucketNote(author, selectedWork),
    ),
    renderAuthorityBucketButton(
      "Pseudo-passage",
      selectedWork.locator_bucket_counts.pseudo_passage,
      (resolvedNodeId || "") === makeAuthorityNodeId("pseudo_passage"),
      makeAuthorityNodeId("pseudo_passage"),
      selectedWork.locator_bucket_counts.pseudo_passage ? "is-warning" : "is-muted",
      false,
      getAuthorityPseudoPassageBucketNote(author, selectedWork),
    ),
  ].join("");

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
  await ensureAuthorityWorksTreeLoaded(author);
  const occurrence = getCurrentAuthorityCommentaryStageOccurrences(author)
    .find((item) => makeAuthorityOccurrenceKey(item) === state.activeAuthorityOccurrenceKey)
    || findAuthorityOccurrenceByKey(author, state.activeAuthorityOccurrenceKey);
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
        state.activeAuthorityOccurrenceKey = null;
        state.activeAuthoritySourceExpanded = false;
        renderFigurePanel();
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
        scrollToRecordsSection();
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
  return lociPanel.renderRecurrencePanel(payload);
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
      scrollToRecordsSection();
      return;
    }
    if (result.sourceLayer === "line_text") {
      scrollToCoverageSection();
      return;
    }
    const focused = await focusSearchResultRecord(result);
    if (!focused) {
      scrollToRecordsSection();
    }
    return;
  }
  await loadSample(result.sampleId);
  clearSearchPresentation({
    preserveHighlights: true,
    preserveStatus: true,
  });
  scrollToRecordsSection();
}

function buildSearchResultHref(result) {
  if (!result?.sampleId) {
    return "#";
  }
  const targetHash = isApprovedUiEasterEggLine(result.sampleId, result.lineNumber)
    ? "records-section"
    : (result.sourceLayer === "line_text" ? "coverage-section" : "records-section");
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
  scrollToRecordsSection();
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
  const labels = {
    ready: "Ready",
    ready_with_caveat: "Ready",
    partial: "Ready",
    review_first: "Ready",
  };
  return labels[status] || status || "Unknown";
}

function getAuthorityWorkLayerLabel(author) {
  const chooseText = (en, zh) => (state.uiLanguage === "en" ? en : zh);
  const mode = String(author?.works_layer_mode || "").trim();
  const labels = {
    works_tree: chooseText("Works Tree", "Works Tree"),
    flat_work_overview: chooseText("Flat Work Overview", "Flat Work Overview"),
    no_work_layer: chooseText("Curated Work Layer", "Curated Work Layer"),
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
  syncCompareHeadActions();
  state.activeSemanticField = null;
  syncCoverageSelection();
  pinSelectedCoverageRow(lineNumber);

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
  elements.coverageList.scrollTo({
    top: Math.max(0, row.offsetTop - offset),
    behavior: "smooth",
  });
}

function renderLineRecords(payload) {
  return recordsPanel.renderLineRecords(payload);
}

function renderLineContext(payload) {
  const lineMarkup = payload.line_text
    ? renderSelectableLineMarkup(payload)
    : "No base text captured for this line.";

  elements.lineContext.innerHTML = `
    <strong>Line ${payload.line_number}</strong>
    <div class="current-line-text line-locus-stream">${lineMarkup}</div>
    ${choose(
      `This line currently carries <strong>${payload.coverage_count}</strong> commentary records. The cards below include both single-line notes and records whose spans extend across multiple lines.`,
      `当前对应 <strong>${payload.coverage_count}</strong> 条 commentary records。下面展示的是所有覆盖到该行的记录，包含单行注释和跨多行的 span 注释。`
    )}
  `;

  const approvedUiPilot = getApprovedUiEasterEggPilotForLine(state.currentSampleEntry?.id || state.overview?.sample, payload.line_number);
  if (approvedUiPilot) {
    ensureApprovedUiEasterEggOverlay(approvedUiPilot.effect);
    requestAnimationFrame(() => {
      maybeTriggerApprovedUiEasterEgg("line-render");
    });
  }

  elements.lineContext.querySelectorAll("[data-line-locus-id]").forEach((button) => {
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

  const { suppressCoverageScroll = false } = options || {};

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
  const tokenPattern = /[A-Za-zÀ-ÖØ-öø-ÿ']+/g;
  let cursor = 0;
  let locusIndex = 0;
  let markup = "";

  for (const match of text.matchAll(tokenPattern)) {
    markup += escapeHtml(text.slice(cursor, match.index));
    const locus = loci[locusIndex];
    if (isLocusSelectableInWorkbench(locus)) {
      markup += `
        <button
          type="button"
          class="line-locus-token is-selectable ${activeLocusId === locus.id ? "is-active" : ""}"
          ${dataAttribute}="${locus.id}">
          ${escapeHtml(locus.surface_form)}
        </button>
      `;
    } else {
      markup += `<span class="line-locus-token is-stopword">${escapeHtml(locus?.surface_form || match[0])}</span>`;
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
        <span class="analysis-label">Commentary Terms</span>
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
    scrollToSemanticPanel();
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
  if (elements.sortDirection) {
    elements.sortDirection.textContent = getUiText(state.sortDirection === "asc" ? "records.sort.asc" : "records.sort.desc");
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
  scrollToRecordsSection();

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
  entries
    .sort((left, right) => left.priority - right.priority || right.term.length - left.term.length)
    .forEach((entry) => {
      if (!classMap.has(entry.normalized)) {
        classMap.set(entry.normalized, entry.className);
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
    result += `<mark class="${escapeHtml(markerClass)}">${escapeHtml(term)}</mark>`;
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

function normalizeAuthorityHighlightTerm(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const AUTHORITY_WORK_CONNECTORS = new Set(["de", "del", "della", "delle", "dei", "di", "of", "the"]);
const AUTHORITY_RISKY_WORK_SINGLETONS = new Set(["leggi", "laws", "repubblica", "republic", "ars", "fasti"]);

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

function hasBookishRiskyWorkContext(text, row, term) {
  if (!isRiskySingletonWorkSurfaceTerm(term)) {
    return true;
  }
  const normalizedSource = String(text || "").toLowerCase();
  const authorTerms = getAuthorityTermsForAuthorId(row?.author_id)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => item.length >= 4);
  if (authorTerms.some((item) => normalizedSource.includes(item.toLowerCase()))) {
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
      if (!hasBookishRiskyWorkContext(source, row, label)) {
        return;
      }
      seen.add(normalized);
      acceptedTerms.push(label);
    });
  });

  return acceptedTerms.sort((left, right) => right.length - left.length);
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
    (row?.raw_surfaces || []).forEach((surface) => {
      const label = String(surface || "").trim();
      const normalized = normalizeAuthorityHighlightTerm(label);
      if (!label || !normalized || seen.has(normalized)) {
        return;
      }
      if (!normalizedSource.includes(normalized)) {
        return;
      }
      seen.add(normalized);
      acceptedTerms.push(label);
    });
  });

  return acceptedTerms.sort((left, right) => right.length - left.length);
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
  const slug = slugifyAuthorityStaticSegment(pageSlug || "");
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
    const row = resolveAuthorityHighlightWork(term);
    if (row?.author_id && row?.canonical_work) {
      await openAuthorityWorkFromHighlight(row.author_id, row.canonical_work);
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
  const stableWorkTerms = collectAuthorityWorkHighlightTermsForRecord(text, record, "stable");
  const caveatedWorkTerms = collectAuthorityWorkHighlightTermsForRecord(text, record, "caveated");
  const highlightGroups = [
    {
      terms: filterAuthorityHighlightTermsForText(text, groups.author_terms_stable || []),
      className: "authority-hit-author",
    },
    {
      terms: stableWorkTerms.length ? stableWorkTerms : collectAuthorityWorkHighlightTermsForText(text, "stable"),
      className: "authority-hit-work",
    },
    {
      terms: filterAuthorityHighlightTermsForText(text, groups.author_terms_caveated || []),
      className: "authority-hit-author-caveated",
    },
    {
      terms: caveatedWorkTerms.length ? caveatedWorkTerms : collectAuthorityWorkHighlightTermsForText(text, "caveated"),
      className: "authority-hit-work-caveated",
    },
    {
      terms: filterAuthorityHighlightTermsForText(text, groups.personaggio_poem_terms_stable || []),
      className: "authority-hit-personaggio",
    },
  ];

  if (includePersonaggioCueTerms) {
    highlightGroups.push({
      terms: filterAuthorityHighlightTermsForText(text, groups.personaggio_poem_terms_cue || []),
      className: "authority-hit-personaggio-cue",
    });
  }

  if (includePersonaggioCaveatedTerms) {
    highlightGroups.push({
      terms: filterAuthorityHighlightTermsForText(text, groups.personaggio_poem_terms_caveated || []),
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
    .map((term) => escapeRegExp(term));

  if (!escapedTerms.length) {
    return null;
  }

  return new RegExp(`(^|[^\\p{L}\\p{M}])(${escapedTerms.join("|")})(?=$|[^\\p{L}\\p{M}])`, "giu");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
        ? payload.top_commentary_terms_note
        : "Runtime-generated line-span-weighted lexical contour across this line's commentary.")
      
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
