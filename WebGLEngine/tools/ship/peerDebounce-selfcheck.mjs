// WebGLEngine/tools/ship/peerDebounce-selfcheck.mjs -- v3405
//
// *** ONE PEER ANNOUNCING ITSELF RE-INTERROGATED THE WHOLE FLEET, OVER AND OVER. ***
//
// Keith's boot log carries dozens of `[autoPull] peer connected (/net/introduce from 192.168.50.42) - running
// version check now`, and after EACH one a full `checking 13 peer(s)` ... `no newer peer` -- on a box whose event
// loop was already blocking for minutes at a time. He named the shape himself: duplicate backed-up work.
//
// THE EXISTING DEBOUNCE IS GLOBAL AND 15 SECONDS, WHICH IS THE WRONG GRANULARITY: it either blocks a genuinely
// new peer or admits a FULL THIRTEEN-PEER SWEEP. The right unit is the PEER.
//
// *** AND THE SKIP IS SAFE BECAUSE THE PEER SUPPLIES THE VERSION. *** The roster carries a fresh caps.version per
// peer, probed from /package/info moments earlier, so "this peer says the same version it said ninety seconds
// ago" is a fact READ FROM THE PEER rather than an assumption about it. This is not caching an answer; it is
// declining to re-ask a question whose input has not moved.
//
// UNKNOWN IS NOT UNCHANGED: a peer reporting NO version is NEVER skipped -- the one case where remembering would
// be guessing, and the peer most likely to be an old build worth pulling from.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeHas, noComments } from "./sourceScan.mjs";
const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// ---- 1. THE RULE, DRIVEN -- a re-implementation would be a second definition, so the SHAPE is asserted below
//         and the BEHAVIOUR is driven here on the same predicate the server uses.
{
    const RECHECK = 90000;
    const seen = new Map();
    const pick = (peers, now) => {
        const skip = [];
        const keep = peers.filter((p) => {
            const k = (p.caps && p.caps.id) || p.url;
            const v = (p.caps && p.caps.version) || null;
            if (!v) return true;
            const s = seen.get(k);
            if (!s || s.version !== v || (now - s.at) >= RECHECK) return true;
            skip.push(k); return false;
        });
        for (const p of keep) {
            const k = (p.caps && p.caps.id) || p.url, v = (p.caps && p.caps.version) || null;
            if (v) seen.set(k, { at: now, version: v });
        }
        return { keep: keep.length, skip: skip.length };
    };
    const P = [{ url: "a", caps: { id: "A", version: 3404 } },
               { url: "b", caps: { id: "B", version: 3401 } },
               { url: "c", caps: { id: "C" } }];                     // no version -> never skipped

    const first = pick(P, 0);
    ok("!! the first sweep checks everybody, because nothing has been seen yet",
        first.keep === 3 && first.skip === 0, JSON.stringify(first));

    const second = pick(P, 10000);
    say("ten seconds later: " + JSON.stringify(second));
    ok("!! *** a second announcement ten seconds later re-asks ONE peer instead of three ***",
        second.keep === 1 && second.skip === 2,
        "the one kept is the peer that reports NO version -- UNKNOWN IS NOT UNCHANGED, and it is the peer most " +
        "likely to be an old build worth pulling from");

    P[1].caps.version = 3405;
    const moved = pick(P, 20000);
    ok("!! *** and a peer whose version MOVED is checked immediately, window or no window ***",
        moved.keep === 2 && moved.skip === 1,
        JSON.stringify(moved) + " -- this is what makes the skip safe rather than a cache: the input to the " +
        "question is the peer's OWN reported version, so a change re-opens it at once");

    const later = pick(P, 120000);
    ok("...and after the window everybody is re-asked anyway",
        later.keep === 3 && later.skip === 0,
        "a peer that quietly rebuilt without its caps updating is still found within " + (RECHECK / 1000) + "s. " +
        "THE DEBOUNCE DELAYS WORK; IT NEVER CANCELS IT");
}

// ---- 2. THE SHIPPED CODE CARRIES THAT RULE, AND THE OLD GLOBAL DEBOUNCE IS STILL THERE ---------------------
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("the per-peer memory exists and is keyed on identity, not URL alone",
        codeHas(src, /_peerSeen/) && codeHas(src, /\(p\.caps && p\.caps\.id\) \|\| p\.url/),
        "one physical box answers on its LAN IP, its tunnel URL and every Hyper-V adapter -- keying on URL would " +
        "have made the debounce miss the very duplicates v2068 collapsed");
    ok("!! *** a peer with no reported version is never skipped ***",
        codeHas(src, /if \(!v\) return true;/),
        "UNKNOWN IS NOT UNCHANGED -- the rule this tree applies to statedKey, to plantKind and to every control " +
        "that cannot read its state");
    ok("...and the GLOBAL 15s debounce is kept beside it rather than replaced",
        codeHas(src, /_pullReqAt < 15000/),
        "they answer different questions: the global one stops a BURST of announcements stacking pulls, the " +
        "per-peer one stops each admitted pull from re-interrogating the fleet. Removing either would leave a " +
        "hole the other never covered");
    // *** AND THIS ONE FAILED BECAUSE I HUNTED A STRING THROUGH codeOnly(), WHICH BLANKS STRING LITERALS. ***
    // The tree's own rule, written down more than twenty times: codeOnly for an IDIOM, noComments for TEXT the
    // code CONTAINS. The log message is text.
    const text = noComments(src);
    ok("the log says how many of how many, and why the rest were skipped",
        /" of " \+ dedupPeers\.length/.test(text) && /unchanged in the last/.test(text),
        "a line reading `checking 13 peer(s)` after a change that checks one would be worse than no change at " +
        "all -- the reader would be measuring the wrong thing");
    // *** THE DOUBLE-RELEASE. The early return sits inside a try whose finally already calls done(); my first
    // version called done() there too. Caught by READING the block rather than by running it, which is the wrong
    // way round and is why it is asserted here.
    const early = (src.match(/nothing to ask\.[\s\S]{0,40}/) || [""])[0];
    ok("!! the early return does NOT release the run guard twice",
        !/done\(\)/.test(early),
        "the enclosing try has `finally { done(); }`. A second call would let two sweeps run at once, which is " +
        "the opposite of what this round is for");
}

// ---- 3. AND IT CHANGES NOTHING ABOUT WHAT A PULL DOES -----------------------------------------------------
{
    const src = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8"));
    ok("pullNewestPeer is still handed the peer list and still decides on its own",
        /pullNewestPeer\(toCheck\)/.test(src),
        "the debounce narrows WHO is asked and touches neither the comparison nor the pull. A round that also " +
        "changed the decision would have made the log unreadable as evidence for either change");
}

console.log(failed ? "\n[peerDebounce-selfcheck] FAILED " + failed : "\n[peerDebounce-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
