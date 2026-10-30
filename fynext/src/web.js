'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&#(\d+);/g, (m, n) => {
      try { return String.fromCodePoint(Number(n)); } catch (_) { return m; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch (_) { return m; }
    });
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractDdgUrl(href) {
  try {
    let h = href;
    if (h.startsWith('//')) h = 'https:' + h;
    const u = new URL(h);
    if (u.hostname.endsWith('duckduckgo.com') && u.searchParams.get('uddg')) {
      return decodeURIComponent(u.searchParams.get('uddg'));
    }
    return h;
  } catch (_) {
    return href;
  }
}

function timeoutSignal(sec) {
  const s = Number(sec) > 0 ? Number(sec) : 30;
  return AbortSignal.timeout(s * 1000);
}

const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'tr,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
};

async function ddgSearch(query, max, timeoutSec) {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: HEADERS, signal: timeoutSignal(timeoutSec) });
  if (!res.ok) throw new Error('DuckDuckGo HTTP ' + res.status);
  const html = await res.text();

  const titles = [];
  const titleRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = titleRe.exec(html)) !== null) {
    titles.push({ url: extractDdgUrl(m[1]), title: stripTags(m[2]) });
  }

  const snippets = [];
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = snipRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]));
  }

  let results = titles.map((t, i) => ({
    title: t.title,
    url: t.url,
    snippet: snippets[i] || ''
  }));

  if (results.length === 0) {
    results = await ddgLite(query, max, timeoutSec);
  }
  return results.filter((r) => r.url && /^https?:/i.test(r.url)).slice(0, max);
}

async function ddgLite(query, max, timeoutSec) {
  const url = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: HEADERS, signal: timeoutSignal(timeoutSec) });
  if (!res.ok) throw new Error('DuckDuckGo Lite HTTP ' + res.status);
  const html = await res.text();
  const out = [];
  const re = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < max) {
    out.push({ title: stripTags(m[2]), url: extractDdgUrl(m[1]), snippet: '' });
  }
  return out;
}

async function searxngSearch(query, max, timeoutSec, base) {
  if (!base) throw new Error('SearXNG icin searxngUrl gerekli');
  const url = base.replace(/\/$/, '') + '/search?format=json&q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: timeoutSignal(timeoutSec) });
  if (!res.ok) throw new Error('SearXNG HTTP ' + res.status);
  const data = await res.json();
  return (data.results || []).slice(0, max).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || ''
  }));
}

async function webSearch(cfg, query, max, timeoutSec) {
  const provider = (cfg.searchProvider || 'duckduckgo').toLowerCase();
  if (provider === 'searxng') return searxngSearch(query, max, timeoutSec, cfg.searxngUrl);
  return ddgSearch(query, max, timeoutSec);
}

async function webFetch(cfg, url, maxChars, timeoutSec) {
  let target = url;
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  const res = await fetch(target, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Accept-Language': 'tr,en;q=0.8' },
    signal: timeoutSignal(timeoutSec)
  });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();
  let text = ct.includes('html') || raw.trimStart().startsWith('<') ? htmlToText(raw) : raw;
  const limit = maxChars > 0 ? maxChars : cfg.maxOutputChars;
  let truncated = false;
  if (text.length > limit) {
    text = text.slice(0, limit);
    truncated = true;
  }
  return { finalUrl: res.url, status: res.status, contentType: ct, text, truncated };
}

module.exports = { htmlToText, stripTags, decodeEntities, webSearch, webFetch };
