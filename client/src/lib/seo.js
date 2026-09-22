import { useEffect } from 'react';

// Dependency-free per-route <head> manager (no react-helmet) — small
// enough not to need one. index.html carries static defaults (title,
// description, OG/Twitter tags, canonical, JSON-LD) matching the
// homepage, for the many crawlers and link-preview bots that read the
// raw HTML and never execute JavaScript. This hook then overwrites those
// same tags on mount for whichever route actually rendered, so a
// JS-executing crawler (Googlebot) and real visitors both see accurate
// per-page title/description/canonical/robots — and so authenticated app
// pages can mark themselves noindex instead of inheriting the homepage's
// indexable default.
const SITE_URL = 'https://tinytalks.live';

function setMeta(attr, key, content) {
  if (content === undefined || content === null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(data) {
  const id = 'seo-jsonld';
  let el = document.getElementById(id);
  if (!data) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function useSeo({ title, description, path = '/', noindex = false, jsonLd = null } = {}) {
  useEffect(() => {
    if (title) document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setLink('canonical', `${SITE_URL}${path}`);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', `${SITE_URL}${path}`);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setJsonLd(jsonLd);
  }, [title, description, path, noindex, jsonLd]);
}
