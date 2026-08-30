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
// *** AND THE MANIFEST IS PROVISIONAL UNTIL A REAL ARCHIVE HAS BEEN READ. *** These names are every name this
// tree records; they are not a directory listing of a folder anyone has opened here. `provisional: true` says
// so in the data rather than in a comment, the page prints it, and the honest response to a real archive that
// classifies badly is to widen the markers from ITS listing -- not to loosen the threshold until something
// matches.

/** VBA source extensions. `.frm` brings a `.frx` binary companion, which is not source and is not imported. */
export const VBA_EXT = new Set([".bas", ".cls", ".frm"]);

/** Document modules: they exist in every workbook and cannot be imported, only pasted. Never a marker. */
export const DOC_MODULE = /^(ThisWorkbook|Sheet\d+|Workbook|UserForm\d*)$/i;

/** How many decisive markers a folder needs before this module will name it. One is a coincidence: a person
 *  copying a single module out of the transmitter to read it would otherwise relabel the folder it landed in. */
export const MIN_DECISIVE = 2;

/** The archive is provisional until a real one has been read. See the header. */
export const PROVISIONAL = true;

export const PARTS = [
    {
        id: "transmitter",
        title: "VBA transmitter",
        what: "Winsock, and the HTTP / WebSocket / MQTT servers built on top of it. The one part that can HOST: " +
              "it serves the panels itself, so the bridge works with Node down.",
        // Shared/Net/README.md: "The full transmitter (189 modules ...)". Recorded, not counted here.
        modulesRecorded: 189,
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
        modulesRecorded: null,
        folderHints: ["vbaengine", "vbaenginecore", "openglengine", "vbaopengl"],
        decisive: ["Demo_BridgeFPS", "modGLConstants"],
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
        // WebGLEngine/NOTES.md 7358, verified there against the real workbook: "73 .bas/.cls (was 74)".
        modulesRecorded: 73,
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
        modulesRecorded: null,
        folderHints: ["vbasynccore", "vbasync", "addons", "vbaopengl_demos", "demos"],
        decisive: ["VBASyncImport", "VBASyncECS", "VBASyncEngine", "VBASyncGitHub"],
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
    if (!top || top.score < MIN_DECISIVE) {
        return { part: null, score: top ? top.score : 0, decisive: top ? top.decisive : [], shared: top ? top.shared : [],
                 hint: !!(top && top.hint), confidence: "none", sources, runnerUp: null,
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
        hint: winner.hint, confidence, sources,
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
            confidence: hit ? hit.confidence : null,
            // A count that disagrees with the recorded one is REPORTED, not judged: the archive is the
            // authority on its own size and this tree's note may simply be older than the folder.
            countsAgree: (hit && p.modulesRecorded != null) ? (hit.sources === p.modulesRecorded) : null,
        };
    });
    const unclassified = found.filter((f) => f && !f.part && (f.sources || 0) > 0);
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
