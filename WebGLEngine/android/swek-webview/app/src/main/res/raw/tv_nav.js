// android/swek-webview/app/src/main/res/raw/tv_nav.js -- v4117
//
// D-PAD SPATIAL NAVIGATION, INJECTED INTO EVERY PAGE THE WRAPPER LOADS.
//
// *** THIS IS JAVASCRIPT ON PURPOSE, AND THAT IS THE POINT. *** The rest of the TV support is a manifest and a
// Java Activity, neither of which can be compiled in the sandbox this was written in -- no Android SDK, and
// dl.google.com is blocked (the README measured it: 403). Written as an injected script instead, the hard half
// -- does the D-pad actually reach the right control -- becomes something a headless browser can DRIVE against
// the tree's real pages with real arrow-key events. So the untestable half of this round is the small half.
//
// *** WHY A SCRIPT AND NOT CHROMIUM'S OWN SPATIAL NAVIGATION. *** Chromium has one, and WebSettings does not
// expose it: there is no setter, and the command-line flag that enables it needs adb to write
// /data/local/tmp/webview-command-line, which an app cannot do for itself. So a TV WebView app either ships
// its own or has none.
//
// *** THE CONFLICT THIS HAS TO SOLVE, WHICH IS THE WHOLE DESIGN. *** Arrow keys already mean something on a lot
// of these pages -- flight demos, es-*, chess3d and every canvas that steers a camera. Hijacking the arrows
// globally would make the wrapper navigable and the engine unusable. So there are two modes:
//
//   NAV     -- arrows move FOCUS between controls. The default, and what a TV user expects.
//   CAPTURE -- arrows go to the PAGE untouched. Entered by pressing OK on a <canvas> (or anything marked
//              data-tv-capture), left with BACK, which the Activity routes here before using it for history.
//
// Text fields are always passthrough regardless of mode: a D-pad is the only caret this device has.
"use strict";
(function () {
    if (window.__swekTvNav) return;

    var FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,' +
                    '[role="button"],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
    var CAPTURE_SEL = 'canvas,[data-tv-capture]';
    var mode = "nav";
    var hintEl = null;

    // *** A FOCUS RING IS NOT DECORATION ON A TV. *** Engine pages set `outline:none` all over, and without a
    // ring the D-pad moves an invisible cursor -- the user is pressing directions at random. Forced with
    // !important because it must beat the page's own reset, which is the thing that caused the problem.
    var style = document.createElement("style");
    style.textContent =
        ".swek-tv-focus{outline:3px solid #6fe39a !important;outline-offset:2px !important;" +
        "box-shadow:0 0 0 6px rgba(111,227,154,.22) !important;border-radius:3px}" +
        "#swek-tv-hint{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;" +
        "background:rgba(8,14,11,.92);color:#cfe9d8;border:1px solid #2a5a3a;border-radius:8px;" +
        "padding:9px 16px;font:14px/1.4 ui-monospace,monospace;pointer-events:none}";
    (document.head || document.documentElement).appendChild(style);

    function hint(msg) {
        if (!hintEl) {
            hintEl = document.createElement("div");
            hintEl.id = "swek-tv-hint";
            (document.body || document.documentElement).appendChild(hintEl);
        }
        hintEl.textContent = msg;
        hintEl.style.display = "block";
        clearTimeout(hint._t);
        hint._t = setTimeout(function () { if (hintEl) hintEl.style.display = "none"; }, 2600);
    }

    /** On screen, non-zero, not disabled, not hidden. A control nobody can see is not a target. */
    function visible(el) {
        if (el.disabled) return false;
        var r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        var cs = window.getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
        return true;
    }

    function items() {
        var out = [], all = document.querySelectorAll(FOCUSABLE);
        for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
        return out;
    }

    function centre(el) {
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    /**
     * The best control in one direction.
     *
     * *** A SCORE ALONE CANNOT EXPRESS ROWS AND COLUMNS, AND THE FIRST VERSION OF THIS WAS WRONG BECAUSE OF
     * IT. *** It ranked purely by `along + 2 * cross`, and driving it found the failure immediately: with a
     * control directly to the left at 200px and another sitting diagonally up-left at 70px, LEFT chose the
     * DIAGONAL one -- 170 against 200 -- even though the other was EXACTLY aligned. Any fixed multiplier just
     * moves where that happens; it cannot say "the thing in my row beats the thing that is merely near".
     *
     * So candidates are PARTITIONED first: anything whose rectangle overlaps the current one on the
     * perpendicular axis is in the same row (or column), and a same-row candidate always beats an off-row one
     * no matter how much closer the off-row one is. Only inside a group does distance decide, still with a
     * cross-axis penalty so a long row does not drift. That is how a person reads a remote -- LEFT means the
     * next thing along this row -- and it needs no tuned constant to be right.
     */
    function best(dir) {
        var cur = document.activeElement, all = items();
        if (!all.length) return null;
        if (!cur || cur === document.body || all.indexOf(cur) < 0) return all[0];
        var cr = cur.getBoundingClientRect(), c = centre(cur);
        var horizontal = (dir === "left" || dir === "right");
        var pick = null, bestRow = false, score = Infinity;
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el === cur) continue;
            var r = el.getBoundingClientRect(), p = centre(el);
            var dx = p.x - c.x, dy = p.y - c.y, along, cross, sameRow;
            if (horizontal) {
                along = (dir === "left") ? -dx : dx;
                cross = Math.abs(dy);
                sameRow = r.bottom > cr.top && r.top < cr.bottom;      // overlaps vertically -> same row
            } else {
                along = (dir === "up") ? -dy : dy;
                cross = Math.abs(dx);
                sameRow = r.right > cr.left && r.left < cr.right;      // overlaps horizontally -> same column
            }
            if (along <= 1) continue;                                  // not in the pressed direction at all
            var s = along + cross * 2;
            // A same-row candidate outranks every off-row one; ties inside a group fall back to the score.
            if (sameRow && !bestRow) { pick = el; bestRow = true; score = s; continue; }
            if (sameRow !== bestRow) continue;                         // off-row while we already hold a row hit
            if (s < score) { score = s; pick = el; }
        }
        return pick;
    }

    function mark(el) {
        var prev = document.querySelector(".swek-tv-focus");
        if (prev) prev.classList.remove("swek-tv-focus");
        if (!el) return;
        el.classList.add("swek-tv-focus");
        try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
        if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    /** A caret needs the arrows more than the navigator does -- always, in either mode. */
    function isTextEntry(el) {
        if (!el) return false;
        var t = (el.tagName || "").toLowerCase();
        if (t === "textarea" || t === "select") return true;
        if (t === "input") {
            var ty = (el.getAttribute("type") || "text").toLowerCase();
            return ["text", "search", "url", "email", "password", "tel", "number",
                    "range", "date", "time", "month", "week", "datetime-local"].indexOf(ty) >= 0;
        }
        return !!el.isContentEditable;
    }

    function isCaptureTarget(el) {
        return !!(el && el.matches && el.matches(CAPTURE_SEL));
    }

    var DIRS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
                 Left: "left", Right: "right", Up: "up", Down: "down" };

    function onKey(ev) {
        var dir = DIRS[ev.key];
        var active = document.activeElement;

        // OK on a canvas hands the page the controls. This is the only way an engine demo becomes playable
        // with a remote, and it is reversible, which is what makes it safe to offer.
        if ((ev.key === "Enter" || ev.key === " ") && mode === "nav" && isCaptureTarget(active)) {
            mode = "capture";
            hint("D-pad → the page. Press BACK to navigate again.");
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }
        if (mode === "capture") return;                    // the page owns every key now
        if (!dir) return;
        if (isTextEntry(active)) return;                   // the caret wins

        var target = best(dir);
        // *** NOTHING IN THAT DIRECTION MUST FALL THROUGH TO SCROLLING, NOT BE SWALLOWED. *** A page taller
        // than the screen whose last control is focused would otherwise be stuck: the arrow does nothing and
        // the rest of the page is unreachable.
        if (!target) return;
        mark(target);
        ev.preventDefault();
        ev.stopPropagation();
    }

    document.addEventListener("keydown", onKey, true);

    window.__swekTvNav = {
        version: 1,
        mode: function () { return mode; },
        /** Called by the Activity on BACK. Returns true if it consumed the press by leaving capture mode. */
        release: function () {
            if (mode !== "capture") return false;
            mode = "nav";
            hint("D-pad → navigation.");
            return true;
        },
        /** Put focus somewhere sensible on arrival, so the first press moves rather than teleports. */
        start: function () {
            var all = items();
            if (all.length) mark(all[0]);
            return all.length;
        },
        _best: best,          // exposed for the gate: the geometry is the part worth grading
        _items: items
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { window.__swekTvNav.start(); });
    } else {
        window.__swekTvNav.start();
    }
})();
