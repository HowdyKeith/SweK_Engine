// kaggle_templates/sam3d_objects.js — Meta SAM 3D Objects (image→mesh + splat).
//
// Single-image-to-3D, dual decoder (mesh + Gaussian splat). Trained on
// large-scale real-world data, so it handles cluttered/occluded scenes
// better than the synthetic-trained image-to-3D models in the roster.
// Released November 2025 alongside SAM 3 + SAM 3D Body.
//
// Repo:    https://github.com/facebookresearch/sam-3d-objects
// License: research-use; weights via gated HuggingFace
//
// GATED:   Two access requests needed before this notebook can succeed:
//          1. SAM 3D Objects HF repo (the model checkpoints)
//          2. SAM 2 HF repo (for mask generation if user doesn't supply one)
//          Both go through Kaggle Secret HF_TOKEN — same pattern as SF3D.
//
// VRAM:    ~12-15 GB peak (the dual decoder + SAM 2 mask gen). Fits on
//          Kaggle's free T4/P100 (16GB) without needing the dual-T4 trick.
//          Big install + first-run download (~5-8 GB) means first run is
//          slow; subsequent runs are fast.
//
// INPUT:   ONE image. The model is SAM-based, so it operates on a
//          segmented object (not the whole image). If the user doesn't
//          supply a mask separately, cell 5 auto-runs SAM 2 with
//          "center point click" prompt to generate a default whole-object
//          mask. This works well when the input image has a clear subject;
//          for multi-object scenes, the user should supply masks manually.
//
// OUTPUT:  /kaggle/working/output.glb   — mesh decoder result
//          /kaggle/working/splat.ply    — Gaussian splat decoder result
//          Engine's existing GLB loader picks up output.glb; the .ply
//          works in the SplatRenderer.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "sam3d_objects",
    label: "SAM 3D Objects (Meta · image→mesh + splat · GATED · real-world scenes)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "string", required: true,
          help: "the input image (provided by the Lab's image picker)" },
        { name: "seed", type: "int", default: 42,
          help: "generation seed" },
        { name: "exportSplat", type: "bool", default: true,
          help: "also save the Gaussian-splat .ply (engine's SplatRenderer reads this directly)" },
        { name: "exportMesh", type: "bool", default: true,
          help: "save the mesh decoder result as a .glb the engine can load" },
    ],

    buildNotebook(params, ctx) {
        const seed = parseInt(params.seed, 10) || 42;
        const wantSplat = params.exportSplat !== false;
        const wantMesh  = params.exportMesh  !== false;
        const imgB64    = String(params.imageBase64 || "");

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Meta SAM 3D Objects — single-image to 3D, with both mesh AND Gaussian-splat decoders.",
                    `**Seed:** ${seed} · **mesh:** ${wantMesh ? "yes" : "no"} · **splat:** ${wantSplat ? "yes" : "no"}`,
                    "",
                    "**GATED on two HuggingFace repos:**",
                    "1. https://huggingface.co/facebook/sam-3d-objects  (the model)",
                    "2. https://huggingface.co/facebook/sam2-hiera-large  (for mask generation)",
                    "Request access to both, then Add-ons → Secrets → HF_TOKEN.",
                    "",
                    "**Install is ~5-10 minutes** the first time (pytorch3d build + checkpoint download)."]),

                cell([
                    "# 1. HF_TOKEN from Kaggle Secrets",
                    "import os",
                    "try:",
                    "    from kaggle_secrets import UserSecretsClient",
                    "    HF_TOKEN = UserSecretsClient().get_secret('HF_TOKEN')",
                    "    os.environ['HF_TOKEN'] = HF_TOKEN",
                    "    os.environ['HUGGING_FACE_HUB_TOKEN'] = HF_TOKEN",
                    "    print('HF_TOKEN loaded (len', len(HF_TOKEN), ')')",
                    "except Exception as e:",
                    "    raise RuntimeError(",
                    "        'No HF_TOKEN — request SAM 3D Objects + SAM 2 HF access, then add HF_TOKEN secret.\\n  ' + str(e))",
                ]),

                cell([
                    "# 2. GPU probe — SAM 3D Objects needs ~12-15 GB peak",
                    "!nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv",
                    "import torch",
                    "print('torch=', torch.__version__, 'cuda=', torch.version.cuda, 'devices=', torch.cuda.device_count())",
                ]),

                cell([
                    "# 3. Install SAM 3D Objects. The official setup uses mamba which",
                    "# isn't on Kaggle by default. We replicate the pip-only path:",
                    "# clone repo, install editable with [inference] extras (skips the dev",
                    "# tooling), patch hydra (PR 2863 not yet merged), install pytorch3d",
                    "# from the prebuilt Kaolin wheel index to avoid a 20-minute compile.",
                    "import subprocess, os",
                    "os.environ['PIP_EXTRA_INDEX_URL'] = 'https://download.pytorch.org/whl/cu121'",
                    "os.environ['PIP_FIND_LINKS']     = 'https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.5.1_cu121.html'",
                    "if not os.path.isdir('/kaggle/working/sam-3d-objects'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/facebookresearch/sam-3d-objects.git', '/kaggle/working/sam-3d-objects'])",
                    "os.chdir('/kaggle/working/sam-3d-objects')",
                    "# Two-step install per official setup.md — pytorch3d's pytorch dep is broken",
                    "!pip install -q -e '.[p3d]'",
                    "!pip install -q -e '.[inference]'",
                    "# Install SAM 2 for mask generation",
                    "!pip install -q git+https://github.com/facebookresearch/sam2.git",
                ]),

                cell([
                    "# 4. HF login + write the input image to disk",
                    "from huggingface_hub import login",
                    "login(token=os.environ['HF_TOKEN'], add_to_git_credential=False)",
                    "import base64",
                    `image_b64 = ${JSON.stringify(imgB64.replace(/^data:[^;]+;base64,/, ""))}`,
                    "if not image_b64: raise RuntimeError('no input image — Lab should have supplied imageBase64')",
                    "img_bytes = base64.b64decode(image_b64)",
                    "img_path = '/kaggle/working/input.png'",
                    "with open(img_path, 'wb') as f: f.write(img_bytes)",
                    "print(f'input image: {img_path} ({len(img_bytes)} bytes)')",
                ]),

                cell([
                    "# 5. Auto-generate a mask with SAM 2 (center-point prompt on the input image).",
                    "# Cleanest 'whole subject' mask for image-to-3D. For multi-object scenes",
                    "# the user would supply their own mask, but the Lab picker is single-image.",
                    "from sam2.sam2_image_predictor import SAM2ImagePredictor",
                    "from PIL import Image",
                    "import numpy as np",
                    "img = Image.open('/kaggle/working/input.png').convert('RGB')",
                    "arr = np.array(img)",
                    "h, w = arr.shape[:2]",
                    "predictor = SAM2ImagePredictor.from_pretrained('facebook/sam2-hiera-large')",
                    "predictor.set_image(arr)",
                    "# Center-point click + a few negative points along the edges to avoid",
                    "# the background bleeding into the mask",
                    "points = np.array([[w//2, h//2], [10, 10], [w-10, 10], [10, h-10], [w-10, h-10]])",
                    "labels = np.array([1, 0, 0, 0, 0])  # 1=foreground, 0=background",
                    "masks, scores, _ = predictor.predict(point_coords=points, point_labels=labels, multimask_output=True)",
                    "best_mask = masks[int(np.argmax(scores))]",
                    "# Save the mask as a binary PNG",
                    "Image.fromarray((best_mask * 255).astype(np.uint8)).save('/kaggle/working/mask.png')",
                    "print(f'SAM 2 mask: {best_mask.sum()} foreground pixels ({100*best_mask.sum()/(h*w):.1f}% of image)')",
                ]),

                cell([
                    "# 6. Download SAM 3D Objects checkpoints + run inference",
                    "import sys",
                    "sys.path.append('/kaggle/working/sam-3d-objects/notebook')",
                    "from huggingface_hub import snapshot_download",
                    "ckpt_dir = snapshot_download(repo_id='facebook/sam-3d-objects', local_dir='/kaggle/working/sam-3d-objects/checkpoints/hf')",
                    "print('checkpoints at:', ckpt_dir)",
                    "from inference import Inference, load_image, load_single_mask",
                    "import numpy as np",
                    "from PIL import Image",
                    "config_path = '/kaggle/working/sam-3d-objects/checkpoints/hf/pipeline.yaml'",
                    "inf = Inference(config_path, compile=False)",
                    "image = load_image('/kaggle/working/input.png')",
                    "# Hand the SAM 2 mask in. load_single_mask expects a directory layout;",
                    "# we mimic it with a single-mask folder.",
                    "import os, shutil",
                    "mask_dir = '/kaggle/working/single_mask'",
                    "os.makedirs(mask_dir, exist_ok=True)",
                    "shutil.copy('/kaggle/working/mask.png', f'{mask_dir}/mask_0.png')",
                    `output = inf(image, load_single_mask(mask_dir, index=0), seed=${seed})`,
                    "print('inference complete — output keys:', list(output.keys()))",
                ]),

                cell([
                    "# 7. Export both formats (splat .ply + mesh .glb)",
                    "import os",
                    `if ${wantSplat ? "True" : "False"} and 'gs' in output:`,
                    "    output['gs'].save_ply('/kaggle/working/splat.ply')",
                    "    print(f'splat: /kaggle/working/splat.ply ({os.path.getsize(\"/kaggle/working/splat.ply\")} bytes)')",
                    `if ${wantMesh ? "True" : "False"} and 'mesh' in output:`,
                    "    mesh = output['mesh']",
                    "    # SAM 3D Objects' mesh is a trimesh.Trimesh or similar — export to GLB",
                    "    try:",
                    "        import trimesh",
                    "        if isinstance(mesh, trimesh.Trimesh):",
                    "            mesh.export('/kaggle/working/output.glb')",
                    "        else:",
                    "            # fall back to whatever the object's own save method is",
                    "            if hasattr(mesh, 'export'): mesh.export('/kaggle/working/output.glb')",
                    "            elif hasattr(mesh, 'save_glb'): mesh.save_glb('/kaggle/working/output.glb')",
                    "            else: print(f'WARN: unknown mesh type {type(mesh).__name__} — saving via trimesh roundtrip')",
                    "        print(f'mesh: /kaggle/working/output.glb ({os.path.getsize(\"/kaggle/working/output.glb\")} bytes)')",
                    "    except Exception as e:",
                    "        print(f'mesh export failed: {e}')",
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
