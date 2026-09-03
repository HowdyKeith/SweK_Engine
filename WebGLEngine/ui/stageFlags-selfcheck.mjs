// WebGLEngine/ui/stageFlags-selfcheck.mjs -- v4419
//
// Run: node ui/stageFlags-selfcheck.mjs
//
// Grades ui/stageFlags.mjs (the ?pet resolution) and the server.html rotation that depends on it.
//
// *** SECTION 2 IS THE ONE THAT EARNED THE CHANGE. *** Loosening a veto to a default is only safe if nobody
// relies on the veto, and "nobody relies on it" is a COUNT, not an opinion. So the gate re-takes that count
// from the tree every run rather than trusting the number I measured once.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePet, MEASURED_AT_V4419 } from "./stageFlags.mjs";
import { MODES, nextMode } from "./avatarSwitch.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE RULE, AS ARITHMETIC -----------------------------------------------------------------------------
{
    say("resolvePet(petParam, embed, compPet)");
    const rows = [
        // petParam, embed, compPet, expected, why
        ["1", true, undefined, true, "*** THE v4419 CHANGE: an explicit pet=1 survives embed ***"],
        ["0", true, undefined, false, "an explicit pet=0 still wins -- the two shipping embed callers"],
        [null, true, undefined, false, "v3656 kept: an embedded stage DEFAULTS the pet off"],
        [null, true, true, false, "...and embed outranks a composition default, which is what makes it a default and not a no-op"],
        ["1", false, undefined, true, "explicit on, unembedded"],
        ["0", false, true, false, "explicit beats the composition"],
        [null, false, true, true, "v1352: the composition decides"],
        [null, false, false, false, "...in both directions"],
        [null, false, undefined, true, "nobody has an opinion -> the pet is on, as it always was"],
    ];
    for (const [p, e, c, want, why] of rows) {
        const got = resolvePet(p, e, c);
        ok(`  pet=${String(p).padEnd(4)} embed=${String(e).padEnd(5)} comp=${String(c).padEnd(9)} -> ${String(got).padEnd(5)}`,
            got === want, why);
    }
    ok("!! *** an explicit flag is honoured under embed -- a DEFAULT, no longer a VETO ***",
        resolvePet("1", true, undefined) === true && resolvePet(null, true, undefined) === false,
        "both halves are asserted together on purpose: honouring the explicit flag WITHOUT keeping the " +
        "embedded default would have changed every caller that passes nothing, and there are more of those");
}

// ---- 2. *** THE COUNT THAT JUSTIFIED LOOSENING IT, RE-TAKEN FROM THE TREE EVERY RUN *** ----------------------
// v4419 loosened the veto after measuring that both embed=1 callers pass pet explicitly, so none of them
// moves. THAT IS A FACT ABOUT THE TREE ON THE DAY IT WAS MEASURED -- v4413's whole subject was a guard deleted
// for being inert whose inertness later stopped being true. So it is re-derived here rather than recorded.
{
    say("");
    const walk = (dir, out = []) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith("vendor")) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full, out);
            else if (/\.(html|js|mjs)$/.test(e.name)) out.push(full);
        }
        return out;
    };
    const urls = new Set();
    for (const f of walk(ENG))
        for (const m of fs.readFileSync(f, "utf8").matchAll(/avatarstage\.html\?[^"'` )\\]*/g)) urls.add(m[0]);
    const embed = [...urls].filter((u) => /[?&]embed=1/.test(u));
    const explicit = embed.filter((u) => /[?&]pet=/.test(u));
    const wouldMove = embed.filter((u) => !/[?&]pet=/.test(u));
    for (const u of embed) say(`  ${/[?&]pet=/.test(u) ? "explicit pet" : "NO pet flag "}  ${u}`);
    ok("!! *** every embed=1 caller states its own pet, so loosening the veto moved nothing that ships ***",
        embed.length > 0 && wouldMove.length === 0,
        `${embed.length} embed callers, ${explicit.length} explicit, ${wouldMove.length} that would change ` +
        "behaviour. IF THIS EVER GOES RED somebody added an embedded caller that relies on the old veto -- " +
        "give it an explicit pet=0 rather than restoring the veto, because the veto's reason (a 143x210 box) " +
        "was retired at v4414");
    // *** THE FIRST DRAFT OF THIS LINE ACCEPTED TWO DIFFERENT NUMBERS WITH AN `||` AND THAT IS NOT A CHECK. ***
    // A ratchet satisfiable by either N or N+1 cannot tell "nothing changed" from "exactly one thing arrived",
    // which is the whole job. The record now states the count AFTER this round and the check is an equality.
    ok("the recorded count is the count taken now -- an equality, not a range",
        embed.length === MEASURED_AT_V4419.embedCallers &&
        explicit.length === MEASURED_AT_V4419.embedCallersWithExplicitPet,
        `recorded ${MEASURED_AT_V4419.embedCallers} embed callers / ` +
        `${MEASURED_AT_V4419.embedCallersWithExplicitPet} explicit; measuring ${embed.length} / ` +
        `${explicit.length}. It was ${MEASURED_AT_V4419.embedCallersBeforeStage3d} before stage3d arrived`);
}

// ---- 3. THE ROTATION THE CHANGE EXISTS FOR ------------------------------------------------------------------
{
    say("");
    const stage = MODES.find((m) => m.id === "stage3d");
    ok("stage3d exists and mounts avatarstage.html", !!stage && /avatarstage\.html/.test(stage.src));
    ok("!! and it asks for BOTH flags that make it the full stage rather than another focus view",
        /scene=diorama/.test(stage.src) && /pet=1/.test(stage.src),
        stage.src + " -- scene=diorama is the room where face/avatarStage.js puts 'the avatar + 3 gauges + " +
        "llama all sit together as one group'; pet=1 is the llama, and it only reaches the page at all " +
        "because of the v4419 rule above");
    ok("!! the tail is stage3d -> gauges3000 -> blobgpu, the order that was asked for",
        MODES.slice(-3).map((m) => m.id).join(",") === "stage3d,gauges3000,blobgpu",
        MODES.slice(-3).map((m) => m.id).join(" -> "));
    ok("the cycle still wraps with twelve modes",
        MODES.length === 12 && nextMode(MODES[MODES.length - 1].id) === MODES[0].id,
        MODES.length + " modes, last -> " + nextMode(MODES[MODES.length - 1].id));
    // *** AND THE STAGE MODE IS THE ONLY ONE ASKING FOR A PET, which is what stops a later edit from turning
    // the llama on in the compact rigged slots that were never meant to have it.
    const withPet = MODES.filter((m) => m.src && /[?&]pet=1/.test(m.src)).map((m) => m.id);
    ok("!! exactly one mode asks for the llama, and it is the full-stage one",
        withPet.length === 1 && withPet[0] === "stage3d", withPet.join(", ") || "(none)");
}

console.log("stageFlags-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
