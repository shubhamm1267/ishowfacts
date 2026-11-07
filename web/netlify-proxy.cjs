const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

const value = process.env.RENDER_API_URL;
if (!value) throw new Error('Set RENDER_API_URL in Netlify to your HTTPS Render backend URL.');
const url = new URL(value);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    !['', '/'].includes(url.pathname)) {
  throw new Error('RENDER_API_URL must be an HTTPS origin, e.g. https://your-service.onrender.com');
}
writeFileSync(join(__dirname, 'dist/paper-facts/browser/_redirects'),
  `/api/* ${url.origin}/api/:splat 200!\n/* /index.html 200\n`);
console.log('Configured Netlify API proxy and SPA fallback.');
