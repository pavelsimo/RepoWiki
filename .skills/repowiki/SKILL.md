---
name: repowiki
description: Operate RepoWiki lifecycle workflows for self-hosted codebase wikis. Use when Codex needs to initialize a RepoWiki workspace, ingest or refresh repositories from repositories.md, generate or lint wiki Markdown, render static HTML under site/, search generated wiki content, or maintain RepoWiki's source-backed Markdown contract.
---

# RepoWiki

## Core Rules

- Treat `repositories.md` as user-owned input. Do not rewrite repository entries after init unless the user explicitly asks.
- Never store credentials, tokens, private keys, or credential-bearing clone URLs in repo files, wiki pages, site output, logs, or examples.
- Clone source repositories only into temporary scratch directories and delete them when the workflow finishes.
- Treat `wiki/` as generated Markdown and `site/` as generated static HTML. Do not hand-edit `site/`; regenerate it with `npm run render`.
- In this template repository, keep local example `wiki/` and `site/` content out of version control unless the user explicitly asks to publish examples.
- Before editing HTML/CSS or render output, read `DESIGN.md` and preserve its token-driven visual contract.
- Preserve source citations. Every nontrivial claim about a codebase should be traceable to source paths and line ranges.

## Commands

### init

Use when the user wants to start a new wiki workspace.

1. Create or confirm `repositories.md` and `DESIGN.md`.
2. Create `wiki/index.md` and `wiki/log.md` if missing.
3. Keep `site/` empty until Markdown exists, then run `npm run render`.
4. Run `npm run lint:wiki` when Markdown exists, then `npm run render:check`.

### ingest

Use for repositories listed in `repositories.md` that are not yet present in `wiki/index.md`.

1. Parse each `- uri:` entry with optional `alias`, `ref`, and `tags`.
2. Clone each repository into a temporary directory using the operator's existing git authentication.
3. Resolve the target ref to a full commit SHA.
4. Generate a repo section in `wiki/index.md`, repo pages under `wiki/<slug>/`, and an append-only entry in `wiki/log.md`.
5. Render with `npm run render`, then verify with `npm run lint:wiki` and `npm run render:check`.

### update

Use when indexed repositories may be stale.

1. Clone the repository at the configured ref and resolve the current SHA.
2. Compare it to the SHA recorded in `wiki/index.md`.
3. If unchanged, leave pages untouched and record no wiki churn.
4. If changed, inspect the diff from the previous SHA when available; update only affected pages.
5. If the previous SHA is unavailable, regenerate that repository's pages.
6. Update `wiki/index.md`, append `wiki/log.md`, render, and run checks.

### render

Use when Markdown or `DESIGN.md` changed.

1. Run `npm run render`.
2. Run `npm run render:check`.
3. Inspect `git status --short --ignored` before committing so ignored local examples are not staged accidentally.

### lint

Use before committing wiki or renderer changes.

1. Run `npm run lint:wiki`.
2. Check for missing pages, pages not listed in `wiki/index.md`, invalid front matter, invalid source citation labels, broken sibling links, and visible `Source:` prefixes.
3. For stale or suspicious source citations, re-open the temporary clone and verify paths and line ranges.

### search

Use to answer questions from generated wiki content.

1. Search `wiki/` first with `rg`, then inspect cited source files when available.
2. Prefer cited Markdown evidence over generated HTML.
3. If the answer depends on current upstream code, refresh or clone the source repository before answering.

## Markdown Contract

Repo pages must include:

- YAML front matter with `repo`, `slug`, `page`, `sha`, `ref`, `indexed`, and `summary`.
- Exactly one `#` title.
- A leading `> Scope:` block.
- A `## Relevant source files` list.
- Source citations as bare `[path:lines](url)` paragraphs with no `Source:` prefix.
- `## Related pages` links that point to sibling `.md` files.

`wiki/index.md` is the canonical page order for navigation and rendering.
