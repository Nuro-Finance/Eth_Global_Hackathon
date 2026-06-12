#!/usr/bin/env node
/**
 * Image generation tool — multi-provider with auto-fallback.
 *
 * Usage:
 *   node scripts/generate-image.js \
 *     --prompt "neural network brain in profile, glowing fibers, teal and gold and red, dark background, generative art, ultra detailed" \
 *     --out public/architecture/brain-bg.png \
 *     --size 1792x1024 \
 *     --model openai
 *
 * Provider priority (uses first one with creds in env):
 *   1. openai       — DALL-E 3. Needs OPENAI_API_KEY. Best for branded/clean art.
 *   2. replicate    — Flux schnell or SDXL. Needs REPLICATE_API_TOKEN. Best for stylized/painterly.
 *   3. stability    — Stable Diffusion 3. Needs STABILITY_API_KEY.
 *   4. fal          — Flux dev / pro. Needs FAL_KEY.
 *
 * The first provider with valid env wins unless --model selects a specific one.
 *
 * Add the relevant key to ~/Nuro-Finance/.env on the VPS or to your local .env.
 * Recommended: REPLICATE_API_TOKEN (cheap, fast, good for art) or
 * OPENAI_API_KEY (most reliable, slightly more expensive per image).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env if present
try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) { /* dotenv optional */ }

// ── Argument parsing ────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : 'true';
    args[k] = v;
    if (v !== 'true') i++;
  }
}

if (!args.prompt) {
  console.error('Missing --prompt. Example:');
  console.error('  node scripts/generate-image.js --prompt "..." --out path/to/file.png');
  process.exit(2);
}
if (!args.out) {
  console.error('Missing --out (output file path)');
  process.exit(2);
}

const prompt = args.prompt;
const outPath = path.resolve(args.out);
const size = args.size || '1792x1024';
const requested = args.model || null;

// ── Provider implementations ────────────────────────────────────────────

async function fetchBuffer(url, opts = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location, opts).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' fetching ' + url));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + raw.slice(0, 500)));
        }
        try { resolve(JSON.parse(raw)); }
        catch (e) { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const providers = {
  openai: {
    detect: () => !!process.env.OPENAI_API_KEY,
    name: 'OpenAI DALL-E 3',
    async generate() {
      const r = await postJson('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: size === '1792x1024' || size === '1024x1024' || size === '1024x1792' ? size : '1792x1024',
        quality: 'hd',
        response_format: 'url',
      }, {
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
      });
      const url = r.data?.[0]?.url;
      if (!url) throw new Error('OpenAI returned no image URL: ' + JSON.stringify(r).slice(0, 300));
      return await fetchBuffer(url);
    },
  },
  replicate: {
    detect: () => !!process.env.REPLICATE_API_TOKEN,
    name: 'Replicate Flux Schnell',
    async generate() {
      // Use Flux Schnell — fast + cheap + great for art
      const create = await postJson('https://api.replicate.com/v1/predictions', {
        version: 'black-forest-labs/flux-schnell',
        input: {
          prompt,
          aspect_ratio: '16:9',
          num_outputs: 1,
          output_format: 'png',
          output_quality: 95,
        },
      }, {
        Authorization: 'Bearer ' + process.env.REPLICATE_API_TOKEN,
        Prefer: 'wait',
      });
      const out = create.output?.[0] || create.urls?.get;
      if (!out) throw new Error('Replicate returned no output: ' + JSON.stringify(create).slice(0, 300));
      // If `out` is a URL, fetch it. If it's a stream URL, poll status.
      if (typeof out === 'string' && out.startsWith('http')) {
        return await fetchBuffer(out);
      }
      throw new Error('Unexpected Replicate response shape');
    },
  },
  stability: {
    detect: () => !!process.env.STABILITY_API_KEY,
    name: 'Stability AI SD3',
    async generate() {
      const r = await postJson('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
        prompt, model: 'sd3-large', output_format: 'png',
        aspect_ratio: '16:9',
      }, {
        Authorization: 'Bearer ' + process.env.STABILITY_API_KEY,
        Accept: 'image/*',
      });
      // Stability returns base64 in `image` or raw bytes in body — handle both
      if (typeof r === 'object' && r.image) return Buffer.from(r.image, 'base64');
      throw new Error('Stability response unhandled: ' + String(r).slice(0, 200));
    },
  },
  fal: {
    detect: () => !!process.env.FAL_KEY,
    name: 'Fal.ai Flux',
    async generate() {
      const r = await postJson('https://fal.run/fal-ai/flux/dev', {
        prompt, image_size: 'landscape_16_9',
        num_inference_steps: 28, num_images: 1,
      }, {
        Authorization: 'Key ' + process.env.FAL_KEY,
      });
      const url = r.images?.[0]?.url;
      if (!url) throw new Error('Fal returned no image URL: ' + JSON.stringify(r).slice(0, 300));
      return await fetchBuffer(url);
    },
  },
};

// ── Main ────────────────────────────────────────────────────────────────
(async () => {
  const order = requested
    ? [requested].filter(p => providers[p])
    : ['openai', 'replicate', 'stability', 'fal'];

  let usedProvider = null;
  let buffer = null;
  const errors = [];

  for (const name of order) {
    const p = providers[name];
    if (!p) { errors.push(name + ': unknown provider'); continue; }
    if (!p.detect()) { errors.push(name + ': no API key in env'); continue; }
    try {
      console.log('[image-gen] using ' + p.name + '…');
      buffer = await p.generate();
      usedProvider = name;
      break;
    } catch (e) {
      errors.push(name + ': ' + (e.message || e).slice(0, 200));
      console.warn('[image-gen] ' + name + ' failed: ' + (e.message || e).slice(0, 200));
    }
  }

  if (!buffer) {
    console.error('[image-gen] All providers failed:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\nSet ONE of these env vars:');
    console.error('  OPENAI_API_KEY=sk-...        (DALL-E 3)');
    console.error('  REPLICATE_API_TOKEN=r8_...   (Flux Schnell — recommended for art)');
    console.error('  STABILITY_API_KEY=sk-...     (Stable Diffusion 3)');
    console.error('  FAL_KEY=...                  (Fal.ai Flux)');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log('[image-gen] ✓ ' + (buffer.length / 1024).toFixed(1) + ' KB → ' + outPath + '  (provider: ' + usedProvider + ')');
})();
