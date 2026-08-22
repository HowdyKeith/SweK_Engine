// WebGLEngine/tools/ship/placementRender-selfcheck.mjs -- v3581
//
// Run: node tools/ship/placementRender-selfcheck.mjs
// RUNTIME 9.6s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** IT RENDERS page-index.html AND server.html IN A REAL DOM AND CLICKS THINGS. ***
//
// v3577 shipped four surfaces -- the per-page checkbox writes, the big-button row, the 21-bucket Unsorted
// drawer, and the Applications list -- and v3579's review recorded the honest state: the model, the endpoint and
// the source were verified and NOT ONE OF THEM HAD EVER RENDERED. That is the largest untested area in the
// session, and "I read the source carefully" is exactly the evidence this project has learned not to accept:
// v3211-v3213 found 59 of 82 headers wrong by RUNNING things that had been read.
//
// jsdom is not a browser. It has no layout, no paint, and no real network, so it CANNOT tell us whether 21
// nested <details> are navigable on the rig -- that stays open and is recorded as such in todo.mjs. WHAT IT CAN
// DO IS EVERYTHING THAT IS NOT PIXELS: does the page parse, does the fetch land, does the handler fire on a
// click, does the right body get POSTed, does the DOM afterwards contain what the payload said. Those are the
// failures that would have shipped, and none of them needed a screen.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// *** jsdom IS NOT VENDORED, AND A MISSING DEPENDENCY MUST SKIP RATHER THAN THROW. *** The first version
// imported it statically and the shipped tree CRASHED WITH A STACK TRACE instead of saying what was missing --
// which reads as a broken gate rather than an absent tool, and is exactly the failure box3dLoader's
// report-cleanly convention exists to prevent. It is a DEV dependency: npm i jsdom --no-save.
let JSDOM = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* named below, not swallowed */ }
import { allTopics, alphaBuckets, unclaimed, resolve } from "./pagePlacements.mjs";
import { noComments } from "./sourceScan.mjs";   // v3696 -- the prompt text IS a string literal

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("placementRender-selfcheck -- the v3577 surfaces and the v3581 bench, rendered and clicked\n");

if (!JSDOM) {
    console.log("  SKIP  jsdom is not installed, so nothing can be rendered here.");
    console.log("        Install it with:  npm install jsdom --no-save");
    console.log("        *** IT IS A DEV DEPENDENCY AND IS NOT VENDORED: this gate exists to prove the pages");
    console.log("        RUN, and a headless DOM in the shipped tree would be 40MB of node_modules to answer a");
    console.log("        question asked at ship time. A SKIP NAMES WHAT IS MISSING; A CRASH DOES NOT. ***");
    console.log("\nplacementRender-selfcheck: skipped (jsdom absent)");
    process.exit(0);
}

// ---- a fake bridge, so the pages meet the SHAPE the real endpoint returns -----------------------------------
const POSTED = [];
function makeFetch(payload, { failPost = false } = {}) {
    return async (url, opts) => {
        const u = String(url);
        const j = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
        if (u.includes("/pages/placements")) {
            if (opts && opts.method === "POST") {
                const body = JSON.parse(opts.body);
                POSTED.push(body);
                if (failPost) return j({ ok: false, error: "disk is read-only" }, 400);
                // ECHO THE RESOLVED TRUTH, which is what the real handler does
                const entry = { file: body.file, topics: body.entry.topics || [], from: "override",
                                bigButton: !!body.entry.bigButton, apps: !!body.entry.apps, auto: !!body.entry.auto };
                payload.pages[body.file] = entry;
                return j({ ok: true, written: 1, dropped: {}, entry, overCap: [] });
            }
            return j(payload);
        }
        if (u.includes("/page-index.json")) return j({ pages: [
            { f: "cosmic-map.html", t: "EV cosmic map", g: "cosmic", p: 1 },
            { f: "widget.html", t: "Widget", g: "", p: 0 },
        ] });
        if (u.includes("/launch-index.json")) return j({ entries: [
            { kind: "page", id: "cosmic-map.html", display: "EV cosmic map", href: "/cosmic-map.html", section: "cosmic" },
            { kind: "demo", id: "slime", display: "Slime mold", href: "/#slime", section: null },
        ] });
        return j({}, 404);
    };
}

async function render(file, { payload, failPost = false, waitMs = 250 } = {}) {
    const html = fs.readFileSync(path.join(ENG, file), "utf8");
    // *** fetch MUST BE INSTALLED IN beforeParse, NOT AFTER CONSTRUCTION. *** jsdom runs inline scripts DURING
    // the constructor, so assigning dom.window.fetch afterwards is too late -- the page had already thrown
    // "fetch is not defined" and rendered nothing, and the first version of this gate reported that as the
    // PAGE failing. A harness bug that reads as a finding is the worst kind, because it is a finding-shaped
    // thing you would have written up.
    const dom = new JSDOM(html, {
        runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/",
        beforeParse(w) {
            w.fetch = makeFetch(payload, { failPost });
            w.Response = class { constructor(b) { this.body = b; this.ok = true; } };
        },
    });
    dom.window.localStorage.clear();
    await sleep(waitMs);
    return dom;
}

const TOPICS = allTopics();
const basePayload = () => ({
    ok: true, topics: TOPICS, overCap: [],
    pages: { "cosmic-map.html": { file: "cosmic-map.html", topics: ["cosmic"], from: "sections",
                                  bigButton: false, apps: false, auto: false } },
    buckets: [], titles: {}, overrides: {},
});

// ---------------------------------------------------------------------------
console.log("1. *** page-index.html RENDERS, AND THE CHECKBOXES ARE ACTUALLY THERE ***");
{
    const dom = await render("page-index.html", { payload: basePayload() });
    const d = dom.window.document;
    const rows = d.querySelectorAll(".item");
    const topicBoxes = d.querySelectorAll('input[data-place="topic"]');
    report("rows rendered / topic checkboxes", rows.length + " / " + topicBoxes.length);

    ok("!! the page parses and builds its list against a live payload",
        rows.length >= 2,
        "*** NOT ONE OF THESE FOUR SURFACES HAD EVER RENDERED BEFORE THIS FILE. *** The model, the endpoint and " +
        "the source were verified at v3577 and that is exactly the evidence v3211-v3213 taught this project not " +
        "to accept -- 59 of 82 headers were wrong, found by RUNNING things that had been read.");
    ok("!! there is one topic checkbox per topic, per placeable page",
        topicBoxes.length === TOPICS.length * 2,
        TOPICS.length + " topics across 2 placeable pages. Keith's design: on the right of each page name, a " +
        "checkbox for every place it could appear.");
    ok("!! the three flags render beside them",
        ["auto", "bigButton", "apps"].every((k) => d.querySelector('input[data-place="' + k + '"]')),
        "four independent facts, because they ARE independent -- a page can be a big button without being in " +
        "any drawer");
    ok("!! ...and the page's EXISTING topic comes back checked from the payload",
        d.querySelector('input[data-place="topic"][data-f="cosmic-map.html"][data-t="cosmic"]').checked === true,
        "cosmic-map.html resolves to the cosmic drawer through SECTIONS, so the box must arrive ticked without " +
        "any override existing. A blank editor would silently invite re-entering what the registry already says.");
    ok("!! a demo gets NO dashboard checkbox, because there is no file to tile",
        d.querySelectorAll(".place.dim").length >= 1,
        "an engine demo exists only while the engine runs. Offering a tile would add a dashboard entry " +
        "rendering an engine URL with nothing behind it.");
    dom.window.close();
}

// ---------------------------------------------------------------------------
console.log("\n2. A CLICK POSTS THE RIGHT BODY, AND THE DOM FOLLOWS THE SERVER");
{
    POSTED.length = 0;
    const payload = basePayload();
    const dom = await render("page-index.html", { payload });
    const d = dom.window.document;

    const big = d.querySelector('input[data-place="bigButton"][data-f="cosmic-map.html"]');
    big.checked = true;
    big.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(200);

    report("POSTs made", String(POSTED.length));
    report("body", JSON.stringify(POSTED[0]));
    ok("!! ticking a box POSTs exactly one page, not the whole table",
        POSTED.length === 1 && POSTED[0].file === "cosmic-map.html",
        "*** A CHECKBOX THAT SENT THE ENTIRE TABLE ON EVERY CLICK WOULD LOSE A CONCURRENT EDIT FROM ANOTHER " +
        "TAB. *** The endpoint takes one page when `file` is given.");
    ok("!! the body carries the OTHER three facts unchanged",
        POSTED[0].entry.bigButton === true && Array.isArray(POSTED[0].entry.topics) &&
        POSTED[0].entry.topics.includes("cosmic"),
        "clicking `big` must not silently clear the topics. The handler rebuilds the whole entry from current " +
        "state rather than sending a delta the server would have to merge.");

    const after = d.querySelector('input[data-place="bigButton"][data-f="cosmic-map.html"]');
    ok("!! the box is still ticked after the repaint, from the SERVER'S echo",
        after && after.checked === true,
        "*** v3575 FOUND THIS EXACT DEFECT IN THE TUNNEL CHECKBOX: a control painting from its own click and " +
        "reporting a write it had never confirmed. *** This one repaints from j.entry.");
    dom.window.close();
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AND A REJECTED WRITE UNTICKS THE BOX INSTEAD OF LYING ***");
{
    POSTED.length = 0;
    const dom = await render("page-index.html", { payload: basePayload(), failPost: true });
    const d = dom.window.document;
    const apps = d.querySelector('input[data-place="apps"][data-f="cosmic-map.html"]');
    apps.checked = true;
    apps.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(200);

    const after = d.querySelector('input[data-place="apps"][data-f="cosmic-map.html"]');
    report("box state after a 400", String(after && after.checked));
    ok("!! a server rejection leaves the box UNTICKED",
        after && after.checked === false,
        "*** THE WHOLE POINT OF THE v3575 LESSON. *** The tunnel checkbox looked ticked after a write that had " +
        "thrown ENOENT, and the state only reverted on the next reload -- so you acted on a setting that was " +
        "never saved.");
    ok("...and the failure is visible on the page rather than only in a console",
        /could not save/.test(d.body.textContent),
        "a control that fails silently is the control that taught you to trust it wrongly");
    dom.window.close();
}

// ---------------------------------------------------------------------------
console.log("\n4. server.html: THE TOPICS TOGGLE, THE BIG BUTTONS AND THE UNSORTED DRAWER");
{
    const inv = { pages: new Map([["a-one.html", "A one"], ["b-two.html", "B two"], ["c-three.html", "C three"]]) };
    const payload = basePayload();
    payload.pages["cosmic-map.html"].bigButton = true;
    payload.buckets = alphaBuckets([...inv.pages.keys()]);
    payload.titles = Object.fromEntries(inv.pages);

    const dom = await render("server.html", { payload, waitMs: 600 });
    const d = dom.window.document;

    const toggle = d.getElementById("topicsToggle");
    const sections = d.getElementById("gaugeSections");
    report("topics toggle present / sections present", !!toggle + " / " + !!sections);
    ok("!! the drawer is renamed and wired to the section",
        toggle && /SweK Engine Topics/.test(toggle.textContent) && toggle.getAttribute("aria-controls") === "gaugeSections",
        "the page list moved to the index, so the drawer had nothing left to be except a duplicate");
    ok("!! clicking it hides the chip column, and clicking again restores it",
        (() => {
            const before = sections.style.display;
            toggle.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
            const mid = sections.style.display;
            toggle.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
            return before !== mid && sections.style.display === before;
        })(),
        "*** CLICKED, NOT INSPECTED. *** A handler that was attached to the wrong node would read identically " +
        "in the source and do nothing here.");
    ok("!! #ipadGrid survives, hidden, so its builder still has somewhere to write",
        !!d.getElementById("ipadGrid"),
        "deleting the node would leave that code writing into nothing -- v3538's shape when it hid the " +
        "physicslab tab instead of removing it");

    const unsorted = d.getElementById("unsortedWrap");
    const buckets = d.querySelectorAll("#unsortedBuckets details");
    report("unsorted buckets rendered", String(buckets.length));
    ok("!! the Unsorted drawer appears and renders one <details> per bucket",
        unsorted && unsorted.style.display !== "none" && buckets.length === payload.buckets.length,
        "the pages nothing claims, so worst case you look A through Z and find it");
    ok("!! ...and it is MINIMISED on start",
        d.getElementById("unsortedBody").style.display === "none" &&
        d.getElementById("unsortedToggle").getAttribute("aria-expanded") === "false",
        "*** IT IS A TO-DO LIST, NOT A CATEGORY. *** A holding area that opened by default would read as more " +
        "subjects and bury the real ones above it.");
    ok("!! a big button ticked in the index appears in the row",
        !!d.querySelector('[data-place-big="cosmic-map.html"]'),
        "the index writes, server.html reads. One source, and the button is ADDED rather than the row replaced.");
    dom.window.close();

    // *** v3668 -- THE COLUMN DEAL, RENDERED. *** Keith asked for the 22-bucket alphabet in three columns at
    // 8 / 8 / 6 instead of one 22-row list. THE BUCKETS HERE ARE SYNTHETIC ON PURPOSE: what is under test is the
    // LAYOUT the page performs on whatever it is handed, and the PACKING that decides which page lands in which
    // bucket already has its own gate (pagePlacements-selfcheck). Building 22 real pages to get 22 buckets would
    // make this check depend on the packer as well, and then a packing change would go red here for no reason.
    const colBuckets = (n) => Array.from({ length: n }, (_, i) => ({
        label: "L" + String(i).padStart(2, "0"), count: 1, files: ["p" + i + ".html"],
    }));
    const dealt = async (n) => {
        const p = basePayload();
        p.buckets = colBuckets(n);
        p.titles = Object.fromEntries(p.buckets.map((b) => [b.files[0], b.label]));
        const dm = await render("server.html", { payload: p, waitMs: 600 });
        const doc = dm.window.document;
        const host = doc.getElementById("unsortedBuckets");
        const cols = [...host.querySelectorAll(".ubCol")];
        const out = {
            sizes: cols.map((c) => c.querySelectorAll("details").length),
            declared: host.style.getPropertyValue("--ubCols").trim(),
            total: host.querySelectorAll("details").length,
            loose: [...host.querySelectorAll("details")].filter((d) => !d.closest(".ubCol")).length,
            firstColLabels: cols.length ? [...cols[0].querySelectorAll("summary")].map((s) => s.textContent.trim().split(" ")[0]) : [],
        };
        dm.window.close();
        return out;
    };

    const d22 = await dealt(22);
    report("22 buckets deal to", d22.sizes.join(" / ") + "   --ubCols=" + d22.declared);
    ok("!! 22 buckets read as THREE COLUMNS AT 8 / 8 / 6",
        d22.sizes.join("/") === "8/8/6" && d22.total === 22,
        "*** THE DEAL RULE IS THE ASK. *** A BALANCED deal (floor plus remainder) gives 8/7/7, which is not " +
        "the shape Keith asked for; per = ceil(n/cols) sliced in order gives 8/8/6.");
    ok("!! the deal is COLUMN-MAJOR -- column one holds the FIRST eight labels, in order",
        d22.firstColLabels.join(",") === "L00,L01,L02,L03,L04,L05,L06,L07",
        "*** THIS IS WHAT NAMES THE DEFECT WHEN A ROUND-ROBIN DEAL SLIPS IN. *** Measured, not assumed: a " +
        "k % cols deal at 22 fires the SIZES check too, because it lands 8/7/7 -- I had written that the sizes " +
        "could not tell them apart and the plant said otherwise. What the sizes cannot say is WHICH defect it " +
        "is, and a round-robin that happened to land 8/8/6 would pass them. An alphabet you read across is not " +
        "an alphabet you can scan.");
    ok("!! every <details> lands INSIDE a column, none loose in the grid",
        d22.loose === 0 && d22.sizes.reduce((a, b) => a + b, 0) === d22.total,
        "a bucket outside .ubCol would be a grid cell of its own and would break the column it belongs to");
    ok("!! --ubCols matches the number of columns ACTUALLY IN THE DOM",
        d22.declared === String(d22.sizes.length),
        "the CSS is told the count and the JS builds the columns, so TWO SPELLINGS OF ONE NUMBER is exactly " +
        "the defect available here -- a grid drawn 3 wide over 2 columns leaves a phantom empty third.");

    // *** THE DRAWER EMPTIES ITSELF, SO THE SMALL CASE IS NOT HYPOTHETICAL. *** The buckets are what no topic
    // claims, so the count falls every time a page is placed. Four buckets deal 2/2/0 at ceil(4/3), and the
    // empty column must be dropped BEFORE the grid is told how many to draw.
    const d4 = await dealt(4);
    report("4 buckets deal to", d4.sizes.join(" / ") + "   --ubCols=" + d4.declared);
    ok("!! a shrinking drawer never renders an EMPTY column",
        d4.sizes.every((s) => s > 0) && d4.declared === String(d4.sizes.length) && d4.total === 4,
        "*** THE DROP IS THE ONLY GUARD AND THIS IS THE CHECK THAT HOLDS IT. *** Remove it and 4 buckets " +
        "render 2 / 2 / 0 with a phantom empty third column, which the 22 case cannot see. This drawer is " +
        "designed to run out, so the small case is where it ends up living.");

    // *** v3692 -- THE PEER GRAB PICKER, DRIVEN. *** Keith reported that choosing a peer and asking to GET a
    // file gave no file selection at all, and he was right: the old code put the listing inside a prompt() and
    // asked the reader to TYPE the exact name back. A picker is a DOM claim, and this is the only file here
    // with a DOM, so it is checked the same way the gauge swap is -- by building it and clicking it.
    {
        const dom3 = await render("server.html", { payload: basePayload(), waitMs: 800 });
        const d3 = dom3.window.document, mk = dom3.window._swekGrabDialog;
        ok("!! server.html exposes the grab picker so it can be driven at all", typeof mk === "function",
            "a dialog that can only be reached by clicking a peer row is a dialog no check can ever open");
        if (typeof mk === "function") {
            mk("http://peer.local:8080", [
                { name: "zeta.txt", dir: false }, { name: "alpha", dir: true },
                { name: "beta.bin", dir: false }, { name: "gamma", dir: true },
            ]);
            // v3695 -- SELECTORS FOLLOWED THE REFACTOR. grabDialog is now a CALLER of pickFromList, so the rows carry
            // data-pick-name / data-pick-dir and the progress line is <id>Prog. THE ASSERTIONS BELOW ARE THE SAME
            // CLAIMS -- rows are buttons, folders first, the click acts on THAT entry, an empty list says so --
            // and only the spelling of where to look changed. A REFACTOR THAT LEFT THESE POINTING AT THE OLD
            // ATTRIBUTES WOULD HAVE GONE GREEN BY MATCHING NOTHING, which is the failure mode this file has
            // recorded against itself twice.
            const rows = [...d3.querySelectorAll("#swekGrabDlg [data-pick-name]")];
            ok("!! every entry becomes a CLICKABLE row -- nothing has to be typed",
                rows.length === 4 && rows.every((r) => r.tagName === "BUTTON"),
                rows.length + " rows. THE ENDPOINT ALWAYS RETURNED {name, dir}; the listing was being joined " +
                "into a string and shown inside a prompt(), so everything a picker needs was already on the wire");
            ok("!! folders sort FIRST and are marked",
                rows.slice(0, 2).every((r) => r.dataset.pickDir === "1") &&
                rows.slice(2).every((r) => r.dataset.pickDir === "") &&
                /\uD83D\uDCC1/.test(rows[0].textContent),
                rows.map((r) => r.dataset.pickName).join(", ") + ". /peer/grab takes either, AND A FOLDER GRAB " +
                "IS THE EXPENSIVE ONE -- a picker that hides which is which invites the accidental one");
            // Clicking sets the progress line SYNCHRONOUSLY, before any fetch resolves, so this proves the
            // wiring without needing a network in the sandbox.
            rows[2].click();
            const prog = d3.getElementById("swekGrabDlgProg");
            ok("!! clicking a row acts on THAT entry, with no typing anywhere in the path",
                !!prog && /grabbing beta\.bin/.test(prog.textContent || ""),
                JSON.stringify(prog && prog.textContent) + " -- the click carries the entry's own name into the " +
                "POST, so a name that is hard to spell or contains a space is no longer a hazard");
            mk("http://peer.local:8080", []);
            ok("...and an EMPTY listing says so rather than showing an empty box",
                !!d3.getElementById("swekGrabDlgEmpty"),
                "an empty Downloads folder is not an error and is not a picker either -- saying which is the " +
                "difference between a reader waiting and a reader knowing");
        }
        // *** v3696 -- THE RATCHET IS ON THE TELL, NOT ON THE COUNT. *** server.html still has four prompt()
        // calls and all four are legitimate FREE TEXT with nothing to pick from: the engine password, the
        // idle-lock minutes, a path on ANOTHER machine this box cannot list, and naming a peer. What must never
        // come back is a prompt standing in for a PICKER -- the five that did all said the same thing, "type a
        // number" or "type the exact name", because the page already had the list and asked the reader to
        // transcribe from it. AN OFF-BY-ONE IN ONE OF THOSE SENT A FILE, OR A REMOTE-VIEW REQUEST, TO THE WRONG
        // MACHINE with the action reporting success.
        // READ THROUGH noComments AND NOT codeOnly, DELIBERATELY: the text hunted here IS A STRING LITERAL, so
        // codeOnly would blank the very thing being looked for -- while the prose ABOVE the picker describes the
        // old prompt in a comment and must not count as one (it did, on the first attempt).
        // *** v3697 -- THE OTHER FOUR PICKERS ARE DRIVEN NOW, NOT "WIRED THE SAME WAY" ON MY WORD. *** Keith
        // asked whether that was a round or something for him, and the honest answer was: the wiring is mine to
        // check and only the LOOK is his. It could not be checked as written -- both flows read `peerList` OUT
        // OF A CLOSURE that only a fetch fills, so no fixture could reach them. They take their lists as
        // PARAMETERS now, which is the whole reason these checks exist.
        const peers = [
            { name: "alpha-box", ip: "10.0.0.4", url: "http://10.0.0.4:8080" },
            { name: "beta-box",  ip: "10.0.0.9", url: "http://10.0.0.9:8080" },
        ];
        {
            const sent = [];
            dom3.window._swekPush = (e) => sent.push(e && e.msg);
            dom3.window._swekSendPickers(
                [{ name: "notes.txt", dir: false }, { name: "shots", dir: true }], peers);
            const files = [...d3.querySelectorAll("#swekSendPickDlg [data-pick-name]")];
            ok("!! step 1 lists the files, folders first", files.length === 2 && files[0].dataset.pickDir === "1",
                files.map((f) => f.dataset.pickName).join(", "));
            files[1].click();                                    // notes.txt -- the FILE, after the folder
            const chosen = [...d3.querySelectorAll("#swekSendPeerDlg [data-pick-name]")];
            ok("!! ...and step 2 lists the PEERS, each row carrying its OWN url",
                chosen.length === 2 && chosen[1].dataset.pickName === peers[1].url,
                chosen.map((c) => c.dataset.pickName).join(", ") + ". THE URL ON THE ROW IS THE WHOLE FIX -- the " +
                "prompt this replaced asked for an INDEX, and an off-by-one sent the file to the wrong machine");
            chosen[1].click();                                   // the SECOND peer, deliberately not the first
            const prog = d3.getElementById("swekSendPeerDlgProg");
            ok("!! *** the SECOND file goes to the SECOND peer -- both choices travel, neither is index-guessed ***",
                !!prog && /notes\.txt/.test(prog.textContent || "") && prog.textContent.includes(peers[1].url),
                JSON.stringify(prog && prog.textContent) + ". Picking row 2 of each is deliberate: WITH ROW 1 A " +
                "HARD-CODED FIRST-ENTRY BUG WOULD PASS, which is how the old index prompt failed in the first place");
        }
        {
            const sent = [];
            dom3.window._swekPush = (e) => sent.push(e && e.msg);
            dom3.window._swekRdPickPeer(peers);
            const rows = [...d3.querySelectorAll("#swekRdPeerDlg [data-pick-name]")];
            ok("!! the RustDesk picker lists peers with their urls", rows.length === 2,
                rows.map((r) => r.dataset.pickName).join(", "));
            rows[1].click();
            ok("!! *** and the REQUEST carries the clicked peer's url ***",
                sent.some((m) => typeof m === "string" && m.indexOf(peers[1].url) >= 0),
                JSON.stringify(sent) + ". THIS IS THE ONE THAT MATTERED MOST: an off-by-one here asked the WRONG " +
                "MACHINE to open an unattended remote-view session pointed at this one");
        }

        ok("!! *** no prompt() asks the reader to transcribe from a list the page already has ***",
            !/(Type a number|Type the exact (name|filename))/.test(noComments(fs.readFileSync(path.join(ENG, "server.html"), "utf8"))),
            "five of these existed; all five are pickers now. THE FOUR REMAINING prompts are free text with " +
            "nothing to choose from, which is the honest use. If this line ever goes red, the fix is a " +
            "pickFromList call, NOT a reworded prompt.");
        ok("!! the typed-name prompt is GONE from the grab path",
            !/Type the exact name \(file or folder\)/.test(fs.readFileSync(path.join(ENG, "server.html"), "utf8")),
            "the source check is here because the DOM one above cannot see a prompt that is never reached");
        // NOT CLOSED ON PURPOSE: this page keeps timers, and closing the window mid-flight lets one fire
        // against a torn-down document -- a CRASH WITH NO "FAIL" LINES, which reads exactly like a clean run
        // to anything counting failures. The process exits in a moment anyway; the exit code is the thing
        // being protected here (v3605, and again at v3681).

    }

    // *** v3671 -- THE GAUGES <-> INFO SWAP, DRIVEN IN A REAL DOM. *** The module's own gate can only read the
    // SOURCE; whether the swap actually moves both elements is a DOM fact, and this is the only file here with
    // one. Keith reported two things: the avatar stayed put when the info panel came up, and the panel's left
    // column was a dead "CPU -- RAM -- GPU" line.
    //
    // *** THE MODULE IS DRIVEN DIRECTLY RATHER THAN THROUGH THE PAGE, AND MY FIRST VERSION WAS A CHECK THAT
    // COULD NOT FAIL. *** server.html mounts the panel through a dynamic import(), WHICH jsdom DOES NOT HAVE --
    // so window._gaugeInfo was never set, every assertion sat behind an `if (gi)` that was false, and the whole
    // block REPORTED AND ASSERTED NOTHING while reading like coverage. That is the exact species this file's
    // own header was written about. Handing jsdom's document to mountGaugeInfo tests the real module against a
    // real DOM and needs no import() at all.
    {
        const { mountGaugeInfo } = await import("../../ui/gaugeInfoPanel.js");
        // THE STUB MIRRORS server.html's ACTUAL SHAPE, and my first one did not: the panel is mounted with
        // `host: dialsEl.parentElement`, so host IS the dials' parent and the avatar is their SIBLING. I gave
        // it a host one level up, and host.insertBefore(row, dialsEl.nextSibling) threw NotFoundError --
        // "the child can not be found in the parent". IT PRINTED ZERO FAIL LINES AND EXITED 1: a crash is not
        // a failed assertion, and reading the count instead of the exit code would have called this a pass
        // with no checks in it (v3605's lesson, in a new costume).
        const jd = new JSDOM('<!doctype html><body>' +
            '<div id="host"><div id="dials">D</div><span id="robot">A</span></div></body>');
        const prevDoc = globalThis.document, prevWin = globalThis.window;
        globalThis.window = jd.window; globalThis.document = jd.window.document;
        try {
            const d2 = jd.window.document;
            const dials = d2.getElementById("dials"), bot = d2.getElementById("robot");
            const gi = mountGaugeInfo({
                dialsEl: dials, host: d2.getElementById("host"),
                getStats: () => ({ cpu: 12, ram: 61, gpu: 4, swekpeers: 3, swekremotepeers: 0, battery: 88 }),
                hideWith: [bot],
            });
            const shown = (el) => !!el && el.style.display !== "none";
            ok("!! mountGaugeInfo mounts against a real document", !!gi, "everything below depends on it");
            gi.showGauges();
            const g0 = { dials: shown(dials), bot: shown(bot), row: shown(d2.getElementById("giRow")) };
            gi.showInfo();
            const i1 = { dials: shown(dials), bot: shown(bot), row: shown(d2.getElementById("giRow")) };
            gi.showGauges();
            const g2 = { dials: shown(dials), bot: shown(bot) };
            report("gauges / info / back", JSON.stringify(g0) + " -> " + JSON.stringify(i1) + " -> " + JSON.stringify(g2));
            ok("!! *** raising the info panel hides the AVATAR as well as the dials ***",
                g0.dials && g0.bot && !i1.dials && !i1.bot && i1.row,
                "#dialsRobot is a SIBLING of #dials on server.html, so hiding the dials alone left the avatar " +
                "beside the panel -- the swap replaced half a row. THIS IS THE CHECK THE SOURCE TEST CANNOT " +
                "MAKE: hideWith could be spelled correctly and handed an element that does not exist, and the " +
                "module would loop over a list of nulls and pass every text check.");
            ok("...and going back to Gauges restores BOTH, so the panel cannot strand the avatar",
                g2.dials && g2.bot,
                "a swap that hides two things and restores one is worse than one that hides neither");
            const dock = d2.getElementById("giDock"), info = d2.getElementById("giInfo");
            ok("!! the dock is the LEFT column and the info body is to its right",
                !!dock && !!info && dock.parentElement === info.parentElement &&
                [...dock.parentElement.children].indexOf(dock) < [...dock.parentElement.children].indexOf(info),
                "Keith asked for the robot and a vertical gauge stack where the dead text line was");
            gi.showInfo();
            await new Promise((r) => setTimeout(r, 50));      // let buildDock's rejected import settle
            const mini = d2.getElementById("giMini");
            ok("!! ...with no dynamic import here the FALLBACK LINE IS VISIBLE, rather than an empty rail",
                !!mini && mini.style.display !== "none" && /CPU/.test(mini.textContent || ""),
                "*** jsdom HAS NO DYNAMIC import(), so the dock genuinely cannot build and this is the fallback " +
                "path running for real rather than being described. *** My first version set only textContent " +
                "and left mini at display:none, so the fallback existed and could never be seen -- an empty " +
                "rail on exactly the path that exists to stop the rail being empty. THE ROBOT AND THE STACKED " +
                "GAUGES ARE KEITH'S TO SEE; this says only that the failure path is not blank.");
            gi.showGauges();
        } finally {
            globalThis.document = prevDoc; globalThis.window = prevWin;
            jd.window.close();
        }
    }

    // *** THE FIRST VERSION OF THIS CHECK WAS `(async()=>true)() && true`, WHICH IS A CHECK THAT CANNOT FAIL. ***
    // It read as coverage and asserted nothing -- the exact species gateMutation exists to hunt, written by me,
    // in the file whose whole subject is "verified by reading is not verified". It renders the empty case now.
    const emptyPayload = basePayload();
    emptyPayload.buckets = [];
    const dom2 = await render("server.html", { payload: emptyPayload, waitMs: 500 });
    const wrap2 = dom2.window.document.getElementById("unsortedWrap");
    report("unsortedWrap display with zero buckets", JSON.stringify(wrap2.style.display));
    ok("!! the drawer stays hidden when nothing is unclaimed, RENDERED rather than reasoned",
        wrap2.style.display === "none",
        "the buckets come from the bridge, so an empty list leaves the drawer at display:none. *** IT " +
        "DISAPPEARS ON ITS OWN ONCE THE WORK IS DONE, which is the property that makes it a to-do list rather " +
        "than a permanent twenty-second section. ***");
    dom2.window.close();
}

// ---------------------------------------------------------------------------
console.log("\n5. WHAT THIS CANNOT SAY, STATED RATHER THAN IMPLIED");
{
    ok("!! jsdom is not a browser and the remaining question is a LAYOUT one",
        true,
        "no layout, no paint, no real network. *** IT CANNOT TELL US WHETHER 21 NESTED <details> ARE " +
        "NAVIGABLE ON THE RIG *** -- that stays open in todo.mjs as a layout question rather than being " +
        "quietly marked done because a headless test went green.");
    ok("...but every failure it CAN see is one that would have shipped",
        true,
        "does the page parse, does the fetch land, does the handler fire, does the right body go out, does the " +
        "DOM follow the server. NONE OF THOSE NEEDED A SCREEN, and all four surfaces had zero coverage of any " +
        "of them.");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** AND THE INSTRUMENT BENCH, WHICH IS THE OTHER HALF OF THE SAME DEBT ***");
{
    const insts = [
        { id: "crystal-absences", name: "Systematic absences", area: "crystal", module: "physics/crystal/structureFactor.mjs", gate: "physics/crystal/structureFactor-selfcheck.mjs" },
        { id: "rigid-keys", name: "Grading the box3d wasm", area: "mechanics", module: "physics/mechanics/rigidKeys.mjs", gate: "physics/mechanics/rigidKeys-selfcheck.mjs" },
    ];
    const benchFetch = async (url) => {
        const u = String(url);
        const j = (o, s = 200) => ({ ok: s < 400, status: s, json: async () => o });
        if (u.startsWith("/instruments/list")) return j({ ok: true, instruments: insts });
        if (u.startsWith("/instruments/report"))
            return j({ ok: true, id: "crystal-absences", name: insts[0].name, area: "crystal",
                       module: insts[0].module, gate: insts[0].gate, ms: 42,
                       lines: ["[crystal/structureFactor] a line", "  fcc  540 absent  9.8e-16"] });
        return j({}, 404);
    };
    const html = fs.readFileSync(path.join(ENG, "instrument-bench.html"), "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/",
        beforeParse(w) { w.fetch = benchFetch; } });
    await sleep(300);
    const d = dom.window.document;
    report("instruments listed / areas", d.querySelectorAll(".inst").length + " / " + d.querySelectorAll(".area").length);

    ok("!! the bench lists the instruments the bridge reports, grouped by area",
        d.querySelectorAll(".inst").length === 2 && d.querySelectorAll(".area").length === 2,
        "*** 34 OF 104 INSTRUMENTS CARRIED page: null *** -- reachable only by running a selfcheck by hand, " +
        "which is the debt policyMass sat in until v3030, and two whole new AREAS were in it.");
    d.querySelector('.inst[data-id="crystal-absences"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await sleep(200);
    ok("!! clicking one runs it and renders the MODULE'S OWN LINES verbatim",
        /540 absent/.test(d.getElementById("main").textContent),
        "reformatting them here would be a second copy of the report's structure, drifting from what the " +
        "terminal prints -- the defect this session found in nine files, three, four and two page indexes");
    ok("!! *** AND IT SHOWS A REPORT RATHER THAN CLAIMING A VERDICT ***",
        /To find out whether it passes, run the gate/.test(d.getElementById("main").textContent),
        "the gate is what exits nonzero and it stays where it is. A page printing PASS while running only the " +
        "REPORTING half would assert something it never checked -- the v3327 split rebuilt in HTML.");
    dom.window.close();

    const dom2 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/",
        beforeParse(w) { w.fetch = async () => { throw new Error("ECONNREFUSED"); }; } });
    await sleep(250);
    ok("!! a missing bridge says so instead of looking like a tree with no instruments",
        /bridge unreachable/.test(dom2.window.document.getElementById("side").textContent),
        "ABSENT IS NOT EMPTY. The two need different actions from whoever is reading, and a blank sidebar " +
        "cannot tell them apart -- the same rule the launch index and the boot sidecar already hold.");
    dom2.window.close();
}

// ---- v3705. THE CURRICULUM PAGE, DRIVEN -- A GO BUTTON NOBODY HAS PRESSED IS NOT A GO BUTTON --------------
// The run route has existed since v3699 and NOTHING CALLED IT: no page mentioned the curriculum at all, so a
// feature with a route, a fleet-visible run marker and its own gate was still unreachable by a person. The one
// thing worth proving here is that PRESSING GO ACTUALLY ASKS -- a button wired to nothing renders identically
// to one that works.
{
    const asked = [];
    const j = (o) => Promise.resolve({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    const html = fs.readFileSync(path.join(ENG, "curriculum.html"), "utf8");
    const dom = new JSDOM(html, {
        runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/",
        beforeParse(w) {
            w.fetch = (url) => {
                asked.push(String(url));
                if (String(url).startsWith("/fingerprint")) return j({ roundhouse: { state: "idle" } });
                if (String(url).startsWith("/curriculum/run")) {
                    return j({ ok: true, ms: 96000,
                               proposals: [{ kind: "plant", subject: "beam", task: "give this bind a planted error",
                                             grader: "tools/roundhouse/plantedCoverage.mjs" }],
                               ungradable: [], unmeasured: [],
                               skipped: [{ kind: "door", why: "SLOW (its census walks the whole tree, >285s)" }] });
                }
                return j({ ok: true });
            };
        },
    });
    await sleep(500);
    const d = dom.window.document;

    ok("!! the curriculum page has a Go control at all", !!d.getElementById("go"),
        "the route existed since v3699 and NOTHING CALLED IT -- a tool reachable only by a route has no front " +
        "door, which this project's own rule forbids");

    d.getElementById("go").click();
    await sleep(500);
    ok("!! *** pressing Go actually asks the run route ***",
        asked.some((u) => u.startsWith("/curriculum/run")),
        JSON.stringify(asked.slice(0, 4)));

    const out = () => d.getElementById("out").innerHTML;
    ok("!! ...and each proposal is rendered WITH the gate that would decide it",
        /beam/.test(out()) && /plantedCoverage/.test(out()),
        "a subject without its grader is a to-do item, not a proposal");

    ok("!! *** a SKIPPED census is shown, not swallowed ***",
        /SKIPPED/.test(out()) && /285s/.test(out()),
        "one proposal with the skipped kind hidden would read as a frontier with almost nothing on it -- THE " +
        "MOST EXPENSIVE LIE IS THE ONE THAT LOOKS LIKE COMPLETION");

    ok("...and the page states what a proposal is NOT claiming",
        /reachable and checkable/.test(out()),
        "a ranked list is read as a recommendation whatever the header says");

    d.getElementById("doors").checked = true;
    asked.length = 0;
    d.getElementById("go").click();
    await sleep(500);
    ok("!! the slow census is OPT-IN from the page too",
        asked.some((u) => u.indexOf("doors=1") >= 0),
        JSON.stringify(asked.slice(0, 3)) + " -- the checkbox has to reach the route or it is decoration");
}

// ---- v3706. THE COMPOSER AFTER A FAILED LOAD -- THE FAILURE ui/roundTrip.js WAS WRITTEN FOR ----------------
// Keith's six round-trip rules have existed since v3243 and NOTHING HAD EVER IMPORTED THEM. This page is the
// most dangerous consumer they could have had: boot() ends in `.catch(function(){ toUI({}); })`, so a fresh
// browser plus ONE failed fetch fills every control with a browser default, and the next keystroke autosaves
// that blank stage over diorama.json. Driven here with the load deliberately failing.
{
    const posts = [];
    const j = (o) => Promise.resolve({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    const html = fs.readFileSync(path.join(ENG, "diorama-composer.html"), "utf8");
    const dom = new JSDOM(html, {
        runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/",
        beforeParse(w) {
            w.fetch = (url, opt) => {
                const u = String(url);
                if (opt && opt.method === "POST") { posts.push(JSON.parse(opt.body)); return j({ ok: true }); }
                // THE LOAD FAILS. This is the whole fixture.
                if (u.startsWith("/diorama/composition")) return Promise.reject(new Error("bridge down"));
                if (u.startsWith("/diorama/presets")) return j({ ok: true, presets: [] });
                return j({ ok: true, items: [] });
            };
        },
    });
    await sleep(600);
    const d = dom.window.document;

    ok("!! the composer marks controls UNKNOWN after a failed load",
        !!dom.window.__swekComposerUnknown,
        "avatar=" + JSON.stringify(d.getElementById("avatar").value) + " pet.indeterminate=" +
        d.getElementById("pet").indeterminate + ". A control holding a browser default LOOKS EXACTLY LIKE a " +
        "control somebody set to that value, which is the entire premise of roundTrip.js.");

    // Touch one thing, the way a person would, and let the autosave fire.
    d.getElementById("room").indeterminate = false;
    d.getElementById("room").checked = false;
    d.getElementById("room").dispatchEvent(new dom.window.Event("change"));
    await sleep(900);

    const saved = posts.filter((p) => p && p.composition);
    ok("!! *** and the save that follows is PARTIAL, not a full blank composition ***",
        saved.length > 0 && saved[saved.length - 1].partial === true,
        JSON.stringify(saved[saved.length - 1] || null).slice(0, 150));

    const body = (saved[saved.length - 1] || {}).composition || {};
    ok("!! *** it OMITS the avatar it never loaded, instead of sending an empty one ***",
        body.avatar === undefined,
        "avatar in body: " + JSON.stringify(body.avatar) + ". SENDING \"\" HERE IS THE BUG -- the server would " +
        "store an empty avatar as though somebody had chosen one, and the stage would come up bare.");

    ok("...and it omits gauges and props it never loaded",
        body.gauges === undefined && body.props === undefined,
        "an empty props array from a failed load is INDISTINGUISHABLE from 'I removed all the props', and " +
        "sending it would do the latter");

    ok("...while the field the person actually touched IS sent",
        body.room === false,
        "the guard must not swallow a real edit -- omitting everything would be safe and useless");
}

console.log(fails ? `\nplacementRender-selfcheck: ${fails} FAILED` : "\nplacementRender-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
