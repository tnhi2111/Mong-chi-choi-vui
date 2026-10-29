# Reference videos — analysis

Screen recordings the owner sent (TikTok clips filmed off a monitor): videos 1-3 in the
first batch, videos 5-6 in the second (sections F-H; the owner numbers them that way). They are
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

---

# Second batch (owner's numbering: videos 5 and 6)

Both are portrait TikTok clips filmed off a screen, in `reference/videos/` (git-ignored).
Frames: `node scripts/video-frames.mjs reference/videos --fps=2 --sheet` for the whole clip,
then cropped strips at 6 fps and 15 fps around every change of scene (an ffmpeg `crop=` into
the screen area; the strips land in `qa-output/frames/`). Brightness through each transition
was measured with numpy (mean luminance, % near-black, % near-white), so "no white/black
cover" below is a number, not an impression.

| # | File (prefix) | Length | Size / fps | What it shows |
|---|---|---|---|---|
| 5 | `v26044gc…dauclcno` | 11.7 s (site ≈ 0–9.6 s) | 576×1024, 29.16 fps | "Websites in 2026 are INSANE": ALL★STAR BURGERS — a scroll-driven one-product site. A smash burger that explodes into its layers, a combo box that closes itself, a menu, a closing statement. Dark charcoal ↔ cream sections, condensed display caps. |
| 6 | `v14044g5…dasrppno` | 36 s (site ≈ 0–31.8 s) | 576×1024, 30 fps | "The Renaissance Edition" (a commerce platform's editions site): ~12 chapters, each a classical painting turned into a stage — Sidekick, Agentic, Online, Tinker, Retail, Marketing, Checkout, Operations, Shop app, B2B, Finance, Shipping, Developer. |

## F. Video 5 (burger, scroll)

### F.1 Timeline (absolute seconds, from the 6 fps and 15 fps strips)

| t | What is on screen | What changes | Technique |
|---|---|---|---|
| 0.00–0.80 | Hero: one assembled burger on a white paper square, dark charcoal stage, soft contact shadow. Display caps "BUILT LIKE AN ALL-STAR." at the left, **behind** the burger | the page begins to move; the hero stays dead centre | hero anchored; type is a layer *behind* the object |
| 0.80–1.73 | the burger lifts off the paper and **separates into its layers** (bun, bacon, cheese, patty, base) | the gaps grow continuously with the scroll; "SMASHED TO ORDER" sits mid-layer at the right, partly covered by the burger | scroll-scrubbed exploded view; occlusion = depth |
| **1.73–2.07** | same burger, same position | **the background washes dark → cream in ~0.34 s** (measured mean luminance 76 → 133, monotonic, no spike). The light field arrives as a moving edge; the hero does not move at all | *colour wash as the scene change*. Near-white share stays at 0.3 %, near-black at 1.6 % → **no cover frame** |
| 2.07–2.33 | cream section | thin leader lines + ingredient labels fade in at the right; "THE STACK" rises from the bottom behind the burger (vertical mask reveal, ~0.2 s) | the copy **lags the wash by ~250 ms** — two rhythms |
| 2.33–3.00 | the layers close back | the burger reassembles and shrinks; fries and a shake slide in beside it | reversible scrub |
| 3.00–4.30 | a combo box on a dark stage, "GAME DAY COMBO" behind it | the camera **orbits the box** (a new angle every 0.17 s, ≈45° in 1.3 s) while the box stays centred | turntable driven by scroll, not a cut |
| **4.30–4.80** | the open box | the **lid closes over the food** (~0.35 s) and the closed box front (the logo) becomes the next plate | the transition is a *physical move of the object*, never a dissolve |
| 4.80–5.50 | the closed box, centred, dark | it settles; "OVERTIME SHAKES" behind it | breathing room before the next move |
| **5.50–6.10** | a cream panel rises from the bottom edge | the panel **pushes the box up out of frame**; "THE LINEUP." rides the panel and lands ~0.3 s after the panel edge passes the middle | a new section as a physical push, with the type lagging |
| 6.10–7.40 | menu grid, 3 cards | the names in condensed caps reveal under a vertical mask, **staggered ≈0.12 s left → right**; body copy and price fade ~0.15 s after each name | stagger with overlap |
| 7.40–9.00 | second row (fries, shakes) | same grammar | repetition = rhythm |
| 9.00–9.60 | closing: "GAME-DAY ENERGY BUILT CLEAN" over a faint repeating "SMASH • SAUCE • SM…" band | the paragraph fades in at the right | type as texture in the back layer |

### F.2 What makes it read as expensive
1. **One object carries the whole page.** Burger → exploded burger → burger → combo box → closed box. Each section is a new *state of the same thing*, so there is never a cut.
2. **The background changes, the hero does not.** The dark → cream wash happens underneath a motionless hero (0.34 s). Because the anchor never moves, the eye reads "same world, new light", not "new page".
3. **Type always sits between the hero and the backdrop** — the burger overlaps "SMASHED TO ORDER", the box overlaps "OVERTIME SHAKES". That one occlusion does more for depth than any shadow.
4. **Transitions are mechanical:** a lid closes, a panel pushes. Nothing fades.
5. **Lag everywhere:** the copy arrives 0.25–0.3 s after the move it belongs to; columns stagger 0.12 s. Nothing lands at the same moment as anything else.

### F.3 Uncertainties (video 5)
- The dark → cream change: in the 15 fps frames the light field appears as a moving edge from the right, but motion blur makes it impossible to say whether it is a wipe mask, a panel sliding out, or a scroll-pinned section with its own background. Duration ±0.07 s.
- Whether the combo-box turntable is a 3D model, an image sequence or a short video: at this resolution the edges and the specular on the box look like a rendered sequence, but it cannot be proven.
- Easing curves are not measurable from 29 fps phone footage of a screen; every "~0.3 s" carries ±0.1 s.
- The burger explosion is almost certainly scroll-scrubbed (it reverses when the hand scrolls back at ~2.4 s), but the hand is only partly in shot.

## G. Video 6 (classical painting, scroll)

### G.1 Timeline (absolute seconds, from the 4 fps whole-clip strips + a 15 fps strip over the first change)

| t | What is on screen | What changes | Technique |
|---|---|---|---|
| 0.0–1.0 | a painted landscape seen through a soft **oval aperture**, the caption "The Renaissance Edition" in a thin ruled box | the aperture opens outward as the page starts | enter *through* a shape, not out of black |
| 1.0–3.4 | wide painted sky: two figures riding clouds (one on a skateboard, a pink bag) | a slow continuous drift; the cloud foreground moves faster than the tree line | **parallax inside a painting** = 3 depth planes |
| **3.50** | the same scene | a **point of light seeds** between the two figures | anticipation — the change announces itself at one point |
| **3.63–3.90** | the seed bursts into a **cloud of glitter that eats the painting outward** (≈60 % of the frame by 3.90); the next scene's deep blue shows through the holes | | the transition **is a material of this world** (star dust) and it *carries the destination's colour inside it* |
| 3.90–4.30 | the dust front finishes; the night-sky "Sidekick" scene resolves out of a bright core | "Sidekick" rises bottom-left, **≈550 ms after the seed** | the type lags the world change |
| | *measured over 3.30–4.43 s: mean luminance stays within 79–106 (±15 %), near-white peaks at 6.1 % on the seed flash, near-black never passes 7.4 %* | | **no white-out and no black-out on any frame** |
| 4.30–5.20 | the new figure types on a laptop, UI cards float around | the camera pushes in slowly | a continuous camera under discrete UI |
| 5.25–6.00 | a **bank of white cloud rises** from the bottom and becomes the white product section | | the next section is made of the material the figure was sitting on |
| 6.10–6.50 | the white section is pulled away upward by a dark painted interior with a **ragged, painted edge** | | organic mask edges read as material; a straight edge would read as UI |
| 6.50–7.50 | "Agentic": the camera **dollies into** the painted room; the word grows and drifts with the move | the figure stays anchored at the left | dolly + parallax; the word is a mid-layer object, not an overlay |
| 7.75–8.75 | a painted hand holds up a phone; its screen **grows into the next section's panel** | | a prop becomes the portal |
| 9.0–10.0 | "Online": a figure paints on a canvas; the canvas *is* a browser window, a red curtain frames it | | the UI lives inside the painting's logic |
| 10.25–11.30 | "Introducing Tinker": a charcoal-sketch world, a white panel, a photographed hand with a phone | | three media (paint / sketch / photo) on one stage |
| 11.50–13.30 | "Retail": the camera **dollies forward through an arcade of columns**; a 3D POS device turns slowly mid-frame; "Retail" sits behind the device | the device is lit differently from the painting (real 3D over a painted plate) | depth by moving *through* architecture |
| 13.50–14.50 | a counter with devices | the camera pulls back, then **tilts up** | one continuous camera links two chapters |
| 14.50–16.00 | up through the architecture to a painted **dome and its oculus**; a card reader tumbles slowly through the air | out through the oculus into a sky with doves | the ceiling is the door to the next chapter |
| 16.25–17.00 | UI panels fly over the dome, then a new landscape arrives from below | | the panels are the connective tissue between paintings |
| 17.00–18.00 | "Marketing": a painted landscape with a billboard; the word sits behind the billboard and the tree | | mid-layer type again |
| 18.00–19.20 | UI panels stack over the landscape, then slide away | | |
| 19.25–20.30 | "Checkout": a portrait holds a pink card; the word is **occluded by her shoulder** | | |
| 20.50–21.80 | product UI over a dark floral painting | the panels rise | |
| 21.90–23.00 | "Operations": a group portrait around a glowing globe | | the glow is the only light that is not painted |
| 23–31.8 | "Shop app", "B2B", "Finance" (coins falling, a phone held up), "Shipping" (a cheetah on a table), "Developer" (sepia sketch) | the same grammar every time | one rule, repeated — that is what makes it feel designed |

### G.2 The grammar of every chapter
1. a painted stage (background) → 2. one hero (figure or product) → 3. the chapter word in the **middle layer, partly occluded** → 4. UI panels rise over the painting and leave again → 5. the next stage arrives through a **material** (dust, cloud, a torn edge, a prop that grows, a camera tilt) — never a fade.

### G.3 Uncertainties (video 6)
- Whether the paintings are video layers, image planes in WebGL or stacked sprites cannot be told from the footage; the parallax between cloud and tree line is only a few pixels on a filmed monitor.
- The glitter burst could equally be a GPU particle system or a pre-rendered alpha video. Its *timing* (seed 0.15 s → spread 0.4 s → settle 0.3 s) is measurable; its implementation is not.
- The footage is handheld, so a little camera drift is mixed into every parallax reading. "The camera pushes in" was only recorded where the perspective of straight architecture changes, which handshake cannot fake.
- Section boundaries are given to ±0.15 s (30 fps, motion blur, screen glare).
- No audio analysis (TikTok music over it).

## H. What these two change for this project

Both agree with sections C/D above and sharpen three things:

1. **A dust front beats a CSS iris.** Video 6's change of chapter is a *material* that eats
   the old scene and carries the new scene's colour inside it; our `.iris` is a CSS shape
   closing over the world — the right idea, but the shape belongs to the browser, not to the
   world. A particle front (star dust) expanding from the hero's core during `leaving`, in
   the destination's tint, puts the transition back inside the world.
2. **Occlusion is the cheapest depth.** Every chapter word in video 6 and every headline in
   video 5 is partly covered by the hero. `ShotTitle` already sits behind the gift; the same
   rule should hold wherever big type meets the hero.
3. **Nothing lands together.** 0.25–0.3 s between a move and its copy, 0.12 s between
   columns — measured, not guessed.

Measurable gate taken from the references (both clips pass it): through any change of world,
**no frame may be more than 35 % near-white or 60 % near-black, and the mean luminance must
stay inside a ±40 % band** around the darker of the two end states. `scripts/frame-stats.py`
already prints exactly those three numbers.
