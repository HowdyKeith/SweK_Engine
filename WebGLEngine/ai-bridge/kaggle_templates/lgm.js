// kaggle_templates/lgm.js — LGM: Large Multi-View Gaussian Model (3DTopia, ECCV 2024 Oral).
//
// Single image → multi-view diffusion (ImageDream/MVDream) → Gaussian
// splats. Distinct from the other templates: native output is a `.ply`
// Gaussian Splat file, not a mesh. Optional `convert.py` stage extracts a
// `.glb` mesh via nvdiffrast for engines that don't render splats. Our
// engine has window.splat for .ply, so both outputs are useful.
//
// Inference ~10GB VRAM (loads ImageDream + MVDream + LGM together).
//
// Specific deps: torch 2.1.0 + cu118 + xformers + diff-gaussian-rasterization +
// nvdiffrast. This template pins those exactly per the README. First run
// is slow because diff-gaussian-rasterization compiles from source.
//
// Repo: https://github.com/3DTopia/LGM

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "lgm",
    label: "LGM (image → Gaussian Splats .ply + optional .glb mesh extraction)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image — multi-view diffusion will hallucinate the other views" },
        { name: "extractMesh", type: "bool", default: true,
          help: "after generating splats, run convert.py to extract a .glb mesh via nvdiffrast" },
    ],

    buildNotebook(params, ctx) {
        const imgB64    = String(params.imageBase64 || "").replace(/^data:[^;]+;base64,/i, "");
        const extract   = params.extractMesh !== false;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "LGM: image → Gaussian splats `.ply` + optional mesh `.glb` extraction.",
                    "First run is slow — diff-gaussian-rasterization compiles from source (~5-10 min)."]),

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
                    "# 1. system deps for nvdiffrast (libGL)",
                    "!apt-get update -qq && apt-get install -y -qq libgl1 libegl1 libglu1-mesa > /dev/null",
                ]),

                cell([
                    "# 2. clone LGM",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/LGM'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/3DTopia/LGM.git', '/kaggle/working/LGM'])",
                    "os.chdir('/kaggle/working/LGM')",
                ]),

                cell([
                    "# 3. install LGM's specific torch + xformers (per README — torch 2.1.0 + cu118)",
                    "# Kaggle's default torch may differ; we install what LGM expects.",
                    "!pip install -q torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu118",
                    "!pip install -q -U xformers --index-url https://download.pytorch.org/whl/cu118",
                ]),

                cell([
                    "# 4. build diff-gaussian-rasterization (the modified one with alpha/depth)",
                    "#    Compiles from source — slow on first run.",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/diff-gaussian-rasterization'):",
                    "    subprocess.check_call(['git', 'clone', '--recursive', 'https://github.com/ashawkey/diff-gaussian-rasterization', '/kaggle/working/diff-gaussian-rasterization'])",
                    "!pip install -q /kaggle/working/diff-gaussian-rasterization",
                ]),

                cell([
                    "# 5. nvdiffrast (for the optional mesh extraction stage) + remaining LGM deps",
                    "!pip install -q git+https://github.com/NVlabs/nvdiffrast",
                    "os.chdir('/kaggle/working/LGM')",
                    "!pip install -q -r requirements.txt",
                ]),

                cell([
                    "# 6. fetch the pretrained LGM weights",
                    "import os",
                    "from huggingface_hub import hf_hub_download",
                    "os.makedirs('pretrained', exist_ok=True)",
                    "ckpt_path = hf_hub_download(repo_id='ashawkey/LGM', filename='model_fp16_fixrot.safetensors', local_dir='pretrained')",
                    "print('LGM weights:', ckpt_path, '·', os.path.getsize(ckpt_path), 'bytes')",
                ]),

                cell([
                    "# 7. verify torch + CUDA",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 8. decode input image — LGM's infer.py reads images from a directory",
                    "import base64, os",
                    `IMG_B64 = ${JSON.stringify(imgB64)}`,
                    "os.makedirs('data_in', exist_ok=True)",
                    "img_path = 'data_in/input.png'",
                    "with open(img_path, 'wb') as f: f.write(base64.b64decode(IMG_B64))",
                    "print('input image:', img_path, '·', os.path.getsize(img_path), 'bytes')",
                ]),

                cell([
                    "# 9. run splat inference — output goes to workspace_test/*.ply",
                    "import subprocess",
                    "subprocess.check_call(['python', 'infer.py', 'big',",
                    "                       '--resume', 'pretrained/model_fp16_fixrot.safetensors',",
                    "                       '--workspace', 'workspace_test',",
                    "                       '--test_path', 'data_in'])",
                ]),

                cell([
                    "# 10. promote the .ply to /kaggle/working/output.ply",
                    "import os, glob, shutil",
                    "plys = sorted(glob.glob('workspace_test/**/*.ply', recursive=True))",
                    "if not plys:",
                    "    raise RuntimeError('no .ply produced under workspace_test/ — check infer.py output above')",
                    "src_ply = plys[-1]",
                    "out_ply = '/kaggle/working/output.ply'",
                    "shutil.copy(src_ply, out_ply)",
                    "print('LGM splats:', out_ply, '·', os.path.getsize(out_ply), 'bytes')",
                ]),

                cell([
                    "# 11. optional mesh extraction via convert.py → /kaggle/working/output.glb",
                    `EXTRACT = ${extract ? "True" : "False"}`,
                    "import os, glob, shutil, subprocess",
                    "if EXTRACT:",
                    "    plys = sorted(glob.glob('workspace_test/**/*.ply', recursive=True))",
                    "    src_ply = plys[-1]",
                    "    subprocess.check_call(['python', 'convert.py', 'big', '--test_path', src_ply])",
                    "    # convert.py writes a .glb next to the .ply",
                    "    glbs = sorted(glob.glob('workspace_test/**/*.glb', recursive=True))",
                    "    if glbs:",
                    "        out_glb = '/kaggle/working/output.glb'",
                    "        shutil.copy(glbs[-1], out_glb)",
                    "        print('LGM mesh:', out_glb, '·', os.path.getsize(out_glb), 'bytes')",
                    "    else:",
                    "        print('mesh extraction ran but no .glb landed — check convert.py output')",
                    "else:",
                    "    print('mesh extraction skipped (extractMesh=false); only .ply produced')",
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
