// WebGLEngine/ui/gaugeInfoPanel.js — v3553
// ---------------------------------------------------------------------------------------------------------------
// THE GAUGE SPACE, SHARED WITH AN INFO PANEL — and hover and select made to mean different things.
//
// Keith's design: the dials row becomes tabbed. [Gauges] is what it is now; [Hover/Select a Panel:] takes the
// same space, and the six gauges shrink to a single line of numbers so nothing is lost while the info panel has
// the room. The panel that used to open on the right appears here instead.
//
// *** THE ONE THING I PUSHED BACK ON, AND WHY. *** If hover and select both repaint the panel, then dragging the
// pointer across a list of links STROBES it -- and worse, you cannot read the thing you just selected, because
// your pointer is still travelling over other links on its way somewhere. So:
//
//     HOVER  -- fills the panel ONLY IF NOTHING IS PINNED. Ambient, free, and it reverts on leave.
//     SELECT -- PINS. The tab title says so, hover stops overwriting it, and an explicit release un-pins.
//
// That is not a style preference: a hover-driven panel is unreadable precisely when it is most useful, which is
// while you are comparing two entries by pointing at them in turn.
//
// AND THE SIX GAUGES FIT ON ONE LINE. Measured against the live config: server.html declares exactly six
// (cpu, ram, gpu, swekpeers, swekremotepeers, battery), and a compact "CPU 12% · RAM 61% · …" line is well
// inside the width the dials already occupy. Nothing is hidden when the info tab is up; it is reduced.
//
// This file is the LOGIC and the DOM wiring, kept separate so the parts that can be reasoned about -- what pins,
// what reverts, what the mini-line says -- are testable without a browser. ui/gaugeInfoPanel-selfcheck.mjs runs
// them headless.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** The gauge sources server.html declares, in order. Exported so the gate checks the real six, not a copy. */
export const MINI_ORDER = ["cpu", "ram", "gpu", "swekpeers", "swekremotepeers", "battery"];
export const MINI_LABEL = { cpu: "CPU", ram: "RAM", gpu: "GPU", swekpeers: "PEERS", swekremotepeers: "REMOTE", battery: "BATT" };

/** One compact line from a stats object. Absent is rendered as "—", never as 0. */
export function miniLine(stats = {}) {
    return MINI_ORDER.map((k) => {
        const v = stats[k];
        const shown = (v === null || v === undefined || Number.isNaN(v)) ? "\u2014" : (Math.round(v) + "%");
        return MINI_LABEL[k] + " " + shown;
    }).join("  \u00b7  ");
}

/**
 * THE SELECTION MODEL, as a plain object so it can be driven and asserted without a DOM.
 *
 * `hover(x)` is a suggestion; `select(x)` is a commitment. The whole point is that the second survives the first.
 */
export function makeSelection() {
    let pinned = null, hovered = null;
    return {
        hover(item) { hovered = item || null; return this.current(); },
        leave() { hovered = null; return this.current(); },
        select(item) { pinned = item || null; hovered = null; return this.current(); },
        release() { pinned = null; return this.current(); },
        /** What the panel should show. Pinned wins; hover only fills an empty panel. */
        current() { return pinned || hovered || null; },
        isPinned() { return pinned !== null; },
        /** The tab title. Empty state is Keith's wording, so the label teaches the interaction. */
        title() {
            if (pinned) return "\ud83d\udccc " + (pinned.title || pinned.id || "Selected") + "  \u2715";
            if (hovered) return (hovered.title || hovered.id || "Preview");
            return "Hover/Select a Panel:";
        },
        state() { return pinned ? "pinned" : hovered ? "preview" : "empty"; },
    };
}

/**
 * Describe a link for the info panel. Kept small: a title, a kind, and lines a reader actually wants.
 *
 * v3623 -- THE NOTE NOW HAS A THIRD SOURCE. Keith asked for a real summary in the info panel, and almost no
 * link carries data-info or a title attribute -- they are generated from drawers and buckets, not hand-written
 * per link. What DOES exist, unused, is <meta name="demo:desc"> on 120 of 355 pages (v822's "universal viewer
 * discovery meta", which nothing had ever read). buildPageIndex.mjs now carries it into page-index.json's `d`
 * field, so `lookup` here is that field, keyed by filename.
 *
 * `lookup` IS OPTIONAL AND describe() STAYS PURE -- no fetch inside this function -- so the gate can drive it
 * headless with a fake lookup rather than a real page-index.json, and mountGaugeInfo is the only place that
 * actually fetches anything.
 */
export function describe(el, lookup) {
    if (!el) return null;
    const href = el.getAttribute("href") || "";
    const title = (el.getAttribute("data-info-title") || el.textContent || href).trim().replace(/\s+/g, " ");
    const kind = el.getAttribute("data-kind") || (href.startsWith("/?go=") ? "engine" : href ? "page" : "");
    // ORDER OF PRECEDENCE: an EXPLICIT data-info on the element wins (somebody wrote it on purpose for THIS
    // link); the generic title attribute is next; the page-wide description is the fallback, never the winner
    // -- a link-specific note is more likely to be about the reason THIS link exists than a page's own summary.
    let note = el.getAttribute("data-info") || el.getAttribute("title") || "";
    if (!note && typeof lookup === "function") {
        const found = lookup(href);
        if (found) note = found;
    }
    return { id: href || title, title, kind, note, href };
}

/**
 * v3622 -- AUTO-RAISE ON HOVER, AUTO-RETURN WHEN THE POINTER SETTLES. Keith asked for the tab to switch itself.
 *
 * THE HARD PART IS NOT THE TIMER, IT IS NOT FIGHTING THE USER. Three rules, and each exists because the
 * alternative is worse:
 *
 *   RAISE IS DELAYED.  A pointer crossing a list passes over many links on its way somewhere. Raising on the
 *                      first mouseover makes THE TAB ITSELF strobe -- the same failure v3553 solved for the
 *                      panel CONTENT, one level up. So a hover must persist before it counts.
 *   RETURN IS SLOWER.  Moving from one link to the next passes over dead space. A return as quick as the raise
 *                      would flap between tabs while the pointer travels a list, so the gap between the two
 *                      delays is what makes it feel stable rather than the delays themselves.
 *   ONLY UNDO WHAT IT DID.  If the tab was raised BY HOVER, hovering away may lower it. If the USER chose the
 *                      tab -- clicked it, or pinned something -- NOTHING AUTOMATIC MAY EVER TAKE IT AWAY. An
 *                      auto-revert that closed a panel somebody deliberately opened is worse than no automation.
 *
 * The timers are INJECTED so this is drivable without a browser and without waiting in real time: the gate steps
 * a fake clock. A behaviour that could only be checked by watching it is a behaviour nobody checks.
 */
export function makeAutoTab({ raiseMs = 140, returnMs = 1400, setTimer, clearTimer } = {}) {
    const st = setTimer || ((f, ms) => setTimeout(f, ms));
    const ct = clearTimer || ((h) => clearTimeout(h));
    let pending = null, autoRaised = false;
    // THE HANDLE IS INSIDE THE RECORD. Passing the record itself silently cancels nothing -- clearTimeout
    // ignores a bad argument rather than throwing -- so every "cancel" would be a no-op AND LOOK FINE. My own
    // gate caught exactly that on its first run: two checks about cancellation failed while the code read right.
    const cancel = () => { if (pending !== null) { ct(pending.h); pending = null; } };
    return {
        /** True only while the CURRENT info tab was put there by hover rather than by the user. */
        isAutoRaised() { return autoRaised; },
        pendingKind() { return pending === null ? null : pending.kind; },
        /** The pointer is over something describable. Schedule a raise unless the info tab is already up. */
        hover(currentTab, raise) {
            cancel();
            if (currentTab === "info") return;                 // already there; nothing to schedule
            const h = st(() => { pending = null; autoRaised = true; raise(); }, raiseMs);
            pending = { kind: "raise", h };
        },
        /**
         * *** v3787 -- THE HOVER BRIDGE. Keith: "when i unhover over a button, the info panel needs to stay
         * long enough that i can move the mouse to the info panel and click a link that is there."
         * *** THAT IS NOT THE SAME ASK AS v3778's LONGER DWELL, AND LENGTHENING returnMs CANNOT SATISFY IT.
         * A TIMEOUT IS A RACE AGAINST THE HAND: whatever the number, a pointer that pauses on the way -- to
         * read the panel, or because the link is far -- still loses it, and the panel vanishes UNDER THE
         * CURSOR at the moment of the click. 4000 ms made that rarer and did not make it stop. ***
         * keep() is the answer: THE POINTER ARRIVING AT THE PANEL CANCELS THE RETURN OUTRIGHT, so the panel
         * stays for as long as the pointer is on it and no timer is racing anybody. The dwell still covers the
         * TRAVEL; the bridge covers the ARRIVAL.
         */
        keep() { if (pending !== null && pending.kind === "return") { cancel(); return true; } return false; },

        /** The pointer left. Only schedule a return if WE raised the tab. */
        leave(currentTab, lower) {
            cancel();
            if (currentTab !== "info" || !autoRaised) return;   // the user's tab is the user's
            const h = st(() => { pending = null; autoRaised = false; lower(); }, returnMs);
            pending = { kind: "return", h };
        },
        /** Any deliberate act -- clicking a tab, pinning a selection -- takes ownership away from the automation. */
        userTook() { cancel(); autoRaised = false; },
    };
}

/**
 * Mount the tab strip over the dials host.
 *
 * `dialsEl` keeps its gauges; when the info tab is up the dials are HIDDEN AND THE MINI-LINE SHOWN, so the
 * numbers never disappear -- they are reduced. Returns handles so server.html wires events without this file
 * knowing what a link is.
 */
export function mountGaugeInfo({ dialsEl, host, getStats, barMount = null, barAfter = null,
                                 // *** v3778 -- returnMs 1400 -> 4000. Keith: "it goes away almost immediately."
                                 // 1.4 s is enough to read a LABEL and not enough to read a SENTENCE, and the
                                 // panel's own placeholder invites reading one. The raise delay is UNCHANGED at
                                 // 140 ms -- that one exists so a pointer TRAVELLING ACROSS links does not
                                 // strobe the panel, and lengthening it would make the panel feel sluggish to
                                 // summon while doing nothing about how long it stays. TWO DELAYS, TWO JOBS. ***
                                 raiseMs = 140, returnMs = 4000, hideWith = [], dockGauges = null,
                                 fixedH = 0, dockMax = 0,
                                 dockScale = 0.8 } = {}) {
    if (!dialsEl || !host) return null;
    const sel = makeSelection();
    let tab = "gauges";
    // v3823 -- HARD LOCK ON THE INFO TAB. pinInfo() defeats the AUTOMATION (userTook clears autoRaised), but on
    // the rig the dials still reappeared inside the narrow stage column when a panel was open -- a stray tab
    // click, a hover path, or a repaint was still able to call show("gauges") and drop the six-gauge row into a
    // container sized for text. While locked, show() refuses anything but "info", so a staged panel CANNOT show
    // the gauges or the avatar by any path. The lock is owned here and released on restore.
    let locked = false;

    // v3623 -- PAGE-INDEX DESCRIPTIONS, FETCHED ONCE AND KEPT IN CLOSURE. A Map rather than the raw JSON so a
    // miss is a plain `undefined` and the caller never has to know the shape of page-index.json.
    let pageDesc = null;
    (async () => {
        try {
            const j = await fetch("/page-index.json", { cache: "no-store" }).then((r) => r.json());
            const m = new Map();
            for (const p of (j && j.pages) || []) if (p && p.f && p.d) m.set(p.f, p.d);
            pageDesc = m;
        } catch { pageDesc = new Map(); }   // OFFLINE OR MISSING is a MISS, not a crash -- the panel still works
    })();
    /** href -> description, or "" on a miss (unfetched, no match, or a non-page href like /?go=). */
    function lookupDesc(href) {
        if (!pageDesc || !href) return "";
        const file = href.replace(/^\/+/, "").split(/[?#]/)[0];
        return pageDesc.get(file) || "";
    }

    const bar = document.createElement("div");
    bar.id = "giTabBar";
    bar.style.cssText = "display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap;";
    const mkTab = (k, label) => {
        const b = document.createElement("button");
        b.className = "gtab"; b.dataset.giTab = k; b.textContent = label;
        b.style.cssText = "font:bold 11px ui-monospace,monospace;cursor:pointer;";
        return b;
    };
    const tGauges = mkTab("gauges", "\u2699 Gauges");
    const tInfo = mkTab("info", sel.title());
    bar.appendChild(tGauges); bar.appendChild(tInfo);

    const mini = document.createElement("div");
    mini.id = "giMini";
    mini.style.cssText = "display:none;font:11px ui-monospace,monospace;color:#9fe6c0;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:#0a120e;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

    const info = document.createElement("div");
    info.id = "giInfo";
    info.style.cssText = "flex:1 1 auto;min-width:0;border:1px solid #1e4a30;border-radius:8px;background:#0a120e;padding:8px 10px;min-height:210px;";

    // *** v3671 -- THE LEFT COLUMN IS A VERTICAL DOCK, NOT A LINE OF TEXT. *** Keith: the info panel's left
    // side showed "CPU -- RAM -- GPU --" and should instead be the SweK robot with its brain dome above a
    // vertical stack of the SAME SVG gauges the rest of the engine docks (ui/pageGauges.js, ui/dockedGauges.js).
    // THE RAIL SETS NO WIDTH. v3667's stage rail had to derive 232px because #dials carries min-width:360px; a
    // one-column gauge set has no such floor, so the rail is flex:none and sizes to its own content. A typed
    // width here would be a number nobody could justify and would clip the moment the scale changed.
    const row = document.createElement("div");
    row.id = "giRow";
    row.style.cssText = "display:none;gap:10px;align-items:stretch;";
    const dock = document.createElement("div");
    dock.id = "giDock";
    dock.style.cssText = "flex:none;display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#0a120e;overflow:hidden;";
    row.appendChild(dock); row.appendChild(info);

    // THE TEXT LINE IS KEPT AS THE FALLBACK AND NOTHING ELSE. If the dock cannot be built -- no dynamic import,
    // which is exactly the case under jsdom, or a module that fails to load -- the panel must still say what the
    // machine is doing rather than showing an empty rail. miniLine() is that fallback, and it is the SAME
    // numbers from the SAME getStats, so the two can never disagree. It is NOT rendered when the dock is up.
    let dockSet = null, dockTried = false, dockOK = false;
    mini.style.cssText += "flex:none;";
    dock.appendChild(mini);

    async function buildDock() {
        if (dockTried) return dockOK;
        dockTried = true;
        try {
            const [{ createSwekRobot }, { mountSvgGaugeSet }] = await Promise.all([
                import("/ui/swekRobot.js"), import("/ui/svgGaugeSet.js"),
            ]);
            // v3743 -- createSwekRobot returns a HANDLE ({ el, play, ... }), not a Node. The old
            // dock.insertBefore(bot, ...) threw "parameter 1 is not of type 'Node'", buildDock's catch set
            // dockOK=false, and the panel fell back to the "CPU -- RAM -- GPU --" text LINE -- which is exactly
            // what shipped on server.html (no robot, no vertical stack). It was never caught because a dynamic
            // import is unavailable under jsdom, so the selfcheck can only ever reach the fallback path. Insert
            // the ELEMENT, and keep the handle so a later frame could drive its animations.
            const bot = createSwekRobot({ width: 58, height: 86 });
            if (bot && bot.el) dock.insertBefore(bot.el, dock.firstChild);
            try { window._giDockRobot = bot; } catch (_) {}
            const gh = document.createElement("div");
            dock.insertBefore(gh, mini);
            // columns:1 IS the vertical stack -- svgGaugeSet already grids by column count, so no second
            // layout is written here. AND start() IS NEVER CALLED: the set is driven by setStats from the
            // caller's own getStats, so this dock owns NO timer and makes NO request. See svgGaugeSet v3671.
            // *** v3778 -- `dockMax` TRIMS THE VERTICAL STACK. The dock showed all six because it was handed the
            // page's whole list; six at dock scale is a tall thin column that fights the info body for height.
            // TRIMMED HERE RATHER THAN BY PASSING A SHORTER LIST, so the page keeps ONE declaration of which
            // gauges it shows and the dock states its own limit. 0 means "all", so an unset caller is unchanged.
            const dockList = (dockMax > 0 && Array.isArray(dockGauges)) ? dockGauges.slice(0, dockMax) : dockGauges;
            dockSet = mountSvgGaugeSet(gh, { columns: 1, scale: dockScale, gauges: dockList || undefined });
            if (dockSet && typeof dockSet.setStats !== "function") { dockSet = null; throw new Error("svgGaugeSet has no setStats"); }
            mini.style.display = "none";                    // the dock renders the numbers; the line is spare
            dockOK = true;
        } catch (e) {
            dockOK = false;                                 // the fallback line stays, and says so in the title
            try { mini.title = "gauge dock unavailable: " + (e && e.message || e); } catch (_) {}
        }
        return dockOK;
    }
    function paintDock() {
        const st = (typeof getStats === "function" && getStats()) || {};
        if (dockOK && dockSet) { try { dockSet.setStats(st); mini.style.display = "none"; return; } catch (e) {} }
        // *** THE FALLBACK HAS TO BE MADE VISIBLE, AND MY FIRST VERSION DID NOT. *** mini's own cssText carries
        // display:none from when it was hidden behind the gauges tab, so setting only its textContent left an
        // EMPTY RAIL on exactly the path that exists to stop the rail being empty. A fallback that is never
        // shown is not a fallback; it is a second way to fail quietly.
        mini.textContent = miniLine(st);
        mini.style.display = "block";
    }

    // v3575 -- THE TAB BAR CAN BE MOUNTED SOMEWHERE ELSE, and server.html puts it in the ticker row.
    // It used to sit on its own line directly above the dials, which cost a full row of vertical space to two
    // buttons while the ticker beside it ran half empty. `barMount` + `barAfter` let the caller place it after
    // the mute icon so the scrolling text starts to the RIGHT of the tabs. THE PANEL ITSELF DOES NOT MOVE --
    // only the two buttons that switch it -- because the info body needs the width the gauges have.
    if (barMount) {
        bar.style.margin = "0";                       // inside a row, the bottom margin would push the row open
        bar.style.flex = "none";
        if (barAfter && barAfter.parentElement === barMount) barMount.insertBefore(bar, barAfter.nextSibling);
        else barMount.insertBefore(bar, barMount.firstChild);
    } else {
        host.insertBefore(bar, dialsEl);
    }
    host.insertBefore(row, dialsEl.nextSibling);

    function renderInfo() {
        const cur = sel.current();
        tInfo.textContent = sel.title();
        tInfo.classList.toggle("open", tab === "info");
        tGauges.classList.toggle("open", tab === "gauges");
        if (!cur) {
            info.innerHTML = '<div class="muted" style="font-size:11.5px">Point at any link to preview it here. '
                + 'Click to <b>pin</b> it, so the panel stays put while you point at something else.</div>';
            return;
        }
        const kindNote = cur.kind === "engine"
            ? "an engine mode or demo \u2014 exists only while the engine is running"
            : cur.kind === "page" ? "a page \u2014 a file you can open, bookmark and screenshot" : "";
        info.innerHTML =
            '<div style="color:var(--go);font-weight:bold;font-size:12px;margin-bottom:5px;">' + esc(cur.title) + '</div>'
            + (kindNote ? '<div class="muted" style="font-size:11px;margin-bottom:6px;">' + kindNote + '</div>' : "")
            + (cur.note ? '<div style="font-size:11.5px;line-height:1.5;">' + esc(cur.note) + '</div>' : "")
            + (cur.href ? '<div style="margin-top:7px;"><a href="' + esc(cur.href) + '" target="_blank" style="font-size:11px;">open \u2197</a></div>' : "")
            + (sel.isPinned() ? '<div class="muted" style="font-size:10.5px;margin-top:8px;">pinned \u2014 hover will not overwrite this. Click the \u2715 on the tab to release.</div>' : "");
    }
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    // *** v3659 -- THE SWAP MUST NOT MOVE THE PAGE. The gauges pane and the info pane are different heights, and
    // hiding one to show the other let everything below JUMP UP AND BACK DOWN every time the tab changed -- and
    // v3622's automation changes it ON ITS OWN, so the page moved while nobody was touching it.
    //
    // The lock is taken from the GAUGES pane, measured ONCE while it is visible, and applied to the shared host.
    // Measuring the gauges rather than the taller of the two is deliberate: the gauges are the default and the
    // resting state, so the layout below sits where the gauges put it and the info pane fits inside that.
    // Re-measured on resize, because a narrow window rewraps the dials and the old number would then be wrong. ***
    let _lockH = 0;
    /**
     * *** v3778 -- THIS SET A FLOOR AND KEITH ASKED FOR A HEIGHT. `minHeight` alone stops the panel SHRINKING
     * the page and does nothing about it GROWING one: a long info body pushed everything below it down, which
     * is the "restructures the page so hard" he saw. A pane that can only get taller is not a fixed pane.
     * NOW BOTH BOUNDS ARE SET, and `fixedH` lets a caller state the number outright rather than depending on
     * whatever the gauges happened to measure at mount time. THE MEASURED VALUE IS STILL THE FALLBACK, so a
     * page that passes nothing behaves as before except that it also stops growing. ***
     */
    function lockHeight() {
        try {
            if (fixedH > 0) { _lockH = fixedH; }
            else {
                if (tab !== "gauges") return;             // only the gauges pane defines the height
                const h = host.getBoundingClientRect().height;
                if (h > 40) _lockH = h;
            }
            if (_lockH > 40) {
                host.style.minHeight = _lockH + "px";
                host.style.height = _lockH + "px";
                host.style.maxHeight = _lockH + "px";
                host.style.overflow = "hidden";           // a body longer than the box SCROLLS ITS OWN PANE
                // *** v3787 -- THE WIDTH, WHICH v3778 LEFT ALONE. It set a HEIGHT and said nothing about the
                // horizontal axis, so the panel still took whatever width its content asked for and SHRANK on
                // a short info body -- Keith: "needs to be set to full set width/100% and not shrink".
                // A BOX THAT IS FIXED IN ONE AXIS AND FLUID IN THE OTHER STILL MOVES THE PAGE. ***
                host.style.width = "100%";
                host.style.boxSizing = "border-box";      // or the 100% plus padding overflows its parent
                host.style.flex = "1 1 100%";             // the row is a flexbox; width alone loses to flex-basis
            }
        } catch (e) {}
    }
    try { window.addEventListener("resize", () => { host.style.minHeight = ""; setTimeout(lockHeight, 60); }); } catch (e) {}

    function show(which) {
        if (locked && which !== "info") return;           // v3823 -- staged: the gauges cannot come back by any path
        if (which === "info") lockHeight();               // capture the resting height BEFORE the gauges vanish
        tab = which;
        const infoUp = which === "info";
        dialsEl.style.display = infoUp ? "none" : "";
        // *** v3671 -- THE AVATAR GOES WITH THE DIALS. *** Keith: "the info panel should also replace the
        // avatar that shows on the info's right." #dialsRobot is a SIBLING of #dials, not a child, so hiding
        // the dials left the avatar standing beside the panel -- the swap was replacing half a row. The
        // caller names the extra elements rather than this file reaching for an id: gaugeInfoPanel must not
        // know server.html's markup, and the SAME panel is meant to be mountable elsewhere.
        for (const el of hideWith) { try { if (el) el.style.display = infoUp ? "none" : ""; } catch (e) {} }
        row.style.display = infoUp ? "flex" : "none";
        if (infoUp) { paintDock(); buildDock().then((ok) => { if (ok && tab === "info") paintDock(); }); }
        renderInfo();
    }

    // v3622 -- the automation, and EVERY deliberate click takes ownership off it.
    const auto = makeAutoTab({ raiseMs, returnMs });
    tGauges.addEventListener("click", () => { auto.userTook(); show("gauges"); });
    tInfo.addEventListener("click", (ev) => {
        auto.userTook();
        // the ✕ releases rather than switching tabs, so a pin can be dropped without leaving the panel
        if (sel.isPinned() && ev.offsetX > tInfo.clientWidth - 18) { sel.release(); show("info"); return; }
        show("info");
    });

    // *** v3787 -- THE BRIDGE IS WIRED HERE, INSIDE THE MODULE, RATHER THAN LEFT FOR EACH PAGE TO REMEMBER.
    // A hook nobody attaches is a control that does nothing, which this tree has now shipped a gate about
    // (v3783's deaf knob). `info` is the pane holding the links, so entering it cancels the return and
    // leaving it re-arms one. Guarded because a caller may pass a host that is not in a document yet. ***
    try {
        info.addEventListener("pointerenter", () => auto.keep());
        info.addEventListener("pointerleave", () => auto.leave(tab, () => show("gauges")));
    } catch (e) {}

    show("gauges");

    return {
        el: { bar, mini, info, row, dock },
        _dock: () => ({ built: dockTried, ok: dockOK, set: dockSet }),
        selection: sel,
        showGauges: () => show("gauges"),
        showInfo: () => show("info"),
        // NAME KEPT: server.html drives this on its own 2s tick and it is what feeds the dock, so the dock is
        // never a second clock either -- one poll, one repaint schedule, two views that cannot disagree.
        refreshMini() { if (tab === "info") paintDock(); },
        /**
         * v3622 -- hover now RAISES the tab as well as filling it, after a delay so a travelling pointer does
         * not strobe it. A PIN STILL WINS: nothing automatic runs while something is pinned.
         */
        onHover(el) {
            if (sel.isPinned()) return;
            sel.hover(describe(el, lookupDesc));
            if (tab === "info") renderInfo(); else auto.hover(tab, () => show("info"));
        },
        onLeave() {
            if (sel.isPinned()) return;
            sel.leave();
            if (tab === "info") renderInfo();
            auto.leave(tab, () => show("gauges"));
        },
        /**
         * *** v3787 -- THE POINTER ARRIVED AT THE PANEL ITSELF. Cancel the scheduled return outright: the
         * panel stays while the pointer is on it, with NO TIMER RACING THE HAND. Wired to the host's
         * pointerenter below. Returns whether it actually cancelled, so a caller can tell a real rescue from
         * a no-op. ***
         */
        onPanelEnter() { return auto.keep(); },
        /** Leaving the panel re-arms the ordinary return, so it does not stay up for ever. */
        onPanelLeave() { auto.leave(tab, () => show("gauges")); },
        /** Selecting pins AND raises the panel, because a click is a request to look at the thing. */
        onSelect(el) { auto.userTook(); sel.select(describe(el, lookupDesc)); show("info"); },
        /**
         * *** v3812 -- HOLD THE INFO TAB UP FOR AS LONG AS A CALLER OWNS THE ROW, OR HAND IT BACK. ***
         *
         * server.html moves this whole row beside a presented panel, where the gauges and the avatar must NOT
         * be what shows: Keith, on the rig, of a clicked drawer -- "the gauges and avatar should not be shown
         * on a clicked server.html open panel". Raising the info tab is what hides them, because show("info")
         * already hides dialsEl and everything in hideWith. So the stage does not reach into this module's
         * DOM; it asks for the tab it wants and this file decides what that means.
         *
         * *** IT GOES THROUGH userTook() AND THAT IS THE WHOLE MECHANISM, NOT A COURTESY. *** v3622's rule is
         * that the automation may only undo what the automation did, and it enforces that with `autoRaised`:
         * leave() returns early unless the tab was raised BY HOVER. userTook() clears that flag, so no pending
         * timer can lower the tab afterwards -- and hover() ALSO returns early while the tab is already
         * "info", so no later pointer can set the flag again while the panel is up. A SEPARATE `pinned`
         * BOOLEAN WOULD HAVE BEEN A SECOND ANSWER TO "MAY THIS TAB MOVE", and the two would disagree the
         * first time somebody clicked a tab with a panel on stage.
         *
         * Releasing returns to the GAUGES rather than to whatever was showing before. The gauges are this
         * row's resting state -- lockHeight() measures them for exactly that reason -- so a remembered tab
         * would put the row back in a state the layout below it was never sized for.
         */
        pinInfo(on) { auto.userTook(); show(on ? "info" : "gauges"); },
        /**
         * *** v3823 -- LOCK THE INFO TAB UP WHILE A PANEL IS ON STAGE, THEN HAND IT BACK. *** pinInfo asks the
         * automation to leave the tab alone; lockInfo makes it structurally impossible for the tab to leave
         * "info" at all -- show() refuses "gauges" while the lock is held. server.html calls this on present /
         * restore so a clicked-open drawer shows the info TEXT beside it and the six-gauge dials and the avatar
         * cannot reappear in the narrow stage column by any click, hover or repaint. The page asks for the lock
         * by name; this file owns which elements "the gauges" are (dialsEl + hideWith), exactly as pinInfo does.
         */
        lockInfo(on) {
            locked = false;                               // clear first so the show() below is allowed through
            if (on) { auto.userTook(); show("info"); locked = true; }
            else { show("gauges"); }
        },
        /**
         * *** v3821 -- BARE INFO: HIDE THE DOCK (ROBOT + VERTICAL GAUGE STACK) SO A PRESENTED PANEL GETS THE
         * INFO TEXT ALONE. *** Keith, on the rig, of a clicked open panel: "we do not want the gauges and
         * avatar shown", and the links panel takes the width the dock used to occupy. #giRow's left column is
         * the v3671 dock -- the SweK robot above a one-column gauge stack -- and it is exactly right for the
         * ORDINARY hover panel and wrong for a staged one, where the dials and the avatar have already been
         * hidden and this is a SECOND robot beside a SECOND set of gauges. The stage asks for bare; this file
         * decides which element that is, so the page never reaches into this module's DOM (the same contract as
         * pinInfo). Default is dock-shown, so nothing changes for a page that never calls this.
         */
        setDock(on) { try { dock.style.display = on ? "flex" : "none"; } catch (e) {} },
        _auto: auto,
    };
}
