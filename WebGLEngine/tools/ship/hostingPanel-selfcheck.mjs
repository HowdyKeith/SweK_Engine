// tools/ship/hostingPanel-selfcheck.mjs -- v3741
//
// Two defects Keith reported from the rig, and both are the same shape: A CONTROL THAT CANNOT DO WHAT IT
// OFFERS, and A LABEL THAT TWO PLACES BOTH CLAIM TO OWN.
//
// (1) *** "on the mac, install cloudflare is not working" -- AND IT COULD NOT. hostingBridge.install() opened
// with `if (!WIN) return { ok:false, error:"winget install is Windows-only" }`, so on macOS it refused BY
// CONSTRUCTION, while server.html rendered the "Install cloudflared" button whenever the tool was missing,
// without asking what OS it was on. A BUTTON OFFERED ON A PLATFORM WHERE THE FUNCTION REFUSES BY DESIGN IS
// NOT A BROKEN FEATURE, IT IS A FEATURE THAT WAS NEVER THERE -- and the refusal text never reached the panel,
// so it read as a failure rather than as a boundary. v3741 gives macOS a real Homebrew branch. ***
// AND THE SECOND-ORDER BUG WAS ALREADY WAITING: `brew` itself is at /opt/homebrew/bin, which a nohup-launched
// server does not have on PATH -- THE EXACT BUG v2856 FIXED FOR cloudflared, one call deeper. resolveBin is
// REUSED rather than re-spelled, and an absent brew is refused BY NAME.
//
// (2) *** THE TUNNELS DRAWER RENAMED ITSELF ON LOAD. The markup says "Tunnels, Clouds, & Hosting"; the
// rotation painter rewrote the whole summary to "Tunnels". Two declarations about one label, and the one that
// ran LAST won. IT ALSO DESTROYED #tchCounts, a sibling span inside that summary written by the
// partial-transfer poll at the other end of the file -- an innerHTML rewrite deleting a node another poll had
// just filled, which is a RACE nobody would ever attribute to a label. ***
// THE FIX IS A SEPARATION OF OWNERS, not a corrected string: the NAME is markup, the COUNTS are the poll's,
// the ROTATION SUFFIX has its own span. None can overwrite another, and RENAMING THE DRAWER AGAIN NEEDS NO
// CODE CHANGE -- the painter no longer knows the drawer's name.
//
// WHEN A CHECK HERE GOES RED: restore the separation. Do NOT fix it by teaching the painter the new name.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments, codeHas } from "./sourceScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sv = readFileSync(path.join(ROOT, "server.html"), "utf8");
const hb = readFileSync(path.join(ROOT, "ai-bridge", "hostingBridge.js"), "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// ---- 1. THE LABEL HAS ONE OWNER --------------------------------------------------------------------------
console.log("1. THE TUNNELS DRAWER OWNS ITS OWN NAME");
ok("!! the summary markup carries the full drawer name",
    /id="tunnelSummary"[^>]*>[^<]*Tunnels, Clouds, &amp; Hosting/.test(sv),
    "the name the rest of the page uses for it -- server.html says 'Moved to the Tunnels, Clouds, & Hosting drawer'");

// *** SCOPED TO THE PAINTER, NOT THE PAGE -- MY FIRST VERSION WAS PAGE-WIDE AND WENT RED ON A PRE-EXISTING,
// ENTIRELY LEGITIMATE `summary.innerHTML =` BELONGING TO THE PAGE-TEST PANEL, WHICH IS A DIFFERENT <summary>
// ENTIRELY. That is v3695's lesson arriving in a gate written the same day it was quoted: a check that
// forbids an idiom ANYWHERE indicts every innocent use of it. The property is about THIS drawer. ***
ok("!! *** NOTHING IN THE TREE HOLDS A WRITEABLE HANDLE TO tunnelSummary ***",
    !/getElementById\("tunnelSummary"\)/.test(sv),
    "the painter writes #tunnelRot instead, and its handle to the whole summary was DELETED rather than left " +
    "unused -- a live reference is an invitation to write through it again, which is how the drawer came to " +
    "rename itself and eat its own counts span. A whole-summary rewrite takes the NAME and the COUNTS with it, " +
    "and only the rotation suffix was ever the painter's to own");

ok("!! the rotation suffix has its own span, and the painter writes THAT",
    /id="tunnelRot"/.test(sv) && /getElementById\("tunnelRot"\)/.test(sv) && /rot\.innerHTML\s*=/.test(sv),
    "name = markup, counts = the partial-transfer poll, rotation = the painter. Three owners, three nodes");

ok("!! #tchCounts still lives inside the summary and still has its writer",
    /id="tunnelSummary"[\s\S]{0,400}?id="tchCounts"/.test(sv) && /getElementById\("tchCounts"\)/.test(sv),
    "the span the rewrite used to delete -- asserted present AND written, because either alone would pass while " +
    "the feature stayed broken");

// ---- 2. THE INSTALL BUTTON AND THE FUNCTION AGREE ABOUT PLATFORMS ----------------------------------------
console.log("\n2. THE INSTALLER OFFERS WHAT IT CAN ACTUALLY DO");
ok("!! install() has a macOS branch, so the Mac button is no longer offering a refusal",
    /const MAC = process\.platform === "darwin"/.test(hb) && /!WIN && !MAC/.test(hb) && /BREW\s*=/.test(hb),
    "it opened with `if (!WIN) return { ok:false, ... winget install is Windows-only }` while server.html " +
    "rendered the button on every OS");

ok("!! *** the macOS branch resolves `brew` THROUGH resolveBin, not as a bare word ***",
    /resolveBin\("brew"\)/.test(hb),
    "brew lives in /opt/homebrew/bin, which a nohup-launched server does NOT have on PATH -- the same bug " +
    "v2856 fixed for cloudflared. The fix is REUSED, not re-spelled");

// *** MATCHED THROUGH noComments(), NOT AGAINST RAW SOURCE. My first version tested the message text against
// the file directly and gateQuality caught it IMMEDIATELY as a NEW prose-matching offender, pushing that debt
// from 40 to 41 -- a ceiling these notes say MAY ONLY SHRINK. The message is a STRING LITERAL, which is
// exactly what noComments() is for, and the debt exists because a check that matches raw source cannot tell a
// live message from the same words sitting in a comment above it. ONE ROUND, TWO GATES, AND THE OLDER ONE WAS
// RIGHT. ***
ok("!! ...and an absent brew is refused BY NAME rather than spawned and left to ENOENT",
    /Homebrew not found by this server/.test(noComments(hb)) && codeHas(hb, /brew[.]startsWith[(]/),
    "resolveBin returns the BARE NAME when it cannot do better, so the caller must test for an absolute path -- " +
    "spawning the bare word would report a generic spawn error for a knowable condition");

ok("the brew install cannot sit waiting for input nobody can give",
    /NONINTERACTIVE/.test(hb) && /HOMEBREW_NO_AUTO_UPDATE/.test(hb),
    "the panel has no stdin, and a brew prompt would look exactly like a hang");

report("WHAT THIS DOES NOT CLAIM",
    "That the Mac install WORKS. There is no macOS and no Homebrew in this sandbox -- install() was driven " +
    "here and returned the LINUX refusal, which is the only arm this machine can reach. What is established " +
    "is the SHAPE: the platform branch exists, brew is resolved the way cloudflared already was, and an " +
    "absent brew is named. THAT IT SUCCEEDS ON KEITH'S MAC IS HIS RUN, not this gate's.");

console.log("\nhostingPanel-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
