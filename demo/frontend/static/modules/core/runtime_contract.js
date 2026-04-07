// Reference-only contract scaffold.
// This file is intentionally NOT loaded by index.html at runtime.
// It records stable field contracts and path builders for human/thread alignment.

export const STABLE_MANIFEST_FIELDS = Object.freeze([
  "id",
  "title",
  "cantica",
  "canto",
  "status",
  "modules",
  "overview_available",
  "overview_path",
  "line_data_available",
  "line_data_path",
  "record_store_available",
  "record_store_index_path",
  "record_store_path",
  "record_fulltext_available",
  "record_fulltext_path",
]);

export const STABLE_LINE_PAYLOAD_FIELDS = Object.freeze([
  "schema_version",
  "sample",
  "line_number",
  "line_text",
  "coverage_count",
  "signature_terms",
  "record_ids",
  "semantic_fields",
  "dante_loci",
  "future_hooks",
]);

export const STABLE_RECORD_STORE_FIELDS = Object.freeze([
  "schema_version",
  "sample",
  "record_count",
  "records",
]);

export const SAMPLE_CACHE_KEYS = Object.freeze({
  lineCache: "lineCache",
  sampleRecordStoreCache: "sampleRecordStoreCache",
  sampleFullTextStoreCache: "sampleFullTextStoreCache",
  semanticCache: "semanticCache",
  authorityWorksTreeCache: "authorityWorksTreeCache",
  authorityCommentarySourceCache: "authorityCommentarySourceCache",
  danteWordProfileCache: "danteWordProfileCache",
  fullTextCache: "fullTextCache",
});

export const JUMP_CONTRACT = Object.freeze({
  loadSample: "loadSample(sampleId)",
  selectLine: "selectLine(lineNumber)",
  jumpToSampleLine: "jumpToSampleLine(sampleId, lineNumber, locusNormalized = null, options = {})",
});

export function buildSampleRecordStorePaths(sampleId) {
  return {
    indexPath: `./data/${sampleId}/records/index.json`,
    storePath: `./data/${sampleId}/records/store.json`,
  };
}

export function buildSampleFullTextStorePath(sampleId) {
  return `./data/${sampleId}/records/fulltext.json`;
}

export function buildLinePayloadPath(sampleId, lineNumber) {
  const filename = String(lineNumber).padStart(3, "0");
  return `./data/${sampleId}/lines/${filename}.json`;
}
