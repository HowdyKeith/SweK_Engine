// FILE: vba/archiveManifest.mjs
// VERSION: v4159 -- the four parts of the VBA archive, and how a folder on disk is recognised as one of them.
//
// *** THE VBA HALF WAS BUILT FIRST AND IT IS NOT IN THIS REPOSITORY. *** Keith's words: "that vba part was
// started first." What ships here are FRAGMENTS of it -- Shared/Net's slim Winsock extract, Shared/
// modEngineBridge.bas, WebGLEngine/vba/'s GPU-brain modules -- and the root README has said for hundreds of
// versions that the exploded module folders "ship separately". Separately has meant, in practice, nowhere:
// nothing in this tree could say what the archive contains, whether a copy on the machine was the right one,
// or which of its parts the engine was actually talking to.
//
// This module is the receiving end. It does not contain the archive and never will: it describes the parts,
// and recognises them when a copy is pointed at.
//
// THE FOUR PARTS, as Keith named them:
//   1. the transmitter        -- Winsock, and the HTTP/WebSocket/MQTT SERVERS built on it
//   2. the OpenGL render engine -- the workbook that draws, in VBA, through real GL
//   3. the connector workbook -- VBA -> SweK Engine, the half that talks to this process
//   4. smaller parts          -- the sync tool, the demo addons
//
// *** RECOGNITION IS BY MODULE NAME, NOT BY FOLDER NAME, AND AN UNRECOGNISED FOLDER STAYS UNRECOGNISED. ***
// A folder can be called anything -- `vba_final`, `Engine (2)`, `archive_2019` -- so the name is corroboration
// and never a verdict. The verdict comes from DECISIVE markers: modules that only one part has. And when no
// decisive marker is present the answer is `null` with the reason, which the bridge reports as `unclassified`
// alongside the folder's real module count. Forcing every folder into one of four buckets would mean the first
// thing this tree ever said about the archive was a guess.
//
// *** THE TRAP THIS IS BUILT AROUND: Shared/Net/ IS NOT THE TRANSMITTER. *** It carries WinsockDeclares.bas,
// WinsockUtils.bas and WinAPI.bas -- three modules the transmitter also carries, because Shared/Net/README.md
// says in as many words that they were "extracted from the VBA smart transmitter". A classifier that counted
// marker hits would look at that folder, find three transmitter modules, and link the engine's own 650-line
// extract as if it were the 189-module transmitter. So those three are SHARED markers: they corroborate, they
// never decide. What decides is a module the extract provably does not have -- a server, a host, a broker.
//
// WHERE THE MARKERS COME FROM. Every name below was read out of this tree, not invented, because a manifest
// asserting modules that do not exist would fail against the real archive in the one way nobody would check:
//   modWebGLEngineHost.bas, modControlPanelHost.bas, modTaskerHost.bas ... docs/CHANGELOG.md (v9590, 10780, 10753)
//   BonjourUtils.bas (the transmitter's mDNS) ..................... docs/CHANGELOG.md 8392
//   clsMQTTClient.cls, clsWebsocketClient.cls, clsWebsocketCore.cls  Shared/Net/README.md "pull on request"
//   clsStringBuilder.cls, JSONParser.bas (FixPack v1) ............. WebGLEngine/vba/modGPUBrain.bas header
//   WinsockDeclares/WinsockUtils/WinAPI .......................... Shared/Net/ -- IN THIS TREE, hence shared
//   Demo_BridgeFPS.cls ........................................... docs/CHANGELOG.md 10854
//   modGLConstants.bas (81 Public Const: 69 GL_ + 12 WGL) ........ WebGLEngine/NOTES.md 7358, counted there
//   modOllamaInit.bas ............................................ WebGLEngine/NOTES.md 7358
//   modHAInstall.bas ............................................. HomeAssistant/ha-vbaengine-addon/PUBLISHING.md
//   modEngineBridge.bas .......................................... Shared/ -- IN THIS TREE, hence shared
//   VBASyncImport.cls, VBASyncECS.bas, VBASyncEngine.bas, VBASyncGitHub.bas .. docs/CHANGELOG.md 10643
//
// *** v4160 -- A REAL ARCHIVE HAS NOW BEEN READ, AND IT CORRECTED THIS FILE ON A POINT v4159 ASSERTED. ***
// SweK_VBA_v3499.zip, scanned through the bridge: VBATransmitter 195 modules, VBAEngine 263,
// VBAVoxelEngine 64, VBASyncCore 4, plus VBAEngine/addons/VBAOpenGL_Demos at 69. v4159's markers linked TWO of
// the four -- the transmitter on 9 of 9 guesses, the connector on 2 of 2 -- and MISSED the other two, each by
// exactly one marker. The threshold was not the problem and was not moved. The markers were widened from the
// listing, which is what v4159 said the honest response would be.
//
// *** THE CORRECTION: THE TWO WORKBOOKS DO NOT SHARE A GL CONSTANTS MODULE, AND v4159 SAID THEY DID. ***
// NOTES.md 7358 counted 81 Public Const in `modGLConstants.bas` while verifying THE VOXEL WORKBOOK, and v4159
// generalised that to the render engine on the reasoning that a GL renderer must declare GL. The renderer does
// -- in `GLConstants.bas`, a DIFFERENT MODULE. Verified across all five folders: `modGLConstants` appears only
// in VBAVoxelEngine, `GLConstants` only in VBAEngine. So the deliberate tie v4159 built the low-confidence
// branch around DOES NOT EXIST in this archive, and the gate now asserts that no decisive marker is shared at
// all. The tie-breaking code stays -- it is still the right behaviour if an archive ever does tie -- but it is
// no longer asserted as a fact about this one.
//
// AND VBASyncCore HAD LOST THREE OF ITS FOUR MARKERS ALREADY: docs/CHANGELOG.md 10643 records VBASyncImport,
// VBASyncECS and VBASyncGitHub being deleted as stale, and v4159 read that line and copied the names out of it
// anyway. What survives is VBASyncEngine plus VBASyncBootstrap, which that entry never mentioned.
//
// The counts below are now THE ARCHIVE'S, not the tree's older notes (189 and 73). Where those disagree the
// archive wins: it is the thing being described.

/** VBA source extensions. `.frm` brings a `.frx` binary companion, which is not source and is not imported. */
export const VBA_EXT = new Set([".bas", ".cls", ".frm"]);

/** Document modules: they exist in every workbook and cannot be imported, only pasted. Never a marker. */
export const DOC_MODULE = /^(ThisWorkbook|Sheet\d+|Workbook|UserForm\d*)$/i;

/** How many decisive markers a folder needs before this module will name it. One is a coincidence: a person
 *  copying a single module out of the transmitter to read it would otherwise relabel the folder it landed in. */
export const MIN_DECISIVE = 2;

/** No longer provisional: SweK_VBA_v3499 has been scanned and the markers below come from its listing. */
export const PROVISIONAL = false;

/** The archive this manifest was corrected against, so a later reader knows which one the counts describe. */
export const READ_AGAINST = "SweK_VBA_v3499";

export const PARTS = [
    {
        id: "transmitter",
        title: "VBA transmitter",
        what: "Winsock, and the HTTP / WebSocket / MQTT servers built on top of it. The one part that can HOST: " +
              "it serves the panels itself, so the bridge works with Node down.",
        // COUNTED in SweK_VBA_v3499. Shared/Net/README.md says 189; the archive holds 195, and the archive
        // is the authority on its own size. All nine markers below were verified present in it.
        modulesRecorded: 195,
        folderHints: ["vbatransmitter", "transmitter", "vbasmarttransmitter", "smarttransmitter"],
        decisive: ["modWebGLEngineHost", "modControlPanelHost", "modTaskerHost", "BonjourUtils",
                   "clsMQTTClient", "clsWebsocketClient", "clsWebsocketCore", "clsStringBuilder", "JSONParser"],
        shared: ["WinsockDeclares", "WinsockUtils", "WinAPI"],
        // *** THIS IS THE PORT modEngineBridge ALREADY PROBES. *** Shared/modEngineBridge.bas defaults its
        // candidate list to "Node :8787, then transmitter :8099", so the number is not chosen here -- it is
        // read off the client that has been trying to reach it all along.
        port: 8099,
        role: "host",
        inTreeFragment: "Shared/Net/  (WinsockDeclares + WinsockUtils + WinAPI -- ~650 lines, the standalone extract)",
    },
    {
        id: "engine",
        title: "VBA OpenGL render engine",
        what: "The workbook that renders through real OpenGL/D3D11 from VBA. Declares its own GL entry points, " +
              "which is why it stays a separate project from the connector workbook.",
        modulesRecorded: 263,
        folderHints: ["vbaengine", "vbaenginecore", "openglengine", "vbaopengl"],
        // *** WIDENED FROM SweK_VBA_v3499's LISTING, AND EVERY ONE WAS CHECKED AGAINST ALL FIVE FOLDERS. ***
        // v4159 guessed `modGLConstants` here and scored 1 -- one short of the threshold, so the largest part
        // of the archive went unclassified. These eight are the renderer's actual GL surface: the WGL context
        // it creates, the declares it makes, the FreeGLUT it binds, and its own GLConstants (NOT the voxel
        // workbook's modGLConstants -- see the header).
        decisive: ["GLConstants", "OpenGLFacade", "OpenGLRenderer", "OpenGLWindow",
                   "modWGLContext", "modGL_Declares", "modFreeGLUT", "Demo_BridgeFPS"],
        shared: ["modInit", "modHAInstall", "modEngineBridge"],
        port: null,
        role: "render",
        inTreeFragment: "HomeAssistant/modHAInstall.bas  (the Install HA Panel button's module)",
    },
    {
        id: "connector",
        title: "VBA -> SweK Engine connector workbook",
        what: "The workbook wired to THIS engine: it POSTs entity state to /bridge/game_tick each tick and " +
              "drains the directives the browser queued. What the Excel AI Brains panel is reading.",
        // NOTES.md 7358 verified 73 against a LATER workbook; SweK_VBA_v3499 holds 64. Both markers below
        // were found in it, and both are exclusive to it across the whole archive.
        modulesRecorded: 64,
        folderHints: ["vbavoxelengine", "voxelengine", "connector", "swekconnector"],
        decisive: ["modOllamaInit", "modGLConstants"],
        shared: ["modEngineBridge", "modInit"],
        port: null,
        role: "client",
        inTreeFragment: "Shared/modEngineBridge.bas  (BridgeTick / ResolveBridgeHost / ApplyDirective)",
    },
    {
        id: "smaller",
        title: "smaller VBA parts",
        what: "The sync tool that explodes a workbook to source and back, and the demo addons. Deliberately " +
              "kept OUT of the engine workbooks -- its exports share names with theirs.",
        // Four files, two of them ThisWorkbook/Sheet2 document modules -- so TWO importable modules, and both
        // are markers. The smallest part in the archive and the one with the least room for a coincidence.
        modulesRecorded: 4,
        folderHints: ["vbasynccore", "vbasync", "addons", "vbaopengl_demos", "demos"],
        // *** THREE OF v4159'S FOUR NAMES WERE ALREADY DELETED WHEN IT COPIED THEM. *** docs/CHANGELOG.md
        // 10643 records VBASyncImport, VBASyncECS and VBASyncGitHub being removed as stale -- the same line
        // v4159 cited as the source for them. VBASyncBootstrap is what took their place and that entry never
        // named it, which is precisely why a manifest built from changelog prose had to be checked against a
        // listing before it could stop calling itself provisional.
        decisive: ["VBASyncEngine", "VBASyncBootstrap"],
        shared: [],
        port: null,
        role: "tooling",
        inTreeFragment: null,
    },
];

export const PART_IDS = PARTS.map((p) => p.id);
export const partById = (id) => PARTS.find((p) => p.id === id) || null;

/** `WinsockUtils.bas` -> `winsockutils`. Case and extension are both noise; a workbook exported on Windows and
 *  read on Linux differs in neither the module nor the meaning. */
export function moduleKey(name) {
    return String(name || "").replace(/\.(bas|cls|frm|frx)$/i, "").trim().toLowerCase();
}

/** Is this a VBA source file (and not a .frx binary companion)? */
export function isVbaSource(name) {
    const m = /\.([a-z]+)$/i.exec(String(name || ""));
    return !!m && VBA_EXT.has("." + m[1].toLowerCase());
}

/**
 * How many of these are modules you could actually IMPORT.
 *
 * v4160 -- ADDED BECAUSE THE REAL ARCHIVE MADE THE PLAIN COUNT MISLEADING AT ITS SMALLEST PART. VBASyncCore
 * holds four .bas/.cls, and two of them are ThisWorkbook.cls and Sheet2.cls -- document modules, which the VBE
 * cannot import and which every workbook has. Reporting "4 modules" for a part with TWO of its own overstates
 * the smallest folder by a factor of two, and it is the one folder where that matters, since two markers out of
 * two importable modules is a much stronger reading than two out of four.
 */
export function importableCount(moduleNames) {
    return (moduleNames || []).filter((n) => isVbaSource(n) && !DOC_MODULE.test(String(n).replace(/\.[a-z]+$/i, ""))).length;
}

/** Does the folder NAME look like this part? Corroboration only -- never decides, see the header. */
export function nameHint(part, folderName) {
    const n = String(folderName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return !!n && (part.folderHints || []).some((h) => n.includes(h.replace(/[^a-z0-9]/g, "")));
}

/** Score one part against a listing of module names. Decisive and shared hits are counted SEPARATELY and
 *  reported separately, because the whole point is that only one of the two can name a folder. */
export function scorePart(part, moduleNames) {
    const have = new Set((moduleNames || []).filter(isVbaSource).map(moduleKey));
    const dec = (part.decisive || []).filter((m) => have.has(moduleKey(m)));
    const sh = (part.shared || []).filter((m) => have.has(moduleKey(m)));
    return { id: part.id, decisive: dec, shared: sh, score: dec.length };
}

/**
 * Name a folder, or refuse to.
 *
 * Returns { part, score, decisive, shared, hint, confidence, reason, runnerUp }.
 * `part` is null when nothing reached MIN_DECISIVE -- the honest answer for a folder this tree has no record
 * of, and the answer Shared/Net/ gets, which is the point.
 *
 * A TIE IS NOT BROKEN BY THE FOLDER NAME ALONE. The engine and connector workbooks BOTH carry modGLConstants
 * (NOTES.md counted its 81 constants in the connector; the render engine declares GL by construction), so two
 * parts can genuinely reach the same score. When they do the name breaks the tie and the confidence drops to
 * "low" saying so, rather than a coin toss reported as a fact.
 */
export function classifyFolder({ name = "", modules = [] } = {}) {
    const scored = PARTS.map((p) => ({ ...scorePart(p, modules), hint: nameHint(p, name), part: p }))
                        .sort((a, b) => (b.score - a.score) || ((b.hint ? 1 : 0) - (a.hint ? 1 : 0)));
    const top = scored[0], next = scored[1];
    const sources = (modules || []).filter(isVbaSource).length;
    const importable = importableCount(modules);
    if (!top || top.score < MIN_DECISIVE) {
        return { part: null, score: top ? top.score : 0, decisive: top ? top.decisive : [], shared: top ? top.shared : [],
                 hint: !!(top && top.hint), confidence: "none", sources, importable, runnerUp: null,
                 reason: sources === 0 ? "no VBA source files here"
                       : "no part reached " + MIN_DECISIVE + " decisive markers (best: " +
                         (top ? top.id + " with " + top.score : "none") + ")" };
    }
    const tied = next && next.score === top.score;
    let winner = top;
    if (tied && !top.hint && next.hint) winner = next;
    const confidence = tied ? "low" : (winner.score >= 3 || winner.hint ? "high" : "medium");
    return {
        part: winner.id, score: winner.score, decisive: winner.decisive, shared: winner.shared,
        hint: winner.hint, confidence, sources, importable,
        runnerUp: tied ? { id: (winner === top ? next : top).id, score: next.score } : null,
        reason: tied
            ? "tied with " + (winner === top ? next : top).id + " on " + winner.score + " decisive marker(s)" +
              (winner.hint ? "; folder name broke the tie" : "; neither folder name matched, first listed wins")
            : winner.score + " decisive marker(s): " + winner.decisive.join(", "),
    };
}

/**
 * Fold a list of classified folders into one report per part.
 *
 * *** MISSING IS NOT AN ERROR. *** The archive is not in this repository by design, so `linked: false` is a
 * healthy state and this returns `ok: true` for it. That distinction is the whole lesson of the arriving-pages
 * check, which spent versions reporting a normal condition as a failure until the shape was corrected: a gate
 * that cries about the ordinary case is a gate people learn to ignore, and then it cannot tell them anything.
 */
export function linkReport(found = []) {
    const byPart = new Map();
    for (const f of found) {
        if (!f || !f.part) continue;
        const prev = byPart.get(f.part);
        // Two copies of one part: keep the one with more sources. A half-extracted zip beside a full one
        // should not win by being listed first.
        if (!prev || (f.sources || 0) > (prev.sources || 0)) byPart.set(f.part, f);
    }
    const parts = PARTS.map((p) => {
        const hit = byPart.get(p.id) || null;
        return {
            id: p.id, title: p.title, what: p.what, role: p.role, port: p.port,
            modulesRecorded: p.modulesRecorded, inTreeFragment: p.inTreeFragment,
            present: !!hit, dir: hit ? hit.dir : null, sources: hit ? hit.sources : 0,
            importable: hit ? hit.importable : 0, rel: hit ? hit.rel : null,
            confidence: hit ? hit.confidence : null,
            // A count that disagrees with the recorded one is REPORTED, not judged: the archive is the
            // authority on its own size and this tree's note may simply be older than the folder.
            countsAgree: (hit && p.modulesRecorded != null) ? (hit.sources === p.modulesRecorded) : null,
        };
    });
    // *** v4160 -- A FOLDER INSIDE A LINKED PART IS THAT PART'S, NOT A STRANGER. ***
    // The real archive made this obvious the first time it was scanned: VBAEngine/addons/VBAOpenGL_Demos (69
    // modules), VBAVoxelEngine/graphics and VBAVoxelEngine/wad all came back "unclassified", which is true in
    // the narrow sense that none carries a decisive marker and useless in every other sense -- they are parts
    // OF the folders sitting linked directly above them. Reporting them as strangers buried the ONE folder in
    // that archive that genuinely was unrecognised. Containment is by directory, so it cannot be fooled by a
    // name; a sub-folder is listed under its parent part and never counted as a miss.
    const inside = (child, parent) => {
        if (!child || !parent) return false;
        const c = String(child).replace(/\\/g, "/"), p = String(parent).replace(/\\/g, "/");
        return c !== p && c.startsWith(p.replace(/\/+$/, "") + "/");
    };
    for (const p of parts) {
        p.subFolders = !p.dir ? [] : found.filter((f) => f && !f.part && (f.sources || 0) > 0 && inside(f.dir, p.dir))
                                        .map((f) => ({ rel: f.rel || f.name, name: f.name, sources: f.sources,
                                                       importable: f.importable, sample: f.sample || [] }));
    }
    const nested = new Set(parts.flatMap((p) => (p.subFolders || []).map((s2) => s2.rel)));
    const unclassified = found.filter((f) => f && !f.part && (f.sources || 0) > 0 &&
                                             !nested.has(f.rel || f.name));
    const present = parts.filter((p) => p.present).length;
    return {
        ok: true, provisional: PROVISIONAL, parts, unclassified,
        present, total: parts.length, linked: present > 0,
        summary: present === 0
            ? "no archive linked -- the VBA half ships separately and is not in this repository"
            : present + " of " + parts.length + " parts linked" +
              (unclassified.length ? ", " + unclassified.length + " folder(s) unclassified" : ""),
    };
}
