// WebGLEngine/tools/ship/blameChain-selfcheck.mjs -- v3483
//
// Run: node tools/ship/blameChain-selfcheck.mjs
//
// *** SELF TIME NAMES THE FUNCTION. THIS NAMES WHO CALLED IT -- AND NOT HAVING IT COST TWO MORE WRONG GUESSES
// ON TOP OF THE FOUR THE PROFILER WAS BUILT TO END. ***
//
// v3477's profiler named physics/optics/diffraction.js:53. I then guessed the CALLER twice: deviceBridge (v3482
// wired it to a worker, and v3482's own lag report came back naming diffraction.js again, unchanged), then
// roundhouseBridge. *** THE PROFILE IS A TREE AND I WAS ONLY READING ITS LEAVES. The ancestor chain of the
// hottest sample was in the same object the whole time. ***
//
// So this is driven against a profile whose caller is KNOWN IN ADVANCE, because a ranker nobody has watched
// name a path it was told to look for is not evidence of anything -- which is the rule lagBlame's own header
// states about rankSelfTime, applied to the half that was missing.
"use strict";
import inspector from "node:inspector";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const { rankSelfTime, blameChain } = require_(path.join(ENG, "ai-bridge", "lagBlame.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. A PROFILE WITH A KNOWN CALLER
 * --------------------------------------------------------------------------------------------------------- */
const { profile, hot } = await (async () => {
    const { getDevice } = await import(path.join(ENG, "tools/roundhouse/devices.mjs"));
    const dev = await getDevice("optics");
    // NAMED, not anonymous: the whole check is whether this name comes back out.
    async function theCallerWeAreLookingFor() { return dev.build({ mode: "airy" }); }
    const s = new inspector.Session(); s.connect();
    const post = (m, p) => new Promise((r, j) => s.post(m, p || {}, (e, x) => (e ? j(e) : r(x))));
    await post("Profiler.enable");
    await post("Profiler.setSamplingInterval", { interval: 1000 });
    await post("Profiler.start");
    await theCallerWeAreLookingFor();
    const { profile } = await post("Profiler.stop");
    s.disconnect();
    return { profile, hot: "theCallerWeAreLookingFor" };
})();

{
    const self = rankSelfTime(profile, 3);
    say(`self time: ${self.map((f) => f.selfMs + "ms " + f.name).join(" | ")}`);
    ok("!! self time still names the FUNCTION on the CPU",
       self.length > 0 && /diffraction/.test(self[0].where),
       `${self[0] && self[0].where}. Unchanged behaviour, checked because the new chain code shares the same profile object and a change there could have disturbed it.`);
}

{
    const chain = blameChain(profile);
    for (let i = 0; i < chain.length; i++) say("  ".repeat(i) + chain[i].name + "  " + chain[i].where.split(/[\\/]/).pop());
    ok("!! *** THE CHAIN NAMES THE CALLER THAT WAS PLANTED TO BE FOUND ***",
       chain.some((f) => f.name === hot),
       `"${hot}" appears in the path. *** THIS IS THE CHECK THAT MATTERS: a chain that merely returned SOMETHING would have looked identical in the log and told nobody anything. It is asserted against a caller named in advance, exactly as lagBlame's header demands of rankSelfTime. ***`);

    ok("...and it runs OUTERMOST FIRST, so the entry point reads at the top",
       chain.length > 2 && /root/.test(chain[0].name) && /diffraction/.test(chain[chain.length - 1].where),
       `root first, the hot leaf last. *** ORDER IS THE WHOLE USABILITY OF THIS: the answer somebody needs is "which of MY files started this", and that is the FIRST recognisable line rather than the last. Printed innermost-first it would read like a stack trace, where the useful line is buried at the bottom. ***`);

    ok("...and it reaches the leaf self time already named",
       chain[chain.length - 1] && /diffraction/.test(chain[chain.length - 1].where),
       "the chain ends where rankSelfTime begins, so the two halves describe the SAME stall rather than two different ones that happened to be sampled.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE DEBUG LOG'S ORDER AGREES WITH ITSELF IN THREE PLACES
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const prepends = /insertBefore\(_frag, els\.log\.firstChild\)/.test(src);
    const trimsEnd = /removeChild\(els\.log\.lastChild\)/.test(src);
    const reversed = /burst\.lines\.slice\(\)\.reverse\(\)/.test(src);
    say(`newest-first: prepends=${prepends} trims-from-end=${trimsEnd} reverses-within-burst=${reversed}`);
    ok("!! *** ALL THREE HALVES OF 'NEWEST FIRST' AGREE ***", prepends && trimsEnd && reversed,
       `*** TWO OF THE THREE WERE ALREADY RIGHT AND THAT IS WHY THE BUG SURVIVED: bursts were PREPENDED and the cap trimmed from the END, both deliberate and both commented -- but the lines INSIDE a burst were appended oldest-to-newest, so every batch read ASCENDING while the batches descended. HALF-CORRECT ORDERING LOOKS MORE BROKEN THAN NONE, because the eye finds the climbing run and stops there. Keith saw it and reasonably concluded the whole panel was upside down. ***`);

    ok("...and the CHAT log still appends at the bottom, which is correct for a chat",
       /log\.appendChild\(d\); log\.scrollTop=log\.scrollHeight/.test(src),
       "chatLog is a CONVERSATION and reads oldest-first; the debug stream is a FEED and reads newest-first. *** TWO PANELS, TWO CORRECT ANSWERS, AND MAKING THEM MATCH WOULD BREAK ONE OF THEM. *** Checked here so a later tidy-up that unified them has to argue with this line first.");

    // Source-level only, and said so rather than implied: no DOM runs in this sandbox.
    ok("REPORTED: this section reads the SOURCE and cannot watch the panel render", true,
       "*** NO DOM EXECUTES HERE, so what is proven is that the three mechanisms are present and consistent -- NOT that the panel looks right. The first glance is Keith's, and the thing to check is that timestamps now DESCEND within a burst as well as between bursts. ***");
}

console.log(fails ? "\nblameChain-selfcheck: " + fails + " FAILED" : "\nblameChain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
