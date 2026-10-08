// Render a page frame-by-frame (deterministic time) and encode an MP4 with ffmpeg.
// The page must define `window.__renderFrame(time, dt)` that advances its animation
// to `time`, renders, and returns a PNG data URL (the demo pages do).
//
// Usage:
//   node scripts/render-video.mjs out.mp4 "/?scene=bench" --seconds 4 --fps 30 --size 720x1280
//   node scripts/render-video.mjs out.mp4 "/examples/model.html?scene=bench"
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const out = args[0] || 'out.mp4';
let target = args[1] || '/';
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const seconds = Number(opt('seconds', 3));
const fps = Number(opt('fps', 30));
const [width, height] = opt('size', '720x1280').split('x').map(Number);
const keepFrames = args.includes('--keep-frames');

const server = await createServer({ server: { port: 5198, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const dir = await mkdtemp(join(tmpdir(), 'anime-frames-'));
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:5198${target}${target.includes('?') ? '&' : '?'}capture=1`);
  await page.waitForFunction(() => window.__ready === true && typeof window.__renderFrame === 'function', null, { timeout: 120000 });
  const total = Math.round(seconds * fps);
  for (let i = 0; i < total; i++) {
    const url = await page.evaluate(([t, dt]) => window.__renderFrame(t, dt), [i / fps, 1 / fps]);
    await writeFile(join(dir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    if (i % fps === 0) process.stdout.write(`frame ${i}/${total}\r`);
  }
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  console.log(`\nsaved ${out} (${total} frames @ ${fps}fps)` + (keepFrames ? ` frames in ${dir}` : ''));
} finally {
  await browser.close();
  await server.close();
  if (!keepFrames) await rm(dir, { recursive: true, force: true });
}
