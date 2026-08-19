// demos_code/skybox_gen.js — AI-generated skybox via OllamaDiffuser.
//
// Prompts the user (or cycles through default prompts), calls the
// local OllamaDiffuser to generate an equirectangular sky image, and
// applies the result as a skybox overlay blended over the procedural
// sky. Round 138 added uSkybox/uSkyboxStrength uniforms to the sky
// shader; this demo drives them.
//
// Requires OllamaDiffuser running locally:
//     pip install "ollamadiffuser[full]"
//     ollamadiffuser pull z-image-turbo
//     ollamadiffuser serve              # listens on :8000 by default
//
// Z-Image-Turbo at 4 steps + 512x256 typically takes 1-3 seconds on
// a desktop GPU. The demo lets you queue prompts and rotate between
// generated images.

import { OllamaDiffuserClient } from "../ai/OllamaDiffuserClient.js";

const DEFAULT_PROMPTS = [
    "alien desert planet panoramic sky, twin suns setting, dust haze, sci-fi concept art, no foreground",
    "stormy cyberpunk megacity skybox, neon clouds, equirectangular panorama, no buildings",
    "underwater abyssal sky panorama, bioluminescent particles, deep teal void, no terrain",
    "volcanic alien world sky, embers, ash clouds, deep red atmosphere, equirectangular",
    "Mars-like dusty horizon panorama, two moons visible, ochre sky, no foreground rocks",
    "ethereal cosmic nebula skybox, deep purple, scattered stars, no planets",
];
const TARGET_WIDTH  = 1024;
const TARGET_HEIGHT = 512;
const STEPS         = 4;

let client = null;
let overlay = null;
let panel = null;
let promptInput = null;
let gallery = [];   // [{dataUrl, prompt, image, applied}]
let galleryIdx = 0;
let busy = false;
let messageText = "";
let messageColor = "#9fd";
let ctxRef = null;

function render() {
    if (!panel) return;
    const stats = client ? client.stats() : {};
    const cur = gallery[galleryIdx];
    const thumbsHtml = gallery.length
        ? gallery.map((g, i) => {
            const sel = (i === galleryIdx) ? "outline:2px solid #fd0;" : "outline:1px solid #333;";
            return `<img src="${g.dataUrl}" data-idx="${i}" class="skybox_thumb" style="width:44px;height:22px;object-fit:cover;cursor:pointer;${sel}border-radius:2px;margin-right:4px"/>`;
        }).join("")
        : `<div style="opacity:0.5;font-size:10px">no images yet</div>`;
    const status = busy
        ? `<span style="color:#fc4">generating…</span>`
        : (messageText
            ? `<span style="color:${messageColor}">${messageText}</span>`
            : `<span style="opacity:0.6">ready</span>`);
    const detail = cur
        ? `<div style="font-size:10px;opacity:0.6;margin-top:4px;line-height:1.3;max-height:30px;overflow:hidden">${cur.prompt}</div>`
        : "";
    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🎨 AI SKYBOX
        </div>
        <div style="font-size:11px;color:#9fd;line-height:1.6">
            Diffuser: <b>${client?.available === true ? "ok" : client?.available === false ? "offline" : "unknown"}</b><br/>
            Gens: <b>${stats.totalCalls ?? 0}</b> · avg <b>${stats.avgDurationMs ?? 0}ms</b>
        </div>
        <div style="margin-top:8px">
            <input type="text" class="skybox_prompt"
                   value="${(promptInput?.value || DEFAULT_PROMPTS[0]).replace(/"/g, '&quot;')}"
                   placeholder="prompt"
                   style="width:100%;background:#000;color:#9fd;border:1px solid #2a4;padding:4px 6px;font:10px monospace;border-radius:3px;box-sizing:border-box;pointer-events:auto"/>
        </div>
        <div style="margin-top:6px;display:flex;gap:4px">
            <button class="skybox_gen"  style="flex:1;background:#062;color:#0fa;border:1px solid #0a6;padding:4px 6px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">GENERATE</button>
            <button class="skybox_pick" style="flex:1;background:#222;color:#9fd;border:1px solid #444;padding:4px 6px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">RANDOM</button>
            <button class="skybox_off"  style="flex:1;background:#400;color:#f99;border:1px solid #800;padding:4px 6px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">REMOVE</button>
        </div>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap">
            ${thumbsHtml}
        </div>
        ${detail}
        <div style="margin-top:6px;font-size:10px">
            ${status}
        </div>`;
    promptInput = panel.querySelector(".skybox_prompt");
    panel.querySelector(".skybox_gen").onclick  = () => doGenerate(promptInput.value);
    panel.querySelector(".skybox_pick").onclick = () => {
        const p = DEFAULT_PROMPTS[Math.floor(Math.random() * DEFAULT_PROMPTS.length)];
        promptInput.value = p;
        doGenerate(p);
    };
    panel.querySelector(".skybox_off").onclick = () => {
        const r = ctxRef?.renderer ?? null;
        const sky = r?.skyRenderer ?? null;
        if (sky?.setSkyboxImage) sky.setSkyboxImage(null);
        messageText = "skybox cleared";
        messageColor = "#9fd";
        render();
    };
    for (const t of panel.querySelectorAll(".skybox_thumb")) {
        t.onclick = () => {
            galleryIdx = parseInt(t.dataset.idx, 10);
            applyImage(gallery[galleryIdx]);
        };
    }
}

async function doGenerate(prompt) {
    if (busy) return;
    if (!client) {
        messageText = "client not initialized";
        messageColor = "#f99";
        render();
        return;
    }
    busy = true;
    messageText = "";
    render();

    const res = await client.generate(prompt, {
        width:  TARGET_WIDTH,
        height: TARGET_HEIGHT,
        steps:  STEPS,
    });
    busy = false;

    if (!res.ok) {
        messageText = "error: " + res.error;
        messageColor = "#f99";
        render();
        return;
    }
    // Decode into HTMLImageElement
    const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload  = () => resolve(im);
        im.onerror = () => reject(new Error("decode failed"));
        im.src = res.dataUrl;
    }).catch(() => null);

    if (!img) {
        messageText = "decode failed";
        messageColor = "#f99";
        render();
        return;
    }
    const entry = { dataUrl: res.dataUrl, prompt, image: img, applied: false };
    gallery.unshift(entry);
    if (gallery.length > 6) gallery.length = 6;
    galleryIdx = 0;
    messageText = `generated in ${res.duration_ms.toFixed(0)}ms`;
    messageColor = "#0fa";
    applyImage(entry);
}

function applyImage(entry) {
    if (!entry?.image) return;
    const sky = ctxRef?.renderer?.skyRenderer;
    if (!sky?.setSkyboxImage) {
        messageText = "skyRenderer.setSkyboxImage missing — sky shader needs round-138 patch";
        messageColor = "#f99";
        render();
        return;
    }
    sky.setSkyboxImage(entry.image, { strength: 0.95, yaw: 0 });
    entry.applied = true;
    render();
    ctxRef?.kpop?.info?.("Skybox", "Applied — " + entry.prompt.slice(0, 50) + "…");
}

export default {
    id:    "skybox_gen",
    label: "SKYBOX GEN (OLLAMADIFFUSER)",
    hint:  "Generate skyboxes with local Z-Image-Turbo and apply to sky in real time",
    controls: [
        "Type a prompt and GENERATE, or RANDOM picks a curated one",
        "Click any thumbnail to re-apply that image",
        "REMOVE returns to procedural sky",
        "Requires OllamaDiffuser running on localhost:8000",
    ],

    async start(ctx) {
        ctxRef = ctx;
        // Round 159 — prefer the shared singleton (per-task model choice)
        client = window._diffuser ?? new OllamaDiffuserClient();

        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "left:20px",
            "top:140px",
            "width:280px",
            "background:rgba(4,12,20,0.92)",
            "border:1px solid #066",
            "border-radius:4px",
            "box-shadow:0 0 16px rgba(0,200,100,0.25), inset 0 0 16px rgba(0,80,40,0.15)",
            "padding:12px 14px",
            "color:#0fa",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:auto",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        // Probe immediately so the UI reflects availability
        await client.probe();
        gallery = [];
        galleryIdx = 0;
        busy = false;
        messageText = client.available
            ? "diffuser available — try GENERATE"
            : "diffuser offline — start ollamadiffuser serve";
        messageColor = client.available ? "#9fd" : "#fc4";
        render();
        console.log("[skybox_gen] started; diffuser:", client.available);
    },

    tick(ctx, dt) {
        // No per-frame work; everything is event-driven.
    },

    stop(ctx) {
        // Don't clear the skybox on stop — the user probably wants the
        // last applied image to persist. Clear via REMOVE button.
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null; promptInput = null;
        ctxRef = null;
        gallery = [];
        console.log("[skybox_gen] stopped");
    },
};
