# GPU_Assets/subs -- downloaded submarine models for the Sub Aquarium

Drop a `.glb` (or `.gltf`) submarine here, then open the Sub Aquarium page, expand "sub model (.glb)", pick the file (the list is filled from /assets/list),
set its facing and up axis, WRITE ITS LICENCE and press Assign.

- **Licences are real.** A Sketchfab model carries its OWN licence (CC0, CC-BY needing attribution, CC-BY-NC, or its standard licence). The page refuses an assignment with
  no licence written, and shows the attribution line while the model is in use. Nothing in this tree fetches from Sketchfab: you download the file yourself.
- **Nothing here is committed.** The model files in this folder are ignored by git (see the root .gitignore) so a downloaded model can not reach the repository or the release
  zip by accident. Add one to the repository only on purpose, only if its licence allows redistribution, and only with its attribution beside it.
- **Rigid.** The model's rudder and planes do not move; the sub list prints the pilot's command.
- Draco-compressed files load; a model over 500,000 triangles is refused and one over 150,000 is warned about.
