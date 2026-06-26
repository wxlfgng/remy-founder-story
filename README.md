# Remy Davenport — Founder Story (tap-through Instagram Story)

Seven animated (Engine A, non-Higgsfield) **9:16 Story slides** built to convert warm profile visitors —
7–9 figure founders who keep hopping from one media freelancer to the next — into DMs.

Posted as **7 separate Story frames**: the viewer taps through and reads each at their own pace.

## The deliverable
- **`out/slides/01_hook.mp4` … `07_cta.mp4`** — the 7 slides to upload (1080×1920 · 60fps).
- **`out/reel.mp4`** — all 7 stitched, preview only (do not upload the reel).
- `out/slides/*.poster.png` — a still for each slide.
- Preview: open **`OPEN-ME.html`** (or the live page).

## The 7 beats
1. **Media guy #1. Then #2. Then #3.** — *Sound familiar?*
2. A whole year building a media team in-house — **still no end in sight.**
3. Every new hire, the brand **starts over.** Voice resets. Momentum dies.
4. You **already know** the fix. And it **isn't** another hire.
5. One specialized team that **owns it.** — Strategy · Production · Posting.
6. **Off your plate. On brand. Always on.**
7. **DM the word FOUNDER** ↓↓↓ — arrows pointing to the story reply bar (holds ~12s, arrows looping).

## How it's built
- Each slide is an independent beat: a **smooth animated reveal**, then it **freeze-holds** for reading
  (slides 1–6 ≈ 5s; the CTA renders live ~12s so its arrows keep marching toward the reply bar).
- Motion is a **pure function of t**, rendered offline frame-by-frame at 60fps → buttery by construction.

## How to post
1. Download all **7 slide MP4s** (01 → 07).
2. Add them to Remy's **Story** as **7 separate frames, in order.**
3. Viewers tap to advance; the last frame is the **FOUNDER** CTA with arrows at the reply bar.
4. Keyword is **FOUNDER** — story replies arrive as DMs. (Optional: keyword auto-responder.)

## Rebuild
```
cd _video-engine/projects/remy-founder-story
node build.mjs --check               # fast: one settled still per slide
node build.mjs --fps 60 --scale 1    # full render -> out/slides/*.mp4 + out/reel.mp4
```
Edit copy/motion in `template.html` (`SLIDES[]` durations + the `ANIM[]` per-beat choreography).
