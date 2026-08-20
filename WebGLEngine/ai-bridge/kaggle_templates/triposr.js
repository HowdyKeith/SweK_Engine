// kaggle_templates/triposr.js — TripoSR (Tripo AI + Stability AI, MIT).
//
// Fast LRM-based image-to-3D. Reference inference time is <0.5s on A100;
// on Kaggle T4 expect ~3-8s per mesh after the first-run warmup. Output
// is a vertex-colored mesh — quick draft quality, no UV unwrap. Use SF3D
// or Direct3D-S2 when you want UV-unwrapped meshes with proper textures.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "triposr",
    label: "TripoSR (fast image → 3D, ~3-8s on T4)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — single object on a clean background works best" },
        { name: "removeBackground", type: "bool", default: true,
          help: "run rembg on the image before inference (helps with cluttered backgrounds)" },
        { name: "mcResolution", type: "int", default: 256,
          help: "marching cubes resolution: 256 (fast/draft) or 512 (slower/better)" },
    ],

    buildNotebook(params, ctx) {
        const imageB64 = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg = params.removeBackground !== false;
        const mcRes    = parseInt(params.mcResolution, 10) || 256;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "TripoSR on Kaggle. First-run ~5 min for git clone + pip deps + HF model fetch.",
                    "Outputs vertex-colored OBJ + GLB to /kaggle/working."]),
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
                    "import torch; print('torch =', torch.__version__, '· cuda =', torch.version.cuda)",
                ]),
                cell([
                    "# clone TripoSR + install its requirements",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/TripoSR'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/VAST-AI-Research/TripoSR.git', '/kaggle/working/TripoSR'])",
                    "os.chdir('/kaggle/working/TripoSR')",
                    "!pip install -q -r requirements.txt",
                    "!pip install -q rembg trimesh huggingface_hub",
                ]),
                cell([
                    "# decode user image",
                    "import base64, io, os",
                    "from PIL import Image",
                    `IMAGE_B64 = ${JSON.stringify(imageB64)}`,
                    "img = Image.open(io.BytesIO(base64.b64decode(IMAGE_B64))).convert('RGBA')",
                    "img.save('/kaggle/working/input.png')",
                    "print('input image:', img.size)",
                ]),
                cell([
                    "# optional background removal — TripoSR's run.py also supports this via --no-remove-bg",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    remove(img).save('/kaggle/working/input_nobg.png')",
                    "    pipeline_input = '/kaggle/working/input_nobg.png'",
                    "else:",
                    "    pipeline_input = '/kaggle/working/input.png'",
                ]),
                cell([
                    "# run TripoSR",
                    "import subprocess",
                    `MC_RES = ${mcRes}`,
                    "args = ['python', 'run.py', pipeline_input, '--output-dir', '/kaggle/working', '--mc-resolution', str(MC_RES)]",
                    `if not ${removeBg ? "True" : "False"}: args.append('--no-remove-bg')`,
                    "subprocess.check_call(args)",
                ]),
                cell([
                    "# TripoSR's run.py writes outputs under /kaggle/working/0/. Promote the GLB to /kaggle/working/output.glb",
                    "import shutil, os",
                    "produced = '/kaggle/working/0'",
                    "if os.path.isdir(produced):",
                    "    for f in sorted(os.listdir(produced)):",
                    "        src = os.path.join(produced, f)",
                    "        if f.endswith('.obj') or f.endswith('.glb'):",
                    "            shutil.copy(src, os.path.join('/kaggle/working', f))",
                    "            print('promoted', f)",
                    "    # promote the GLB (or convert OBJ → GLB via trimesh) to output.glb",
                    "    glb = next((p for p in os.listdir('/kaggle/working') if p.endswith('.glb')), None)",
                    "    if glb:",
                    "        shutil.copy(os.path.join('/kaggle/working', glb), '/kaggle/working/output.glb')",
                    "    else:",
                    "        obj = next((p for p in os.listdir('/kaggle/working') if p.endswith('.obj')), None)",
                    "        if obj:",
                    "            import trimesh",
                    "            m = trimesh.load(os.path.join('/kaggle/working', obj))",
                    "            m.export('/kaggle/working/output.glb')",
                    "            print('converted', obj, '→ output.glb')",
                    "print('files:', sorted(f for f in os.listdir('/kaggle/working') if not f.startswith('.')))",
                ]),
            ],
            metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } },
            nbformat: 4, nbformat_minor: 4,
        };
    },
};
