// Reference-only contract scaffold.
// This file is intentionally NOT loaded by index.html at runtime.
// It exists to document module ownership and phase boundaries for threads.

export const APP_SHELL_MODULES = Object.freeze([
  {
    id: "core.app-shell",
    owner: "main",
    phase: "A",
    dependsOn: [],
    purpose: "Bootstrap, shared routing, and top-level orchestration.",
  },
  {
    id: "core.state",
    owner: "main",
    phase: "B",
    dependsOn: ["core.app-shell"],
    purpose: "Shared runtime state and cache registry.",
  },
  {
    id: "core.dom",
    owner: "main",
    phase: "B",
    dependsOn: ["core.app-shell"],
    purpose: "Stable DOM hook lookup and shell-level element access.",
  },
  {
    id: "core.loaders",
    owner: "main",
    phase: "B",
    dependsOn: ["core.state"],
    purpose: "Manifest, overview, line payload, record-store, authority, search, and loci loaders.",
  },
  {
    id: "core.routing",
    owner: "main",
    phase: "B",
    dependsOn: ["core.state"],
    purpose: "URL query params, sample/line/locus jump helpers, and permalink contract.",
  },
  {
    id: "panels.coverage",
    owner: "ui",
    phase: "C",
    dependsOn: ["core.dom", "core.state", "core.routing"],
    purpose: "Coverage list rendering and line selection shell.",
  },
  {
    id: "panels.records",
    owner: "main",
    phase: "D",
    dependsOn: ["core.dom", "core.state", "core.loaders"],
    purpose: "Close reading cards, compare pinning, full text expansion, and sort/filter pipeline.",
  },
  {
    id: "panels.semantic-fields",
    owner: "main",
    phase: "D",
    dependsOn: ["core.state", "panels.records"],
    purpose: "Semantic field rendering and record-level filter state.",
  },
  {
    id: "panels.loci-vocabulary",
    owner: "main",
    phase: "D",
    dependsOn: ["core.state", "core.loaders", "panels.records"],
    purpose: "Dante loci selection, occurrence explorer, contrastive vocabulary, and family pilot.",
  },
  {
    id: "panels.recurrence",
    owner: "main",
    phase: "D",
    dependsOn: ["core.state", "panels.loci-vocabulary", "panels.semantic-fields"],
    purpose: "Candidate recurrence / echo hints and jump-back integration.",
  },
  {
    id: "panels.figure-navigation",
    owner: "ui",
    phase: "C",
    dependsOn: ["core.state", "core.loaders"],
    purpose: "Figure lens and figure-to-line navigation shell.",
  },
  {
    id: "panels.authority-lens",
    owner: "authority",
    phase: "C",
    dependsOn: ["core.state", "core.loaders"],
    purpose: "Authority lens bridge over authority layer, works trees, and commentary sources.",
  },
  {
    id: "panels.search-bridge",
    owner: "search",
    phase: "C",
    dependsOn: ["core.state", "core.loaders", "core.routing"],
    purpose: "Quick jump, token search, shard loading, and result hydration.",
  },
  {
    id: "panels.help-system",
    owner: "ui",
    phase: "C",
    dependsOn: ["core.dom"],
    purpose: "Help overlays, guide hooks, and explanatory affordances.",
  },
]);

export const MODULE_OWNER_LABELS = Object.freeze({
  main: "Main Shell",
  authority: "Authority Thread",
  search: "Search Thread",
  ui: "UI Thread",
});

export function getModuleDescriptor(moduleId) {
  return APP_SHELL_MODULES.find((item) => item.id === moduleId) || null;
}

export function listModulesByOwner(owner) {
  return APP_SHELL_MODULES.filter((item) => item.owner === owner);
}

export function listModulesByPhase(phase) {
  return APP_SHELL_MODULES.filter((item) => item.phase === phase);
}
