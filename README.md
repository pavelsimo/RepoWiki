<!-- Generated: 2026-06-28 18:25:52 UTC -->

# RepoWiki

RepoWiki is a self-hosted static code wiki template. Agent workflows populate
strict, source-cited Markdown under `wiki/`; deterministic Node.js code renders
that Markdown plus `DESIGN.md` tokens into static HTML under `site/`.

It is built for codebase catalogs that need stable navigation, search, GitHub source citations, Mermaid diagrams, and light/dark reading themes.

## Requirements

- Node.js 22 or newer
- Git access for any repositories listed in `repositories.md`

## Quick start

```sh
npm install
npm test
npm run lint:wiki
npm run render
npm run render:check
```

`lint:wiki`, `render`, and `render:check` require a local `wiki/index.md`.
This template ignores local `wiki/` and `site/` output by default.

## Workflow

1. Edit `repositories.md` to list repositories to index; keep credentials out.
2. Generate or refresh strict Markdown in `wiki/`; `wiki/index.md` defines page order.
3. Run `npm run render` to rebuild `site/`; do not hand-edit generated HTML.
4. Run `npm run render:check` before publishing committed site output.

## Markdown contract

Repo pages require front matter with `repo`, `slug`, `page`, `sha`, `ref`,
`indexed`, and `summary`; exactly one `#` title; a leading `> Scope:` block;
`## Relevant source files`; bare `[path:1-3](url)` citations; and sibling
`.md` links in `## Related pages`.

## Key files

- `repositories.md` - user-owned repository input.
- `DESIGN.md` - token source for the generated interface.
- `.skills/repowiki/SKILL.md` - lifecycle instructions for RepoWiki workspaces.
- `scripts/render-site.mjs` - renderer, parser, validator, search index builder, and CLI.
- `renderer/assets/` - CSS, search JavaScript, and Mermaid runtime copied into `site/`.
- `test/render-site.test.mjs` - Node test coverage for parsing and rendering behavior.
