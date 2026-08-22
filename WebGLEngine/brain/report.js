// report.js -- "show me what it learned" (SweK GPU Brain v8).
//
// Reads every snapshot in brain/snapshots/, evaluates the same probe
// suite the milestone watcher uses against each one, and writes a
// single dependency-free snapshots/report.html:
//   - a probe table: which attack the net picks per canonical scenario,
//     across training steps (flips highlighted)
//   - the civ-defense hold radius over time (the marksmanship curve)
//   - per-policy weight drift vs the hand-set priors
//
// This is the portfolio artifact generator: run it after a week of
// sessions and the HTML is the before/after story, no manual work.
//
//   deno run --allow-read --allow-write report.js

import { buildAttackFeatures, buildCivDefFeatures, CIVDEF_FEATURES,
         buildAttackLayers, buildCivDefWeights } from "./policy.js";

// v2149 -- Windows path fix. `new URL(rel, import.meta.url).pathname` yields
// "/C:/dir/file.json" on Windows: the leading slash makes every Deno.readTextFile /
// writeTextFile fail with "The system cannot find the path specified" (os error 3).
// That silently broke ALL weights + replay persistence on Windows. Strip the slash
// only when a drive letter follows, and percent-decode so "Program Files" works.
// POSIX paths are returned unchanged. Declaration form so it hoists above first use.
function _localPath(rel) {
    let s = decodeURIComponent(new URL(rel, import.meta.url).pathname);
    if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
    return s;
}

// v2151 -- learned state must OUTLIVE the version folder. brain.js lives inside
// EngineProject_vNNNN/, and every ship creates a NEW folder, so weights/replay written
// next to brain.js were abandoned on each version bump: the brain re-learned from the
// hand policy forever ("no trained weights found" on every boot, on every machine).
// State now lives in a stable per-machine dir (same ~/.voxelbridge root assetSync
// already uses). Override with BRAIN_STATE_DIR. A one-time migration copies any file
// still sitting next to brain.js into the state dir, so nothing on disk is lost.
const STATE_DIR = (() => {
    const env = (Deno.env.get("BRAIN_STATE_DIR") || "").trim();
    if (env) return env.replace(/[\\/]+$/, "");
    const home = Deno.env.get("USERPROFILE") || Deno.env.get("HOME") || "";
    if (home) return home.replace(/[\\/]+$/, "") + "/.voxelbridge/brain";
    return _localPath("./");   // last resort: old behaviour
})();
function _statePath(name) {
    try { Deno.mkdirSync(STATE_DIR, { recursive: true }); } catch {}
    const dst = STATE_DIR + "/" + name;
    try { Deno.statSync(dst); return dst; } catch {}          // already there
    const legacy = _localPath("./" + name);                    // one-time migration
    try { Deno.statSync(legacy); Deno.copyFileSync(legacy, dst); console.log(`[brain] migrated ${name} -> ${STATE_DIR}`); } catch {}
    return dst;
}


const DIR = _localPath("./snapshots/");

const PROBE_ATTACKS = [
    { name: "beam",       family: "beam",       range: 42, damage: 0.06 },
    { name: "projectile", family: "projectile", range: 30, damage: 0.30 },
    { name: "aoe",        family: "aoe",        range: 16, damage: 0.12 },
];
const PROBES = [
    { label: "lone target, 36u", dist: 36, nGoals: 1 },
    { label: "lone target, 10u", dist: 10, nGoals: 1 },
    { label: "crowd, 12u",       dist: 12, nGoals: 4 },
    { label: "crowd, 24u",       dist: 24, nGoals: 3 },
];

function fwdDeep(layers, x) {
    const L1 = layers[0], L2 = layers[1];
    let z2 = L2.b[0];
    for (let o = 0; o < L1.nOut; o++) {
        let z = L1.b[o];
        for (let i = 0; i < L1.nIn; i++) z += L1.W[o * L1.nIn + i] * x[i];
        if (z > 0) z2 += L2.W[o] * z;
    }
    return 1 / (1 + Math.exp(-z2));
}

// v9 -- raw probe SCORES per attack (for the sparklines), not just argmax
function probeScores(layers) {
    const goalsFor = c => Array.from({ length: c }, (_, i) => ({ x: 100 + i * 6, z: 100 + (i % 2) * 6 }));
    const out = {};
    for (const pr of PROBES) {
        const k = { x: 100 - pr.dist, z: 100, tx: 100, tz: 100, energy: 0.9 };
        out[pr.label] = {};
        for (const a of PROBE_ATTACKS)
            out[pr.label][a.name] = fwdDeep(layers, buildAttackFeatures(k, a, goalsFor(pr.nGoals)));
    }
    return out;
}

// v14 -- duel kill curves: two polylines on one chart, read from the
// bridge's persisted tally file (PATCH-B1g). Absent file -> no section.
function duelChart() {
    let duel = null;
    try {
        const path = _localPath("../ai-bridge/gpu_brain_duel.json");
        duel = JSON.parse(Deno.readTextFileSync(path));
    } catch { return ""; }
    if (!Array.isArray(duel) || duel.length < 2) return "";
    const w = 640, h = 180, maxK = Math.max(1, ...duel.map(d => Math.max(d.killsA, d.killsB)));
    const line = (key, color) => {
        const pts = duel.map((d, i) =>
            `${(i / (duel.length - 1) * (w - 20) + 10).toFixed(1)},${(h - 15 - d[key] / maxK * (h - 30)).toFixed(1)}`).join(" ");
        // v31 -- static SVG tooltip: a <title> child (the SVG-native
        // hover text; no listeners exist at report time)
        const last = duel[duel.length - 1][key];
        return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"><title>${key}: latest ${last}</title></polyline>`;
    };
    // v15 -- energy curves (dashed, own scale) + lead-change annotations:
    // a vertical tick wherever the kill lead flips sign.
    const maxE = Math.max(1, ...duel.map(d => Math.max(d.energyA ?? 0, d.energyB ?? 0)));
    const eline = (key, color) => {
        const pts = duel.map((d, i) =>
            `${(i / (duel.length - 1) * (w - 20) + 10).toFixed(1)},${(h - 15 - (d[key] ?? 0) / maxE * (h - 30)).toFixed(1)}`).join(" ");
        return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"><title>${key}: latest ${(duel[duel.length - 1][key] ?? 0).toFixed(1)}</title></polyline>`;
    };
    // v25 -- set boundaries (white dashed) where per-tally set counts step
    let setMarks = "";
    for (let i = 1; i < duel.length; i++) {
        if (duel[i].setsA != null && duel[i - 1].setsA != null
            && (duel[i].setsA + duel[i].setsB) > (duel[i - 1].setsA + duel[i - 1].setsB)) {
            const x = (i / (duel.length - 1) * (w - 20) + 10).toFixed(1);
            setMarks += `<line x1="${x}" y1="6" x2="${x}" y2="${h - 6}" stroke="#e8e8e8" stroke-width="1" stroke-dasharray="2,5" opacity="0.8"/>`;
        }
    }
    let flips = 0, marks = "";
    for (let i = 1; i < duel.length; i++) {
        const prev = Math.sign(duel[i - 1].killsA - duel[i - 1].killsB);
        const cur = Math.sign(duel[i].killsA - duel[i].killsB);
        if (prev !== 0 && cur !== 0 && prev !== cur) {
            flips++;
            const x = (i / (duel.length - 1) * (w - 20) + 10).toFixed(1);
            marks += `<line x1="${x}" y1="10" x2="${x}" y2="${h - 10}" stroke="#ffd35a" stroke-width="1" opacity="0.8"/>`;
        }
    }
    return `<h2>The duel: kills solid, energy dashed (A red, B cyan; ${duel.length} tallies, ${flips} lead change${flips === 1 ? "" : "s"})</h2>` +
        `<svg width="${w}" height="${h}" style="background:#181818">${setMarks}${marks}${eline("energyA", "#ff6a5a")}${eline("energyB", "#5ad8ff")}${line("killsA", "#ff6a5a")}${line("killsB", "#5ad8ff")}</svg>`;
}

// v24 -- THE EXPERIMENT CONSOLE: every ladder's resolved state on one
// table -- what is running, what the evidence says, and which gate is
// next. Reads the same state files the ladders persist; absent files
// render as "not started". This is the section to read FIRST.
// v37 -- evidence-as-of for the offline report: mtimes at render time.
// Absolute stamps only -- unlike the live console, the report cannot
// know engine liveness, so it dates the evidence without judging it.
function asOf37(rel) {
    try { return Deno.statSync(_localPath(rel)).mtime?.toLocaleString() ?? "-"; } catch { return "-"; }
}
function experimentConsole() {
    const readJ = (rel) => { try { return JSON.parse(Deno.readTextFileSync(_localPath(rel))); } catch { return null; } };
    const rows = [];   // v46 -- element 5 = game group
    const G_ENGINE = "engine (kaiju / dungeon / raycaster)", G_EV = "escape velocity";
    const sweep = readJ("./t_sweep_state.json");
    rows.push(["T (global)",
        sweep?.adoptedT != null ? `ADOPTED T=${sweep.adoptedT}` : "running default 0.35",
        sweep ? `streak ${sweep.streak ?? 0} on T=${sweep.streakT ?? "-"}` : "no sweeps yet",
        sweep?.adoptedT != null ? "monitoring" : "K agreeing sweeps + margin + BRAIN_ATK_T_AUTO=adopt", asOf37("./t_sweep_state.json"), G_ENGINE]);
    for (const [d, s] of Object.entries(sweep?.dom ?? {})) {
        rows.push([`T (${d})`,
            s.adoptedT != null ? `ADOPTED T=${s.adoptedT}` : "follows global",
            `streak ${s.streak ?? 0} on T=${s.streakT ?? "-"}`,
            s.adoptedT != null ? "monitoring" : "domain streak + margin + gate", asOf37("./t_sweep_state.json"), d === "ev" ? G_EV : G_ENGINE]);
    }
    const dab = readJ("./difficulty_ab.json");
    rows.push(["Difficulty A/B (raycaster)",
        dab?.resolved ? (dab.resolved.mode === "promoted" ? `RESOLVED: theta=${dab.resolved.theta?.toFixed?.(2)} promoted` : "RESOLVED: retired")
                      : dab ? `running, theta=${(dab.theta ?? 0).toFixed(2)}, step=${(dab.step ?? 0.05).toFixed(3)}` : "not started",
        dab ? `sessions ${dab.arms?.heuristic?.length ?? 0}H / ${dab.arms?.learned?.length ?? 0}L, verdict streak ${dab.verdictStreak ?? 0}` : "-",
        dab?.resolved ? "delete difficulty_ab.json to rerun" : "K decisive verdicts + BRAIN_DIFF_AUTO=adopt", asOf37("./difficulty_ab.json"), G_ENGINE]);
    const dgn = readJ("./difficulty_ab_dgn.json");
    rows.push(["Difficulty A/B (dungeon)",
        dgn?.resolved ? (dgn.resolved.mode === "promoted" ? `RESOLVED: theta=${dgn.resolved.theta?.toFixed?.(2)} promoted` : "RESOLVED: retired")
                      : dgn ? `running, theta=${(dgn.theta ?? 0).toFixed(2)}` : "not started",
        dgn ? `sessions ${dgn.arms?.heuristic?.length ?? 0}H / ${dgn.arms?.learned?.length ?? 0}L` : "-",
        dgn?.resolved ? "delete difficulty_ab_dgn.json to rerun" : "same ladder as rc", asOf37("./difficulty_ab_dgn.json"), G_ENGINE]);
    const reg = readJ("./regime_stats.json");
    const regH = readJ("./regime_history.json");
    const lastZ = Array.isArray(regH) && regH.length ? regH[regH.length - 1] : null;
    rows.push(["Split vs shared",
        reg ? "collecting both regimes" : "not started",
        lastZ ? ["kaiju", "dungeon", "raycaster", "ev"].filter(d => lastZ[d] != null).map(d => `${d} z=${lastZ[d]}`).join(", ") : "-",
        "|z| > 1.96 per domain declares", asOf37("./regime_stats.json"), G_ENGINE]);
    // v46 -- trade ladder row (twin)
    const trs46 = readJ("./trade_state.json");
    rows.push(["Trader boldness (T ladder)",
        trs46?.adoptedT != null ? `ADOPTED T=${trs46.adoptedT}` : "serving default 0.5",
        trs46 ? `streak ${trs46.streak ?? 0} on T=${trs46.streakT ?? "-"}` : "no sweeps yet",
        trs46?.adoptedT != null ? "drift re-opens via gate" : "3 agreeing sweeps + >2% + gate",
        asOf37("./trade_state.json"), G_EV]);
    // v44 -- escort experiment row (twin of the live console's)
    const eab = readJ("./escort_ab.json");
    const epN44 = a => (eab?.[a]?.length) || 0;
    // v49 -- sparkline row (twin): built as a string, same geometry
    const thh49 = readJ("./escort_th_history.json");
    const last49 = Array.isArray(thh49) && thh49.length ? thh49[thh49.length - 1] : null;
    if (last49 && Array.isArray(last49.bySys)) {
        const spark49 = "<svg width='76' height='16' style='vertical-align:middle'>" + last49.bySys.map((v, i) => {
            const hgt = Math.max(2, Math.round((2.5 - v) / 1.7 * 14));
            return `<rect x='${i * 13}' y='${16 - hgt}' width='10' height='${hgt}' fill='${v < 1.2 ? "#ff6a5a" : "#9ecb5a"}'><title>sys ${i}: th=${v}</title></rect>`;
        }).join("") + "</svg>";
        rows.push(["Per-system tripwires", "serving 6 local thresholds",
            spark49 + ` <span style='color:#667'>${Math.min(...last49.bySys)}..${Math.max(...last49.bySys)}</span>`,
            "local pf per system; <15 legs falls back global",
            asOf37("./escort_th_history.json"), G_EV]);
    }
    // v62 -- diary-only twin rows (the v61 live rows; twins stay
    // twins). TEXT-ONLY by decision: the full-size unknown-dom charts
    // already render just below this table (v60), so a micro here
    // would duplicate its own neighbor.
    // v63 -- LINKED DECISION (1/2): if diffEndpointChart's full charts
    // ever leave this page, these rows MUST inherit the live console's
    // micro twins (micro57 is dom-generic and ready). The twin note
    // sits at diffEndpointChart -- change one, visit the other.
    const dab62 = readJ("./diff_ab_history.json");
    if (Array.isArray(dab62)) {
        const extra62 = [...new Set(dab62.map(e => e.dom ?? "raycaster"))].filter(d => d !== "raycaster" && d !== "dungeon").sort();
        for (const xd of extra62) {
            const nx = dab62.filter(e => (e.dom ?? "raycaster") === xd).length;
            rows.push(["Difficulty A/B (" + xd + ")", "diary-only (no A/B machinery for this dom)",
                nx + " diary entries (chart below)", "wire arms + verdict when this dom earns them",
                asOf37("./diff_ab_history.json"), G_ENGINE]);
        }
    }
    // v52 -- ladder-life row (twin)
    const bms52 = readJ("./bias_mag_state.json");
    const bmh52 = readJ("./bias_mag_history.json");
    if (bms52) {
        const le = Array.isArray(bmh52) && bmh52.length ? bmh52[bmh52.length - 1] : null;
        rows.push(["Bias dose ladder",
            // v60 -- glyph TWIN (the v59 dots; twins stay twins)
            bms52.found != null ? `MED found: ${bms52.found} <span title="probation: quiet contrasts toward re-open (3 = re-open)">${"&#9679;".repeat(Math.min(3, bms52.driftStreak || 0))}${"&#9675;".repeat(Math.max(0, 3 - (bms52.driftStreak || 0)))}</span>` : `titrating, mag=${bms52.mag}`,
            le ? `${le.ev}@${le.mag} (${new Date(le.ts).toLocaleString()})` : "no events yet",
            bms52.found != null ? "3 quiet contrasts at 20+/arm re-open" : "WORKS shrinks; miss steps back = MED",
            asOf37("./bias_mag_state.json"), G_EV]);
    }
    rows.push(["Escort threshold (randomized)",
        eab ? "collecting episodes" : "not started",
        eab ? `lo ${epN44("lo")} ep, hi ${epN44("hi")} ep` : "-",
        "20+ episodes per arm, then Welch on per-episode rates", asOf37("./escort_ab.json"), G_EV]);
    const sel = readJ("./selection_stats.json");
    rows.push(["Sampled vs epsilon",
        sel ? "collecting both arms" : "not started",
        sel ? ["kaiju", "dungeon", "raycaster", "ev"].map(d => {
            const a = sel.sampled?.[d], b = sel.epsilon?.[d];
            return (a?.n && b?.n) ? `${d} ${a.n}/${b.n}` : null;
        }).filter(Boolean).join(", ") || "-" : "-",
        "30+ per arm per domain, then z", asOf37("./selection_stats.json"), G_ENGINE]);
    let html2 = `<h2>The experiment console</h2><table><tr><th>Experiment</th><th>State</th><th>Evidence</th><th>Next gate</th><th>Evidence as of</th></tr>`;
    // v46 -- grouped render; ALSO repairs a latent v37 bug caught here:
    // this loop printed r[0..3] only, so the evidence-as-of column added
    // in v37 had a header and data but NEVER RENDERED -- the table has
    // been one column short (and misaligned against its header) for nine
    // versions. The fix and the confession travel together.
    // v48 -- FOLD on the static file: the report cannot re-render, so a
    // small embedded script toggles row visibility per group (class-
    // tagged rows, header onclick). No persistence -- a static file's
    // fold state dies with the tab, honestly.
    let gi48 = 0;
    for (const grp of [G_ENGINE, G_EV]) {
        const grows = rows.filter(x => x[5] === grp);
        if (!grows.length) continue;
        const cls = "grp" + (gi48++);
        html2 += `<tr><td colspan="5" style="color:#ffd35a;font-weight:bold;cursor:pointer" onclick="document.querySelectorAll('.${cls}').forEach(function(r){r.style.display=r.style.display==='none'?'':'none';})">&#9662; ${grp} <span style="color:#667;font-size:10px">(click to fold)</span></td></tr>`;
        for (const x of grows) html2 += `<tr class="${cls}"><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td><td>${x[4]}</td></tr>`;
    }
    return html2 + `</table>`;
}

// v27 -- podium: offline twin of the duel view's section, reading the
// bridge's series archive (same sibling-path pattern as duelChart).
function podium() {
    let series = null;
    try {
        const path = _localPath("../ai-bridge/gpu_brain_series.json");
        series = JSON.parse(Deno.readTextFileSync(path));
    } catch { return ""; }
    if (!Array.isArray(series) || !series.length) return "";
    let html2 = `<h2>Podium (${series.length} finished series)</h2><table><tr><th>Date</th><th>Champion</th><th>Score</th><th>Opponent</th></tr>`;
    for (const s of series.slice(-20).reverse()) {
        html2 += `<tr><td>${new Date(s.ts).toLocaleDateString()}</td><td>${s.champion}</td><td>${s.setsA}-${s.setsB}</td><td>${s.champion === s.nameA ? s.nameB : s.nameA}</td></tr>`;
    }
    return html2 + `</table>`;
}

// v27 -- T-SWEEP ERA CHART: SNIPS value over time, one line per grid T,
// adoption boundaries as gold verticals. The story of the tuning: which
// temperature led when, and where the brain (or the human) acted.
function tSweepChart() {
    let hist = null;
    try {
        hist = JSON.parse(Deno.readTextFileSync(_statePath("t_sweep_history.json")));
    } catch { return ""; }
    if (!Array.isArray(hist) || hist.length < 2) return "";
    const w = 640, h = 170;
    const Ts = ["T0.2", "T0.35", "T0.5", "T0.75", "T1"];
    const cols = { "T0.2": "#5ad8ff", "T0.35": "#9ecb5a", "T0.5": "#ffb454", "T0.75": "#c58aff", "T1": "#ff6a5a" };
    const all = hist.flatMap(r => Ts.map(k => r[k]).filter(v => v != null));
    if (!all.length) return "";
    const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(1e-6, hi - lo);
    const yOf = v => h - 12 - (v - lo) / span * (h - 24);
    const px = i => 8 + i / (hist.length - 1) * (w - 16);
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    hist.forEach((r, i) => { if (r.adopted) svg += `<line x1="${px(i).toFixed(1)}" y1="4" x2="${px(i).toFixed(1)}" y2="${h - 4}" stroke="#ffd35a" stroke-width="1.5" opacity="0.9"/>`; });
    // v31 -- per-POINT tooltips via invisible hover circles with <title>
    // children (static SVG has no listeners; <title> is its native hover
    // text). Strided so the SVG stays sane: at most ~150 circles per line.
    const stride = Math.max(1, Math.ceil(hist.length / 150));
    for (const k of Ts) {
        const pts = hist.map((r, i) => r[k] == null ? null : `${px(i).toFixed(1)},${yOf(r[k]).toFixed(1)}`).filter(Boolean);
        if (pts.length > 1) {
            const lastV = hist.map(r => r[k]).filter(v => v != null).pop();
            svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${cols[k]}" stroke-width="1.4"><title>${k}: latest ${lastV}</title></polyline>`;
            hist.forEach((r, i) => {
                if (r[k] == null) return;
                if (i % stride !== 0 && !r.adopted) return;   // adoption points always get a target
                svg += `<circle cx="${px(i).toFixed(1)}" cy="${yOf(r[k]).toFixed(1)}" r="4" fill="transparent">` +
                    `<title>${new Date(r.ts).toLocaleString()}${r.adopted ? " [ADOPTION]" : ""} -- ${k} = ${r[k]}</title></circle>`;
            });
        }
    }
    svg += `</svg>`;
    return `<h2>T-sweep over time (SNIPS per temperature; gold = adoption; cyan 0.2, green 0.35, amber 0.5, purple 0.75, red 1.0)</h2>` + svg;
}

// v32 -- DIFFICULTY A/B strip charts: each arm's session durations as
// jittered dots on a band, mean ticks, Welch t in the caption (the
// validated v22 formula, inlined -- the report has no import path to
// the brain's copy), and a promotion marker when resolved.
function welchT32(a, b) {
    const n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return null;
    const m1 = a.reduce((x, y) => x + y, 0) / n1, m2 = b.reduce((x, y) => x + y, 0) / n2;
    const v1 = a.reduce((x, y) => x + (y - m1) ** 2, 0) / (n1 - 1);
    const v2 = b.reduce((x, y) => x + (y - m2) ** 2, 0) / (n2 - 1);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    return se > 0 ? (m1 - m2) / se : 0;
}
// v37 -- stripBand extracted so diffChart and driftChart share one
// renderer (same file, same runtime -- unlike the node twins, here
// duplication would be pure carelessness). Jitter stays deterministic
// through the shared seed closure.
function makeStripCtx(all, w) {
    const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(1, hi - lo);
    let seed = 12345;
    return {
        xOf: v => 10 + (v - lo) / span * (w - 20),
        jit: () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 16,
    };
}
function stripBand(arr, cy, col, ctx) {
    let s = "";
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    let madSigma = 0, med = m;
    if (arr.length >= 5) {
        const srt = [...arr].sort((a, b) => a - b);
        med = srt[Math.floor(srt.length / 2)];
        const devs = arr.map(v => Math.abs(v - med)).sort((a, b) => a - b);
        madSigma = 1.4826 * devs[Math.floor(devs.length / 2)];
    }
    for (const v of arr) {
        const cyj = (cy + ctx.jit()).toFixed(1);
        const out = madSigma > 1e-9 && Math.abs(v - med) > 3 * madSigma;
        s += `<circle cx="${ctx.xOf(v).toFixed(1)}" cy="${cyj}" r="2.5" fill="${col}" opacity="0.55"><title>${v}s${out ? " -- OUTLIER (>3 sigma)" : ""}</title></circle>`;
        if (out) s += `<circle cx="${ctx.xOf(v).toFixed(1)}" cy="${cyj}" r="6" fill="none" stroke="${col}" stroke-width="1.2" opacity="0.9"><title>${v}s -- OUTLIER (>3 robust sigma from arm median ${med.toFixed(0)}s)</title></circle>`;
    }
    s += `<line x1="${ctx.xOf(m).toFixed(1)}" y1="${cy - 14}" x2="${ctx.xOf(m).toFixed(1)}" y2="${cy + 14}" stroke="${col}" stroke-width="2"><title>mean ${m.toFixed(0)}s</title></line>`;
    return s;
}
// v37 -- DRIFT MONITOR strip: the promoted baseline vs the post window,
// the A/B strips' pattern. Only renders while a promotion is on watch.
function driftChart(file, label) {
    let d = null;
    try { d = JSON.parse(Deno.readTextFileSync(_localPath(file))); } catch { return ""; }
    const R = d?.resolved;
    if (R?.mode !== "promoted" || !Array.isArray(R.baselineArr) || !Array.isArray(R.post) || R.post.length < 3) return "";
    const w = 640, h = 120;
    const ctx = makeStripCtx(R.baselineArr.concat(R.post), w);
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    svg += stripBand(R.baselineArr, 35, "#5ad8ff", ctx) + stripBand(R.post, 85, "#ffd35a", ctx);
    svg += `<text x="10" y="16" fill="#5ad8ff" font-size="11">baseline (at promotion, n=${R.baselineArr.length})</text>`;
    svg += `<text x="10" y="${h - 6}" fill="#ffd35a" font-size="11">post window (n=${R.post.length}, drift streak ${R.driftStreak || 0})</text>`;
    svg += `</svg>`;
    return `<h2>${label}: promoted theta on watch</h2>` + svg;
}
function diffChart(file, label) {
    let d = null;
    try { d = JSON.parse(Deno.readTextFileSync(_localPath(file))); } catch { return ""; }
    const H2 = d?.arms?.heuristic ?? [], L2 = d?.arms?.learned ?? [];
    if (H2.length < 3 || L2.length < 3) return "";
    const w = 640, h = 120;
    const ctx37 = makeStripCtx(H2.concat(L2), w);   // v37 -- shared renderer
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    svg += stripBand(H2, 35, "#9ecb5a", ctx37) + stripBand(L2, 85, "#ffb454", ctx37);
    if (d.resolved?.mode === "promoted") {
        svg += `<text x="${w - 190}" y="16" fill="#ffd35a" font-size="11">PROMOTED theta=${Number(d.resolved.theta ?? 0).toFixed(2)}</text>`;
    } else if (d.resolved?.mode === "retired") {
        svg += `<text x="${w - 90}" y="16" fill="#888" font-size="11">RETIRED</text>`;
    }
    svg += `</svg>`;
    const tv = welchT32(L2, H2);
    return `<h2>${label}: session durations (heuristic green n=${H2.length}, learned amber n=${L2.length}` +
        (tv != null ? `; Welch t=${tv.toFixed(2)}` : "") + `)</h2>` + svg;
}

// v47 -- ENDPOINT HISTORY: rate t (gold solid) and duration t (cyan
// dashed) over time, +-2 significance band -- the z-chart pattern.
// The picture to watch for: rates tying while durations separate.
function escortEndpointChart() {
    let hist = null;
    try { hist = JSON.parse(Deno.readTextFileSync(_statePath("escort_ab_history.json"))); } catch { return ""; }
    if (!Array.isArray(hist) || hist.length < 2) return "";
    const w = 640, h = 150;
    const all = hist.flatMap(e => [e.tRate, e.tDur]).filter(v => v != null);
    const lo = Math.min(-2.5, ...all), hi = Math.max(2.5, ...all), span = hi - lo;
    const px = i => 8 + i / (hist.length - 1) * (w - 16);
    const yOf = v => h - 12 - (v - lo) / span * (h - 24);
    const line47 = (key, col, dash) => {
        const pts = hist.map((e, i) => e[key] == null ? null : `${px(i).toFixed(1)},${yOf(e[key]).toFixed(1)}`).filter(Boolean);
        return pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="1.5"${dash ? ' stroke-dasharray="4,3"' : ""}><title>${key} (latest ${hist[hist.length - 1][key]})</title></polyline>` : "";
    };
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    for (const b of [-2, 2]) svg += `<line x1="8" y1="${yOf(b).toFixed(1)}" x2="${w - 8}" y2="${yOf(b).toFixed(1)}" stroke="#3a4252" stroke-dasharray="3,4"/>`;
    svg += line47("tRate", "#ffd35a", false) + line47("tDur", "#5ad8ff", true);
    svg += `</svg>`;
    return `<h2>Escort A/B endpoints over time (rate t gold, duration t cyan dashed; outside the dotted band = significant)</h2>` + svg;
}

// v45 -- EPISODE STRIP: per-episode piracy rates by randomized arm,
// through the shared stripBand -- lo (earlier escorts) green, hi
// amber. MAD rings flag freak episodes within each arm; the mean
// ticks are the verdict's raw material, visible.
function escortEpChart() {
    let d = null;
    try { d = JSON.parse(Deno.readTextFileSync(_statePath("escort_ab.json"))); } catch { return ""; }
    const lo = (d?.lo || []).map(e => Math.round(e.pirated / (e.durS / 60) * 100) / 100);
    const hi = (d?.hi || []).map(e => Math.round(e.pirated / (e.durS / 60) * 100) / 100);
    if (lo.length < 3 || hi.length < 3) return "";
    const w = 640, h = 120;
    const ctx = makeStripCtx(lo.concat(hi), w);
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    svg += stripBand(lo, 35, "#9ecb5a", ctx) + stripBand(hi, 85, "#ffb454", ctx);
    svg += `<text x="10" y="16" fill="#9ecb5a" font-size="11">lo arm -- escorts earlier (n=${lo.length})</text>`;
    svg += `<text x="10" y="${h - 6}" fill="#ffb454" font-size="11">hi arm -- escorts later (n=${hi.length})</text>`;
    svg += `</svg>`;
    return `<h2>Escort A/B episodes: pirated per minute, by randomized arm</h2>` + svg;
}

// v44 -- SERVED-THRESHOLD ERA CHART: the tripwire (gold, left scale
// 0.8..2.5) over time against pirated fraction (red, right scale
// 0..0.5) -- two honest scales, both labeled, because forcing them
// onto one axis would flatten whichever story is quieter.
function escortThChart() {
    let hist = null;
    try { hist = JSON.parse(Deno.readTextFileSync(_statePath("escort_th_history.json"))); } catch { return ""; }
    if (!Array.isArray(hist) || hist.length < 2) return "";
    const w = 640, h = 140;
    const px = i => 8 + i / (hist.length - 1) * (w - 16);
    const yTh = v => h - 12 - (v - 0.8) / (2.5 - 0.8) * (h - 24);
    const yPf = v => h - 12 - Math.min(0.5, v) / 0.5 * (h - 24);
    const thPts = hist.map((r2, i) => `${px(i).toFixed(1)},${yTh(r2.th).toFixed(1)}`).join(" ");
    const pfPts = hist.map((r2, i) => `${px(i).toFixed(1)},${yPf(r2.pf).toFixed(1)}`).join(" ");
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    svg += `<polyline points="${thPts}" fill="none" stroke="#ffd35a" stroke-width="1.6"><title>served threshold (left scale 0.8..2.5)</title></polyline>`;
    svg += `<polyline points="${pfPts}" fill="none" stroke="#ff6a5a" stroke-width="1.4" stroke-dasharray="4,3"><title>pirated fraction (right scale 0..0.5)</title></polyline>`;
    svg += `<text x="8" y="14" fill="#ffd35a" font-size="10">threshold</text><text x="${w - 92}" y="14" fill="#ff6a5a" font-size="10">pirated frac</text>`;
    svg += `</svg>`;
    return `<h2>Served escort threshold over time (gold, 0.8..2.5) vs pirated fraction (red dashed, 0..0.5)</h2>` + svg;
}

// v51 -- DOSE LADDER LIFE: served magnitude as a step line, event
// markers on top -- shrinks gold, floor/med (a found dose) green,
// reopens red. The ladder's biography, one glance.
function doseChart() {
    let h = null;
    try { h = JSON.parse(Deno.readTextFileSync(_statePath("bias_mag_history.json"))); } catch { return ""; }
    if (!Array.isArray(h) || h.length < 2) return "";
    const w = 640, ht = 120;
    const px = i => 8 + i / (h.length - 1) * (w - 16);
    // v52 -- auto-range: the v51 axis hardcoded 0.03..0.17 to the
    // current ladder; a wider ladder would have clipped silently. Pad
    // the observed range 0.02 each way, floor the span at 0.04 so a
    // flat life still draws mid-chart instead of dividing by zero.
    const mags = h.map(e => e.mag);
    const mLo = Math.min(...mags) - 0.02, mHi = Math.max(...mags) + 0.02;
    const mSpan = Math.max(0.04, mHi - mLo);
    const yOf = m => ht - 12 - (m - mLo) / mSpan * (ht - 24);
    let path = "", prevY = null;
    h.forEach((e, i) => {
        const x = px(i).toFixed(1), y = yOf(e.mag).toFixed(1);
        path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${prevY} L ${x} ${y}`;
        prevY = y;
    });
    let svg = `<svg width="${w}" height="${ht}" style="background:#181818">`;
    svg += `<path d="${path}" fill="none" stroke="#8a94a6" stroke-width="1.3"/>`;
    const col51 = { shrink: "#ffd35a", floor: "#9ecb5a", med: "#9ecb5a", reopen: "#ff6a5a" };
    h.forEach((e, i) => {
        svg += `<circle cx="${px(i).toFixed(1)}" cy="${yOf(e.mag).toFixed(1)}" r="3.5" fill="${col51[e.ev] || "#888"}"><title>${e.ev} @ ${e.mag} (${new Date(e.ts).toLocaleString()})</title></circle>`;
    });
    svg += `</svg>`;
    return `<h2>Bias-dose ladder life (step = served magnitude; gold shrink, green found, red reopen)</h2>` + svg;
}

// v51 -- PER-SYSTEM EPISODE RATES: a SECONDARY readout beside the
// experiment -- the randomization unit stays the global episode, and
// this table does not test anything; it only shows WHERE the piracy
// inside each arm's episodes landed, which is allowed to be
// interesting without being inferential.
function escortSysTable() {
    let d = null;
    try { d = JSON.parse(Deno.readTextFileSync(_statePath("escort_ab.json"))); } catch { return ""; }
    const agg = a => {
        const sums = [0, 0, 0, 0, 0, 0]; let mins = 0, n = 0;
        for (const e of (d?.[a] || [])) if (Array.isArray(e.bySys)) { e.bySys.forEach((c, i) => sums[i] += c); mins += e.durS / 60; n++; }
        return { sums, mins, n };
    };
    const L = agg("lo"), H = agg("hi");
    if (L.n < 3 || H.n < 3) return "";
    let rows51 = "";
    for (let si = 0; si < 6; si++)
        rows51 += `<tr><td>sys ${si}</td><td>${(L.sums[si] / Math.max(0.02, L.mins)).toFixed(2)}</td><td>${(H.sums[si] / Math.max(0.02, H.mins)).toFixed(2)}</td></tr>`;
    // v52 -- chi-square HONESTY CHECK: 2x6 contingency on raw counts,
    // df=5, critical 11.07 at alpha=.05 -- shown WITH its caveats in the
    // same breath: (a) SECONDARY/exploratory -- a hit here invites a
    // pre-registered follow-up, never a conclusion; (b) events CLUSTER
    // within episodes so independence is violated and the test runs
    // anti-conservative (too eager); (c) expected counts under 5 make
    // the approximation unreliable and the line says so instead of
    // pretending. The warning is part of the statistic, not a footnote.
    let chiLine = "";
    const totL = L.sums.reduce((a, b) => a + b, 0), totH = H.sums.reduce((a, b) => a + b, 0);
    if (totL + totH >= 12) {
        // v54 -- EXPOSURE FINDING (a fix refused, with the proof): the
        // phase's hook worried this test was "fair only when arm
        // exposures are close." Validation FALSIFIED that: chi-square
        // with COUNT margins is scale-invariant by construction --
        // margins absorb uniform scaling, so equal rates under double
        // exposure land chi2 = 0.00 exactly (two worlds walked). An
        // exposure-weighted expected was built, tested, and REVERTED:
        // it does not remove a bias, it CHANGES THE NULL to "equal
        // per-system rates," conflating distribution-profile with rate
        // level -- and rate level is the primary endpoint's job. This
        // test asks only: does piracy's SHAPE across systems differ by
        // arm? Exposure cannot touch that question.
        let chi2 = 0, lowCells = 0;
        for (let si = 0; si < 6; si++) {
            const rowTot = L.sums[si] + H.sums[si], grand = totL + totH;
            const eL = rowTot * totL / grand, eH = rowTot * totH / grand;
            if (eL < 5) lowCells++; if (eH < 5) lowCells++;
            if (eL > 0) chi2 += (L.sums[si] - eL) ** 2 / eL;
            if (eH > 0) chi2 += (H.sums[si] - eH) ** 2 / eH;
        }
        const sig = chi2 > 11.07;
        // v53 -- permutation test, EPISODE-CLUSTERED: the honest fix for
        // the v52 caveat. Arm labels shuffle across WHOLE episodes (each
        // episode's bySys stays intact -- the episode is the inference
        // unit, matching the randomization unit), the chi2 statistic
        // recomputes per shuffle, and p = the fraction of shuffled worlds
        // at least as extreme as ours. The clustering violation the
        // chi-square confesses to simply does not arise here: whatever
        // dependence lives inside an episode travels with it.
        const allEps = [];
        for (const e of (d?.lo || [])) if (Array.isArray(e.bySys)) allEps.push(e.bySys);
        const nLo53 = allEps.length;
        for (const e of (d?.hi || [])) if (Array.isArray(e.bySys)) allEps.push(e.bySys);
        const chiOf = (loSums, hiSums) => {
            const tL = loSums.reduce((a, b) => a + b, 0), tH = hiSums.reduce((a, b) => a + b, 0), g = tL + tH;
            if (!g) return 0;
            let c = 0;
            for (let si = 0; si < 6; si++) {
                const rt = loSums[si] + hiSums[si];
                const eL = rt * tL / g, eH = rt * tH / g;
                if (eL > 0) c += (loSums[si] - eL) ** 2 / eL;
                if (eH > 0) c += (hiSums[si] - eH) ** 2 / eH;
            }
            return c;
        };
        let permLine = "";
        if (allEps.length >= 8) {
            const B53 = 500;
            let asExtreme = 0;
            for (let b = 0; b < B53; b++) {
                const idx = allEps.map((_, i) => i);
                for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
                const pl = [0, 0, 0, 0, 0, 0], ph = [0, 0, 0, 0, 0, 0];
                idx.forEach((ei, pos) => { const tgt = pos < nLo53 ? pl : ph; allEps[ei].forEach((c, si) => tgt[si] += c); });
                if (chiOf(pl, ph) >= chi2 - 1e-12) asExtreme++;
            }
            const pPerm = (asExtreme + 1) / (B53 + 1);
            permLine = ` Episode-permutation p = ${pPerm.toFixed(3)} (${B53} shuffles, episodes kept whole -- the clustering-honest version; trust this one over the chi-square when they disagree).`;
            // v54 -- cache the honest number for the live console (it
            // cannot afford 500 shuffles per refresh; it CAN afford a
            // stamped copy of the last render's answer)
            try { Deno.writeTextFileSync(_statePath("sys_perm_cache.json"),
                JSON.stringify({ ts: Date.now(), p: Math.round(pPerm * 1000) / 1000, B: B53, nEps: allEps.length })); } catch {}
        }
        chiLine = `<p style="color:#8a94a6;font-size:11px;max-width:640px">chi-square (2x6, df=5): ${chi2.toFixed(2)} vs 11.07 -> distribution across systems ${sig ? "DIFFERS between arms" : "shows no detectable arm difference"}. This tests the SHAPE of piracy across systems and is exposure-invariant (margins absorb watch-time imbalance -- validated); rate LEVEL is the primary A/B's question, not this table's.` +
            ` Caveats owned: exploratory (a hit invites a pre-registered follow-up, not a conclusion); events cluster within episodes, so independence is violated and this test is anti-conservative;` +
            (lowCells ? ` ${lowCells} expected cell(s) under 5 -- the approximation is unreliable here.` : ` all expected cells >= 5.`) + permLine + `</p>`;
    }
    return `<h2>Per-system piracy inside episodes (rates /min; SECONDARY readout -- the experiment's unit stays the global episode)</h2>` +
        `<table border="0" cellpadding="4" style="color:#dfe6f3;font-size:12px"><tr><th>system</th><th>lo arm (n=${L.n})</th><th>hi arm (n=${H.n})</th></tr>${rows51}</table>` + chiLine;
}

// v54 -- dgn hp strip: hp mid-band fraction per dungeon session,
// through the shared stripBand (MAD rings flag freak sessions). Only
// v54+ dom-tagged rows join -- rc and dgn share the telemetry file,
// and pre-tag rows are MIXED history no chart should claim.
function dgnHpChart() {
    let h = null;
    try { h = JSON.parse(Deno.readTextFileSync(_statePath("difficulty_telemetry.json"))); } catch { return ""; }
    if (!Array.isArray(h)) return "";
    const vals = h.filter(e => e.dom === "dungeon" && e.hpMidband != null).map(e => e.hpMidband);
    if (vals.length < 5) return "";
    const w = 640, ht = 90;
    const ctx = makeStripCtx(vals, w);
    let svg = `<svg width="${w}" height="${ht}" style="background:#181818">`;
    svg += stripBand(vals, 45, "#c58aff", ctx);
    svg += `<text x="10" y="16" fill="#c58aff" font-size="11">dungeon sessions, hp mid-band fraction (n=${vals.length}; dom-tagged rows only)</text>`;
    svg += `</svg>`;
    return `<h2>Dungeon hp mid-band per session (the data v53 unlocked)</h2>` + svg;
}

// v50 -- DIFFICULTY ENDPOINT DIARY: duration t (gold) and hp-midband
// t (cyan dashed) over time, with BOTH bars drawn -- 2.0 dim (single-
// endpoint mode) and 2.24 fainter (co-primary mode) -- because which
// bar applies depends on a gate, and the chart should not pretend to
// know which era the reader is in.
// v63 -- LINKED DECISION (2/2): the console-twin diary-only rows
// above are TEXT-ONLY *because* these full charts exist on the same
// page. Moving or dropping these charts breaks that decision -- the
// rows' note points here; this note points back. Change one, visit
// the other.
// v68 -- the ritual's pulse: per-step wall time across ships, from
// tools/verify_timing.json (the v67 ring). The 10x-slower finding gets
// a picture -- the v50 sparkline pattern, one line per step. Reads a
// TOOLS-side file from a brain-side page: the ../ hop is deliberate
// and stated (the ring belongs to the ritual, not the brain).
function verifyTimingChart() {
    let hist = null;
    try { hist = JSON.parse(Deno.readTextFileSync(_localPath("../tools/verify_timing.json"))); } catch { return ""; }
    if (!Array.isArray(hist) || hist.length < 2) return "";
    const names = [...new Set(hist.flatMap(h => Object.keys(h.steps || {})))].sort();
    if (!names.length) return "";
    const W = 700, H = 120, PAD = 30;
    const all = hist.flatMap(h => names.map(n => h.steps?.[n]).filter(v => typeof v === "number"));
    const top = Math.max(...all, 0.5);
    const mx = i => PAD + i / Math.max(1, hist.length - 1) * (W - 2 * PAD);
    const my = v => H - 18 - (v / top) * (H - 36);
    const cols = ["#ffd35a", "#5ad8ff", "#8aff5a", "#ff8ad8"];
    let svg = `<svg width="${W}" height="${H}" style="background:#161616">`;
    svg += `<text x="${PAD}" y="12" fill="#888" font-size="10">seconds (0..${top.toFixed(1)}) over ${hist.length} ships; red dot = a red ship; amber dot = a ${WARN_X70}x-median warn (hover names the step)</text>`;
    names.forEach((nm, k) => {
        const pts = hist.map((h, i) => typeof h.steps?.[nm] === "number" ? mx(i).toFixed(1) + "," + my(h.steps[nm]).toFixed(1) : null).filter(Boolean);
        if (pts.length > 1) svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${cols[k % cols.length]}" stroke-width="1.2"><title>${nm}</title></polyline>`;
        svg += `<text x="${PAD + k * 130}" y="${H - 4}" fill="${cols[k % cols.length]}" font-size="10">${nm}</text>`;
    });
    // v75 -- day boundaries: the ring carries ts the chart was
    // ignoring. A faint vertical where the date changes, labeled
    // MM-DD, anchors the picture in time; missing ts rows draw none.
    hist.forEach((h, i) => {
        if (i === 0 || !h.ts || !hist[i - 1].ts) return;
        const d1 = new Date(hist[i - 1].ts).toISOString().slice(0, 10);
        const d2 = new Date(h.ts).toISOString().slice(0, 10);
        if (d1 !== d2) svg += `<line x1="${mx(i).toFixed(1)}" y1="20" x2="${mx(i).toFixed(1)}" y2="${H - 20}" stroke="#333" stroke-width="1"/><text x="${(mx(i) + 2).toFixed(1)}" y="${H - 24}" fill="#555" font-size="8">${d2.slice(5)}</text>`;   // day boundary
    });
    hist.forEach((h, i) => { if (h.green === false) svg += `<circle cx="${mx(i).toFixed(1)}" cy="8" r="2.5" fill="#ff5a5a"><title>red ship</title></circle>`; });
    // v69 -- warn overlay: the warns RE-DERIVED from the ring itself.
    // v70 -- the threshold is now a KNOB, not a hardcode: read from
    // tools/verify_config.json (warnFactor, default 3) -- the DECISION,
    // made at the read: not a shared import (couples Deno to node), not
    // a brain gate (the ritual is not the brain's domain); the ring's
    // consumers share the ring's CONFIG as data. Same rule: 5+ PRIOR
    // runs, current > warnFactor x their median.
    let WARN_X70 = 3, MIN_RUNS72 = 5;
    try {
        const cfg72 = JSON.parse(Deno.readTextFileSync(_localPath("../tools/verify_config.json")));
        WARN_X70 = Number(cfg72.warnFactor) || 3;
        MIN_RUNS72 = Number(cfg72.warnMinRuns) || 5;   // v72 -- the floor, same knob
    } catch {}
    hist.forEach((h, i) => {
        const warned = names.filter(nm => {
            const prior = hist.slice(0, i).map(x => x.steps?.[nm]).filter(v => typeof v === "number").sort((a, b) => a - b);
            if (prior.length < MIN_RUNS72) return false;
            const med = prior[(prior.length / 2) | 0];
            return med > 0 && typeof h.steps?.[nm] === "number" && h.steps[nm] > WARN_X70 * med;
        });
        if (warned.length) svg += `<circle cx="${mx(i).toFixed(1)}" cy="16" r="2.5" fill="#ffb454"><title>${WARN_X70}x-median warn: ${warned.join(", ")}</title></circle>`;
    });
    svg += `</svg>`;
    return `<h2 id="pulse72">Verify timing -- the ship ritual's pulse (${hist.length} runs)</h2>` + svg;   // v72 -- anchor for the console strip's click-through
}
function diffEndpointChart() {
    let hist0 = null;
    try { hist0 = JSON.parse(Deno.readTextFileSync(_statePath("diff_ab_history.json"))); } catch { return ""; }
    if (!Array.isArray(hist0)) return "";
    // v55 -- one file, a dom column; charts at the read. Untagged rows
    // LIFT to raycaster -- only rc wrote before the tag existed, so the
    // lift is history, not a guess.
    // v60 -- forward-compat: UNKNOWN doms (a future "tank", "fps"
    // already wired, whatever comes) get their OWN charts after the
    // known two, sorted -- bucketed somewhere STATED, never vanished
    // silently into rc's history.
    const known60 = ["raycaster", "dungeon"];
    const extra60 = [...new Set(hist0.map(e => e.dom ?? "raycaster"))].filter(d => !known60.includes(d)).sort();
    let out55 = "";
    for (const dom55 of known60.concat(extra60)) {
        out55 += diffEndpointChartFor(dom55, hist0.filter(e => (e.dom ?? "raycaster") === dom55));
    }
    return out55;
}
function diffEndpointChartFor(dom55, hist) {
    if (!Array.isArray(hist) || hist.length < 2) return "";
    const w = 640, h = 150;
    const all = hist.flatMap(e => [e.tDur, e.tHp]).filter(v => v != null);
    const lo = Math.min(-2.6, ...all), hi = Math.max(2.6, ...all), span = hi - lo;
    const px = i => 8 + i / (hist.length - 1) * (w - 16);
    const yOf = v => h - 12 - (v - lo) / span * (h - 24);
    const line50 = (key, col, dash) => {
        const pts = hist.map((e, i) => e[key] == null ? null : `${px(i).toFixed(1)},${yOf(e[key]).toFixed(1)}`).filter(Boolean);
        return pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="1.5"${dash ? ' stroke-dasharray="4,3"' : ""}><title>${key} (latest ${hist[hist.length - 1][key]}, n=${hist[hist.length - 1][key === "tDur" ? "nDur" : "nHp"]})</title></polyline>` : "";
    };
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    for (const b of [-2, 2]) svg += `<line x1="8" y1="${yOf(b).toFixed(1)}" x2="${w - 8}" y2="${yOf(b).toFixed(1)}" stroke="#3a4252" stroke-dasharray="3,4"/>`;
    for (const b of [-2.24, 2.24]) svg += `<line x1="8" y1="${yOf(b).toFixed(1)}" x2="${w - 8}" y2="${yOf(b).toFixed(1)}" stroke="#2a3040" stroke-dasharray="2,5"/>`;
    svg += line50("tDur", "#ffd35a", false) + line50("tHp", "#5ad8ff", true);
    svg += `</svg>`;
    return `<h2>Difficulty A/B endpoints over time -- ${dom55} (duration t gold, hp-midband t cyan dashed; inner band 2.0 = single-endpoint bar, outer 2.24 = co-primary bar)</h2>` + svg;
}

// v43 -- TRADE DRIFT STRIP: adoption baseline vs post margins, the
// drift-watch chart pattern trades earned in v42. Renders only while
// an adoption is on watch with enough post data to mean anything.
function tradeDriftChart() {
    let st = null;
    try { st = JSON.parse(Deno.readTextFileSync(_statePath("trade_state.json"))); } catch { return ""; }
    if (st?.adoptedT == null || !Array.isArray(st.baselineArr) || !Array.isArray(st.post) || st.post.length < 3) return "";
    const w = 640, h = 120;
    const ctx = makeStripCtx(st.baselineArr.concat(st.post), w);
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    svg += stripBand(st.baselineArr, 35, "#5ad8ff", ctx) + stripBand(st.post, 85, "#ffd35a", ctx);
    svg += `<text x="10" y="16" fill="#5ad8ff" font-size="11">baseline at adoption (n=${st.baselineArr.length})</text>`;
    svg += `<text x="10" y="${h - 6}" fill="#ffd35a" font-size="11">post window (n=${st.post.length}, drift streak ${st.driftStreak || 0})</text>`;
    svg += `</svg>`;
    return `<h2>Trade drift watch: adopted T=${st.adoptedT} on probation</h2>` + svg;
}

// v42 -- TRADE STRIP: margins per leg, honest vs pirated, through the
// shared stripBand. Pirated legs are the red band; the honest band's
// MAD rings still flag freak margins within honest trade itself.
function tradeChart() {
    let log = null;
    try { log = JSON.parse(Deno.readTextFileSync(_statePath("trade_log.json"))); } catch { return ""; }
    if (!Array.isArray(log) || log.length < 10) return "";
    const recent = log.slice(-400);
    const honest = recent.filter(e => !e.pirated).map(e => e.margin);
    const pirated = recent.filter(e => e.pirated).map(e => e.margin);
    if (honest.length < 3) return "";
    const w = 640, h = 120;
    const ctx = makeStripCtx(honest.concat(pirated.length ? pirated : [0]), w);
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    svg += stripBand(honest, 35, "#9ecb5a", ctx);
    if (pirated.length >= 1) svg += stripBand(pirated, 85, "#ff6a5a", ctx);
    svg += `<text x="10" y="16" fill="#9ecb5a" font-size="11">honest legs (n=${honest.length})</text>`;
    svg += `<text x="10" y="${h - 6}" fill="#ff6a5a" font-size="11">pirated legs (n=${pirated.length})</text>`;
    svg += `</svg>`;
    return `<h2>Trade margins per leg (last ${recent.length}; the gap between the bands is what piracy costs)</h2>` + svg;
}

// v18 -- verdict history: z per domain over time, with the +/-1.96
// significance bands drawn as dotted lines. Watch significance emerge.
function verdictChart() {
    let hist = null;
    try {
        const path = _statePath("regime_history.json");
        hist = JSON.parse(Deno.readTextFileSync(path));
    } catch { return ""; }
    if (!Array.isArray(hist) || hist.length < 2) return "";
    const w = 640, h = 160;
    const doms = ["kaiju", "dungeon", "raycaster", "ev"], cols = { kaiju: "#9ecb5a", dungeon: "#c58aff", raycaster: "#ffb454", ev: "#5ad8ff" };   // v41
    const maxAbs = Math.max(2.5, ...hist.flatMap(r => doms.map(d => Math.abs(r[d] ?? 0))));
    const yOf = z => h / 2 - (z / maxAbs) * (h / 2 - 12);
    let svg = `<svg width="${w}" height="${h}" style="background:#181818">`;
    for (const zb of [1.96, -1.96])
        svg += `<line x1="8" y1="${yOf(zb).toFixed(1)}" x2="${w - 8}" y2="${yOf(zb).toFixed(1)}" stroke="#666" stroke-dasharray="3,4"/>`;
    svg += `<line x1="8" y1="${yOf(0).toFixed(1)}" x2="${w - 8}" y2="${yOf(0).toFixed(1)}" stroke="#333"/>`;
    for (const d of doms) {
        const pts = hist.map((r, i) => r[d] == null ? null :
            `${(i / (hist.length - 1) * (w - 16) + 8).toFixed(1)},${yOf(r[d]).toFixed(1)}`).filter(Boolean);
        if (pts.length > 1) {
            const lastZ31 = hist.map(r => r[d]).filter(v => v != null).pop();
            svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${cols[d]}" stroke-width="1.6"><title>${d}: latest z=${lastZ31}</title></polyline>`;
            // v19 -- n-annotation at the line's end: how much data stands
            // behind the latest z (significance without n is theater)
            // v20 -- n at the QUARTILES too, not just the end: how the
            // evidence accumulated matters as much as where it landed
            const idxs = hist.map((r, i) => r[d] != null ? i : -1).filter(i => i >= 0);
            const marks = [0.25, 0.5, 0.75, 1.0].map(f => idxs[Math.min(idxs.length - 1, Math.round(f * (idxs.length - 1)))]);
            const seen = new Set();
            for (const gi of marks) {
                if (seen.has(gi)) continue;
                seen.add(gi);
                const nVal = hist[gi]?.[d + "_n"];
                if (nVal == null) continue;
                const px2 = (idxs.indexOf(gi) / Math.max(1, idxs.length - 1) * (w - 16) + 8);
                const py2 = yOf(hist[gi][d]);
                svg += `<text x="${Math.min(w - 60, px2 + 4).toFixed(1)}" y="${(py2 - 4).toFixed(1)}" fill="${cols[d]}" font-size="9" opacity="0.85">n=${nVal}</text>`;
            }
        }
    }
    svg += `</svg>`;
    return `<h2>Split experiment: z over time (above the dotted band = SPLIT winning; kaiju green, dungeon purple, raycaster amber, ev cyan)</h2>` + svg;
}

function sparkline(values, w = 220, h = 36) {
    if (!values.length) return "";
    const min = Math.min(...values), max = Math.max(...values);
    const span = (max - min) || 1;
    const pts = values.map((v, i) =>
        `${(i / Math.max(1, values.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`).join(" ");
    return `<svg width="${w}" height="${h}" style="background:#181818"><polyline points="${pts}" fill="none" stroke="#7fc4ff" stroke-width="1.5"/></svg>`;
}

function probePicks(layers) {
    const goalsFor = c => Array.from({ length: c }, (_, i) => ({ x: 100 + i * 6, z: 100 + (i % 2) * 6 }));
    const out = {};
    for (const pr of PROBES) {
        const k = { x: 100 - pr.dist, z: 100, tx: 100, tz: 100, energy: 0.9 };
        let best = null, bs = -1;
        for (const a of PROBE_ATTACKS) {
            const s = fwdDeep(layers, buildAttackFeatures(k, a, goalsFor(pr.nGoals)));
            if (s > bs) { bs = s; best = a.name; }
        }
        out[pr.label] = best;
    }
    return out;
}

function holdRadius(W) {
    let hold = 0;
    for (let d = 5; d <= 45; d++) {
        const x = buildCivDefFeatures(0.7, 0.8, 0.5, d);
        let z = 0;
        for (let i = 0; i < CIVDEF_FEATURES; i++) z += W[i] * x[i];
        if (1 / (1 + Math.exp(-z)) > 0.5) hold = d;
    }
    return hold;
}

function driftL2(cur, prior) {
    let s = 0;
    const n = Math.min(cur.length, prior.length);
    for (let i = 0; i < n; i++) s += (cur[i] - prior[i]) ** 2;
    return Math.sqrt(s).toFixed(3);
}

// pad a pre-v8 13-feature attack snapshot to 15 (bias relocation),
// mirroring loadDeepWeights' migration so old snapshots chart cleanly
function migrateL1(l1W, H, nInNew) {
    const oldRow = l1W.length / H;
    if (oldRow === nInNew) return l1W;
    if (oldRow !== nInNew - 2) return null;
    const Wn = new Array(H * nInNew).fill(0);
    for (let o = 0; o < H; o++) {
        for (let i = 0; i < oldRow - 1; i++) Wn[o * nInNew + i] = l1W[o * oldRow + i];
        Wn[o * nInNew + nInNew - 1] = l1W[o * oldRow + oldRow - 1];
    }
    return Wn;
}

const rows = [];
const handAtk = buildAttackLayers()[0].W;
const handCiv = buildCivDefWeights();
const files = [];
try { for await (const e of Deno.readDir(DIR)) if (e.isFile) files.push(e.name); } catch {
    console.error("no snapshots/ directory yet -- run the brain until it snapshots (every 500 steps)");
    Deno.exit(1);
}
const steps = [...new Set(files.map(f => (f.match(/weights_attack\.(\d+)\.json/) || [])[1]).filter(Boolean))]
    .map(Number).sort((a, b) => a - b);

for (const st of steps) {
    const row = { steps: st };
    try {
        const j = JSON.parse(await Deno.readTextFile(DIR + `weights_attack.${st}.json`));
        const H = 16, nIn = handAtk.length;
        const W1 = migrateL1(j.layers[0].W, H, nIn);
        if (W1) {
            const layers = [
                { nIn, nOut: H, W: Float32Array.from(W1), b: Float32Array.from(j.layers[0].b) },
                { nIn: H, nOut: 1, W: Float32Array.from(j.layers[1].W), b: Float32Array.from(j.layers[1].b) },
            ];
            row.picks = probePicks(layers);
            row.scores = probeScores(layers);   // v9
        }
    } catch {}
    try {
        const c = JSON.parse(await Deno.readTextFile(DIR + `weights_civdef.${st}.json`));
        row.hold = holdRadius(c.W);
        row.civDrift = driftL2(c.W, handCiv);
    } catch {}
    rows.push(row);
}

let html = `<!doctype html><meta charset="utf-8"><title>GPU Brain -- what it learned</title>
<!-- v56 -- AGE BANNER: the staleness AUDIT concluded (verified by a
     Deno-shimmed live run) that every chart reads its file fresh at
     render -- no within-report readout caches another compute. The
     document ITSELF is the only cache, so it wears one banner: age
     ticks client-side, ambers past 30 minutes. -->
<div id="age56" style="font-size:11px;color:#8a94a6;margin:2px 0 8px 0" data-ts="${Date.now()}"></div>
<script>(function(){var el=document.getElementById("age56"),t0=+el.dataset.ts;
function tick(){var m=Math.floor((Date.now()-t0)/60000);
el.textContent="report generated "+(m<1?"just now":m+" min ago")+(m>30?" -- STALE for live decisions; regenerate":"");
el.style.color=m>30?"#ffb454":"#8a94a6";}tick();setInterval(tick,30000);})();</script>
<style>body{font:14px monospace;background:#111;color:#ddd;padding:24px}
table{border-collapse:collapse;margin:16px 0}td,th{border:1px solid #333;padding:6px 10px}
th{background:#1c1c1c}.flip{background:#3a2a00;color:#ffd35c;font-weight:bold}
h1{font-size:18px}h2{font-size:15px;color:#9ad}</style>
<h1>SweK GPU Brain -- training report</h1>
<p>${rows.length} snapshot(s). Highlighted cells are decision FLIPS vs the previous snapshot.</p>
<h2>Attack policy: probe picks over training</h2><table><tr><th>steps</th>`;
for (const pr of PROBES) html += `<th>${pr.label}</th>`;
html += `</tr>`;
let prev = null;
for (const r of rows) {
    html += `<tr><td>${r.steps}</td>`;
    for (const pr of PROBES) {
        const v = r.picks?.[pr.label] ?? "-";
        const flip = prev && prev.picks && prev.picks[pr.label] && v !== prev.picks[pr.label];
        html += `<td${flip ? ' class="flip"' : ""}>${v}</td>`;
    }
    html += `</tr>`;
    prev = r;
}
// v9 -- sparklines: per probe, the WINNING margin (top score minus
// runner-up) over training. A rising line = growing conviction; a dip
// through zero is a decision flip seen as a curve instead of a cell.
html += experimentConsole();   // v24 -- read this first
html += tSweepChart();   // v27 -- the tuning's story
html += podium();   // v27 -- finished series
html += diffChart("./difficulty_ab.json", "Difficulty A/B (raycaster)");   // v32
html += driftChart("./difficulty_ab.json", "Drift watch (raycaster)");   // v37
html += diffChart("./difficulty_ab_dgn.json", "Difficulty A/B (dungeon)");   // v32
html += driftChart("./difficulty_ab_dgn.json", "Drift watch (dungeon)");   // v37
html += tradeChart();   // v42 -- the economy's honest picture
html += tradeDriftChart();   // v43 -- adopted boldness on watch
html += escortThChart();   // v44 -- the tripwire's diary
html += escortEpChart();   // v45 -- the verdict's raw material
html += escortEndpointChart();   // v47 -- both endpoints' diaries
html += diffEndpointChart();   // v50 -- the difficulty twins' diary
html += dgnHpChart();   // v54 -- the dungeon says how it felt
html += doseChart();   // v51 -- the ladder's biography
html += verifyTimingChart();   // v68 -- the ship ritual's own pulse
html += escortSysTable();   // v51 -- where piracy landed (secondary)
html += duelChart();   // v14 -- present only when a duel has been fought
html += verdictChart();   // v18 -- present only when verdicts have been computed
html += `</table><h2>Attack policy: conviction sparklines (top score minus runner-up)</h2><table><tr>`;
for (const pr of PROBES) html += `<th>${pr.label}</th>`;
html += `</tr><tr>`;
for (const pr of PROBES) {
    const series = rows.map(r => {
        const s = r.scores?.[pr.label];
        if (!s) return 0;
        const v = Object.values(s).sort((a, b) => b - a);
        return (v[0] ?? 0) - (v[1] ?? 0);
    });
    html += `<td>${sparkline(series)}</td>`;
}
html += `</tr></table>`;
html += `<h2>Civ defense: hold radius + drift from the hand prior</h2>
<table><tr><th>steps</th><th>fires out to</th><th>weight drift (L2)</th></tr>`;
for (const r of rows) html += `<tr><td>${r.steps}</td><td>${r.hold ?? "-"}u</td><td>${r.civDrift ?? "-"}</td></tr>`;
html += `</table><p>Generated ${new Date().toISOString()} by report.js</p>`;

await Deno.writeTextFile(DIR + "report.html", html);
console.log(`[report] wrote ${DIR}report.html covering ${rows.length} snapshot(s)`);
