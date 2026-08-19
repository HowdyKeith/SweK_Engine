// tools/roundhouse/join-selfcheck.mjs
//
// v2954 -- THE JOIN PAGE: THE LIGHTHOUSE URL IS THE ONE THING A REMOTE PEER CANNOT BE EXPECTED TO KNOW.
//
// v2953 gave a peer behind NAT a way into the fleet, but the command still needed the tunnel URL as an argument
// -- and a person who has just been handed a link is exactly the person least likely to know what to type. They
// do, however, have the URL: it is in their address bar, because that is how they got here.
//
// So the page fills it in. location.origin IS the lighthouse address, whether that is a Cloudflare tunnel or a
// LAN address, so the rendered command is correct for whoever is reading it without anyone configuring anything.

import fs from "node:fs";
import { prose } from "../ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const page = fs.readFileSync(path.join(root, "join.html"), "utf8");

// ---- 1. THE COMMAND IS BUILT FROM THE VISITOR'S OWN ORIGIN --------------------------------------------------------------
{
    ok("!! the check-in command is rendered from location.origin, not hardcoded",
        /location\.origin/.test(page) && /lighthouse_checkin\.mjs " \+ origin/.test(page),
        "whoever opens this page sees the address THEY reached it by -- tunnel or LAN -- already in the command. " +
        "A hardcoded URL would be wrong for every reader who arrived a different way, and asking a first-time " +
        "peer to supply it themselves asks the one thing they are least equipped to know");

    ok("trailing slashes are stripped so the URL never doubles up",
        /location\.origin\.replace\(\/\\\/\+\$\/, ""\)/.test(page),
        "https://host/ + /lighthouse/checkin would produce a double slash; the peer script strips too, but the " +
        "page should not hand out a command that needs forgiving");
}

// ---- 2. IT ASKS FOR NOTHING THE VISITOR CANNOT PROVIDE --------------------------------------------------------------------
{
    // NOTE (v2954): the first version matched the bare words "open a port", which the page contains inside its
    // own DISCLAIMER -- "nothing here needs you to know an IP, open a port, or configure a router". It failed the
    // page for saying the right thing. That is the fifth text-matching check this session to match documentation
    // rather than behaviour, so it now matches IMPERATIVE phrasing only: an instruction, not a reassurance.
    const asks = /you must (open|forward)|forward (a )?port|set up port|configure your router to|assign a static/i.test(page);
    ok("!! the page requires no port forwarding, no router config, no fixed address",
        !asks && /behind NAT/.test(page),
        "the entire reason for the push direction is that a remote peer can do none of those things. A join page " +
        "that asked for them would be re-introducing the problem the lighthouse exists to solve");

    ok("Node is named as the only prerequisite",
        /nodejs\.org/.test(page) && /nothing else/.test(page),
        "one dependency, stated plainly, with a link -- the peer is a person who has not done this before");
}

// ---- 3. IT SETS THE RIGHT EXPECTATION ABOUT DISAGREEMENT ------------------------------------------------------------------
{
    ok("!! a differing hash is framed as the interesting result, not a failure",
        /interesting result, not a failure/.test(page) && /whole reason a fleet exists/.test(page),
        "a first-time peer whose hash differs must not think they broke something. Cross-machine disagreement is " +
        "the measurement -- the same framing the frozen registrations use: a red result is a finding");
}

// ---- 4. THE PEER SCRIPT IT POINTS AT ACTUALLY SHIPS -------------------------------------------------------------------------
{
    const script = path.join(root, "tools", "roundhouse", "lighthouse_checkin.mjs");
    ok("!! lighthouse_checkin.mjs is present in the build the page tells them to download",
        fs.existsSync(script),
        "the page instructs a peer to run a file inside the zip; if that file only existed on the hub, every " +
        "remote peer would follow the instructions and hit a missing module");

    const src = fs.readFileSync(script, "utf8");
    // v3005 -- THIS CHECK WAS PINNED TO AN IMPLEMENTATION AND THE IMPLEMENTATION GOT BETTER. It required the
    // literal `process.argv[2] || null` -- a SINGLE remembered URL -- and the script now takes argv.slice(2), an
    // ORDERED LIST of candidates with anything supplied now moving to the front. So it went red for having
    // outgrown the expression, exactly as labDevices went red for `=== 24` when a device was added.
    //
    // THE BEHAVIOUR IS WHAT MATTERS, so that is what is asserted now: persistence exists, a bare run does not
    // require an argument, supplying one updates the memo, and knowing nothing refuses with the command rather
    // than failing obscurely. All four survive a refactor; the old regex survived nothing.
    ok("...and it remembers the URL, so only the first run needs the argument",
        /\.swek-lighthouse/.test(src) && /readMemo\(\)/.test(src) && /writeMemo\(/.test(src),
        "the page's command supplies the URL once; afterwards a scheduled task can call it bare. A peer should " +
        "not have to paste a URL into cron");
    ok("!! a bare run falls back to the memo rather than demanding an argument",
        /\[\.\.\.given,\s*\.\.\.readMemo\(\)\]/.test(src),
        "candidates = anything supplied now, THEN what was remembered -- so cron calls it with no arguments and a " +
        "fresh tunnel URL still overrides on the next manual run");
    ok("...and supplying one UPDATES the memo, so a rotated tunnel is learned",
        /if \(given\.length\) writeMemo/.test(src),
        "quick tunnels rotate; a memo that could only ever be written once would strand the peer on a dead URL");
    ok("!! knowing no URL at all REFUSES with the command, rather than failing obscurely",
        /no lighthouse URL known/.test(src) && /process\.exit\(2\)/.test(src),
        "the reader is a person who has not done this before -- an empty failure here is the one they cannot debug");
}

console.log();
if (fails) { console.log("join-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("join-selfcheck: all checks pass");
