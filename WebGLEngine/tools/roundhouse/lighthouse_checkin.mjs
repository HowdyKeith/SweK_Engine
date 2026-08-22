// tools/roundhouse/lighthouse_checkin.mjs
//
// v2953 -- THE PEER SIDE OF THE LIGHTHOUSE. Run this on a machine that the hub CANNOT reach -- a cousin's
// desktop, a laptop on mobile tethering, anything behind NAT or CGNAT. It computes this machine's fingerprint
// and pushes it to the lighthouse URL, which is normally the hub's Cloudflare tunnel address.
//
//   node tools/roundhouse/lighthouse_checkin.mjs https://your-tunnel.trycloudflare.com   # first time
//   node tools/roundhouse/lighthouse_checkin.mjs                                        # thereafter
//
// The URL is remembered in .swek-lighthouse next to this file, the same way the phone outbox remembers its hub,
// so a scheduled task or cron line needs no arguments. Exits non-zero if the check-in did not land, so it can be
// chained or retried without anything parsing its output.
//
// WHY THIS EXISTS AT ALL: /fingerprint/collect is a PULL -- the hub fetches each peer's /fingerprint. A machine
// behind NAT has no address the hub can dial, so it can never be pulled, and before this it could not be part
// of the fleet by any means. A tunnel URL is stable and reachable from anywhere, so the peer reaching IN is the
// only direction that works. This is a peer joining the fleet, not the hub recruiting it.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MEMO = path.join(here, ".swek-lighthouse");        // the ORDERED candidate list, newline separated

// v2956: the memo holds a LIST, not one URL. Cloudflare quick tunnels are unreliable in a way that punishes
// storing a single address: a fresh one often fails, an old one can start working again, and whole batches
// recover at once. So the peer keeps every address it has been told about and walks them in order until one
// answers -- and on success it refreshes the list from the hub, so a peer that got in once stays current.
const readMemo = () => { try { return fs.readFileSync(MEMO, "utf8").split("\n").map((s) => s.trim()).filter(Boolean); } catch { return []; } };
const writeMemo = (urls) => { try { fs.writeFileSync(MEMO, [...new Set(urls)].join("\n") + "\n"); } catch {} };

async function main() {
    const given = process.argv.slice(2).map((u) => u.replace(/\/+$/, "")).filter(Boolean);
    const candidates = [...new Set([...given, ...readMemo()])];      // anything supplied now goes first
    if (!candidates.length) {
        console.error("no lighthouse URL known. Supply one or more once:");
        console.error("  node tools/roundhouse/lighthouse_checkin.mjs https://your-tunnel.trycloudflare.com");
        process.exit(2);
    }
    if (given.length) writeMemo(candidates);

    // this machine's fingerprint -- the same computation the hub would have pulled, made locally instead
    const { computeFingerprint } = await import("../fingerprint/fingerprint.mjs");
    const fp = computeFingerprint();
    // v2957: report which build this peer is running, so the hub can tell it whether a newer one exists. The
    // peer is TOLD; it does not self-install. Downloading and executing code pulled from a tunnel onto someone
    // else's machine without their knowledge is not an update mechanism, it is a backdoor -- so the hub answers
    // with a version and a link, and a human decides.
    let engineVersion = null;
    try {
        const mj = fs.readFileSync(path.join(here, "..", "..", "main.js"), "utf8");
        const m = mj.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
        engineVersion = m ? m[1] : null;
    } catch {}
    const report = {
        host: os.hostname(), arch: process.arch, platform: process.platform, node: process.version,
        master: fp.master, subsystems: fp.subsystems, engineVersion,
    };
    // physics observables too, if this build carries them -- degrade rather than fail if the measure is slow or broken
    try {
        const { peerReport } = await import("../fingerprint/peerReport.mjs");
        const rep = await peerReport({ version: process.version, arch: process.arch, host: report.host });
        report.observables = rep.observables;
    } catch (e) { report.observableError = String((e && e.message) || e); }

    // walk the candidates until one answers. A failure here says nothing permanent about the URL -- these come
    // back -- so nothing is discarded, the order simply gets better as evidence accumulates on the hub side.
    let res = null, url = null, tried = 0;
    for (const cand of candidates) {
        tried++;
        process.stdout.write(`  trying ${cand} ... `);
        const r = await fetch(cand + "/lighthouse/checkin", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report),
            signal: AbortSignal.timeout(15000),
        }).catch((e) => ({ ok: false, _err: String((e && e.message) || e) }));
        if (r && r.ok) { console.log("ok"); res = r; url = cand; break; }
        console.log("no (" + (r && r._err ? r._err.slice(0, 40) : "HTTP " + (r && r.status)) + ")");
    }

    if (!res) {
        console.error(`check-in FAILED on all ${tried} candidate(s).`);
        console.error("  Nothing local was lost and NO url was discarded -- these tunnels recover, often all at");
        console.error("  once. Run again later, or add a newer address as an argument.");
        process.exit(1);
    }
    const j = await res.json();
    console.log(`checked in to ${url}`);
    // refresh the candidate list from the hub, so a peer that got in once learns about newer tunnels
    try {
        const t = await fetch(url + "/tunnels", { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
        if (t && Array.isArray(t.ordered) && t.ordered.length) { writeMemo([url, ...t.ordered]); console.log(`  candidate list refreshed: ${t.ordered.length} known address(es)`); }
    } catch {}
    console.log(`  peer key ${j.key}   fleet now ${j.peerCount} peer(s)`);
    console.log(j.fleetAgrees ? "  fleet AGREES on one master hash" : `  !! fleet has ${j.masters} DIFFERENT master hashes -- someone diverged`);
    // v2959 -- ACT ON THE OFFER ACCORDING TO THIS MACHINE'S OWN POLICY. The policy is read from a local file;
    // nothing the hub sends can raise the tier (v2958). At most this stages a file and verifies it -- it never
    // unzips or runs anything, at any tier.
    if (j.update && j.update.newer) {
        try {
            const up = await import("./updatePolicy.mjs");
            let policy = {};
            try { policy = JSON.parse(fs.readFileSync(path.join(here, "update-policy.json"), "utf8")); } catch {}
            const rel = await fetch(url + "/release", { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
            const decision = up.decide(policy, rel || { version: j.update.hub }, { current: j.update.yours });
            console.log(`  update policy: ${up.readPolicy(policy).tier} -> ${decision.action} (${decision.why})`);
            if (decision.action === "download" || decision.action === "download-and-verify") {
                const zipUrl = `${url}/download/SweK_Engine_${rel.version}.zip`;
                const res2 = await fetch(zipUrl, { signal: AbortSignal.timeout(300000) }).catch(() => null);
                if (res2 && res2.ok) {
                    const bytes = Buffer.from(await res2.arrayBuffer());
                    const stage = path.join(here, up.readPolicy(policy).stagingDir);
                    fs.mkdirSync(stage, { recursive: true });
                    const dest = path.join(stage, `SweK_Engine_${rel.version}.zip`);
                    const v = up.verifyBuild({ bytes, offer: rel, policy });
                    if (v.ok) {
                        fs.writeFileSync(dest, bytes);
                        console.log(`  staged ${dest}`);
                        // macOS note: a zip written here by fs.writeFileSync carries NO com.apple.quarantine
                        // attribute, because quarantine is applied by LaunchServices-aware downloaders (Safari,
                        // Chrome, Mail) and not by an ordinary file write. So a build that arrives through the
                        // lighthouse extracts WITHOUT Gatekeeper blocking the .command launchers -- the very
                        // thing make_Mac_SweK_Runnable.sh exists to undo after a browser download. Reasoned from
                        // how quarantine is applied, not verified on Apple hardware from this side.
                        if (process.platform === "darwin") console.log("  (macOS: staged by Node, so no Gatekeeper quarantine to clear)");
                        console.log(v.applicable
                            ? "  signature VERIFIED against the pinned key -- this build is authorised to apply"
                            : "  checksum verified; NOT unzipped and NOT run -- apply it yourself when you choose");
                    } else {
                        console.log(`  REFUSED to stage: ${v.why}`);
                    }
                } else { console.log("  could not fetch the build; the staged copy is unchanged"); }
            }
        } catch (e) { console.log("  update check skipped: " + String((e && e.message) || e).slice(0, 60)); }
    }
    if (j.update && j.update.newer) {
        console.log(`  UPDATE AVAILABLE: you are on ${j.update.yours || "?"}, the hub is on ${j.update.hub}`);
        console.log(`    download: ${url}/join.html   (nothing is installed for you -- fetch it and unzip when you choose)`);
    } else if (j.update && j.update.yours) {
        console.log(`  version ${j.update.yours} -- current`);
    }
}

main().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
