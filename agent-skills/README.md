# Agent Skills

These are **Anthropic Agent Skills** — a different thing from the engine's own
"webwright" skills (the scraper scripts the bridge runs via `/webwright/skills`).

An Agent Skill is a folder with a `SKILL.md` (name + description frontmatter, plus
instructions and optional helper scripts). Claude **discovers it by its description
and runs it inside a code-execution sandbox** — it is not executed by a browser
panel directly. The same folder works in three places:

- **Claude Code** — drop the skill folder in `~/.claude/skills/<name>/` (global) or
  `.claude/skills/<name>/` inside a project. Claude Code auto-discovers it and loads
  it when a task matches the description.
- **Claude.ai** (Pro/Max/Team/Enterprise, code execution enabled) — upload the skill;
  Claude loads it when relevant.
- **Claude API / Agent SDK** — upload the custom skill once, then pass it in the
  `container.skills` array alongside the `code_execution` tool:

  ```python
  client.beta.messages.create(
      model="claude-opus-4-8",
      betas=["code-execution-2025-08-25", "skills-2025-10-02"],
      container={"skills": [{"type": "custom", "skill_id": "skill_…", "version": "latest"}]},
      tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
      messages=[{"role": "user", "content": "Grade submission.xlsx against key.xlsx"}],
  )
  ```

## Can a skill run from an engine panel?
Not directly — the panel/browser isn't a code-execution runtime. But a panel **can
trigger one**: have the panel (or the bridge) make the API call above with
`code_execution` + the skill mounted, exactly like the "Claude in Claude" pattern.
The skill then runs in Anthropic's sandbox and returns its result, which the panel
displays. So: panel → API (with skill) → sandbox runs it → result back to the panel.
For things you want to run *locally on the bridge with no Claude loop*, the engine's
own webwright skills (Python in `ai-bridge/scrapers/`) are the right tool.

## Skills here
- **xlsx-eval/** — compare a submitted workbook against an answer-key workbook
  (formula / value / structure diff + match score). Built for the Excel-eval work.
  Run standalone: `python xlsx-eval/scripts/compare.py --expected key.xlsx --submitted cand.xlsx`

## SweK's own skills (v3510)

Two skills that encode what nobody outside this tree could publish. Every mechanical claim they make --
paths, tool names, environment variables, and the one structural rule a reader will copy verbatim -- is
RE-DERIVED by `WebGLEngine/tools/ship/skillClaims-selfcheck.mjs`, because a skill is prose about the tree
and prose about the tree is the one thing this project has had to hunt down twelve times.

- **swek-gate** -- how to write a selfcheck that grades a claim against an answer key rather than against
  itself: key-not-mirror, plant-as-parameter, the load-bearing negative shown FAILING, assert the property
  and never the arrangement, and every gate needs a front door.
- **swek-device** -- how to add a roundhouse device, including whether the module deserves one at all, the
  four defects the bind shape prevents, the eight registration steps, and the detection map that is the
  round's actual result.
