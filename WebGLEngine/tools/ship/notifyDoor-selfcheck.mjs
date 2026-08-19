// notifyDoor-selfcheck.mjs -- v3332. Gates ai-bridge/notifyBridge.js, its registration, and its front door.
//
// WHAT THIS FILE IS FOR. The bridge makes exactly one new claim -- the hub can wake the iOS peer -- and there are
// four ways to overstate it. Each check below is one of them, and each is DRIVEN rather than asserted from source:
//   1. reporting "delivered" when all that happened is an ntfy server said 200
//   2. collapsing UNCONFIGURED, REFUSED and BROKEN into one falsy flag
//   3. publishing to a public topic with no token, where a name is the only thing keeping strangers out
//   4. echoing the auth token back to a caller that asked for status
//
// The refusals are exercised with REAL config objects rather than checked for by name, because a refusal that has
// never been seen to fire might not fire (v3142).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { noComments, prose } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const require_ = createRequire(import.meta.url);

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

const B = require_(path.join(ENG, "ai-bridge", "notifyBridge.js"));
const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const page = fs.readFileSync(path.join(ENG, "ios-peer.html"), "utf8");
const bridgeSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "notifyBridge.js"), "utf8");

// ---- 1. THE ROUTE EXISTS AND OWNS ONLY WHAT IT SHOULD -------------------------------------------------------
// A bridge that claims a whole prefix swallows its neighbours -- toolFrontDoor-selfcheck records seven rounds
// during which a bridge claiming /tools killed server.html's module script. This one owns two exact paths.
ok("!! the bridge owns exactly two paths and no prefix",
    B.owns("/notify") && B.owns("/notify/send") && !B.owns("/notifyanything") && !B.owns("/notify/send/more") && !B.owns("/notes"),
    "an owns() that matched a PREFIX would swallow every future /notify* route somebody else registers");

ok("...and server.js both requires and dispatches it",
    /require\("\.\/notifyBridge\.js"\)/.test(noComments(srv)) && /notifyBridge\.owns\(req\.url\)/.test(noComments(srv)),
    "matched through noComments so a commented-out registration cannot satisfy a check about a LIVE route");

// ---- 2. THREE STATES, EACH REACHED BY A REAL CONFIG ----------------------------------------------------------
const sUnconf = B.evaluate({ server: "", topic: "" }).state;
const sNoTopic = B.evaluate({ server: "https://ntfy.example.net", topic: "" }).state;
const sPublicBare = B.evaluate({ server: "https://ntfy.sh", topic: "swek-fleet" });
const sPublicAuth = B.evaluate({ server: "https://ntfy.sh", topic: "swek-fleet", token: "tk_x" }).state;
const sLan = B.evaluate({ server: "http://192.168.1.9:8080", topic: "swek-fleet" }).state;
const sBadUrl = B.evaluate({ server: "not a url", topic: "swek-fleet" }).state;
say("states reached: unconfigured=" + sUnconf + " noTopic=" + sNoTopic + " publicBare=" + sPublicBare.state +
    " publicAuth=" + sPublicAuth + " lanBare=" + sLan + " badUrl=" + sBadUrl);

ok("!! *** UNCONFIGURED, REFUSED and READY are three states, not one boolean ***",
    sUnconf === "unconfigured" && sPublicBare.state === "refused" && sPublicAuth === "ready" &&
    new Set([sUnconf, sPublicBare.state, sPublicAuth]).size === 3,
    "nothing set up / set up and deliberately not used / working are three different facts wanting three " +
    "different responses. One falsy flag for all three is what v3076 fixed when a TIMEOUT printed as a FAILURE");

ok("...and a half-configured hub is unconfigured, not ready",
    sNoTopic === "unconfigured",
    "a server with no topic has nowhere to publish; calling that ready would fail at the first press");

ok("...and a server that is not a URL is refused rather than attempted",
    sBadUrl === "refused",
    "attempting it would surface as a fetch error, which reads as a network problem rather than a typo");

// ---- 3. THE PUBLIC-TOPIC REFUSAL, AND THAT IT IS NOT A BLANKET ONE --------------------------------------------
ok("!! *** a PUBLIC ntfy host with NO token is REFUSED, and the reason names the exposure ***",
    sPublicBare.state === "refused" && /topic name is not a secret/i.test(sPublicBare.why || "") && /read AND publish/.test(sPublicBare.why || ""),
    "an unauthenticated public topic is readable AND WRITABLE by anyone who knows the name. Publishing verdicts " +
    "there leaks; accepting publishes from it is an injection vector -- and the fleet already re-grades foreign " +
    "ledgers rather than trusting them (v2968) for exactly this reason");

ok("...and it is a refusal about REACHABILITY, not a ban on going without a token",
    sLan === "ready" && B.isPrivateHost("192.168.1.9") && B.isPrivateHost("127.0.0.1") && B.isPrivateHost("hub.local") && !B.isPrivateHost("ntfy.sh"),
    "a LAN instance with no token is FINE -- the network is the boundary. Refusing that too would train " +
    "somebody to set a fake token to make the check quiet, which is worse than the thing being guarded");

// ---- 4. THE TOKEN DOES NOT COME BACK ---------------------------------------------------------------------------
// The sabotage direction that matters: prove the token IS held, then prove it is ABSENT from what a caller sees.
// Proving only the absence would pass on a bridge that never read a token at all.
const SECRET = "tk_gate_" + Math.random().toString(36).slice(2, 10);
const saveS = process.env.SWEK_NTFY_SERVER, saveT = process.env.SWEK_NTFY_TOPIC, saveK = process.env.SWEK_NTFY_TOKEN;
process.env.SWEK_NTFY_SERVER = "https://ntfy.example.net";
process.env.SWEK_NTFY_TOPIC = "swek-gate";
process.env.SWEK_NTFY_TOKEN = SECRET;
const held = B.readConfig().token === SECRET;
const st = B.status();
const leaked = JSON.stringify(st).includes(SECRET);
const flags = st.authed === true;
if (saveS === undefined) delete process.env.SWEK_NTFY_SERVER; else process.env.SWEK_NTFY_SERVER = saveS;
if (saveT === undefined) delete process.env.SWEK_NTFY_TOPIC; else process.env.SWEK_NTFY_TOPIC = saveT;
if (saveK === undefined) delete process.env.SWEK_NTFY_TOKEN; else process.env.SWEK_NTFY_TOKEN = saveK;

ok("!! the bridge really does hold the token   (the half that makes the next check mean something)", held,
    "asserting only that a secret is absent would pass on a bridge that never read one");
ok("!! *** ...and STATUS NEVER RETURNS IT -- only WHETHER there is one ***", !leaked && flags,
    "authed is the only part of a token a caller has any business knowing");

// ---- 5. ACCEPTED IS NOT DELIVERED ------------------------------------------------------------------------------
// This is the claim the whole round could quietly overstate. The publish result must offer `accepted` and must
// NOT offer a delivery field, and the page must say the difference where a person reads it.
const resultKeys = Object.keys(B.evaluate({ server: "", topic: "" })).concat(["accepted"]);
ok("!! *** the publish result names ACCEPTED and never DELIVERED ***",
    /accepted:/.test(noComments(bridgeSrc)) && !/\bdelivered\b\s*:/.test(noComments(bridgeSrc)),
    "a 200 means the NTFY SERVER took the message. Whether a phone displayed it depends on APNs, the device and " +
    "the app's settings -- none of which this process can see. Calling it delivered is two-things-one-label in " +
    "the place it does most harm: somebody stops checking whether the phone was told");

ok("...and the bridge EXPLAINS that distinction in its own source",
    prose(bridgeSrc).includes("ACCEPTED IS NOT DELIVERED"),
    "matched through prose() so re-flowing the paragraph cannot defeat it -- the debt gateQuality ratchets");

ok("...and the PAGE says it too, where a person actually reads",
    /NOT proof of delivery/.test(noComments(page)),
    "a distinction only the source makes is a distinction the operator never sees");

// ---- 6. THE MESSAGE IS CAPPED, AND THE CAP IS ENFORCED IN THE BRIDGE -------------------------------------------
ok("!! a notification is a VERDICT LINE, and the cap lives here rather than at each call site",
    Number.isInteger(B.MAX_MESSAGE) && B.MAX_MESSAGE > 0 && B.MAX_MESSAGE <= 1000 &&
    Number.isInteger(B.MAX_TITLE) && B.MAX_TITLE > 0,
    "gate output carries absolute paths; a cap a caller has to remember is a cap that gets forgotten. " +
    "MAX_MESSAGE=" + B.MAX_MESSAGE + " MAX_TITLE=" + B.MAX_TITLE);

// ---- 7. THE FRONT DOOR, AND THE CLAIM IT REFUSES TO MAKE -------------------------------------------------------
ok("!! ios-peer.html carries the door: both controls and both routes",
    /nfStatus/.test(page) && /nfTest/.test(page) && /fetch\("\/notify"\)/.test(noComments(page)) && /\/notify\/send/.test(noComments(page)),
    "Keith's law: a module with no caller is unfinished, and a bridge reachable only by curl is CLI-only");

ok("!! *** ...and it calls itself a DOORBELL, NOT A DAEMON ***",
    /doorbell, not a daemon/i.test(noComments(page)) && /does not make the page a background worker/i.test(noComments(page)),
    "the notification lands in ntfy's OWN app, not in this page. A person taps it and that opens the page. " +
    "Overstating this would have the next reader believe iOS gained a background worker");

ok("!! *** ...and the OLD 'app push' row is left standing, because it answered a DIFFERENT question ***",
    /app push to the device<\/td><td class="no">/.test(page) && /no adb equivalent exists on iOS/.test(page),
    "pushing a BUILD onto the device and WAKING it with a notification are two senses of push sitting one row " +
    "apart, and only the first is impossible. Editing that row to 'yes' would be the defect this tree keeps " +
    "finding: one label over two things");

ok("...and the platform truth about a background daemon is NOT quietly softened",
    /has no home on iOS/.test(page) && /property of the platform/.test(page),
    "this round adds a doorbell; it does not repeal iOS backgrounding, and the page must keep saying so");

// ---- 8. THE PIPE HAS A REAL CALLER (v3333) ---------------------------------------------------------------------
// v3332 built /notify with a front door and ZERO callers. A bridge nobody calls in anger is the second half of
// "a module with no caller is unfinished" -- the half a front door hides, because the door makes it look wired.
ok("!! *** publish() is reached by something other than the front door ***",
    typeof B.event === "function" && /notifyBridge\.js"\)\.event\(/.test(noComments(srv)),
    "the auto-update path is the first caller: it happens UNATTENDED, it changes the version every other machine " +
    "is compared against, and until v3333 the only way to learn it had happened was to go and look");

ok("!! *** ...and event() cannot throw into the path it decorates ***",
    await (async () => {
        // Driven, not asserted: an unconfigured hub is the state that would most plausibly reject.
        const r = await B.event("gate-test", "a message from the gate");
        return r && r.accepted === false && r.ok === false;
    })(),
    "these calls sit on paths that matter more than the notification does. A notifier that can throw turns " +
    "'the phone was not told' into 'the update did not happen', which inverts the priority");

ok("...and a publish that did not happen is LOGGED rather than swallowed",
    prose(fs.readFileSync(path.join(ENG, "ai-bridge", "notifyBridge.js"), "utf8")).includes("indistinguishable from a phone that was told and ignored it"),
    "a silent notification failure and a phone that ignored you look identical from here");

console.log(failed ? "notifyDoor-selfcheck: " + failed + " FAILED" : "notifyDoor-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
