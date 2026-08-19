// kaggle_templates/pixal3d.js — TencentARC Pixal3D image → 3D on Kaggle.
//
// HONEST: same caveat as trellis2 / hunyuan3d — Pixal3D is recent
// (TencentARC release; Saganaki22 packaged the ComfyUI wrapper used by
// the engine's local pipeline). For Kaggle we skip the ComfyUI wrapper
// and use TencentARC's underlying repo directly. The model ships custom
// CUDA pieces (FlashAttention 2/3 selection, optional Triton kernels)
// that may or may not build cleanly on Kaggle's current PyTorch/CUDA
// stack. Run Diagnostic first to confirm bridge plumbing, then iterate
// on the install + pipeline class names from the error you see.
//
// VRAM: on the engine's local 8GB GTX 1080 the wrapper authors recommend
// vram_mode=hybrid_low_vram. On Kaggle T4 (16GB) you have headroom —
// can run in normal mode without offloading.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "pixal3d",
    label: "Pixal3D (image → textured 3D GLB, cloud GPU)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — single object on a clean background works best. Non-square inputs are padded to square automatically by Pixal3D." },
        { name: "removeBackground", type: "bool", default: true,
          help: "run rembg before inference — Pixal3D's own preprocessor handles padding but rembg gives cleaner edges" },
        { name: "vramMode", type: "select", default: "normal",
          options: ["normal", "hybrid_low_vram", "native_low_vram"],
          help: "On T4 16GB use 'normal'. The low-VRAM modes are for cards <12GB (the engine's local 8GB rig uses hybrid)." },
        { name: "seed", type: "int", default: 42 },
        { name: "flashAttn", type: "select", default: "2",
          options: ["2", "3", "none"],
          help: "FlashAttention version — 2 is widely compatible, 3 is fastest but needs Hopper (H100/H800). 'none' falls back to SDPA." },
    ],

    buildNotebook(params, ctx) {
        const imageB64  = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg  = params.removeBackground !== false;
        const vramMode  = String(params.vramMode || "normal");
        const seed      = parseInt(params.seed, 10) || 42;
        const flashAttn = String(params.flashAttn || "2");

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "TencentARC **Pixal3D** image → textured 3D on Kaggle. Outputs a GLB with PBR textures.",
                    "First-run install is heavy (~10-15 min) — custom CUDA kernels + MoGe geometry estimator + Pixal3D weights.",
                    "Cache as a Kaggle Dataset after the first successful run to skip the download next time."]),

                cell([
                    "import torch; print('torch =', torch.__version__, '· cuda =', torch.version.cuda)",
                    "print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                    "print('vram:', round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1) if torch.cuda.is_available() else 0, 'GB')",
                ]),

                cell([
                    "# 1. v696 — check for cached Pixal3D weights/repo attached as a Kaggle Dataset.",
                    "# If present, skip the git clone + weight download. Pixal3D's own custom",
                    "# CUDA kernels still need to compile on the running Kaggle (~5-10 min) so",
                    "# cache savings are smaller than for image-gen models, but the weight",
                    "# download + initial pip install can still be ~5 min on the first run.",
                    "import os, shutil",
                    "PIXAL_DIR = '/kaggle/working/Pixal3D'",
                    "CACHED = False",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        # Look for a Pixal3D-shaped directory (has pixal3d/, requirements.txt, etc.)",
                    "        if os.path.isdir(p) and (os.path.isdir(os.path.join(p, 'pixal3d')) or os.path.exists(os.path.join(p, 'requirements.txt'))):",
                    "            # /kaggle/input is read-only, so copy to /kaggle/working where it can install + run",
                    "            print(f'caching from {p} -> {PIXAL_DIR}')",
                    "            shutil.copytree(p, PIXAL_DIR, dirs_exist_ok=True)",
                    "            CACHED = True",
                    "            break",
                    "if not CACHED:",
                    "    print('no Pixal3D cache attached — will git clone from upstream')",
                ]),

                cell([
                    "# 2. install Pixal3D — TODO verify repo URL + dep versions vs current Kaggle CUDA",
                    "import os, subprocess",
                    "if not os.path.isdir(PIXAL_DIR):",
                    "    # TencentARC's repo — if this URL is wrong, try github.com/Saganaki22/Pixal3D-ComfyUI for the wrapper which",
                    "    # contains links to the upstream source.",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/TencentARC/Pixal3D.git', PIXAL_DIR])",
                    "os.chdir(PIXAL_DIR)",
                    "!pip install -q --upgrade pip",
                    "# Core deps — Pixal3D's requirements.txt + extras the engine's wrapper installs",
                    "if os.path.exists('requirements.txt'):",
                    "    !pip install -q -r requirements.txt",
                    "!pip install -q rembg trimesh pymeshlab huggingface_hub xatlas open3d",
                ]),

                cell([
                    `# 2. optional FlashAttention install — value="${flashAttn}"`,
                    `FLASH_ATTN = ${JSON.stringify(flashAttn)}`,
                    "if FLASH_ATTN == '2':",
                    "    # T4 is Turing — FA2 should work. Skip if it fails; SDPA fallback is fine.",
                    "    try:",
                    "        !pip install -q flash-attn --no-build-isolation",
                    "        import flash_attn; print('flash-attn:', flash_attn.__version__)",
                    "    except Exception as e:",
                    "        print('flash-attn install failed, falling back to SDPA:', e)",
                    "elif FLASH_ATTN == '3':",
                    "    print('FA3 requires Hopper (H100/H800) — T4 is Turing, so skipping; SDPA used instead.')",
                    "else:",
                    "    print('using SDPA (PyTorch native attention)')",
                ]),

                cell([
                    "# 3. decode the user's image + optional background removal",
                    "import base64, io, os",
                    "from PIL import Image",
                    `IMAGE_B64 = ${JSON.stringify(imageB64)}`,
                    "img = Image.open(io.BytesIO(base64.b64decode(IMAGE_B64))).convert('RGBA')",
                    "img.save('/kaggle/working/input.png')",
                    "print('input:', img.size)",
                    "",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    img = remove(img)",
                    "    img.save('/kaggle/working/input_nobg.png')",
                    "    print('background removed')",
                ]),

                cell([
                    "# 4. run Pixal3D image-to-3D — TODO verify class names vs current TencentARC/Pixal3D code",
                    "import torch, sys",
                    "sys.path.insert(0, '/kaggle/working/Pixal3D')",
                    `torch.manual_seed(${seed})`,
                    `VRAM_MODE = ${JSON.stringify(vramMode)}`,
                    "",
                    "# Try the canonical class names first — adjust based on the repo's README/example.",
                    "try:",
                    "    from pixal3d.pipelines import Pixal3DPipeline   # TODO verify",
                    "    pipe = Pixal3DPipeline.from_pretrained('TencentARC/Pixal3D', torch_dtype=torch.bfloat16, vram_mode=VRAM_MODE)",
                    "    pipe.to('cuda')",
                    `    outputs = pipe.run(img, seed=${seed})`,
                    "except Exception as e1:",
                    "    print('canonical path failed:', e1)",
                    "    # Fallback: if there's an example script in the repo, exec it with our image.",
                    "    # The Saganaki22 ComfyUI wrapper uses internal class names like Pixal3DImageTo3D —",
                    "    # check the upstream for the current pipeline entrypoint.",
                    "    raise",
                    "",
                    "print('Pixal3D outputs:', list(outputs.keys()) if hasattr(outputs, 'keys') else type(outputs))",
                ]),

                cell([
                    "# 5. export the textured GLB",
                    "# Most TencentARC pipelines expose a .to_glb() or .export_glb() helper. Verify against the repo.",
                    "OUT = '/kaggle/working/output.glb'",
                    "try:",
                    "    # Pattern 1: outputs is a dict with 'mesh' / 'gaussian' keys (TRELLIS-style)",
                    "    if isinstance(outputs, dict) and 'mesh' in outputs:",
                    "        outputs['mesh'][0].export(OUT)",
                    "    # Pattern 2: outputs is a trimesh.Trimesh directly",
                    "    elif hasattr(outputs, 'export'):",
                    "        outputs.export(OUT)",
                    "    # Pattern 3: pipeline has a save_glb method",
                    "    elif hasattr(pipe, 'save_glb'):",
                    "        pipe.save_glb(outputs, OUT)",
                    "    else:",
                    "        raise RuntimeError('unknown output shape — inspect outputs and adjust')",
                    "    print('exported', OUT, '·', __import__('os').path.getsize(OUT), 'bytes')",
                    "except Exception as e:",
                    "    print('export failed:', e)",
                    "    print('inspect outputs:', outputs)",
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
