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
arched window onto a starry night, fairy-light garland, the HAPPY BIRTHDAY installation, candle
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
(The old bunting is gone — see BirthdaySign below.)
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

**Delivery performance:** touching the puppy does NOT move it (the camera walks up to it —
the latest brief asked for that). `LetterDog` runs a timed state machine (NOTICE → HAPPY → MOUTH →
RELEASE → FALL → SETTLE → AFTER): chin lifts, eyes narrow into a smile, the hinged lower
jaw (`JAW_PIVOT`, separate `jaw` mesh, dark mouth + tongue behind it) opens, the letter
(held via an anchor in the jaw group) is released with the mouth's velocity, falls under
soft gravity turning flat, lands before its paws, the flap lifts, and only then
`onDelivered()` → Gift3D `onOpened`. Closing the letter → it dips its head and picks the
letter back up. Each channel (head/jaw/eyes/tail/body) has one target + one smoothing step;
the tail uses an accumulated phase (slow: ~2.1 rad/s idle, a bit more on hover/happy).
On release the letter glides toward the viewer (forward push + a fading side sway) with a
soft blob shadow on the floor that tightens as it lands.

**Art direction of the room (major redesign — keep it): HEART > PUPPY > SIGN > BOX > candles.**
- `BirthdaySign.tsx`: the signature HAPPY BIRTHDAY installation (replaced the triangle
  bunting): dimensional letters from a Cormorant atlas (stacked layers = depth; ivory face,
  champagne bevel, rose-gold returns, inner glow + halo), a champagne arch with tiny bulbs on
  cables, a rose-gold heart under the apex pointing at the real heart, posies + satin
  ribbons. Hangs at the back centre (R 6.5; portrait R 4.9, scale 0.6, lower).
- The window moved to the back-left (`WINDOW_ANGLE = -0.85`, cool moonlight `MOON`); the
  cake stands back-right; the 4 balloons flank the sign in two pairs.
- A real two-step **stage** (`Stage`, `STAGE_STEP` 0.08 — the wood floor is lower; gifts
  stand on `floorY`): matte burgundy top with inset ring, champagne inlays, a chain of
  engraved hearts, an interlaced-rings emblem under the heart, lacquer sides, gold tube trims.
- Wall: walnut wainscot panels, blind arched recesses with warm cove light, pilasters,
  champagne trims; sign glow and window spill on it; a distance `HAZE` on wall/floor/stage.
- Memory spots: the puppy has a golden heart-shaped pool + petals (`dogSpot`), the box a
  blush pool (`giftSpot`). `roomLights` still steer rimB (heart pink) and the gold key.
- Candle clusters stand BETWEEN the gifts (the gifts are half a step round) — never in
  front of one, or they block the hero shot.
- **Dog click = a memory**: RoomWorld reuses the gift camera (steer yaw to face it, spring
  dolly, speed 1.25) and frames the puppy + the spot where the letter lands. LetterDog
  stretches the performance to match: PRESENT (0.8–1.3 s, chin up/head forward), MOUTH
  1.3, RELEASE 1.65, watches the letter go; SETTLE 0.6 s before the letter opens.
- **A small, lived-in room** (`RoomProps.tsx`, `LAYOUT` = wall angles). The room is
  `WALL_R` 6.9 m with a 3 m ceiling line (crown moulding); the camera stands OUTSIDE it
  and sees in dolls'-house fashion: the wall shader discards the stretch facing the camera
  (`CUT`), prop clusters carry an anchor (`aAnchor`) and step aside in the vertex shader,
  and set pieces (sign, cake, balloons, window target) toggle `visible` in RoomSet. Zones,
  left to right: personal bookcase + basket; window corner (curtains, armchair turned to
  the room, round side table + lamp, plant, slippers, cream rug); feature wall (arched
  alcove drawn by the wall shader, the sign in it, brass sconces, pampas vases); birthday
  prep (sideboard with plates, napkins, forks, flowers, wrapped present + card, ribbon
  curl; the cake table in front; balloons tied by it); seating corner (loveseat with
  cushions + throw, floor lamp, side table, gallery of 4 frames, blush rug). Light comes
  from `roomLamps` (table lamp, floor lamp, 2 sconces) — floor/wall/props all use them —
  plus candles, the sign, the heart and the moon. Rugs (`roomRugs`) and contact shadows
  (`furnitureBlobs`) are drawn by the floor shader. One merged mesh + `ROOM_LIGHT` shader.
  QA: `?debug` + `window.__camOverride = { pos, look }` holds a camera framing.
- **The whole 360°**: the half behind the default view is furnished too — a writing desk
  (letters, perfume, jewellery box, desk lamp, chair) under a memory wall of 6 frames; a
  chest of drawers with a lamp, dried flowers, a ring dish and a painting with a picture
  light; the (painted) door with coat hooks, a scarf, a tote, a shoe bench; a credenza with
  a turntable, records, a mushroom lamp and a round mirror. `roomLamps` now has 8 lamps;
  floor/wall loop over 8 lamps, 4 rugs, 8 contact shadows. QA: `qa-output/closeup.mjs`
  shoots 8 orbit angles + gift close-ups; `qa-output/opens.mjs` films gifts 01–04 opening.
- **Gifts are objects with their own story and opening** (Gift3D, same memory order):
  01 box — hand-tied bow, ribbon tails, swinging brass tag; lid pops then swings open.
  02 capsule → glass keepsake bottle (lathe), cork + twine, a rolled note, motes inside;
  the cork pops off and the motes rise out. 03 star → leather travel journal with a gilt
  star; the cover opens and two pages turn. 04 orb → walnut music box with brass corners
  and key; the lid lifts, a tiny heart rises on its spindle and turns, a few chime notes.
  All new materials go through `surface()` (one shared program, pre-warmed via
  `createGiftMaterials`); motes reuse the hover-sparkle shader. Gift camera speed 2.0.
- **Gift opening = a "product shot"** (from the owner's reference videos: product on a lit
  floating platform, a backdrop in its own colour): in Gift3D a lacquered pedestal disc with a
  champagne ring and a pool of light springs in under the rising gift (`stage` spring); behind
  it (camera-relative sprites) a deep wine `wash` that DARKENS the room (a pale layer only fogs
  it) plus an additive `backlight` in the gift's tint. The old flare (sprite → opacity ~1.5,
  inner light 0.95) was the white blow-out — now capped (glow ≤ ~0.4, inner light 0.32, warm).
  Other gifts `recede` (sink + shrink a little) while one is in the spotlight; the orb `hush`es.
- **Hidden: the cake's exploded view** — in the cake moment, touch the "26" topper: tiers,
  berries, candles lift and turn apart (vertex shader `uExplode`, per-part `aLayer` tag set
  in `buildCake` via `P.layer`; `EXPLODE` consts shared with JS), flames/smoke ride in
  `wickGroup`, the topper rises and turns once; an under-damped spring holds ~2.6 s, then it
  lands with a bounce. The cake's big hit sphere wraps the topper, so `touch` reroutes when the
  ray passes the topper (`userData.cakeTopper`); it calls `onTap('play')` so RoomWorld keeps
  the moment (otherwise any unhandled click leaves it). QA: `qa-output/explode.mjs`,
  `qa-output/giftshot.mjs` (args: W H [mobile] giftNo).
- **The centerpiece is NOT a heart any more — the "memory celestial"** (`MemoryCelestial.tsx`,
  used by RoomWorld and by FinalWorld; owner: "do not make another heart"). A hand-shaped glass
  orb (`getOrbGeometry`, welded icosphere — unwelded it lit facet by facet) holding a small
  universe: ONE points draw (all motion in `celestialVertex`: star dust with clouds/voids,
  warm motes on 5 tilted `BANDS`, a few bright motes near the core; breath, DOF-ish blur,
  rare pulses, distance-compensated size so it reads from across the room), a tiny warm core
  (two Glow sprites) + the one coloured point light (keep exactly one: light count changes
  lit programs). Hover: nearby motes lean to the cursor, brighten, ripple. Touch (`SEQ`
  6.2 s): contact (orbital clock pauses, converge) → expansion (glass + orbital paths show)
  → 5 abstract constellations (~34 CPU anchor stars, lines grow one by one) → memory words
  = real gift titles only (placeholders containing `[` are skipped) → return. Touched again
  once calm: collapse + one slow wave + "our little universe". Room: interactive whenever not
  opening/paused/in a moment; when all gifts are open the touch also calls `onTap` after
  1.1 s (→ finale). Finale: `assemble` ref gathers scattered motes; "one more thing" calls
  `wave()`. Shaders are pre-warmed in Prewarm. QA: `qa-output/celestial.mjs` (room
  sequence), `qa-output/celclose.mjs` (close views from 3 sides). No-WebGL fallback: `.css-orb`.
  (Heart3D now only serves the intro.) QA flags: `node scripts/qa.mjs --gpu --size=390x844 --mobile`.
- Gifts float on their own rhythms (per-index frequencies, small drift and wobble), come a
  little toward her on hover, and on click hold still for a beat while light gathers before
  rising (`oo` in Gift3D). Box 01 has a cream paper band under the satin and a hand-written
  "for you" card tag. Opening a memory fades in `.room-focus` (the room's edges dim).
- **Smoothness (measured with a CPU profile, not guessed)** — three causes were found:
  1. the intro's puppy of light sampled its SDF on the main thread at startup (~4 s
     block): now `lightDog.worker.ts` / `lightDogData.ts` (`loadLightDog`), with an empty
     stand-in geometry so its shader is compiled meanwhile;
  2. three filters the `<Environment>` into a PMREM the first time a lit material is drawn
     (~0.8 s, it hit the welcome): `WarmEnvironment` (Scene3D) does it at startup under the
     `.boot` veil (CSS-only, compositor animations) and signals `scene-warm`. Its material
     is kept alive on purpose (disposing it → GL_INVALID_VALUE warnings);
  3. entering the room linked ~20 programs synchronously in the first frame: RoomWorld now
     `compileAsync`s its whole group invisibly, draws 4 frames, then signals `room-ready`;
     App keeps the dark veil (with a breathing light after 1.1 s) until then
     (`src/lib/ready.ts`: `signalReady` / `waitReady` / `resetReady`). RoomSet no longer
     gates itself. QA: `qa-output/longtasks.mjs` (long tasks + veil lift time),
     `qa-output/profile2.mjs` / `profile-dev.mjs` (CPU profiles; dev for real names).
- **The sign reads HAPPY / BIRTHDAY / My Baby / TEACHER HÙ TÁ** (`SIGN_LINES` in
  BirthdaySign: upright display cut, an italic tender line, a small widely-spaced
  dedication). Atlas cells keyed by style + character, taller cells (accents). The arch
  is larger to frame all four lines.
- **"26" on the cake**: `CakeTopper` (RoomSet) — two rose-gold wire numerals (tube along
  hand-drawn paths) on picks behind the candles, facing the room, `surface()` material.
- **Hidden moments** (nothing announces them): touching the CAKE or the SIGN. RoomWorld
  owns `moment` ('cake' | 'sign'), saves the orbit (yaw/pitch/zoom) and restores it exactly
  on the way out; framings in `MOMENT` (RoomWorld), sign placement in `SIGN_PLACEMENT`
  (RoomSet). Out: Escape, a touch anywhere else, or (cake) touching it again = blowing out
  the candles (a wish) → back after 2.3 s. Messages come from
  `birthdayConfig.room.moments` and appear as a `Whisper` (drei Html, `.room-whisper`, line
  by line). App listens to `room-moment` (dims the edges, hides the room UI). Hover: the
  cake's flames brighten + a warm `Glow`; the sign warms and its band of light quickens.
  Gift hit-spheres yield to a moment behind them (`passThrough` in Gift3D; Points never
  raycast). QA: `?debug` → `window.__moment('cake'|'sign'|null)`, `window.__camera`;
  `qa-output/moments.mjs` (real clicks) and `moments-hook.mjs` (any viewport).
- **The sign is one composition in one family** (Cormorant upright capitals): words from
  `birthdayConfig.room.sign`; size / weight (500 vs 400) / tracking / metal tone (`aTone`:
  champagne → warm gold for her name) make the hierarchy; two gold hairlines frame MY BABY;
  a slow band of light crosses the letters (`uSweep`); posies and ribbons differ per side.
- **Sign safe area**: `SIGN_SAFE_FLOOR` (1.22 m) — `safeDrop()` lifts the sign so its lowest
  line (TEACHER HÙ TÁ) always clears the alcove foot / chair rail (0.95 m) at any placement;
  RoomWorld frames the sign close-up from the same `safeDrop`. The alcove behind it is a
  full-height niche (no rail / wainscot inside it), so from no camera angle does a horizontal
  border cross the words. Letters cast a soft shadow
  (blurred mask offset down) for depth; the arch has a back rail + ties + brass rosettes;
  leaves in the posies differ per side.
- **The cake** (`cakeModel.ts`, `buildCake`): one merged mesh (one draw call) — lathe tiers
  with soft edges and an uneven hand-smoothed side, piped shell borders, sugar pearls,
  rosettes, strawberries off a perfect ring, sugar flowers, tiny hearts, a thin raspberry
  glaze with drips, four wax candles (drip + wick) whose flame positions drive the flames.
  Its shader is lit by those flames (`uFlames`, world space, flicker, out when blown),
  a rose bounce from the room, per-material highlights and contact darkening. Hover: the
  cake rises a breath (scale 1.015) with sparkles (`sparkleVertex`); the "26" topper is a
  hair heavier and leans toward the room.
- **No flash when the camera moves through the room**: the "white flash" on clicking the cake
  was the camera passing THROUGH the particle heart (additive points sized by 1/distance
  filled the screen). Now every point layer caps its size and fades right in front of the
  camera (ParticleHeart `camNear`, ParticleField, candle flames), the heart's shell / glow
  withdraw when the camera is within ~2.8 m (Heart3D `close`), and moments use a two-beat
  camera (`MOMENT.turnFirst`: turn toward the subject from afar, then lean in). The cake's
  reveal: flames brighten only a little, a small warm pool, a ring of gold/pink motes runs
  once round it (`ringVertex` in cakeModel).
- **The puppy's face**: ears are their own meshes (`EAR_PIVOT`, `earL/earR` from the worker)
  on damped springs driven by the head's motion (+ a hop when happy). **The mouth is part of
  the SDF surface, not separate meshes** (owner rejected drawn-on lip tubes): HEAD/JAW parts
  have skin colours (`lip`, `tongue`, `cavity`), `sub: true` parts are smooth subtractions
  (`-smin(-d, di, k)`) whose carved walls take the carve's colour — the mouth recess under
  the upper lips, the hollow of the lower jaw (dark inside) with the tongue lying in it
  (parts listed after a carve win their colour there). Vertex colours are a soft blend of
  nearby parts (no stair-stepped borders). Removed because they looked artificial at the
  mesh resolution: SDF teeth/gum, the philtrum groove (it meshed into a box). The dark
  cavity sphere (`FACE.mouth`) sits fully behind the lips. Ribbon = flat satin bands
  (`band()` / `ribbonTail()` extrusions), not tori. Dog moment camera: portrait lens
  (fov 26 desktop / 20 portrait). QA: `?debug` exposes `window.__dogHead`;
  `__camOverride = { pos, look, in: 'dogHead' }` frames in head space
  (`qa-output/dogmouth.mjs`). Eyes = dark ball + iris disc
  pressed onto its curve (canvas texture) + clear cornea + catch-light on the cornea, and
  thin upper lids (open high, lowered a little when happy, closed for blinks); the eyes
  follow her hand. Materials in `createLetterDogMaterials` (pre-warmed).
- Room UI: memory indicators are medallions; the final note sits between fine rules and
  "Come closer" is ivory/blush glass (`room-ui__cta`).
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

## Transitions between worlds (latest pass — from the owner's 3 reference videos)

Analysis of the videos: `reference/VIDEO_ANALYSIS.md` (the videos themselves are not in
the repo). Lesson: the hero never leaves the frame; a scene change is a move *through*
something, never a white/black cover.
- **One transition, everywhere** (`App.tsx` `transition(next)`): `leaving` → the current
  world's camera dives into its hero light (IntroWorld: into the heart, fov 52; RoomWorld /
  FinalWorld: up to the orb) while `.iris` (global.css, `@property --iris`) closes in
  wine-dark from the edges onto a soft core of the same light; the stage swaps under it;
  the room compiles (`room-ready`); RoomWorld's rig is mounted only once ready and the camera
  is placed at `ORB_CLOSE` in front of the orb, so it pulls back out of it (slower,
  `arriving` speed 0.75, for 2.6 s) while the iris opens. Reload-resume starts closed too.
  The old `.veil` (white `light` / black `dark`) is gone; `Veil = 'none' | 'iris'`.
- gate → welcome: no cover (same world): `gate-out` + the heart drifts up. On a short
  landscape window the welcome heart sits higher (`short` in IntroWorld) — the title used
  to overlap it. Welcome text lifts away (`.welcome[data-leaving]`).
- gift → memory: no white flash any more; the sheet settles over the product shot.
- Product shot: the gift's name in big Cormorant capitals behind it (`ShotTitle.tsx`,
  driven from Gift3D: `titleIn` spring, fitted to the frame width) — "type behind the
  product" from reference 1.
- Gift labels are `ScreenLabel.tsx` (plain DOM following a 3D point), not drei `<Html>`:
  tearing down five `<Html>` roots with the room threw `removeChild … not a child` (a
  pageerror on room → finale, present before this pass too).
- QA: `node scripts/qa-transitions.mjs [--gpu] [--size=800x500]` films gate → welcome,
  welcome → room and room → finale as frame strips (exits 1 on page errors).
  `?debug` + `window.__shotHold = 0.9` freezes a gift's product shot (the App safety net
  waits) — click a `.gift-nav__btn` and screenshot.
  Without a GPU, 3D runs ~1–5 fps while CSS runs in real time — judge timing with `--gpu`.

## The star dust pass (videos 5 and 6 — `reference/VIDEO_ANALYSIS.md` F–H)

Two more reference videos (a burger site, a classical-painting site) said the same thing
twice: **a chapter never fades into the next — a material of that world eats the old scene
and the new one is already glowing inside it**, and **no frame of a change is ever a white
or black cover** (measured on both clips: mean luminance stays inside ±15 %, near-white
peaks at 6 %). Our iris did the right move with the wrong material: a CSS layer over the
canvas, which also covered everything the canvas was doing, so the cut was ~1.2 s of an
almost empty screen.

- **`TransitionDust.tsx` — the dust a change of world travels through.** One component in
  `Scene3D` (outside the per-stage worlds, so it survives the swap), riding the camera:
  a wine-dark **vignette** (`renderOrder` 58, normal blending) and ~2600 **motes** over it
  (`renderOrder` 60, additive, `depthTest: false`). `phase: 'close' | 'open' | 'none'` and
  the destination's tint come from App (`DUST` = room champagne / finale warm gold).
  - *close* (1.2 s): a front runs out from the hero light at the centre, lighting motes as
    it passes them; the dark closes in behind it. When the front is gone the field **holds**
    (`uHold`: fuller, brighter, breathing in and out) — that is what hides the stage swap.
  - *open* (1.7 s): the motes keep going outward and clear **from the centre first**, so the
    new hero is the first thing she sees again.
  - Every mote hangs at its own distance (`aDepth` 0.75–2.3, size ÷ depth, far ones dimmer):
    while the camera dives, the near motes slide past the far ones — depth, not a sticker.
  - Reduced motion: the same shape in a third of the time, without the drift.
  - The two programs are linked in the first frames at zero alpha (under the boot veil), so
    no change of world ever waits for a compile.
- **The CSS `.iris` is now only a fallback**: `?nogl`, and the first moment of a reload that
  resumes in the room (`domCover` in App), where the canvas has not drawn yet. With WebGL
  the dark lives in the world, under the dust.
- **Two beats on every departure** (`src/hooks/useDive.ts`): `pull` (190 ms — the camera
  steps back 4 % and the lens narrows to 36-37°, the breath in), then `dive` (into the hero
  light, fov 52). IntroWorld / RoomWorld / FinalWorld all use it.
- **Copy lags the move**: `.welcome[data-leaving]` waits 0.12 s before lifting away.
- **`.dust-core`** (global.css, shown by App while the dust is up): a soft breathing light
  at the centre of the change, drawn by the compositor. When the next world draws its first
  frame the main thread is busy for ~0.3 s and every mote holds still; this light does not
  wait for the main thread, so the middle of the screen stays alive from the old hero light
  to the new one.
- Measured, welcome → room: no frame over 0.4 % near-white, worst near-black 51 %
  (the room itself sits at 45–50 %), mean luminance 19–30 through the whole change — no
  cover frame, and every frame differs (no still picture). Same for room → finale.
- QA: `node scripts/qa-transitions.mjs --gpu` films them; `scripts/qa-transition-metrics.mjs`
  (frame times + strips) and `scripts/frame-stats.py` (brightness, % near-black / near-white)
  judge them with numbers. The only frames over 50 ms in a change are the room's first draw
  (~330 ms, pre-existing: the same number at the commit before this pass), and they fall
  inside the held dust field.
- **`scripts/video-frames.mjs`**: tears a reference video into frames (`--fps`, `--sheet`
  contact sheets) with ffmpeg; finds ffmpeg on PATH, at `FFMPEG_PATH`, or the one that ships
  with CapCut. Videos live in `reference/videos/` (git-ignored).
- QA hooks added: `?debug` → `window.__heart` (the group the heart of light hangs in) and
  `window.__orbit`. `scripts/qa-visual.mjs` now touches the heart where it really is
  (projecting that point, walking down to the light, retrying) — it had been clicking empty
  space at 1440×900 and silently testing nothing but the dormant ring.

## The third touch: the heart opens, the card condenses (storyboard A)

`reference/STORYBOARD.md` holds the shot-by-shot for both changes of scene; every duration
and easing lives in **`src/config/motion.ts`** (`motion.unlock`, `motion.enterRoom`,
`motion.hand`) so they can be tuned without reading the scene code.

The third touch used to be a flash and a cut to the password screen. Now (2.0 s):
- **0–0.15 s** the heart contracts 5.5 % and holds — the breath in (`opening` on `Heart3D`,
  which runs its own clock; `motion.unlock.anticipate` / `contract`).
- **0.15–1.2 s** it opens: every point of light spirals out on its own delay and comes home
  on one sine (no speed of its own at either end) — `uRelease` / `uReach` in `ParticleHeart`,
  the points grow and run hot as they go. The camera leans into the core (12 % closer, lens
  40° → 33°) so the light passes around her view.
- **1.2–2.0 s** the heart shrinks to 0.55 and drifts to the place it keeps on the password
  screen *before the card exists* (`unlockPhase === 'settle'` in IntroWorld takes the gate's
  framing early; `scaleSpeed` 2.4 makes the shrink a move, not a snap). The ring of words
  fades out with it.
- **2.0–2.8 s** the card **condenses** out of that light: a pool of light contracts where it
  will be, each line comes out of a 14 px blur 120 ms after the one before
  (`.gate__card.condense` in experience.css, driven by `--card-ms` / `--stagger` that
  PasswordGate reads from `motion.unlock`).
QA: `qa-output/tmp/unlock.mjs [--size=390x844] [--reduced]` films it with real timestamps
in the file names (a full-page screenshot costs ~350 ms on this machine, so frame index is
not time). Measured: no frame over 0.7 % near-white, luminance 28 → 47 → 28 through the
release.

## The way in: the room is built out of the light (storyboard B)

`motion.enterRoom` holds the timings. The password is right → the card's light is drawn up
into the heart (`.gate__card.is-ok`: each line leaves bottom-first, a pool of light rises
through it, `--gather-ms`) → the welcome → "Step inside" and then:
- **the flight** (`TransitionDust` `mode="warp"`, `motion.enterRoom.streak` 1.5 s): the same
  motes keep a fixed distance from the axis and run from z −11 to −0.3, so perspective
  alone opens them outward; three depth layers (`aDepth`) run at different speeds, and each
  sprite is **stretched along the way it travels on screen** (`vStretch` / `vDir` — the
  across-axis is squeezed, so a fast mote reads as a line of light). They fade out before
  they reach the lens. App picks `warp` only for welcome → room; every other change of
  world keeps the quieter holding field.
- **the room drawn in light** (`RoomBuild.tsx`, `motion.enterRoom.land` 1.9 s): when the
  room has compiled, `sampleRoom()` takes ~15 000 points **on its real surfaces** — random
  triangles, random barycentric point, meshes weighted by `sqrt(triangles) × radius` so a
  bare wall gets as much light as the puppy's twenty thousand vertices. The motes start
  gathered at the orb and fly out to those places, **lowest first** (floor and rug, then
  what stands, then what hangs: `aDelay` from height and radius). The room itself is held
  invisible (`drawn` in RoomWorld) until a third of the light has landed, then it takes
  over while the last motes settle over it and fade (0.95 s). One draw, one program; the
  sampling reads vertex buffers that are already in memory (room entry 359 ms, budget 400).
  Only when she flies in (`drawIn`, i.e. `dustMode === 'warp'`) — a reload that resumes in
  the room is already home — and never under reduced motion.
QA: `qa-output/tmp/dustprobe.mjs` films it (timestamps in the file names). Measured:
luminance 30–35 through the landing, near-white ≤ 0.7 %, no empty frame between the light
and the room.

## Her hand in the room (storyboard C — first pass)

`motion.hand` holds the numbers.
- **Interest before action**: the pointer resting on a gift for 250 ms (`dwellMs`) makes the
  camera lean a tenth of the way toward it on a slow spring (`near` in RoomWorld, speed
  0.55) — the way a person moves their head before reaching out. Moving away cancels it.
  (It does move the thing a little on screen; the lean is small on purpose.)
- **Weight**: `MOTION.hand.spring` gives a lacquered box and a music box a slower spring
  than a glass bottle or a journal (`heavy` in Gift3D), and a heavier lid takes longer to
  lift (`HOLD_SECS` × 1.25 / 0.85). The same number drives lift and tilt.
- **Opening is a gesture, not a button**: `onClick` is gone from Gift3D. Pressing lifts the
  lid under her finger (box lid, bottle cork, journal cover, music-box lid all answer to
  `hold`), the light inside leaks out through the crack, and it opens when the lift is
  complete. Letting go before a third of the way lets it fall shut with a knock
  (`sound.thump`). A quick tap (< 260 ms) finishes the lift by itself, so a tap still works
  and still has weight. The gift-nav buttons and the keyboard path are unchanged.
- The transition lock is released as soon as the room can be touched (900 ms after the
  light starts landing), not after the whole settle.
QA: `?debug` → `window.__giftHold` = `{ id, hold, held }`; `qa-output/tmp/hold.mjs
[--short]` films a press, a hold and an early release (the camera leans in, the lid lifts,
it opens — or falls shut).

**Entering the room, 347 ms → 236 ms** (a CPU profile, not a guess: `qa-output/profile2.mjs`
showed the cost was `useMemo` geometry builds and `measureText`). The three heaviest things
the room used to make for itself are now built during the welcome by `Prewarm`, kept in
module caches and never disposed:
`getPropsGeometry` (RoomProps — the whole furnished room as one merged mesh),
`getSignGlyphs` + `getSignLetters` (BirthdaySign — the canvas atlas of every letter and the
geometry laid along the wall; the layout she will see, `portrait` is passed to Prewarm) and
`getCake` (cakeModel). The worst frame of welcome → room fell from 335 ms to 188 ms
(`qa-transition-metrics --only=b`), and it falls inside the held star dust.

**Not done in this pass** (next): procedural close-up materials (wood, paper, cloth, metal
from `.claude/skills`), zoom that follows the cursor with inertia, and blowing the candles
out with a gesture. The brief for them is in `reference/STORYBOARD.md` C.

## The light sprite, the real room, the hand (storyboards D, E, F — this pass)

Shot lists and the "why" for every number: `reference/STORYBOARD.md` D/E/F. Numbers live in
`src/config/motion.ts` (`motion.sprite`, `motion.follow`).

**D — a light sprite leads the story.** `lightSprite.ts` (module singleton: leader on
CatmullRom legs, 1.6 s of recorded path, flock shape springs, camera-follow targets, `uWake` /
`uBuild` for the room's shaders, `rebase()` for a change of coordinates), `LightSprite.tsx`
(one points draw in Scene3D outside the worlds: swarm with per-mote lag + divergence-free
flow, ribbons, camera orbiters, `uCorridor` spiral tunnel, `uStars` sky; size grows with
distance, `uSpan`), `spriteScripts.ts` (the flights). Signals the page waits on go through
`src/lib/story.ts` (no three.js in the main chunk).
- CameraRig: `sprite.cam` blends in on a spring; following, the rig's own springs chase the
  lagged point (lag 0.25 s, lookahead 0.32 s), roll ≤ 4° from lateral acceleration, breath
  0.15° @ 0.3 Hz, fov +≤9° with speed; her orbit/parallax are set aside meanwhile. A new rig
  **adopts the last rig's springs** if it ran < 250 ms ago (`camera.userData.rig`), and
  `rebaseCamera()` moves camera + springs together. `nudge` = focus-follows-cursor.
- D1 heart → password: App mounts the gate as the heart settles (`anticipate + release`);
  PasswordGate measures the card, draws an SVG frame (top centre, clockwise, linear,
  `--leave-ms` / `--draw-ms`) and publishes its rect (`src/lib/gateRect.ts`); IntroWorld flies
  the sprite along the same outline at the heart's depth (`cardFrame()`), the writing
  condenses after (`.gate__card.draws`).
- D2 password → room: IntroWorld plays `leaveHeartScript` on the dive (corridor + hold);
  App uses dust mode `veil` (only the dark edges; the hole never closes); RoomWorld is
  `ledIn` (`drawIn` = warp **or veil**): its rig is mounted at once, and when compiled it
  rebases leader + camera into the room (`roomTourScript`: entry in front, past window →
  sign → balloons → cake → front-right, then up into the orb), `touring` blocks her hand
  until `room-home`. Shaders dim what the leader has not passed (`spriteBuilt`) and flare
  where it passes (`spriteGlow`); set pieces in `cutGroups` lift into place
  (`sprite.builtAt`); RoomBuild's light lands along the sweep (`sweep: true`).
- D3 room → finale: RoomWorld plays `windowScript` (orb → arched window → through the pane;
  `uStars` 0.6 so the flock becomes the night beyond); when the camera is
  `window.swapAt` m from the glass it signals `window`; App swaps to the finale with
  `.night-wash` (the window's blues) washing into the finale's wine; FinalWorld rebases so its
  orb is straight ahead and plays `finaleArrivalScript`. Finale → room still uses the dust.
- Reduced motion: no flights (old short dives). `?nogl`: CSS iris.

**E — the room.** `verlet.ts` (Rope: fixed 120 Hz substeps, length constraints, floor/sphere/
box collisions, `nudge`; RopeTube: round string or flat satin band rebuilt in place).
Box gift `RibbonTails` (Verlet satin in the lid's space), balloon strings (Verlet), garland
cable (catenary, shared `GARLAND_SWAY`), `ArchedWindow` (built frame + pane + moon shaft) in
RoomSet, music-box drum pins + 12-tooth ringing comb, rose-water `Liquid` in the bottle,
floor bevels + near-camera pores, props wood/paper detail near the camera only,
`RoomEnvironment` (Lights: PMREM of the room's own light cards, 128 px, swapped in for the
room). Set-piece build animation lifts only (several groups hold world-space children —
scaling them would pull them to the middle).

**F — the hand.** `roomHand` + `handNear()` and `giftRing` in sceneStore; RoomSet writes the
hand every frame (touch too), `handUniforms` / `HAND_GLSL` (warm glow near the ray, floor
pool + hand shadow); Gift3D: `shove` springs, ring waves (80 ms/step, ×0.6), ring spin
integrated in RoomWorld; curtains in their vertex shader; candles blow out on a sweep or a
1.6 s still hand (Cake).

- **The tour never ties her hands**: any pointerdown / keydown during it (after 0.6 s) calls
  `sprite.skip()` (flock fades, camera let go on its spring, build finishes, pending legs'
  `onEnd`/signals honoured); App keeps the gift buttons live (`touringRef`) and choosing a
  gift signals `skip-tour` first. (The tour runs on 3D time: a slow device stretches it.)
- **Prewarm** also compiles the room's own ShaderMaterials (`roomWarmShaders()` in RoomSet,
  `propsWarmShaders()` in RoomProps, the bottle's liquid) during the welcome.
- **Measured without a GPU (swiftshader), be honest about it**: entering the room led in by
  the sprite blocks the main thread ~10.7 s vs ~3.0 s on the commit before (both with the
  welcome long enough for Prewarm to finish). The *amount* of shader compiling is the same
  (138 vs 140 shaders, ~13 s of `getShaderInfoLog`/`getProgramInfoLog` either way); the
  difference is that the room is now shown at once (dim, woken by the sprite) instead of in
  pieces, so the lazy compiles land in one frame. With a GPU and KHR_parallel_shader_compile
  this should be far shorter — **verify on the owner's PC: `node scripts/qa-perf.mjs --gpu`**.
  If it is over budget, compile with every descendant forced visible before `compileAsync`
  in RoomWorld (objects hidden at compile time are skipped and compile on first draw).
- Pre-existing in this cloud (also failing on 36add11, no GPU): `qa --reduced` "clicking the
  3D gift did not start opening" (press-to-lift runs on 3D time), `qa-visual` gift-opening
  wait, `qa-perf` budget.

QA for this pass: `node scripts/qa-sprite.mjs [--size=960x600] [--only=a,b,c,d] [--log]` films
the three flights (and `d`: a hand sweep across the gifts) on a **paused virtual clock** (Playwright `clock.install` + `pauseAt`;
each step is exact story time, frames over CDP) — the only honest way to see timing without
a GPU (swiftshader renders ~2 fps). CSS (card frame, night wash) still runs on the wall clock
in those films. `--log` prints leader / camera / weight per frame.

**Follow-up (measured, then fixed):**
- The tour was 60–73 % near-black: the camera flies at head height and the room had no lid,
  so the dark above the walls filled half the frame. `Ceiling` (RoomSet): a plaster ceiling
  at 3.14 m (cove uplight at its edge, lamp pools, a plaster rose) that exists only while the
  camera is inside the walls and under it (`uInside`, faded over 0.5 m) — the dolls'-house
  view from outside is unchanged. The `veil` dust keeps a wider hole (1.1).
- The window: stars were whole lit grid cells (squares up close) → round points; the night
  sky is darker; the pane takes only 20 % of the sprite's flare (the leader flies through it
  and the lit pane was the brightest frame of room → finale); the frame is a near-neutral
  walnut grey (any warm paint turned pink under the rose rim light).
- Box 01's satin tails: long enough to run over the lid's edge and hang down the front, and
  `RopeTube.update(rope, twist, side)` keeps a flat band's width across its run (before, it
  turned on edge where the tangent crossed "up" and read as two sticks from a low angle).
- The hand pushes gifts ~2.5× harder (a brisk sweep now moves a gift ~4 cm).
- QA helpers (git-ignored): `qa-output/heroes.mjs` (close-ups of every gift, the window and
  the ceiling from inside), `qa-output/boxshot.mjs` (box 01 from four sides).

## Pace, the gate, the room, the gifts (storyboards G, H, I — this pass)

- **`motion.tempo`** (top of `src/config/motion.ts`): one knob; every duration goes through
  `t()` / `ms()`. 1.0 = the current pace (≈5.5 s heart → words, ≈11 s welcome → whole room,
  5–6.5 s per gift).
- `lightSprite.ts` was renamed **`spriteFlight.ts`**: next to `LightSprite.tsx` it differed only
  in case, so `import './LightSprite'` resolved to the .ts module on Windows and nothing
  typechecked there.
- **G (gate)**: no card, no frame (`gateRect.ts` deleted → `src/lib/gateMarks.ts`: the line the
  words sit on and the rule she types on). The heart opens like a flower (6 petals,
  `uPetals`/`uPetalTwist`/`uPetalLag` in ParticleHeart; never call a GLSL variable `out`)
  while the camera arcs 41° and cranes; the sprite writes the words (`writeScript`,
  `screenStroke`; the DOM reveal is a mask on `@property --ink`), then draws the rule; eight
  star slots light per digit. Focus lands when the light reaches the words.
- **H (room)**: `spriteBuilt()` discards what the leader has not passed (soft sine-waved
  edge); `BuildGate.tsx` holds every standing thing at scale 0 until its angle is reached
  (`sprite.expectBuild()` once per mount, so nothing is drawn before the tour; gates scale,
  never `visible=false`, or compileAsync skips them). `qa-output/tmp/tour.mjs` counts drawn
  things: 1/25 at 10 % of the tour, 3/25 at 30 %.
- **I (gifts)**: see STORYBOARD I. `openWarp` + `motion.gift.open`, `giftMark` →
  `useGiftOrigin` (page widens from the object), box 01 = lid lifted off + walls hinged at the
  base + wine satin lining + rising blank pictures. `window.__shotHold` still freezes a
  shot (`qa-output/tmp/giftsteps.mjs N`). QA waits for `.sheet` up to 15 s.
- **Pace** (`src/lib/pace.ts`, no three.js): every scene clock (sprite legs, heart opening,
  dust, gift/LetterDog clocks, IntroWorld unlock) multiplies dt by `pace.rate`. App calls
  `beginScene(name)` / `endScene()` around each scripted moment and waits with `sceneWait(ms)`
  (scaled). A tap or any key during a scene → `hurryUp()`: a smooth ramp to ×3.5, never a
  jump. Seen before (`localStorage` `love-story:seen`, cleared by `?reset`) → ×2.5 (≈40 %).
  `window.__pace` in `?debug`.
- **Second pass of H and I** (see STORYBOARD H/I): BuildGate `mode` (`grow`/`drop`/`rise`/`pop`)
  + `pivot` (each thing scales about where it stands; RoomBuild's sampler puts gates at their
  pivot while it samples); the wall rises like a curtain and the ceiling comes last;
  gifts 02–05 have their own openings (bottle scroll, journal star + pages + journey line,
  music-box notes → motes + ripples, the letter's wax seal cracking and the letter unfolding),
  mechanism sounds in `audio.ts`, and closing runs backwards (`closingSheet` in App,
  `.sheet.is-closing`). **Keep the build tests inline in the wall/ceiling shaders** — a shared
  helper call in the ceiling hung the GPU on D3D (context lost → white screen).
  QA: `qa-output/tmp/openclose.mjs N` (open → page → close, timestamps), `tour.mjs`.

## Fixes from the owner's checks (stage J)

- **J1 — the room came back empty after the finale.** Cause (measured, `scripts/qa-return.mjs`):
  `transition()` picked dust mode `warp` for ANY way into the room, so finale → room mounted
  RoomWorld with `drawIn`, which armed `sprite.expectBuild()` — but no flight came, so
  `build.pending` stayed true and every BuildGate held its thing at scale 0 (gifts, cake, sign,
  balloons, candles), while the surfaces (no `uBuild.z`) still drew. Fix: `warp` only from the
  welcome; and RoomWorld calls `sprite.cancelBuild()` whenever it is shown without a flight.
  `npm run qa:return -- --gpu [--times=3] [--size=390x844]` walks room → finale → back N times
  and fails if any gate is not at full scale, the build is still waiting, or WebGL was lost.
- **J2/J3 — the cake / sign moments** are framed by `frameBox()` (RoomWorld): the subject's real
  bounds (meshes tagged `userData.frame = 'cake' | 'sign'`), the lens and THIS screen's aspect,
  fitted into the subject's own area of the screen (`motion.moment`: cake left / words right on
  a wide screen, words above on a phone; the sign above, its words in a band under it measured
  by `whisperHeight`). The words are pinned to screen px (`calculatePosition`; the Html anchor
  is the subject — drei hides an Html whose anchor is behind the camera) and appear only after
  `motion.moment.textAfter`. The cake gets a soft wrapped warm key while focused (`uKey`). On a
  phone the sign camera rises (`elev.sign[1]`) to look over the orb. `?debug` → `window.__frame`.
- **J4 — the finale's ways out** ("Back to our room", "From the beginning") appear only when no
  step is left: in `waiting`, or in `secret` once the surprise has been seen (`surpriseAhead`).

## The sheet that comes out of a gift IS the memory page (stage K)

- **Carrier** (`PaperCarrier.tsx`): each gift lets out one paper sheet in 3D — box: a note
  folded once under the pictures; bottle: the scroll (rolled, `roll`); journal: the right-hand
  page (`page` curl); music box: a paper folded in three in the lid (`tri`); the puppy: its letter
  once it has slid out of the envelope (`tri`, real creases). Anchors are groups in GiftBody
  (`boxSheet`, `noteSheet`, `pageSheet`, `mouthSheet`, LetterDog's `sheet`) with
  `userData.carryW`; timings in `CARRY` (Gift3D). Its pose is a function of the opening's
  progress (source in the gift → in front of the lens at `motion.gift.carry.dist`, `hand` of the
  page's size, leaning back `tilt`), so closing runs it back. The puppy's letter flies on its own
  clock (`carry.dogSecs`) and Gift3D delivers it (LetterDog only delivers under reduced motion).
- **Handoff** (`src/lib/carrier.ts`, `src/hooks/useLeaf.ts`): the carrier reports its four
  corners on screen from `onBeforeRender` (the camera of THAT frame). The page's paper `.leaf`
  is laid out at exactly `leafRect()`; on mount it is mapped onto those corners with a CSS
  `matrix3d` homography (`quadMatrix`, transform-origin 0 0) — chosen over drei `<Html
  transform>` because four projected corners are exact by construction and the page stays a
  normal dialog — `carrier.handed` makes the 3D sheet stop drawing (it keeps rendering with
  `colorWrite` off, so it keeps reporting), the corners glide to the leaf's place
  (`pageMs`, ease-out that carries the sheet's speed on), then the words ink in. Closing: words
  out, the leaf glides onto the live corners, `handed = false`, the gift runs its clock back.
  The page's dark is its own `::before` layer (the paper never fades). Creases stay on the leaf
  (`data-fold`). The 3D sheet's paper is written straight out (no tone mapping) = `--paper`.
- **Pace (K3)**: openings 3.0–3.3 s (`motion.gift.open`), a 0.15 s held breath, walls/lid/light
  overlap; press → page straight ≈ 4.2–4.4 s (puppy ≈ 6.5 s: its delivery performance).
  The page chunks are fetched when a gift starts opening (they were the 0.6 s stall).
- QA: `node scripts/qa-handoff.mjs --gpu [--size=390x844 --mobile] [--only=1,5] [--nofilm]`
  films each gift (timestamps + `scripts/frame-sheet.py` sheets) and measures the handoff
  (`__leafHold` keeps the page on the sheet; `scripts/handoff-corners.py` compares the paper's
  corners in a page-shot and a sheet-shot): ≤ 1.4 px on desktop and phone. `npm test` checks
  the homography lands on its corners. `?debug` → `window.__carrier`.

## Words that arrive as light (stage L)

- **`LightText`** (`src/components/ui/LightText.tsx`): the words stay real DOM text (one span
  per word — read, selected, copied as usual); their arrival is drawn on ONE shared canvas
  (`LightTextLayer`, mounted once in App, z 70, pointer-events none). Each word's shape is
  sampled from a canvas in the word's own computed font at its own place on screen (accents
  included), and motes make that shape before the real word takes over (`.lt__w` animation
  delayed to its landing). Variants: `condense` (motes fly from the hero — `lightOrigin`,
  written each frame by IntroWorld (heart) / FinalWorld (orb) — a pen of light running along
  the line), `ink` (on paper: gilt-ink motes drawn source-over, from the pen; memory pages),
  `bloom` (blooms warm where it stands, a few sparks fall), `constellation` (a few stars per
  word joined one by one, then the words sharpen; `leaving` scatters them as stars).
  `ready` holds it (the memory page starts once the leaf is straight). Reduced motion: plain
  fade. Numbers: `motion.lightText`.
- Used by: the welcome lines, the finale title (bloom) and message, the days together
  (`CountUp`, sparkling steps; the full sentence is the `aria-label`), the secret lines and
  the last words of the surprise (constellations), the memory page's title/date/message (ink;
  the music box plays a comb note per line).

## The cake, made like a real one (stage M)

`cakeModel.ts` (still ONE merged mesh + one shader; the exploded view kept): piped
buttercream roses (a flattened spiral ribbon of cream, not stacked rings), a glossy dark
chocolate-cherry ganache whose main streams end in round drops, strawberries with seeds,
raspberries (drupelets) and blueberries, flakes of gold leaf, a white marble cake stand
(`CAKE_LIFT` 0.085 — RoomSet lifts the "26" topper, the glow and the hit sphere by it),
crumbs on the stand, and beside it a **slice already served** on a porcelain plate with a
fork (`buildSlice`: three sponge layers with cream and raspberry between, buttercream skin,
crumbs) — the only way to show the inside. Shader kinds 7 sponge (two scales of smooth
noise cut into pores), 8 metal (gold leaf, fork), 9 marble, 10 porcelain; buttercream gets
wrapped light + a little light through its edge, palette-knife sweeps on the sides and a
spiral on the tops (`uCenter`); fine detail fades in only within ~3.6 m (`near`). Soft
contact shadows under the stand and the plate. The "26" stays the rose-gold wire topper
(no separate wax number candles). Closeups: `qa-output/tmp/signclip.mjs` (cake + sign).

## The sign (stage N)

`BirthdaySign.tsx`: the tender line is set in **Dancing Script** (title case of
`room.sign.endearment`; words unchanged), the rest stays Cormorant capitals; cells are
300 px tall (accents above, descenders below) and `drawGlyphs` checks every glyph's
`actualBoundingBox` against its cell (`signClip`, `?debug` → `window.__signClip`, must be
`[]`). Three depths: the halo behind, the face (now with a warm copper **filament** along the
heart of each stroke, breathing per letter), and a fine **rim of light** quad 14 mm in front
(`rims`, additive) — real parallax as the camera moves. When she comes close (the sign
moment) the letters dim and **light again one after another** from sparks (`uIgnite`,
`aOrder`, `IGNITE_SECS` 1.6). The slow band of light still crosses it.

## The letter floats, and opens only at her touch (stages P, Q)

See STORYBOARD P/Q; numbers in `motion.letter` / `motion.reading`.
- **Gift3D letter phases** (`letter` ref): the flight (progress `CARRY.fly`, still folded) →
  `wait` (floats at `hoverDist`/`hoverSize`/`hoverRise`; bob, sway, wind, gilt rim breathing,
  motes; `carrier.waiting`) → `open` on `carrier.requestOpen` or after `autoOpen` 10 s (2.7 s,
  creases `fold`/`foldB` a `creaseLag` apart, bow + bounce, falling motes; rim/wind/edge gone
  by 85 %) → `onOpened` → K's handoff. Real seconds (not `pace.rate`); the gift's scene ends
  when it starts to wait. Closing: the letter refolds first, then the gift's clock runs back.
  Only the opening gift writes `carrier.waiting` (the other four used to overwrite it).
- **`LetterPrompt`** (App, while a gift is opening): an invisible button laid over the
  floating sheet's quad — click / tap / Enter / Space, `aria-label`, focused when it waits.
  QA scripts click it with `{ force: true }` (it moves) — `?debug` `window.__letterHold`
  keeps it waiting.
- **`PaperCarrier`** now: 24×48 grid, two creases, `wind`, `curl`, `edge` thickness, a GILT
  edge (the colour turns gold — light cannot be added to near-white paper) with a bead of gold
  running round it, orbiting/falling motes, and (Q) `reveal`. A separate halo quad behind the
  sheet darkened the room in a rectangle and was removed.
- **Reading pace** (`LightText pace="reading"`, `LightSeq`): lines measured on screen, each
  clamp(0.6 + chars × 0.025, 0.8, 2.2) s, ≥ 0.35 s apart, +0.6 s per paragraph; a click on a
  line still arriving fast-forwards it ×6; `seq.skip()` = the letter's "Show all". The letter
  page (`LoveLetter`) no longer types; memory pages sequence title/date/message; `Reveal`
  threshold 0.25. QA: `qa-output/tmp/pace.mjs`.
- **Q** (`CondenseMotes.tsx`): the music box's sheet condenses out of its tune's light (see
  STORYBOARD Q); `CARRY.orb` has no flight (`air`), `MUSIC_NOTES` come earlier, `open.orb` 4.4.

## Design references (`reference/`)

- `reference/VIDEO_ANALYSIS.md` — the owner's reference videos, analysed (3 in the first
  batch, then videos 5 and 6 in sections F-H). The files live in `reference/videos/`,
  git-ignored; `node scripts/video-frames.mjs reference/videos --fps=2 --sheet` tears them
  into frames to look at.
- `reference/awesome-design-md/` — a copy (no git history) of
  https://github.com/VoltAgent/awesome-design-md (commit `fcc7028`, MIT): ~80 `DESIGN.md`
  files describing well-known sites' design systems (`design-md/<brand>/`). The owner added
  it as reading material; it is not part of the build. Don't copy a brand's identity —
  take principles only, and keep this site's own voice (Cormorant, wine/champagne).

## Project skills (`.claude/skills/`)

35 skills from https://github.com/mengto/skills (MIT, commit `a45892d`) — only the ones that
fit this site (the other 143 were removed), one folder per skill so Claude Code finds them on
its own (index: `.claude/skills/README.md`). E.g. `video-to-superprompt`, `iterate-until-verified`,
`optimize-web-animations`, `optimize-threejs-games`, `3d-wood-material`, `3d-paper-material`,
`no-ai-design-slop`. They are generic: when one disagrees with this file (theme, palette,
push-to-main), this file wins.

## The final surprise (after the finale's last words)

A forward-only state machine in `App.tsx` (`advanceSurprise`, allowed moves only;
`surpriseSeen` ref so it runs once per visit): `secret` → (last line + `surprise.delay` s)
`quiet` → 3 s → `question` → her answer: `sure` ("I think so." → "Are you sure?", the gift
peeks, then "There's more?") or straight to `reveal` → 10.5 s → `waiting` (stays).
`FinalePhase` / `SURPRISE_PHASES` in `types.ts`. All words in `birthdayConfig.surprise`.
- Words: `FinalReveal.tsx` (`.surprise*` in experience.css): "ink" reveal (clip + blur, delay
  via the `--d` CSS var because reveal lines run two animations), glass answer buttons with
  hover / focus-visible / press / selected (the other answer fades), focus moves to the first
  answer, then into the words (`tabIndex=-1`) once the buttons are gone.
- 3D: `FinalWorld` — the orb stops turning and eases to face her, a warm light (`beacon`)
  leaves the orb and settles below it, the camera dollies down; on reveal the camera moves to
  `FinalGift.tsx` (wine paper, champagne satin via `surface()`, flat bow loops, notched tails
  that stir, a blank card, a light pool), the orb is hushed (`hush`), ParticleField quietens.
  `waiting` reframes so the gift sits in the upper third above the last words.
- Lights: no light added — `finaleLights` (sceneStore) steers the shared rig: the top spot
  becomes the gift's warm key, `hush` dims the rims/key/env. Music ducks (`sound.duck`).
- QA: `node qa-output/surprise.mjs W H [mobile] [path=a|b] [reduced] [again]` (seeds a visit with
  every gift open, runs to the waiting scene; `again` re-enters the finale and checks it does not
  run twice). `scripts/qa-keyboard.mjs` walks it by keyboard (and now waits for the iris, not `.veil`).

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
node scripts/qa-keyboard.mjs --gpu   # (without --gpu: swiftshader, ~2 fps — it can time out)
node scripts/qa-handoff.mjs --gpu    # K: every gift's sheet → page handoff, measured
node scripts/qa-return.mjs --gpu     # J1: back to the room from the finale, N times
node scripts/qa-qr.mjs
node scripts/qa-perf.mjs --gpu                       # entering the room must not stall
node scripts/qa-transitions.mjs --gpu                # frame strips of every change of world
```

`qa-output/` is git-ignored (screenshots and a few throwaway helper scripts live there).
Close-up puppy shots were made by loading `?reset&debug`, tapping the centre, waiting
~7 s, then setting the puppy group's `rotation.y` via `window.__scene` and screenshotting
a clip at `deviceScaleFactor: 4`.
