// kaggle_templates/diagnostic.js — quick end-to-end check: pushes a tiny CPU
// notebook that prints env info and writes a placeholder file to /kaggle/working/.
// Use this first to confirm Kaggle auth + push + status + output download all
// work BEFORE iterating on heavier templates.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "diagnostic",
    label: "Diagnostic (end-to-end check)",
    gpu: false,                                // CPU runtime; spins up faster
    defaultDatasets: [],
    paramsSchema: [],                          // no inputs

    buildNotebook(params, ctx) {
        return {
            cells: [
                md([`# ${ctx.title}`,
                    "",
                    "VoxelEngine **bridge diagnostic** — verifies the Kaggle pipeline works",
                    "end-to-end without spending GPU quota."]),
                cell([
                    "import sys, os, platform, json, time",
                    "info = {",
                    "    'python': sys.version.split()[0],",
                    "    'platform': platform.platform(),",
                    "    'cwd': os.getcwd(),",
                    "    'working_writable': os.access('/kaggle/working', os.W_OK),",
                    "    'time': time.strftime('%Y-%m-%d %H:%M:%S'),",
                    "}",
                    "try:",
                    "    import torch",
                    "    info['torch'] = torch.__version__",
                    "    info['cuda_available'] = torch.cuda.is_available()",
                    "    if torch.cuda.is_available():",
                    "        info['gpu_name'] = torch.cuda.get_device_name(0)",
                    "        info['gpu_mem_gb'] = round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1)",
                    "except Exception as e:",
                    "    info['torch_error'] = str(e)",
                    "print(json.dumps(info, indent=2))",
                ]),
                cell([
                    "# write a small marker file the bridge can verify in the output download",
                    "import os, json, time",
                    "os.makedirs('/kaggle/working', exist_ok=True)",
                    "with open('/kaggle/working/diagnostic.txt', 'w') as f:",
                    "    f.write('VoxelEngine bridge diagnostic OK at ' + time.strftime('%Y-%m-%dT%H:%M:%S') + '\\n')",
                    "    f.write(json.dumps(info, indent=2))",
                    "# minimal placeholder .glb (4-byte header + 8-byte length so the engine's loader",
                    "# treats it as a (broken) GLB rather than ignoring it). Real templates write real meshes.",
                    "with open('/kaggle/working/diagnostic.glb', 'wb') as f:",
                    "    f.write(b'glTF\\x02\\x00\\x00\\x00\\x14\\x00\\x00\\x00')",
                    "print('wrote:', os.listdir('/kaggle/working'))",
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
