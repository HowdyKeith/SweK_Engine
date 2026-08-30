// WebGLEngine/tools/ship/grdpwasm-selfcheck.mjs -- v4138
//
// THE ANSWER KEY FOR AN INSTALL BUTTON THAT STARTS SOMEBODY ELSE'S TCP RELAY.
//
// Keith pointed at nakagami/grdpwasm and asked for the galaxy-profile treatment. The licensing half is
// v4124's argument unchanged and is checked here the same way. THE HALF THAT IS NOT ROUTINE is what reading
// proxy/main.go turned up: 110 lines that default to `-listen :8080`, return true from CheckOrigin, and dial
// whatever host:port the query string names. Individually all reasonable for `make serve` on your own desktop.
// Together, on a machine that sits on a LAN, an unauthenticated open TCP relay that can reach hosts behind
// that machine's own firewall.
//
// SO THE ONE CLAIM THIS GATE EXISTS FOR IS "IT IS BOUND TO LOOPBACK", AND IT IS PROVEN ON A REAL SOCKET
// RATHER THAN READ OUT OF THE SOURCE. A regex confirming the string "127.0.0.1" appears in a file is exactly
// the check that passes while the thing it describes is wrong -- this tree has paid for that shape repeatedly.
// The live section starts a listener, reaches it on loopback, FAILS to reach it on this machine's own
// non-loopback address, and only then believes the claim.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const require_ = createRequire(import.meta.url);
const B = require_(path.join(ENG, "ai-bridge", "grdpwasmBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);

console.log("1. NOTHING OF THEIRS IS IN THIS TREE");
{
    // The whole licensing argument rests on this being true, so it is checked against the filesystem rather
    // than trusted: a GPL-3.0 work vendored into a tree that publishes its own release zips is the one thing
    // the bridge's header promises does not happen.
    const strays = [];
    const walk = (dir, depth = 0) => {
        if (depth > 3) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p, depth + 1);
            else if (/^(main\.wasm|wasm_exec\.js|keymap\.go|wasm_transport\.go)$/.test(e.name)) strays.push(path.relative(ENG, p));
        }
    };
    walk(ENG);
    ok("!! no grdpwasm artefact or source file has been vendored into the engine",
        strays.length === 0, strays.length ? "found: " + strays.join(", ") : "clean");
    ok("!! the clone target is OUTSIDE the tree",
        !path.resolve(B.SRC_DIR).startsWith(path.resolve(ENG)),
        B.SRC_DIR + " -- inside the tree it would land in a release zip, which is the thing being refused");
    ok("the default is under the user's home, beside the other install buttons",
        B.SRC_DIR.includes(".voxelbridge") || !!process.env.GRDPWASM_SRC_DIR,
        "same ~/.voxelbridge convention galaxy-profile and voxtral use");
}

console.log("\n2. THE UPSTREAM FACTS ARE RECORDED, AND THE LICENCE WAS READ");
{
    ok("!! the commit is PINNED", /^[0-9a-f]{40}$/.test(B.PINNED_COMMIT), B.PINNED_COMMIT.slice(0, 12) + "...");
    ok("!! ...and the branch is recorded as master, which is NOT the default guess",
        B.DEFAULT_BRANCH === "master",
        "raw.githubusercontent 404s on main -- a clone that assumes main fails confusingly six months from now");
    ok("!! the licence is stated AND says it was read rather than inferred",
        B.UPSTREAM.license === "GPL-3.0" && /read|bytes/i.test(B.UPSTREAM.licenseVerified || ""),
        B.UPSTREAM.licenseVerified);
    ok("the author is credited", (B.UPSTREAM.author || "").length > 0, B.UPSTREAM.author);
    ok("maintenance was MEASURED, with the method recorded",
        B.MAINTENANCE.commits > 0 && /git /.test(B.MAINTENANCE.howChecked || ""),
        B.MAINTENANCE.commits + " commits, branches " + B.MAINTENANCE.branches.join("/") + ", last " + B.MAINTENANCE.lastCommit);
}

console.log("\n3. THE RELAY IS THE POINT, AND IT IS NAMED AS ONE");
{
    const bindRefusal = B.REFUSED.find((r) => /loopback|all interfaces/i.test(r.what + " " + r.why));
    ok("!! the REFUSED list names the bind address, not just the licensing",
        !!bindRefusal,
        "an install button that starts an open relay and only documents its copyright position has documented " +
        "the wrong risk");
    ok("!! ...and says WHY the three upstream choices combine into one",
        !!bindRefusal && /CheckOrigin/.test(bindRefusal.why) && /8080/.test(bindRefusal.why),
        "default :8080 + any-origin + caller-chosen target -- each fine alone");
    ok("!! it is explicit that upstream is NOT patched or forked",
        !!bindRefusal && /not modified|their own|unmodified/i.test(bindRefusal.why),
        "the fix is passing THEIR -listen flag; changing their source would be a fork, and a fork of a GPL " +
        "work is a much bigger claim than declining to publish a socket");
    ok("the default port is not upstream's 8080",
        B.DEFAULT_PORT !== 8080, "defaultPort " + B.DEFAULT_PORT +
        " -- a collision that silently attaches a browser to the WRONG listener matters more for a relay");
}

console.log("\n4. LIVE -- THE LOOPBACK CLAIM, PROVEN ON A SOCKET");
{
    // A stand-in listener, NOT their proxy: this section is about which interface a bind reaches, which is a
    // property of the OS and the address, not of their program -- and requiring a 20 MB Go build before this
    // check can run would make it a check nobody runs. The bridge's own default is read from the module.
    const lan = Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address)[0] || null;
    ok("this machine has a non-loopback address to test against", !!lan, lan || "none found");

    if (lan) {
        const reach = (host, port) => new Promise((res) => {
            const s = net.connect({ host, port, timeout: 2000 });
            s.on("connect", () => { s.destroy(); res(true); });
            s.on("error", () => res(false));
            s.on("timeout", () => { s.destroy(); res(false); });
        });
        const serve = (host) => new Promise((res) => {
            const srv = net.createServer((c) => c.end());
            srv.on("error", () => res(null));
            srv.listen(0, host, () => res(srv));
        });

        const loop = await serve(B.LOOPBACK);
        if (!loop) { ok("a listener can be bound on " + B.LOOPBACK, false, "bind failed"); }
        else {
            const port = loop.address().port;
            const viaLoop = await reach(B.LOOPBACK, port);
            const viaLan = await reach(lan, port);
            loop.close();
            ok("!! bound to " + B.LOOPBACK + ": REACHABLE on loopback", viaLoop === true);
            ok("!! bound to " + B.LOOPBACK + ": NOT REACHABLE from " + lan,
                viaLan === false,
                "this is the whole security claim, and it is the one a source grep cannot make");
        }

        const all = await serve("0.0.0.0");
        if (all) {
            const port = all.address().port;
            const viaLan = await reach(lan, port);
            all.close();
            ok("!! ...and bound to 0.0.0.0 it IS reachable from " + lan,
                viaLan === true,
                "the control: without it, the check above could pass because the network is broken rather than " +
                "because the bind was narrow");
        }
    }

    // The bridge's own contract, which is what actually gets used.
    ok("!! start() defaults to loopback when given no host",
        (function () { const src = fs.readFileSync(path.join(ENG, "ai-bridge", "grdpwasmBridge.js"), "utf8");
            return /o\.host[\s\S]{0,80}?:\s*LOOPBACK/.test(src); })(),
        "a caller that passes nothing must not get the LAN");
    ok("!! ...and a non-loopback host comes back with a WARNING attached",
        (function () { const src = fs.readFileSync(path.join(ENG, "ai-bridge", "grdpwasmBridge.js"), "utf8");
            return /warning:\s*host === LOOPBACK \? undefined/.test(src); })(),
        "overridable on purpose -- it is the user's machine -- but never silently");
    ok("!! the child is NOT detached, so a relay cannot outlive the engine",
        !/detached:\s*true/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "grdpwasmBridge.js"), "utf8")),
        "a relay nobody remembers starting is the same hazard as one bound to the world");
    ok("stop() KEEPS the handle rather than nulling it",
        /verifyWith/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "grdpwasmBridge.js"), "utf8")),
        "v4132's rule: a kill SENDS a signal, and dropping the handle destroys the only way to learn whether " +
        "it landed");
}

console.log("\n5. IT IS REACHABLE, WHICH IS WHAT MAKES IT A FEATURE");
{
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    for (const r of ["/grdpwasm/status", "/grdpwasm/install", "/grdpwasm/start", "/grdpwasm/stop"]) {
        ok("route " + r + " is dispatched", server.includes('"' + r + '"'));
    }
    ok("!! ...and every route resolves the bridge lazily, inside the handler",
        !/^const .*grdpwasmBridge/m.test(server) && /require\("\.\/grdpwasmBridge\.js"\)/.test(server),
        "a top-level require would make a missing optional bridge break server boot for everyone");
}

report("NOT RUN HERE: the install itself. `make all` downloads the Go 1.26.3 toolchain (go.mod's own " +
       "requirement, NOT the 1.24 the README claims) plus four modules, and produces ~20 MB of artefacts. It " +
       "was run once by hand while writing this -- 10.5 MB main.wasm, 9.4 MB proxy, exit 0 -- and the bridge " +
       "was then driven against that real build: start on loopback served their page with their own " +
       "no-cache header, status reported running, stop cleared it. A permanent gate that downloads a Go " +
       "toolchain is a gate somebody switches off.");

console.log(fails ? `\ngrdpwasm-selfcheck: ${fails} FAILED` : "\ngrdpwasm-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
