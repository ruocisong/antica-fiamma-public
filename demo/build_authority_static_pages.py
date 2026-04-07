#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
DATA_DIR = FRONTEND_DIR / "data"
AUTORE_DIR = FRONTEND_DIR / "autore"
PERSONAGGIO_DIR = FRONTEND_DIR / "personaggio"

AUTHORITY_LAYER_PATH = DATA_DIR / "authority_layer.json"
AUTHORITY_SOURCES_PATH = DATA_DIR / "authority_commentary_sources.json"
AUTHORITY_HIGHLIGHT_PATH = DATA_DIR / "authority_highlight_lexicon.json"
AUTHORITY_PERSONAGGIO_ALIAS_ATLAS_PATH = DATA_DIR / "authority_personaggio_alias_atlas.json"
AUTHORITY_PERSONAGGIO_FULL_SCAN_PATH = DATA_DIR / "authority_personaggio_full_scan.json"
VIRGILIO_APPENDIX_LEDGER_PATH = DATA_DIR / "virgilio_appendix_ledger.json"
PERSONAGGIO_TAIL_LEDGERS_PATH = DATA_DIR / "personaggio_tail_ledgers.json"


DISPLAY_NAME_OVERRIDES = {
    "aristotle": "Aristotele",
    "paul_the_apostle": "Paolo Apostolo",
    "psalmist": "Salmista",
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
}

WORK_DISPLAY_OVERRIDES = {
    ("aristotle", "Nicomachean Ethics"): "Etica Nicomachea",
    ("aristotle", "Metaphysics"): "Metafisica",
    ("aristotle", "Physics"): "Fisica",
    ("aristotle", "Poetics"): "Poetica",
    ("augustine", "City of God"): "De civitate Dei",
    ("augustine", "Confessions"): "Confessiones",
    ("boethius", "Consolation of Philosophy"): "De consolatione Philosophiae",
    ("cicero", "Tusculan Disputations"): "Tusculanae Disputationes",
    ("paul_the_apostle", "Epistle to the Romans"): "Lettera ai Romani",
    ("paul_the_apostle", "First Corinthians"): "Prima lettera ai Corinzi",
    ("psalmist", "Psalms"): "Salmi",
    ("statius", "Thebaid"): "Thebais",
    ("statius", "Achilleid"): "Achilleis",
    ("virgil", "Aeneid"): "Aeneis",
    ("virgil", "Georgics"): "Georgica",
    ("virgil", "Eclogues"): "Eclogae",
}

PERSONAGGIO_PAGES = [
    {
        "slug": "paolo_apostolo",
        "title": "Paolo Apostolo",
        "lead_en": (
            "Paolo belongs here because Dantean commentary does not only cite him as apostolic authority; it also recalls him as a charged Paradiso-facing figure, often through devotional surfaces like vas d'elezione."
        ),
        "lead_bi": (
            "`Paolo Apostolo` 属于这里，因为 Dante commentary 接纳他的方式不只是使徒 authority，也会把他当成带着 Paradiso 强度的角色来召回，常常还经过 `vas d'elezione` 这样的 devotional surface。"
        ),
        "why_en": (
            "The autore room tracks epistolary works and apostolic authority pressure. The personaggio page tracks Paolo as a visible apostolic presence in the poem's celestial imagination."
        ),
        "why_bi": (
            "autore room 追踪的是书信作品和使徒 authority 压力；personaggio 页追踪的是 Paolo 如何作为诗中天界想象里的使徒性在场被看见。"
        ),
        "state_en": "This page lets Paolo stay more than a citation-source and gives devotional aliases like vas d'elezione a proper figure-level room.",
        "state_bi": "这页让 Paolo 不再只是 citation-source，也给 `vas d'elezione` 这类 devotional alias 一个真正的 figure-level 房间。",
        "author_slug": "paolo_apostolo",
    },
    {
        "slug": "virgilio",
        "title": "Virgilio",
        "lead_en": (
            "This personaggio page for Virgilio is now part of the completed character district. Its point is architectural: "
            "Virgilio as a character is not the same object as Virgilio as an authority-author."
        ),
        "lead_bi": (
            "这张 `Virgilio` personaggio 页面现在已经属于完成建制后的角色区。它最重要的作用是把结构先立起来："
            "作为角色的 Virgilio，和作为 authority-author 的 Virgilio，不是同一个对象。"
        ),
        "why_en": (
            "The character Virgilio belongs to narrative movement, scene logic, guidance, speech, and dramatic presence. "
            "The author Virgilio belongs to cited work, commentary authority, textual inheritance, and reception."
        ),
        "why_bi": (
            "角色层的 Virgilio 属于叙事运动、场景关系、引导、发言和戏剧在场；"
            "author 层的 Virgilio 属于 works、citation、authority、接受史和 commentary tradition。"
        ),
        "state_en": "The current build only has the second one properly grown. So this page stays a placeholder, while the author page already exists at autore/virgilio.html.",
        "state_bi": "当前 build 在 author 那边长得更厚，但这里已经是明确的角色页；成熟的 autore 页面也已经在 autore/virgilio.html。",
        "author_slug": "virgilio",
    },
    {
        "slug": "stazio",
        "title": "Stazio",
        "lead_en": (
            "Stazio belongs in the personaggio layer because the Comedy receives him not only as an auctor but as a "
            "walking dramatic presence inside Purgatorio."
        ),
        "lead_bi": (
            "`Stazio` 应当进入 personaggio 层，因为《神曲》接纳他的方式不只是 auctor，"
            "更是 Purgatorio 里有动作、有对话、会同行的戏剧在场。"
        ),
        "why_en": (
            "The author Statius belongs to authority history; the character Stazio belongs to encounter, conversion, "
            "companionship, and narrative motion."
        ),
        "why_bi": (
            "作为 author 的 Statius 属于 authority 历史；作为角色的 Stazio 属于遭遇、归信、同行和叙事运动。"
        ),
        "state_en": "This page marks that dual role directly instead of forcing everything back into the autore room.",
        "state_bi": "这页直接承认它的双重身份，而不是把一切都硬塞回 autore 壳子里。",
        "author_slug": "stazio",
    },
    {
        "slug": "tommaso_daquino",
        "title": "Tommaso d'Aquino",
        "lead_en": (
            "Tommaso belongs here because in Paradiso he is not only cited as a theologian but staged as a speaking "
            "figure inside the poem."
        ),
        "lead_bi": (
            "`Tommaso d'Aquino` 属于这里，因为在 Paradiso 里他不只是被引用的神学 author，"
            "而是诗中真正发言的角色。"
        ),
        "why_en": (
            "The autore room tracks works and authority pressure. The personaggio page tracks the fact that he enters "
            "Dante's heaven as a dramatic theological presence."
        ),
        "why_bi": (
            "autore room 追踪的是作品和 authority 压力；personaggio 页追踪的是他如何作为天堂中的神学性在场进入 Dante 的场景。"
        ),
        "state_en": "This layer should stay character-first even when the autore side remains much thicker.",
        "state_bi": "即便 autore 那边更厚，这一层也该保持角色优先。",
        "author_slug": "tommaso_daquino",
    },
    {
        "slug": "san_pietro",
        "title": "San Pietro",
        "lead_en": (
            "San Pietro belongs here because in Paradiso he is not just apostolic authority residue: he is a figure "
            "with voice, judgment, and scene-presence."
        ),
        "lead_bi": (
            "`San Pietro` 属于这里，因为在 Paradiso 里他不只是使徒 authority 的残余，"
            "而是有声音、有判断、有场景重量的角色。"
        ),
        "why_en": (
            "The autore room tracks commentary authority usage. The personaggio page tracks Peter as a speaking "
            "apostolic presence inside the poem."
        ),
        "why_bi": (
            "autore room 追踪的是 commentary 里的 authority 使用；personaggio 页追踪的是诗中会说话的使徒性在场。"
        ),
        "state_en": "This page marks the fact that Peter belongs to both theological authority and Paradise drama.",
        "state_bi": "这页承认 Pietro 同时属于神学 authority 和 Paradiso 的戏剧结构。",
        "author_slug": "san_pietro",
    },
    {
        "slug": "salomone",
        "title": "Salomone",
        "lead_en": (
            "Salomone belongs here because Dante does not receive him only as scriptural wisdom but as a figure "
            "inside the celestial scene."
        ),
        "lead_bi": (
            "`Salomone` 属于这里，因为 Dante 接纳他的方式不只是圣经智慧来源，"
            "也是天界场景中的角色。"
        ),
        "why_en": (
            "The authority room is about cited sapiential weight; the personaggio page is about dramatic placement and "
            "Paradiso voice."
        ),
        "why_bi": (
            "authority room 关心的是被引用的智慧权重；personaggio 页关心的是戏剧位置和 Paradiso 中的发言。"
        ),
        "state_en": "This page keeps Salomone visible as a character-level room, not only as a scriptural authority label.",
        "state_bi": "这页让 Salomone 以角色层房间的方式被看见，而不只是一个 scriptural authority 标签。",
        "author_slug": "salomone",
    },
    {
        "slug": "aristotele",
        "title": "Aristotele",
        "lead_en": (
            "Aristotele belongs here because the Comedy also stages him in Limbo as a visible figure, not only as the "
            "deepest authority author."
        ),
        "lead_bi": (
            "`Aristotele` 属于这里，因为《神曲》也把他作为 Limbo 中可见的角色摆出来，而不只是最深的 authority author。"
        ),
        "why_en": (
            "The autore room tracks works, citations, and tradition. The personaggio page tracks Aristotle as the master "
            "standing inside Dante's first-circle scene."
        ),
        "why_bi": (
            "autore room 追踪作品、引用和传统；personaggio 页追踪的是 Aristotle 作为第一圈场景中的可见人物。"
        ),
        "state_en": "This page keeps the Limbo figure visible instead of letting author-gravity swallow the dramatic presence.",
        "state_bi": "这页让 Limbo 里的 Aristotle 保持可见，而不是让 author 重力把戏剧在场全部吞掉。",
        "author_slug": "aristotele",
    },
    {
        "slug": "omero",
        "title": "Omero",
        "lead_en": (
            "Omero belongs here because the Comedy receives him both as epic auctor and as one of the visible figures of the bella scola."
        ),
        "lead_bi": (
            "`Omero` 属于这里，因为《神曲》接纳他的方式既是 epic auctor，也是 bella scola 中可见的人物之一。"
        ),
        "why_en": (
            "The autore page holds Homeric authority traffic; the personaggio page holds his dramatic place in the Limbo procession."
        ),
        "why_bi": (
            "autore 页承载的是 Homeric authority traffic；personaggio 页承载的是他在 Limbo 行列中的戏剧位置。"
        ),
        "state_en": "This page treats Omero as a figure in scene, not only as an inherited source.",
        "state_bi": "这页把 Omero 视作场景中的人物，而不只是被继承的来源。",
        "author_slug": "omero",
    },
    {
        "slug": "orazio",
        "title": "Orazio",
        "lead_en": (
            "Orazio belongs here because he also appears inside the bella scola as a visible poetic figure."
        ),
        "lead_bi": (
            "`Orazio` 属于这里，因为他也作为 bella scola 中可见的诗人角色出现。"
        ),
        "why_en": (
            "The autore room tracks Horatian authority; the personaggio page tracks his scene-presence inside Limbo."
        ),
        "why_bi": (
            "autore room 追踪 Horatian authority；personaggio 页追踪的是他在 Limbo 场景中的在场。"
        ),
        "state_en": "This page lets Orazio remain part of Dante's staged poetic company.",
        "state_bi": "这页让 Orazio 保持为 Dante 所搭建的诗人同行场景中的一员。",
        "author_slug": "orazio",
    },
    {
        "slug": "ovidio",
        "title": "Ovidio",
        "lead_en": (
            "Ovidio belongs here because he appears in the poem not only as a textual source but as a visible poetic companion in Limbo."
        ),
        "lead_bi": (
            "`Ovidio` 属于这里，因为他在诗里不只是文本来源，也是 Limbo 中可见的诗人同伴。"
        ),
        "why_en": (
            "The author page holds Ovidian work lanes; the personaggio page holds his place in the dramatic school of poets."
        ),
        "why_bi": (
            "author 页承载的是 Ovidian 作品入口；personaggio 页承载的是他在诗人学校中的戏剧位置。"
        ),
        "state_en": "This page keeps that scene-memory from collapsing back into source-only reading.",
        "state_bi": "这页避免这种场景记忆重新塌回纯 source 阅读。",
        "author_slug": "ovidio",
    },
    {
        "slug": "lucano",
        "title": "Lucano",
        "lead_en": (
            "Lucano belongs here because he too crosses from authority memory into visible presence inside the poetic company of Limbo."
        ),
        "lead_bi": (
            "`Lucano` 属于这里，因为他也从 authority 记忆跨进了 Limbo 诗人同盟里的可见在场。"
        ),
        "why_en": (
            "The autore room tracks Lucan authority; the personaggio page tracks his appearance in the visible poetic lineup."
        ),
        "why_bi": (
            "autore room 追踪 Lucan authority；personaggio 页追踪的是他在可见诗人队列里的出现。"
        ),
        "state_en": "This page keeps Lucano available as a figure in Dante's poetic staging.",
        "state_bi": "这页让 Lucano 作为 Dante 诗性布景中的人物继续可见。",
        "author_slug": "lucano",
    },
    {
        "slug": "platone",
        "title": "Platone",
        "lead_en": (
            "Platone belongs here because the poem also receives him as a visible philosopher among Limbo's gathered figures."
        ),
        "lead_bi": (
            "`Platone` 属于这里，因为诗中也把他作为 Limbo 聚集人群中的可见哲学家来接纳。"
        ),
        "why_en": (
            "The autore room tracks Platonic textual authority; the personaggio page tracks his place inside Dante's philosophical scene-memory."
        ),
        "why_bi": (
            "autore room 追踪 Platonic 文本 authority；personaggio 页追踪的是他在 Dante 哲学场景记忆中的位置。"
        ),
        "state_en": "This page keeps Platone available as a visible figure, not only as an abstract authority source.",
        "state_bi": "这页让 Platone 作为可见人物继续存在，而不只是抽象 authority 来源。",
        "author_slug": "platone",
    },
    {
        "slug": "seneca",
        "title": "Seneca",
        "lead_en": (
            "Seneca belongs here because the Comedy does not only quote him; it also locates him among the visible wise figures of Limbo."
        ),
        "lead_bi": (
            "`Seneca` 属于这里，因为《神曲》不只引用他，也把他安放在 Limbo 可见的智者群体中。"
        ),
        "why_en": (
            "The autore room tracks Stoic and dramatic authority traffic; the personaggio page tracks Seneca as visible sage-presence."
        ),
        "why_bi": (
            "autore room 追踪的是斯多亚与戏剧 authority 流；personaggio 页追踪的是 Seneca 作为可见智者的在场。"
        ),
        "state_en": "This page keeps Seneca from being reduced to quotation-only presence.",
        "state_bi": "这页避免把 Seneca 缩成纯引用存在。",
        "author_slug": "seneca",
    },
    {
        "slug": "averroe",
        "title": "Averroè",
        "lead_en": (
            "Averroè belongs here because Dante also makes him visible in Limbo as more than a commentary authority name."
        ),
        "lead_bi": (
            "`Averroè` 属于这里，因为 Dante 也让他在 Limbo 里以可见人物出现，而不只是 commentary authority 的名字。"
        ),
        "why_en": (
            "The autore room tracks commentator and philosophical authority usage; the personaggio page tracks the visible figure in Dante's first-circle assembly."
        ),
        "why_bi": (
            "autore room 追踪评论家与哲学 authority 的使用；personaggio 页追踪的是 Dante 第一圈聚会里的可见人物。"
        ),
        "state_en": "This page keeps Averroè in view as both authority and figure.",
        "state_bi": "这页让 Averroè 同时作为 authority 和人物被看见。",
        "author_slug": "averroe",
    },
    {
        "slug": "avicenna",
        "title": "Avicenna",
        "lead_en": (
            "Avicenna belongs here because he too appears inside Limbo's visible order of philosophical and scientific figures."
        ),
        "lead_bi": (
            "`Avicenna` 属于这里，因为他同样出现在 Limbo 那个可见的哲学与科学人物秩序里。"
        ),
        "why_en": (
            "The autore room tracks medical-philosophical authority usage; the personaggio page tracks his visible place in the scene."
        ),
        "why_bi": (
            "autore room 追踪 medical-philosophical authority 的使用；personaggio 页追踪的是他在场景中的可见位置。"
        ),
        "state_en": "This page keeps Avicenna from remaining only a thin authority room.",
        "state_bi": "这页避免让 Avicenna 只停留在一个偏薄的 authority room 里。",
        "author_slug": "avicenna",
    },
    {
        "slug": "tolomeo",
        "title": "Tolomeo",
        "lead_en": (
            "Tolomeo belongs here because Dante names him not only as scientific authority but as a visible figure among Limbo's learned assembly."
        ),
        "lead_bi": (
            "`Tolomeo` 属于这里，因为 Dante 提到他时，不只是 scientific authority，也是 Limbo 学者群中的可见人物。"
        ),
        "why_en": (
            "The autore room tracks astronomical authority traffic; the personaggio page tracks his visible place in the first-circle gathering."
        ),
        "why_bi": (
            "autore room 追踪 astronomical authority 流；personaggio 页追踪的是他在第一圈聚会中的可见位置。"
        ),
        "state_en": "This page keeps Tolomeo available as a figure of scene-memory, not only as a scientific citation shell.",
        "state_bi": "这页让 Tolomeo 作为场景记忆中的人物可见，而不只是 scientific citation shell。",
        "author_slug": "tolomeo",
    },
    {
        "slug": "ulisse",
        "title": "Ulisse",
        "lead_en": (
            "This personaggio page for Ulisse now belongs to the completed character district. "
            "The current residual evidence points more toward character-presence and reused narrative exemplum than toward a new authority-author room."
        ),
        "lead_bi": (
            "这张 `Ulisse` personaggio 页面现在已经属于完成建制后的角色区。"
            "当前残余证据更像角色在场和叙事 exemplum 的重复调用，而不是一个新的 authority-author room。"
        ),
        "why_en": (
            "Ulisse currently reads less like an external auctor and more like a narrative figure whose name keeps resurfacing inside commentary explanation."
        ),
        "why_bi": (
            "当前的 Ulisse 更不像外部 auctor，而更像一个不断在 commentary 解释里回返的叙事角色。"
        ),
        "state_en": "This layer is still thin, but it is already a real character-space for Ulisse rather than a deferred note.",
        "state_bi": "这一层现在仍然很薄，但它已经是 Ulisse 的真实角色空间，而不再只是延后的备注。",
        "author_slug": None,
    },
    {
        "slug": "sordello",
        "title": "Sordello",
        "lead_en": (
            "This personaggio page for Sordello now belongs to the completed character district. "
            "The current residual lane looks less like a new authority author and more like a figure repeatedly invoked through Dantean scene memory."
        ),
        "lead_bi": (
            "这张 `Sordello` personaggio 页面现在已经属于完成建制后的角色区。"
            "当前残余 lane 更不像一个新 authority author，而更像经由 Dante 场景记忆不断被召回的角色。"
        ),
        "why_en": (
            "Sordello currently enters through commentary recall of dramatic placement and scene function rather than through a stable author-work room."
        ),
        "why_bi": (
            "当前的 Sordello 更多是通过 commentary 对戏剧位置和场景功能的回忆进入，而不是通过一个稳定的 author-work room 进入。"
        ),
        "state_en": "This page is already a real personaggio room, even if the dramatic object around Sordello still needs to grow thicker.",
        "state_bi": "这页已经是一个真实的 personaggio 房间，哪怕围绕 Sordello 的戏剧对象还需要继续长厚。",
        "author_slug": None,
    },
]

PERSONAGGIO_SCENE_NOTES = {
    "paolo_apostolo": {
        "scene_note_en": "Apostolic figure-presence recalled through Pauline authority, devotional naming, and celestial intensity rather than through bare epistolary citation alone.",
        "scene_note_bi": "经由 Pauline authority、devotional naming 和天界强度被召回的使徒性人物，而不只是裸的书信引用。",
        "canto_note_en": "Main dramatic corridor: Paradiso 24 to 26, with alias spillover such as vas d'elezione.",
        "canto_note_bi": "主要戏剧走廊：Paradiso 24 到 26，并带有 `vas d'elezione` 这类 alias spillover。",
        "scene_pressure_en": "Paolo's room matters because devotional naming, apostolic authority, and celestial exam-pressure all converge on one figure. He is not only quoted from afar; he reenters the poem as a charged apostolic presence.",
        "scene_pressure_bi": "Paolo 这间房的重要性在于：devotional naming、使徒 authority 和天界 exam-pressure 全部压在同一个 figure 上。他不只是被远距离引用，而是作为一个带电的使徒 presence 重新进入诗里。",
        "canto_threads_en": [
            "Paradiso 24: Paolo's room opens under apostolic testing, where doctrine and celestial examination already make him more than a scriptural source.",
            "Paradiso 25: hope and apostolic succession keep Paolo inside the living structure of Paradiso rather than in a remote epistolary archive.",
            "Paradiso 26: devotional spillover such as vas d'elezione proves that the figure survives in commentary memory as more than a bare authority room.",
        ],
        "canto_threads_bi": [
            "Paradiso 24：Paolo 的房间在 apostolic testing 下打开，教义与天界 exam 一开始就让他不只是 scriptural source。",
            "Paradiso 25：hope 与 apostolic succession 让 Paolo 留在 Paradiso 的活结构里，而不是远处的 epistolary archive 里。",
            "Paradiso 26：`vas d'elezione` 这类 devotional spillover 证明这个 figure 在 commentary memory 里不只是一个 authority room。",
        ],
    },
    "virgilio": {
        "scene_note_en": "Primary guide-presence across Inferno and Purgatorio; the role is dramatic, vocal, and mobile rather than merely memorial.",
        "scene_note_bi": "贯穿 Inferno 与 Purgatorio 的主导引者；它的角色是戏剧性的、会发言的、会移动的，而不只是记忆里的名字。",
        "canto_note_en": "Main dramatic corridor: Inferno 1 through Purgatorio 30.",
        "canto_note_bi": "主要戏剧走廊：Inferno 1 一直到 Purgatorio 30。",
        "scene_pressure_en": "Virgilio's room has to hold voice, guidance, bodily care, and interpretive authority all at once. The point is not only that he leads; it is that Dante keeps making the guide emotionally and dramatically present.",
        "scene_pressure_bi": "Virgilio 这间房必须同时扣住声音、引导、身体性的照护和解释 authority。重点不只是他会带路，而是 Dante 一直让这个 guide 在情感上、戏剧上都真实在场。",
        "canto_threads_en": [
            "Inferno 1: the room begins with rescue, naming, and directional authority all fused into one guide-presence.",
            "Inferno 2 to 34: Virgilio thickens through repeated vocatives, interpretive speech, bodily protection, and tactical motion.",
            "Purgatorio 1 to 27: the guide remains active as voice, pedagogy, and companionship rather than shrinking into a mere memory of authorship.",
            "Purgatorio 30: the room changes register precisely because his disappearance hurts like the loss of a living presence, not the fading of a citation-source.",
        ],
        "canto_threads_bi": [
            "Inferno 1：这间房从救援、命名和方向 authority 融成一个 guide-presence 开始。",
            "Inferno 2 到 34：Virgilio 经由反复的 vocative、解释性发言、身体性保护和战术移动不断变厚。",
            "Purgatorio 1 到 27：这个 guide 继续作为声音、教导和陪伴活着，而不是缩回 author 的回忆。",
            "Purgatorio 30：这间房之所以会突然变调，正是因为他的消失像活人离场，而不是 citation-source 退场。",
        ],
    },
    "stazio": {
        "scene_note_en": "Companion-presence in late Purgatorio, especially where conversion, poetry, and companionship meet.",
        "scene_note_bi": "Purgatorio 后段的同行在场，尤其是在归信、诗学与陪伴交叉的位置。",
        "canto_note_en": "Main dramatic corridor: Purgatorio 21 onward.",
        "canto_note_bi": "主要戏剧走廊：Purgatorio 21 之后。",
        "scene_pressure_en": "Stazio's room matters because Dante turns an authority residue into a living companion. Conversion, gratitude, poetic filiation, and scene-motion all lock onto the same figure.",
        "scene_pressure_bi": "Stazio 这间房的重要性在于：Dante 把一个 authority 残余变成了活的同行者。归信、感恩、诗学传承和场景运动全都锁在同一个 figure 上。",
        "canto_threads_en": [
            "Purgatorio 21: the room opens through revelation and release, so Stazio arrives as a dramatic event rather than a background authority.",
            "Purgatorio 22: gratitude toward Virgilio turns the room into a chamber of poetic filiation and companionship.",
            "Purgatorio 23 to 27: Stazio stays thick because he keeps moving with the travelers and does not collapse back into a static literary name.",
        ],
        "canto_threads_bi": [
            "Purgatorio 21：这间房经由揭示与释放打开，所以 Stazio 是作为戏剧事件到来的，而不是背景 authority。",
            "Purgatorio 22：对 Virgilio 的感恩让这间房变成诗学传承和同行关系的房间。",
            "Purgatorio 23 到 27：Stazio 之所以保持厚度，是因为他一直和旅人一起运动，没有塌回静态的文学名字。",
        ],
    },
    "tommaso_daquino": {
        "scene_note_en": "A speaking theological presence in Paradiso rather than a mere scholastic citation shell.",
        "scene_note_bi": "Paradiso 里真正发言的神学性在场，而不只是 scholastic citation shell。",
        "canto_note_en": "Main dramatic corridor: Paradiso 10 to 13.",
        "canto_note_bi": "主要戏剧走廊：Paradiso 10 到 13。",
        "scene_pressure_en": "The room matters because speech, doctrinal ordering, and the author-shell all press on the same figure at once: this is not only a cited Thomas but a staged Thomistic presence inside the celestial school.",
        "scene_pressure_bi": "这间房的重要性在于：发言、教义排序和 author 壳层同时压在同一个 figure 上。这里不只是被引用的托马斯，而是天界学校内部被排演出来的 Thomistic presence。",
        "canto_threads_en": [
            "Paradiso 10: Tommaso enters as a speaking theologian, not as a silent scholastic label.",
            "Paradiso 11: Franciscan praise runs through Thomistic speech and proves the room can hold voice, doctrine, and scene together.",
            "Paradiso 12: The mirrored Dominican-Franciscan choreography keeps Tommaso inside a live celestial exchange.",
            "Paradiso 13: The room remains tense because doctrinal ordering and interpretive caution are both part of his figure-presence.",
        ],
        "canto_threads_bi": [
            "Paradiso 10：Tommaso 进入时就是会说话的神学人物，不是沉默的 scholastic 标签。",
            "Paradiso 11：对 Francesco 的赞颂经由 Thomistic speech 展开，证明这间房能同时扣住声音、教义和场景。",
            "Paradiso 12：Dominican / Franciscan 的镜像编排，让 Tommaso 留在一个活的天界交换里。",
            "Paradiso 13：这间房持续紧张，因为教义排序和解释上的克制都属于他的 figure-presence。",
        ],
    },
    "san_pietro": {
        "scene_note_en": "Apostolic scene-presence tied to testing, judgment, and Paradiso intensity.",
        "scene_note_bi": "与试炼、判断和 Paradiso 强度相连的使徒性场景在场。",
        "canto_note_en": "Main dramatic corridor: Paradiso 24 to 27.",
        "canto_note_bi": "主要戏剧走廊：Paradiso 24 到 27。",
        "scene_pressure_en": "San Pietro's room matters because apostolic authority and dramatic judgment strike at the same time: he is not only cited as first apostle but staged as the figure who tests, burns, and measures truth in the celestial corridor.",
        "scene_pressure_bi": "San Pietro 这间房的重要性在于：使徒 authority 和戏剧性判断同时落在同一个 figure 上。这里不只是被引用的首席使徒，而是天堂走廊里负责试炼、燃烧和衡量真理的人物。",
        "canto_threads_en": [
            "Paradiso 24: Pietro's room opens through examination and apostolic testing, so the figure arrives already charged with dramatic authority.",
            "Paradiso 25: the room thickens because hope, lineage, and apostolic voice all keep pressing on the same figure-presence.",
            "Paradiso 27: righteous anger and ecclesial judgment keep Pietro from collapsing back into a quiet devotional shell.",
        ],
        "canto_threads_bi": [
            "Paradiso 24：Pietro 的房间经由 exam 与 apostolic testing 打开，所以这位 figure 一进场就带着戏剧性的 authority。",
            "Paradiso 25：hope、lineage 和 apostolic voice 一起压在同一个 figure 上，让这间房继续变厚。",
            "Paradiso 27：义怒与 ecclesial judgment 让 Pietro 不会塌回安静的 devotional shell。",
        ],
    },
    "salomone": {
        "scene_note_en": "Sapiential figure inside the celestial order, more dramatic than a bare scriptural authority token.",
        "scene_note_bi": "天界秩序中的智慧人物，比一个裸的 scriptural authority token 更有戏剧重量。",
        "canto_note_en": "Main dramatic corridor: Paradiso 13 to 14.",
        "canto_note_bi": "主要戏剧走廊：Paradiso 13 到 14。",
        "scene_pressure_en": "Salomone's room should stay visible because wisdom is dramatized here as a ranked heavenly presence, not just as remote biblical residue. The room is about sapiential measure becoming scene-body.",
        "scene_pressure_bi": "Salomone 这间房应当保持可见，因为这里的智慧被排演成有位阶的天界 presence，而不只是远处的圣经残余。这间房关心的是 sapiential measure 如何长成场景身体。",
        "canto_threads_en": [
            "Paradiso 13: Salomone matters because wisdom enters as a visible answer to the question of human and divine measure.",
            "Paradiso 14: the room keeps its pressure when celestial order and sapiential rank remain part of the dramatic arrangement rather than floating away into abstraction.",
        ],
        "canto_threads_bi": [
            "Paradiso 13：Salomone 的重要性在于，智慧以一个可见回答的形式进入，直接回应人类与神圣尺度的问题。",
            "Paradiso 14：当天界秩序和智慧位阶继续留在戏剧编排里，而不是飘回抽象层，这间房就保持住了自己的压力。",
        ],
    },
    "aristotele": {
        "scene_note_en": "Visible master-figure in Limbo and not only the deepest philosophical authority.",
        "scene_note_bi": "Limbo 里可见的大师形象，而不只是最深的哲学 authority。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Aristotele's room matters because mastery becomes scenic rank before it becomes citation-depth. The poem lets us see the philosopher as a central body in the first circle, not only as the deepest later authority.",
        "scene_pressure_bi": "Aristotele 这间房的重要性在于：mastery 先长成场景位阶，才再长成 citation depth。诗让人先看见第一圈中央的大师身体，而不只是后来最深的 authority。",
        "canto_threads_en": [
            "Inferno 4: the room begins from visible centrality, since Aristotle is placed as the master among the gathered wise.",
            "Later commentary keeps philosophical traffic flowing back into the name, but the room should always remember that scenic priority comes first.",
        ],
        "canto_threads_bi": [
            "Inferno 4：这间房首先从可见的中心性开始，因为 Aristotle 被放在聚集智者中的大师位置上。",
            "后续 commentary 会持续把哲学 traffic 压回这个名字，但这间房始终应记得：场景优先于后来形成的 authority 深度。",
        ],
    },
    "omero": {
        "scene_note_en": "One of the visible figures of the bella scola; poetic company matters here as much as textual inheritance.",
        "scene_note_bi": "bella scola 中可见的人物之一；这里诗人同行的重要性不亚于文本继承。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Omero's room matters because he is not only the oldest epic authority in the background; he is placed inside the visible poetic company that Dante makes us see.",
        "scene_pressure_bi": "Omero 这间房的重要性在于：他不只是背景里最古老的 epic authority，而是 Dante 明确让人看见的诗人同行之一。",
        "canto_threads_en": [
            "Inferno 4: Omero stands at the head of the bella scola, so the room begins from visible rank and scene-presence.",
            "The room stays thin on direct poem aliases, but commentary traffic keeps Homeric authority pressure alive behind the scene.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Omero 站在 bella scola 的队首，所以这间房首先从可见的位阶和 scene-presence 成立。",
            "这间房在正文别名上仍偏薄，但 commentary traffic 一直让 Homeric authority 压力在场景背后保持活着。",
        ],
    },
    "orazio": {
        "scene_note_en": "Poetic company-presence in Limbo rather than authority-only residue.",
        "scene_note_bi": "Limbo 中诗人同行的在场，而不只是 authority 残余。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Orazio's room should stay visible because the Comedy places him inside the poetic company itself, not merely in a shadowy afterlife of quotations.",
        "scene_pressure_bi": "Orazio 这间房应当保持可见，因为《神曲》把他放进了诗人同行本身，而不只是一个引用残影的后世空间。",
        "canto_threads_en": [
            "Inferno 4: Orazio matters as a member of the visible poetic fellowship gathered around Omero.",
            "Commentary traffic then keeps Horatian authority alive, but the room should still begin from the seen company before it widens back into citation memory.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Orazio 之所以重要，是因为他作为围绕 Omero 的可见诗人同行成员站住了。",
            "之后 commentary traffic 会继续让 Horatian authority 保持活着，但这间房仍应先从“被看见的同行”开始，再慢慢回到 citation memory。",
        ],
    },
    "ovidio": {
        "scene_note_en": "Visible poet-presence inside the Limbo school, not just a reservoir of exempla.",
        "scene_note_bi": "Limbo 学校里的可见诗人，而不只是 exempla 的储库。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Ovidio's room matters because the Comedy does not only mine him for mythic residue; it also stages him inside the poetic company. The room should preserve both visible poet and later exempla-pressure.",
        "scene_pressure_bi": "Ovidio 这间房的重要性在于：《神曲》不只是从他那里抽取 mythic residue，也把他排演成诗人同行中的可见成员。这间房要同时保住可见诗人和后来的 exempla-pressure。",
        "canto_threads_en": [
            "Inferno 4: Ovidio first matters as part of the visible poetic school, not as a distant storehouse of stories.",
            "Later commentary thickens the room through exempla and mythic recall, which is why the scenic poet and the textual reservoir must stay together.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Ovidio 首先作为可见的诗人学校成员成立，而不是一个遥远的故事仓库。",
            "后续 commentary 会通过 exempla 与 mythic recall 加厚这间房，所以场景里的诗人与文本性的储库必须一起留下来。",
        ],
    },
    "lucano": {
        "scene_note_en": "A visible member of the poetic company rather than a source-only Latin shell.",
        "scene_note_bi": "可见的诗人同行成员，而不只是一个 source-only 的拉丁 authority room。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Lucano's room matters because the poem gives him scenic body inside the poetic company, even before later commentary starts pressing epic-historical authority back onto the name.",
        "scene_pressure_bi": "Lucano 这间房的重要性在于：诗先在诗人同行里给了他场景身体，之后 commentary 才慢慢把 epic-historical authority 压回这个名字上。",
        "canto_threads_en": [
            "Inferno 4: Lucano first appears as part of the visible poetic lineup rather than as a remote epic source.",
            "Later commentary traffic keeps Lucanian authority active, so the room should hold both the seen companion and the remembered auctor without collapsing either one.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Lucano 首先作为可见的诗人队列成员出现，而不是远处的 epic source。",
            "后续 commentary traffic 会继续让 Lucanian authority 活着，所以这间房要同时扣住“被看见的同行”和“被记住的 auctor”，不能塌成一种。",
        ],
    },
    "platone": {
        "scene_note_en": "Philosopher-presence in Limbo's assembly, distinct from the textual Platonic lane.",
        "scene_note_bi": "Limbo 聚会中的哲学家在场，和文本性的 Platonic lane 不同。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "The room should stay visible because Platone is part of the first-circle philosophical assembly, not just a remote anchor for Timaeus and Laws. The scenic body is thin, but it is real.",
        "scene_pressure_bi": "这间房应当保持可见，因为 Platone 属于第一圈的哲学家聚会，不只是 Timeo 和 Leggi 的远程 anchor。它的场景身体偏薄，但是真的存在。",
        "canto_threads_en": [
            "Inferno 4: Platone belongs to the visible philosophical assembly, so the room begins from scenic placement rather than from abstract doctrine.",
            "Paradiso 4: the Platonic lane reappears through commentary pressure, which is why the author-shell must stay connected to the Limbo figure.",
            "Paradiso 13 and 29: Timeo and cosmological echoes keep Platone active beyond a single cameo, even when the room stays more scenic than tree-shaped.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Platone 属于可见的哲学家聚会，所以这间房首先从场景位置成立，而不是从抽象 doctrine 成立。",
            "Paradiso 4：Platonic lane 会经由 commentary 压力再次出现，所以 author-shell 必须继续和 Limbo 里的 figure 接上。",
            "Paradiso 13 和 29：Timeo 与宇宙论回声让 Platone 不止是一次 cameo，哪怕这间房仍然更偏场景而不是 tree。",
        ],
    },
    "seneca": {
        "scene_note_en": "Visible wise figure in Limbo in addition to Stoic and dramatic authority traffic.",
        "scene_note_bi": "Limbo 中可见的智者人物，叠加在斯多亚与戏剧 authority 流之上。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Seneca's room should hold together the visible Limbo figure and the mixed author-shell behind it: the point is not to dissolve him into citation traffic once the character has entered the corridor.",
        "scene_pressure_bi": "Seneca 这间房要把可见的 Limbo figure 和背后混合的 authority room 一起扣住：重点不是一旦角色进了走廊，就又把他溶回 citation traffic 里。",
        "canto_threads_en": [
            "Inferno 4: Seneca first matters as a visible sage among the gathered wise.",
            "Inferno 1, 3, and 7: commentary pressure keeps Stoic and moral traffic attached to him beyond the Limbo cameo.",
            "Paradiso 8, 15, and 33: scattered high-register citations thicken the author-shell even while the personaggio room stays anchored in the first-circle scene.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Seneca 首先作为聚集智者中的可见 sage 成立。",
            "Inferno 1、3、7：commentary 压力让斯多亚与 moral traffic 超过 Limbo cameo，继续黏在他身上。",
            "Paradiso 8、15、33：零散但高位的引用继续加厚 author-shell，哪怕 personaggio 房间仍锚在第一圈场景里。",
        ],
    },
    "averroe": {
        "scene_note_en": "Visible learned figure in Limbo rather than only a commentator-author room.",
        "scene_note_bi": "Limbo 中可见的学者人物，而不只是评论家型 authority room。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Averroè's room matters because Dante gives scenic body to a name that later commentary also loads with commentator-philosophical pressure. The figure must stay visible before the authority room takes over.",
        "scene_pressure_bi": "Averroè 这间房的重要性在于：Dante 先给了这个名字场景身体，后来 commentary 又不断把 commentator-philosophical pressure 压回去。必须先让 figure 保持可见，不能让 authority room 抢走一切。",
        "canto_threads_en": [
            "Inferno 4: Averroè enters as one of the seen learned figures, so the room begins from scenic placement, not from scholastic afterlife alone.",
            "Later commentary pressure keeps the commentator-author room active, which is exactly why the room should preserve both visible Limbo body and philosophical residue together.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Averroè 首先作为被看见的 learned figures 之一进入，所以这间房从场景位置开始，而不是只从后来的 scholastic 余波开始。",
            "后续 commentary 压力会不断激活 commentator-author room，所以这间房更要同时扣住 Limbo 里可见的身体和哲学残余。",
        ],
    },
    "avicenna": {
        "scene_note_en": "Visible scientific-philosophical figure in Limbo, not only a cautious authority room with medical-philosophical residue behind it.",
        "scene_note_bi": "Limbo 中可见的科学-哲学人物，而不只是背后拖着 medical-philosophical 残余的谨慎 authority room。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Avicenna's room matters because direct doctrinal authority and visible learned-presence do not coincide cleanly. The room has to hold the Limbo figure and the later mixed medical-philosophical traffic without pretending they are one simple object.",
        "scene_pressure_bi": "Avicenna 这间房的重要性在于：直接 doctrinal authority 和可见的 learned-presence 并不会干净重合。这间房必须同时扣住 Limbo 里的 figure 和后来的 mixed medical-philosophical traffic，不能假装它们是一个简单对象。",
        "canto_threads_en": [
            "Inferno 4: Avicenna first appears as part of the visible learned assembly, so the room begins from scenic presence rather than from later scholastic grouping.",
            "Later commentary keeps medical-philosophical traffic attached to the name, which is why the room must remain mixed, caveated, and visibly double-layered.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Avicenna 首先作为可见 learned assembly 的一员出现，所以这间房从场景 presence 开始，而不是从后来的 scholastic grouping 开始。",
            "后续 commentary 会持续把 medical-philosophical traffic 黏在这个名字上，所以这间房必须保持混合、带 caveat，而且清楚地双层化。",
        ],
    },
    "tolomeo": {
        "scene_note_en": "Visible scientific figure in the first-circle assembly, distinct from astronomical citation traffic.",
        "scene_note_bi": "第一圈聚会中的可见科学人物，和 astronomical citation traffic 不同。",
        "canto_note_en": "Main dramatic corridor: Inferno 4.",
        "canto_note_bi": "主要戏剧走廊：Inferno 4。",
        "scene_pressure_en": "Tolomeo's room matters because a name later used for cosmological authority is first given scenic rank inside the learned assembly. The room should keep both the visible scientist and the later astronomical pressure in one place.",
        "scene_pressure_bi": "Tolomeo 这间房的重要性在于：这个后来不断被用来承载 cosmological authority 的名字，最先是在 learned assembly 里被赋予场景位阶。这间房应当同时扣住可见的科学人物和之后的 astronomical pressure。",
        "canto_threads_en": [
            "Inferno 4: Tolomeo enters as part of the visible scientific-intellectual assembly, so the room begins from seen placement.",
            "Later commentary turns the name back into cosmological authority, which is why the room must not forget its scenic body while the author-shell thickens.",
        ],
        "canto_threads_bi": [
            "Inferno 4：Tolomeo 作为可见 scientific-intellectual assembly 的一员进入，所以这间房首先从被看见的位置成立。",
            "后续 commentary 会把这个名字重新压成 cosmological authority，所以这间房不能在 author-shell 变厚时丢掉自己的场景身体。",
        ],
    },
    "ulisse": {
        "scene_note_en": "A narrative exemplar whose name reenters commentary through the force of the episode itself.",
        "scene_note_bi": "一个通过情节自身力量不断回返 commentary 的叙事 exemplum。",
        "canto_note_en": "Main dramatic corridor: Inferno 26.",
        "canto_note_bi": "主要戏剧走廊：Inferno 26。",
        "scene_pressure_en": "Ulisse's room matters because narrative force itself generates the afterlife of the name. The figure is not borrowed quietly; he detonates into one of the poem's strongest exemplary scenes.",
        "scene_pressure_bi": "Ulisse 这间房的重要性在于：名字的后世回响是由叙事情节本身制造出来的。这个 figure 不是被安静借来，而是在诗里炸成最强的一类 exemplum 场景。",
        "canto_threads_en": [
            "Inferno 26: the room is almost entirely made of scene-pressure, since speech, flame, voyage, and ruin all fuse into one exemplary body.",
            "Later commentary keeps returning to the room because the episode itself continues to radiate interpretive pressure outward.",
        ],
        "canto_threads_bi": [
            "Inferno 26：这间房几乎完全由 scene-pressure 构成，因为发言、火焰、航行和毁灭全都熔成了一个 exemplum 身体。",
            "后续 commentary 会不断回返这间房，因为这个情节本身会持续把解释压力向外辐射。",
        ],
    },
    "sordello": {
        "scene_note_en": "A scene-memory figure tied to Purgatorio's political and affective atmosphere.",
        "scene_note_bi": "和 Purgatorio 的政治气氛与情感空气连在一起的场景记忆人物。",
        "canto_note_en": "Main dramatic corridor: Purgatorio 6 to 8.",
        "canto_note_bi": "主要戏剧走廊：Purgatorio 6 到 8。",
        "scene_pressure_en": "Sordello's room matters because recognition, political grief, and local belonging all crystallize around him. He becomes a hinge for atmosphere, not merely a historical name.",
        "scene_pressure_bi": "Sordello 这间房的重要性在于：认出、政治哀感和地方归属感都在他身上结晶。他成了气氛的铰链，而不只是历史名字。",
        "canto_threads_en": [
            "Purgatorio 6: the room opens through recognition and civic-political charge, so Sordello immediately becomes more than a biographical marker.",
            "Purgatorio 7 to 8: the room stays thick because atmosphere, place, and memory keep adhering to the same figure.",
        ],
        "canto_threads_bi": [
            "Purgatorio 6：这间房经由认出和 civic-political charge 打开，所以 Sordello 立刻就不只是一个传记标记。",
            "Purgatorio 7 到 8：这间房之所以保持厚度，是因为 atmosphere、place 和 memory 一直黏在同一个 figure 上。",
        ],
    },
}

PERSONAGGIO_CORRIDOR_GROUPS = {
    "paolo_apostolo": "Paradiso",
    "virgilio": "Inferno e Purgatorio",
    "stazio": "Purgatorio",
    "tommaso_daquino": "Paradiso",
    "san_pietro": "Paradiso",
    "salomone": "Paradiso",
    "aristotele": "Limbo",
    "omero": "Limbo",
    "orazio": "Limbo",
    "ovidio": "Limbo",
    "lucano": "Limbo",
    "platone": "Limbo",
    "seneca": "Limbo",
    "averroe": "Limbo",
    "avicenna": "Limbo",
    "tolomeo": "Limbo",
    "ulisse": "Inferno",
    "sordello": "Purgatorio",
}

PERSONAGGIO_ALIAS_ATLAS: dict[str, dict] = {}
PERSONAGGIO_SCAN_ROWS: dict[str, dict] = {}
AUTHOR_SHELL_ROWS: dict[str, dict] = {}
VIRGILIO_APPENDIX_LEDGER: list[dict] = []
PERSONAGGIO_TAIL_LEDGERS: dict[str, dict] = {}

PERSONAGGIO_CURATED_WORK_ANCHORS = {
    "san_pietro": {
        "lead_en": "This room is still thinner on a mounted works layer, but the apostolic reading path is already concrete enough to expose its main scriptural anchors.",
        "lead_bi": "这间房在已挂载的 works layer 上仍偏薄，但 apostolic 阅读路径已经足够具体，可以直接露出它的主要 scriptural anchors。",
        "items_en": [
            ("Matthew 16", "Petrine confession and keys-pressure that keep Pietro tied to ecclesial authority rather than to a bare proper name."),
            ("First Epistle of Peter", "Apostolic voice and pastoral testing that sustain commentary traffic around Pietro."),
            ("Second Epistle of Peter", "Judgment, vigilance, and doctrinal warning that fit the hotter Paradiso lane."),
        ],
        "items_bi": [
            ("Matthew 16", "Petrine confession 与 keys-pressure，把 Pietro 牢牢系在 ecclesial authority 上，而不只是一个专名。"),
            ("First Epistle of Peter", "使徒声音和 pastoral testing，持续给 Pietro 提供 commentary traffic。"),
            ("Second Epistle of Peter", "判断、警醒与 doctrinal warning，对应更炽热的 Paradiso lane。"),
        ],
    },
    "salomone": {
        "lead_en": "The mounted works bridge is still thin, but the sapiential lane around Salomone already has a readable cluster of wisdom anchors.",
        "lead_bi": "已挂载的 works bridge 仍偏薄，但围绕 Salomone 的 sapiential lane 已经有一组可读的 wisdom anchors。",
        "items_en": [
            ("Ecclesiastes", "Vanity, measure, and temporal wisdom keep Salomone inside the sapiential corridor rather than in a flat biblical residue."),
            ("Proverbs", "Royal wisdom and ordered saying-pressure support the room's doctrinal shape."),
            ("Song of Songs", "The devotional and allegorical afterlife thickens the figure beyond a merely historical king."),
        ],
        "items_bi": [
            ("Ecclesiastes", "虚空、尺度与时间性的智慧，让 Salomone 留在 sapiential corridor 里，而不是扁平的 biblical residue。"),
            ("Proverbs", "王者智慧和箴言式的 ordered saying-pressure，支撑这间房的 doctrinal shape。"),
            ("Song of Songs", "devotional 与 allegorical 的后效，让这个 figure 超过一个纯历史性的国王。"),
        ],
    },
    "omero": {
        "lead_en": "Omero still lacks a pushed local work layer, but the epic room already has two obvious anchors that keep the figure thicker than a bare Limbo name.",
        "lead_bi": "Omero 还没有真正前推的本地 work layer，但 epic room 已经有两根很明显的锚点，让这个 figure 不会塌成一个裸的 Limbo 名字。",
        "items_en": [
            ("Iliad", "War-epic seniority and poetic headship keep Omero at the visible front of the bella scola."),
            ("Odyssey", "Voyage-memory and epic return-pressure keep Homeric authority active behind later Ulysses traffic."),
        ],
        "items_bi": [
            ("Iliad", "战争史诗的 seniority 和诗学领首性，让 Omero 保持在 bella scola 的可见前排。"),
            ("Odyssey", "航行记忆与回返压力，让 Homeric authority 在后来的 Ulysses traffic 背后持续活着。"),
        ],
    },
    "orazio": {
        "lead_en": "Orazio does not yet expose a mounted work layer, but his Horatian room already has a stable trio of poetic anchors.",
        "lead_bi": "Orazio 还没有挂出的 work layer，但 Horatian room 已经有一组三件套的稳定诗学锚点。",
        "items_en": [
            ("Ars poetica", "Poetics traffic and ars-language keep Orazio visible well beyond the Limbo tableau."),
            ("Carmina", "Lyric authority and moral-poetic maxims keep Horatian citation pressure circulating in commentary."),
            ("Epistulae", "The reflective and didactic Horace helps the room thicken beyond a single scenic appearance."),
        ],
        "items_bi": [
            ("Ars poetica", "poetics traffic 和 ars-language，让 Orazio 的可见度远远超出 Limbo tableau。"),
            ("Carmina", "抒情 authority 和 moral-poetic 箴言，让 Horatian citation pressure 在 commentary 中不断流动。"),
            ("Epistulae", "反思性、教诲性的 Horace，帮助这间房超过一次性的场景露面。"),
        ],
    },
    "averroe": {
        "lead_en": "Averroè still has no mounted work bundle, but the room already points toward a coherent commentator spine rather than a nameless scholastic cloud.",
        "lead_bi": "Averroè 还没有挂出的 work bundle，但这间房已经指向一根成形的 commentator spine，而不是无名的 scholastic cloud。",
        "items_en": [
            ("Commentary on De anima", "The soul-and-intellect lane is the clearest bridge between Dantean memory and later commentary traffic."),
            ("Commentary on Metaphysics", "Philosophical mediation and Aristotelian reading pressure keep Averroè legible as more than a generic sage."),
            ("Commentary on Physics", "Natural-philosophical exegesis rounds out the commentator profile behind the Limbo scene."),
        ],
        "items_bi": [
            ("Commentary on De anima", "灵魂与 intellect 的线路，是 Dante 记忆和后世 commentary traffic 之间最清楚的桥。"),
            ("Commentary on Metaphysics", "哲学中介和 Aristotelian 阅读压力，让 Averroè 不只是一个 generic sage。"),
            ("Commentary on Physics", "自然哲学式的注释工作，补足 Limbo 场景背后的 commentator profile。"),
        ],
    },
    "avicenna": {
        "lead_en": "Avicenna still enters through a thin authority room, but the medical-philosophical cluster around him is already concrete enough to surface.",
        "lead_bi": "Avicenna 仍主要经由一个偏薄的 authority room 进入，但围绕他的 medical-philosophical cluster 已经足够具体，可以直接露出来。",
        "items_en": [
            ("Canon of Medicine", "Medical authority keeps Avicenna from dissolving into a generic eastern sage."),
            ("Kitab al-Shifa'", "The encyclopedic philosophical lane gives the room more than one disciplinary register."),
            ("De anima", "Psychological and metaphysical traffic help Avicenna stay connected to scholastic reading memory."),
        ],
        "items_bi": [
            ("Canon of Medicine", "医学 authority 让 Avicenna 不会融化成一个泛泛的 eastern sage。"),
            ("Kitab al-Shifa'", "百科式、哲学性的线路，让这间房不只停在单一学科 register。"),
            ("De anima", "心理学与形而上学的 traffic，让 Avicenna 继续挂在 scholastic 阅读记忆上。"),
        ],
    },
    "tolomeo": {
        "lead_en": "Tolomeo's room still lacks a mounted bundle, but the astronomical lane already has canonical anchors strong enough to name aloud.",
        "lead_bi": "Tolomeo 的房间还缺一组正式挂出的 bundle，但 astronomical lane 已经有足够强的 canonical anchors，可以直接点名。",
        "items_en": [
            ("Almagest", "The astronomical spine that keeps Tolomeo legible as more than a thin scientific residue."),
            ("Tetrabiblos", "Astral interpretation and cosmological reading pressure widen the room beyond one textbook label."),
            ("Geography", "The world-ordering imagination keeps Ptolemaic authority from shrinking into a single technical silo."),
        ],
        "items_bi": [
            ("Almagest", "天文学主脊，让 Tolomeo 不会缩成一个薄薄的 scientific residue。"),
            ("Tetrabiblos", "星辰解释和 cosmological 阅读压力，让这间房不只剩一个教材标签。"),
            ("Geography", "世界编排的想象力，让 Ptolemaic authority 不会缩回单一技术性隔间。"),
        ],
    },
    "lucano": {
        "lead_en": "Lucano still shows up without a mounted work tree, but one epic anchor already carries most of the room's force.",
        "lead_bi": "Lucano 现在还没有挂出的 work tree，但有一根 epic 锚点已经承担了这间房的大部分力量。",
        "items_en": [
            ("Pharsalia", "Civil-war epic pressure is the main current that keeps Lucano thicker than a bare bella scola name."),
        ],
        "items_bi": [
            ("Pharsalia", "内战史诗的压力，是让 Lucano 超过一个裸 bella scola 名字的主电流。"),
        ],
    },
    "ulisse": {
        "lead_en": "Ulisse stays scene-first, but the room still benefits from two explicit reading anchors instead of a blank works apology.",
        "lead_bi": "Ulisse 保持 scene-first 没错，但这间房仍然需要两根明确的阅读锚，而不是一段空泛的 works 道歉。",
        "items_en": [
            ("Inferno 26", "The speech-scene itself is the first anchor: counsel, voyage, and catastrophic desire are already enough to hold the room."),
            ("Odyssey", "Homeric return-memory remains the second anchor even when Dante's Ulisse sharply departs from it."),
        ],
        "items_bi": [
            ("Inferno 26", "首先的锚点就是这段发言场景本身：劝说、航行和灾难性的欲望已经足够撑起这间房。"),
            ("Odyssey", "Homeric 的回返记忆仍然是第二根锚点，哪怕 Dante 的 Ulisse 明显偏离了它。"),
        ],
    },
    "sordello": {
        "lead_en": "Sordello also stays scene-first, but the room is clearer once its dramatic and troubadour anchors are named aloud.",
        "lead_bi": "Sordello 同样保持 scene-first，但把它的戏剧锚点和 troubadour 锚点直接说出来，这间房会清楚很多。",
        "items_en": [
            ("Purgatorio 6-8", "The dramatic corridor of recognition, rebuke, and suspended desire is the first anchor of the room."),
            ("Troubadour memory", "The remembered Sordello of lyric and courtly voice is the second anchor behind the Purgatorial scene."),
        ],
        "items_bi": [
            ("Purgatorio 6-8", "识认、斥责和欲望悬置组成的戏剧走廊，是这间房的第一根锚。"),
            ("Troubadour memory", "抒情和 courtly 声音中的被记住的 Sordello，是 Purgatorial 场景背后的第二根锚。"),
        ],
    },
}

AUTHOR_CURATED_WORK_ANCHORS = {
    "moses": {
        "lead_en": "Mosè does not yet expose a mounted scriptural tree, but the Mosaic room already stands on the Pentateuchal backbone.",
        "lead_bi": "Mosè 还没有正式挂出的 scriptural tree，但这间房已经站在 Pentateuch 的主脊上。",
        "items_en": [
            ("Genesis", "Creation, fall, and patriarchal origin keep Mosaic citation pressure legible across commentary."),
            ("Exodus", "Law, liberation, and passage imagery widen the room beyond one book label."),
            ("Deuteronomy", "Renewed law and covenant speech keep the Mosaic lane doctrinally visible."),
        ],
        "items_bi": [
            ("Genesis", "创造、堕落与族长起源，让 Mosaic citation pressure 在 commentary 里保持可见。"),
            ("Exodus", "律法、出离与 passage imagery，让这间房不只停在一本书的标签上。"),
            ("Deuteronomy", "重申律法与盟约话语，让 Mosaic lane 的 doctrinal 轮廓更清楚。"),
        ],
    },
    "isaiah": {
        "lead_en": "Isaia does not yet expose a mounted prophetic tree, but the prophetic room already stands on a clear Isaian backbone.",
        "lead_bi": "Isaia 还没有正式挂出的 prophetic tree，但 prophetic room 已经立在清楚的 Isaian 主脊上。",
        "items_en": [
            ("Book of Isaiah", "The prophetic book itself keeps Isaiah visible as more than a floating citation abbreviation."),
            ("Isaiah 6", "Vision and vocation thicken the prophetic lane beyond a generic prophet label."),
            ("Isaiah 53", "Suffering-servant pressure keeps the room doctrinally alive in Christian commentary."),
        ],
        "items_bi": [
            ("Book of Isaiah", "这本书本身，让 Isaia 不只是漂浮的 citation abbreviation。"),
            ("Isaiah 6", "异象与受召，让 prophetic lane 超过泛泛的 prophet 标签。"),
            ("Isaiah 53", "受苦仆人的压力，让这间房在 Christian commentary 中保持 doctrinal 活性。"),
        ],
    },
    "matthew": {
        "lead_en": "Matteo Evangelista still lacks a mounted gospel tree, but the Matthean room already has a stable gospel anchor.",
        "lead_bi": "Matteo Evangelista 还没有正式挂出的 gospel tree，但这间房已经有稳定的 gospel anchor。",
        "items_en": [
            ("Gospel of Matthew", "The gospel itself keeps Matthew structurally visible in scriptural citation traffic."),
            ("Sermon on the Mount", "The teaching block thickens the room beyond a bare evangelist label."),
        ],
        "items_bi": [
            ("Gospel of Matthew", "这部福音本身，让 Matteo 在 scriptural citation traffic 中保持结构性的可见。"),
            ("Sermon on the Mount", "登山训诲让这间房超过裸的 evangelist 标签。"),
        ],
    },
    "mark": {
        "lead_en": "Marco Evangelista still lacks a mounted gospel tree, but the Marcan room already has a stable narrative anchor.",
        "lead_bi": "Marco Evangelista 还没有正式挂出的 gospel tree，但这间房已经有稳定的 narrative anchor。",
        "items_en": [
            ("Gospel of Mark", "The gospel itself keeps Mark visible as a scriptural authority rather than a stray abbreviation."),
            ("Passion narrative", "Compressed dramatic force keeps the Marcan lane warm inside commentary traffic."),
        ],
        "items_bi": [
            ("Gospel of Mark", "这部福音本身，让 Marco 保持为 scriptural authority，而不是漂浮的缩写。"),
            ("Passion narrative", "压缩而强烈的受难叙事，让 Marcan lane 在 commentary traffic 里继续发热。"),
        ],
    },
    "luke": {
        "lead_en": "Luca Evangelista still lacks a mounted gospel tree, but the Lucan room already has a double backbone.",
        "lead_bi": "Luca Evangelista 还没有正式挂出的 gospel tree，但这间房已经有双主脊。",
        "items_en": [
            ("Gospel of Luke", "The gospel keeps Luke visible through nativity, parable, and resurrection traffic."),
            ("Acts of the Apostles", "Acts widens the room into apostolic history rather than leaving Luke as a single-book figure."),
        ],
        "items_bi": [
            ("Gospel of Luke", "福音书本身让 Luca 通过诞生、比喻、复活等线路保持可见。"),
            ("Acts of the Apostles", "《使徒行传》让这间房扩成 apostolic history，而不是单书作者。"),
        ],
    },
    "john_the_evangelist": {
        "lead_en": "Giovanni Evangelista still lacks a mounted Johannine tree, but the room already has a clear gospel-apocalyptic pair.",
        "lead_bi": "Giovanni Evangelista 还没有正式挂出的 Johannine tree，但这间房已经有清楚的 gospel / apocalyptic 双锚。",
        "items_en": [
            ("Gospel of John", "Johannine testimony and theology keep the room visible as more than an abbreviated citation."),
            ("Apocalypse", "Apocalyptic vision widens the room beyond gospel prose into eschatological reading pressure."),
        ],
        "items_bi": [
            ("Gospel of John", "Johannine 的见证与神学，让这间房超过缩写级别的存在。"),
            ("Apocalypse", "启示性异象让这间房从 gospel prose 扩到 eschatological reading pressure。"),
        ],
    },
    "alberto_magno": {
        "lead_en": "Alberto Magno still lacks a mounted work tree, but the Albertine room already has a readable scholastic-natural cluster.",
        "lead_bi": "Alberto Magno 还没有正式挂出的 work tree，但 Albertine room 已经有一组可读的 scholastic-natural 锚点。",
        "items_en": [
            ("De animalibus", "Natural-philosophical observation keeps Alberto from shrinking into a generic scholastic master."),
            ("Commentary on Metaphysics", "Aristotelian mediation gives the room a clear doctrinal spine."),
            ("De vegetabilibus", "The encyclopedic natural lane rounds out the Albertine profile."),
        ],
        "items_bi": [
            ("De animalibus", "自然哲学式的观察，让 Alberto 不会缩成一个泛泛的 scholastic master。"),
            ("Commentary on Metaphysics", "Aristotelian 的中介工作，给这间房一根清楚的 doctrinal spine。"),
            ("De vegetabilibus", "百科式的自然研究线路，补足 Albertine profile。"),
        ],
    },
    "albumasar": {
        "lead_en": "Albumasar still has no mounted work layer, but the astrological room already rests on a small canonical set.",
        "lead_bi": "Albumasar 还没有正式挂出的 work layer，但 astrological room 已经立在一小组 canonical anchors 上。",
        "items_en": [
            ("Introductorium maius", "The large astrological introduction keeps Albumasar visible as a technical authority rather than a drifting name."),
            ("De magnis coniunctionibus", "Conjunction theory thickens the predictive and historical lane behind the name."),
            ("Flores astrologiae", "Shorter astrological compendia help the room stay legible in citation traffic."),
        ],
        "items_bi": [
            ("Introductorium maius", "大型占星导论让 Albumasar 保持为一个技术性 authority，而不是漂浮的名字。"),
            ("De magnis coniunctionibus", "合相理论让名字背后的预测性、历史性线路变厚。"),
            ("Flores astrologiae", "较短的占星汇编，让这间房在 citation traffic 中保持可读。"),
        ],
    },
    "alfragano": {
        "lead_en": "Alfragano still lacks a mounted bundle, but the astronomical room already has a single very clear backbone.",
        "lead_bi": "Alfragano 还没有正式挂出的 bundle，但 astronomical room 已经有一根非常清楚的主脊。",
        "items_en": [
            ("Elements of Astronomy", "The elementary astronomical handbook is the main reason Alfragano remains legible in scholastic commentary."),
            ("Compendium of the Almagest", "The Ptolemaic bridge keeps Alfragano connected to wider cosmological traffic."),
        ],
        "items_bi": [
            ("Elements of Astronomy", "基础天文学手册，是 Alfragano 在 scholastic commentary 中保持可见的主因。"),
            ("Compendium of the Almagest", "Ptolemaic 的桥梁，让 Alfragano 继续挂在更大的 cosmological traffic 上。"),
        ],
    },
    "beda": {
        "lead_en": "Beda still lacks a mounted works set, but the room already stands on a stable historical-computistical cluster.",
        "lead_bi": "Beda 还没有正式挂出的 works 集合，但这间房已经站在一组稳定的历史/历算锚点上。",
        "items_en": [
            ("Historia ecclesiastica gentis Anglorum", "Ecclesiastical history keeps Beda visible as more than a faint patristic name."),
            ("De temporum ratione", "Computistical and calendrical reasoning thickens the scholarly lane around Beda."),
            ("De natura rerum", "Natural-order prose widens the room beyond one disciplinary silo."),
        ],
        "items_bi": [
            ("Historia ecclesiastica gentis Anglorum", "教会史让 Beda 不只是一个淡淡的 patristic 名字。"),
            ("De temporum ratione", "历算和历法推理，让 Beda 周围的 scholarly lane 变厚。"),
            ("De natura rerum", "关于自然秩序的 prose，让这间房超过单一学科隔间。"),
        ],
    },
    "bernardo_di_chiaravalle": {
        "lead_en": "Bernardo still has no mounted work tree, but the devotional-mystical lane already has a strong monastic core.",
        "lead_bi": "Bernardo 还没有正式挂出的 work tree，但 devotional-mystical lane 已经有一组很强的 monastic 核心。",
        "items_en": [
            ("Sermones super Cantica Canticorum", "Mystical reading of the Song keeps Bernardine devotion structurally visible."),
            ("De diligendo Deo", "The theology of loving God gives the room a compact doctrinal anchor."),
            ("De consideratione", "Pastoral and contemplative counsel widen the room beyond lyric devotion alone."),
        ],
        "items_bi": [
            ("Sermones super Cantica Canticorum", "对《雅歌》的神秘主义阅读，让 Bernardine devotion 保持结构性的可见。"),
            ("De diligendo Deo", "关于爱神的神学，为这间房提供紧凑的 doctrinal anchor。"),
            ("De consideratione", "牧灵与默观性的劝告，让这间房不只停在 lyric devotion。"),
        ],
    },
    "claudiano": {
        "lead_en": "Claudiano still lacks a mounted work layer, but the late-Roman poetic room already has a readable pair of anchors.",
        "lead_bi": "Claudiano 还没有正式挂出的 work layer，但 late-Roman poetic room 已经有一对可读的锚点。",
        "items_en": [
            ("De raptu Proserpinae", "Mythic epic pressure keeps Claudiano legible as more than an occasional court poet."),
            ("In Rufinum", "Invective and political verse give the room a sharper rhetorical contour."),
        ],
        "items_bi": [
            ("De raptu Proserpinae", "神话史诗的压力，让 Claudiano 不只是一个偶发的宫廷诗人。"),
            ("In Rufinum", "讽刺与政治诗，让这间房得到更锋利的修辞轮廓。"),
        ],
    },
    "galeno": {
        "lead_en": "Galeno still lacks a mounted works set, but the medical room already rests on a coherent technical cluster.",
        "lead_bi": "Galeno 还没有正式挂出的 works 集合，但 medical room 已经立在一组成形的技术性锚点上。",
        "items_en": [
            ("Ars parva", "Elementary medical method keeps Galen visible in scholastic traffic."),
            ("De usu partium", "Anatomical and teleological reasoning thickens the medical-philosophical lane."),
            ("De complexionibus", "Theory of temperaments keeps Galenic authority alive in moral-physiological commentary."),
        ],
        "items_bi": [
            ("Ars parva", "基础医学方法论，让 Galeno 在 scholastic traffic 中保持可见。"),
            ("De usu partium", "解剖学与目的论推理，让 medical-philosophical lane 继续变厚。"),
            ("De complexionibus", "体液与禀赋理论，让 Galenic authority 活在道德/生理 commentary 中。"),
        ],
    },
    "giovanni_crisostomo": {
        "lead_en": "Giovanni Crisostomo still lacks a mounted work layer, but the homiletic-patristic room already has a stable speaking core.",
        "lead_bi": "Giovanni Crisostomo 还没有正式挂出的 work layer，但 homiletic-patristic room 已经有一个稳定的 speaking core。",
        "items_en": [
            ("Homilies on Matthew", "Scriptural preaching keeps Chrysostom legible as a living exegetical voice."),
            ("De sacerdotio", "Pastoral doctrine gives the room a distinct ecclesial anchor."),
            ("Homilies on John", "Johannine exegesis thickens the patristic profile beyond one sermon-lane."),
        ],
        "items_bi": [
            ("Homilies on Matthew", "scriptural preaching 让 Crisostomo 保持为活着的 exegetical voice。"),
            ("De sacerdotio", "牧职教义，为这间房提供清楚的 ecclesial anchor。"),
            ("Homilies on John", "对若望的解经工作，让 patristic profile 超过单一路径。"),
        ],
    },
    "giovanni_damasceno": {
        "lead_en": "Giovanni Damasceno still has no mounted work set, but the doctrinal room already has a compact eastern backbone.",
        "lead_bi": "Giovanni Damasceno 还没有正式挂出的 works 集合，但 doctrinal room 已经有一根紧凑的东方主脊。",
        "items_en": [
            ("De fide orthodoxa", "Doctrinal synthesis keeps Damascene authority structurally visible."),
            ("Fountain of Knowledge", "The wider knowledge-compendium thickens the room beyond one isolated doctrinal treatise."),
            ("Hymns", "Liturgical afterlife keeps the room from becoming purely abstract theology."),
        ],
        "items_bi": [
            ("De fide orthodoxa", "教义综合，让 Damascene authority 保持结构性的可见。"),
            ("Fountain of Knowledge", "更大的知识汇编，让这间房超过单一教义论文。"),
            ("Hymns", "礼仪性的后效，让这间房不至于塌成纯抽象神学。"),
        ],
    },
    "giovenale": {
        "lead_en": "Giovenale still lacks a mounted work tree, but the satiric room already has one obvious anchor.",
        "lead_bi": "Giovenale 还没有正式挂出的 work tree，但 satiric room 已经有一根很明显的锚。",
        "items_en": [
            ("Satires", "Roman satiric pressure keeps Giovenale visible as more than a marginal moralizer."),
        ],
        "items_bi": [
            ("Satires", "罗马讽刺诗的压力，让 Giovenale 超过一个边缘 moralizer。"),
        ],
    },
    "girolamo": {
        "lead_en": "Girolamo still lacks a mounted work layer, but the exegetical-patristic room already has a strong textual core.",
        "lead_bi": "Girolamo 还没有正式挂出的 work layer，但 exegetical-patristic room 已经有很强的文本核心。",
        "items_en": [
            ("Vulgate", "Biblical translation keeps Jerome visible as a textual architect rather than a remote father-name."),
            ("Epistulae", "Letters keep the room personal, pastoral, and historically textured."),
            ("De viris illustribus", "Scholarly literary memory thickens the room beyond scriptural labor alone."),
        ],
        "items_bi": [
            ("Vulgate", "圣经译本工作，让 Jerome 成为文本建筑师，而不是一个远远的教父名字。"),
            ("Epistulae", "书信让这间房保持个人性、牧灵性和历史纹理。"),
            ("De viris illustribus", "文学史式的 scholarly 记忆，让这间房超过单纯的 scriptural labor。"),
        ],
    },
    "gratianus": {
        "lead_en": "Graziano still has no mounted work tree, but the canon-law room already has a single obvious backbone.",
        "lead_bi": "Graziano 还没有正式挂出的 work tree，但 canon-law room 已经有一根明显的主脊。",
        "items_en": [
            ("Decretum", "Canonical ordering and juristic synthesis keep Graziano visible as more than a stray legal name."),
        ],
        "items_bi": [
            ("Decretum", "教会法的编排和法学综合，让 Graziano 超过一个漂浮的法律名字。"),
        ],
    },
    "gregorio_magno": {
        "lead_en": "Gregorio Magno still lacks a mounted works set, but the pastoral-monastic lane already has a stable trio of anchors.",
        "lead_bi": "Gregorio Magno 还没有正式挂出的 works 集合，但 pastoral-monastic lane 已经有稳定的三联锚点。",
        "items_en": [
            ("Moralia in Iob", "Biblical-moral exegesis gives Gregory a deep doctrinal spine."),
            ("Regula pastoralis", "Pastoral governance keeps the room ecclesially concrete."),
            ("Dialogi", "Miracle narrative and hagiographic memory widen the room beyond administration."),
        ],
        "items_bi": [
            ("Moralia in Iob", "圣经/道德解经工作，为 Gregorio 提供很深的 doctrinal spine。"),
            ("Regula pastoralis", "牧灵治理让这间房保持 ecclesial 的具体性。"),
            ("Dialogi", "神迹叙事和圣徒记忆，让这间房超过纯行政性。"),
        ],
    },
    "isidoro": {
        "lead_en": "Isidoro still lacks a mounted work tree, but the encyclopedic room already has a clear textual backbone.",
        "lead_bi": "Isidoro 还没有正式挂出的 work tree，但 encyclopedic room 已经有一根清楚的文本主脊。",
        "items_en": [
            ("Etymologiae", "The great lexical-encyclopedic project keeps Isidoro structurally visible."),
            ("De natura rerum", "Natural-order prose widens the room beyond lexical compilation alone."),
            ("Sententiae", "Doctrinal commonplaces keep Isidorian authority active in commentary traffic."),
        ],
        "items_bi": [
            ("Etymologiae", "大型词源/百科工程，让 Isidoro 保持结构性的可见。"),
            ("De natura rerum", "关于自然秩序的 prose，让这间房超过单纯的词汇汇编。"),
            ("Sententiae", "教义性的 commonplaces，让 Isidorian authority 活在 commentary traffic 中。"),
        ],
    },
    "livio": {
        "lead_en": "Livio still lacks a mounted work layer, but the historical room already stands on one very strong anchor.",
        "lead_bi": "Livio 还没有正式挂出的 work layer，但 historical room 已经立在一根非常强的锚上。",
        "items_en": [
            ("Ab urbe condita", "Roman historical scale and civic memory keep Livio thick far beyond a bare historian-label."),
        ],
        "items_bi": [
            ("Ab urbe condita", "罗马历史的尺度与 civic memory，让 Livio 远远超过一个裸 historian-label。"),
        ],
    },
    "macrobio": {
        "lead_en": "Macrobio still lacks a mounted works set, but the room already has a stable intellectual pair of anchors.",
        "lead_bi": "Macrobio 还没有正式挂出的 works 集合，但这间房已经有一对稳定的 intellectual 锚点。",
        "items_en": [
            ("Commentary on the Dream of Scipio", "Cosmological and dream-theoretical reading keeps Macrobio structurally active."),
            ("Saturnalia", "Antiquarian and literary conversation widens the room beyond one Neoplatonic lane."),
        ],
        "items_bi": [
            ("Commentary on the Dream of Scipio", "宇宙论与梦理论的阅读，让 Macrobio 保持结构性的活跃。"),
            ("Saturnalia", "博物式、文学性的对话，让这间房超过单一的新柏拉图主义线路。"),
        ],
    },
    "san_pietro": {
        "lead_en": "This autore room still has no mounted work-tree, but the Petrine lane is already concrete enough to expose its main scriptural anchors.",
        "lead_bi": "这间 autore room 还没有正式挂出的 work-tree，但 Petrine lane 已经足够具体，可以直接露出它的主要 scriptural anchors。",
        "items_en": [
            ("Matthew 16", "Confession, keys, and ecclesial rank make Pietro legible as more than a bare apostolic name."),
            ("First Epistle of Peter", "Pastoral authority and testing pressure keep the apostolic voice active in commentary."),
            ("Second Epistle of Peter", "Warning, vigilance, and judgment thicken the hotter Paradiso lane."),
        ],
        "items_bi": [
            ("Matthew 16", "认信、钥匙和教会位阶，让 Pietro 超过一个裸使徒名字。"),
            ("First Epistle of Peter", "牧灵 authority 与试炼压力，让使徒声音持续活在 commentary 里。"),
            ("Second Epistle of Peter", "警醒、判断与 warning，让更炽热的 Paradiso lane 继续变厚。"),
        ],
    },
    "salomone": {
        "lead_en": "Salomone still lacks a mounted works set, but the sapiential cluster around him is already readable enough to name aloud.",
        "lead_bi": "Salomone 还没有正式挂出的 works 集合，但围绕他的 sapiential cluster 已经足够可读，可以直接点名。",
        "items_en": [
            ("Ecclesiastes", "Temporal wisdom, vanity, and measure keep the room inside a live sapiential corridor."),
            ("Proverbs", "Royal wisdom and ordered saying-pressure support the doctrinal shape of the room."),
            ("Song of Songs", "Devotional and allegorical afterlives keep Salomone from shrinking into a merely historical king."),
        ],
        "items_bi": [
            ("Ecclesiastes", "时间性的智慧、虚空和尺度，让这间房留在活着的 sapiential corridor 中。"),
            ("Proverbs", "王者智慧和箴言式的秩序压力，支撑这间房的 doctrinal shape。"),
            ("Song of Songs", "devotional 与 allegorical 的后效，让 Salomone 不会缩成一个纯历史国王。"),
        ],
    },
    "omero": {
        "lead_en": "Omero does not yet expose a local work tree, but the epic room already rests on two unmistakable anchors.",
        "lead_bi": "Omero 还没有露出本地 work tree，但这间 epic room 已经立在两根非常明确的锚上。",
        "items_en": [
            ("Iliad", "Epic seniority and war-poetic headship keep Omero at the visible front of the bella scola."),
            ("Odyssey", "Voyage and return-memory keep Homeric authority active behind later Ulysses traffic."),
        ],
        "items_bi": [
            ("Iliad", "史诗 seniority 和战争诗学的领首性，让 Omero 保持在 bella scola 的可见前排。"),
            ("Odyssey", "航行与回返记忆，让 Homeric authority 在后来的 Ulysses traffic 背后持续活着。"),
        ],
    },
    "orazio": {
        "lead_en": "Orazio still lacks a mounted work layer, but the Horatian room already has a stable triad of poetic anchors.",
        "lead_bi": "Orazio 还没有正式挂出的 work layer，但 Horatian room 已经有一组稳定的三联诗学锚点。",
        "items_en": [
            ("Ars poetica", "Poetics traffic and ars-language keep Orazio visible far beyond the Limbo tableau."),
            ("Carmina", "Lyric authority and moral-poetic maxims keep Horatian citation traffic circulating."),
            ("Epistulae", "The reflective and didactic Horace thickens the room beyond a single scenic appearance."),
        ],
        "items_bi": [
            ("Ars poetica", "poetics traffic 和 ars-language，让 Orazio 的可见度远远超出 Limbo tableau。"),
            ("Carmina", "抒情 authority 与 moral-poetic 箴言，让 Horatian citation traffic 持续流动。"),
            ("Epistulae", "反思性、教诲性的 Horace，让这间房超过一次性的场景露面。"),
        ],
    },
    "lucano": {
        "lead_en": "Lucano still has no mounted work tree, but one epic anchor already carries most of the room's force.",
        "lead_bi": "Lucano 现在还没有正式挂出的 work tree，但一根 epic 锚点已经承担了这间房的大部分力量。",
        "items_en": [
            ("Pharsalia", "Civil-war epic pressure keeps Lucano thicker than a bare bella scola residue."),
        ],
        "items_bi": [
            ("Pharsalia", "内战史诗的压力，让 Lucano 超过一个裸的 bella scola 残影。"),
        ],
    },
    "averroe": {
        "lead_en": "Averroè still lacks a mounted works set, but the room already points toward a coherent commentator spine.",
        "lead_bi": "Averroè 还缺正式挂出的 works 集合，但这间房已经指向一根成形的 commentator spine。",
        "items_en": [
            ("Commentary on De anima", "Soul-and-intellect traffic gives the clearest bridge between Limbo memory and later scholastic reading."),
            ("Commentary on Metaphysics", "Aristotelian mediation keeps Averroè legible as more than a generic sage."),
            ("Commentary on Physics", "Natural-philosophical exegesis rounds out the commentator profile."),
        ],
        "items_bi": [
            ("Commentary on De anima", "灵魂与 intellect 的 traffic，是 Limbo 记忆与后世 scholastic 阅读之间最清楚的桥。"),
            ("Commentary on Metaphysics", "Aristotelian 的中介工作，让 Averroè 超过一个 generic sage。"),
            ("Commentary on Physics", "自然哲学式的注释工作，补足这间 commentator 房间。"),
        ],
    },
    "avicenna": {
        "lead_en": "Avicenna still enters through a thin works layer, but the medical-philosophical cluster around him is already concrete enough to expose.",
        "lead_bi": "Avicenna 仍经由偏薄的 works layer 进入，但围绕他的 medical-philosophical cluster 已经足够具体，可以直接露出。",
        "items_en": [
            ("Canon of Medicine", "Medical authority keeps Avicenna from dissolving into a generic eastern sage."),
            ("Kitab al-Shifa'", "The encyclopedic philosophical lane gives the room more than one disciplinary register."),
            ("De anima", "Psychological and metaphysical traffic keep Avicenna connected to scholastic memory."),
        ],
        "items_bi": [
            ("Canon of Medicine", "医学 authority 让 Avicenna 不会融化成一个泛泛的 eastern sage。"),
            ("Kitab al-Shifa'", "百科式、哲学性的线路，让这间房不只停在单一学科 register。"),
            ("De anima", "心理学与形而上学的 traffic，让 Avicenna 继续挂在 scholastic 记忆上。"),
        ],
    },
    "tolomeo": {
        "lead_en": "Tolomeo's room still lacks a mounted work bundle, but the astronomical lane already has canonical anchors strong enough to surface.",
        "lead_bi": "Tolomeo 的房间还缺正式挂出的 work bundle，但 astronomical lane 已经有足够强的 canonical anchors 可以露出来。",
        "items_en": [
            ("Almagest", "The astronomical spine keeps Tolomeo from shrinking into a thin scientific residue."),
            ("Tetrabiblos", "Astral interpretation widens the room beyond one technical label."),
            ("Geography", "World-ordering imagination prevents Ptolemaic authority from collapsing into a single silo."),
        ],
        "items_bi": [
            ("Almagest", "天文学主脊让 Tolomeo 不会缩成一个薄薄的 scientific residue。"),
            ("Tetrabiblos", "星辰解释让这间房超过一个单一技术标签。"),
            ("Geography", "世界编排的想象力，防止 Ptolemaic authority 缩回单一隔间。"),
        ],
    },
    "orosius": {
        "lead_en": "Orosio still lacks a mounted work tree, but the room already rests on one strong historiographical anchor.",
        "lead_bi": "Orosio 还没有正式挂出的 work tree，但这间房已经立在一根很强的 historiographical 锚上。",
        "items_en": [
            ("Historiarum adversus paganos libri VII", "Providential history keeps Orosius visible as more than a thin late antique residue."),
        ],
        "items_bi": [
            ("Historiarum adversus paganos libri VII", "天意史学让 Orosio 超过一个薄薄的 late antique residue。"),
        ],
    },
    "papia": {
        "lead_en": "Papia still lacks a mounted work layer, but the lexical room already has a clear canonical anchor.",
        "lead_bi": "Papia 还没有正式挂出的 work layer，但 lexical room 已经有一根清楚的 canonical anchor。",
        "items_en": [
            ("Elementarium doctrinae erudimentum", "Lexical ordering and pedagogical reference keep Papia legible in scholastic traffic."),
        ],
        "items_bi": [
            ("Elementarium doctrinae erudimentum", "词汇编排和教学式 reference，让 Papia 在 scholastic traffic 中保持可读。"),
        ],
    },
    "plinius": {
        "lead_en": "Plinio still lacks a mounted work tree, but the encyclopedic room already has one obvious backbone.",
        "lead_bi": "Plinio 还没有正式挂出的 work tree，但 encyclopedic room 已经有一根明显的主脊。",
        "items_en": [
            ("Naturalis historia", "The vast natural compendium keeps Plinio visible as more than a loose ancient authority."),
        ],
        "items_bi": [
            ("Naturalis historia", "庞大的自然汇编，让 Plinio 超过一个松散的古代 authority。"),
        ],
    },
    "salustio": {
        "lead_en": "Salustio still lacks a mounted works set, but the historical room already has a tight Roman pair of anchors.",
        "lead_bi": "Salustio 还没有正式挂出的 works 集合，但 historical room 已经有一对紧凑的罗马锚点。",
        "items_en": [
            ("Bellum Catilinae", "Political crisis and moral history keep Sallustian authority alive."),
            ("Bellum Iugurthinum", "War narrative and Roman decline-pressure widen the room beyond one conspiracy tale."),
        ],
        "items_bi": [
            ("Bellum Catilinae", "政治危机和道德史，让 Sallustian authority 保持活着。"),
            ("Bellum Iugurthinum", "战争叙事与罗马衰败压力，让这间房超过单一阴谋故事。"),
        ],
    },
    "servio": {
        "lead_en": "Servio still has no mounted work tree, but the room already points to a very clear Virgilian commentary spine.",
        "lead_bi": "Servio 还没有正式挂出的 work tree，但这间房已经指向一根非常清楚的 Virgilian commentary spine。",
        "items_en": [
            ("Commentary on the Aeneid", "Virgilian exegesis is the main reason Servio stays structurally visible."),
            ("Commentary on the Georgics", "The agrarian and didactic Virgil thickens the room's commentary profile."),
            ("Commentary on the Eclogues", "Pastoral exegesis rounds out the Servian bridge to the whole Virgilian corpus."),
        ],
        "items_bi": [
            ("Commentary on the Aeneid", "对 Virgil 的解经工作，是 Servio 保持结构性可见的主因。"),
            ("Commentary on the Georgics", "农事和教诲性的 Virgil，让这间房的 commentary profile 继续变厚。"),
            ("Commentary on the Eclogues", "牧歌式解经，补足 Servian 与整个 Virgilian corpus 的桥。"),
        ],
    },
    "solino": {
        "lead_en": "Solino still lacks a mounted works set, but the antiquarian-geographical room already has a clear anchor.",
        "lead_bi": "Solino 还没有正式挂出的 works 集合，但 antiquarian-geographical room 已经有一根清楚的锚。",
        "items_en": [
            ("Collectanea rerum memorabilium", "Wonders, geography, and antique compilation keep Solino legible in encyclopedic traffic."),
        ],
        "items_bi": [
            ("Collectanea rerum memorabilium", "奇观、地理与古代汇编工作，让 Solino 在 encyclopedic traffic 中保持可读。"),
        ],
    },
    "svetonio": {
        "lead_en": "Svetonio still lacks a mounted work tree, but the biographical room already stands on two strong anchors.",
        "lead_bi": "Svetonio 还没有正式挂出的 work tree，但 biographical room 已经立在两根很强的锚上。",
        "items_en": [
            ("De vita Caesarum", "Imperial biography keeps Suetonian authority immediately legible."),
            ("De viris illustribus", "Literary and intellectual biography widens the room beyond imperial anecdote."),
        ],
        "items_bi": [
            ("De vita Caesarum", "帝王传记让 Suetonian authority 立刻可读。"),
            ("De viris illustribus", "文学与智识传记，让这间房超过纯 imperial anecdote。"),
        ],
    },
    "hugo_of_st_victor": {
        "lead_en": "Ugo di San Vittore still lacks a mounted work tree, but the Victorine room already has a compact contemplative core.",
        "lead_bi": "Ugo di San Vittore 还没有正式挂出的 work tree，但 Victorine room 已经有一个紧凑的 contemplative 核心。",
        "items_en": [
            ("Didascalicon", "The pedagogy of reading and ordered knowledge keeps Victorine authority structurally visible."),
            ("De sacramentis", "Sacramental synthesis gives the room a theological backbone beyond schoolroom method."),
            ("De arrha animae", "Contemplative and affective prose keeps the room from becoming purely schematic."),
        ],
        "items_bi": [
            ("Didascalicon", "阅读教学和知识秩序，让 Victorine authority 保持结构性的可见。"),
            ("De sacramentis", "圣事综合，让这间房在 schoolroom method 之外也有一根神学主脊。"),
            ("De arrha animae", "默观性、感情性的 prose，让这间房不至于变成纯图式。"),
        ],
    },
    "valerio_massimo": {
        "lead_en": "Valerio Massimo still lacks a mounted work tree, but the exempla-room already has one strong canonical anchor.",
        "lead_bi": "Valerio Massimo 还没有正式挂出的 work tree，但 exempla-room 已经有一根很强的 canonical 锚。",
        "items_en": [
            ("Facta et dicta memorabilia", "The exempla-archive keeps Valerian authority alive in moral and rhetorical commentary."),
        ],
        "items_bi": [
            ("Facta et dicta memorabilia", "exempla 档案让 Valerian authority 活在道德和修辞 commentary 中。"),
        ],
    },
    "augustine": {
        "lead_en": "Agostino already has a usable work room, but the strongest reading pressure still comes from the patristic pairing of memory and civitas.",
        "lead_bi": "Agostino 已经有可用的 work room，但最强的阅读压力仍来自记忆与 civitas 这组 patristic 双脊。",
        "items_en": [
            ("Confessiones", "Interior memory and conversion keep the room personal rather than merely doctrinal."),
            ("De civitate Dei", "Civic history and providential order give the room its widest theological scale."),
        ],
        "items_bi": [
            ("Confessiones", "记忆与皈依，让这间房保持个人性，而不只是 doctrinal。"),
            ("De civitate Dei", "城邦历史与天意秩序，给这间房最宽的神学尺度。"),
        ],
    },
    "aristotle": {
        "lead_en": "Aristotle already has a dense works tree, but the room still reads most strongly through soul, ethics, being, and poetic form.",
        "lead_bi": "Aristotle 已经有很密的 works tree，但这间房最强的阅读压力仍来自 soul、ethics、being 和 poetic form。",
        "items_en": [
            ("De anima", "Intellect and soul keep the room philosophically central."),
            ("Ethica Nicomachea", "Virtue and habit give the room its practical moral pressure."),
            ("Metafisica", "Being and first causes keep the room doctrinally tall."),
            ("Poetica", "Mimesis and form keep Aristotle alive inside literary commentary."),
        ],
        "items_bi": [
            ("De anima", "intellect 与 soul 让这间房保持哲学中心性。"),
            ("Ethica Nicomachea", "德性与习惯，给这间房实践性的 moral pressure。"),
            ("Metafisica", "存在与第一因，让这间房在 doctrinal 上很高。"),
            ("Poetica", "mimesis 与 form，让 Aristotle 活在文学 commentary 里。"),
        ],
    },
    "boethius": {
        "lead_en": "Boezio reads most intensely where philosophical consolation meets exile, fortune, and providence.",
        "lead_bi": "Boezio 最强的阅读压力，来自哲学安慰与流放、命运、天意的交汇。",
        "items_en": [
            ("Consolatio Philosophiae", "Fortune and providence keep the room emotionally and doctrinally charged."),
        ],
        "items_bi": [
            ("Consolatio Philosophiae", "命运与天意，让这间房同时带着情绪和 doctrinal 压力。"),
        ],
    },
    "paul_the_apostle": {
        "lead_en": "Paolo Apostolo already has stable epistolary rooms, but the sharpest pressure still comes from grace, election, and resurrection speech.",
        "lead_bi": "Paolo Apostolo 已经有稳定的 epistolary rooms，但最强的压力仍来自 grace、election 和 resurrection 的语言。",
        "items_en": [
            ("Lettera ai Romani", "Grace, law, and election give the room its deepest doctrinal engine."),
            ("Prima lettera ai Corinzi", "Charity and resurrection keep the room liturgically and morally alive."),
        ],
        "items_bi": [
            ("Lettera ai Romani", "恩宠、律法与拣选，给这间房最深的 doctrinal engine。"),
            ("Prima lettera ai Corinzi", "爱德与复活，让这间房在礼仪与道德层面继续活着。"),
        ],
    },
    "psalmist": {
        "lead_en": "Salmista already has a thick scriptural room, but lament, praise, and penitential pressure still carry the strongest current.",
        "lead_bi": "Salmista 已经有很厚的 scriptural room，但哀歌、赞美和 penitential pressure 仍是最强电流。",
        "items_en": [
            ("Salmi", "Prayer, lament, and praise keep the room mobile across the whole commentary field."),
        ],
        "items_bi": [
            ("Salmi", "祈祷、哀歌与赞美，让这间房在整个 commentary field 里保持流动。"),
        ],
    },
    "dante": {
        "lead_en": "Dante now has a mounted authority room of his own; the strongest current runs through self-citation, political doctrine, vernacular theory, and autobiographical memory.",
        "lead_bi": "Dante 现在已经有自己的 authority room；最强电流来自自我引用、政治理论、俗语诗学和自传性记忆。",
        "items_en": [
            ("Convivio", "Philosophical prose and self-commentary give the room its broadest reflective threshold."),
            ("De Monarchia", "Political doctrine keeps the room vertically tied to empire, justice, and history."),
            ("Vita Nuova", "Autobiographical memory and lyric prose stop Dante from collapsing into doctrine alone."),
            ("De vulgari eloquentia", "Vernacular theory keeps the room visibly philological as well as poetic."),
        ],
        "items_bi": [
            ("Convivio", "哲学性 prose 与自我评论，给这间房最宽的反思入口。"),
            ("De Monarchia", "政治理论让这间房始终挂在帝国、正义和历史上。"),
            ("Vita Nuova", "自传性记忆与 lyric prose，防止 Dante 缩成纯 doctrine。"),
            ("De vulgari eloquentia", "俗语理论让这间房同时保持 philological 与 poetic 可见。"),
        ],
    },
    "cicero": {
        "lead_en": "Cicerone reads most strongly where Roman eloquence turns into moral and philosophical architecture.",
        "lead_bi": "Cicerone 最强的阅读压力，来自罗马雄辩转成 moral 与 philosophical architecture 的地方。",
        "items_en": [
            ("Tusculanae Disputationes", "Death, pain, and virtue keep the room morally reusable."),
            ("De officiis", "Civic duty and ethical speech widen the room beyond rhetoric alone."),
            ("Somnium Scipionis", "Cosmic and political afterlife keep the room vertically open."),
        ],
        "items_bi": [
            ("Tusculanae Disputationes", "死亡、痛苦与德性，让这间房在 moral 上很可复用。"),
            ("De officiis", "城邦职责与伦理话语，让这间房超过纯 rhetoric。"),
            ("Somnium Scipionis", "宇宙与政治的后效，让这间房向上打开。"),
        ],
    },
    "ovid": {
        "lead_en": "Ovidio already branches well, but metamorphosis, erotic epistolarity, and festive Roman time still set the room’s main pulse.",
        "lead_bi": "Ovidio 已经有不错的分叉，但变形、书信式 erotics 和罗马节历时间仍是这间房的主脉搏。",
        "items_en": [
            ("Metamorphoses", "Transformation keeps the room perpetually mobile."),
            ("Heroides", "Voiced letters give the room its intimate rhetorical heat."),
            ("Fasti", "Ritual calendar widens the room into civic-temporal memory."),
        ],
        "items_bi": [
            ("Metamorphoses", "变形让这间房一直处于流动中。"),
            ("Heroides", "具声部的书信，给这间房亲密的修辞热度。"),
            ("Fasti", "仪式历法，让这间房打开 civic-temporal memory。"),
        ],
    },
    "seneca": {
        "lead_en": "Seneca reads through moral discipline on one side and tragic extremity on the other.",
        "lead_bi": "Seneca 的阅读压力，一边来自 moral discipline，一边来自悲剧极端。",
        "items_en": [
            ("Epistulae morales", "Stoic address gives the room its steady ethical current."),
            ("Hercules Furens", "Tragic furor keeps the room from flattening into moral prose alone."),
        ],
        "items_bi": [
            ("Epistulae morales", "斯多葛式的 address，给这间房稳定的伦理电流。"),
            ("Hercules Furens", "悲剧性的 furor，防止这间房塌成单纯 moral prose。"),
        ],
    },
    "platone": {
        "lead_en": "Platone already has multiple rooms, but the strongest pressure still comes from justice, eros, and the soul’s endurance.",
        "lead_bi": "Platone 已经有多间房，但最强压力仍来自 justice、eros 和 soul 的持续性。",
        "items_en": [
            ("Republic / Repubblica", "Justice and the cave give the room its broadest civic-philosophical scale."),
            ("Symposium / Simposio", "Eros keeps the room warm and dialogic."),
            ("Phaedo / Fedone", "Immortality keeps the room existentially taut."),
        ],
        "items_bi": [
            ("Republic / Repubblica", "正义与洞穴，给这间房最宽的 civic-philosophical 尺度。"),
            ("Symposium / Simposio", "eros 让这间房保持温度和对话性。"),
            ("Phaedo / Fedone", "不朽问题让这间房一直绷着。"),
        ],
    },
    "tommaso_daquino": {
        "lead_en": "Tommaso d'Aquino already has a large scholastic room, but God, virtues, and intellect still organize the reading pressure most clearly.",
        "lead_bi": "Tommaso d'Aquino 已经有很大的 scholastic room，但 God、virtues 和 intellect 仍最清楚地组织着阅读压力。",
        "items_en": [
            ("Summa theologiae", "Theological architecture gives the room its broadest frame."),
            ("Contra Gentiles", "Argumentative theology keeps the room outward-facing and polemical."),
            ("Quaestio de anima", "Intellect and soul keep the room philosophically tight."),
        ],
        "items_bi": [
            ("Summa theologiae", "神学结构给这间房最宽的框架。"),
            ("Contra Gentiles", "论证性的神学，让这间房保持 outward-facing 与 polemical。"),
            ("Quaestio de anima", "intellect 与 soul，让这间房在哲学上保持紧。"),
        ],
    },
}

WORK_CURATED_BRANCH_ANCHORS = {
    ("virgilio", "aeneis"): {
        "lead_en": "Aeneis still has no mounted local branch pages, but the room already opens through its strongest narrative corridors.",
        "lead_bi": "Aeneis 还没有正式挂出的本地 branch 页，但这间房已经能通过最强的叙事走廊进入。",
        "items_en": [("Book I", "Storm, landing, and first epic orientation keep the room immediately readable."), ("Book VI", "Katabasis and underworld memory are the deepest authority bridge into Dante."), ("Book XII", "The final duel gives the room its terminal political-epic pressure.")],
        "items_bi": [("Book I", "风暴、登陆和开场史诗取向，让这间房一开始就可读。"), ("Book VI", "下界之行和冥府记忆，是这间房通往 Dante 的最深 authority bridge。"), ("Book XII", "终局决斗给这间房最后的政治/史诗压力。")],
    },
    ("virgilio", "georgica"): {
        "lead_en": "Georgica currently reads through thematic labor and cosmological craft rather than local branch pages.",
        "lead_bi": "Georgica 现在主要通过劳作主题和宇宙性技艺来进入，而不是本地 branch 页。",
        "items_en": [("Book I", "Agricultural order and cosmic signs establish the didactic frame."), ("Book II", "Vines, cultivation, and praise of Italy widen the civic-agrarian lane."), ("Book IV", "Bees and Orpheus keep the room alive through allegorical afterlife.")],
        "items_bi": [("Book I", "农业秩序和天象建立了 didactic frame。"), ("Book II", "葡萄、耕作和意大利赞歌，把 civic-agrarian lane 打开。"), ("Book IV", "蜜蜂与 Orpheus，让这间房通过 allegorical afterlife 保持活性。")],
    },
    ("virgilio", "eclogae"): {
        "lead_en": "Eclogae still comes through pastoral pressure and citation memory rather than separate branch pages.",
        "lead_bi": "Eclogae 现在主要通过 pastoral pressure 和 citation memory 进入，而不是独立 branch 页。",
        "items_en": [("Eclogue I", "Pastoral exile and political displacement keep the room historically alert."), ("Eclogue IV", "Messianic afterlife gives the room its strongest medieval afterglow."), ("Eclogue VI", "Mythic-pastoral compression widens the room beyond simple shepherd song.")],
        "items_bi": [("Eclogue I", "田园流放和政治位移，让这间房保持历史敏感。"), ("Eclogue IV", "弥赛亚式后效，给这间房最强的 medieval afterglow。"), ("Eclogue VI", "神话/田园的压缩，让这间房超过单纯牧歌。")],
    },
    ("stazio", "thebais"): {
        "lead_en": "Thebais still has no mounted branch tree, but its epic room already opens through a few heavy books.",
        "lead_bi": "Thebais 还没有正式 branch tree，但它的 epic 房间已经能通过几本重书进入。",
        "items_en": [("Book I", "The curse and fraternal war set the room’s tragic engine in motion."), ("Book VIII", "Violence and lament sharpen the room’s darker epic pressure."), ("Book XII", "Closure, burial, and civic grief give the room its terminal contour.")],
        "items_bi": [("Book I", "诅咒和手足战争启动了这间房的悲剧引擎。"), ("Book VIII", "暴力与哀悼，让这间房更黑的 epic pressure 变得清楚。"), ("Book XII", "结局、埋葬和城邦悲伤，给这间房最后的轮廓。")],
    },
    ("stazio", "achilleis"): {
        "lead_en": "Achilleis is still thin locally, but the room already opens through Achilles’ concealment and emergence.",
        "lead_bi": "Achilleis 的本地结构还薄，但这间房已经能通过 Achilles 的隐藏与现身进入。",
        "items_en": [("Scyros episode", "Disguise and delayed heroism keep the room structurally memorable."), ("Achilles revealed", "The exposure of the hero gives the room its clearest hinge.")],
        "items_bi": [("Scyros episode", "伪装与延迟的英雄性，让这间房有清楚的记忆点。"), ("Achilles revealed", "英雄现身，给这间房最清楚的转轴。")],
    },
    ("cicerone", "tusculanae_disputationes"): {
        "lead_en": "Tusculanae Disputationes reads through philosophical loci rather than mounted branch pages.",
        "lead_bi": "Tusculanae Disputationes 现在主要通过哲学 loci 进入，而不是本地 branch 页。",
        "items_en": [("Death", "Meditation on death gives the room its most reusable moral spine."), ("Pain", "Stoic handling of suffering keeps the room active in ethical commentary."), ("Virtue and happiness", "The moral architecture of flourishing gives the work its durable afterlife.")],
        "items_bi": [("Death", "关于死亡的沉思，给这间房最可复用的 moral spine。"), ("Pain", "对痛苦的斯多葛处理，让这间房在伦理 commentary 中继续活着。"), ("Virtue and happiness", "关于幸福与德性的结构，让这部作品有持久后效。")],
    },
    ("ovidio", "fasti"): {
        "lead_en": "Fasti currently reads through calendrical and ritual stations rather than separate branch pages.",
        "lead_bi": "Fasti 现在主要通过历法与仪式节点进入，而不是独立 branch 页。",
        "items_en": [("January", "Calendar opening and Roman timekeeping make the room immediately legible."), ("March", "Ritual and civic seasonality thicken the Roman religious lane."), ("June", "Festival texture keeps the room alive as cultural memory rather than bare antiquarianism.")],
        "items_bi": [("January", "历法开场和罗马时间秩序，让这间房立刻可读。"), ("March", "仪式与 civic seasonality，让罗马宗教这条线变厚。"), ("June", "节庆纹理让这间房保持为文化记忆，而不只是 antiquarianism。")],
    },
    ("platone", "republic_repubblica"): {
        "lead_en": "Republic / Repubblica already has strong argumentative corridors even without local branch pages.",
        "lead_bi": "Republic / Repubblica 即使没有本地 branch 页，也已经有很强的论证走廊。",
        "items_en": [("Justice", "The question of justice remains the room’s first and clearest threshold."), ("Cave", "The allegory of the cave gives the room its most portable afterlife."), ("Myth of Er", "Eschatological closure ties the room back into moral and cosmic reading.")],
        "items_bi": [("Justice", "正义问题仍是这间房最清楚的入口。"), ("Cave", "洞穴寓言给这间房最可迁移的后效。"), ("Myth of Er", "末世论式的结尾，让这间房重新挂回 moral/cosmic reading。")],
    },
    ("platone", "phaedo_fedone"): {
        "lead_en": "Phaedo / Fedone is still locally unbranched, but its room already turns on immortality and final speech.",
        "lead_bi": "Phaedo / Fedone 还没有本地 branch，但这间房已经围绕灵魂不朽和最后时刻转动。",
        "items_en": [("Immortality of the soul", "The central argument gives the room its doctrinal spine."), ("Socrates’ death", "The final scene keeps the room existential rather than purely abstract.")],
        "items_bi": [("Immortality of the soul", "灵魂不朽论证给这间房 doctrinal spine。"), ("Socrates’ death", "最后场景让这间房不是纯抽象，而有存在论压力。")],
    },
    ("platone", "symposium_simposio"): {
        "lead_en": "Symposium / Simposio remains a dialogic room, opened best through speeches on eros.",
        "lead_bi": "Symposium / Simposio 仍是一间对话房，最适合通过关于 eros 的发言来进入。",
        "items_en": [("Speech of Diotima", "The ascent of love keeps the room structurally memorable."), ("Alcibiades’ entrance", "The late arrival widens the room beyond pure doctrine into drama.")],
        "items_bi": [("Speech of Diotima", "爱之上升，让这间房有结构性的记忆点。"), ("Alcibiades’ entrance", "后段 Alcibiades 的闯入，让这间房不只剩 doctrine，而重新变成戏。")],
    },
    ("platone", "de_immortalitate_anime"): {
        "lead_en": "De immortalitate anime currently reads as an immortality-focused Platonic lane rather than a local branch tree.",
        "lead_bi": "De immortalitate anime 现在更像一条柏拉图式的灵魂不朽线路，而不是本地 branch tree。",
        "items_en": [("Soul’s endurance", "The room stays readable through the persistence of the soul."), ("Philosophical purification", "Purification gives the room an ascensional moral contour.")],
        "items_bi": [("Soul’s endurance", "通过灵魂的持续性，这间房保持可读。"), ("Philosophical purification", "净化主题给这间房上升性的 moral contour。")],
    },
    ("seneca", "hercules_furens"): {
        "lead_en": "Hercules Furens still has no branch tree here, but its tragic room already opens through rage and aftermath.",
        "lead_bi": "Hercules Furens 还没有 branch tree，但悲剧房间已经能通过狂怒与余波进入。",
        "items_en": [("Furor", "Madness remains the room’s strongest tragic hinge."), ("Recognition", "The aftermath of violence gives the room its most painful contour.")],
        "items_bi": [("Furor", "狂怒仍是这间房最强的悲剧转轴。"), ("Recognition", "暴力后的认出，让这间房得到最痛的轮廓。")],
    },
    ("tommaso_daquino", "summa_theologiae"): {
        "lead_en": "Summa theologiae is still locally unbranched here, but the room already opens through its major doctrinal corridors.",
        "lead_bi": "Summa theologiae 在这里还没有本地 branch，但这间房已经能通过几条大 doctrinal corridor 进入。",
        "items_en": [("God", "Questions on God keep the room doctrinally grounded."), ("Virtues", "The moral architecture of virtue gives the room its broadest practical lane."), ("Beatitude", "The end of human life keeps the room tied to teleology and salvation.")],
        "items_bi": [("God", "关于上帝的问题，让这间房保持 doctrinal grounding。"), ("Virtues", "德性结构给这间房最宽的实践性走廊。"), ("Beatitude", "人的终极幸福，让这间房始终挂在 teleology 与 salvation 上。")],
    },
    ("tommaso_daquino", "contra_gentiles"): {
        "lead_en": "Contra Gentiles still comes through its argumentative backbone rather than local branch pages.",
        "lead_bi": "Contra Gentiles 现在主要通过论证主脊进入，而不是本地 branch 页。",
        "items_en": [("Natural theology", "Rational speech about God gives the room its first threshold."), ("Creation and providence", "Cosmological argument thickens the room beyond apologetic shorthand.")],
        "items_bi": [("Natural theology", "关于上帝的理性话语，是这间房的第一道门槛。"), ("Creation and providence", "关于创造与护理的宇宙论论证，让这间房超过简单护教学。")],
    },
    ("tommaso_daquino", "sentences_commentary"): {
        "lead_en": "Sentences commentary reads best through scholastic loci rather than local branch pages.",
        "lead_bi": "Sentences commentary 现在最适合通过 scholastic loci 进入，而不是本地 branch 页。",
        "items_en": [("Creation", "The Lombard frame opens onto a major doctrinal corridor."), ("Grace", "Grace and causality keep the room active in theological traffic.")],
        "items_bi": [("Creation", "Lombard 的框架打开了一条大 doctrinal corridor。"), ("Grace", "恩宠与因果，让这间房继续活在 theological traffic 里。")],
    },
    ("tommaso_daquino", "quaestio_de_anima"): {
        "lead_en": "Quaestio de anima remains a focused philosophical room, best opened through intellect and soul.",
        "lead_bi": "Quaestio de anima 仍是一间集中而哲学性的房间，最适合通过 intellect 与 soul 进入。",
        "items_en": [("Intellect", "The problem of intellect keeps the room tightly legible."), ("Substantial form", "Soul as form gives the room its Aristotelian hinge.")],
        "items_bi": [("Intellect", "intellect 的问题让这间房保持紧凑的可读。"), ("Substantial form", "灵魂作为 form，给这间房最清楚的 Aristotelian hinge。")],
    },
    ("tommaso_daquino", "catena_aurea"): {
        "lead_en": "Catena aurea still reads through gathered patristic voices rather than local branch pages.",
        "lead_bi": "Catena aurea 现在主要通过汇聚的 patristic voices 进入，而不是本地 branch 页。",
        "items_en": [("Matthew chain", "Patristic gloss on Matthew keeps the room visibly scriptural."), ("John chain", "Johannine catena widens the room into contemplative exegesis.")],
        "items_bi": [("Matthew chain", "围绕 Matthew 的教父链，让这间房保持可见的 scriptural 性。"), ("John chain", "Johannine catena 把这间房拉向默观式解经。")],
    },
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def build_curated_room_anchor_payload() -> dict:
    author_payload = {}
    for author_id, meta in AUTHOR_CURATED_WORK_ANCHORS.items():
        author_payload[author_id] = {
            "lead_en": meta.get("lead_en") or "",
            "lead_bi": meta.get("lead_bi") or "",
            "items_en": [
                {"label": label, "note": note}
                for label, note in (meta.get("items_en") or [])
            ],
            "items_bi": [
                {"label": label, "note": note}
                for label, note in (meta.get("items_bi") or [])
            ],
        }
    work_payload = {}
    for (author_slug, work_slug), meta in WORK_CURATED_BRANCH_ANCHORS.items():
        work_payload[f"{author_slug}/{work_slug}"] = {
            "lead_en": meta.get("lead_en") or "",
            "lead_bi": meta.get("lead_bi") or "",
            "items_en": [
                {"label": label, "note": note}
                for label, note in (meta.get("items_en") or [])
            ],
            "items_bi": [
                {"label": label, "note": note}
                for label, note in (meta.get("items_bi") or [])
            ],
        }
    return {
        "author_work_anchors": author_payload,
        "work_branch_anchors": work_payload,
    }


def display_name(author: dict) -> str:
    return DISPLAY_NAME_OVERRIDES.get(author.get("author_id"), author.get("canonical_name") or author.get("author_id") or "")


def author_public_slug(author: dict) -> str:
    return str(author.get("public_slug_it") or slugify(display_name(author))).strip() or "autore"


def work_display_name(author_id: str | None, work_name: str | None) -> str:
    if not work_name:
        return "Opera"
    return WORK_DISPLAY_OVERRIDES.get((author_id or "", work_name), work_name)


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower().replace("'", "").replace(".", " ")
    ascii_text = re.sub(r"[^a-z0-9]+", "_", ascii_text)
    ascii_text = re.sub(r"_+", "_", ascii_text).strip("_")
    return ascii_text or "autore"


def esc(text: str | int | None) -> str:
    return html.escape("" if text is None else str(text))


def normalize_ready_ui_text(text: str | int | None) -> str:
    value = "" if text is None else str(text)
    return (
        value.replace("ready-with-caveat", "ready")
        .replace("ready_with_caveat", "ready")
        .replace("ready with caveat", "ready")
        .replace("review-first", "ready")
        .replace("review_first", "ready")
        .replace("Review First", "Ready")
        .replace("commentary-author shell", "commentary-author room")
        .replace("commentator-author shell", "commentator-author room")
        .replace("author shell", "authority room")
        .replace("author-shell", "authority-room")
        .replace("stable authority room of its own", "stable authority room of its own")
        .replace("conservative static shell", "thin static shell")
        .replace("more conservative", "unchanged")
    )


def contains_cjk(text: str | int | None) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", "" if text is None else str(text)))


def build_author_frontend_note_en(author: dict) -> str:
    raw_note = normalize_ready_ui_text(author.get("frontend_notes") or "")
    if not raw_note:
        return "No extra note currently attached."
    if not contains_cjk(raw_note):
        return raw_note
    name = display_name(author)
    mention_count = int(author.get("total_mentions") or 0)
    work_mention_count = int(author.get("total_work_mentions") or 0)
    text_hit_count = int(author.get("text_occurrence_total") or 0)
    work_mode = str(author.get("works_layer_mode") or "").strip()
    if not mention_count and not work_mention_count and not text_hit_count:
        return (
            f"{name} is mounted as a completed authority room, but the local sample does not currently expose "
            "commentary occurrences, work mentions, or direct poem-layer hits. Use the curated anchors and static "
            "rooms below as the current reading path."
        )
    if work_mode == "no_work_layer":
        return (
            f"{name} is mounted as a completed authority room. The present reading path stays commentary-first: "
            "start from local text hits when they exist, then commentary traffic, and only then move into curated "
            "work anchors."
        )
    if work_mode == "special_case_object":
        return (
            f"{name} is mounted as a completed authority room. This object still reads best through a controlled "
            "special-case path rather than through a generic work tree."
        )
    return (
        f"{name} is mounted as a completed authority room. Start from the local text layer when available, then "
        "move through commentary occurrences and the current work layer."
    )


def build_author_text_note_en(author: dict) -> str:
    raw_note = normalize_ready_ui_text(author.get("text_layer_note") or "")
    if not raw_note:
        return "No text-layer note currently available."
    if not contains_cjk(raw_note):
        return raw_note
    name = display_name(author)
    text_hit_count = int(author.get("text_occurrence_total") or 0)
    if text_hit_count > 0:
        return (
            f"{name} currently exposes {text_hit_count} direct poem-layer hit"
            f"{'' if text_hit_count == 1 else 's'} in the mounted sample. Start from those lines before moving "
            "back into commentary and curated work anchors."
        )
    return (
        f"No stable direct poem-layer alias hit is currently mounted for {name}; this room currently opens more "
        "honestly through commentary traffic and curated work anchors."
    )


def build_author_work_note_en(author: dict, curated: dict | None = None) -> str:
    raw_note = normalize_ready_ui_text(author.get("works_layer_note") or "")
    if raw_note and not contains_cjk(raw_note):
        return raw_note
    name = display_name(author)
    work_mode = str(author.get("works_layer_mode") or "").strip()
    work_count = len(author.get("works") or [])
    occurrence_count = len(author.get("occurrences") or [])
    if work_mode == "no_work_layer" and not work_count and not occurrence_count:
        if curated and curated.get("lead_en"):
            return str(curated.get("lead_en"))
        return (
            f"{name} currently opens through a curated work layer: no mounted local work bundle is exposed here yet, "
            "so use the named anchors below as the present reading path."
        )
    if work_mode == "no_work_layer":
        return (
            f"{name} still opens through a curated work layer: keep the room readable through the current anchors "
            "and sampled commentary occurrences, without pretending that a full local work tree is already mounted."
        )
    if work_mode == "flat_work_overview":
        return (
            f"{name} currently opens through a flat work overview: keep the main works visible and readable, but do "
            "not overstate the room as a fully branched local tree."
        )
    if work_mode == "special_case_object":
        return f"{name} currently opens through a controlled special-case work path rather than a generic work tree."
    return f"{name} currently exposes the mounted work layer that belongs to this room."


def format_alias_list(items: list[str]) -> str:
    if not items:
        return "<span class=\"muted\">none</span>"
    return ", ".join(esc(item) for item in items)


def format_occurrence_label(example: dict) -> str:
    cantica = example.get("cantica") or ""
    canto = example.get("canto")
    line_number = example.get("line_number")
    parts = [cantica]
    if canto is not None:
        parts.append(str(canto))
    if line_number is not None:
        parts.append(str(line_number))
    return " ".join(part for part in parts if part)


def render_alias_examples(examples: list[dict]) -> str:
    if not examples:
        return '<p class="help-paragraph muted">No example lines frozen yet.</p>'
    rows = []
    for example in examples:
        label = format_occurrence_label(example)
        line_text = example.get("line_text") or ""
        rows.append(
            f'<li><strong>{esc(label)}</strong> · {esc(line_text)}</li>'
        )
    return f'<ul class="help-list alias-example-list">{"".join(rows)}</ul>'


def render_structured_alias_bands(alias_meta: dict, bilingual: bool = False) -> str:
    bands = alias_meta.get("poem_layer_structured_bands") or []
    if not bands:
        return ""
    blocks = []
    for band in bands:
        title = band.get("title_bi") if bilingual else band.get("title_en")
        intro = band.get("intro_bi") if bilingual else band.get("intro_en")
        chips = []
        for item in band.get("items") or []:
            note = item.get("note_bi") if bilingual else item.get("note_en")
            count = item.get("count")
            count_markup = f"<small>{esc(count)}x</small>" if count else ""
            chips.append(
                f"""
                <details class="alias-chip-card">
                  <summary class="alias-chip-summary term-chip">
                    <span>{esc(item.get('label'))}</span>
                    {count_markup}
                  </summary>
                  <div class="alias-chip-panel">
                    <p class="help-paragraph">{esc(note)}</p>
                    {render_alias_examples(item.get("examples") or [])}
                  </div>
                </details>
                """
            )
        blocks.append(
            f"""
            <section class="help-section alias-band-block">
              <h4>{esc(title)}</h4>
              <p class="help-paragraph">{esc(intro)}</p>
              <div class="alias-chip-grid">
                {''.join(chips)}
              </div>
            </section>
            """
        )
    return "".join(blocks)


def render_reference_bands(alias_meta: dict, bilingual: bool = False) -> str:
    bands = alias_meta.get("poem_layer_reference_bands") or []
    if not bands:
        return ""
    blocks = []
    for band in bands:
        title = band.get("title_bi") if bilingual else band.get("title_en")
        intro = band.get("intro_bi") if bilingual else band.get("intro_en")
        chips = []
        for item in band.get("items") or []:
            note = item.get("note_bi") if bilingual else item.get("note_en")
            chips.append(
                f"""
                <details class="alias-chip-card">
                  <summary class="alias-chip-summary term-chip">
                    <span>{esc(item.get('label'))}</span>
                  </summary>
                  <div class="alias-chip-panel">
                    <p class="help-paragraph">{esc(note)}</p>
                    {render_alias_examples(item.get("examples") or [])}
                  </div>
                </details>
                """
            )
        blocks.append(
            f"""
            <section class="help-section alias-band-block">
              <h4>{esc(title)}</h4>
              <p class="help-paragraph">{esc(intro)}</p>
              <div class="alias-chip-grid">
                {''.join(chips)}
              </div>
            </section>
            """
        )
    return "".join(blocks)


def render_virgilio_appendix_ledger(bilingual: bool = False) -> str:
    if not VIRGILIO_APPENDIX_LEDGER:
        return ""
    groups = [
        ("in_alias", "Already frozen in alias layers", "已收进 alias 层"),
        ("in_refer", "Already frozen in reference field", "已收进 refer 层"),
        ("should_live_in_scene_note", "Better kept in scene-note prose", "更适合留在 scene-note prose"),
        ("not_yet_frozen", "Still not frozen", "还没冻结"),
    ]
    sections = []
    for status, title_en, title_bi in groups:
        rows = [row for row in VIRGILIO_APPENDIX_LEDGER if row.get("status") == status]
        if not rows:
            continue
        title = title_bi if bilingual else title_en
        items = []
        for row in rows:
            items.append(
                f"<li><strong>{esc(row.get('surface'))}</strong> · {esc(row.get('why'))}</li>"
            )
        sections.append(
            f"""
            <section class="help-section appendix-ledger-block">
              <h4>{esc(title)}</h4>
              <ul class="help-list">{''.join(items)}</ul>
            </section>
            """
        )
    return "".join(sections)


def render_personaggio_tail_ledger(slug: str, bilingual: bool = False) -> str:
    ledger = PERSONAGGIO_TAIL_LEDGERS.get(slug) or {}
    rows = ledger.get("rows") or []
    if not rows:
        return ""
    groups = [
        ("in_stable_alias", "Already frozen in stable aliases", "已收进稳定 alias"),
        ("in_cue_alias", "Already frozen in cue aliases", "已收进提示 alias"),
        ("in_caveated_alias", "Already frozen in caveated aliases", "已收进保留 alias"),
        ("in_poem_exact", "Already frozen in poem-layer exact forms", "已收进正文层明确形式"),
        ("in_poem_role", "Already frozen in poem-layer role cues", "已收进正文层角色提示"),
        ("not_yet_frozen", "Still not frozen", "还没冻结"),
    ]
    sections = []
    for status, title_en, title_bi in groups:
        band = [row for row in rows if row.get("status") == status]
        if not band:
            continue
        title = title_bi if bilingual else title_en
        items = []
        for row in band:
            items.append(
                f"<li><strong>{esc(row.get('surface'))}</strong> · {esc(row.get('why'))}</li>"
            )
        sections.append(
            f"""
            <section class="help-section appendix-ledger-block">
              <h4>{esc(title)}</h4>
              <ul class="help-list">{''.join(items)}</ul>
            </section>
            """
        )
    return "".join(sections)


def personaggio_scan_row(slug: str) -> dict:
    return PERSONAGGIO_SCAN_ROWS.get(slug) or {}


def personaggio_author_bridge_row(slug: str) -> dict:
    row = personaggio_scan_row(slug)
    author_id = row.get("author_id")
    if not author_id:
        return {}
    return AUTHOR_SHELL_ROWS.get(author_id) or {}


def render_personaggio_room_shape(slug: str, bilingual: bool = False) -> str:
    row = personaggio_scan_row(slug)
    if not row:
        return ""
    source_kind = "Autore-Personaggio" if row.get("author_id") else "standalone personaggio"
    lane = row.get("lane") or row.get("status") or "unknown"
    corridor = row.get("corridor_group") or PERSONAGGIO_CORRIDOR_GROUPS.get(slug) or "Other"
    items = [
        ("Room kind", "房间类型", source_kind),
        ("Corridor", "走廊", corridor),
        ("Lane", "lane", lane),
    ]
    if row.get("frontend_status"):
        items.append(("Autore status", "autore 状态", normalize_ready_ui_text(row.get("frontend_status"))))
    markup = "".join(
        f"<li><strong>{esc(label_bi if bilingual else label_en)}</strong> · {esc(value)}</li>"
        for label_en, label_bi, value in items
    )
    return f'<ul class="help-list">{markup}</ul>'


def render_personaggio_author_bridge(slug: str, bilingual: bool = False) -> str:
    row = personaggio_author_bridge_row(slug)
    if not row:
        scan_row = personaggio_scan_row(slug)
        if scan_row.get("author_id"):
            return ""
        if bilingual:
            return (
                "<p class=\"help-paragraph\">这间房目前故意保持为 standalone personaggio："
                "它的戏剧重量先来自 scene-presence，本阶段不强行回接 autore 壳层。</p>"
            )
        return (
            "<p class=\"help-paragraph\">This room currently stays intentionally standalone: "
            "its dramatic weight begins from scene-presence, so it is not forced back into an autore room yet.</p>"
        )
    detail = load_detail_object(row)
    items: list[tuple[str, str, str]] = []
    if row.get("display_name"):
        items.append(("Related autore room", "关联 autore 房间", row.get("display_name")))
    if row.get("frontend_status"):
        items.append(("Autore status", "autore 状态", normalize_ready_ui_text(row.get("frontend_status"))))
    if row.get("works_layer_mode"):
        items.append(("Works layer mode", "works layer 模式", normalize_ready_ui_text(row.get("works_layer_mode"))))
    if isinstance(row.get("text_occurrence_total"), int):
        items.append(("Poem text hits", "正文命中", str(row.get("text_occurrence_total"))))
    if isinstance(row.get("total_mentions"), int):
        items.append(("Commentary mentions", "注释命中", str(row.get("total_mentions"))))
    if detail and detail.get("overview"):
        overview = detail.get("overview") or {}
        if isinstance(overview.get("work_count"), int):
            items.append(("Visible works", "可见 works", str(overview.get("work_count"))))
        if isinstance(overview.get("sample_occurrence_count"), int):
            items.append(("Sample occurrences", "样本 occurrences", str(overview.get("sample_occurrence_count"))))
    if not items:
        return ""
    markup = "".join(
        f"<li><strong>{esc(label_bi if bilingual else label_en)}</strong> · {esc(value)}</li>"
        for label_en, label_bi, value in items
    )
    return f'<ul class="help-list">{markup}</ul>'


def render_personaggio_related_works(slug: str, bilingual: bool = False) -> str:
    curated = PERSONAGGIO_CURATED_WORK_ANCHORS.get(slug) or {}
    if curated:
        lead = curated.get("lead_bi" if bilingual else "lead_en") or ""
        items = curated.get("items_bi" if bilingual else "items_en") or []
        curated_markup = "".join(
            f"<li><strong>{esc(label)}</strong> · {esc(note)}</li>"
            for label, note in items
        )
        curated_block = (
            f'<p class="help-paragraph">{esc(lead)}</p><ul class="help-list">{curated_markup}</ul>'
            if items
            else ""
        )
    else:
        curated_block = ""
    row = personaggio_author_bridge_row(slug)
    if not row:
        if curated_block:
            return curated_block
        if bilingual:
            return (
                "<p class=\"help-paragraph\">这间房暂时没有稳定的 autore-side opera bridge。"
                "它首先是由场景走廊成立的角色房间，不该为了整齐硬补假 works。</p>"
            )
        return (
            "<p class=\"help-paragraph\">This room does not yet expose a stable autore-side works bridge. "
            "It should stay scene-first rather than pretending to have a fabricated work layer.</p>"
        )
    detail = load_detail_object(row)
    if not detail:
        works = row.get("works") or []
        items: list[str] = []
        for work in works[:5]:
            if not isinstance(work, dict):
                continue
            label = work_display_name(row.get("author_id"), work.get("canonical_work"))
            sample_count = (
                work.get("resolved_author_and_work")
                or work.get("count")
                or work.get("passage_mentions")
                or 0
            )
            if bilingual:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(sample_count))} 条相关样本</li>")
            else:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(sample_count))} related samples</li>")
        if not items:
            if curated_block:
                return curated_block
            if bilingual:
                return (
                    "<p class=\"help-paragraph\">这位相关 author 已经站住，但稳定的 works bridge 还没长出来。"
                    "这间房目前先保留 scene-pressure 和 author bridge，不伪装成已有 opera atlas。</p>"
                )
            return (
                "<p class=\"help-paragraph\">The related autore room is already stable, but a durable works bridge has not grown yet. "
                "For now this room keeps scene-pressure and the author bridge visible without pretending to have a finished opera atlas.</p>"
            )
        return f'<ul class="help-list">{"".join(items)}</ul>'
    items: list[str] = []
    if detail.get("work_cards"):
        for card in (detail.get("work_cards") or [])[:5]:
            label = work_display_name(row.get("author_id"), card.get("canonical_work"))
            sample_count = card.get("sample_occurrence_count") or card.get("count") or 0
            status = card.get("work_status") or card.get("status") or "work"
            if bilingual:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(sample_count))} 条样本 · {esc(status)}</li>")
            else:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(sample_count))} samples · {esc(status)}</li>")
    elif detail.get("works"):
        for work in (detail.get("works") or [])[:5]:
            label = work_display_label(row.get("author_id"), work)
            branch_count = len(work.get("children") or []) or len(work.get("branches") or [])
            if bilingual:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(branch_count))} 个分支</li>")
            else:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(branch_count))} branches</li>")
    elif isinstance(detail.get("work_branch_bundle"), dict):
        for work in (detail.get("work_branch_bundle", {}).get("works") or [])[:5]:
            if not isinstance(work, dict):
                continue
            label = work_display_label(row.get("author_id"), work)
            branch_count = len(work.get("children") or []) or len(work.get("branches") or [])
            if bilingual:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(branch_count))} 个分支</li>")
            else:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(branch_count))} branches</li>")
    if not items:
        works = row.get("works") or []
        for work in works[:5]:
            if not isinstance(work, dict):
                continue
            label = work_display_name(row.get("author_id"), work.get("canonical_work"))
            sample_count = (
                work.get("resolved_author_and_work")
                or work.get("count")
                or work.get("passage_mentions")
                or 0
            )
            if bilingual:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(sample_count))} 条相关样本</li>")
            else:
                items.append(f"<li><strong>{esc(label)}</strong> · {esc(str(sample_count))} related samples</li>")
    if not items:
        if curated_block:
            return curated_block
        if bilingual:
            return (
                "<p class=\"help-paragraph\">这里还没有足够稳定的 opera bundle 可以露出来。"
                "这并不代表房间是空的，只是它目前更依赖 scene-presence 和 authority room，而不是 works mapping。</p>"
            )
        return (
            "<p class=\"help-paragraph\">There is not yet a stable enough opera bundle to expose here. "
            "That does not make the room empty; it means the room currently depends more on scene-presence and the authority room than on finished works mapping.</p>"
        )
    return f'<ul class="help-list">{"".join(items)}</ul>'


def render_personaggio_room_thickness(slug: str, bilingual: bool = False) -> str:
    alias_meta = PERSONAGGIO_ALIAS_ATLAS.get(slug) or {}
    ledger_rows = VIRGILIO_APPENDIX_LEDGER if slug == "virgilio" else (PERSONAGGIO_TAIL_LEDGERS.get(slug, {}).get("rows") or [])
    structured_count = sum(len(band.get("items") or []) for band in alias_meta.get("poem_layer_structured_bands") or [])
    reference_count = sum(len(band.get("items") or []) for band in alias_meta.get("poem_layer_reference_bands") or [])
    items = [
        ("Poem exact aliases", "正文层明确称呼", len(alias_meta.get("poem_layer_exact_aliases") or [])),
        ("Poem role cues", "正文层角色提示", len(alias_meta.get("poem_layer_role_cues") or [])),
        ("Structured phrase tags", "结构化词组标签", structured_count),
        ("Reference-field items", "refer 场条目", reference_count),
        ("Stable commentary aliases", "注释层稳定 alias", len(alias_meta.get("commentary_layer_stable_aliases") or [])),
        ("Cue commentary aliases", "注释层提示 alias", len(alias_meta.get("commentary_layer_cue_aliases") or [])),
        ("Caveated commentary aliases", "注释层保留 alias", len(alias_meta.get("commentary_layer_caveated_aliases") or [])),
        ("Ledger rows", "对账条目", len(ledger_rows)),
    ]
    markup = "".join(
        f"<li><strong>{esc(label_bi if bilingual else label_en)}</strong> · {esc(count)}</li>"
        for label_en, label_bi, count in items
    )
    return f'<ul class="help-list">{markup}</ul>'


def render_personaggio_canto_threads(slug: str, bilingual: bool = False) -> str:
    scene_meta = PERSONAGGIO_SCENE_NOTES.get(slug, {})
    rows = scene_meta.get("canto_threads_bi" if bilingual else "canto_threads_en") or []
    if not rows:
        return ""
    items = "".join(f"<li>{esc(row)}</li>" for row in rows)
    return f'<ul class="help-list">{items}</ul>'


def rel_data_path(path_str: str | None) -> Path | None:
    if not path_str:
        return None
    cleaned = path_str[2:] if path_str.startswith("./") else path_str
    path = FRONTEND_DIR / cleaned
    return path if path.exists() else None


def page_shell(
    title: str,
    kicker: str,
    back_href: str,
    body_en: str,
    body_bi: str,
    language_key: str,
    asset_prefix: str,
) -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{esc(title)}</title>
    <meta name="description" content="{esc(title)}" />
    <link rel="icon" href="{esc(asset_prefix)}/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="{esc(asset_prefix)}/static/styles.css" />
  </head>
  <body class="help-popup-page">
    <main class="help-popup-shell">
      <div class="quick-jump-card-head" style="margin-bottom: 12px;">
        <p class="panel-kicker">{esc(kicker)}</p>
        <div class="ui-language-toggle" aria-label="{esc(title)} language switch">
          <button type="button" class="ui-language-chip" data-lang-target="{esc(language_key)}" data-lang-value="en">EN</button>
          <button type="button" class="ui-language-chip" data-lang-target="{esc(language_key)}" data-lang-value="bilingual">中文</button>
        </div>
      </div>
      <div class="help-popup-head">
        <h1>{esc(title)}</h1>
        <a class="ghost-link-button" id="{esc(language_key)}-back-link" href="{esc(back_href)}">Back</a>
      </div>
      <div class="static-page-content" data-static-lang="en">
        {body_en}
      </div>
      <div class="static-page-content" data-static-lang="bilingual" hidden>
        {body_bi}
      </div>
    </main>
    <script>
      (function () {{
        function getLanguage() {{
          const params = new URLSearchParams(window.location.search);
          const requested = params.get("ui_lang");
          if (requested === "bilingual") return "bilingual";
          if (requested === "en") return "en";
          try {{
            const stored = window.localStorage.getItem("ddp-ui-language");
            return stored === "bilingual" ? "bilingual" : "en";
          }} catch (error) {{
            return "en";
          }}
        }}
        function applyLanguage(language) {{
          document.documentElement.lang = language === "bilingual" ? "zh-CN" : "en";
          document.querySelectorAll('[data-lang-target="{esc(language_key)}"]').forEach((button) => {{
            button.classList.toggle("is-active", button.dataset.langValue === language);
          }});
          document.querySelectorAll("[data-static-lang]").forEach((block) => {{
            block.hidden = block.dataset.staticLang !== language;
          }});
          const url = new URL(window.location.href);
          url.searchParams.set("ui_lang", language);
          window.history.replaceState({{}}, "", url);
          try {{
            window.localStorage.setItem("ddp-ui-language", language);
          }} catch (error) {{
          }}
          const back = document.getElementById("{esc(language_key)}-back-link");
          const backUrl = new URL(back.getAttribute("href"), window.location.href);
          backUrl.searchParams.set("ui_lang", language);
          back.href = backUrl.pathname + backUrl.search;
        }}
        const initial = getLanguage();
        applyLanguage(initial);
        document.querySelectorAll('[data-lang-target="{esc(language_key)}"]').forEach((button) => {{
          button.addEventListener("click", () => applyLanguage(button.dataset.langValue === "bilingual" ? "bilingual" : "en"));
        }});
      }})();
    </script>
  </body>
    </html>
"""


def build_redirect_page(
    title: str,
    kicker: str,
    back_href: str,
    target_href: str,
    body_en: str,
    body_bi: str,
    language_key: str,
    asset_prefix: str,
) -> str:
    target = esc(target_href)
    body_en = body_en + f"""
      <script>
        window.addEventListener("DOMContentLoaded", function () {{
          const next = new URL("{target}", window.location.href);
          const params = new URLSearchParams(window.location.search);
          const lang = params.get("ui_lang");
          if (lang && !next.searchParams.has("ui_lang")) next.searchParams.set("ui_lang", lang);
          window.location.replace(next.pathname + next.search + next.hash);
        }});
      </script>
    """
    body_bi = body_bi + f"""
      <script>
        window.addEventListener("DOMContentLoaded", function () {{
          const next = new URL("{target}", window.location.href);
          const params = new URLSearchParams(window.location.search);
          const lang = params.get("ui_lang");
          if (lang && !next.searchParams.has("ui_lang")) next.searchParams.set("ui_lang", lang);
          window.location.replace(next.pathname + next.search + next.hash);
        }});
      </script>
    """
    return page_shell(
        title=title,
        kicker=kicker,
        back_href=back_href,
        body_en=body_en,
        body_bi=body_bi,
        language_key=language_key,
        asset_prefix=asset_prefix,
    )


def occurrence_li(row: dict) -> str:
    commentary = row.get("commentary_name") or row.get("author") or "Unknown commentary"
    canto_label = row.get("canto_label")
    if not canto_label:
        cantica = row.get("cantica")
        canto = row.get("canto")
        if cantica and canto:
            canto_label = f"{cantica} {canto}"
        else:
            canto_label = row.get("sample_name") or "sample"
    line_info = row.get("line_info") or row.get("line_label") or row.get("locator_summary") or row.get("branch_label") or ""
    count = row.get("count")
    prefix = f"{count} hits · " if count else ""
    return f"<li><strong>{esc(commentary)}</strong> · {prefix}{esc(canto_label)} {esc(line_info)}</li>"


def unique_slug(base: str, used: set[str]) -> str:
    slug = slugify(base)
    if slug not in used:
        used.add(slug)
        return slug
    index = 2
    while f"{slug}_{index}" in used:
        index += 1
    final = f"{slug}_{index}"
    used.add(final)
    return final


def load_author_shell(author_id: str) -> dict:
    wrapper = load_json(DATA_DIR / "authority_authors" / f"{author_id}.json")
    author = wrapper.get("author", {})
    author["_shell_contract"] = wrapper.get("shell_contract", {})
    return author


def load_detail_object(author: dict) -> dict | None:
    author_id = author.get("author_id")
    candidates = [
        DATA_DIR / "authority_works_trees" / f"{author_id}.json",
        DATA_DIR / "authority_flat_objects" / f"{author_id}.json",
        DATA_DIR / "authority_special_objects" / f"{author_id}.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            detail = load_json(candidate)
            detail["_detail_path"] = candidate
            return detail
    return None


def work_display_label(author_id: str | None, work: dict) -> str:
    explicit = work.get("display_label")
    if explicit:
        return explicit
    return work_display_name(author_id, work.get("canonical_work") or work.get("label"))


def normalise_branch_entries(items: list[dict], source_kind: str) -> list[dict]:
    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        label = (
            item.get("label")
            or item.get("branch_label")
            or item.get("normalized_label")
            or item.get("node_key")
            or item.get("book")
            or item.get("canonical_work")
        )
        if not label:
            continue
        occurrences = item.get("occurrences") or []
        rows.append(
            {
                "label": label,
                "count": item.get("count") or item.get("occurrence_count") or item.get("sample_count") or len(occurrences),
                "status": item.get("branch_status") or item.get("evidence_status") or item.get("node_type") or source_kind,
                "source_kind": source_kind,
                "occurrences": occurrences[:24],
                "children_count": len(item.get("children") or []),
                "summary": item.get("locator_summary") or item.get("explanation") or item.get("why"),
            }
        )
    return rows


def flatten_locator_nodes(nodes: list[dict], source_kind: str) -> list[dict]:
    rows: list[dict] = []

    def walk(node: dict) -> None:
        label = node.get("label") or node.get("node_key")
        if label:
            rows.append(
                {
                    "label": label,
                    "count": node.get("count") or len(node.get("occurrences") or []),
                    "status": node.get("node_type") or source_kind,
                    "source_kind": source_kind,
                    "occurrences": (node.get("occurrences") or [])[:24],
                    "children_count": len(node.get("children") or []),
                    "summary": node.get("jump_target", {}).get("sample_id") if isinstance(node.get("jump_target"), dict) else None,
                }
            )
        for child in node.get("children") or []:
            if isinstance(child, dict):
                walk(child)

    for node in nodes:
        if isinstance(node, dict):
            walk(node)
    return rows


def work_branch_entries(author: dict, detail: dict | None, work_summary: dict) -> list[dict]:
    entries: list[dict] = []
    work_name = work_summary.get("canonical_work")
    work_label = work_display_name(author.get("author_id"), work_name)
    if not detail:
        return entries

    if "works" in detail:
        for work in detail.get("works", []):
            if work.get("canonical_work") != work_name:
                continue
            entries.extend(flatten_locator_nodes(work.get("structured_locator_tree") or [], "structured_locator"))
            entries.extend(flatten_locator_nodes(work.get("prose_locator_tree") or [], "prose_locator"))
            return entries

    if "work_cards" in detail:
        for card in detail.get("work_cards", []):
            if card.get("canonical_work") != work_name:
                continue
            partial_path = rel_data_path(card.get("partial_tree_expected_path"))
            if partial_path and partial_path.exists():
                partial_tree = load_json(partial_path)
                entries.extend(normalise_branch_entries(partial_tree.get("books") or [], "partial_tree_book"))
            else:
                entries.extend(
                    {
                        "label": label,
                        "count": 0,
                        "status": "book_node_hint",
                        "source_kind": "book_node_hint",
                        "occurrences": [],
                        "children_count": 0,
                        "summary": "Book node label surfaced in current shape.",
                    }
                    for label in (card.get("current_shape") or {}).get("book_nodes") or []
                    if isinstance(label, str)
                )
            entries.extend(normalise_branch_entries(card.get("primary_branch_spine") or [], "primary_branch_spine"))
            entries.extend(normalise_branch_entries(card.get("focus_branch_candidates") or [], "focus_branch_candidate"))
            entries.extend(normalise_branch_entries(card.get("branch_candidates") or [], "branch_candidate"))
            entries.extend(normalise_branch_entries(card.get("normalized_branch_clusters") or [], "normalized_cluster"))
            return entries

    return entries


def build_branch_page(
    author_name: str,
    author_slug: str,
    work_label: str,
    work_slug: str,
    branch: dict,
) -> str:
    branch_label = branch.get("label") or "Ramo"
    occ_markup = "".join(occurrence_li(row) for row in branch.get("occurrences") or []) or "<li>No sample occurrences exposed here yet.</li>"
    body_en = f"""
      <p class="help-modal-lead">
        This page isolates <strong>{esc(branch_label)}</strong> inside <strong>{esc(work_label)}</strong> for
        <strong>{esc(author_name)}</strong>. It only exists where the authority data already exposes a real branch.
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>Branch Snapshot</h3>
          <p class="help-paragraph">
            Source kind: <strong>{esc(branch.get('source_kind'))}</strong>. Status: <strong>{esc(branch.get('status'))}</strong>.
            Count: <strong>{esc(branch.get('count') or 0)}</strong>. Child nodes: <strong>{esc(branch.get('children_count') or 0)}</strong>.
          </p>
          <p class="help-paragraph">{esc(branch.get('summary') or 'No extra branch summary attached.')}</p>
        </section>
        <section class="help-section">
          <h3>Sample Occurrences</h3>
          <ul class="help-list">{occ_markup}</ul>
        </section>
        <section class="help-section">
          <h3>Return Paths</h3>
          <p class="help-paragraph">
            Return to <a href="../{esc(work_slug)}.html">{esc(work_label)}</a>,
            <a href="../../{esc(author_slug)}.html">{esc(author_name)}</a>, or
            <a href="/authority.html">Authority</a>.
          </p>
        </section>
      </div>
    """
    body_bi = f"""
      <p class="help-modal-lead">
        这页把 <strong>{esc(work_label)}</strong> 里的 <strong>{esc(branch_label)}</strong> 单独拎出来。只有 authority 数据里已经长出真实 branch 的地方，才会有这种页面。
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>分支快照</h3>
          <p class="help-paragraph">
            来源类型：<strong>{esc(branch.get('source_kind'))}</strong>。状态：<strong>{esc(branch.get('status'))}</strong>。
            计数：<strong>{esc(branch.get('count') or 0)}</strong>。下层节点数：<strong>{esc(branch.get('children_count') or 0)}</strong>。
          </p>
          <p class="help-paragraph">{esc(branch.get('summary') or '当前还没有额外 branch summary。')}</p>
        </section>
        <section class="help-section">
          <h3>样本出处</h3>
          <ul class="help-list">{occ_markup}</ul>
        </section>
        <section class="help-section">
          <h3>返回路径</h3>
          <p class="help-paragraph">
            可以回到 <a href="../{esc(work_slug)}.html">{esc(work_label)}</a>、
            <a href="../../{esc(author_slug)}.html">{esc(author_name)}</a>，或者
            <a href="/authority.html">Authority 页面</a>。
          </p>
        </section>
      </div>
    """
    return page_shell(
        title=f"{branch_label} / {work_label}",
        kicker="Autore · Branch",
        back_href=f"../{work_slug}.html",
        body_en=body_en,
        body_bi=body_bi,
        language_key=f"branch-{author_slug}-{work_slug}-{slugify(branch_label)}",
        asset_prefix="",
    )


def build_work_page(
    author: dict,
    author_slug: str,
    work_summary: dict,
    detail: dict | None,
    branch_rows: list[dict],
) -> str:
    author_name = display_name(author)
    work_name = work_summary.get("canonical_work") or "Opera"
    work_label = work_display_name(author.get("author_id"), work_name)
    work_slug = slugify(work_label)
    work_total = work_summary.get("count") or work_summary.get("total_mentions") or 0
    resolved = work_summary.get("resolved_author_and_work") or 0
    inferred = work_summary.get("resolved_work_plus_inferred_author") or 0
    passage_mentions = work_summary.get("passage_mentions") or 0
    curated_branch = WORK_CURATED_BRANCH_ANCHORS.get((author_slug, work_slug)) or {}
    branch_links = "".join(
        f"<li><a href=\"./{esc(work_slug)}/{esc(row['slug'])}.html\">{esc(row['label'])}</a> · {esc(row['source_kind'])} · {esc(row['count'] or 0)}</li>"
        for row in branch_rows
    )
    branch_links_bi = "".join(
        f"<li><a href=\"./{esc(work_slug)}/{esc(row['slug'])}.html\">{esc(row['label'])}</a> · {esc(row['source_kind'])} · {esc(row['count'] or 0)}</li>"
        for row in branch_rows
    )
    if not branch_links:
        items_en = curated_branch.get("items_en") or []
        if items_en:
            lead_en = curated_branch.get("lead_en") or ""
            branch_links = (
                f"<li>{esc(lead_en)}</li>" + "".join(
                    f"<li><strong>{esc(label)}</strong> · {esc(note)}</li>"
                    for label, note in items_en
                )
            )
        else:
            branch_links = (
                f"<li><strong>{esc(work_label)}</strong> is currently read through its mounted work room and mention counts; "
                "no separate local branch pages are mounted yet.</li>"
            )
    if not branch_links_bi:
        items_bi = curated_branch.get("items_bi") or []
        if items_bi:
            lead_bi = curated_branch.get("lead_bi") or ""
            branch_links_bi = (
                f"<li>{esc(lead_bi)}</li>" + "".join(
                    f"<li><strong>{esc(label)}</strong> · {esc(note)}</li>"
                    for label, note in items_bi
                )
            )
        else:
            branch_links_bi = (
                f"<li><strong>{esc(work_label)}</strong> 现在主要通过 work room 和 mention 计数来阅读，"
                "还没有单独挂出的本地 branch 页。</li>"
            )

    detail_note = "This work currently sits inside a thin static shell."
    if detail and "works" in detail:
        detail_note = "This work belongs to a mature works-tree object, so locator branches can be surfaced as their own pages."
    elif detail and "work_cards" in detail:
        detail_note = "This work belongs to a flat-work overview object, so branch pages are surfaced only where book or chapter structure is already real."
    elif detail and "special_case" in detail:
        detail_note = "This work is shown inside a special-case authority object, so it gets a work room but not a fake branch tree."

    body_en = f"""
      <p class="help-modal-lead">
        This page isolates <strong>{esc(work_label)}</strong> inside the authority room of <strong>{esc(author_name)}</strong>.
        It is part of the new static autore atlas.
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>Work Snapshot</h3>
          <p class="help-paragraph">
            Total mentions: <strong>{esc(work_total)}</strong>. Resolved author+work:
            <strong>{esc(resolved)}</strong>. Work-plus-inferred-author:
            <strong>{esc(inferred)}</strong>. Passage mentions:
            <strong>{esc(passage_mentions)}</strong>.
          </p>
          <p class="help-paragraph">{esc(detail_note)}</p>
        </section>
        <section class="help-section">
          <h3>Available Book / Chapter Links</h3>
          <ul class="help-list">{branch_links}</ul>
        </section>
        <section class="help-section">
          <h3>Return Paths</h3>
          <p class="help-paragraph">
            Return to <a href="../{esc(author_slug)}.html">{esc(author_name)}</a>,
            <a href="../index.html">autore index</a>, or
            <a href="../../authority.html">Authority</a>.
          </p>
        </section>
      </div>
    """
    body_bi = f"""
      <p class="help-modal-lead">
        这页把 <strong>{esc(author_name)}</strong> 名下的 <strong>{esc(work_label)}</strong> 单独拿出来，作为静态 autore atlas 里的 opera 房间。
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>作品快照</h3>
          <p class="help-paragraph">
            总 mentions：<strong>{esc(work_total)}</strong>。明确 author+work：
            <strong>{esc(resolved)}</strong>。work 推断 author：
            <strong>{esc(inferred)}</strong>。passage mentions：
            <strong>{esc(passage_mentions)}</strong>。
          </p>
          <p class="help-paragraph">{esc(detail_note)}</p>
        </section>
        <section class="help-section">
          <h3>可用的书 / 章节链接</h3>
          <ul class="help-list">{branch_links_bi}</ul>
        </section>
        <section class="help-section">
          <h3>返回路径</h3>
          <p class="help-paragraph">
            可以回到 <a href="../{esc(author_slug)}.html">{esc(author_name)}</a>、
            <a href="../index.html">autore 索引页</a>，或者
            <a href="../../authority.html">Authority 页面</a>。
          </p>
        </section>
      </div>
    """
    return page_shell(
        title=f"{work_label} / {author_name}",
        kicker="Autore · Opera",
        back_href=f"../{author_slug}.html",
        body_en=body_en,
        body_bi=body_bi,
        language_key=f"work-{author_slug}-{work_slug}",
        asset_prefix="../..",
    )


def build_author_card(author: dict, work_links: list[dict]) -> tuple[str, str]:
    name = display_name(author)
    slug = author_public_slug(author)
    curated = AUTHOR_CURATED_WORK_ANCHORS.get(author.get("author_id")) or {}
    related_personaggio = next((item for item in PERSONAGGIO_PAGES if item.get("author_slug") == slug), None)
    entry_mode = author.get("entry_mode") or "unknown"
    works_layer_mode = author.get("works_layer_mode") or "unknown"
    status = normalize_ready_ui_text(author.get("frontend_status") or "unknown")
    notes = build_author_frontend_note_en(author)
    notes_bi = normalize_ready_ui_text(author.get("frontend_notes") or "当前还没有额外 note。")
    aliases = author.get("aliases", [])[:12]
    alias_markup = "".join(f"<span class=\"compare-chip\">{esc(alias)}</span>" for alias in aliases) or "<span class=\"compare-chip\">No aliases listed</span>"
    density_rows = author.get("by_canto_density", [])[:8]
    density_markup = "".join(
        f"<li><strong>{esc(row.get('canto_label'))}</strong> · {esc(row.get('total_mentions'))} mentions</li>"
        for row in density_rows
    ) or (
        f"<li><strong>{esc(name)}</strong> is currently read more through commentary clustering than through a mounted "
        "canto-density strip.</li>"
    )
    text_rows = author.get("text_occurrences_by_canto", [])[:8]
    text_markup = "".join(
        f"<li><strong>{esc(row.get('canto_label'))}</strong> · {esc(row.get('occurrence_count'))} direct text hits</li>"
        for row in text_rows
    ) or (
        f"<li>No direct poem-layer hits are mounted for <strong>{esc(name)}</strong> in the current local sample; "
        "this room is presently carried by commentary evidence and opera anchors.</li>"
    )
    works_markup = "".join(
        f"<li><a href=\"./{esc(slug)}/{esc(row['slug'])}.html\">{esc(row['label'])}</a> · {esc(row['count'])} mentions · {esc(row['branch_count'])} branch pages</li>"
        for row in work_links
    )
    if not works_markup:
        items_en = curated.get("items_en") or []
        if items_en:
            lead_en = curated.get("lead_en") or ""
            works_markup = (
                f"<li>{esc(lead_en)}</li>" + "".join(
                    f"<li><strong>{esc(label)}</strong> · {esc(note)}</li>"
                    for label, note in items_en
                )
            )
        else:
            works_markup = "<li>This author does not yet expose a stable work-layer page set.</li>"
    works_markup_bi = "".join(
        f"<li><a href=\"./{esc(slug)}/{esc(row['slug'])}.html\">{esc(row['label'])}</a> · {esc(row['count'])} mentions · {esc(row['branch_count'])} branch pages</li>"
        for row in work_links
    )
    if not works_markup_bi:
        items_bi = curated.get("items_bi") or []
        if items_bi:
            lead_bi = curated.get("lead_bi") or ""
            works_markup_bi = (
                f"<li>{esc(lead_bi)}</li>" + "".join(
                    f"<li><strong>{esc(label)}</strong> · {esc(note)}</li>"
                    for label, note in items_bi
                )
            )
        else:
            works_markup_bi = "<li>这位 author 还没有长出稳定的 work-layer 页面组。</li>"
    anchor_labels_en = [label for label, _note in (curated.get("items_en") or [])]
    anchor_labels_bi = [label for label, _note in (curated.get("items_bi") or [])]
    pressure_section_en = ""
    pressure_section_bi = ""
    if curated:
        anchor_row_en = "".join(
            f"<span class=\"compare-chip\">{esc(label)}</span>" for label in anchor_labels_en[:6]
        )
        anchor_row_bi = "".join(
            f"<span class=\"compare-chip\">{esc(label)}</span>" for label in anchor_labels_bi[:6]
        )
        pressure_section_en = f"""
          <section class="help-section" id="pressure">
            <h3>Reading Pressure</h3>
            <p class="help-paragraph">{esc(curated.get("lead_en") or "")}</p>
            <div class="compare-chip-row">{anchor_row_en}</div>
          </section>
        """
        pressure_section_bi = f"""
          <section class="help-section" id="pressure-bi">
            <h3>阅读压力</h3>
            <p class="help-paragraph">{esc(curated.get("lead_bi") or "")}</p>
            <div class="compare-chip-row">{anchor_row_bi}</div>
          </section>
        """
    personaggio_markup = (
        f"<p class=\"help-paragraph\"><a href=\"../personaggio/{esc(related_personaggio['slug'])}.html\">{esc(related_personaggio['title'])} / Personaggio</a></p>"
        if related_personaggio
        else (
            f"<p class=\"help-paragraph\"><strong>{esc(name)}</strong> currently reads as an autore room rather than "
            "as a split Autore-Personaggio room.</p>"
        )
    )
    personaggio_markup_bi = (
        f"<p class=\"help-paragraph\"><a href=\"../personaggio/{esc(related_personaggio['slug'])}.html\">{esc(related_personaggio['title'])} / Personaggio</a></p>"
        if related_personaggio
        else (
            f"<p class=\"help-paragraph\"><strong>{esc(name)}</strong> 现在更自然地作为 autore 房间阅读，"
            "而不是拆成单独的 Autore-Personaggio 房间。</p>"
        )
    )
    body_en = f"""
        <p class="help-modal-lead">
          This page gives <strong>{esc(name)}</strong> a stable authority room of its own. It is meant as a reading room
          for the current authority object, not as a full replacement for the Authority Lens.
        </p>
        <nav class="static-page-nav" aria-label="Author page contents">
          <a href="#summary">Summary</a>
          <a href="#pressure">Reading Pressure</a>
          <a href="#works">Works</a>
          <a href="#density">Canto Density</a>
          <a href="#text">Direct Text Layer</a>
          <a href="#aliases">Aliases</a>
        </nav>
        <div class="help-modal-body">
          <section class="help-section" id="summary">
            <h3>Current Room</h3>
            <p class="help-paragraph">
              Status: <strong>{esc(status)}</strong>. Entry mode: <strong>{esc(entry_mode)}</strong>. Works layer:
              <strong>{esc(works_layer_mode)}</strong>.
            </p>
            <p class="help-paragraph">{esc(notes)}</p>
            <p class="help-paragraph">
              Current counts: {esc(author.get('total_mentions', 0))} total mentions, {esc(author.get('text_occurrence_total', 0))}
              direct text-layer hits across {esc(author.get('text_canto_total', 0))} canto shells.
            </p>
          </section>
          {pressure_section_en}
          <section class="help-section" id="works">
            <h3>Opera</h3>
            <p class="help-paragraph">{esc(build_author_work_note_en(author, curated))}</p>
            <ul class="help-list">{works_markup}</ul>
          </section>
          <section class="help-section" id="density">
            <h3>By-Canto Density</h3>
            <ul class="help-list">{density_markup}</ul>
          </section>
          <section class="help-section" id="text">
            <h3>Direct Text Layer</h3>
            <p class="help-paragraph">{esc(build_author_text_note_en(author))}</p>
            <ul class="help-list">{text_markup}</ul>
          </section>
          <section class="help-section" id="aliases">
            <h3>Aliases</h3>
            <div class="compare-chip-row">{alias_markup}</div>
          </section>
          <section class="help-section">
            <h3>Personaggio Layer</h3>
            {personaggio_markup}
          </section>
          <section class="help-section">
            <h3>Return Paths</h3>
            <p class="help-paragraph">
              Return to the <a href="../authority.html">Authority page</a>, the <a href="./index.html">autore index</a>,
              or the <a href="../index.html">workbench</a>.
            </p>
          </section>
        </div>
    """
    body_bi = f"""
        <p class="help-modal-lead">
          这页把 <strong>{esc(name)}</strong> 作为一张稳定的 authority room 单独摆出来。它不是要取代 Authority Lens，而是给这个对象一个自己能站住的房间。
        </p>
        <nav class="static-page-nav" aria-label="Author page contents">
          <a href="#summary-bi">当前房间</a>
          <a href="#pressure-bi">阅读压力</a>
          <a href="#works-bi">作品</a>
          <a href="#density-bi">canto 密度</a>
          <a href="#text-bi">正文层</a>
          <a href="#aliases-bi">别名</a>
        </nav>
        <div class="help-modal-body">
          <section class="help-section" id="summary-bi">
            <h3>当前房间</h3>
            <p class="help-paragraph">
              状态：<strong>{esc(status)}</strong>。入口模式：<strong>{esc(entry_mode)}</strong>。works 层：<strong>{esc(works_layer_mode)}</strong>。
            </p>
            <p class="help-paragraph">{esc(notes_bi)}</p>
            <p class="help-paragraph">
              当前计数：总 mentions 为 {esc(author.get('total_mentions', 0))}，direct text-layer hits 为 {esc(author.get('text_occurrence_total', 0))}，
              分布在 {esc(author.get('text_canto_total', 0))} 个 canto shell 里。
            </p>
          </section>
          {pressure_section_bi}
          <section class="help-section" id="works-bi">
            <h3>作品</h3>
            <ul class="help-list">{works_markup_bi}</ul>
          </section>
          <section class="help-section" id="density-bi">
            <h3>canto 密度</h3>
            <ul class="help-list">{density_markup}</ul>
          </section>
          <section class="help-section" id="text-bi">
            <h3>正文层</h3>
            <p class="help-paragraph">{esc(author.get('text_layer_note') or '当前还没有正文层 note。')}</p>
            <ul class="help-list">{text_markup}</ul>
          </section>
          <section class="help-section" id="aliases-bi">
            <h3>别名</h3>
            <div class="compare-chip-row">{alias_markup}</div>
          </section>
          <section class="help-section">
            <h3>角色层</h3>
            {personaggio_markup_bi}
          </section>
          <section class="help-section">
            <h3>返回路径</h3>
            <p class="help-paragraph">
              可以回到 <a href="../authority.html">Authority 页面</a>、<a href="./index.html">autore 索引页</a>，或者 <a href="../index.html">workbench 首页</a>。
            </p>
          </section>
        </div>
    """
    html_doc = page_shell(
        title=f"{name} / Autore",
        kicker="Autore",
        back_href="./index.html",
        body_en=body_en,
        body_bi=body_bi,
        language_key=f"autore-{slug}",
        asset_prefix="..",
    )
    return slug, html_doc


def build_autore_index(authors: list[dict], source_count: int, highlight_author_count: int) -> str:
    rows = []
    for author in authors:
        name = display_name(author)
        slug = author_public_slug(author)
        works = author.get("works") or []
        if not works:
            flat_count = (author.get("flat_work_object") or {}).get("work_count") or 0
            works = [{}] * flat_count if flat_count else []
        work_line = f"{len(works)} work pages available" if works else "no work page layer yet"
        rows.append(
            f"""
            <article class="help-section help-subsection">
              <h3><a href="./{esc(slug)}.html">{esc(name)}</a></h3>
              <p class="help-paragraph">
                status: <strong>{esc(author.get('frontend_status') or 'unknown')}</strong> ·
                entry: <strong>{esc(author.get('entry_mode') or 'unknown')}</strong> ·
                works: <strong>{esc(author.get('works_layer_mode') or 'unknown')}</strong>
              </p>
              <p class="help-paragraph">
                mentions: {esc(author.get('total_mentions', 0))} · direct text hits: {esc(author.get('text_occurrence_total', 0))} · {esc(work_line)}
              </p>
            </article>
            """
        )
    body_en = f"""
      <p class="help-modal-lead">
        This is the author-facing atlas of the current Authority Layer. It gives each tracked author a stable page of
        its own, written under Italian display names even when canonical internals remain unchanged.
      </p>
      <p class="help-paragraph">
        Current snapshot: {len(authors)} tracked authors, {source_count} bridged commentary sources, {highlight_author_count}
        stable highlightable author entries.
      </p>
      <div class="help-modal-body">{''.join(rows)}</div>
    """
    body_bi = f"""
      <p class="help-modal-lead">
        这里是当前 Authority Layer 的 autore atlas。每一位 tracked author 都开始有自己的独立页面，而且显示名优先用意大利语写。
      </p>
      <p class="help-paragraph">
        当前快照：{len(authors)} 位 tracked authors，{source_count} 条 bridged commentary sources，{highlight_author_count} 条稳定 author 高亮入口。
      </p>
      <div class="help-modal-body">{''.join(rows)}</div>
    """
    return page_shell("Autori / Authority Atlas", "Autore", "../authority.html", body_en, body_bi, "autore-index", "..")


def build_personaggio_index() -> str:
    author_links = [item for item in PERSONAGGIO_PAGES if item.get("author_slug")]
    standalone_links = [item for item in PERSONAGGIO_PAGES if not item.get("author_slug")]
    corridor_blurbs = {
        "Limbo": {
            "en": "The old poetic-philosophical assembly where authority figures become visible presences inside Inferno 4.",
            "bi": "古典诗人和哲人汇聚成 visible presences 的那一圈，主要压在 Inferno 4。",
        },
        "Inferno": {
            "en": "Rooms dominated by descent, danger, and the pressure of recognition under infernal conditions.",
            "bi": "以下降、危险和地狱条件下的认出压力为主的房间。",
        },
        "Purgatorio": {
            "en": "Rooms where encounter slows down and social or poetic recognition becomes steadier.",
            "bi": "相遇开始放慢、社会性或诗性认出更稳定的房间。",
        },
        "Paradiso": {
            "en": "Celestial rooms where doctrinal, apostolic, and sapiential figures become scene-presences.",
            "bi": "使徒性、教义性、智慧性 figure 真正变成场景在场的天界房间。",
        },
        "Inferno e Purgatorio": {
            "en": "Cross-corridor rooms that cannot be pinned to only one dramatic zone.",
            "bi": "不能只钉死在一个戏剧区间里的跨走廊房间。",
        },
    }

    def corridor_section(items: list[dict], label: str, bilingual: bool = False) -> str:
        rows = [item for item in items if PERSONAGGIO_CORRIDOR_GROUPS.get(item["slug"]) == label]
        if not rows:
            return ""
        links = "".join(f'<li><a href="./{esc(item["slug"])}.html">{esc(item["title"])}</a></li>' for item in rows)
        blurb = corridor_blurbs.get(label, {}).get("bi" if bilingual else "en", "")
        return (
            f'<section class="help-section"><h3>{esc(label)} <span class="muted">({len(rows)})</span></h3>'
            f'<p class="help-paragraph">{esc(blurb)}</p><ul class="help-list">{links}</ul></section>'
        )

    def alias_rich_links(limit: int = 6) -> str:
        scored = []
        for item in PERSONAGGIO_PAGES:
            alias_meta = PERSONAGGIO_ALIAS_ATLAS.get(item["slug"], {})
            score = (
                len(alias_meta.get("poem_layer_exact_aliases") or [])
                + sum(len(band.get("items") or []) for band in alias_meta.get("poem_layer_structured_bands") or [])
                + sum(len(band.get("items") or []) for band in alias_meta.get("poem_layer_reference_bands") or [])
                + len(alias_meta.get("commentary_layer_stable_aliases") or [])
                + len(alias_meta.get("commentary_layer_cue_aliases") or [])
                + len(alias_meta.get("commentary_layer_caveated_aliases") or [])
            )
            if score:
                scored.append((score, item))
        scored.sort(key=lambda pair: (-pair[0], pair[1]["title"].casefold()))
        links = [
            f'<li><a href="./{esc(item["slug"])}.html">{esc(item["title"])}</a> <span class="muted">({score})</span></li>'
            for score, item in scored[:limit]
        ]
        return "".join(links)

    def refer_rich_links(limit: int = 4) -> str:
        scored = []
        for item in PERSONAGGIO_PAGES:
            alias_meta = PERSONAGGIO_ALIAS_ATLAS.get(item["slug"], {})
            score = sum(len(band.get("items") or []) for band in alias_meta.get("poem_layer_reference_bands") or [])
            if score:
                scored.append((score, item))
        scored.sort(key=lambda pair: (-pair[0], pair[1]["title"].casefold()))
        links = [
            f'<li><a href="./{esc(item["slug"])}.html">{esc(item["title"])}</a> <span class="muted">({score})</span></li>'
            for score, item in scored[:limit]
        ]
        return "".join(links)

    corridor_order = ["Limbo", "Inferno", "Purgatorio", "Paradiso", "Inferno e Purgatorio"]
    map_sections_en = "".join(corridor_section(PERSONAGGIO_PAGES, label, bilingual=False) for label in corridor_order)
    map_sections_bi = "".join(corridor_section(PERSONAGGIO_PAGES, label, bilingual=True) for label in corridor_order)
    author_links_en = "".join(f'<li><a href="./{esc(item["slug"])}.html">{esc(item["title"])}</a></li>' for item in author_links)
    standalone_links_en = "".join(f'<li><a href="./{esc(item["slug"])}.html">{esc(item["title"])}</a></li>' for item in standalone_links)
    author_links_bi = author_links_en
    standalone_links_bi = standalone_links_en
    alias_rich_en = alias_rich_links()
    alias_rich_bi = alias_rich_en
    refer_rich_en = refer_rich_links()
    refer_rich_bi = refer_rich_en
    body_en = f"""
      <p class="help-modal-lead">
        The personaggio layer now stands as a completed district rather than a placeholder band. This directory keeps
        figure-level rooms distinct from the autore side while their interiors continue to grow thicker.
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>Current State</h3>
          <p class="help-paragraph">
            Characters such as Virgilio, Stazio, Tommaso d'Aquino, San Pietro, Salomone, Aristotele, Omero, Orazio,
            Ovidio, Lucano, Platone, Seneca, Averroè, Avicenna, Tolomeo, Ulisse, and Sordello deserve a layer that is
            distinct from authority-author profiles. This build still keeps that layer compact, but it is no longer empty.
          </p>
        </section>
        <section class="help-section">
          <h3>Scene Map</h3>
          <p class="help-paragraph">The character district is now thick enough to be walked by corridor rather than only by name.</p>
        </section>
        {map_sections_en}
        <section class="help-section">
          <h3>Alias-Rich Rooms</h3>
          <p class="help-paragraph">These rooms already carry a denser bundle of naming, phrasing, and referential surfaces.</p>
          <ul class="help-list">{alias_rich_en}</ul>
        </section>
        <section class="help-section">
          <h3>Refer-Rich Rooms</h3>
          <p class="help-paragraph">These rooms already have visible action / care / carrying references rather than names alone.</p>
          <ul class="help-list">{refer_rich_en}</ul>
        </section>
        <section class="help-section">
          <h3>Autore-Personaggio</h3>
          <ul class="help-list">{author_links_en}</ul>
        </section>
        <section class="help-section">
          <h3>Standalone Personaggi</h3>
          <ul class="help-list">{standalone_links_en}</ul>
        </section>
      </div>
    """
    body_bi = f"""
      <p class="help-modal-lead">
        personaggio 这一层现在已经成区，而不再只是空占位。这个目录让 figure-level 房间继续和 autore 那边分开，同时允许房间内部继续长厚。
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>当前状态</h3>
          <p class="help-paragraph">
            像 Virgilio、Stazio、Tommaso d'Aquino、San Pietro、Salomone、Aristotele、Omero、Orazio、Ovidio、Lucano、Platone、Seneca、Averroè、Avicenna、Tolomeo、Ulisse、Sordello 这样的对象，都值得拥有和 authority-author page 不同的角色层页面。现在这层仍然很克制，但已经不再是空的。
          </p>
        </section>
        <section class="help-section">
          <h3>场景地图</h3>
          <p class="help-paragraph">角色区现在已经厚到可以按场景走廊来走，而不只是按名单点名。</p>
        </section>
        {map_sections_bi}
        <section class="help-section">
          <h3>Alias 更厚的房间</h3>
          <p class="help-paragraph">这些房间已经不只是有名字，而是开始长出词组、呼告和 refer surface。</p>
          <ul class="help-list">{alias_rich_bi}</ul>
        </section>
        <section class="help-section">
          <h3>Refer 更厚的房间</h3>
          <p class="help-paragraph">这些房间已经能靠动作、照护和身体性 refer 被认出来，不只靠点名。</p>
          <ul class="help-list">{refer_rich_bi}</ul>
        </section>
        <section class="help-section">
          <h3>Autore-Personaggio</h3>
          <ul class="help-list">{author_links_bi}</ul>
        </section>
        <section class="help-section">
          <h3>Standalone Personaggi</h3>
          <ul class="help-list">{standalone_links_bi}</ul>
        </section>
      </div>
    """
    return page_shell("Personaggi / Character Atlas", "Personaggio", "../authority.html", body_en, body_bi, "personaggio-index", "..")


def build_personaggio_page(item: dict) -> str:
    title = item["title"]
    slug = item["slug"]
    scene_meta = PERSONAGGIO_SCENE_NOTES.get(slug, {})
    alias_meta = PERSONAGGIO_ALIAS_ATLAS.get(slug, {})
    author_link = (
        f'<p class="help-paragraph">A related autore page already exists at <a href="../autore/{esc(item["author_slug"])}.html">autore/{esc(item["author_slug"])}.html</a>.</p>'
        if item.get("author_slug")
        else ""
    )
    author_link_bi = (
        f'<p class="help-paragraph">相关的 autore 页面已经存在：<a href="../autore/{esc(item["author_slug"])}.html">autore/{esc(item["author_slug"])}.html</a>。</p>'
        if item.get("author_slug")
        else ""
    )
    structured_aliases_en = render_structured_alias_bands(alias_meta, bilingual=False)
    structured_aliases_bi = render_structured_alias_bands(alias_meta, bilingual=True)
    reference_bands_en = render_reference_bands(alias_meta, bilingual=False)
    reference_bands_bi = render_reference_bands(alias_meta, bilingual=True)
    appendix_ledger_en = render_virgilio_appendix_ledger(bilingual=False) if slug == "virgilio" else ""
    appendix_ledger_bi = render_virgilio_appendix_ledger(bilingual=True) if slug == "virgilio" else ""
    tail_ledger_en = render_personaggio_tail_ledger(slug, bilingual=False) if slug != "virgilio" else ""
    tail_ledger_bi = render_personaggio_tail_ledger(slug, bilingual=True) if slug != "virgilio" else ""
    room_shape_en = render_personaggio_room_shape(slug, bilingual=False)
    room_shape_bi = render_personaggio_room_shape(slug, bilingual=True)
    author_bridge_en = render_personaggio_author_bridge(slug, bilingual=False)
    author_bridge_bi = render_personaggio_author_bridge(slug, bilingual=True)
    related_works_en = render_personaggio_related_works(slug, bilingual=False)
    related_works_bi = render_personaggio_related_works(slug, bilingual=True)
    room_thickness_en = render_personaggio_room_thickness(slug, bilingual=False)
    room_thickness_bi = render_personaggio_room_thickness(slug, bilingual=True)
    canto_threads_en = render_personaggio_canto_threads(slug, bilingual=False)
    canto_threads_bi = render_personaggio_canto_threads(slug, bilingual=True)
    fallback_poem_aliases_en = ""
    fallback_poem_aliases_bi = ""
    if not structured_aliases_en:
        exact_aliases = alias_meta.get("poem_layer_exact_aliases", [])
        role_cues = alias_meta.get("poem_layer_role_cues", [])
        if exact_aliases:
            fallback_poem_aliases_en += (
                f'<p class="help-paragraph"><strong>Poem-layer exact aliases:</strong> {format_alias_list(exact_aliases)}</p>'
            )
            fallback_poem_aliases_bi += (
                f'<p class="help-paragraph"><strong>正文层直接别名：</strong> {format_alias_list(exact_aliases)}</p>'
            )
        if role_cues:
            fallback_poem_aliases_en += (
                f'<p class="help-paragraph"><strong>Poem-layer role cues:</strong> {format_alias_list(role_cues)}</p>'
            )
            fallback_poem_aliases_bi += (
                f'<p class="help-paragraph"><strong>正文层角色称呼：</strong> {format_alias_list(role_cues)}</p>'
            )
    body_en = f"""
      <p class="help-modal-lead">
        {esc(item["lead_en"])}
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>Why This Split Matters</h3>
          <p class="help-paragraph">{esc(item["why_en"])}</p>
          <p class="help-paragraph">{esc(item["state_en"])}</p>
          {author_link}
        </section>
        <section class="help-section">
          <h3>Scene Note</h3>
          <p class="help-paragraph">{esc(scene_meta.get("scene_note_en") or "This room tracks the figure as a scene-presence inside the poem.")}</p>
          <p class="help-paragraph">{esc(scene_meta.get("canto_note_en") or "A more exact canto corridor is still being stabilized.")}</p>
          {f'<p class="help-paragraph">{esc(scene_meta.get("scene_pressure_en"))}</p>' if scene_meta.get("scene_pressure_en") else ''}
        </section>
        {f'<section class="help-section"><h3>Room Shape</h3>{room_shape_en}</section>' if room_shape_en else ''}
        {f'<section class="help-section"><h3>Author Bridge</h3>{author_bridge_en}</section>' if author_bridge_en else ''}
        {f'<section class="help-section"><h3>Current Thickness</h3>{room_thickness_en}</section>' if room_thickness_en else ''}
        {f'<section class="help-section"><h3>Canto Threads</h3>{canto_threads_en}</section>' if canto_threads_en else ''}
        {f'<section class="help-section"><h3>Related Works</h3>{related_works_en}</section>' if related_works_en else ''}
        <section class="help-section">
          <h3>Aliases</h3>
          <p class="help-paragraph">{esc(alias_meta.get("alias_note") or "Alias work for this room is still thin.")}</p>
          {structured_aliases_en}
          {fallback_poem_aliases_en}
          <p class="help-paragraph"><strong>Commentary-layer aliases:</strong> {format_alias_list(alias_meta.get("commentary_layer_stable_aliases", []))}</p>
          <p class="help-paragraph"><strong>Commentary-layer cue aliases:</strong> {format_alias_list(alias_meta.get("commentary_layer_cue_aliases", []))}</p>
          <p class="help-paragraph"><strong>Commentary-layer caveated aliases:</strong> {format_alias_list(alias_meta.get("commentary_layer_caveated_aliases", []))}</p>
        </section>
        {f'<section class="help-section"><h3>Reference Field</h3>{reference_bands_en}</section>' if reference_bands_en else ''}
        {f'<section class="help-section"><h3>Appendix Ledger</h3>{appendix_ledger_en}</section>' if appendix_ledger_en else ''}
        {f'<section class="help-section"><h3>Alias Ledger</h3>{tail_ledger_en}</section>' if tail_ledger_en else ''}
      </div>
    """
    body_bi = f"""
      <p class="help-modal-lead">
        {esc(item["lead_bi"])}
      </p>
      <div class="help-modal-body">
        <section class="help-section">
          <h3>为什么要分层</h3>
          <p class="help-paragraph">{esc(item["why_bi"])}</p>
          <p class="help-paragraph">{esc(item["state_bi"])}</p>
          {author_link_bi}
        </section>
        <section class="help-section">
          <h3>场景说明</h3>
          <p class="help-paragraph">{esc(scene_meta.get("scene_note_bi") or "这间房间追踪的是对象在诗中的场景在场。")}</p>
          <p class="help-paragraph">{esc(scene_meta.get("canto_note_bi") or "更精确的 canto 走廊还在继续稳定。")}</p>
          {f'<p class="help-paragraph">{esc(scene_meta.get("scene_pressure_bi"))}</p>' if scene_meta.get("scene_pressure_bi") else ''}
        </section>
        {f'<section class="help-section"><h3>房间形状</h3>{room_shape_bi}</section>' if room_shape_bi else ''}
        {f'<section class="help-section"><h3>关联 autore</h3>{author_bridge_bi}</section>' if author_bridge_bi else ''}
        {f'<section class="help-section"><h3>当前厚度</h3>{room_thickness_bi}</section>' if room_thickness_bi else ''}
        {f'<section class="help-section"><h3>canto 线</h3>{canto_threads_bi}</section>' if canto_threads_bi else ''}
        {f'<section class="help-section"><h3>关联 works</h3>{related_works_bi}</section>' if related_works_bi else ''}
        <section class="help-section">
          <h3>别名</h3>
          <p class="help-paragraph">{esc(alias_meta.get("alias_note") or "这个房间的 alias 还需要继续做厚。")}</p>
          {structured_aliases_bi}
          {fallback_poem_aliases_bi}
          <p class="help-paragraph"><strong>注释层别名：</strong> {format_alias_list(alias_meta.get("commentary_layer_stable_aliases", []))}</p>
          <p class="help-paragraph"><strong>注释层提示别名：</strong> {format_alias_list(alias_meta.get("commentary_layer_cue_aliases", []))}</p>
          <p class="help-paragraph"><strong>注释层保留别名：</strong> {format_alias_list(alias_meta.get("commentary_layer_caveated_aliases", []))}</p>
        </section>
        {f'<section class="help-section"><h3>Refer 场</h3>{reference_bands_bi}</section>' if reference_bands_bi else ''}
        {f'<section class="help-section"><h3>附录对账</h3>{appendix_ledger_bi}</section>' if appendix_ledger_bi else ''}
        {f'<section class="help-section"><h3>Alias 对账</h3>{tail_ledger_bi}</section>' if tail_ledger_bi else ''}
      </div>
    """
    return page_shell(f"{title} / Personaggio", "Personaggio", "./index.html", body_en, body_bi, f"personaggio-{slug}", "..")


def generate_author_subpages(author: dict) -> tuple[list[dict], int]:
    author_name = display_name(author)
    author_slug = author_public_slug(author)
    detail = load_detail_object(author)
    work_links: list[dict] = []
    branch_page_count = 0
    work_dir = AUTORE_DIR / author_slug
    ensure_dir(work_dir)

    work_summaries = author.get("works") or []
    if not work_summaries and detail and "work_cards" in detail:
        work_summaries = [
            {
                "canonical_work": card.get("canonical_work"),
                "count": card.get("count") or 0,
                "total_mentions": card.get("count") or 0,
                "resolved_author_and_work": card.get("resolved_author_and_work") or 0,
                "resolved_work_plus_inferred_author": card.get("resolved_work_plus_inferred_author") or 0,
                "passage_mentions": card.get("passage_mentions") or 0,
            }
            for card in detail.get("work_cards") or []
            if card.get("canonical_work")
        ]

    for work_summary in work_summaries:
        work_name = work_summary.get("canonical_work")
        if not work_name:
            continue
        work_label = work_display_name(author.get("author_id"), work_name)
        work_slug = slugify(work_label)
        branch_entries = work_branch_entries(author, detail, work_summary)
        seen: set[str] = set()
        branch_rows = []
        branch_dir = work_dir / work_slug
        if branch_entries:
            ensure_dir(branch_dir)
        for entry in branch_entries:
            branch_slug = unique_slug(entry["label"], seen)
            entry["slug"] = branch_slug
            branch_rows.append(entry)
            (branch_dir / f"{branch_slug}.html").write_text(
                build_branch_page(author_name, author_slug, work_label, work_slug, entry),
                encoding="utf-8",
            )
            branch_page_count += 1

        (work_dir / f"{work_slug}.html").write_text(
            build_work_page(author, author_slug, work_summary, detail, branch_rows),
            encoding="utf-8",
        )
        legacy_work_slug = slugify(work_name)
        if legacy_work_slug and legacy_work_slug != work_slug:
            legacy_title = f"{work_name} / {author_name}"
            legacy_target = f"./{work_slug}.html"
            (work_dir / f"{legacy_work_slug}.html").write_text(
                build_redirect_page(
                    title=legacy_title,
                    kicker="Autore · Opera alias",
                    back_href=f"../{author_slug}.html",
                    target_href=legacy_target,
                    body_en=f"""
                      <p class=\"help-modal-lead\">
                        This legacy work slug now redirects to the current canonical room for <strong>{esc(work_label)}</strong>.
                      </p>
                      <div class=\"help-modal-body\">
                        <section class=\"help-section\">
                          <h3>Canonical Path</h3>
                          <p class=\"help-paragraph\">
                            Continue to <a href=\"{esc(legacy_target)}\">{esc(work_label)}</a>.
                          </p>
                        </section>
                      </div>
                    """,
                    body_bi=f"""
                      <p class=\"help-modal-lead\">
                        这个旧作品 slug 现在会跳到 <strong>{esc(work_label)}</strong> 的当前 canonical 房间。
                      </p>
                      <div class=\"help-modal-body\">
                        <section class=\"help-section\">
                          <h3>当前路径</h3>
                          <p class=\"help-paragraph\">
                            继续前往 <a href=\"{esc(legacy_target)}\">{esc(work_label)}</a>。
                          </p>
                        </section>
                      </div>
                    """,
                    language_key=f"work-alias-{author_slug}-{legacy_work_slug}",
                    asset_prefix="../..",
                ),
                encoding="utf-8",
            )
        work_links.append(
            {
                "slug": work_slug,
                "label": work_label,
                "count": work_summary.get("count") or work_summary.get("total_mentions") or 0,
                "branch_count": len(branch_rows),
            }
        )

    return work_links, branch_page_count


def main() -> None:
    ensure_dir(AUTORE_DIR)
    ensure_dir(PERSONAGGIO_DIR)

    global PERSONAGGIO_ALIAS_ATLAS
    global PERSONAGGIO_SCAN_ROWS
    global AUTHOR_SHELL_ROWS
    global VIRGILIO_APPENDIX_LEDGER
    global PERSONAGGIO_TAIL_LEDGERS
    authority_layer = load_json(AUTHORITY_LAYER_PATH)
    authority_sources = load_json(AUTHORITY_SOURCES_PATH)
    highlight = load_json(AUTHORITY_HIGHLIGHT_PATH)
    PERSONAGGIO_ALIAS_ATLAS = {
        row.get("page_slug"): row
        for row in load_json(AUTHORITY_PERSONAGGIO_ALIAS_ATLAS_PATH).get("rows", [])
        if row.get("page_slug")
    }
    personaggio_scan = load_json(AUTHORITY_PERSONAGGIO_FULL_SCAN_PATH)
    PERSONAGGIO_SCAN_ROWS = {
        row.get("page_slug"): row
        for row in personaggio_scan.get("author_personaggi", []) + personaggio_scan.get("standalone_personaggi", [])
        if row.get("page_slug")
    }
    AUTHOR_SHELL_ROWS = {
        row.get("author_id"): row
        for row in authority_layer.get("authors", [])
        if row.get("author_id")
    }
    VIRGILIO_APPENDIX_LEDGER = load_json(VIRGILIO_APPENDIX_LEDGER_PATH).get("rows", []) if VIRGILIO_APPENDIX_LEDGER_PATH.exists() else []
    PERSONAGGIO_TAIL_LEDGERS = {
        row.get("page_slug"): row
        for row in load_json(PERSONAGGIO_TAIL_LEDGERS_PATH).get("rows", [])
        if row.get("page_slug")
    } if PERSONAGGIO_TAIL_LEDGERS_PATH.exists() else {}
    authors = sorted(authority_layer.get("authors", []), key=lambda row: display_name(row).lower())

    work_page_total = 0
    branch_page_total = 0
    for author_summary in authors:
        author = load_author_shell(author_summary.get("author_id"))
        work_links, author_branch_pages = generate_author_subpages(author)
        branch_page_total += author_branch_pages
        work_page_total += len(work_links)
        slug, html_doc = build_author_card(author, work_links)
        (AUTORE_DIR / f"{slug}.html").write_text(html_doc, encoding="utf-8")

    (AUTORE_DIR / "index.html").write_text(
        build_autore_index(
            authors,
            int(authority_sources.get("source_count", 0) or 0),
            len(highlight.get("stable_authors", [])),
        ),
        encoding="utf-8",
    )
    (PERSONAGGIO_DIR / "index.html").write_text(build_personaggio_index(), encoding="utf-8")
    for item in PERSONAGGIO_PAGES:
        (PERSONAGGIO_DIR / f"{item['slug']}.html").write_text(build_personaggio_page(item), encoding="utf-8")
    (DATA_DIR / "authority_curated_room_anchors.json").write_text(
        json.dumps(build_curated_room_anchor_payload(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote autore pages: {len(authors)}")
    print(f"Wrote work pages: {work_page_total}")
    print(f"Wrote branch pages: {branch_page_total}")
    print(f"Wrote {AUTORE_DIR / 'index.html'}")
    print(f"Wrote {PERSONAGGIO_DIR / 'index.html'}")
    for item in PERSONAGGIO_PAGES:
        print(f"Wrote {PERSONAGGIO_DIR / (item['slug'] + '.html')}")


if __name__ == "__main__":
    main()
