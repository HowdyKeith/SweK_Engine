// ui/brainTrail.js -- WHAT THE BRAIN IS ACTUALLY DOING, DRAWN FROM THE COUNTERS IT ALREADY KEEPS.
//
// v4027 -- Keith: "what visual diagram could we give our physics ai as it is thinking? can it pull related page
// view / panels and indicate processes?"
//
// *** THE BRAIN HAS NO THOUGHTS TO DRAW, AND DRAWING SOME WOULD BE THE WHOLE MISTAKE. *** The tempting build is
// the one the name "agent trail" suggests: a scrolling trace of reasoning steps. This brain does not reason in
// steps. gpuBrainBridge's activity ring records exactly THREE kinds -- hello, narrate, solve -- and a picture
// implying a richer inner life than that would be an invention, on a panel an operator glances at and believes.
//
// WHAT IT DOES HAVE IS A PIPELINE, AND THE PIPELINE IS FULLY INSTRUMENTED ALREADY. /ai/brain/health has been
// publishing every number this diagram needs for rounds: snapPosts (the engine feeding world snapshots in),
// snapGets (a brain collecting one), fieldPosts (a solved flow field coming back), hasSnapshot/hasField (whether
// each mailbox is currently full), lastFeedMsAgo/lastSolveMsAgo (how fresh each half is), solverBackend (cpu or
// gpu) and solverTruncated. /ai/brain/fleet adds the brains themselves with their measured solve speeds and the
// scheduler's role assignments. NONE OF IT WAS DRAWN ANYWHERE -- panel-brain.html renders the three-kind text
// tail and an animated SVG whose flow field is DECORATIVE ARITHMETIC (brainSvg.js computes its own field from a
// drifting sine, not from the brain's).
//
// So this draws the real thing: a DATA-FLOW MAP, engine -> mailbox -> brains -> mailbox -> engine, with every
// edge labelled by the counter that actually flows along it and every node's status taken from a measured age.
//
// *** THE PAGE LINKS ARE HAND-DECLARED, AND instruments.mjs IS WHY. *** The obvious source for "related page"
// is that registry, which carries a `page` field per instrument -- and it holds ZERO brain entries, because it
// is a registry of PHYSICS gates (208 of them, none about the brain). Pointing a brain node at a physics page to
// fill the field would be exactly the swekPage defect v4019 gated for. Each link below is a real page in this
// tree, named because somebody knows it is about that node, and brainTrail-selfcheck asserts every one exists.
//
// buildTrail() is PURE -- graph in, graph out, no DOM, no fetch -- so the gate can drive every status branch
// from fixtures instead of waiting for a brain to go stale on a real box.
"use strict";

// v4180 -- the edges below are CUBIC BEZIERS, which is exactly the shape that cannot be dash-animated without
// measuring it. ui/svgGaugeSet.js gets away with 2 * Math.PI * R because a circle's length is a formula; a
// bezier's is not, and until ui/svgPath.mjs there was nothing in this tree that could produce the number.
import { drawElement, primeDraw } from "./svgDraw.js";

export const STALE_MS = 60000;

/** Pages that really are about a stage. Verified to exist by the gate; NOT guessed from a registry. */
export const STAGE_PAGES = {
    fleet:  { href: "/brain-fleet.html",  label: "fleet" },
    brain:  { href: "/brain-bench.html",  label: "bench" },
    mind:   { href: "/panel-brain.html",  label: "live mind" },
    replay: { href: "/brain-replay.html", label: "replay" },
};

const age = (ms) => ms == null ? "never" : ms < 1000 ? "now" : ms < 60000 ? Math.round(ms / 1000) + "s" : ms < 3600000 ? Math.round(ms / 60000) + "m" : Math.round(ms / 3600000) + "h";

/**
 * The graph, from the two payloads the bridge already serves.
 *
 * STATUS IS DERIVED FROM A MEASURED AGE, NEVER FROM A FLAG ALONE: "off" when nothing has ever arrived, "stale"
 * past STALE_MS, "live" otherwise. A node that cannot be reached at all is its own state rather than a zero --
 * an unreachable bridge and an idle brain are different facts, and only one of them is a problem (v3237).
 *
 * @param {object|null} health  /ai/brain/health
 * @param {object|null} fleet   /ai/brain/fleet
 * @returns {{nodes:Array, edges:Array, reachable:boolean, note:string}}
 */
export function buildTrail(health, fleet) {
    if (!health && !fleet) {
        return { nodes: [], edges: [], reachable: false, note: "the brain bridge did not answer -- this says nothing about whether a brain is running" };
    }
    const h = health || {};
    const brains = (fleet && Array.isArray(fleet.brains)) ? fleet.brains : [];
    const assign = (fleet && fleet.scheduler && fleet.scheduler.assignments) || {};

    const feedAge = h.lastFeedMsAgo, solveAge = h.lastSolveMsAgo;
    const st = (a) => a == null ? "off" : a > STALE_MS ? "stale" : "live";

    const nodes = [
        { id: "engine", kind: "source", title: "engine", sub: "posts world snapshots",
          status: st(feedAge), detail: "last feed " + age(feedAge), page: null, col: 0 },
        { id: "inbox", kind: "mailbox", title: "snapshot", sub: h.hasSnapshot ? "holding one" : "empty",
          status: h.hasSnapshot ? st(feedAge) : "off", detail: (h.snapPosts || 0) + " in / " + (h.snapGets || 0) + " collected",
          page: null, col: 1 },
    ];
    const edges = [
        { from: "engine", to: "inbox", label: (h.snapPosts || 0) + " posts", live: st(feedAge) === "live" },
    ];

    // ONE NODE PER REAL BRAIN. No brains is not an error -- it is the hub running with nobody attached, and it
    // gets a node saying so rather than an empty column that reads like a broken diagram.
    if (!brains.length) {
        nodes.push({ id: "nobrain", kind: "brain", title: "no brain attached", sub: "nothing has said hello",
                     status: "off", detail: "registered " + (h.registeredBrains || 0), page: STAGE_PAGES.fleet, col: 2 });
        edges.push({ from: "inbox", to: "nobrain", label: "", live: false });
    } else {
        for (const b of brains) {
            const id = String(b.id || "brain");
            const role = assign[id] || b.role || "unassigned";
            const ms = (b.solveMsEwma != null) ? b.solveMsEwma.toFixed(1) + "ms" : "unmeasured";
            const busy = (b.workPriority ?? 0) > 0;
            nodes.push({
                id: "brain:" + id, kind: "brain", title: id, sub: role,
                status: b.staleSolve ? "stale" : (busy ? "live" : "idle"),
                detail: ms + " solve" + (b.ageMs != null ? " -- seen " + age(b.ageMs) : ""),
                page: STAGE_PAGES.brain, col: 2,
            });
            edges.push({ from: "inbox", to: "brain:" + id, label: "", live: !b.staleSolve });
            edges.push({ from: "brain:" + id, to: "outbox", label: "", live: !b.staleSolve });
        }
    }

    nodes.push({ id: "outbox", kind: "mailbox", title: "flow field", sub: h.hasField ? "holding one" : "empty",
                 status: h.hasField ? st(solveAge) : "off",
                 detail: (h.fieldPosts || 0) + " solved -- last " + age(solveAge), page: STAGE_PAGES.mind, col: 3 });
    nodes.push({ id: "back", kind: "sink", title: "engine", sub: "steers on the field",
                 status: st(solveAge), detail: h.solverBackend ? ("solver " + h.solverBackend + (h.solverTruncated ? " (TRUNCATED)" : "")) : "no solver reported",
                 page: null, col: 4 });
    edges.push({ from: "outbox", to: "back", label: (h.fieldPosts || 0) + " fields", live: st(solveAge) === "live" });

    // The replay ring is a REAL store with a REAL count, so it gets a node rather than being folded into a brain.
    if (h.experience != null) {
        nodes.push({ id: "exp", kind: "store", title: "experience", sub: "shared replay ring",
                     status: h.experience > 0 ? "live" : "off", detail: h.experience + " kept, seq " + (h.expSeq || 0),
                     page: STAGE_PAGES.replay, col: 3 });
        if (brains.length) for (const b of brains) edges.push({ from: "brain:" + String(b.id || "brain"), to: "exp", label: "", live: h.experience > 0, dashed: true });
    }

    return {
        nodes, edges, reachable: true,
        note: h.detail || "",
        state: h.state || "unknown",
    };
}

// ---------------------------------------------------------------------------
// Rendering. Hand-rolled SVG, no framework, no build step -- the same choice the rest of this tree makes.
const COLOR = { live: "#7fe0a4", idle: "#7f93a8", stale: "#e8c07a", off: "#e88" };
const NS = "http://www.w3.org/2000/svg";
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

const COL_W = 150, ROW_H = 58, BOX_W = 122, BOX_H = 40;

/** Lay the graph out by its declared column, stacking within a column. Deterministic: no physics, no jitter. */
export function layout(nodes) {
    const byCol = new Map();
    for (const n of nodes) { const c = n.col || 0; if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push(n); }
    const pos = new Map();
    let maxRows = 1;
    for (const [c, list] of byCol) {
        maxRows = Math.max(maxRows, list.length);
        list.forEach((n, i) => pos.set(n.id, { x: 12 + c * COL_W, y: 12 + i * ROW_H, w: BOX_W, h: BOX_H }));
    }
    const cols = Math.max(...byCol.keys()) + 1;
    return { pos, width: 12 + cols * COL_W, height: 24 + maxRows * ROW_H };
}

export function mountBrainTrail(host, opts = {}) {
    if (!host) return null;
    const pollMs = opts.pollMs || 3000;
    const wrap = document.createElement("div");
    wrap.style.font = "11px ui-monospace, Menlo, Consolas, monospace";
    wrap.style.color = "#cfe8d8";
    const svgHost = document.createElement("div");
    svgHost.style.overflowX = "auto";                       // wide graphs scroll rather than squashing
    const info = document.createElement("div");
    Object.assign(info.style, { marginTop: "6px", minHeight: "1.4em", color: "#7f93a8" });
    wrap.append(svgHost, info);
    host.appendChild(wrap);

    let timer = null, selected = null;

    function draw(trail) {
        svgHost.innerHTML = "";
        if (!trail.reachable) { info.textContent = trail.note; svgHost.innerHTML = "<div style='color:#e88;padding:8px'>brain bridge unreachable</div>"; return; }
        const { pos, width, height } = layout(trail.nodes);
        const svg = el("svg", { width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}` });

        let _drawn = 0;
        for (const e of trail.edges) {
            const a = pos.get(e.from), b = pos.get(e.to);
            if (!a || !b) continue;
            const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
            const p = el("path", {
                d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
                fill: "none", stroke: e.live ? "#2f6b46" : "#24323f", "stroke-width": e.live ? "1.6" : "1",
            });
            if (e.dashed) p.setAttribute("stroke-dasharray", "3 3");
            svg.appendChild(p);
            // v4180 -- opts.draw makes each edge draw ITSELF, staggered, so the trail assembles rather than
            // appearing. OFF by default: this mounts on a status panel that can refresh often, and a panel
            // that re-animates every refresh is worse than one that simply updates.
            // A DASHED edge is skipped deliberately -- its "3 3" pattern IS its meaning (a provisional link),
            // and the draw-in would overwrite stroke-dasharray with the path length and silently turn every
            // provisional edge solid. Two features writing the same attribute, where the later one wins and
            // the loss is invisible.
            if (opts.draw && !e.dashed) {
                // The stagger is real, not decorative: drawing every edge at once reads as a single flash,
                // where drawing them in order reads as the trail being FOLLOWED, which is what the panel is
                // about. Each edge is primed immediately (so nothing flashes solid before its turn) and its
                // clock starts after the delay.
                const delay = (opts.drawStaggerMs ?? 90) * _drawn++;
                try {
                    primeDraw(p);
                    setTimeout(() => { try { drawElement(p, { duration: opts.drawMs ?? 700 }); } catch (err) {} }, delay);
                } catch (err) {}
            }
            if (e.label) {
                const t = el("text", { x: String(mx), y: String((y1 + y2) / 2 - 3), "text-anchor": "middle",
                                       fill: "#6a8a78", "font-size": "8.5", "font-family": "ui-monospace, monospace" });
                t.textContent = e.label; svg.appendChild(t);
            }
        }

        for (const n of trail.nodes) {
            const p = pos.get(n.id); if (!p) continue;
            const g = el("g", { style: "cursor:pointer" });
            const c = COLOR[n.status] || COLOR.idle;
            g.appendChild(el("rect", { x: String(p.x), y: String(p.y), width: String(p.w), height: String(p.h),
                rx: "5", fill: "#0e1512", stroke: c, "stroke-width": selected === n.id ? "2" : "1" }));
            g.appendChild(el("circle", { cx: String(p.x + p.w - 9), cy: String(p.y + 9), r: "3.5", fill: c }));
            const t1 = el("text", { x: String(p.x + 8), y: String(p.y + 15), fill: "#cfe8d8", "font-size": "10",
                                    "font-family": "ui-monospace, monospace" });
            t1.textContent = String(n.title).slice(0, 15); g.appendChild(t1);
            const t2 = el("text", { x: String(p.x + 8), y: String(p.y + 28), fill: "#6a8a78", "font-size": "8.5",
                                    "font-family": "ui-monospace, monospace" });
            t2.textContent = String(n.sub).slice(0, 18); g.appendChild(t2);
            g.onclick = () => { selected = selected === n.id ? null : n.id; draw(trail); };
            svg.appendChild(g);
        }
        svgHost.appendChild(svg);

        const sel = trail.nodes.find((n) => n.id === selected);
        if (sel) {
            info.innerHTML = "";
            const b = document.createElement("b"); b.textContent = sel.title; b.style.color = COLOR[sel.status] || "#cfe8d8";
            const d = document.createElement("span"); d.textContent = " -- " + sel.detail;
            info.append(b, d);
            if (sel.page) {
                const a = document.createElement("a");
                a.href = sel.page.href; a.target = "_blank"; a.rel = "noopener";
                a.textContent = "  open " + sel.page.label + " →"; a.style.color = "#9ed5ff";
                info.appendChild(a);
            }
        } else {
            info.textContent = trail.state ? (trail.state + " -- " + trail.note).slice(0, 120) : "click a node";
        }
    }

    async function tick() {
        let health = null, fleet = null;
        try { health = await (await fetch("/ai/brain/health", { cache: "no-store" })).json(); } catch {}
        try { fleet = await (await fetch("/ai/brain/fleet", { cache: "no-store" })).json(); } catch {}
        try { draw(buildTrail(health, fleet)); } catch (e) { info.textContent = "trail failed: " + ((e && e.message) || e); }
    }
    tick();
    timer = setInterval(tick, pollMs);
    return { root: wrap, refresh: tick, destroy() { if (timer) clearInterval(timer); try { wrap.remove(); } catch {} } };
}
