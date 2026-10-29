# Reference videos — analysis

Three screen recordings the owner sent (TikTok clips filmed off a monitor). They are
**not stored in the repo** (TikTok re-uploads, ~8 MB); this file is what was learned from
them so later sessions don't need the files. Frames were pulled with ffmpeg (1–2 fps contact
sheets for the whole clip, 6–8 fps crops around each transition, scene-change scores at
4 fps) and looked at directly. Everything below was seen in those frames; where a
technique can't be told from a phone video of a screen, it is listed under *Uncertainties*.

## A. Inventory

| # | Upload name (prefix) | Length | Size / fps | What it shows |
|---|---|---|---|---|
| 1 | `be7aa8d9…mp4` | 14.9 s (site ≈ 0–11 s, then TikTok outro) | 576×1024, 30 fps | "Made with Claude Code…": a one-product site for a jar of tikka-masala paste on a laptop. Scroll-driven 3D jar, giant bold type, flat colour sections (orange → dark/magenta → mustard). |
| 2 | `9485d852…mp4` | 16.2 s (sites ≈ 0–12.2 s) | 576×1024, 30 fps | "Websites in 2026": ① ALCHE (0–4.7 s) — WebGL gallery of curved image panels in perspective, white abstract interstitial, logo built from a line grid; ② a soda-can site (4.7–12.2 s) — cans hanging in an arc over a glowing pedestal, one picked into a red studio backdrop, feature copy cycling, fog break, cans in a perspective line-up, FAQ. |
| 3 | `6ebdcfef…mp4` | 47.6 s | 576×1026, 25 fps | Vietnamese creator (subtitled). 0–6 s: a food site — a bowl of noodles with ingredients flying out of it, one colour per dish (orange Bún bò Huế → green Bún chả cá → blue Bún riêu cua → back). 6–47 s: tutorial on generating those images/videos with AI tools (Hailuo, "Nano Banana Pro"): not a design reference. |

## B. Timeline breakdown

### Video 1 — the jar (scroll-driven product site)
| t | Start | Between | End | Camera / object | Technique |
|---|---|---|---|---|---|
| 0–1 s | Hero: "BOLD FLAVOR / TIKKA MASALA", jar upright, small, below the title | page scrolls; title leaves upward | orange field, jar rising from the bottom edge | camera fixed (2D page); jar is a 3D model in a canvas pinned behind/in front of the copy | scroll-scrubbed: the jar's position/rotation are functions of scroll, not timed |
| 1–4 s | "A NEW ANGLE OF FLAVOR" | the jar tumbles (≈ 90° on X, then shows its lid), drifting right | "UNWRAP THE ADVENTURE": jar centred **in front of** giant yellow type, lid toward the viewer | object rotation coupled to scroll; no camera cut | **depth layering** — the hero overlaps the headline; the type sits on the same plane as the backdrop |
| 4–6 s | lid toward viewer | jar keeps rolling, top → side | "A NEW PERSPECTIVE ON TASTE": jar turned the other way, tilted | continuous rotation across sections; the headline changes, the jar never leaves | **shared element across sections** |
| 6 s (scene score 0.13) | orange | magenta photo block slides in from the right while the left half goes near-black | split layout: copy left, photo of a hand holding the jar right | the 3D jar hands over to a **photograph of the same jar** in the same screen spot | shared-element hand-off 3D → photo |
| 6–11 s | dark/magenta | mustard sections with photo collages; "WHY THE JAR MATTERS" with a marker strike; "LET'S GET COOKING" stacked/echoed type | newsletter + jar photo | plain scroll; text has light kinetic treatments (strike, echo) | section background colour does the scene change |

### Video 2a — ALCHE (0–4.7 s)
Curved image panels sit on a cylinder seen from inside; scrolling turns the cylinder, panels
pass with real perspective (near ones large and skewed). At ≈2 s a panel fills the frame and
dissolves into a white abstract image (≈2.7 s, score 0.32); at ≈3.2 s the logo (a triangle)
appears on black and is redrawn by a grid of fine lines. **Principle:** the transition is
a camera move *into* a panel — the panel becomes the next scene — not a cut.

### Video 2b — the soda can (4.7–12.2 s)
| t | Start | Between | End | Notes |
|---|---|---|---|---|
| 4.7–6 s | ten cans hanging in an arc, lit from a coloured pedestal below (rainbow → pink → blue glow as the selection changes) | the selected can drops toward the pedestal; the others stay | one can in front, product name on the pedestal | selection = a move of the object itself, the light in its colour |
| 6–7 s | pedestal scene | backdrop floods to deep red with a radial hot-spot behind the can; can enlarges, tilted ~15° | studio "product shot" | **colour wash + backlight** behind the hero; the room behind disappears |
| 7–10 s | product shot | the can rotates slowly; the feature copy on the left changes (title + paragraph swap with a short fade/slide, ≈0.3 s each, ~1 s apart); a vertical dot nav on the right tracks it | the can upright, back label visible | object turns continuously while UI copy steps — two rhythms |
| 10–10.5 s | product shot | the can **drops out of frame**; pink fog (volumetric clouds) rolls over; huge faded word "BULLES" behind it | fog field with cans falling through | the transition is a physical move + a medium (fog), not a fade |
| 10.5–12 s | fog | cans of every flavour in a long diagonal line-up on a floor, receding in perspective | "FOIRE AUX QUESTIONS" in big type | camera now low and oblique — a new angle on the same objects |

### Video 3 (0–6 s) — the noodle bowl
Bowl stays fixed bottom-centre the whole time. On change of dish (≈1.2 s, ≈4.5 s): the
ingredients of the current dish lift out of the bowl and swirl up in a spiral (frames at 8 fps
show ~0.6 s of rise), the background colour washes across behind them (orange → green over
≈0.4 s), the big condensed title rolls vertically (old word moves up and out while the new
one comes up from below — "BUN BO HUE" → "BUN CHA CA"), and the glass card on the right
swaps its text. New ingredients settle around the bowl. **The hero never moves; the world
and the copy change around it.**

## C. Motion principles that make them read as "premium"
1. **One hero that never leaves the frame.** The jar, the can, the bowl survive every
   section change; only backdrop, copy and angle change. The eye always has an anchor.
2. **Transitions are moves through something,** not covers: the camera goes *into* a panel
   (ALCHE), the can *falls* through fog, ingredients *rise* out of the bowl.
   None of them fades to white or to an empty page.
3. **Colour as scene.** A scene change is often just the backdrop colour washing over
   (jar sections, dish colours, the red studio). Deep, saturated, never pastel-white.
4. **Big type behind the hero.** Headlines are huge, sit on the backdrop plane, and the
   product overlaps them ("UNWRAP THE ADVENTURE", "BULLES") — depth from layering.
5. **Two rhythms.** The object moves continuously (slow rotation, drift); the copy steps
   (swap every ~1 s with a short 0.3 s ease). Continuous + discrete reads as designed.
6. **Studio product shot.** Pedestal + coloured wash + backlight + slow turn — the room
   behind drops away.
7. **Easing:** everything starts gently and lands softly (ease-in-out on moves, short
   ease-out on copy); nothing snaps. Scroll-scrubbed motion has no overshoot.

## D. How it was translated into this project
| Principle | Where | What was done |
|---|---|---|
| 1 + 2: hero survives, move *through* it | `App.tsx` `transition()`, `IntroWorld` / `RoomWorld` / `FinalWorld` `leaving`, `.iris` in `global.css` | Every change of world is one shot: the current camera **dives into its hero light** (the heart of light, the orb of memories) while the screen closes in from the edges onto that light (wine-dark iris, a soft core of the same light stays at the centre); the next world mounts and compiles under it; its camera starts **right in front of its own orb** and pulls back while the iris opens from the centre. The heart becomes the orb. Used for welcome → room, room → finale, finale → room and the resume-on-reload. The old white (`light`) and black (`dark`) full-screen veils are gone. |
| 2: no cover where the world is the same | gate → welcome, gift → memory | The gate card dissolves (existing `gate-out`) while the heart drifts up; the welcome rises in the same world — no veil. Opening a gift no longer flashes a white veil: the product shot plays and the memory sheet settles over it. |
| 4: big type behind the hero | `ShotTitle.tsx`, Gift3D product shot | The gift's name in wide Cormorant capitals (its Vietnamese line in italics between hairlines) rises in behind the gift, between the wine wash and the gift, so the gift overlaps it — fitted to the frame width. |
| 3 + 6 | (already present) Gift3D product shot | pedestal, wine wash, backlight in the gift's tint — matches 2b. |
| 5: two rhythms | room | the room turns continuously; UI copy steps (existing). |

Not copied on purpose: bold condensed sans-serif and loud flat colours (wrong voice for a
tender birthday gift — the site keeps Cormorant and wine/champagne); scroll-scrubbing
(this is a tap-and-drag 3D world, not a scroll page); fog clouds and flying ingredients
(would be "random particle effects" here).

## E. Uncertainties
- Exact easing curves and durations are estimated from 25–30 fps phone footage of a
  monitor (motion blur, rolling shutter, frame drops); ±0.1 s.
- Whether video 1's motion is scroll-scrubbed or time-based after a scroll trigger: the
  hand on the trackpad is mostly out of shot, so this can't be confirmed; the way the jar's
  pose follows the page position suggests scrubbing.
- Video 2b's fog: could be a volumetric shader, a pre-rendered video layer or stacked
  sprites — not distinguishable at this resolution.
- Video 3's flying ingredients look like pre-rendered (AI) video/images composited over a
  CSS colour background (the creator's tutorial says so), not real-time 3D.
- Audio was not analysed (TikTok music).
