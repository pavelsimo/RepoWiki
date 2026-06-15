#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const REQUIRED_FRONT_MATTER = ['repo', 'slug', 'page', 'sha', 'ref', 'indexed', 'summary'];
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const CITATION_LABEL_RE = /^.+:\d+(?:-\d+)?$/;

export class RenderError extends Error {
  constructor(messages) {
    super(messages.join('\n'));
    this.name = 'RenderError';
    this.messages = messages;
  }
}

export function slugify(value) {
  return stripMarkdown(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function rewriteHref(href) {
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const [target, hash] = href.split('#');
  if (!target.endsWith('.md')) return href;
  return `${target.slice(0, -3)}.html${hash ? `#${hash}` : ''}`;
}

export function stripMarkdown(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function formatValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

function splitMarkdownTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function stripCodeFence(value) {
  const text = value.trim();
  return text.startsWith('`') && text.endsWith('`') ? text.slice(1, -1) : text;
}

function uniqueStable(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parseCsvCell(value) {
  if (!value || value === '-') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function isCitationLabel(label) {
  return CITATION_LABEL_RE.test(String(label || ''));
}

function markdownLinkRemainder(source) {
  return String(source || '').replace(MARKDOWN_LINK_RE, '').trim();
}

function isBareMarkdownLinkLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('[')) return false;
  const links = parseMarkdownLinks(trimmed);
  if (!links.length) return false;
  return /^[,\s]*$/.test(markdownLinkRemainder(trimmed));
}

function isBareCitationLine(line) {
  const trimmed = String(line || '').trim();
  if (!isBareMarkdownLinkLine(trimmed)) return false;
  return parseMarkdownLinks(trimmed).every((link) => isCitationLabel(link.label));
}

export function parseProvider(uri) {
  const httpsMatch = uri.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  const sshMatch = uri.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  const match = httpsMatch || sshMatch;
  if (!match) {
    return {
      owner: '',
      name: uri.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).at(-1) || uri,
      webUrl: ''
    };
  }
  return {
    owner: match[1],
    name: match[2],
    webUrl: `https://github.com/${match[1]}/${match[2]}`
  };
}

export function parseWikiIndex(raw) {
  const errors = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const repos = [];

  for (const line of lines) {
    if (!line.startsWith('| [') || line.includes('| ----')) continue;
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 9) continue;
    const repoLink = cells[0].match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!repoLink) {
      errors.push(`wiki/index.md ledger row has an invalid repo link: ${line}`);
      continue;
    }
    const slug = cells[1];
    const provider = parseProvider(stripCodeFence(cells[2]));
    repos.push({
      name: repoLink[1],
      overviewPath: repoLink[2],
      slug,
      uri: stripCodeFence(cells[2]),
      ref: cells[3],
      sha: stripCodeFence(cells[4]),
      indexed: cells[5],
      status: cells[6],
      categories: parseCsvCell(cells[7]),
      tags: parseCsvCell(cells[8]),
      owner: provider.owner,
      repoName: provider.name,
      providerUrl: provider.webUrl,
      pages: []
    });
  }

  if (!repos.length) errors.push('wiki/index.md must contain at least one ledger row.');

  const sections = new Map();
  let currentSection = null;
  let currentLines = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (currentSection) sections.set(currentSection, currentLines.join('\n'));
      currentSection = heading[1].trim();
      currentLines = [];
      continue;
    }
    if (currentSection) currentLines.push(line);
  }
  if (currentSection) sections.set(currentSection, currentLines.join('\n'));

  for (const repo of repos) {
    const section = sections.get(repo.slug);
    if (!section) {
      errors.push(`wiki/index.md is missing the ## ${repo.slug} section.`);
      continue;
    }
    const sectionLines = section.split('\n');
    const pagesStart = sectionLines.findIndex((line) => line.trim() === '### Pages');
    if (pagesStart === -1) {
      errors.push(`wiki/index.md ## ${repo.slug} is missing a ### Pages section.`);
      continue;
    }
    const pageLines = [];
    for (let index = pagesStart + 1; index < sectionLines.length; index += 1) {
      if (/^###\s+/.test(sectionLines[index])) break;
      pageLines.push(sectionLines[index]);
    }
    const pages = [];
    for (const line of pageLines) {
      const page = line.match(/^- \[([^\]]+)\]\(([^)]+)\) - (.+)$/);
      if (!page) continue;
      pages.push({
        title: page[1],
        href: page[2],
        summary: page[3].trim(),
        page: path.basename(page[2], '.md')
      });
    }
    if (!pages.length) {
      errors.push(`wiki/index.md ## ${repo.slug} has no page entries.`);
    }
    repo.pages = pages;
  }

  if (errors.length) throw new RenderError(errors);
  return repos;
}

function createMarkdown() {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false
  });

  md.core.ruler.after('inline', 'citation_links', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children?.length) continue;
      token.children = transformCitationInlineTokens(token.children);
    }
  });

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const next = tokens[idx + 1];
    if (next?.type === 'inline') {
      tokens[idx].attrSet('id', slugify(next.content));
    }
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href');
    if (href) {
      const rewritten = rewriteHref(href);
      tokens[idx].attrSet('href', rewritten);
      if (/^https?:\/\//i.test(rewritten)) tokens[idx].attrSet('rel', 'noopener');
    }
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

function collectInlineText(tokens, startIndex, endIndex) {
  let text = '';
  for (let index = startIndex; index < endIndex; index += 1) {
    const token = tokens[index];
    if (token.type === 'text' || token.type === 'code_inline') {
      text += token.content;
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      text += ' ';
    }
  }
  return text;
}

function findLinkClose(tokens, openIndex) {
  let nesting = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'link_open') nesting += 1;
    if (token.type === 'link_close') {
      nesting -= 1;
      if (nesting === 0) return index;
    }
  }
  return -1;
}

function transformCitationInlineTokens(tokens) {
  const transformed = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'link_open') {
      transformed.push(token);
      continue;
    }

    const closeIndex = findLinkClose(tokens, index);
    if (closeIndex === -1) {
      transformed.push(token);
      continue;
    }

    const label = collectInlineText(tokens, index + 1, closeIndex);
    if (!isCitationLabel(label)) {
      transformed.push(token);
      continue;
    }

    const href = token.attrGet('href') || '';
    const citation = new token.constructor('html_inline', '', 0);
    citation.content = renderCitationLink(label, rewriteHref(href));
    transformed.push(citation);
    index = closeIndex;
  }
  return transformed;
}

function renderMarkdown(md, source) {
  return md.render(source);
}

function splitSourceLabel(label) {
  const match = String(label).match(/^(.+):(\d+(?:-\d+)?)$/);
  if (!match) return { path: label, lines: '' };
  return { path: match[1], lines: match[2] };
}

function renderCitationLink(label, href) {
  const source = splitSourceLabel(label);
  const text = source.lines ? `${source.path} ${source.lines}` : source.path;
  const github = /^https:\/\/github\.com\//i.test(href)
    ? `<span class="citation-provider">${githubIcon()}</span>`
    : '';
  const lineHtml = source.lines
    ? `<span class="citation-lines">${escapeHtml(source.lines)}</span>`
    : '';
  return `<a class="citation-link${source.lines ? '' : ' no-lines'}" href="${escapeAttr(href)}" rel="noopener" aria-label="${escapeAttr(text)}"><span class="citation-path">${github}${escapeHtml(source.path)}</span>${lineHtml}</a>`;
}

function renderCitationInline(source) {
  let cursor = 0;
  let html = '';
  for (const match of source.matchAll(MARKDOWN_LINK_RE)) {
    html += escapeHtml(source.slice(cursor, match.index));
    html += renderCitationLink(match[1], rewriteHref(match[2]));
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(cursor));
  return html;
}

function parseMarkdownLinks(source) {
  const links = [];
  for (const match of source.matchAll(MARKDOWN_LINK_RE)) {
    links.push({ label: match[1], href: match[2] });
  }
  return links;
}

function findNextSection(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) return index;
  }
  return lines.length;
}

function parseSourceInventory(lines, startIndex, endIndex, fileLabel, errors) {
  const entries = [];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const match = line.match(/^- (.+?)\s+(?:\u2014|-)\s+(.+)$/);
    if (!match) {
      errors.push(`${fileLabel}: invalid Relevant source files entry at line ${index + 1}: ${line}`);
      continue;
    }
    const paths = [...match[1].matchAll(/`([^`]+)`/g)].map((pathMatch) => pathMatch[1]);
    if (!paths.length) {
      errors.push(`${fileLabel}: Relevant source files entry must include at least one backticked path at line ${index + 1}: ${line}`);
      continue;
    }
    entries.push({ path: paths[0], paths, reason: match[2].trim() });
  }
  if (!entries.length) errors.push(`${fileLabel}: Relevant source files must contain at least one entry.`);
  return entries;
}

function extractHeadings(markdown) {
  const headings = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (!match) continue;
    const title = stripMarkdown(match[2]);
    headings.push({
      level: match[1].length,
      title,
      id: slugify(title)
    });
  }
  return headings;
}

function extractSourceLabels(markdown) {
  const labels = [];
  for (const line of markdown.split('\n')) {
    for (const link of parseMarkdownLinks(line)) {
      if (isCitationLabel(link.label)) labels.push(link.label);
    }
  }
  return uniqueStable(labels);
}

function parseScopeBlock(lines, startIndex, fileLabel, errors) {
  const scopeLines = [];
  let index = startIndex;
  while (index < lines.length && lines[index].startsWith('>')) {
    scopeLines.push(lines[index].replace(/^>\s?/, ''));
    index += 1;
  }
  const scope = scopeLines.join(' ').trim();
  if (!scope.startsWith('Scope:')) {
    errors.push(`${fileLabel}: first blockquote after the title must start with "Scope:".`);
  }
  return { scope, endIndex: index };
}

export function parseWikiPage(raw, context = {}) {
  const errors = [];
  const fileLabel = context.fileLabel || '<memory>';
  if (!raw.startsWith('---\n')) errors.push(`${fileLabel}: missing YAML front matter.`);

  const parsed = matter(raw);
  const data = Object.fromEntries(
    Object.entries(parsed.data || {}).map(([key, value]) => [key, formatValue(value)])
  );
  for (const field of REQUIRED_FRONT_MATTER) {
    if (!data[field]) errors.push(`${fileLabel}: missing required front matter field "${field}".`);
  }
  if (context.repo && data.slug && data.slug !== context.repo.slug) {
    errors.push(`${fileLabel}: front matter slug "${data.slug}" does not match wiki/index.md slug "${context.repo.slug}".`);
  }
  if (context.page && data.page && data.page !== context.page.page) {
    errors.push(`${fileLabel}: front matter page "${data.page}" does not match file/index page "${context.page.page}".`);
  }

  const content = parsed.content.replace(/\r\n/g, '\n').trimEnd();
  const lines = content.split('\n');
  const titleLines = [];
  lines.forEach((line, index) => {
    if (/^#\s+/.test(line)) titleLines.push({ line, index });
  });
  if (titleLines.length !== 1) {
    errors.push(`${fileLabel}: expected exactly one # title, found ${titleLines.length}.`);
  }
  const titleEntry = titleLines[0];
  const title = titleEntry ? stripMarkdown(titleEntry.line.replace(/^#\s+/, '')) : '';

  let cursor = titleEntry ? titleEntry.index + 1 : 0;
  while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
  const scope = parseScopeBlock(lines, cursor, fileLabel, errors);

  const relevantIndex = lines.findIndex((line) => /^## Relevant source files\s*$/.test(line));
  if (relevantIndex === -1) {
    errors.push(`${fileLabel}: missing "## Relevant source files" section.`);
  }
  const relevantEnd = relevantIndex === -1 ? scope.endIndex : findNextSection(lines, relevantIndex + 1);
  const sourceInventory = relevantIndex === -1
    ? []
    : parseSourceInventory(lines, relevantIndex, relevantEnd, fileLabel, errors);

  const bodyLines = relevantIndex === -1 ? lines.slice(scope.endIndex) : lines.slice(relevantEnd);
  while (bodyLines[0]?.trim() === '') bodyLines.shift();
  const body = bodyLines.join('\n').trimEnd();
  const headings = extractHeadings(body);
  const navHeadings = headings.filter((heading) => heading.level === 2 && heading.title !== 'Related pages');
  const tocHeadings = headings.filter((heading) => heading.level >= 2);
  const sourceLabels = extractSourceLabels(body);

  if (!/^## Related pages\s*$/m.test(body)) {
    errors.push(`${fileLabel}: missing "## Related pages" section.`);
  }
  body.split('\n').forEach((line, index) => {
    if (/(^|[\s|])Source:\s+\[/.test(line)) {
      errors.push(`${fileLabel}: source citation labels must be bare [path:lines](url) links without "Source:" at line ${index + 1}.`);
    }
    if (!isBareMarkdownLinkLine(line)) return;
    for (const link of parseMarkdownLinks(line)) {
      if (!isCitationLabel(link.label)) {
        errors.push(`${fileLabel}: source citation label must end in :line or :start-end: ${link.label}`);
      }
    }
  });
  for (const match of body.matchAll(/^## Related pages\n([\s\S]*?)(?=^## |\s*$)/gm)) {
    for (const link of parseMarkdownLinks(match[1])) {
      if (!link.href.endsWith('.md')) {
        errors.push(`${fileLabel}: related page link must point to a Markdown file: ${link.href}`);
      }
    }
  }
  const mermaidFenceCount = [...body.matchAll(/^```mermaid\s*$/gm)].length;
  const closingFenceCount = [...body.matchAll(/^```\s*$/gm)].length;
  if (mermaidFenceCount > closingFenceCount) errors.push(`${fileLabel}: unterminated mermaid code fence.`);

  if (errors.length) throw new RenderError(errors);

  return {
    data,
    title,
    scope: scope.scope,
    sourceInventory,
    body,
    headings,
    navHeadings,
    tocHeadings,
    sourceLabels
  };
}

function sourceBlobUrl(repo, sourcePath) {
  if (!repo.providerUrl) return '';
  return `${repo.providerUrl}/blob/${repo.sha}/${sourcePath}`;
}

function commitUrl(repo) {
  if (!repo.providerUrl) return '';
  return `${repo.providerUrl}/commit/${repo.sha}`;
}

function shortSha(sha) {
  return String(sha || '').slice(0, 7);
}

function renderSourcePanel(page, repo) {
  const items = page.sourceInventory.map((source) => {
    const chips = (source.paths || [source.path]).map((sourcePath) => {
      const url = sourceBlobUrl(repo, sourcePath);
      return url
        ? `<a class="source-chip" href="${escapeAttr(url)}" rel="noopener">${escapeHtml(sourcePath)}</a>`
        : `<span class="source-chip">${escapeHtml(sourcePath)}</span>`;
    }).join(' ');
    return `          <li>${chips} — ${escapeHtml(source.reason)}</li>`;
  }).join('\n');

  return `      <details class="source-panel">
        <summary>Relevant source files</summary>
        <ul>
${items}
        </ul>
      </details>`;
}

function renderDiagram(md, code, sourceLine, title) {
  const sourcesHtml = sourceLine
    ? `\n          <p class="diagram-sources">${renderCitationInline(sourceLine.replace(/^Diagram sources:\s*/, ''))}</p>`
    : '';
  return `      <figure class="diagram-frame">
        <figcaption>
          <span>${escapeHtml(title || 'Diagram')}</span>
          <button class="diagram-zoom" type="button">expand</button>
        </figcaption>
        <pre class="mermaid">${escapeHtml(code)}</pre>
        <details><summary>Diagram source</summary>
          <pre><code>${escapeHtml(code)}</code></pre>${sourcesHtml}
        </details>
      </figure>`;
}

export function renderArticleContent(page) {
  const md = createMarkdown();
  const lines = page.body.split('\n');
  const parts = [];
  const normal = [];
  let lastHeading = '';

  function flushNormal() {
    if (!normal.length) return;
    parts.push(renderMarkdown(md, normal.join('\n')));
    normal.length = 0;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{2,3})\s+(.+)$/);
    if (heading) lastHeading = stripMarkdown(heading[2]);

    if (isBareCitationLine(lines[index])) {
      flushNormal();
      parts.push(`<p class="source-line">${renderCitationInline(lines[index].trim())}</p>`);
      continue;
    }

    if (lines[index].trim() !== '```mermaid') {
      normal.push(lines[index]);
      continue;
    }

    flushNormal();
    const codeLines = [];
    index += 1;
    while (index < lines.length && lines[index].trim() !== '```') {
      codeLines.push(lines[index]);
      index += 1;
    }
    let sourceLine = '';
    if (lines[index + 1]?.trim() === '') index += 1;
    if (lines[index + 1]?.startsWith('Diagram sources:')) {
      sourceLine = lines[index + 1];
      index += 1;
    }
    parts.push(renderDiagram(md, codeLines.join('\n'), sourceLine, lastHeading));
  }
  flushNormal();
  return parts.join('\n');
}

function renderThemeBootScript() {
  return `  <script>
    (function () {
      var t = null;
      try { t = localStorage.getItem('repowiki-theme'); } catch (e) {}
      if (t !== 'light' && t !== 'dark') {
        t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', t);
    })();
  </script>`;
}

function renderHead(title, prefix) {
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
${renderThemeBootScript()}
  <link rel="stylesheet" href="${prefix}assets/style.css">
  <script defer src="${prefix}assets/vendor/mermaid.min.js"></script>
  <script defer src="${prefix}assets/search-index.js"></script>
  <script defer src="${prefix}assets/search.js"></script>
</head>`;
}

function githubIcon() {
  return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';
}

function renderThemeToggle() {
  return `    <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle color theme">
      <svg class="icon-moon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9.598 1.591a.75.75 0 0 1 .785-.175 7 7 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.5 5.5 0 1 0 7.678-7.678Z"/></svg>
      <svg class="icon-sun" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-1.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm5.657-8.157a.75.75 0 0 1 0 1.061l-1.061 1.06a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm13 0a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8Zm-8 5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13Zm-5.657-9.157a.75.75 0 0 1 1.061 0l1.06 1.06a.75.75 0 1 1-1.06 1.061l-1.06-1.06a.75.75 0 0 1 0-1.061Zm9.193 9.193a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061Z"/></svg>
    </button>`;
}

function renderSearch() {
  return `    <div class="search">
      <input id="search-input" type="search" placeholder="search the wiki" aria-label="Search the wiki">
      <kbd>/</kbd>
      <div id="search-results" hidden></div>
    </div>`;
}

function renderTopbar(repo, page) {
  if (!repo) {
    return `  <header class="topbar">
    <a class="wordmark" href="index.html">RepoWiki</a>
    <nav class="breadcrumb"><span>repos</span></nav>
${renderSearch()}
${renderThemeToggle()}
  </header>`;
  }

  const display = repo.owner ? `${repo.owner}/${repo.repoName}` : repo.slug;
  const github = repo.providerUrl
    ? `    <a class="github-link" href="${escapeAttr(repo.providerUrl)}" rel="noopener">
      ${githubIcon()}
      <span>${escapeHtml(display)}</span>
    </a>\n`
    : '';
  return `  <header class="topbar">
    <a class="wordmark" href="../index.html">RepoWiki</a>
    <nav class="breadcrumb">
      <a href="../index.html">repos</a>
      <span>/</span>
      <a href="../${repo.slug}/overview.html">${escapeHtml(repo.slug)}</a>
      <span>/</span>
      <span>${escapeHtml(page.data.page)}</span>
    </nav>
${github}${renderSearch()}
${renderThemeToggle()}
  </header>`;
}

function renderSidebar(repo, currentPage) {
  const items = repo.pages.map((pageEntry, index) => {
    const parsed = pageEntry.parsed;
    const current = pageEntry.page === currentPage.data.page;
    const childLinks = current
      ? `\n          <ol>\n${parsed.navHeadings.map((heading, childIndex) => `            <li><a href="#${heading.id}"><span class="nav-num">${index + 1}.${childIndex + 1}</span>${escapeHtml(heading.title)}</a></li>`).join('\n')}\n          </ol>`
      : '';
    return `        <li${current ? ' class="current"' : ''}>
          <a href="${pageEntry.page}.html"${current ? ' class="active"' : ''}><span class="nav-num">${index + 1}</span>${escapeHtml(pageEntry.title)}</a>${childLinks}
        </li>`;
  }).join('\n');

  return `    <nav class="sidebar" aria-label="${escapeAttr(repo.slug)} pages">
      <span class="nav-group">${escapeHtml(repo.slug)}</span>
      <ol class="nav-tree">
${items}
      </ol>
    </nav>`;
}

function renderToc(page) {
  const links = page.tocHeadings.map((heading) => {
    return `      <a href="#${heading.id}" class="toc-${heading.level}">${escapeHtml(heading.title)}</a>`;
  }).join('\n');
  return `    <aside class="toc" aria-label="On this page">
      <span class="nav-group">On this page</span>
${links}
    </aside>`;
}

export function renderRepoPage(repo, pageEntry) {
  const page = pageEntry.parsed;
  const article = renderArticleContent(page);
  const footerUrl = commitUrl(repo);
  const footerChip = footerUrl
    ? `<a class="source-chip" href="${escapeAttr(footerUrl)}" rel="noopener">${escapeHtml(repo.ref)} @ ${escapeHtml(shortSha(repo.sha))}</a>`
    : `<span class="source-chip">${escapeHtml(repo.ref)} @ ${escapeHtml(shortSha(repo.sha))}</span>`;

  return `<!doctype html>
<html lang="en">
${renderHead(`${page.title} · ${repo.slug} · RepoWiki`, '../')}
<body class="page">
${renderTopbar(repo, page)}

  <div class="layout">
${renderSidebar(repo, page)}

    <main class="article">
      <h1 id="${slugify(page.title)}">${escapeHtml(page.title)}</h1>
      <p class="scope">${createMarkdown().renderInline(page.scope)}</p>

${renderSourcePanel(page, repo)}

${article}
    </main>

${renderToc(page)}
  </div>

  <footer class="pagefoot">
    ${footerChip}
    <span class="muted">indexed ${escapeHtml(page.data.indexed)}</span>
  </footer>
</body>
</html>
`;
}

function renderFilterChip(label, filter, active = false) {
  return `      <button class="filter-chip${active ? ' active' : ''}" type="button" data-filter="${escapeAttr(filter)}">${escapeHtml(label)}</button>`;
}

export function renderHomePage(project) {
  const repos = project.repos;
  const pageCount = repos.reduce((total, repo) => total + repo.pages.length, 0);
  const staleCount = repos.filter((repo) => repo.status === 'stale').length;
  const failedCount = repos.filter((repo) => repo.status === 'failed').length;
  const categories = uniqueStable(repos.flatMap((repo) => repo.categories));
  const owners = uniqueStable(repos.map((repo) => repo.owner).filter(Boolean));
  const tags = uniqueStable(repos.flatMap((repo) => repo.tags));

  const chips = [
    renderFilterChip('all', 'all', true),
    renderFilterChip('stale', 'status:stale'),
    renderFilterChip('failed', 'status:failed'),
    ...categories.map((category) => renderFilterChip(category, `cat:${category}`)),
    ...owners.map((owner) => renderFilterChip(owner, `owner:${owner}`)),
    ...tags.map((tag) => renderFilterChip(tag, `tag:${tag}`))
  ].join('\n');

  const rows = repos.map((repo) => {
    const display = repo.owner ? `${repo.owner}/${repo.repoName}` : repo.slug;
    const github = repo.providerUrl
      ? `          <a class="github-link icon-only" href="${escapeAttr(repo.providerUrl)}" rel="noopener" aria-label="${escapeAttr(repo.slug)} on GitHub">
            ${githubIcon()}
          </a>`
      : '';
    return `      <article class="repo-row" data-status="${escapeAttr(repo.status)}" data-owner="${escapeAttr(repo.owner)}" data-cats="${escapeAttr(repo.categories.join('|'))}" data-tags="${escapeAttr(repo.tags.join('|'))}">
        <div class="repo-main">
          <a class="repo-name" href="${repo.slug}/overview.html"><code>${escapeHtml(display)}</code></a>
          <p class="repo-summary">${escapeHtml(repo.pages[0]?.summary || '')}</p>
        </div>
        <div class="repo-meta">
          <span>${escapeHtml(repo.categories[0] || '-')}</span>
          <span>${repo.pages.length} pages</span>
          <span>${escapeHtml(repo.indexed)}</span>
          <span class="status-dot ${escapeAttr(repo.status)}" title="${escapeAttr(repo.status)}"></span>
${github}
        </div>
      </article>`;
  }).join('\n');

  const categorySections = categories.map((category) => {
    const links = repos
      .filter((repo) => repo.categories.includes(category))
      .map((repo) => `<a href="${repo.slug}/overview.html">${escapeHtml(repo.slug)}</a>`)
      .join('');
    return `      <section class="category-section"><h2 id="${slugify(category)}">${escapeHtml(category)}</h2><div class="category-links">${links}</div></section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
${renderHead('RepoWiki', '')}
<body class="page home-page">
${renderTopbar(null, null)}
  <main class="home">
    <section class="status-grid">
      <div class="status-counter"><strong>${repos.length}</strong><span>Repos indexed</span></div>
      <div class="status-counter"><strong>${staleCount}</strong><span>Stale</span></div>
      <div class="status-counter"><strong>${failedCount}</strong><span>Failed</span></div>
      <div class="status-counter"><strong>${pageCount}</strong><span>Pages generated</span></div>
    </section>
    <section class="filters" aria-label="Repository filters">
${chips}
    </section>
    <section class="repo-list" aria-label="Indexed repositories">
${rows}
    </section>
    <section class="category-grid">
${categorySections}
    </section>
  </main>
  <footer class="pagefoot"><span class="muted">${repos.length} repositories · ${pageCount} pages</span></footer>
</body>
</html>
`;
}

export function buildSearchIndex(project) {
  const records = [];
  for (const repo of project.repos) {
    records.push({
      repo: repo.slug,
      slug: repo.slug,
      title: repo.slug,
      url: `${repo.slug}/overview.html`,
      summary: repo.pages[0]?.summary || '',
      headings: repo.pages.map((page) => page.title),
      sources: [],
      tags: repo.tags,
      categories: repo.categories
    });
  }
  for (const repo of project.repos) {
    for (const page of repo.pages) {
      records.push({
        repo: repo.slug,
        slug: repo.slug,
        title: page.title,
        url: `${repo.slug}/${page.page}.html`,
        summary: page.summary,
        headings: page.parsed.navHeadings.map((heading) => heading.title),
        sources: page.parsed.sourceLabels,
        tags: repo.tags,
        categories: repo.categories
      });
    }
  }
  return records;
}

function cssTokenBlock(design) {
  const colors = design.colors || {};
  const rounded = design.rounded || {};
  const spacing = design.spacing || {};
  return `:root {
  --bg: ${colors.background};
  --surface: ${colors.surface};
  --border: ${colors.border};
  --text: ${colors.text};
  --heading: ${colors.heading};
  --muted: ${colors.muted};
  --accent: ${colors.accent};
  --accent-soft: ${colors['accent-soft']};
  --warning: ${colors.warning};
  --danger: ${colors.danger};
  --radius-sm: ${rounded.sm};
  --radius-md: ${rounded.md};
  --space-xs: ${spacing.xs};
  --space-sm: ${spacing.sm};
  --space-md: ${spacing.md};
  --space-lg: ${spacing.lg};
  --space-xl: ${spacing.xl};
  --font-body: Inter, system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

:root[data-theme="dark"] {
  --bg: ${colors['dark-background']};
  --surface: ${colors['dark-surface']};
  --border: ${colors['dark-border']};
  --text: ${colors['dark-text']};
  --heading: ${colors['dark-heading']};
  --muted: ${colors['dark-muted']};
  --accent: ${colors['dark-accent']};
  --accent-soft: ${colors['dark-accent-soft']};
  --warning: ${colors['dark-warning']};
  --danger: ${colors['dark-danger']};
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg: ${colors['dark-background']};
    --surface: ${colors['dark-surface']};
    --border: ${colors['dark-border']};
    --text: ${colors['dark-text']};
    --heading: ${colors['dark-heading']};
    --muted: ${colors['dark-muted']};
    --accent: ${colors['dark-accent']};
    --accent-soft: ${colors['dark-accent-soft']};
    --warning: ${colors['dark-warning']};
    --danger: ${colors['dark-danger']};
  }
}`;
}

function renderStyleCss(design, baseCss) {
  const tokenBlock = cssTokenBlock(design);
  return baseCss
    .replace(/:root \{[\s\S]*?@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n\}/, tokenBlock)
    .replace(/letter-spacing:\s*-[^;]+;/g, 'letter-spacing: 0;');
}

async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('._'))
    .map((entry) => entry.name)
    .sort();
}

export async function loadProject(rootDir = DEFAULT_ROOT) {
  const errors = [];
  const designRaw = await fs.readFile(path.join(rootDir, 'DESIGN.md'), 'utf8');
  const design = matter(designRaw).data;
  const wikiIndexRaw = await fs.readFile(path.join(rootDir, 'wiki/index.md'), 'utf8');
  const repos = parseWikiIndex(wikiIndexRaw);

  for (const repo of repos) {
    const repoDir = path.join(rootDir, 'wiki', repo.slug);
    const actualFiles = await listMarkdownFiles(repoDir);
    const expectedFiles = repo.pages.map((page) => path.basename(page.href)).sort();
    const actualSet = new Set(actualFiles);
    const expectedSet = new Set(expectedFiles);

    for (const expected of expectedFiles) {
      if (!actualSet.has(expected)) errors.push(`${repo.slug}: wiki/index.md references missing page file ${expected}.`);
    }
    for (const actual of actualFiles) {
      if (!expectedSet.has(actual)) errors.push(`${repo.slug}: page file ${actual} is not listed in wiki/index.md.`);
    }

    for (const page of repo.pages) {
      const pagePath = path.join(rootDir, 'wiki', page.href);
      try {
        const raw = await fs.readFile(pagePath, 'utf8');
        page.parsed = parseWikiPage(raw, {
          fileLabel: `wiki/${page.href}`,
          repo,
          page
        });
      } catch (error) {
        if (error instanceof RenderError) errors.push(...error.messages);
        else errors.push(`wiki/${page.href}: ${error.message}`);
      }
    }
  }

  if (errors.length) throw new RenderError(errors);
  return { rootDir, design, repos };
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFileStable(filePath, content) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, content, 'utf8');
}

export async function writeSite(project, outDir) {
  const rootDir = project.rootDir || DEFAULT_ROOT;
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await writeFileStable(path.join(outDir, 'index.html'), renderHomePage(project));
  for (const repo of project.repos) {
    for (const page of repo.pages) {
      await writeFileStable(path.join(outDir, repo.slug, `${page.page}.html`), renderRepoPage(repo, page));
    }
  }

  const baseCss = await fs.readFile(path.join(rootDir, 'renderer/assets/style.css'), 'utf8');
  await writeFileStable(path.join(outDir, 'assets/style.css'), renderStyleCss(project.design, baseCss));
  await fs.copyFile(
    path.join(rootDir, 'renderer/assets/search.js'),
    path.join(outDir, 'assets/search.js')
  );
  await fs.mkdir(path.join(outDir, 'assets/vendor'), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, 'renderer/assets/vendor/mermaid.min.js'),
    path.join(outDir, 'assets/vendor/mermaid.min.js')
  );
  const searchIndex = `window.REPOWIKI_SEARCH_INDEX = ${JSON.stringify(buildSearchIndex(project), null, 2)};\n`;
  await writeFileStable(path.join(outDir, 'assets/search-index.js'), searchIndex);
}

async function listFilesRecursive(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('._')) continue;
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursive(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function compareDirectories(expectedDir, actualDir) {
  const expectedFiles = await listFilesRecursive(expectedDir);
  const actualFiles = await listFilesRecursive(actualDir);
  const allFiles = uniqueStable([...expectedFiles, ...actualFiles].sort());
  const diffs = [];
  for (const file of allFiles) {
    const inExpected = expectedFiles.includes(file);
    const inActual = actualFiles.includes(file);
    if (!inExpected || !inActual) {
      diffs.push(`${file}: ${inExpected ? 'missing from committed site' : 'extra in committed site'}`);
      continue;
    }
    const [expected, actual] = await Promise.all([
      fs.readFile(path.join(expectedDir, file)),
      fs.readFile(path.join(actualDir, file))
    ]);
    if (!expected.equals(actual)) diffs.push(`${file}: content differs`);
  }
  return diffs;
}

async function replaceDirectory(sourceDir, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
}

async function runCli(args) {
  const rootDir = DEFAULT_ROOT;
  const project = await loadProject(rootDir);
  if (args.includes('--check-input')) {
    const pages = project.repos.reduce((total, repo) => total + repo.pages.length, 0);
    console.log(`Validated ${project.repos.length} repositories and ${pages} pages.`);
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repowiki-render-'));
  try {
    await writeSite(project, tempDir);
    if (args.includes('--check')) {
      const diffs = await compareDirectories(tempDir, path.join(rootDir, 'site'));
      if (diffs.length) throw new RenderError([
        'Committed site output is not deterministic with the current Markdown:',
        ...diffs.slice(0, 20),
        ...(diffs.length > 20 ? [`...and ${diffs.length - 20} more differences`] : [])
      ]);
      console.log('Committed site output matches deterministic render.');
      return;
    }
    await replaceDirectory(tempDir, path.join(rootDir, 'site'));
    console.log('Rendered site from wiki markdown.');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).catch((error) => {
    if (error instanceof RenderError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });
}
