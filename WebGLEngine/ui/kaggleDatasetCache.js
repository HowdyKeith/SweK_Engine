// FILE: ui/kaggleDatasetCache.js
// VERSION: v1 — round 201 (v696)
//
// Manages the per-template Kaggle Dataset slug map that the bridge uses
// to inject `dataset_sources` into kernel-metadata.json at submit time.
// When a template has a cached dataset slug configured, Kaggle mounts
// that dataset at /kaggle/input/<slug-tail>/ and the notebook's
// cache-detection cell uses the pre-downloaded weights instead of
// running a fresh 10-25GB HuggingFace snapshot_download.
//
// Workflow the user follows:
//
//   1. Run a template once with NO cache configured. The notebook
//      downloads weights from HuggingFace into /kaggle/working/ as
//      normal. This is the slow first run (15-25 min).
//
//   2. Go to the completed kernel on kaggle.com. In the "Output" or
//      "Data" tab, click the option to save the output as a new
//      Kaggle Dataset. Kaggle generates a slug like
//      "yourusername/z-image-turbo-weights".
//
//   3. Open this panel in the engine, paste the slug into the
//      Z-Image row, click Save. The bridge persists it to
//      kaggle.config.json.
//
//   4. Future submissions of that template auto-attach the dataset.
//      First-run cost drops from 15-25 min (download) to 1-3 min
//      (mount + load).
//
// The panel is mountable as a floating modal — mountKaggleDatasetCache()
// returns { open, close, isOpen, root }. The Kaggle Setup Wizard's
// "Complete!" view and the Kaggle Lab panel both expose links to it.

const C = {
    bg:       "rgba(10, 14, 22, 0.97)",
    border:   "#553a7a",
    accent:   "#c9b",
    text:     "#cfd",
    dim:      "#9bc",
    ok:       "#6c8",
    warn:     "#ec9",
    bad:      "#c66",
    row_bg:   "rgba(20, 24, 36, 0.92)",
    btn_bg:   "rgba(85, 58, 122, 0.4)",
    btn_brd:  "#7c5fa8",
    input_bg: "#15131e",
};

// Heuristic — which templates actually BENEFIT meaningfully from caching.
// Image-gen models with multi-GB weight downloads are the big win.
// Image-to-3D models with custom CUDA builds save some time but the
// dep compile is the dominant cost; cache helps less. v701 retrofitted
// 8 older image-to-3D templates with a generic HF_HUB_CACHE redirect
// cell (works for any transformers/diffusers template if the user's
// Kaggle Dataset is laid out as an HF cache directory). Diagnostic
// remains the only template without cache support.
const CACHE_AWARE = new Set([
    // v696 originals — explicit weight-download skip
    "z_image", "qwen_image", "pixal3d", "lito",
    // v701 retrofit — generic HF_HUB_CACHE redirect
    "trellis2", "hunyuan3d", "triposr", "triposg",
    "instantmesh", "stable_fast_3d", "lgm", "direct3d_s2",
]);

// Optional friendly labels for templates. Falls back to the id if absent.
const LABELS = {
    z_image:    "Z-Image-Turbo (text → image, 6B)",
    qwen_image: "Qwen-Image (text → image, 20B)",
    pixal3d:    "Pixal3D (image → 3D)",
    lito:       "LiTo (image → 3D w/ lighting)",
    trellis2:   "Trellis2",
    hunyuan3d:  "Hunyuan3D",
    triposr:    "TripoSR",
    triposg:    "TripoSG",
    instantmesh: "InstantMesh",
    stable_fast_3d: "Stable-Fast-3D",
    lgm:        "LGM",
    kimodo:     "Kimodo",
    sam3d_objects: "SAM3D-Objects",
    sam3d_body: "SAM3D-Body",
    rig_anything: "Rig-Anything",
    direct3d_s2: "Direct3D-S2",
    diagnostic: "Diagnostic",
};

// Helpers ---------------------------------------------------------------

function el(tag, styles, text) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (text != null) e.textContent = text;
    return e;
}

async function _fetchCache() {
    try {
        const r = await fetch("/kaggle/datasets/cache", { cache: "no-store" });
        if (!r.ok) return null;
        return r.json();
    } catch { return null; }
}

async function _saveCache(template, slug) {
    try {
        const r = await fetch("/kaggle/datasets/cache", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template, slug: slug || "" }),
        });
        const txt = await r.text();
        if (!txt) return { ok: r.ok };
        try { return JSON.parse(txt); } catch { return { ok: false, error: txt.slice(0, 200) }; }
    } catch (e) { return { ok: false, error: e.message }; }
}

// Mount -----------------------------------------------------------------

export function mountKaggleDatasetCache() {
    let root = null;

    function _build() {
        const wrap = el("div", {
            position: "fixed",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "9500",
            width: "min(640px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 100px)",
            overflow: "auto",
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: "10px",
            padding: "14px 18px",
            color: C.text,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 12px 40px rgba(0,0,0,0.65)",
        });
        wrap.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                <div style="color:${C.accent}; font-weight:700; font-size:14px; letter-spacing:0.04em;">
                    📦 KAGGLE DATASET CACHE
                </div>
                <button id="kdc-close" title="close" style="background:transparent; border:0; color:${C.text}; cursor:pointer; font-size:16px; padding:2px 6px;">✕</button>
            </div>
            <div style="color:${C.dim}; font-size:11px; margin-bottom:12px;">
                Cuts first-run time on Z-Image / Qwen-Image / LiTo / Pixal3D from <b>15-25 min</b> down to <b>1-3 min</b>
                by attaching pre-downloaded weights as a Kaggle Dataset.
            </div>
            <details style="background:${C.row_bg}; border:1px solid ${C.border}; border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:11px;">
                <summary style="cursor:pointer; color:${C.accent}; font-weight:600;">📖 How to make a cache (one-time per model)</summary>
                <ol style="margin:8px 0 0 18px; padding:0; color:${C.dim};">
                    <li>Submit the template once via Kaggle Lab — first run is slow because it downloads weights from HuggingFace.</li>
                    <li>When the kernel completes, click its Kaggle URL (under "Tracked lab jobs").</li>
                    <li>On the kernel page → <b>Data → New Dataset</b>. Pick the weight folder under <code style="background:${C.input_bg}; padding:1px 4px; border-radius:3px;">/kaggle/working/</code> as the source.</li>
                    <li>Kaggle generates a slug like <code style="background:${C.input_bg}; padding:1px 4px; border-radius:3px;">yourname/z-image-turbo-weights</code>. Copy it.</li>
                    <li>Paste the slug into the row below and click <b>Save</b>. Future submissions auto-attach the dataset.</li>
                </ol>
                <div style="color:${C.dim}; margin-top:6px; font-size:10px;">
                    <b>Why bother:</b> Z-Image / Qwen-Image weights are 10-25 GB each. Without caching, every run
                    re-downloads them. The free Kaggle tier limits ~30 hrs/week of compute — spending half of that
                    on redundant downloads burns the budget fast.
                </div>
            </details>
            <div id="kdc-rows" style="margin-bottom:12px;">
                <span style="color:${C.dim};">Loading cache state…</span>
            </div>
            <div id="kdc-msg" style="font-size:11px; min-height:1.4em; color:${C.dim};"></div>
        `;
        return wrap;
    }

    function _renderRow(template, currentSlug, supported) {
        const row = el("div", {
            background: C.row_bg,
            border: `1px solid ${C.border}`,
            borderRadius: "6px",
            padding: "8px 10px",
            margin: "6px 0",
        });
        const label = LABELS[template] || template;
        const cachedIndicator = currentSlug
            ? `<span style="color:${C.ok};">✓ cached</span>`
            : `<span style="color:${C.dim};">◯ no cache</span>`;
        const supportBadge = supported
            ? ""
            : `<span title="this template doesn't have a cache-detection cell yet — setting a slug attaches the dataset but the notebook may not use it" style="color:${C.warn}; font-size:10px; margin-left:8px;">no cache cell yet</span>`;
        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <span style="color:${C.text}; font-weight:600; flex:1;">${label}</span>
                ${cachedIndicator}
                ${supportBadge}
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <input class="kdc-input" type="text" value="${(currentSlug || "").replace(/"/g, "&quot;")}"
                    placeholder="username/dataset-name"
                    style="flex:1; padding:5px 8px; background:${C.input_bg}; color:${C.text}; border:1px solid ${C.border}; border-radius:4px; font:11px ui-monospace,Menlo,monospace;"/>
                <button class="kdc-save" data-tpl="${template}" style="padding:5px 12px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; cursor:pointer; font:11px ui-monospace,Menlo,monospace;">Save</button>
                ${currentSlug ? `<button class="kdc-clear" data-tpl="${template}" title="clear" style="padding:5px 10px; background:transparent; color:${C.warn}; border:1px solid ${C.border}; border-radius:4px; cursor:pointer; font:11px ui-monospace,Menlo,monospace;">✕</button>` : ""}
            </div>
        `;
        return row;
    }

    async function _refresh() {
        const rowsEl = root.querySelector("#kdc-rows");
        const msg    = root.querySelector("#kdc-msg");
        msg.textContent = "";
        rowsEl.innerHTML = "";
        const data = await _fetchCache();
        if (!data) {
            rowsEl.innerHTML = `<span style="color:${C.bad};">Bridge unreachable — is the AI bridge running?</span>`;
            return;
        }
        const cached = data.cachedDatasets || {};
        const known  = (data.knownTemplates || []).slice().sort((a, b) => {
            // Cache-aware first, then alphabetical
            const aw = CACHE_AWARE.has(a) ? 0 : 1;
            const bw = CACHE_AWARE.has(b) ? 0 : 1;
            return aw - bw || a.localeCompare(b);
        });
        for (const tpl of known) {
            const row = _renderRow(tpl, cached[tpl] || "", CACHE_AWARE.has(tpl));
            rowsEl.appendChild(row);
        }
    }

    function _bind() {
        root.addEventListener("click", async (ev) => {
            const t = ev.target;
            if (t.id === "kdc-close") { close(); return; }
            // Save button
            if (t.classList && t.classList.contains("kdc-save")) {
                const tpl = t.dataset.tpl;
                const inputEl = t.closest("div").querySelector(".kdc-input");
                const slug = (inputEl?.value || "").trim();
                const msg = root.querySelector("#kdc-msg");
                t.disabled = true; t.textContent = "Saving…";
                const r = await _saveCache(tpl, slug);
                if (r.ok) {
                    msg.style.color = C.ok;
                    msg.textContent = slug ? `✓ saved ${tpl} → ${slug}` : `✓ cleared ${tpl}`;
                    await _refresh();
                } else {
                    msg.style.color = C.bad;
                    msg.textContent = "save failed: " + (r.error || "unknown");
                    t.disabled = false; t.textContent = "Save";
                }
                return;
            }
            // Clear button
            if (t.classList && t.classList.contains("kdc-clear")) {
                const tpl = t.dataset.tpl;
                const msg = root.querySelector("#kdc-msg");
                const r = await _saveCache(tpl, "");
                if (r.ok) {
                    msg.style.color = C.ok;
                    msg.textContent = `✓ cleared ${tpl}`;
                    await _refresh();
                } else {
                    msg.style.color = C.bad;
                    msg.textContent = "clear failed: " + (r.error || "unknown");
                }
                return;
            }
        });
    }

    function open() {
        if (root) return;
        root = _build();
        document.body.appendChild(root);
        _bind();
        _refresh();
    }

    function close() {
        if (!root) return;
        root.remove();
        root = null;
    }

    function isOpen() { return !!root; }

    return { open, close, isOpen, get root() { return root; } };
}
