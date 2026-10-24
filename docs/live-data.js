(function (root) {
  'use strict';

  var REPO = 'https://raw.githubusercontent.com/kabirprokk/Osien-Stack/main';

  async function fetchJson(url, signal, cacheMode) {
    var response = await fetch(url, { signal: signal, cache: cacheMode || 'no-store' });
    if (!response.ok) throw new Error('Live source request failed');
    return response.json();
  }

  function validateSources(packageData, tools) {
    if (!packageData || packageData.name !== 'osien-tools' ||
        typeof packageData.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(packageData.version)) {
      throw new Error('Invalid MCP package metadata');
    }
    if (!Array.isArray(tools) || tools.length === 0 || !tools.every(function (tool) {
      return tool && typeof tool.name === 'string' && tool.name.trim() !== '' &&
        typeof tool.desc === 'string' && tool.desc.trim() !== '';
    })) {
      throw new Error('Invalid tool catalog');
    }
    return { version: packageData.version, tools: tools };
  }

  async function fetchSources() {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var commits = await fetchJson('https://api.github.com/repos/kabirprokk/Osien-Stack/commits?per_page=1', controller.signal, 'default')
        .catch(function () { return null; });
      var latest = Array.isArray(commits) && commits[0] && /^[a-f0-9]{40}$/i.test(commits[0].sha || '')
        ? commits[0]
        : null;
      var revision = latest ? latest.sha : 'main';
      var values = await Promise.all([
        fetchJson(REPO.replace('/main', '/' + revision) + '/mcp-server/package.json', controller.signal),
        fetchJson(REPO.replace('/main', '/' + revision) + '/mcp-server/tools.json', controller.signal),
      ]);
      var result = validateSources(values[0], values[1]);
      var date = latest && latest.commit && latest.commit.committer && latest.commit.committer.date;
      result.revision = latest ? latest.sha : null;
      result.updatedAt = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : null;
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  root.OsienLiveData = { fetchSources: fetchSources, validateSources: validateSources };
})(window);
