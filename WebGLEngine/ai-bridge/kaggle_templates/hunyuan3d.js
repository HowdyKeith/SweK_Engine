// kaggle_templates/hunyuan3d.js — Hunyuan3D-2 image-to-3D starter.
//
// HONEST: this is a best-effort template based on Tencent/Hunyuan3D-2's
// documented pipeline. It WILL likely need at least one iteration on first
// run — Hunyuan3D ships custom CUDA kernels, model repo names move, and the
// shipped Diffusers integration changes faster than this comment can track.
// Run the Diagnostic template first to confirm the bridge plumbing works,
// then run this; iterate on the pip line + pipeline class names from the
// error you see. The bridge will download whatever ends up in /kaggle/working.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "hunyuan3d",
    label: "Hunyuan3D-2 (image → 3D mesh)",
    gpu: true,
    defaultDatasets: [],            // once you cache weights as a Kaggle Dataset, add the slug here
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — single object on a clean background works best" },
        { name: "removeBackground", type: "bool", default: true },
        { name: "withTexture", type: "bool", default: true },
        { name: "seed", type: "int", default: 1234 },
    ],

    buildNotebook(params, ctx) {
        const imageB64 = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg = params.removeBackground !== false;
        const withTex  = params.withTexture !== false;
        const seed     = parseInt(params.seed, 10) || 1234;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Hunyuan3D-2 image → 3D on Kaggle. First-run installs may take 5–15 min.",
                    "Cache the model as a Kaggle Dataset and attach it via `dataset_sources` to",
                    "skip the weights download on subsequent runs."]),

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
                    "# 1. install Hunyuan3D-2 — TODO verify this URL matches the current release",
                    "!pip install -q --upgrade pip",
                    "!pip install -q git+https://github.com/Tencent/Hunyuan3D-2.git",
                    "!pip install -q rembg trimesh pymeshlab huggingface_hub",
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
                    "# 3. optional background removal",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    img = remove(img)",
                    "    img.save('/kaggle/working/input_nobg.png')",
                    "    print('background removed')",
                ]),

                cell([
                    "# 4. shape generation — TODO verify class name matches your Hunyuan3D-2 version",
                    "from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    "pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2')",
                    "mesh = pipe(image=img)[0]",
                    "mesh.export('/kaggle/working/output_shape.glb')",
                    "print('shape mesh exported')",
                ]),

                cell([
                    "# 5. texture pass (optional)",
                    `WITH_TEX = ${withTex ? "True" : "False"}`,
                    "if WITH_TEX:",
                    "    from hy3dgen.texgen import Hunyuan3DPaintPipeline",
                    "    paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2')",
                    "    mesh = paint(mesh, image=img)",
                    "    mesh.export('/kaggle/working/output.glb')",
                    "    print('textured mesh exported as /kaggle/working/output.glb')",
                    "else:",
                    "    import shutil",
                    "    shutil.copy('/kaggle/working/output_shape.glb', '/kaggle/working/output.glb')",
                    "    print('shape-only mesh saved as /kaggle/working/output.glb')",
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
