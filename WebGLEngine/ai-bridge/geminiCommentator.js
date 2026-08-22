// ===================================================================
// geminiCommentator.js  (CommonJS)
// -------------------------------------------------------------------
// Periodically grabs the latest spectator JPEG frame and asks Google's
// Gemini Vision API to call the action — like a sports caster watching
// the kaiju-vs-civilization battle. The one-line commentary is then
// broadcast to every WS client as { type:"ai:commentary", text, ... }
// so the engine can surface it (ticker, face-avatar speech, etc.).
//
// FREE-TIER AWARE (this is the whole point):
//   • Default model gemini-2.5-flash-lite (highest free throughput:
//     ~15 req/min, 1000/day). Default cadence is one call every 8s,
//     well under the limit even with headroom for other traffic.
//   • maxOutputTokens kept tiny (short caster lines) to spare quota.
//   • 429 (rate-limited) → exponential backoff up to 2 min, so a
//     burst never spams Google or stalls the bridge.
//   • Key is NEVER hard-coded. Read from process.env.GEMINI_API_KEY or
//     pushed at runtime via setKey() (e.g. VBA reads it from the
//     Windows Credential Manager and POSTs it to the bridge).
// ===================================================================

const MODEL_DEFAULT = "gemini-2.5-flash-lite";   // free-tier workhorse
const ENDPOINT = (model, key) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

function createCommentator({ getFrame, broadcast, log = console.log } = {}) {
    let key        = (process.env.GEMINI_API_KEY || "").trim() || null;
    let model      = (process.env.GEMINI_MODEL || "").trim() || MODEL_DEFAULT;
    let intervalMs = 8000;
    let persona    = "a hyped e-sports caster narrating a giant-kaiju-vs-civilization battle";
    let running    = false;
    let timer      = null;
    let busy       = false;
    let backoffMs  = 0;          // grows on 429; decremented each idle tick
    let lastText   = null;
    let lastErr    = null;
    let stats      = { calls: 0, ok: 0, rateLimited: 0, lastMs: 0 };

    function setKey(k) {
        key = (k && String(k).trim()) || null;
        lastErr = null; backoffMs = 0;
        log(`[gemini] api key ${key ? "set (" + key.length + " chars)" : "cleared"}`);
        return { hasKey: !!key };
    }

    async function tick(force = false) {
        if (!force && (!running || busy)) return;
        if (busy) return;
        if (!force && backoffMs > 0) { backoffMs = Math.max(0, backoffMs - intervalMs); return; }
        if (!key) { lastErr = "no_api_key"; return; }
        const frame = (typeof getFrame === "function") ? getFrame() : null;
        if (!frame || !frame.buffer || !frame.buffer.length) { lastErr = "no_frame"; return; }

        busy = true;
        const t0 = Date.now();
        stats.calls++;
        try {
            const b64 = frame.buffer.toString("base64");
            const body = {
                contents: [{
                    role: "user",
                    parts: [
                        { text: `You are ${persona}. In ONE punchy sentence (max ~18 words), call the action you see in this frame of the game. No preamble, no quotes, present tense.` },
                        { inline_data: { mime_type: frame.mime || "image/jpeg", data: b64 } },
                    ],
                }],
                generationConfig: { temperature: 1.0, maxOutputTokens: 60 },
            };
            const resp = await fetch(ENDPOINT(model, key), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (resp.status === 429) {
                stats.rateLimited++;
                backoffMs = Math.min(120000, (backoffMs || intervalMs) * 2);
                lastErr = "rate_limited_429";
                log(`[gemini] 429 — backing off ${Math.round(backoffMs / 1000)}s`);
                return;
            }

            let data = null;
            try { data = await resp.json(); } catch {}
            if (!resp.ok) {
                lastErr = `http_${resp.status}:${(data?.error?.message || "").slice(0, 140)}`;
                log("[gemini]", lastErr);
                return;
            }

            const text = (data?.candidates?.[0]?.content?.parts || [])
                .map(p => p.text || "").join(" ").trim().replace(/^["']|["']$/g, "");
            if (text) {
                lastText = text; lastErr = null; stats.ok++;
                try { broadcast && broadcast({ type: "ai:commentary", text, model, ts: Date.now() }); } catch {}
                log(`[gemini] 🎙  ${text}`);
            } else {
                lastErr = "empty_response";
            }
        } catch (e) {
            lastErr = "fetch:" + (e?.message || String(e));
            log("[gemini] tick failed:", lastErr);
        } finally {
            stats.lastMs = Date.now() - t0;
            busy = false;
        }
    }

    return {
        start(opts = {}) {
            if (opts.intervalMs) intervalMs = Math.max(4000, opts.intervalMs | 0);
            if (opts.model)      model = String(opts.model);
            if (opts.persona)    persona = String(opts.persona);
            if (opts.key)        setKey(opts.key);
            if (running) return this.status();
            running = true; busy = false; backoffMs = 0;
            timer = setInterval(tick, intervalMs);
            log(`[gemini] commentator ON — model=${model}, every ${intervalMs / 1000}s, key=${key ? "set" : "MISSING"}`);
            return this.status();
        },
        stop() {
            running = false;
            if (timer) clearInterval(timer);
            timer = null;
            log("[gemini] commentator OFF");
            return this.status();
        },
        setKey,
        getKey() { return key; },     // server-internal only — never broadcast
        setPersona(p) { if (p) persona = String(p); return { persona }; },
        triggerOnce() { return tick(true); },     // manual fire (bypasses run/backoff guards)
        status() {
            return {
                running, hasKey: !!key, model, intervalMs, persona,
                backoffMs, lastText, lastErr, stats: { ...stats },
            };
        },
    };
}

module.exports = { createCommentator };

// ===================================================================
// generateCreature(getKey, prompt, opts)
// -------------------------------------------------------------------
// PATH 2 — text → voxel-creature blueprint. Asks Gemini for a blocky
// creature as JSON the voxel engine can assemble directly (no mesh
// pipeline, no GPU diffusion — pure free-tier text API). Server-side
// validation hard-clamps everything so a bad model response can never
// blow up the engine: coords clamped to a cube, palette to 0-7, voxel
// count capped, duplicates dropped.
// ===================================================================
const CREATURE_MODEL = "gemini-2.5-flash";   // better structured JSON than lite
const COORD = 8;            // voxels live in -8..+8 on each axis
const MAX_VOXELS = 700;

// v625 — voxel-gen generation config. Two critical fixes for the "bad_json"
// failures:
//   1. thinkingConfig.thinkingBudget = 0 — gemini-2.5-flash enables "thinking"
//      by default, which burns output tokens BEFORE emitting any JSON. With a
//      small maxOutputTokens the thinking ate the whole budget and the JSON
//      came back truncated (→ JSON.parse throws → bad_json). It also caused the
//      ~1-minute wait the user saw. Disabling thinking is both faster and frees
//      the entire token budget for the actual voxel array.
//   2. maxOutputTokens raised 8000 → 32000. A 450-voxel body is ~4-5k tokens of
//      array data; 8000 left almost no headroom once any preamble crept in.
function _voxelGenConfig() {
    return {
        temperature: 0.9,
        maxOutputTokens: 32000,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
    };
}

// v625 — robust parse for the voxel-asset JSON. Gemini occasionally:
//   • wraps the JSON in ```json fences (only the start/end ones were stripped
//     before — interior prose broke it),
//   • truncates mid-array when it hits the token cap (finishReason MAX_TOKENS),
//   • emits a leading/trailing prose sentence despite responseMimeType.
// Strategy: pull the text, strip fences, slice from the first '{' to the last
// '}'. If that still won't parse AND the response was truncated, salvage by
// trimming back to the last complete "[x,y,z,c]" entry and closing the array +
// object by hand. Returns { obj } on success or { error, raw, finishReason }.
function _parseVoxelResponse(data) {
    const cand = data?.candidates?.[0];
    const finishReason = cand?.finishReason || cand?.finish_reason || null;
    let raw = (cand?.content?.parts || []).map(p => p.text || "").join("").trim();
    // Strip markdown fences anywhere (not just exact start/end).
    raw = raw.replace(/```(?:json)?/gi, "").trim();
    // Slice to the outermost object braces if there's stray prose.
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        raw = raw.slice(firstBrace, lastBrace + 1);
    }
    // First attempt: parse as-is.
    try { return { obj: JSON.parse(raw) }; } catch { /* fall through to salvage */ }

    // Salvage attempt: the JSON is likely truncated. Find the voxels array,
    // trim to the last complete "]" entry inside it, then close it cleanly.
    try {
        const vIdx = raw.indexOf("\"voxels\"");
        if (vIdx >= 0) {
            const arrStart = raw.indexOf("[", vIdx);
            if (arrStart >= 0) {
                // Walk forward tracking bracket depth; record the index just
                // after each complete inner entry (depth returns to 1).
                let depth = 0, lastCompleteInner = -1;
                for (let i = arrStart; i < raw.length; i++) {
                    const ch = raw[i];
                    if (ch === "[") depth++;
                    else if (ch === "]") {
                        depth--;
                        if (depth === 1) lastCompleteInner = i; // closed an inner [x,y,z,c]
                        if (depth === 0) { lastCompleteInner = -2; break; } // array already closed
                    }
                }
                if (lastCompleteInner === -2) {
                    // Array was actually closed; the break must be elsewhere — try
                    // grabbing just the voxels array and rebuilding a minimal object.
                    const arrEnd = raw.indexOf("]", arrStart);
                    const arrStr = raw.slice(arrStart, arrEnd + 1);
                    const voxels = JSON.parse(arrStr);
                    return { obj: { name: "", voxels }, salvaged: true, finishReason };
                }
                if (lastCompleteInner > arrStart) {
                    // Rebuild: voxels array up to the last complete entry + close.
                    const arrStr = raw.slice(arrStart, lastCompleteInner + 1) + "]";
                    const voxels = JSON.parse(arrStr);
                    return { obj: { name: "", voxels }, salvaged: true, finishReason };
                }
            }
        }
    } catch { /* salvage failed too */ }

    return { error: "bad_json", raw: raw.slice(0, 200), finishReason };
}

async function generateCreature(key, prompt, opts = {}) {
    key = (key || "").trim();
    if (!key) return { ok: false, error: "no_api_key" };
    const desc = String(prompt || "creature").slice(0, 120);
    const model = opts.model || CREATURE_MODEL;
    const sys =
        `You design blocky VOXEL creatures for a voxel game. Output ONLY JSON: ` +
        `{"name":"<=24 chars","voxels":[[x,y,z,c],...]}. ` +
        `x,y,z are INTEGERS in -${COORD}..${COORD}. c is a palette index 0-7 ` +
        `(0 grey, 1 red, 2 orange, 3 yellow, 4 green, 5 cyan, 6 blue, 7 white). ` +
        `Build a recognizable "${desc}" as a SYMMETRIC creature mirrored across x=0. ` +
        `Use 120-450 voxels forming a connected solid body; feet/base near y=-${COORD}, head/top near +${COORD}.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    let data = null;
    try {
        const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: sys }] }],
                generationConfig: _voxelGenConfig(),
            }),
        });
        if (resp.status === 429) return { ok: false, error: "rate_limited_429" };
        data = await resp.json();
        if (!resp.ok) return { ok: false, error: `http_${resp.status}:${(data?.error?.message || "").slice(0, 140)}` };
    } catch (e) {
        return { ok: false, error: "fetch:" + (e?.message || String(e)) };
    }

    const parsed = _parseVoxelResponse(data);
    if (parsed.error) return { ok: false, error: parsed.error, raw: parsed.raw, finishReason: parsed.finishReason };
    const obj = parsed.obj;

    const clampInt = (v) => Math.max(-COORD, Math.min(COORD, Math.round(Number(v) || 0)));
    const seen = new Set();
    const voxels = [];
    for (const v of (Array.isArray(obj?.voxels) ? obj.voxels : [])) {
        if (!Array.isArray(v) || v.length < 3) continue;
        const x = clampInt(v[0]), y = clampInt(v[1]), z = clampInt(v[2]);
        let c = Math.round(Number(v[3]) || 0); if (c < 0 || c > 7) c = 0;
        const key2 = x + "," + y + "," + z;
        if (seen.has(key2)) continue;
        seen.add(key2);
        voxels.push([x, y, z, c]);
        if (voxels.length >= MAX_VOXELS) break;
    }
    if (voxels.length < 8) return { ok: false, error: "too_few_voxels", count: voxels.length };
    const name = (typeof obj?.name === "string" && obj.name.trim()) ? obj.name.trim().slice(0, 24) : desc.slice(0, 24);
    return { ok: true, name, voxels, model };
}

module.exports.generateCreature = generateCreature;

// generateAsset(key, prompt, opts) — same pipeline as generateCreature but
// type-agnostic: no forced symmetry / biped layout. Good for buildings, fish,
// a whale, vehicles, Lego figures — "whatever asset we want to try".
async function generateAsset(key, prompt, opts = {}) {
    key = (key || "").trim();
    if (!key) return { ok: false, error: "no_api_key" };
    const desc = String(prompt || "object").slice(0, 120);
    const model = opts.model || CREATURE_MODEL;
    const sys =
        `You design blocky VOXEL 3D models for a voxel game. Output ONLY JSON: ` +
        `{"name":"<=24 chars","voxels":[[x,y,z,c],...]}. ` +
        `x,y,z are INTEGERS in -${COORD}..${COORD}. c is a palette index 0-7 ` +
        `(0 grey, 1 red, 2 orange, 3 yellow, 4 green, 5 cyan, 6 blue, 7 white). ` +
        `Build a recognizable "${desc}" using 120-450 voxels forming a connected solid. ` +
        `Rest it on the ground (lowest voxels near y=-${COORD}). Use the subject's REAL ` +
        `proportions — only make it symmetric if the subject naturally is.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    let data = null;
    try {
        const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: sys }] }],
                generationConfig: _voxelGenConfig(),
            }),
        });
        if (resp.status === 429) return { ok: false, error: "rate_limited_429" };
        data = await resp.json();
        if (!resp.ok) return { ok: false, error: `http_${resp.status}:${(data?.error?.message || "").slice(0, 140)}` };
    } catch (e) {
        return { ok: false, error: "fetch:" + (e?.message || String(e)) };
    }

    const parsed = _parseVoxelResponse(data);
    if (parsed.error) return { ok: false, error: parsed.error, raw: parsed.raw, finishReason: parsed.finishReason };
    const obj = parsed.obj;

    const clampInt = (v) => Math.max(-COORD, Math.min(COORD, Math.round(Number(v) || 0)));
    const seen = new Set();
    const voxels = [];
    for (const v of (Array.isArray(obj?.voxels) ? obj.voxels : [])) {
        if (!Array.isArray(v) || v.length < 3) continue;
        const x = clampInt(v[0]), y = clampInt(v[1]), z = clampInt(v[2]);
        let c = Math.round(Number(v[3]) || 0); if (c < 0 || c > 7) c = 0;
        const k2 = x + "," + y + "," + z;
        if (seen.has(k2)) continue;
        seen.add(k2);
        voxels.push([x, y, z, c]);
        if (voxels.length >= MAX_VOXELS) break;
    }
    if (voxels.length < 8) return { ok: false, error: "too_few_voxels", count: voxels.length };
    const name = (typeof obj?.name === "string" && obj.name.trim()) ? obj.name.trim().slice(0, 24) : desc.slice(0, 24);
    return { ok: true, name, voxels, model };
}

module.exports.generateAsset = generateAsset;

