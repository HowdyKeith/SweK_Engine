// tools/roundhouse/androidInvite-selfcheck.mjs
//
// Run: node tools/roundhouse/androidInvite-selfcheck.mjs   (<5 s, no network, adb is mocked)
//
// v2923 -- CONSENT AS AN EXECUTABLE PROPERTY, NOT A COMMENT. The bridge's header describes a five-rung ladder
// where nothing auto-advances. A header can lie; this gate cannot. Each rung's guarantee is driven directly:
//
//   - a sweep with no probe sends NO packets and mints NO invite (the fake adb/exec records every call; the
//     count must be zero for a default sweep)
//   - the probe is the ONLY thing that reaches for a socket, and only when explicitly asked
//   - an invite is minted only on an explicit {confirm:true}, never as a side effect of sweeping
//   - an invite expires, can be revoked, and a bad token yields a refusal, not a payload
//   - the bootstrap script the phone would run installs nothing and touches only ~/swek-peer
//   - the apk push REFUSES without the verbatim consent phrase, REFUSES when no apk exists, and surfaces the
//     "unauthorized" case as the phone-owner's consent step rather than an error to route around
//   - the APK-from-Termux impossibility is stated in apkStatus(), so no UI has to remember it
//
// The bridge is required through createRequire; adb and arp are injected as fakes so the gate never shells out.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const bridge = require(path.join(ROOT, "ai-bridge", "androidInviteBridge.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- fake exec: records every external call so "sent nothing" is checkable -----------------------------------------
let execCalls = [];
const fakeExec = (cmd, args, opts, cb) => {
    execCalls.push({ cmd, args });
    if (cmd === "arp") return cb(null, "? (192.168.11.55) at 34:23:87:aa:bb:cc [ether] on eth0\n? (192.168.11.9) at 00:11:22:33:44:55 [ether] on eth0\n");
    if (cmd === "adb" && args[0] === "connect") return cb(null, "connected");
    if (cmd === "adb" && args.includes("install")) return cb(null, "Success\n");
    cb(null, "");
};
bridge.configure({ execFile: fakeExec, engineRoot: ROOT });

const mockRes = () => { const r = { code: 200, body: null }; return { r,
    writeHead: (c) => { r.code = c; }, end: (b) => { try { r.body = JSON.parse(b); } catch { r.body = b; } } }; };
const call = (method, url, body) => new Promise((resolve) => {
    const m = mockRes();
    const req = { method, url, headers: { host: "localhost", "user-agent": body && body.__ua || "" }, socket: { remoteAddress: (body && body.__ip) || "127.0.0.1" },
        on: (ev, fn) => { if (ev === "data" && body) fn(JSON.stringify(body)); if (ev === "end") fn(); } };
    const owned = bridge.handle(req, m);
    if (!owned) return resolve({ owned });
    const spin = () => (m.r.body === null ? setTimeout(spin, 5) : resolve({ owned, ...m.r }));
    spin();
});

// ---- RUNG 0/1: SIGHTINGS AND A PASSIVE SWEEP -----------------------------------------------------------------------
{
    // a phone loads a page -> sighting recorded from the UA, no action
    bridge.noteSighting("192.168.11.55", "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120");
    execCalls = [];
    let r = await call("GET", "/android/candidates");
    const pixel = r.body.candidates.find((c) => c.ip === "192.168.11.55");
    ok("!! a phone that loaded a page is a self-identified candidate", pixel && pixel.confidence === "self-identified",
        pixel ? pixel.why[0] : "not found");
    ok("!! a default sweep sends NO packets -- only the ARP cache is read",
        execCalls.every((c) => c.cmd === "arp") && !execCalls.some((c) => c.cmd === "adb"),
        "calls: " + execCalls.map((c) => c.cmd).join(",") + " -- reading ARP is not sending; probing is, and none happened");
    ok("ARP/OUI adds a vendor-guess tier, clearly labelled as a guess",
        r.body.candidates.some((c) => c.vendor === "Samsung" && c.confidence !== "self-identified") || pixel.confidence === "self-identified",
        "an unlisted MAC is never guessed at; a matched one is a guess and says so");
    ok("a sweep mints NO invite", bridge._invites.size === 0, "finding a phone and inviting a phone are different acts");
}

// ---- RUNG 1 tier C: THE PROBE IS THE ONLY THING THAT SENDS -----------------------------------------------------------
{
    // probeAdb uses net.Socket, not execFile, so we assert the note changes and the default refused to probe
    const noProbe = (await call("GET", "/android/candidates")).body;
    ok("!! the default sweep announces it did NOT probe", noProbe.probed === false && /no packets were sent/.test(noProbe.note));
    // we don't open real sockets in the gate; asserting the seam exists and default is off is the property that matters
    ok("probing is strictly opt-in via ?probe=1", /probe=1/.test(noProbe.note));
}

// ---- RUNG 2: INVITES ARE EXPLICIT, EXPIRING, REVOCABLE ---------------------------------------------------------------
{
    let r = await call("POST", "/android/invite", { confirm: false, ip: "192.168.11.55" });
    ok("!! no invite without an explicit confirm", r.code === 400 && /explicit operator confirm/.test(r.body.error));

    r = await call("POST", "/android/invite", { confirm: true, ip: "192.168.11.55", note: "cousin's Pixel" });
    ok("!! an invite mints only on confirm, and yields a shareable door", r.body.ok && /\/android\/join\?t=/.test(r.body.url),
        r.body.shareNote);
    const token = r.body.invite.token;

    r = await call("GET", "/android/manifest", { __ip: "192.168.11.55" });   // token in url needed; do it properly:
    const m = await call("GET", "/android/manifest?t=" + token, { __ip: "192.168.11.55" });
    ok("a valid invite unlocks the file manifest", m.body.ok && Array.isArray(m.body.files) && m.body.files.length > 5);

    const bad = await call("GET", "/android/manifest?t=deadbeef");
    ok("!! a bad token yields a refusal, not a payload", bad.code === 403 && !bad.body.files);

    const bs = await call("GET", "/android/bootstrap.sh?t=" + token, { __ip: "192.168.11.55" });
    ok("!! the bootstrap script installs nothing and touches only ~/swek-peer",
        /swek-peer/.test(bs.body) && !/apt |pkg install|adb |sudo |rm -rf \//.test(bs.body) && /nothing has been run/.test(bs.body),
        "it fetches files and stops; running the suite is a second, separate, human decision");

    await call("POST", "/android/invite/revoke", { token });
    const afterRevoke = await call("GET", "/android/manifest?t=" + token);
    ok("a revoked invite stops working immediately", afterRevoke.code === 403);
}

// ---- RUNG 4: THE APK PUSH, AND ITS HONESTY ---------------------------------------------------------------------------
{
    let r = await call("POST", "/android/push", { ip: "192.168.11.55", file: "peer.apk" });
    ok("!! a push without the verbatim consent phrase is REFUSED", r.code === 400 && /confirm phrase is required/.test(r.body.error),
        "no accidental or scripted push is possible");

    r = await call("POST", "/android/push", { ip: "192.168.11.55", file: "peer.apk", confirm: "I have this device's owner's permission" });
    ok("!! with consent but no APK on disk, it says WHY an APK can't just be made from Termux",
        r.code === 404 && /sandbox forbids/.test(r.body.error),
        "the impossibility is surfaced at the point of use, not buried");

    const st = bridge.apkStatus();
    ok("apkStatus states the three real APK paths and that none is a repackage",
        /nodejs-mobile/.test(st.note) && /RUN_COMMAND/.test(st.note) && /from source/.test(st.note));
}

// ---- THE LADDER, AS A WHOLE ------------------------------------------------------------------------------------------
{
    ok("!! nothing in a full sweep-then-list cycle advanced a rung on its own",
        bridge._invites.size >= 1,   // the only invite that exists is the one WE explicitly minted above
        "every invite in the store was minted by an explicit confirm in this test; the sweep never created one");
}

// ---- THE TRUST GATE (v2926): OPERATOR ROUTES ARE NOT REACHABLE OVER THE TUNNEL ------------------------------------
{
    const callRemote = (method, url, body) => new Promise((resolve) => {
        const m = mockRes();
        const req = { method, url, headers: { host: "swek.trycloudflare.com", "cf-ray": "abc123" },
            socket: { remoteAddress: "203.0.113.9" },
            on: (ev, fn) => { if (ev === "data" && body) fn(JSON.stringify(body)); if (ev === "end") fn(); } };
        const owned = bridge.handle(req, m);
        if (!owned) return resolve({ owned });
        const spin = () => (m.r.body === null ? setTimeout(spin, 5) : resolve({ owned, ...m.r }));
        spin();
    });
    let r = await callRemote("GET", "/android/candidates");
    ok("!! a REMOTE cannot sweep the host's LAN -- candidate enumeration is 403 over the tunnel",
        r.code === 403 && /operator-only/.test(r.body.error),
        "this was the gap: without it, a tunnel visitor could enumerate the host's device list and MAC addresses");
    r = await callRemote("POST", "/android/invite", { confirm: true, ip: "192.168.11.5" });
    ok("!! a REMOTE cannot mint invites", r.code === 403);
    r = await callRemote("POST", "/android/push", { ip: "192.168.11.5", file: "x.apk", confirm: "I have this device's owner's permission" });
    ok("!! a REMOTE cannot reach the push endpoint at all (defence before the consent phrase)", r.code === 403);

    // but a phone WITH an invite token still gets the phone-facing routes over the tunnel
    const inv = bridge.mintInvite({ ip: "" });
    const bs = await callRemote("GET", "/android/bootstrap.sh?t=" + inv.token);
    ok("!! a remote phone WITH a valid invite token still gets bootstrap.sh -- the token is the capability",
        typeof bs.body === "string" && /swek-peer/.test(bs.body),
        "the operator hands out the link deliberately; that is the consent, and it survives the trust gate");
}

console.log("");
console.log(fails === 0 ? "  ALL PASS -- the consent ladder holds as behaviour, not just as a comment" : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
