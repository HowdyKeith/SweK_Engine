// WebGLEngine/ai-bridge/copypartyBridge.js -- v3169
//
// THE PHONE PEERS COULD NOT MOVE A FILE. android-peer.html and ios-peer.html mentioned file transfer ZERO
// times: they run the physics subset and that is all. v3166 REGISTERED copyparty in autoInstall and I said
// plainly that the front door was not built -- this is the front door.
//
// *** THE PORT IS CHECKED, NEVER CLAIMED, AND freePort() IS NOT USED. ***
//
// The tree HAS a freePort() in portHandoff.js and it is A KILL -- "the OS-specific kill, best-effort and
// rig-verified". It frees a port by TERMINATING WHATEVER HOLDS IT. Reaching for it here would kill an unrelated
// process to start a file server, which is the worst possible way to resolve a collision and would look like a
// crash to whoever owned that port. THERE IS NO ALLOCATOR IN THIS TREE, and inventing one that silently walks
// to the next free number would hand somebody a URL that changes between sessions.
//
// So: 3923 is copyparty's own default and collides with nothing SweK claims (8787 the engine, 8080
// spaceprojectsim, plus 1143 / 8188 / 9200 / 1984 / 8000 / 2283). It is PROBED, and a taken port is REPORTED
// with what is on it rather than resolved by force or by drifting.

const net = require("net");
const { spawnSync } = require("child_process");

const DEFAULT_PORT = 3923;
// EVERY PORT SweK ITSELF SPEAKS FOR, so a collision with our own stack is named as such rather than as "busy".
const OURS = { 8787: "the SweK engine bridge", 8080: "spaceprojectsim", 1143: "a SweK service",
               8188: "a SweK service", 9200: "a SweK service", 1984: "a SweK service",
               8000: "a SweK service", 2283: "a SweK service" };

/** Is anything listening? Answers by TRYING TO BIND, which is the only test that matches what a server does. */
function portFree(port, host = "127.0.0.1") {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.once("error", () => resolve(false));
        s.once("listening", () => s.close(() => resolve(true)));
        s.listen(port, host);
    });
}

function installed() {
    // The module is what autoInstall detects; asking the same way keeps ONE definition of "installed".
    try {
        const py = process.platform === "win32" ? "python" : "python3";
        return spawnSync(py, ["-c", "import copyparty"], { timeout: 6000 }).status === 0;
    } catch { return false; }
}

/**
 * THREE FACTS ON THEIR OWN EVIDENCE, which is v3040's law from the tunnel checkbox: two independent facts
 * restored from one piece of evidence is how a control comes to lie. Installed, port, and reachable are
 * separate questions with separate answers.
 */
async function status(port = DEFAULT_PORT) {
    const free = await portFree(port);
    return {
        installed: installed(),
        port,
        portFree: free,
        // A PORT THAT IS TAKEN BY US IS NOT THE SAME AS ONE TAKEN BY A STRANGER. Saying which turns "busy" into
        // either "move copyparty" or "you already have something there on purpose".
        portHeldBy: free ? null : (OURS[port] || "something not part of SweK"),
        defaultPort: DEFAULT_PORT,
        // NOT A COMMAND WE RUN. Printed so Keith starts it himself on the phone, where this process is not.
        termux: "python3 -m copyparty -p " + port + " -v .::rw",
        aShell: "python3 -m copyparty -p " + port + " -v .::r",
        warning: "copyparty with no accounts gives EVERYONE on the network read/write access to the folder it " +
                 "serves. The -v .::r form above is READ ONLY, which is the safer default for a phone.",
    };
}

module.exports = { status, portFree, installed, DEFAULT_PORT, OURS };
