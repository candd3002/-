// Captures the three.js scene frame by frame, pipes JPEG frames into ffmpeg.
// Usage: node capture3d.js <url> <out.mp4> [seconds]
const { chromium } = require('playwright');
const { spawn } = require('child_process');

(async () => {
  const [, , url, out, secArg] = process.argv;
  const FPS = 24, SECONDS = Number(secArg || 32);
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let n = 0; n < SECONDS * FPS; n++) {
    const t = n / FPS;
    await page.evaluate((tt) => window.renderFrame(tt), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
