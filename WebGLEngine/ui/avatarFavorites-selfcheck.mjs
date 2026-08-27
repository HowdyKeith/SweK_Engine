// WebGLEngine/ui/avatarFavorites-selfcheck.mjs — v3557
//
// Run: node ui/avatarFavorites-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A star under the mode switch on server.html's avatar panel: hover says "Set Favorite", click opens a picker
// built from the live GPU asset list, and a chosen GLB joins the rotation as a mode.
//
// *** IT OWNS NO STORAGE, AND THAT IS THE WHOLE DESIGN. *** ui/kpopFavorites.js already exists: keyed by URL,
// shared with avatarOrientation and avatarRegistry, and read by the phone and PC avatar cycles. A second
// favourites list on this page would be the two-declarations defect this tree names more than any other -- you
// would star something here, not see it there, and never find out why. So this file has NO localStorage key of
// its own for the favourites themselves; it stores only WHICH TWO are promoted to one-click.
//
// AND IT IS A DIFFERENT AXIS FROM THE MODE SWITCH. v3556 settled that the switch carries its own five-entry list
// and does not touch the sandbox cycle. The switch chooses WHICH KIND of surface; the star chooses WHICH GLB the
// rigged surface shows. Folding them together would have made one control mean two things.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SLOTS, readSlots, writeSlots, promote, favoriteMode, slotModes, listAssets, readFavorites } from "./avatarFavorites.js";
import { MODES, allModes, setExtraModes, nextMode } from "./avatarSwitch.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();

// ---- 1. *** NO SECOND FAVOURITES STORE. *** -----------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ui/avatarFavorites.js"), "utf8");
    const keys = [...src.matchAll(/["']([\w.]+favorites?[\w.]*)["']/gi)].map((m) => m[1]);
    ok("!! this file defines NO localStorage key for the favourites themselves",
       !/kpopFavorites"\s*\]|STORAGE_KEY\s*=/.test(src) && !keys.some((k) => /kpop/i.test(k)),
       "the only key it owns is which TWO are promoted (" + SLOTS + " slots). The favourites live in " +
       "ui/kpopFavorites.js, which the sandbox already reads");
    ok("!! ...and it reads and writes through window.kpopFavorites",
       /window\.kpopFavorites/.test(src) && /typeof f\.add === "function"/.test(src),
       "so a favourite set on server.html appears in the sandbox avatar cycle BY CONSTRUCTION, rather than by " +
       "somebody remembering to sync two lists");
    ok("...and an absent store is an empty list rather than a throw",
       Array.isArray(readFavorites()) && readFavorites().length === 0,
       "the sandbox module may not have loaded yet on this page, and that is a normal state rather than an error");
}

// ---- 2. TWO SLOTS, AND SETTING A THIRD EVICTS RATHER THAN REFUSES -------------------------------------------------
{
    ok("!! two promoted slots, as asked -- '1, or 2'",
       SLOTS === 2, "more than two on a 22-pixel button is a menu pretending to be a shortcut");
    let s = writeSlots(store, []);
    s = promote(s, "A"); s = promote(s, "B");
    ok("two favourites promote cleanly, newest first",
       s.join(",") === "B,A", s.join(","));
    s = promote(s, "C");
    ok("!! a THIRD evicts the oldest rather than being refused",
       s.join(",") === "C,B" && s.length === 2,
       "a button that silently declines is a button the user presses twice and then distrusts");
    s = promote(s, "B");
    ok("...and re-promoting an existing one moves it to the front without duplicating",
       s.join(",") === "B,C" && new Set(s).size === 2);
    writeSlots(store, s);
    ok("slots round-trip through the store",
       readSlots(store).join(",") === "B,C");
}

// ---- 3. A FAVOURITE BECOMES A REAL MODE, AND A REMOVED ONE DISAPPEARS ---------------------------------------------
{
    const favs = [{ url: "MyGuy", label: "My Guy" }, { url: "Other", label: "Other" }];
    const modes = slotModes(["MyGuy", "Other"], favs);
    ok("!! a promoted favourite becomes a mode the switch already understands",
       modes.length === 2 && modes[0].kind === "frame" && /glb=MyGuy/.test(modes[0].src) && /camdock=1/.test(modes[0].src),
       modes[0].src + " — same shape and same framing as the built-in rigged mode, so nothing special-cases it");
    const stale = slotModes(["MyGuy", "Deleted"], favs);
    ok("!! a slot whose favourite was removed elsewhere DROPS OUT rather than becoming a dead button",
       stale.length === 1 && stale[0].url === "MyGuy",
       "the store is shared, so a favourite can vanish from the sandbox while this page is open. A rotation entry " +
       "that opens nothing is worse than one that is absent");
}

// ---- 4. THE ROTATION EXTENDS WITHOUT THE SWITCH KNOWING WHAT A FAVOURITE IS ----------------------------------------
{
    const base = MODES.length;
    setExtraModes(slotModes(["MyGuy"], [{ url: "MyGuy", label: "My Guy" }]));
    ok("!! promoted favourites join the rotation and it still wraps",
       allModes().length === base + 1 && nextMode("fav0") === "svg",
       allModes().map((m) => m.id).join(" -> "));
    // v4072 -- *** THIS ASSERTED THE ROSTER BY NAME AND IT WAS A SECOND DECLARATION OF SOMEBODY ELSE'S FACT. ***
    // It read `=== "svg,rigged,blob,blobgpu,thead"`, a hand-typed copy of MODES made when there were five of
    // them. avatarSwitch-selfcheck OWNS that roster and freezes it deliberately (ten ids, in order, with the
    // reasoning for the order beside it) -- and that one has been kept current through every addition, while
    // THIS copy fell behind at v4033 and stayed behind through v4046, v4050 and gauges3000. The original was
    // maintained; the copy rotted, which is the entire argument against the second declaration. THE GATE HAS
    // BEEN RED SINCE v4033 AND THE REDNESS WAS NOT THE FINDING -- the finding is that a favourites gate had an
    // opinion about the avatar roster at all.
    //
    // What this check is actually for is in its own message: favourites are APPENDED, so the base list is
    // undisturbed and a stray click still lands on the cheap default. Both halves are properties, and both are
    // now DERIVED from MODES, so adding an eleventh avatar cannot redden this file again. It is compared BY
    // OBJECT IDENTITY rather than by id, which is strictly stronger: a mutation that kept the ids and swapped a
    // src would pass a join and fails this.
    ok("...and the base modes are unchanged -- compared against MODES itself, not a copy of its names",
       allModes().slice(0, base).every((m, i) => m === MODES[i]),
       base + " base modes, identical objects in the same order. avatarSwitch-selfcheck is where the roster is " +
       "frozen BY NAME; naming it here too was a second declaration, and it is the copy that went stale");
    ok("!! ...and the cheap default is still the one a stray click lands on",
       allModes()[0] === MODES[0] && !MODES[0].heavy && !MODES[0].needs && !MODES[0].needsWebGPU,
       "MODES[0] is `" + MODES[0].id + "`, kind " + MODES[0].kind + ", with no download, no asset and no " +
       "capability requirement -- THAT is what 'cheap default first' means, and it is checked rather than " +
       "implied by a name. A favourite promoted to the front, or a heavy mode moved there, fails this");
    setExtraModes([]);
    ok("clearing the favourites returns the rotation to the base modes",
       allModes().length === base);
}

// ---- 5. AN EMPTY ASSET LIST COMES WITH A REASON --------------------------------------------------------------------
{
    const dead = await listAssets(async () => ({ ok: false }));
    ok("!! a dead asset endpoint yields an empty list AND a stated reason",
       dead.items.length === 0 && /drop one into GPU_Assets/.test(dead.why),
       "an empty picker looks identical to a broken one, and this is the absent-is-not-empty rule the boot " +
       "sidecar, deviceOwed and the launch index already hold");
    const live = await listAssets(async () => ({ ok: true, json: async () => ["RobotExpressive.glb", "notes.txt", "Astronaut.gltf"] }));
    ok("!! ...and a live one keeps only models, de-duplicated, stripped to the name the loader wants",
       live.items.map((i) => i.url).sort().join(",") === "Astronaut,RobotExpressive",
       live.why + " — notes.txt is dropped, and the extension is stripped because avatarstage resolves a bare " +
       "name to /GPU_Assets/<name>.glb");
}

// ---- 6. AND server.html MOUNTS IT UNDER THE SWITCH, WITH THE HOVER TEXT ASKED FOR --------------------------------
{
    const h = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! the star is mounted on the avatar host, below the mode switch",
       /avatarFavBtn/.test(h) && /top:27px/.test(h),
       "the switch sits at top:2px and the star at top:27px, so they stack in the panel corner");
    ok("!! hovering it says 'Set Favorite', as asked",
       /title="Set Favorite/.test(h) || /Set Favorite \\u2014/.test(h),
       "the title carries the instruction, so the affordance is discoverable without a legend");
    ok("!! choosing writes to the SHARED store, not to a local copy",
       /F\.addFavorite\(url/.test(h),
       "addFavorite goes through window.kpopFavorites — one list, and the sandbox sees it");
    ok("...and the picker is built from the live asset list rather than a hardcoded roster",
       /F\.listAssets\(\)/.test(h),
       "so a GLB dropped into GPU_Assets/Your_Avatars appears without a code change");
}

console.log(fails ? ("[avatarFavorites-selfcheck] FAILED " + fails) : "[avatarFavorites-selfcheck] all passed");
process.exit(fails ? 1 : 0);
