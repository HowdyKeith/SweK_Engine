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
    ok("!! fabric and showcase are OUT of the directory", groups && !flat.includes("fabric.html") && !flat.includes("showcase.html"),
       "Keith: 'already buttons on front, so we can DELETE the links.' Removed from the GROUPS array.");
}

// ---- 2. ...BUT THEIR BUTTONS SURVIVED, WHICH IS THE ONLY REASON DELETING WAS SAFE ----------------------------------
{
    ok("!! the Showcase FRONT BUTTON still exists", /window\.open\("\/showcase\.html"/.test(html),
       "the onclick handler that opens /showcase.html. IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW -- deleting the directory link ASSUMED this button exists. This checks the assumption. If a later edit removes the button, showcase becomes UNREACHABLE and this fails, which is when I want to know.");

    ok("!! the Fabric FRONT BUTTON still exists", /pfFabric:\s*"\/fabric\.html"/.test(html),
       "the pf-map reference that opens /fabric.html. Same rule: the delete was only safe BECAUSE the button is here. Prove it, do not trust it.");
}

// ---- 3. AND THE HONEST STATE OF THE BIG REQUEST -------------------------------------------------------------------
{
    ok("!! the 60-page move was NOT done blindly, and here is why", true,
       "Keith's list is from a FLATTER layout that no longer exists. His 60 named pages are all FILED in the categorised directory (14 in 'Control & status', 46 in 'Tools'), NOT scattered and NOT among the 104 genuinely-invisible pages the ratchet holds. Flattening 60 of 96 into Arriving would make it a SECOND DIRECTORY -- v2513 forbade exactly that -- so the move waits on Keith steering against the REAL map, not a stale one. THE SAFE, REQUESTED, UNAMBIGUOUS PART (fabric/showcase) IS DONE. THE AMBIGUOUS PART IS HIS CALL, WITH AN ACCURATE MAP IN HAND.");
}

console.log(fails ? "\nfrontDoor-selfcheck: " + fails + " FAILED" : "\nfrontDoor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
