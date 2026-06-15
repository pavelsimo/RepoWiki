---
version: alpha
name: RepoWiki
description: Self-hosted code wiki interface with clean source-backed reading.
colors:
  background: "#ffffff"
  surface: "#f8fafc"
  border: "#e2e8f0"
  text: "#1e293b"
  heading: "#0f172a"
  muted: "#64748b"
  accent: "#4f46e5"
  accent-soft: "#eef2ff"
  warning: "#b45309"
  danger: "#b91c1c"
  dark-background: "#0f172a"
  dark-surface: "#1e293b"
  dark-border: "#334155"
  dark-text: "#cbd5e1"
  dark-heading: "#f1f5f9"
  dark-muted: "#94a3b8"
  dark-accent: "#818cf8"
  dark-accent-soft: "#312e81"
  dark-warning: "#fbbf24"
  dark-danger: "#f87171"
typography:
  body:
    fontFamily: Inter
    fontSize: 1rem
  heading:
    fontFamily: Inter
    fontWeight: 600
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
  small:
    fontFamily: Inter
    fontSize: 0.8125rem
rounded:
  sm: 6px
  md: 10px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
  repo-list:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
  status-counter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  source-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
  citation-link:
    textColor: "{colors.text}"
    typography: "{typography.mono}"
  source-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  sidebar-nav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
  toc:
    textColor: "{colors.muted}"
  diagram-frame:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  article:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
  github-link:
    textColor: "{colors.muted}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
  theme-toggle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
---

## Overview

RepoWiki's interface is a clean, light-first documentation surface in the
spirit of DeepWiki with a modern twist. The first screen is the working
directory of indexed repositories — never a marketing hero. Density and
scannability still beat decoration, but the tone is a calm reading surface:
generous whitespace inside a tight structure, one restrained accent, and
code-shaped things in mono. A dark variant ships alongside the light theme
and is reachable from every page via a toggle. The YAML tokens above are
normative; this prose explains how to apply them. Agents must read this file
before generating or editing any HTML or CSS, and every CSS value must derive
from a token.

## Colors

The palette is a white/slate light theme paired with a slate dark theme.
Every light token `colors.X` has a dark sibling `colors.dark-X`; the pairing
is normative. The generated stylesheet maps both sets onto the *same* CSS
custom properties: `:root` carries the light values, a
`:root[data-theme="dark"]` block overrides them with the `dark-*` values, and
a `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }`
block repeats the dark values so pages follow the OS theme when JavaScript is
disabled. Declare `color-scheme: light dark` on `html` so form controls and
scrollbars follow. Component CSS only ever reads the un-prefixed custom
properties — theming is exactly one override block, never per-component.

`colors.background` is the page; `colors.surface` is one step up for inputs,
chips, panels, and code blocks; `colors.border` provides the 1px structure
between them. `colors.heading` is reserved for headings and the wordmark so
titles read a step darker (lighter, in dark mode) than body text.
`colors.accent` (indigo) is the single accent, strictly reserved for links,
citations, active nav items, selected filter chips, and focus rings — never
large fills and never body text. `colors.accent-soft` is the fill counterpart:
hover and active *backgrounds* (the active sidebar pill, hovered chips, the
selected filter) use `accent-soft` with `accent` text, never a solid accent
fill. `colors.muted` carries all secondary text — summaries, labels,
timestamps, metadata. `colors.warning` marks stale repositories and
`colors.danger` marks failed ones; they appear only in status contexts.
Status mapping: indexed/fresh → `colors.accent`, stale → `colors.warning`,
failed → `colors.danger`.

## Typography

Body and headings use the Inter stack; anything code-shaped — file paths,
commit SHAs, search input, chips, identifiers in tables — uses the JetBrains
Mono stack. Declare both with system fallbacks and ship no font files:
`Inter, system-ui, -apple-system, sans-serif` and
`"JetBrains Mono", ui-monospace, SFMono-Regular, monospace`. Base body size is
`typography.body.fontSize`; mono runs slightly smaller at
`typography.mono.fontSize` so paths sit comfortably inside prose;
`typography.small` is for metadata lines, chip labels, and the topbar GitHub
link. Headings use `typography.heading.fontWeight`, not heavier — hierarchy
comes from size and spacing, not boldness. Keep muted text at or above
`typography.small` size so the muted-on-surface contrast stays accessible.

## Layout

Repository pages use a three-column CSS grid: a left sidebar of roughly 260px
holding the page tree, a center article column, and a right "On this page"
column of roughly 200px. Total content width caps near 1400px, centered. The
home page drops the side columns and gives the repository list the full
content width. The page background is plain `colors.background` — no grid
pattern, no texture. Below 960px the grid collapses to a single column: the
sidebar becomes a top disclosure, the TOC is omitted. Vertical rhythm uses
the spacing scale; `spacing.md` is the default gap, `spacing.lg` separates
sections, `spacing.xl` separates major page regions.

The sidebar is a numbered, hierarchical nav tree in the DeepWiki manner.
Top-level entries are the repo's pages in ledger order, numbered `1..N`. The
current page's entry expands in place to list that page's h2 sections as
`N.1, N.2, …` anchor links; other entries stay collapsed. This
"expanded-current" shape needs no JavaScript — it is rendered per page.

## Elevation & Depth

The interface is flat-first. Depth comes from two devices only: 1px borders
in `colors.border` and the contrast between `colors.surface` and
`colors.background`. No drop shadows, no glows, no gradients on components.
Two exceptions may use a faint shadow to separate themselves from content
beneath: the search results dropdown and the zoomed diagram overlay.

## Shapes

Chips, tags, buttons, and other small inline elements use `rounded.sm`.
Cards, inputs, panels, and diagram frames use `rounded.md`. Nothing rounder.
Tables stay square-cornered with strong horizontal scan lines: a 1px
`colors.border` bottom border per row, no vertical rules, no zebra striping.
Buttons are rectangles with `rounded.sm` and a border, never pill-shaped.

## Components

The YAML component tokens carry only what the design.md schema can express:
fills, text colors, typography scale, and radii. Everything richer is
normative here instead: every component border is 1px `colors.border`;
active, selected, and hovered states use `colors.accent` text on
`colors.accent-soft` fills; the focus ring is a 2px `colors.accent` outline.

- **Search input** — command-palette styling: mono font, `colors.surface`
  fill, 1px border, a muted `/` keyboard hint on the right. On focus the
  border shifts to `colors.accent`. One search input in the topbar of every
  page, searching the whole wiki. The results dropdown is a
  `colors.background` panel with a 1px border and a faint shadow.
- **GitHub link** — a topbar anchor showing the GitHub mark (inline SVG,
  16px, `fill="currentColor"` so it follows the text color) followed by
  `owner/repo` in `typography.small`. Muted by default, `colors.accent` text
  on hover. It links to the repository home; on repo pages it sits between
  the breadcrumb and the search input, and on the home page each repo row
  carries its own icon-only version.
- **Theme toggle** — an icon button at the right end of the topbar: moon icon
  shown in light mode, sun icon in dark mode, both inline SVGs swapped purely
  via `[data-theme]` CSS rules. `colors.surface` fill, 1px border,
  `rounded.sm`. When JavaScript is disabled the toggle is hidden
  (`html:not([data-theme]) .theme-toggle { display: none }`) and the site
  follows the OS preference.
- **Repo list** — the home page centerpiece, DeepWiki-flavored: one row per
  repository with the repo name (mono, links to the repo overview), a
  one-line summary in muted text beneath, and right-aligned metadata —
  language, page count, indexed date, status dot, and an icon-only GitHub
  link. Rows separated by 1px `colors.border` bottom borders.
- **Filter chips** — a horizontal row above the repo list: all, stale,
  failed, language, owner, manual tags. Inactive chips are surface + muted
  text; the active chip is `colors.accent-soft` fill with `colors.accent`
  text and border.
- **Status counters** — small surface cards in a row near the top of the home
  page: repos indexed, stale, failed, pages generated. Big mono value in
  `colors.heading`, small muted label beneath.
- **Citation links** — every citation is a real `<a class="citation-link">`
  pointing at the provider permalink pinned to the indexed commit SHA
  (`…/blob/<sha>/<path>#L12-L48`). Render each citation as a compact segmented
  source pill: GitHub/provider mark plus path segment in mono, then a separate
  line-range segment in muted text. Do not render citation labels through normal
  Markdown emphasis rules; file names such as `__init__.py` must remain literal.
  Hover changes the segment borders and path/provider text to `colors.accent`
  without adding an underline. Only when a repo has no recognized provider do
  citations fall back to non-linked source chips.
- **Source chips** — inline mono pills for paths without line ranges:
  surface fill, `rounded.sm`. When a permalink exists the chip is a link and
  hovers to `colors.accent` text.
- **Source panel** — the collapsible "Relevant source files" inventory at the
  top of each article: a `<details>` styled as a surface panel; each entry is
  a linked source chip (provider blob URL at the pinned SHA) with a one-line
  reason.
- **Sidebar nav** — the numbered page tree described under Layout. Items are
  muted text with the number in mono; the current page gets `colors.accent`
  text on a `colors.accent-soft` rounded pill. Its child h2 anchors render
  indented beneath in `typography.small`. Group label (the repo name) is
  small, muted, uppercase.
- **Right TOC** — "On this page" anchor list in muted text, plain links, no
  scroll-spy required in v1.
- **Diagram frame** — Mermaid diagrams sit in a surface panel with
  `rounded.md` border and a small toolbar row: diagram title left, an
  "expand" control right that toggles a zoomed overlay. The Mermaid source
  stays available beneath the frame in a collapsed `<details>`. Diagrams
  re-render to match the active theme when the toggle fires.
- **Article body** — measure capped near 75ch inside the center column.
  Inline code and code blocks on `colors.surface`. Links in `colors.accent`,
  underlined on hover. Tables follow the scan-line rules. Headings in
  `colors.heading`.
- **Footer** — every page ends with a `ref @ short-sha` source chip that
  links to the provider commit page for the indexed SHA, plus a muted
  "indexed YYYY-MM-DD" note.

## Do's and Don'ts

Do derive every color, radius, spacing, and font value from the tokens in
this file. Do keep the structure tight — compact chips, scan-line tables —
while letting the article breathe. Do render anything code-shaped in mono.
Do keep the accent rare so it stays meaningful. Do keep every page readable
when opened from `file://` with no network. Do emit the head theme script on
every page — the wrong theme must never flash on load.

Don't add hero sections, banners, or decorative illustration. Don't use
gradients on text or components. Don't introduce a second accent color or a
solid-accent fill. Don't download webfonts or load assets from CDNs in the
default build. Don't use JS frameworks or build steps — static HTML, one
stylesheet, and small vanilla scripts only. Don't write inline styles that
diverge from `style.css`. Don't reference a `dark-*` token from component
CSS — theming happens only in the `:root` override blocks.
