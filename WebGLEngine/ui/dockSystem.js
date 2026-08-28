// FILE: ui/dockSystem.js
// VERSION: v1
//
// Edge-docked panel system. Each panel becomes a small tab on the
// canvas edge that slides its drawer in on hover. A pin button locks
// the drawer open; unpinning returns it to hover-only behavior.
//
// Panels are dock-agnostic. The Dock takes a panel's `.root` DOM
// element, reparents it into a drawer container, and overrides any
// inline absolute positioning the panel set on itself. The panel's
// internal layout/styling is otherwise untouched.
//
// Tabs stack vertically per edge with auto-computed top offsets.
// Currently supports 'left' and 'right' edges; top/bottom would be
// trivial extensions but aren't needed yet.

const COLLAPSE_DELAY_MS = 250;
const TAB_HEIGHT_PX     = 58;       // v427 — was 80; shorter so the full rail fits shorter viewports
const TAB_GAP_PX        = 4;        // v427 — was 6
const RAIL_TOP_PX       = 40;       // v416 — raised from 56 so docked panels sit higher

export class Dock {
    constructor() {
        this._panels = [];
        this._slotsByEdge = { left: 0, right: 0, bottom: 0, top: 0 };
    }

    // Wrap an existing panel. `root` is the panel's outer DOM element
    // (e.g. settingsPanel.root). `edge` is 'left' or 'right'. `label`
    // is what the tab + drawer chrome show.
    add({ id, root, edge, label, defaultPinned = false }) {
        if (!["left", "right", "bottom", "top"].includes(edge)) {
            throw new Error(`[Dock] unsupported edge: ${edge}`);
        }
        if (!root || !(root instanceof HTMLElement)) {
            throw new Error(`[Dock] panel "${id}" has no .root element`);
        }
        const slot = this._slotsByEdge[edge]++;
        const dp = new DockedPanel({ id, root, edge, label, defaultPinned, slot });
        this._panels.push(dp);
        return dp;
    }

    getById(id) {
        return this._panels.find(p => p.id === id);
    }

    // v598 — show/hide a docked panel by id (for per-demo menu gating).
    setVisible(id, v) {
        const p = this.getById(id);
        if (p) p.setVisible(v);
    }

    // v598 — re-pack the visible tabs on each edge so hiding one doesn't
    // leave a gap in the rail. Call after a batch of setVisible() changes.
    reflow() {
        const counts = { left: 0, right: 0 };
        for (const p of this._panels) {
            if (p.visible === false) continue;
            if (p.edge !== "left" && p.edge !== "right") continue;   // v1584 — minitabLayout owns the top/bottom rails
            const slot = counts[p.edge]++;
            const topPx = RAIL_TOP_PX + slot * (TAB_HEIGHT_PX + TAB_GAP_PX);
            if (p.tab) p.tab.style.top = `${topPx}px`;
            if (p.drawer) {
                p.drawer.style.top = `${topPx}px`;
                p.drawer.style.maxHeight = `calc(100vh - ${topPx}px - 12px)`;
            }
        }
    }
}

class DockedPanel {
    constructor({ id, root, edge, label, defaultPinned, slot }) {
        this.id = id;
        this.root = root;
        this.edge = edge;
        this.label = label;
        this.slot = slot;
        this.pinned = defaultPinned;
        this.expanded = defaultPinned;
        this._collapseTimer = null;

        this._build();
        this._wire();
        this._update();
    }

    // ---- DOM construction ------------------------------------------

    _build() {
        const topPx = RAIL_TOP_PX + this.slot * (TAB_HEIGHT_PX + TAB_GAP_PX);

        // Tab — visible on the edge always
        const tab = document.createElement("div");
        tab.className = `dock-tab dock-tab-${this.edge}`;
        tab.dataset.dockid = this.id;   // v1583 — lets minitabLayout pair the tab with its drawer
        tab.textContent = this.label;
        // v1583/1584 — vertical edges get the slot-based top + a min-height; bottom/top edges are
        // positioned horizontally by minitabLayout, so just pin to the bottom initially.
        if (this.edge === "left" || this.edge === "right") { tab.style.top = `${topPx}px`; tab.style.minHeight = `${TAB_HEIGHT_PX}px`; }
        else { tab.style.bottom = "0px"; }
        document.body.appendChild(tab);
        this.tab = tab;

        // Drawer — slides in from the edge, contains panel + chrome.
        const drawer = document.createElement("div");
        drawer.className = `dock-drawer dock-drawer-${this.edge}`;
        drawer.dataset.dockid = this.id;   // v1583 — paired with the tab for minitabLayout drawer-follow
        // v1583/1584 — vertical edges anchor by slot top; bottom/top edges slide up/down (minitabLayout
        // sets the precise offsets), so give a sane initial bottom anchor here.
        if (this.edge === "left" || this.edge === "right") { drawer.style.top = `${topPx}px`; drawer.style.maxHeight = `calc(100vh - ${topPx}px - 12px)`; }
        else { drawer.style.bottom = "30px"; drawer.style.maxHeight = "calc(100vh - 60px)"; }
        // v416 — flex column + viewport-bounded max-height so the chrome
        // title stays pinned and the panel body scrolls when it's taller
        // than the screen (was: tall panels ran off the bottom edge).
        drawer.style.display = "flex";
        drawer.style.flexDirection = "column";

        // Chrome strip — small LCARS-style title bar + pin button.
        const chrome = document.createElement("div");
        chrome.className = "dock-chrome";
        chrome.style.flex = "0 0 auto";    // v416 — pinned, never scrolls
        const title = document.createElement("span");
        title.className = "dock-chrome-title";
        title.textContent = this.label;
        const pin = document.createElement("div");
        pin.className = "dock-pin";
        pin.title = "Pin / unpin";
        chrome.appendChild(title);
        chrome.appendChild(pin);
        drawer.appendChild(chrome);
        this.pinBtn = pin;

        // Reparent the panel root into the drawer
        this._mountPanelRoot();
        drawer.appendChild(this.root);

        document.body.appendChild(drawer);
        this.drawer = drawer;
    }

    // The panel set its own `position: absolute` and edge offsets when
    // it was originally constructed. Now that it lives inside a
    // drawer (which is itself absolutely positioned) we need to
    // neutralize those styles or the panel would float in the wrong
    // place. We keep `width` because the panel's intended width is
    // useful — drawer shrinks to fit.
    _mountPanelRoot() {
        const s = this.root.style;
        s.position = "static";
        s.top = "auto";
        s.left = "auto";
        s.right = "auto";
        s.bottom = "auto";
        // v416 — fill remaining drawer height and scroll its own content.
        // minHeight:0 is required for a flex child to actually shrink +
        // show a scrollbar instead of overflowing the flex container.
        s.flex = "1 1 auto";
        s.overflowY = "auto";
        s.minHeight = "0";
    }

    // ---- behavior --------------------------------------------------

    _wire() {
        // Hover the tab → expand the drawer
        this.tab.addEventListener("mouseenter", () => {
            this._cancelCollapse();
            if (!this.expanded) this.expand();
        });
        // Hover the drawer body → keep it open
        this.drawer.addEventListener("mouseenter", () => this._cancelCollapse());
        // Leaving either schedules collapse (debounced — if mouse
        // re-enters either element before the timer fires, cancel)
        this.tab.addEventListener("mouseleave",    () => this._scheduleCollapse());
        this.drawer.addEventListener("mouseleave", () => this._scheduleCollapse());

        // Click tab — pin/unpin toggle. Round 90: when going from
        // pinned→unpinned, ALSO collapse immediately. Previously the
        // panel stayed open because the mouse was still hovering the
        // tab at click time, and unpin() only schedules a collapse if
        // the cursor isn't over the panel. Result: user clicked the
        // tab to close a stuck panel and nothing happened. Force the
        // collapse on the unpin path so the click reads as "close."
        this.tab.addEventListener("click", () => {
            if (this.pinned) {
                this.unpin();
                this.collapse();
            } else {
                this.pin();
            }
        });

        // Pin button — explicit pin/unpin without the implicit click-
        // collapses-too behavior of the tab
        this.pinBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.pinned) this.unpin();
            else             this.pin();
        });
    }

    _scheduleCollapse() {
        if (this.pinned) return;
        this._cancelCollapse();
        this._collapseTimer = setTimeout(() => {
            this._collapseTimer = null;
            this.collapse();
        }, COLLAPSE_DELAY_MS);
    }

    _cancelCollapse() {
        if (this._collapseTimer) {
            clearTimeout(this._collapseTimer);
            this._collapseTimer = null;
        }
    }

    // v4080 -- Keith: clicking the "Prompt" tab opened the drawer (chrome header visible, blue) but showed no
    // panel underneath it. *** THE DRAWER'S OWN COLLAPSE MECHANISM (a CSS transform, per .dock-drawer.expanded
    // in lcars.css) NEVER TOUCHES THE PANEL ROOT'S OWN display -- IT DIDN'T NEED TO, UNTIL SOMETHING ELSE SET
    // IT. *** ui/bootClean.js's one-shot "tuck the auto-opening panels away at boot" runs `el.style.display =
    // "none"` directly on demoMenu.root (BEFORE it is reparented into this drawer), with no knowledge that Dock
    // will later expand/collapse it by sliding the DRAWER, not by touching the root's own display. So the
    // drawer slid into view exactly as designed, and the panel inside it stayed display:none regardless --
    // an empty chrome header was the correct rendering of an actually-inconsistent state, not a mystery.
    // Fixed here rather than in bootClean.js: expand() is the one place that means "this panel's content
    // should now be visible," so it is the right place to guarantee that, whoever last touched the root's
    // inline display and for whatever reason.
    expand()   { this.expanded = true; this.root.style.display = ""; this._update(); }
    collapse() { this.expanded = false; this._update(); }
    pin()      { this.pinned = true; this.expanded = true; this.root.style.display = ""; this._update(); }

    // v598 — per-demo menu gating. Hides the whole tab+drawer when a demo
    // doesn't use this panel. Collapses it first so it can't linger open.
    setVisible(v) {
        this.visible = (v !== false);
        if (this.tab)    this.tab.style.display    = this.visible ? "" : "none";
        if (this.drawer) this.drawer.style.display = this.visible ? "flex" : "none";
        if (!this.visible) { this.expanded = false; this.pinned = false; this._update(); }
    }

    unpin() {
        this.pinned = false;
        // If the user unpinned via the chrome button while not
        // hovering, we want the panel to collapse soon. If they're
        // still hovering, leave it open until they leave.
        if (!this.tab.matches(":hover") && !this.drawer.matches(":hover")) {
            this._scheduleCollapse();
        }
        this._update();
    }

    _update() {
        this.tab.classList.toggle("expanded", this.expanded);
        this.drawer.classList.toggle("expanded", this.expanded);
        this.pinBtn.classList.toggle("pinned", this.pinned);
        this.pinBtn.textContent = this.pinned ? "●" : "○";
    }
}
