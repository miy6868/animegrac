// Headless render helper: starts Vite, opens a page in Chromium (SwiftShader WebGL),
// waits for `window.__ready`, and writes a PNG.
// Usage: node scripts/screenshot.mjs [out.png] [url-path-and-query] [width] [height]
//   e.g.  node scripts/screenshot.mjs shot.png "/?preset=sunsetCoral" 736 1308
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] || 'screenshot.png';
let target = process.argv[3] || '/';
if (!target.startsWith('/')) target = '/?' + target;
const width = Number(process.argv[4] || 736);
const height = Number(process.argv[5] || 1308);

const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:5199${target}${target.includes('?') ? '&' : '?'}capture=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.screenshot({ path: out });
  console.log('saved', out);
} finally {
  await browser.close();
  await server.close();
}
