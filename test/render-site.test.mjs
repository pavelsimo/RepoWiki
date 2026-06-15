import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RenderError,
  buildSearchIndex,
  parseWikiIndex,
  parseWikiPage,
  renderArticleContent,
  rewriteHref,
  slugify
} from '../scripts/render-site.mjs';

const validPage = `---
repo: demo
slug: demo
page: overview
sha: abc123456789
ref: main
indexed: 2026-06-12
summary: Demo summary.
---

# Overview

> Scope: Demo scope with [links](other.md).

## Relevant source files

- \`src/__init__.py\` — entry point

## System Flow

The system starts in the entry point.
[src/__init__.py:1-3](https://github.com/acme/demo/blob/abc123456789/src/__init__.py#L1-L3)

| Component | Evidence |
| --------- | -------- |
| Entry point | [src/__init__.py:1-3](https://github.com/acme/demo/blob/abc123456789/src/__init__.py#L1-L3) |

\`\`\`mermaid
flowchart LR
  a --> b
\`\`\`
Diagram sources: [src/__init__.py:1-3](https://github.com/acme/demo/blob/abc123456789/src/__init__.py#L1-L3)

## Related pages

- [Other](other.md)
`;

test('slugify uses stable GitHub-style ids', () => {
  assert.equal(slugify('Configuration & Runtime'), 'configuration-runtime');
  assert.equal(slugify('C++14'), 'c-14');
  assert.equal(slugify('AniList Data Flow'), 'anilist-data-flow');
});

test('rewriteHref converts local markdown links only', () => {
  assert.equal(rewriteHref('overview.md'), 'overview.html');
  assert.equal(rewriteHref('guide.md#setup'), 'guide.html#setup');
  assert.equal(rewriteHref('#local'), '#local');
  assert.equal(rewriteHref('https://example.com/readme.md'), 'https://example.com/readme.md');
});

test('parseWikiIndex reads ledger and canonical page order', () => {
  const repos = parseWikiIndex(`# Wiki Index

## Ledger

| Repo | Slug | URI | Ref | SHA | Indexed | Status | Categories | Tags |
| ---- | ---- | --- | --- | --- | ------- | ------ | ---------- | ---- |
| [demo](demo/overview.md) | demo | \`https://github.com/acme/demo.git\` | main | \`abc123\` | 2026-06-12 | indexed | JS, CLI | docs |

## demo

### Pages

- [Overview](demo/overview.md) - Demo summary.
`);
  assert.equal(repos.length, 1);
  assert.equal(repos[0].owner, 'acme');
  assert.deepEqual(repos[0].categories, ['JS', 'CLI']);
  assert.equal(repos[0].pages[0].page, 'overview');
});

test('parseWikiPage validates and extracts page structure', () => {
  const parsed = parseWikiPage(validPage, {
    repo: { slug: 'demo' },
    page: { page: 'overview' },
    fileLabel: 'wiki/demo/overview.md'
  });
  assert.equal(parsed.title, 'Overview');
  assert.equal(parsed.scope.startsWith('Scope:'), true);
  assert.deepEqual(parsed.sourceInventory[0].paths, ['src/__init__.py']);
  assert.deepEqual(parsed.navHeadings.map((heading) => heading.title), ['System Flow']);
  assert.deepEqual(parsed.sourceLabels, ['src/__init__.py:1-3']);
});

test('renderArticleContent wraps source citations and mermaid blocks', () => {
  const parsed = parseWikiPage(validPage, {
    repo: { slug: 'demo' },
    page: { page: 'overview' },
    fileLabel: 'wiki/demo/overview.md'
  });
  const html = renderArticleContent(parsed);
  assert.match(html, /<p class="source-line"><a class="citation-link"/);
  assert.doesNotMatch(html, /<p class="source-line">Source:/);
  assert.match(html, /class="citation-link"/);
  assert.match(html, /class="citation-path"/);
  assert.match(html, /class="citation-lines">1-3<\/span>/);
  assert.match(html, /src\/__init__\.py/);
  assert.match(html, /<td><a class="citation-link"/);
  assert.doesNotMatch(html, /<strong>init<\/strong>/);
  assert.match(html, /<figure class="diagram-frame">/);
  assert.match(html, /<pre class="mermaid">flowchart LR/);
  assert.doesNotMatch(html, /<p class="diagram-sources">Sources:/);
});

test('buildSearchIndex emits repo records before page records', () => {
  const parsed = parseWikiPage(validPage, {
    repo: { slug: 'demo' },
    page: { page: 'overview' },
    fileLabel: 'wiki/demo/overview.md'
  });
  const records = buildSearchIndex({
    repos: [{
      slug: 'demo',
      categories: ['JS'],
      tags: ['docs'],
      pages: [{ title: 'Overview', page: 'overview', summary: 'Demo summary.', parsed }]
    }]
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].title, 'demo');
  assert.equal(records[1].url, 'demo/overview.html');
  assert.deepEqual(records[1].sources, ['src/__init__.py:1-3']);
});

test('parseWikiPage fails when required front matter is absent', () => {
  assert.throws(() => parseWikiPage(validPage.replace('summary: Demo summary.\n', ''), {
    repo: { slug: 'demo' },
    page: { page: 'overview' },
    fileLabel: 'wiki/demo/overview.md'
  }), RenderError);
});

test('parseWikiPage rejects visible Source labels on citation links', () => {
  assert.throws(() => parseWikiPage(validPage.replace(
    '\n[src/__init__.py:1-3](https://github.com/acme/demo/blob/abc123456789/src/__init__.py#L1-L3)',
    '\nSource: [src/__init__.py:1-3](https://github.com/acme/demo/blob/abc123456789/src/__init__.py#L1-L3)'
  ), {
    repo: { slug: 'demo' },
    page: { page: 'overview' },
    fileLabel: 'wiki/demo/overview.md'
  }), RenderError);
});
