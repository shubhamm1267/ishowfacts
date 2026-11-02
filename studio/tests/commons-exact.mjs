/** Manual shot-replacement QA helper for one precisely identified Commons file.
 * Usage: node studio/tests/commons-exact.mjs 'File:Popcorn (1).jpg' /tmp/popped.jpg
 * Enforces the same free license, image MIME and official CDN checks as production.
 */
import { writeFile } from 'node:fs/promises';
import { api, licenseInfo } from '../lib/core.mjs';

const [title, dest] = process.argv.slice(2);
if (!/^File:[^/]{5,220}\.(?:jpe?g|png)$/i.test(title || '') || !dest) throw Error('Usage: commons-exact.mjs File:<exact filename.jpg> /tmp/output.jpg');
const u = new URL('https://commons.wikimedia.org/w/api.php');
Object.entries({ action: 'query', prop: 'imageinfo', titles: title,
  iiprop: 'url|extmetadata|size|mime', iiurlwidth: '850', format: 'json' })
  .forEach(([k, v]) => u.searchParams.set(k, v));
const result = await (await api(u)).json();
const file = Object.values(result.query?.pages || {})[0];
const info = file?.imageinfo?.[0];
const credit = licenseInfo(info?.extmetadata);
const url = info?.thumburl || info?.url;
if (!credit.allowed) throw Error(`Rejected incompatible image license: ${credit.license || 'unknown'}`);
if (!['image/jpeg', 'image/png'].includes(info?.mime)) throw Error('Only JPEG/PNG image supported');
if (!url || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(new URL(url).hostname)) throw Error('Unexpected Commons CDN');
const downloaded = await api(url);
if (!['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(new URL(downloaded.url).hostname)) throw Error('CDN redirected');
const data = Buffer.from(await downloaded.arrayBuffer());
if (data.length < 1000 || data.length > 8_000_000) throw Error('Image too large/small');
await writeFile(dest, data);
console.log(JSON.stringify({ file: dest, title, source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`, ...credit }));
