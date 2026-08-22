// kaggle_templates/trellis2.js — Microsoft TRELLIS (image → 3D mesh) on Kaggle.
//
// HONEST: this is a best-effort template based on the documented TRELLIS
// pipeline (microsoft/TRELLIS — the same model the visualbruno ComfyUI-Trellis2
// fork wraps locally). Like the Hunyuan3D template, it WILL likely need at
// least one iteration on first run — TRELLIS ships custom CUDA kernels
// (spconv, diff-gaussian-rasterization, etc.) and the wheel/source build
// matrix on Kaggle's image moves faster than this comment can track. Run the
// Diagnostic template first to confirm the bridge plumbing, then run this and
// iterate on the install cell + pipeline class names from the error you see.
// The bridge will download whatever ends up in /kaggle/working.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "trellis2",
    label: "Trellis 2 (image → 3D mesh, cloud GPU)",
    gpu: true,
    defaultDatasets: [],            // once you cache weights as a Kaggle Dataset, add the slug here
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — single object on a clean background works best" },
        { name: "removeBackground", type: "bool", default: true },
        { name: "withTexture", type: "bool", default: true,
          help: "if false, exports a mesh-only GLB (faster, smaller)" },
        { name: "seed", type: "int", default: 42 },
        { name: "ssSteps", type: "int", default: 12,
          help: "sparse-structure diffusion steps (lower=faster, higher=cleaner topology)" },
    ],

    buildNotebook(params, ctx) {
        const imageB64 = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg = params.removeBackground !== false;
        const withTex  = params.withTexture !== false;
        const seed     = parseInt(params.seed, 10) || 42;
        const ssSteps  = Math.max(1, Math.min(50, parseInt(params.ssSteps, 10) || 12));

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Microsoft TRELLIS image → 3D on Kaggle (the model the visualbruno ComfyUI-Trellis2 fork wraps locally).",
                    "First-run installs are heavy (custom CUDA kernels, sparse-structure deps); expect 10–20 min the first time.",
                    "Cache the model + wheels as a Kaggle Dataset and attach it via `dataset_sources` to skip downloads on later runs."]),

                cell([
                    "# v701 — generic HF cache redirect (cache-retrofit).",
                    "# If the user has attached a Kaggle Dataset with HF-cache layout",
                    "# (./hub/models--repo/... or just models--repo/...), point HF_HUB_CACHE",
                    "# at it so transformers/diffusers pull weights from the cache instead",
                    "# of downloading. No-op when no cached dataset is attached — template",
                    "# proceeds with its normal HF download path.",
                    "import os",
                    "cache_root = None",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        if not os.path.isdir(p): continue",
                    "        # Look for HF cache structure (hub/ subdir OR top-level models--*)",
                    "        if os.path.isdir(os.path.join(p, 'hub')):",
                    "            cache_root = os.path.join(p, 'hub'); break",
                    "        if any(n.startswith('models--') for n in os.listdir(p)):",
                    "            cache_root = p; break",
                    "if cache_root:",
                    "    os.environ['HF_HUB_CACHE'] = cache_root",
                    "    os.environ['HUGGINGFACE_HUB_CACHE'] = cache_root",
                    "    os.environ['TRANSFORMERS_CACHE'] = cache_root",
                    "    print(f'[cache] HF_HUB_CACHE -> {cache_root}')",
                    "else:",
                    "    print('[cache] no HF cache dataset attached — will download from HF')",
                ]),

                cell([
                    "# 1. install TRELLIS + deps — TODO verify versions vs current Kaggle CUDA",
                    "!pip install -q --upgrade pip",
                    "# Core: PyTorch is preinstalled on Kaggle GPU. TRELLIS needs spconv + a few custom kernels.",
                    "!pip install -q git+https://github.com/microsoft/TRELLIS.git",
                    "!pip install -q rembg trimesh pymeshlab huggingface_hub xatlas",
                    "# spconv-cu120 is the right wheel for Kaggle's CUDA 12.x — change suffix if your kernel differs.",
                    "!pip install -q spconv-cu120 || pip install -q spconv-cu118",
                ]),

                cell([
                    "# 2. decode the user's image (embedded by the bridge as base64)",
                    "import base64, io, os, json, time",
                    "from PIL import Image",
                    `IMAGE_B64 = ${JSON.stringify(imageB64)}`,
                    "img = Image.open(io.BytesIO(base64.b64decode(IMAGE_B64))).convert('RGBA')",
                    "img.save('/kaggle/working/input.png')",
                    "print('input image:', img.size)",
                ]),

                cell([
                    "# 3. optional background removal — TRELLIS works best on clean cutouts",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    img = remove(img)",
                    "    img.save('/kaggle/working/input_nobg.png')",
                    "    print('background removed')",
                ]),

                cell([
                    "# 4. load the pipeline + run image-to-3D — TODO verify class name vs current TRELLIS",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    "from trellis.pipelines import TrellisImageTo3DPipeline",
                    "pipe = TrellisImageTo3DPipeline.from_pretrained('microsoft/TRELLIS-image-large')",
                    "pipe.cuda()",
                    `outputs = pipe.run(img, seed=${seed}, sparse_structure_sampler_params={'steps': ${ssSteps}, 'cfg_strength': 7.5}, slat_sampler_params={'steps': ${ssSteps}, 'cfg_strength': 3.0})`,
                    "print('TRELLIS outputs:', list(outputs.keys()))",
                ]),

                cell([
                    "# 5. export the mesh (with or without texture)",
                    `WITH_TEX = ${withTex ? "True" : "False"}`,
                    "from trellis.utils import postprocessing_utils",
                    "if WITH_TEX:",
                    "    glb = postprocessing_utils.to_glb(outputs['gaussian'][0], outputs['mesh'][0], simplify=0.95, texture_size=1024)",
                    "    glb.export('/kaggle/working/output.glb')",
                    "    print('textured mesh exported as /kaggle/working/output.glb')",
                    "else:",
                    "    mesh = outputs['mesh'][0]",
                    "    mesh.export('/kaggle/working/output.glb')",
                    "    print('mesh-only GLB exported as /kaggle/working/output.glb')",
                    "print('files:', os.listdir('/kaggle/working'))",
                ]),
            ],
            metadata: {
                kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
                language_info: { name: "python" },
            },
            nbformat: 4,
            nbformat_minor: 4,
        };
    },
};
