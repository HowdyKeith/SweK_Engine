// ui/modelRepoCandidates.js -- REAL REPO IDS FOR webgpu-llm.html'S FREE-TEXT FIELD, NOT A GUESS.
//
// v4036 -- Keith: "can we add the possible repos that will work for this webgpu llm page? do they indicate why
// there are differences, and if they would matter to which one i would pick to download?"
//
// v4032's runner (localModelRun.js) shipped with NO repo id anywhere in this tree, on purpose -- that round's
// container could not reach huggingface.co at all (its proxy answered 403), so a hardcoded `onnx-community/...`
// string would have been a guess that 404s on somebody else's machine. THAT IS STILL TRUE HERE: this round's
// container also cannot reach huggingface.co directly (its egress proxy blocks the domain outright, not just
// 403s it), so nothing below was fetched live and byte-checked against the real repo.
//
// What changed is that WebSearch/WebFetch became available this round, and every id below was cross-checked
// across MULTIPLE independent sources reached that way -- the repo's own file-tree listing, its README/discuss
// pages, and (for the one known bug) an upstream issue tracker -- rather than typed from memory. That is a real
// increase in confidence over "a plausible-looking string", but it is not the same claim as "this file fetched
// and verified it", so it is labelled CORROBORATED rather than MEASURED, matching this tree's habit of saying
// which of those two a number is (see localModelProbe.js's MODELS header, and gemma-gem's README sizes there).
//
// A size or license fact below can be stale by the time someone reads it -- these are hosted repos somebody
// else can rename, re-quantize, or relicense. preflightRepo() (localModelRun.js) still resolves config.json
// before a single weight byte moves, and IS the ground truth if a number here ever disagrees with it.
"use strict";

export const CONFIDENCE_NOTE =
    "corroborated via web search across multiple independent sources this round (file-tree listings, model " +
    "cards, an upstream issue tracker); NOT fetched and byte-checked directly against huggingface.co, which " +
    "this container's egress proxy still blocks outright. Treat sizes and licenses as \"probably right, check " +
    "before you rely on it\" rather than measured.";

/**
 * Each entry is one HuggingFace repo this session found real, working evidence for. `sizes` are the ONNX file
 * sizes for whichever dtype this repo actually ships (a repo either bakes one dtype into its name, like the
 * "-q4f16" Llama repo, or carries several files under onnx/ and lets `dtype` pick one at load time, like Qwen's
 * and gemma-3-270m's) -- `dtypeSelectable` says which shape this repo is, because that changes what typing a
 * dtype into the runner even means for it.
 */
export const MODEL_REPO_CANDIDATES = [
    {
        repo: "onnx-community/Qwen2.5-0.5B-Instruct",
        label: "Qwen2.5 0.5B Instruct",
        params: "0.5B",
        license: "Apache 2.0 -- no MAU cap, no redistribution restrictions beyond attribution",
        dtypeSelectable: true,
        sizes: { full: 1.99e9, fp16: 997e6, int8: 512e6, q4: 786e6, bnb4: 764e6, q4f16: 483e6 },
        recommendedDtype: "q4f16",
        note: "The smallest mainstream instruct model here with no known WebGPU-specific bug. A reasonable " +
              "first try before reaching for anything smaller or more restrictively licensed.",
    },
    {
        repo: "onnx-community/Llama-3.2-1B-Instruct-q4f16",
        label: "Llama 3.2 1B Instruct (pre-quantized q4f16)",
        params: "1B",
        license: "Meta Llama 3.2 Community License -- NOT Apache/MIT: bars use by a product with over 700M " +
                 "monthly active users without a separate agreement from Meta, and derivative names must carry " +
                 "\"Llama\". Fine for a personal or small project; worth reading before shipping this to others.",
        dtypeSelectable: false,
        sizes: { q4f16: null },
        recommendedDtype: "q4f16",
        note: "Meta's own repo is split across several separately-named onnx-community mirrors (a plain " +
              "-ONNX, this -q4f16, a -GENAI-ONNX for ONNX Runtime rather than transformers.js, and an " +
              "-onnx-web-gqa variant) rather than one repo with several files inside -- this id is the one " +
              "already quantized down to WebGPU-sized weights. Exact file size for this one repo was not found " +
              "this round; expect roughly the same order of magnitude as Qwen2.5-0.5B's q4f16 build times two.",
    },
    {
        repo: "onnx-community/SmolLM2-360M-Instruct-ONNX",
        label: "SmolLM2 360M Instruct",
        params: "360M",
        license: "Apache 2.0",
        dtypeSelectable: true,
        sizes: { fp16: 819e6, q4f16: 299e6 },
        recommendedDtype: "fp16",
        note: "*** DO NOT DEFAULT THIS ONE TO q4. *** The model's own maintainers found 4-bit quantization " +
              "visibly degrades quality at this size and use fp16 for their own WebGPU demos instead -- smaller " +
              "than it sounds is not free at 360M the way it can be at 500M+.",
    },
    {
        repo: "onnx-community/gemma-3-270m-it-ONNX",
        label: "Gemma 3 270M Instruct",
        params: "270M -- the smallest text model in this list",
        license: "Gemma Terms of Use -- a custom license with a Prohibited Use Policy attached, NOT Apache/MIT. " +
                  "Read it before redistributing, even though the weights are free to download and run.",
        dtypeSelectable: true,
        sizes: { fp16: 570e6, q4f16: 426e6 },
        recommendedDtype: "q4",
        note: "*** A REAL, OPEN, UPSTREAM BUG RULES OUT TWO OF ITS THREE DTYPES ON WEBGPU RIGHT NOW. *** " +
              "microsoft/onnxruntime issue #26732: fp16 and q4f16 Gemma 3 ONNX builds produce INVALID output " +
              "on WebGPU from an overflow inside ONNX Runtime's web backend -- not a transformers.js bug, and " +
              "not this repo's bug. Until that lands a fix, dtype \"q4\" is the one reported to behave; fp16 " +
              "and q4f16 read as the smaller downloads above but are the ones to avoid on WebGPU today.",
    },
    {
        repo: "onnx-community/gemma-4-E2B-it-ONNX",
        label: "Gemma 4 E2B Instruct -- closest real match to this page's existing \"Gemma 4 E2B\" entry",
        params: "raw parameter count is larger than 2B; \"E2B\" names its EFFECTIVE footprint, not its size on " +
                "disk -- see note",
        license: "Apache 2.0 (Gemma's newer \"4\" generation moved off the earlier custom Gemma Terms of Use " +
                 "onto Apache 2.0 -- confirm on this specific repo's own license file before relying on that, " +
                 "since it is a per-repo fact and this was not fetched live)",
        dtypeSelectable: true,
        sizes: {},
        recommendedDtype: "q4",
        note: "localModelProbe.js's MODELS array already carries a \"Gemma 4 E2B\" / \"Gemma 4 E4B\" pair with " +
              "sizes taken from gemma-gem's README, but no HuggingFace id -- this is the repo id that name most " +
              "plausibly points to (there is also a same-name \"-qat-mobile-\" sibling, presumably a " +
              "quantization-aware-trained export aimed at mobile rather than WebGPU). \"E2B\" answers Keith's " +
              "\"why the difference\" question for this whole family: the architecture activates only part of " +
              "a larger network per token (the same MatFormer-style idea Gemma 3n used, where the 6B-parameter " +
              "gemma-3n-E2B model runs with a memory footprint like a 2B model) -- so its stated VRAM is smaller " +
              "than its parameter count would suggest, not a typo. File sizes for this exact repo were not " +
              "found this round; there is a sibling \"onnx-community/gemma-4-E4B-it-ONNX\" for the larger of " +
              "the pair.",
    },
];
