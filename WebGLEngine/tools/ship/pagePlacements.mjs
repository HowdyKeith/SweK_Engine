// WebGLEngine/tools/ship/pagePlacements.mjs -- v3577
// ---------------------------------------------------------------------------------------------------------------
// WHERE A PAGE APPEARS, AS FOUR INDEPENDENT FACTS, EDITABLE FROM THE PAGE INDEX.
//
// v3576 measured the gap and refused to place anything, because naming a panel is naming a subject and that is
// Keith's call. *** THIS IS THE SURFACE THAT LETS HIM MAKE IT, ONE CHECKBOX AT A TIME, WITHOUT EDITING A .mjs. ***
//
// Keith's design: the page index shows every page, and beside each one a checkbox for each place it could appear.
//
//   topics[]    WHICH TOPIC DRAWERS on server.html list it. An ARRAY, not a choice -- Keith: "a page such as
//               Cosmic Map could show some or all or none of the sections". A page can genuinely belong to two
//               subjects and the old registry could not say so, because SECTIONS.pages is a partition.
//   bigButton   whether it gets a BIG BUTTON under the topics section on server.html.
//   apps        whether it appears in the APPLICATIONS panel on the render page.
//   auto        accept pagePlacement.mjs's SUGGESTION for topics rather than pinning one by hand. It is a
//               checkbox rather than a silent default so that "nobody has decided" and "somebody decided to let
//               the tool decide" ARE DIFFERENT STATES -- pageSections' own UNPLACED doctrine, applied here.
//
// ================================================================================================================
// THE FILE IS AN OVERRIDE LAYER, AND SECTIONS STAYS THE BASE. THAT IS THE WHOLE DESIGN.
// ================================================================================================================
//
// *** IT WOULD HAVE BEEN EASIER TO WRITE THE CHECKBOXES STRAIGHT INTO pageSections.mjs AND THAT WOULD HAVE BEEN
// THE SECOND-REGISTRY DEFECT AGAIN. *** SECTIONS carries reasoning no UI can hold -- roundhouse sits with the
// physics lab because it DRIVES it, sampling has no chip because a thirteenth button was the thing to avoid,
// celltrack holds one page ON PURPOSE. A browser writing that file would flatten every one of those comments into
// a JSON array and the next reader would have a list with no reasons.
//
// So page-placements.json holds ONLY THE DELTA. resolve() layers it over SECTIONS, and a page with no entry
// resolves to exactly what SECTIONS already said. DELETING THE FILE RETURNS THE TREE TO ITS CURRENT BEHAVIOUR,
// which is the property that makes this safe to ship.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SECTIONS, MAX_PER_PANEL } from "./pageSections.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const FILE = path.join(ENG, "page-placements.json");

/** Every topic a page could be put in. Derived from SECTIONS so a new panel appears here for free. */
export function allTopics() {
    return SECTIONS.map((s) => ({ id: s.id, label: s.label, tab: s.tab, parentTab: s.parentTab || null,
                                  used: s.pages.length, cap: MAX_PER_PANEL }));
}

/** What SECTIONS alone says: the base layer, with no overrides applied. */
export function baseTopics() {
    const m = new Map();
    for (const s of SECTIONS) for (const f of s.pages) {
        if (!m.has(f)) m.set(f, []);
        m.get(f).push(s.id);
    }
    return m;
}

export const EMPTY = { pages: {}, version: 1 };

export function read(file = FILE) {
    try {
        const j = JSON.parse(fs.readFileSync(file, "utf8"));
        return { ...EMPTY, ...j, pages: (j && j.pages) || {} };
    } catch { return { ...EMPTY }; }
}

/**
 * *** UNKNOWN TOPIC IDS ARE DROPPED AND REPORTED, NOT STORED. *** A renamed or deleted panel would otherwise
 * leave a placement pointing at nothing, which reads as "placed" everywhere that counts placements and shows up
 * nowhere -- the ghost case pagePlacement's inventory already checks for in the other direction.
 */
export function sanitise(entry = {}, topicIds = new Set(allTopics().map((t) => t.id))) {
    const wanted = Array.isArray(entry.topics) ? entry.topics : [];
    const topics = [...new Set(wanted.filter((t) => topicIds.has(t)))];
    const dropped = wanted.filter((t) => !topicIds.has(t));
    return { entry: { topics, bigButton: !!entry.bigButton, apps: !!entry.apps, auto: !!entry.auto }, dropped };
}

export function write(state, file = FILE) {
    const ids = new Set(allTopics().map((t) => t.id));
    const pages = {}; const dropped = {};
    for (const [f, e] of Object.entries((state && state.pages) || {})) {
        const s = sanitise(e, ids);
        // an entry that says nothing is not stored: an empty override is indistinguishable from no override,
        // and keeping it would grow a file of noise that looks like decisions
        if (s.entry.topics.length || s.entry.bigButton || s.entry.apps || s.entry.auto) pages[f] = s.entry;
        if (s.dropped.length) dropped[f] = s.dropped;
    }
    const out = { version: 1, pages };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    return { written: Object.keys(pages).length, dropped };
}

/**
 * The resolved truth for one page: SECTIONS as the base, the override file on top.
 *
 * `auto` does NOT store a topic. It records that the SUGGESTION should be followed, so the answer tracks the
 * suggester as the tree changes instead of freezing whatever it said the day the box was ticked -- the ratchet
 * this lab keeps removing, in a new place.
 */
export function resolve(file = FILE, { suggest = null } = {}) {
    const base = baseTopics();
    const over = read(file).pages;
    const out = new Map();
    const files = new Set([...base.keys(), ...Object.keys(over)]);
    for (const f of files) {
        const o = over[f] || {};
        let topics = Array.isArray(o.topics) && o.topics.length ? o.topics.slice() : (base.get(f) || []).slice();
        let from = Array.isArray(o.topics) && o.topics.length ? "override" : (base.has(f) ? "sections" : "none");
        if (o.auto && suggest) {
            const s = suggest(f);
            if (s && s.suggestion) { topics = [s.suggestion]; from = "auto"; }
            else from = "auto-unreached";                 // ticked, and the suggester still declines to guess
        }
        out.set(f, { file: f, topics, from, bigButton: !!o.bigButton, apps: !!o.apps, auto: !!o.auto });
    }
    return out;
}

/** The two lists the other surfaces actually consume. */
export function bigButtons(resolved) { return [...resolved.values()].filter((r) => r.bigButton).map((r) => r.file); }
export function appsList(resolved) { return [...resolved.values()].filter((r) => r.apps).map((r) => r.file); }
export function pagesInTopic(resolved, topicId) {
    return [...resolved.values()].filter((r) => r.topics.includes(topicId)).map((r) => r.file);
}

/**
 * *** THE CAP IS CHECKED AGAINST THE RESOLVED RESULT, NOT AGAINST SECTIONS. *** A drawer of 25 is the flat row
 * with a lid on it (v2513), and a checkbox is a much faster way to make one than editing a registry. Reported
 * rather than enforced: refusing the tick would lose the decision, and Keith's rule is a REVIEW TRIGGER at
 * fifteen, not a hard stop.
 */
export function overCap(resolved) {
    const n = new Map();
    for (const r of resolved.values()) for (const t of r.topics) n.set(t, (n.get(t) || 0) + 1);
    return allTopics().filter((t) => (n.get(t.id) || 0) > MAX_PER_PANEL)
        .map((t) => ({ id: t.id, label: t.label, count: n.get(t.id), cap: MAX_PER_PANEL }));
}

/**
 * *** THE PAGES NOTHING CLAIMS GET ALPHABETICAL HOLDING PANELS AT THE END, SO NOTHING IS UNREACHABLE. ***
 *
 * Keith: "as long as I can see all the sections and worst case look through the remainder a through z and find
 * it." That is the property the whole cabinet was missing. v3576 measured 228 pages in no panel and correctly
 * refused to guess where they belong -- but REFUSING TO GUESS IS NOT THE SAME AS LEAVING THEM UNREACHABLE, and
 * for a round it was. A page nobody can find is worse off than a page in a roughly-right drawer.
 *
 * THE BOUNDARIES ARE DERIVED, NOT TYPED. "A-G, H-Y, Z" is a guess about a distribution; the real one is
 * a20 b32 c25 d9 e13 f15 g9 h10 i5 j2 k2 l7 m7 n5 o3 p12 r9 s23 t12 u3 v5 w15 x2 y1, so the divisions have to
 * come out of that. Letters are packed greedily up to the cap, and A BUCKET ONLY DEEPENS ITS PREFIX WHERE ONE
 * LETTER ALONE EXCEEDS THE CAP -- B holds 32 pages and cannot be a single drawer, so it becomes B-BL and BM-BZ.
 * Deepening everywhere would give "AA-AD" ranges nobody can navigate; deepening nowhere gives a drawer of 32,
 * which is the flat row with a lid on it.
 *
 * *** THEY ARE A TO-DO LIST, NOT A CATEGORY, AND THE LABEL HAS TO SAY SO. *** v3576's own report line makes that
 * distinction and it would be undone by a row of chips that look exactly like subjects. They render last, styled
 * apart, and A PAGE LEAVES ITS BUCKET THE MOMENT IT IS PLACED -- the buckets are computed from the remainder, so
 * they shrink and re-divide as Keith works through them. When the list empties, the panels vanish on their own.
 */
export function alphaBuckets(files, { cap = MAX_PER_PANEL } = {}) {
    const sorted = [...files].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const keyOf = (f, depth) => {
        const t = f.toLowerCase().replace(/^[^a-z0-9]+/, "");
        const k = t.slice(0, depth) || "#";
        return /^[a-z]/.test(k) ? k : "#";
    };
    // group by first letter; deepen ONLY the letters that cannot fit alone
    const first = new Map();
    for (const f of sorted) {
        const k = keyOf(f, 1);
        if (!first.has(k)) first.set(k, []);
        first.get(k).push(f);
    }
    const units = [];                                  // atoms to pack: a whole letter, or its deepened parts
    for (const [k, list] of [...first.entries()].sort()) {
        if (list.length <= cap) { units.push({ key: k, files: list }); continue; }
        const sub = new Map();
        for (const f of list) {
            const k2 = keyOf(f, 2);
            if (!sub.has(k2)) sub.set(k2, []);
            sub.get(k2).push(f);
        }
        // pack the two-letter groups into cap-sized units, keeping them contiguous
        let cur = [], from = null, prev = null;
        for (const [k2, l2] of [...sub.entries()].sort()) {
            if (cur.length && cur.length + l2.length > cap) { units.push({ key: from, keyTo: prev, files: cur }); cur = []; from = null; }
            if (!from) from = k2;
            prev = k2; cur = cur.concat(l2);
        }
        if (cur.length) units.push({ key: from, keyTo: prev, files: cur });
    }
    // pack whole units into buckets
    const out = []; let cur = [], from = null, to = null;
    for (const u of units) {
        if (cur.length && cur.length + u.files.length > cap) { out.push({ from, to, files: cur }); cur = []; from = null; }
        if (!from) from = u.key;
        to = u.keyTo || u.key;
        cur = cur.concat(u.files);
    }
    if (cur.length) out.push({ from, to, files: cur });
    return out.map((b, i) => ({
        id: "alpha-" + b.from + (b.to !== b.from ? "-" + b.to : ""),
        label: (b.from === b.to ? b.from : b.from + "\u2013" + b.to).toUpperCase(),
        from: b.from, to: b.to, files: b.files, count: b.files.length, index: i,
    }));
}

/** The pages no topic claims, from the resolved layer -- so placing one removes it from the holding panels. */
export function unclaimed(resolved, allFiles) {
    const claimed = new Set();
    for (const r of resolved.values()) if (r.topics.length) claimed.add(r.file);
    return [...allFiles].filter((f) => !claimed.has(f)).sort();
}

export function reportLines() {
    const L = [];
    const res = resolve();
    const topics = allTopics();
    L.push("[pagePlacements] four independent facts per page, layered over pageSections");
    L.push("");
    L.push("  override file: " + (fs.existsSync(FILE) ? FILE.replace(ENG + path.sep, "") : "(none yet -- SECTIONS alone)"));
    L.push("  topics available: " + topics.length + "   pages resolved: " + res.size);
    const byFrom = {};
    for (const r of res.values()) byFrom[r.from] = (byFrom[r.from] || 0) + 1;
    L.push("  resolved from: " + Object.entries(byFrom).map(([k, v]) => k + " " + v).join(", "));
    L.push("  big buttons: " + bigButtons(res).length + "   applications: " + appsList(res).length);
    const over = overCap(res);
    L.push(over.length ? ("  *** OVER KEITH'S CAP OF " + MAX_PER_PANEL + ": " +
            over.map((o) => o.label + " " + o.count).join(", ") + " ***")
                       : ("  no topic exceeds the cap of " + MAX_PER_PANEL));
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}

/**
 * v3689 -- the Mac drawer's membership, DERIVED AND EXPLAINED PER ENTRY. Each page here drives something that
 * only exists on a Mac; the reason is beside the name so a later reader can disagree with a specific one rather
 * than with the list. THESE PAGES ARE NOT UN-CLAIMED FROM THEIR EXISTING SECTIONS -- this is a view.
 */
export function macPages() {
    return [
        { file: "external-linalg.html", why: "needs clang and -framework Accelerate; Mac-only by construction" },
        { file: "raycast.html",        why: "drives a Mac peer -- /raycast/launch, /raycast/ext/dev, /install/exec" },
        { file: "hosting.html",        why: "calls /hosting/tunnel/status, the tunnel the Mac fronts" },
        { file: "settings.html",       why: "same tunnel status route" },
        { file: "phone.html",        why: "launches a .command from its own script" },
        // v4034 -- bzflag.html and rocket-league.html LEAVE this view, at Keith's request: "these need to be
        // removed from Mac System panel. they are in Game Theory panel and that is where they should be." They
        // still launch a .command from their own script -- that fact did not change -- but this view's whole
        // point was never to duplicate a page's real home, only to surface pages that would otherwise be
        // Mac-only and easy to lose. Both are already anchored in Game Theory (pageSections.mjs's gametheory
        // chips: bzflag, rocketleague), findable there, so carrying them here too was the second-copy pattern
        // this tree keeps finding: one page, one real home, and a view is not another claim.
    ];
}
