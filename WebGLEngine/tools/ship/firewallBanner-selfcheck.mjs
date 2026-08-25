// WebGLEngine/tools/ship/firewallBanner-selfcheck.mjs -- v3944
//
// Run: node tools/ship/firewallBanner-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE FIREWALL PROMPT LIVED ON THE ONE PAGE THE DEFAULT BOOT MODE NEVER OPENS. ***
//
// index.html's first-run overlay offers to open inbound TCP 8787 so phones / Shield / TV can reach the PC.
// /boot/mode DEFAULTS TO "server", and both launchers read it and open server.html -- so on a fresh box in the
// default mode that offer is never made, the LAN silently cannot reach the engine, and no page says why. The
// tree's only other firewall control is on phone.html, which server.html does not link to.
//
// WHAT THIS FILE REFUSES TO LET REGRESS is not "a banner exists" -- it is WHEN the banner appears, which is the
// entire design. A reachability warning has two opposite failure modes and only one of them is visible: shown
// when there is nothing wrong, it is noise people learn to click past; HIDDEN WHEN THE PORT IS SHUT, it is the
// silent failure the banner was added to end. So every state below is driven in a real browser, both ways round.
//
// SAFETY: /sys/firewall/status and /sys/firewall/allow are STUBBED in the same page.route() that serves the
// tree from disk. Nothing here can run netsh, launch an elevated PowerShell, or touch a real firewall rule --
// on this Linux box the bridge would refuse anyway, but the gate must be safe to run on Keith's Windows rig too.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
// The whole gate is the browser, so a box without one sits the round out -- IN THE SPELLING selfchecks.mjs
// RECOGNISES ("<name>-selfcheck: SKIPPED"), so the run loop leaves it out of gate-timings.json instead of
// recording the half-second it took to decide it could not run. A recorded time for a gate that never ran is a
// budget derived from a measurement of nothing, which is the writer bug v3941 closed.
if (skip) { console.log("firewallBanner-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("firewallBanner-selfcheck -- when server.html warns about a shut port, driven in a real browser\n");

// ---- the stub, mutable between loads so one route registration covers every scenario ---------------------
const state = { fw: null, whoami: null, allowCalls: 0 };
const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
const page = await b.newPage();

await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.pathname === "/sys/firewall/status") return json(state.fw);
    if (u.pathname === "/sys/firewall/allow") { state.allowCalls++; return json({ ok: true, elevated: true, port: 8787 }); }
    if (u.pathname === "/self/whoami") return json(state.whoami);
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
            : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain";
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
    }
    return route.fulfill({ status: 404, body: "not found" });
});

// Read BOTH surfaces at once: the banner is the nag and the drawer row is the record, and the whole point of
// the design is that they agree. A check that read only one of them could not see them drift apart.
const surfaces = () => page.evaluate(() => {
    const bn = document.getElementById("fwBanner");
    const row = document.getElementById("cfFirewall");
    const rowBtn = document.getElementById("cfFwOpen");
    return {
        bannerShown: !!(bn && bn.style.display !== "none"),
        bannerText: (document.getElementById("fwBannerTxt") || {}).textContent || "",
        rowText: (row || {}).textContent || "",
        rowBtnShown: !!(rowBtn && rowBtn.style.display !== "none"),
    };
});

// The check is deferred to requestIdleCallback on purpose (it costs a netsh + a PowerShell call on Windows),
// so the gate waits for the row to stop saying "checking" rather than sleeping a guessed number of ms.
async function load(fw, whoami) {
    state.fw = fw; state.whoami = whoami;
    await page.goto("http://swek.local/server.html", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(() => { try { localStorage.removeItem("voxelengine.fwBannerDismiss"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
        const r = document.getElementById("cfFirewall");
        return r && !/checking/.test(r.textContent);
    }, { timeout: 20000 });
    return surfaces();
}

const HOST = { ok: true, local: true, remote: false, name: "rig" };
const AWAY = { ok: true, local: false, remote: true, name: "rig" };
const SHUT = { ok: true, win: true, port: 8787, ruleExists: false, firewallOn: true };

// ---- 1. THE STATE THE BANNER EXISTS FOR ------------------------------------------------------------------
{
    console.log("1. *** A SHUT PORT, ON THE BOX THAT CAN OPEN IT ***");
    const s = await load(SHUT, HOST);
    ok("!! the banner appears when the rule is missing and the firewall is on",
        s.bannerShown,
        "*** THIS IS THE WHOLE FEATURE. *** /boot/mode defaults to 'server', so this is the ONLY page a default " +
        "install ever shows -- and before v3944 it said nothing at all while the LAN could not reach the box.");
    ok("...and it names the port and who is locked out, not just 'firewall'",
        /8787/.test(s.bannerText) && /can't reach/i.test(s.bannerText),
        s.bannerText.slice(0, 90));
    ok("!! ...and the drawer row agrees with it",
        /blocked/i.test(s.rowText) && s.rowBtnShown,
        "the banner is the NAG and the row is the RECORD; two surfaces disagreeing about one fact is the " +
        "second-declaration shape this page's own v3245 note is about");
}

// ---- 2. AND EVERY STATE WHERE IT MUST STAY QUIET ---------------------------------------------------------
{
    console.log("\n2. *** SHOWN WHEN THERE IS NOTHING WRONG, IT IS NOISE PEOPLE LEARN TO CLICK PAST ***");
    const allowed = await load({ ok: true, win: true, port: 8787, ruleExists: true, firewallOn: true }, HOST);
    ok("!! no banner once the rule exists",
        !allowed.bannerShown && !allowed.rowBtnShown,
        "and the row still SAYS so rather than going blank: " + JSON.stringify(allowed.rowText));
    ok("...and the row reports it as allowed", /allowed/i.test(allowed.rowText), allowed.rowText);

    const off = await load({ ok: true, win: true, port: 8787, ruleExists: false, firewallOn: false }, HOST);
    ok("!! no banner when the firewall is OFF entirely, where a missing rule blocks nothing",
        !off.bannerShown,
        "*** ruleExists ALONE IS NOT THE QUESTION. *** index.html's one-shot overlay checks only that, which is " +
        "fine for a modal shown once -- a PERSISTENT banner reading the same field would nag forever on a box " +
        "whose firewall is switched off and whose port is already reachable.");

    const mac = await load({ ok: true, win: false, note: "firewall control is Windows-only" }, HOST);
    ok("!! no banner on a non-Windows host, where there is no rule to add",
        !mac.bannerShown && !mac.rowBtnShown,
        "the bridge's own firewallStatus() answers win:false on Mac and Linux -- and start-mac.sh opens this " +
        "same page, so this is a real host, not a hypothetical one");
    ok("...and the row says why rather than staying on 'checking'",
        /windows only/i.test(mac.rowText), mac.rowText);
}

// ---- 3. A BUTTON NOBODY CAN ANSWER IS WORSE THAN NO BUTTON -----------------------------------------------
{
    console.log("\n3. *** THE UAC PROMPT OPENS ON THE HOST'S SCREEN, SO ONLY THE HOST IS OFFERED IT ***");
    const s = await load(SHUT, AWAY);
    ok("!! a REMOTE viewer is not offered a button that pops UAC on somebody else's monitor",
        !s.bannerShown && !s.rowBtnShown,
        "*** THIS STATE IS REACHABLE, WHICH IS WHY IT IS CHECKED: *** the Cloudflare tunnel dials OUT, so a " +
        "remote can be looking at this page over a port the LAN firewall is still blocking.");
    ok("...but the FACT is still reported, with the one instruction that works",
        /blocked/i.test(s.rowText) && /host pc/i.test(s.rowText),
        "hiding the control is right; hiding the diagnosis would just move the silence somewhere else -- " + s.rowText);
}

// ---- 4. THE CLICK, AND THE THING IT MUST NOT CLAIM -------------------------------------------------------
{
    console.log("\n4. *** firewallAllow RETURNS WHEN UAC IS LAUNCHED, NOT WHEN THE RULE EXISTS ***");
    await load(SHUT, HOST);
    const before = state.allowCalls;
    await page.click("#fwBannerOpen");
    await page.waitForTimeout(300);
    ok("!! clicking Open firewall posts to the bridge", state.allowCalls === before + 1,
        "driven for real against the stub: " + before + " -> " + state.allowCalls);

    const mid = await surfaces();
    ok("!! ...and it does NOT report success while the rule is still absent",
        !/✓|allowed|done/i.test(mid.bannerText) && /waiting|approve/i.test(mid.bannerText),
        "*** A GREEN TICK FOR A PORT THAT IS STILL SHUT IS THE EXACT FAILURE THIS BANNER EXISTS TO END. *** " +
        "The elevated process is only LAUNCHED by the POST; the user may take ten seconds to approve the UAC " +
        "prompt, or never approve it at all. Says: " + JSON.stringify(mid.bannerText));

    // now let the rule "appear", as it would once UAC is approved, and watch the page notice by itself
    state.fw = { ok: true, win: true, port: 8787, ruleExists: true, firewallOn: true };
    await page.waitForFunction(() => {
        const bn = document.getElementById("fwBanner");
        return bn && bn.style.display === "none";
    }, { timeout: 25000 }).then(() => ok("!! ...and it clears ITSELF once the rule lands, with no reload", true,
        "it re-checks on a schedule instead of telling you to press F5 -- the rule appears seconds after the " +
        "POST returns, so a page that reported the state only at load would be wrong for the rest of the session"))
      .catch(() => ok("!! ...and it clears ITSELF once the rule lands, with no reload", false, "banner never cleared"));
}

// ---- 5. "NOT NOW" HIDES THE NAG, NOT THE FIX -------------------------------------------------------------
{
    console.log("\n5. SAYING NO ONCE MUST NOT COST YOU THE CONTROL");
    await load(SHUT, HOST);
    await page.click("#fwBannerNot");
    await page.waitForTimeout(150);
    const s = await surfaces();
    ok("!! dismissing hides the banner", !s.bannerShown);
    ok("!! ...but the drawer row and its button REMAIN",
        s.rowBtnShown && /blocked/i.test(s.rowText),
        "*** A DISMISS THAT TOOK THE BUTTON WITH IT WOULD LEAVE NO FIREWALL CONTROL ON THIS PAGE AT ALL *** " +
        "-- back to the state that made this round necessary, only now with the user having been shown the " +
        "problem once and then handed nothing to do about it.");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
        const r = document.getElementById("cfFirewall");
        return r && !/checking/.test(r.textContent);
    }, { timeout: 20000 });
    const after = await surfaces();
    ok("...and the dismissal survives a reload, or it is not a dismissal",
        !after.bannerShown && after.rowBtnShown);
}

await b.close();
console.log(fails ? `\nfirewallBanner-selfcheck: ${fails} FAILED` : "\nfirewallBanner-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
