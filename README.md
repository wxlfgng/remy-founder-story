# Remy Davenport — Founder Story (Instagram Story CTA video)

A non-Higgsfield, fully animated (Engine A) story video built to convert warm profile visitors —
7–9 figure founders who keep hopping from one media freelancer to the next — into DMs.

## The deliverable
- **`out/founder-story.mp4`** — 1080×1920 · 9:16 · 60fps · ~18.6s motion **+ 20s frozen CTA** ≈ 38.6s.
- Stills: `out/still_F1_hook.png`, `out/still_F5_answer.png`, `out/still_F7_cta.png`.
- Preview: open **`OPEN-ME.html`**.

## The narrative (7 beats, one continuous take — no hard cuts)
1. **Media guy #1. Then #2. Then #3.** — *Sound familiar?*
2. A whole year building a media team in-house — **still no end in sight.**
3. Every new hire, the brand **starts over.** Voice resets. Momentum dies.
4. You **already know** the fix. And it **isn't** another hire.
5. One specialized team that **owns it.** — Strategy · Production · Posting.
6. **Off your plate. On brand. Always on.**
7. **DM the word FOUNDER** ↓↓↓ — arrows pointing to the story reply bar · "Reply to this story 👇"

## Why it's built this way
- **One continuous timeline** (not 7 separate clips) so every beat flows into the next with an
  overlapping motion handoff over a persistent drifting amber background — zero hard cuts.
- **Motion is a pure function of t**, rendered offline frame-by-frame at 60fps → buttery by
  construction (no runtime jank possible).
- **20s freeze** on the final frame (house protocol) = reading + acting time on a story.
- CTA frame is the highest-contrast moment: glowing amber **FOUNDER** pill + animated down-chevrons
  aimed straight at the reply bar = lowest possible friction.

## How to post
1. Upload `out/founder-story.mp4` as an Instagram **Story**.
2. The keyword is **FOUNDER** — replies to the story arrive as DMs; the arrows point right at the
   reply field.
3. (Optional) Set up a DM auto-responder on the keyword "FOUNDER".

## Rebuild
```
cd _video-engine/projects/remy-founder-story
node build.mjs --check          # fast layout proof (one still per frame)
node build.mjs --fps 60 --scale 2   # full render + 20s freeze + stills
```
Edit copy/motion in `template.html` (the `ANIM[]` timeline + `WIN[]` windows), then rerun.
