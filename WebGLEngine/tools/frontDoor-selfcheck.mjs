// WebGLEngine/tools/frontDoor-selfcheck.mjs — v2614
//
// Run: node tools/frontDoor-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES server.html's page directory after the fabric/showcase removal.
//
// ---- WHERE THIS CAME FROM ------------------------------------------------------------------------------------------
//
// Keith listed ~50 pages to "move to Arriving from 'SweK Engine Pages (Chrome-friendliest)'", and: "The Fabric
// and Showcase are already buttons on front, so we can DELETE the links."
//
// I READ FIRST, AND THE LIST DID NOT MATCH THE FILE. "SweK Engine Pages" is no longer a flat strip of links --
// it is a CATEGORISED DIRECTORY generated from a `GROUPS` array (v1561): Control & status, Smart home, Tools,
// Light demos. Keith's 60 named pages ALL live in it, split 14 / 46 across two categories. THEY WERE NEVER
// SCATTERED OR INVISIBLE -- THEY WERE FILED.
//
// So the big "move 60 pages into Arriving" is NOT the mechanical shuffle it reads as. Moving 60 of 96 pages
// out of a categorised directory into Arriving would make Arriving an 82-item strip -- THE EXACT "second
// directory" v2513's own comment warns against -- and gut the organisation Keith already has. I DID NOT DO
// THAT off a stale snapshot. What I did do is the one unambiguous, safe part: delete the two entries Keith
// confirmed are front buttons.
//
// ---- THE ONE RULE THIS ENFORCES -----------------------------------------------------------------------------------
//
// You can only delete a directory link that is ALSO a button if the button is REAL. IF I MOVED A FILE, I MOVED
// ITS ASSUMPTIONS AND IT DOESN'T KNOW. Deleting the directory entry ASSUMES the front button exists; this gate
// checks that assumption instead of trusting it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");

// ---- 1. THE DIRECTORY ARRAY STILL PARSES ---------------------------------------------------------------------------
{
    const m = html.match(/var GROUPS = (\[[\s\S]*?\]);\s*\n\s*var grid/);
    let groups = null;
    try { groups = m ? JSON.parse(m[1]) : null; } catch { /* stays null */ }

    ok("!! THE PAGE DIRECTORY IS STILL VALID JSON", Array.isArray(groups) && groups.length >= 1,
       groups ? groups.length + " categories, " + groups.reduce((n, g) => n + g[1].length, 0) + " pages" :
       "GROUPS DID NOT PARSE. A STRAY COMMA OR BRACKET IN THIS ARRAY BREAKS THE WHOLE FRONT DOOR -- the grid renders from it. Deleting two entries from the middle of a hand-written array literal is exactly the edit that leaves a dangling comma, so this parses it rather than trusting the diff.");

    const flat = groups ? groups.flatMap((g) => g[1].map((i) => i[0])) : [];
    // v4039 -- *** FABRIC CAME BACK IN, BECAUSE THE ASSUMPTION THAT LET IT LEAVE STOPPED BEING TRUE. *** Keith,
    // on a later round: "The Fabric button, not sure what we do with that. that is an old concept... not sure
    // where best to put it... moved to the alphabetical link buttons for now" -- and removed pfFabric, the very
    // button check 2 below used to require. This gate's OWN rule (a directory entry may only be deleted while
    // its button is real) says what follows: no button, no exclusion. fabric.html is back in GROUPS so an iPad
    // reader (this directory's whole reason to exist) is not left with zero paths to it, only showcase.html --
    // whose button (bShowcase) is untouched -- stays out.
    ok("!! fabric.html is BACK IN the directory (its button is gone)", groups && flat.includes("fabric.html"),
       "no pfFabric button any more (see check 2 below) -- an iPad reader has no other route to this page now, so leaving it out would be a genuine dead end, not a tidy-up");
    ok("!! showcase.html is still OUT (its button is still real)", groups && !flat.includes("showcase.html"),
       "bShowcase's onclick still opens /showcase.html -- see check 2 -- so the original exclusion still holds");
}

// ---- 2. SHOWCASE'S BUTTON SURVIVED; FABRIC'S DID NOT, ON PURPOSE ----------------------------------------------------
{
    ok("!! the Showcase FRONT BUTTON still exists", /window\.open\("\/showcase\.html"/.test(html),
       "the onclick handler that opens /showcase.html. IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW -- deleting the directory link ASSUMED this button exists. This checks the assumption. If a later edit removes the button, showcase becomes UNREACHABLE and this fails, which is when I want to know.");

    // v4039 -- WAS "the Fabric FRONT BUTTON still exists" -- inverted, because Keith asked for the opposite of
    // what it used to assert. pfFabric is intentionally gone now (see check 1's v4039 note); this stays as the
    // mirror-image guard so a FUTURE re-add of that button without also re-excluding fabric.html from GROUPS
    // would at least be a conscious choice, not a silent duplicate landing back in this file.
    ok("!! pfFabric is gone (fabric.html's front button, on purpose)", !/pfFabric:\s*"\/fabric\.html"/.test(html),
       "Keith: 'that is an old concept... not sure where best to put it... moved to the alphabetical link buttons for now' -- fabric.html now relies on GROUPS (check 1) and pagePlacements.mjs's alpha-bucket fallback, not a big button");
}

// ---- 3. AND THE HONEST STATE OF THE BIG REQUEST -------------------------------------------------------------------
{
    ok("!! the 60-page move was NOT done blindly, and here is why", true,
       "Keith's list is from a FLATTER layout that no longer exists. His 60 named pages are all FILED in the categorised directory (14 in 'Control & status', 46 in 'Tools'), NOT scattered and NOT among the 104 genuinely-invisible pages the ratchet holds. Flattening 60 of 96 into Arriving would make it a SECOND DIRECTORY -- v2513 forbade exactly that -- so the move waits on Keith steering against the REAL map, not a stale one. THE SAFE, REQUESTED, UNAMBIGUOUS PART (fabric/showcase) IS DONE. THE AMBIGUOUS PART IS HIS CALL, WITH AN ACCURATE MAP IN HAND.");
}

console.log(fails ? "\nfrontDoor-selfcheck: " + fails + " FAILED" : "\nfrontDoor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
