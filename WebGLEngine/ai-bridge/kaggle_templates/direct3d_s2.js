// kaggle_templates/direct3d_s2.js — Direct3D-S2 image-to-3D (DreamTechAI, NeurIPS 2025).
//
// HONEST: same caveats as hunyuan3d/trellis2 templates. This mirrors the
// install + inference steps published in the official README as of the
// v1.1 release (May 30 2025), but Kaggle's base image moves and the
// torchsparse build step is the most likely failure spot. If the first run
// errors, click 📋 log on the failed row (v649) to see the Python
// traceback, then iterate the pip lines here.
//
// VRAM REALITY CHECK:
//   - sdf_resolution=512   needs ≥10GB → Kaggle T4 (16GB) or P100 (16GB) both fine
//   - sdf_resolution=1024  needs ~24GB → does NOT fit on T4 or P100; needs L4
//                           or A100 (rare on Kaggle's free tier)
// Default here is 512. The README says 1024 is the recommended quality but
// 512 is what actually fits on Kaggle free-tier GPUs.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "direct3d_s2",
    label: "Direct3D-S2 (image → 3D, sparse-attention, NeurIPS '25)",
    gpu: true,
    defaultDatasets: [],            // cache wushuang98/Direct3D-S2 weights as a Kaggle Dataset to skip the ~5GB first-run download
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — single object on a clean background works best" },
        { name: "removeBackground", type: "bool", default: true,
          help: "run rembg on the image before encoding (helps with cluttered backgrounds)" },
        { name: "sdfResolution", type: "int", default: 512,
          help: "512 (fits Kaggle T4/P100 16GB) or 1024 (needs ~24GB, L4/A100 only)" },
        { name: "removeInterior", type: "bool", default: true,
          help: "clean up interior cavities in the SDF before meshing (recommended)" },
        { name: "remesh", type: "bool", default: false,
          help: "true → quadric decimation to reduce triangle count (slower)" },
    ],

    buildNotebook(params, ctx) {
        const imageB64 = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg = params.removeBackground !== false;
        const sdfRes   = (parseInt(params.sdfResolution, 10) === 1024) ? 1024 : 512;
        const rmInt    = params.removeInterior !== false;
        const remesh   = !!params.remesh;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Direct3D-S2 image → 3D mesh on Kaggle.",
                    "First-run installs ~10-15 min (torchsparse compiles CUDA kernels).",
                    "Cache the weights as a Kaggle Dataset + attach via `dataset_sources`",
                    "to skip the ~5GB HuggingFace download on subsequent runs."]),

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
                    "# 1. install torch + torchvision matched to Kaggle's CUDA. Kaggle's base",
                    "#    image already ships with a recent torch; we only force a reinstall if",
                    "#    the upstream README's exact pin matters. Try the system version first;",
                    "#    if you hit ABI errors, uncomment the pin line below.",
                    "import torch; print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu')",
                    "# !pip install -q torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121",
                ]),

                cell([
                    "# 2. torchsparse — required by Direct3D-S2's sparse-volume backbone.",
                    "#    Source build, takes 5-10 min the first time. The whl prebuilts on PyPI",
                    "#    don't cover Kaggle's exact CUDA combo so we build from git.",
                    "!pip install -q --upgrade pip",
                    "!pip install -q ninja",
                    "!pip install -q git+https://github.com/mit-han-lab/torchsparse.git",
                ]),

                cell([
                    "# 3. clone + install Direct3D-S2 itself",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/Direct3D-S2'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/DreamTechAI/Direct3D-S2.git', '/kaggle/working/Direct3D-S2'])",
                    "os.chdir('/kaggle/working/Direct3D-S2')",
                    "!pip install -q -r requirements.txt",
                    "!pip install -q -e .",
                    "# rembg is needed for the optional background-removal step",
                    "!pip install -q rembg trimesh huggingface_hub",
                ]),

                cell([
                    "# 4. decode the user's image (embedded by the bridge as base64)",
                    "import base64, io, os, json, time",
                    "from PIL import Image",
                    `IMAGE_B64 = ${JSON.stringify(imageB64)}`,
                    "img = Image.open(io.BytesIO(base64.b64decode(IMAGE_B64))).convert('RGBA')",
                    "img.save('/kaggle/working/input.png')",
                    "print('input image:', img.size)",
                ]),

                cell([
                    "# 5. optional background removal",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    img_nobg = remove(img)",
                    "    img_nobg.save('/kaggle/working/input_nobg.png')",
                    "    img_for_pipeline = '/kaggle/working/input_nobg.png'",
                    "    print('background removed → input_nobg.png')",
                    "else:",
                    "    img_for_pipeline = '/kaggle/working/input.png'",
                ]),

                cell([
                    "# 6. load + run the Direct3D-S2 pipeline",
                    "#    sdf_resolution=512  → ~10GB VRAM, fits T4/P100",
                    "#    sdf_resolution=1024 → ~24GB VRAM, L4 / A100 only",
                    "from direct3d_s2.pipeline import Direct3DS2Pipeline",
                    "pipeline = Direct3DS2Pipeline.from_pretrained(",
                    "    'wushuang98/Direct3D-S2',",
                    "    subfolder='direct3d-s2-v-1-1',",
                    ")",
                    "pipeline.to('cuda:0')",
                    "",
                    `SDF_RES   = ${sdfRes}`,
                    `RM_INT    = ${rmInt ? "True" : "False"}`,
                    `REMESH    = ${remesh ? "True" : "False"}`,
                    "result = pipeline(",
                    "    img_for_pipeline,",
                    "    sdf_resolution=SDF_RES,",
                    "    remove_interior=RM_INT,",
                    "    remesh=REMESH,",
                    ")",
                    "mesh = result['mesh']",
                ]),

                cell([
                    "# 7. export both OBJ and GLB. The bridge's downloadOutput()",
                    "#    prefers .glb so the engine's loader picks it up automatically,",
                    "#    but OBJ is kept as a fallback that any DCC tool can open.",
                    "mesh.export('/kaggle/working/output.obj')",
                    "try:",
                    "    mesh.export('/kaggle/working/output.glb')",
                    "    print('exported output.obj + output.glb')",
                    "except Exception as e:",
                    "    print('GLB export failed (' + str(e) + ') — OBJ-only')",
                    "import os; print('files:', sorted(f for f in os.listdir('/kaggle/working') if not f.startswith('.')))",
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
