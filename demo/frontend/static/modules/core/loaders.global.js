(function attachDDPLoaders(global) {
  function createShellLoaders(deps) {
    const { state, config, mergeSearchIndexShards } = deps;

    async function fetchJson(path) {
      const resolvedPath = path.startsWith("./data/")
        ? config.DATA_BASE + path.slice(6)
        : path;
      const response = await fetch(resolvedPath);
      if (!response.ok) {
        throw new Error(`Failed to load ${resolvedPath}: ${response.status}`);
      }
      return response.json();
    }

    function getRecordStoreMeta(sampleId) {
      const entry = state.manifestMap.get(sampleId);
      if (!entry) {
        return null;
      }
      return {
        sampleId,
        available: Boolean(
          entry.record_store_available
          || entry.record_store_path
          || entry.record_store_index_path
          || entry.line_data_available
          || entry.overview_available
        ),
        indexPath: entry.record_store_index_path || `./data/${sampleId}/records/index.json`,
        storePath: entry.record_store_path || `./data/${sampleId}/records/store.json`,
      };
    }

    function getFullTextStoreMeta(sampleId) {
      const entry = state.manifestMap.get(sampleId);
      if (!entry) {
        return null;
      }
      return {
        sampleId,
        available: entry.record_fulltext_available ?? Boolean(entry.record_store_available),
        storePath: entry.record_fulltext_path || `./data/${sampleId}/records/fulltext.json`,
      };
    }

    function getRecordSummaryStoreMeta(sampleId) {
      const entry = state.manifestMap.get(sampleId);
      if (!entry) {
        return null;
      }
      return {
        sampleId,
        available: true,
        storePath: `./data/${sampleId}/records/summaries.json`,
      };
    }

    function getRecordWorkMentionStoreMeta(sampleId) {
      const entry = state.manifestMap.get(sampleId);
      if (!entry) {
        return null;
      }
      return {
        sampleId,
        available: true,
        storePath: `./data/${sampleId}/records/work_mentions.json`,
      };
    }

    function getAuthorityCantoIndexMeta(sampleId) {
      const entry = state.manifestMap.get(sampleId);
      if (!entry) {
        return null;
      }
      return {
        sampleId,
        available: true,
        storePath: `./data/${sampleId}/records/authority_canto_index.json`,
      };
    }

    async function ensureSampleAuthorityCantoIndexLoaded(sampleId = state.currentSampleEntry?.id) {
      if (!sampleId) {
        return null;
      }
      if (state.sampleAuthorityCantoIndexCache.has(sampleId)) {
        return state.sampleAuthorityCantoIndexCache.get(sampleId);
      }

      const meta = getAuthorityCantoIndexMeta(sampleId);
      if (!meta?.available) {
        state.sampleAuthorityCantoIndexCache.set(sampleId, null);
        return null;
      }

      if (!state.sampleAuthorityCantoIndexPromises.has(sampleId)) {
        const request = fetchJson(meta.storePath)
          .then((payload) => {
            state.sampleAuthorityCantoIndexCache.set(sampleId, payload);
            return payload;
          })
          .catch(() => {
            state.sampleAuthorityCantoIndexCache.set(sampleId, null);
            return null;
          })
          .finally(() => {
            state.sampleAuthorityCantoIndexPromises.delete(sampleId);
          });
        state.sampleAuthorityCantoIndexPromises.set(sampleId, request);
      }
      return state.sampleAuthorityCantoIndexPromises.get(sampleId);
    }

    async function ensureSampleRecordWorkMentionStoreLoaded(sampleId = state.currentSampleEntry?.id) {
      if (!sampleId) {
        return null;
      }
      if (state.sampleRecordWorkMentionCache.has(sampleId)) {
        return state.sampleRecordWorkMentionCache.get(sampleId);
      }

      const meta = getRecordWorkMentionStoreMeta(sampleId);
      if (!meta?.available) {
        state.sampleRecordWorkMentionCache.set(sampleId, null);
        return null;
      }

      if (!state.sampleRecordWorkMentionPromises.has(sampleId)) {
        const request = fetchJson(meta.storePath)
          .then((payload) => {
            state.sampleRecordWorkMentionCache.set(sampleId, payload);
            mergeWorkMentionsIntoCachedStores(sampleId, payload);
            return payload;
          })
          .catch(() => {
            state.sampleRecordWorkMentionCache.set(sampleId, null);
            return null;
          })
          .finally(() => {
            state.sampleRecordWorkMentionPromises.delete(sampleId);
          });
        state.sampleRecordWorkMentionPromises.set(sampleId, request);
      }
      return state.sampleRecordWorkMentionPromises.get(sampleId);
    }

    function mergeWorkMentionsIntoRecordLikeStore(payload, mentionPayload) {
      if (!payload || !mentionPayload) {
        return payload;
      }
      const sourceRecords = payload.records || {};
      const mentionRecords = mentionPayload.records || {};
      if (!sourceRecords || !mentionRecords || typeof sourceRecords !== "object" || typeof mentionRecords !== "object") {
        return payload;
      }
      const mergedRecords = {};
      for (const [recordId, record] of Object.entries(sourceRecords)) {
        const mention = mentionRecords[recordId] || {};
        mergedRecords[recordId] = {
          ...record,
          raw_work_mentions: Array.isArray(mention.raw_work_mentions) ? mention.raw_work_mentions : [],
          raw_work_surface_count: Number.isFinite(mention.raw_work_surface_count) ? mention.raw_work_surface_count : 0,
          authority_author_facet_ids: Array.isArray(mention.authority_author_facet_ids) ? mention.authority_author_facet_ids : [],
          authority_work_facet_ids: Array.isArray(mention.authority_work_facet_ids) ? mention.authority_work_facet_ids : [],
          authority_authors: Array.isArray(mention.authority_authors) ? mention.authority_authors : [],
          authority_works: Array.isArray(mention.authority_works) ? mention.authority_works : [],
        };
      }
      return {
        ...payload,
        records: mergedRecords,
      };
    }

    function mergeWorkMentionsIntoCachedStores(sampleId, mentionPayload) {
      if (!sampleId || !mentionPayload) {
        return;
      }
      if (state.sampleRecordStoreCache.has(sampleId)) {
        state.sampleRecordStoreCache.set(
          sampleId,
          mergeWorkMentionsIntoRecordLikeStore(state.sampleRecordStoreCache.get(sampleId), mentionPayload)
        );
      }
      if (state.sampleFullTextStoreCache.has(sampleId)) {
        state.sampleFullTextStoreCache.set(
          sampleId,
          mergeWorkMentionsIntoRecordLikeStore(state.sampleFullTextStoreCache.get(sampleId), mentionPayload)
        );
      }
    }

    async function ensureSampleRecordStoreLoaded(sampleId = state.currentSampleEntry?.id) {
      if (!sampleId) {
        return null;
      }
      if (state.sampleRecordStoreCache.has(sampleId)) {
        return state.sampleRecordStoreCache.get(sampleId);
      }

      const meta = getRecordStoreMeta(sampleId);
      if (!meta?.available) {
        state.sampleRecordStoreCache.set(sampleId, null);
        return null;
      }

      if (!state.sampleRecordStorePromises.has(sampleId)) {
        const request = fetchJson(meta.storePath)
          .then((payload) => {
            const mentionPayload = state.sampleRecordWorkMentionCache.get(sampleId) || null;
            return mergeWorkMentionsIntoRecordLikeStore(payload, mentionPayload);
          })
          .then((payload) => {
            state.sampleRecordStoreCache.set(sampleId, payload);
            return payload;
          })
          .catch((error) => {
            state.sampleRecordStoreCache.delete(sampleId);
            throw error;
          })
          .finally(() => {
            state.sampleRecordStorePromises.delete(sampleId);
          });
        state.sampleRecordStorePromises.set(sampleId, request);
      }
      return state.sampleRecordStorePromises.get(sampleId);
    }

    async function ensureSampleFullTextStoreLoaded(sampleId = state.currentSampleEntry?.id) {
      if (!sampleId) {
        return null;
      }
      if (state.sampleFullTextStoreCache.has(sampleId)) {
        return state.sampleFullTextStoreCache.get(sampleId);
      }

      const meta = getFullTextStoreMeta(sampleId);
      if (!meta?.available) {
        state.sampleFullTextStoreCache.set(sampleId, null);
        return null;
      }

      if (!state.sampleFullTextStorePromises.has(sampleId)) {
        const request = fetchJson(meta.storePath)
          .then((payload) => {
            const mentionPayload = state.sampleRecordWorkMentionCache.get(sampleId) || null;
            return mergeWorkMentionsIntoRecordLikeStore(payload, mentionPayload);
          })
          .then((payload) => {
            state.sampleFullTextStoreCache.set(sampleId, payload);
            return payload;
          })
          .catch((error) => {
            state.sampleFullTextStoreCache.delete(sampleId);
            throw error;
          })
          .finally(() => {
            state.sampleFullTextStorePromises.delete(sampleId);
          });
        state.sampleFullTextStorePromises.set(sampleId, request);
      }
      return state.sampleFullTextStorePromises.get(sampleId);
    }

    async function ensureSampleRecordSummaryStoreLoaded(sampleId = state.currentSampleEntry?.id) {
      if (!sampleId) {
        return null;
      }
      if (state.sampleRecordSummaryStoreCache.has(sampleId)) {
        return state.sampleRecordSummaryStoreCache.get(sampleId);
      }

      const meta = getRecordSummaryStoreMeta(sampleId);
      if (!meta?.available) {
        state.sampleRecordSummaryStoreCache.set(sampleId, null);
        return null;
      }

      if (!state.sampleRecordSummaryStorePromises.has(sampleId)) {
        const request = fetchJson(meta.storePath)
          .then((payload) => {
            state.sampleRecordSummaryStoreCache.set(sampleId, payload);
            return payload;
          })
          .catch(() => {
            state.sampleRecordSummaryStoreCache.set(sampleId, null);
            return null;
          })
          .finally(() => {
            state.sampleRecordSummaryStorePromises.delete(sampleId);
          });
        state.sampleRecordSummaryStorePromises.set(sampleId, request);
      }
      return state.sampleRecordSummaryStorePromises.get(sampleId);
    }

    async function resolveLineRecords(sampleId, payload) {
      if (Array.isArray(payload?.records) && payload.records.length) {
        return payload.records;
      }
      const recordIds = Array.isArray(payload?.record_ids) ? payload.record_ids : [];
      if (!recordIds.length) {
        return [];
      }
      const recordStore = await ensureSampleRecordStoreLoaded(sampleId);
      const storeRecords = recordStore?.records || {};
      return recordIds
        .map((recordId) => storeRecords?.[recordId] || null)
        .filter(Boolean);
    }

    function mergeRecordSummariesIntoRecords(records, summaryPayload) {
      const summaryRecords = summaryPayload?.records || {};
      if (!summaryRecords || typeof summaryRecords !== "object") {
        return records;
      }
      return (records || []).map((record) => {
        const summary = summaryRecords?.[record?.id] || null;
        if (!summary) {
          return record;
        }
        return {
          ...record,
          one_line_summary: summary.one_line_summary || record.one_line_summary || "",
          summary_strategy: summary.strategy || record.summary_strategy || "",
          summary_confidence: Number.isFinite(summary.confidence) ? summary.confidence : (record.summary_confidence ?? null),
          semantic_heading: summary.semantic_heading || record.semantic_heading || "",
          semantic_gloss: summary.semantic_gloss || record.semantic_gloss || "",
          semantic_terms: Array.isArray(summary.semantic_terms) ? summary.semantic_terms : (record.semantic_terms || []),
        };
      });
    }

    async function hydrateLinePayload(sampleId, payload) {
      if (!payload) {
        return payload;
      }
      const records = await resolveLineRecords(sampleId, payload);
      const summaryPayload = state.sampleRecordSummaryStoreCache.get(sampleId) || null;
      const hydratedRecords = mergeRecordSummariesIntoRecords(records, summaryPayload);
      return {
        ...payload,
        record_ids: Array.isArray(payload.record_ids)
          ? payload.record_ids
          : hydratedRecords.map((record) => record.id),
        records: hydratedRecords,
      };
    }

    async function ensureAuthorityLayerLoaded() {
      if (state.authorityLayer) {
        return state.authorityLayer;
      }
      if (!state.authorityLayerPromise) {
        state.authorityLayerPromise = fetchJson("./data/authority_layer.json")
          .then((payload) => {
            state.authorityLayer = payload;
            return payload;
          })
          .catch((error) => {
            state.authorityLayer = null;
            throw error;
          })
          .finally(() => {
            state.authorityLayerPromise = null;
          });
      }
      return state.authorityLayerPromise;
    }

    async function ensureAuthorityCommentarySourcesLoaded() {
      if (state.authorityCommentarySources) {
        return state.authorityCommentarySources;
      }
      if (!state.authorityCommentarySourcesPromise) {
        state.authorityCommentarySourcesPromise = fetchJson("./data/authority_commentary_sources.json")
          .then((payload) => {
            state.authorityCommentarySources = payload;
            return payload;
          })
          .catch((error) => {
            state.authorityCommentarySources = null;
            throw error;
          })
          .finally(() => {
            state.authorityCommentarySourcesPromise = null;
          });
      }
      return state.authorityCommentarySourcesPromise;
    }

    async function ensureAuthorityHighlightLexiconLoaded() {
      if (state.authorityHighlightLexicon) {
        return state.authorityHighlightLexicon;
      }
      if (!state.authorityHighlightLexiconPromise) {
        state.authorityHighlightLexiconPromise = fetchJson("./data/authority_highlight_lexicon.json")
          .then((payload) => {
            state.authorityHighlightLexicon = payload;
            return payload;
          })
          .catch((error) => {
            state.authorityHighlightLexicon = null;
            throw error;
          })
          .finally(() => {
            state.authorityHighlightLexiconPromise = null;
          });
      }
      return state.authorityHighlightLexiconPromise;
    }

    async function ensureAuthorityPersonaggioScanLoaded() {
      if (state.authorityPersonaggioScan) {
        return state.authorityPersonaggioScan;
      }
      if (!state.authorityPersonaggioScanPromise) {
        state.authorityPersonaggioScanPromise = fetchJson("./data/authority_personaggio_full_scan.json")
          .then((payload) => {
            state.authorityPersonaggioScan = payload;
            return payload;
          })
          .catch((error) => {
            state.authorityPersonaggioScan = null;
            throw error;
          })
          .finally(() => {
            state.authorityPersonaggioScanPromise = null;
          });
      }
      return state.authorityPersonaggioScanPromise;
    }

    async function ensureAuthorityPersonaggioAliasAtlasLoaded() {
      if (state.authorityPersonaggioAliasAtlas) {
        return state.authorityPersonaggioAliasAtlas;
      }
      if (!state.authorityPersonaggioAliasAtlasPromise) {
        state.authorityPersonaggioAliasAtlasPromise = fetchJson("./data/authority_personaggio_alias_atlas.json")
          .then((payload) => {
            state.authorityPersonaggioAliasAtlas = payload;
            return payload;
          })
          .catch((error) => {
            state.authorityPersonaggioAliasAtlas = null;
            throw error;
          })
          .finally(() => {
            state.authorityPersonaggioAliasAtlasPromise = null;
          });
      }
      return state.authorityPersonaggioAliasAtlasPromise;
    }

    async function ensureAuthorityPersonaggioPoemAliasScanLoaded() {
      if (state.authorityPersonaggioPoemAliasScan) {
        return state.authorityPersonaggioPoemAliasScan;
      }
      if (!state.authorityPersonaggioPoemAliasScanPromise) {
        state.authorityPersonaggioPoemAliasScanPromise = fetchJson("./data/authority_personaggio_poem_alias_scan.json")
          .then((payload) => {
            state.authorityPersonaggioPoemAliasScan = payload;
            return payload;
          })
          .catch((error) => {
            state.authorityPersonaggioPoemAliasScan = null;
            throw error;
          })
          .finally(() => {
            state.authorityPersonaggioPoemAliasScanPromise = null;
          });
      }
      return state.authorityPersonaggioPoemAliasScanPromise;
    }

    async function ensureAuthorityCuratedRoomAnchorsLoaded() {
      if (state.authorityCuratedRoomAnchors) {
        return state.authorityCuratedRoomAnchors;
      }
      if (!state.authorityCuratedRoomAnchorsPromise) {
        state.authorityCuratedRoomAnchorsPromise = fetchJson("./data/authority_curated_room_anchors.json")
          .then((payload) => {
            state.authorityCuratedRoomAnchors = payload || { author_work_anchors: {}, work_branch_anchors: {} };
            return state.authorityCuratedRoomAnchors;
          })
          .catch(() => {
            state.authorityCuratedRoomAnchors = { author_work_anchors: {}, work_branch_anchors: {} };
            return state.authorityCuratedRoomAnchors;
          })
          .finally(() => {
            state.authorityCuratedRoomAnchorsPromise = null;
          });
      }
      return state.authorityCuratedRoomAnchorsPromise;
    }

    async function ensureVirgilioAppendixLedgerLoaded() {
      if (state.virgilioAppendixLedger) {
        return state.virgilioAppendixLedger;
      }
      if (!state.virgilioAppendixLedgerPromise) {
        state.virgilioAppendixLedgerPromise = fetchJson("./data/virgilio_appendix_ledger.json")
          .then((payload) => {
            state.virgilioAppendixLedger = payload;
            return payload;
          })
          .catch((error) => {
            state.virgilioAppendixLedger = null;
            throw error;
          })
          .finally(() => {
            state.virgilioAppendixLedgerPromise = null;
          });
      }
      return state.virgilioAppendixLedgerPromise;
    }

    async function ensureSearchIndexLoaded() {
      if (state.searchIndex) {
        return state.searchIndex;
      }
      if (!state.searchIndexPromise) {
        state.searchIndexPromise = fetchJson("./data/search/search_index.json")
          .then(async (payload) => {
            if (Array.isArray(payload?.shards) && payload.shards.length) {
              const shardPayloads = await Promise.all(
                payload.shards.map((shard) => fetchJson(shard.path))
              );
              state.searchIndex = mergeSearchIndexShards(payload, shardPayloads);
              return state.searchIndex;
            }
            state.searchIndex = payload;
            return payload;
          })
          .finally(() => {
            state.searchIndexPromise = null;
          });
      }
      return state.searchIndexPromise;
    }

    return Object.freeze({
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
    });
  }

  global.DDPLoaders = Object.freeze({
    createShellLoaders,
  });
})(window);
