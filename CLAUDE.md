# Handoff for Claude Code — Mong-chi-choi-vui

A birthday gift website: an interactive 3D love story (Vite + React + TypeScript +
React Three Fiber). The owner (writes in Vietnamese — **reply in Vietnamese**) is making
it for their wife. Live at **https://tnhi2111.github.io/Mong-chi-choi-vui/**.

## Working agreement (from the owner)

- **Every push to `main` deploys to GitHub Pages** (~1 min, `.github/workflows/deploy.yml`).
  The owner has been asking for work to be committed and pushed straight to `main`
  once it is tested. There are no feature branches.
- Don't stop at "it compiles": build, open it in a browser, look at screenshots,
  compare with the reference images the owner sends, fix, re-test.
- Content (names, birthday password, letter, photos) is still placeholder text —
  don't invent it; the owner will provide it. Password is `01/01/2000` for now.

## The story (what the viewer sees)

1. **Intro** — no heart yet: light swirling in a flat ring (6 concentric bands) under
   where the heart will be, a few points wandering, dim starry sky.
2. **First touch** — the points rise on spirals into a 3D **heart of light**
   (~3.2 s) with a "gathering light" sound; the sky brightens; background points light
   up; a **golden retriever puppy of light** assembles beside the heart (waving a paw,
   wagging tail). The ring under the heart goes dark and is **redrawn band by band**
   like comets, smallest first (~8 s), then its words return. Afterwards it only spins.
3. Two more touches → heartbeats → **password gate** → welcome → **gift room**
   (5 gifts on a ring, 3D, each opens a memory page) → finale.
- **Dragging anywhere turns the camera around the whole scene** (intro, room, finale);
  left alone, the world slowly turns by itself. The owner explicitly wants this 360°
  "whole world moves together" behaviour everywhere.
- Progress lives in `sessionStorage` (30 min cap): reload keeps her place, closing the
  tab starts over. `?reset` restarts, `?quality=low|medium|high`, `?nogl` (2D fallback),
  `?debug` exposes `window.__gl` / `window.__scene` for QA scripts.

## Where things are

| What | File |
| --- | --- |
| Texts, password, heart style/words, sound, music | `src/config/birthday.ts` |
| Gifts / memories | `src/data/gifts.ts` |
| Stage flow, taps, sound triggers | `src/App.tsx` |
| One canvas, lights, per-stage worlds | `src/components/3d/Scene3D.tsx` |
| Intro scene (heart, ring, puppy, camera orbit) | `src/components/3d/IntroWorld.tsx` |
| Heart of light (dormant ring → gathered heart, surface flow) | `src/components/3d/ParticleHeart.tsx` |
| Heart wrapper (beat, hover, assembly clock) | `src/components/3d/Heart3D.tsx` |
| Ring under the heart (bands, reveal, drip, words) | `src/components/3d/HeartVortex.tsx` |
| **Puppy shape** (SDF shapes, ears, face, bib, paws, tail) | `src/components/3d/dogModel.ts` |
| Puppy rendering/animation (wave, wag, occluder body) | `src/components/3d/LightDog.tsx` |
| Camera rig (springs, orbit) / drag input | `CameraRig.tsx`, `src/hooks/usePointerOrbit.ts` |
| Gift room / gifts / finale | `RoomWorld.tsx`, `Gift3D.tsx`, `FinalWorld.tsx` |
| Sky, stars, bokeh, shooting star | `Atmosphere.tsx` |
| Synth sound (chimes, hover, gather, thump) | `src/lib/audio.ts` |

**Gotcha:** React Three Fiber v9 copies `uniforms` passed as a JSX prop, so animated
custom shaders must be built with `useShader()` (`src/components/3d/useShader.ts`) —
never `<shaderMaterial uniforms={…} />`.

## Gift room set (RoomSet.tsx) — birthday theme

The owner said: **birthday theme for a lover, NOT Christmas** (an earlier Christmas tree /
baubles pass was removed). `src/components/3d/RoomSet.tsx` dresses the gift room:
wooden floor + round rug (shader, candle pools, heart glow, moonlight), round wall with an
arched window onto a starry night, fairy-light garland, HAPPY BIRTHDAY bunting, candle
clusters (flicker shared by flames and the light they throw), a two-tier birthday cake on a
table (tap → candles blown out with smoke + `sound.blow()`, relit after ~4 s), round and
heart balloons on ribbons (bob; tap → bounce + chime), and a secret glowing letter by the
cake table (`birthdayConfig.room.secret`, placeholder text). All unlit custom shaders (no
extra lights). The set is compiled with `gl.compileAsync` before it is shown, so
entering the room stays ~130 ms (`qa:perf`).

Living details (next pass): a shared `hand` (pointer ray + "wind" of its sideways speed,
mouse only) — flames lean with it and flare, balloons are pushed aside by it, dust motes
(`Dust`, only visible where they drift through candle/moon light) part around it. Candles
are one merged mesh each (`candleGeometry`: sagging melted rim, a drip, a charred wick;
wax tint varies per candle, slight lean); contact shadows under candles/cake table and at
the foot of the wall. Beyond the window: a distant city whose windows switch on and off;
**secret** — touching the window lights one far window pink, a little heart of light rises
from it and becomes a new star (`uLove`, `LOVE_WIN`; `?debug` → `window.__roomLove()`).
Bunting hangs in two runs from the window frame's corners so the city stays visible.
The owner does NOT want Christmas — no snow/tree/gnomes even if a prompt suggests them.

## The letter gift = a golden puppy carrying the letter (LetterDog)

Gift 05 (`shape: 'envelope'`) is no longer a floating envelope: `LetterDog.tsx` renders a
SOLID, lit spaniel-like golden puppy standing on the room floor with the letter held
crosswise in its mouth (red satin collar bow + gold bell). Shape: `letterDogModel.ts` — an
SDF (ellipsoids + round cones, smooth union) meshed by a small surface-nets mesher into
three meshes (body / head / tail, so head and tail animate), normals from the field
gradient, vertex colours with fur streaks. Sculpting (~0.7 s) runs in a **web worker**
(`letterDog.worker.ts`, `letterDogGeometry.ts` → `loadLetterDog()`), started by Prewarm
during the welcome; materials (`createLetterDogMaterials`) are pre-compiled too. Gift3D
grounds it (no float/lift/tilt; `isDog`), it trots to a floor-level showcase when opened,
lifts its chin and the letter's flap opens. Idle: breathing, weight shift, head wander/
tilt, irregular blinks, tail in bursts; her hand → head turns toward it, tilts, wags.
The opening camera never backs out through the wall (`back` clamp in RoomWorld).

**Delivery performance (owner's spec — keep it):** touching the puppy does NOT move it or
push the camera in. `LetterDog` runs a timed state machine (NOTICE → HAPPY → MOUTH →
RELEASE → FALL → SETTLE → AFTER): chin lifts, eyes narrow into a smile, the hinged lower
jaw (`JAW_PIVOT`, separate `jaw` mesh, dark mouth + tongue behind it) opens, the letter
(held via an anchor in the jaw group) is released with the mouth's velocity, falls under
soft gravity turning flat, lands before its paws, the flap lifts, and only then
`onDelivered()` → Gift3D `onOpened`. Closing the letter → it dips its head and picks the
letter back up. Each channel (head/jaw/eyes/tail/body) has one target + one smoothing step;
the tail uses an accumulated phase (slow: ~2.1 rad/s idle, a bit more on hover/happy).
On release the letter glides toward the viewer (forward push + a fading side sway) with a
soft blob shadow on the floor that tightens as it lands.

**Art direction of the room (keep the hierarchy): HEART > golden PUPPY > pink BOX.**
Triangle composition: `layout()` is turned half a step so the heart is upper-centre, the
puppy front-left, the box front-right; puppy size ×1.12, box ×0.84. Lighting tells the story
via `roomLights` (sceneStore, set by RoomWorld): Lights' rimB becomes the heart's pink glow
(`#ff4f86`, near the heart) and the top spot a narrow golden key on the puppy; no new lights
are added (fixed light count). Background is quieter on purpose: 4 muted balloons, muted
bunting, fewer candles, cake ×0.82, dim city windows, faint ring line, whispered title.
Intro particle puppy: after its lap the waving arm's points settle onto the mirror image
of the left front leg (`aRest` attribute; pads/toe-gaps fade) — both front legs alike.

## Where the last session stopped

Last request from the owner:
> the ears still look like circles stuck together — make them flat 3D ears hanging down
> like a golden retriever's.

Done in `dogModel.ts`: each ear is now ONE shape (`kind: 'ear'`, `sdEar`) — a thin sheet
hung from a curved spine (`earX`/`earZ`, `EAR_TOP`→`EAR_BOTTOM`), leaf-shaped width
(`earW`: narrow root, widest ~60 % down, round bottom), thickness `earT`, turned from
facing outward at the root to half-forward below (`earTurn`), edges curled in
(`EAR_CUP`). On top: a bright rim round each flap and 5 strands down its face (in
`buildDog`, "ears" section) — a figure of light reads a shape by its outline. Occluders
for the ear are flat discs along it. Waving paw (toes, pads, gaps) unchanged from before.

**Puppy run (latest request — replaced the earlier spin-on-the-spot trick):** the owner
said the spin looked stiff and asked for the puppy to run on four legs round the heart,
with every leg joint moving like a real dog's. Touching the puppy (invisible hit sphere in
`LightDog`, only once the heart is formed; never counts as a heart tap) now plays:
stand up (the sitting points flow onto a standing body) → one **gallop** lap of an oval
round the heart (speed up, cruise, slow down; tongue out, ears flapping) → back on its
spot, sit down facing her → one "woof" (`sound.bark()`) → tongue stays out, paw stays
down (no more waving), tail wags. Tapping again repeats it.
- `dogRun.ts`: the standing puppy and its skeleton (chest, hips, head, tail, 3 segments
  per leg). `bindRun()` gives every sitting point a place + bone(s) on the standing body
  (head/bib/tail rigidly offset; trunk and legs re-laid on standing shapes and paired by
  region — points carry `part`/`paw` tags from `dogModel.ts`). `poseRun(phase, speed)` =
  transverse gallop (hind pair, front pair, flight), planted feet that slide back exactly
  at body speed (`RUN_SPEED`), 2-bone IK per leg (elbows bend back, stifles forward),
  wrist/hock fold in the swing, spine flex, body pitch/bounce, head steadying.
- `LightDog.tsx`: GPU skinning (`uBones`, `aRun`, `aBoneA/B/W`), `uPath` (position/heading
  on the lap + lean into the curve), `uRun` blends sit ↔ run; lap timing at the top
  (`STAND`, `ACCEL`, `DECEL`, `SIT`, `LAP_DEPTH`, `MIN_LAP_WIDTH`). Occluder body is off
  while running. Reduced motion: no run, just bark + tongue.
- Follow-up ("running it looked bald and skinny; make the leaps longer, bouncier"): the
  standing body is now as round as the sitting one (wider trunk, thick fluffy legs, paws
  as big as the sitting paws), every running point is pushed out by `fluff()` (a soft
  coat + retriever feathering on belly, chest/neck ruff and backs of the legs), and an
  invisible body rides the bones while it runs (`runOccluders()` + the sitting head's
  occluders, per-bone groups in `LightDog`) so the far side is hidden like when it sits.
  Head raised on a neck. Gait: `GALLOP = { freq 2.4, duty 0.32, reach 0.19 }`, higher
  flight bounce, more spine flex / pitch, higher paw lift — longer, bouncier bounds.
  Judge looks at deviceScaleFactor 2 (at 1 every figure of light looks thin).
- Follow-up ("leap higher, livelier; give body and legs real-looking fur"): the gait is
  now a playful bounding gallop (`FOOTFALL` hind pair / front pair, `LEAP_START`,
  `LEAP_HEIGHT` — a high parabolic leap with every foot tucked up, not dangling).
  Fur: `dogFur.ts` `growFur()` grows short strands (close-set points, darker root →
  sun-bleached tip, longer feathering on belly/chest/backs of legs) from ~half the
  body/leg points (`FUR_SHARE` in LightDog), once on the sitting body (hanging down) and
  once on the running body (streaming back), bound to the root's bone. Face, ears, bib,
  paws and tail get none.
- Follow-up ("it jerks on every bound — make it smooth; the light under the heart spins
  too fast to read the words"): the leap is a smooth bump (`LEAP_RISE`/`LEAP_SPAN`, zero
  vertical speed at take-off and landing), the swing paw path is a Hermite curve whose
  speed matches the planted foot's, lift/fold use sin² (gentle lift-off / set-down), the
  paw's carry-up with the leap fades to 0 by landing, IK eases near full reach instead
  of snapping straight, and body pitch is nose-up over the hind stance / nose-down over
  the front stance (front feet now reach the ground). Measured with a 2nd-difference
  "jolt" over two strides (`qa-output/tmp/jerk.ts`): 110–500 → 10–19. Ring under the
  heart (`HeartVortex`) spins at about half speed; the word ring at 0.08 rad/s (was 0.2).
- Follow-up (owner's phone screenshot: "still jerks when it lands — lands too fast; the
  tongue looks stuck on, not part of the mouth; ears, tongue and tail should blow back and
  sway in the wind like a real running dog"): slower bounding (`GALLOP.freq 1.75`,
  duty 0.28), the leap rises quickly and floats down (skewed bump, peak ~40 % in), then
  the legs give a little on landing; jolt metric 12–18 with the landing no longer the
  worst point. The tongue is now a solid 3D strip (`growTongue()` in dogModel: from
  `TONGUE_ROOT` deep in the mouth, over the lower lip, hanging past the chin, groove down
  the middle); the shader draws it in / out about its root, pants, and lets the wind blow
  it back (`uTongueBack`) and flop side to side (`uTongueSide`). Ears: thrown back
  (`uEarFlap`) and lifted outward (`uEarLift`), flapping with the stride; tail sways
  (`uTailSway`). All driven by a lagged "wind" (speed smoothed) and the stride phase.
- Follow-up ("the mouth is shut but the tongue is out — the mouth must open for it"): a
  hinged lower jaw. `inJaw()` in dogModel marks everything below the lip line on the front
  of the face `ANIM_JAW`, plus the mouth floor and a lower-lip stroke; a second, warmer
  red fill stays up as the roof. The shader turns jaw points (and the tongue, which lies on
  the jaw) about `JAW_HINGE` by `uJaw` = tongue-out × (0.34 + panting ± 0.06, wider while
  running) + a snap open for the bark. Closed before she plays, as before.
- Follow-up (owner's phone screenshot: "while it runs there's a black shape inside — the
  ear's light flaps but a stiff black ear stays inside it"): the hidden (depth-only) ear
  discs no longer ride the running head (`o.ear` filtered out in `runFlesh`), nor do the
  muzzle/cheeks (the jaw hangs open while running); the head occluder is 0.62 size.
  Running occluders are trunk-only and well inside the coat. The other dark holes came from
  a sparse coat, not the occluders: `sample()` dropped trunk points wherever a thigh or
  shoulder shape overlapped the body, leaving the flanks/rump covered only by the legs'
  thin coat — the trunk now keeps its points there. Plus more light on the body/legs
  (sitting shape weights, 15000 base points, run shape weights) and fuller points while
  running (`gl_PointSize` × up to 1.75 on trunk bones). Debug helpers used: density maps
  (`qa-output/tmp/map*.ts`), four-direction shots (`qa-output/dirs.mjs`), painting
  occluders red / colouring point groups in the page (`qa-output/allocc.mjs`, `green*.mjs`).
- QA hooks (any build): `window.__dogT = seconds` holds the trick at a moment;
  `window.__dogPose = { phase, speed, yaw }` shows the running pose on the spot (side-view
  filmstrips of the gait were made this way; helper scripts in `qa-output/`).

QA after this change (cloud, no GPU): see the latest commit message. `qa:perf` taps until each touch counts; without a GPU its "main
thread blocked" number is noise (240–3000 ms on old and new commits alike) — trust it
only with `--gpu`. The owner has been sent close-ups of the new ears — waiting for feedback.

Ideas the owner may ask for next (not requested yet): ears even closer to the photo
(slimmer, wavier fur fringe at the bottom), the puppy turned so the tail shows from
the default view, real names/photos/letter.

## Running & testing

```bash
npm ci
npm run dev                  # http://localhost:5173
npm run build && npm run preview   # http://localhost:4173 (QA scripts use this)
npm test                     # password logic
# Playwright QA (needs a Chrome: set CHROME_PATH; on the owner's Windows PC:
#   CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"; add --gpu for the real GPU)
node scripts/qa.mjs --gpu --size=1440x900            # whole story, screenshots → qa-output/
node scripts/qa.mjs --gpu --size=390x844 --mobile
node scripts/qa.mjs --gpu --size=1440x900 --reduced
node scripts/qa.mjs --size=1440x900 --nogl
node scripts/qa-visual.mjs --gpu [--only=heart] [--size=390x844 --mobile]  # hero/ring/room shots
node scripts/qa-keyboard.mjs
node scripts/qa-qr.mjs
node scripts/qa-perf.mjs --gpu                       # entering the room must not stall
```

`qa-output/` is git-ignored (screenshots and a few throwaway helper scripts live there).
Close-up puppy shots were made by loading `?reset&debug`, tapping the centre, waiting
~7 s, then setting the puppy group's `rotation.y` via `window.__scene` and screenshotting
a clip at `deviceScaleFactor: 4`.
