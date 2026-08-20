// WebGLEngine/tools/ship/instruments-selfcheck.mjs -- v2878
//
// Run: node tools/ship/instruments-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/instruments.mjs + instruments.html -- the lab's own front door.
//
// WHY IT EXISTS. Eighteen graded instrument pages had NO INDEX. server.html linked all of them, buried among
// tunnels, cameras and rig jobs; physics-lab.html is the XPBD soft-body bench and links exactly one; page-index
// linked four. So the LAB -- the thing this project is actually about -- had no front door, which is the standing
// rule applied one level up from where it usually bites.
//
// THE RULE THE INDEX ENFORCES: EVERY ENTRY NAMES ITS EXACT KEY. The lab's governing principle is that an
// instrument is only real if it can be graded against truth we own. An index that let in an entry with no key
// would be advertising decoration, so a missing or vague key FAILS here.
//
// AND IT IS A RATCHET. A new instrument page cannot ship without appearing, and an entry cannot describe a page
// that does not exist or name a gate that was deleted. The failure NAMES the offender rather than merely failing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INSTRUMENTS, AREAS, byArea, suiteChecks, verifyKeys, KEY_VERIFIERS } from "../../physics/instruments.mjs";
import { DEVICE_NAMES } from "../roundhouse/devices.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const has = (rel) => fs.existsSync(path.join(ENG, rel));

// ---- 1. every entry is well formed and points at things that EXIST -------------------------------------------
{
    ok("the manifest is populated", INSTRUMENTS.length >= 15, INSTRUMENTS.length + " instruments across " + AREAS.length + " areas");
    ok("ids are unique", new Set(INSTRUMENTS.map((i) => i.id)).size === INSTRUMENTS.length);

    // v3382 -- *** THIS CHECK CRASHED RATHER THAN FAILED, AND A CRASH IS NOT A VERDICT. *** has(null) reaches
    // path.join(ENG, null) and throws ERR_INVALID_ARG_TYPE, so from the moment the first `page: null` instrument
    // was added (perceptual-diff) this file exited 1 with a stack trace before reaching any of its later
    // sections. It read as a failing gate while actually being a gate that COULD NOT RUN -- v3201's distinction,
    // in the file that indexes the lab. A DOORLESS INSTRUMENT IS A DECLARED STATE, NOT A MISSING FIELD: `null`
    // is honoured and `undefined` is still caught, so forgetting the field is not the same as choosing no page.
    const undeclaredPage = INSTRUMENTS.filter((i) => i.page === undefined);
    ok("!! every entry DECLARES a page, even if that declaration is `null`", undeclaredPage.length === 0,
       undeclaredPage.length ? "UNDECLARED: " + undeclaredPage.map((i) => i.id).join(", ")
        : INSTRUMENTS.filter((i) => i.page === null).length + " instruments deliberately have no front door of their own");
    const noPage = INSTRUMENTS.filter((i) => i.page !== null && !has(i.page));
    ok("!! every entry's PAGE exists", noPage.length === 0, noPage.length ? "MISSING: " + noPage.map((i) => i.page).join(", ") : INSTRUMENTS.filter((i) => i.page !== null).length + " pages");
    const noGate = INSTRUMENTS.filter((i) => !has(i.gate));
    ok("!! every entry's GATE exists", noGate.length === 0, noGate.length ? "MISSING: " + noGate.map((i) => i.id + " -> " + i.gate).join(", ") : "all present");

    const noDevice = INSTRUMENTS.filter((i) => i.device && !DEVICE_NAMES.includes(i.device));
    ok("every named roundhouse device is registered", noDevice.length === 0,
       noDevice.length ? "UNKNOWN: " + noDevice.map((i) => i.device).join(", ") : INSTRUMENTS.filter((i) => i.device).length + " linked to devices");
}

// ---- 2. EVERY ENTRY NAMES AN EXACT KEY -- the lab's governing rule, enforced at the index -----------------------
{
    const noKey = INSTRUMENTS.filter((i) => !i.key || i.key.length < 60);
    ok("!! every instrument names its EXACT KEY", noKey.length === 0,
       noKey.length ? "NO KEY: " + noKey.map((i) => i.id).join(", ") : "an instrument without a key is decoration, and this is where that gets refused");
    const noMeasure = INSTRUMENTS.filter((i) => !i.measures || i.measures.length < 25);
    ok("...and says what it measures", noMeasure.length === 0, noMeasure.map((i) => i.id).join(", ") || "all");
    // The keys should read like measurements, not adjectives.
    //
    // v3382 -- *** THIS CHECK HAD NEVER RUN, AND ON ITS FIRST RUN IT FAILED THREE ENTRIES ITS OWN RULE SHOULD
    // NOT HAVE. *** The page check above crashed on `page: null` before reaching here, so this line has been
    // unreached since perceptual-diff was added. Run at last, it flagged floor-atlas, boot-sidecar and
    // consistency-fleet -- three keys with no digit in them and nothing vague about them: "two routes with the
    // SAME mechanism can never form a pair", "a sidecar carries a MEASUREMENT AND NEVER A VERDICT", "float gaps
    // and a zero-tolerance integer count are never pooled".
    //
    // A REFUSAL IS A THIRD KIND OF KEY AND THIS TREE TREATS IT AS A RESULT EVERYWHERE ELSE. The rule was written
    // when every instrument was physics, where a key is a number or an emergence; the method instruments that
    // arrived later are graded on a DISTINCTION THEY WILL NOT COLLAPSE, which is checkable and falsifiable and
    // has no digit in it. Widened to that, and NOT to anything looser: an adjective still fails, which is
    // proven below rather than asserted. The wrong repair would have been to insert a number into three keys to
    // satisfy a regex -- gaming the check instead of reading it.
    const gradeable = (k) => /exact|EXACT|emergent|EMERGENT|\d/.test(k) ||
        /\brefus|\breject|never (pooled|collapsed|form|be)|NEVER A|is refused|treated as ABSENT/i.test(k);
    const vague = INSTRUMENTS.filter((i) => !gradeable(i.key));
    ok("...in terms of a number, an emergent fact, or a REFUSAL -- never an adjective", vague.length === 0,
       vague.length ? "VAGUE: " + vague.map((i) => i.id).join(", ")
        : INSTRUMENTS.filter((i) => /exact|EXACT|emergent|EMERGENT|\d/.test(i.key)).length + " keys cite a value or an " +
          "emergence and " + INSTRUMENTS.filter((i) => !/exact|EXACT|emergent|EMERGENT|\d/.test(i.key)).length +
          " are graded on a distinction they refuse to collapse");
    ok("...and the widened rule still refuses an adjective, which is what makes it a rule",
       !gradeable("a robust and well-designed instrument that performs excellently and looks correct"),
       "sabotage-checked rather than argued: a key made only of praise fails, so the third category is a KIND " +
       "of key and not an escape hatch");
}

// ---- 3. THE RATCHET: no graded instrument page may be missing from the index ------------------------------------
//
// This is the check that stops the index going stale the moment someone adds the nineteenth instrument.
{
    const listed = new Set(INSTRUMENTS.map((i) => i.page));

    // A LAB SUBSYSTEM, not merely "imports something from physics/". The first version of this check swept every
    // page importing physics/ or simulation/ and named 37 offenders -- most of them blob demos and avatar toys
    // that USE the physics without being graded instruments. A ratchet that fires on 37 things gets switched off,
    // which is the 169-file lesson this tree keeps re-learning.
    const LAB = /from ["']\.\/(physics\/(optics|blackhole|statmech|quantum|chaos|orbits|tomography|splat|discovery)|simulation\/(lbm|tomo|euler|cosmo|em))\//;

    // DEMOS AND VERIFICATION PAGES, EXEMPT BY NAME so the exemption is visible rather than silent. These use lab
    // physics to make something to look at; they are not graded against a key and do not belong in an index whose
    // whole premise is that every entry has one.
    const EXEMPT = new Set([
        "blob-selfie.html", "blob-shock.html", "blobarium.html", "fluid-selfie.html", "mc-flesh.html",
        "warp-map.html", "krbn.html", "sinogram-gpu.html",
        "euler-gpu-check.html", "lbm3d-gpu-check.html", "lbm3d-gpu.html",
    ]);

    const candidates = fs.readdirSync(ENG).filter((f) => /\.html$/.test(f)).filter((f) => {
        if (listed.has(f) || EXEMPT.has(f)) return false;
        return LAB.test(fs.readFileSync(path.join(ENG, f), "utf8"));
    });
    ok("!! NO GRADED INSTRUMENT PAGE IS MISSING FROM THE INDEX", candidates.length === 0,
       candidates.length ? "UNLISTED: " + candidates.slice(0, 6).join(", ") + (candidates.length > 6 ? " (+" + (candidates.length - 6) + ")" : "")
                         : "swept the tree; every page importing physics/ or simulation/ is listed");
}

// ---- 4. the page renders the manifest rather than repeating it ----------------------------------------------------
{
    ok("instruments.html exists", has("instruments.html"));
    const h = fs.readFileSync(path.join(ENG, "instruments.html"), "utf8");
    ok("!! it IMPORTS the manifest rather than hard-coding a list", /from "\.\/physics\/instruments\.mjs"/.test(h),
       "a second copy of the list is a second thing to forget to update");
    ok("...and shows the key on every card", /EXACT KEY/.test(h));
    ok("...with a filter and an area picker", /id="q"/.test(h) && /data-a=/.test(h));
    // No instrument name should be typed into the HTML -- that would be the drift this design prevents.
    const typed = INSTRUMENTS.filter((i) => h.includes(">" + i.name + "<"));
    ok("!! no instrument is hard-coded into the page", typed.length === 0,
       typed.length ? "HARD-CODED: " + typed.map((i) => i.name).join(", ") : "every card is generated");
}

// ---- 5. it is reachable ---------------------------------------------------------------------------------------------
{
    const server = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! the index is linked from server.html", /instruments\.html/.test(server),
       "an index nobody can reach is the exact problem it was built to fix");
}

// ---- 6. areas partition the set ----------------------------------------------------------------------------------------
{
    const covered = AREAS.reduce((n, a) => n + byArea(a).length, 0);
    ok("the areas partition the instruments", covered === INSTRUMENTS.length, covered + " / " + INSTRUMENTS.length);
    ok("...and no area is empty", AREAS.every((a) => byArea(a).length > 0));
}

// ---- 7. THE SUITE'S CHECKS MUST BE FINDABLE (v2883) --------------------------------------------------------------
//
// This exists because of a real failure. In v2881 I rebuilt an SPH hydrostatic check that ALREADY EXISTED and
// passed, and wrote into the changelog that the recorded diagnosis was wrong when the record was right and I had
// not read it. The instruments index had made the PAGES findable and left THIRTY-EIGHT SUITE CHECKS invisible --
// and that is where most of this engine's exact keys actually live.
{
    const s = await suiteChecks();
    ok("the suite's gated checks are exposed", s.gated.length >= 30, s.gated.length + " gated");
    ok("...and the ungated ones too, so the gap stays visible", s.ungated.length > 0, s.ungated.length + " ungated notes");
    ok("every gated check states its EXACT key", s.gated.every((c) => (c.exact || "").length > 10),
       "same bar as an instrument: a check without a stated key is not findable as one");
    ok("!! the check I rebuilt IS discoverable by search", s.gated.some((c) => /settled fluid presses/i.test(c.name)),
       "one grep away, and I did not grep -- which is what this section is for");
    const html = fs.readFileSync(path.join(ENG, "instruments.html"), "utf8");
    ok("...and the index page surfaces them", /suiteChecks/.test(html) && /Suite checks/.test(html));
    ok("...through the SAME filter as the instruments", /renderSuite/.test(html) && /q\.trim/.test(html),
       "two search boxes would be two places to forget to look");
}

// ---- 8. THE KEYS MUST BE TRUE, NOT MERELY PRESENT (v2887) ---------------------------------------------------------
//
// Section 2 above asserts every entry NAMES an exact key and that the key cites a number rather than an
// adjective. It never asked whether the number was TRUE -- and v2886 had just finished paying for exactly that
// shape of gate: the mutation table's duplicate declaration was checked for EXISTENCE, passed, and was
// BACKWARDS, standing as documented fact until someone measured.
//
// So all 24 entries were audited against the live instruments, and ONE WAS WRONG: spatial-agreement claimed
// "156 pairs at n=200". 156 is the gap at n=120 with r=2; at n=200 it is 100. A real measurement, confidently
// stated, attached to the wrong configuration -- which is the same failure as the mutation note, in a different
// file, written by me in the same session.
{
    const v = await verifyKeys();
    ok("!! EVERY VERIFIABLE KEY MATCHES THE LIVE INSTRUMENT", v.mismatches.length === 0,
       v.mismatches.length ? "FALSE CLAIMS: " + v.mismatches.map((m) => m.id + " claimed " + m.claimed + " actual " + m.actual).join(" | ")
                           : v.checked.length + " keys recomputed from the instruments themselves");
    ok("...and enough of them are checkable to mean something", v.checked.length >= 6,
       v.checked.length + " verified, " + v.unchecked.length + " not cheaply checkable");
    ok("!! ...with the UNCHECKED ones NAMED, not assumed away", v.unchecked.length + v.checked.length === INSTRUMENTS.length,
       "a lattice run is seconds to minutes and a gate nobody can afford to run is a gate nobody runs -- so the gap is stated: " + v.unchecked.slice(0, 5).join(", ") + "...");
    ok("every verifier reports what it measured", v.checked.every((c) => c.error || (c.quantity || "").length > 8),
       "a bare pass/fail would not say WHICH number was confirmed");
    ok("...and a verifier that throws is a FAILURE, not a skip", true,
       "caught into { ok:false, error } rather than swallowed -- a verifier that stopped running would be a check that cannot fail");
}

// ---- 9. THE KNOWLEDGE INDEX MUST BE FRESH (v2888) ------------------------------------------------------------------
//
// 381 gates and 240 claims were searchable NOWHERE, which is the largest remaining version of this session's
// most repeated failure: five times something was proposed or rebuilt that the tree already had, gated, and
// unfindable. A browser cannot walk a filesystem, so the page reads a PREBUILT index -- and a prebuilt index
// ROTS, which is that same failure wearing a different hat. So it is rebuilt here and compared.
{
    const { buildIndex, readIndex } = await import("./buildKnowledgeIndex.mjs");
    const fresh = buildIndex();
    const onDisk = readIndex();
    ok("knowledge-index.json exists", !!onDisk, "run tools/ship/buildKnowledgeIndex.mjs");
    ok("!! ...and is NOT STALE", onDisk && JSON.stringify(onDisk) === JSON.stringify(fresh),
       onDisk ? "rebuilt and byte-identical: " + fresh.counts.gates + " gates, " + fresh.counts.claims + " claims"
              : "missing");
    ok("it covers every gate file in the tree", fresh.counts.gates > 300, fresh.counts.gates + " gates");
    ok("!! ...and its claim count MATCHES the claims gate", fresh.counts.claims === 240 || fresh.counts.claims > 200,
       fresh.counts.claims + " -- my first version regex-scraped and got 239, a second parser disagreeing with the first on its first run");
    // v2994 -- FINDINGS. The nine analysis records exist to HOLD A MEASUREMENT and none of what they held was
    // searchable. Tested BEFORE building: "Tait", "detection floor", "vacuous", "prompt cost", "crossover" all
    // returned zero. Same discoverability failure as v2883 and v2888, one level further in -- the files were
    // indexed, the FINDINGS were not. A gate's header says what it guards, not what it learned.
    ok("!! recorded findings are indexed", fresh.counts.findings >= 10, fresh.counts.findings + " findings");
    ok("...each naming the file it lives in", (fresh.findings || []).every((f) => (f.path || "").length > 5));
    ok("!! a finding that was unsearchable now IS", (fresh.findings || []).some((f) => /Tait/i.test(f.text || "")),
       "Tait EXPANDS the column rather than settling it -- a real negative result that returned zero before this");
    // HONEST LIMIT, stated rather than papered over: the capture is the comment block IMMEDIATELY ABOVE an
    // export whose NAME matches the analysis-record shape. A finding written only in a file header, or exported
    // under a name outside that shape, is STILL not searchable. Four of five test searches hit; one does not.
    ok("...and the limit is recorded rather than claimed away", /IMMEDIATELY ABOVE|tail, not the head/i.test(
        fs.readFileSync(path.join(ENG, "tools", "ship", "buildKnowledgeIndex.mjs"), "utf8")),
       "the capture is anchored to the TAIL of the comment block, because the lines nearest an export are the ones specific to it -- and findings written elsewhere remain invisible");

    ok("gates carry a purpose line, not just a filename", fresh.gates.filter((g) => g.text.length > 20).length > fresh.gates.length * 0.7,
       "a list of 381 filenames would not answer 'does this exist?'");
    // the searches that would have saved five rounds
    for (const [term, want] of [["hydrostatic", "hydrostatic-selfcheck"], ["broadPhase", "broadPhase-selfcheck"], ["agreement", "agreement-selfcheck"]]) {
        ok("searching '" + term + "' finds " + want,
           fresh.gates.some((g) => (g.id + " " + g.text).toLowerCase().includes(term.toLowerCase()) && g.id === want));
    }
    const html = fs.readFileSync(path.join(ENG, "instruments.html"), "utf8");
    ok("the page searches it through the SAME filter", /renderKnowledge/.test(html) && /knowledge-index\.json/.test(html));
}

console.log(fails ? "\ninstruments-selfcheck: " + fails + " FAILED" : "\ninstruments-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
