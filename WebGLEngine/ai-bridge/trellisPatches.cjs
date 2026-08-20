// FILE: /ai-bridge/trellisPatches.cjs
// ---------------------------------------------------------------------------
// v473 — robust Trellis-2-on-Windows source patcher (Node, idempotent, safe).
//
// v472 used exact-string matches and failed `notfound` on real forks (extra
// spaces, a different alias, a trailing comment, or leading indentation all
// broke the match). This rewrite:
//   - tolerant regex: optional leading indent, flexible spacing, optional
//     `as <alias>`, optional trailing comment
//   - parses the ACTUAL bound name(s) from the matched import so the fallback
//     assignment (`<name> = None`) is correct even with a non-standard alias
//   - preserves the matched line's indentation in the wrapped block
//   - backs up the file ONCE to <file>.bak (pristine original) before editing
//   - idempotent via a marker string (NOT the regex, which would re-match the
//     now-indented import)
//   - on a miss, returns a DUMP of the lines mentioning the keyword so we can
//     see the real spelling and tighten the matcher
//
// patch-defaults stays absent — it's a guided edit / ComfyUI web-extension,
// not a literal nodes.py line, so it remains copy-only.
// ---------------------------------------------------------------------------
const fs   = require("fs");
const path = require("path");

const NODE_DIR = "ComfyUI/custom_nodes/ComfyUI-Trellis2-main";
const NODES    = `${NODE_DIR}/nodes.py`;
const PIPE     = `${NODE_DIR}/trellis2/pipelines/trellis2_image_to_3d.py`;

const PATCHES = {
    "patch-cumesh": {
        type: "wrap", file: NODES, keyword: "cumesh",
        marker: "TRELLIS: cumesh not found",
        find: /^([ \t]*)(import[ \t]+cumesh(?:[ \t]+as[ \t]+\w+)?)[ \t]*(?:#[^\r\n]*)?(?=\r?\n|$)/m,
        except: "except Exception:",
        message: "TRELLIS: cumesh not found, using fallback (this is fine)",
    },
    "patch-ovoxel": {
        type: "wrap", file: NODES, keyword: "o_voxel",
        marker: "TRELLIS: o_voxel not found",
        find: /^([ \t]*)(import[ \t]+o_voxel(?:[ \t]+as[ \t]+\w+)?)[ \t]*(?:#[^\r\n]*)?(?=\r?\n|$)/m,
        except: "except Exception:",
        message: "TRELLIS: o_voxel not found, using fallback (this is also fine)",
    },
    "patch-nvdiffrast": {
        type: "wrap", file: NODES, keyword: "nvdiffrast",
        marker: "TRELLIS: nvdiffrast not found",
        find: /^([ \t]*)(import[ \t]+nvdiffrast(?:\.torch)?(?:[ \t]+as[ \t]+\w+)?)[ \t]*(?:#[^\r\n]*)?(?=\r?\n|$)/m,
        except: "except Exception:",
        message: "TRELLIS: nvdiffrast not found, using fallback (skipping diff-rasterization)",
    },
    "patch-flex-gemm-nodes": {
        type: "wrap", file: NODES, keyword: "flex_gemm",
        marker: "TRELLIS: flex_gemm not found",
        find: /^([ \t]*)(from[ \t]+flex_gemm\.\S+[ \t]+import[ \t]+\w+(?:[ \t]+as[ \t]+\w+)?)[ \t]*(?:#[^\r\n]*)?(?=\r?\n|$)/m,
        except: "except Exception:",
        message: "TRELLIS: flex_gemm not found, using fallback",
    },
    "patch-flex-gemm-pipeline": {
        type: "block", file: PIPE, keyword: "flex_gemm",
        marker: "def grid_sample_3d(input, grid",
        find: /^([ \t]*)(from[ \t]+flex_gemm\.\S+[ \t]+import[ \t]+grid_sample_3d)[ \t]*(?:#[^\r\n]*)?(?=\r?\n|$)/m,
        block: [
            "try:",
            "    %IMPORT%",
            "except Exception:",
            "    import torch.nn.functional as F",
            "    def grid_sample_3d(input, grid, mode='bilinear', padding_mode='zeros', align_corners=True):",
            "        return F.grid_sample(input, grid, mode=mode, padding_mode=padding_mode, align_corners=align_corners)",
        ],
    },
    "patch-triton": {
        type: "comment", file: NODES, keyword: "triton",
        // global, multiline; skips already-commented lines (they start with #)
        find: /^([ \t]*)((?:import|from)[ \t]+triton\b[^\r\n]*)(?=\r?\n|$)/gm,
    },
    // v474 — grounded in the user's actual nodes.py dump. This fork's
    // Trellis2LoadModel already defaults to Pascal-safe backends
    // (backend=sdpa, conv_backend=spconv, sparse_backend=xformers,
    // low_vram=True). The ONLY 8GB-relevant tweak is the model: flip the
    // default from the full microsoft/TRELLIS.2-4B to the FP8 quant that
    // fits an 8GB card. Requires the FP8 weights (model-trellis-fp8).
    "patch-defaults": {
        type: "replace", file: NODES, keyword: "model_name",
        markerRe: /"default"\s*:\s*"visualbruno\/TRELLIS\.2-4B-FP8"/,
        find: /("model_name"\s*:\s*\(\s*\[[\s\S]*?\]\s*,\s*\{\s*"default"\s*:\s*)"microsoft\/TRELLIS\.2-4B"/,
        replacement: '$1"visualbruno/TRELLIS.2-4B-FP8"',
    },
};

function _eol(text) { return /\r\n/.test(text) ? "\r\n" : "\n"; }

// Parse the names an import statement binds, so the fallback sets THOSE to None.
//   import cumesh as CuMesh                  -> ["CuMesh"]
//   import o_voxel                           -> ["o_voxel"]
//   import nvdiffrast.torch as dr            -> ["dr"]
//   import a.b.c                             -> ["a"]
//   from m import grid_sample_3d             -> ["grid_sample_3d"]
//   from m import a as b, c                  -> ["b", "c"]
function parseBoundNames(stmt) {
    stmt = stmt.replace(/#.*$/, "").trim();
    let m;
    if ((m = /^from\s+\S+\s+import\s+(.+)$/.exec(stmt))) {
        return m[1].split(",").map(s => {
            const a = s.trim().split(/\s+as\s+/);
            return (a[1] || a[0]).trim();
        }).filter(Boolean);
    }
    if ((m = /^import\s+(.+)$/.exec(stmt))) {
        return m[1].split(",").map(s => {
            const a = s.trim().split(/\s+as\s+/);
            return (a[1] ? a[1].trim() : a[0].trim().split(".")[0]);
        }).filter(Boolean);
    }
    return [];
}

function _dump(text, keyword) {
    const lines = text.split(/\r?\n/);
    const hits = [];
    lines.forEach((l, i) => { if (l.toLowerCase().includes(keyword.toLowerCase())) hits.push(`${i + 1}: ${l}`); });
    return (hits.length ? hits.slice(0, 25) : lines.slice(0, 40).map((l, i) => `${i + 1}: ${l}`));
}

// Does the file import this keyword at all (in any spelling)? Distinguishes
// "this build doesn't import it → no patch needed" from "it's imported but my
// regex missed the exact form → genuine version difference".
function _importsKeyword(text, kw) {
    const k = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\n)[ \\t]*(import|from)[ \\t]+\\S*${k}`, "m").test(text);
}

function _backupOnce(abs) {
    const bak = abs + ".bak";
    try { if (!fs.existsSync(bak)) fs.copyFileSync(abs, bak); } catch {}
    return bak;
}

// Apply one patch. Returns { ok, status, file, detail, dump? }.
//   status: patched | already | notfound | nofile | unknown_patch
function applyPatch(comfyRoot, id) {
    const spec = PATCHES[id];
    if (!spec) return { ok: false, status: "unknown_patch", detail: `no Node patcher for "${id}" (manual/copy-only)` };
    const abs = path.join(comfyRoot, spec.file);
    let text;
    try {
        if (!fs.existsSync(abs)) return { ok: false, status: "nofile", file: abs, detail: "target file not found — install ComfyUI-Trellis2 first" };
        text = fs.readFileSync(abs, "utf8");
    } catch (e) {
        return { ok: false, status: "nofile", file: abs, detail: e.message };
    }
    const eol = _eol(text);

    // ---- comment-out (triton) -------------------------------------------
    if (spec.type === "comment") {
        if (/^[ \t]*#\s*(disabled for Windows:\s*)?(import|from)\s+triton\b/m.test(text) &&
            !/^[ \t]*(import|from)\s+triton\b/m.test(text)) {
            return { ok: true, status: "already", file: abs, detail: "triton imports already commented" };
        }
        if (!/^[ \t]*(import|from)\s+triton\b/m.test(text)) {
            // No triton import at all — this build doesn't pull it in, so
            // there's nothing to comment. That's a pass, not a failure.
            return { ok: true, status: "notneeded", file: abs,
                     detail: "this build doesn't import triton at module level — no patch needed" };
        }
        _backupOnce(abs);
        const out = text.replace(spec.find, (full, ind, stmt) => `${ind}# disabled for Windows: ${stmt}`);
        fs.writeFileSync(abs, out, "utf8");
        return { ok: true, status: "patched", file: abs, detail: "commented out triton import(s)" };
    }

    // ---- targeted default swap (Trellis2LoadModel defaults) -------------
    if (spec.type === "replace") {
        if (spec.markerRe && spec.markerRe.test(text)) {
            return { ok: true, status: "already", file: abs, detail: "default already set to the target value" };
        }
        if (!spec.find.test(text)) {
            return { ok: true, status: "notneeded", file: abs,
                     detail: "the targeted default isn't present (already changed, or a different layout) — no change",
                     dump: _dump(text, spec.keyword) };
        }
        _backupOnce(abs);
        const out = text.replace(spec.find, spec.replacement);
        fs.writeFileSync(abs, out, "utf8");
        return { ok: true, status: "patched", file: abs, detail: "updated Trellis2LoadModel default (model → FP8)" };
    }

    // ---- idempotency (wrap/block) ---------------------------------------
    if (spec.marker && text.includes(spec.marker)) {
        return { ok: true, status: "already", file: abs, detail: "patch marker already present" };
    }
    const m = spec.find.exec(text);
    if (!m) {
        // Two very different cases: the module isn't imported here at all
        // (clean fork → no patch needed, a PASS), vs it IS imported but in a
        // spelling we didn't catch (genuine miss → show the dump).
        if (!_importsKeyword(text, spec.keyword)) {
            return { ok: true, status: "notneeded", file: abs,
                     detail: `this build doesn't import ${spec.keyword} at module level — no patch needed` };
        }
        return { ok: false, status: "notfound", file: abs,
                 detail: `${spec.keyword} is imported but not in a form I recognized — no change made; see dump`,
                 dump: _dump(text, spec.keyword) };
    }
    const indent = m[1] || "";
    const stmt   = m[2].trim();

    let blockLines;
    if (spec.type === "block") {
        blockLines = spec.block.map(l => l.replace("%IMPORT%", stmt));
    } else { // wrap
        const names    = parseBoundNames(stmt);
        const fallback = names.length ? `${names.join(" = ")} = None` : "pass";
        blockLines = [
            "try:",
            `    ${stmt}`,
            spec.except || "except Exception:",
            `    ${fallback}`,
            `    print('${spec.message}')`,
        ];
    }
    const block = blockLines.map(l => (l ? indent + l : l)).join(eol);

    _backupOnce(abs);
    const out = text.slice(0, m.index) + block + text.slice(m.index + m[0].length);
    fs.writeFileSync(abs, out, "utf8");
    return { ok: true, status: "patched", file: abs, detail: `wrapped ${spec.keyword} import (bound: ${parseBoundNames(stmt).join(", ") || "n/a"})` };
}

module.exports = { PATCHES, applyPatch, parseBoundNames, NODE_DIR };
