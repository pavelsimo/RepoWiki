# RepoWiki Concept Blueprint

RepoWiki is a self-hosted, DeepWiki-style wiki generator for public or private
codebases. It lets a user provide a list of repository URIs, builds a persistent
markdown wiki from those repositories, and renders a polished static HTML site
for reading, searching, and navigating the generated knowledge.

The guiding constraint is privacy and simplicity. RepoWiki should work for
private repositories without requiring the code to be uploaded to a third-party
service. It should also avoid building a heavyweight RAG platform in v1. The
wiki itself is the durable knowledge layer: generated, maintained, cited, and
versioned as files.

## Research Basis

This concept is based on patterns observed across DeepWiki and five generated
repository wikis:

- [DeepWiki](https://deepwiki.com/)
- [microsoft/vscode](https://deepwiki.com/microsoft/vscode)
- [huggingface/transformers](https://deepwiki.com/huggingface/transformers)
- [microsoft/playwright](https://deepwiki.com/microsoft/playwright)
- [karpathy/nanochat](https://deepwiki.com/karpathy/nanochat)
- [facebook/react](https://deepwiki.com/facebook/react)

It also adapts the persistent wiki idea from Andrew Karpathy's
[llm-wiki](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md),
the artifact/component approach from
[The unreasonable effectiveness of HTML](https://thariqs.github.io/html-effectiveness/),
the compact modern visual tone of [release.bar](https://release.bar/), and the
[Google Labs `DESIGN.md` format](https://github.com/google-labs-code/design.md)
for documenting visual identity in a way coding agents can reliably apply.

## Product Model

RepoWiki has four durable content layers, one design contract, and one agent
operation layer:

1. `repositories.md` - user-owned input listing repositories to index.
2. `wiki/` - generated markdown wiki pages, owned by the LLM/build process.
3. `wiki/index.md` - generated ledger and navigation map for indexed repos.
4. `site/` - generated static HTML site for reading and search.
5. `DESIGN.md` - design tokens and rationale for generated HTML.
6. `.skills/repowiki/` - agent skill instructions that define the wiki
   lifecycle commands.

Repositories themselves are not durable raw sources inside RepoWiki. A repository
URI is the durable input. During a build or refresh, RepoWiki clones each
repository into temporary scratch space, indexes it, records the resolved commit
SHA, generates or updates wiki pages, renders HTML, and discards the clone.

This makes the source-of-truth model simple:

- Human edits `repositories.md`.
- Human asks an agent harness, such as Codex or Claude Code, to run a RepoWiki
  skill command.
- RepoWiki temporarily reads source code through `git clone`.
- The agent skill guides the LLM as it edits `wiki/`, `wiki/index.md`, and
  `site/`.
- `DESIGN.md` guides the agent and renderer when generating or changing HTML,
  CSS, layout, and component styling.
- Git history for the RepoWiki project records how the generated wiki changed.

## Repository Manifest

`repositories.md` is intentionally plain and easy to edit by hand. It should be
treated as user-owned input, not generated content.

Recommended shape:

```md
# Repositories

- uri: git@github.com:company/api.git
  alias: company-api
  ref: main
  tags: backend, typescript, production

- uri: https://github.com/karpathy/nanochat.git
  alias: nanochat
  ref: main
  tags: ml, training, reference
```

Fields:

- `uri`: Required. Any URI supported by local `git clone`.
- `alias`: Optional. Stable display name and slug override.
- `ref`: Optional. Branch, tag, or commit to index. Defaults to the remote
  default branch.
- `tags`: Optional. Human-provided categories for the home page and search.

Private repository authentication should use the operator's existing local git
setup: SSH agent, git credential helpers, `gh`, or `glab`. RepoWiki should never
store access tokens or private keys in `repositories.md`, `wiki/`, `site/`, or
generated logs.

## Generated Index

`wiki/index.md` is maintained by RepoWiki. It serves two roles:

- Content map for humans and LLM agents.
- Indexing ledger for repository refresh decisions.

For each repository, it should record:

- Repository URI.
- Display name and slug.
- Owner or organization.
- Resolved commit SHA.
- Indexed ref.
- Last indexed timestamp.
- Status: indexed, stale, failed, skipped, or partial.
- Auto-inferred categories: language, framework, package type, domain, owner.
- Manual tags copied from `repositories.md`.
- Generated page list with one-line summaries.
- Source coverage notes and failed/stale notes when relevant.

The HTML home page should be rendered from this index. It should follow
DeepWiki's directory pattern: a searchable list of indexed repositories first,
then categorized browsing by owner, language, framework, domain, freshness, and
manual tags.

## Indexing Workflow

The v1 workflow should be conceptually simple:

1. Read `repositories.md`.
2. For each repository URI, clone into temporary scratch space.
3. Resolve the target ref to a commit SHA.
4. Compare that SHA to the prior SHA stored in `wiki/index.md`.
5. If the repo is new, generate a full wiki for that repo.
6. If the repo changed, inspect the diff and update affected pages.
7. If the previous commit is unavailable, regenerate that repo's wiki.
8. Render markdown pages into static HTML under `site/`.
9. Update `wiki/index.md` and append an event to `wiki/log.md`.
10. Delete the temporary clone.

## Agent Skill Command Surface

The lifecycle verbs are not a standalone CLI requirement in v1. RepoWiki should
ship with an agent skill that defines those commands as workflows an LLM coding
agent can execute inside the repository.

Recommended structure:

```txt
.skills/
  repowiki/
    SKILL.md
    templates/
      DESIGN.md
      repositories.md
      wiki-index.md
      wiki-page.md
      site-page.html
```

The skill is the control plane. A user should be able to open this repository in
an agent harness and say things like:

```txt
Use the RepoWiki skill to init this wiki.
Use the RepoWiki skill to ingest the repositories.
Use the RepoWiki skill to update stale repos.
Use the RepoWiki skill to render the site.
Use the RepoWiki skill to lint the wiki.
```

Inside `SKILL.md`, those requests map to workflow commands:

```txt
init
ingest
update
render
search
lint
```

- `init` creates initial `repositories.md`, `DESIGN.md`, `wiki/index.md`,
  `wiki/log.md`, and `site/` scaffolding.
- `ingest` handles repositories listed in `repositories.md` that are not yet
  indexed.
- `update` refreshes repositories whose current commit differs from the commit
  recorded in `wiki/index.md`.
- `render` regenerates the static HTML site from the markdown wiki.
- `search` searches generated wiki content and citation metadata.
- `lint` checks wiki health.

The skill may call normal shell tools such as `git`, `rg`, markdown renderers,
or HTML build helpers, but its primary job is to instruct the agent how to
perform the lifecycle safely: clone to temporary space, inspect code, write
source-backed wiki pages, render HTML, update ledgers, and delete temporary
clones.

A future version can wrap the same workflows in a real `repowiki` CLI, but v1
should not require a binary. The agent skill is enough to make the product work
with existing harnesses that can read instructions, run commands, edit files,
and verify generated HTML.

## DeepWiki Pattern Analysis

Across the sampled DeepWiki repositories, good generated codebase wikis share a
consistent shape.

### Global Navigation

DeepWiki starts with a repository directory and then gives each repo a persistent
left navigation tree. The tree is not just a file browser. It is an architectural
outline: overview, repository structure, core architecture, major subsystems,
build/test infrastructure, development guide, and glossary.

RepoWiki should copy this mental model. The home page lists repositories. Each
repository page has a sidebar organized by concepts and subsystems, not raw
directory order.

### Page Structure

The strongest DeepWiki pages follow this structure:

- Page title with repo context.
- Collapsible "Relevant source files" inventory.
- Short scope statement explaining what the page covers.
- Narrative explanation of the system.
- Inline file and line citations beside important claims.
- Diagrams where relationships or flows matter.
- Tables for packages, modules, responsibilities, and APIs.
- Links to deeper child pages.
- Right-side "On this page" anchors for long documents.

RepoWiki pages should use the same structure as a default template.

### Evidence And Citations

DeepWiki makes code citations first-class. Claims are backed by direct links to
files and line ranges, and diagram source lists appear immediately near the
diagram.

RepoWiki should require citations for important architectural claims. In private
or offline use, citations should point to local file paths and line ranges. When
a provider template is configured, RepoWiki can also emit GitHub or GitLab
permalinks pinned to the indexed commit SHA.

Citation examples:

```md
The API server initializes routes during startup.

[src/server/index.ts:12-48](https://github.com/org/repo/blob/<sha>/src/server/index.ts#L12-L48)
```

```md
[src/server/index.ts:12-48](https://github.com/org/repo/blob/<sha>/src/server/index.ts#L12-L48)
```

Do not prefix citation paragraphs or inline citation chips with `Source:`; the
rendered provider icon and path/line pill are the source affordance.

### Diagrams

DeepWiki uses diagrams for architecture, lifecycle, package dependency, process,
and data-flow explanations. They are most useful when the diagram is source
backed and appears near the explanatory text.

RepoWiki should generate diagrams for:

- High-level system architecture.
- Repository/package dependency graphs.
- Request, event, or data flows.
- Build and release pipelines.
- Process boundaries and runtime components.
- Key abstraction relationships.

For every generated repository, the overview, repository structure, core
architecture, subsystem, flow, public API, configuration/runtime, tooling, and
development-guide pages should each include at least one useful source-backed
diagram unless the page is intentionally text-only because a diagram would add
no new understanding. Glossaries and short reference pages may remain text-first.

Diagrams should use Mermaid or rendered HTML/SVG so they remain text-native,
reviewable, and portable. Each diagram must have an immediate `Diagram sources:`
line with provider permalinks pinned to the indexed commit SHA.

### Tables And Responsibility Maps

The sampled pages often use tables to compress codebase understanding:

- React maps repository paths to package purposes.
- Playwright maps packages, browser engines, and capabilities.
- nanochat maps modules to primary classes and responsibilities.
- Transformers maps model-loading abstractions and ecosystem integrations.
- VS Code maps subsystems to services and entry points.

RepoWiki should generate responsibility tables wherever a subsystem has several
parts with distinct roles.

### Good Wiki Page Taxonomy

Per repository, the default page set should be:

- `Overview`
- `Repository Structure`
- `Core Architecture`
- `Major Subsystems`
- `Data, Request, Or Execution Flows`
- `Public APIs And Interfaces`
- `Build, Test, And Tooling`
- `Configuration And Runtime`
- `Development Guide`
- `Glossary`

The generator should adapt this taxonomy to the repo. A library may need
package/API pages. A service may need request-flow and deployment pages. A
monorepo may need one page per package group.

## Markdown Wiki Design

The markdown wiki follows the spirit of `llm-wiki`: it is a persistent,
compounding artifact. The LLM does not rediscover the repo from scratch every
time someone asks a question. It builds and maintains a structured wiki that can
be searched, rendered, checked, and updated.

Recommended files:

```txt
wiki/
  index.md
  log.md
  <repo-slug>/
    overview.md
    repository-structure.md
    core-architecture.md
    subsystems.md
    flows.md
    build-test-tooling.md
    development-guide.md
    glossary.md
```

Each page should include:

- Title and repo slug.
- Scope statement.
- Relevant source files.
- Body sections.
- Source-backed citations.
- Diagrams and tables when useful.
- Links to sibling and child pages.
- Last indexed commit metadata.

`wiki/log.md` should be append-only. Entries should be parseable by simple tools:

```md
## [2026-06-07] ingest | company-api | abc1234

- Indexed `git@github.com:company/api.git`.
- Generated 8 pages.
- Inferred categories: TypeScript, API, backend.
- Notes: build pipeline diagram generated from `.github/workflows/`.
```

## Design System Contract

RepoWiki should include a root `DESIGN.md` that follows the Google Labs
`DESIGN.md` format where it fits the problem. The file gives coding agents a
persistent design system for the generated HTML site.

The standard should apply to visual identity and UI implementation guidance:

- Color tokens.
- Typography tokens.
- Spacing and radius scales.
- Component-level styling tokens.
- Human-readable rationale for how the UI should feel and behave.
- Do's and don'ts for generated HTML, CSS, and component composition.

It should not be stretched to describe non-visual concerns:

- Repository indexing rules.
- Citation semantics.
- Privacy boundaries.
- LLM prompting policy.
- Wiki page taxonomy.
- Search behavior.

Recommended `DESIGN.md` structure:

```md
---
version: alpha
name: RepoWiki
description: Self-hosted code wiki interface with dense source-backed reading.
colors:
  background: "#050807"
  surface: "#0c1110"
  border: "#26332f"
  text: "#e7f5e8"
  muted: "#94a39b"
  accent: "#8cff66"
  warning: "#f4c95d"
  danger: "#ff6b7a"
typography:
  body:
    fontFamily: Inter
    fontSize: 1rem
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
components:
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  source-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
---

## Overview

## Colors

## Typography

## Layout

## Elevation & Depth

## Shapes

## Components

## Do's and Don'ts
```

RepoWiki-specific component tokens should cover the pieces most likely to be
generated repeatedly:

- Repository table.
- Search input and command palette trigger.
- Filter chips.
- Status counters.
- Source chips and citation links.
- Relevant source file panels.
- Sidebar navigation.
- Right-side table of contents.
- Diagram frame and zoom controls.
- Markdown article body.

The YAML tokens are the normative values. Markdown prose explains how to apply
them, especially where the Google schema cannot express a richer component
pattern. The RepoWiki skill should read `DESIGN.md` before editing site
templates, CSS, or generated HTML.

When the Google `design.md` CLI is available, the skill should run:

```txt
designmd lint DESIGN.md
```

or the equivalent package command supported by the local environment. If the
tool is unavailable, the agent should still preserve the standard shape: YAML
front matter first, markdown rationale second, canonical section order, valid
token references, and no duplicate section headings.

## Static HTML Site

The `site/` output is the reading layer. It should be static, self-hostable, and
portable. Opening the generated site should not require a hosted backend.
Site templates and CSS should be generated from, or at least checked against,
the root `DESIGN.md` design contract.

The first screen should be the actual repo directory, not a marketing page. It
should include:

- RepoWiki wordmark/name.
- Search input with command-palette styling.
- Status metrics: repos indexed, stale repos, failed repos, pages generated.
- Filter chips: all, stale, failed, private, public, language, owner, tags.
- Dense repository table or grid.
- Category sections inferred from metadata and manual tags.

Per-repo HTML pages should include:

- Left sidebar with page tree.
- Center article.
- Right "On this page" anchors.
- Collapsible source inventory.
- Source chips with local and optional provider links.
- Zoomable diagrams.
- Tables for module and subsystem maps.
- Local search over pages and citations.

The site should borrow useful components from `html-effectiveness`:

- Module maps for architecture notes.
- Annotated flowcharts for request/build/deploy paths.
- Collapsible explainers for step-by-step flows.
- Comparison tables for APIs, packages, and subsystems.
- Implementation-plan timelines for future roadmap docs.
- Searchable indexes and compact custom readers for large repo lists.

The visual tone should follow `release.bar`:

- Compact dark interface.
- Subtle grid background.
- Terminal-like search prompt.
- Dense tables with strong scan lines.
- Neon green accent for active states and freshness.
- Muted secondary text.
- Small source chips and tags.
- Clear status counters.
- No decorative hero section.

## Privacy And Model Configuration

RepoWiki should support configurable LLM endpoints:

- Local models for maximum privacy.
- Self-hosted remote models within a private network.
- Hosted model APIs when the operator explicitly chooses them.

The privacy boundary must be explicit. RepoWiki should make clear which model
endpoint will receive repository content before indexing begins.

V1 should not require:

- Uploading repositories to a cloud service.
- Persisting cloned repository contents.
- Storing credentials.
- Running a server-side chat service.

## Search And Q&A Scope

V1 should include local search first, not live chat.

Search should cover:

- Repository names and aliases.
- Page titles and headings.
- Page summaries.
- Source file paths.
- Tags and inferred categories.
- Citation metadata.

Live DeepWiki-style chat can be a later layer. When added, it should answer from
generated wiki pages and cited source snippets, and valuable answers should be
filed back into the markdown wiki.

## Wiki Health Checks

The `lint` skill command should inspect the generated wiki for:

- Repositories listed in `repositories.md` but missing from `wiki/index.md`.
- Repositories marked indexed but missing expected pages.
- Stale commit SHAs.
- Broken local file citations.
- Broken provider permalinks when configured.
- Orphan pages with no inbound links.
- Duplicate or conflicting pages.
- Important uncited claims.
- Missing glossary entries for repeated domain terms.

The lint output should be readable by humans and easy for an LLM agent to act on.

## V1 Boundaries

In scope for the concept:

- `repositories.md` as raw input.
- `DESIGN.md` as the Google-style design contract for generated UI.
- Temporary clone indexing.
- Generated markdown wiki.
- Generated static HTML site.
- `.skills/repowiki/SKILL.md` as the lifecycle command surface for LLM agents.
- Generated `wiki/index.md` ledger.
- Append-only `wiki/log.md`.
- Local search over generated wiki content.
- DeepWiki-inspired page structure.
- ReleaseBar-inspired HTML visual direction.

Out of scope for v1:

- Durable cloned repositories.
- Cloud upload requirement.
- Hosted-only indexing.
- Live chat/Q&A.
- Multi-user permissions.
- Webhook automation.
- A required standalone `repowiki` CLI binary.
- Full use of Google `DESIGN.md` for non-visual product semantics.
- A full vector database or heavyweight RAG system.
- Editing generated wiki pages through the HTML UI.

## Acceptance Criteria

`PLAN.md` is complete when it:

- Explains the repository manifest to temp clone to wiki to site pipeline.
- Explains that lifecycle commands are agent skill workflows, not required shell
  binaries.
- Documents how `repositories.md`, `wiki/index.md`, `wiki/`, and `site/`
  behave.
- Includes DeepWiki pattern analysis from VS Code, Transformers, Playwright,
  nanochat, and React.
- Defines citation behavior for private and hosted repositories.
- Covers private repo authentication without storing credentials.
- Describes automatic and manual homepage categorization.
- Describes how visual design follows Google `DESIGN.md` where possible.
- States v1 boundaries clearly.
- Keeps the project centered on a simple, self-hosted generated wiki rather than
  a complex hosted RAG product.

## Assumptions

- Product name remains RepoWiki for now.
- `repositories.md` is edited by humans.
- `DESIGN.md` is edited intentionally and read by the agent before HTML or CSS
  generation.
- `.skills/repowiki/SKILL.md` is the v1 control plane used by Codex,
  Claude Code, or similar agent harnesses.
- `wiki/index.md` is maintained by the LLM/build process.
- Categories are inferred from repo metadata, languages, frameworks, and manual
  tags.
- LLM endpoint choice is configurable and controlled by the operator.
- Temporary clones are deleted after indexing or refresh.
- Markdown is the editable source of truth; HTML is the polished reading layer.
