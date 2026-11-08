// WebGLEngine/tools/ship/pageNotes-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------------------------
// GATES THE RULE AND THE ROW. Keith, 2026-11-08: a note with instructions was written now and then and he "rarely/never" got to look at it and find it; "if a
// page has notes that are pertinent and go beyond either the obvious steps that the page may present, or completely separate rig runs that would be expected
// to be run and returned, then a Notes link on the page would be a necessary linkage."
//
// THE RULE (section 2, on the real tree): every note under brain/ (brain/*.md) is EITHER linked from a page in page-notes.json (pages), OR declared a RECORD
// (a registration and its result, a hand-off, a snapshot: nothing for a reader to do or run) with its reason in the same file. A note that is neither FAILS
// THIS GATE BY NAME, so a new note forces the decision on the day it is written. A record whose text carries an upper-case OWED must say
// its reason is "another chat": a note with owed work cannot be filed as a record to get green. (A lower-case "owed" does not count: two of another chat's
// notes say it in passing; no record's text carries the upper-case word today, so the row is proved on a made-up tree, section 1.) Rig runs that belong to no page are linked from server.html
// under kind "rig". Pages that are listed must include ui/pageNotesMount.mjs once, and a page that includes it must be listed.
// THE ROW (sections 4 and 5): ui/pageNotes.mjs run against a fake DOM and a stub fetch.
//
// Run: node tools/ship/pageNotes-selfcheck.mjs      (about 1 s)
//
// SABOTAGE: see the LOG at the foot of this header, written when the sweeps finished.
// LOG (2026-11-08; harness /tmp/claude-0/sab, as the gputaskman gates'; every sweep in an isolated tree; the real files were checked byte-identical after each).
//   THE MODULE ui/pageNotes.mjs (sha256 968f60bb40e30bc0...; 84 mechanical mutants of its code, comments and the string literals excepted): 58 caught (48 RED, 10 CRASH),
//     26 survivors. Two of them (P0065, P0066: the "loading <path>..." line shown while a note is fetched, "+" -> "-" in either place) were a REAL GAP: no row read
//     the viewer while the answer was pending. A row was added (section 5, "while a note is loading ..."); both mutants are now RED. The other 24 are the
//     NUMBERS INSIDE THE CSS STRINGS (font sizes, paddings, radii, the z-index, the 1.5 line height, a 255 and a 256 in a colour, the 20px in calc(100vw - 20px)): a
//     fake DOM has no layout, so no row can see them, and they are argued EQUIVALENT FOR THIS GATE. They were looked at instead, once, in a real browser
//     (Chromium by Playwright, a static server, no errors on the page): the inline card on privatelm.html at 900 px and at 390 px, on gputaskman.html, and the
//     floating pill and its opened panel on sea-ogre.html; text, links and "Read here" buttons present, the viewer fills with the note. A screenshot is not a gate.
//   THE REGISTRY page-notes.json (sha256 f84f9ae2bcc763c6...; 17 hand mutants, numbered J01-J20 with J09, J12 and J14 dropped before the run): 16 RED, 1 survivor (J18, a record's reason
//     rewritten so it no longer says "another chat"): EQUIVALENT ON THIS TREE, because the rule it would trip needs an upper-case OWED in the record's text and neither
//     record that says "another chat" (FISH_VESTIBULAR_HELPER_WIP.md, SUBMARINE_WIP.md) has one (they say a lower-case "owed" in passing). The rule itself is proved on
//     a made-up tree (section 1, "A NOTE WITH OWED WORK CANNOT BE FILED AS A RECORD"). The checker's first conjunct, `/\bOWED\b|rig command/i`, was dead code (the last
//     conjunct demands the upper-case word anyway) and was removed, and the comment above now says what the rule really is.
//   THE PAGE privatelm.html (6 hand mutants of the loader and the host element: the loader removed, the loader duplicated, the host duplicated, the host removed, the loader
//     followed by other content, the loader not a module): 6 RED.
//   NOT MUTATED: ui/pageNotesMount.mjs (two lines, held by the row that reads its source) and the eight other pages' one-line loader (the exact-set row).
//   KNOWN RED GATES AROUND IT, NOT THIS GATE'S (all identical on a clean checkout of the commit before this one): gateAxioms, gateSweep, instruments, registerResidue,
//   reportDoors, runtimeGap, shaderRefs; this gate adds one to the unswept count and one to the knowledge-index "added" count, which the ship step closes.
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as N from "../../ui/pageNotes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const REG_TEXT = fs.readFileSync(path.join(ENG, "page-notes.json"), "utf8");
const SRC = fs.readFileSync(path.join(ENG, "ui", "pageNotes.mjs"), "utf8");
const MOUNT = fs.readFileSync(path.join(ENG, "ui", "pageNotesMount.mjs"), "utf8");
const WATCHDOG = setTimeout(() => { console.log("  FAIL  the gate did not finish within 60 s"); process.exit(1); }, 60000);

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("pageNotes-selfcheck -- the rule that a note with instructions is linked, and the row that shows it\n");

// ---- the rule, as a function so it can be tried on made-up trees as well as the real one -----------------------------------------------------------
/** Check a registry against the notes that exist. files: ["brain/A.md", ...]; exists(p); text(p). Returns the list of problems (empty = holds). */
function checkRegistry(reg, files, exists, text) {
    const bad = [];
    if (!reg || reg.schema !== 1) bad.push("schema is not 1");
    if (!reg || typeof reg.rule !== "string" || reg.rule.length < 80) bad.push("the rule is not written in the registry");
    const pages = (reg && reg.pages) || {}, records = (reg && reg.records) || {};
    const linked = new Map();
    for (const [page, list] of Object.entries(pages)) {
        if (!/^[A-Za-z0-9_\-]+\.html$/.test(page) || !exists(page)) bad.push(`page ${page} is not a page of this engine`);
        if (!Array.isArray(list) || !list.length) { bad.push(`page ${page} lists no notes`); continue; }
        const seen = new Set();
        for (const n of list) {
            if (!n || typeof n.path !== "string" || !/^brain\/[A-Za-z0-9_\-]+\.md$/.test(n.path)) { bad.push(`${page}: an entry has a path that is not brain/<name>.md`); continue; }
            if (!exists(n.path)) bad.push(`${page}: ${n.path} does not exist`);
            if (seen.has(n.path)) bad.push(`${page}: ${n.path} is listed twice`); seen.add(n.path);
            if (typeof n.title !== "string" || n.title.trim().length < 3) bad.push(`${page}: ${n.path} has no title`);
            if (typeof n.why !== "string" || n.why.trim().length < 20) bad.push(`${page}: ${n.path} has no reason (at least 20 characters)`);
            if (n.kind !== undefined && !N.KINDS.includes(n.kind)) bad.push(`${page}: ${n.path} has an unknown kind`);
            if (n.kind === "rig" && page !== "server.html") bad.push(`${page}: ${n.path} is kind rig, which belongs on server.html (runs that belong to no page)`);
            linked.set(n.path, (linked.get(n.path) || 0) + 1);
        }
    }
    for (const [p, why] of Object.entries(records)) {
        if (!exists(p)) bad.push(`record ${p} does not exist`);
        if (typeof why !== "string" || why.trim().length < 20) bad.push(`record ${p} has no reason (at least 20 characters)`);
        if (linked.has(p)) bad.push(`${p} is both linked and declared a record`);
        if (exists(p) && /\bOWED\b/.test(text(p)) && !/another chat/.test(String(why))) bad.push(`record ${p} carries an OWED in its text but its reason is not "another chat": a note with owed work is not a record`);
    }
    for (const f of files) if (!linked.has(f) && !(f in records)) bad.push(`THE NOTE ${f} IS NEITHER LINKED FROM A PAGE NOR DECLARED A RECORD`);
    return bad;
}

// ---- 1. the checker itself, on made-up trees ---------------------------------------------------------------------------------------------------------------------
console.log("1. THE CHECKER, ON MADE-UP TREES");
{
    const files = ["brain/A.md", "brain/B.md", "brain/C.md"], have = new Set([...files, "p.html", "server.html"]), ex = (p) => have.has(p), tx = () => "plain text";
    const why = "a reason that is long enough";
    const good = { schema: 1, rule: "r".repeat(100), pages: { "p.html": [{ path: "brain/A.md", title: "A note", why }], "server.html": [{ path: "brain/B.md", title: "B note", why, kind: "rig" }] }, records: { "brain/C.md": "a record with a long enough reason" } };
    ok("a registry that classifies every note passes", checkRegistry(good, files, ex, tx).length === 0);
    const withNew = checkRegistry(good, [...files, "brain/NEW.md"], ex, tx);
    ok("!! A NEW NOTE THAT IS NEITHER LINKED NOR A RECORD FAILS, BY NAME", withNew.length === 1 && /THE NOTE brain\/NEW\.md IS NEITHER/.test(withNew[0]));
    const mut = (f) => { const r = JSON.parse(JSON.stringify(good)); f(r); return checkRegistry(r, files, ex, tx); };
    ok("a note removed from its page fails by name", mut((r) => { r.pages["p.html"] = [{ path: "brain/B.md", title: "B note", why }]; r.pages["server.html"] = [{ path: "brain/C.md", title: "C note", why, kind: "rig" }]; delete r.records["brain/C.md"]; }).some((x) => /brain\/A\.md IS NEITHER/.test(x)));
    ok("a record with no reason, or a short one, fails", mut((r) => { r.records["brain/C.md"] = ""; }).some((x) => /no reason/.test(x)) && mut((r) => { r.records["brain/C.md"] = "too short"; }).some((x) => /no reason/.test(x)));
    ok("a note that is both linked and a record fails", mut((r) => { r.records["brain/A.md"] = "a record with a long enough reason"; }).some((x) => /both linked and declared a record/.test(x)));
    ok("a page that does not exist fails", mut((r) => { r.pages["ghost.html"] = [{ path: "brain/A.md", title: "A note", why }]; }).some((x) => /ghost\.html is not a page/.test(x)));
    ok("a note that does not exist fails, linked or recorded", mut((r) => { r.pages["p.html"].push({ path: "brain/GONE.md", title: "Gone", why }); }).some((x) => /brain\/GONE\.md does not exist/.test(x)) && mut((r) => { r.records["brain/GONE.md"] = "a record with a long enough reason"; }).some((x) => /record brain\/GONE\.md does not exist/.test(x)));
    ok("an entry with a path outside brain/, or not .md, or with dots, fails", ["notes/A.md", "brain/A.txt", "brain/../A.md", "/brain/A.md", "brain/a b.md"].every((p) => mut((r) => { r.pages["p.html"].push({ path: p, title: "X note", why }); }).some((x) => /not brain\/<name>\.md/.test(x))));
    ok("a missing title, a missing reason and an unknown kind each fail", mut((r) => { r.pages["p.html"][0].title = " "; }).some((x) => /no title/.test(x)) && mut((r) => { r.pages["p.html"][0].why = "short"; }).some((x) => /no reason/.test(x)) && mut((r) => { r.pages["p.html"][0].kind = "other"; }).some((x) => /unknown kind/.test(x)));
    ok("kind rig anywhere but server.html fails", mut((r) => { r.pages["p.html"][0].kind = "rig"; }).some((x) => /belongs on server\.html/.test(x)));
    ok("the same note listed twice on one page fails; on two pages is allowed", mut((r) => { r.pages["p.html"].push(r.pages["p.html"][0]); }).some((x) => /listed twice/.test(x)) && mut((r) => { r.pages["server.html"].push({ path: "brain/A.md", title: "A again", why }); }).length === 0);
    ok("a page that lists nothing fails", mut((r) => { r.pages["p.html"] = []; }).some((x) => /lists no notes/.test(x)));
    ok("a wrong schema and an unwritten rule fail", mut((r) => { r.schema = 2; }).some((x) => /schema/.test(x)) && mut((r) => { r.rule = "short"; }).some((x) => /rule is not written/.test(x)));
    const owed = (why2) => { const r = JSON.parse(JSON.stringify(good)); r.records["brain/C.md"] = why2; return checkRegistry(r, files, ex, (p) => (p === "brain/C.md" ? "Some work is STILL OWED on the rig." : "plain")); };
    ok("!! A NOTE WITH OWED WORK CANNOT BE FILED AS A RECORD (unless the reason says it is another chat's)", owed("a record with a long enough reason").some((x) => /OWED in its text/.test(x)) && owed("another chat's note, not linked from this chat").length === 0);
    ok("a lower-case 'owed' in a record's text is not the marker", checkRegistry(good, files, ex, () => "the run was owed and has come back").length === 0);
}

// ---- 2. THE RULE, ON THE REAL TREE -------------------------------------------------------------------------------------------------------------------------------
console.log("\n2. THE RULE, ON THE REAL TREE");
const REG = JSON.parse(REG_TEXT);
const noteFiles = fs.readdirSync(path.join(ENG, "brain")).filter((f) => /\.md$/.test(f)).map((f) => "brain/" + f).sort();
{
    const problems = checkRegistry(REG, noteFiles, (p) => fs.existsSync(path.join(ENG, p)), (p) => fs.readFileSync(path.join(ENG, p), "utf8"));
    ok(`!! EVERY NOTE UNDER brain/ (${noteFiles.length}) IS LINKED FROM A PAGE OR DECLARED A RECORD, and the registry is well formed`, problems.length === 0, problems.slice(0, 3).join(" | "));
    ok("there are notes, pages and records (the checker was not run on nothing)", noteFiles.length >= 40 && Object.keys(REG.pages).length >= 8 && Object.keys(REG.records).length >= 15);
    ok("the registry is ASCII and ends with a newline", !/[^\x00-\x7F]/.test(REG_TEXT) && REG_TEXT.endsWith("\n"));
    const rig = (REG.pages["server.html"] || []).filter((n) => n.kind === "rig").map((n) => n.path);
    ok("the rig worklist on server.html holds the notes of the runs still owed (rig commands, the owed session, the Round 7 plain arm, Addendum 17, the backlog)", ["brain/RIG_COMMANDS_2026-11-07.md", "brain/RIG_SESSION_OWED_WIP.md", "brain/PLAIN14_DISTRIBUTION_WIP.md", "brain/FISH_WIRING_RANK_WIP.md", "brain/BACKLOG_PICKUPS_2026-11-05.md"].every((p) => rig.includes(p)));
    ok("the pages that Keith named are listed: privatelm, gputaskman, sea-ogre, sub-aquarium", ["privatelm.html", "gputaskman.html", "sea-ogre.html", "sub-aquarium.html"].every((p) => Array.isArray(REG.pages[p]) && REG.pages[p].length > 0));
}

// ---- 3. the loader on the pages ----------------------------------------------------------------------------------------------------------------------------------
console.log("\n3. THE LOADER ON THE PAGES");
{
    const htmls = fs.readdirSync(ENG).filter((f) => f.endsWith(".html")), LOAD = /<script type="module" src="\/ui\/pageNotesMount\.mjs"><\/script>/g;
    const withLoader = htmls.filter((f) => /pageNotesMount\.mjs/.test(fs.readFileSync(path.join(ENG, f), "utf8")));
    const listed = Object.keys(REG.pages).sort();
    ok("!! the pages that include the loader are exactly the pages the registry lists", eq(withLoader.sort(), listed), `loader but not listed: ${withLoader.filter((p) => !listed.includes(p)).join(",")}; listed but no loader: ${listed.filter((p) => !withLoader.includes(p)).join(",")}`);
    ok("each listed page includes the loader exactly once, as a module script, and a host element at most once", listed.every((p) => { const t = fs.readFileSync(path.join(ENG, p), "utf8"); return (t.match(LOAD) || []).length === 1 && (t.match(/<div id="swek-notes"><\/div>/g) || []).length <= 1; }));
    ok("the document-style pages (privatelm, gputaskman) show the row inline: they have the host element", ["privatelm.html", "gputaskman.html"].every((p) => /<div id="swek-notes"><\/div>/.test(fs.readFileSync(path.join(ENG, p), "utf8"))));
    ok("the loader is the last thing before </body>", listed.every((p) => { const t = fs.readFileSync(path.join(ENG, p), "utf8"), i = t.indexOf("pageNotesMount.mjs"), j = t.lastIndexOf("</body>"); const end = t.indexOf("</script>", i) + "</script>".length; return i > 0 && j > end && t.slice(end, j).trim() === ""; }));
}

// ---- 4. the pure half ----------------------------------------------------------------------------------------------------------------------------------------
console.log("\n4. THE PURE HALF (pageOf, notesFor, groups, getText, loadRegistry)");
const FIX = { pages: { "demo.html": [{ path: "brain/A.md", title: "  A note ", why: " because a ", kind: "notes" }, { path: "brain/R.md", title: "A rig run", why: "run it", kind: "rig" }, { path: "brain/Z.md", title: "Z note" }], "empty.html": [], "bad.html": "x" } };
const reply = (routes) => async (u, o = {}) => { const r = routes[u]; calls.push([u, o.method]); if (r === "throw") throw new Error("ECONNREFUSED"); if (!r) return { ok: false, status: 404, json: async () => ({}), text: async () => "" }; return { ok: r.status === undefined || r.status < 400, status: r.status || 200, json: async () => { if (r.badJson) throw new Error("bad json"); return r.json; }, text: async () => r.text }; };
let calls = [];
{
    ok("pageOf: the last segment of the path", N.pageOf("/sea-ogre.html") === "sea-ogre.html" && N.pageOf("/a/b/page.html") === "page.html");
    ok("pageOf: a query and a fragment are dropped", N.pageOf("/sub-aquarium.html?x=1#top") === "sub-aquarium.html" && N.pageOf("/p.html#a?b") === "p.html");
    ok("pageOf: the landing page for / and for nothing", N.pageOf("/") === "server.html" && N.pageOf("") === "server.html" && N.pageOf(null) === "server.html" && N.pageOf(undefined) === "server.html");
    ok("pageOf: a trailing slash names the folder", N.pageOf("/a/b/") === "b");
    const n = N.notesFor(FIX, "demo.html");
    ok("notesFor: the entries, trimmed, with the download path", n.length === 3 && eq(n[0], { path: "brain/A.md", title: "A note", why: "because a", kind: "notes", href: "/brain/A.md" }));
    ok("notesFor: a missing reason reads empty and a missing kind reads notes; an unknown kind reads notes", n[2].why === "" && n[2].kind === "notes" && N.notesFor({ pages: { p: [{ path: "brain/A.md", title: "T", kind: "weird" }] } }, "p")[0].kind === "notes");
    ok("notesFor: a page that is not there, an empty page and a page that is not a list give nothing", eq(N.notesFor(FIX, "nope.html"), []) && eq(N.notesFor(FIX, "empty.html"), []) && eq(N.notesFor(FIX, "bad.html"), []));
    ok("!! notesFor: the names an object carries (__proto__, constructor, toString) are not pages", ["__proto__", "constructor", "toString", "hasOwnProperty"].every((k) => eq(N.notesFor(FIX, k), [])));
    ok("notesFor: no registry, a registry with no pages, and a registry that is not an object give nothing", eq(N.notesFor(null, "x"), []) && eq(N.notesFor({}, "x"), []) && eq(N.notesFor({ pages: 5 }, "x"), []) && eq(N.notesFor("s", "x"), []));
    const dirty = { pages: { p: [null, 5, {}, { path: "../x.md", title: "T" }, { path: "/abs.md", title: "T" }, { path: "brain/x.txt", title: "T" }, { path: "brain/a b.md", title: "T" }, { path: "brain/a..md", title: "T" }, { path: "brain/ok.md", title: "  " }, { path: "brain/ok.md", title: 5 }, { path: "brain/good.md", title: "Good" }] } };
    ok("!! notesFor: entries with a bad path (up, absolute, not .md, a space), no title or a blank title are dropped; the good one stays", eq(N.notesFor(dirty, "p").map((x) => x.path), ["brain/good.md"]));
    ok("groups: notes first, then rig, each with its heading; an empty kind is left out", eq(N.groups(n).map((g) => [g.kind, g.heading, g.notes.length]), [["notes", "Notes", 2], ["rig", "Rig worklist: runs to do and send back", 1]]) && eq(N.groups(n.filter((x) => x.kind === "rig")).map((g) => g.kind), ["rig"]) && eq(N.groups([]), []));
    ok("the headings and kinds are the documented ones", eq(N.KINDS, ["notes", "rig"]) && N.HEADINGS.notes === "Notes" && Object.isFrozen(N.KINDS) && Object.isFrozen(N.HEADINGS));
    calls = [];
    ok("getText: the text of a file, always a string, asked with GET", eq(await N.getText("/brain/A.md", reply({ "/brain/A.md": { text: 12345 } })), { ok: true, text: "12345" }) && eq(calls, [["/brain/A.md", "GET"]]));
    ok("getText: an HTTP error and a failed fetch are plain failures with the reason", eq(await N.getText("/x", reply({ "/x": { status: 404, text: "" } })), { ok: false, error: "HTTP 404" }) && (await N.getText("/x", reply({ "/x": "throw" }))).error === "ECONNREFUSED");
    calls = [];
    ok("loadRegistry: the registry, asked for at /page-notes.json with GET", (await N.loadRegistry(reply({ "/page-notes.json": { json: FIX } }))).pages["demo.html"].length === 3 && eq(calls, [["/page-notes.json", "GET"]]) && N.REGISTRY_URL === "/page-notes.json");
    ok("loadRegistry: a 404, bad JSON, a non-object, null and a failed fetch all give null", (await N.loadRegistry(reply({ "/page-notes.json": { status: 404, json: {} } }))) === null && (await N.loadRegistry(reply({ "/page-notes.json": { badJson: true } }))) === null && (await N.loadRegistry(reply({ "/page-notes.json": { json: 5 } }))) === null && (await N.loadRegistry(reply({ "/page-notes.json": { json: null } }))) === null && (await N.loadRegistry(reply({ "/page-notes.json": "throw" }))) === null);
}

// ---- 5. the DOM half --------------------------------------------------------------------------------------------------------------------------------------------
console.log("\n5. THE DOM HALF, AGAINST A FAKE DOCUMENT");
function el(tag) {
    const e = { tag, children: [], className: "", id: "", hidden: false, _t: "", onclick: null, href: "", download: undefined, rel: "" };
    Object.defineProperty(e, "textContent", { get() { return this._t; }, set(v) { this._t = String(v); this.children = []; }, enumerable: true });
    e.append = (...c) => { e.children.push(...c); };
    return e;
}
const walk = (root) => { const out = [root]; for (const c of root.children) out.push(...walk(c)); return out; };
function fakeDoc(host = false, over = {}) {
    const body = el("body"), head = el("head"); if (host) { const h = el("div"); h.id = "swek-notes"; body.append(h); }
    const doc = { body, head, createElement: over.createElement || el, getElementById: (id) => [...walk(head), ...walk(body)].find((e) => e.id === id) || null };
    return doc;
}
const find = (root, pred) => walk(root).filter(pred);
const slowReply = (routes, gates) => async (u, o = {}) => { if (gates && gates[u]) await gates[u]; return reply(routes)(u, o); };
const REGS = { "/page-notes.json": { json: FIX }, "/brain/A.md": { text: "# note A\nline" }, "/brain/R.md": { text: "# the rig run" }, "/brain/Z.md": "throw" };
{
    calls = [];
    const doc = fakeDoc(true), r = await N.mountNotes(doc, reply(REGS), { pathname: "/demo.html" });
    ok("inline: a host element gets the row, mode inline, the page and the notes returned", r && r.mode === "inline" && r.page === "demo.html" && r.notes.length === 3);
    const host = doc.getElementById("swek-notes"), shell = host.children[0];
    ok("inline: the shell is inside the host, classed inline, titled with the count", host.children.length === 1 && shell.className === "swek-notes inline" && shell.children[0].textContent === "Notes for this page (3)" && shell.children[0].className === "head");
    ok("the style is added once, to the head, and carries the hidden rule and the corner position", find(doc.head, (e) => e.id === "swek-notes-style").length === 1 && /\[hidden\] \{ display: none !important/.test(doc.getElementById("swek-notes-style").textContent) && /position: fixed; left: 10px; bottom: 10px/.test(doc.getElementById("swek-notes-style").textContent));
    const heads = find(shell, (e) => e.className === "head").map((e) => e.textContent);
    ok("the headings: Notes, then the rig worklist (and the shell's own title first)", eq(heads, ["Notes for this page (3)", "Notes", "Rig worklist: runs to do and send back"]));
    const links = find(shell, (e) => e.tag === "a");
    ok("!! each note is a link to /brain/<name>.md that DOWNLOADS (download set, an empty string), with rel noopener and the note's title", links.length === 3 && eq(links.map((a) => a.href), ["/brain/A.md", "/brain/Z.md", "/brain/R.md"]) && links.every((a) => a.download === "" && a.rel === "noopener") && eq(links.map((a) => a.textContent), ["A note", "Z note", "A rig run"]));
    const whys = find(shell, (e) => e.className === "why").map((e) => e.textContent), btns = find(shell, (e) => e.tag === "button");
    ok("each note shows its reason after a dash (nothing for a note with none) and has a Read here button", eq(whys, [" - because a", "", " - run it"]) && btns.length === 3 && btns.every((b) => b.textContent === "Read here" && b.className === "read"));
    const view = find(shell, (e) => e.tag === "pre")[0];
    ok("the text box starts hidden, and nothing was fetched but the registry", view.hidden === true && eq(calls, [["/page-notes.json", "GET"]]));
    calls = []; btns[0].onclick(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("Read here fetches that note once with GET and shows its text in the box", eq(calls, [["/brain/A.md", "GET"]]) && view.hidden === false && view.textContent === "# note A\nline" && view.className === "");
    btns[0].onclick(); ok("pressing it again hides the box and fetches nothing", view.hidden === true && calls.length === 1);
    btns[0].onclick(); await new Promise((r2) => setImmediate(r2));
    ok("!! pressing it a third time shows the text again from the cache: still one fetch", view.hidden === false && view.textContent === "# note A\nline" && calls.length === 1);
    btns[2].onclick(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("another note replaces the text and is fetched on its own", view.textContent === "# the rig run" && calls.length === 2 && calls[1][0] === "/brain/R.md");
    btns[1].onclick(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("a note that cannot be loaded says so with its path, the reason and the likely cause, in the bad class", view.className === "bad" && /^could not load brain\/Z\.md: ECONNREFUSED \(is the engine's bridge running and serving this folder\?\)$/.test(view.textContent) && view.hidden === false);
    btns[1].onclick(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("!! and pressing it again tries again (a failure is not remembered as loaded)", calls.filter((c) => c[0] === "/brain/Z.md").length === 2);
    btns[0].onclick(); await new Promise((r2) => setImmediate(r2));
    ok("a good note after a failed one clears the bad class", view.className === "" && view.textContent === "# note A\nline");
}
{
    // while a note is loading the viewer is open and names it
    let rel; const g = new Promise((r2) => { rel = r2; });
    const doc = fakeDoc(true), f = slowReply(REGS, { "/brain/A.md": g });
    await N.mountNotes(doc, f, { pathname: "/demo.html" });
    const btns = find(doc.getElementById("swek-notes"), (e) => e.tag === "button"), view = find(doc.getElementById("swek-notes"), (e) => e.tag === "pre")[0];
    btns[0].onclick();
    const during = { text: view.textContent, hidden: view.hidden };
    rel(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("!! while a note is loading the viewer is open and says so with the note's path, then shows the text", during.hidden === false && during.text === "loading brain/A.md..." && view.textContent === "# note A\nline");
}
{
    // a slow note must not overwrite a note chosen after it
    let relA, relB; const gA = new Promise((r2) => { relA = r2; }), gB = new Promise((r2) => { relB = r2; });
    const doc = fakeDoc(true), f = slowReply(REGS, { "/brain/A.md": gA, "/brain/R.md": gB });
    await N.mountNotes(doc, f, { pathname: "/demo.html" });
    const btns = find(doc.getElementById("swek-notes"), (e) => e.tag === "button"), view = find(doc.getElementById("swek-notes"), (e) => e.tag === "pre")[0];
    btns[0].onclick(); btns[2].onclick(); relB(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2)); relA(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("!! a slow answer for the first note does not overwrite the note chosen after it", view.textContent === "# the rig run");
    const doc2 = fakeDoc(true); let relC; const gC = new Promise((r2) => { relC = r2; });
    await N.mountNotes(doc2, slowReply({ ...REGS, "/brain/A.md": "throw" }, { "/brain/A.md": gC }), { pathname: "/demo.html" });
    const b2 = find(doc2.getElementById("swek-notes"), (e) => e.tag === "button"), v2 = find(doc2.getElementById("swek-notes"), (e) => e.tag === "pre")[0];
    b2[0].onclick(); b2[2].onclick(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2)); relC(); await new Promise((r2) => setImmediate(r2)); await new Promise((r2) => setImmediate(r2));
    ok("!! and a slow FAILURE for the first note does not overwrite the note chosen after it either", v2.textContent === "# the rig run" && v2.className === "");
}
{
    calls = [];
    const doc = fakeDoc(false), r = await N.mountNotes(doc, reply(REGS), { pathname: "/demo.html" });
    const shell = doc.body.children[0], pill = shell.children[0], panel = shell.children[1];
    ok("floating: with no host the shell goes on the body, classed floating, mode floating", r.mode === "floating" && doc.body.children.length === 1 && shell.className === "swek-notes floating");
    ok("floating: a pill with the count, and a panel that starts hidden", pill.tag === "button" && pill.className === "pill" && pill.textContent === "Notes (3)" && panel.className === "panel" && panel.hidden === true);
    pill.onclick(); ok("pressing the pill opens the panel and pressing it again closes it", panel.hidden === false && (pill.onclick(), panel.hidden === true));
    ok("the panel holds the same row (links and buttons)", find(panel, (e) => e.tag === "a").length === 3 && find(panel, (e) => e.tag === "button").length === 3);
}
{
    const none = async (regs, loc, d = fakeDoc(true)) => { const before = walk(d.body).length + walk(d.head).length; const r = await N.mountNotes(d, reply(regs), loc); return { r, same: walk(d.body).length + walk(d.head).length === before }; };
    const a = await none(REGS, { pathname: "/unlisted.html" }), b = await none({}, { pathname: "/demo.html" }), c = await none({ "/page-notes.json": { json: { pages: { "demo.html": [{ path: "x", title: "T" }] } } } }, { pathname: "/demo.html" }), d = await none({ "/page-notes.json": "throw" }, { pathname: "/demo.html" });
    ok("!! a page that is not in the registry, an unreadable registry, a page whose entries are all invalid and a failed fetch each leave the page UNTOUCHED and return null", [a, b, c, d].every((x) => x.r === null && x.same));
    const boom = fakeDoc(true, { createElement: () => { throw new Error("no DOM"); } });
    ok("a DOM that throws never makes the loader throw: it returns null", (await N.mountNotes(boom, reply(REGS), { pathname: "/demo.html" })) === null);
    const home = await N.mountNotes(fakeDoc(false), reply({ "/page-notes.json": { json: { pages: { "server.html": [{ path: "brain/A.md", title: "Rig", why: "w", kind: "rig" }] } } } }), { pathname: "/" });
    ok("the landing page (/) takes the server.html notes", home && home.page === "server.html" && home.notes[0].kind === "rig");
    ok("with no location the landing page is assumed", (await N.mountNotes(fakeDoc(false), reply({ "/page-notes.json": { json: { pages: { "server.html": [{ path: "brain/A.md", title: "Rig", why: "w" }] } } } }), null)) !== null);
}

// ---- 6. the source --------------------------------------------------------------------------------------------------------------------------------------------
console.log("\n6. THE SOURCE");
{
    ok("!! the module builds the row with createElement and textContent only: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval or Function", !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/.test(SRC));
    ok("the module touches no global (document, window, fetch, location) of its own: everything comes in as a parameter", !/[^.\w]document\.|[^.\w]window\.|[^.\w]fetch\(|[^.\w]location\./.test(SRC.replace(/\/\/.*$/gm, "")));
    ok("the loader imports the module by its absolute path and calls mountNotes with document, fetch and location, and nothing else", /import \{ mountNotes \} from "\/ui\/pageNotes\.mjs";/.test(MOUNT) && /mountNotes\(document, \(u, o\) => fetch\(u, o\), location\);/.test(MOUNT) && MOUNT.split("\n").filter((l) => !/^\s*(\/\/|$)/.test(l)).length === 2);
}

clearTimeout(WATCHDOG);
console.log(fails ? `\npageNotes-selfcheck: ${fails} FAILED` : "\npageNotes-selfcheck: all checks pass");
if (fails) process.exit(1);
