# RepoWiki Agent Guide

RepoWiki has two phases:

1. LLM or agent workflows generate and update Markdown under `wiki/`.
2. Deterministic Node code renders static HTML under `site/`.

Agents may edit `repositories.md`, `DESIGN.md`, `.skills/repowiki/SKILL.md`,
`wiki/index.md`, `wiki/log.md`, and `wiki/<repo>/*.md`.

Do not hand-edit files under `site/`. Treat `site/` as generated output. After
any Markdown or design-token change, run:

```sh
npm run render
npm run render:check
```

This template repository keeps local example `wiki/` and `site/` output ignored
by default. Do not stage or commit those examples unless the user explicitly
asks to publish sample content.

The Markdown contract is strict. Repo pages must include front matter with
`repo`, `slug`, `page`, `sha`, `ref`, `indexed`, and `summary`; exactly one
`#` title; a leading `> Scope:` block; a `## Relevant source files` list; source
citations as bare `[path:lines](url)` paragraphs with no `Source:` prefix; and
`## Related pages` links that point to sibling `.md` files. `wiki/index.md` is
the canonical page order for navigation and rendering.
