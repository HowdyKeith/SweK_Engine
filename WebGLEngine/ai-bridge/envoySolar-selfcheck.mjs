// WebGLEngine/ai-bridge/envoySolar-selfcheck.mjs -- v4063
//
// Gates ai-bridge/envoySolar.js -- reading solar + battery straight off the Enphase IQ Gateway,
// with no Home Assistant in the path.
//
// *** WHAT THIS GATE IS REALLY FOR: production.json's storage[] IS A DIFFERENT PRODUCT'S SLOT, AND
// TRUSTING IT PRODUCES A CONFIDENT WRONG NUMBER RATHER THAN A MISSING ONE. *** Essentially every
// "read your Envoy over the LAN" recipe reaches for `production.json -> storage[0] -> percentFull`.
// On a system with IQ Batteries (Encharge / IQ 5P) that array reports percentFull: 0, activeCount: 0,
// state "idle" permanently -- the battery is fine, the slot is legacy AC Battery. A reader that
// trusts it shows 0% on a full battery. THAT IS THE FAILURE THIS FILE EXISTS TO PIN: not "does it
// parse" but "when two sources disagree, does the right one win, and does it SAY which one won".
//
// The fixtures below are shaped from the documented response schemas, NOT captured from Keith's
// gateway -- this sandbox has no LAN and no Envoy. So the cascade, the labelling, the units and the
// degradation contract are gated here; whether the real gateway returns these shapes is the
// rig-side step, and section 6 states that limit rather than letting a green run imply it.
"use strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const envoy = require_("./envoySolar.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("envoySolar-selfcheck -- the gateway read directly, and the legacy-battery trap refused\n");

// ---- fixtures, in the gateway's documented shapes ---------------------------------------------
const SECCTRL = { ENC_agg_soc: 62, ENC_agg_avail_energy: 8100, ENC_agg_backup_energy: 4050 };
const INVENTORY = [{ type: "ENCHARGE", devices: [{ percentFull: 70 }, { percentFull: 60 }] }];
// The trap, verbatim: an IQ-Battery system's production.json still carries a legacy ACB block, and
// it reads as a flat, idle, entirely believable zero.
const PROD_LEGACY_ZEROS = {
    production: [{ measurementType: "production", activeCount: 12, wNow: 3410.5, whToday: 18220, whLifetime: 9100400 }],
    consumption: [{ measurementType: "total-consumption", wNow: 900.2 }, { measurementType: "net-consumption", wNow: -2510.3 }],
    storage: [{ percentFull: 0, activeCount: 0, state: "idle", wNow: 0 }],
};
const PROD_REAL_ACB = { ...PROD_LEGACY_ZEROS, storage: [{ percentFull: 44, activeCount: 2, state: "discharging" }] };

console.log("1. *** THE TRAP: A LEGACY ZERO MUST NEVER OUTRANK A LIVE BATTERY ***");
{
    const b = envoy.batteryFrom(SECCTRL, INVENTORY, PROD_LEGACY_ZEROS);
    ok("!! with all three present, the aggregate secctrl SoC wins -- not the legacy zero sitting beside it",
        b.soc === 62 && b.source === "ensemble/secctrl",
        "soc=" + b.soc + " from " + b.source + " (the storage[] block in the same payload says 0% and is IGNORED)");
    ok("!! ...and the answer NAMES its source, so a reader can tell a real 0% from a wrong-slot 0%",
        typeof b.source === "string" && b.source.length > 0 && b.source !== "none",
        "a cascade that fell through silently would put the trap back one layer up: the panel would show " +
        "a confident number with nothing saying where it came from");
}

console.log("\n2. THE CASCADE, EACH RUNG PROVEN BY REMOVING THE ONE ABOVE IT");
{
    const noSec = envoy.batteryFrom(null, INVENTORY, PROD_LEGACY_ZEROS);
    ok("!! with secctrl absent, per-battery inventory answers -- averaged, not summed",
        noSec.soc === 65 && noSec.source === "ensemble/inventory",
        "mean(70,60) = " + noSec.soc + "% across " + noSec.detail.batteries + " batteries; a SUM would read 130%");
    const noEnsemble = envoy.batteryFrom(null, null, PROD_REAL_ACB);
    ok("!! with BOTH ensemble endpoints absent, a LIVE legacy ACB (activeCount>0) is finally used",
        noEnsemble.soc === 44 && /legacy/.test(noEnsemble.source),
        "soc=" + noEnsemble.soc + " from " + noEnsemble.source + " -- correct for an actual AC Battery system");
    const nothing = envoy.batteryFrom(null, null, PROD_LEGACY_ZEROS);
    ok("!! *** AND WITH NOTHING CREDIBLE, THE ANSWER IS null -- NOT ZERO ***",
        nothing.soc === null && nothing.source === "none",
        "soc=" + nothing.soc + ". THIS IS THE WHOLE POINT: absent and empty are different facts, and " +
        "serving 0 for 'I could not tell' is the confident-wrong-number failure. detail flags the idle " +
        "legacy block it declined to trust: " + JSON.stringify(nothing.detail));
}

console.log("\n3. UNITS AND ROLES -- THE haSolar CONTRACT, SO EITHER SOURCE DROPS INTO THE SAME PANEL");
{
    const ha = fs.readFileSync(path.join(HERE, "haSolar.js"), "utf8");
    const src = fs.readFileSync(path.join(HERE, "envoySolar.js"), "utf8");
    const roles = ["power", "energyToday", "grid", "battery"];
    ok("!! both modules expose the SAME four roles, so GET /ha/solar's consumers cannot tell them apart",
        roles.every((r) => new RegExp("\\b" + r + ":").test(ha)) && roles.every((r) => new RegExp("\\b" + r + ":").test(src)),
        roles.join(", ") + " -- the Pip panel and window.solar read roles.*, not the raw entity ids");
    const shape = ["available", "stale", "lastOkMs", "values", "roles"];
    ok("...and the same envelope fields", shape.every((k) => new RegExp("\\b" + k + ":").test(src)), shape.join(", "));
    ok("!! every module export is reachable", ["start", "stop", "latest", "poll", "getConfig", "setConfig", "discover", "resolveHost", "batteryFrom", "MDNS_TYPE"]
        .every((k) => envoy[k] !== undefined), "start, stop, latest, poll, getConfig, setConfig, discover, resolveHost, batteryFrom, MDNS_TYPE");
}

console.log("\n4. THE TOKEN IS A HOUSE CREDENTIAL AND IS TREATED LIKE ONE");
{
    const src = fs.readFileSync(path.join(HERE, "envoySolar.js"), "utf8");
    const cfg = envoy.getConfig();
    ok("!! *** getConfig() REPORTS WHETHER A TOKEN EXISTS AND NEVER WHAT IT IS ***",
        !("token" in cfg) && !("ENVOY_TOKEN" in cfg) && typeof cfg.hasToken === "boolean",
        "keys: " + Object.keys(cfg).join(", ") + " -- a config endpoint that echoed the bearer is how it " +
        "reaches a screenshot; the panel only ever needs to know whether one is set");
    // *** BOTH CHECKS BELOW WERE WRITTEN WRONG FIRST, IN THE SHAPE THIS TREE ALREADY HAS A NAME FOR.
    // v4063's first draft matched /NODE_TLS_REJECT_UNAUTHORIZED/ and /log\(...token/ against RAW
    // source -- and reddened on a COMMENT explaining why the env var is not used, and on a help
    // string whose prose contains the word "token". That is commentFalsePass exactly: asserting a
    // code idiom against text that is not code. The fix is the tree's own codeOnly() for the comment
    // half, and for the credential half a test that targets INTERPOLATION rather than the word --
    // because "no log may mention tokens" would forbid the help message that tells Keith where to
    // get one, which is the opposite of what this check is for. ***
    const code = codeOnly(src);
    ok("...and the credential is never interpolated into a log line",
        !/\$\{\s*(?:c\.)?(?:ENVOY_)?[Tt]oken\s*\}/.test(code) &&
        !/\blog\(\s*(?:c\.)?(?:ENVOY_)?[Tt]oken\b/.test(code) &&
        !/\blog\([^)]*[+,]\s*(?:c\.)?(?:ENVOY_)?[Tt]oken\s*[,)]/.test(code),
        "the VALUE never reaches a log call. The word may -- the disabled-path message names the token " +
        "and links where to get one, and forbidding that would be checking the wrong thing");
    ok("!! the config file is written 0600 -- owner-only",
        /mode:\s*0o600/.test(code), "a bearer credential at default 0644 is readable by every account on the box");
    ok("!! TLS verification is disabled PER REQUEST, never process-wide",
        /rejectUnauthorized:\s*false/.test(code) && !/NODE_TLS_REJECT_UNAUTHORIZED/.test(code),
        "asserted against codeOnly(), so the comment ARGUING for this rule cannot satisfy or break it. " +
        "A self-signed cert on your own gateway is unavoidable; the env var would silently disable " +
        "verification for EVERY other outbound call the bridge makes");
}

console.log("\n5. DISCOVERY -- ONE mDNS BROWSER, AND THE TWO FILES AGREE ON THE SERVICE NAME");
{
    const mdnsSrc = fs.readFileSync(path.join(HERE, "mdnsDiscovery.js"), "utf8");
    ok("!! mdnsDiscovery.js browses the type envoySolar.js asks for -- ASSERTED, not left to a comment",
        new RegExp('type:\\s*"' + envoy.MDNS_TYPE + '"').test(mdnsSrc),
        'MDNS_TYPE = "' + envoy.MDNS_TYPE + '" and mdnsDiscovery.js TYPES carries it. If either side is ' +
        "renamed alone, discovery silently returns nothing forever -- the failure looks like 'no gateway ' +\n" +
        "      on this LAN' rather than like a typo");
    const src = fs.readFileSync(path.join(HERE, "envoySolar.js"), "utf8");
    ok("!! discover() REUSES the existing browser rather than opening a second multicast socket",
        /require\(["']\.\/mdnsDiscovery\.js["']\)/.test(src) && !/dgram/.test(src),
        "no dgram in this file. Two browsers on 224.0.0.251:5353 is the shape behind the 'UDP multicast " +
        "panics on Bun/Windows' notes the camera and Roku discoverers already carry");
    ok("!! a configured IP always beats a discovered one",
        /if \(ip\) return \{ host: ip, source: "configured" \}/.test(src),
        "the person typing an address can see the router; a stale mDNS cache cannot");
    const r = envoy.resolveHost();
    ok("...and with nothing configured and nothing discovered, it degrades to the published name",
        r.host === "envoy.local" && r.source === "mdns-name",
        "host=" + r.host + " source=" + r.source + " -- and the SOURCE travels with it, because a host " +
        "somebody typed and a host we guessed fail differently and deserve different advice");
}

console.log("\n6. THE WIRING -- OPT-IN, AND DEFAULTED TO EXACTLY THE OLD BEHAVIOUR");
{
    // *** codeOnly() IS DELIBERATELY NOT USED ON server.js, AND THE REASON IS MEASURED. *** Its lexer
    // desyncs on a regex literal containing a quote -- a limit claimCheck.mjs's header already names
    // by name -- and server.js is 1.45 MB dense with exactly those. Measured at v4063: codeOnly()
    // returns 963,836 of 1,454,895 characters, EATING A THIRD OF THE FILE, and the require() line
    // this section asserts is inside the eaten third. A check run through it would have reported a
    // missing wire that is plainly there. So these match RAW source, and are written as FULL
    // STATEMENTS (`const x = require(...)`, not a bare mention) so a comment cannot satisfy them --
    // the same defect commentFalsePass names, avoided from the other side.
    const srv = fs.readFileSync(path.join(HERE, "server.js"), "utf8");
    ok("!! server.js requires the module -- an unwired reader is a second declaration nobody runs",
        /const\s+envoySolar\s*=\s*require\(["']\.\/envoySolar\.js["']\)/.test(srv),
        "the shape conservationReach caught at v3994: a module that exists, gates green, and is reached " +
        "by nothing");
    ok("!! *** THE DEFAULT IS UNCHANGED: with SOLAR_SOURCE unset the source is HA, exactly as before ***",
        /const\s+SOLAR_SOURCE\s*=\s*\(process\.env\.SOLAR_SOURCE\s*\|\|\s*["']ha["']\)/.test(srv),
        "a box already reading solar through Home Assistant must not change behaviour because a new " +
        "file landed beside it. Switching is a deliberate act: SOLAR_SOURCE=envoy");
    ok("!! ...and .start() is gated on that choice, so the direct poller does not run uninvited",
        /if\s*\(SOLAR_SOURCE === ["']envoy["']\)[^\n]*envoySolar\.start\(\)/.test(srv),
        "no LAN traffic to a gateway nobody asked us to poll");
    ok("!! ONE resolver decides which source answers, rather than each call site picking",
        /function _solar\(\)\s*\{\s*return/.test(srv) && /JSON\.stringify\(_solar\(\)\.latest\(\)\)/.test(srv),
        "two call sites each choosing is how a panel ends up showing HA's stale copy beside the " +
        "gateway's live one");
}

console.log("\n7. GRACEFUL DEGRADATION, AND THE LIMIT OF THIS GATE");
{
    const l = envoy.latest();
    ok("!! with no token and no gateway, latest() reports unavailable rather than throwing",
        l.available === false && l.stale === true && typeof l.values === "object",
        "available=false stale=true -- haSolar's contract: a source that stopped answering is not a " +
        "reason to blank a panel, and the last good values stay flagged rather than vanishing");
    ok("...and it still answers the four roles as null rather than omitting them",
        "roles" in l && ["power", "energyToday", "grid", "battery"].every((k) => k in l.roles),
        "a consumer destructuring roles.battery must not crash because the gateway is asleep");
    ok("!! it names its own source, so a mixed deployment can tell which module answered",
        l.source === "envoy-direct", 'source="' + l.source + '" against haSolar\'s HA-backed reply');
    report("*** WHAT THIS GATE DOES NOT CLAIM, AND IT IS THE WHOLE LIMIT: NOTHING HERE HAS TOUCHED A REAL " +
        "GATEWAY. *** The fixtures are shaped from the documented response schemas, not captured from the " +
        "hardware -- this build has no LAN and no Envoy. Gated: the cascade order, the null-not-zero rule, " +
        "the source labelling, the units, the credential handling, the discovery wiring, the degradation " +
        "contract. NOT gated: that a real IQ Gateway returns these shapes, that the token flow succeeds, " +
        "that mDNS resolves on Keith's network. Point it at the gateway and those become real; until then " +
        "the live half is UNVERIFIED, which is not the same as broken and is not the same as working.");
}

console.log(fails ? `\nenvoySolar-selfcheck: ${fails} FAILED` : "\nenvoySolar-selfcheck: all checks pass");
if (fails) process.exit(1);
