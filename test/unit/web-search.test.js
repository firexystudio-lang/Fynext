'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const web = require('../../src/tools/web');

test('DuckDuckGo result parsing handles reordered attributes and decodes redirect URLs once', async () => {
  const originalFetch = global.fetch;
  const html = [
    '<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnews%3Fvalue%3D1%2525" class="result__a">Useful &amp; current result</a>',
    '<a class="result__snippet" href="#">A short summary</a>'
  ].join('');
  global.fetch = async () => new Response(html, { status: 200 });

  try {
    const results = await web.webSearch(
      { searchProvider: 'duckduckgo' },
      'example query',
      6,
      1
    );
    assert.deepEqual(results, [{
      title: 'Useful & current result',
      url: 'https://example.com/news?value=1%25',
      snippet: 'A short summary'
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('DuckDuckGo Lite is used when the primary search endpoint fails', async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) return new Response('', { status: 503 });
    return new Response(
      '<a href="https://example.org/result" class="result-link">Fallback result</a>',
      { status: 200 }
    );
  };

  try {
    const results = await web.webSearch(
      { searchProvider: 'duckduckgo' },
      'fallback query',
      4,
      1
    );
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[1], /^https:\/\/lite\.duckduckgo\.com\//);
    assert.deepEqual(results, [{
      title: 'Fallback result',
      url: 'https://example.org/result',
      snippet: ''
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('web fetch reports non-success HTTP responses as errors', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('Forbidden', { status: 403 });

  try {
    await assert.rejects(
      web.webFetch({}, 'https://example.org/private', 100, 1),
      /HTTP 403/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
