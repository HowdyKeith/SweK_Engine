// WebGLEngine/ui/pageNotes.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------------------------
// THE "NOTES" ROW THAT A PAGE SHOWS FOR THE .md FILES THAT BELONG TO IT. Keith, 2026-11-08: a note with instructions was written now and then and he
// "rarely/never" got to look at it and find it; so a page that has notes which go beyond the steps the page itself presents, or that sends the reader
// off to a rig run to do and return, must LINK them. The rule is enforced by tools/ship/pageNotes-selfcheck.mjs: every brain/*.md note is either on a
// page in page-notes.json, or is declared a record (a registration and its result, nothing for a reader to do) with the reason in the same file.
//
// This file is the pure half and the DOM half, both taking what they touch as parameters (a document, a fetch, a location), so the gate runs all of it
// against a fake DOM and a stub fetch. ui/pageNotesMount.mjs is the one-line loader a page includes. The row reads /page-notes.json (the registry), finds
// the notes of THIS page by its file name, and shows: each note's title as a link (the bridge serves a .md file as a download, so the link is a download),
// the reason it is there, and a "Read here" button that shows the text in place. A page with a host element <div id="swek-notes"></div> gets the row inline
// where the element is; a page without one gets a small floating "Notes (n)" button in the bottom-left corner, so a full-screen 3D page loses no room.
// A page with no notes in the registry gets nothing. A registry that cannot be read gets nothing and no error.
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";

export const REGISTRY_URL = "/page-notes.json";
export const HOST_ID = "swek-notes";
export const STYLE_ID = "swek-notes-style";
export const KINDS = Object.freeze(["notes", "rig"]);
export const HEADINGS = Object.freeze({ notes: "Notes", rig: "Rig worklist: runs to do and send back" });
const NOTE_PATH = /^[A-Za-z0-9_\-\/.]+\.md$/;

const CSS = [
    ".swek-notes { font: 13px/1.5 system-ui, sans-serif; color: #dbe7f5; }",
    ".swek-notes [hidden] { display: none !important; }",
    ".swek-notes.inline { border: 1px solid #243246; border-radius: 10px; padding: 10px 14px; margin: 18px 0; background: rgba(255,255,255,.02); max-width: 860px; }",
    ".swek-notes.floating { position: fixed; left: 10px; bottom: 10px; z-index: 2147483000; max-width: min(560px, calc(100vw - 20px)); }",
    ".swek-notes .pill { background: #16202c; color: #dbe7f5; border: 1px solid #3b7a4b; border-radius: 999px; padding: 5px 12px; font: 12px system-ui; cursor: pointer; }",
    ".swek-notes .panel { background: #0b1016; border: 1px solid #243246; border-radius: 10px; padding: 10px 14px; margin-top: 6px; max-height: 70vh; overflow: auto; box-shadow: 0 6px 24px rgba(0,0,0,.5); }",
    ".swek-notes .head { color: #7fd88f; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; margin: 8px 0 4px; }",
    ".swek-notes ul { list-style: none; margin: 0; padding: 0; } .swek-notes li { margin: 6px 0; }",
    ".swek-notes a { color: #7fd88f; } .swek-notes .why { color: #8aa0b8; }",
    ".swek-notes button.read { margin-left: 8px; background: #16202c; color: #dbe7f5; border: 1px solid #243246; border-radius: 6px; padding: 1px 8px; font: 12px system-ui; cursor: pointer; }",
    ".swek-notes pre { background: #070b10; border: 1px solid #243246; border-radius: 7px; padding: 10px; margin: 8px 0 0; font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow: auto; }",
    ".swek-notes pre.bad { color: #ff8a8a; }",
].join("\n");

/** The file name of the page a pathname belongs to: the last segment, or the landing page for "/". */
export function pageOf(pathname) {
    const seg = String(pathname == null ? "" : pathname).split("?")[0].split("#")[0].split("/").filter(Boolean).pop();
    return seg || "server.html";
}

/** The notes the registry gives a page, cleaned: [{ path, title, why, kind, href }]. A malformed registry or entry gives nothing, not a throw. */
export function notesFor(registry, page) {
    const pages = registry && typeof registry === "object" ? registry.pages : null;
    const list = pages && typeof pages === "object" && Object.prototype.hasOwnProperty.call(pages, page) ? pages[page] : null;
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const n of list) {
        if (!n || typeof n.path !== "string" || !NOTE_PATH.test(n.path) || n.path.includes("..") || n.path.startsWith("/")) continue;
        if (typeof n.title !== "string" || !n.title.trim()) continue;
        out.push({ path: n.path, title: n.title.trim(), why: typeof n.why === "string" ? n.why.trim() : "", kind: n.kind === "rig" ? "rig" : "notes", href: "/" + n.path });
    }
    return out;
}

/** The notes split by kind, in the fixed order, with a heading each; empty kinds are left out. */
export function groups(notes) {
    return KINDS.map((k) => ({ kind: k, heading: HEADINGS[k], notes: notes.filter((n) => n.kind === k) })).filter((g) => g.notes.length > 0);
}

/** A text file from the engine: { ok, text } or { ok: false, error }. */
export async function getText(url, fetchImpl) {
    try {
        const r = await fetchImpl(url, { method: "GET" });
        if (!r.ok) return { ok: false, error: "HTTP " + r.status };
        return { ok: true, text: String(await r.text()) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

/** The registry, or null when it cannot be read. */
export async function loadRegistry(fetchImpl) {
    try {
        const r = await fetchImpl(REGISTRY_URL, { method: "GET" });
        if (!r.ok) return null;
        const j = await r.json();
        return j && typeof j === "object" ? j : null;
    } catch (e) { return null; }
}

function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const st = doc.createElement("style"); st.id = STYLE_ID; st.textContent = CSS;
    (doc.head || doc.body).append(st);
}

/** Build the row for these notes: { root, view } -- the element and the text box. All text goes in as textContent. */
export function buildRow(doc, notes, fetchImpl) {
    const root = doc.createElement("div"), view = doc.createElement("pre"), cache = new Map();
    view.hidden = true; let shown = null;
    const show = async (note, button) => {
        if (shown === note.path) { view.hidden = true; shown = null; return; }
        shown = note.path; view.hidden = false; view.className = ""; view.textContent = "loading " + note.path + "...";
        if (!cache.has(note.path)) {
            const r = await getText(note.href, fetchImpl);
            if (!r.ok) { if (shown === note.path) { view.className = "bad"; view.textContent = "could not load " + note.path + ": " + r.error + " (is the engine's bridge running and serving this folder?)"; } shown = null; return; }
            cache.set(note.path, r.text);
        }
        if (shown === note.path) view.textContent = cache.get(note.path);
    };
    for (const g of groups(notes)) {
        const head = doc.createElement("div"); head.className = "head"; head.textContent = g.heading; root.append(head);
        const ul = doc.createElement("ul");
        for (const n of g.notes) {
            const li = doc.createElement("li"), a = doc.createElement("a"), why = doc.createElement("span"), btn = doc.createElement("button");
            a.href = n.href; a.download = ""; a.rel = "noopener"; a.textContent = n.title;
            why.className = "why"; why.textContent = n.why ? " - " + n.why : "";
            btn.className = "read"; btn.textContent = "Read here"; btn.onclick = () => show(n, btn);
            li.append(a, why, btn); ul.append(li);
        }
        root.append(ul);
    }
    root.append(view);
    return { root, view };
}

/** Mount the Notes row for the page at `loc`. Returns { page, notes, mode } or null when there is nothing to show. Never throws. */
export async function mountNotes(doc, fetchImpl, loc) {
    try {
        const page = pageOf(loc && loc.pathname), notes = notesFor(await loadRegistry(fetchImpl), page);
        if (!notes.length) return null;
        ensureStyle(doc);
        const host = doc.getElementById(HOST_ID), { root } = buildRow(doc, notes, fetchImpl), shell = doc.createElement("div");
        if (host) {
            shell.className = "swek-notes inline";
            const title = doc.createElement("div"); title.className = "head"; title.textContent = "Notes for this page (" + notes.length + ")";
            shell.append(title, root); host.append(shell);
            return { page, notes, mode: "inline" };
        }
        shell.className = "swek-notes floating";
        const pill = doc.createElement("button"), panel = doc.createElement("div");
        pill.className = "pill"; pill.textContent = "Notes (" + notes.length + ")"; panel.className = "panel"; panel.hidden = true; panel.append(root);
        pill.onclick = () => { panel.hidden = !panel.hidden; };
        shell.append(pill, panel); doc.body.append(shell);
        return { page, notes, mode: "floating" };
    } catch (e) { return null; }
}
