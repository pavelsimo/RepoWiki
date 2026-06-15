(function () {
  function norm(value) {
    return (value || '').toLowerCase();
  }

  function score(record, query) {
    var haystack = [record.title, record.repo, record.summary]
      .concat(record.headings || [], record.sources || [], record.tags || [], record.categories || [])
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(query)) return 0;

    var total = 1;
    if (norm(record.title).includes(query)) total += 5;
    if (norm(record.repo).includes(query)) total += 3;
    return total;
  }

  function relativePrefix() {
    return /\/[^/]+\/[^/]+\.html$/.test(location.pathname) ? '../' : '';
  }

  function initSearch() {
    var input = document.getElementById('search-input');
    var box = document.getElementById('search-results');
    if (!input || !box) return;

    var records = window.REPOWIKI_SEARCH_INDEX || [];
    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();
      if (!query) {
        box.hidden = true;
        box.innerHTML = '';
        return;
      }

      var rel = relativePrefix();
      var matches = records
        .map(function (record) {
          return { record: record, score: score(record, query) };
        })
        .filter(function (item) {
          return item.score > 0;
        })
        .sort(function (a, b) {
          return b.score - a.score;
        })
        .slice(0, 8);

      box.innerHTML = matches.map(function (item) {
        var record = item.record;
        return '<a class="search-result" href="' + rel + record.url + '">' +
          '<strong>' + record.title + '</strong>' +
          '<span>' + record.repo + ' - ' + (record.summary || '') + '</span>' +
          '</a>';
      }).join('') || '<span class="search-result"><strong>No results</strong><span>Try another query.</span></span>';
      box.hidden = false;
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement !== input && !/input|textarea/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        input.focus();
      }
      if (event.key === 'Escape') box.hidden = true;
    });
  }

  function initFilters() {
    var chips = document.querySelectorAll('.filter-chip');
    var rows = document.querySelectorAll('.repo-list .repo-row');
    if (!chips.length || !rows.length) return;

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (candidate) {
          candidate.classList.remove('active');
        });
        chip.classList.add('active');

        var filter = chip.dataset.filter;
        rows.forEach(function (row) {
          var show = filter === 'all' ||
            (filter.indexOf('status:') === 0 && row.dataset.status === filter.slice(7)) ||
            (filter.indexOf('owner:') === 0 && row.dataset.owner === filter.slice(6)) ||
            (filter.indexOf('cat:') === 0 && row.dataset.cats.split('|').includes(filter.slice(4))) ||
            (filter.indexOf('tag:') === 0 && row.dataset.tags.split('|').includes(filter.slice(4)));
          row.hidden = !show;
        });
      });
    });
  }

  function initDiagrams() {
    document.querySelectorAll('.diagram-zoom').forEach(function (button) {
      button.addEventListener('click', function () {
        button.closest('.diagram-frame').classList.toggle('zoomed');
      });
    });
  }

  var diagramSources = [];

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function renderDiagrams(theme) {
    if (!window.mermaid) return;
    var blocks = document.querySelectorAll('pre.mermaid');
    if (!blocks.length) return;
    try {
      blocks.forEach(function (block, index) {
        if (diagramSources[index] !== undefined) {
          block.textContent = diagramSources[index];
          block.removeAttribute('data-processed');
        }
      });
      window.mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default'
      });
      window.mermaid.run({ nodes: blocks });
    } catch (e) {
      /* keep previous diagrams; they stay legible on the surface panel */
    }
  }

  function initMermaid() {
    var blocks = document.querySelectorAll('pre.mermaid');
    blocks.forEach(function (block, index) {
      diagramSources[index] = block.textContent;
    });
    renderDiagrams(currentTheme());
  }

  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('repowiki-theme', next); } catch (e) {}
      renderDiagrams(next);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initSearch();
    initFilters();
    initDiagrams();
    initTheme();
    initMermaid();
  });
})();
