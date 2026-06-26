#!/usr/bin/env node
/**
 * Remy Davenport — Founder Story — TAP-THROUGH Story slides (1080×1920).
 *
 * Produces 7 STANDALONE slide videos (one per beat) to upload as separate Instagram Story frames;
 * the viewer taps to advance and reads each at their own pace. Slides 1-6 animate a smooth reveal
 * then FREEZE-HOLD for reading (house protocol, per slide); the CTA renders live so its arrows keep
 * marching toward the reply bar. Also stitches a preview reel.mp4 of the whole sequence.
 *
 * Self-contained — does NOT touch the shared engine core (locked to 1080×1350). Motion is a pure
 * function of t via window.__seekSlide(i,t); each slide screenshotted via CDP, ffmpeg-encoded.
 *
 *   node build.mjs --fps 60 --scale 1     full render -> out/slides/*.mp4 + out/reel.mp4
 *   node build.mjs --check                FAST: one settled still per slide (scale 1), no video
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
  return a;
}, []));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '../../');
const TPL = path.join(HERE, 'template.html');
const HTML = path.join(HERE, 'index.html');
const OUT = path.join(HERE, 'out');
const SLIDES_DIR = path.join(OUT, 'slides');
const CHECK = !!args.check;
const FPS = parseInt(args.fps || (CHECK ? '1' : '60'), 10);
const SCALE = parseInt(args.scale || (CHECK ? '1' : '1'), 10);
const W = 1080, H = 1920;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = spawnSync('which', ['ffmpeg']).stdout?.toString().trim() || 'ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

function assemble() {
  const fonts = readFileSync(path.join(ENGINE, 'fonts-embed.css'), 'utf8');
  writeFileSync(HTML, readFileSync(TPL, 'utf8').replace('<!--FONTS-->', fonts));
  console.log('✓ assembled index.html');
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }; return c;
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.waiters.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evalJS(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; }
}
async function launchChrome() {
  const profile = path.join(tmpdir(), 'remy-' + process.pid), port = 9400 + (process.pid % 400);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--force-color-profile=srgb', `--window-size=${W},${H}`], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 120; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const page = list.find((t) => t.type === 'page'); if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; } } catch {} await sleep(100); }
  if (!wsUrl) throw new Error('Chrome devtools endpoint never came up');
  return { proc, wsUrl, profile };
}
const enc = (a) => spawnSync(FFMPEG, a, { stdio: 'ignore' });

async function main() {
  assemble();
  const RESUME = !!args.resume;
  if (!RESUME) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(SLIDES_DIR, { recursive: true });
  const { proc, wsUrl, profile } = await launchChrome();
  try {
    const cdp = await CDP.attach(wsUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
    await cdp.send('Page.navigate', { url: 'file://' + HTML });
    for (let i = 0; i < 250; i++) { const r = await cdp.evalJS('!!window.__ready').catch(() => false); if (r) break; await sleep(100); }
    const slides = await cdp.evalJS('JSON.stringify(window.__slides)').then(JSON.parse);
    const shot = async () => (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;

    if (CHECK) {
      for (let i = 0; i < slides.length; i++) {
        await cdp.evalJS(`window.__seekSlide(${i}, 0.86)`);
        writeFileSync(path.join(OUT, `check_${slides[i].id}.png`), Buffer.from(await shot(), 'base64'));
        process.stdout.write(`·${slides[i].id}`);
      }
      console.log(`\n✓ check stills -> ${OUT}`); return;
    }

    const made = [];
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const final = path.join(SLIDES_DIR, `${s.id}.mp4`);
      if (RESUME && existsSync(final)) { console.log(`▸ ${s.id} — exists, skip`); made.push({ id: s.id, len: s.live ? s.dur : s.hold, live: !!s.live }); continue; }
      const nFrames = Math.max(2, Math.round(FPS * s.dur));
      const fdir = path.join(OUT, '_frames'); rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
      process.stdout.write(`▸ slide ${i + 1}/${slides.length} ${s.id} — ${nFrames}f`);
      for (let f = 0; f < nFrames; f++) {
        await cdp.evalJS(`window.__seekSlide(${i}, ${(f / (nFrames - 1)).toFixed(6)})`);
        writeFileSync(path.join(fdir, String(f).padStart(4, '0') + '.png'), Buffer.from(await shot(), 'base64'));
      }
      const tmp = path.join(OUT, '_tmp.mp4');
      enc(['-y', '-framerate', String(FPS), '-i', path.join(fdir, '%04d.png'), '-vf', `scale=${W}:${H}:flags=lanczos`, ...X264, tmp]);
      if (!s.live && s.hold > s.dur) {
        enc(['-y', '-i', tmp, '-vf', `tpad=stop_mode=clone:stop_duration=${(s.hold - s.dur).toFixed(2)},fps=${FPS}`, ...X264, final]);
        rmSync(tmp, { force: true });
      } else { spawnSync('mv', [tmp, final]); }
      // poster = settled last rendered frame
      enc(['-y', '-i', path.join(fdir, String(nFrames - 1).padStart(4, '0') + '.png'), '-vf', `scale=${W}:${H}:flags=lanczos`, path.join(SLIDES_DIR, `${s.id}.poster.png`)]);
      const sz = existsSync(final) ? (readFileSync(final).length / 1024 / 1024).toFixed(2) + 'MB' : 'FAIL';
      console.log(` -> ${s.id}.mp4 (${(s.live ? s.dur : s.hold)}s, ${sz})`);
      made.push({ id: s.id, len: s.live ? s.dur : s.hold, live: !!s.live });
      rmSync(fdir, { recursive: true, force: true });
    }

    // preview reel = all slides in order (re-encoded for a clean concat)
    const listFile = path.join(OUT, '_concat.txt');
    writeFileSync(listFile, made.map((m) => `file '${path.join(SLIDES_DIR, m.id + '.mp4')}'`).join('\n'));
    enc(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `scale=${W}:${H}:flags=lanczos`, ...X264, path.join(OUT, 'reel.mp4')]);
    rmSync(listFile, { force: true });

    const total = made.reduce((a, m) => a + m.len, 0);
    writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ w: W, h: H, fps: FPS, slides: made, reelSec: +total.toFixed(1) }, null, 2));
    console.log(`\n✓ ${made.length} slides + reel.mp4 (${total.toFixed(1)}s) -> ${SLIDES_DIR}`);
  } finally {
    proc.kill('SIGKILL'); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
main().catch((e) => { console.error('✗', e); process.exit(1); });
