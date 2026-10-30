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
