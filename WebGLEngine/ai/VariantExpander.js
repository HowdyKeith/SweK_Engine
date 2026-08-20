// FILE: ai/VariantExpander.js
//
// Round 91 — LLM-driven asset variant catalog expansion.
//
// PIPELINE
//   General Ollama model (llama-class)   →   creative ideation
//          ↓
//   Parsed JSON: [{suffix, description}, ...]
//          ↓
//   assetVariants.addRuntimeVariant() + GPUAssetLoader.registerDescription()
//          ↓
//   ai-bridge POST /variants/save  (persistence — survives reload)
//          ↓
//   Next spawner call picks one of the new variants
//          ↓
//   GPUAssetLoader sees new name → asks C3D for OBJ with the LLM's description
//
// FAILURE RECOVERY (the regenerate-failed flow)
//   GPUAssetLoader records every Ollama-returned-nothing name into a set.
//   regenerateFailed() walks that set, asks LLM to REWRITE each prompt
//   ("the previous prompt didn't produce a usable model; rewrite it more
//   geometric / shorter / more concrete"), updates the description, clears
//   the "already requested" flag, and the next asset load retries.
//
// API
//   await expand("tree_oak", 5)              -> count of variants added
//   await regenerateFailed()                  -> count of descriptions rewritten

import {
    addRuntimeVariant,
    updateVariantDescription,
    getVariantDescription,
} from "../gpu/assetVariants.js";

const STRICT_JSON_INSTRUCTION =
    "Respond with ONLY a JSON array (no prose, no markdown). " +
    "Each element MUST have exactly two keys: \"suffix\" (lowercase, " +
    "snake_case, no spaces) and \"description\" (a single sentence " +
    "describing the visual form, suitable as a prompt for a 3D model " +
    "generator). Suffixes must be unique within the array.";

export class VariantExpander {
    constructor({ ollama, assetLoader, bridgeBaseUrl }) {
        this.ollama = ollama;
        this.assetLoader = assetLoader;
        this.bridgeBaseUrl = bridgeBaseUrl
            ?? `http://${typeof location !== "undefined" ? location.hostname : "localhost"}:8787`;
        this._busy = false;
    }

    // ============================================================
    // expand(baseKind, count)
    // ============================================================
    // Asks the LLM for `count` new variants of `baseKind`. Adds each to
    // the in-memory catalog AND posts to /variants/save for persistence.
    // Returns the count actually accepted (LLM might propose duplicates
    // or malformed entries that get dropped). Never throws — failures
    // are logged.
    async expand(baseKind, count = 5) {
        if (this._busy) {
            console.warn("[VariantExpander] another expand in-flight, skipping");
            return 0;
        }
        if (!baseKind || typeof baseKind !== "string") return 0;
        if (!this.ollama) {
            console.warn("[VariantExpander] no Ollama client provided");
            return 0;
        }
        this._busy = true;
        try {
            const prompt = this._buildExpandPrompt(baseKind, count);
            const raw = await this.ollama.generate(prompt, {
                num_predict: 600,
                temperature: 0.85,
                stop: [],   // don't stop on "\n\n" — JSON arrays often have blanks
            });
            if (!raw) {
                console.warn(`[VariantExpander] LLM returned nothing for "${baseKind}"`);
                return 0;
            }
            const proposals = this._extractJSON(raw);
            if (!proposals || proposals.length === 0) {
                console.warn(`[VariantExpander] couldn't parse LLM response for "${baseKind}":`, raw.slice(0, 200));
                return 0;
            }

            let accepted = 0;
            for (const p of proposals) {
                if (!p || typeof p.suffix !== "string" || typeof p.description !== "string") continue;
                const suffix = p.suffix.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
                const desc = p.description.trim();
                if (!suffix || !desc) continue;
                const fullName = addRuntimeVariant(baseKind, suffix, desc);
                if (!fullName) continue;     // duplicate or rejected
                this.assetLoader?.registerDescription?.(fullName, desc);
                accepted++;
                // Persist (fire-and-forget — log on failure but don't block)
                this._persist(baseKind, suffix, desc).catch(e => {
                    console.warn(`[VariantExpander] persist failed for ${fullName}:`, e);
                });
            }

            console.log(`[VariantExpander] "${baseKind}": ${accepted}/${proposals.length} new variants accepted`);
            // Round 101 — PalChat reacts when new variants land. Only
            // fires on actual additions (skip when accepted == 0).
            if (accepted > 0 && typeof window !== "undefined" && window.palChat?.isEnabled?.()) {
                window.palChat.generate(`Ollama just generated ${accepted} new "${baseKind}" variant${accepted > 1 ? "s" : ""} for the engine to use.`);
            }
            return accepted;
        } finally {
            this._busy = false;
        }
    }

    // ============================================================
    // regenerateFailed()
    // ============================================================
    // For each name whose OBJ generation previously failed (read from
    // GPUAssetLoader.getFailedNames), ask the LLM to rewrite the
    // description. If the rewrite differs from the original, update the
    // catalog and clear the "already requested" flag so the next load
    // attempt asks C3D with the new prompt.
    async regenerateFailed() {
        if (this._busy) {
            console.warn("[VariantExpander] another expand in-flight, skipping regenerate");
            return 0;
        }
        if (!this.ollama || !this.assetLoader) return 0;
        this._busy = true;
        try {
            const failed = this.assetLoader.getFailedNames();
            if (failed.length === 0) {
                console.log("[VariantExpander] no failed variants to regenerate");
                return 0;
            }

            let rewritten = 0;
            for (const name of failed) {
                const oldDesc = getVariantDescription(name);
                if (!oldDesc) {
                    // Failed name we don't have a description for —
                    // synthesize a baseline. Strip variant suffix to
                    // get a base hint.
                    const base = name.replace(/_[a-z0-9_]+$/, "");
                    const baseline = `a low-poly ${base.replace(/_/g, " ")} model with clear geometry`;
                    const newDesc = await this._rewriteDescription(name, baseline);
                    if (newDesc) {
                        this.assetLoader.registerDescription(name, newDesc);
                        this.assetLoader.resetForRetry(name);
                        rewritten++;
                    }
                    continue;
                }
                const newDesc = await this._rewriteDescription(name, oldDesc);
                if (!newDesc) continue;
                if (newDesc === oldDesc) {
                    // LLM returned same — still retry (maybe network issue last time)
                    this.assetLoader.resetForRetry(name);
                    continue;
                }
                // Update both catalog and loader description map
                updateVariantDescription(name, newDesc);
                this.assetLoader.registerDescription(name, newDesc);
                this.assetLoader.resetForRetry(name);
                rewritten++;
                // Persist the rewrite
                const baseAndSuffix = this._splitName(name);
                if (baseAndSuffix) {
                    this._persist(baseAndSuffix.base, baseAndSuffix.suffix, newDesc).catch(() => {});
                }
            }
            console.log(`[VariantExpander] regenerated ${rewritten}/${failed.length} failed variants`);
            return rewritten;
        } finally {
            this._busy = false;
        }
    }

    // ============================================================
    // INTERNAL — prompts
    // ============================================================
    _buildExpandPrompt(baseKind, count) {
        const prettyKind = baseKind.replace(/_/g, " ");
        return [
            `Generate ${count} new visual variants of a "${prettyKind}" 3D model.`,
            "Each variant should look distinctly different from the others.",
            STRICT_JSON_INSTRUCTION,
            "",
            "Example response format:",
            `[{"suffix":"weathered","description":"a ${prettyKind} with cracked edges and faded color"},`,
            ` {"suffix":"ornate","description":"a ${prettyKind} with carved patterns and gold inlay"}]`,
        ].join("\n");
    }

    _buildRewritePrompt(name, prevDescription) {
        const pretty = name.replace(/_/g, " ");
        return [
            `The following description didn't produce a usable 3D model:`,
            `"${prevDescription}"`,
            "",
            `Rewrite it as a clearer, simpler, more concrete prompt for the same object ("${pretty}").`,
            "Favor concrete geometry (number of sides, proportions, simple shapes)",
            "over poetic adjectives. Keep it to one sentence.",
            "Respond with ONLY the rewritten description — no quotes, no labels, no prose around it.",
        ].join("\n");
    }

    async _rewriteDescription(name, prevDescription) {
        const prompt = this._buildRewritePrompt(name, prevDescription);
        const raw = await this.ollama.generate(prompt, {
            num_predict: 120,
            temperature: 0.4,       // lower — we want CLEARER, not more creative
            stop: ["\n\n"],
        });
        if (!raw) return null;
        // Strip surrounding quotes / common LLM preambles
        return raw
            .trim()
            .replace(/^["'`]+|["'`]+$/g, "")
            .replace(/^(rewritten:|description:|here[:'`]?s.*?:)\s*/i, "")
            .trim();
    }

    // ============================================================
    // INTERNAL — JSON extraction
    // ============================================================
    // LLM responses often wrap JSON in prose / markdown fences. Strip
    // common wrappers, then attempt to parse the first balanced array.
    _extractJSON(raw) {
        // Strip markdown code fences
        let text = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
        // Find the first [ and the matching balanced ]
        const start = text.indexOf("[");
        if (start < 0) return null;
        // Walk to find the matching close bracket while respecting strings
        let depth = 0;
        let end = -1;
        let inStr = false;
        let escape = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inStr) {
                if (escape) { escape = false; continue; }
                if (ch === "\\") { escape = true; continue; }
                if (ch === "\"") inStr = false;
                continue;
            }
            if (ch === "\"") { inStr = true; continue; }
            if (ch === "[") depth++;
            else if (ch === "]") {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        if (end < 0) return null;
        const jsonText = text.substring(start, end + 1);
        try {
            const parsed = JSON.parse(jsonText);
            return Array.isArray(parsed) ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    _splitName(fullName) {
        const idx = fullName.lastIndexOf("_");
        if (idx <= 0) return null;
        return { base: fullName.slice(0, idx), suffix: fullName.slice(idx + 1) };
    }

    // ============================================================
    // INTERNAL — persistence
    // ============================================================
    async _persist(baseKind, suffix, description) {
        try {
            const res = await fetch(`${this.bridgeBaseUrl}/variants/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ baseKind, suffix, description }),
            });
            if (!res.ok) {
                console.warn(`[VariantExpander] persist HTTP ${res.status}`);
            }
        } catch (e) {
            // Bridge may not be running — best effort
        }
    }
}
