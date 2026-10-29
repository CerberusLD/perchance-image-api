/*!
 * Perchance Image API — client SDK for the backend server (Flask + curl_cffi).
 *
 * GitHub Pages is static: it cannot run the browser automation itself.
 * This SDK talks to a server running `server.py` (local, VPS, Render, Railway, Fly...).
 *
 * Usage:
 *   PerchanceAPI.setBase("https://your-server.onrender.com");
 *   const r = await PerchanceAPI.generate("a cute cat", {style:"Cinematic"});
 *   img.src = r.dataUrl;
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'perchanceApiBase';
  var base = '';
  try { base = localStorage.getItem(STORAGE_KEY) || ''; } catch (e) {}

  function normalize(url) {
    if (!url) return '';
    return String(url).trim().replace(/\/+$/, '');
  }

  function setBase(url) {
    base = normalize(url);
    try { localStorage.setItem(STORAGE_KEY, base); } catch (e) {}
    return base;
  }

  function getBase() {
    return base;
  }

  function requireBase() {
    if (!base) {
      throw new Error('API base URL não configurada. Rode `server.py` e informe a URL (ex.: http://127.0.0.1:8000).');
    }
  }

  async function health() {
    requireBase();
    var r = await fetch(base + '/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('health HTTP ' + r.status);
    return r.json();
  }

  async function styles() {
    requireBase();
    var r = await fetch(base + '/styles', { cache: 'no-store' });
    if (!r.ok) throw new Error('styles HTTP ' + r.status);
    return r.json();
  }

  async function generate(prompt, opts) {
    opts = opts || {};
    requireBase();
    if (!prompt) throw new Error('prompt is required');

    var body = {
      prompt: prompt,
      negative_prompt: opts.negativePrompt || opts.negative_prompt || '',
      resolution: opts.resolution || '768x768',
      guidance_scale: Number(opts.guidanceScale != null ? opts.guidanceScale : (opts.guidance_scale != null ? opts.guidance_scale : 7)),
      seed: Number(opts.seed != null ? opts.seed : -1),
      style: opts.style || null,
      response_format: 'json'
    };

    var r = await fetch(base + '/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      throw new Error((data && (data.error || data.detail)) || ('HTTP ' + r.status));
    }
    if (!data || !data.ok) {
      throw new Error((data && data.error) || 'generation failed');
    }
    data.dataUrl = data.image_b64 ? ('data:image/jpeg;base64,' + data.image_b64) : null;
    return data;
  }

  async function generateBatch(prompt, opts, n) {
    n = Math.max(1, Math.min(8, parseInt(n, 10) || 1));
    var out = [];
    for (var i = 0; i < n; i++) {
      var o = Object.assign({}, opts || {});
      o.seed = Math.floor(Math.random() * 2147483647);
      out.push(await generate(prompt, o));
    }
    return out;
  }

  async function generateBlob(prompt, opts) {
    var data = await generate(prompt, opts);
    if (!data.dataUrl) throw new Error('no image');
    var res = await fetch(data.dataUrl);
    return await res.blob();
  }

  global.PerchanceAPI = {
    version: '2.0.0',
    setBase: setBase,
    getBase: getBase,
    health: health,
    styles: styles,
    generate: generate,
    generateBatch: generateBatch,
    generateBlob: generateBlob
  };
})(window);
