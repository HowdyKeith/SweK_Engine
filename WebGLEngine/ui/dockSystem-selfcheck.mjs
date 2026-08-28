// WebGLEngine/ui/dockSystem-selfcheck.mjs — v4080
//
// Run: node ui/dockSystem-selfcheck.mjs   (needs jsdom -- npm install jsdom --no-save; skips cleanly without)
//
// Keith: "When i click the PROMPT vertical side menu on the right top side, it is orange, menu line, but then
// when i click that, the horizontal PROMPT menu shows, but only the header line, and it's blue. there is no
// panel under the header line."
//
// REPRODUCED: the "Prompt" dock panel is main.js's demoMenu.root, wired via dock.add({id:"prompt",
// root: demoMenu.root, ...}). ui/bootClean.js's one-shot "tuck the auto-opening panels away at boot" runs
// `el.style.display = "none"` DIRECTLY on demoMenu.root (one of its four targets), with no knowledge that Dock
// will later reparent it into a drawer and show/hide that drawer via a CSS transform slide, never by touching
// the child root's own display. So clicking the dock tab slid the drawer into view exactly as designed --
// the dock-chrome header (blue) really is there -- while the panel's own content stayed display:none
// regardless: an empty chrome header was the CORRECT rendering of an inconsistent state, not a rendering bug
// in the chrome itself.
//
// FIXED in DockedPanel.expand()/pin() (ui/dockSystem.js): whoever last set the panel root's own display,
// and for whatever reason, opening the panel now always clears it. This is gated at the DockSystem level
// rather than in bootClean.js, because expand() is the one place in this file that means "this panel's
// content should now be visible" -- the right place to guarantee that unconditionally.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("dockSystem-selfcheck -- opening a docked panel must never leave its own content display:none\n");

let JSDOM = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* handled below */ }

console.log("0. *** SOURCE: expand()/pin() clear the panel root's own display, and the fix reads correctly ***");
{
    const src = fs.readFileSync(path.join(HERE, "dockSystem.js"), "utf8");
    ok("!! expand() sets this.root.style.display = \"\" before calling _update()",
        /expand\(\)\s*\{\s*this\.expanded = true;\s*this\.root\.style\.display = "";\s*this\._update\(\);\s*\}/.test(src));
    ok("!! pin() (the click-to-open path the tab's own click handler actually calls) does too",
        /pin\(\)\s*\{\s*this\.pinned = true;\s*this\.expanded = true;\s*this\.root\.style\.display = "";\s*this\._update\(\);\s*\}/.test(src));
    ok("...and collapse() does NOT touch the root's display (the drawer's own CSS transform owns hiding it)",
        /collapse\(\)\s*\{\s*this\.expanded = false;\s*this\._update\(\);\s*\}/.test(src));
}

if (!JSDOM) {
    console.log("\n  ----  live DOM sections SKIPPED -- jsdom is not installed here");
    console.log("        Install it with:  npm install jsdom --no-save");
} else {
    const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;

    const { Dock } = await import(pathToFileURL(path.join(HERE, "dockSystem.js")).href);

    console.log("\n1. *** REPRODUCED: A PANEL ROOT LEFT display:none BY SOMETHING ELSE (bootClean's own shape) STAYS");
    console.log("   HIDDEN AFTER THE DOCK 'OPENS' IT, on the version of expand()/pin() BEFORE this fix ***");
    {
        // The exact bootClean.js shape: hideAll() runs `el.style.display = "none"` directly on a panel's root,
        // entirely independent of and before Dock ever sees it.
        const root = document.createElement("div");
        root.textContent = "demo list contents";
        root.style.display = "none";   // bootClean's tuck-away, simulated
        document.body.appendChild(root);

        const dock = new Dock();
        const panel = dock.add({ id: "prompt", root, edge: "right", label: "Prompt" });

        ok("!! before any click, the root is (as bootClean left it) display:none",
            root.style.display === "none");

        // Simulate the OLD (pre-fix) expand: sets expanded + toggles classes, but does NOT touch root.style.
        const oldExpand = () => { panel.expanded = true; panel._update(); };
        oldExpand();
        ok("!! *** REPRODUCED: the OLD expand() leaves the drawer 'expanded' (chrome visible) but the panel's",
            panel.drawer.classList.contains("expanded") && root.style.display === "none",
            "own content is STILL display:none -- an empty chrome header with nothing under it, exactly Keith's report");
    }

    console.log("\n2. *** FIXED: THE REAL expand()/pin() (as shipped in this file) CLEAR THE OVERRIDE ***");
    {
        const root = document.createElement("div");
        root.textContent = "demo list contents";
        root.style.display = "none";
        document.body.appendChild(root);

        const dock = new Dock();
        const panel = dock.add({ id: "prompt", root, edge: "right", label: "Prompt" });
        ok("!! root starts display:none (bootClean's tuck-away, simulated)", root.style.display === "none");

        panel.expand();
        ok("!! *** expand() clears it -- the panel's own content is no longer display:none ***",
            root.style.display === "" && panel.drawer.classList.contains("expanded"));

        // The tab's real click handler calls pin() when not already pinned -- confirm that path too, on a
        // FRESH panel (a second bootClean-hidden root), since that is what a user's actual click fires.
        const root2 = document.createElement("div");
        root2.style.display = "none";
        document.body.appendChild(root2);
        const dock2 = new Dock();
        const panel2 = dock2.add({ id: "prompt2", root: root2, edge: "right", label: "Prompt" });
        panel2.tab.dispatchEvent(new window.Event("click", { bubbles: true }));
        ok("!! *** clicking the tab (pin() path, what a real user click actually fires) clears it too ***",
            root2.style.display === "" && panel2.pinned === true);
    }

    console.log("\n3. *** collapse() correctly leaves the root alone -- only the drawer's CSS transform hides it ***");
    {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const dock = new Dock();
        const panel = dock.add({ id: "x", root, edge: "left", label: "X" });
        panel.expand();
        root.style.color = "red";   // something a panel's own code might set while open, unrelated to display
        panel.collapse();
        ok("!! collapse() does not force the root's display to anything -- it stays whatever the panel itself wants",
            root.style.display === "" && !panel.drawer.classList.contains("expanded"),
            "the drawer is what actually hides via CSS transform (.dock-drawer-*.expanded), confirmed in ui/lcars.css");
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
