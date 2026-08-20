// kaggle_templates/lito.js — Apple LiTo (Surface Light Field Tokenization).
//
// ICLR 2026 paper from Apple's ML research team (Chang, Zhao, Chan, Tuzel).
// Single-image-to-3D that preserves view-dependent appearance — specular
// highlights, Fresnel reflections, lighting consistency across viewing
// angles. Apple claims it outperforms TRELLIS in this dimension.
//
// HONEST: the repo verifies on A100/H100/B200 — Kaggle T4 (Turing) is NOT
// in the verified-platforms list. Will probably work since LiTo's deps
// (PyTorch3D, xformers, FlashAttention) all have Turing builds, but
// performance will be slower than the paper's 4.7s/generation H100 number.
// Expect 30-90s on T4. Run Diagnostic first to confirm bridge plumbing.
//
// The repo's preferred env manager is pixi. Kaggle doesn't have pixi
// pre-installed, so this template installs deps with pip (the official
// repo says "we found compiling on the running system is most robust —
// pip install xxx --no-build-isolation" so we follow that).

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "lito",
    label: "Apple LiTo (image → 3D, view-dependent lighting)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — single object on a clean background works best. LiTo is especially good at preserving reflective/glossy surfaces." },
        { name: "removeBackground", type: "bool", default: true,
          help: "run rembg before inference — LiTo's own preprocessing handles cluttered backgrounds OK but rembg gives cleaner cutouts" },
        { name: "seed", type: "int", default: 42 },
        { name: "torchCompile", type: "bool", default: false,
          help: "Compile the model with torch.compile() for ~2-3x speedup. First run is slow due to compilation; subsequent runs in the same notebook session are fast. T4 may not support all torch.compile() paths — disable if it errors." },
    ],

    buildNotebook(params, ctx) {
        const imageB64    = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg    = params.removeBackground !== false;
        const seed        = parseInt(params.seed, 10) || 42;
        const torchCompile = params.torchCompile === true;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "**Apple LiTo** (Surface Light Field Tokenization) image → 3D on Kaggle.",
                    "",
                    "ICLR 2026 — Chang, Zhao, Chan, Tuzel. Encodes geometry + view-dependent appearance into a shared",
                    "latent space, preserving reflections and Fresnel highlights across viewing angles. The paper",
                    "specifically calls out beating TRELLIS on lighting consistency.",
                    "",
                    "**T4 caveat**: LiTo is verified on A100/H100/B200 — Turing should work but isn't tested upstream.",
                    "Expect 30-90s per generation (paper's 4.7s figure is post-`torch.compile` on H100). First-run install",
                    "is heavy: PyTorch3D + xformers + FlashAttention all source-builds, ~15-25 min."]),

                cell([
                    "import torch; print('torch =', torch.__version__, '· cuda =', torch.version.cuda)",
                    "print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                    "print('vram:', round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1) if torch.cuda.is_available() else 0, 'GB')",
                ]),

                cell([
                    "# 1a. v696 — check for cached ml-lito attached as a Kaggle Dataset.",
                    "# If present, skip the git clone. Same caveat as Pixal3D: LiTo's heavy",
                    "# cost is the source builds (PyTorch3D, xformers, flash-attn) which",
                    "# need to recompile each run regardless. Caching the cloned repo +",
                    "# downloaded weights can still save 3-5 min on first-run.",
                    "import os, shutil",
                    "LITO_DIR = '/kaggle/working/ml-lito'",
                    "CACHED = False",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        # Look for an ml-lito-shaped directory",
                    "        if os.path.isdir(p) and (os.path.isdir(os.path.join(p, 'lito')) or os.path.exists(os.path.join(p, 'README.md')) and 'lito' in d.lower()):",
                    "            print(f'caching from {p} -> {LITO_DIR}')",
                    "            shutil.copytree(p, LITO_DIR, dirs_exist_ok=True)",
                    "            CACHED = True",
                    "            break",
                    "if not CACHED:",
                    "    print('no LiTo cache attached — will git clone from upstream')",
                ]),

                cell([
                    "# 1. clone Apple ml-lito (skipped if cached above)",
                    "import os, subprocess",
                    "if not os.path.isdir(LITO_DIR):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/apple/ml-lito.git', LITO_DIR])",
                    "os.chdir(LITO_DIR)",
                    "print('working dir:', os.getcwd())",
                ]),

                cell([
                    "# 2. install deps — paper says 'compile on running system is most robust' (no-build-isolation)",
                    "# This is the slowest cell — PyTorch3D + xformers + flash-attn all source-build on T4.",
                    "!pip install -q --upgrade pip",
                    "# Core deps (everything except the heavy custom builds)",
                    "!pip install -q rembg trimesh pymeshlab huggingface_hub xatlas einops omegaconf",
                    "",
                    "# xformers — Kaggle PyTorch is usually 2.x with cu121. Try matching wheel; fall back to source.",
                    "try:",
                    "    !pip install -q xformers --no-build-isolation",
                    "    import xformers; print('xformers:', xformers.__version__)",
                    "except Exception as e:",
                    "    print('xformers install failed:', e)",
                    "",
                    "# FlashAttention — T4 is Turing (sm_75); FA2 has Turing support, FA3 needs Hopper.",
                    "try:",
                    "    !pip install -q flash-attn --no-build-isolation",
                    "    import flash_attn; print('flash-attn:', flash_attn.__version__)",
                    "except Exception as e:",
                    "    print('flash-attn install failed — LiTo will fall back to SDPA:', e)",
                    "",
                    "# PyTorch3D — try the prebuilt wheel for the running torch/cuda combo first.",
                    "try:",
                    "    import torch; tv = torch.__version__.split('+')[0]; cv = (torch.version.cuda or '').replace('.', '')",
                    "    wheel = f'https://anaconda.org/pytorch3d/pytorch3d/wheels/'",
                    "    !pip install -q pytorch3d -f https://dl.fbaipublicfiles.com/pytorch3d/packaging/wheels/py310_cu121_pyt230/download.html",
                    "except Exception as e:",
                    "    print('pytorch3d wheel install failed, trying source:', e)",
                    "    !pip install -q git+https://github.com/facebookresearch/pytorch3d.git",
                    "",
                    "# Install LiTo itself (if the repo has a setup.py / pyproject)",
                    "if os.path.exists('setup.py') or os.path.exists('pyproject.toml'):",
                    "    !pip install -q -e .",
                ]),

                cell([
                    "# 3. decode the user's image + optional background removal",
                    "import base64, io, os",
                    "from PIL import Image",
                    `IMAGE_B64 = ${JSON.stringify(imageB64)}`,
                    "img = Image.open(io.BytesIO(base64.b64decode(IMAGE_B64))).convert('RGBA')",
                    "img.save('/kaggle/working/input.png')",
                    "print('input image:', img.size)",
                    "",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    img = remove(img)",
                    "    img.save('/kaggle/working/input_nobg.png')",
                    "    print('background removed')",
                ]),

                cell([
                    "# 4. run LiTo image-to-3D — TODO verify class name vs current Apple ml-lito code",
                    "import torch, sys",
                    "sys.path.insert(0, '/kaggle/working/ml-lito')",
                    `torch.manual_seed(${seed})`,
                    `USE_COMPILE = ${torchCompile ? "True" : "False"}`,
                    "",
                    "# LiTo's exact pipeline class name depends on the repo's current API.",
                    "# Try the most likely paths in order; if all fail, manual edit required.",
                    "pipe = None",
                    "errors = []",
                    "",
                    "# Path 1: standard image_to_3d module",
                    "try:",
                    "    from lito.pipelines import LiToImageTo3DPipeline   # TODO verify",
                    "    pipe = LiToImageTo3DPipeline.from_pretrained('apple/ml-lito', torch_dtype=torch.bfloat16)",
                    "    pipe.to('cuda')",
                    "except Exception as e: errors.append(('Path1', str(e)))",
                    "",
                    "# Path 2: demo script entrypoint",
                    "if pipe is None:",
                    "    try:",
                    "        from lito.demo import build_pipeline   # TODO verify",
                    "        pipe = build_pipeline(device='cuda')",
                    "    except Exception as e: errors.append(('Path2', str(e)))",
                    "",
                    "# Path 3: hub from_pretrained on the bare repo",
                    "if pipe is None:",
                    "    try:",
                    "        from lito import LiTo   # TODO verify",
                    "        pipe = LiTo.from_pretrained('apple/ml-lito').to('cuda')",
                    "    except Exception as e: errors.append(('Path3', str(e)))",
                    "",
                    "if pipe is None:",
                    "    print('All canonical pipeline paths failed. Check the Apple ml-lito README/demo scripts for the current class names. Errors:')",
                    "    for tag, msg in errors: print(' ', tag, ':', msg[:160])",
                    "    raise RuntimeError('LiTo pipeline class not found — manual edit required, see errors above')",
                    "",
                    "# Optional torch.compile speedup (post-init, before first generate)",
                    "if USE_COMPILE:",
                    "    try: pipe = torch.compile(pipe)",
                    "    except Exception as e: print('torch.compile failed (using eager):', e)",
                    "",
                    `outputs = pipe(img, seed=${seed})`,
                    "print('LiTo outputs type:', type(outputs))",
                ]),

                cell([
                    "# 5. export GLB — multiple output shapes covered",
                    "OUT = '/kaggle/working/output.glb'",
                    "try:",
                    "    # Pattern 1: outputs is a dict with 'mesh' / 'gaussians' keys",
                    "    if isinstance(outputs, dict) and 'mesh' in outputs:",
                    "        m = outputs['mesh']",
                    "        (m[0] if isinstance(m, list) else m).export(OUT)",
                    "    # Pattern 2: outputs is a trimesh-like with export()",
                    "    elif hasattr(outputs, 'export'):",
                    "        outputs.export(OUT)",
                    "    # Pattern 3: pipeline exposes save_glb / save_mesh",
                    "    elif hasattr(pipe, 'save_glb'):",
                    "        pipe.save_glb(outputs, OUT)",
                    "    elif hasattr(pipe, 'save_mesh'):",
                    "        pipe.save_mesh(outputs, OUT)",
                    "    else:",
                    "        # Last resort: inspect and try to find a mesh-ish attribute",
                    "        print('inspecting outputs:', dir(outputs))",
                    "        raise RuntimeError('export path not recognized — inspect outputs above and add a case')",
                    "    print('exported', OUT, '·', __import__('os').path.getsize(OUT), 'bytes')",
                    "except Exception as e:",
                    "    print('export failed:', e)",
                    "    raise",
                ]),

                cell([
                    "import os",
                    "for f in sorted(os.listdir('/kaggle/working')):",
                    "    p = os.path.join('/kaggle/working', f)",
                    "    if os.path.isfile(p):",
                    "        print(f, os.path.getsize(p))",
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
