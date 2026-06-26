#!/usr/bin/env node
/**
 * Remy Davenport — Founder Story (CTA) — story-format build (1080×1920).
 *
 * Self-contained (does NOT modify the shared engine core, which is locked to 1080×1350).
 * Reuses the proven Engine-A approach: motion is a pure function of progress t, driven via
 * window.__seekSlide(0,t); each frame screenshotted via CDP, ffmpeg-encoded, then the FINAL
 * frame is frozen for exactly 20s (house protocol).
 *
 * Modes:
 *   node build.mjs                       full render (60fps, retina 2x) -> founder-story.mp4 + stills
 *   node build.mjs --fps 60 --scale 2    override
 *   node build.mjs --check               FAST layout proof: one settled still per frame (scale 1), no video
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
  return a;
}, []));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '../../');                 // _video-engine/
const TPL = path.join(HERE, 'template.html');
const HTML = path.join(HERE, 'index.html');                  // assembled (fonts inlined)
const OUT = path.join(HERE, 'out');
const CHECK = !!args.check;
const FPS = parseInt(args.fps || (CHECK ? '1' : '60'), 10);
const SCALE = parseInt(args.scale || (CHECK ? '1' : '2'), 10);
const HOLD = parseFloat(args.hold || '20');                  // freeze seconds on final frame
const W = 1080, H = 1920;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = spawnSync('which', ['ffmpeg']).stdout?.toString().trim() || 'ffmpeg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- assemble: inline fonts-embed.css into the <!--FONTS--> marker ----
function assemble() {
  const fonts = readFileSync(path.join(ENGINE, 'fonts-embed.css'), 'utf8');
  const html = readFileSync(TPL, 'utf8').replace('<!--FONTS-->', fonts);
  writeFileSync(HTML, html);
  console.log(`✓ assembled ${(html.length / 1024).toFixed(0)}KB -> index.html`);
}

// ---- minimal CDP client over the built-in WebSocket ----
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.waiters.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}
async function launchChrome() {
  const profile = path.join(tmpdir(), 'remy-' + process.pid);
  const port = 9400 + (process.pid % 400);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--force-color-profile=srgb', `--window-size=${W},${H}`], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 120; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; } } catch {}
    await sleep(100);
  }
  if (!wsUrl) throw new Error('Chrome devtools endpoint never came up');
  return { proc, wsUrl, profile };
}
function enc(a) { return spawnSync(FFMPEG, a, { stdio: 'ignore' }); }

async function main() {
  assemble();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const { proc, wsUrl, profile } = await launchChrome();
  try {
    const cdp = await CDP.attach(wsUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
    await cdp.send('Page.navigate', { url: 'file://' + HTML });
    for (let i = 0; i < 250; i++) { const r = await cdp.evalJS('!!window.__ready').catch(() => false); if (r) break; await sleep(100); }
    const slides = await cdp.evalJS('JSON.stringify(window.__slides)').then(JSON.parse);
    const dur = slides[0].dur;
    const shot = async (t) => (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;

    if (CHECK) {
      // one settled still per frame window (mid-reveal, pre-exit)
      const TS = [2.0, 4.5, 7.0, 9.5, 12.0, 14.4, 18.2];
      for (let k = 0; k < TS.length; k++) {
        await cdp.evalJS(`window.__seekSlide(0, ${(TS[k] / dur).toFixed(5)})`);
        const data = await shot();
        writeFileSync(path.join(OUT, `check_F${k + 1}.png`), Buffer.from(data, 'base64'));
        process.stdout.write(`·F${k + 1}`);
      }
      console.log(`\n✓ check stills -> ${OUT}`);
      return;
    }

    // ---- full render ----
    const framesDir = path.join(OUT, '_frames'); mkdirSync(framesDir, { recursive: true });
    const nFrames = Math.round(FPS * dur);
    console.log(`▸ rendering ${nFrames} frames @ ${FPS}fps retina ${SCALE}x (${dur}s motion)`);
    const t0 = Date.now();
    for (let f = 0; f < nFrames; f++) {
      const t = f / (nFrames - 1);
      await cdp.evalJS(`window.__seekSlide(0, ${t.toFixed(6)})`);
      const data = await shot();
      writeFileSync(path.join(framesDir, String(f).padStart(4, '0') + '.png'), Buffer.from(data, 'base64'));
      if (f % 60 === 0) process.stdout.write(`  ${f}/${nFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
    }
    const motion = path.join(OUT, '_motion.mp4');
    const finalMp4 = path.join(OUT, 'founder-story.mp4');
    console.log('  encoding motion…');
    enc(['-y', '-framerate', String(FPS), '-i', path.join(framesDir, '%04d.png'),
      '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', motion]);
    console.log(`  freezing final frame +${HOLD}s…`);
    enc(['-y', '-i', motion, '-vf', `tpad=stop_mode=clone:stop_duration=${HOLD},fps=${FPS}`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalMp4]);
    // stills from the final mp4: F1 / F5 / the held CTA
    const stills = [['still_F1_hook.png', '1.6'], ['still_F5_answer.png', '12.0'], ['still_F7_cta.png', String((dur + 1).toFixed(1))]];
    for (const [name, ts] of stills) enc(['-y', '-ss', ts, '-i', finalMp4, '-frames:v', '1', path.join(OUT, name)]);
    rmSync(framesDir, { recursive: true, force: true });

    // probe final
    const probe = spawnSync(FFMPEG.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1', finalMp4]).stdout?.toString().trim();
    const sz = existsSync(finalMp4) ? (readFileSync(finalMp4).length / 1024 / 1024).toFixed(1) + 'MB' : 'FAIL';
    writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ w: W, h: H, fps: FPS, motionSec: dur, holdSec: HOLD, file: 'founder-story.mp4' }, null, 2));
    console.log(`\n✓ founder-story.mp4 (${sz})\n${probe}`);
  } finally {
    proc.kill('SIGKILL');
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
main().catch((e) => { console.error('✗', e); process.exit(1); });
