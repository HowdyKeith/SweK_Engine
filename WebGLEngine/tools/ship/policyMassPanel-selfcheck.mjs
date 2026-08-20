// WebGLEngine/tools/ship/policyMassPanel-selfcheck.mjs -- v3030
//
// Run: node tools/ship/policyMassPanel-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Policy Mass minipanel -- and closes the last named entry on the bridge-census UI debt list.
//
// THE IRONY IS WORTH RECORDING. policyMassBridge was written at v2856 EXPRESSLY to give a CLI-only tool a front
// door, because "a CLI-only deliverable is unfinished" is a standing rule here. It then sat for one hundred and
// seventy-four versions WITHOUT A FRONT DOOR OF ITS OWN, reachable only by typing /policymass into a bar.
//
// AND IT ANSWERS A REAL QUESTION: does the brain put its probability mass on the options that actually work? An
// aggregate hit rate CANNOT answer that -- a brain at 45% could be learning, or could be confidently choosing
// options that fail, and THOSE ARE IDENTICAL IN A RATIO. Ranking mass against merit tells them apart. That is
// the same shape as v3007's step trajectory: a summary number hiding two opposite stories.
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const census = fs.readFileSync(path.join(ENG, "tools", "ship", "bridgeCensus-selfcheck.mjs"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT HAS A DOOR NOW --------------------------------------------------------------------------------
{
    ok("!! there is a Policy Mass gtab", /data-tab="policymass"/.test(ui));
    ok("...and a panel and a chip", /data-panel="policymass"/.test(ui) && /id="pmStat"/.test(ui));
    ok("it reads the bridge's own status route", /"\/policymass\/status"/.test(ui));
    ok("...and links to the demo", /\/policymass\/demo/.test(ui),
       "the demos run on known-answer traces, so the tool is inspectable with no captured trace at all");
}

// ---- 2. THE QUESTION IS ON THE PANEL, not left in a source comment -------------------------------------------
{
    ok("!! the panel states the question", /Does the brain put its probability mass on the options that actually work/.test(prose(ui)),
       "a gauge labelled 'Policy Mass' means nothing to anyone who has not read the bridge");
    ok("!! ...and why a hit rate cannot answer it", /identical in a ratio/.test(ui),
       "a brain at 45% could be learning or could be confidently wrong -- that is the whole reason this tool exists, and it belongs where the number is");
}

// ---- 3. CAPTURE-OFF IS A DEFAULT, NOT A FAULT -----------------------------------------------------------------------
{
    ok("!! the panel reports the capture switch", /trace capture:/.test(ui));
    ok("!! ...and says OFF IS THE DEFAULT", /off is the DEFAULT, not a fault/.test(ui),
       "a panel showing 'no data' without saying why reads as broken -- the same mistake terrain's 'not built' would have been");
    ok("...and names how to turn it on", /BRAIN_TRACE=1/.test(ui),
       "a state you are told about and cannot change is a complaint, not a control");
    ok("the honest scope note is carried through", /j\.reads/.test(ui),
       "the bridge says this measures the SAMPLED policy only; dropping that in the panel would overstate what the number covers");
}

// ---- 4. THE RATCHET MOVED, and one entry remains ---------------------------------------------------------------------
{
    ok("!! the UI-reachability baseline is now 1", /const UI_BASELINE = 1;/.test(census),
       "it was 1 at v3011 for policymass, rose to 2 at v3021 when renaming benchCollect uncovered it had been counted visible only by sharing a prefix, and now falls back to 1 with a DIFFERENT bridge in it");
    ok("...and the remaining one is named", /only fleetbench remains/.test(census),
       "named rather than excused into a wildcard -- a pattern-shaped excuse is how a whole class stops being visible");
    ok("the irony is recorded in the source", /SPECIFICALLY to give a CLI-only tool a front door, then never got one/.test(census),
       "the tool built to fix this exact problem had the exact problem, and that is worth a future reader knowing");
}

console.log(fails ? "\npolicyMassPanel-selfcheck: " + fails + " FAILED" : "\npolicyMassPanel-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
