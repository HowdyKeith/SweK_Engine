// WebGLEngine/tools/ship/launchIndex.mjs — v3544
// ---------------------------------------------------------------------------------------------------------------
// ONE INDEX, THREE KINDS — because the three pills on server.html were listing three different KINDS of thing and
// calling them all "demos", and only one of the three was a page anybody could find any other way.
//
// WHAT THE PILLS ACTUALLY HELD, counted:
//     Demos            56   demos_code/*.js, launched with ?go=<id> INTO THE RUNNING ENGINE. Not pages.
//     Built-In Demos   58   inline DEMO_MODES in main.js. Modes of the engine. Not pages either.
//     Applications     15   real .html files on disk.
//
// *** AND THIRTEEN OF THOSE FIFTEEN APPS WERE IN NO PANEL AT ALL. *** universal-viewer, comics, asset-library,
// ev-loader, outlook-rules, asset2voxels, markdown-tools, immich, home, raycast, voxel-photo-cube, lineage,
// brain-fleet -- reachable ONLY by opening that one dropdown. That is the exact failure server.html's own Arriving
// comments record four separate times: the page is built, it works, it ships in the zip, and the only way to
// open it is to type its filename out of a changelog.
//
// *** THE DESIGN DECISION, AND IT IS THE WHOLE FILE: ONE INDEX, AND EVERY ENTRY KNOWS WHAT KIND IT IS. ***
// Flattening all three into "things you can launch" would have been simpler to look at and would have lost the
// one distinction that matters -- whether the thing survives without the engine running. A page is a file you can
// open, bookmark, and screenshot in render-QA. A demo and a built-in are states the engine enters, and they
// exist only while it is up. Same list, same search, same panels; the entry carries its kind so a click does the
// right thing and NOTHING PRETENDS A MODE IS A PAGE.
//
// DISAMBIGUATION IS BUILT AND CURRENTLY UNEXERCISED, AND THAT IS SAID OUT LOUD. Keith asked for "Box3d" and
// "Box3d 2" when two things share a name. Checked at v3544: normalising case and separators across all 348 html
// files and all 114 launchables, THERE ARE ZERO COLLISIONS. The mechanism is here because the next page to land
// may collide and a silent overwrite is the failure it prevents -- but a mechanism with no live case is a
// mechanism nobody has watched work, so the gate constructs a collision deliberately rather than waiting for one.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SECTIONS, UNPLACED } from "./pageSections.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return null; } };

/** The three kinds. Named rather than boolean, because "is it a page" has three answers and not two. */
export const KINDS = {
    PAGE: { id: "page", verb: "opens", survives: true, note: "a file on disk: openable, bookmarkable, and visible to render-QA" },
    DEMO: { id: "demo", verb: "launches", survives: false, note: "a demos_code script the engine boots into via ?go=; exists only while the engine is up" },
    BUILTIN: { id: "builtin", verb: "enters", survives: false, note: "an inline DEMO_MODE of main.js; a state of the engine, not a file" },
};

/** Human label from a filename or id, without inventing capitalisation the source did not have. */
export function niceLabel(raw) {
    return String(raw).replace(/\.html$/, "").replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}

/** The collision key: what a reader would consider "the same name". */
export const nameKey = (label) => String(label).toLowerCase().replace(/[\s\-_]+/g, "");

/** Two entries are THE SAME THING when their ids agree once separators and case are stripped. */
export const idKey = (id) => String(id).replace(/\.html$/, "").toLowerCase().replace(/[\s\-_]+/g, "");

/**
 * *** THE ELEVEN COLLISIONS TURNED OUT TO BE TWO DIFFERENT PROBLEMS, AND A BLANKET "2" SUFFIX WOULD HAVE HIDDEN
 * THE WORSE ONE. *** Measured at v3544:
 *
 *   NINE ARE ONE THING WITH TWO SURFACES. boids.html and demo:boids. gray-scott.html and demo:gray_scott.
 *     battleship3d.html and builtin:battleship. The ids agree; these are not duplicates, they are the same demo
 *     available standalone AND as an engine mode. Labelling them "Boids" and "Boids 2" would be actively
 *     misleading -- a reader picking the second has no way to know it is the same thing through a different door.
 *     They are MERGED into one entry carrying both routes, and the reader chooses page or engine.
 *
 *   TWO ARE GENUINE, AND THEY ARE DATA BUGS RATHER THAN DISPLAY BUGS. In engine-catalog.json, builtin
 *     "defenders" and builtin "ogre" BOTH carry the label "Defenders"; "reset" and "lorenz" BOTH carry "Reset".
 *     Different ids, same human label, same kind -- so the Built-In pill has been showing two entries called
 *     "Defenders" and two called "Reset", and clicking one was a coin flip. A Lorenz attractor labelled "Reset"
 *     reads like a straight mistake.
 *     These get the suffix AND a needsRename flag, because a suffix makes them clickable and does not make them
 *     correct. Renaming is Keith's call and the flag is how it stays visible until he makes it.
 */
export function disambiguate(entries) {
    // merge same-id entries across kinds into one, keeping every route
    const merged = [];
    const byId = new Map();
    for (const e of entries) {
        const k = idKey(e.id);
        if (byId.has(k)) {
            const m = byId.get(k);
            m.routes.push({ kind: e.kind, href: e.href });
            m.kinds.push(e.kind);
            continue;
        }
        const m = { ...e, routes: [{ kind: e.kind, href: e.href }], kinds: [e.kind] };
        byId.set(k, m);
        merged.push(m);
    }
    // now suffix only what STILL collides: different things wearing the same name
    const seen = new Map();
    return merged.map((e) => {
        const k = nameKey(e.label);
        const n = (seen.get(k) || 0) + 1;
        seen.set(k, n);
        const multiSurface = e.kinds.length > 1;
        return n === 1
            ? { ...e, display: e.label, collision: false, needsRename: false, multiSurface }
            : { ...e, display: `${e.label} ${n}`, collision: true, needsRename: true, multiSurface };
    });
}

/** Pages: every .html on disk, with the panel that claims it if any. */
export function pageEntries() {
    const claimed = new Map();
    for (const s of SECTIONS) for (const p of (s.pages || [])) claimed.set(p, s.label || s.id);
    let files = [];
    try { files = fs.readdirSync(ENG).filter((f) => f.endsWith(".html")); } catch {}
    return files.sort().map((f) => ({
        kind: KINDS.PAGE.id, id: f, label: niceLabel(f), href: "/" + f,
        section: claimed.get(f) || null,
        placed: claimed.has(f),
        arriving: !claimed.has(f),
        reason: UNPLACED && UNPLACED.get ? (UNPLACED.get(f) || null) : null,
    }));
}

/** Demos: the demos_code scripts, launched by deep-link. Read from disk so the index ships complete. */
export function demoEntries() {
    let files = [];
    try { files = fs.readdirSync(path.join(ENG, "demos_code")).filter((f) => f.endsWith(".js")); } catch {}
    return files.map((f) => f.replace(/\.js$/, "")).filter((id) => id && id !== "blank_sandbox").sort()
        .map((id) => ({ kind: KINDS.DEMO.id, id, label: niceLabel(id), go: id,
                        href: "/?go=" + encodeURIComponent(id), section: null }));
}

/** Built-ins: the engine's own modes, from the build-time catalogue. */
export function builtinEntries() {
    let cat = null;
    try { cat = JSON.parse(read("engine-catalog.json") || "null"); } catch {}
    const list = (cat && cat.builtinDemos) || [];
    return list.map((d) => ({ kind: KINDS.BUILTIN.id, id: d.id, label: d.label ? niceLabel(d.label) : niceLabel(d.id),
                              mode: d.id, href: "/?go=" + encodeURIComponent(d.id), section: null }));
}

/** The apps the Applications pill listed -- all pages, and the reason this round happened. */
export function appUrls() {
    let cat = null;
    try { cat = JSON.parse(read("engine-catalog.json") || "null"); } catch {}
    return ((cat && cat.apps) || []).map((a) => String(a.url || "").replace(/^\//, "")).filter(Boolean);
}

/** The whole index, disambiguated, in one list. */
export function buildIndex() {
    const raw = [...pageEntries(), ...demoEntries(), ...builtinEntries()];
    const entries = disambiguate(raw);
    const byKind = { page: 0, demo: 0, builtin: 0 };
    for (const e of entries) byKind[e.kind]++;
    const collisions = entries.filter((e) => e.collision);
    const multiSurface = entries.filter((e) => e.multiSurface);
    const needsRename = entries.filter((e) => e.needsRename);
    const apps = appUrls();
    const appsUnplaced = entries.filter((e) => e.kind === "page" && apps.includes(e.id) && !e.placed).map((e) => e.id);
    return { entries, byKind, collisions, multiSurface, needsRename, apps, appsUnplaced,
             placed: entries.filter((e) => e.kind === "page" && e.placed).length,
             arriving: entries.filter((e) => e.arriving).length };
}

/** Write the shipped index the front end reads, so nothing is fetched or guessed at runtime. */
export function writeIndex(out = "launch-index.json") {
    const ix = buildIndex();
    const payload = {
        generatedFrom: "tools/ship/launchIndex.mjs",
        kinds: KINDS,
        counts: ix.byKind,
        entries: ix.entries.map((e) => ({ kind: e.kind, id: e.id, display: e.display, href: e.href,
                                          section: e.section || null, collision: !!e.collision })),
    };
    fs.writeFileSync(path.join(ENG, out), JSON.stringify(payload, null, 1) + "\n");
    return { out, ...ix.byKind, total: ix.entries.length, collisions: ix.collisions.length };
}

export function lines(ix = buildIndex()) {
    return [
        `${ix.entries.length} launchables: ${ix.byKind.page} pages, ${ix.byKind.demo} demos, ${ix.byKind.builtin} built-ins`,
        `  pages in a panel: ${ix.placed}   arriving: ${ix.arriving}`,
        `  the Applications pill listed ${ix.apps.length} apps, of which ${ix.appsUnplaced.length} were in NO panel: ${ix.appsUnplaced.join(", ") || "none"}`,
        `  ${ix.multiSurface.length} one-thing-two-surfaces (merged, not suffixed): ${ix.multiSurface.map((e) => e.display).join(", ") || "none"}`,
        `  ${ix.needsRename.length} GENUINE name collisions, suffixed AND flagged for rename: ${ix.needsRename.map((e) => e.display + " [" + e.id + "]").join(", ") || "none"}`,
    ];
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    if (process.argv.includes("--write")) console.log("[launchIndex]", JSON.stringify(writeIndex()));
    for (const l of lines()) console.log(l);
}
