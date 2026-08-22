// WebGLEngine/tools/okf/okfConsume-selfcheck.mjs — v2625
//
// Run: node tools/okf/okfConsume-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the OKF consumer READS THE FORMAT. The decisive test builds a synthetic bundle whose claims do not
// exist anywhere in predictions.html: if the brief reflects those claims, the consumer is reading OKF, not
// cheating back into the source. A consumer that produced the right brief by secretly re-reading predictions.html
// would "work" here and be a lie about using the format.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseConcept, consumeBundle, briefMarkdown } from "./okfConsume.mjs";
import { emitOKF } from "./emitOKF.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- build a SYNTHETIC OKF bundle whose claims are NOT in predictions.html ---
// The sentinel is RANDOM PER RUN, not a fixed word. A fixed sentinel ("SYNTHETIC-ONLY") broke this test the
// moment a claim DESCRIBING the test wrote that word into predictions.html -- the source then "contained" it.
// A per-run random token can never be in the static source, so documenting the test can never break it again.
const SENTINEL = "okfsyn" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const SYN = path.join(os.tmpdir(), "okf-synthetic-" + process.pid);
fs.rmSync(SYN, { recursive: true, force: true });
fs.mkdirSync(path.join(SYN, "claims"), { recursive: true });
fs.writeFileSync(path.join(SYN, "index.md"), "---\nokf_version: \"0.1\"\n---\n\n# Synthetic bundle\n");
fs.writeFileSync(path.join(SYN, "engine.md"), "---\ntype: system\ntitle: \"Zzyzx Test Engine\"\ndescription: \"A synthetic engine that exists only in this test.\"\n---\n\n# Zzyzx Test Engine\n");
const mkClaim = (slug, title, state, kill) => fs.writeFileSync(path.join(SYN, "claims", slug + ".md"),
    "---\ntype: claim\ntitle: " + JSON.stringify(title) + "\ntags: [" + state + ", synthetic]\ntimestamp: v9001\n---\n\n# " + title + "\n\n## Kill condition\n\n" + kill + "\n");
mkClaim("alpha", SENTINEL + " claim alpha", "open", "settles when the moon turns square");
mkClaim("beta", SENTINEL + " claim beta", "settled", "would have failed if X");
mkClaim("gamma", SENTINEL + " claim gamma", "broken", "known wrong since forever");
mkClaim("delta", SENTINEL + " claim delta", "open", "settles when the tide comes in");
fs.writeFileSync(path.join(SYN, "log.md"), "# Log\n\n- **v9001** [open] " + SENTINEL + " claim alpha\n");

const brief = consumeBundle(SYN);

// ---- 1. IT READS THE FORMAT, NOT THE SOURCE -----------------------------------------------------------------------
{
    const hasSynthetic = brief.openClaims.some((c) => c.title.includes(SENTINEL));
    const src = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
    const synthInSource = src.includes(SENTINEL);   // must be false: these claims exist ONLY in the bundle
    ok("!! the brief reflects the BUNDLE, which the source does not contain", hasSynthetic && !synthInSource,
       "the synthetic bundle's claims appear in the brief (" + hasSynthetic + ") and are absent from predictions.html (" + !synthInSource + "). THIS IS THE PROOF THE CONSUMER READS OKF: if it were secretly re-reading the source, these claims -- which exist only in the bundle -- could not appear.");
}

// ---- 2. THE TALLY IS COUNTED FROM FRONTMATTER tags ----------------------------------------------------------------
ok("!! the state tally comes from the concepts' tags", brief.tally.open === 2 && brief.tally.settled === 1 && brief.tally.broken === 1 && brief.tally.total === 4,
   "synthetic bundle has 2 open / 1 settled / 1 broken; consumer read " + brief.tally.open + " / " + brief.tally.settled + " / " + brief.tally.broken + " (total " + brief.tally.total + "). The state is keyed off the tags array in the frontmatter, exactly what a format-native consumer keys on.");

// ---- 3. THE KILL CONDITION IS EXTRACTED FROM THE BODY -------------------------------------------------------------
{
    const alpha = brief.openClaims.find((c) => c.title.includes("alpha"));
    ok("!! each open claim carries the kill condition parsed from its body", alpha && /moon turns square/.test(alpha.kill),
       "claim alpha's kill: \"" + (alpha ? alpha.kill : "(missing)") + "\". OKF bodies are markdown; the consumer parses the '## Kill condition' SECTION, which is how it turns a served concept into an actionable 'settles when...'.");
}

// ---- 4. THE ENGINE SUMMARY COMES FROM THE system CONCEPT ----------------------------------------------------------
ok("!! the engine summary comes from the type:system concept", brief.engine && /Zzyzx/.test(brief.engine.title),
   "brief.engine.title = \"" + (brief.engine ? brief.engine.title : "(none)") + "\". The consumer finds the one concept whose type is 'system' and takes the title/description from ITS frontmatter -- not from any hardcoded string.");

// ---- 5. ON THE REAL BUNDLE, THE TALLY MATCHES THE ENGINE ----------------------------------------------------------
{
    const REAL = path.join(os.tmpdir(), "okf-real-" + process.pid);
    const version = (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/) || [, "v0"])[1];
    emitOKF(REAL, { version });
    const rb = consumeBundle(REAL);
    ok("!! consuming the real bundle yields a complete, non-empty brief", rb.tally.total > 50 && rb.openClaims.length === rb.tally.open && rb.engine,
       "the real engine bundle consumed to " + rb.tally.total + " claims (" + rb.tally.open + " open, each with a settle-condition), engine \"" + (rb.engine ? rb.engine.title : "?") + "\". THE ENGINE NOW READS ITS OWN OKF -- served at /okf/brief.json and /okf/brief.md.");
    fs.rmSync(REAL, { recursive: true, force: true });
}

fs.rmSync(SYN, { recursive: true, force: true });
console.log(fails ? "\nokfConsume-selfcheck: " + fails + " FAILED" : "\nokfConsume-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
