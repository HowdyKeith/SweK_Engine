// moduleHistoryBridge.js -- front door for tools/ship/moduleHistory.mjs. Owns /modulehistory.
//
//   GET  /modulehistory                       -> { ok, builds:[{version,n}], searched:[{dir,found}] }
//   GET  /modulehistory/recoverable           -> { ok, rows, wanted, recoverableCount }
//   GET  /modulehistory/find?path=ui/PerfHUD.js -> { ok, path, rows, lastPresent, firstAbsent, vanishedBetween, inTree }
//   POST /modulehistory/restore { paths:[...] } -> { ok, restored:[...], refused:[...] }
//
// v3203 -- Keith's front-door law: a .mjs that can only be run from a console is unfinished. The question this
// answers ("which shipped zip last held this file, and when did it vanish") has been asked by hand FIVE times.
//
// IT NEVER REIMPLEMENTS THE ANSWER. Every route lazily await-imports the ESM tool and returns what the tool
// says. That is not tidiness: v3046 shipped a bridge whose 17 checks all passed while the module it delegated to
// did not exist, because "it imports the verdict rather than computing one" was never checked -- so this file
// computes no history of its own, and its gate asserts there is no second zip walk in here.
//
// RESTORE IS THE ONLY WRITING ROUTE AND IT IS THE DANGEROUS ONE. Three rules, each with a reason:
//   1. LOCAL ONLY, like every other tool bridge here.
//   2. IT WILL NOT OVERWRITE. A file already in the tree is REFUSED, never replaced. Restoring over a newer
//      version of a file would silently undo work, which is the ratchet-growing-back failure v3126 caught in
//      orphan-baseline.json -- and it is exactly the shape that would be hardest to notice afterwards.
//   3. A PATH MUST BE ONE THE TOOL ALREADY NAMED AS RECOVERABLE. Not a pattern check on the string: the
//      requested path must be a MEMBER of the recoverable set the tool computed this request, which is
//      gatesBridge's argument (v2806) for taking a name that must belong to a discovered list. Traversal is
//      impossible by construction rather than by regex.
"use strict";
const fs = require("fs");
const path = require("path");

const PREFIX = "/modulehistory";
// v3951 -- SEGMENT, NOT PREFIX. There is no modulehistory.html today, so unlike economyBridge and frugonBridge
// this one was not breaking anything -- it was the same shape waiting for a file to be named after it, and
// routeShadow-selfcheck found it while the other two were being fixed. A prefix owner answers 404 for a page it
// does not serve and did not know it had claimed; the page then reads as MISSING rather than as TAKEN, which is
// the part that costs an afternoon. One line, before it can be the third instance.
function owns(url) { const p = String(url || "").split("?")[0]; return p === PREFIX || p.startsWith(PREFIX + "/"); }

// v3204 -- USE THE SERVER'S OWN DEFINITION OF "LOCAL", PASSED IN AS ctx.isLocal.
//
// This bridge shipped with a hand-rolled check accepting ONLY 127.0.0.1/::1/::ffff:127.0.0.1, and Keith opened
// the page and got "local only" on every route. A browser ON THE HOST that reaches the bridge by the machine's
// LAN IP has a remoteAddress of that LAN IP, NOT 127.*, so same-machine requests read as remote.
//
// *** server.js:3739 ALREADY SOLVED THIS AT v1543 AND LEFT A COMMENT EXPLAINING IT, and I wrote the pre-v1543
// version anyway -- the fourth copy of one question in a tree whose whole v3203 round was about two copies of
// one question drifting apart. The rule earned three times now: IF THE TREE ALREADY ANSWERS IT, IMPORT THE
// ANSWER. ***
//
// The fallback stays STRICT rather than permissive: if a caller ever forgets to pass ctx.isLocal, the failure
// should be "refused something it could have allowed", never "allowed something it should have refused". The
// gate asserts server.js does pass it, so the strict path is not the one in daily use.
function isLocalFallback(req) {
    const a = String((req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
    return /^(::1|127\.)/.test(a);
}
function localOk(req, ctx) {
    return (ctx && typeof ctx.isLocal === "function") ? !!ctx.isLocal(req) : isLocalFallback(req);
}

async function tool() { return await import("../tools/ship/moduleHistory.mjs"); }

function handle(req, res, ctx) {
    const send = (ctx && ctx.sendJson) ? ctx.sendJson : ((o, c) => { res.writeHead(c || 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const urlPath = String(req.url || "").split("?")[0];
    const query = new URLSearchParams(String(req.url || "").split("?")[1] || "");

    if (!localOk(req, ctx)) {
        // SAY WHICH ADDRESS WAS REJECTED. "local only" with no address is unactionable -- it cannot be told
        // apart from a bug in the check itself, which is exactly what it was.
        const seen = String((req.socket && req.socket.remoteAddress) || "unknown");
        send({ ok: false, why: "local only -- this request came from " + seen + ", which the server does not count as this machine" }, 403);
        return;
    }

    (async () => {
        try {
            const M = await tool();

            if (urlPath === PREFIX || urlPath === PREFIX + "/") {
                const { builds, searched } = M.indexArchives();
                // AN EMPTY ARCHIVE IS NAMED, WITH THE DIRECTORIES SEARCHED. A page that rendered zero builds as
                // a clean result would report "nothing was ever lost" when the truth is "nothing was examined".
                send({
                    ok: true,
                    builds: builds.map((b) => ({ version: b.version, n: b.n })),
                    searched,
                    why: builds.length ? null : "no SweK_Engine_v*.zip found in any searched directory",
                });
                return;
            }

            // v3208 -- the archive lives wherever the user keeps it, and this tool could not be told.
            if (urlPath === PREFIX + "/dirs") {
                if (req.method === "GET") { send({ ok: true, configured: M.configuredArchiveDirs(), searched: M.indexArchives().searched }); return; }
                if (req.method !== "POST") { send({ ok: false, why: "GET or POST" }, 405); return; }
                let body = ""; req.on("data", (c) => { body += c; if (body.length > 1e5) req.destroy(); });
                req.on("end", () => {
                    let d;
                    try { d = JSON.parse(body || "{}"); } catch { send({ ok: false, why: "bad body" }, 400); return; }
                    // ADD REPORTS A VERDICT, NOT AN OK. A typo or a wrong drive letter is the likeliest mistake
                    // here, and silently accepting one puts the page straight back to answering "not in any
                    // archived build" out of a folder it cannot read -- the defect this route exists to end.
                    const r = d.remove ? M.removeArchiveDir(d.remove) : M.addArchiveDir(d.add);
                    send(Object.assign({ ok: r.ok !== false }, r), r.ok === false ? 400 : 200);
                });
                return;
            }

            if (urlPath === PREFIX + "/recoverable") {
                const { builds } = M.indexArchives();
                const r = M.recoverable({ builds });
                if (r.refused) { send({ ok: false, why: r.refused }, 409); return; }
                // v3209 -- FORWARD THE TOOL'S ANSWER, DO NOT RESTATE IT.
                //
                // This used to name the three fields it passed on: rows, wanted, recoverableCount. v3208 added
                // realCount and counts to the tool, the page read them, and THE PAGE PRINTED "undefined
                // genuinely missing" -- because a hand-listed whitelist silently drops anything added later.
                // It is the same defect as every other one this month in miniature: A SECOND STATEMENT OF ONE
                // SHAPE, drifting from the first the moment the first changes. The bridge's job is delegation,
                // and a delegate that edits the answer on the way through is not delegating.
                send(Object.assign({ ok: true }, r));
                return;
            }

            if (urlPath === PREFIX + "/find") {
                const p = query.get("path") || "";
                if (!p.trim()) { send({ ok: false, why: "path is required -- an empty path would search for nothing and look like an answer" }, 400); return; }
                const { builds } = M.indexArchives();
                const h = M.historyOf(p, { builds });
                if (h.refused) { send({ ok: false, why: h.refused }, 409); return; }
                send(Object.assign({ ok: true }, h));
                return;
            }

            if (urlPath === PREFIX + "/restore") {
                if (req.method !== "POST") { send({ ok: false, why: "POST only" }, 405); return; }
                let body = ""; req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
                req.on("end", async () => {
                    let wantList;
                    try { wantList = JSON.parse(body || "{}").paths; } catch { send({ ok: false, why: "bad body" }, 400); return; }
                    if (!Array.isArray(wantList) || !wantList.length) { send({ ok: false, why: "paths must be a non-empty array" }, 400); return; }
                    const { builds } = M.indexArchives();
                    const r = M.recoverable({ builds });
                    if (r.refused) { send({ ok: false, why: r.refused }, 409); return; }
                    const allowed = new Map(r.rows.filter((x) => x.recoverable).map((x) => [x.target, x]));
                    const restored = [], refused = [];
                    for (const raw of wantList) {
                        const rel = String(raw || "");
                        const row = allowed.get(rel);
                        if (!row) { refused.push({ path: rel, why: "not in the recoverable set the tool just computed" }); continue; }
                        const dest = path.join(M.ENG, row.archivePath.replace(/^WebGLEngine\//, ""));
                        if (fs.existsSync(dest)) { refused.push({ path: rel, why: "already in the tree -- this route never overwrites" }); continue; }
                        const build = builds.find((b) => b.version === row.from);
                        const hit = M.readFromZip(build.file, row.archivePath);
                        if (!hit) { refused.push({ path: rel, why: "vanished from the archive between listing and read" }); continue; }
                        let bytes;
                        try { bytes = M.inflateEntry(hit.buf, hit.entry); }
                        catch (e) { refused.push({ path: rel, why: "could not inflate: " + (e.message || e) }); continue; }
                        fs.mkdirSync(path.dirname(dest), { recursive: true });
                        fs.writeFileSync(dest, bytes);
                        restored.push({ path: rel, from: row.from, bytes: bytes.length });
                    }
                    send({ ok: true, restored, refused });
                });
                return;
            }

            send({ ok: false, why: "unknown route" }, 404);
        } catch (e) {
            send({ ok: false, why: String((e && e.message) || e) }, 500);
        }
    })();
}

module.exports = { owns, handle };
