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
