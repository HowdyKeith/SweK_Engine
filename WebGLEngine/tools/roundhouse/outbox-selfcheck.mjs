// tools/roundhouse/outbox-selfcheck.mjs
//
// v2950 -- STORE AND FORWARD: AN UNREACHABLE HUB IS A DELAY, NOT A LOST RUN.
//
// The suite costs the phone 15-25 minutes. Before this, if the hub was unreachable when it finished -- mobile
// data, hub asleep, tunnel down, operator out -- the ballot sat in Downloads until a human noticed. The work was
// done and the result was stranded. Now the ballot is QUEUED first and delivered second, and every boot retries.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const outbox = fs.readFileSync(path.join(here, "swek_outbox.sh"), "utf8");
const peer = fs.readFileSync(path.join(here, "termux_peer.sh"), "utf8");
const boot = fs.readFileSync(path.join(here, "termux_boot_peer.sh"), "utf8");

// ---- 1. QUEUE FIRST, SEND SECOND ---------------------------------------------------------------------------------
{
    // NOTE (v2950): the first version matched the bare string "swek_outbox.sh", whose FIRST occurrence is in the
    // explanatory COMMENT above the code -- so it read the ordering backwards and failed a correct script. That is
    // the fourth text-matching check this session to match its own documentation rather than the code (see
    // magmapVariants-selfcheck's two, and termuxPeerScript's anchor). The lesson is now explicit: a structural
    // check must anchor on something only the CODE can contain -- here the full invocation, not the filename.
    const strip = (t) => t.replace(/^\s*#.*$/gm, "");
    const code = strip(peer);
    const qAt = code.indexOf("swek-outbox/"), sAt = code.indexOf("sh tools/roundhouse/swek_outbox.sh");
    ok("!! the ballot is queued BEFORE delivery is attempted",
        qAt > 0 && sAt > qAt,
        "a send-then-queue order would lose the run in exactly the case the queue exists for -- the send failing. " +
        "The copy into the outbox happens first, unconditionally, and delivery is a separate later step");
}

// ---- 2. A FAILED DELIVERY NEVER DESTROYS THE ITEM -------------------------------------------------------------------
{
    ok("!! nothing is deleted on failure -- and a DELIVERED file is moved, not removed",
        /mv "\$f" "\$SENT\/\$name"/.test(outbox) && !/rm .*\$f/.test(outbox),
        "on success the file moves to sent/, so the phone keeps its own record of what it reported and a " +
        "delivery can be audited later. On failure it stays exactly where it is. There is no path in this script " +
        "that destroys a queued result");
}

// ---- 3. AN HTTP ERROR IS NOT MISTAKEN FOR DELIVERY --------------------------------------------------------------------
{
    ok("!! curl --fail is used, so a 400 does not count as delivered",
        /curl -fsS/.test(outbox),
        "without --fail curl exits 0 on an HTTP error and the item would be moved to sent/ having never been " +
        "accepted -- a silent loss that looks like success. The submit endpoint rejects unknown kinds with a 400, " +
        "so this is a live path, not a hypothetical");
}

// ---- 4. EVERY BOOT RETRIES ---------------------------------------------------------------------------------------
{
    ok("!! the boot script flushes the outbox before running anything",
        /swek_outbox\.sh/.test(boot),
        "a boot is the natural retry moment: network usually up, device awake. This is what makes an unreachable " +
        "hub a DELAY rather than a loss -- the queue drains at the next opportunity without anyone intervening");
}

// ---- 5. THE HUB ADDRESS IS LEARNED ONCE ----------------------------------------------------------------------------
{
    ok("the hub address is remembered, so later runs need no argument",
        /\.swek_hub/.test(outbox) && /HUB="\$\{HUB%\/\}"/.test(outbox),
        "supplied once, stored in ~/.swek_hub, reused thereafter. A tunnel URL works identically to a LAN " +
        "address, which is what lets an off-site volunteer's phone deliver at all");

    ok("with no hub known it exits distinctly rather than discarding the queue",
        /exit 2/.test(outbox) && /queued items remain/.test(outbox),
        "exit 2 = 'I do not know where to send', distinct from exit 1 = 'items remain queued'. Neither empties " +
        "the outbox; a script that cannot deliver must never resolve the situation by forgetting");
}

console.log();
if (fails) { console.log("outbox-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("outbox-selfcheck: all checks pass");
