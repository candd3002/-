// Captures the canvas scene frame by frame and pipes JPEG frames into ffmpeg.
// Usage: node capture.js <scene.html> <out.mp4>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const [, , scene, out] = process.argv;
  const FPS = 24, SECONDS = 32;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(scene));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const canvas = await page.$('#c');
  for (let n = 0; n < SECONDS * FPS; n++) {
    const t = n / FPS;
    await page.evaluate((tt) => window.renderFrame(tt), t);
    const buf = await canvas.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
