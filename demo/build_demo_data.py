#!/usr/bin/env python3
"""Build a lightweight local dataset for the digital humanities demo."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import re
import shutil
import time
import unicodedata
import warnings
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import normalize


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DATA_DIR = ROOT / "data"
FRONTEND_DIR = ROOT / "demo" / "frontend"
DEMO_DATA_DIR = FRONTEND_DIR / "data"
REPORTS_DIR = FRONTEND_DIR / "reports"
THREAD_REVIEW_DIR = ROOT / "semantic_thread" / "review"
CROSS_CANTO_BASELINE_PATH = ROOT / "semantic_thread" / "cross_canto_line_similarity_baseline.json"
CROSS_CANTO_MAINLINE_PATH = ROOT / "semantic_thread" / "cross_canto_echoes_mainline.json"
LINE_ECHO_AXIS_PROFILE_PATH = ROOT / "semantic_thread" / "line_echo_axis_profile" / "line_echo_axis_profile.json"
AUTHORITY_FRONTEND_READY_DIR = ROOT / "authority" / "authority_extraction" / "output" / "frontend_ready"
AUTHORITY_COMMENTARY_SOURCES_PATH = DEMO_DATA_DIR / "authority_commentary_sources.json"
AUTHORITY_COMMENTARY_SOURCES_DIR = DEMO_DATA_DIR / "authority_commentary_sources"
AUTHORITY_COMMENTARY_LINE_INDEX_DIR = DEMO_DATA_DIR / "authority_commentary_lines"
AUTHORITY_NAVIGATION_MANIFEST_PATH = DEMO_DATA_DIR / "authority_navigation_manifest.json"
AUTHORITY_INDEX_PATH = DEMO_DATA_DIR / "authority_index.json"
AUTHORITY_AUTHOR_DETAIL_DIR = DEMO_DATA_DIR / "authority_authors"
AUTHORITY_FLAT_OBJECT_DATA_DIR = DEMO_DATA_DIR / "authority_flat_objects"
AUTHORITY_SPECIAL_OBJECT_DATA_DIR = DEMO_DATA_DIR / "authority_special_objects"
AUTHORITY_OCCURRENCE_SAMPLE_DIR = DEMO_DATA_DIR / "authority_occurrence_samples"
AUTHORITY_PARTIAL_TREE_DATA_DIR = DEMO_DATA_DIR / "authority_partial_trees"
DANTE_WORD_LOCI_LAYER_PATH = ROOT / "dante_loci" / "output" / "intermediate" / "dante_word_loci_layer.json"
DANTE_WORD_LOCI_SHARD_DIR = DEMO_DATA_DIR / "dante_word_loci"
AUTHORITY_WORKS_TREE_DATA_DIR = DEMO_DATA_DIR / "authority_works_trees"
CANONICAL_TEXT_BASE_PATH = ROOT / "dante_loci" / "source_texts" / "ddp_canonical_text_base.json"
AUTHORITY_TEXT_ALIAS_LEARNING_PATH = (
    ROOT / "authority" / "authority_extraction" / "output" / "alias_learning" / "commentary_alias_candidates_current10.json"
)
AUTHORITY_WORKS_TREE_DIR = ROOT / "authority" / "authority_extraction" / "output" / "frontend_ready"
PLATONE_WORK_CONTEXT_REVIEW_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_work_context_review.json"
PLATONE_TIMEO_LEGGI_CALIBRATION_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_timeo_leggi_calibration.json"
PLATONE_WORK_BUNDLE_REVIEW_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_work_bundle_review.json"
PLATONE_TIMEO_ANCHOR_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_timeo_anchor_hardening.json"
PLATONE_LEGGI_AFTER_TIMEO_RECHECK_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_leggi_after_timeo_recheck.json"
PLATONE_SECONDARY_BUNDLE_HOLD_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_secondary_bundle_hold.json"
PLATONE_ANCHOR_HARDENING_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_anchor_hardening_bundle.json"
TOMMASO_WORK_CONTEXT_REVIEW_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_work_context_review.json"
TOMMASO_WORK_BUNDLE_REVIEW_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_work_bundle_review.json"
TOMMASO_SUMMA_ANCHOR_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_summa_anchor_hardening.json"
TOMMASO_SUMMA_LOCATOR_CALIBRATION_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_summa_locator_calibration.json"
TOMMASO_SUMMA_PARTIAL_TREE_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_summa_partial_tree.json"
TOMMASO_SECONDARY_BUNDLE_HOLD_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_secondary_bundle_hold.json"
TOMMASO_ANCHOR_HARDENING_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_anchor_hardening_bundle.json"
AUGUSTINE_CITY_OF_GOD_PARTIAL_TREE_PATH = AUTHORITY_FRONTEND_READY_DIR / "augustine_city_of_god_partial_tree.json"
AUGUSTINE_WORK_PATTERN_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "augustine_work_pattern_bundle.json"
AUGUSTINE_CONFESSIONS_BRANCH_THICKENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "augustine_confessions_branch_thickening.json"
AUGUSTINE_CONFESSIONS_BRANCH_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "augustine_confessions_branch_hardening.json"
CICERO_WORK_BRANCH_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "cicero_work_branch_bundle.json"
CICERO_BRANCH_HARDENING_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "cicero_branch_hardening_bundle.json"
PLATONE_WORK_BRANCH_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_work_branch_bundle.json"
OVID_METAMORPHOSES_BACKBONE_PATH = AUTHORITY_FRONTEND_READY_DIR / "ovid_metamorphoses_backbone.json"
OVID_SECONDARY_WORKS_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "ovid_secondary_works_hardening.json"
AUTHORITY_EXPLICIT_WORK_BOOK_SIGNAL_BUNDLE_PATH = AUTHORITY_FRONTEND_READY_DIR / "authority_explicit_work_book_signal_bundle.json"
SENECA_EPISTULAE_BRANCH_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "seneca_epistulae_branch_hardening.json"
BOETHIUS_CONSOLATION_BRANCH_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "boethius_consolation_branch_hardening.json"
ARISTOTLE_DE_ANIMA_DEPTH_AUDIT_PATH = AUTHORITY_FRONTEND_READY_DIR / "aristotle_de_anima_depth_audit.json"
PAUL_CORINTHIANS_AMBIGUITY_HOLD_PATH = AUTHORITY_FRONTEND_READY_DIR / "paul_corinthians_ambiguity_hold.json"
VIRGIL_AENEID_BACKBONE_HARDENING_PATH = AUTHORITY_FRONTEND_READY_DIR / "virgil_aeneid_backbone_hardening.json"
AUGUSTINE_CONFESSIONS_WAVE2_READINESS_PATH = AUTHORITY_FRONTEND_READY_DIR / "augustine_confessions_wave2_readiness.json"
TOMMASO_SUMMA_WAVE2_PART_SPINE_PATH = AUTHORITY_FRONTEND_READY_DIR / "tommaso_summa_wave2_part_spine.json"
CICERO_WAVE2_NORMALIZATION_PATH = AUTHORITY_FRONTEND_READY_DIR / "cicero_wave2_normalization.json"
SENECA_EPISTULAE_WAVE2_SPINE_PATH = AUTHORITY_FRONTEND_READY_DIR / "seneca_epistulae_wave2_spine.json"
BOETHIUS_CONSOLATION_WAVE2_SPINE_PATH = AUTHORITY_FRONTEND_READY_DIR / "boethius_consolation_wave2_spine.json"
ARISTOTLE_WAVE3_BOOK_SPINE_PATH = AUTHORITY_FRONTEND_READY_DIR / "aristotle_wave3_book_spine.json"
PAUL_WAVE3_EPISTLE_SPINE_PATH = AUTHORITY_FRONTEND_READY_DIR / "paul_wave3_epistle_spine.json"
VIRGIL_WAVE3_SECONDARY_BACKBONE_PATH = AUTHORITY_FRONTEND_READY_DIR / "virgil_wave3_secondary_backbone.json"
STATIUS_WAVE3_THEBAID_NORMALIZATION_PATH = AUTHORITY_FRONTEND_READY_DIR / "statius_wave3_thebaid_normalization.json"
PLATONE_WAVE3_SECONDARY_WORK_RECHECK_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_wave3_secondary_work_recheck.json"
ARISTOTLE_WAVE4_POETICS_DE_ANIMA_PATH = AUTHORITY_FRONTEND_READY_DIR / "aristotle_wave4_poetics_de_anima.json"
PAUL_WAVE4_ROMANS_SECOND_CORINTHIANS_PATH = AUTHORITY_FRONTEND_READY_DIR / "paul_wave4_romans_second_corinthians.json"
VIRGIL_WAVE4_ECLOGUES_PATH = AUTHORITY_FRONTEND_READY_DIR / "virgil_wave4_eclogues.json"
STATIUS_WAVE4_ACHILLEID_PATH = AUTHORITY_FRONTEND_READY_DIR / "statius_wave4_achilleid.json"
PLATONE_WAVE4_TIMEO_LEGGI_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_wave4_timeo_leggi.json"
ARISTOTLE_WAVE5_METAPHYSICS_NICOMACHEAN_PATH = AUTHORITY_FRONTEND_READY_DIR / "aristotle_wave5_metaphysics_nicomachean.json"
PAUL_WAVE5_FIRST_CORINTHIANS_AMBIGUOUS_PATH = AUTHORITY_FRONTEND_READY_DIR / "paul_wave5_first_corinthians_ambiguous.json"
VIRGIL_WAVE5_GEORGICS_PATH = AUTHORITY_FRONTEND_READY_DIR / "virgil_wave5_georgics.json"
STATIUS_WAVE5_THEBAID_PATH = AUTHORITY_FRONTEND_READY_DIR / "statius_wave5_thebaid.json"
PLATONE_WAVE5_REPUBLIC_PATH = AUTHORITY_FRONTEND_READY_DIR / "platone_wave5_republic.json"

AUTHORITY_TEXT_MATCH_POLICY = {
    "virgil": {
        "extra_aliases": ["virgilio", "virgil", "vergilio", "vergilius"],
        "exclude_aliases": ["maro", "virg.", "verg."],
        "fuzzy_roots": ["virgil", "vergili"],
    },
    "aristotle": {
        "extra_aliases": ["aristotile", "aristotele", "aristoteles", "aristotle"],
        "exclude_aliases": ["arist.", "philosophus", "phylosophus", "il filosofo"],
        "fuzzy_roots": ["aristot"],
    },
    "platone": {
        "extra_aliases": ["platone", "plato", "platonis"],
        "exclude_aliases": [],
        "fuzzy_roots": ["platon"],
    },
    "tommaso_daquino": {
        "extra_aliases": ["thomas", "tommaso", "aquinate", "san tommaso", "santo tommaso"],
        "exclude_aliases": [],
        "fuzzy_roots": ["thom", "tommas", "aquinat"],
    },
    "ovid": {
        "extra_aliases": ["ovidio", "ovidius"],
        "exclude_aliases": ["ov.", "naso"],
        "fuzzy_roots": ["ovidi"],
    },
    "paul_the_apostle": {
        "extra_aliases": ["paolo", "san paolo", "apostolo", "apostolus", "paulus", "vas d'elezione", "vas delezione"],
        "exclude_aliases": [],
        "fuzzy_roots": ["paol", "paul"],
    },
    "augustine": {
        "extra_aliases": ["augustin", "augustino", "augustinus", "agostino"],
        "exclude_aliases": ["aug."],
        "fuzzy_roots": ["augustin", "agostin"],
    },
    "psalmist": {
        "extra_aliases": ["psalmista", "salmo", "salmi", "psalmo", "psalmi", "david"],
        "exclude_aliases": [],
        "fuzzy_roots": [],
    },
    "moses": {
        "extra_aliases": ["mosè", "moyses", "moses propheta"],
        "exclude_aliases": [],
        "fuzzy_roots": ["mos", "moys"],
    },
    "isaiah": {
        "extra_aliases": ["isaia", "esaias", "isaia propheta"],
        "exclude_aliases": [],
        "fuzzy_roots": ["isai", "esai"],
    },
    "matthew": {
        "extra_aliases": ["matteo evangelista", "matthaeus", "evangelista matteo"],
        "exclude_aliases": ["matteo"],
        "fuzzy_roots": ["matthae"],
    },
    "mark": {
        "extra_aliases": ["marco evangelista", "marcus evangelista", "evangelista marco"],
        "exclude_aliases": ["marco"],
        "fuzzy_roots": ["marcus"],
    },
    "luke": {
        "extra_aliases": ["luca evangelista", "lucas evangelista", "evangelista luca"],
        "exclude_aliases": ["luca"],
        "fuzzy_roots": ["lucas"],
    },
    "john_the_evangelist": {
        "extra_aliases": ["giovanni evangelista", "ioannes evangelista", "evangelista giovanni"],
        "exclude_aliases": ["giovanni"],
        "fuzzy_roots": ["ioann", "johann", "evangelist"],
    },
    "seneca": {
        "extra_aliases": ["seneca"],
        "exclude_aliases": ["senec."],
        "fuzzy_roots": ["senec"],
    },
    "cicero": {
        "extra_aliases": ["cicero", "cicerone", "tullio", "tullius", "tulio"],
        "exclude_aliases": ["cic.", "cicer.", "tul."],
        "fuzzy_roots": ["cicer", "tuli", "tulli"],
    },
    "boethius": {
        "extra_aliases": ["boezio", "boetio", "boethius", "boetius"],
        "exclude_aliases": ["boet."],
        "fuzzy_roots": ["boezi", "boeti", "boethi"],
    },
    "statius": {
        "extra_aliases": ["stazio", "statius"],
        "exclude_aliases": ["stat."],
        "fuzzy_roots": ["stazi", "statiu"],
    },
    "dante": {
        "extra_aliases": ["dante", "dante alighieri", "dantes"],
        "exclude_aliases": ["autore", "poeta", "dant."],
        "fuzzy_roots": ["dant"],
    },
}

AUTHORITY_OBJECT_ROLLOUT_POLICY = {
    "aristotle": {
        "object_rollout_status": "ready",
        "entry_mode": "works_tree",
        "works_layer_mode": "works_tree",
        "works_layer_note": "Aristotle 当前已有完整 works tree，可继续按 structured_passage / prose_locator / work_only / pseudo_passage 下钻。",
    },
    "paul_the_apostle": {
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "works_tree",
        "works_layer_mode": "works_tree",
        "works_layer_note": "Paul 当前已有 scriptural-epistolary works tree，但 Corinthians ambiguity 仍需可见 caveat。",
    },
    "psalmist": {
        "object_rollout_status": "ready",
        "entry_mode": "works_tree",
        "works_layer_mode": "works_tree",
        "works_layer_note": "Psalmist 当前已有 scriptural-psalmic works tree，可按 Psalm number / Verse 继续下钻。",
    },
    "moses": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Mosè 现在进入完成态 authority 宇宙：注释里的 Pentateuch citations 已经足够频繁，Genesis / Exodus / Leviticus / Numbers / Deuteronomy 应该作为 scriptural work surfaces 可见，而不是继续留在宇宙外。",
        "works_layer_note": "Mosè 当前以前台 completed scriptural authority room 打开：先让 Pentateuch 的 citation traffic 和 doctrine-history pressure 站住，再慢慢决定是否 productize 成更细的 scriptural branch tree。",
    },
    "isaiah": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Isaia 现在进入完成态 authority 宇宙：prophetic citations 已经足够常见，Book of Isaiah 不该继续留在 authority 外部。",
        "works_layer_note": "Isaia 当前以前台 completed prophetic authority room 打开：先让 prophetic citation traffic 站住，再慢慢细化到更具体的 chapter/vision lanes。",
    },
    "matthew": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Matteo Evangelista 现在进入完成态 authority 宇宙：Matt./Matth. 这类 gospel citations 已经足够频繁，不应继续留在 authority 外部。",
        "works_layer_note": "Matteo Evangelista 当前以前台 completed gospel authority room 打开：先让 Gospel of Matthew 的 citation traffic 可见，再决定是否做更细的 pericope tree。",
    },
    "mark": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Marco Evangelista 现在进入完成态 authority 宇宙：Marc. 这类 gospel citations 已经足够频繁，不应继续留在 authority 外部。",
        "works_layer_note": "Marco Evangelista 当前以前台 completed gospel authority room 打开：先让 Gospel of Mark 的 citation traffic 可见，再决定是否做更细的 pericope tree。",
    },
    "luke": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Luca Evangelista 现在进入完成态 authority 宇宙：Luc./Lk. citations 已经足够稳定，Gospel of Luke 与 Acts 不该继续留在 authority 外部。",
        "works_layer_note": "Luca Evangelista 当前以前台 completed gospel authority room 打开：先让 Gospel of Luke / Acts 的 citation traffic 可见，再决定是否做更细的 scriptural branch tree。",
    },
    "john_the_evangelist": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Giovanni Evangelista 现在进入完成态 authority 宇宙：Ioan./Joh./Jn. 这类 Johannine citations 已经足够频繁，Gospel of John 与 Apocalypse 不该继续留在 authority 外部。",
        "works_layer_note": "Giovanni Evangelista 当前以前台 completed Johannine authority room 打开：先让 Gospel of John / Apocalypse 的 citation traffic 可见，再决定是否做更细的 scriptural branch tree。",
    },
    "virgil": {
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_special_case",
        "works_layer_mode": "no_works_tree",
        "works_layer_note": "Virgilio 当前不走 works tree，而是保留 author / character special-case 的 author-layer 入口。",
    },
    "augustine": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Agostino 现在已经不只是 partial 试探层：De civitate Dei 的 partial tree 和 Confessiones 的 candidate clusters 已经足够让前台把他当成 ready-with-caveat 的 patristic work overview；但 passage judgement 和 patristic locator 仍需继续校准。",
        "works_layer_note": "Agostino 当前开放 ready-with-caveat 的 work overview：以 De civitate Dei 的 partial tree 为主轴，Confessiones 作为较薄但真实的第二工作束；仍不要假装成完整 patristic works tree。",
        "caveat_flags": ["no_full_works_tree_yet", "patristic_locator_not_calibrated"],
    },
    "cicero": {
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "works_layer_note": "Cicero 当前适合进入 author/commentary/work overview 层，并可沿 occurrence 打开注释原文；但还不应伪装成完整 works tree。",
    },
    "platone": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Platone 现在已经可以以前台 ready-with-caveat 的 flat-work author 出现：Timeo 和 Leggi 已经形成稳定双锚，Repubblica 也能作为可见但受控的次级 work 保留；但仍不应伪装成完整的 Platonic works tree。",
        "works_layer_note": "Platone 当前开放 ready-with-caveat 的 flat-work overview：Timeo 为 primary anchor，Leggi 为受 caveat 约束的第二 anchor，Repubblica / Fedone / Simposio 保持可见的次级束，但不要强行 tree 化。",
        "caveat_flags": ["partial_flat_work_object", "platonic_work_contexts_not_fully_normalized", "leggi_anchor_is_mediated_and_caveated"],
    },
    "tommaso_daquino": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Tommaso d'Aquino 现在已经可以作为 ready-with-caveat 的 scholastic work overview 前台出现：Summa theologiae 不只是 anchor preview，而是带着真实 locator / part / question / article 压力的主轴；但整个 Thomistic corpus 仍然不该被过早伪装成完整 works tree。",
        "works_layer_note": "Tommaso d'Aquino 当前开放 ready-with-caveat 的 scholastic ecosystem：以 Summa theologiae 为主轴，同时保留 Contra Gentiles / Sentences / Quaestio de anima 的次级束；允许更深的部分下钻，但仍不要把整个 Thomistic corpus tree 化。",
        "caveat_flags": ["partial_flat_work_object", "scholastic_work_contexts_not_yet_normalized", "summa_anchor_ready_not_tree"],
    },
    "statius": {
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_special_case_candidate",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Thebaid / Achilleid work distribution is usable, but Statius should not be treated as a purely flat author object: from Purgatorio 21 onward he becomes a controlled author/character special-case candidate.",
        "works_layer_note": "Statius 当前可以进入 author/commentary/work overview 层，并可沿 occurrence 打开注释原文；但从 Purgatorio 21 起必须保留作者 / personaggio 双重身份的 caveat，不能像普通 flat-work author 那样无差别前推。",
        "caveat_flags": ["special_case_not_yet_modeled_from_purgatorio21_onward"],
    },
    "isidoro": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Isidoro 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：patristic authority traffic 和本地 commentary line 支撑都已经足够稳定；但 focused patristic work-context pass 还没厚到可以安全开放 works layer。",
        "works_layer_note": "Isidoro 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 patristic authority 和记忆中的 source pressure 站住，再做更细的 patristic works layer。",
        "caveat_flags": ["patristic_work_context_not_yet_productized"],
    },
    "giovenale": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Giovenale 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：Juvenalian authority traffic 与本地 commentary-line coverage 已经足够稳定；但缩写引用形式和 satire-specific work-context 仍需先保守处理。",
        "works_layer_note": "Giovenale 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 satiric authority pressure 可见，再做更细的 Juvenalian work layer。",
        "caveat_flags": ["juvenalian_alias_cleanup_pending", "satiric_work_context_not_yet_productized"],
    },
    "servio": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Servio 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：Servian commentarial authority 与本地 commentary-line coverage 已经可读；但 commentarial work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Servio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先保持 Servian commentary authority 的可见性，再做更细的 commentarial work-layer productization。",
        "caveat_flags": ["servian_commentarial_lanes_not_yet_productized"],
    },
    "galeno": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Galeno 现在已经可以作为 ready-with-caveat 的 medical-philosophical authority shell 前台出现：registry review 已经足够稳，但 work-context 仍然太薄，不应过早伪装成结构化 works layer。",
        "works_layer_note": "Galeno 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 medical-philosophical authority 站住，再慢慢做 work-context 的细化。",
        "caveat_flags": ["medical_philosophical_work_context_not_yet_productized"],
    },
    "girolamo": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Girolamo 现在已经可以作为 ready-with-caveat 的 Latin-patristic authority shell 前台出现：Jerome lane 已经 compact 且重复稳定，但 patristic work-context 还没厚到可以安全前推 works layer。",
        "works_layer_note": "Girolamo 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 Latin-patristic authority 与 commentary pressure 可见，再逐步做更细的 work-context。",
        "caveat_flags": ["patristic_work_context_not_yet_productized"],
    },
    "gregorio_magno": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Gregorio Magno 现在已经可以作为 ready-with-caveat 的 patristic authority shell 前台出现：Moralia-style lane 已经足够支撑 registry intake，但 bare Gregorio/Gregorius 仍需保留可见 caveat。",
        "works_layer_note": "Gregorio Magno 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 patristic authority 站住，同时保留 bare-name caveat，不要过早推成 works layer。",
        "caveat_flags": ["bare_name_caveat", "patristic_work_context_not_yet_productized"],
    },
    "averroe": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Averroè 现在已经可以作为 ready-with-caveat 的 philosophical-commentator shell 前台出现：registry intake 已经稳定站住，但 generic philosophical traffic 仍应保持次级，不要过早伪装成 works layer。",
        "works_layer_note": "Averroè 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 commentator-philosophical authority 可见，再慢慢整理更细的 work-context。",
        "caveat_flags": ["commentator_caveat", "philosophical_work_context_not_yet_productized"],
    },
    "avicenna": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Avicenna 现在已经可以作为 ready-with-caveat 的 philosophical-medical authority shell 前台出现：direct doctrinal lane 已经足够支撑 conservative intake，但 grouped scholastic / medical co-citation traffic 仍需保持可见 caveat。",
        "works_layer_note": "Avicenna 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 philosophical-medical authority 站住，同时保留 mixed-signal caveat，不要过早推成 works layer。",
        "caveat_flags": ["medical_philosophical_caveat", "mixed_signal_burden", "work_context_not_yet_productized"],
    },
    "san_pietro": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "San Pietro 现在已经可以作为 ready-with-caveat 的 apostolic authority shell 前台出现：apostolic lane 已经足够稳，但 bare Pietro 仍然需要保留可见的名字歧义 caveat。",
        "works_layer_note": "San Pietro 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 apostolic authority 与 Paradiso pressure 站住，同时继续保留 bare-name caveat。",
        "caveat_flags": ["bare_name_caveat", "apostolic_work_context_not_yet_productized"],
    },
    "hugo_of_st_victor": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Ugo di San Vittore 现在已经可以作为 ready-with-caveat 的 scholastic authority shell 前台出现：Hugo de Sancto Victore 这条 fuller-form lane 已经足够稳，但裸名 Ugo 仍需保持 caveat。",
        "works_layer_note": "Ugo di San Vittore 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 fuller-form scholastic lane 站住，再慢慢做更细的 work-context。",
        "caveat_flags": ["bare_name_caveat", "scholastic_work_context_not_yet_productized"],
    },
    "bernardo_di_chiaravalle": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Bernardo di Chiaravalle 现在已经可以作为 ready-with-caveat 的 saintly authority shell 前台出现：Paradiso 31-33 saintly lane 已经足够稳，但 bare Bernardus/Bernardo 仍需保持可见 caveat。",
        "works_layer_note": "Bernardo di Chiaravalle 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 saintly / Paradiso lane 站住，不要过早伪装成 works layer。",
        "caveat_flags": ["saintly_caveat", "bare_name_caveat", "saintly_work_context_not_yet_productized"],
    },
    "plinius": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Plinio 现在已经可以作为 ready-with-caveat 的 natural-historical authority shell 前台出现：registry intake 已经稳定，但 natural-historical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Plinio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 natural-historical authority 站住，再做更细的 work-context。",
        "caveat_flags": ["natural_historical_work_context_not_yet_productized"],
    },
    "valerio_massimo": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Valerio Massimo 现在已经可以作为 ready-with-caveat 的 exempla-historical authority shell 前台出现：registry intake 已经稳定，但 anecdotal / exempla work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Valerio Massimo 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 exempla-historical authority 可见，再慢慢整理更细的 work-context。",
        "caveat_flags": ["exempla_work_context_not_yet_productized"],
    },
    "svetonio": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Svetonio 现在已经可以作为 ready-with-caveat 的 biographical-historical authority shell 前台出现：registry intake 已经稳定，但 biographical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Svetonio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 imperial-biographical authority 站住，再做更细的 work-context。",
        "caveat_flags": ["biographical_work_context_not_yet_productized"],
    },
    "salustio": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Salustio 现在已经可以作为 ready-with-caveat 的 historical authority shell 前台出现：registry intake 已经稳定，但 Sallustian work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Salustio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 Roman-historical authority 站住，再做更细的 work-context。",
        "caveat_flags": ["historical_work_context_not_yet_productized"],
    },
    "solino": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Solino 现在已经可以作为 ready-with-caveat 的 natural-historical miscellany shell 前台出现：registry intake 已经稳定，但 natural-historical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Solino 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 miscellany-style natural-historical authority 可见，再做更细的 work-context。",
        "caveat_flags": ["natural_historical_work_context_not_yet_productized"],
    },
    "orosius": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Orosio 现在已经可以作为 ready-with-caveat 的 Christian-historical authority shell 前台出现：registry intake 已经稳定，但 historical-patristic work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Orosio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 Christian-historical authority 站住，再做更细的 work-context。",
        "caveat_flags": ["historical_patristic_work_context_not_yet_productized"],
    },
    "alberto_magno": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Alberto Magno 现在已经可以作为 ready-with-caveat 的 scholastic-natural authority shell 前台出现：registry intake 已经稳定，但 wider Albertine work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Alberto Magno 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 scholastic-natural authority 站住，再慢慢做更细的 work-context。",
        "caveat_flags": ["scholastic_natural_work_context_not_yet_productized"],
    },
    "albumasar": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Albumasar 现在已经可以作为 ready-with-caveat 的 astrological authority shell 前台出现：registry intake 已经稳定，但 astrological work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Albumasar 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 astrological authority 可见，再做更细的 work-context。",
        "caveat_flags": ["astrological_work_context_not_yet_productized"],
    },
    "alfragano": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Alfragano 现在已经可以作为 ready-with-caveat 的 astronomical authority shell 前台出现：registry intake 已经稳定，但 astronomical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Alfragano 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 astronomical authority 站住，再做更细的 work-context。",
        "caveat_flags": ["astronomical_work_context_not_yet_productized"],
    },
    "beda": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Beda 现在已经可以作为 ready-with-caveat 的 exegetical-chronological authority shell 前台出现：registry intake 已经稳定，但 exegetical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Beda 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 exegetical-chronological authority 可见，再做更细的 work-context。",
        "caveat_flags": ["exegetical_work_context_not_yet_productized"],
    },
    "claudiano": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Claudiano 现在已经可以作为 ready-with-caveat 的 poetic authority shell 前台出现：registry intake 已经稳定，但 poetic lane 仍需保留可见 caveat，不应过早伪装成 works layer。",
        "works_layer_note": "Claudiano 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 poetic authority 站住，同时保留 poetic caveat，再做更细的 work-context。",
        "caveat_flags": ["poetic_caveat", "poetic_work_context_not_yet_productized"],
    },
    "giovanni_crisostomo": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Giovanni Crisostomo 现在已经可以作为 ready-with-caveat 的 patristic-homiletic authority shell 前台出现：registry intake 已经稳定，但 homiletic work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Giovanni Crisostomo 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 patristic-homiletic authority 站住，再做更细的 work-context。",
        "caveat_flags": ["homiletic_work_context_not_yet_productized"],
    },
    "giovanni_damasceno": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Giovanni Damasceno 现在已经可以作为 ready-with-caveat 的 patristic-doctrinal authority shell 前台出现：registry intake 已经稳定，但 doctrinal work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Giovanni Damasceno 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 patristic-doctrinal authority 可见，再做更细的 work-context。",
        "caveat_flags": ["doctrinal_work_context_not_yet_productized"],
    },
    "gratianus": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Graziano 现在已经可以作为 ready-with-caveat 的 canonistic authority shell 前台出现：registry intake 已经稳定，但 canon-law work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Graziano 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 canonistic authority 站住，再做更细的 work-context。",
        "caveat_flags": ["canonistic_work_context_not_yet_productized"],
    },
    "papia": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Papia 现在已经可以作为 ready-with-caveat 的 lexicographic-grammatical authority shell 前台出现：registry intake 已经稳定，但 lexicographic work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Papia 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 grammatical authority 可见，再做更细的 work-context。",
        "caveat_flags": ["lexicographic_work_context_not_yet_productized"],
    },
    "salomone": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Salomone 现在已经可以作为 ready-with-caveat 的 sapiential authority shell 前台出现：registry intake 已经稳定，但 sapiential / biblical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Salomone 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 sapiential authority 与 Paradiso pressure 站住，再做更细的 work-context。",
        "caveat_flags": ["sapiential_work_context_not_yet_productized"],
    },
    "tolomeo": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Tolomeo 现在已经可以作为 ready-with-caveat 的 astronomical authority shell 前台出现：registry intake 已经稳定，但 astronomical work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Tolomeo 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 astronomical authority 站住，再做更细的 work-context。",
        "caveat_flags": ["astronomical_work_context_not_yet_productized"],
    },
    "livio": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Livio 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：historical authority traffic 和 commentary-line coverage 都已经稳定可读；但 Livian work-context review 还没有厚到可以前推 works layer。",
        "works_layer_note": "Livio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让历史性 authority pressure 可见，再逐步做细的 Livian work layer。",
        "caveat_flags": ["historical_work_context_not_yet_productized"],
    },
    "macrobio": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Macrobio 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：commentarial authority traffic 与本地 line coverage 都已经足够稳定；但 commentarial work lanes 仍需 dedicated review，暂时不前推 works layer。",
        "works_layer_note": "Macrobio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先保持 commentarial authority 的可见性，再做更细的 work-lane productization。",
        "caveat_flags": ["commentarial_work_lanes_not_yet_productized"],
    },
    "omero": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Omero 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：bella scola / Limbo 场景和 epic authority 压力都已经稳定可见；但 Iliad / Odyssey 的 work-context review 还没有厚到可以前推 works layer。",
        "works_layer_note": "Omero 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先让 epic authority 和记忆中的 Limbo figure 站住，再做 Iliad / Odyssey 的细 work-context 产品化。",
        "caveat_flags": ["epic_work_context_not_yet_productized"],
    },
    "orazio": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Orazio 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：bella scola 的可见 figure 和 Horatian authority traffic 都已经够稳；但 alias cleanup 和 lyric/satiric work-context 仍应先保守处理。",
        "works_layer_note": "Orazio 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：让可见的 Limbo figure 与 Horatian authority 一起存在，但不要过早假装成 work-layer author。",
        "caveat_flags": ["horatian_alias_cleanup_pending", "horatian_work_context_not_yet_productized"],
    },
    "lucano": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_entry",
        "works_layer_mode": "no_work_layer",
        "frontend_notes_override": "Lucano 现在已经可以作为 ready-with-caveat 的 commentary-author shell 前台出现：Limbo 诗人行列里的 figure-presence 和 Lucanian authority traffic 都已经足够稳定；但 Lucani / Pharsalia 的 work-context review 仍应留在下一层。",
        "works_layer_note": "Lucano 当前适合作为 ready-with-caveat 的 author/commentary shell 打开：先把 Limbo 的 figure-presence 和 epic-historical authority 压力一起留住，再做 Lucanian work layer。",
        "caveat_flags": ["lucanian_work_context_not_yet_productized"],
    },
    "ovid": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Ovidio 现在已经可以作为 ready-with-caveat 的 flat-work author 前台出现：Metamorphoses 已经形成明确 backbone，Heroides / Ars amatoria / Fasti 也有可读的次级位置；但书卷层的规范化还没到完整 works tree。",
        "works_layer_note": "Ovidio 当前开放 ready-with-caveat 的 flat-work overview：Metamorphoses 作为 primary backbone，Heroides / Ars amatoria / Fasti 作为 guarded secondary bundle；仍不应伪装成完整 locator tree。",
        "caveat_flags": ["partial_flat_work_object", "ovid_work_book_signal_still_mixed"],
    },
    "boethius": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Boezio 现在已经可以作为 ready-with-caveat 的单核 flat-work author 出现：De consolatione Philosophiae 的 clean/noisy split 已经足够稳定；但 book-level cleanup 和 residue isolation 仍要保持可见。",
        "works_layer_note": "Boezio 当前开放 ready-with-caveat 的单核 flat-work bundle：以 De consolatione Philosophiae 的 clean spine 为主，继续把 noisy residue 明确隔开。",
        "caveat_flags": ["partial_flat_work_object", "boethius_book_signal_needs_cleanup"],
    },
    "seneca": {
        "frontend_status_override": "ready_with_caveat",
        "object_rollout_status": "ready_with_caveat",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Seneca 现在已经可以作为 ready-with-caveat 的 mixed epistolary flat-work author 前台出现：Epistulae morales 的 letter spine 已经稳定到足以构成真实主轴，Hercules Furens 也能作为较小但可见的第二 work 保留；但 letter/book 混合信号仍需保守处理，不应伪装成完整 works tree。",
        "works_layer_note": "Seneca 当前开放 ready-with-caveat 的 mixed epistolary overview：以 Epistulae morales 的 letter spine 为主轴，同时保留少量 book-like residue 和 Hercules Furens 的次级位置；让混合性可见，但不要强行 tree 化。",
        "caveat_flags": ["partial_flat_work_object", "seneca_epistolary_signal_mixed"],
    },
    "dante": {
        "frontend_status_override": "ready",
        "object_rollout_status": "ready",
        "entry_mode": "author_commentary_work_overview",
        "works_layer_mode": "flat_work_overview",
        "frontend_notes_override": "Dante is now mounted as a completed authority room: commentary traditions cite him not only as the poet of the Commedia, but also through Convivio, De Monarchia, Vita Nuova, De vulgari eloquentia, and Quaestio de aqua et terra.",
        "works_layer_note": "Dante opens as a completed flat-work overview: start from Convivio / De Monarchia / Vita Nuova, keep De vulgari eloquentia and Quaestio de aqua et terra visible, and treat Commedia self-citation as a controlled work anchor rather than as a generic catch-all.",
        "caveat_flags": ["self_citation_surface_can_be_generic", "dante_work_aliases_need_owner_sensitive_highlighting"],
    },
}

AUTHORITY_DISPLAY_NAME_OVERRIDES = {
    "aristotle": "Aristotele",
    "paul_the_apostle": "Paolo Apostolo",
    "psalmist": "Salmista",
    "moses": "Mosè",
    "isaiah": "Isaia",
    "matthew": "Matteo Evangelista",
    "mark": "Marco Evangelista",
    "luke": "Luca Evangelista",
    "john_the_evangelist": "Giovanni Evangelista",
    "augustine": "Agostino",
    "boethius": "Boezio",
    "cicero": "Cicerone",
    "ovid": "Ovidio",
    "virgil": "Virgilio",
    "statius": "Stazio",
    "hugo_of_st_victor": "Ugo di San Vittore",
    "plinius": "Plinio",
    "orosius": "Orosio",
    "gratianus": "Graziano",
    "seneca": "Seneca",
    "averroe": "Averroè",
    "avicenna": "Avicenna",
    "albumasar": "Albumasar",
    "alfragano": "Alfragano",
    "beda": "Beda",
    "papia": "Papia",
    "salustio": "Salustio",
    "svetonio": "Svetonio",
    "tolomeo": "Tolomeo",
    "girolamo": "Girolamo",
    "salomone": "Salomone",
    "valerio_massimo": "Valerio Massimo",
    "san_pietro": "San Pietro",
    "claudiano": "Claudiano",
    "giovenale": "Giovenale",
    "isidoro": "Isidoro",
    "livio": "Livio",
    "lucano": "Lucano",
    "macrobio": "Macrobio",
    "omero": "Omero",
    "orazio": "Orazio",
    "solino": "Solino",
    "tommaso_daquino": "Tommaso d'Aquino",
    "alberto_magno": "Alberto Magno",
    "bernardo_di_chiaravalle": "Bernardo di Chiaravalle",
    "giovanni_damasceno": "Giovanni Damasceno",
    "galeno": "Galeno",
    "giovanni_crisostomo": "Giovanni Crisostomo",
    "gregorio_magno": "Gregorio Magno",
    "dante": "Dante",
}

DANTE_SUPPLEMENTAL_AUTHOR = {
    "author_id": "dante",
    "canonical_name": "Dante",
    "aliases": ["Dante", "Dante Alighieri", "Dantes"],
}

DANTE_SUPPLEMENTAL_WORKS = [
    {
        "canonical_work": "Convivio",
        "aliases": ["Convivio", "Convito"],
    },
    {
        "canonical_work": "De Monarchia",
        "aliases": ["De Monarchia", "Monarchia"],
    },
    {
        "canonical_work": "Vita Nuova",
        "aliases": ["Vita Nuova", "Vita nova"],
    },
    {
        "canonical_work": "De vulgari eloquentia",
        "aliases": ["De vulgari eloquentia", "Vulgari eloquentia"],
    },
    {
        "canonical_work": "Quaestio de aqua et terra",
        "aliases": ["Quaestio de aqua et terra", "Questio de aqua et terra"],
    },
    {
        "canonical_work": "Commedia",
        "aliases": ["Commedia", "Divina Commedia"],
    },
]

DANTE_SUPPLEMENTAL_MARKERS = (
    "dante",
    "dantes",
    "conviv",
    "monarchia",
    "vita nuova",
    "vita nova",
    "vulgari",
    "aqua et terra",
    "commedia",
)


def authority_display_name(author_id: str | None, canonical_name: str | None) -> str | None:
    if author_id and author_id in AUTHORITY_DISPLAY_NAME_OVERRIDES:
        return AUTHORITY_DISPLAY_NAME_OVERRIDES[author_id]
    return canonical_name


def authority_public_slug(author_id: str | None, canonical_name: str | None) -> str:
    display = authority_display_name(author_id, canonical_name) or canonical_name or author_id or "autore"
    normalized = unicodedata.normalize("NFKD", str(display))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower().replace("'", "").replace(".", " ")
    ascii_text = re.sub(r"[^a-z0-9]+", "_", ascii_text)
    ascii_text = re.sub(r"_+", "_", ascii_text).strip("_")
    return ascii_text or "autore"


def normalize_ready_status_text(value: str | None) -> str | None:
    text = str(value or "")
    if not text:
        return value
    text = text.replace("ready-with-caveat", "ready")
    text = text.replace("ready_with_caveat", "ready")
    text = text.replace("ready with caveat", "ready")
    return text


def promote_author_ready_status(author: dict[str, Any]) -> None:
    if author.get("frontend_status") == "ready_with_caveat":
        author["frontend_status"] = "ready"
    if author.get("object_rollout_status") == "ready_with_caveat":
        author["object_rollout_status"] = "ready"
    if author.get("frontend_notes"):
        author["frontend_notes"] = normalize_ready_status_text(author.get("frontend_notes"))
    if author.get("works_layer_note"):
        author["works_layer_note"] = normalize_ready_status_text(author.get("works_layer_note"))

REVIEW_FIRST_FLAT_WORK_SPECS = {
    "platone": {
        "review_path": PLATONE_WORK_CONTEXT_REVIEW_PATH,
        "bundle_review_path": PLATONE_WORK_BUNDLE_REVIEW_PATH,
        "anchor_labels": {"Timaeus / Timeo", "Laws / Leggi"},
        "secondary_labels": {"Republic / Repubblica", "Phaedo / Fedone", "Symposium / Simposio", "De immortalitate anime"},
        "local_source_policy": (
            "Platone is now a partial flat-work object: open local commentary source text first, "
            "treat Timaeus / Timeo as the primary anchor, keep Laws / Leggi as a caveated second anchor, "
            "and leave the remaining Platonic work labels in a visible but non-promoted secondary/tertiary bundle."
        ),
    },
    "tommaso_daquino": {
        "review_path": TOMMASO_WORK_CONTEXT_REVIEW_PATH,
        "bundle_review_path": TOMMASO_WORK_BUNDLE_REVIEW_PATH,
        "anchor_hardening_path": TOMMASO_ANCHOR_HARDENING_BUNDLE_PATH,
        "anchor_labels": {"Summa theologiae"},
        "secondary_labels": {"Contra Gentiles", "Sentences commentary", "Quaestio de anima", "Catena aurea"},
        "primary_anchor_label": "Summa theologiae",
        "local_source_policy": (
            "Tommaso d'Aquino is now a partial flat-work object: open local commentary source text first, "
            "treat Summa theologiae as the primary scholastic anchor, keep Contra Gentiles / Sentences / Quaestio de anima "
            "as secondary layers, and leave Catena aurea as a thin tertiary preview."
        ),
    },
}

STOPWORDS = {
    "about", "ad", "agli", "alla", "alle", "allora", "altri", "altro", "anche", "ancora",
    "anzi", "apud", "che", "chi", "cioe", "come", "con",
    "contra", "cosa", "cosi", "cui", "cum", "dalla", "dalle", "dallo", "dante", "della",
    "delle", "dello", "dentro", "detto", "dice", "dicit", "diro", "dove", "dunque",
    "egli", "era", "essere", "et", "etiam", "eum", "ex", "fuit", "gia", "gli", "ha",
    "hoc", "homo", "huius", "ibidem", "idem", "illa", "ille", "in", "inde", "intende",
    "ipse", "ipsa", "ita", "loro", "ma", "molto", "nel", "nella", "nelle", "nello", "non", "nos",
    "nostra", "nostro", "nulla", "ogni", "onde", "per", "pero", "piu", "poi", "prima",
    "proemio", "quae", "quale", "quales", "quam", "quando", "quasi", "que", "quello",
    "questa", "queste", "questi", "questo", "quia", "quod", "sciendum", "secondo", "sed",
    "selva", "sempre", "siccome", "significa", "sive", "sono", "sopra", "sua", "sue", "suo",
    "super", "sunt", "suo", "suo", "suo", "tale", "tamen", "tanto", "testo", "tra", "tunc", "usque",
    "tutta", "tutte", "tutti", "tutto", "unde", "uno", "uomo", "via", "vita", "where",
    "adunque", "elli", "enim", "idest", "nobis", "perche", "qual", "quali", "quella", "quelle",
    "quelli", "quivi", "scilicet",
}

DANTE_WORD_STOPWORDS = {
    "a", "ad", "al", "alla", "alle", "allo", "all", "coi", "col", "con", "da", "dal", "dalla", "dalle",
    "de", "dei", "del", "della", "delle", "dello", "di", "e", "ed", "fra", "gli", "i", "il", "in",
    "io", "la", "le", "li", "lo", "ma", "mi", "mio", "ne", "nel", "nella", "nelle", "nello", "noi",
    "non", "o", "per", "poi", "se", "si", "su", "tra", "tu", "un", "una", "uno", "voi", "vostra",
    "vostro", "che", "chi", "cui", "come", "cosi", "questa", "queste", "questi", "questo", "quella",
    "quelle", "quelli", "quello", "qual", "quale", "quali", "era", "eran", "fui", "fu", "son", "sono",
    "sia", "suo", "sua", "suo", "sue", "nostra", "nostro", "vostro", "vostra", "m", "t", "d",
}

FIGURE_REGISTRY = {
    "virgil": {
        "display_label": "Virgilio",
        "aliases": ["virgil", "virgilio", "vergilio", "virgilius", "vergilius"],
    },
    "beatrice": {
        "display_label": "Beatrice",
        "aliases": ["beatrice", "beatricie", "biatrice", "beatrix"],
    },
    "francesca": {
        "display_label": "Francesca",
        "aliases": ["francesca"],
    },
    "ulysses": {
        "display_label": "Ulysses",
        "aliases": ["ulisse", "ulixes", "ulixe"],
    },
    "cato": {
        "display_label": "Cato",
        "aliases": ["cato", "catone"],
    },
    "statius": {
        "display_label": "Statius",
        "aliases": ["stazio", "statius"],
    },
}

FIGURE_ALIAS_TERMS = {
    alias
    for figure in FIGURE_REGISTRY.values()
    for alias in figure["aliases"]
}

CANONICAL_TERM_MAP = {
    "mons": "monte",
    "montem": "monte",
    "montis": "monte",
    "collem": "colle",
    "collis": "colle",
    "solem": "sole",
    "solis": "sole",
    "oratio": "orazione",
    "oratione": "orazione",
    "orationem": "orazione",
    "orationis": "orazione",
    "pater": "padre",
    "patrem": "padre",
    "patris": "padre",
    "patri": "padre",
    "deus": "dio",
    "deum": "dio",
    "deo": "dio",
    "dei": "dio",
    "deos": "dio",
    "iddio": "dio",
    "celi": "cieli",
    "celo": "cieli",
    "coeli": "cieli",
    "coelo": "cieli",
    "caeli": "cieli",
    "caelo": "cieli",
    "lumen": "luce",
    "lucem": "luce",
    "lucis": "luce",
    "animae": "anima",
    "animam": "anima",
    "animas": "anima",
    "anime": "anima",
    "spiritus": "spirito",
    "spiritum": "spirito",
    "spiritui": "spirito",
    "amorem": "amore",
    "amor": "amore",
}

RESIDUAL_FUNCTION_PATTERNS = (
    "dell",
    "nell",
    "all",
    "sull",
    "quest",
    "quell",
    "sicut",
)

LABEL_NOISE_TERMS = {
    "admodum",
    "altore",
    "autore",
    "author",
    "autor",
    "autoris",
    "auctor",
    "auctore",
    "auttore",
    "capitulo",
    "capituli",
    "cetera",
    "dicendo",
    "dicie",
    "dicendum",
    "eorum",
    "eius",
    "illi",
    "ipsi",
    "ipsius",
    "istius",
    "versus",
    "duobus",
    "fingie",
    "fingit",
    "inducit",
    "ostendit",
    "como",
    "come",
    "esposizione",
    "chiose",
    "chapitolo",
    "capitolo",
    "divide",
    "interlineari",
    "marginale",
    "parte",
    "partem",
    "pone",
    "pare",
    "posteriori",
    "plana",
    "quomodo",
    "colui",
    "colei",
    "costui",
    "costei",
    "egli",
    "ella",
    "elli",
    "esso",
    "essa",
    "essi",
    "esse",
    "ipsa",
    "ipse",
    "ipsum",
    "idem",
    "ista",
    "iste",
    "istud",
    "istam",
    "color",
    "quid",
    "richiamo",
    "rosini",
    "tangit",
    "unam",
}

COMMENTARIAL_PARAPHRASE_TERMS = {
    "adagio",
    "medio",
}

DISPLAY_LABEL_NORMALIZATION = {
    "mezo": "mezzo",
}

WORD_PROFILE_NOISE_TERMS = {
    "altore",
    "auctor",
    "autor",
    "capitulo",
    "canto",
    "cetera",
    "dicat",
    "dicendo",
    "dicie",
    "dicitur",
    "disse",
    "ebbe",
    "elli",
    "essa",
    "esso",
    "item",
    "lezione",
    "modo",
    "parole",
    "quel",
    "quomodo",
    "seconda",
}

TOP_COMMENTARY_TERM_NOISE_TERMS = {
    "ancor",
    "apparve",
    "aver",
    "cotal",
    "dall",
    "elli",
    "ella",
    "elle",
    "esser",
    "esso",
    "essa",
    "essi",
    "ester",
    "fece",
    "inter",
    "mentr",
    "quidam",
    "quelle",
    "quella",
    "quello",
    "quelli",
    "quel",
    "quorum",
    "siam",
    "sovr",
    "questa",
    "queste",
    "questo",
    "questi",
    "tale",
    "tali",
    "their",
    "vide",
    "vidi",
    "vieni",
    "onde",
    "dunque",
    "vuole",
    "vuol",
}

CORPUS_DRIFT_TERMS = FIGURE_ALIAS_TERMS | {
    "avea",
    "auttore",
    "beatricie",
    "biatrice",
    "chiaro",
    "chome",
    "dicens",
    "dicta",
    "eius",
    "ella",
    "erat",
    "finge",
    "interlineari",
    "messer",
    "michi",
    "poema",
    "poeta",
    "posteriori",
    "propter",
    "rosini",
    "sibi",
    "vergilio",
    "virgilius",
}

COMMENTARIAL_DISCOURSE_TERMS = {
    "altore",
    "auctor",
    "auctore",
    "author",
    "autore",
    "autor",
    "autoris",
    "capitulo",
    "capituli",
    "capitolo",
    "cetera",
    "chiose",
    "dicta",
    "dicens",
    "dicendum",
    "dicendo",
    "dicitur",
    "dicie",
    "describit",
    "fingie",
    "fingit",
    "inducit",
    "interlineari",
    "lezione",
    "marginale",
    "ostendit",
    "poema",
    "poeta",
    "posteriori",
    "proemio",
    "quomodo",
    "richiamo",
    "rosini",
    "tangit",
    "eius",
}

COMMENTARIAL_RESIDUE_PREFIXES = (
    "altor",
    "auct",
    "autt",
    "autor",
    "capitul",
    "chapit",
    "interlinear",
    "marginal",
    "posterior",
    "richiam",
)

CHAPTER_DIVISION_TERMS = {
    "capitulo",
    "capitolo",
    "capituli",
    "chapitolo",
    "dicendo",
    "dicie",
    "divide",
    "parte",
    "partem",
    "pone",
}

GLOSS_APPARATUS_TERMS = {
    "interlineari",
    "lezione",
    "marginale",
    "plana",
    "posteriori",
    "richiamo",
    "richiamo",
    "rosini",
    "sessa",
    "fino",
}

LOW_SEMANTIC_CONCURRENCE_TERMS = {
    "ben",
    "cio",
    "pur",
}

BROAD_INTERPRETIVE_REVIEW_TERMS = {
    "acqua",
    "altra",
    "anima",
    "anime",
    "cielo",
    "citta",
    "corpo",
    "esser",
    "luogo",
    "monte",
    "mondo",
    "occhi",
    "quanto",
    "ragione",
    "santo",
    "spirito",
    "tempo",
    "terra",
    "verso",
    "virtu",
}

COMMENTARIAL_FORMULA_REVIEW_TERMS = {
    "ait",
    "autem",
    "deinde",
    "dicta",
    "dicti",
    "dicit",
    "dicitque",
    "dictum",
    "dixit",
    "enim",
    "facta",
    "habet",
    "hoc",
    "idem",
    "ideo",
    "infra",
    "igitur",
    "illud",
    "illi",
    "ipsi",
    "ipsius",
    "istius",
    "versus",
    "duobus",
    "item",
    "ista",
    "iste",
    "istud",
    "meus",
    "motus",
    "partim",
    "pars",
    "quare",
    "sibi",
    "supra",
    "ubi",
    "unde",
    "videt",
    "vidit",
}

USER_CONFIRMED_INCOMPLETE_SAMPLES = {}
# Human review remains advisory for now; do not hard-bind line-level keeps/drops into generation.
LOCAL_SEMANTIC_FIELD_REVIEW_OVERRIDES: dict[str, dict[str, Any]] = {}
CANONICAL_LINE_CACHE: dict[str, dict[int, str]] | None = None
COMMENTARY_ALIAS_LEARNING_CACHE: dict[str, dict[str, Any]] | None = None
AUTHORITY_WORKS_TREE_CACHE: dict[str, dict[str, Any]] | None = None
AUTHORITY_COMMENTARY_LINE_INDEX_CACHE: dict[str, dict[str, Any]] | None = None
AUTHORITY_SOURCE_TEXT_CACHE: dict[str, dict[str, dict[str, Any]]] = {}
AUTHORITY_SOURCE_TIMEOUT_SAMPLES: set[str] = set()
FIELD_LABEL_PRIOR_CACHE: dict[str, dict[str, float]] | None = None
LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE: dict[str, Any] | None = None


def build_word_profile_filename(normalized_form: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", normalize_semantic_text(normalized_form)).strip("-")
    digest = hashlib.sha1(normalized_form.encode("utf-8")).hexdigest()[:10]
    return f"{slug or 'word'}-{digest}.json"


def make_manual_override_field(
    record_id: str,
    display_label: str,
    representative_terms: list[str],
    note: str,
) -> dict[str, Any]:
    return {
        "id": f"manual-{record_id}-{normalize_semantic_text(display_label)}",
        "internal_label": display_label,
        "display_label": display_label,
        "label": display_label,
        "seed_term": display_label,
        "field_kind": "line_semantic",
        "label_confidence": 0.84,
        "quality_score": 7.25,
        "representative_terms": representative_terms[:5],
        "record_count": 0,
        "record_share": 0,
        "record_ids": [],
        "unique_commentator_count": 0,
        "example_commentaries": [],
        "qa": {
            "review_needed": False,
            "flags": ["manual_line_review_keep", "semantic_compression_override"],
            "note": note,
        },
        "label_audit": {
            "original_label": display_label,
            "final_label": display_label,
            "changed": False,
            "reason": note,
            "candidate_reasons": ["human-reviewed terzina semantic compression"],
            "anchored_to_line": True,
            "review_needed": False,
            "corpus_drift_label": False,
            "blocked_candidate_retained": False,
            "blocked_fallback_used": False,
            "gloss_generated": False,
            "gloss_kind": None,
            "canonicalized_figure_label": None,
            "chosen_score": 7.25,
            "prior_count": 0,
            "prior_review_rate": 0.0,
            "prior_drift_rate": 0.0,
            "retained_token_like": False,
            "como_checked": False,
        },
        "cross_line_references": [],
    }


def dump_compact_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def public_manifest_reports(_: dict[str, Any] | None = None) -> dict[str, Any]:
    """Keep public manifest free of local filesystem report paths."""
    return {}


@dataclass
class CommentaryMeta:
    name: str
    label: str
    date_label: str | None
    year_start: int | None
    year_end: int | None
    century_label: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sample",
        default="inferno1",
        help="Sample prefix, comma-separated list, or all-eligible",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Rebuild manifest and overnight QA from existing generated sample outputs.",
    )
    parser.add_argument(
        "--build-profile",
        choices=["full", "website-safe", "authority-refresh", "research-refresh", "loci-refresh"],
        default="full",
        help=(
            "Preset layer plan. "
            "'website-safe' preserves line-level + word-loci by skipping their rebuilds; "
            "'authority-refresh' only refreshes authority-side outputs; "
            "'research-refresh' only refreshes research_layer; "
            "'loci-refresh' refreshes research_layer + word-loci while preserving line-level."
        ),
    )
    parser.add_argument(
        "--skip-line-level",
        action="store_true",
        help="Do not rebuild overview.json or lines/*.json; reuse existing generated summaries instead.",
    )
    parser.add_argument(
        "--skip-research-layer",
        action="store_true",
        help="Do not rewrite demo/frontend/data/research_layer.json.",
    )
    parser.add_argument(
        "--skip-authority",
        action="store_true",
        help="Do not rewrite authority frontend data outputs under demo/frontend/data/authority*.",
    )
    parser.add_argument(
        "--skip-word-loci",
        action="store_true",
        help="Do not rewrite demo/frontend/data/dante_word_loci/* shards.",
    )
    return parser.parse_args()


def resolve_build_switches(args: argparse.Namespace) -> dict[str, bool]:
    profile_defaults = {
        "full": {
            "skip_line_level": False,
            "skip_research_layer": False,
            "skip_authority": False,
            "skip_word_loci": False,
        },
        "website-safe": {
            "skip_line_level": True,
            "skip_research_layer": False,
            "skip_authority": False,
            "skip_word_loci": True,
        },
        "authority-refresh": {
            "skip_line_level": True,
            "skip_research_layer": True,
            "skip_authority": False,
            "skip_word_loci": True,
        },
        "research-refresh": {
            "skip_line_level": True,
            "skip_research_layer": False,
            "skip_authority": True,
            "skip_word_loci": True,
        },
        "loci-refresh": {
            "skip_line_level": True,
            "skip_research_layer": False,
            "skip_authority": True,
            "skip_word_loci": False,
        },
    }
    resolved = dict(profile_defaults[args.build_profile])
    resolved["skip_line_level"] = resolved["skip_line_level"] or args.skip_line_level
    resolved["skip_research_layer"] = resolved["skip_research_layer"] or args.skip_research_layer
    resolved["skip_authority"] = resolved["skip_authority"] or args.skip_authority
    resolved["skip_word_loci"] = resolved["skip_word_loci"] or args.skip_word_loci
    return resolved


def load_commentary_metadata() -> Dict[str, CommentaryMeta]:
    path = SOURCE_DATA_DIR / "commentaries.csv"
    metadata: Dict[str, CommentaryMeta] = {}

    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            label = (row.get("option_label") or "").strip()
            if not label or label == "any":
                continue

            name, date_label = split_label(label)
            year_start, year_end = parse_year_range(date_label)
            metadata[name] = CommentaryMeta(
                name=name,
                label=label,
                date_label=date_label,
                year_start=year_start,
                year_end=year_end,
                century_label=build_century_label(year_start, year_end),
            )

    return metadata


def split_label(label: str) -> tuple[str, str | None]:
    if "," not in label:
        return label.strip(), None
    name, _, remainder = label.rpartition(",")
    return name.strip(), remainder.strip() or None


def load_canonical_line_cache() -> dict[str, dict[int, str]]:
    global CANONICAL_LINE_CACHE
    if CANONICAL_LINE_CACHE is not None:
        return CANONICAL_LINE_CACHE

    cache: dict[str, dict[int, str]] = defaultdict(dict)
    if CANONICAL_TEXT_BASE_PATH.exists():
        payload = json.loads(CANONICAL_TEXT_BASE_PATH.read_text(encoding="utf-8"))
        for row in payload.get("lines", []):
            sample_id = f"{str(row.get('cantica_slug') or '').lower()}{int(row.get('canto'))}"
            line_number = int(row.get("line_number"))
            line_text = clean_poem_line(str(row.get("line_text") or ""))
            if sample_id and line_number and line_text:
                cache[sample_id][line_number] = line_text

    CANONICAL_LINE_CACHE = dict(cache)
    return CANONICAL_LINE_CACHE


def load_commentary_alias_learning() -> dict[str, dict[str, Any]]:
    global COMMENTARY_ALIAS_LEARNING_CACHE
    if COMMENTARY_ALIAS_LEARNING_CACHE is not None:
        return COMMENTARY_ALIAS_LEARNING_CACHE

    if not AUTHORITY_TEXT_ALIAS_LEARNING_PATH.exists():
        COMMENTARY_ALIAS_LEARNING_CACHE = {}
        return COMMENTARY_ALIAS_LEARNING_CACHE

    payload = json.loads(AUTHORITY_TEXT_ALIAS_LEARNING_PATH.read_text(encoding="utf-8"))
    COMMENTARY_ALIAS_LEARNING_CACHE = {
        row["author_id"]: row
        for row in payload.get("authors", [])
        if row.get("author_id")
    }
    return COMMENTARY_ALIAS_LEARNING_CACHE


def load_authority_works_trees() -> dict[str, dict[str, Any]]:
    global AUTHORITY_WORKS_TREE_CACHE
    if AUTHORITY_WORKS_TREE_CACHE is not None:
        return AUTHORITY_WORKS_TREE_CACHE

    payloads: dict[str, dict[str, Any]] = {}
    if not AUTHORITY_WORKS_TREE_DIR.exists():
        AUTHORITY_WORKS_TREE_CACHE = payloads
        return payloads

    for path in sorted(AUTHORITY_WORKS_TREE_DIR.glob("*_works_tree.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        author_id = payload.get("author_id")
        if author_id:
            payloads[author_id] = payload

    AUTHORITY_WORKS_TREE_CACHE = payloads
    return payloads


def write_demo_authority_works_tree_shards(works_trees: dict[str, dict[str, Any]]) -> dict[str, str]:
    ensure_dir(AUTHORITY_WORKS_TREE_DATA_DIR)
    shard_paths: dict[str, str] = {}
    for author_id, payload in works_trees.items():
        payload = annotate_authority_works_tree_payload(payload)
        shard_path = AUTHORITY_WORKS_TREE_DATA_DIR / f"{author_id}.json"
        shard_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        shard_paths[author_id] = f"./data/authority_works_trees/{author_id}.json"
    return shard_paths


def write_demo_authority_commentary_line_shards(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    ensure_dir(AUTHORITY_COMMENTARY_LINE_INDEX_DIR)
    shard_paths: dict[str, dict[str, Any]] = {}
    for author in payload.get("authors", []):
        author_id = author.get("author_id")
        if not author_id:
            continue
        aggregate_path = AUTHORITY_COMMENTARY_LINE_INDEX_DIR / f"{author_id}.json"
        aggregate_path.write_text(json.dumps(author, ensure_ascii=False, indent=2), encoding="utf-8")

        split_dir = AUTHORITY_COMMENTARY_LINE_INDEX_DIR / author_id
        ensure_dir(split_dir)
        sample_index_rows: list[dict[str, Any]] = []
        for sample in author.get("samples", []):
            sample_name = sample.get("sample_name")
            if not sample_name:
                continue
            line_groups = []
            for group in sample.get("line_groups", []):
                group_line_number = infer_authority_jump_line_number(group.get("line_start"))
                if group_line_number is None:
                    group_line_number = infer_authority_jump_line_number(group.get("line_info"))
                occurrences = [
                    annotate_authority_occurrence(item, fallback_sample_name=sample_name, fallback_line_number=group_line_number)
                    for item in (group.get("occurrences") or [])
                ]
                line_groups.append(
                    {
                        **group,
                        "occurrences": occurrences,
                        "line_number": group_line_number,
                        "jump_target": build_authority_jump_target(sample_name, group_line_number),
                        "source_open_mode": "local_commentary_source_only",
                    }
                )
            sample_path = split_dir / f"{sample_name}.json"
            sample_payload = {
                "schema_version": "v1",
                "shell_contract": {
                    "jump_api": "DDPAppShell.jumpToSampleLine",
                    "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
                    "source_open_mode": "local_commentary_source_only",
                },
                "author_id": author_id,
                "canonical_name": author.get("canonical_name"),
                "display_name": author.get("display_name") or authority_display_name(author_id, author.get("canonical_name")),
                "public_slug_it": author.get("public_slug_it") or authority_public_slug(author_id, author.get("canonical_name")),
                "frontend_status": author.get("frontend_status"),
                "frontend_notes": author.get("frontend_notes"),
                **sample,
                "line_groups": line_groups,
            }
            sample_path.write_text(json.dumps(sample_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            default_jump_line_number = next(
                (
                    infer_authority_jump_line_number(group.get("line_number"))
                    for group in line_groups
                    if infer_authority_jump_line_number(group.get("line_number")) is not None
                ),
                None,
            )
            sample_index_rows.append(
                {
                    "sample_name": sample_name,
                    "sample_id": sample_name,
                    "canto_label": sample.get("canto_label"),
                    "cantica": sample.get("cantica"),
                    "canto": sample.get("canto"),
                    "total_mentions": sample.get("total_mentions", 0),
                    "line_group_count": sample.get("line_group_count", 0),
                    "default_jump_line_number": default_jump_line_number,
                    "jump_target": build_authority_jump_target(sample_name, default_jump_line_number),
                    "path": f"./data/authority_commentary_lines/{author_id}/{sample_name}.json",
                }
            )

        split_index_payload = {
            "schema_version": "v1",
            "shell_contract": {
                "jump_api": "DDPAppShell.jumpToSampleLine",
                "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
                "source_open_mode": "local_commentary_source_only",
            },
            "author_id": author_id,
            "canonical_name": author.get("canonical_name"),
            "display_name": author.get("display_name") or authority_display_name(author_id, author.get("canonical_name")),
            "public_slug_it": author.get("public_slug_it") or authority_public_slug(author_id, author.get("canonical_name")),
            "frontend_status": author.get("frontend_status"),
            "frontend_notes": author.get("frontend_notes"),
            "sample_count": len(sample_index_rows),
            "samples": sample_index_rows,
        }
        split_index_path = split_dir / "index.json"
        split_index_path.write_text(json.dumps(split_index_payload, ensure_ascii=False, indent=2), encoding="utf-8")

        shard_paths[author_id] = {
            "path": f"./data/authority_commentary_lines/{author_id}.json",
            "index_path": f"./data/authority_commentary_lines/{author_id}/index.json",
            "sample_count": len(sample_index_rows),
        }
    return shard_paths


def infer_authority_jump_line_number(value: Any) -> int | None:
    if isinstance(value, int):
        return value if value > 0 else None
    raw = str(value or "").strip()
    if not raw:
        return None
    match = re.search(r"\d+", raw)
    return int(match.group(0)) if match else None


def build_authority_jump_target(
    sample_name: str | None,
    line_number: int | None = None,
    locus_normalized: str | None = None,
) -> dict[str, Any] | None:
    sample_id = str(sample_name or "").strip()
    if not sample_id:
        return None
    return {
        "sample_id": sample_id,
        "line_number": line_number if NumberLike(line_number).is_finite() else None,
        "locus_normalized": locus_normalized or None,
        "api": "DDPAppShell.jumpToSampleLine",
    }


class NumberLike:
    def __init__(self, value: Any):
        self.value = value

    def is_finite(self) -> bool:
        return isinstance(self.value, int) and self.value > 0


def annotate_authority_occurrence(
    occurrence: dict[str, Any],
    *,
    fallback_sample_name: str | None = None,
    fallback_line_number: int | None = None,
) -> dict[str, Any]:
    sample_name = (
        occurrence.get("sample_name")
        or fallback_sample_name
        or infer_authority_sample_name(occurrence.get("cantica"), occurrence.get("canto"))
    )
    line_number = infer_authority_jump_line_number(occurrence.get("line_number"))
    if line_number is None:
        line_number = infer_authority_jump_line_number(occurrence.get("line_info"))
    if line_number is None:
        line_number = fallback_line_number
    return {
        **occurrence,
        "sample_name": sample_name,
        "line_number": line_number,
        "jump_target": build_authority_jump_target(sample_name, line_number),
        "source_open_mode": "local_commentary_source_only",
    }


def annotate_authority_tree_nodes(nodes: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    annotated_nodes: list[dict[str, Any]] = []
    for node in nodes or []:
        children = annotate_authority_tree_nodes(node.get("children") or [])
        occurrences = [annotate_authority_occurrence(item) for item in (node.get("occurrences") or [])]
        line_number = infer_authority_jump_line_number(node.get("line_number"))
        if line_number is None:
            line_number = infer_authority_jump_line_number(node.get("line_start"))
        annotated_nodes.append(
            {
                **node,
                "occurrences": occurrences,
                "children": children,
                "jump_target": build_authority_jump_target(
                    next((item.get("sample_name") for item in occurrences if item.get("sample_name")), None),
                    line_number,
                ),
            }
        )
    return annotated_nodes


def annotate_authority_partial_tree_nodes(nodes: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    annotated_nodes: list[dict[str, Any]] = []
    for node in nodes or []:
        children = annotate_authority_partial_tree_nodes(node.get("children") or [])
        occurrences = [annotate_authority_occurrence(item) for item in (node.get("occurrences") or [])]
        unplaced_occurrences = [
            annotate_authority_occurrence(item) for item in (node.get("unplaced_occurrences") or [])
        ]
        first_occurrence = next(
            (
                item
                for item in occurrences + unplaced_occurrences
                if item.get("sample_name") and item.get("line_number")
            ),
            None,
        )
        annotated_nodes.append(
            {
                **node,
                "occurrences": occurrences,
                "children": children,
                "unplaced_occurrences": unplaced_occurrences,
                "jump_target": build_authority_jump_target(
                    first_occurrence.get("sample_name") if first_occurrence else None,
                    first_occurrence.get("line_number") if first_occurrence else None,
                ),
            }
        )
    return annotated_nodes


def build_work_branches_contract(
    branch_mode: str,
    *,
    root_display_mode: str = "work_direct_children",
    hide_internal_schema_node: bool = True,
    visible_children: list[str] | None = None,
    branch_note: str | None = None,
    evidence_labels: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "branch_mode": branch_mode,
        "root_display_mode": root_display_mode,
        "hide_internal_schema_node": hide_internal_schema_node,
        "visible_children": visible_children or [],
        "evidence_labels": evidence_labels or [],
        "branch_note": branch_note,
    }


def annotate_authority_works_tree_payload(payload: dict[str, Any]) -> dict[str, Any]:
    author_id = payload.get("author_id")
    aristotle_depth_audit = load_aristotle_de_anima_depth_audit() if author_id == "aristotle" else None
    aristotle_wave3 = load_aristotle_wave3_book_spine() if author_id == "aristotle" else None
    aristotle_wave4 = load_aristotle_wave4_poetics_de_anima() if author_id == "aristotle" else None
    aristotle_wave5 = load_aristotle_wave5_metaphysics_nicomachean() if author_id == "aristotle" else None
    paul_ambiguity_hold = load_paul_corinthians_ambiguity_hold() if author_id == "paul_the_apostle" else None
    paul_wave3 = load_paul_wave3_epistle_spine() if author_id == "paul_the_apostle" else None
    paul_wave4 = load_paul_wave4_romans_second_corinthians() if author_id == "paul_the_apostle" else None
    paul_wave5 = load_paul_wave5_first_corinthians_ambiguous() if author_id == "paul_the_apostle" else None
    aristotle_wave3_map = {
        row.get("canonical_work"): row
        for row in (aristotle_wave3 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    aristotle_wave4_map = {
        row.get("canonical_work"): row
        for row in (aristotle_wave4 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    aristotle_wave5_map = {
        row.get("canonical_work"): row
        for row in (aristotle_wave5 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    paul_wave3_map = {
        row.get("canonical_work"): row
        for row in (paul_wave3 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    paul_wave4_map = {
        row.get("canonical_work"): row
        for row in (paul_wave4 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    paul_wave5_map = {
        row.get("canonical_work"): row
        for row in (paul_wave5 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    works: list[dict[str, Any]] = []
    for work in payload.get("works", []) or []:
        structured = annotate_authority_tree_nodes(work.get("structured_locator_tree") or [])
        prose = annotate_authority_tree_nodes(work.get("prose_locator_tree") or [])
        work_only_occurrences = [annotate_authority_occurrence(item) for item in (work.get("work_only_occurrences") or [])]
        pseudo_passage_occurrences = [annotate_authority_occurrence(item) for item in (work.get("pseudo_passage_occurrences") or [])]
        annotated_work = {
            **work,
            "structured_locator_tree": structured,
            "prose_locator_tree": prose,
            "work_only_occurrences": work_only_occurrences,
            "pseudo_passage_occurrences": pseudo_passage_occurrences,
            "source_open_mode": "local_commentary_source_only",
        }
        if aristotle_depth_audit and work.get("canonical_work") == aristotle_depth_audit.get("focus_work"):
            annotated_work["depth_risk_status"] = aristotle_depth_audit.get("current_status")
            annotated_work["depth_risk_stage"] = aristotle_depth_audit.get("risk_stage")
            annotated_work["depth_risk_note"] = "Keep De anima visible as a work with a real book backbone, but do not present it as deep structured passage evidence."
            annotated_work["depth_risk_metrics"] = aristotle_depth_audit.get("metrics", {})
            annotated_work["depth_risk_backbone"] = aristotle_depth_audit.get("prose_book_backbone", [])
        if paul_ambiguity_hold and work.get("canonical_work") == paul_ambiguity_hold.get("focus_work"):
            annotated_work["ambiguity_hold_status"] = paul_ambiguity_hold.get("current_status")
            annotated_work["ambiguity_hold_stage"] = paul_ambiguity_hold.get("risk_stage")
            annotated_work["ambiguity_hold_note"] = "Keep ambiguous Corinthians visible as its own burden pool; do not auto-assign it into 1 Corinthians or 2 Corinthians."
            annotated_work["ambiguity_hold_metrics"] = paul_ambiguity_hold.get("metrics", {})
            annotated_work["top_ambiguous_raw_mentions"] = paul_ambiguity_hold.get("top_ambiguous_raw_mentions", [])
        aristotle_wave3_work = aristotle_wave3_map.get(work.get("canonical_work"))
        if aristotle_wave3_work:
            annotated_work["wave3_spine_status"] = aristotle_wave3_work.get("wave3_status")
            annotated_work["wave3_visible_book_labels"] = aristotle_wave3_work.get("visible_book_labels", [])
            annotated_work["wave3_structured_branch_labels"] = aristotle_wave3_work.get("structured_branch_labels", [])
            annotated_work["wave3_visible_book_backbone"] = aristotle_wave3_work.get("visible_book_backbone", [])
        aristotle_wave4_work = aristotle_wave4_map.get(work.get("canonical_work"))
        if aristotle_wave4_work:
            annotated_work["wave4_completion_status"] = aristotle_wave4_work.get("wave4_status")
            annotated_work["wave4_completion_why"] = aristotle_wave4_work.get("why", [])
            annotated_work["wave4_focus_metrics"] = aristotle_wave4_work.get("metrics", {})
            annotated_work["wave4_primary_spine"] = aristotle_wave4_work.get("primary_spine", [])
            annotated_work["wave4_visible_hold_buckets"] = aristotle_wave4_work.get("visible_hold_buckets", [])
            annotated_work["wave4_visible_labels"] = aristotle_wave4_work.get("visible_labels", [])
        aristotle_wave5_work = aristotle_wave5_map.get(work.get("canonical_work"))
        if aristotle_wave5_work:
            annotated_work["wave5_completion_status"] = aristotle_wave5_work.get("wave5_status")
            annotated_work["wave5_completion_why"] = aristotle_wave5_work.get("why", [])
            annotated_work["wave5_focus_metrics"] = aristotle_wave5_work.get("metrics", {})
            annotated_work["wave5_primary_spine"] = aristotle_wave5_work.get("primary_spine", [])
            annotated_work["wave5_visible_labels"] = aristotle_wave5_work.get("visible_labels", [])
        paul_wave3_work = paul_wave3_map.get(work.get("canonical_work"))
        if paul_wave3_work:
            annotated_work["wave3_spine_status"] = paul_wave3_work.get("wave3_status")
            annotated_work["wave3_structured_chapters"] = paul_wave3_work.get("structured_chapters", [])
            annotated_work["wave3_prose_chapters"] = paul_wave3_work.get("prose_chapters", [])
        paul_wave4_work = paul_wave4_map.get(work.get("canonical_work"))
        if paul_wave4_work:
            annotated_work["wave4_completion_status"] = paul_wave4_work.get("wave4_status")
            annotated_work["wave4_completion_why"] = paul_wave4_work.get("why", [])
            annotated_work["wave4_focus_metrics"] = paul_wave4_work.get("metrics", {})
            annotated_work["wave4_primary_spine"] = paul_wave4_work.get("primary_spine", [])
            annotated_work["wave4_visible_labels"] = (
                paul_wave4_work.get("structured_labels", []) or paul_wave4_work.get("visible_labels", [])
            )
        paul_wave5_work = paul_wave5_map.get(work.get("canonical_work"))
        if paul_wave5_work:
            annotated_work["wave5_completion_status"] = paul_wave5_work.get("wave5_status")
            annotated_work["wave5_completion_why"] = paul_wave5_work.get("why", [])
            annotated_work["wave5_focus_metrics"] = paul_wave5_work.get("metrics", {})
            annotated_work["wave5_primary_spine"] = paul_wave5_work.get("primary_spine", [])
            annotated_work["wave5_visible_labels"] = (
                paul_wave5_work.get("structured_labels", []) or paul_wave5_work.get("visible_labels", [])
            )
        works.append(
            annotated_work
        )
    annotated_payload = {
        **payload,
        "shell_contract": {
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "work_branches_contract": build_work_branches_contract(
            "evidence_backed_work_branches",
            visible_children=[
                "structured_locator_tree",
                "prose_locator_tree",
                "work_only_occurrences",
                "pseudo_passage_occurrences",
            ],
            branch_note="Open each work directly into its real branch families; do not render an extra schema node.",
            evidence_labels=[
                "structured_passage",
                "prose_locator",
                "work_only",
                "pseudo_passage",
            ],
        ),
        "works": works,
    }
    if aristotle_depth_audit:
        annotated_payload["depth_risk_meta"] = {
            "available": True,
            "risk_stage": aristotle_depth_audit.get("risk_stage"),
            "focus_work": aristotle_depth_audit.get("focus_work"),
            "current_status": aristotle_depth_audit.get("current_status"),
            "recommended_next_step": aristotle_depth_audit.get("recommended_next_step"),
        }
    if paul_ambiguity_hold:
        annotated_payload["depth_risk_meta"] = {
            "available": True,
            "risk_stage": paul_ambiguity_hold.get("risk_stage"),
            "focus_work": paul_ambiguity_hold.get("focus_work"),
            "current_status": paul_ambiguity_hold.get("current_status"),
            "recommended_next_step": paul_ambiguity_hold.get("recommended_next_step"),
        }
    if aristotle_wave3:
        annotated_payload["wave3_book_spine"] = aristotle_wave3
    if aristotle_wave4:
        annotated_payload["wave4_focus_bundle"] = aristotle_wave4
    if aristotle_wave5:
        annotated_payload["wave5_focus_bundle"] = aristotle_wave5
    if paul_wave3:
        annotated_payload["wave3_epistle_spine"] = paul_wave3
    if paul_wave4:
        annotated_payload["wave4_focus_bundle"] = paul_wave4
    if paul_wave5:
        annotated_payload["wave5_focus_bundle"] = paul_wave5
    return annotated_payload


def load_platone_work_context_review() -> dict[str, Any] | None:
    if not PLATONE_WORK_CONTEXT_REVIEW_PATH.exists():
        return None
    return json.loads(PLATONE_WORK_CONTEXT_REVIEW_PATH.read_text(encoding="utf-8"))


def load_platone_anchor_calibration() -> dict[str, Any] | None:
    if not PLATONE_TIMEO_LEGGI_CALIBRATION_PATH.exists():
        return None
    return json.loads(PLATONE_TIMEO_LEGGI_CALIBRATION_PATH.read_text(encoding="utf-8"))


def load_platone_work_bundle_review() -> dict[str, Any] | None:
    if not PLATONE_WORK_BUNDLE_REVIEW_PATH.exists():
        return None
    return json.loads(PLATONE_WORK_BUNDLE_REVIEW_PATH.read_text(encoding="utf-8"))


def load_optional_json(path: Path | None) -> dict[str, Any] | None:
    if not path or not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_platone_anchor_hardening_bundle() -> dict[str, Any] | None:
    if not PLATONE_ANCHOR_HARDENING_BUNDLE_PATH.exists():
        return None
    return json.loads(PLATONE_ANCHOR_HARDENING_BUNDLE_PATH.read_text(encoding="utf-8"))


def load_tommaso_anchor_hardening_bundle() -> dict[str, Any] | None:
    if not TOMMASO_ANCHOR_HARDENING_BUNDLE_PATH.exists():
        return None
    return json.loads(TOMMASO_ANCHOR_HARDENING_BUNDLE_PATH.read_text(encoding="utf-8"))


def load_tommaso_summa_locator_calibration() -> dict[str, Any] | None:
    if not TOMMASO_SUMMA_LOCATOR_CALIBRATION_PATH.exists():
        return None
    return json.loads(TOMMASO_SUMMA_LOCATOR_CALIBRATION_PATH.read_text(encoding="utf-8"))


def load_augustine_work_pattern_bundle() -> dict[str, Any] | None:
    if not AUGUSTINE_WORK_PATTERN_BUNDLE_PATH.exists():
        return None
    return json.loads(AUGUSTINE_WORK_PATTERN_BUNDLE_PATH.read_text(encoding="utf-8"))


def load_augustine_confessions_branch_thickening() -> dict[str, Any] | None:
    if not AUGUSTINE_CONFESSIONS_BRANCH_THICKENING_PATH.exists():
        return None
    return json.loads(AUGUSTINE_CONFESSIONS_BRANCH_THICKENING_PATH.read_text(encoding="utf-8"))


def load_augustine_confessions_branch_hardening() -> dict[str, Any] | None:
    if not AUGUSTINE_CONFESSIONS_BRANCH_HARDENING_PATH.exists():
        return None
    return json.loads(AUGUSTINE_CONFESSIONS_BRANCH_HARDENING_PATH.read_text(encoding="utf-8"))


def load_cicero_work_branch_bundle() -> dict[str, Any] | None:
    if not CICERO_WORK_BRANCH_BUNDLE_PATH.exists():
        return None
    return json.loads(CICERO_WORK_BRANCH_BUNDLE_PATH.read_text(encoding="utf-8"))


def load_cicero_branch_hardening_bundle() -> dict[str, Any] | None:
    if not CICERO_BRANCH_HARDENING_BUNDLE_PATH.exists():
        return None
    return json.loads(CICERO_BRANCH_HARDENING_BUNDLE_PATH.read_text(encoding="utf-8"))


def load_platone_work_branch_bundle() -> dict[str, Any] | None:
    if not PLATONE_WORK_BRANCH_BUNDLE_PATH.exists():
        return None
    return json.loads(PLATONE_WORK_BRANCH_BUNDLE_PATH.read_text(encoding="utf-8"))


def load_author_work_book_signal_bundle(author_id: str) -> dict[str, Any] | None:
    path = AUTHORITY_FRONTEND_READY_DIR / f"{author_id}_work_book_signal_bundle.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_ovid_metamorphoses_backbone() -> dict[str, Any] | None:
    if not OVID_METAMORPHOSES_BACKBONE_PATH.exists():
        return None
    return json.loads(OVID_METAMORPHOSES_BACKBONE_PATH.read_text(encoding="utf-8"))


def load_ovid_secondary_works_hardening() -> dict[str, Any] | None:
    if not OVID_SECONDARY_WORKS_HARDENING_PATH.exists():
        return None
    return json.loads(OVID_SECONDARY_WORKS_HARDENING_PATH.read_text(encoding="utf-8"))


def load_seneca_epistulae_branch_hardening() -> dict[str, Any] | None:
    if not SENECA_EPISTULAE_BRANCH_HARDENING_PATH.exists():
        return None
    return json.loads(SENECA_EPISTULAE_BRANCH_HARDENING_PATH.read_text(encoding="utf-8"))


def load_boethius_consolation_branch_hardening() -> dict[str, Any] | None:
    if not BOETHIUS_CONSOLATION_BRANCH_HARDENING_PATH.exists():
        return None
    return json.loads(BOETHIUS_CONSOLATION_BRANCH_HARDENING_PATH.read_text(encoding="utf-8"))


def load_aristotle_de_anima_depth_audit() -> dict[str, Any] | None:
    if not ARISTOTLE_DE_ANIMA_DEPTH_AUDIT_PATH.exists():
        return None
    return json.loads(ARISTOTLE_DE_ANIMA_DEPTH_AUDIT_PATH.read_text(encoding="utf-8"))


def load_paul_corinthians_ambiguity_hold() -> dict[str, Any] | None:
    if not PAUL_CORINTHIANS_AMBIGUITY_HOLD_PATH.exists():
        return None
    return json.loads(PAUL_CORINTHIANS_AMBIGUITY_HOLD_PATH.read_text(encoding="utf-8"))


def load_virgil_aeneid_backbone_hardening() -> dict[str, Any] | None:
    if not VIRGIL_AENEID_BACKBONE_HARDENING_PATH.exists():
        return None
    return json.loads(VIRGIL_AENEID_BACKBONE_HARDENING_PATH.read_text(encoding="utf-8"))


def load_augustine_confessions_wave2_readiness() -> dict[str, Any] | None:
    if not AUGUSTINE_CONFESSIONS_WAVE2_READINESS_PATH.exists():
        return None
    return json.loads(AUGUSTINE_CONFESSIONS_WAVE2_READINESS_PATH.read_text(encoding="utf-8"))


def load_tommaso_summa_wave2_part_spine() -> dict[str, Any] | None:
    if not TOMMASO_SUMMA_WAVE2_PART_SPINE_PATH.exists():
        return None
    return json.loads(TOMMASO_SUMMA_WAVE2_PART_SPINE_PATH.read_text(encoding="utf-8"))


def load_cicero_wave2_normalization() -> dict[str, Any] | None:
    if not CICERO_WAVE2_NORMALIZATION_PATH.exists():
        return None
    return json.loads(CICERO_WAVE2_NORMALIZATION_PATH.read_text(encoding="utf-8"))


def load_seneca_epistulae_wave2_spine() -> dict[str, Any] | None:
    if not SENECA_EPISTULAE_WAVE2_SPINE_PATH.exists():
        return None
    return json.loads(SENECA_EPISTULAE_WAVE2_SPINE_PATH.read_text(encoding="utf-8"))


def load_boethius_consolation_wave2_spine() -> dict[str, Any] | None:
    if not BOETHIUS_CONSOLATION_WAVE2_SPINE_PATH.exists():
        return None
    return json.loads(BOETHIUS_CONSOLATION_WAVE2_SPINE_PATH.read_text(encoding="utf-8"))


def load_aristotle_wave3_book_spine() -> dict[str, Any] | None:
    if not ARISTOTLE_WAVE3_BOOK_SPINE_PATH.exists():
        return None
    return json.loads(ARISTOTLE_WAVE3_BOOK_SPINE_PATH.read_text(encoding="utf-8"))


def load_paul_wave3_epistle_spine() -> dict[str, Any] | None:
    if not PAUL_WAVE3_EPISTLE_SPINE_PATH.exists():
        return None
    return json.loads(PAUL_WAVE3_EPISTLE_SPINE_PATH.read_text(encoding="utf-8"))


def load_virgil_wave3_secondary_backbone() -> dict[str, Any] | None:
    if not VIRGIL_WAVE3_SECONDARY_BACKBONE_PATH.exists():
        return None
    return json.loads(VIRGIL_WAVE3_SECONDARY_BACKBONE_PATH.read_text(encoding="utf-8"))


def load_statius_wave3_thebaid_normalization() -> dict[str, Any] | None:
    if not STATIUS_WAVE3_THEBAID_NORMALIZATION_PATH.exists():
        return None
    return json.loads(STATIUS_WAVE3_THEBAID_NORMALIZATION_PATH.read_text(encoding="utf-8"))


def load_platone_wave3_secondary_work_recheck() -> dict[str, Any] | None:
    if not PLATONE_WAVE3_SECONDARY_WORK_RECHECK_PATH.exists():
        return None
    return json.loads(PLATONE_WAVE3_SECONDARY_WORK_RECHECK_PATH.read_text(encoding="utf-8"))


def load_aristotle_wave4_poetics_de_anima() -> dict[str, Any] | None:
    if not ARISTOTLE_WAVE4_POETICS_DE_ANIMA_PATH.exists():
        return None
    return json.loads(ARISTOTLE_WAVE4_POETICS_DE_ANIMA_PATH.read_text(encoding="utf-8"))


def load_paul_wave4_romans_second_corinthians() -> dict[str, Any] | None:
    if not PAUL_WAVE4_ROMANS_SECOND_CORINTHIANS_PATH.exists():
        return None
    return json.loads(PAUL_WAVE4_ROMANS_SECOND_CORINTHIANS_PATH.read_text(encoding="utf-8"))


def load_virgil_wave4_eclogues() -> dict[str, Any] | None:
    if not VIRGIL_WAVE4_ECLOGUES_PATH.exists():
        return None
    return json.loads(VIRGIL_WAVE4_ECLOGUES_PATH.read_text(encoding="utf-8"))


def load_statius_wave4_achilleid() -> dict[str, Any] | None:
    if not STATIUS_WAVE4_ACHILLEID_PATH.exists():
        return None
    return json.loads(STATIUS_WAVE4_ACHILLEID_PATH.read_text(encoding="utf-8"))


def load_platone_wave4_timeo_leggi() -> dict[str, Any] | None:
    if not PLATONE_WAVE4_TIMEO_LEGGI_PATH.exists():
        return None
    return json.loads(PLATONE_WAVE4_TIMEO_LEGGI_PATH.read_text(encoding="utf-8"))


def load_aristotle_wave5_metaphysics_nicomachean() -> dict[str, Any] | None:
    if not ARISTOTLE_WAVE5_METAPHYSICS_NICOMACHEAN_PATH.exists():
        return None
    return json.loads(ARISTOTLE_WAVE5_METAPHYSICS_NICOMACHEAN_PATH.read_text(encoding="utf-8"))


def load_paul_wave5_first_corinthians_ambiguous() -> dict[str, Any] | None:
    if not PAUL_WAVE5_FIRST_CORINTHIANS_AMBIGUOUS_PATH.exists():
        return None
    return json.loads(PAUL_WAVE5_FIRST_CORINTHIANS_AMBIGUOUS_PATH.read_text(encoding="utf-8"))


def load_virgil_wave5_georgics() -> dict[str, Any] | None:
    if not VIRGIL_WAVE5_GEORGICS_PATH.exists():
        return None
    return json.loads(VIRGIL_WAVE5_GEORGICS_PATH.read_text(encoding="utf-8"))


def load_statius_wave5_thebaid() -> dict[str, Any] | None:
    if not STATIUS_WAVE5_THEBAID_PATH.exists():
        return None
    return json.loads(STATIUS_WAVE5_THEBAID_PATH.read_text(encoding="utf-8"))


def load_platone_wave5_republic() -> dict[str, Any] | None:
    if not PLATONE_WAVE5_REPUBLIC_PATH.exists():
        return None
    return json.loads(PLATONE_WAVE5_REPUBLIC_PATH.read_text(encoding="utf-8"))


def build_branch_bundle_map(bundle: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not bundle:
        return {}
    works = bundle.get("works", [])
    if works:
        return {
            str(work.get("canonical_work") or ""): work
            for work in works
            if str(work.get("canonical_work") or "")
        }
    canonical_work = str(bundle.get("canonical_work") or "")
    if canonical_work:
        return {canonical_work: bundle}
    return {}


def build_primary_branch_spine(branch_candidates: list[dict[str, Any]] | None, limit: int = 5) -> list[dict[str, Any]]:
    spine = []
    for item in (branch_candidates or [])[:limit]:
        spine.append(
            {
                "branch_label": item.get("branch_label"),
                "count": item.get("count", 0),
                "branch_status": item.get("branch_status"),
            }
        )
    return spine


def build_review_first_flat_work_payload(
    author: dict[str, Any],
    occurrence_rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    author_id = str(author.get("author_id") or "")
    spec = REVIEW_FIRST_FLAT_WORK_SPECS.get(author_id)
    if not spec:
        return None

    review_path = Path(spec["review_path"])
    if not review_path.exists():
        return None
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if not review:
        return None

    local_source_policy = str(spec["local_source_policy"])
    anchor_labels = set(spec.get("anchor_labels", set()))
    secondary_labels = set(spec.get("secondary_labels", set()))

    work_cards: list[dict[str, Any]] = []
    grouped_rows: list[dict[str, Any]] = []

    for work in review.get("works", []):
        label = work.get("label")
        if label in anchor_labels:
            work_status = "anchor_preview"
        elif label in secondary_labels:
            work_status = "secondary_preview"
        else:
            work_status = "review_first_preview"
        examples = []
        for item in work.get("examples", [])[:24]:
            examples.append(
                annotate_authority_occurrence(
                    {
                        "work": label,
                        "sample_name": item.get("sample_name"),
                        "cantica": item.get("cantica"),
                        "canto": item.get("canto"),
                        "line_info": item.get("line_info"),
                        "commentary_name": item.get("commentary_name"),
                        "raw_mention": " · ".join(
                            part
                            for part in [item.get("author_surface"), item.get("work_surface")]
                            if str(part or "").strip()
                        )
                        or item.get("author_surface")
                        or label,
                        "resolution_status": "work_context_preview",
                        "confidence": 0.66,
                        "raw_passage": None,
                        "commentary_record_id": None,
                        "result_url": item.get("result_url"),
                    }
                )
            )

        work_cards.append(
            {
                "canonical_work": label,
                "count": work.get("row_count", 0),
                "resolved_author_and_work": 0,
                "resolved_work_plus_inferred_author": work.get("row_count", 0),
                "passage_mentions": 0,
                "work_status": work_status,
                "local_source_policy": "local_commentary_source_only",
                "sample_occurrence_count": len(examples),
                "sample_occurrences_path": f"./data/authority_flat_objects/{author['author_id']}.json",
            }
        )
        grouped_rows.append(
            {
                "canonical_work": label,
                "work_status": work_status,
                "total_mentions": work.get("row_count", 0),
                "resolved_author_and_work": 0,
                "resolved_work_plus_inferred_author": work.get("row_count", 0),
                "passage_mentions": 0,
                "occurrence_sample_count": len(examples),
                "occurrences": examples,
            }
        )

    unresolved_occurrences = [annotate_authority_occurrence(item) for item in occurrence_rows[:24]]
    anchor_calibration = load_platone_anchor_calibration() if author_id == "platone" else None
    bundle_review_path = spec.get("bundle_review_path")
    work_bundle_review = load_optional_json(bundle_review_path) if isinstance(bundle_review_path, Path) else None
    if author_id == "platone":
        anchor_hardening_bundle = load_platone_anchor_hardening_bundle()
    elif author_id == "tommaso_daquino":
        anchor_hardening_bundle = load_tommaso_anchor_hardening_bundle()
    else:
        anchor_hardening_bundle = None
    work_branch_bundle = load_platone_work_branch_bundle() if author_id == "platone" else None
    partial_tree_payload = (
        load_optional_json(TOMMASO_SUMMA_PARTIAL_TREE_PATH) if author_id == "tommaso_daquino" else None
    )
    locator_calibration = load_tommaso_summa_locator_calibration() if author_id == "tommaso_daquino" else None
    tommaso_wave2 = load_tommaso_summa_wave2_part_spine() if author_id == "tommaso_daquino" else None
    platone_wave3 = load_platone_wave3_secondary_work_recheck() if author_id == "platone" else None
    platone_wave4 = load_platone_wave4_timeo_leggi() if author_id == "platone" else None
    platone_wave5 = load_platone_wave5_republic() if author_id == "platone" else None
    ovid_backbone = load_ovid_metamorphoses_backbone() if author_id == "ovid" else None
    ovid_secondary_hardening = load_ovid_secondary_works_hardening() if author_id == "ovid" else None
    seneca_wave2 = load_seneca_epistulae_wave2_spine() if author_id == "seneca" else None
    boethius_wave2 = load_boethius_consolation_wave2_spine() if author_id == "boethius" else None
    if author_id == "ovid":
        work_branch_bundle = load_author_work_book_signal_bundle(author_id)
    work_bundle_map = {}
    if work_bundle_review:
        work_bundle_map = {row["label"]: row for row in work_bundle_review.get("works", [])}
    work_branch_bundle_map = build_branch_bundle_map(work_branch_bundle)
    platone_wave3_map = {
        row.get("canonical_work"): row
        for row in (platone_wave3 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    platone_wave4_map = {
        row.get("canonical_work"): row
        for row in (platone_wave4 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    platone_wave5_map = {
        row.get("canonical_work"): row
        for row in (platone_wave5 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    hardening_bucket_map = {}
    if author_id == "platone" and anchor_hardening_bundle:
        for key in ("timeo_hardening", "leggi_after_timeo"):
            payload = anchor_hardening_bundle.get(key) or {}
            label = str(payload.get("label") or "")
            if label:
                hardening_bucket_map[label] = [
                    {
                        "bucket": bucket.get("bucket"),
                        "row_count": bucket.get("row_count", 0),
                    }
                    for bucket in payload.get("buckets", [])
                ]
    elif author_id == "tommaso_daquino" and anchor_hardening_bundle:
        payload = anchor_hardening_bundle.get("summa_hardening") or {}
        label = str(payload.get("label") or "")
        if label:
            hardening_bucket_map[label] = [
                {
                    "bucket": bucket.get("bucket"),
                    "row_count": bucket.get("row_count", 0),
                }
                for bucket in payload.get("buckets", [])
            ]
    ovid_secondary_map = {
        row.get("canonical_work"): row
        for row in (ovid_secondary_hardening or {}).get("focus_works", [])
        if row.get("canonical_work")
    }

    for card in work_cards:
        bundle = work_bundle_map.get(card["canonical_work"])
        if bundle:
            card["work_tier"] = bundle.get("tier")
            card["calibration_status"] = bundle.get("calibration_status")
            card["recommended_next_step"] = bundle.get("recommended_next_step")
            card["calibration_why"] = bundle.get("why", [])
        hardening = hardening_bucket_map.get(card["canonical_work"])
        if hardening:
            card["hardening_bucket_counts"] = hardening
        branch_bundle = work_branch_bundle_map.get(card["canonical_work"])
        if branch_bundle:
            card["branch_bundle_status"] = branch_bundle.get("branch_status")
            card["branch_bundle_why"] = branch_bundle.get("why", [])
            card["branch_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in branch_bundle.get("branch_candidates", [])
            ]
            card["primary_branch_spine"] = build_primary_branch_spine(card["branch_candidates"])
        if author_id == "platone":
            wave3_work = platone_wave3_map.get(card["canonical_work"])
            if wave3_work:
                card["wave3_secondary_status"] = wave3_work.get("wave3_status")
                card["wave3_secondary_why"] = wave3_work.get("why", [])
                card["wave3_branch_candidate_count"] = wave3_work.get("branch_candidate_count", 0)
            wave4_work = platone_wave4_map.get(card["canonical_work"])
            if wave4_work:
                card["wave4_completion_status"] = wave4_work.get("wave4_status")
                card["wave4_completion_why"] = wave4_work.get("why", [])
                card["wave4_focus_metrics"] = wave4_work.get("metrics", {})
                card["wave4_primary_spine"] = wave4_work.get("primary_spine", [])
            wave5_work = platone_wave5_map.get(card["canonical_work"])
            if wave5_work:
                card["wave5_completion_status"] = wave5_work.get("wave5_status")
                card["wave5_completion_why"] = wave5_work.get("why", [])
                card["wave5_focus_metrics"] = wave5_work.get("metrics", {})
                card["wave5_primary_spine"] = wave5_work.get("primary_spine", [])
        if author_id == "ovid" and card["canonical_work"] == "Metamorphoses" and ovid_backbone:
            metrics = ovid_backbone.get("metrics", {})
            card["backbone_status"] = ovid_backbone.get("current_status")
            card["backbone_next_step"] = ovid_backbone.get("recommended_next_step")
            card["backbone_why"] = ovid_backbone.get("why", [])
            card["backbone_metrics"] = {
                "metamorphoses_row_count": metrics.get("metamorphoses_row_count", 0),
                "raw_branch_candidate_count": metrics.get("raw_branch_candidate_count", 0),
                "normalized_backbone_book_count": metrics.get("normalized_backbone_book_count", 0),
            }
            card["normalized_backbone_books"] = [
                {
                    "label": item.get("label"),
                    "book_number": item.get("book_number"),
                    "count": item.get("count", 0),
                    "merged_from": item.get("merged_from", []),
                    "branch_statuses": item.get("branch_statuses", []),
                }
                for item in ovid_backbone.get("normalized_backbone_books", [])
            ]
        if author_id == "ovid":
            secondary = ovid_secondary_map.get(card["canonical_work"])
            if secondary:
                card["hardening_status"] = secondary.get("hardening_status")
                card["hardening_next_step"] = secondary.get("recommended_next_step")
                card["focus_branch_candidates"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in secondary.get("focus_candidates", [])
                ]
        if (
            author_id == "tommaso_daquino"
            and card["canonical_work"] == "Summa theologiae"
        ):
            if partial_tree_payload:
                card["partial_tree_available"] = True
                card["partial_tree_kind"] = partial_tree_payload.get("tree_mode")
                card["partial_tree_work_id"] = partial_tree_payload.get("work_id")
                card["partial_tree_expected_path"] = "./data/authority_partial_trees/tommaso_daquino__summa_theologiae.json"
            if locator_calibration:
                metrics = locator_calibration.get("metrics", {})
                card["locator_calibration_status"] = locator_calibration.get("current_status")
                card["locator_calibration_next_step"] = locator_calibration.get("recommended_next_step")
                card["locator_calibration_why"] = locator_calibration.get("why", [])
                card["locator_calibration_metrics"] = {
                    "explicit_part_rows": metrics.get("explicit_part_rows", 0),
                    "explicit_part_question_rows": metrics.get("explicit_part_question_rows", 0),
                    "explicit_part_question_article_rows": metrics.get("explicit_part_question_article_rows", 0),
                    "unplaced_under_work_count": metrics.get("unplaced_under_work_count", 0),
                    "part_node_count": metrics.get("part_node_count", 0),
                    "question_node_count": metrics.get("question_node_count", 0),
                    "article_node_count": metrics.get("article_node_count", 0),
                }
                card["live_part_summary"] = [
                    {
                        "part_label": part.get("part_label"),
                        "occurrence_count": part.get("occurrence_count", 0),
                        "question_node_count": part.get("question_node_count", 0),
                        "article_node_count": part.get("article_node_count", 0),
                        "unplaced_under_part_count": part.get("unplaced_under_part_count", 0),
                    }
                    for part in locator_calibration.get("live_parts", [])
                    if part.get("occurrence_count", 0) or part.get("question_node_count", 0) or part.get("article_node_count", 0)
                ]
            if tommaso_wave2:
                card["wave2_part_spine_status"] = tommaso_wave2.get("current_status")
                card["wave2_part_spine_next_step"] = tommaso_wave2.get("recommended_next_step")
                card["active_part_spine"] = [
                    {
                        "part_label": part.get("part_label"),
                        "occurrence_count": part.get("occurrence_count", 0),
                        "unplaced_under_part_count": part.get("unplaced_under_part_count", 0),
                        "question_count": part.get("question_count", 0),
                        "top_questions": part.get("top_questions", [])[:5],
                    }
                    for part in tommaso_wave2.get("active_part_spine", [])
                ]
        if author_id == "seneca" and card["canonical_work"] == "Epistulae morales" and seneca_wave2:
            card["wave2_spine_status"] = seneca_wave2.get("current_status")
            card["wave2_spine_next_step"] = seneca_wave2.get("recommended_next_step")
            card["primary_letter_spine"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in seneca_wave2.get("primary_letter_spine", [])
            ]
            card["secondary_book_like_signals"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in seneca_wave2.get("secondary_book_like_signals", [])
            ]
        if author_id == "boethius" and card["canonical_work"] == "Consolation of Philosophy" and boethius_wave2:
            card["wave2_spine_status"] = boethius_wave2.get("current_status")
            card["wave2_spine_next_step"] = boethius_wave2.get("recommended_next_step")
            card["clean_book_spine"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in boethius_wave2.get("clean_book_spine", [])
            ]
            card["quarantined_noise"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in boethius_wave2.get("quarantined_noise", [])
            ]

    for row in grouped_rows:
        bundle = work_bundle_map.get(row["canonical_work"])
        if bundle:
            row["work_tier"] = bundle.get("tier")
            row["calibration_status"] = bundle.get("calibration_status")
            row["recommended_next_step"] = bundle.get("recommended_next_step")
        hardening = hardening_bucket_map.get(row["canonical_work"])
        if hardening:
            row["hardening_bucket_counts"] = hardening
        branch_bundle = work_branch_bundle_map.get(row["canonical_work"])
        if branch_bundle:
            row["branch_bundle_status"] = branch_bundle.get("branch_status")
            row["branch_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in branch_bundle.get("branch_candidates", [])
            ]
            row["primary_branch_spine"] = build_primary_branch_spine(row["branch_candidates"])
        if author_id == "platone":
            wave3_work = platone_wave3_map.get(row["canonical_work"])
            if wave3_work:
                row["wave3_secondary_status"] = wave3_work.get("wave3_status")
                row["wave3_branch_candidate_count"] = wave3_work.get("branch_candidate_count", 0)
            wave4_work = platone_wave4_map.get(row["canonical_work"])
            if wave4_work:
                row["wave4_completion_status"] = wave4_work.get("wave4_status")
                row["wave4_focus_metrics"] = wave4_work.get("metrics", {})
                row["wave4_primary_spine"] = wave4_work.get("primary_spine", [])
            wave5_work = platone_wave5_map.get(row["canonical_work"])
            if wave5_work:
                row["wave5_completion_status"] = wave5_work.get("wave5_status")
                row["wave5_focus_metrics"] = wave5_work.get("metrics", {})
                row["wave5_primary_spine"] = wave5_work.get("primary_spine", [])
        if author_id == "ovid" and row["canonical_work"] == "Metamorphoses" and ovid_backbone:
            metrics = ovid_backbone.get("metrics", {})
            row["backbone_status"] = ovid_backbone.get("current_status")
            row["backbone_metrics"] = {
                "normalized_backbone_book_count": metrics.get("normalized_backbone_book_count", 0),
                "raw_branch_candidate_count": metrics.get("raw_branch_candidate_count", 0),
            }
            row["normalized_backbone_books"] = [
                {
                    "label": item.get("label"),
                    "count": item.get("count", 0),
                    "examples": [],
                }
                for item in ovid_backbone.get("normalized_backbone_books", [])[:8]
            ]
        if author_id == "ovid":
            secondary = ovid_secondary_map.get(row["canonical_work"])
            if secondary:
                row["hardening_status"] = secondary.get("hardening_status")
                row["focus_branch_candidates"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                        "examples": item.get("examples", [])[:3],
                    }
                    for item in secondary.get("focus_candidates", [])
                ]
        if (
            author_id == "tommaso_daquino"
            and row["canonical_work"] == "Summa theologiae"
        ):
            if partial_tree_payload:
                row["partial_tree_available"] = True
                row["partial_tree_kind"] = partial_tree_payload.get("tree_mode")
                row["partial_tree_work_id"] = partial_tree_payload.get("work_id")
                row["partial_tree_expected_path"] = "./data/authority_partial_trees/tommaso_daquino__summa_theologiae.json"
            if locator_calibration:
                metrics = locator_calibration.get("metrics", {})
                row["locator_calibration_status"] = locator_calibration.get("current_status")
                row["locator_calibration_metrics"] = {
                    "explicit_part_rows": metrics.get("explicit_part_rows", 0),
                    "explicit_part_question_rows": metrics.get("explicit_part_question_rows", 0),
                    "explicit_part_question_article_rows": metrics.get("explicit_part_question_article_rows", 0),
                    "unplaced_under_work_count": metrics.get("unplaced_under_work_count", 0),
                }
                row["live_part_summary"] = [
                    {
                        "part_label": part.get("part_label"),
                        "occurrence_count": part.get("occurrence_count", 0),
                        "question_node_count": part.get("question_node_count", 0),
                        "article_node_count": part.get("article_node_count", 0),
                    }
                    for part in locator_calibration.get("live_parts", [])
                    if part.get("occurrence_count", 0) or part.get("question_node_count", 0) or part.get("article_node_count", 0)
                ]
            if tommaso_wave2:
                row["wave2_part_spine_status"] = tommaso_wave2.get("current_status")
                row["active_part_spine"] = [
                    {
                        "part_label": part.get("part_label"),
                        "occurrence_count": part.get("occurrence_count", 0),
                        "question_count": part.get("question_count", 0),
                    }
                    for part in tommaso_wave2.get("active_part_spine", [])
                ]
        if author_id == "seneca" and row["canonical_work"] == "Epistulae morales" and seneca_wave2:
            row["wave2_spine_status"] = seneca_wave2.get("current_status")
            row["primary_letter_spine"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in seneca_wave2.get("primary_letter_spine", [])
            ]
        if author_id == "boethius" and row["canonical_work"] == "Consolation of Philosophy" and boethius_wave2:
            row["wave2_spine_status"] = boethius_wave2.get("current_status")
            row["clean_book_spine"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in boethius_wave2.get("clean_book_spine", [])
            ]

    rollout_kind = "review_first_flat_work_object"
    local_source_policy = local_source_policy
    if author_id == "platone" and anchor_hardening_bundle:
        rollout_kind = "partial_flat_work_object"
        local_source_policy = (
            "Platone is a partial flat-work object: open local commentary source text first, "
            "treat Timaeus / Timeo as the primary anchor, keep Laws / Leggi as a caveated second anchor, "
            "and hold the remaining Platonic works in a visible secondary/tertiary bundle."
        )
    elif author_id == "tommaso_daquino" and (anchor_hardening_bundle or locator_calibration or partial_tree_payload):
        rollout_kind = "partial_flat_work_object"
        local_source_policy = (
            "Tommaso d'Aquino is a partial flat-work object: open local commentary source text first, "
            "treat Summa theologiae as the primary scholastic anchor with live locator pressure, "
            "and keep Contra Gentiles / Sentences / Quaestio de anima visible as secondary layers."
        )

    return {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "shell_contract": {
            "ready_promise": "window.DDPAppShellReady",
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "display_contract": {
            "root_display_mode": "work_direct_children",
            "hide_internal_schema_node": True,
            "work_root_children": [
                "work_cards",
                "work_occurrence_samples",
                "unresolved_occurrences",
            ],
            "display_note": "Frontends should open the author's works layer directly into work cards and occurrence buckets; do not render an extra schema/intermediate node.",
        },
        "work_branches_contract": build_work_branches_contract(
            "partial_candidate_branches" if rollout_kind == "partial_flat_work_object" else "review_first_candidate_branches",
            visible_children=[
                "work_cards",
                "work_occurrence_samples",
                "unresolved_occurrences",
            ],
            branch_note=(
                "Each work opens first into branch candidates and occurrence buckets; anchor and secondary bundles are now partial-object growth lanes, not full tree nodes."
                if rollout_kind == "partial_flat_work_object"
                else "Each work opens first into branch candidates and occurrence buckets; anchor and secondary bundles are still review-shaped, not full tree nodes."
            ),
            evidence_labels=[
                "anchor_preview",
                "secondary_preview",
                "review_first_preview",
                "unresolved_occurrences",
            ],
        ),
        "author_id": author.get("author_id"),
        "canonical_name": author.get("canonical_name"),
        "display_name": author.get("display_name") or authority_display_name(author.get("author_id"), author.get("canonical_name")),
        "public_slug_it": author.get("public_slug_it") or authority_public_slug(author.get("author_id"), author.get("canonical_name")),
        "frontend_status": author.get("frontend_status"),
        "frontend_notes": author.get("frontend_notes"),
        "object_rollout_status": author.get("object_rollout_status"),
        "entry_mode": author.get("entry_mode"),
        "works_layer_mode": "flat_work_overview",
        "rollout_kind": rollout_kind,
        "local_source_policy": local_source_policy,
        "overview": {
            "work_count": len(work_cards),
            "sample_occurrence_count": sum(row["occurrence_sample_count"] for row in grouped_rows),
            "stable_work_count": 0,
            "inference_heavy_work_count": 0,
            "passage_present_work_count": 0,
            "partial_work_count": len(work_cards),
            "review_first_work_count": len(work_cards),
            "anchor_work_count": sum(1 for row in work_cards if row.get("work_status") == "anchor_preview"),
            "secondary_work_count": sum(1 for row in work_cards if row.get("work_status") == "secondary_preview"),
            "tier_counts": work_bundle_review.get("summary", {}).get("tier_counts", {}) if work_bundle_review else {},
            "anchor_hardening_available": bool(anchor_hardening_bundle),
            "primary_anchor_label": spec.get("primary_anchor_label") if anchor_hardening_bundle else None,
            "partial_tree_count": 1 if partial_tree_payload else 0,
            "branch_bundle_available": bool(work_branch_bundle),
            "branch_candidate_count": sum(
                len(work.get("branch_candidates", [])) for work in work_branch_bundle.get("works", [])
            ) if work_branch_bundle else 0,
            "work_hardening_available": bool(ovid_backbone or ovid_secondary_hardening or seneca_wave2 or boethius_wave2),
            "normalized_backbone_book_count": (ovid_backbone or {}).get("metrics", {}).get("normalized_backbone_book_count", 0),
            "hardening_focus_work_count": (1 if ovid_backbone else 0) + len((ovid_secondary_hardening or {}).get("focus_works", [])),
            "locator_calibration_available": bool(locator_calibration),
            "locator_question_node_count": (locator_calibration or {}).get("metrics", {}).get("question_node_count", 0),
            "locator_article_node_count": (locator_calibration or {}).get("metrics", {}).get("article_node_count", 0),
            "evidence_backed_part_count": sum(
                1 for part in (locator_calibration or {}).get("live_parts", []) if part.get("occurrence_count", 0) > 0
            ),
            "active_part_spine_count": len((tommaso_wave2 or {}).get("active_part_spine", [])),
            "primary_letter_spine_count": len((seneca_wave2 or {}).get("primary_letter_spine", [])),
            "clean_book_spine_count": len((boethius_wave2 or {}).get("clean_book_spine", [])),
            "secondary_work_hold_count": len((platone_wave3 or {}).get("focus_works", [])),
            "wave4_focus_work_count": len((platone_wave4 or {}).get("focus_works", [])),
            "wave5_focus_work_count": len((platone_wave5 or {}).get("focus_works", [])),
        },
        "anchor_calibration": anchor_calibration,
        "work_bundle_review": work_bundle_review,
        "work_branch_bundle": work_branch_bundle,
        "anchor_hardening_bundle": anchor_hardening_bundle,
        "locator_calibration": locator_calibration,
        "wave3_secondary_work_recheck": platone_wave3,
        "wave4_focus_bundle": platone_wave4,
        "wave5_focus_bundle": platone_wave5,
        "work_hardening_bundle": {
            "metamorphoses_backbone": ovid_backbone,
            "ovid_secondary_works_hardening": ovid_secondary_hardening,
            "seneca_epistulae_wave2_spine": seneca_wave2,
            "boethius_consolation_wave2_spine": boethius_wave2,
        }
        if ovid_backbone or ovid_secondary_hardening or seneca_wave2 or boethius_wave2
        else None,
        "wave2_part_spine": tommaso_wave2,
        "partial_trees": (
            [
                {
                    "work_id": partial_tree_payload.get("work_id"),
                    "canonical_work": partial_tree_payload.get("canonical_work"),
                    "tree_mode": partial_tree_payload.get("tree_mode"),
                    "path": "./data/authority_partial_trees/tommaso_daquino__summa_theologiae.json",
                    "root_display_mode": partial_tree_payload.get("display_contract", {}).get("root_display_mode"),
                    "hide_internal_schema_node": partial_tree_payload.get("display_contract", {}).get(
                        "hide_internal_schema_node"
                    ),
                }
            ]
            if partial_tree_payload
            else []
        ),
        "work_cards": work_cards,
        "work_occurrence_samples": grouped_rows,
        "unresolved_occurrence_sample_count": len(unresolved_occurrences),
        "unresolved_occurrences": unresolved_occurrences,
    }


def build_authority_flat_work_payload(
    author: dict[str, Any],
    work_entry: dict[str, Any],
    occurrence_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    author_id = str(author.get("author_id") or "")
    rollout_kind = "stable_flat_work_object"
    local_source_policy = "Authority flat-work drill-down should open local commentary source text first; result_url is provenance only."
    if author_id == "augustine":
        rollout_kind = "partial_flat_work_object"
        local_source_policy = "Augustine remains a partial flat-work object: open local commentary source text first, keep work overview conservative, and do not imply a full works tree."
    elif author_id in {"ovid", "boethius", "seneca"}:
        rollout_kind = "partial_flat_work_object"
        local_source_policy = "This partial flat-work object should open local commentary source text first and keep work-root branches visible without implying a full locator tree."
    partial_tree_payloads = {}
    augustine_pattern_bundle = None
    work_branch_bundle = None
    confessions_hardening = None
    confessions_wave2 = None
    ovid_backbone = None
    ovid_secondary_hardening = None
    cicero_hardening_bundle = None
    cicero_wave2 = None
    seneca_hardening = None
    seneca_wave2 = None
    boethius_hardening = None
    boethius_wave2 = None
    if author_id == "augustine":
        city_payload = load_optional_json(AUGUSTINE_CITY_OF_GOD_PARTIAL_TREE_PATH)
        if city_payload:
            partial_tree_payloads["City of God"] = city_payload
        augustine_pattern_bundle = load_augustine_work_pattern_bundle()
        work_branch_bundle = load_augustine_confessions_branch_thickening()
        confessions_hardening = load_augustine_confessions_branch_hardening()
        confessions_wave2 = load_augustine_confessions_wave2_readiness()
    elif author_id == "cicero":
        work_branch_bundle = load_cicero_work_branch_bundle()
        cicero_hardening_bundle = load_cicero_branch_hardening_bundle()
        cicero_wave2 = load_cicero_wave2_normalization()
    elif author_id in {"ovid", "boethius", "seneca"}:
        work_branch_bundle = load_author_work_book_signal_bundle(author_id)
        if author_id == "ovid":
            ovid_backbone = load_ovid_metamorphoses_backbone()
            ovid_secondary_hardening = load_ovid_secondary_works_hardening()
        elif author_id == "seneca":
            seneca_hardening = load_seneca_epistulae_branch_hardening()
            seneca_wave2 = load_seneca_epistulae_wave2_spine()
        elif author_id == "boethius":
            boethius_hardening = load_boethius_consolation_branch_hardening()
            boethius_wave2 = load_boethius_consolation_wave2_spine()
    branch_bundle_map = build_branch_bundle_map(work_branch_bundle)
    cicero_hardening_map = {
        row.get("canonical_work"): row
        for row in (cicero_hardening_bundle or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    ovid_secondary_map = {
        row.get("canonical_work"): row
        for row in (ovid_secondary_hardening or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    if work_branch_bundle and work_branch_bundle.get("works"):
        branch_candidate_count = sum(
            len(work.get("branch_candidates", []))
            for work in work_branch_bundle.get("works", [])
        )
    elif work_branch_bundle:
        branch_candidate_count = len(work_branch_bundle.get("branch_candidates", []))
    else:
        branch_candidate_count = 0

    work_cards = []
    grouped_occurrences: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unresolved_occurrences: list[dict[str, Any]] = []

    for row in occurrence_rows:
        annotated = annotate_authority_occurrence(row)
        work_name = str(annotated.get("work") or "").strip()
        if work_name:
            grouped_occurrences[work_name].append(annotated)
        else:
            unresolved_occurrences.append(annotated)

    for work in work_entry.get("works", []) or []:
        work_name = work.get("canonical_work")
        grouped = grouped_occurrences.get(work_name, [])
        resolved = int(work.get("resolved_author_and_work", 0) or 0)
        inferred = int(work.get("resolved_work_plus_inferred_author", 0) or 0)
        passage = int(work.get("passage_mentions", 0) or 0)
        status = "stable"
        if inferred > resolved:
            status = "inference_heavy"
        elif passage and passage >= max(12, resolved // 3):
            status = "passage_present"
        if author_id == "augustine" and work_name == "Confessions":
            status = "partial"
        work_cards.append(
            {
                **work,
                "work_status": status,
                "local_source_policy": "local_commentary_source_only",
                "sample_occurrence_count": len(grouped),
                "sample_occurrences_path": f"./data/authority_flat_objects/{author['author_id']}.json",
            }
        )

    grouped_rows = []
    for work in work_cards:
        work_name = work.get("canonical_work")
        grouped = grouped_occurrences.get(work_name, [])
        grouped.sort(
            key=lambda item: (
                f"{str(item.get('cantica') or '').lower()}{item.get('canto')}",
                item.get("line_number") or 0,
                str(item.get("commentary_name") or "").lower(),
            )
        )
        grouped_rows.append(
            {
                "canonical_work": work_name,
                "work_status": work.get("work_status"),
                "total_mentions": work.get("count", 0),
                "resolved_author_and_work": work.get("resolved_author_and_work", 0),
                "resolved_work_plus_inferred_author": work.get("resolved_work_plus_inferred_author", 0),
                "passage_mentions": work.get("passage_mentions", 0),
                "occurrence_sample_count": len(grouped),
                "occurrences": grouped[:48],
            }
        )

    for work in work_cards:
        partial_tree_payload = partial_tree_payloads.get(work.get("canonical_work"))
        if partial_tree_payload:
            work["partial_tree_available"] = True
            work["partial_tree_kind"] = partial_tree_payload.get("tree_mode")
            work["partial_tree_work_id"] = partial_tree_payload.get("work_id")
            work["partial_tree_expected_path"] = "./data/authority_partial_trees/augustine__city_of_god.json"
        if augustine_pattern_bundle:
            for bundle_work in augustine_pattern_bundle.get("works", []):
                if bundle_work.get("canonical_work") != work.get("canonical_work"):
                    continue
                work["pattern_bundle_status"] = bundle_work.get("status")
                work["pattern_bundle_why"] = bundle_work.get("why", [])
                work["recommended_next_step"] = bundle_work.get("recommended_next_step")
                candidate_clusters = bundle_work.get("candidate_clusters")
                if candidate_clusters:
                    work["candidate_locator_clusters"] = [
                        {
                            "candidate_label": row.get("candidate_label"),
                            "count": row.get("count", 0),
                            "cluster_status": row.get("cluster_status"),
                        }
                        for row in candidate_clusters
                    ]
                current_shape = bundle_work.get("current_shape")
                if current_shape:
                    work["current_shape"] = current_shape
        if author_id == "augustine" and work.get("canonical_work") == "Confessions" and confessions_hardening:
            metrics = confessions_hardening.get("metrics", {})
            work["hardening_status"] = confessions_hardening.get("current_status")
            work["hardening_next_step"] = confessions_hardening.get("recommended_next_step")
            work["hardening_why"] = confessions_hardening.get("why", [])
            work["hardening_metrics"] = {
                "branch_candidate_count": metrics.get("branch_candidate_count", 0),
                "stable_branch_candidate_count": metrics.get("stable_branch_candidate_count", 0),
                "isolated_branch_candidate_count": metrics.get("isolated_branch_candidate_count", 0),
                "covered_branch_rows": metrics.get("covered_branch_rows", 0),
                "covered_branch_rows_percent": metrics.get("covered_branch_rows_percent", 0),
            }
            work["stable_branch_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in confessions_hardening.get("stable_branch_candidates", [])
            ]
            if confessions_wave2:
                work["promotion_readiness_status"] = confessions_wave2.get("current_status")
                work["promotion_readiness_next_step"] = confessions_wave2.get("recommended_next_step")
                work["promotion_ready_branches"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in confessions_wave2.get("promotion_ready_branches", [])
                ]
                work["isolated_hold_branches"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in confessions_wave2.get("isolated_hold_branches", [])
                ]
        if author_id == "ovid" and work.get("canonical_work") == "Metamorphoses" and ovid_backbone:
            metrics = ovid_backbone.get("metrics", {})
            work["backbone_status"] = ovid_backbone.get("current_status")
            work["backbone_next_step"] = ovid_backbone.get("recommended_next_step")
            work["backbone_why"] = ovid_backbone.get("why", [])
            work["backbone_metrics"] = {
                "metamorphoses_row_count": metrics.get("metamorphoses_row_count", 0),
                "raw_branch_candidate_count": metrics.get("raw_branch_candidate_count", 0),
                "normalized_backbone_book_count": metrics.get("normalized_backbone_book_count", 0),
            }
            work["normalized_backbone_books"] = [
                {
                    "label": item.get("label"),
                    "book_number": item.get("book_number"),
                    "count": item.get("count", 0),
                    "merged_from": item.get("merged_from", []),
                    "branch_statuses": item.get("branch_statuses", []),
                }
                for item in ovid_backbone.get("normalized_backbone_books", [])
            ]
        if author_id == "ovid":
            secondary = ovid_secondary_map.get(work.get("canonical_work"))
            if secondary:
                work["hardening_status"] = secondary.get("hardening_status")
                work["hardening_next_step"] = secondary.get("recommended_next_step")
                work["focus_branch_candidates"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in secondary.get("focus_candidates", [])
                ]
        if author_id == "cicero":
            hardening = cicero_hardening_map.get(work.get("canonical_work"))
            if hardening:
                work["hardening_status"] = hardening.get("hardening_status")
                work["hardening_next_step"] = hardening.get("recommended_next_step")
                work["hardening_why"] = hardening.get("why", [])
                work["focus_branch_candidates"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in hardening.get("focus_candidates", [])
                ]
            if cicero_wave2 and work.get("canonical_work") == "De amicitia":
                work["normalization_status"] = cicero_wave2.get("current_status")
                work["normalization_next_step"] = cicero_wave2.get("recommended_next_step")
                work["normalized_branch_clusters"] = [
                    {
                        "normalized_label": item.get("normalized_label"),
                        "count": item.get("count", 0),
                        "surface_forms": item.get("surface_forms", []),
                    }
                    for item in cicero_wave2.get("de_amicitia_normalized_clusters", [])
                ]
            if cicero_wave2 and work.get("canonical_work") == "De officiis":
                work["wave2_focus_branches"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in cicero_wave2.get("de_officiis_focus", [])
                ]
            if cicero_wave2 and work.get("canonical_work") == "De senectute":
                work["wave2_focus_branches"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in cicero_wave2.get("de_senectute_focus", [])
                ]
        if author_id == "seneca" and work.get("canonical_work") == "Epistulae morales" and seneca_hardening:
            metrics = seneca_hardening.get("metrics", {})
            work["hardening_status"] = seneca_hardening.get("current_status")
            work["hardening_next_step"] = seneca_hardening.get("recommended_next_step")
            work["hardening_why"] = seneca_hardening.get("why", [])
            work["hardening_metrics"] = metrics
            work["letter_backbone_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in seneca_hardening.get("letter_backbone_candidates", [])
            ]
            work["book_like_signal_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in seneca_hardening.get("book_like_signal_candidates", [])
            ]
            if seneca_wave2:
                work["wave2_spine_status"] = seneca_wave2.get("current_status")
                work["wave2_spine_next_step"] = seneca_wave2.get("recommended_next_step")
                work["primary_letter_spine"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in seneca_wave2.get("primary_letter_spine", [])
                ]
                work["secondary_book_like_signals"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in seneca_wave2.get("secondary_book_like_signals", [])
                ]
        if author_id == "boethius" and work.get("canonical_work") == "Consolation of Philosophy" and boethius_hardening:
            metrics = boethius_hardening.get("metrics", {})
            work["hardening_status"] = boethius_hardening.get("current_status")
            work["hardening_next_step"] = boethius_hardening.get("recommended_next_step")
            work["hardening_why"] = boethius_hardening.get("why", [])
            work["hardening_metrics"] = metrics
            work["evidence_backed_books"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "book_number": item.get("book_number"),
                }
                for item in boethius_hardening.get("evidence_backed_books", [])
            ]
            work["noisy_book_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in boethius_hardening.get("noisy_book_candidates", [])
            ]
            if boethius_wave2:
                work["wave2_spine_status"] = boethius_wave2.get("current_status")
                work["wave2_spine_next_step"] = boethius_wave2.get("recommended_next_step")
                work["clean_book_spine"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in boethius_wave2.get("clean_book_spine", [])
                ]
                work["quarantined_noise"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in boethius_wave2.get("quarantined_noise", [])
                ]
        branch_bundle = branch_bundle_map.get(work.get("canonical_work"))
        if branch_bundle:
            work["branch_bundle_status"] = branch_bundle.get("branch_status")
            work["branch_bundle_why"] = branch_bundle.get("why", [])
            work["branch_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                }
                for item in branch_bundle.get("branch_candidates", [])
            ]
            work["primary_branch_spine"] = build_primary_branch_spine(work["branch_candidates"])
            if branch_bundle.get("recommended_next_step"):
                work["branch_bundle_next_step"] = branch_bundle.get("recommended_next_step")

    for row in grouped_rows:
        partial_tree_payload = partial_tree_payloads.get(row.get("canonical_work"))
        if partial_tree_payload:
            row["partial_tree_available"] = True
            row["partial_tree_kind"] = partial_tree_payload.get("tree_mode")
            row["partial_tree_work_id"] = partial_tree_payload.get("work_id")
            row["partial_tree_expected_path"] = "./data/authority_partial_trees/augustine__city_of_god.json"
        if augustine_pattern_bundle:
            for bundle_work in augustine_pattern_bundle.get("works", []):
                if bundle_work.get("canonical_work") != row.get("canonical_work"):
                    continue
                row["pattern_bundle_status"] = bundle_work.get("status")
                row["recommended_next_step"] = bundle_work.get("recommended_next_step")
                candidate_clusters = bundle_work.get("candidate_clusters")
                if candidate_clusters:
                    row["candidate_locator_clusters"] = [
                        {
                            "candidate_label": item.get("candidate_label"),
                            "count": item.get("count", 0),
                            "cluster_status": item.get("cluster_status"),
                            "examples": item.get("examples", [])[:3],
                        }
                        for item in candidate_clusters
                    ]
        if author_id == "augustine" and row.get("canonical_work") == "Confessions" and confessions_hardening:
            metrics = confessions_hardening.get("metrics", {})
            row["hardening_status"] = confessions_hardening.get("current_status")
            row["hardening_metrics"] = {
                "stable_branch_candidate_count": metrics.get("stable_branch_candidate_count", 0),
                "isolated_branch_candidate_count": metrics.get("isolated_branch_candidate_count", 0),
                "covered_branch_rows_percent": metrics.get("covered_branch_rows_percent", 0),
            }
            row["stable_branch_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "examples": item.get("examples", [])[:3],
                }
                for item in confessions_hardening.get("stable_branch_candidates", [])
            ]
            if confessions_wave2:
                row["promotion_readiness_status"] = confessions_wave2.get("current_status")
                row["promotion_ready_branches"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in confessions_wave2.get("promotion_ready_branches", [])
                ]
        if author_id == "ovid" and row.get("canonical_work") == "Metamorphoses" and ovid_backbone:
            metrics = ovid_backbone.get("metrics", {})
            row["backbone_status"] = ovid_backbone.get("current_status")
            row["backbone_metrics"] = {
                "normalized_backbone_book_count": metrics.get("normalized_backbone_book_count", 0),
                "raw_branch_candidate_count": metrics.get("raw_branch_candidate_count", 0),
            }
            row["normalized_backbone_books"] = [
                {
                    "label": item.get("label"),
                    "count": item.get("count", 0),
                    "examples": [],
                }
                for item in ovid_backbone.get("normalized_backbone_books", [])[:8]
            ]
        if author_id == "ovid":
            secondary = ovid_secondary_map.get(row.get("canonical_work"))
            if secondary:
                row["hardening_status"] = secondary.get("hardening_status")
                row["focus_branch_candidates"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                        "examples": item.get("examples", [])[:3],
                    }
                    for item in secondary.get("focus_candidates", [])
                ]
        if author_id == "cicero":
            hardening = cicero_hardening_map.get(row.get("canonical_work"))
            if hardening:
                row["hardening_status"] = hardening.get("hardening_status")
                row["focus_branch_candidates"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                        "examples": item.get("examples", [])[:3],
                    }
                    for item in hardening.get("focus_candidates", [])
                ]
            if cicero_wave2 and row.get("canonical_work") == "De amicitia":
                row["normalization_status"] = cicero_wave2.get("current_status")
                row["normalized_branch_clusters"] = [
                    {
                        "normalized_label": item.get("normalized_label"),
                        "count": item.get("count", 0),
                        "surface_forms": item.get("surface_forms", []),
                    }
                    for item in cicero_wave2.get("de_amicitia_normalized_clusters", [])
                ]
        if author_id == "seneca" and row.get("canonical_work") == "Epistulae morales" and seneca_hardening:
            row["hardening_status"] = seneca_hardening.get("current_status")
            row["letter_backbone_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "examples": item.get("examples", [])[:3],
                }
                for item in seneca_hardening.get("letter_backbone_candidates", [])
            ]
            row["book_like_signal_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "examples": item.get("examples", [])[:3],
                }
                for item in seneca_hardening.get("book_like_signal_candidates", [])
            ]
            if seneca_wave2:
                row["wave2_spine_status"] = seneca_wave2.get("current_status")
                row["primary_letter_spine"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in seneca_wave2.get("primary_letter_spine", [])
                ]
        if author_id == "boethius" and row.get("canonical_work") == "Consolation of Philosophy" and boethius_hardening:
            row["hardening_status"] = boethius_hardening.get("current_status")
            row["evidence_backed_books"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "examples": item.get("examples", [])[:3],
                }
                for item in boethius_hardening.get("evidence_backed_books", [])
            ]
            row["noisy_book_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "examples": item.get("examples", [])[:3],
                }
                for item in boethius_hardening.get("noisy_book_candidates", [])
            ]
            if boethius_wave2:
                row["wave2_spine_status"] = boethius_wave2.get("current_status")
                row["clean_book_spine"] = [
                    {
                        "branch_label": item.get("branch_label"),
                        "count": item.get("count", 0),
                        "branch_status": item.get("branch_status"),
                    }
                    for item in boethius_wave2.get("clean_book_spine", [])
                ]
        branch_bundle = branch_bundle_map.get(row.get("canonical_work"))
        if branch_bundle:
            row["branch_bundle_status"] = branch_bundle.get("branch_status")
            row["branch_candidates"] = [
                {
                    "branch_label": item.get("branch_label"),
                    "count": item.get("count", 0),
                    "branch_status": item.get("branch_status"),
                    "examples": item.get("examples", [])[:3],
                }
                for item in branch_bundle.get("branch_candidates", [])
            ]
            row["primary_branch_spine"] = build_primary_branch_spine(row["branch_candidates"])

    unresolved_occurrences.sort(
        key=lambda item: (
            f"{str(item.get('cantica') or '').lower()}{item.get('canto')}",
            item.get("line_number") or 0,
            str(item.get("commentary_name") or "").lower(),
        )
    )

    return {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "shell_contract": {
            "ready_promise": "window.DDPAppShellReady",
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "display_contract": {
            "root_display_mode": "work_direct_children",
            "hide_internal_schema_node": True,
            "work_root_children": [
                "work_cards",
                "work_occurrence_samples",
                "unresolved_occurrences",
            ],
            "display_note": "Frontends should open the author's works layer directly into work cards and occurrence buckets; do not render an extra schema/intermediate node.",
        },
        "work_branches_contract": build_work_branches_contract(
            "flat_work_branches",
            visible_children=[
                "work_cards",
                "work_occurrence_samples",
                "unresolved_occurrences",
            ],
            branch_note="Work cards may already expose live branch candidates or partial-tree entry points, but unresolved material remains visible at the work root.",
            evidence_labels=[
                "stable_work",
                "partial_work",
                "candidate_locator_cluster",
                "unresolved_occurrences",
            ],
        ),
        "author_id": author.get("author_id"),
        "canonical_name": author.get("canonical_name"),
        "frontend_status": author.get("frontend_status"),
        "frontend_notes": author.get("frontend_notes"),
        "object_rollout_status": author.get("object_rollout_status"),
        "entry_mode": author.get("entry_mode"),
        "works_layer_mode": "flat_work_overview",
        "rollout_kind": rollout_kind,
        "local_source_policy": local_source_policy,
        "overview": {
            "work_count": len(work_cards),
            "sample_occurrence_count": len(occurrence_rows),
            "stable_work_count": sum(1 for row in work_cards if row.get("work_status") == "stable"),
            "inference_heavy_work_count": sum(1 for row in work_cards if row.get("work_status") == "inference_heavy"),
            "passage_present_work_count": sum(1 for row in work_cards if row.get("work_status") == "passage_present"),
            "partial_work_count": sum(1 for row in work_cards if row.get("work_status") == "partial"),
            "partial_tree_count": len(partial_tree_payloads),
            "pattern_bundle_available": bool(augustine_pattern_bundle),
            "candidate_locator_cluster_count": sum(
                len(work.get("candidate_clusters", []))
                for work in (augustine_pattern_bundle or {}).get("works", [])
            ),
            "branch_bundle_available": bool(work_branch_bundle),
            "branch_candidate_count": branch_candidate_count,
            "work_hardening_available": bool(
                confessions_hardening
                or confessions_wave2
                or ovid_backbone
                or ovid_secondary_hardening
                or cicero_hardening_bundle
                or cicero_wave2
                or seneca_hardening
                or seneca_wave2
                or boethius_hardening
                or boethius_wave2
            ),
            "stable_branch_candidate_count": (confessions_hardening or {}).get("metrics", {}).get(
                "stable_branch_candidate_count", 0
            ),
            "promotion_ready_branch_count": len((confessions_wave2 or {}).get("promotion_ready_branches", [])),
            "normalized_backbone_book_count": (ovid_backbone or {}).get("metrics", {}).get(
                "normalized_backbone_book_count", 0
            ),
            "normalized_branch_cluster_count": len((cicero_wave2 or {}).get("de_amicitia_normalized_clusters", [])),
            "primary_letter_spine_count": len((seneca_wave2 or {}).get("primary_letter_spine", [])),
            "clean_book_spine_count": len((boethius_wave2 or {}).get("clean_book_spine", [])),
            "hardening_focus_work_count": len((cicero_hardening_bundle or {}).get("focus_works", []))
            + (1 if seneca_hardening else 0)
            + (1 if boethius_hardening else 0)
            + (1 if confessions_hardening else 0)
            + (1 if ovid_backbone else 0)
            + len((ovid_secondary_hardening or {}).get("focus_works", [])),
        },
        "work_pattern_bundle": augustine_pattern_bundle,
        "work_branch_bundle": work_branch_bundle,
        "work_hardening_bundle": {
            "confessions_branch_hardening": confessions_hardening,
            "confessions_wave2_readiness": confessions_wave2,
            "metamorphoses_backbone": ovid_backbone,
            "ovid_secondary_works_hardening": ovid_secondary_hardening,
            "cicero_branch_hardening_bundle": cicero_hardening_bundle,
            "cicero_wave2_normalization": cicero_wave2,
            "seneca_epistulae_branch_hardening": seneca_hardening,
            "seneca_epistulae_wave2_spine": seneca_wave2,
            "boethius_consolation_branch_hardening": boethius_hardening,
            "boethius_consolation_wave2_spine": boethius_wave2,
        }
        if confessions_hardening
        or confessions_wave2
        or ovid_backbone
        or ovid_secondary_hardening
        or cicero_hardening_bundle
        or cicero_wave2
        or seneca_hardening
        or seneca_wave2
        or boethius_hardening
        or boethius_wave2
        else None,
        "partial_trees": [
            {
                "work_id": payload.get("work_id"),
                "canonical_work": payload.get("canonical_work"),
                "tree_mode": payload.get("tree_mode"),
                "path": "./data/authority_partial_trees/augustine__city_of_god.json",
                "root_display_mode": payload.get("display_contract", {}).get("root_display_mode"),
                "hide_internal_schema_node": payload.get("display_contract", {}).get("hide_internal_schema_node"),
            }
            for payload in partial_tree_payloads.values()
        ],
        "work_cards": work_cards,
        "work_occurrence_samples": grouped_rows,
        "unresolved_occurrence_sample_count": len(unresolved_occurrences),
        "unresolved_occurrences": unresolved_occurrences[:24],
    }


def write_demo_authority_flat_object_shards(
    author_entries: list[dict[str, Any]],
    works_by_author: dict[str, dict[str, Any]],
    occurrences_by_author: dict[str, list[dict[str, Any]]],
) -> dict[str, dict[str, Any]]:
    ensure_dir(AUTHORITY_FLAT_OBJECT_DATA_DIR)
    shard_meta: dict[str, dict[str, Any]] = {}
    supported_flat_object_authors = {"cicero", "augustine", "platone", "tommaso_daquino", "ovid", "boethius", "seneca"}

    for author in author_entries:
        author_id = author.get("author_id")
        if author_id not in supported_flat_object_authors:
            continue
        if author.get("works_layer_mode") != "flat_work_overview":
            continue

        work_entry = works_by_author.get(author_id) or {}
        occurrence_rows = occurrences_by_author.get(author_id) or []
        payload = None
        if author_id in REVIEW_FIRST_FLAT_WORK_SPECS:
            payload = build_review_first_flat_work_payload(author, occurrence_rows)
        elif work_entry.get("works"):
            payload = build_authority_flat_work_payload(author, work_entry, occurrence_rows)
        if not payload:
            continue
        shard_path = AUTHORITY_FLAT_OBJECT_DATA_DIR / f"{author_id}.json"
        shard_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        rollout_kind = payload.get("rollout_kind", "stable_flat_work_object")
        shard_meta[author_id] = {
            "available": True,
            "author_id": author_id,
            "path": f"./data/authority_flat_objects/{author_id}.json",
            "rollout_kind": rollout_kind,
            "source_open_mode": "local_commentary_source_only",
            "root_display_mode": payload.get("display_contract", {}).get("root_display_mode"),
            "hide_internal_schema_node": payload.get("display_contract", {}).get("hide_internal_schema_node"),
            "branch_mode": payload.get("work_branches_contract", {}).get("branch_mode"),
            "visible_children": payload.get("work_branches_contract", {}).get("visible_children", []),
            "work_count": payload["overview"]["work_count"],
            "sample_occurrence_count": payload["overview"]["sample_occurrence_count"],
            "anchor_work_count": payload["overview"].get("anchor_work_count", 0),
            "secondary_work_count": payload["overview"].get("secondary_work_count", 0),
            "tier_counts": payload["overview"].get("tier_counts", {}),
            "partial_tree_count": payload["overview"].get("partial_tree_count", 0),
            "pattern_bundle_available": payload["overview"].get("pattern_bundle_available", False),
            "candidate_locator_cluster_count": payload["overview"].get("candidate_locator_cluster_count", 0),
            "branch_bundle_available": payload["overview"].get("branch_bundle_available", False),
            "branch_candidate_count": payload["overview"].get("branch_candidate_count", 0),
            "work_hardening_available": payload["overview"].get("work_hardening_available", False),
            "hardening_focus_work_count": payload["overview"].get("hardening_focus_work_count", 0),
            "stable_branch_candidate_count": payload["overview"].get("stable_branch_candidate_count", 0),
            "promotion_ready_branch_count": payload["overview"].get("promotion_ready_branch_count", 0),
            "normalized_backbone_book_count": payload["overview"].get("normalized_backbone_book_count", 0),
            "normalized_branch_cluster_count": payload["overview"].get("normalized_branch_cluster_count", 0),
            "primary_letter_spine_count": payload["overview"].get("primary_letter_spine_count", 0),
            "clean_book_spine_count": payload["overview"].get("clean_book_spine_count", 0),
            "locator_calibration_available": payload["overview"].get("locator_calibration_available", False),
            "locator_question_node_count": payload["overview"].get("locator_question_node_count", 0),
            "locator_article_node_count": payload["overview"].get("locator_article_node_count", 0),
            "evidence_backed_part_count": payload["overview"].get("evidence_backed_part_count", 0),
            "active_part_spine_count": payload["overview"].get("active_part_spine_count", 0),
            "secondary_work_hold_count": payload["overview"].get("secondary_work_hold_count", 0),
            "wave4_focus_work_count": payload["overview"].get("wave4_focus_work_count", 0),
            "wave5_focus_work_count": payload["overview"].get("wave5_focus_work_count", 0),
        }

    return shard_meta


def write_demo_authority_partial_tree_shards() -> dict[str, dict[str, Any]]:
    ensure_dir(AUTHORITY_PARTIAL_TREE_DATA_DIR)
    shard_meta: dict[str, dict[str, Any]] = {}

    partial_tree_specs = {
        "augustine": {
            "source_path": AUGUSTINE_CITY_OF_GOD_PARTIAL_TREE_PATH,
            "target_name": "augustine__city_of_god.json",
        },
        "tommaso_daquino": {
            "source_path": TOMMASO_SUMMA_PARTIAL_TREE_PATH,
            "target_name": "tommaso_daquino__summa_theologiae.json",
        }
    }

    for author_id, spec in partial_tree_specs.items():
        source_path = spec["source_path"]
        if not source_path.exists():
            continue
        payload = json.loads(source_path.read_text(encoding="utf-8"))
        frontend_payload = {
            **payload,
            "shell_contract": {
                "jump_api": "DDPAppShell.jumpToSampleLine",
                "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
                "source_open_mode": "local_commentary_source_only",
            },
            "work_branches_contract": build_work_branches_contract(
                "schema_first_partial_branches",
                visible_children=[
                    "parts",
                    "books",
                    "unplaced_occurrences",
                ],
                branch_note="Render the work root directly into real structure branches; only evidence-backed citations attach to nodes, and the rest remain in unplaced buckets.",
                evidence_labels=[
                    "explicit_book_formula",
                    "pattern_promoted",
                    "unplaced_occurrences",
                ],
            ),
            "parts": annotate_authority_partial_tree_nodes(payload.get("parts") or []),
            "unplaced_occurrences": [
                annotate_authority_occurrence(item) for item in (payload.get("unplaced_occurrences") or [])
            ],
        }
        target_rel_path = f"./data/authority_partial_trees/{spec['target_name']}"
        target_path = AUTHORITY_PARTIAL_TREE_DATA_DIR / spec["target_name"]
        target_path.write_text(json.dumps(frontend_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        shard_meta[author_id] = {
            "available": True,
            "author_id": author_id,
            "tree_count": 1,
            "branch_mode": frontend_payload.get("work_branches_contract", {}).get("branch_mode"),
            "visible_children": frontend_payload.get("work_branches_contract", {}).get("visible_children", []),
            "trees": [
                {
                    "work_id": payload.get("work_id"),
                    "canonical_work": payload.get("canonical_work"),
                    "path": target_rel_path,
                    "tree_mode": payload.get("tree_mode"),
                    "root_display_mode": payload.get("display_contract", {}).get("root_display_mode"),
                    "hide_internal_schema_node": payload.get("display_contract", {}).get(
                        "hide_internal_schema_node"
                    ),
                    "source_open_mode": "local_commentary_source_only",
                }
            ],
        }

    return shard_meta


def build_authority_special_object_payload(author: dict[str, Any]) -> dict[str, Any]:
    special_case = author.get("special_case") or {}
    work_branch_bundle = author.get("work_branch_bundle")
    virgil_backbone = load_virgil_aeneid_backbone_hardening() if author.get("author_id") == "virgil" else None
    virgil_wave3 = load_virgil_wave3_secondary_backbone() if author.get("author_id") == "virgil" else None
    statius_wave3 = load_statius_wave3_thebaid_normalization() if author.get("author_id") == "statius" else None
    virgil_wave4 = load_virgil_wave4_eclogues() if author.get("author_id") == "virgil" else None
    statius_wave4 = load_statius_wave4_achilleid() if author.get("author_id") == "statius" else None
    virgil_wave5 = load_virgil_wave5_georgics() if author.get("author_id") == "virgil" else None
    statius_wave5 = load_statius_wave5_thebaid() if author.get("author_id") == "statius" else None
    virgil_wave3_map = {
        row.get("canonical_work"): row
        for row in (virgil_wave3 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    statius_wave3_map = {
        row.get("canonical_work"): row
        for row in (statius_wave3 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    virgil_wave4_map = {
        row.get("canonical_work"): row
        for row in (virgil_wave4 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    statius_wave4_map = {
        row.get("canonical_work"): row
        for row in (statius_wave4 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    virgil_wave5_map = {
        row.get("canonical_work"): row
        for row in (virgil_wave5 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    statius_wave5_map = {
        row.get("canonical_work"): row
        for row in (statius_wave5 or {}).get("focus_works", [])
        if row.get("canonical_work")
    }
    text_occurrences_by_canto = []
    for row in special_case.get("text_occurrences_by_canto", []) or []:
        text_occurrences_by_canto.append(
            {
                **row,
                "sample_id": row.get("sample_name"),
                "jump_target": build_authority_jump_target(
                    row.get("sample_name"),
                    infer_authority_jump_line_number(row.get("jump_line_number")),
                ),
            }
        )
    commentary_occurrences_by_canto = []
    for row in special_case.get("commentary_occurrences_by_canto", []) or []:
        commentary_occurrences_by_canto.append(
            {
                **row,
                "sample_id": row.get("sample_name"),
                "jump_target": build_authority_jump_target(
                    row.get("sample_name"),
                    infer_authority_jump_line_number(None),
                ),
                "source_open_mode": "local_commentary_source_only",
            }
        )
    if virgil_backbone and work_branch_bundle:
        works = []
        for work in work_branch_bundle.get("works", []) or []:
            annotated_work = dict(work)
            annotated_work["primary_branch_spine"] = build_primary_branch_spine(annotated_work.get("branch_candidates", []))
            if work.get("canonical_work") == virgil_backbone.get("focus_work"):
                annotated_work["backbone_hardening_status"] = virgil_backbone.get("current_status")
                annotated_work["backbone_hardening_stage"] = virgil_backbone.get("risk_stage")
                annotated_work["backbone_hardening_metrics"] = virgil_backbone.get("metrics", {})
                annotated_work["backbone_candidates"] = virgil_backbone.get("aeneid_backbone", [])
            works.append(annotated_work)
        work_branch_bundle = {
            **work_branch_bundle,
            "works": works,
        }
    elif work_branch_bundle:
        work_branch_bundle = {
            **work_branch_bundle,
            "works": [
                {**work, "primary_branch_spine": build_primary_branch_spine(work.get("branch_candidates", []))}
                for work in (work_branch_bundle.get("works", []) or [])
            ],
        }
    if work_branch_bundle and (virgil_wave3_map or statius_wave3_map):
        works = []
        for work in work_branch_bundle.get("works", []) or []:
            enriched = dict(work)
            wave3 = virgil_wave3_map.get(work.get("canonical_work")) or statius_wave3_map.get(work.get("canonical_work"))
            if wave3:
                enriched["wave3_spine_status"] = wave3.get("wave3_status")
                if wave3.get("normalized_branch_spine"):
                    enriched["normalized_branch_spine"] = wave3.get("normalized_branch_spine")
                if wave3.get("primary_candidates"):
                    enriched["wave3_primary_candidates"] = wave3.get("primary_candidates")
            wave4 = virgil_wave4_map.get(work.get("canonical_work")) or statius_wave4_map.get(work.get("canonical_work"))
            if wave4:
                enriched["wave4_completion_status"] = wave4.get("wave4_status")
                enriched["wave4_completion_why"] = wave4.get("why", [])
                enriched["wave4_focus_metrics"] = wave4.get("metrics", {})
                enriched["wave4_primary_spine"] = wave4.get("primary_spine", [])
            wave5 = virgil_wave5_map.get(work.get("canonical_work")) or statius_wave5_map.get(work.get("canonical_work"))
            if wave5:
                enriched["wave5_completion_status"] = wave5.get("wave5_status")
                enriched["wave5_completion_why"] = wave5.get("why", [])
                enriched["wave5_focus_metrics"] = wave5.get("metrics", {})
                enriched["wave5_primary_spine"] = wave5.get("primary_spine", [])
            works.append(enriched)
        work_branch_bundle = {
            **work_branch_bundle,
            "works": works,
        }
    payload = {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "shell_contract": {
            "ready_promise": "window.DDPAppShellReady",
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "work_branches_contract": build_work_branches_contract(
            "special_case_work_branches",
            visible_children=[
                "special_case",
                "work_branch_bundle",
            ],
            branch_note="Special-case authors can still expose work-root branch bundles alongside role-sensitive commentary reading.",
            evidence_labels=[
                "special_case_scope",
                "explicit_work_book_signal",
                "bare_work_book_signal",
            ],
        ),
        "author_id": author.get("author_id"),
        "canonical_name": author.get("canonical_name"),
        "frontend_status": author.get("frontend_status"),
        "frontend_notes": author.get("frontend_notes"),
        "object_rollout_status": author.get("object_rollout_status"),
        "entry_mode": author.get("entry_mode"),
        "works_layer_mode": author.get("works_layer_mode"),
        "rollout_kind": "special_case_object",
        "local_source_policy": "Special-case drill-down should still open local commentary source text first; result_url is provenance only.",
        "work_branch_bundle": work_branch_bundle,
        "special_case": {
            **special_case,
            "text_occurrences_by_canto": text_occurrences_by_canto,
            "commentary_occurrences_by_canto": commentary_occurrences_by_canto,
        },
        "mention_role_breakdown": author.get("mention_role_breakdown", {}),
    }
    if virgil_backbone:
        payload["depth_risk_meta"] = {
            "available": True,
            "risk_stage": virgil_backbone.get("risk_stage"),
            "focus_work": virgil_backbone.get("focus_work"),
            "current_status": virgil_backbone.get("current_status"),
            "recommended_next_step": virgil_backbone.get("recommended_next_step"),
        }
    if virgil_wave3:
        payload["wave3_secondary_backbone"] = virgil_wave3
    if statius_wave3:
        payload["wave3_work_spine"] = statius_wave3
    if virgil_wave4:
        payload["wave4_focus_bundle"] = virgil_wave4
    if statius_wave4:
        payload["wave4_focus_bundle"] = statius_wave4
    if virgil_wave5:
        payload["wave5_focus_bundle"] = virgil_wave5
    if statius_wave5:
        payload["wave5_focus_bundle"] = statius_wave5
    return payload


def write_demo_authority_special_object_shards(
    author_entries: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    ensure_dir(AUTHORITY_SPECIAL_OBJECT_DATA_DIR)
    shard_meta: dict[str, dict[str, Any]] = {}

    for author in author_entries:
        author_id = author.get("author_id")
        special_case = author.get("special_case") or {}
        if not author_id or not special_case:
            continue
        payload = build_authority_special_object_payload(author)
        shard_path = AUTHORITY_SPECIAL_OBJECT_DATA_DIR / f"{author_id}.json"
        shard_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        shard_meta[author_id] = {
            "available": True,
            "author_id": author_id,
            "path": f"./data/authority_special_objects/{author_id}.json",
            "rollout_kind": "special_case_object",
            "source_open_mode": "local_commentary_source_only",
            "status": special_case.get("status"),
            "scope_label": special_case.get("scope_label"),
            "text_canto_total": special_case.get("text_canto_total", 0),
            "commentary_canto_total": special_case.get("commentary_canto_total", 0),
            "depth_risk_meta": payload.get("depth_risk_meta"),
            "wave4_focus_work_count": len((payload.get("wave4_focus_bundle") or {}).get("focus_works", [])),
            "wave5_focus_work_count": len((payload.get("wave5_focus_bundle") or {}).get("focus_works", [])),
        }

    return shard_meta


def build_authority_occurrence_sample_payload(author: dict[str, Any]) -> dict[str, Any]:
    occurrences = author.get("occurrences") or []
    return {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "shell_contract": {
            "ready_promise": "window.DDPAppShellReady",
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "author_id": author.get("author_id"),
        "canonical_name": author.get("canonical_name"),
        "frontend_status": author.get("frontend_status"),
        "frontend_notes": author.get("frontend_notes"),
        "object_rollout_status": author.get("object_rollout_status"),
        "entry_mode": author.get("entry_mode"),
        "works_layer_mode": author.get("works_layer_mode"),
        "rollout_kind": "occurrence_sample_shard",
        "local_source_policy": "Occurrence samples should open local commentary source text first; result_url is provenance only.",
        "overview": {
            "sample_occurrence_count": len(occurrences),
            "sample_available_count": sum(1 for item in occurrences if item.get("sample_available")),
        },
        "occurrences": occurrences,
    }


def write_demo_authority_occurrence_sample_shards(
    author_entries: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    ensure_dir(AUTHORITY_OCCURRENCE_SAMPLE_DIR)
    shard_meta: dict[str, dict[str, Any]] = {}
    for author in author_entries:
        author_id = author.get("author_id")
        occurrences = author.get("occurrences") or []
        if not author_id or not occurrences:
            continue
        payload = build_authority_occurrence_sample_payload(author)
        shard_path = AUTHORITY_OCCURRENCE_SAMPLE_DIR / f"{author_id}.json"
        shard_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        shard_meta[author_id] = {
            "available": True,
            "author_id": author_id,
            "path": f"./data/authority_occurrence_samples/{author_id}.json",
            "rollout_kind": "occurrence_sample_shard",
            "source_open_mode": "local_commentary_source_only",
            "sample_occurrence_count": payload["overview"]["sample_occurrence_count"],
        }
    return shard_meta


def build_authority_index_author(author: dict[str, Any]) -> dict[str, Any]:
    works_tree = author.get("works_tree") or {}
    commentary_line_index = author.get("commentary_line_index")
    flat_work_object = author.get("flat_work_object")
    partial_tree_object = author.get("partial_tree_object")
    special_case_object = author.get("special_case_object")
    occurrence_sample_object = author.get("occurrence_sample_object")
    work_branch_bundle = author.get("work_branch_bundle")
    return {
        "author_id": author.get("author_id"),
        "canonical_name": author.get("canonical_name"),
        "display_name": author.get("display_name") or authority_display_name(author.get("author_id"), author.get("canonical_name")),
        "public_slug_it": author.get("public_slug_it")
        or authority_public_slug(author.get("author_id"), author.get("canonical_name")),
        "aliases": author.get("aliases", []),
        "frontend_status": author.get("frontend_status"),
        "frontend_notes": author.get("frontend_notes"),
        "object_rollout_status": author.get("object_rollout_status"),
        "entry_mode": author.get("entry_mode"),
        "works_layer_mode": author.get("works_layer_mode"),
        "total_mentions": author.get("total_mentions", 0),
        "total_work_mentions": author.get("total_work_mentions", 0),
        "mention_role_breakdown": author.get("mention_role_breakdown", {}),
        "text_layer_status": author.get("text_layer_status"),
        "text_occurrence_total": author.get("text_occurrence_total", 0),
        "text_canto_total": author.get("text_canto_total", 0),
        "caveat_flags": author.get("caveat_flags", []),
        "detail_path": author.get("detail_path"),
        "works_tree_meta": (
            {
                "available": True,
                "author_id": works_tree.get("author_id"),
                "object_family": works_tree.get("object_family"),
                "scope": works_tree.get("scope"),
                "path": works_tree.get("path"),
                "root_display_mode": works_tree.get("display_contract", {}).get("root_display_mode"),
                "hide_internal_schema_node": works_tree.get("display_contract", {}).get("hide_internal_schema_node"),
                "branch_mode": works_tree.get("branch_mode"),
                "visible_children": works_tree.get("visible_children", []),
                "depth_risk_available": (works_tree.get("depth_risk_meta") or {}).get("available", False),
                "depth_risk_stage": (works_tree.get("depth_risk_meta") or {}).get("risk_stage"),
                "depth_risk_focus_work": (works_tree.get("depth_risk_meta") or {}).get("focus_work"),
                "wave4_focus_work_count": works_tree.get(
                    "wave4_focus_work_count",
                    len((works_tree.get("wave4_focus_bundle") or {}).get("focus_works", [])),
                ),
                "wave5_focus_work_count": works_tree.get(
                    "wave5_focus_work_count",
                    len((works_tree.get("wave5_focus_bundle") or {}).get("focus_works", [])),
                ),
                "jump_api": "DDPAppShell.jumpToSampleLine",
                "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
                "source_open_mode": "local_commentary_source_only",
            }
            if works_tree.get("available")
            else {"available": False}
        ),
        "commentary_line_meta": (
            {
                "available": True,
                "author_id": commentary_line_index.get("author_id"),
                "sample_count": commentary_line_index.get("sample_count", 0),
                "path": commentary_line_index.get("path"),
                "index_path": commentary_line_index.get("index_path"),
                "jump_api": "DDPAppShell.jumpToSampleLine",
                "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
                "source_open_mode": "local_commentary_source_only",
            }
            if commentary_line_index and commentary_line_index.get("available")
            else {"available": False}
        ),
        "flat_work_meta": (
            {
                "available": True,
                "author_id": flat_work_object.get("author_id"),
                "path": flat_work_object.get("path"),
                "rollout_kind": flat_work_object.get("rollout_kind"),
                "source_open_mode": flat_work_object.get("source_open_mode"),
                "root_display_mode": flat_work_object.get("root_display_mode"),
                "hide_internal_schema_node": flat_work_object.get("hide_internal_schema_node"),
                "work_count": flat_work_object.get("work_count", 0),
                "sample_occurrence_count": flat_work_object.get("sample_occurrence_count", 0),
                "anchor_work_count": flat_work_object.get("anchor_work_count", 0),
                "secondary_work_count": flat_work_object.get("secondary_work_count", 0),
                "tier_counts": flat_work_object.get("tier_counts", {}),
                "partial_tree_count": flat_work_object.get("partial_tree_count", 0),
                "pattern_bundle_available": flat_work_object.get("pattern_bundle_available", False),
                "candidate_locator_cluster_count": flat_work_object.get("candidate_locator_cluster_count", 0),
                "branch_bundle_available": flat_work_object.get("branch_bundle_available", False),
                "branch_candidate_count": flat_work_object.get("branch_candidate_count", 0),
                "work_hardening_available": flat_work_object.get("work_hardening_available", False),
                "hardening_focus_work_count": flat_work_object.get("hardening_focus_work_count", 0),
                "stable_branch_candidate_count": flat_work_object.get("stable_branch_candidate_count", 0),
                "normalized_backbone_book_count": flat_work_object.get("normalized_backbone_book_count", 0),
                "locator_calibration_available": flat_work_object.get("locator_calibration_available", False),
                "locator_question_node_count": flat_work_object.get("locator_question_node_count", 0),
                "locator_article_node_count": flat_work_object.get("locator_article_node_count", 0),
                "evidence_backed_part_count": flat_work_object.get("evidence_backed_part_count", 0),
                "secondary_work_hold_count": flat_work_object.get("secondary_work_hold_count", 0),
                "wave4_focus_work_count": flat_work_object.get("wave4_focus_work_count", 0),
                "wave5_focus_work_count": flat_work_object.get("wave5_focus_work_count", 0),
                "branch_mode": flat_work_object.get("branch_mode"),
                "visible_children": flat_work_object.get("visible_children", []),
            }
            if flat_work_object and flat_work_object.get("available")
            else {"available": False}
        ),
        "partial_tree_meta": (
            {
                "available": True,
                "author_id": partial_tree_object.get("author_id"),
                "tree_count": partial_tree_object.get("tree_count", 0),
                "trees": partial_tree_object.get("trees", []),
                "branch_mode": partial_tree_object.get("branch_mode"),
                "visible_children": partial_tree_object.get("visible_children", []),
            }
            if partial_tree_object and partial_tree_object.get("available")
            else {"available": False}
        ),
        "special_case_meta": (
            {
                "available": True,
                "author_id": special_case_object.get("author_id"),
                "path": special_case_object.get("path"),
                "rollout_kind": special_case_object.get("rollout_kind"),
                "source_open_mode": special_case_object.get("source_open_mode"),
                "status": special_case_object.get("status"),
                "scope_label": special_case_object.get("scope_label"),
                "text_canto_total": special_case_object.get("text_canto_total", 0),
                "commentary_canto_total": special_case_object.get("commentary_canto_total", 0),
                "depth_risk_available": (special_case_object.get("depth_risk_meta") or {}).get("available", False),
                "depth_risk_stage": (special_case_object.get("depth_risk_meta") or {}).get("risk_stage"),
                "depth_risk_focus_work": (special_case_object.get("depth_risk_meta") or {}).get("focus_work"),
                "wave4_focus_work_count": special_case_object.get("wave4_focus_work_count", 0),
                "wave5_focus_work_count": special_case_object.get("wave5_focus_work_count", 0),
            }
            if special_case_object and special_case_object.get("available")
            else {"available": False}
        ),
        "occurrence_sample_meta": (
            {
                "available": True,
                "author_id": occurrence_sample_object.get("author_id"),
                "path": occurrence_sample_object.get("path"),
                "rollout_kind": occurrence_sample_object.get("rollout_kind"),
                "source_open_mode": occurrence_sample_object.get("source_open_mode"),
                "sample_occurrence_count": occurrence_sample_object.get("sample_occurrence_count", 0),
            }
            if occurrence_sample_object and occurrence_sample_object.get("available")
            else {"available": False}
        ),
        "work_branch_bundle_meta": (
            {
                "available": True,
                "author_id": author.get("author_id"),
                "work_count": len(work_branch_bundle.get("works", [])),
                "branch_candidate_count": (
                    sum(len(work.get("branch_candidates", [])) for work in work_branch_bundle.get("works", []))
                    if work_branch_bundle.get("works")
                    else len(work_branch_bundle.get("branch_candidates", []))
                ),
            }
            if work_branch_bundle
            else {"available": False}
        ),
    }


def build_authority_detail_payload(author: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "authority_layer_split_v1",
        "shell_contract": {
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "context_api": "DDPAppShell.getCurrentContext",
            "source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "author": author,
    }


def write_authority_split_v1_files(authority_notes: dict[str, Any], author_entries: list[dict[str, Any]]) -> None:
    ensure_dir(AUTHORITY_AUTHOR_DETAIL_DIR)

    index_authors: list[dict[str, Any]] = []
    for author in author_entries:
        author_id = author.get("author_id")
        if not author_id:
            continue
        author["detail_path"] = f"./data/authority_authors/{author_id}.json"
        detail_path = AUTHORITY_AUTHOR_DETAIL_DIR / f"{author_id}.json"
        detail_payload = build_authority_detail_payload(author)
        detail_path.write_text(json.dumps(detail_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        index_authors.append(build_authority_index_author(author))

    index_payload = {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "shell_contract": {
            "ready_promise": "window.DDPAppShellReady",
            "jump_api": "DDPAppShell.jumpToSampleLine",
            "context_api": "DDPAppShell.getCurrentContext",
            "authority_layer_api": "DDPAppShell.ensureAuthorityLayerLoaded",
            "authority_source_api": "DDPAppShell.ensureAuthorityCommentarySourcesLoaded",
            "source_open_mode": "local_commentary_source_only",
        },
        "notes": {
            **authority_notes,
            "split_mode": "authority_index + authority_authors + authority_works_trees + authority_commentary_sources + authority_commentary_lines/author/sample",
            "compatibility_note": "authority_layer.json remains available as a compatibility shell while split v1 is rolled out.",
        },
        "authors": index_authors,
    }
    AUTHORITY_INDEX_PATH.write_text(json.dumps(index_payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_year_range(date_label: str | None) -> tuple[int | None, int | None]:
    if not date_label:
        return None, None

    years = [int(match) for match in re.findall(r"\d{4}", date_label)]
    if not years:
        return None, None

    if len(years) >= 2:
        return years[0], years[1]

    year = years[0]
    short_range = re.search(r"(\d{4})\s*-\s*(\d{2})(?!\d)", date_label)
    if short_range:
        start = int(short_range.group(1))
        end_suffix = int(short_range.group(2))
        end = (start // 100) * 100 + end_suffix
        if end < start:
            end += 100
        return start, end

    return year, year


def build_century_label(year_start: int | None, year_end: int | None) -> str | None:
    if not year_start:
        return None

    start_century = ((year_start - 1) // 100) + 1
    end_century = ((year_end - 1) // 100) + 1 if year_end else start_century

    if start_century == end_century:
        return ordinal_century(start_century)
    return f"{ordinal_century(start_century)}-{ordinal_century(end_century)}"


def ordinal_century(value: int) -> str:
    if 10 <= value % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
    return f"{value}{suffix} c."


def read_rows(sample: str) -> List[dict]:
    path = SOURCE_DATA_DIR / f"{sample}_records_text_full.csv"
    if not path.exists():
        raise FileNotFoundError(f"Missing sample CSV: {path}")

    return read_csv_rows_with_retries(path)


def read_csv_rows_with_retries(path: Path, retries: int = 3, delay_seconds: float = 0.25) -> List[dict]:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with path.open(newline="", encoding="utf-8") as handle:
                return list(csv.DictReader(handle))
        except TimeoutError as exc:
            last_error = exc
            if attempt == retries - 1:
                raise
            time.sleep(delay_seconds * (attempt + 1))
    if last_error is not None:
        raise last_error
    return []


def discover_sample_inventory() -> list[dict]:
    inventory = []
    for path in sorted(SOURCE_DATA_DIR.glob("*_records_text_full.csv")):
        sample = path.name.replace("_records_text_full.csv", "")
        exclusion_reason = USER_CONFIRMED_INCOMPLETE_SAMPLES.get(sample)
        timeout_error: str | None = None
        try:
            rows = read_csv_rows_with_retries(path)
        except TimeoutError:
            rows = []
            timeout_error = f"source_csv_timeout:{path.name}"
            if exclusion_reason is None:
                exclusion_reason = timeout_error

        success_count = sum(1 for row in rows if row.get("fetch_status") == "success")
        line_info_count = sum(1 for row in rows if (row.get("line_info") or "").strip())
        line_span_count = sum(1 for row in rows if (row.get("line_span") or "").strip())
        line_start_count = sum(1 for row in rows if (row.get("line_start") or "").strip())
        line_end_count = sum(1 for row in rows if (row.get("line_end") or "").strip())
        failure_count = len(rows) - success_count
        has_pattern_file = (SOURCE_DATA_DIR / f"{sample}_line_info_patterns.csv").exists()
        parsed_cantica, parsed_canto = parse_sample_id(sample)
        cantica = rows[0].get("cantica") if rows else (parsed_cantica or "")
        canto = rows[0].get("canto") if rows else (parsed_canto or "")
        unique_commentary_count = len(
            {
                (row.get("commentary_name") or "").strip()
                for row in rows
                if (row.get("commentary_name") or "").strip()
            }
        )
        line_numbers = set()
        for row in rows:
            try:
                start = int(row["line_start"])
                end = int(row["line_end"])
            except (TypeError, ValueError, KeyError):
                continue
            line_numbers.update(range(start, end + 1))
        estimated_line_count = len(line_numbers)

        eligible = (
            success_count > 0
            and line_info_count == len(rows)
            and line_span_count == len(rows)
            and line_start_count == len(rows)
            and line_end_count == len(rows)
            and (success_count / max(len(rows), 1)) >= 0.995
            and exclusion_reason is None
        )

        inventory.append(
            {
                "sample": sample,
                "csv_path": path,
                "cantica": cantica,
                "canto": canto,
                "row_count": len(rows),
                "success_count": success_count,
                "failure_count": failure_count,
                "line_info_count": line_info_count,
                "line_span_count": line_span_count,
                "line_start_count": line_start_count,
                "line_end_count": line_end_count,
                "estimated_line_count": estimated_line_count,
                "unique_commentary_count": unique_commentary_count,
                "has_pattern_file": has_pattern_file,
                "exclusion_reason": exclusion_reason,
                "timeout_error": timeout_error,
                "eligible": eligible,
            }
        )

    return inventory


def resolve_samples(sample_arg: str) -> tuple[list[str], list[dict]]:
    inventory = discover_sample_inventory()
    inventory_by_sample = {item["sample"]: item for item in inventory}

    if sample_arg.strip().lower() == "all-eligible":
        samples = [item["sample"] for item in inventory if item["eligible"]]
        return samples, inventory

    requested = [piece.strip().lower() for piece in sample_arg.split(",") if piece.strip()]
    missing = [sample for sample in requested if sample not in inventory_by_sample]
    if missing:
        raise FileNotFoundError(f"Unknown sample(s): {', '.join(missing)}")
    return requested, inventory


def sample_sort_key(item: dict) -> tuple[int, int, str]:
    cantica_order = {"inferno": 0, "purgatorio": 1, "paradiso": 2}
    cantica = str(item.get("cantica") or item.get("title") or item.get("sample") or "").lower()
    canto_raw = item.get("canto")
    try:
        canto_number = int(canto_raw)
    except (TypeError, ValueError):
        canto_number = 999
    return (cantica_order.get(cantica, 99), canto_number, str(item.get("sample") or item.get("id") or ""))


def sample_id_sort_key(sample_id: str) -> tuple[int, int, str]:
    match = re.match(r"^(inferno|purgatorio|paradiso)(\d{1,2})$", str(sample_id or "").lower())
    if not match:
        return (99, 999, str(sample_id or ""))
    cantica_order = {"inferno": 0, "purgatorio": 1, "paradiso": 2}
    return (cantica_order.get(match.group(1), 99), int(match.group(2)), match.group(0))


def parse_sample_id(sample_id: str) -> tuple[str | None, int | None]:
    match = re.match(r"^(inferno|purgatorio|paradiso)(\d{1,2})$", str(sample_id or "").lower())
    if not match:
        return (None, None)
    return (match.group(1), int(match.group(2)))


def is_purgatorio_21_plus(sample_id: str) -> bool:
    cantica, canto = parse_sample_id(sample_id)
    return cantica == "purgatorio" and (canto or 0) >= 21


def build_status_metadata(status: str, note: str | None = None) -> dict:
    metadata = {
        "full-demo-ready": {
            "label": "Full Demo Ready",
            "description": "Coverage, cards, semantic fields, comparison workspace all available.",
            "modules": {
                "coverage": True,
                "records": True,
                "semantic_fields": True,
                "comparison": True,
            },
        },
        "semantic-fields-ready": {
            "label": "Semantic Fields Ready",
            "description": "Core workbench modules are available; label QA remains an active layer of review.",
            "modules": {
                "coverage": True,
                "records": True,
                "semantic_fields": True,
                "comparison": True,
            },
        },
        "coverage-only": {
            "label": "Coverage Only",
            "description": "Only line-level coverage is ready to expose tonight.",
            "modules": {
                "coverage": True,
                "records": False,
                "semantic_fields": False,
                "comparison": False,
            },
        },
        "shell-only": {
            "label": "Shell Only",
            "description": "Mounted in the corpus shell, but interpretive modules are intentionally withheld.",
            "modules": {
                "coverage": False,
                "records": False,
                "semantic_fields": False,
                "comparison": False,
            },
        },
        "incomplete": {
            "label": "Incomplete",
            "description": "Known incomplete sample: mounted as an honest placeholder, not as a fully ready demo page.",
            "modules": {
                "coverage": False,
                "records": False,
                "semantic_fields": False,
                "comparison": False,
            },
        },
    }
    selected = metadata[status]
    return {
        "status": status,
        "status_label": selected["label"],
        "status_note": note or selected["description"],
        "modules": selected["modules"],
    }


def build_manifest_entries(processed_summaries: list[dict], inventory: list[dict]) -> list[dict]:
    processed_lookup = {item["sample"]: item for item in processed_summaries}
    entries = []

    for item in sorted(inventory, key=sample_sort_key):
        sample = item["sample"]
        processed = processed_lookup.get(sample)
        title = f"{item['cantica']} {item['canto']}".strip() or sample

        if processed:
            line_data_available = bool(processed.get("line_data_available"))
            record_store_available = bool(processed.get("record_store_available"))
            record_fulltext_available = bool(processed.get("record_fulltext_available"))
            status = (
                "full-demo-ready"
                if line_data_available
                else "coverage-only"
            )
            status_meta = build_status_metadata(
                status,
                "Coverage, cards, semantic fields, and comparison workspace are all available for this sample."
                if status == "full-demo-ready"
                else "Overview / coverage is available, but line-level cards or semantic payloads are still incomplete.",
            )
            entry = {
                "id": sample,
                "title": processed["title"],
                "cantica": processed["cantica"],
                "canto": processed["canto"],
                "record_count": processed["record_count"],
                "line_count": processed["line_count"],
                "unique_commentary_count": processed["unique_commentary_count"],
                "overview_available": True,
                "overview_path": f"./data/{sample}/overview.json",
                "line_data_path": f"./data/{sample}/lines" if line_data_available else None,
                "line_data_available": line_data_available,
                "record_store_path": f"./data/{sample}/records/store.json" if record_store_available else None,
                "record_store_index_path": f"./data/{sample}/records/index.json" if record_store_available else None,
                "record_store_available": record_store_available,
                "record_fulltext_path": f"./data/{sample}/records/fulltext.json" if record_fulltext_available else None,
                "record_fulltext_available": record_fulltext_available,
                "reports": public_manifest_reports(processed.get("report_paths")),
                "success_count": item["success_count"],
                "row_count": item["row_count"],
                "failure_count": item["failure_count"],
                **status_meta,
            }
        elif item.get("exclusion_reason"):
            status_meta = build_status_metadata("incomplete", item["exclusion_reason"])
            entry = {
                "id": sample,
                "title": title,
                "cantica": item["cantica"],
                "canto": item["canto"],
                "record_count": item["success_count"],
                "line_count": item["estimated_line_count"],
                "unique_commentary_count": item["unique_commentary_count"],
                "overview_available": False,
                "overview_path": None,
                "line_data_path": None,
                "line_data_available": False,
                "record_store_path": None,
                "record_store_index_path": None,
                "record_store_available": False,
                "record_fulltext_path": None,
                "record_fulltext_available": False,
                "reports": {},
                "success_count": item["success_count"],
                "row_count": item["row_count"],
                "failure_count": item["failure_count"],
                **status_meta,
            }
        elif (
            item["success_count"] > 0
            and item["line_info_count"] == item["row_count"]
            and item["line_span_count"] == item["row_count"]
            and item["line_start_count"] == item["row_count"]
            and item["line_end_count"] == item["row_count"]
        ):
            coverage_payload = build_coverage_only_overview(sample)
            status_meta = build_status_metadata("coverage-only")
            entry = {
                "id": sample,
                "title": coverage_payload["overview"]["title"] or title,
                "cantica": coverage_payload["overview"]["cantica"] or item["cantica"],
                "canto": coverage_payload["overview"]["canto"] or item["canto"],
                "record_count": coverage_payload["overview"]["record_count"],
                "line_count": coverage_payload["overview"]["line_count"],
                "unique_commentary_count": coverage_payload["overview"]["unique_commentary_count"],
                "overview_available": True,
                "overview_path": f"./data/{sample}/overview.json",
                "line_data_path": None,
                "line_data_available": False,
                "record_store_path": None,
                "record_store_index_path": None,
                "record_store_available": False,
                "record_fulltext_path": None,
                "record_fulltext_available": False,
                "reports": {},
                "success_count": item["success_count"],
                "row_count": item["row_count"],
                "failure_count": item["failure_count"],
                **status_meta,
            }
        elif item["success_count"] > 0:
            status_meta = build_status_metadata("shell-only")
            entry = {
                "id": sample,
                "title": title,
                "cantica": item["cantica"],
                "canto": item["canto"],
                "record_count": item["success_count"],
                "line_count": item["estimated_line_count"],
                "unique_commentary_count": item["unique_commentary_count"],
                "overview_available": False,
                "overview_path": None,
                "line_data_path": None,
                "line_data_available": False,
                "record_store_path": None,
                "record_store_index_path": None,
                "record_store_available": False,
                "record_fulltext_path": None,
                "record_fulltext_available": False,
                "reports": {},
                "success_count": item["success_count"],
                "row_count": item["row_count"],
                "failure_count": item["failure_count"],
                **status_meta,
            }
        else:
            status_meta = build_status_metadata("incomplete")
            entry = {
                "id": sample,
                "title": title,
                "cantica": item["cantica"],
                "canto": item["canto"],
                "record_count": item["success_count"],
                "line_count": item["estimated_line_count"],
                "unique_commentary_count": item["unique_commentary_count"],
                "overview_available": False,
                "overview_path": None,
                "line_data_path": None,
                "line_data_available": False,
                "record_store_path": None,
                "record_store_index_path": None,
                "record_store_available": False,
                "record_fulltext_path": None,
                "record_fulltext_available": False,
                "reports": {},
                "success_count": item["success_count"],
                "row_count": item["row_count"],
                "failure_count": item["failure_count"],
                **status_meta,
            }

        entries.append(entry)

    return entries


def normalize_poem_lines(rows: Iterable[dict], sample: str | None = None) -> Dict[int, str]:
    line_texts: Dict[int, str] = {}
    canonical_lines = load_canonical_line_cache().get(sample or "", {})

    for row in rows:
        if row.get("commentary_name") != "Text of the Divine Comedy":
            continue

        try:
            start = int(row["line_start"])
            end = int(row["line_end"])
        except (TypeError, ValueError, KeyError):
            continue

        for offset, line_number in enumerate(range(start, end + 1)):
            canonical_line = canonical_lines.get(line_number)
            if canonical_line:
                line_texts[line_number] = canonical_line
                continue

        if all(line_number in line_texts for line_number in range(start, end + 1)):
            continue

        lines = [clean_poem_line(piece) for piece in row.get("record_text", "").splitlines()]
        lines = [piece for piece in lines if piece]
        expected = end - start + 1
        if len(lines) < expected:
            lines.extend([""] * (expected - len(lines)))

        for offset, line_number in enumerate(range(start, end + 1)):
            line_texts.setdefault(line_number, lines[offset] if offset < len(lines) else "")

    return line_texts


def clean_poem_line(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").strip().split())


def normalize_locus_form(token: str) -> str:
    normalized = normalize_semantic_text(token)
    normalized = re.sub(r"[^a-z']", "", normalized).strip("'")
    normalized = normalized.replace("'", "")
    return normalized


def tokenize_dante_line(line_text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ']+", line_text)


def build_dante_loci(sample: str, line_number: int, line_text: str) -> list[dict]:
    loci = []
    for token_index, raw_token in enumerate(tokenize_dante_line(line_text)):
        normalized_form = normalize_locus_form(raw_token)
        if not normalized_form:
            continue
        is_stopword = normalized_form in DANTE_WORD_STOPWORDS
        is_selectable_locus = (not is_stopword) and len(normalized_form) >= 3
        loci.append(
            {
                "id": f"{sample}-l{line_number:03d}-w{token_index}-{normalized_form}",
                "surface_form": raw_token,
                "normalized_form": normalized_form,
                "lemma": None,
                "pos": None,
                "morph_features": None,
                "normalization_method": "lower_ascii_exact_form",
                "is_stopword": is_stopword,
                "is_selectable_locus": is_selectable_locus,
                "token_index": token_index,
            }
        )
    return loci


def build_record_summary(text: str, limit: int = 280) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def normalize_semantic_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.replace("’", "'")
    return normalized


def normalize_filter_token(text: str) -> str:
    normalized = normalize_semantic_text(text)
    normalized = re.sub(r"[^a-z']", "", normalized).strip("'")
    return normalized.replace("'", "")


def tokenize_semantic_text(text: str) -> list[str]:
    normalized = normalize_semantic_text(text)
    candidates = re.findall(r"[a-z]{4,}", normalized)
    tokens = []
    for token in candidates:
        if token in STOPWORDS:
            continue
        if any(token.startswith(prefix) for prefix in RESIDUAL_FUNCTION_PATTERNS):
            continue
        canonical = CANONICAL_TERM_MAP.get(token, token)
        tokens.append(canonical)
    return tokens


def is_meaningful_concurrence_term(term: str | None, focus_word: str | None = None) -> bool:
    normalized = normalize_filter_token(term or "")
    focus = normalize_filter_token(focus_word or "")
    if not normalized or normalized == focus:
        return False
    if normalized in STOPWORDS or normalized in DANTE_WORD_STOPWORDS:
        return False
    if normalized in LABEL_NOISE_TERMS or normalized in WORD_PROFILE_NOISE_TERMS:
        return False
    if normalized in LOW_SEMANTIC_CONCURRENCE_TERMS:
        return False
    if any(normalized.startswith(prefix) for prefix in RESIDUAL_FUNCTION_PATTERNS):
        return False
    if len(normalized) <= 2:
        return False
    return True


def build_line_signature(records: list[dict]) -> list[str]:
    document_frequency: Counter[str] = Counter()
    token_frequency: dict[str, float] = defaultdict(float)

    for record in records:
        text = f"{record.get('record_summary', '')} {record.get('record_text_preview', '')}"
        tokens = tokenize_semantic_text(text)
        if not tokens:
            continue
        contribution_weight = 1 / max(int(record.get("line_span") or 1), 1)
        token_counts = Counter(tokens)
        for token, count in token_counts.items():
            token_frequency[token] += count * contribution_weight
        document_frequency.update(set(tokens))

    weighted_terms = []
    total_records = max(len(records), 1)
    for token, df in document_frequency.items():
        if df < 2:
            continue
        idf = math.log(1 + total_records / (1 + df))
        weighted_terms.append((token_frequency[token] * idf, df, token))

    weighted_terms.sort(key=lambda item: (-item[0], -item[1], item[2]))
    return [token for _, _, token in weighted_terms[:12]]


def build_top_commentary_terms(records: list[dict], limit: int = 5) -> list[str]:
    counts: dict[str, float] = defaultdict(float)
    for record in records:
        text = f"{record.get('record_summary', '')} {record.get('record_text_preview', '')}"
        contribution_weight = 1 / max(int(record.get("line_span") or 1), 1)
        token_counts = Counter(tokenize_semantic_text(text))
        for token, count in token_counts.items():
            if not token or token in TOP_COMMENTARY_TERM_NOISE_TERMS:
                continue
            if looks_like_bad_word_profile_term(token):
                continue
            counts[token] += count * contribution_weight

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [token for token, _ in ranked[:limit]]


TOP_COMMENTARY_TERMS_NOTE = (
    "Backend-generated line-span-weighted lexical contour from record_summary + "
    "record_text_preview, filtered for stopwords, residual function fragments, "
    "low-semantic commentary noise, and weak contour-only verb residue."
)


def count_tokens(tokens: list[str]) -> Counter[str]:
    return Counter(tokens)


def unique_preserving_order(values: Iterable[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def summarize_terms_for_members(
    record_profiles: list[dict], member_indices: list[int], limit: int
) -> list[str]:
    aggregate: dict[str, float] = defaultdict(float)
    for index in member_indices:
        profile = record_profiles[index]
        for token, weight in profile["weights"].items():
            aggregate[token] += weight

    ranked = sorted(aggregate.items(), key=lambda item: (-item[1], item[0]))
    clean_terms = []
    fallback_terms = []
    seen = set()
    for token, _ in ranked:
        token_key = normalize_field_label_key(token) or token
        if token_key in seen:
            continue
        seen.add(token_key)
        if looks_like_bad_label(token) or looks_like_commentarial_formula_term(token):
            fallback_terms.append(token)
        else:
            clean_terms.append(token)

    terms = clean_terms[:limit]
    if len(terms) < limit:
        terms.extend(fallback_terms[: limit - len(terms)])
    return terms[:limit]


def build_semantic_document(record: dict) -> str:
    return " ".join(
        piece.strip()
        for piece in [record.get("record_summary", ""), record.get("record_text_preview", "")]
        if piece and piece.strip()
    )


def build_record_profiles(records: list[dict]) -> list[dict]:
    record_profiles = []
    for record in records:
        semantic_text = build_semantic_document(record)
        tokens = tokenize_semantic_text(semantic_text)
        token_counts = count_tokens(tokens)
        if not token_counts:
            continue
        contribution_weight = 1 / max(int(record.get("line_span") or 1), 1)
        record_profiles.append(
            {
                "record": record,
                "document": semantic_text,
                "token_counts": token_counts,
                "token_set": set(token_counts),
                "contribution_weight": contribution_weight,
                "weights": {token: count * contribution_weight for token, count in token_counts.items()},
            }
        )
    return record_profiles


def build_local_semantic_embeddings(record_profiles: list[dict]) -> np.ndarray | None:
    documents = [profile["document"] for profile in record_profiles]
    if len(documents) < 2:
        return None

    try:
        word_vectorizer = TfidfVectorizer(
            tokenizer=tokenize_semantic_text,
            token_pattern=None,
            lowercase=False,
            ngram_range=(1, 2),
            min_df=1,
            sublinear_tf=True,
            max_df=0.92,
            max_features=4000,
            dtype=np.float32,
        )
        word_matrix = word_vectorizer.fit_transform(documents)
    except ValueError:
        return None

    n_samples, n_features = word_matrix.shape
    if n_samples < 2 or n_features < 2:
        return None

    max_components = min(24, n_samples - 1, n_features - 1)
    try:
        if max_components >= 2:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                svd = TruncatedSVD(n_components=max_components, random_state=42, n_iter=7)
                reduced = svd.fit_transform(word_matrix)
        else:
            reduced = word_matrix.toarray()
    except Exception:
        return None

    if not np.isfinite(reduced).all():
        return None

    return normalize(reduced)


def fit_local_clusters(embeddings: np.ndarray, weights: list[float]) -> np.ndarray:
    sample_count = len(embeddings)
    if sample_count < 5:
        return np.zeros(sample_count, dtype=int)

    max_clusters = min(6, sample_count - 1)
    if max_clusters < 2:
        return np.zeros(sample_count, dtype=int)

    best_labels = None
    best_score = -1.0

    for cluster_count in range(2, max_clusters + 1):
        model = KMeans(n_clusters=cluster_count, n_init=18, random_state=42)
        try:
            model.fit(embeddings, sample_weight=weights)
        except TypeError:
            model.fit(embeddings)

        labels = model.labels_
        if len(set(labels)) < 2:
            continue

        silhouette = silhouette_score(embeddings, labels, metric="euclidean")
        cluster_sizes = Counter(labels)
        balance = min(cluster_sizes.values()) / max(cluster_sizes.values())
        score = silhouette + (0.04 * balance)

        if score > best_score:
            best_score = score
            best_labels = labels.copy()

    if best_labels is None or best_score < 0.06:
        return np.zeros(sample_count, dtype=int)
    return best_labels


def summarize_cluster_terms(
    record_profiles: list[dict],
    member_indices: list[int],
    current_line_number: int,
    signature_lookup: dict[int, list[str]],
    line_text_lookup: dict[int, str],
    limit: int = 5,
) -> list[str]:
    member_set = set(member_indices)
    in_cluster: dict[str, float] = defaultdict(float)
    out_cluster: dict[str, float] = defaultdict(float)
    record_support: Counter[str] = Counter()
    commentator_support: dict[str, set[str]] = defaultdict(set)
    line_signature_terms = {
        term
        for term in (
            normalize_field_label_key(value)
            for value in (signature_lookup.get(current_line_number, []) or [])
        )
        if term
    }
    line_text_terms = tokenize_semantic_text(line_text_lookup.get(current_line_number, ""))

    for index, profile in enumerate(record_profiles):
        target = in_cluster if index in member_set else out_cluster
        for token, count in profile["token_counts"].items():
            target[token] += count * profile["contribution_weight"]
        if index in member_set:
            for token in profile["token_set"]:
                record_support[token] += 1
                commentary_name = str(profile["record"].get("commentary_name") or "").strip()
                if commentary_name:
                    commentator_support[token].add(commentary_name)

    in_total = sum(in_cluster.values()) or 1.0
    out_total = sum(out_cluster.values()) or 1.0
    scored_terms = []

    for token, in_count in in_cluster.items():
        if in_count < 0.35:
            continue
        in_rate = in_count / in_total
        out_rate = (out_cluster.get(token, 0.0) + 0.05) / (out_total + 0.05)
        distinctiveness = in_rate / out_rate
        prior = get_field_label_prior(token)
        token_key = normalize_field_label_key(token) or token
        commentator_count = len(commentator_support.get(token, set()))
        token_record_support = int(record_support.get(token, 0))
        anchored_to_signature = token_key in line_signature_terms
        anchored_to_line = anchored_to_signature or overlaps_line_text(token, line_text_terms)

        score = in_count * math.log1p(distinctiveness)
        score += min(token_record_support, 8) * 0.26
        score += min(commentator_count, 6) * 0.45

        if anchored_to_signature:
            score += 3.2
        if overlaps_line_text(token, line_text_terms):
            score += 2.6
        if canonical_figure_label(token):
            score += 0.8

        if token_record_support <= 1 and commentator_count <= 1 and not anchored_to_line:
            score -= 1.4
        if looks_like_bad_label(token):
            score -= 4.8
        if looks_like_corpus_drift_term(token):
            score -= 2.6
        if looks_like_commentarial_formula_term(token):
            score -= 3.2
        if token_key in COMMENTARIAL_DISCOURSE_TERMS and not anchored_to_line:
            score -= 2.4
        if looks_like_broad_interpretive_term(token) and not anchored_to_line:
            score -= 1.2
        if prior["count"] >= 8 and prior["review_rate"] >= 0.45:
            score -= 1.8
        elif prior["count"] >= 8 and prior["review_rate"] <= 0.12 and anchored_to_line:
            score += 0.5

        is_clean = not looks_like_bad_label(token) and not looks_like_commentarial_formula_term(token)
        scored_terms.append((score, in_count, token, is_clean))

    scored_terms.sort(key=lambda item: (-item[0], -item[1], item[2]))
    clean_terms = []
    fallback_terms = []
    seen = set()
    for score, _, token, is_clean in scored_terms:
        if score < 1.15:
            continue
        token_key = normalize_field_label_key(token) or token
        if token_key in seen:
            continue
        seen.add(token_key)
        if is_clean:
            clean_terms.append(token)
        else:
            fallback_terms.append(token)
    terms = clean_terms[:limit]
    if len(terms) < limit:
        terms.extend(fallback_terms[: limit - len(terms)])
    return terms


def build_semantic_fields_from_clusters(
    sample: str,
    record_profiles: list[dict],
    cluster_labels: np.ndarray,
    current_line_number: int,
    signature_lookup: dict[int, list[str]],
    line_text_lookup: dict[int, str],
) -> dict:
    record_to_field: dict[str, str] = {}
    finalized_fields = []
    total_records = len(record_profiles)

    for cluster_label in sorted(set(int(label) for label in cluster_labels)):
        assigned_indices = [index for index, label in enumerate(cluster_labels) if int(label) == cluster_label]
        if not assigned_indices:
            continue

        representative_terms = summarize_cluster_terms(
            record_profiles,
            assigned_indices,
            current_line_number,
            signature_lookup,
            line_text_lookup,
            5,
        )
        if not representative_terms:
            representative_terms = summarize_terms_for_members(record_profiles, assigned_indices, 5)

        seed_term = representative_terms[0] if representative_terms else f"cluster-{cluster_label + 1}"
        field_id = f"field-{cluster_label + 1}-{seed_term}"
        for index in assigned_indices:
            record_to_field[record_profiles[index]["record"]["id"]] = field_id

        finalized_fields.append(
            build_finalized_field(
                sample=sample,
                field_id=field_id,
                seed_term=seed_term,
                representative_terms=representative_terms,
                assigned_indices=assigned_indices,
                record_profiles=record_profiles,
                total_records=total_records,
                current_line_number=current_line_number,
                signature_lookup=signature_lookup,
                line_text_lookup=line_text_lookup,
            )
        )

    field_kind_rank = {
        "line_semantic": 0,
        "figure_anchor": 1,
        "commentarial_discourse": 2,
        "residual_provisional": 3,
    }
    finalized_fields.sort(
        key=lambda item: (
            -item.get("quality_score", 0),
            field_kind_rank.get(item.get("field_kind", ""), 9),
            -item.get("label_confidence", 0),
            -item["unique_commentator_count"],
            -item["record_count"],
            item["label"],
        )
    )
    finalized_fields, record_to_field, review_candidates = prune_semantic_fields(finalized_fields, record_to_field)
    return {
        "fields": finalized_fields,
        "review_candidates": review_candidates,
        "record_to_field": record_to_field,
    }


def format_field_label(terms: list[str], seed_term: str | None = None) -> str:
    if seed_term:
        return seed_term
    if not terms:
        return "Loose semantic cluster"
    return terms[0]


def looks_like_bad_label(term: str | None) -> bool:
    if not term:
        return True
    normalized = normalize_field_label_key(term) or normalize_semantic_text(term)
    if normalized in STOPWORDS or normalized in LABEL_NOISE_TERMS:
        return True
    if any(normalized.startswith(prefix) for prefix in RESIDUAL_FUNCTION_PATTERNS):
        return True
    if any(normalized.startswith(prefix) for prefix in COMMENTARIAL_RESIDUE_PREFIXES):
        return True
    return False


def normalize_display_label(term: str | None) -> str | None:
    if not term:
        return term
    normalized = normalize_semantic_text(term)
    normalized = DISPLAY_LABEL_NORMALIZATION.get(normalized, normalized)
    normalized = CANONICAL_TERM_MAP.get(normalized, normalized)
    return normalized


def normalize_field_label_key(term: str | None) -> str | None:
    if not term:
        return None
    normalized = normalize_display_label(term) or term
    normalized = normalize_semantic_text(normalized)
    return normalized or None


def load_field_label_priors() -> dict[str, dict[str, float]]:
    global FIELD_LABEL_PRIOR_CACHE
    if FIELD_LABEL_PRIOR_CACHE is not None:
        return FIELD_LABEL_PRIOR_CACHE

    raw_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for line_file in DEMO_DATA_DIR.glob("*/lines/*.json"):
        try:
            payload = json.loads(line_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        for field in (payload.get("semantic_fields") or {}).get("fields", []):
            label = normalize_field_label_key(
                field.get("display_label") or field.get("label") or field.get("internal_label")
            )
            if not label:
                continue

            qa = field.get("qa") or {}
            flags = qa.get("flags") or []
            raw_counts[label]["count"] += 1
            if qa.get("review_needed"):
                raw_counts[label]["review_count"] += 1
            if "not_line_anchored" in flags:
                raw_counts[label]["not_line_anchored_count"] += 1
            if "corpus_drift_label" in flags:
                raw_counts[label]["drift_count"] += 1
            if "label_changed" in flags:
                raw_counts[label]["changed_count"] += 1

    priors = {}
    for label, counts in raw_counts.items():
        total = counts.get("count", 0) or 1
        priors[label] = {
            "count": counts.get("count", 0),
            "review_rate": counts.get("review_count", 0) / total,
            "not_line_anchored_rate": counts.get("not_line_anchored_count", 0) / total,
            "drift_rate": counts.get("drift_count", 0) / total,
            "changed_rate": counts.get("changed_count", 0) / total,
        }

    FIELD_LABEL_PRIOR_CACHE = priors
    return priors


def load_local_semantic_field_integration_queue() -> dict[str, Any]:
    global LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE
    if LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE is not None:
        return LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE

    queue_path = THREAD_REVIEW_DIR / "LOCAL_SEMANTIC_FIELDS_INTEGRATION_QUEUE.csv"
    if not queue_path.exists():
        LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE = {
            "term_defaults": {},
            "row_overrides": {},
        }
        return LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE

    term_defaults: dict[str, str] = {}
    row_overrides: dict[tuple[str, str], str] = {}
    with queue_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            label = normalize_field_label_key(row.get("target_term"))
            placement = str(row.get("placement") or "").strip()
            record_id = str(row.get("record_id") or "").strip()
            scope = str(row.get("scope") or "").strip()
            if not label or placement not in {"front_display", "review_only", "drop", "conditional_keep"}:
                continue
            if scope == "term_default":
                term_defaults[label] = placement
            elif scope == "row_override" and record_id:
                row_overrides[(record_id, label)] = placement

    LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE = {
        "term_defaults": term_defaults,
        "row_overrides": row_overrides,
    }
    return LOCAL_SEMANTIC_FIELD_INTEGRATION_QUEUE_CACHE


def get_local_semantic_field_integration_placement(record_id: str, label: str | None) -> str | None:
    normalized = normalize_field_label_key(label)
    if not normalized:
        return None
    queue = load_local_semantic_field_integration_queue()
    row_override = queue["row_overrides"].get((record_id, normalized))
    if row_override:
        return row_override
    return queue["term_defaults"].get(normalized)


def get_field_label_prior(term: str | None) -> dict[str, float]:
    key = normalize_field_label_key(term)
    if not key:
        return {"count": 0, "review_rate": 0.0, "not_line_anchored_rate": 0.0, "drift_rate": 0.0, "changed_rate": 0.0}
    return load_field_label_priors().get(
        key,
        {"count": 0, "review_rate": 0.0, "not_line_anchored_rate": 0.0, "drift_rate": 0.0, "changed_rate": 0.0},
    )


def looks_like_corpus_drift_term(term: str | None) -> bool:
    if not term:
        return False
    normalized = normalize_field_label_key(term)
    return normalized in CORPUS_DRIFT_TERMS


def looks_like_broad_interpretive_term(term: str | None) -> bool:
    if not term:
        return False
    normalized = normalize_field_label_key(term)
    return normalized in BROAD_INTERPRETIVE_REVIEW_TERMS


def looks_like_commentarial_formula_term(term: str | None) -> bool:
    if not term:
        return False
    normalized = normalize_field_label_key(term)
    return normalized in COMMENTARIAL_FORMULA_REVIEW_TERMS


def looks_like_commentarial_paraphrase_term(term: str | None) -> bool:
    if not term:
        return False
    normalized = normalize_field_label_key(term)
    return normalized in COMMENTARIAL_PARAPHRASE_TERMS


def should_block_display_label_candidate(term: str | None) -> bool:
    if not term:
        return True
    return looks_like_bad_label(term) or looks_like_commentarial_formula_term(term)


def canonical_figure_label(term: str | None) -> str | None:
    normalized = normalize_field_label_key(term)
    if not normalized:
        return None
    for figure in FIGURE_REGISTRY.values():
        aliases = {normalize_field_label_key(alias) for alias in figure["aliases"]}
        if normalized in aliases:
            return figure["display_label"]
    return None


def figure_aliases_for_display_label(display_label: str | None) -> set[str]:
    if not display_label:
        return set()
    normalized_display = normalize_field_label_key(display_label)
    if not normalized_display:
        return set()
    for figure in FIGURE_REGISTRY.values():
        if normalize_field_label_key(figure["display_label"]) != normalized_display:
            continue
        return {
            alias_key
            for alias_key in (normalize_field_label_key(alias) for alias in figure["aliases"])
            if alias_key
        }
    return set()


def figure_label_supported_by_line(
    display_label: str | None,
    line_signature_terms: list[str],
    line_text: str,
) -> bool:
    aliases = figure_aliases_for_display_label(display_label)
    if not aliases:
        return False
    line_text_terms = {
        normalize_field_label_key(term)
        for term in tokenize_semantic_text(line_text)
        if normalize_field_label_key(term)
    }
    return bool(aliases & line_text_terms)


def derive_residual_display_gloss(representative_terms: list[str]) -> tuple[str | None, str | None, str | None]:
    normalized_terms = [normalize_field_label_key(term) for term in representative_terms[:4] if term]
    if not normalized_terms:
        return None, None, None

    bad_or_discourse_count = sum(
        1
        for term in normalized_terms
        if looks_like_bad_label(term) or term in COMMENTARIAL_DISCOURSE_TERMS
    )
    if bad_or_discourse_count < max(2, min(3, len(normalized_terms))):
        return None, None, None

    if any(term in CHAPTER_DIVISION_TERMS for term in normalized_terms):
        return "chapter / exposition structure", "commentarial_discourse", "cluster is dominated by chapter-division commentary terms"
    if any(term in GLOSS_APPARATUS_TERMS for term in normalized_terms):
        return "gloss / apparatus residue", "residual_provisional", "cluster is dominated by gloss-apparatus residue"
    if any(term in COMMENTARIAL_DISCOURSE_TERMS for term in normalized_terms):
        return "commentarial discourse", "commentarial_discourse", "cluster is dominated by commentary-discourse residue"
    return None, None, None


def looks_like_bad_word_profile_term(term: str | None, locus_form: str | None = None) -> bool:
    if not term:
        return True
    if term == locus_form:
        return True
    if term in STOPWORDS or term in WORD_PROFILE_NOISE_TERMS or term in LABEL_NOISE_TERMS:
        return True
    if looks_like_corpus_drift_term(term):
        return True
    if looks_like_commentarial_formula_term(term):
        return True
    if any(term.startswith(prefix) for prefix in RESIDUAL_FUNCTION_PATTERNS):
        return True
    if len(term) <= 3:
        return True
    return False


def line_profile_candidate_terms(line_profile: dict) -> list[str]:
    values = [
        *(line_profile.get("semantic_terms") or []),
        *(line_profile.get("signature_terms") or []),
        *[
            locus.get("normalized_form")
            for locus in (line_profile.get("dante_loci") or [])
            if locus.get("is_selectable_locus")
        ],
    ]
    return unique_preserving_order(
        term
        for term in (normalize_field_label_key(value) for value in values)
        if term
    )


def get_echo_eligible_payload_fields(payload_fields: list[dict]) -> list[dict]:
    fields = [
        field
        for field in (payload_fields or [])
        if field
        and field.get("field_kind") != "residual_provisional"
        and float(field.get("label_confidence") or 0) >= 0.4
    ]
    preferred = [
        field
        for field in fields
        if field.get("field_kind") in {"line_semantic", "figure_anchor"}
    ]
    if preferred:
        return preferred
    return [field for field in fields if field.get("field_kind") == "commentarial_discourse"]


def build_line_echo_source_fields(
    line_profile: dict,
    payload_fields: list[dict],
    field_docfreq: Counter[str],
    total_lines: int,
) -> list[dict]:
    field_map: dict[str, dict] = {}
    for index, field in enumerate(get_echo_eligible_payload_fields(payload_fields)):
        display_label = (
            field.get("display_label")
            or field.get("label")
            or field.get("internal_label")
            or ""
        ).strip()
        label = normalize_field_label_key(display_label)
        if not label or looks_like_bad_word_profile_term(label):
            continue
        existing = field_map.setdefault(
            label,
            {
                "label": label,
                "display_label": display_label,
                "local_score": 0.0,
                "support": 0,
            },
        )
        existing["local_score"] += float(field.get("quality_score") or 0) * 0.7
        existing["local_score"] += min(int(field.get("record_count") or 0), 80) * 0.035
        existing["local_score"] += max(0, 4 - index) * 0.4
        existing["support"] = max(existing["support"], int(field.get("record_count") or 0))

    for index, raw_label in enumerate(line_profile.get("field_labels") or []):
        label = normalize_field_label_key(raw_label)
        if not label or looks_like_bad_word_profile_term(label):
            continue
        existing = field_map.setdefault(
            label,
            {
                "label": label,
                "display_label": str(raw_label or "").strip() or label,
                "local_score": 0.0,
                "support": 0,
            },
        )
        existing["local_score"] += max(0.4, 1.4 - index * 0.14)

    items = []
    for item in field_map.values():
        corpus_field_count = int(field_docfreq.get(item["label"], 0))
        rarity_score = math.log((total_lines + 1) / ((corpus_field_count or 0) + 1))
        echo_score = item["local_score"] + rarity_score * 0.9
        corpus_share = corpus_field_count / max(total_lines, 1)
        if not (corpus_share <= 0.03 or item["support"] >= 12 or echo_score >= 8):
            continue
        items.append(
            {
                **item,
                "corpus_field_count": corpus_field_count,
                "rarity_score": rarity_score,
                "echo_score": echo_score,
            }
        )

    items.sort(
        key=lambda item: (
            -item["echo_score"],
            -item["support"],
            item["display_label"],
        )
    )
    return items[:4]


def build_line_echo_source_terms(
    line_profile: dict,
    payload_fields: list[dict],
    term_docfreq: Counter[str],
    total_lines: int,
) -> list[dict]:
    term_map: dict[str, dict] = {}

    def add_term(raw_term: str | None, score: float, line_count: int = 1) -> None:
        term = normalize_field_label_key(raw_term)
        if not term or looks_like_bad_word_profile_term(term):
            return
        existing = term_map.setdefault(term, {"term": term, "local_score": 0.0, "line_count": 0})
        existing["local_score"] += score
        existing["line_count"] = max(existing["line_count"], int(line_count or 0))

    for index, term in enumerate(line_profile.get("signature_terms") or []):
        add_term(term, max(1.6, 4.2 - index * 0.28), 1)

    for field_index, field in enumerate(get_echo_eligible_payload_fields(payload_fields)[:4]):
        if float(field.get("label_confidence") or 0) < 0.45:
            continue
        for term_index, term in enumerate((field.get("representative_terms") or [])[:4]):
            add_term(term, max(0.45, 1.5 - field_index * 0.18 - term_index * 0.16), 1)

    for index, term in enumerate(line_profile.get("semantic_terms") or []):
        add_term(term, max(0.35, 1.0 - index * 0.08), 1)

    items = []
    for item in term_map.values():
        corpus_line_count = int(term_docfreq.get(item["term"], 0))
        rarity_score = math.log((total_lines + 1) / ((corpus_line_count or 0) + 1))
        echo_score = item["local_score"] * (1 + rarity_score)
        corpus_share = corpus_line_count / max(total_lines, 1)
        if not (corpus_share <= 0.015 or echo_score >= 9):
            continue
        items.append(
            {
                **item,
                "corpus_line_count": corpus_line_count,
                "rarity_score": rarity_score,
                "echo_score": echo_score,
            }
        )

    items.sort(
        key=lambda item: (
            -item["echo_score"],
            item["corpus_line_count"],
            item["term"],
        )
    )
    return items[:6]


def build_line_echo_candidates(
    source_line_profile: dict,
    source_term_items: list[dict],
    source_field_items: list[dict],
    line_profiles_by_id: dict[str, dict],
    term_to_line_ids: dict[str, set[str]],
    field_to_line_ids: dict[str, set[str]],
) -> list[dict]:
    source_term_weights = {item["term"]: float(item["echo_score"]) for item in source_term_items}
    source_field_weights = {item["label"]: float(item["echo_score"]) for item in source_field_items}
    current_key = source_line_profile["id"]

    candidate_line_ids: set[str] = set()
    for item in source_term_items:
        candidate_line_ids.update(term_to_line_ids.get(item["term"], set()))
    for item in source_field_items:
        candidate_line_ids.update(field_to_line_ids.get(item["label"], set()))
    candidate_line_ids.discard(current_key)

    candidates = []
    for line_id in candidate_line_ids:
        line = line_profiles_by_id.get(line_id)
        if not line or line["sample"] == source_line_profile["sample"]:
            continue

        candidate_cue_set = set(line_profile_candidate_terms(line))
        field_label_set = {
            term
            for term in (normalize_field_label_key(label) for label in (line.get("field_labels") or []))
            if term
        }

        shared_terms = [item for item in source_term_items if item["term"] in candidate_cue_set][:4]
        shared_fields = [item for item in source_field_items if item["label"] in field_label_set][:3]

        shared_term_score = sum(min(5.2, source_term_weights.get(item["term"], 0.0) / 2.6) for item in shared_terms)
        shared_field_score = sum(min(4.6, source_field_weights.get(item["label"], 0.0) / 1.8) for item in shared_fields)
        overlap_count = len(shared_terms) + len(shared_fields)
        has_mixed_evidence = bool(shared_terms and shared_fields)
        strong_field_echo = len(shared_fields) >= 2
        strong_cue_echo = len(shared_terms) >= 3 and shared_term_score >= 6.2
        passes_evidence_gate = has_mixed_evidence or strong_field_echo or strong_cue_echo

        score = (
            shared_term_score
            + shared_field_score
            + (1.1 if has_mixed_evidence else 0.0)
            + (0.7 if strong_field_echo else 0.0)
            + (0.5 if strong_cue_echo else 0.0)
            + (0.6 if overlap_count >= 3 else 0.0)
            + min(len(shared_fields), 3) * 0.2
        )
        if not passes_evidence_gate or score < 4.2:
            continue

        echo_type = "cue-echo"
        echo_type_label = "cue echo"
        if has_mixed_evidence:
            echo_type = "mixed-echo"
            echo_type_label = "mixed echo"
        elif shared_fields:
            echo_type = "field-echo"
            echo_type_label = "field echo"

        candidates.append(
            {
                "id": line["id"],
                "sample": line["sample"],
                "title": line["title"],
                "cantica": line["cantica"],
                "canto": line["canto"],
                "line_number": line["line_number"],
                "line_text": line["line_text"],
                "score": round(score, 3),
                "shared_terms": [item["term"] for item in shared_terms],
                "shared_fields": [item["display_label"] for item in shared_fields],
                "overlap_count": overlap_count,
                "echo_type": echo_type,
                "echo_type_label": echo_type_label,
                "has_mixed_evidence": has_mixed_evidence,
                "strong_field_echo": strong_field_echo,
                "strong_cue_echo": strong_cue_echo,
            }
        )

    candidates.sort(
        key=lambda item: (
            -item["score"],
            -int(item["has_mixed_evidence"]),
            -int(item["strong_field_echo"]),
            -int(item["strong_cue_echo"]),
            -item["overlap_count"],
            -len(item["shared_fields"]),
            -len(item["shared_terms"]),
            *sample_id_sort_key(item["sample"]),
            item["line_number"],
        )
    )
    return candidates[:12]


def load_cross_canto_baseline_profiles(variant: str = "baseline") -> dict[str, dict]:
    if not CROSS_CANTO_BASELINE_PATH.exists():
        return {}
    try:
        payload = json.loads(CROSS_CANTO_BASELINE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    section = payload.get(variant) or {}
    rows = section.get("lines") or []
    return {
        str(row.get("line_id")): row
        for row in rows
        if row.get("line_id")
    }


def load_cross_canto_explanation_support() -> dict[str, dict[str, dict[str, Any]]]:
    if not CROSS_CANTO_MAINLINE_PATH.exists():
        return {}
    try:
        payload = json.loads(CROSS_CANTO_MAINLINE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    support: dict[str, dict[str, dict[str, Any]]] = {}
    for row in payload.get("lines") or []:
        source_id = str(row.get("line_id") or "").strip()
        if not source_id:
            continue
        echo_map: dict[str, dict[str, Any]] = {}
        for echo in row.get("top_echoes") or []:
            candidate_id = str(echo.get("candidate_line_id") or "").strip()
            if not candidate_id:
                continue
            axis_labels = [str(label).strip() for label in (echo.get("axis_labels") or []) if str(label).strip()]
            axis_paths = [str(path).strip() for path in (echo.get("axis_paths") or []) if str(path).strip()]
            relation_note = str(echo.get("relation_note") or "").strip()
            if not axis_labels and not axis_paths and not relation_note:
                continue
            echo_map[candidate_id] = {
                "axis_labels": axis_labels,
                "axis_paths": axis_paths,
                "relation_note": relation_note,
            }
        if echo_map:
            support[source_id] = echo_map
    return support


def load_line_echo_axis_support() -> dict[str, dict[str, Any]]:
    if not LINE_ECHO_AXIS_PROFILE_PATH.exists():
        return {}
    try:
        payload = json.loads(LINE_ECHO_AXIS_PROFILE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    support: dict[str, dict[str, Any]] = {}
    for row in payload.get("profiles") or []:
        line_id = str(row.get("id") or "").strip()
        profile = row.get("line_echo_axis_profile") or {}
        primary_axes = profile.get("primary_axes") or []
        if not line_id or not primary_axes:
            continue
        labels = [str(axis.get("axis_label") or "").strip() for axis in primary_axes if str(axis.get("axis_label") or "").strip()]
        if not labels:
            continue
        support[line_id] = {
            "axis_labels": labels,
            "axis_explanation": labels[0],
        }
    return support


def build_text_first_source_line_cues(profile: dict) -> list[dict[str, Any]]:
    cues: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_many(items: list[str], base_score: float, corpus_line_count: int = 0) -> None:
        for index, raw in enumerate(items or []):
            term = normalize_locus_form(raw)
            if not term or term in seen:
                continue
            seen.add(term)
            cues.append(
                {
                    "term": term,
                    "echo_score": max(0.9, base_score - index * 0.35),
                    "corpus_line_count": corpus_line_count,
                }
            )

    add_many(profile.get("source_dante_tokens") or [], 6.0)
    add_many(profile.get("source_dante_bigrams") or [], 5.2)
    add_many(profile.get("source_terzina_tokens") or [], 3.4)
    return cues[:8]


def build_text_first_source_commentary_fields(profile: dict) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(profile.get("source_commentary_tokens") or []):
        label = normalize_field_label_key(raw)
        if not label or label in seen:
            continue
        seen.add(label)
        fields.append(
            {
                "label": label,
                "display_label": str(raw).strip(),
                "echo_score": max(0.8, 1.8 - index * 0.2),
                "corpus_field_count": 0,
                "support": 1,
            }
        )
    return fields[:4]


def build_text_first_echo_candidates(
    profile: dict,
    explanation_support: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    source_cantica = str(profile.get("cantica") or "")
    source_canto = int(profile.get("canto") or 0)
    source_line_number = int(profile.get("line_number") or 0)
    cantica_order = {"Inferno": 1, "Purgatorio": 2, "Paradiso": 3}
    for echo in profile.get("top_echoes") or []:
        shared_terms = unique_preserving_order(
            list(echo.get("shared_dante_tokens") or [])
            + list(echo.get("shared_dante_bigrams") or [])
            + list(echo.get("shared_terzina_tokens") or [])
        )
        shared_fields = unique_preserving_order(list(echo.get("shared_commentary_tokens") or []))
        echo_strength = str(echo.get("echo_strength") or "thin")
        candidate_cantica = str(echo.get("candidate_cantica") or "")
        candidate_canto = int(echo.get("candidate_canto") or 0)
        candidate_line_number = int(echo.get("candidate_line_number") or 0)
        source_loc = (
            cantica_order.get(source_cantica, 99),
            source_canto,
            source_line_number,
        )
        candidate_loc = (
            cantica_order.get(candidate_cantica, 99),
            candidate_canto,
            candidate_line_number,
        )
        if candidate_loc < source_loc:
            direction = "backward"
            direction_label = "looks back on"
        elif candidate_loc > source_loc:
            direction = "forward"
            direction_label = "looks forward to"
        else:
            direction = "lateral"
            direction_label = "stands beside"
        support = (explanation_support or {}).get(str(echo.get("candidate_line_id") or "").strip(), {})
        axis_labels = [label for label in (support.get("axis_labels") or []) if label]
        relation_note = str(support.get("relation_note") or "").strip()
        echo_type_label_map = {
            "reviewable": "reviewable echo",
            "thin": "thin echo",
            "formulaic_recurrence": "formulaic recurrence",
            "weak": "weak echo",
        }
        candidates.append(
            {
                "sample": echo.get("candidate_sample"),
                "cantica": echo.get("candidate_cantica"),
                "canto": echo.get("candidate_canto"),
                "line_number": echo.get("candidate_line_number"),
                "line_text": echo.get("candidate_line_text"),
                "score": float(echo.get("similarity_score") or 0),
                "shared_terms": shared_terms,
                "shared_fields": shared_fields,
                "overlap_count": len(shared_terms) + len(shared_fields),
                "echo_type": echo_strength,
                "echo_type_label": echo_type_label_map.get(echo_strength, echo_strength.replace("_", " ")),
                "has_mixed_evidence": "commentary_support" in (echo.get("evidence_layers") or []) and bool(shared_terms),
                "strong_field_echo": len(shared_fields) >= 1,
                "strong_cue_echo": echo_strength == "reviewable" or len(shared_terms) >= 2,
                "echo_strength": echo_strength,
                "evidence_layers": list(echo.get("evidence_layers") or []),
                "reason": echo.get("reason_format") or "",
                "direction": direction,
                "direction_label": direction_label,
                "axis_labels": axis_labels,
                "axis_explanation": axis_labels[0] if axis_labels else "",
                "relation_note": relation_note,
            }
        )
    return candidates


def attach_line_echo_profiles_legacy(
    line_profiles: list[dict],
    line_echo_payload_fields: dict[str, list[dict]],
) -> None:
    total_lines = max(len(line_profiles), 1)
    term_docfreq: Counter[str] = Counter()
    field_docfreq: Counter[str] = Counter()
    line_profiles_by_id = {line["id"]: line for line in line_profiles}
    term_to_line_ids: dict[str, set[str]] = defaultdict(set)
    field_to_line_ids: dict[str, set[str]] = defaultdict(set)

    for line in line_profiles:
        for term in line_profile_candidate_terms(line):
            term_docfreq.update([term])
            term_to_line_ids[term].add(line["id"])
        for label in unique_preserving_order(line.get("field_labels") or []):
            normalized = normalize_field_label_key(label)
            if normalized:
                field_docfreq.update([normalized])
                field_to_line_ids[normalized].add(line["id"])

    for line in line_profiles:
        payload_fields = line_echo_payload_fields.get(line["id"], [])
        source_line_cues = build_line_echo_source_terms(
            line_profile=line,
            payload_fields=payload_fields,
            term_docfreq=term_docfreq,
            total_lines=total_lines,
        )
        source_local_fields = build_line_echo_source_fields(
            line_profile=line,
            payload_fields=payload_fields,
            field_docfreq=field_docfreq,
            total_lines=total_lines,
        )
        echo_candidates = build_line_echo_candidates(
            source_line_profile=line,
            source_term_items=source_line_cues,
            source_field_items=source_local_fields,
            line_profiles_by_id=line_profiles_by_id,
            term_to_line_ids=term_to_line_ids,
            field_to_line_ids=field_to_line_ids,
        )
        line["line_echo_profile"] = {
            "mode": "line_level_conservative_v1",
            "source_line_cues": [
                {
                    "term": item["term"],
                    "echo_score": item["echo_score"],
                    "corpus_line_count": item["corpus_line_count"],
                }
                for item in source_line_cues
            ],
            "source_local_fields": [
                {
                    "label": item["label"],
                    "display_label": item["display_label"],
                    "echo_score": item["echo_score"],
                    "corpus_field_count": item["corpus_field_count"],
                    "support": item["support"],
                }
                for item in source_local_fields
            ],
            "echo_candidates": echo_candidates,
        }


def attach_line_echo_profiles(
    line_profiles: list[dict],
    line_echo_payload_fields: dict[str, list[dict]],
) -> None:
    baseline_profiles = load_cross_canto_baseline_profiles("baseline")
    explanation_support = load_cross_canto_explanation_support()
    axis_support = load_line_echo_axis_support()
    if baseline_profiles:
        for line in line_profiles:
            profile = baseline_profiles.get(line["id"])
            if not profile:
                continue
            line["line_echo_profile"] = {
                "mode": "text_first_line_similarity_v2",
                "line_status": profile.get("line_status"),
                "source_axis_explanation": (axis_support.get(line["id"], {}) or {}).get("axis_explanation", ""),
                "source_axis_labels": (axis_support.get(line["id"], {}) or {}).get("axis_labels", []),
                "source_line_cues": build_text_first_source_line_cues(profile),
                "source_local_fields": build_text_first_source_commentary_fields(profile),
                "top_echoes": build_text_first_echo_candidates(
                    profile,
                    explanation_support=explanation_support.get(line["id"], {}),
                ),
            }
        return
    attach_line_echo_profiles_legacy(
        line_profiles=line_profiles,
        line_echo_payload_fields=line_echo_payload_fields,
    )


def score_word_profile_terms(
    normalized_form: str,
    total_word_forms: int,
    term_weights: Counter[str],
    term_line_counts: Counter[str],
    term_signature_counts: Counter[str],
    term_docfreq: dict[str, set[str]],
) -> list[dict]:
    recurrent_candidates = []
    fallback_candidates = []

    for term, weight in term_weights.items():
        if looks_like_bad_word_profile_term(term, locus_form=normalized_form):
            continue

        line_count = term_line_counts.get(term, 0)
        broad_review_term = looks_like_broad_interpretive_term(term)
        signature_hits = term_signature_counts.get(term, 0)
        if len(term) <= 4 and line_count < 2:
            continue
        if broad_review_term and line_count < 2:
            continue

        profile_df = len(term_docfreq.get(term, set())) or 1
        idf = math.log(1 + total_word_forms / profile_df)
        score = weight * idf
        score += min(line_count, 4) * 0.45

        if signature_hits:
            score += min(signature_hits, 3) * 0.7
        else:
            score -= 0.5

        profile_share = profile_df / max(total_word_forms, 1)
        if profile_share >= 0.08:
            score *= 0.24 if line_count >= 3 or signature_hits >= 2 else 0.16
        elif profile_share >= 0.04:
            score *= 0.42 if line_count >= 3 or signature_hits >= 2 else 0.28
        elif profile_share >= 0.02:
            score *= 0.68 if line_count >= 3 or signature_hits >= 2 else 0.52

        if broad_review_term:
            if line_count >= 4 and signature_hits >= 2:
                score *= 0.72
            elif line_count >= 3 or signature_hits >= 2:
                score *= 0.52
            else:
                score *= 0.3

        if term in FIGURE_ALIAS_TERMS and term != normalized_form:
            score *= 0.45

        candidate = {
            "term": term,
            "score": round(score, 3),
            "count": round(weight, 3),
            "line_count": line_count,
            "signature_hits": signature_hits,
        }
        if broad_review_term:
            candidate["review_family"] = "broad_interpretive_term"
        if line_count >= 2:
            recurrent_candidates.append(candidate)
        else:
            fallback_candidates.append(candidate)

    recurrent_candidates.sort(key=lambda item: (-item["score"], -item["line_count"], item["term"]))
    fallback_candidates.sort(key=lambda item: (-item["score"], -item["line_count"], item["term"]))

    chosen = recurrent_candidates[:8]
    fallback_target = 6 if recurrent_candidates else 4
    eligible_fallback = [
        item
        for item in fallback_candidates
        if item.get("score", 0) >= 10 and item.get("signature_hits", 0) >= 1
    ]
    if len(chosen) < fallback_target:
        chosen.extend(eligible_fallback[: fallback_target - len(chosen)])
    return chosen[:8]


def overlaps_line_text(term: str, line_text_terms: list[str]) -> bool:
    for line_term in line_text_terms:
        if term == line_term:
            return True
        if len(term) >= 5 and len(line_term) >= 5:
            if term.startswith(line_term) or line_term.startswith(term):
                return True
    return False


def select_field_label(
    representative_terms: list[str],
    seed_term: str | None,
    line_signature_terms: list[str],
    line_text: str,
) -> tuple[str, dict]:
    original_label = format_field_label(representative_terms, seed_term)
    normalized_original = normalize_display_label(original_label) or original_label
    line_text_terms = tokenize_semantic_text(line_text)
    signature_set = set(line_signature_terms)

    ranked_candidates = []
    blocked_candidates = []
    for index, raw_term in enumerate(representative_terms):
        term = normalize_display_label(raw_term) or raw_term
        score = max(0, 8 - index)
        reasons = []
        prior = get_field_label_prior(term)
        raw_overlaps_line = overlaps_line_text(raw_term, line_text_terms)
        term_overlaps_line = overlaps_line_text(term, line_text_terms)
        line_anchored_term = raw_overlaps_line or term_overlaps_line

        figure_label = canonical_figure_label(term)
        figure_supported_by_line_text = bool(
            figure_label
            and (
                raw_overlaps_line
                or term_overlaps_line
            )
        )
        canonical_label = figure_label if figure_supported_by_line_text else None

        blocked_candidate = (
            should_block_display_label_candidate(raw_term)
            or should_block_display_label_candidate(term)
            or (
                (
                    looks_like_commentarial_paraphrase_term(raw_term)
                    or looks_like_commentarial_paraphrase_term(term)
                )
                and not line_anchored_term
            )
        )

        if (raw_term in signature_set or term in signature_set) and not (figure_label and not figure_supported_by_line_text):
            score += 5
            reasons.append("appears in line signature")
        if line_anchored_term:
            score += 4
            reasons.append("closer to the Dante line wording")
        if not looks_like_bad_label(raw_term):
            score += 2
            reasons.append("less token-like than the seed")
        else:
            score -= 6
            reasons.append("looks like commentary/meta or function-word noise")
        if (
            looks_like_commentarial_paraphrase_term(raw_term)
            or looks_like_commentarial_paraphrase_term(term)
        ) and not line_anchored_term:
            score -= 4.2
            reasons.append("reads like a commentarial paraphrase rather than Dante-line wording")
        if len(term) <= 4 and not overlaps_line_text(term, line_text_terms):
            score -= 1
            reasons.append("very short token")
        if canonical_label and canonical_label != term:
            score += 1.4
            reasons.append("maps to a stable figure label")
        if prior["count"] >= 6 and prior["review_rate"] >= 0.55:
            score -= 3.4
            reasons.append("frequently enters the corpus-wide review lane")
        elif prior["count"] >= 6 and prior["review_rate"] >= 0.35:
            score -= 1.8
            reasons.append("often unstable across the corpus")
        if prior["count"] >= 6 and prior["drift_rate"] >= 0.18:
            score -= 2.1
            reasons.append("behaves like a recurrent corpus-drift label")
        if (
            prior["count"] >= 6
            and prior["review_rate"] <= 0.14
            and prior["not_line_anchored_rate"] <= 0.18
            and not looks_like_bad_label(raw_term)
        ):
            score += 0.9
            reasons.append("looks comparatively stable across the corpus")

        candidate_tuple = (score, index, canonical_label or term, term, raw_term, reasons, prior)
        if blocked_candidate and not figure_supported_by_line_text:
            blocked_candidates.append(candidate_tuple)
            continue
        ranked_candidates.append(candidate_tuple)

    blocked_fallback_used = False
    if not ranked_candidates:
        ranked_candidates = blocked_candidates
        blocked_fallback_used = bool(blocked_candidates)
    ranked_candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
    chosen_score, _, chosen_label, chosen_term, chosen_raw, chosen_reasons, chosen_prior = ranked_candidates[0]
    gloss_label, gloss_kind, gloss_reason = derive_residual_display_gloss(representative_terms)
    figure_fallback_label = canonical_figure_label(chosen_raw) or canonical_figure_label(original_label)
    use_gloss_label = bool(
        gloss_label
        and (
            looks_like_bad_label(chosen_raw)
            or chosen_prior["drift_rate"] >= 0.18
            or chosen_prior["review_rate"] >= 0.45
        )
    )
    if figure_fallback_label and figure_label_supported_by_line(
        figure_fallback_label,
        line_signature_terms,
        line_text,
    ) and (
        chosen_label == chosen_term
        or looks_like_corpus_drift_term(chosen_raw)
        or chosen_prior["review_rate"] >= 0.3
    ):
        chosen_label = figure_fallback_label
        chosen_reasons = chosen_reasons + ["maps to a stable figure label"]
    final_label = gloss_label if use_gloss_label else chosen_label
    changed = final_label != normalized_original

    anchored_to_line = (
        "appears in line signature" in chosen_reasons or "closer to the Dante line wording" in chosen_reasons
    )
    drift_label = (
        looks_like_corpus_drift_term(chosen_raw) or looks_like_corpus_drift_term(chosen_term)
    ) and final_label == chosen_term

    if chosen_raw == "como":
        reason = (
            "Retained `como` only as an internal cluster token check; for display it is treated as an "
            "early-spelling / discourse-style token and should yield to a more content-bearing label."
        )
    elif use_gloss_label:
        reason = (
            f"Replaced `{normalized_original}` with `{final_label}` because the cluster is dominated by commentary-side "
            f"residue rather than a stable line-anchored semantic label. {gloss_reason}."
        )
    elif changed:
        reason = (
            f"Replaced `{normalized_original}` with `{final_label}` because the original label looked more "
            f"token-like or commentary-meta, while `{final_label}` is closer to the line wording and/or cluster content."
        )
    else:
        reason = f"Retained `{final_label}` because no stronger display label emerged from the cluster terms."

    if drift_label:
        reason += (
            f" `{final_label}` still behaves like a corpus-scale drift label, so it should stay in the QA lane "
            "until a more scholar-facing gloss is available."
        )

    blocked_display_label = should_block_display_label_candidate(final_label) or should_block_display_label_candidate(chosen_raw)
    review_needed = (
        use_gloss_label
        or looks_like_bad_label(final_label)
        or blocked_display_label
        or chosen_score < 4
        or not anchored_to_line
        or drift_label
    )
    return final_label, {
        "original_label": normalized_original,
        "final_label": final_label,
        "changed": changed,
        "reason": reason,
        "candidate_reasons": chosen_reasons,
        "anchored_to_line": anchored_to_line,
        "review_needed": review_needed,
        "corpus_drift_label": drift_label,
        "blocked_candidate_retained": blocked_display_label,
        "blocked_fallback_used": blocked_fallback_used,
        "gloss_generated": use_gloss_label,
        "gloss_kind": gloss_kind if use_gloss_label else None,
        "canonicalized_figure_label": chosen_label if chosen_label != chosen_term else None,
        "chosen_score": round(chosen_score, 3),
        "prior_count": int(chosen_prior.get("count", 0)),
        "prior_review_rate": round(chosen_prior.get("review_rate", 0.0), 3),
        "prior_drift_rate": round(chosen_prior.get("drift_rate", 0.0), 3),
        "retained_token_like": looks_like_bad_label(chosen_raw) and not changed and not use_gloss_label,
        "como_checked": original_label == "como" or chosen_raw == "como" or "como" in representative_terms,
    }


def choose_field_label(
    representative_terms: list[str],
    seed_term: str | None,
    line_signature_terms: list[str],
    line_text: str,
) -> tuple[str, dict]:
    return select_field_label(representative_terms, seed_term, line_signature_terms, line_text)


def classify_field_kind(display_label: str, representative_terms: list[str], audit: dict) -> str:
    normalized_label = normalize_field_label_key(display_label) or ""
    normalized_terms = [normalize_field_label_key(term) or "" for term in representative_terms[:4]]

    if audit.get("gloss_kind"):
        return audit["gloss_kind"]
    if canonical_figure_label(display_label) or any(canonical_figure_label(term) for term in normalized_terms):
        return "figure_anchor"
    if normalized_label in COMMENTARIAL_DISCOURSE_TERMS or any(term in COMMENTARIAL_DISCOURSE_TERMS for term in normalized_terms):
        return "commentarial_discourse"
    if audit.get("review_needed") and (
        audit.get("corpus_drift_label")
        or looks_like_bad_label(display_label)
        or audit.get("blocked_candidate_retained")
        or not audit.get("anchored_to_line", False)
    ):
        return "residual_provisional"
    return "line_semantic"


def compute_field_label_confidence(display_label: str, representative_terms: list[str], audit: dict) -> float:
    chosen_score = min(max(audit.get("chosen_score", 0.0), 0.0), 20.0)
    clean_ratio = (
        sum(1 for term in representative_terms[:4] if term and not looks_like_bad_label(term))
        / max(1, min(len(representative_terms[:4]), 4))
    )

    score = 0.12
    score += chosen_score * 0.022
    score += clean_ratio * 0.12

    if audit.get("anchored_to_line", False):
        score += 0.11
    if not audit.get("changed"):
        score += 0.05
    if any("appears in line signature" == reason for reason in audit.get("candidate_reasons", [])):
        score += 0.05
    if any("closer to the Dante line wording" == reason for reason in audit.get("candidate_reasons", [])):
        score += 0.05
    if audit.get("canonicalized_figure_label"):
        score += 0.05

    prior_count = audit.get("prior_count", 0)
    prior_review_rate = audit.get("prior_review_rate", 0.0)
    prior_drift_rate = audit.get("prior_drift_rate", 0.0)
    if prior_count >= 6 and prior_review_rate <= 0.12:
        score += 0.05
    elif prior_count >= 6 and prior_review_rate >= 0.45:
        score -= 0.08
    if prior_count >= 6 and prior_drift_rate >= 0.18:
        score -= 0.08

    if audit.get("review_needed"):
        score -= 0.16
    if audit.get("corpus_drift_label"):
        score -= 0.14
    if audit.get("gloss_generated"):
        score -= 0.06
    if looks_like_bad_label(display_label):
        score -= 0.1
    if audit.get("blocked_candidate_retained"):
        score -= 0.14

    return round(min(0.93, max(0.05, score)), 3)


def compute_field_quality_score(
    field_kind: str,
    label_confidence: float,
    audit: dict,
    record_count: int,
    unique_commentator_count: int,
) -> float:
    score = label_confidence * 5.4
    score += min(record_count, 12) * 0.11
    score += min(unique_commentator_count, 8) * 0.16

    if field_kind == "line_semantic":
        score += 1.0
    elif field_kind == "figure_anchor":
        score += 0.7
    elif field_kind == "commentarial_discourse":
        score -= 0.35
    elif field_kind == "residual_provisional":
        score -= 1.0

    if not audit.get("anchored_to_line", False):
        score -= 0.55
    if audit.get("review_needed"):
        score -= 0.75

    return round(score, 3)


def apply_integration_queue_to_field(record_id: str, field: dict[str, Any]) -> dict[str, Any]:
    label = field.get("display_label") or field.get("label") or field.get("internal_label")
    placement = get_local_semantic_field_integration_placement(record_id, label)
    if not placement:
        return field

    field["integration_placement"] = placement
    audit = field.setdefault("label_audit", {})
    audit["integration_placement"] = placement
    qa = field.setdefault("qa", {"review_needed": False, "flags": [], "note": ""})
    flags = list(qa.get("flags") or [])
    if "integration_queue_applied" not in flags:
        flags.append("integration_queue_applied")
    if placement == "review_only" and "integration_review_only" not in flags:
        flags.append("integration_review_only")
    if placement == "drop" and "integration_drop" not in flags:
        flags.append("integration_drop")
    if placement == "front_display" and "integration_front_display" not in flags:
        flags.append("integration_front_display")
    if placement == "conditional_keep" and "integration_conditional_keep" not in flags:
        flags.append("integration_conditional_keep")
    qa["flags"] = flags

    existing_note = str(qa.get("note") or "").strip()
    placement_note = f"Integration queue placement: {placement}."
    qa["note"] = f"{existing_note} {placement_note}".strip() if existing_note else placement_note

    if placement == "front_display":
        qa["review_needed"] = False
        field["quality_score"] = round(float(field.get("quality_score") or 0) + 1.1, 3)
        field["label_confidence"] = round(min(0.95, float(field.get("label_confidence") or 0) + 0.05), 3)
    elif placement == "review_only":
        qa["review_needed"] = True
        field["quality_score"] = round(max(0.0, float(field.get("quality_score") or 0) - 0.6), 3)
    elif placement == "drop":
        qa["review_needed"] = True
        field["quality_score"] = round(max(0.0, float(field.get("quality_score") or 0) - 2.5), 3)
    elif placement == "conditional_keep":
        field["quality_score"] = round(float(field.get("quality_score") or 0) + 0.15, 3)

    return field


def is_field_display_worthy(field: dict) -> bool:
    placement = str(field.get("integration_placement") or "")
    field_kind = str(field.get("field_kind") or "")
    quality_score = float(field.get("quality_score") or 0)
    label_confidence = float(field.get("label_confidence") or 0)
    record_count = int(field.get("record_count") or 0)
    review_needed = bool((field.get("qa") or {}).get("review_needed"))
    anchored_to_line = bool((field.get("label_audit") or {}).get("anchored_to_line"))
    blocked_candidate_retained = bool((field.get("label_audit") or {}).get("blocked_candidate_retained"))

    if placement == "drop":
        return False
    if placement == "review_only":
        return False
    if placement == "front_display":
        return not blocked_candidate_retained

    if field_kind == "line_semantic":
        if blocked_candidate_retained:
            return False
        if quality_score >= 4.2 and label_confidence >= 0.45:
            return True
        return anchored_to_line and quality_score >= 3.4 and label_confidence >= 0.36
    if field_kind == "figure_anchor":
        return (
            quality_score >= 3.4
            and label_confidence >= 0.34
            and record_count >= 2
            and anchored_to_line
            and not review_needed
        )
    if field_kind == "commentarial_discourse":
        return quality_score >= 6.0 and label_confidence >= 0.62 and record_count >= 8 and not review_needed
    if field_kind == "residual_provisional":
        return quality_score >= 3.2 and label_confidence >= 0.45 and record_count >= 6 and not review_needed
    return quality_score >= 4.0 and label_confidence >= 0.45


def prune_semantic_fields(
    finalized_fields: list[dict],
    record_to_field: dict[str, str],
) -> tuple[list[dict], dict[str, str], list[dict]]:
    kept = [field for field in finalized_fields if is_field_display_worthy(field)]
    if not kept:
        kept = [
            field
            for field in finalized_fields
            if str(field.get("integration_placement") or "") not in {"drop", "review_only"}
        ][:2]
    if not kept:
        kept = finalized_fields[:2]
    kept.sort(
        key=lambda field: (
            0 if str(field.get("integration_placement") or "") == "front_display" else 1,
            -int(bool((field.get("label_audit") or {}).get("anchored_to_line"))),
            -int(not bool((field.get("qa") or {}).get("review_needed"))),
            -float(field.get("quality_score") or 0),
            -float(field.get("label_confidence") or 0),
            -int(field.get("record_count") or 0),
            field.get("display_label") or field.get("label") or "",
        )
    )
    unique_fields = []
    seen_labels = set()
    for field in kept:
        label_key = normalize_field_label_key(field.get("display_label") or field.get("label") or "")
        if label_key and label_key in seen_labels:
            continue
        if label_key:
            seen_labels.add(label_key)
        unique_fields.append(field)
    review_source = sorted(
        finalized_fields,
        key=lambda field: (
            0 if str(field.get("integration_placement") or "") == "front_display" else 1,
            0 if str(field.get("integration_placement") or "") == "conditional_keep" else 1,
            0 if str(field.get("integration_placement") or "") == "review_only" else 1,
            -int(bool((field.get("label_audit") or {}).get("anchored_to_line"))),
            -float(field.get("quality_score") or 0),
            -float(field.get("label_confidence") or 0),
            field.get("display_label") or field.get("label") or "",
        ),
    )
    review_candidates = []
    seen_review_labels = set()
    for field in review_source:
        label = field.get("display_label") or field.get("label") or ""
        label_key = normalize_field_label_key(label)
        if label_key and label_key in seen_review_labels:
            continue
        blocked_retained = bool((field.get("label_audit") or {}).get("blocked_candidate_retained"))
        placement = str(field.get("integration_placement") or "")
        if placement == "drop":
            continue
        if blocked_retained or should_block_display_label_candidate(label):
            continue
        if label_key:
            seen_review_labels.add(label_key)
        review_candidates.append(field)
    review_candidates = review_candidates[:10]
    kept = review_candidates[:6]
    kept = [field for field in kept if str(field.get("integration_placement") or "") != "review_only"]
    kept_ids = {field["id"] for field in kept}
    filtered_record_to_field = {
        record_id: field_id
        for record_id, field_id in record_to_field.items()
        if field_id in kept_ids
    }
    return kept, filtered_record_to_field, review_candidates


def build_finalized_field(
    *,
    sample: str,
    field_id: str,
    seed_term: str,
    representative_terms: list[str],
    assigned_indices: list[int],
    record_profiles: list[dict],
    total_records: int,
    current_line_number: int,
    signature_lookup: dict[int, list[str]],
    line_text_lookup: dict[int, str],
) -> dict:
    record_id = f"{sample}:{current_line_number}"
    unique_commentators = unique_preserving_order(
        record_profiles[index]["record"]["commentary_name"] for index in assigned_indices
    )
    display_label, label_audit = choose_field_label(
        representative_terms,
        seed_term,
        signature_lookup.get(current_line_number, []),
        line_text_lookup.get(current_line_number, ""),
    )
    field_kind = classify_field_kind(display_label, representative_terms, label_audit)
    label_confidence = compute_field_label_confidence(display_label, representative_terms, label_audit)
    quality_score = compute_field_quality_score(
        field_kind,
        label_confidence,
        label_audit,
        len(assigned_indices),
        len(unique_commentators),
    )

    field = {
        "id": field_id,
        "internal_label": label_audit["original_label"],
        "display_label": display_label,
        "label": display_label,
        "seed_term": seed_term,
        "field_kind": field_kind,
        "label_confidence": label_confidence,
        "quality_score": quality_score,
        "representative_terms": representative_terms,
        "record_count": len(assigned_indices),
        "record_share": round((len(assigned_indices) / total_records) * 100),
        "record_ids": [record_profiles[index]["record"]["id"] for index in assigned_indices],
        "unique_commentator_count": len(unique_commentators),
        "example_commentaries": unique_commentators[:5],
        "qa": build_field_qa(label_audit),
        "label_audit": label_audit,
        "cross_line_references": build_cross_line_references(
            representative_terms,
            current_line_number,
            signature_lookup,
            line_text_lookup,
        ),
    }
    return apply_integration_queue_to_field(record_id, field)


def build_field_qa(audit: dict) -> dict:
    flags = []
    if audit.get("changed"):
        flags.append("label_changed")
    if audit.get("corpus_drift_label"):
        flags.append("corpus_drift_label")
    if audit.get("gloss_generated"):
        flags.append("display_gloss_generated")
    if audit.get("retained_token_like"):
        flags.append("token_like_label_retained")
    if not audit.get("anchored_to_line", False):
        flags.append("not_line_anchored")
    if audit.get("como_checked"):
        flags.append("como_checked")

    return {
        "review_needed": bool(audit.get("review_needed")),
        "flags": flags,
        "note": audit.get("reason"),
    }


def build_cross_line_references(
    representative_terms: list[str],
    current_line_number: int,
    signature_lookup: dict[int, list[str]],
    line_text_lookup: dict[int, str],
) -> list[dict]:
    field_terms = set(representative_terms)
    references = []

    for line_number, signature_terms in signature_lookup.items():
        if line_number == current_line_number:
            continue
        shared_terms = [term for term in signature_terms if term in field_terms][:3]
        if not shared_terms:
            continue
        references.append(
            {
                "line_number": line_number,
                "line_text": line_text_lookup.get(line_number, ""),
                "score": len(shared_terms),
                "shared_terms": shared_terms,
                "reference_basis": "shared_terms",
            }
        )

    references.sort(key=lambda item: (-item["score"], item["line_number"]))
    return references[:3]


def build_semantic_fields_lexical_fallback(
    records: list[dict],
    current_line_number: int,
    signature_lookup: dict[int, list[str]],
    line_text_lookup: dict[int, str],
) -> dict:
    record_profiles = build_record_profiles(records)

    if not record_profiles:
        return {"schema_version": "v1", "fields": [], "review_candidates": [], "record_to_field": {}, "method": "empty"}

    document_frequency: Counter[str] = Counter()
    token_scores: dict[str, float] = defaultdict(float)
    token_coverage: dict[str, float] = defaultdict(float)

    for profile in record_profiles:
        document_frequency.update(profile["token_set"])

    total_records = len(record_profiles)
    total_contribution = sum(profile["contribution_weight"] for profile in record_profiles)

    for profile in record_profiles:
        profile["weights"] = {}
        for token, count in profile["token_counts"].items():
            df = document_frequency.get(token, 1)
            idf = math.log(1 + total_records / (1 + df))
            weight = profile["contribution_weight"] * count * idf
            profile["weights"][token] = weight
            token_scores[token] += weight
            if weight > 0:
                token_coverage[token] += profile["contribution_weight"]

    min_records = max(1.2, total_contribution * 0.08)
    max_coverage = max(min_records + 0.5, total_contribution * 0.72)
    candidates = [
        {
            "token": token,
            "score": score,
            "coverage": token_coverage.get(token, 0),
        }
        for token, score in token_scores.items()
        if min_records <= token_coverage.get(token, 0) <= max_coverage
    ]
    candidates.sort(key=lambda item: (-item["score"], -item["coverage"], item["token"]))

    seed_fields = []
    for candidate in candidates:
        if len(seed_fields) >= 6:
            break

        member_indices = [
            index
            for index, profile in enumerate(record_profiles)
            if candidate["token"] in profile["weights"]
        ]
        if len(member_indices) < 2:
            continue

        overlaps_existing = False
        for field in seed_fields:
            overlap = len([index for index in member_indices if index in field["member_indices"]])
            denominator = min(len(field["member_indices"]), len(member_indices)) or 1
            if overlap / denominator > 0.88:
                overlaps_existing = True
                break
        if overlaps_existing:
            continue

        representative_terms = summarize_cluster_terms(
            record_profiles,
            member_indices,
            current_line_number,
            signature_lookup,
            line_text_lookup,
            5,
        )
        if not representative_terms:
            representative_terms = summarize_terms_for_members(record_profiles, member_indices, 5)
        seed_fields.append(
            {
                "id": f"field-{len(seed_fields) + 1}-{candidate['token']}",
                "seed_term": candidate["token"],
                "label": format_field_label(representative_terms, candidate["token"]),
                "representative_terms": representative_terms,
                "member_indices": member_indices,
            }
        )

    if not seed_fields:
        all_indices = list(range(len(record_profiles)))
        fallback_terms = summarize_terms_for_members(record_profiles, all_indices, 5)
        seed_fields.append(
            {
                "id": "field-1-fallback",
                "seed_term": fallback_terms[0] if fallback_terms else "field",
                "label": format_field_label(fallback_terms, fallback_terms[0] if fallback_terms else None),
                "representative_terms": fallback_terms,
                "member_indices": all_indices,
            }
        )

    record_to_field: dict[str, str] = {}
    for profile in record_profiles:
        best_field = None
        best_score = 0.0
        for field in seed_fields:
            score = sum(profile["weights"].get(term, 0) for term in field["representative_terms"])
            if score > best_score:
                best_score = score
                best_field = field
        if best_field:
            record_to_field[profile["record"]["id"]] = best_field["id"]

    finalized_fields = []
    for field in seed_fields:
        assigned_indices = [
            index
            for index, profile in enumerate(record_profiles)
            if record_to_field.get(profile["record"]["id"]) == field["id"]
        ]
        if not assigned_indices:
            continue

        representative_terms = summarize_terms_for_members(record_profiles, assigned_indices, 5)
        finalized_fields.append(
            build_finalized_field(
                sample=sample,
                field_id=field["id"],
                seed_term=field["seed_term"],
                representative_terms=representative_terms,
                assigned_indices=assigned_indices,
                record_profiles=record_profiles,
                total_records=total_records,
                current_line_number=current_line_number,
                signature_lookup=signature_lookup,
                line_text_lookup=line_text_lookup,
            )
        )

    field_kind_rank = {
        "line_semantic": 0,
        "figure_anchor": 1,
        "commentarial_discourse": 2,
        "residual_provisional": 3,
    }
    finalized_fields.sort(
        key=lambda item: (
            -item.get("quality_score", 0),
            field_kind_rank.get(item.get("field_kind", ""), 9),
            -item.get("label_confidence", 0),
            -item["unique_commentator_count"],
            -item["record_count"],
            item["label"],
        )
    )
    finalized_fields, record_to_field, review_candidates = prune_semantic_fields(finalized_fields, record_to_field)
    return {
        "schema_version": "v1",
        "fields": finalized_fields,
        "review_candidates": review_candidates,
        "record_to_field": record_to_field,
        "method": "lexical-fallback",
    }


def apply_local_semantic_field_review_overrides(
    sample: str,
    current_line_number: int,
    semantic_fields: dict[str, Any],
) -> dict[str, Any]:
    record_id = f"{sample}:{current_line_number}"
    override = LOCAL_SEMANTIC_FIELD_REVIEW_OVERRIDES.get(record_id)
    if not override:
        return semantic_fields

    keep_keys = [normalize_field_label_key(label) for label in override.get("keep", []) if normalize_field_label_key(label)]
    keep_set = set(keep_keys)
    drop_set = {
        normalize_field_label_key(label)
        for label in override.get("drop", [])
        if normalize_field_label_key(label)
    }

    def dedupe(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
        unique: list[dict[str, Any]] = []
        seen: set[str] = set()
        for field in fields:
            label_key = normalize_field_label_key(field.get("display_label") or field.get("label") or field.get("internal_label"))
            if not label_key or label_key in seen:
                continue
            seen.add(label_key)
            unique.append(field)
        return unique

    combined = dedupe((semantic_fields.get("review_candidates") or []) + (semantic_fields.get("fields") or []))
    filtered = []
    for field in combined:
        label_key = normalize_field_label_key(field.get("display_label") or field.get("label") or field.get("internal_label"))
        if label_key in drop_set:
            continue
        filtered.append(field)

    existing_keys = {
        normalize_field_label_key(field.get("display_label") or field.get("label") or field.get("internal_label"))
        for field in filtered
    }
    for addition in override.get("add", []):
        label_key = normalize_field_label_key(addition.get("display_label"))
        if not label_key or label_key in existing_keys:
            continue
        filtered.append(
            make_manual_override_field(
                record_id=record_id,
                display_label=str(addition.get("display_label") or ""),
                representative_terms=list(addition.get("representative_terms") or []),
                note=str(addition.get("note") or override.get("note") or "Manual line-level semantic review override."),
            )
        )
        existing_keys.add(label_key)

    def sort_key(field: dict[str, Any]) -> tuple[int, int, float, float, str]:
        label_key = normalize_field_label_key(field.get("display_label") or field.get("label") or field.get("internal_label")) or ""
        keep_rank = keep_keys.index(label_key) if label_key in keep_set else 99
        return (
            0 if label_key in keep_set else 1,
            keep_rank,
            -float(field.get("quality_score") or 0),
            -float(field.get("label_confidence") or 0),
            str(field.get("display_label") or ""),
        )

    filtered.sort(key=sort_key)
    review_candidates = filtered[:10]
    fields = review_candidates[:6]
    kept_ids = {field.get("id") for field in fields if field.get("id")}
    record_to_field = {
        record_key: field_id
        for record_key, field_id in (semantic_fields.get("record_to_field") or {}).items()
        if field_id in kept_ids
    }
    semantic_fields["fields"] = fields
    semantic_fields["review_candidates"] = review_candidates
    semantic_fields["record_to_field"] = record_to_field
    semantic_fields["human_review_override"] = {
        "record_id": record_id,
        "note": override.get("note") or "Applied manual Local Semantic Fields override.",
        "kept": list(override.get("keep") or []),
        "dropped": list(override.get("drop") or []),
        "added": [str(item.get("display_label") or "") for item in (override.get("add") or [])],
    }
    return semantic_fields


def build_semantic_fields(
    sample: str,
    records: list[dict],
    current_line_number: int,
    signature_lookup: dict[int, list[str]],
    line_text_lookup: dict[int, str],
) -> dict:
    record_profiles = build_record_profiles(records)
    if not record_profiles:
        return {"schema_version": "v1", "fields": [], "review_candidates": [], "record_to_field": {}, "method": "empty"}

    embeddings = build_local_semantic_embeddings(record_profiles)
    if embeddings is None or len(record_profiles) < 2:
        return apply_local_semantic_field_review_overrides(
            sample,
            current_line_number,
            build_semantic_fields_lexical_fallback(records, current_line_number, signature_lookup, line_text_lookup),
        )

    cluster_labels = fit_local_clusters(
        embeddings,
        [profile["contribution_weight"] for profile in record_profiles],
    )
    semantic_fields = build_semantic_fields_from_clusters(
        sample,
        record_profiles,
        cluster_labels,
        current_line_number,
        signature_lookup,
        line_text_lookup,
    )

    if not semantic_fields["fields"]:
        return apply_local_semantic_field_review_overrides(
            sample,
            current_line_number,
            build_semantic_fields_lexical_fallback(records, current_line_number, signature_lookup, line_text_lookup),
        )

    semantic_fields["schema_version"] = "v1"
    semantic_fields["method"] = "local-lsa-kmeans"
    return apply_local_semantic_field_review_overrides(sample, current_line_number, semantic_fields)


def write_semantic_fields_report(
    sample: str,
    title: str,
    report_lines: list[dict],
) -> dict:
    ensure_dir(REPORTS_DIR)

    json_path = REPORTS_DIR / f"{sample}_local_semantic_fields.json"
    json_path.write_text(
        json.dumps(
            {
                "sample": sample,
                "title": title,
                "line_count": len(report_lines),
                "lines": report_lines,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    txt_sections = [
        f"{title} Local Semantic Fields",
        "",
        "这是一份本地纯文本审阅报告，用来整体查看每一行的 Local Semantic Fields。",
        "",
        "Lines",
        "-----",
    ]
    txt_sections.extend(
        f"Line {line['line_number']}: {line['line_text']}" for line in report_lines
    )
    txt_sections.extend(["", "Details", "-------"])

    for line in report_lines:
        txt_sections.extend(
            [
                "",
                f"Line {line['line_number']}",
                line["line_text"],
                f"Coverage: {line['coverage_count']} records",
            ]
        )

        if not line["semantic_fields"]:
            txt_sections.append("No semantic fields.")
            continue

        for field in line["semantic_fields"]:
            txt_sections.extend(
                [
                    "",
                    f"- Field: {field['label']}",
                    f"  Seed: {field['seed_term']}",
                    f"  Kind: {field.get('field_kind', 'line_semantic')}",
                    f"  Label confidence: {field.get('label_confidence', 0)}",
                    f"  Quality score: {field.get('quality_score', 0)}",
                    f"  Records: {field['record_count']} ({field['record_share']}%)",
                    f"  Unique commentators: {field.get('unique_commentator_count', 0)}",
                    f"  Terms: {', '.join(field['representative_terms'])}",
                    f"  Examples: {', '.join(field['example_commentaries'])}",
                ]
            )
            if field["cross_line_references"]:
                txt_sections.append("  Cross-line refer:")
                for refer in field["cross_line_references"]:
                    txt_sections.append(
                        "    "
                        f"Line {refer['line_number']}: {refer['line_text']} "
                        f"({', '.join(refer['shared_terms'])})"
                    )

    txt_path = REPORTS_DIR / f"{sample}_local_semantic_fields.txt"
    txt_path.write_text("\n".join(txt_sections) + "\n", encoding="utf-8")

    v2_txt_path = REPORTS_DIR / f"{sample}_local_semantic_fields_v2.txt"
    v2_txt_path.write_text("\n".join(txt_sections) + "\n", encoding="utf-8")

    replaced_entries = []
    retained_token_like = []
    review_entries = []
    como_entries = []

    for line in report_lines:
        for field in line["semantic_fields"]:
            audit = field.get("label_audit") or {}
            entry = (
                f"Line {line['line_number']} | `{audit.get('original_label', field['label'])}` -> "
                f"`{audit.get('final_label', field['label'])}` | kind: {field.get('field_kind', 'line_semantic')} "
                f"| confidence: {field.get('label_confidence', 0)} | terms: {', '.join(field['representative_terms'])}"
            )
            if audit.get("changed"):
                replaced_entries.append(f"{entry} | reason: {audit.get('reason', '')}")
            if audit.get("retained_token_like"):
                retained_token_like.append(f"{entry} | reason: {audit.get('reason', '')}")
            if audit.get("review_needed"):
                review_entries.append(f"{entry} | review: {audit.get('reason', '')}")
            if audit.get("como_checked"):
                como_entries.append(f"{entry} | como-note: {audit.get('reason', '')}")

    log_sections = [
        f"{title} Local Semantic Fields QA Log",
        "",
        f"Sample: {sample}",
        f"Lines reviewed: {len(report_lines)}",
        f"Fields with label replacements: {len(replaced_entries)}",
        f"Fields retaining token-like labels: {len(retained_token_like)}",
        f"Fields suggested for manual review: {len(review_entries)}",
        "",
        "What changed",
        "------------",
    ]
    log_sections.extend(replaced_entries or ["No label replacements were applied."])
    log_sections.extend(["", "Retained token-like labels", "-------------------------"])
    log_sections.extend(retained_token_like or ["No token-like labels were retained."])
    log_sections.extend(["", "Suggested manual review", "-----------------------"])
    log_sections.extend(review_entries or ["No fields were flagged for manual review."])
    log_sections.extend(["", "`como` decision", "---------------"])
    log_sections.extend(
        como_entries
        or ["`como` did not appear as an active field label in the current export."]
    )

    log_path = REPORTS_DIR / f"{sample}_local_semantic_fields_v2.log"
    log_path.write_text("\n".join(log_sections) + "\n", encoding="utf-8")

    sections = []
    toc = []
    for line in report_lines:
        toc.append(
            f'<li><a href="#line-{line["line_number"]}">Line {line["line_number"]}</a> '
            f'<span>{html.escape(line["line_text"])}</span></li>'
        )

        field_blocks = []
        for field in line["semantic_fields"]:
            refer_html = ""
            if field["cross_line_references"]:
                refer_items = "".join(
                    f"<li>Line {refer['line_number']}: {html.escape(refer['line_text'])} "
                    f"({', '.join(html.escape(term) for term in refer['shared_terms'])})</li>"
                    for refer in field["cross_line_references"]
                )
                refer_html = f"<div class='refer-block'><strong>Cross-line refer</strong><ul>{refer_items}</ul></div>"

            example_html = ", ".join(html.escape(name) for name in field["example_commentaries"])
            terms_html = ", ".join(html.escape(term) for term in field["representative_terms"])
            field_blocks.append(
                f"""
                <article class="field-card">
                  <h4>{html.escape(field['label'])}</h4>
                  <p class="meta">{field['record_count']} records · {field['record_share']}% · {field.get('unique_commentator_count', 0)} unique commentators</p>
                  <p class="meta">kind: {html.escape(field.get('field_kind', 'line_semantic'))} · confidence: {field.get('label_confidence', 0)} · quality: {field.get('quality_score', 0)}</p>
                  <p><strong>Seed:</strong> {html.escape(field['seed_term'])}</p>
                  <p><strong>Terms:</strong> {terms_html}</p>
                  <p><strong>Examples:</strong> {example_html}</p>
                  {refer_html}
                </article>
                """
            )

        sections.append(
            f"""
            <section id="line-{line['line_number']}" class="line-section">
              <h3>Line {line['line_number']}</h3>
              <p class="line-text">{html.escape(line['line_text'])}</p>
              <p class="meta">Coverage: {line['coverage_count']} records</p>
              <div class="field-grid">
                {''.join(field_blocks) if field_blocks else '<p>No semantic fields.</p>'}
              </div>
            </section>
            """
        )

    html_path = REPORTS_DIR / f"{sample}_local_semantic_fields.html"
    html_path.write_text(
        f"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(title)} Local Semantic Fields</title>
    <style>
      body {{
        margin: 0;
        background: #f4efe3;
        color: #1f1d19;
        font-family: "Avenir Next", "Trebuchet MS", sans-serif;
      }}
      .page {{
        width: min(1200px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }}
      h1, h2, h3, h4 {{
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        margin: 0;
      }}
      .intro, .meta, .line-text {{
        color: #625b52;
        line-height: 1.55;
      }}
      .toc {{
        margin: 18px 0 24px;
        padding: 16px 18px;
        border: 1px solid rgba(93, 75, 49, 0.14);
        border-radius: 18px;
        background: rgba(255,255,255,0.65);
      }}
      .toc ul {{
        columns: 2;
        gap: 24px;
        padding-left: 18px;
      }}
      .toc li {{
        margin-bottom: 6px;
      }}
      .toc span {{
        color: #625b52;
      }}
      .line-section {{
        margin-top: 22px;
        padding: 18px;
        border: 1px solid rgba(93, 75, 49, 0.14);
        border-radius: 20px;
        background: rgba(251,248,241,0.88);
      }}
      .field-grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }}
      .field-card {{
        padding: 14px;
        border: 1px solid rgba(140, 59, 42, 0.14);
        border-radius: 16px;
        background: rgba(255,255,255,0.72);
      }}
      .field-card h4 {{
        margin-bottom: 8px;
      }}
      .field-card p {{
        margin: 6px 0 0;
        line-height: 1.5;
      }}
      .refer-block ul {{
        margin: 8px 0 0;
        padding-left: 18px;
      }}
    </style>
  </head>
  <body>
    <div class="page">
      <h1>{html.escape(title)} Local Semantic Fields</h1>
      <p class="intro">这是一份本地审阅报告，用来整体查看每一行的 Local Semantic Fields，而不是在前端逐行点击。</p>
      <div class="toc">
        <h2>Lines</h2>
        <ul>{''.join(toc)}</ul>
      </div>
      {''.join(sections)}
    </div>
  </body>
</html>
""",
        encoding="utf-8",
    )

    return {
        "json": str(json_path),
        "txt": str(txt_path),
        "v2_txt": str(v2_txt_path),
        "log": str(log_path),
        "html": str(html_path),
        "replaced_count": len(replaced_entries),
        "retained_token_like_count": len(retained_token_like),
        "review_count": len(review_entries),
    }


def summarize_sample_semantic_fields(sample: str, title: str, report_lines: list[dict], report_paths: dict) -> dict:
    total_fields = 0
    label_changed_count = 0
    review_needed_count = 0
    total_cross_refs = 0
    reference_basis_counts: Counter[str] = Counter()
    qa_flag_counts: Counter[str] = Counter()
    field_kind_counts: Counter[str] = Counter()
    stable_lines = 0
    max_review_line = None
    max_review_count = -1

    for line in report_lines:
        line_review_count = 0
        for field in line["semantic_fields"]:
            total_fields += 1
            field_kind_counts.update([field.get("field_kind", "line_semantic")])
            qa = field.get("qa") or {}
            flags = qa.get("flags") or []
            qa_flag_counts.update(flags)
            if "label_changed" in flags:
                label_changed_count += 1
            if qa.get("review_needed"):
                review_needed_count += 1
                line_review_count += 1

            for refer in field.get("cross_line_references", []):
                total_cross_refs += 1
                reference_basis_counts.update([refer.get("reference_basis", "unknown")])

        if line_review_count == 0 and line["semantic_fields"]:
            stable_lines += 1
        if line_review_count > max_review_count:
            max_review_count = line_review_count
            max_review_line = line["line_number"]

    return {
        "sample": sample,
        "title": title,
        "line_count": len(report_lines),
        "field_count": total_fields,
        "stable_line_count": stable_lines,
        "label_changed_count": label_changed_count,
        "review_needed_count": review_needed_count,
        "qa_flag_counts": dict(qa_flag_counts),
        "field_kind_counts": dict(field_kind_counts),
        "reference_basis_counts": dict(reference_basis_counts),
        "cross_reference_count": total_cross_refs,
        "max_review_line": max_review_line,
        "max_review_count": max_review_count,
        "report_paths": report_paths,
    }


def process_sample(sample: str, commentary_meta: Dict[str, CommentaryMeta]) -> dict:
    rows = read_rows(sample)
    line_texts = normalize_poem_lines(rows, sample=sample)
    valid_line_numbers = set(line_texts)

    overview_lines: Dict[int, dict] = {}
    line_records: Dict[int, list] = defaultdict(list)
    all_record_count = 0
    unique_commentaries = set()
    max_coverage = 0

    for row_index, row in enumerate(rows, start=1):
        if row.get("fetch_status") != "success":
            continue

        try:
            line_start = int(row["line_start"])
            line_end = int(row["line_end"])
            line_span = int(row["line_span"])
        except (TypeError, ValueError, KeyError):
            continue

        commentary_name = (row.get("commentary_name") or "").strip()
        meta = commentary_meta.get(commentary_name)
        unique_commentaries.add(commentary_name)
        all_record_count += 1

        record_text = row.get("record_text", "")
        record_id = f"{sample}-r{row_index}"

        record = {
            "id": record_id,
            "commentary_name": commentary_name,
            "cantica": row.get("cantica"),
            "canto": row.get("canto"),
            "line_info": row.get("line_info"),
            "line_start": line_start,
            "line_end": line_end,
            "line_span": line_span,
            "record_summary": build_record_summary(record_text),
            "record_text_preview": record_text[:1400].strip(),
            "record_text_length": len(record_text),
            "extraction_template_used": row.get("extraction_template_used") or None,
            "line_info_pattern": row.get("line_info_pattern") or None,
            "date_label": meta.date_label if meta else None,
            "year_start": meta.year_start if meta else None,
            "year_end": meta.year_end if meta else None,
            "century_label": meta.century_label if meta else None,
        }

        for line_number in range(line_start, line_end + 1):
            if valid_line_numbers and line_number not in valid_line_numbers:
                continue
            line_records[line_number].append(record)
            line_entry = overview_lines.setdefault(
                line_number,
                {
                    "line_number": line_number,
                    "line_text": line_texts.get(line_number, ""),
                    "coverage_count": 0,
                },
            )
            line_entry["coverage_count"] += 1
            max_coverage = max(max_coverage, line_entry["coverage_count"])

    sample_dir = DEMO_DATA_DIR / sample
    lines_dir = sample_dir / "lines"
    records_dir = sample_dir / "records"
    ensure_dir(lines_dir)
    ensure_dir(records_dir)

    sorted_lines = []
    records_by_line: dict[int, list[dict]] = {}
    record_store: dict[str, dict] = {}
    fulltext_store: dict[str, dict] = {}
    for line_number in sorted(overview_lines):
        line_entry = overview_lines[line_number]
        line_entry["coverage_ratio"] = round(line_entry["coverage_count"] / max_coverage, 4) if max_coverage else 0

        records = sorted(
            line_records[line_number],
            key=lambda record: (
                record["year_start"] is None,
                record["year_start"] or 9999,
                record["commentary_name"].lower(),
                record["line_span"],
            ),
        )
        line_entry["signature_terms"] = build_line_signature(records)
        line_entry["dante_loci"] = build_dante_loci(sample, line_number, line_entry["line_text"])
        records_by_line[line_number] = records
        for record in records:
            record_store[record["id"]] = record
        sorted_lines.append(line_entry)

    for row_index, row in enumerate(rows, start=1):
        if row.get("fetch_status") != "success":
            continue
        record_id = f"{sample}-r{row_index}"
        fulltext_store[record_id] = {
            "record_text": row.get("record_text", ""),
        }

    signature_lookup = {line["line_number"]: line.get("signature_terms", []) for line in sorted_lines}
    line_text_lookup = {line["line_number"]: line.get("line_text", "") for line in sorted_lines}
    report_lines = []

    record_store_payload = {
        "schema_version": "sample-record-store/v1",
        "sample": sample,
        "record_count": len(record_store),
        "records": record_store,
    }
    record_store_path = records_dir / "store.json"
    record_store_path.write_text(dump_compact_json(record_store_payload), encoding="utf-8")

    record_store_index_payload = {
        "schema_version": "sample-record-store-index/v1",
        "sample": sample,
        "record_count": len(record_store),
        "path": f"./data/{sample}/records/store.json",
    }
    record_store_index_path = records_dir / "index.json"
    record_store_index_path.write_text(dump_compact_json(record_store_index_payload), encoding="utf-8")

    fulltext_store_payload = {
        "schema_version": "sample-record-fulltext/v1",
        "sample": sample,
        "record_count": len(fulltext_store),
        "records": fulltext_store,
    }
    fulltext_store_path = records_dir / "fulltext.json"
    fulltext_store_path.write_text(dump_compact_json(fulltext_store_payload), encoding="utf-8")

    for line_entry in sorted_lines:
        line_number = line_entry["line_number"]
        records = records_by_line[line_number]
        semantic_fields = build_semantic_fields(sample, records, line_number, signature_lookup, line_text_lookup)

        payload = {
            "schema_version": "line-payload/v2",
            "sample": sample,
            "line_number": line_number,
            "line_text": line_entry["line_text"],
            "coverage_count": line_entry["coverage_count"],
            "signature_terms": line_entry["signature_terms"],
            "top_commentary_terms": build_top_commentary_terms(records),
            "top_commentary_terms_note": TOP_COMMENTARY_TERMS_NOTE,
            "record_ids": [record["id"] for record in records],
            "semantic_fields": semantic_fields,
            "dante_loci": line_entry["dante_loci"],
            "future_hooks": {
                "lexical_clustering": {
                    "status": "placeholder",
                    "description": "Reserve commentary snippets for interpretive vocabulary extraction around selectable Dante word-loci.",
                },
                "figure_navigation": {
                    "status": "placeholder",
                    "description": "Reserve a person/entity layer over line-aligned commentary evidence.",
                },
                "recurrence": {
                    "status": "placeholder",
                    "description": "Reserve links from this line to parallel Dante passages across cantos.",
                },
            },
        }

        line_path = lines_dir / f"{line_number:03d}.json"
        line_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        report_lines.append(
            {
                "line_number": line_number,
                "line_text": line_entry["line_text"],
                "coverage_count": line_entry["coverage_count"],
                "semantic_fields": semantic_fields["fields"],
            }
        )

    cantica = rows[0].get("cantica") if rows else ""
    canto = rows[0].get("canto") if rows else ""
    overview = {
        "sample": sample,
        "title": f"{cantica} {canto}".strip(),
        "cantica": cantica,
        "canto": canto,
        "record_count": all_record_count,
        "line_count": len(sorted_lines),
        "unique_commentary_count": len(unique_commentaries),
        "source_csv": str((SOURCE_DATA_DIR / f"{sample}_records_text_full.csv").relative_to(ROOT)),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "max_coverage": max_coverage,
        "lines": sorted_lines,
        "future_lenses": [
            {"id": "lexical-clustering", "label": "Interpretive Vocabulary", "status": "reserved"},
            {"id": "figure-navigation", "label": "人物层 Navigation", "status": "reserved"},
            {"id": "recurrence", "label": "跨 Canto Recurrence", "status": "reserved"},
        ],
    }

    overview_path = sample_dir / "overview.json"
    overview_path.write_text(json.dumps(overview, ensure_ascii=False, indent=2), encoding="utf-8")

    report_paths = write_semantic_fields_report(sample, overview["title"], report_lines)
    summary = summarize_sample_semantic_fields(sample, overview["title"], report_lines, report_paths)
    summary.update(
        {
            "cantica": cantica,
            "canto": canto,
            "record_count": all_record_count,
            "unique_commentary_count": len(unique_commentaries),
            "overview_path": str(overview_path),
            "line_data_available": True,
            "line_json_count": len(sorted_lines),
            "record_store_available": True,
            "record_store_path": str(record_store_path),
            "record_store_index_path": str(record_store_index_path),
            "record_fulltext_available": True,
            "record_fulltext_path": str(fulltext_store_path),
        }
    )
    return {
        "overview": overview,
        "manifest_entry": {
            "id": sample,
            "title": overview["title"],
            "cantica": cantica,
            "canto": canto,
            "record_count": all_record_count,
            "line_count": len(sorted_lines),
            "unique_commentary_count": len(unique_commentaries),
            "record_store_available": True,
            "record_fulltext_available": True,
        },
        "summary": summary,
    }


def build_coverage_only_overview(sample: str) -> dict:
    rows = read_rows(sample)
    line_texts = normalize_poem_lines(rows, sample=sample)
    valid_line_numbers = set(line_texts)
    overview_lines: Dict[int, dict] = {}
    all_record_count = 0
    unique_commentaries = set()
    max_coverage = 0

    for row in rows:
        if row.get("fetch_status") != "success":
            continue

        try:
            line_start = int(row["line_start"])
            line_end = int(row["line_end"])
        except (TypeError, ValueError, KeyError):
            continue

        commentary_name = (row.get("commentary_name") or "").strip()
        unique_commentaries.add(commentary_name)
        all_record_count += 1

        for line_number in range(line_start, line_end + 1):
            if valid_line_numbers and line_number not in valid_line_numbers:
                continue
            line_entry = overview_lines.setdefault(
                line_number,
                {
                    "line_number": line_number,
                    "line_text": line_texts.get(line_number, ""),
                    "coverage_count": 0,
                    "signature_terms": [],
                },
            )
            line_entry["coverage_count"] += 1
            max_coverage = max(max_coverage, line_entry["coverage_count"])

    sorted_lines = []
    for line_number in sorted(overview_lines):
        line_entry = overview_lines[line_number]
        line_entry["coverage_ratio"] = round(line_entry["coverage_count"] / max_coverage, 4) if max_coverage else 0
        line_entry["dante_loci"] = build_dante_loci(sample, line_number, line_entry["line_text"])
        sorted_lines.append(line_entry)

    cantica = rows[0].get("cantica") if rows else ""
    canto = rows[0].get("canto") if rows else ""
    overview = {
        "sample": sample,
        "title": f"{cantica} {canto}".strip(),
        "cantica": cantica,
        "canto": canto,
        "record_count": all_record_count,
        "line_count": len(sorted_lines),
        "unique_commentary_count": len(unique_commentaries),
        "source_csv": str((SOURCE_DATA_DIR / f"{sample}_records_text_full.csv").relative_to(ROOT)),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "max_coverage": max_coverage,
        "lines": sorted_lines,
        "future_lenses": [],
    }

    sample_dir = DEMO_DATA_DIR / sample
    ensure_dir(sample_dir)
    overview_path = sample_dir / "overview.json"
    overview_path.write_text(json.dumps(overview, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "overview": overview,
        "overview_path": overview_path,
    }


def build_research_layer(manifest_entries: list[dict]) -> Path:
    line_profiles = []
    line_echo_payload_fields: dict[str, list[dict]] = {}
    word_occurrences: dict[str, list[dict]] = defaultdict(list)
    word_term_weights: dict[str, Counter[str]] = defaultdict(Counter)
    word_term_line_counts: dict[str, Counter[str]] = defaultdict(Counter)
    word_term_signature_counts: dict[str, Counter[str]] = defaultdict(Counter)
    word_field_weights: dict[str, Counter[str]] = defaultdict(Counter)
    word_surface_forms: dict[str, Counter[str]] = defaultdict(Counter)
    figure_occurrences: dict[str, list[dict]] = defaultdict(list)
    term_word_profile_index: dict[str, set[str]] = defaultdict(set)

    for entry in manifest_entries:
        if not entry.get("overview_available") or not entry.get("overview_path"):
            continue

        overview_path = DEMO_DATA_DIR / entry["id"] / "overview.json"
        overview = json.loads(overview_path.read_text(encoding="utf-8"))
        lines_by_number = {line["line_number"]: line for line in overview.get("lines", [])}

        line_payload_lookup = {}
        if entry.get("line_data_available") and entry.get("line_data_path"):
            line_dir = DEMO_DATA_DIR / entry["id"] / "lines"
            for line_file in sorted(line_dir.glob("*.json")):
                payload = json.loads(line_file.read_text(encoding="utf-8"))
                line_payload_lookup[payload["line_number"]] = payload

        for line_number, overview_line in sorted(lines_by_number.items()):
            payload = line_payload_lookup.get(line_number)
            dante_loci = (
                (payload.get("dante_loci") if payload else None)
                or overview_line.get("dante_loci")
                or build_dante_loci(entry["id"], line_number, overview_line.get("line_text", ""))
            )
            semantic_fields = payload.get("semantic_fields", {}).get("fields", []) if payload else []
            signature_terms = overview_line.get("signature_terms", [])
            semantic_terms = unique_preserving_order(
                term
                for field in semantic_fields
                for term in field.get("representative_terms", [])[:4]
            )
            field_labels = [field.get("display_label") or field.get("label") for field in semantic_fields[:6]]

            line_profile = {
                "id": f"{entry['id']}:{line_number}",
                "sample": entry["id"],
                "title": entry["title"],
                "cantica": entry["cantica"],
                "canto": entry["canto"],
                "status": entry["status"],
                "line_number": line_number,
                "line_text": overview_line.get("line_text", ""),
                "signature_terms": signature_terms,
                "semantic_terms": semantic_terms[:10],
                "field_labels": [label for label in field_labels if label],
                "dante_loci": dante_loci,
            }
            line_profiles.append(line_profile)
            line_echo_payload_fields[line_profile["id"]] = semantic_fields

            normalized_tokens = {locus["normalized_form"] for locus in dante_loci}
            for figure_id, figure in FIGURE_REGISTRY.items():
                if not normalized_tokens.intersection(set(figure["aliases"])):
                    continue
                figure_occurrences[figure_id].append(
                    {
                        "sample": entry["id"],
                        "title": entry["title"],
                        "cantica": entry["cantica"],
                        "canto": entry["canto"],
                        "line_number": line_number,
                        "line_text": overview_line.get("line_text", ""),
                    }
                )

            for locus in dante_loci:
                if not locus.get("is_selectable_locus"):
                    continue
                normalized_form = locus["normalized_form"]
                filtered_signature_terms = [
                    term
                    for term in signature_terms
                    if not looks_like_bad_word_profile_term(term, locus_form=normalized_form)
                ]
                filtered_semantic_terms = [
                    term
                    for term in semantic_terms
                    if not looks_like_bad_word_profile_term(term, locus_form=normalized_form)
                ]
                occurrence = {
                    "sample": entry["id"],
                    "title": entry["title"],
                    "cantica": entry["cantica"],
                    "canto": entry["canto"],
                    "status": entry["status"],
                    "line_number": line_number,
                    "line_text": overview_line.get("line_text", ""),
                    "locus_id": locus["id"],
                    "surface_form": locus["surface_form"],
                    "normalized_form": normalized_form,
                    "signature_terms": filtered_signature_terms[:8],
                }
                word_occurrences[normalized_form].append(occurrence)
                word_surface_forms[normalized_form].update([locus["surface_form"]])

                for index, term in enumerate(unique_preserving_order(filtered_signature_terms)):
                    weight = max(0.8, 2.6 - (index * 0.2))
                    word_term_weights[normalized_form][term] += weight
                    word_term_line_counts[normalized_form].update([term])
                    word_term_signature_counts[normalized_form].update([term])
                    term_word_profile_index[term].add(normalized_form)

                for index, term in enumerate(unique_preserving_order(filtered_semantic_terms)[:4]):
                    if term in filtered_signature_terms:
                        continue
                    weight = max(0.4, 0.95 - (index * 0.15))
                    word_term_weights[normalized_form][term] += weight
                    word_term_line_counts[normalized_form].update([term])
                    term_word_profile_index[term].add(normalized_form)

                for label in field_labels:
                    if (
                        label
                        and not looks_like_bad_word_profile_term(label, locus_form=normalized_form)
                        and not looks_like_corpus_drift_term(label)
                    ):
                        word_field_weights[normalized_form].update([label])

    attach_line_echo_profiles(
        line_profiles=line_profiles,
        line_echo_payload_fields=line_echo_payload_fields,
    )

    word_profiles = {}
    total_word_forms = max(len(word_occurrences), 1)
    for normalized_form, occurrences in sorted(word_occurrences.items()):
        term_items = score_word_profile_terms(
            normalized_form=normalized_form,
            total_word_forms=total_word_forms,
            term_weights=word_term_weights[normalized_form],
            term_line_counts=word_term_line_counts[normalized_form],
            term_signature_counts=word_term_signature_counts[normalized_form],
            term_docfreq=term_word_profile_index,
        )

        word_profiles[normalized_form] = {
            "normalized_form": normalized_form,
            "display_form": word_surface_forms[normalized_form].most_common(1)[0][0],
            "occurrence_count": len(occurrences),
            "sample_count": len({item["sample"] for item in occurrences}),
            "exact_form_only": True,
            "normalization_method": "lower_ascii_exact_form",
            "interpretive_terms": term_items,
            "term_quality_method": "signature_weighted_profile_v4_broad_and_formula_family_penalty",
            "related_field_labels": [
                {"label": label, "count": count}
                for label, count in word_field_weights[normalized_form].most_common(8)
                if not (
                    (looks_like_broad_interpretive_term(label) or looks_like_commentarial_formula_term(label))
                    and count < 3
                )
            ],
            "occurrences": occurrences,
        }

    figure_profiles = []
    for figure_id, figure in FIGURE_REGISTRY.items():
        occurrences = figure_occurrences.get(figure_id, [])
        if not occurrences:
            continue
        sample_counts = Counter(item["sample"] for item in occurrences)
        figure_profiles.append(
            {
                "id": figure_id,
                "display_label": figure["display_label"],
                "aliases": figure["aliases"],
                "occurrence_count": len(occurrences),
                "sample_counts": [
                    {"sample": sample, "count": count}
                    for sample, count in sorted(sample_counts.items(), key=lambda item: (-item[1], *sample_id_sort_key(item[0])))
                ],
                "occurrences": occurrences[:80],
            }
        )

    research_layer = {
        "schema_version": "v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "notes": {
            "word_loci_scope": "single Dante content-word loci only",
            "occurrence_mode": "exact form occurrence explorer",
            "recurrence_mode": "text-first Cross-Canto Echoes with reviewer-driven rollback; Dante line > terzina > comment",
        },
        "samples": [
            {
                "id": entry["id"],
                "title": entry["title"],
                "status": entry["status"],
                "overview_available": entry.get("overview_available", False),
                "line_data_available": entry.get("line_data_available", False),
            }
            for entry in manifest_entries
        ],
        "line_profiles": line_profiles,
        "word_profiles": word_profiles,
        "figure_profiles": figure_profiles,
    }

    output_path = DEMO_DATA_DIR / "research_layer.json"
    output_path.write_text(json.dumps(research_layer, ensure_ascii=False, indent=2), encoding="utf-8")

    line_echoes_by_sample: dict[str, list[dict]] = defaultdict(list)
    for profile in line_profiles:
        if not profile.get("line_echo_profile"):
            continue
        line_echoes_by_sample[profile["sample"]].append(
            {
                "line_number": profile["line_number"],
                "line_echo_profile": profile["line_echo_profile"],
            }
        )

    generated_at = datetime.now(timezone.utc).isoformat()
    for sample_id, items in line_echoes_by_sample.items():
        sample_dir = DEMO_DATA_DIR / sample_id
        sample_dir.mkdir(parents=True, exist_ok=True)
        line_echoes_payload = {
            "schema_version": "v1",
            "generated_at": generated_at,
            "sample": sample_id,
            "count": len(items),
            "line_echo_profiles": sorted(items, key=lambda item: int(item["line_number"])),
        }
        (sample_dir / "line_echoes.json").write_text(
            json.dumps(line_echoes_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return output_path


def parse_sample_id(sample_id: str) -> tuple[str | None, int | None]:
    match = re.match(r"^(inferno|purgatorio|paradiso)(\d{1,2})$", str(sample_id or "").lower())
    if not match:
        return None, None
    return match.group(1), int(match.group(2))


def format_canto_label(sample_id: str) -> str:
    cantica, canto = parse_sample_id(sample_id)
    if not cantica or canto is None:
        return sample_id
    return f"{cantica.capitalize()} {canto}"


def infer_authority_sample_name(cantica: str | None, canto: int | str | None) -> str | None:
    if not cantica or canto in {None, ""}:
        return None
    try:
        canto_number = int(canto)
    except (TypeError, ValueError):
        return None
    return f"{str(cantica).lower()}{canto_number}"


def authority_records_text_csv_candidates(sample_id: str) -> list[Path]:
    cantica, canto = parse_sample_id(sample_id)
    if not cantica or canto is None:
        return []

    candidates = [SOURCE_DATA_DIR / f"{sample_id}_records_text_full.csv"]
    if cantica == "inferno":
        candidates.append(SOURCE_DATA_DIR / "inf" / f"inf{canto}" / f"{sample_id}_records_text_full.csv")
    elif cantica == "purgatorio":
        candidates.append(SOURCE_DATA_DIR / "purg" / f"purg{canto}" / f"{sample_id}_records_text_full.csv")
    return candidates


def load_authority_source_rows_for_sample(sample_id: str) -> dict[str, dict[str, Any]]:
    cached = AUTHORITY_SOURCE_TEXT_CACHE.get(sample_id)
    if cached is not None:
        return cached

    rows_by_url: dict[str, dict[str, Any]] = {}
    for path in authority_records_text_csv_candidates(sample_id):
        if not path.exists():
            continue
        try:
            with path.open(encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    result_url = str(row.get("result_url") or "").strip()
                    if not result_url or result_url in rows_by_url:
                        continue
                    rows_by_url[result_url] = {
                        "result_url": result_url,
                        "commentary_name": row.get("commentary_name"),
                        "cantica": row.get("cantica"),
                        "canto": row.get("canto"),
                        "line_info": row.get("line_info"),
                        "first_seen_line": row.get("first_seen_line"),
                        "record_text": row.get("record_text"),
                        "extracted_text_length": row.get("extracted_text_length"),
                        "fetch_status": row.get("fetch_status"),
                        "extraction_template_used": row.get("extraction_template_used"),
                        "line_start": row.get("line_start"),
                        "line_end": row.get("line_end"),
                        "line_span": row.get("line_span"),
                        "line_info_pattern": row.get("line_info_pattern"),
                        "line_info_parse_status": row.get("line_info_parse_status"),
                        "sample_name": sample_id,
                        "source_path": str(path.relative_to(ROOT)),
                    }
        except TimeoutError:
            AUTHORITY_SOURCE_TIMEOUT_SAMPLES.add(sample_id)
            continue
    AUTHORITY_SOURCE_TEXT_CACHE[sample_id] = rows_by_url
    return rows_by_url


def iter_frontend_ready_commentary_line_occurrences() -> Iterable[dict[str, Any]]:
    commentary_line_index_path = AUTHORITY_FRONTEND_READY_DIR / "author_commentary_line_index.json"
    if not commentary_line_index_path.exists():
        return

    payload = json.loads(commentary_line_index_path.read_text(encoding="utf-8"))
    for author in payload.get("authors", []):
        author_id = author.get("author_id")
        canonical_name = author.get("canonical_name")
        for sample in author.get("samples", []):
            sample_name = sample.get("sample_name")
            for group in sample.get("line_groups", []):
                for occurrence in group.get("occurrences", []):
                    yield {
                        **occurrence,
                        "author_id": occurrence.get("author_id") or author_id,
                        "author": occurrence.get("author") or canonical_name,
                        "sample_name": occurrence.get("sample_name") or sample_name,
                    }


def build_authority_surface_regex(surface: str) -> re.Pattern[str]:
    escaped = re.escape(str(surface or "").strip())
    escaped = re.sub(r"\\ ", r"\\s+", escaped)
    escaped = re.sub(r"\\([,.;:!?])", r"\\s*\\\1", escaped)
    return re.compile(rf"(^|[^\wÀ-ÿ'])({escaped})(?=$|[^\wÀ-ÿ'])", re.I | re.U)


def build_commentary_abbr(commentary_name: str | None) -> str:
    parts = re.findall(r"[A-Za-zÀ-ÿ]+", str(commentary_name or ""))
    initials = [part[0].upper() for part in parts[:4] if part]
    return "".join(initials) or str(commentary_name or "")[:4].upper()


def build_supplemental_occurrence_id(*parts: str) -> str:
    digest = hashlib.sha1("::".join(str(part or "") for part in parts).encode("utf-8")).hexdigest()[:12]
    return f"occ_{digest}"


def collect_surface_matches(text: str, surfaces: list[str]) -> list[str]:
    matches: list[str] = []
    seen: set[str] = set()
    for surface in surfaces:
        label = str(surface or "").strip()
        if not label:
            continue
        regex = build_authority_surface_regex(label)
        for match in regex.finditer(text):
            hit = " ".join(str(match.group(2) or "").split()).strip()
            key = hit.casefold()
            if hit and key not in seen:
                seen.add(key)
                matches.append(hit)
    return matches


def build_supplemental_dante_frontend_ready_payload() -> dict[str, Any]:
    commentary_rows: list[dict[str, Any]] = []
    density_rows: dict[str, dict[str, Any]] = {}
    works_counter: dict[str, dict[str, int]] = {}
    line_groups_by_sample: dict[str, dict[str, Any]] = {}

    author_surfaces = DANTE_SUPPLEMENTAL_AUTHOR["aliases"]
    work_surfaces = {
        row["canonical_work"]: row["aliases"]
        for row in DANTE_SUPPLEMENTAL_WORKS
    }

    for csv_path in sorted(SOURCE_DATA_DIR.glob("*_records_text_full.csv")):
        try:
            with csv_path.open(encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    text = str(row.get("record_text") or "")
                    if not text:
                        continue
                    lowered_text = text.casefold()
                    if not any(marker in lowered_text for marker in DANTE_SUPPLEMENTAL_MARKERS):
                        continue
                    author_hits = collect_surface_matches(text, author_surfaces)
                    work_hits = {
                        canonical_work: collect_surface_matches(text, aliases)
                        for canonical_work, aliases in work_surfaces.items()
                    }
                    work_hits = {
                        canonical_work: hits
                        for canonical_work, hits in work_hits.items()
                        if hits
                    }
                    if not author_hits and not work_hits:
                        continue

                    cantica = str(row.get("cantica") or "").strip()
                    canto = row.get("canto")
                    sample_name = infer_authority_sample_name(cantica, canto)
                    if not sample_name:
                        continue
                    canto_label = f"{cantica} {canto}".strip()
                    line_info = str(row.get("line_info") or "").strip()
                    line_start = infer_authority_jump_line_number(row.get("line_start"))
                    line_end = infer_authority_jump_line_number(row.get("line_end"))
                    commentary_name = str(row.get("commentary_name") or "").strip()
                    result_url = str(row.get("result_url") or "").strip()

                    mention_payloads: list[dict[str, Any]] = []
                    if work_hits:
                        for canonical_work, hits in work_hits.items():
                            work_stat = works_counter.setdefault(
                                canonical_work,
                                {
                                    "canonical_work": canonical_work,
                                    "count": 0,
                                    "resolved_author_and_work": 0,
                                    "resolved_work_plus_inferred_author": 0,
                                    "passage_mentions": 0,
                                },
                            )
                            for hit in hits:
                                resolved = "resolved_author_and_work" if author_hits else "resolved_work_plus_inferred_author"
                                work_stat["count"] += 1
                                work_stat[resolved] += 1
                                if re.search(r"\b(?:[ivxlcdm]+|\d+)\b", text, re.I):
                                    work_stat["passage_mentions"] += 1
                                mention_payloads.append(
                                    {
                                        "author_id": "dante",
                                        "author": "Dante",
                                        "frontend_status": "ready",
                                        "frontend_notes": AUTHORITY_OBJECT_ROLLOUT_POLICY["dante"]["frontend_notes_override"],
                                        "work": canonical_work,
                                        "cantica": cantica,
                                        "canto": int(canto),
                                        "canto_label": canto_label,
                                        "line_info": line_info,
                                        "commentary_name": commentary_name,
                                        "commentary_abbr": build_commentary_abbr(commentary_name),
                                        "raw_mention": hit,
                                        "resolution_status": resolved,
                                        "confidence": 0.91 if author_hits else 0.82,
                                        "raw_passage": None,
                                        "commentary_record_id": build_supplemental_occurrence_id("dante", result_url, canonical_work, hit),
                                        "result_url": result_url,
                                        "mention_role": None,
                                        "mention_role_confidence": None,
                                        "sample_name": sample_name,
                                        "line_number": line_start,
                                    }
                                )
                    elif author_hits:
                        for hit in author_hits:
                            mention_payloads.append(
                                {
                                    "author_id": "dante",
                                    "author": "Dante",
                                    "frontend_status": "ready",
                                    "frontend_notes": AUTHORITY_OBJECT_ROLLOUT_POLICY["dante"]["frontend_notes_override"],
                                    "work": None,
                                    "cantica": cantica,
                                    "canto": int(canto),
                                    "canto_label": canto_label,
                                    "line_info": line_info,
                                    "commentary_name": commentary_name,
                                    "commentary_abbr": build_commentary_abbr(commentary_name),
                                    "raw_mention": hit,
                                    "resolution_status": "resolved_author_only",
                                    "confidence": 0.78,
                                    "raw_passage": None,
                                    "commentary_record_id": build_supplemental_occurrence_id("dante", result_url, hit),
                                    "result_url": result_url,
                                    "mention_role": None,
                                    "mention_role_confidence": None,
                                    "sample_name": sample_name,
                                    "line_number": line_start,
                                }
                            )

                    for payload in mention_payloads:
                        commentary_rows.append(payload)
                        density_key = sample_name
                        density_entry = density_rows.setdefault(
                            density_key,
                            {
                                "author_id": "dante",
                                "author": "Dante",
                                "frontend_status": "ready",
                                "sample_name": sample_name,
                                "canto_label": canto_label,
                                "cantica": cantica,
                                "canto": int(canto),
                                "total_mentions": 0,
                            },
                        )
                        density_entry["total_mentions"] += 1

                        sample_entry = line_groups_by_sample.setdefault(
                            sample_name,
                            {
                                "sample_name": sample_name,
                                "canto_label": canto_label,
                                "cantica": cantica,
                                "canto": int(canto),
                                "total_mentions": 0,
                                "groups": {},
                            },
                        )
                        sample_entry["total_mentions"] += 1
                        line_key = f"{line_start or line_info}:{line_end or line_info}:{line_info or line_start or ''}"
                        group_entry = sample_entry["groups"].setdefault(
                            line_key,
                            {
                                "line_key": line_key,
                                "line_info": line_info,
                                "line_start": line_start,
                                "line_end": line_end,
                                "total_mentions": 0,
                                "commentary_count": 0,
                                "commentary_index": {},
                                "mention_role_breakdown": {},
                                "occurrences": [],
                            },
                        )
                        group_entry["total_mentions"] += 1
                        group_entry["occurrences"].append(payload)
                        commentary_bucket = group_entry["commentary_index"].setdefault(
                            commentary_name,
                            {
                                "abbr": build_commentary_abbr(commentary_name),
                                "commentary_name": commentary_name,
                                "mention_count": 0,
                            },
                        )
                        commentary_bucket["mention_count"] += 1
        except (OSError, UnicodeDecodeError, csv.Error):
            continue

    works_list = sorted(
        works_counter.values(),
        key=lambda item: (-item["count"], item["canonical_work"].casefold()),
    )
    commentary_samples = []
    for sample_name, sample in sorted(line_groups_by_sample.items(), key=lambda item: sample_id_sort_key(item[0])):
        groups = []
        for group in sorted(sample["groups"].values(), key=lambda item: (item.get("line_start") or 10**9, item.get("line_info") or "")):
            groups.append(
                {
                    **group,
                    "commentary_count": len(group["commentary_index"]),
                    "commentary_index": sorted(group["commentary_index"].values(), key=lambda item: (-item["mention_count"], item["commentary_name"].casefold())),
                }
            )
        commentary_samples.append(
            {
                "sample_name": sample_name,
                "canto_label": sample["canto_label"],
                "cantica": sample["cantica"],
                "canto": sample["canto"],
                "total_mentions": sample["total_mentions"],
                "line_group_count": len(groups),
                "line_groups": groups,
            }
        )

    authors_index_row = {
        "author_id": "dante",
        "canonical_name": "Dante",
        "aliases": DANTE_SUPPLEMENTAL_AUTHOR["aliases"],
        "total_mentions": len(commentary_rows),
        "total_work_mentions": sum(item["count"] for item in works_list),
        "frontend_status": "ready",
        "frontend_notes": AUTHORITY_OBJECT_ROLLOUT_POLICY["dante"]["frontend_notes_override"],
        "mention_role_breakdown": {},
    }
    works_row = {
        "author_id": "dante",
        "canonical_name": "Dante",
        "frontend_status": "ready",
        "frontend_notes": AUTHORITY_OBJECT_ROLLOUT_POLICY["dante"]["frontend_notes_override"],
        "total_work_mentions": sum(item["count"] for item in works_list),
        "works": works_list,
    }
    commentary_line_index_row = {
        "author_id": "dante",
        "canonical_name": "Dante",
        "frontend_status": "ready",
        "frontend_notes": AUTHORITY_OBJECT_ROLLOUT_POLICY["dante"]["frontend_notes_override"],
        "sample_count": len(commentary_samples),
        "samples": commentary_samples,
    }
    return {
        "authors_index_row": authors_index_row,
        "works_row": works_row,
        "density_rows": list(density_rows.values()),
        "occurrence_rows": commentary_rows,
        "commentary_line_index_row": commentary_line_index_row,
    }


def normalize_authority_text_aliases(author_id: str, aliases: list[str]) -> list[str]:
    policy = AUTHORITY_TEXT_MATCH_POLICY.get(author_id, {})
    learned = load_commentary_alias_learning().get(author_id, {})
    normalized = {
        re.sub(r"\s+", " ", normalize_semantic_text(alias)).strip()
        for alias in aliases
        if str(alias or "").strip()
    }
    normalized.update(policy.get("extra_aliases", []))
    normalized.update(learned.get("recommended_text_layer_exact_aliases", []))
    cleaned = []
    excluded = {
        re.sub(r"\s+", " ", normalize_semantic_text(alias)).strip()
        for alias in policy.get("exclude_aliases", [])
    }
    excluded.update(
        re.sub(r"\s+", " ", normalize_semantic_text(alias)).strip()
        for alias in learned.get("commentary_only_aliases", [])
    )
    for alias in normalized:
        alias = re.sub(r"\s+", " ", normalize_semantic_text(alias)).strip()
        if not alias or len(alias) < 4 or alias in excluded:
            continue
        cleaned.append(alias)
    return sorted(set(cleaned), key=lambda value: (len(value.split()), len(value), value), reverse=True)


def build_authority_text_occurrences(
    author_id: str,
    aliases: list[str],
    manifest_lookup: dict[str, dict],
) -> tuple[list[dict], dict[str, Any]]:
    canonical_cache = load_canonical_line_cache()
    learned = load_commentary_alias_learning().get(author_id, {})
    policy = AUTHORITY_TEXT_MATCH_POLICY.get(author_id, {})
    normalized_aliases = normalize_authority_text_aliases(author_id, aliases)
    fuzzy_roots = [
        re.sub(r"[^a-z]", "", normalize_semantic_text(root))
        for root in [
            *(policy.get("fuzzy_roots", []) or []),
            *(learned.get("recommended_text_layer_fuzzy_roots", []) or []),
        ]
        if str(root or "").strip()
    ]
    fuzzy_roots = sorted({root for root in fuzzy_roots if len(root) >= 4}, key=len, reverse=True)
    if not normalized_aliases:
        return [], {
            "status": "no_aliases_for_text_layer",
            "note": "当前对象没有可用于正文层 alias sweep 的 alias 集。",
            "alias_sweep": [],
            "fuzzy_roots": fuzzy_roots,
            "occurrence_total": 0,
            "canto_total": 0,
        }

    grouped: dict[str, dict[str, Any]] = {}
    for sample_id, lines in canonical_cache.items():
        cantica, canto = parse_sample_id(sample_id)
        if not cantica or canto is None:
            continue
        for line_number, line_text in sorted(lines.items()):
            normalized_line = re.sub(r"\s+", " ", normalize_semantic_text(line_text))
            matched_aliases = [
                alias
                for alias in normalized_aliases
                if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", normalized_line)
            ]
            compact_line = re.sub(r"[^a-z ]", "", normalized_line)
            matched_roots = [
                root
                for root in fuzzy_roots
                if re.search(rf"(?<![a-z]){re.escape(root)}[a-z]*(?![a-z])", compact_line)
            ]
            matched_aliases.extend(
                f"fuzzy:{root}"
                for root in matched_roots
                if f"fuzzy:{root}" not in matched_aliases
            )
            if not matched_aliases:
                continue

            entry = grouped.setdefault(
                sample_id,
                {
                    "sample_name": sample_id,
                    "canto_label": format_canto_label(sample_id),
                    "cantica": cantica.capitalize(),
                    "canto": canto,
                    "sample_available": sample_id in manifest_lookup,
                    "occurrence_count": 0,
                    "matched_aliases": set(),
                    "line_occurrences": [],
                },
            )
            entry["occurrence_count"] += 1
            entry["matched_aliases"].update(matched_aliases)
            entry["line_occurrences"].append(
                {
                    "line_number": line_number,
                    "line_label": f"Line {line_number}",
                    "line_text": line_text,
                    "matched_aliases": sorted(set(matched_aliases)),
                }
            )

    by_canto = []
    for sample_id in sorted(grouped, key=sample_id_sort_key):
        entry = grouped[sample_id]
        line_occurrences = sorted(entry["line_occurrences"], key=lambda item: item["line_number"])
        by_canto.append(
            {
                **entry,
                "matched_aliases": sorted(entry["matched_aliases"]),
                "line_occurrences": line_occurrences,
                "jump_line_number": line_occurrences[0]["line_number"] if line_occurrences else None,
            }
        )

    occurrence_total = sum(item["occurrence_count"] for item in by_canto)
    if by_canto:
        note = "正文层当前采用 direct alias sweep：先诚实回答这个对象在《神曲》字面层面出现在哪些 canto / line。"
        status = "direct_text_hits"
    else:
        note = "当前正文层没有命中可靠的 direct alias hit；这个对象更适合先从 commentary / authority layer 阅读。"
        status = "no_direct_text_hits"

    return by_canto, {
            "status": status,
            "note": note,
            "alias_sweep": normalized_aliases,
            "fuzzy_roots": fuzzy_roots,
            "occurrence_total": occurrence_total,
            "canto_total": len(by_canto),
        }


def build_authority_layer(manifest_entries: list[dict]) -> Path | None:
    authors_index_path = AUTHORITY_FRONTEND_READY_DIR / "authors_index.json"
    density_path = AUTHORITY_FRONTEND_READY_DIR / "author_density_by_canto.json"
    works_path = AUTHORITY_FRONTEND_READY_DIR / "author_works.json"
    occurrences_path = AUTHORITY_FRONTEND_READY_DIR / "author_occurrences_sample.json"
    commentary_line_index_path = AUTHORITY_FRONTEND_READY_DIR / "author_commentary_line_index.json"

    required_paths = [authors_index_path, density_path, works_path, occurrences_path, commentary_line_index_path]
    if not all(path.exists() for path in required_paths):
        return None

    authors_index = json.loads(authors_index_path.read_text(encoding="utf-8"))
    density = json.loads(density_path.read_text(encoding="utf-8"))
    works = json.loads(works_path.read_text(encoding="utf-8"))
    occurrences = json.loads(occurrences_path.read_text(encoding="utf-8"))
    commentary_line_index = json.loads(commentary_line_index_path.read_text(encoding="utf-8"))

    author_ids = {str(row.get("author_id") or "").strip() for row in authors_index.get("authors", [])}
    if "dante" not in author_ids:
        supplemental_dante = build_supplemental_dante_frontend_ready_payload()
        authors_index.setdefault("authors", []).append(supplemental_dante["authors_index_row"])
        works.setdefault("authors", []).append(supplemental_dante["works_row"])
        density.setdefault("rows", []).extend(supplemental_dante["density_rows"])
        occurrences.setdefault("occurrences", []).extend(supplemental_dante["occurrence_rows"])
        commentary_line_index.setdefault("authors", []).append(supplemental_dante["commentary_line_index_row"])

    works_trees = load_authority_works_trees()
    works_tree_shard_paths = write_demo_authority_works_tree_shards(works_trees)
    commentary_line_shard_paths = write_demo_authority_commentary_line_shards(commentary_line_index)

    manifest_lookup = {entry["id"]: entry for entry in manifest_entries}
    works_by_author = {item["author_id"]: item for item in works.get("authors", [])}
    density_by_author: dict[str, list[dict]] = defaultdict(list)
    for row in density.get("rows", []):
        density_by_author[row["author_id"]].append(row)

    occurrences_by_author: dict[str, list[dict]] = defaultdict(list)
    for row in occurrences.get("occurrences", []):
        sample_name = f"{str(row.get('cantica') or '').lower()}{row.get('canto')}"
        line_info = str(row.get("line_info") or "").strip()
        line_number = None
        if line_info:
            match = re.search(r"\d+", line_info)
            if match:
                line_number = int(match.group(0))

        row_entry = {
            **row,
            "sample_name": sample_name,
            "line_number": line_number,
            "sample_available": sample_name in manifest_lookup,
        }
        occurrences_by_author[row["author_id"]].append(row_entry)

    priority_authors = {"virgil", "aristotle", "paul_the_apostle", "psalmist", "augustine", "cicero", "statius", "dante"}
    author_entries = []
    for author in authors_index.get("authors", []):
        author_id = author["author_id"]
        rollout_policy = AUTHORITY_OBJECT_ROLLOUT_POLICY.get(author_id, {})
        work_entry = works_by_author.get(author_id, {})
        density_rows = sorted(
            density_by_author.get(author_id, []),
            key=lambda item: (-item.get("total_mentions", 0), *sample_id_sort_key(item.get("sample_name", ""))),
        )
        occurrence_rows = occurrences_by_author.get(author_id, [])
        text_occurrences_by_canto, text_layer_summary = build_authority_text_occurrences(
            author_id,
            author.get("aliases", []),
            manifest_lookup,
        )

        by_canto_density = [
            {
                "sample_name": row["sample_name"],
                "sample_id": row["sample_name"],
                "canto_label": row["canto_label"],
                "cantica": row["cantica"],
                "canto": row["canto"],
                "total_mentions": row["total_mentions"],
                "sample_available": row["sample_name"] in manifest_lookup,
                "selection_mode": "sample_only",
                "line_jump_supported": False,
                "jump_target": None,
                "preferred_next_step": "load_author_commentary_sample_shard",
                "commentary_line_index_path": f"./data/authority_commentary_lines/{author_id}/index.json",
                "commentary_line_sample_path": f"./data/authority_commentary_lines/{author_id}/{row['sample_name']}.json",
            }
            for row in density_rows[:12]
        ]
        rollout_scope_text_occurrences = text_occurrences_by_canto
        rollout_scope_text_occurrence_total = sum(row.get("occurrence_count", 0) for row in rollout_scope_text_occurrences)
        work_branch_bundle_payload = load_author_work_book_signal_bundle(author_id)
        aristotle_depth_audit = load_aristotle_de_anima_depth_audit() if author_id == "aristotle" else None
        paul_ambiguity_hold = load_paul_corinthians_ambiguity_hold() if author_id == "paul_the_apostle" else None
        virgil_backbone_hardening = load_virgil_aeneid_backbone_hardening() if author_id == "virgil" else None
        special_case_payload = None
        if author_id in {"virgil", "statius"}:
            if author_id == "statius":
                scope_text_rows = [
                    row
                    for row in text_occurrences_by_canto
                    if is_purgatorio_21_plus(row.get("sample_name", ""))
                ]
                scope_density_rows = [
                    row
                    for row in density_rows
                    if is_purgatorio_21_plus(row.get("sample_name", ""))
                ]
                scope_role_breakdown: dict[str, int] = {}
                for key in ("authority_citation", "character_mention", "ambiguous_author_character", "generic_mention"):
                    total = sum(int(row.get(key, 0) or 0) for row in scope_density_rows)
                    if total:
                        scope_role_breakdown[key] = total
                special_case_payload = {
                    "status": "candidate",
                    "scope_label": "Purgatorio 21+",
                    "explanation": "从 Purgatorio 21 起，Statius 不应被只读成被评论的 author；这里开始进入作者 / personaggio 双重身份的观察区，但当前系统仍以受控 shell 呈现，而不是直接复制 Virgilio 的完整 special-case 逻辑。",
                    "text_occurrences_by_canto": scope_text_rows[:8],
                    "commentary_occurrences_by_canto": scope_density_rows[:8],
                    "text_canto_total": len(scope_text_rows),
                    "commentary_canto_total": len(scope_density_rows),
                    "mention_role_breakdown": scope_role_breakdown,
                }
            else:
                scope_role_breakdown: dict[str, int] = {}
                for key in ("authority_citation", "character_mention", "ambiguous_author_character", "generic_mention"):
                    total = sum(int(row.get(key, 0) or 0) for row in density_rows)
                    if total:
                        scope_role_breakdown[key] = total
                special_case_payload = {
                    "status": "active",
                    "scope_label": "system-wide",
                    "explanation": "Virgilio 当前已经是受控 special-case：在正文里多为人物，在注释里则要区分 author citation / character mention / ambiguous mention。",
                    "text_occurrences_by_canto": text_occurrences_by_canto[:8],
                    "commentary_occurrences_by_canto": density_rows[:8],
                    "text_canto_total": text_layer_summary["canto_total"],
                    "commentary_canto_total": len(density_rows),
                    "mention_role_breakdown": scope_role_breakdown,
                }
        if virgil_backbone_hardening and work_branch_bundle_payload:
            enriched_works = []
            for work in work_branch_bundle_payload.get("works", []):
                enriched_work = dict(work)
                if work.get("canonical_work") == virgil_backbone_hardening.get("focus_work"):
                    enriched_work["backbone_hardening_status"] = virgil_backbone_hardening.get("current_status")
                    enriched_work["backbone_hardening_metrics"] = virgil_backbone_hardening.get("metrics", {})
                    enriched_work["backbone_candidates"] = virgil_backbone_hardening.get("aeneid_backbone", [])
                enriched_works.append(enriched_work)
            work_branch_bundle_payload = {
                **work_branch_bundle_payload,
                "works": enriched_works,
            }
        aristotle_wave3 = load_aristotle_wave3_book_spine() if author_id == "aristotle" else None
        aristotle_wave4 = load_aristotle_wave4_poetics_de_anima() if author_id == "aristotle" else None
        aristotle_wave5 = load_aristotle_wave5_metaphysics_nicomachean() if author_id == "aristotle" else None
        paul_wave3 = load_paul_wave3_epistle_spine() if author_id == "paul_the_apostle" else None
        paul_wave4 = load_paul_wave4_romans_second_corinthians() if author_id == "paul_the_apostle" else None
        paul_wave5 = load_paul_wave5_first_corinthians_ambiguous() if author_id == "paul_the_apostle" else None
        aristotle_wave3_map = {
            row.get("canonical_work"): row
            for row in (aristotle_wave3 or {}).get("focus_works", [])
            if row.get("canonical_work")
        }
        aristotle_wave4_map = {
            row.get("canonical_work"): row
            for row in (aristotle_wave4 or {}).get("focus_works", [])
            if row.get("canonical_work")
        }
        aristotle_wave5_map = {
            row.get("canonical_work"): row
            for row in (aristotle_wave5 or {}).get("focus_works", [])
            if row.get("canonical_work")
        }
        paul_wave3_map = {
            row.get("canonical_work"): row
            for row in (paul_wave3 or {}).get("focus_works", [])
            if row.get("canonical_work")
        }
        paul_wave4_map = {
            row.get("canonical_work"): row
            for row in (paul_wave4 or {}).get("focus_works", [])
            if row.get("canonical_work")
        }
        paul_wave5_map = {
            row.get("canonical_work"): row
            for row in (paul_wave5 or {}).get("focus_works", [])
            if row.get("canonical_work")
        }

        author_entries.append(
            {
                "author_id": author_id,
                "canonical_name": author["canonical_name"],
                "display_name": authority_display_name(author_id, author["canonical_name"]),
                "public_slug_it": authority_public_slug(author_id, author["canonical_name"]),
                "aliases": author.get("aliases", []),
                "frontend_status": rollout_policy.get(
                    "frontend_status_override",
                    author.get("frontend_status", "review_first"),
                ),
                "frontend_notes": rollout_policy.get("frontend_notes_override", author.get("frontend_notes")),
                "priority_author": author_id in priority_authors,
                "object_rollout_status": rollout_policy.get("object_rollout_status", author.get("frontend_status", "review_first")),
                "entry_mode": rollout_policy.get("entry_mode", "author_commentary_entry"),
                "total_mentions": author.get("total_mentions", 0),
                "total_work_mentions": author.get("total_work_mentions", 0),
                "mention_role_breakdown": author.get("mention_role_breakdown", {}),
                "text_layer_status": text_layer_summary["status"],
                "text_layer_note": text_layer_summary["note"],
                "text_layer_alias_sweep": text_layer_summary["alias_sweep"],
                "text_occurrence_total": text_layer_summary["occurrence_total"],
                "text_canto_total": text_layer_summary["canto_total"],
                "text_occurrences_by_canto": [
                    {
                        **row,
                        "sample_id": row.get("sample_name"),
                        "jump_target": build_authority_jump_target(
                            row.get("sample_name"),
                            infer_authority_jump_line_number(row.get("jump_line_number")),
                        ),
                    }
                    for row in text_occurrences_by_canto
                ],
                "rollout_scope": "all_100_cantos_current",
                "rollout_scope_text_layer_status": (
                    "in_scope_direct_text_hits" if rollout_scope_text_occurrence_total else "no_in_scope_direct_text_hits"
                ),
                "rollout_scope_text_canto_total": len(rollout_scope_text_occurrences),
                "rollout_scope_text_occurrence_total": rollout_scope_text_occurrence_total,
                "rollout_scope_text_occurrences_by_canto": [
                    {
                        **row,
                        "sample_id": row.get("sample_name"),
                        "jump_target": build_authority_jump_target(
                            row.get("sample_name"),
                            infer_authority_jump_line_number(row.get("jump_line_number")),
                        ),
                    }
                    for row in rollout_scope_text_occurrences
                ],
                "by_canto_density_meta": {
                    "selection_mode": "sample_only",
                    "line_jump_supported": False,
                    "recommended_flow": "choose sample first, then load authority_commentary_lines/<author>/<sample>.json",
                },
                "by_canto_density": by_canto_density,
                "works": work_entry.get("works", [])[:10],
                "works_layer_mode": rollout_policy.get(
                    "works_layer_mode",
                    "works_tree" if works_trees.get(author_id) else ("flat_work_overview" if work_entry.get("works") else "no_work_layer"),
                ),
                "works_layer_note": rollout_policy.get(
                    "works_layer_note",
                    "当前对象没有 works tree；如需进入 works 层，应先以保守 overview 形式呈现。"
                    if work_entry.get("works") and not works_trees.get(author_id)
                    else None,
                ),
                "caveat_flags": rollout_policy.get("caveat_flags", []),
                "work_branch_bundle": work_branch_bundle_payload,
                "special_case": special_case_payload,
                "occurrences": [
                    annotate_authority_occurrence(item)
                    for item in occurrence_rows[:40]
                ],
                "commentary_line_index": (
                    {
                        "available": True,
                        "author_id": author_id,
                        "path": commentary_line_shard_paths.get(author_id, {}).get("path"),
                        "index_path": commentary_line_shard_paths.get(author_id, {}).get("index_path"),
                        "sample_count": next(
                            (
                                item.get("sample_count", 0)
                                for item in commentary_line_index.get("authors", [])
                                if item.get("author_id") == author_id
                            ),
                            0,
                        ),
                    }
                    if commentary_line_shard_paths.get(author_id, {}).get("path")
                    else None
                ),
                "works_tree": (
                    {
                        "available": True,
                        "author_id": author_id,
                        "object_family": works_trees[author_id].get("object_family"),
                        "scope": works_trees[author_id].get("scope"),
                        "policy_note": works_trees[author_id].get("policy_note"),
                        "display_contract": works_trees[author_id].get("display_contract"),
                        "branch_mode": "evidence_backed_work_branches",
                        "visible_children": [
                            "structured_locator_tree",
                            "prose_locator_tree",
                            "work_only_occurrences",
                            "pseudo_passage_occurrences",
                        ],
                        "path": works_tree_shard_paths.get(author_id),
                        "wave4_focus_work_count": len((aristotle_wave4 or {}).get("focus_works", []))
                        or len((paul_wave4 or {}).get("focus_works", [])),
                        "wave4_focus_bundle": aristotle_wave4 or paul_wave4,
                        "wave5_focus_work_count": len((aristotle_wave5 or {}).get("focus_works", []))
                        or len((paul_wave5 or {}).get("focus_works", [])),
                        "wave5_focus_bundle": aristotle_wave5 or paul_wave5,
                        "depth_risk_meta": (
                            {
                                "available": True,
                                "risk_stage": aristotle_depth_audit.get("risk_stage"),
                                "focus_work": aristotle_depth_audit.get("focus_work"),
                                "current_status": aristotle_depth_audit.get("current_status"),
                                "recommended_next_step": aristotle_depth_audit.get("recommended_next_step"),
                            }
                            if aristotle_depth_audit
                            else (
                                {
                                    "available": True,
                                    "risk_stage": paul_ambiguity_hold.get("risk_stage"),
                                    "focus_work": paul_ambiguity_hold.get("focus_work"),
                                    "current_status": paul_ambiguity_hold.get("current_status"),
                                    "recommended_next_step": paul_ambiguity_hold.get("recommended_next_step"),
                                }
                                if paul_ambiguity_hold
                                else None
                            )
                        ),
                        "works": [
                            (
                                {
                                "canonical_work": work.get("canonical_work"),
                                "total_mentions": work.get("total_mentions", 0),
                                "locator_bucket_counts": work.get("locator_bucket_counts", {}),
                                }
                                | (
                                    {
                                        "depth_risk_status": aristotle_depth_audit.get("current_status"),
                                        "depth_risk_metrics": aristotle_depth_audit.get("metrics", {}),
                                    }
                                    if aristotle_depth_audit and work.get("canonical_work") == aristotle_depth_audit.get("focus_work")
                                    else {}
                                )
                                | (
                                    {
                                        "ambiguity_hold_status": paul_ambiguity_hold.get("current_status"),
                                        "ambiguity_hold_metrics": paul_ambiguity_hold.get("metrics", {}),
                                    }
                                    if paul_ambiguity_hold and work.get("canonical_work") == paul_ambiguity_hold.get("focus_work")
                                    else {}
                                )
                                | (
                                    {
                                        "wave3_spine_status": aristotle_wave3_map.get(work.get("canonical_work"), {}).get("wave3_status"),
                                        "wave3_visible_book_labels": aristotle_wave3_map.get(work.get("canonical_work"), {}).get("visible_book_labels", []),
                                        "wave3_structured_branch_labels": aristotle_wave3_map.get(work.get("canonical_work"), {}).get("structured_branch_labels", []),
                                    }
                                    if work.get("canonical_work") in aristotle_wave3_map
                                    else {}
                                )
                                | (
                                    {
                                        "wave3_spine_status": paul_wave3_map.get(work.get("canonical_work"), {}).get("wave3_status"),
                                        "wave3_structured_chapters": paul_wave3_map.get(work.get("canonical_work"), {}).get("structured_chapters", []),
                                        "wave3_prose_chapters": paul_wave3_map.get(work.get("canonical_work"), {}).get("prose_chapters", []),
                                    }
                                    if work.get("canonical_work") in paul_wave3_map
                                    else {}
                                )
                                | (
                                    {
                                        "wave4_completion_status": aristotle_wave4_map.get(work.get("canonical_work"), {}).get("wave4_status"),
                                        "wave4_focus_metrics": aristotle_wave4_map.get(work.get("canonical_work"), {}).get("metrics", {}),
                                        "wave4_primary_spine": aristotle_wave4_map.get(work.get("canonical_work"), {}).get("primary_spine", []),
                                        "wave4_visible_labels": aristotle_wave4_map.get(work.get("canonical_work"), {}).get("visible_labels", []),
                                    }
                                    if work.get("canonical_work") in aristotle_wave4_map
                                    else {}
                                )
                                | (
                                    {
                                        "wave5_completion_status": aristotle_wave5_map.get(work.get("canonical_work"), {}).get("wave5_status"),
                                        "wave5_focus_metrics": aristotle_wave5_map.get(work.get("canonical_work"), {}).get("metrics", {}),
                                        "wave5_primary_spine": aristotle_wave5_map.get(work.get("canonical_work"), {}).get("primary_spine", []),
                                        "wave5_visible_labels": aristotle_wave5_map.get(work.get("canonical_work"), {}).get("visible_labels", []),
                                    }
                                    if work.get("canonical_work") in aristotle_wave5_map
                                    else {}
                                )
                                | (
                                    {
                                        "wave4_completion_status": paul_wave4_map.get(work.get("canonical_work"), {}).get("wave4_status"),
                                        "wave4_focus_metrics": paul_wave4_map.get(work.get("canonical_work"), {}).get("metrics", {}),
                                        "wave4_primary_spine": paul_wave4_map.get(work.get("canonical_work"), {}).get("primary_spine", []),
                                        "wave4_visible_labels": (
                                            paul_wave4_map.get(work.get("canonical_work"), {}).get("structured_labels", [])
                                            or paul_wave4_map.get(work.get("canonical_work"), {}).get("visible_labels", [])
                                        ),
                                    }
                                    if work.get("canonical_work") in paul_wave4_map
                                    else {}
                                )
                                | (
                                    {
                                        "wave5_completion_status": paul_wave5_map.get(work.get("canonical_work"), {}).get("wave5_status"),
                                        "wave5_focus_metrics": paul_wave5_map.get(work.get("canonical_work"), {}).get("metrics", {}),
                                        "wave5_primary_spine": paul_wave5_map.get(work.get("canonical_work"), {}).get("primary_spine", []),
                                        "wave5_visible_labels": (
                                            paul_wave5_map.get(work.get("canonical_work"), {}).get("structured_labels", [])
                                            or paul_wave5_map.get(work.get("canonical_work"), {}).get("visible_labels", [])
                                        ),
                                    }
                                    if work.get("canonical_work") in paul_wave5_map
                                    else {}
                                )
                            )
                            for work in works_trees[author_id].get("works", [])
                        ],
                    }
                    if works_trees.get(author_id)
                    else None
                ),
            }
        )

    author_entries.sort(
        key=lambda item: (
            not item["priority_author"],
            item["frontend_status"] not in {"ready", "ready_with_caveat"},
            item["canonical_name"].lower(),
        )
    )

    flat_object_shard_meta = write_demo_authority_flat_object_shards(author_entries, works_by_author, occurrences_by_author)
    for author in author_entries:
        author_id = author.get("author_id")
        if author_id in flat_object_shard_meta:
            author["flat_work_object"] = flat_object_shard_meta[author_id]
            rollout_policy = AUTHORITY_OBJECT_ROLLOUT_POLICY.get(author_id, {})
            flat_rollout_kind = flat_object_shard_meta[author_id].get("rollout_kind")
            policy_frontend_status = rollout_policy.get("frontend_status_override")
            policy_rollout_status = rollout_policy.get("object_rollout_status")
            if flat_rollout_kind == "partial_flat_work_object":
                author["frontend_status"] = policy_frontend_status or "partial"
                author["object_rollout_status"] = policy_rollout_status or author["frontend_status"] or "partial"
                if rollout_policy.get("frontend_notes_override"):
                    author["frontend_notes"] = rollout_policy["frontend_notes_override"]
            elif flat_rollout_kind == "stable_flat_work_object" and author.get("frontend_status") == "review_first":
                author["frontend_status"] = policy_frontend_status or "ready"
                author["object_rollout_status"] = policy_rollout_status or author["frontend_status"] or "ready"
            if rollout_policy.get("works_layer_note"):
                author["works_layer_note"] = rollout_policy["works_layer_note"]

    partial_tree_shard_meta = write_demo_authority_partial_tree_shards()
    for author in author_entries:
        author_id = author.get("author_id")
        if author_id in partial_tree_shard_meta:
            author["partial_tree_object"] = partial_tree_shard_meta[author_id]

    special_object_shard_meta = write_demo_authority_special_object_shards(author_entries)
    for author in author_entries:
        author_id = author.get("author_id")
        if author_id in special_object_shard_meta:
            author["special_case_object"] = special_object_shard_meta[author_id]

    occurrence_sample_shard_meta = write_demo_authority_occurrence_sample_shards(author_entries)
    for author in author_entries:
        author_id = author.get("author_id")
        if author_id in occurrence_sample_shard_meta:
            author["occurrence_sample_object"] = occurrence_sample_shard_meta[author_id]

    for author in author_entries:
        promote_author_ready_status(author)

    authority_notes = {
        "lens_scope": "100-canto frontend authority lens, with commedia-text-first reading order",
        "frontend_ready_source": str(AUTHORITY_FRONTEND_READY_DIR.relative_to(ROOT)),
        "honesty_boundary": "not all authors are equally stable; frontend_status and notes should be read directly",
        "reading_order": [
            "commedia_text_layer",
            "commentary_authority_layer",
            "works_passages_occurrences_drilldown",
        ],
        "works_tree_scope": "Authority works tree currently supports Aristotle, Paul, and Psalmist across the 100-sample demo shell; work tree node types follow WORK_TREE_POLICY_V1, but locator semantics remain object-sensitive.",
        "split_v1_available": {
            "authority_index_path": "./data/authority_index.json",
            "authority_author_detail_dir": "./data/authority_authors",
            "authority_flat_object_dir": "./data/authority_flat_objects",
            "authority_partial_tree_dir": "./data/authority_partial_trees",
            "authority_special_object_dir": "./data/authority_special_objects",
            "authority_occurrence_sample_dir": "./data/authority_occurrence_samples",
            "commentary_line_split_mode": "author/sample",
        },
    }
    write_authority_split_v1_files(authority_notes, author_entries)

    authority_layer = {
        "schema_version": "v4",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "notes": authority_notes,
        "authors": author_entries,
    }

    output_path = DEMO_DATA_DIR / "authority_layer.json"
    output_path.write_text(json.dumps(authority_layer, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def iter_authority_occurrences(
    authority_layer: dict[str, Any],
    works_tree_payloads: dict[str, dict[str, Any]] | None = None,
) -> Iterable[dict[str, Any]]:
    for author in authority_layer.get("authors", []):
        for occurrence in iter_author_occurrences(author, works_tree_payloads):
            yield occurrence


def iter_author_occurrences(
    author: dict[str, Any],
    works_tree_payloads: dict[str, dict[str, Any]] | None = None,
) -> Iterable[dict[str, Any]]:
    def walk_tree_nodes(nodes: list[dict[str, Any]]) -> Iterable[dict[str, Any]]:
        for node in nodes or []:
            for occurrence in node.get("occurrences", []) or []:
                yield occurrence
            for child in node.get("children", []) or []:
                for occurrence in child.get("occurrences", []) or []:
                    yield occurrence

    for occurrence in author.get("occurrences", []) or []:
        yield occurrence

    works_tree = None
    if works_tree_payloads is not None:
        works_tree = works_tree_payloads.get(author.get("author_id"))
    if works_tree is None:
        works_tree = author.get("works_tree") or {}
    for work in works_tree.get("works", []) or []:
        for occurrence in work.get("work_only_occurrences", []) or []:
            yield occurrence
        for occurrence in work.get("pseudo_passage_occurrences", []) or []:
            yield occurrence
        for occurrence in walk_tree_nodes(work.get("structured_locator_tree", []) or []):
            yield occurrence
        for occurrence in walk_tree_nodes(work.get("prose_locator_tree", []) or []):
            yield occurrence


def build_authority_commentary_sources() -> Path | None:
    if not (DEMO_DATA_DIR / "authority_layer.json").exists():
        return None

    authority_layer = json.loads((DEMO_DATA_DIR / "authority_layer.json").read_text(encoding="utf-8"))
    works_tree_payloads = load_authority_works_trees()
    sources_by_sample: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    missing: list[dict[str, Any]] = []
    all_occurrences = list(iter_authority_occurrences(authority_layer, works_tree_payloads))
    all_occurrences.extend(iter_frontend_ready_commentary_line_occurrences())

    for occurrence in all_occurrences:
        result_url = str(occurrence.get("result_url") or "").strip()
        if not result_url:
            continue
        sample_name = occurrence.get("sample_name") or infer_authority_sample_name(
            occurrence.get("cantica"),
            occurrence.get("canto"),
        )
        if not sample_name:
            missing.append(
                {
                    "result_url": result_url,
                    "reason": "sample_name_unavailable",
                    "commentary_name": occurrence.get("commentary_name"),
                }
            )
            continue
        if result_url in sources_by_sample.get(sample_name, {}):
            continue

        sample_rows = load_authority_source_rows_for_sample(sample_name)
        source_row = sample_rows.get(result_url)
        if not source_row:
            missing.append(
                {
                    "result_url": result_url,
                    "sample_name": sample_name,
                    "reason": (
                        "records_text_full_timeout"
                        if sample_name in AUTHORITY_SOURCE_TIMEOUT_SAMPLES
                        else "result_url_not_found_in_records_text_full"
                    ),
                    "commentary_name": occurrence.get("commentary_name"),
                    "line_info": occurrence.get("line_info"),
                }
            )
            continue

        sources_by_sample[sample_name][result_url] = source_row

    ensure_dir(AUTHORITY_COMMENTARY_SOURCES_DIR)
    by_sample_manifest: dict[str, dict[str, Any]] = {}
    total_sources = 0
    for sample_name, rows in sorted(sources_by_sample.items()):
        shard_path = AUTHORITY_COMMENTARY_SOURCES_DIR / f"{sample_name}.json"
        shard_payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "sample_name": sample_name,
            "source_count": len(rows),
            "by_result_url": rows,
        }
        shard_path.write_text(json.dumps(shard_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        by_sample_manifest[sample_name] = {
            "sample_name": sample_name,
            "path": f"./data/authority_commentary_sources/{sample_name}.json",
            "source_count": len(rows),
        }
        total_sources += len(rows)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "local per-canto records_text_full csv files",
        "notes": {
            "purpose": "authority occurrence -> local commentary source bridge for opening original commentary text with highlight",
            "key": "result_url",
            "loading_model": "sharded_by_sample",
        },
        "source_count": total_sources,
        "missing_count": len(missing),
        "timeout_sample_names": sorted(AUTHORITY_SOURCE_TIMEOUT_SAMPLES),
        "by_sample": by_sample_manifest,
        "missing_examples": missing[:120],
    }
    AUTHORITY_COMMENTARY_SOURCES_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return AUTHORITY_COMMENTARY_SOURCES_PATH


def build_authority_navigation_manifest() -> Path | None:
    authority_layer_path = DEMO_DATA_DIR / "authority_layer.json"
    if not authority_layer_path.exists() or not AUTHORITY_COMMENTARY_SOURCES_PATH.exists():
        return None

    authority_layer = json.loads(authority_layer_path.read_text(encoding="utf-8"))
    commentary_sources = json.loads(AUTHORITY_COMMENTARY_SOURCES_PATH.read_text(encoding="utf-8"))
    sample_manifest = commentary_sources.get("by_sample", {})
    works_tree_payloads = load_authority_works_trees()
    author_rows = []

    commentary_line_index_path = AUTHORITY_FRONTEND_READY_DIR / "author_commentary_line_index.json"
    commentary_line_payload = (
        json.loads(commentary_line_index_path.read_text(encoding="utf-8"))
        if commentary_line_index_path.exists()
        else {"authors": []}
    )
    commentary_line_by_author = {
        row.get("author_id"): row
        for row in commentary_line_payload.get("authors", [])
        if row.get("author_id")
    }

    for author in authority_layer.get("authors", []):
        occurrences = list(iter_author_occurrences(author, works_tree_payloads))
        line_payload = commentary_line_by_author.get(author.get("author_id")) or {}
        for sample in line_payload.get("samples", []):
            for group in sample.get("line_groups", []):
                occurrences.extend(group.get("occurrences", []) or [])
        unique_urls = {
            str(occurrence.get("result_url") or "").strip()
            for occurrence in occurrences
            if str(occurrence.get("result_url") or "").strip()
        }
        linked_urls = set()
        for occurrence in occurrences:
            result_url = str(occurrence.get("result_url") or "").strip()
            sample_name = occurrence.get("sample_name") or infer_authority_sample_name(
                occurrence.get("cantica"),
                occurrence.get("canto"),
            )
            if not result_url or not sample_name or sample_name not in sample_manifest:
                continue
            sample_rows = load_authority_source_rows_for_sample(sample_name)
            if result_url in sample_rows:
                linked_urls.add(result_url)
        source_coverage_ratio = (len(linked_urls) / len(unique_urls)) if unique_urls else 0.0

        works_tree = author.get("works_tree") or {}
        works_layer_mode = author.get("works_layer_mode") or "no_work_layer"
        if works_tree.get("works"):
            expansion_mode = "works_tree"
        elif works_layer_mode == "flat_work_overview":
            expansion_mode = "flat_work_overview"
        else:
            expansion_mode = "author_commentary_only"

        frontend_status = author.get("frontend_status") or "review_first"
        if frontend_status in {"ready", "ready_with_caveat"} and source_coverage_ratio >= 0.99:
            navigation_status = "ready"
        elif frontend_status == "partial" and source_coverage_ratio >= 0.99:
            navigation_status = "partial_but_navigable"
        else:
            navigation_status = "review_first"

        author_rows.append(
            {
                "author_id": author.get("author_id"),
                "canonical_name": author.get("canonical_name"),
                "display_name": author.get("display_name") or authority_display_name(author.get("author_id"), author.get("canonical_name")),
                "public_slug_it": author.get("public_slug_it") or authority_public_slug(author.get("author_id"), author.get("canonical_name")),
                "frontend_status": frontend_status,
                "object_rollout_status": author.get("object_rollout_status"),
                "text_layer_status": author.get("text_layer_status"),
                "works_layer_mode": works_layer_mode,
                "has_works_tree": bool(works_tree.get("works")),
                "occurrence_count": len(occurrences),
                "unique_result_url_count": len(unique_urls),
                "linked_result_url_count": len(linked_urls),
                "source_coverage_ratio": round(source_coverage_ratio, 4),
                "supports_highlighted_commentary_open": bool(linked_urls),
                "navigation_status": navigation_status,
                "recommended_expansion_mode": expansion_mode,
                "caveat_flags": author.get("caveat_flags") or [],
                "notes": author.get("frontend_notes") or author.get("works_layer_note"),
            }
        )

    author_rows.sort(
        key=lambda row: (
            row["navigation_status"] not in {"ready", "partial_but_navigable"},
            row["recommended_expansion_mode"] != "works_tree",
            row["canonical_name"].lower(),
        )
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "authority_layer.json + authority_commentary_sources.json",
        "notes": {
            "purpose": "authority citation navigation readiness for expanding commentary-source highlighting beyond the first calibration objects",
            "reading_order": [
                "commedia_text_layer",
                "commentary_authority_layer",
                "works_tree_or_flat_work_overview",
                "occurrence_to_commentary_source_open",
            ],
            "honesty_boundary": "ready here means the current citation navigation contract is reusable; it does not mean the author already has a full works tree.",
        },
        "safe_to_extend_now": [
            row["canonical_name"]
            for row in author_rows
            if row["navigation_status"] in {"ready", "partial_but_navigable"}
        ],
        "hold_for_review_first": [
            row["canonical_name"]
            for row in author_rows
            if row["navigation_status"] == "review_first"
        ],
        "authors": author_rows,
    }
    AUTHORITY_NAVIGATION_MANIFEST_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return AUTHORITY_NAVIGATION_MANIFEST_PATH


def repair_generated_poem_text_outputs(samples: Iterable[str] | None = None) -> list[str]:
    target_samples = {sample for sample in samples} if samples is not None else None
    canonical_cache = load_canonical_line_cache()
    repaired_samples = []
    top_commentary_terms_note = TOP_COMMENTARY_TERMS_NOTE

    for overview_path in sorted(DEMO_DATA_DIR.glob("*/overview.json")):
        sample = overview_path.parent.name
        if target_samples is not None and sample not in target_samples:
            continue

        canonical_lines = canonical_cache.get(sample)
        if not canonical_lines:
            continue

        overview = json.loads(overview_path.read_text(encoding="utf-8"))
        updated_lines = []
        changed = False
        record_store_payload = None
        record_store_lookup = None

        for line in overview.get("lines", []):
            line_number = int(line.get("line_number"))
            canonical_text = canonical_lines.get(line_number)
            if not canonical_text:
                changed = True
                continue

            updated_line = dict(line)
            if updated_line.get("line_text") != canonical_text:
                updated_line["line_text"] = canonical_text
                changed = True
            if "dante_loci" in updated_line:
                loci = build_dante_loci(sample, line_number, canonical_text)
                if updated_line.get("dante_loci") != loci:
                    updated_line["dante_loci"] = loci
                    changed = True
            updated_lines.append(updated_line)

        if len(updated_lines) != len(overview.get("lines", [])):
            changed = True

        if changed:
            overview["lines"] = updated_lines
            overview["line_count"] = len(updated_lines)
            overview_path.write_text(json.dumps(overview, ensure_ascii=False, indent=2), encoding="utf-8")

        lines_dir = overview_path.parent / "lines"
        if lines_dir.exists():
            record_store_path = overview_path.parent / "records" / "store.json"
            for line_file in sorted(lines_dir.glob("*.json")):
                line_number = int(line_file.stem)
                canonical_text = canonical_lines.get(line_number)
                if not canonical_text:
                    line_file.unlink(missing_ok=True)
                    changed = True
                    continue

                payload = json.loads(line_file.read_text(encoding="utf-8"))
                payload_changed = False
                if payload.get("line_text") != canonical_text:
                    payload["line_text"] = canonical_text
                    payload_changed = True
                loci = build_dante_loci(sample, line_number, canonical_text)
                if payload.get("dante_loci") != loci:
                    payload["dante_loci"] = loci
                    payload_changed = True
                if record_store_path.exists():
                    if record_store_payload is None:
                        record_store_payload = json.loads(record_store_path.read_text(encoding="utf-8"))
                        record_store_raw = record_store_payload.get("records") or {}
                        if isinstance(record_store_raw, dict):
                            record_store_lookup = {
                                record_id: record
                                for record_id, record in record_store_raw.items()
                                if isinstance(record, dict)
                            }
                        else:
                            record_store_lookup = {
                                record["id"]: record
                                for record in record_store_raw
                                if isinstance(record, dict) and record.get("id")
                            }
                    line_records = [
                        record_store_lookup[record_id]
                        for record_id in (payload.get("record_ids") or [])
                        if record_id in record_store_lookup
                    ]
                    top_commentary_terms = build_top_commentary_terms(line_records)
                    if payload.get("top_commentary_terms") != top_commentary_terms:
                        payload["top_commentary_terms"] = top_commentary_terms
                        payload_changed = True
                    if payload.get("top_commentary_terms_note") != top_commentary_terms_note:
                        payload["top_commentary_terms_note"] = top_commentary_terms_note
                        payload_changed = True
                if payload_changed:
                    line_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                    changed = True

        if changed:
            repaired_samples.append(sample)

    return repaired_samples


def build_dante_word_loci_shards() -> Path | None:
    if not DANTE_WORD_LOCI_LAYER_PATH.exists():
        return None

    payload = json.loads(DANTE_WORD_LOCI_LAYER_PATH.read_text(encoding="utf-8"))
    word_profiles = payload.get("word_profiles") or {}
    if not isinstance(word_profiles, dict) or not word_profiles:
        return None

    if DANTE_WORD_LOCI_SHARD_DIR.exists():
        shutil.rmtree(DANTE_WORD_LOCI_SHARD_DIR)

    words_dir = DANTE_WORD_LOCI_SHARD_DIR / "words"
    ensure_dir(words_dir)

    index_profiles = {}
    for normalized_form, profile in sorted(word_profiles.items()):
        if int(profile.get("occurrence_count", 0) or 0) <= 1:
            continue
        filtered_concurrence = [
            item
            for item in (profile.get("weighted_micro_context_concurrence", {}).get("top_terms") or [])
            if is_meaningful_concurrence_term(item.get("word"), focus_word=normalized_form)
        ]
        filtered_profile = {
            **profile,
            "weighted_micro_context_concurrence": {
                **(profile.get("weighted_micro_context_concurrence") or {}),
                "top_terms": filtered_concurrence,
                "filtering_note": "Stopwords, function words, discourse residue, and other low-semantic-weight concurrence terms are removed in the demo bridge.",
            },
        }
        filename = build_word_profile_filename(normalized_form)
        profile_path = words_dir / filename
        profile_path.write_text(
            dump_compact_json(filtered_profile),
            encoding="utf-8",
        )
        index_profiles[normalized_form] = {
            "normalized_form": normalized_form,
            "display_form": filtered_profile.get("display_form") or normalized_form,
            "intratext_occurrence_count": filtered_profile.get("intratext_occurrence_count"),
            "occurrence_count": filtered_profile.get("occurrence_count", 0),
            "profile_path": f"./data/dante_word_loci/words/{filename}",
        }

    index_payload = {
        "schema_version": "dante_word_loci_frontend_index_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "notes": payload.get("notes", []),
        "source_summary": {
            **(payload.get("source_summary") or {}),
            "profile_count": len(index_profiles),
            "loading_mode": "word-profile shards loaded on demand from the workbench",
        },
        "source_paths": {
            **(payload.get("source_paths") or {}),
            "monolith_layer": str(DANTE_WORD_LOCI_LAYER_PATH.relative_to(ROOT)),
        },
        "profiles": index_profiles,
    }

    index_path = DANTE_WORD_LOCI_SHARD_DIR / "index.json"
    index_path.write_text(dump_compact_json(index_payload), encoding="utf-8")
    return index_path


def write_overnight_qa_report(inventory: list[dict], processed_summaries: list[dict]) -> Path:
    inventory_by_sample = {item["sample"]: item for item in inventory}
    excluded_inventory = [item for item in inventory if item.get("exclusion_reason")]
    timeout_inventory = [item for item in excluded_inventory if str(item.get("exclusion_reason") or "").startswith("source_csv_timeout:")]
    excluded_lines = [
        f"- `{item['sample']}`：{item['exclusion_reason']}"
        for item in excluded_inventory
    ] or ["- 无"]
    timeout_lines = [
        f"- `{item['sample']}`：`{item['cantica']} {item['canto']}` · `{item['exclusion_reason']}`"
        for item in timeout_inventory
    ] or ["- 无"]
    total_lines = sum(item["line_count"] for item in processed_summaries)
    total_fields = sum(item["field_count"] for item in processed_summaries)
    total_reviews = sum(item["review_needed_count"] for item in processed_summaries)
    total_label_changes = sum(item["label_changed_count"] for item in processed_summaries)
    reference_basis_counts: Counter[str] = Counter()
    qa_flag_counts: Counter[str] = Counter()

    for item in processed_summaries:
        reference_basis_counts.update(item["reference_basis_counts"])
        qa_flag_counts.update(item["qa_flag_counts"])

    sample_lines = []
    output_lines = []
    profiling_lines = []
    for item in processed_summaries:
        inventory_item = inventory_by_sample[item["sample"]]
        sample_lines.extend(
            [
                f"### {item['title']} (`{item['sample']}`)",
                f"- 真实文件状态：`{inventory_item['success_count']}/{inventory_item['row_count']}` success，`line_info` 完整，`line_span` 完整。",
                f"- 语义场生成：`{item['line_count']}` lines，`{item['field_count']}` fields，`{item['stable_line_count']}` 条 lines 无 review flags。",
                f"- QA：`label_changed={item['label_changed_count']}`，`review_needed={item['review_needed_count']}`，最多 review 的 line 是 `Line {item['max_review_line']}`（`{item['max_review_count']}` fields）。",
                "",
            ]
        )
        output_lines.extend(
            [
                f"- `{item['sample']}`",
                f"  - overview: `{item['overview_path']}`",
                f"  - txt: `{item['report_paths']['v2_txt']}`",
                f"  - log: `{item['report_paths']['log']}`",
                f"  - html: `{item['report_paths']['html']}`",
            ]
        )
        profiling_lines.append(
            f"- `{item['sample']}`: review_needed `{item['review_needed_count']}`, label_changed `{item['label_changed_count']}`, reference bases {item['reference_basis_counts']}"
        )

    worst_review = sorted(processed_summaries, key=lambda item: (-item["review_needed_count"], item["sample"]))[:5]
    most_stable = sorted(
        processed_summaries,
        key=lambda item: (
            -(item["stable_line_count"] / max(item["line_count"], 1)),
            item["review_needed_count"],
            item["sample"],
        ),
    )[:5]

    report = [
        "# Semantic Fields V1 Overnight QA",
        "",
        "## 今晚实际处理到的 canto 清单",
        "",
        f"- 共处理 `{len(processed_summaries)}` 个 canto / sample。",
        f"- 总 lines：`{total_lines}`",
        f"- 总 semantic fields：`{total_fields}`",
        f"- 明确排除的未完整 canto：`{', '.join(item['sample'] for item in excluded_inventory) if excluded_inventory else '无'}`",
        "",
        *sample_lines,
        "## 明确排除的样本",
        "",
        *excluded_lines,
        "",
        "## records_text_full 超时样本",
        "",
        f"- timeout sample 数：`{len(timeout_inventory)}`",
        *timeout_lines,
        "",
        "## 每个 canto 的输出文件路径",
        "",
        *output_lines,
        "",
        "## schema v1 批量落地情况",
        "",
        "- `semantic_fields.schema_version` 已批量写入为 `v1`。",
        "- 每个 field 现已稳定包含：`internal_label`、`display_label`、`representative_terms`、`record_count`、`unique_commentator_count`、`record_ids`、`qa`、`cross_line_references`。",
        "- 前端读取层保持兼容：优先读 v1 字段，但不要求推倒旧接口。",
        "",
        "## `reference_basis` 字段批量补入情况",
        "",
        "- 已成功批量补入。",
        f"- 当前 reference basis 统计：`{dict(reference_basis_counts)}`",
        "- 今晚仍然只把旧 refer 逻辑明确标注为 `shared_terms`，没有扩成更复杂的新系统。",
        "",
        "## QA / Profiling 核心发现",
        "",
        f"- `label_changed` 总数：`{total_label_changes}`",
        f"- `review_needed` 总数：`{total_reviews}`",
        f"- 最常见 QA flags：`{dict(qa_flag_counts.most_common(10))}`",
        "",
        "### 哪些 canto / lines 的 field label 更稳定",
        "",
        *[
            f"- `{item['sample']}`：稳定 lines ` {item['stable_line_count']}/{item['line_count']} `，review_needed `{item['review_needed_count']}`。"
            for item in most_stable
        ],
        "",
        "### 哪些 canto / lines 的 QA flags 最多",
        "",
        *[
            f"- `{item['sample']}`：review_needed `{item['review_needed_count']}`，最密集 line 是 `Line {item['max_review_line']}`（`{item['max_review_count']}` fields）。"
            for item in worst_review
        ],
        "",
        "### 最常见的问题类型",
        "",
        "- `label_changed` 说明结构本身稳定，但 display label 逻辑仍然会频繁替换内部锚点词。",
        "- `not_line_anchored` 说明某些 cluster 已经长出来，但展示标签仍未充分贴紧该行 Dante wording 或 line signature。",
        "- 这些目前更像系统性的 label logic 问题，不是 schema 问题。",
        "",
        "### cross_line_references 当前表现",
        "",
        "- 目前几乎全部还是 lexical / heuristic refer。",
        "- 但因为 `reference_basis` 已入 schema，后续要把 refer 升级为 `semantic_similarity` 或 `hybrid` 时，不必再改 field 结构。",
        "",
        "## 哪些问题是局部问题，哪些是系统性问题",
        "",
        "- 局部问题：个别 canto 或个别 line 的具体 display label 不够 scholar-facing。",
        "- 系统性问题：label logic 还会经常从 token-like seed 跳到不够贴线的替代词；这会在多 canto 上重复出现。",
        "- 结构性问题方面，今晚没有看到 schema 在多 canto 上崩塌或需要大改的迹象。",
        "",
        "## schema v1 是否已经表现出结构稳定性",
        "",
        "- 是，已经表现出结构稳定性。",
        f"- 同一套字段可以在当前这 `{len(processed_summaries)}` 个 eligible canto / sample 上批量落地，不需要为不同 canto 单独改对象结构。",
        "- 目前需要继续迭代的是 label logic 和 cluster quality，而不是 schema 本身。",
        "",
        "## 如果明天继续，最该优先修什么",
        "",
        "优先级建议：",
        "- 先修 `label logic`：因为这已经是最明显、最系统性的审阅噪音来源。",
        "- 再看 `cluster quality`：主要是让某些 field 的语义边界更稳。",
        "- `reference typing` 结构已经占好位，明天不必急着大动。",
        "- 今晚不建议再动 schema v1 本身。",
        "",
        "## 结论",
        "",
        "- schema v1 现在已经足够承受继续扩大到更多 canto。",
        "- 明天如果继续扩，不应再返工 field 对象结构，而应把精力集中在 display label 逻辑、review 触发规则和 cluster 质量上。",
    ]

    output_path = ROOT / "SEMANTIC_FIELDS_V1_OVERNIGHT_QA.md"
    output_path.write_text("\n".join(report) + "\n", encoding="utf-8")
    return output_path


def load_existing_processed_summary(sample: str) -> dict:
    sample_dir = DEMO_DATA_DIR / sample
    overview_path = sample_dir / "overview.json"
    if not overview_path.exists():
        raise FileNotFoundError(f"Missing generated overview for {sample}: {overview_path}")

    overview = json.loads(overview_path.read_text(encoding="utf-8"))
    line_dir = sample_dir / "lines"
    record_store_dir = sample_dir / "records"
    record_store_path = record_store_dir / "store.json"
    record_store_index_path = record_store_dir / "index.json"
    record_fulltext_path = record_store_dir / "fulltext.json"
    line_files = sorted(line_dir.glob("*.json")) if line_dir.exists() else []
    line_data_available = bool(line_files) and len(line_files) == overview["line_count"]
    record_store_available = record_store_path.exists() and record_store_index_path.exists()
    record_fulltext_available = record_fulltext_path.exists()
    total_fields = 0
    label_changed_count = 0
    review_needed_count = 0
    stable_lines = 0
    total_cross_refs = 0
    max_review_line = None
    max_review_count = -1
    qa_flag_counts: Counter[str] = Counter()
    reference_basis_counts: Counter[str] = Counter()

    for line_file in line_files:
        payload = json.loads(line_file.read_text(encoding="utf-8"))
        fields = payload.get("semantic_fields", {}).get("fields", [])
        line_review_count = 0
        for field in fields:
            total_fields += 1
            qa = field.get("qa") or {}
            flags = qa.get("flags") or []
            qa_flag_counts.update(flags)
            if "label_changed" in flags:
                label_changed_count += 1
            if qa.get("review_needed"):
                review_needed_count += 1
                line_review_count += 1
            for refer in field.get("cross_line_references", []):
                total_cross_refs += 1
                reference_basis_counts.update([refer.get("reference_basis", "unknown")])
        if fields and line_review_count == 0:
            stable_lines += 1
        if line_review_count > max_review_count:
            max_review_count = line_review_count
            max_review_line = payload.get("line_number")

    return {
        "sample": sample,
        "title": overview["title"],
        "cantica": overview["cantica"],
        "canto": overview["canto"],
        "record_count": overview["record_count"],
        "line_count": overview["line_count"],
        "unique_commentary_count": overview["unique_commentary_count"],
        "field_count": total_fields,
        "stable_line_count": stable_lines,
        "label_changed_count": label_changed_count,
        "review_needed_count": review_needed_count,
        "qa_flag_counts": dict(qa_flag_counts),
        "reference_basis_counts": dict(reference_basis_counts),
        "cross_reference_count": total_cross_refs,
        "max_review_line": max_review_line,
        "max_review_count": max_review_count,
        "overview_path": str(overview_path),
        "line_data_available": line_data_available,
        "line_json_count": len(line_files),
        "record_store_available": record_store_available,
        "record_store_path": str(record_store_path) if record_store_path.exists() else None,
        "record_store_index_path": str(record_store_index_path) if record_store_index_path.exists() else None,
        "record_fulltext_available": record_fulltext_available,
        "record_fulltext_path": str(record_fulltext_path) if record_fulltext_path.exists() else None,
        "report_paths": {
            "txt": str(REPORTS_DIR / f"{sample}_local_semantic_fields.txt"),
            "v2_txt": str(REPORTS_DIR / f"{sample}_local_semantic_fields_v2.txt"),
            "log": str(REPORTS_DIR / f"{sample}_local_semantic_fields_v2.log"),
            "html": str(REPORTS_DIR / f"{sample}_local_semantic_fields.html"),
            "json": str(REPORTS_DIR / f"{sample}_local_semantic_fields.json"),
        },
    }


def main() -> None:
    warnings.filterwarnings("ignore", category=RuntimeWarning, module=r"sklearn\.utils\.extmath")
    warnings.filterwarnings("ignore", category=ConvergenceWarning, module=r"sklearn")
    args = parse_args()
    switches = resolve_build_switches(args)
    samples, inventory = resolve_samples(args.sample.lower())
    repaired_samples: list[str] = []
    if not switches["skip_line_level"]:
        repaired_samples = repair_generated_poem_text_outputs(samples)
    missing_generated_samples = []
    if args.report_only or switches["skip_line_level"]:
        processed_summaries = []
        for sample in samples:
            overview_path = DEMO_DATA_DIR / sample / "overview.json"
            if not overview_path.exists():
                missing_generated_samples.append(sample)
                continue
            processed_summaries.append(load_existing_processed_summary(sample))
    else:
        commentary_meta = load_commentary_metadata()
        processed = [process_sample(sample, commentary_meta) for sample in samples]
        processed_summaries = [item["summary"] for item in processed]
    manifest_entries = build_manifest_entries(processed_summaries, inventory)

    manifest = {
        "default_sample": "inferno1" if any(item["id"] == "inferno1" for item in manifest_entries) else manifest_entries[0]["id"],
        "samples": manifest_entries,
    }
    manifest_path = DEMO_DATA_DIR / "manifest.json"
    ensure_dir(DEMO_DATA_DIR)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    research_layer_path = None if switches["skip_research_layer"] else build_research_layer(manifest_entries)
    authority_layer_path = None if switches["skip_authority"] else build_authority_layer(manifest_entries)
    authority_commentary_sources_path = (
        build_authority_commentary_sources() if authority_layer_path and not switches["skip_authority"] else None
    )
    authority_navigation_manifest_path = (
        build_authority_navigation_manifest() if authority_commentary_sources_path else None
    )
    dante_word_loci_index_path = None if switches["skip_word_loci"] else build_dante_word_loci_shards()

    output_path = write_overnight_qa_report(inventory, processed_summaries)
    if args.report_only:
        print(f"Refreshed manifest and overnight QA for {len(processed_summaries)} existing sample(s).")
        if missing_generated_samples:
            print(
                "Mounted shell/coverage-only entries without full generated outputs for: "
                f"{', '.join(missing_generated_samples)}"
            )
    else:
        print(
            f"Built demo dataset for {len(samples)} sample(s): "
            f"{', '.join(samples[:5])}{'…' if len(samples) > 5 else ''}"
        )
    if switches["skip_line_level"]:
        print("Preserved line-level layer: reused existing overview.json + lines/*.json outputs.")
    if repaired_samples:
        print(f"Repaired canonical line text outputs for {len(repaired_samples)} sample(s).")
    if research_layer_path:
        print(f"Wrote research layer data: {research_layer_path}")
    else:
        print("Skipped research layer rebuild.")
    if authority_layer_path:
        print(f"Wrote authority layer data: {authority_layer_path}")
    elif switches["skip_authority"]:
        print("Skipped authority layer rebuild.")
    if authority_commentary_sources_path:
        print(f"Wrote authority commentary sources: {authority_commentary_sources_path}")
    if authority_navigation_manifest_path:
        print(f"Wrote authority navigation manifest: {authority_navigation_manifest_path}")
    if dante_word_loci_index_path:
        print(f"Wrote Dante word-loci shard index: {dante_word_loci_index_path}")
    elif switches["skip_word_loci"]:
        print("Skipped Dante word-loci shard rebuild.")
    if args.build_profile != "full":
        print(f"Build profile: {args.build_profile}")
    print(f"Wrote overnight QA report: {output_path}")


if __name__ == "__main__":
    main()
