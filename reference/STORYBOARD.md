# Storyboard — the two changes of scene, and her hand in the room

Drawn from the reference videos (`VIDEO_ANALYSIS.md`): the hero never leaves the frame, a
change of scene is a move *through* a material of this world, big type sits between the hero
and the backdrop, and nothing lands at the same moment as anything else. Timings live in
`src/config/motion.ts` — change them there, not in the scene code.

---

## A. The third touch → the password (2.4 s)

| t (s) | Frame | What is happening |
|---|---|---|
| 0.00 | The heart, whole, her finger on it | The third touch lands. A chime, then the heart **contracts 5.5 % and holds** — the breath in. Nothing else moves. |
| 0.15 | The heart, tight, the ring beneath it still | The held beat. The sky behind it is already brightening. |
| 0.15–0.75 | Threads of light leaving the heart | It opens: every point of light spirals outward on its own delay (0.62 units, the far ones last), turning as it goes. The camera leans in — 12 % closer, lens narrowing 7° — so the light passes **around** her view, not away from it. |
| 0.75–1.20 | The threads curving home | They turn and come back; the heart is brightest here. The sky is at its brightest. |
| 1.20–2.20 | The heart smaller, drifting down and back | It shrinks to the size it keeps on the password screen and settles into that place. The lens opens back to 40°. The ring of words beneath it goes quiet. |
| 2.20–3.00 | The card condensing under the heart | A pool of its light gathers where the card will be; the field's edge **sharpens out of blur** (760 ms), then the lines of writing arrive one after another (120 ms apart). The heart breathes above it. |

**Why:** the card is made of the heart's own light, so the change has a cause. The eye never
loses the heart, so it reads as one place, not two screens.

---

## B. The password is right → the room (3.9 s)

| t (s) | Frame | What is happening |
|---|---|---|
| 0.00 | The card, the right answer | The heart rings once (a beat), the card's light drains downward into it: the writing dissolves, the field's edge softens and is **pulled into the heart** (500 ms). |
| 0.50 | The heart alone, swelling | It takes the light in and brightens. The camera begins to slide forward. |
| 0.50–2.00 | Light streaking past | Thousands of motes stretch into streaks and fly past the camera in **three layers at different speeds** (near ones long and fast, far ones short and slow), tilted with the camera's travel. The old world is gone behind them; the room's colour is already inside them. |
| 2.00–3.60 | The streaks slowing, surfaces appearing | The streaks brake and the room **lands out of them from the centre outward** through a torn, noisy edge: floor and rug first, then the round wall and the arched window, then the cake table, the balloons, the garland. |
| 3.60 | The candles catching | The candles light last — the room's own warmth arrives after its shapes. The heart has become the orb of memories at the centre. |
| 3.60–4.50 | The whole room | The camera pulls back and the lens opens; the dark at the edges retreats. Dragging turns the room again. |

**Why:** the room is built out of the same light she just touched, in an order a builder
would use (ground, walls, furniture, light), so the brain reads "this place was made for
me", not "a new page loaded".

Reduced motion / no WebGL: one short glow (600 ms) instead of the streaks.

---

## C. Her hand in the room

| Moment | What it does | Why |
|---|---|---|
| The pointer rests near a thing for 250 ms | The camera comes 10 % closer and the thing leans 0.12 rad toward her, on a spring whose stiffness matches its weight (a ribbon answers faster than a box) | Interest before action: a hand slows down before it touches |
| Scroll / pinch | Zooms toward the point under the cursor, with inertia, and never pushes through a surface | A zoom that ignores where you are looking feels like a UI, not a room |
| Touching a gift | Not "open": the lid is lifted, the ribbon pulls loose, the light inside spills out as it goes | Weight and consequence |
| Any answer | A sound, and the contact shadow under the thing tightens or loosens with it | Light and sound are how a real object proves it moved |

---

## D. The light sprite leads the whole story

One leader of light and its flock (`lightSprite.ts` — the brain, `LightSprite.tsx` — one
points draw, `spriteScripts.ts` — the flights). Every number in `src/config/motion.ts`
(`motion.sprite`, `motion.follow`).

**Why a leader:** motion with an intention and a character reads as alive; a cloud that moves
all at once reads as an effect. So there is one leader on a path (CatmullRom, flown at
constant arc speed, eased), and every mote of the flock is *somewhere back along the path the
leader really flew* (1.6 s of it is recorded and read by the shader) — a comet's tail that
follows the curve, plus a divergence-free flow so it curls like smoke instead of shaking.
A few strands wind round the path as ribbons; a few motes circle the camera, so she is inside
the flock, not watching it.

**The camera is someone running after it** (CameraRig's own springs, blended in on a spring):
it aims at the point the leader was 0.25 s ago (the time a person takes to react), sits 1.25 m
behind and 0.28 m above it, looks 0.32 s *ahead* of the leader (so the leader leads the frame
instead of escaping it), banks up to 4° with sideways acceleration (a body on a curve), breathes
0.15° at 0.3 Hz, and widens its lens up to 9° with speed (the rush). It never cuts: a change of
world under the camera is a change of coordinates (`rebaseCamera`, `sprite.rebase`) while
everything in view is the flock, and the next world's rig carries on the last rig's springs —
velocity included.

**Waking:** the room's shaders read four points along the leader's recent path (`uWake`) and
glow warm where it is and where it just was (1, 0.55, 0.3, 0.14 — a flare that settles), and a
build angle (`uBuild`): the stretch of the room it has not flown past yet waits at half light
(22 % was tried first: measured 70–78 % near-black frames inside the room — too dark).
Set pieces (sign, cake, sideboard group) rise 0.35 m into place and open from 82 % size as it
passes. No real lights are added.

### D1. Heart → password (3.0 s from the third touch's settle)

| t (s) | Frame | What happens | Why |
|---|---|---|---|
| 0.00 | The heart, small, drifting to its place above the card | The card is laid out but empty; the leader is born at the heart's core | the card must be made BY something we can see |
| 0.00–0.55 | A spark leaves the heart in a small rising curl | `card.leave`: out of the heart, eased out | a departure needs a curl (intention), not a straight line |
| 0.55 | The spark at the top centre of where the card will be | The frame starts here — the SVG stroke and the leader start together | one start point, so the eye ties stroke and light |
| 0.55–1.65 | The spark running clockwise round a rounded rectangle, a gold line drawn behind it | `card.draw` at constant speed, the SVG `stroke-dashoffset` linear over the same time; ribbons trail the corners | the same path, the same speed: the light IS the pen |
| 1.65–2.35 | The spark curls home into the heart; the line cools to a hairline | `card.home`; the camera's head had turned 5 % toward it and turns back | the light goes back to where it came from: the card belongs to the heart |
| 1.50–2.40 | The writing condenses inside the frame, line by line | condense (760 ms, 120 ms stagger) starts 150 ms before the frame closes | the content arrives once its container exists — never together |

### D2. Password → room (≈ 1.4 s corridor + compile + 4.2 s tour + 1.3 s rise)

| t (s) | Frame | What happens | Why |
|---|---|---|---|
| 0.00 | The welcome, the heart above "Step inside" | The camera steps back 4 % (the breath in); the leader is born in the heart | announce the move |
| 0.19–1.40 | The leader dives out of the heart into depth; the camera chases; the flock turns into a spiral tunnel around the path | `room.leave` (eased in), `uCorridor` → 1 (radius 1.05 m, 3.2 turns/s of history, reaching 0.9 s ahead of the leader); the dark closes at the edges (`TransitionDust` `veil`) | the corridor is the material the change travels through |
| 1.40–(ready) | Inside the corridor, still flying | The intro world is swapped for the room under the camera; the leader holds its heading until the room has compiled | the swap is invisible: everything in view is the flock |
| ready | The corridor opening into the dim room, from its front | Leader, camera and its springs move into the room's coordinates (entry 2.8 m in front of the orb, so the follower lands inside the wall) | no cut: same speed, same view |
| ready–+4.2 | The leader flies left past the arched window, the sign, the balloons, the cake; each wakes (flare, then full light) and the set pieces rise into place | `room.tour`, build sweep by angle; the light that draws the room (RoomBuild) lands where the leader just passed | a builder's walk round the room, piece by piece, instead of everything landing at once |
| +4.2–+5.5 | The leader rises over the stage and sinks into the orb; the camera lets go and pulls back to the room's framing | `room.rise`; build `finish` sweeps the rest; `room-home` frees her hand | the heart became the orb: the light goes home |

### D3. Room → finale (≈ 2.3 s reach + ~1 s through the glass)

| t (s) | Frame | What happens | Why |
|---|---|---|---|
| 0.00 | The room, the orb at its middle | The camera steps back (the breath in); the leader is born in the orb | the same hero as always |
| 0.19–1.2 | The leader rises over the sign, curls left | camera follows (1.15 m behind, lens +2°) | intention: it is going somewhere |
| 1.2–2.3 | Past the window corner's lamp and armchair, the arched window grows in the frame | the flock is a tail, the camera banks into the curl | the room is shown once more on the way out |
| 2.3–3.0 | The leader goes into the glass; the flock spreads into the night beyond it as stars | `uStars` → 0.6 (fixed points on a far sphere, behind the wall: seen only through the window) | the finale's sky is made of the flock |
| ~3.0 | The night fills the frame | the camera is 0.45 m from the glass → `window` → the finale is swapped in, moved so its orb lies straight ahead along the view; the page's night layer (`.night-wash`, the window's blues) is under the first frames | no cut: the same stars, the same direction |
| 3.0–6.0 | The night washing into the finale's wine; the leader flies on into the finale's orb, which gathers | `finaleArrivalScript`; `uStars` → 1 then the flock fades as the finale's own stars take over | a colour wash as the change of scene (reference video 5) |

**Reduced motion / no WebGL / ?quality=low:** reduced motion keeps the short dives and the
quick glow (no flight); no WebGL keeps the CSS iris; low quality flies the same paths with a
quarter of the motes.

---

## E. The room is a room (this pass)

### E1. Hero pieces — what she will look at closely, and how each is built now

| Piece | Mesh | Mechanism (why it reads as a thing, not a block) |
|---|---|---|
| Cake | own merged mesh (`cakeModel`), own shader lit by its flames | candles blow out by a gesture now (E/F4); exploded view (hidden) |
| Box gift (01) | own group; lid on a real back-edge hinge | **bow tails: 2 × 10-segment Verlet satin bands** (`RibbonTails`, `verlet.ts`) draped over the lid and down its front, simulated in the lid's space so they ride the lid open; gravity and the lid's own jolts are felt; her hand sweeps them |
| Bottle (02) | lathe glass, cork, twine, rolled note | **rose water inside** (`Liquid`): Fresnel rim, Beer–Lambert colour by chord thickness, room light through it, a domed meniscus |
| Journal (03) | cover + pages hinged | paper fibres up close (props shader) |
| Music box (04) | walnut, brass, lid hinge | **visible mechanism**: brass drum with 28 pins turning, **12-tooth steel comb**; the tooth for each note played shivers and stills (95 rad/s, e⁻⁵ᵗ) |
| Puppy (05) | separate SDF meshes (unchanged this pass) | — |
| Balloons | own meshes | **Verlet string** (12 points, slack 2 %) tied at the floor, held at the knot; the **arched window mirrored in the latex** (a cool panel with its glazing cross, by reflection vector) |
| Fairy lights | points + **a real cable** | each span hangs in a **catenary** (cosh), bulbs on stems under it; cable and bulbs share one sway function (`GARLAND_SWAY`), pushed by her hand's wind |
| Candles | own merged meshes | unchanged (melted rim, drip, soft contact shadow) |
| Arched window | was painted only | **a built frame** (`ArchedWindow`: extruded arch with depth + bevel, glazing cross, deep sill) in front of the painted night, **a pane** that catches the warm room (Fresnel + a sheen that slides with the eye), and a **moon shaft** (an open cone, additive, drifting dust) to the moonlit pool on the floor |
| Floor | shader | planks had seams; now **bevelled edges** (one side lit, one in shade) and, near the camera only, **open pores and fine rays** |
| Furniture | one merged mesh (kept: far from the eye) | near the camera: wood pores and figure, paper fibres |

Kept merged on purpose: the furniture (one draw call), the walls, the sign's letters.

### E3. Light without new lights
- **Reflections from the room itself** (`RoomEnvironment` in Lights): a dark box with bright cards
  exactly where the room's lamps, sconces, candles, window and sign are, PMREM-filtered once
  2.5 s after start (same size as the default → no recompile), swapped in while in the room.
- Moon shaft (above), dust (existing `Dust`), candle light (existing), contact shadows (existing).

### E4. Detail by distance
Wood pores/figure and paper fibres fade in only within ~1–4 m of the camera (shader
`smoothstep` on camera distance) — no textures loaded, nothing paid for from across the room.

## F. The pointer is a hand

| What | How | Why |
|---|---|---|
| A hand in the room | `roomHand` (sceneStore): the pointer's ray, presence, speed and sideways "wind"; a finger on a phone counts too | one shared hand: everything answers the same gesture |
| Things give way | gifts: a few cm on a spring with friction, lighter ones more (same weight as their lids), and they tilt; ropes (`Rope.nudge`), curtains (vertex shader), garland (shared sway), balloons and their strings, flames, dust | a hand moves air and touches things |
| One table | `giftRing`: a push travels round the ring, **80 ms a step, ×0.6 each step**; three different gifts in one 0.7 s stroke **turn the whole ring** on its inertia (spring back, friction) | a display table, not five buttons |
| A hand you can feel | a warm glow where the ray passes close to a surface (`handGlow`), a warm pool on the floor under it and the **soft shadow of a hand** held above (`handFloor`); the existing cursor light gives the moving highlight on glossy things | light and shadow prove something is there |
| Focus follows the hand | zoomed in (wheel/pinch), the camera's eyes drift toward what the pointer is over, on a spring (`nudge` in CameraRig); only the look moves, so it never passes through anything | a zoom that ignores where she looks feels like UI |
| Blowing the candles | a quick sweep across the flames (> 0.14 s fast within 0.32 m) or a hand held still over them for 1.6 s | the gesture you would make |

---

## G. The third touch → the password (≈5.5 s, no card)

The owner: *"chậm lại, nhìn 3D hơn, bỏ cái khung vuông, cần cách nối huyền ảo hơn."* So the
card is gone: what she reads is written by the light that just left the heart. Timings in
`motion.unlock` / `motion.sprite.card`, all of them through the one `tempo` knob.

| t (s) | Frame | What is happening |
|---|---|---|
| 0.00–0.38 | the heart, whole, her finger on it | The third touch. It **contracts 6 % and holds** — a beat long enough to be a held breath, not a flinch. |
| 0.38–1.4 | petals opening | It opens **like a flower**: the light is divided into 6 petals by the angle each point stands at, and each petal opens a beat (0.22) after the one before, swinging outward and rolling about its own axis. Meanwhile the camera **arcs 41° round the heart and cranes up**, so the light is seen from a moving point of view — that is what makes it read as a body instead of a picture — and the ring of words below passes across the lens (the parallax). |
| 1.4–2.5 | petals folding home | They come home on the same sine, so nothing starts or stops with a jerk. The camera finishes its arc and settles back to her eye line. |
| 2.5–3.75 | the heart smaller, drifting | It shrinks to 0.55 and takes the place it will keep above the writing — before there is any writing. |
| 3.75–4.7 | a light leaves the heart | One point of light spirals out, up and over, and arrives travelling the way writing goes. |
| 4.7–6.2 | **the words are written** | The light runs along the line the words sit on; the writing is uncovered behind the nib (a mask that opens left to right, with the nib's glow on it). There is no card, no frame, no panel — only the words. |
| 6.2–7.3 | the rule and the slots | It drops to the line she types on and draws it as it runs along (a thin rule of light), with **eight slots of starlight** under it — one per digit of the date. |
| 7.3–8.2 | home | The light climbs back into the heart and goes quiet. |

While she types, **each digit lands as a star falling from the heart** into its slot. A wrong
answer makes the stars scatter like startled fireflies and settle back; the right one draws
everything up into the heart (storyboard B takes over from there).

Accessibility: the real `<input>` is still the input — the rule, the slots and the stars are
a drawing of it. It takes focus as soon as the light reaches the words (and after 1.6 s
whatever happens to the flight), so a keyboard never waits for an animation. Without WebGL
or with reduced motion the words simply rise (`is-plain`).

---

## H. The room is not there until the light brings it (≈11 s)

The owner: *"phòng phải BAN ĐẦU TRỐNG HOÀN TOÀN, chỉ hiện dần theo đường bay của ánh sáng."*
Empty means **not drawn** — not dimmed. Timings in `motion.sprite.room`.

| t (s) | Frame | What is happening |
|---|---|---|
| 0.0–1.6 | the welcome, then dark | The light leaves the heart, dives away and opens a corridor; the room is mounted and compiled behind it but **nothing of it is drawn**. |
| 1.6–2.5 | the corridor | It flies on, waiting for the room to be ready. The screen is the light, its flock, and the dark. |
| 2.5–4.5 | the first surfaces | The flight enters the room. Where the leader has passed, the floor and the stage exist; where it has not, the shader **discards** the fragment. The edge is waved by a few smooth sines, so the room comes in along a torn line of light. |
| 4.5–7 | the left side, then the window | The bookcase corner, the armchair, the rug; then the arched window with the moon behind it. Each standing thing (`BuildGate`) waits for the leader to reach ITS angle, then grows into place with a touch of overshoot. |
| 7–9.5 | the back wall, the sign, the balloons, the cake | The garland lights along the leader's path; the HAPPY BIRTHDAY sign comes up under it; the candles catch **near the end**, so the room's warmth arrives after its shapes and there is never a dark beat. |
| 9.5–11 | the gifts and the orb | The five gifts appear round the ring, and the leader rises into the middle of the room and **becomes the orb** — the flight ends on the thing it made. |
| 11–12.5 | the whole room | The camera pulls back and hands control to her. |

Measured (`qa-output/tmp/tour.mjs`, which counts the room's standing things as it films):
at 10 % of the tour **1 of 25**, at 30 % **3 of 25**, at 50 % 6, at 70 % 15, at 100 % 25.

Second pass — each thing arrives in its own way (`BuildGate` `mode` + `pivot`, so it grows
from where it stands, never from the middle of the room):
- the **wall rises like a curtain** behind the light: its shader discards everything above a
  height that climbs from the floor to 3.6 m as the sweep passes its angle (a thin line of
  light rides the top edge); the **ceiling** comes last, after the wall under it;
- the **gifts fall as seeds** (`drop`): a small seed of each drops out of the air onto its
  place and blooms into the gift;
- the **cake rises** from its table (`rise`: height first, then it fills out);
- the **balloons swell** from their knots (pivot at the knot); the garland and the window grow
  about their hooks/frame; candle flames simply **catch** (`pop`) near the end.

Still not built (stated plainly): planks unrolling one by one, the window frame drawn before
its glass fills with night, garland bulbs lighting one at a time, the cake tier by tier.

GPU note: the ceiling/wall reveal is written out inline in each shader. Calling a shared GLSL
helper from the ceiling (`spriteRise(vWorld * 0.9)`) hung the GPU on Windows' D3D backend
(WebGL context lost ~3.7 s into the room → white screen). Keep these tests inline.

---

## I. Opening a gift (5–6.5 s each)

The owner: *"không loé sáng rồi nhảy sang bức thư."* Timings in `motion.gift`.

Shared by all five:
- **Its own clock**: `motion.gift.open[shape]` (box 5.4 s, bottle 5.0, journal 5.2, music box
  5.6, letter 6.4). Real seconds are warped (`openWarp` in Gift3D): it rises onto its light
  (10 %), **holds its breath** ~0.5 s (the plateau where the light gathers), its mechanism
  works (to 76 %), and what is inside comes to her slowest of all.
- **The page opens out of the object**: while it opens, Gift3D leaves the object's place and
  size on screen (`src/lib/giftMark.ts`); the memory page (`useGiftOrigin`) starts as a
  clipped circle exactly there and widens to the full screen (`.sheet.from-gift`,
  `sheet-grow`), arriving from transparent — the gift's light widening, not a panel over it.
- App's safety net waits for that gift's own duration (+1.2 s), not a fixed 3.5 s.

| t (box 01) | What happens |
|---|---|
| 0–0.5 s | it rises onto the pedestal; its name comes up behind it |
| 0.5–1.0 s | held: the light gathers, nothing else moves but the light |
| 1.0–2.7 s | the lid pops and is **lifted off**, up and away over the back, out of the frame |
| 2.5–4.3 s | the **four walls, hinged at the base, fall open like petals**, one a beat after the other; the inside is lined in the ribbon's wine satin |
| 3.4–5.4 s | **little pictures** (blank — an image of memories, never content) rise out on a spiral |
| 5.4–6.3 s | the memory page widens out of the box |

The other four (second pass), each into the same widening page, each with its sound
(`audio.ts`: `cork`, `paper`, `seal`, `hinge`, `satin`, `comb` — filtered noise + tiny tones):
- **02 bottle**: the twine loosens and slips down the neck, the cork pops (`cork`), the rolled
  note rises out of the neck, **unrolls** (`paper`) and the page widens from the scroll.
- **03 journal**: the cover opens, the **gilt star lifts off** the cover with a trail of light,
  **seven pages flick** fast then slower, each bending as it turns (`paper`), a **dotted
  journey line** draws itself across the open spread, and the page widens from it.
- **04 music box**: the lid lifts (`hinge`), the drum turns; on each of 8 notes (`comb`) a mote
  leaves the comb and a **ripple** spreads on the velvet; the page widens from the box's mouth.
- **05 letter** (the puppy): after it lays the letter down, the **wax seal glows and cracks in
  two** (`seal`), the flap lifts, the letter **slides out, rises toward her and unfolds its
  folds** (`paper`), and the letter page widens from the sheet; its words still ink in.

**Closing runs it backwards, slower**: the page shrinks back into the object
(`.sheet.is-closing`, `motion.gift.closeMs`), and the gift's own clock runs down through the
same warp (×1.8) — pages, lid, cork go back, then it sinks onto the ring.

Not built: the box's satin ribbon untying in an S-curve (the lid is lifted off with the bow).

---

## P. The letter floats, and opens only when she touches it

The owner: *"thư khi mở ra và các note trong thư cuộn ra QUÁ NHANH"* — a magic sheet, light,
floating, opened by a spell. Numbers: `motion.letter`, `motion.reading`.

| t | What happens |
|---|---|
| 0 – ~1.3 s | the gift's own mechanism, as quick as before (box walls 0.9–1.3 s, lid, cork, cover…) |
| ~1.3 – 3.0 s | the sheet leaves the gift (1.2–1.6 s of flight, easing in) — still folded — and comes to rest a little above the middle of the frame (`hoverDist` 1.75 m, `hoverSize` 0.34 of the page, `hoverRise` 0.06) |
| waiting | it floats: a 0.6 Hz bob of 2.5 % of its height, ±2° sway on two axes, its edges stirring in the air (`wind`), a gilt edge with a bead of gold running round it and breathing (0.45 Hz) — the "touch me" — motes orbiting it. Pointer on it: it lifts 4 % and warms. It does NOT open by itself… |
| touch / Enter / Space | …until she touches it (an invisible button laid over the sheet, `LetterPrompt`, focused for the keyboard, labelled for screen readers) — or after 10 s (`autoOpen`), so she is never stuck |
| + 0 – 2.7 s | it opens (`open` 2.7 s): it moves toward her and squares up; the outer crease opens over 1.55 s (eased in and out, long tail), the inner one 0.25 s later; the sheet bows while it opens, then lies flat with one small bounce; motes fall from it; the gold, the air and the edge fade out by 85 % |
| + 2.7 s | the page takes it over (K's handoff, ≤ 2 px), then straightens (eased in and out: it starts from still) |
| page | the words come at a reading pace: each line clamp(0.6 + chars × 0.025, 0.8, 2.2) s, lines ≥ 0.35 s apart, a paragraph rests 0.6 s more (`LightSeq`); notes in a timeline appear when a quarter of them scrolls into view; a touch on words still arriving brings them in ×6 quicker |

The letter's clocks are real seconds: the tap that opens it must not hurry it (the gift's
scene has already ended). Reduced motion: no sheet; the page slides in short, flat.

## Q. The music box: its tune makes the letter

There is no letter in the music box. The lid lifts quickly (0.08 → 0.3 of a 4.4 s opening);
the comb plays 8 notes (0.22 → 0.72), and every note lets a cluster of ~95 motes go up out of
the box's mouth (`CondenseMotes`: 760 points, each with its own delay after its note and its
own flight of 1.15–1.6 s on a rising Bézier with a slow curl). They land on points sampled on
the face of a folded sheet floating ABOVE the box (`hoverRiseAir` 0.2 of the frame); from
0.86 of the opening the real sheet appears from its middle outward (`reveal`, a soft torn
edge) and the motes it covers go out. Then it is P exactly: it floats, waits for her touch,
opens its three folds, becomes the page. On the page, each line begins on a note of a gentle
cadence (6-4-1-4-6) — the reading pace is not forced to keep time. Closing runs the clock
back: the light flies home into the box.

## R. A pink, cloud-soft cake

- **R1 "the cake is missing"** — measured, not guessed (`scripts/qa-cake.mjs`: resumed, led in,
  the cake moment touched for real, all gifts open, back from the finale; desktop and phone):
  the cake mesh is drawn in every one, its shader compiles at every quality tier (only D3D's
  harmless X4122 warnings), nothing is in front of it in the moment. What reads as "missing"
  is that from the default view it is small at the back right and, on a phone with all gifts
  open, the slowly turning room can carry it past the frame's edge. The cake is now bigger and
  brighter (pink, number candles, heart) so it reads from across the room; the test stays.
- **R2** — strawberry-cream pinks (#f2aebc lower, #f7c3cd upper), whipped-cream tiers with a
  full round shoulder, a domed top and a puff at mid-height; shells, piped roses, sugar pearls,
  small cream flowers, a glossy strawberry glaze in a few streams with round drops, glossy
  strawberries and raspberries, blueberries, gold leaf; a heart topper of rose-gold wire;
  **number candles** moulded from her age in the config (pink wax, a wick and a flame each:
  the shader is lit by 6 flames now); slim candles round the edge; a white porcelain stand on
  a foot, crumbs, soft contact shadows, a served slice. Cream: wrapped light, a satin sheen,
  light through its edge, palette-knife marks, a whipped micro-normal only within ~2.6 m.
  **It gives under her finger**: pressing (or a finger passing over it) dents the cream where
  it is touched (`uPress`, frosting only) on a spring that springs back past and settles.

## S. The sign hangs higher; nothing stands in front of it

The sign hangs 0.25 m higher (`SIGN_PLACEMENT.drop` 0.07 / 0.5) on its cables, its alcove's
arch raised with it (2.45 + 0.5); the sign moment's camera looks down from higher
(`motion.moment.elev.sign` 0.15 / 0.26), so the gifts and the music box fall below the frame.
`scripts/qa-sign.mjs` casts rays from the camera to a 5 × 5 grid over the lettering in the
default view and the moment, wide and tall: 25 / 25 seen in all four, no gift in front.

## V. One touch, one movement from the gift to the page (replaces P's float and K's handoff)

The owner: no second touch, no stop, no blank sheet waiting — the paper flies out like paper in
the wind, on a half circle from the left into the middle, unrolls as it comes and IS the page.
Numbers: `motion.flight`.

| t (box) | What happens |
|---|---|
| 0 – 1.2 s | the gift opens with her press, quick as before |
| 0.85 s → | the sheet starts to come out while the walls are still opening (`start` per gift: bottle 0.55, journal 0.7, music box 0.75, box 0.85; the puppy's letter once it is out of the envelope) |
| 0.85 – 2.85 s | its flight (`dur` 2.0 s): a centripetal Catmull-Rom curve in the CAMERA's frame (gift mouth → NDC (−0.66, −0.05) → (−0.14, 0.34) → the page's centre at 1.15 m), sampled by arc length on an eased-in-and-out clock that never stops; a slow wind wander that dies down (× (1−k)^1.5); it turns to face her early and banks into the curve (≤ 0.32 rad); it grows into the page late in its flight (so it never leaves the frame at the top); it unfolds / unrolls WHILE it flies (`unfold` 0.14 → 0.84, the second crease 0.12 later), its edges stir, faint lines of gilt writing on it (an image of writing — never blank), motes fall in its wake |
| 2.65 s (`hand` 0.9) | still moving, it is handed to the page (≤ 1.4 px); the page carries on with the sheet's own corner velocities (Hermite per corner, `glide` 480 ms) and comes to rest |
| + 0.17 s | the page's layout fades in while it settles; the words then come at the reading pace |

The music box's light condenses onto the sheet in the first 0.6 s of its flight (its notes come
right after the lid, the motes are quick and land on the moving sheet). Closing flies the sheet
back the same way (×1.5), and only then does the gift close (it used to start closing early and
then jump back open when the sheet arrived). The room's dimmed edges (`.room-focus`) lift as the
sheet grows into the page (`html[data-sheet=near]`): the page above them is not dimmed, and at
the handoff the two must be lit alike — the sheet's own shading is taken against the lens's
axis for the same reason (a big sheet close to the lens darkened toward its edges).
Removed: the float, the "touch me" breath, `LetterPrompt`, the 10 s auto-open, `motion.letter`.
