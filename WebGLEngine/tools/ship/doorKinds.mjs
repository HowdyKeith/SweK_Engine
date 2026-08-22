// WebGLEngine/tools/ship/doorKinds.mjs -- v3608
// ---------------------------------------------------------------------------------------------------------------
// THE FRONT-DOOR LAW HAS ONE SHAPE OF DOOR AND THE TREE HAS FOUR, SO A WORK LIST OF EIGHT IS REALLY THREE
// ANSWERS -- AND THREE OF THE EIGHT ARE A DEFECT THIS PROJECT ALREADY NAMED AND HAS SHIPPED THREE MORE TIMES.
//
// orphanTriage's cliOnly bucket says "has a main block, no page row -- A WORK LIST, NOT AN EXEMPTION", and the
// handoff has carried it as eight items owed. READ ONE AT A TIME, resolving each by MECHANISM rather than by
// mention (v3448's rule: a prose mention counts as a consumer if you do not resolve), THE EIGHT SPLIT THREE
// WAYS AND ONLY TWO ARE ACTUALLY OWED.
//
// ================================================================================================================
// FOUR ALREADY HAVE A DOOR, AND THE REGISTER HAS BEEN CALLING THEM UNFINISHED
// ================================================================================================================
//
//   brain/rl/rocketLoop.mjs         SPAWNED by ai-bridge/rocketBridge.js -- POST /rocket/train/start, and the
//                                   bridge holds a real path and an existsSync guard, not a mention.
//   tools/roundhouse/run-device.mjs IMPORTED by ai-bridge/deviceBridge.js, whose OWN HEADER SAYS WHY: "v2813 -
//                                   front door for the roundhouse DEVICE registry. run-device.mjs was CLI-only;
//                                   this lets device.html pick". THE DOOR WAS BUILT AT v2813 AND THE REGISTER
//                                   HAS CALLED IT CLI-ONLY FOR EIGHT HUNDRED VERSIONS SINCE.
//   tools/mutate/mutate.mjs         A RIG JOB: tools/rig/run-mutate.mjs drives it and rigJobBridge offers it
//                                   with a Run button on rig.html.
//   tools/ship/buildKnowledgeIndex  execFileSync'd by tools/ship/shipRitual.mjs -- A REAL INVOCATION, AND THE
//                                   CHAIN DOES NOT TERMINATE: shipRitual has NO page row, NO route and NO rig
//                                   job of its own. A DOOR ONTO A TOOL THAT HAS NO DOOR IS NOT A DOOR, and the
//                                   kind is reported as `spawn` with that caveat rather than as an answer.
//
// A PAGE ROW IS ONE SHAPE OF DOOR. A ROUTE WITH A PANEL IS ANOTHER, AND A RIG JOB IS A THIRD. A register that
// knows one of them reports the other two as debt, which is v3448's finding ("the classifier recognises only
// one legitimate shape") arriving in the front-door law itself.
//
// ================================================================================================================
// THREE HAVE A PROSE DOOR, WHICH v3447 ALREADY NAMED AS WORSE THAN NO DOOR
// ================================================================================================================
//
//   (buildKnowledgeIndex ALSO has one -- instruments.html tells the reader to type the command -- but it has
//    a real invoker too, so it is counted once, at its strongest kind.)
//   tools/ship/buildPageIndex.mjs        page-index.html renders "Run node tools/ship/buildPageIndex.mjs"
//   tools/roundhouse/signRelease.mjs     fingerprintBridge answers 404 with "no release has been signed yet --
//                                        run signRelease.mjs sign <zip>"
//
// v3447 FOUND EXACTLY THIS AND WROTE IT DOWN: cosmic-map.html "named their absence BY TELLING THE READER TO RUN
// A TERMINAL COMMAND -- the CLI-only deliverable this project refuses ... AND HARDER TO NOTICE THAN A MISSING
// PAGE BECAUSE THE PAGE IS RIGHT THERE AND LOOKS FINISHED." Here are three more, one of them in a bridge that
// already has the route it would take to do the work.
//
// A PROSE DOOR IS NOT A MIDDLE STATE BETWEEN A DOOR AND NO DOOR. It is worse than no door for the reason v3447
// gave, and it is reported as its own kind so it cannot be counted as progress.
//
// ================================================================================================================
// TWO HAVE NO DOOR, AND ONE OF THEM HAS A REASON TO REFUSE ONE
// ================================================================================================================
//
//   tools/ship/removeCluster.mjs    REFUSED, WITH EVIDENCE: v3202's sweep deleted 61 LIVE feature modules and
//                                   left main.js unable to link. A one-click button for a mass deletion is the
//                                   wrong shape for the tool whatever the law says, and the refusal is stronger
//                                   than the law because it is a measurement rather than a preference.
//   physics/backend-qa-check.mjs    GENUINELY OWED, and it needs the rig: nextRounds records "on a rig where
//                                   box3d's WASM builds: node physics/backend-qa-check.mjs --update". A gate
//                                   imports its functions, which is not a door.
//
// THE LIST OF EIGHT WAS 4 DOORS + 2 PROSE DOORS + 1 REFUSAL + 1 GENUINELY OWED AT v3608. AT v3610 IT IS
// 5 DOORS + 0 PROSE DOORS + 2 REFUSALS + 1 GENUINELY OWED: v3609 gave buildPageIndex a row (and
// buildKnowledgeIndex one too, which took it out of the bucket), and v3610 gave shipRitual a row and read
// signRelease's threat model, which turns its prose door into a REFUSAL WITH A REASON rather than debt. NOTHING HERE WEAKENS THE LAW:
// what it needs is a way to say "already answered, differently" and a way to say NO WITH A REASON, or every
// tool lands as debt by default -- v3448's shape, in the register that measures the law.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// EXCLUDED BY IDENTITY, NEVER BY NAME -- this file names all eight modules in its own header and register,
// so a name-based exclusion would break the day somebody renamed it. v3566's rule, collected again.
import { REPORTING, ARTEFACT_TOOLS } from "./reportingTools.mjs";

export const ENGINE = path.join(HERE, "..", "..");
export const SELF = path.relative(ENGINE, fileURLToPath(import.meta.url)).split(path.sep).join("/");

/** Comments stripped: an import or a spawn is an IDIOM. Strings are KEPT, because a prose door lives in one. */
export const noComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const read = (rel) => { try { return fs.readFileSync(path.join(ENGINE, rel), "utf8"); } catch { return ""; } };

/** Every non-gate, non-test file that could hold a door. Derived by walking, never a typed list. */
export function doorCandidates() {
    const out = [];
    const walk = (dir) => {
        let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git|archive/.test(e.name)) walk(p); continue; }
            if (!/\.(mjs|js|html)$/.test(e.name)) continue;
            if (/-selfcheck\.mjs$/.test(e.name)) continue;
            out.push(path.relative(ENGINE, p).split(path.sep).join("/"));
        }
    };
    for (const d of ["ai-bridge", "tools", "brain", "physics", "ui", "simulation"]) walk(path.join(ENGINE, d));
    for (const f of fs.readdirSync(ENGINE)) if (/\.html$/.test(f)) out.push(f);
    return out;
}

/**
 * THE DOOR KINDS, EACH RESOLVED BY A MECHANISM AND NOT BY A MENTION.
 *   page-row  -- named in reportingTools' registry, which is what tools.html renders
 *   rig-job   -- named in rigJobBridge's JOBS, which is what rig.html renders with a Run button
 *   spawn     -- some file builds a path to it AND spawns a process
 *   import    -- some non-gate file imports it (static or dynamic)
 *   prose     -- a STRING somewhere tells a reader to run it, and nothing above is true
 *   none      -- nothing
 * The order is the strength order and the first hit wins; `all` carries every kind found, because a tool with
 * a real door AND a prose door still has the prose door and hiding that would lose the finding.
 */
export const REFUSED = new Set();   // filled below, once MEASURED_V3608 exists
export function doorKind(rel, files = doorCandidates()) {
    const base = path.basename(rel);
    const kinds = [], evidence = {};
    const reporting = read("tools/ship/reportingTools.mjs");
    if (new RegExp('rel:\\s*["\']' + rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '["\']').test(reporting)) {
        kinds.push("page-row"); evidence["page-row"] = "tools/ship/reportingTools.mjs";
    }
    const rig = read("ai-bridge/rigJobBridge.js");
    const rigRunners = fs.existsSync(path.join(ENGINE, "tools", "rig"))
        ? fs.readdirSync(path.join(ENGINE, "tools", "rig")).filter((f) => noComments(read("tools/rig/" + f)).includes(base)) : [];
    if (rigRunners.some((f) => rig.includes("tools/rig/" + f))) {
        kinds.push("rig-job"); evidence["rig-job"] = "tools/rig/" + rigRunners[0] + " -> rigJobBridge JOBS";
    }
    for (const f of files) {
        if (f === rel || f === SELF) continue;            // SELF by IDENTITY, never by name -- see below
        const src = noComments(read(f));
        if (!src.includes(base)) continue;
        const esc = base.replace(/\./g, "\\.");
        // A PATH LITERAL IS SHORT AND HAS NO SPACES; A REGISTRY BLURB IS A PARAGRAPH. My second version matched
        // the basename anywhere in a kept string and read reportingTools' PROSE DESCRIPTION of a tool as a
        // spawn -- prose-as-code, in the direction noComments cannot help with, because the operand of the
        // idiom genuinely lives in a string (v3558's hardest case). The discriminator is the LITERAL ITSELF.
        const literals = [...src.matchAll(/["'`]([^"'`\n]{0,120})["'`]/g)].map((m) => m[1])
            .filter((v) => new RegExp(esc + "$").test(v) && !/\s/.test(v));
        if (!literals.length) continue;
        const lines = src.split("\n");
        const nameLine = (l) => literals.some((v) => l.includes(v));
        let spawns = lines.some((l) => nameLine(l) && /spawn|execFile|fork\s*\(/.test(l));
        if (!spawns) {
            // ONE HOP IS NOT ENOUGH, AND THE INSTRUMENT FOUND THAT OUT BY DISAGREEING WITH ME. rocketBridge
            // binds `const LOOP = path.join(..., "rocketLoop.mjs")`, then `const args = [LOOP, ...]`, then
            // spawn(process.execPath, args). A rule that looked for LOOP inside the spawn call read NO DOOR,
            // and I had already written the opposite in this file's own header ON THE STRENGTH OF A COMMENT
            // saying "spawn brain/rl/rocketLoop.mjs" -- prose-as-consumer, in the round building the detector
            // for it. The taint follows assignments a few hops instead.
            const tainted = new Set();
            const seed = src.match(new RegExp('const\\s+([A-Za-z_$][\\w$]*)\\s*=[^;\\n]*' + esc));
            if (seed) tainted.add(seed[1]);
            for (let hop = 0; hop < 3 && tainted.size; hop++) {
                for (const t of [...tainted])
                    for (const m of src.matchAll(new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=[^;\\n]*\\b' + t + '\\b', "g")))
                        tainted.add(m[1]);
            }
            for (const t of tainted)
                if (new RegExp('(spawn|spawnSync|execFile|execFileSync|fork)\\s*\\([\\s\\S]{0,200}\\b' + t + '\\b').test(src)) { spawns = true; break; }
        }
        const imports = lines.some((l) => nameLine(l) && /(import\s*\(|^\s*import\s|from\s|esm\s*\()/.test(l));
        if (spawns && !kinds.includes("spawn")) { kinds.push("spawn"); evidence.spawn = f; }
        if (imports && !kinds.includes("import")) { kinds.push("import"); evidence.import = f; }
    }
    // PROSE LAST, AND IT NEEDS THE STRINGS KEPT: a page that tells a reader to type a command holds that
    // sentence in a STRING, which is exactly the case noComments is for and codeOnly would blank.
    for (const f of files) {
        if (f === rel || f === SELF) continue;
        const src = noComments(read(f));
        // PUNCTUATION IS NOT A DEFENCE. v3610 changed a 404 to read "Run: node tools/..." and the old regex
        // (which demanded whitespace straight after `run`) stopped matching -- the message still told the
        // reader to open a terminal, so the KIND had not changed and the detector had. Colon admitted.
        if (new RegExp('(run|Run|RUN)[:\\s]\\s*(node\\s+)?[^"\'\\n]{0,60}' + base.replace(/\./g, "\\.")).test(src)) {
            if (!kinds.includes("prose")) { kinds.push("prose"); evidence.prose = f; }
            break;
        }
    }
    // A DECLARED REFUSAL OUTRANKS A PROSE DOOR, AND THAT IS THE POINT OF DECLARING IT. A page that tells the
    // reader to type a command is DEBT when nothing explains why there is no button, and is an ANSWER when the
    // reason is recorded -- signRelease's private key must never sit behind an HTTP surface. The prose kind is
    // KEPT in `all` either way, so the distinction is never hidden by the promotion.
    if (REFUSED.has(rel)) { kinds.unshift("refused"); evidence.refused = "MEASURED_V3608.refusedWithAReason"; }
    const ORDER = ["refused", "page-row", "rig-job", "spawn", "import", "prose"];
    const best = ORDER.find((k) => kinds.includes(k)) || "none";
    return { rel, kind: best, all: kinds, evidence, hasProse: kinds.includes("prose") };
}

/** The eight orphanTriage calls cliOnly, resolved. The list is READ FROM orphanTriage, never typed here. */
// *** v3673 -- A ROW ON tools.html IS A DOOR, AND graveyard COULD NOT SEE IT. ***
// v3608 measured that the front-door law has ONE shape of door and the tree has FOUR, and resolved orphanTriage's
// cliOnly bucket by mechanism. THE SAME DEFECT WAS SITTING ONE REGISTER OVER: graveyard's "orphaned utilities"
// says of every member "these export functions and NOTHING calls them -- wire it, or delete it", and its
// resolver is the IMPORT GRAPH. A reportingTools row does not import its module, it SPAWNS IT BY PATH from a
// button on tools.html -- so sixteen modules that already had a door were being counted as debt.
//
// TWO OF THE SIXTEEN MAKE THE POINT BY THEMSELVES: buildKnowledgeIndex.mjs and buildPageIndex.mjs are the exact
// pair v3609 gave rows to IN ORDER TO CLOSE THEIR PROSE DOORS, and graveyard has called them orphaned ever
// since. A ROUND THAT FIXED A DOOR AND A REGISTER THAT COULD NOT SEE THE FIX.
//
// THIS IS A NARROWING OF WHAT COUNTS AS DEBT, NOT A LOOSENING OF THE RULE, and the difference is that the door
// is READ FROM THE REGISTRY RATHER THAN FROM A LIST: hasToolDoor asks whether reportingTools names the file, so
// deleting a row puts its module straight back into the pile. A hand-written exemption list could not do that.
export function toolDoors() {
    const rows = [...(REPORTING || []), ...(ARTEFACT_TOOLS || [])];
    return new Set(rows.map((r) => String(r && r.rel || "").replace(/\\/g, "/")).filter(Boolean));
}
/** Does a runnable module have a button on tools.html? A DOOR IS A DOOR whatever shape it is (v3608). */
export function hasToolDoor(rel, doors = toolDoors()) { return doors.has(String(rel).replace(/\\/g, "/")); }

export async function cliOnlyMembers() {
    const { classify } = await import("./orphanTriage.mjs");
    return classify().split.cliOnly;
}

export function resolveAll(members) {
    const files = doorCandidates();
    return members.map((m) => doorKind(m, files));
}

export const MEASURED_V3608 = {
    theInstrumentCorrectedMe:
        "I wrote in this file's own header that rocketBridge SPAWNS rocketLoop, on the strength of a COMMENT " +
        "saying so -- prose-as-consumer, in the round building the detector for it. The first detector read NO " +
        "DOOR and I nearly overrode it. READING THE CODE SETTLED IT BOTH WAYS: the bridge really does spawn it, " +
        "through TWO bindings (LOOP -> args -> spawn), so the COMMENT was right and MY EVIDENCE WAS WRONG and " +
        "the DETECTOR was too shallow. The taint now follows assignments a few hops.",
    hasADoor: {
        "brain/rl/rocketLoop.mjs": "spawn -- ai-bridge/rocketBridge.js, POST /rocket/train/start",
        "tools/ship/buildKnowledgeIndex.mjs": "spawn -- tools/ship/shipRitual.mjs execFileSync, BUT shipRitual " +
            "itself has no page row, no route and no rig job: A DOOR ONTO A DOORLESS TOOL",
        "tools/roundhouse/run-device.mjs": "import -- ai-bridge/deviceBridge.js, built at v2813 FOR THIS",
        "tools/mutate/mutate.mjs": "rig-job -- tools/rig/run-mutate.mjs, Run button on rig.html",
    },
    proseDoor: {
        // v3609 gave buildPageIndex a real row; v3610 moved signRelease to refusedWithAReason after reading
        // its threat model. THE KIND IS KEPT even at zero -- deleting it would lose the distinction that a
        // prose door is worse than no door, which is the whole reason it was named.
    },
    refusedWithAReason: {
        "tools/ship/removeCluster.mjs": "v3202's sweep deleted 61 LIVE modules. A one-click mass deletion is " +
            "the wrong shape for the tool whatever the law says, and a measurement outranks a preference.",
        // v3610 -- READ, THEN REFUSED. signRelease's own header states the rule: "The PRIVATE key must never
        // leave this machine", keygen writes it OUTSIDE the tree (~/.swek/release-private.pem), and
        // buildKeyLeak-selfcheck FAILS THE BUILD if a private key is found under the tree. A hub route that
        // signs would put that key behind an HTTP surface reachable by anything on the LAN, and the blast
        // radius is stated in the same header: every pinned public key in the fleet becomes worthless at once.
        // SO THE REFUSAL IS NOT A PREFERENCE -- it is the file's own threat model applied to a door.
        "tools/roundhouse/signRelease.mjs": "the PRIVATE KEY must never leave the machine (its own header, and " +
            "buildKeyLeak-selfcheck fails the build if one is found under the tree). A route that signs puts " +
            "that key behind an HTTP surface, and a leaked signing key makes every pinned public key in the " +
            "fleet worthless at once. A terminal-only operation, and the 404 now says WHY rather than only " +
            "naming the command.",
    },
    genuinelyOwed: { "physics/backend-qa-check.mjs": "needs a rig where box3d's WASM builds; a gate importing " +
        "its functions is not a door" },
    verdict: "THE WORK LIST OF EIGHT IS 4 DOORS + 2 PROSE DOORS + 1 REFUSAL + 1 GENUINELY OWED. A page row is " +
             "ONE shape of door; a route with a panel is another and a rig job is a third, so a register that " +
             "knows one reports the other two as debt -- v3448's shape, in the register that measures the law.",
    theProseDoorIsNotProgress: "v3447 already named it: a page that tells the reader to run a terminal command " +
             "is WORSE than a missing page, because the page is right there and LOOKS FINISHED. Three more " +
             "instances here, one of them in a bridge that already owns the route it would take to do the work.",
    notClaimed: "NOTHING HERE WEAKENS THE LAW. What the register needs is a way to say ALREADY ANSWERED " +
                "DIFFERENTLY and a way to say NO WITH A REASON, or every tool lands as debt by default.",
};

// POPULATED FROM THE REGISTER RATHER THAN TYPED TWICE: the refusals live in MEASURED_V3608 with their reasons,
// and a second list here would be the two-declarations defect inside the file that keeps finding it.
for (const k of Object.keys(MEASURED_V3608.refusedWithAReason)) REFUSED.add(k);

export async function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[doorKinds] the front-door law has one shape of door and the tree has four");
    say("");
    const members = await cliOnlyMembers();
    const rows = resolveAll(members);
    say("  orphanTriage's cliOnly bucket (" + members.length + "), resolved BY MECHANISM:");
    say("    module                                    door kind   evidence");
    for (const r of rows)
        say("    " + r.rel.padEnd(42) + r.kind.padEnd(12) + (r.evidence[r.kind] || "-"));
    say("");
    const byKind = {};
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    say("  " + Object.entries(byKind).map(([k, v]) => k + " " + v).join("   "));
    say("");
    say("  A PROSE DOOR IS NOT A MIDDLE STATE. v3447: a page that tells the reader to type a command is WORSE");
    say("  than a missing page, because the page is right there and LOOKS FINISHED.");
    say("");
    say("  " + MEASURED_V3608.verdict);
    say("  " + MEASURED_V3608.theProseDoorIsNotProgress);
    say("  NOT CLAIMED: " + MEASURED_V3608.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
