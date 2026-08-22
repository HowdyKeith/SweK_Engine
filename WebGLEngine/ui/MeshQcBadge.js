// FILE: ui/MeshQcBadge.js
// VERSION: v1 — round 357
//
// Floating mesh QC badge — shows triangle/vertex count, watertight
// status, surface area, smoothness, and pool stats for the most
// recently analyzed mesh. Draggable handle on top, z-index above the
// benchmark overlay panel.

import { makeDraggable } from "./draggable.js";
import { gradeQc } from "../engine/meshQcAnalyzer.js";

let _badge = null;

/**
 * Show or refresh the singleton QC badge with the given result.
 *
 * @param {string} entityName  display name (e.g. "p3d:icosphere-...")
 * @param {object} qc          result from analyzeMesh()
 * @param {object} [poolStats] optional WorkerPool.stats() snapshot
 */
export function showQcBadge(entityName, qc, poolStats = null) {
    if (!_badge) _badge = _build();
    _badge.update(entityName, qc, poolStats);
    _badge.element.style.display = "block";
    return _badge;
}

export function hideQcBadge() {
    if (_badge) _badge.element.style.display = "none";
}

export function getQcBadge() {
    return _badge;
}

function _build() {
    const el = document.createElement("div");
    Object.assign(el.style, {
        position: "fixed",
        top: "180px",
        right: "20px",
        background: "rgba(8,14,20,0.95)",
        border: "1px solid #6ad",
        borderRadius: "8px",
        padding: "8px 12px 10px 12px",
        color: "#cfd",
        fontFamily: "monospace",
        fontSize: "11px",
        minWidth: "260px",
        zIndex: "8850",
        boxShadow: "0 0 24px rgba(80,180,255,0.18)",
    });
    el.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="color:#6cf; font-weight:bold; letter-spacing:1px;">⬢ MESH QC</div>
            <div id="qcb-grade" style="font-size:10px; padding:2px 6px; border-radius:3px; font-weight:bold;">—</div>
        </div>
        <div id="qcb-name" style="color:#9ab; font-size:10px; margin-bottom:6px; word-break:break-all;">—</div>
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <tr><td style="color:#789;">tris</td>    <td id="qcb-tris" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">verts</td>   <td id="qcb-verts" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">bbox</td>    <td id="qcb-bbox" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">area</td>    <td id="qcb-area" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">avg edge</td><td id="qcb-edge" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">watertight</td><td id="qcb-water" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">smooth</td>  <td id="qcb-smooth" style="text-align:right;">—</td></tr>
            <tr><td style="color:#789;">analysis</td><td id="qcb-took" style="text-align:right;">—</td></tr>
        </table>
        <div id="qcb-reasons" style="color:#fa6; font-size:10px; margin-top:6px;"></div>
        <div id="qcb-pool" style="color:#9ab; font-size:9px; margin-top:6px; border-top:1px solid #233; padding-top:5px;">pool: —</div>
    `;
    document.body.appendChild(el);

    const drag = makeDraggable(el, { label: "MESH QC", storageKey: "meshQcBadge" });
    drag.attach();

    return {
        element: el,
        update(entityName, qc, poolStats) {
            const { grade, reasons } = gradeQc(qc);
            const gradeColors = {
                good: "#4c4",
                warn: "#fa6",
                bad:  "#f55",
            };
            const gradeBg = {
                good: "rgba(70,170,80,0.22)",
                warn: "rgba(255,170,90,0.22)",
                bad:  "rgba(255,90,90,0.22)",
            };
            const $ = id => el.querySelector("#" + id);
            $("qcb-grade").textContent = grade.toUpperCase();
            $("qcb-grade").style.color = gradeColors[grade];
            $("qcb-grade").style.background = gradeBg[grade];
            $("qcb-name").textContent = entityName || "—";
            $("qcb-tris").textContent = qc.triCount.toLocaleString();
            $("qcb-verts").textContent = qc.vertCount.toLocaleString();
            const bb = qc.bboxSize;
            $("qcb-bbox").textContent = `${bb[0].toFixed(2)}×${bb[1].toFixed(2)}×${bb[2].toFixed(2)}`;
            $("qcb-area").textContent = qc.surfaceArea.toFixed(2);
            $("qcb-edge").textContent = qc.avgEdgeLength.toFixed(4);
            $("qcb-water").innerHTML = qc.watertight
                ? `<span style="color:#4c4;">✓ yes</span>`
                : `<span style="color:#fa6;">✗ ${qc.nonManifoldEdges} non-manifold</span>`;
            const smoothPct = (qc.smoothness * 100).toFixed(1);
            $("qcb-smooth").textContent = `${smoothPct}%`;
            $("qcb-took").innerHTML = qc.fromWorker
                ? `<span style="color:#6c9;">worker</span> ${qc.durationMs.toFixed(1)}ms`
                : `<span style="color:#aa6;">main</span> ${qc.durationMs.toFixed(1)}ms`;
            $("qcb-reasons").textContent = reasons.length > 0
                ? "⚠ " + reasons.join(" · ")
                : "";
            if (poolStats) {
                $("qcb-pool").textContent =
                    `pool [${poolStats.label}]: ${poolStats.jobs} jobs · ` +
                    `${poolStats.avgMs.toFixed(1)}ms avg · ${poolStats.workers} workers · ` +
                    `${poolStats.pending} pending` +
                    (poolStats.failures > 0 ? ` · ${poolStats.failures} failures` : "");
            } else {
                $("qcb-pool").textContent = "pool: main-thread fallback";
            }
        },
        dispose() {
            drag.detach();
            try { el.remove(); } catch {}
            if (_badge && _badge.element === el) _badge = null;
        },
    };
}
