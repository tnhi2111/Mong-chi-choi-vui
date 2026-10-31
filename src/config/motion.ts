/**
 * Every duration and easing of the big moves, in one place, so they can be tuned without
 * hunting through the scene code. Seconds (3D, read by the worlds) or milliseconds (the
 * page, read by App / CSS variables) — each field says which.
 *
 * The numbers come from the reference videos (`reference/VIDEO_ANALYSIS.md`): a change of
 * world runs 0.9–1.4 s, a line of copy steps in 250–350 ms, a small thing answers in
 * 120–200 ms, and nothing ever lands at the same moment as anything else.
 */

/**
 * ONE KNOB FOR THE WHOLE PACE. 1.0 is the pace this site is written at; 1.2 makes every
 * change of scene a fifth longer, 0.8 a fifth shorter. Every duration below goes through
 * `t()` (seconds) or `ms()` (milliseconds), so the knob reaches all of them.
 *
 * Why a knob at all: the owner watches this a hundred times and his wife will watch it
 * once. What is "slow" for him is the first time for her.
 */
const TEMPO = 1.0;
const t = (seconds: number) => Math.round(seconds * TEMPO * 1000) / 1000;
const ms = (milliseconds: number) => Math.round(milliseconds * TEMPO);

/** The curves the page uses (CSS `transition-timing-function`). */
export const ease = {
  /** Out: starts fast, settles — for anything arriving. */
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** In-out: for a move that both leaves and arrives. */
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
};

export const motion = {
  /** The pace knob above, so code that computes its own timings can use it too. */
  tempo: TEMPO,

  /**
   * A — the third touch: the heart opens, and the password card condenses out of its light.
   * Seconds, measured from the touch. The heart never leaves the frame.
   */
  unlock: {
    /** The breath in: the heart contracts and holds (long enough to be a held beat). */
    anticipate: t(0.38),
    /** How much it contracts (fraction of its size). */
    contract: 0.06,
    /** The heart opens like a flower and closes again: petals out, petals home. */
    release: t(2.1),
    /** How far the light travels (world units, scaled by the heart's size). */
    reach: 0.72,
    /** Petals: how many the light opens into, and how far round each one twists as it opens. */
    petals: 6,
    petalTwist: 0.9,
    /** How long one petal waits behind the one before (fraction of the bloom). */
    petalStagger: 0.22,
    /** The camera leans into the core while the heart is open: lens narrows by this much. */
    lensIn: 7,
    /** …and comes this much closer (fraction of its distance). */
    push: 0.12,
    /** It also arcs round the heart by this much (radians ≈ 41°) and cranes down from above. */
    arc: 0.72,
    craneUp: 0.5,
    /** The heart shrinks and drifts to the place it keeps on the password screen. */
    settle: t(1.5),
    /** When the words begin to be written (App switches the stage here). */
    gateAt: t(3.75),
    /** How long each line takes to condense out of the light (ms — CSS reads this). */
    cardMs: ms(900),
    /** Each line of the card follows the one before by this long (ms). */
    cardStaggerMs: ms(260),
    /** A star falling from the heart into a slot as she types (ms). */
    sparkMs: ms(620),
    /** Reduced motion: the whole thing, told quickly. */
    quick: { release: t(0.45), settle: t(0.4), gateAt: t(0.95) },
  },

  /**
   * B — the password is right: the card is drawn back into the heart, the light streaks
   * across the screen, and the room lands out of it. Seconds unless the name says ms.
   */
  enterRoom: {
    /** The card breaks into light and is pulled into the heart (ms — CSS and App). */
    gatherMs: 500,
    /** The streak: light flies past the camera in three layers. */
    streak: 1.5,
    /** The room settles out of the light (starts once the camera can see the room). */
    land: 1.9,
    /** The camera pulls back to show the whole room, lens opening again. */
    reveal: 0.9,
    /** Reduced motion / no WebGL: one short glow instead of the streaks (ms). */
    quickMs: 600,
  },

  /**
   * I — opening a gift: every one takes its own time, and the memory page opens out of the
   * thing that came out of it (no flash, no cut). Seconds.
   *
   * Why so long: a gift is the one thing in this room she is meant to linger over. Each
   * number is "how long the object itself takes to let go of what is inside".
   */
  gift: {
    /** The opening, per shape (the App's safety net is read from here too). */
    // (K3: the owner found the box slow. Press → the page standing straight is now ≈ 3.5–4.5 s:
    //  the opening, then `carry.pageMs` while the page straightens out of the sheet.)
    open: { box: t(3.0), capsule: t(3.0), star: t(3.1), orb: t(3.0), envelope: t(5.4) },
    /** A held beat before the thing inside comes out (the breath before it gives). */
    hold: t(0.5),
    /** The memory page grows out of the thing on screen (ms — CSS reads it). */
    pageMs: ms(750),
    /** Closing runs the same way back, a little slower. */
    closeMs: ms(950),
    /**
     * K — the sheet that comes out of the gift IS the page. It flies to `dist` m in front of
     * the lens and stops at `hand` of the page's size, leaning back by `tilt` rad — still a
     * thing in the world, in perspective — and there the page takes it over (≤ 2 px) and
     * straightens out of it. `arc`: how high its flight bows (m). `dogSecs`: the puppy's
     * letter's flight from the envelope to her.
     */
    carry: { dist: 1.15, hand: 0.5, tilt: 0.16, arc: 0.1, dogSecs: t(1.3) },
    /** Reduced motion / no WebGL: one short opening. */
    quick: t(1.4),
  },

  /**
   * V — ONE touch, one movement, from the gift to the page she reads. The sheet starts to come
   * out while the gift is still opening (`start`, s of the gift's own opening), flies like
   * paper in the wind on a half circle drawn in the camera's frame — out of the gift, out to
   * the LEFT (`left`, NDC), up (`top`), and in to the middle — unrolling / unfolding as it
   * flies (`unfold`, fractions of the flight), and arrives as the page: its place, its size,
   * at `dist` m. The page takes it over at `hand` of the flight, still moving, and carries
   * its speed on for `glide` ms. Why: the owner did not want to touch twice, nor any stop.
   */
  /**
   * Y2 — the letter flies like a feather (overrides W2/X's pace and V's path): it leaves the
   * gift as if a breath of air lifted it, and drifts 5–6.5 s on a half circle from the left to
   * the middle of the screen — slow and even (strong air drag: any quick movement dies away),
   * swaying like a pendulum (the tilt leads, the drift follows), bobbing, turning slowly in 3D,
   * stirred by a soft low wind; always coming closer to the middle. It lies flat only in the
   * last ~12 % and is handed to the page while still drifting, so slowly the seam cannot be
   * seen. Touch → first line readable ≈ 8–9 s. Every curve is C² (quintic easing, sines).
   */
  paper: {
    /** when the sheet leaves the gift (s into its opening; the lid takes ~1 s) */
    start: { box: t(0.6), capsule: t(0.6), star: t(0.6), orb: t(0.75), envelope: 0 },
    /** the flight (s) */
    dur: t(6.4),
    /** handed to the page at this fraction of the flight (still drifting — the page takes
     *  ~0.35 s to mount, so it really takes over at ~96 %) */
    hand: 0.9,
    /** the page settles over this (ms); its words start at `inkAt` of it */
    glide: ms(1300),
    inkAt: 0.7,
    /** closing: how much faster it flies back */
    back: 2.2,
    /** the page's distance in front of the lens (m); the half circle starts at `left` (NDC)
     *  and comes over the top into the page's middle (`arc`: its height × its radius); the
     *  sheet leaves the gift and blends into it over `lead` of the way */
    dist: 1.15,
    left: [-0.62, -0.08],
    arc: 0.8,
    lead: 0.32,
    /** its forward speed: built up over `lift` of the flight (air lifting it), even, then the
     *  drag slows it from `dragFrom` to `terminal` × its cruise, and in the last `rest` it comes
     *  softly to rest (a slow device that mounts the page late sees it settle, not brake) */
    lift: 0.16,
    dragFrom: 0.5,
    terminal: 0.14,
    rest: 0.04,
    /** the pendulum: period (s), side-to-side (× screen width), bob (× the screen's shorter
     *  side), the tilt that leads the drift (rad — ≤ 14°) */
    sway: { period: t(2.0), amp: 0.042, bob: 0.014, roll: 0.22 },
    /** slow turns in 3D (rad: yaw ≤ 70°, pitch ≤ 25°) */
    turn: { yaw: 0.95, pitch: 0.32 },
    /** the wind's slow wander (× the screen's shorter side) */
    gust: 0.012,
    /** the sway, turns and wind die down by here (fraction of the flight) */
    settle: 0.86,
    /** it unrolls while it flies; flat only by `unfold[1]` (the last ~12 %) */
    unfold: [0.04, 0.88],
    /** the trail: two paler sheets following its path (s behind, size, opacity) */
    trail: { lag: [0.32, 0.64], size: [0.9, 0.8], alpha: [0.16, 0.08] },
    /** the music box: its light becomes the sheet in the first part of the flight (s) */
    condense: t(0.6),
  },
  /**
   * P3 — reading pace for the words on a page: a line takes clamp(base + chars × perChar,
   * min, max) seconds; lines at least `gap` apart; a new paragraph rests `para` more.
   */
  reading: { base: 0.6, perChar: 0.025, min: 0.8, max: 2.2, gap: 0.35, para: 0.6, inView: 0.25, fastForward: 6 },

  /**
   * L — words that arrive as light (`LightText`). Why: a line that fades in is information; a
   * line that light gathers into is a gift. Each word lands a beat after the one before (the
   * reading pace), the motes hold for a breath on its shape, then the real word takes over.
   * Seconds / px.
   */
  lightText: {
    /** between one word and the next */
    stagger: t(0.075),
    /** a mote's flight from the hero to its place in the word */
    flight: t(0.85),
    /** how wide the cloud of light it leaves the hero as (px) */
    spread: 70,
    /** how far a mote's path bows (px) */
    bend: 180,
    /** the motes hold on the word, then fade as the word takes over */
    hold: t(0.12),
    fade: t(0.4),
    /** sparks a blooming word lets fall */
    sparks: 5,
    /** most motes one line may use (×0.6 on a phone) */
    maxMotes: 1600,
  },

  /**
   * J — the hidden moments (the cake, the sign): the camera frames the thing by its REAL
   * bounds for THIS screen, in the part of the screen its words do not use.
   *
   * Why: fixed distances framed one window shape well and cut the cake off at the bottom, or
   * let the words sit on the sign, on another. The screen is split in two areas — the subject
   * and its words — and the subject is fitted into its own (NDC, -1…1, y up).
   */
  moment: {
    /** How much of its area the subject may fill (the rest is air round it). */
    fill: 0.82,
    /** How far above the subject the camera looks down from (radians), [landscape, portrait].
     *  (On a phone the camera stands far back from the sign, so it rises and looks OVER the
     *  orb — level, it would look through the orb's light.) */
    // (W: the gifts sink away during a moment, and the sign hangs above them — its camera
    //  looks up at it a little, as one looks at a sign on a wall)
    //  (a phone stands far back: level, it would look through the orb's light — a little down)
    //  (W4: the cake moment frames the whole table; the camera stands a little above its top
    //  and looks down only slightly)
    //  (Y: the cake — the camera ~0.85 m above the table's top (a person standing by it),
    //  looking down ~8.6°; scripts/qa-cake-table.mjs holds it to -8°…-14°)
    elev: { cake: [0.15, 0.15], sign: [-0.06, 0.2] },
    /** The words appear only once the camera has arrived (s after the touch). */
    textAfter: t(1.6),
    /** The subject's area and where its words sit: [landscape, portrait]. */
    cake: {
      /** Y: its own lens (deg, [landscape, portrait]). (The frame is fitted to the cake's and
       *  table's real vertices — RoomWorld `frameBox(…, pts)` — not their world box, which at
       *  the table's 45° was √2 too wide and stood the camera ~1 m too far back and high.) */
      fov: [40, 56],
      /** How much of the table is framed under its top (m): Z1 — the cloth, the whole column
       *  and most of its foot (she wants to SEE the table); only the foot's last few cm are cut,
       *  which keeps the floor ≤ 25 % (16 % desktop, 23 % phone). */
      below: 0.66,
      // (Y: y reaches below the frame on purpose — with `fill` the box shrinks about the
      //  area's centre, and this puts its lower edge, `below` under the top, right on the
      //  frame's edge. On a phone the frame is tall and the table must fit its width: the
      //  camera stands further back (~2 m up) and the words sit above the cake; putting them
      //  under it brought the camera down but filled 33–41 % of the frame with floor.)
      area: [
        { x: [-0.98, 0.34], y: [-1.2, 1.0] },
        { x: [-0.95, 0.95], y: [-1.06, 0.56] },
      ],
      text: [
        [0.6, 0.05],
        [0, 0.5],
      ],
    },
    /** The sign: its words under it, the band they need measured from the words (px). */
    sign: { top: 0.9, sides: 0.94, gapPx: 28, bottomPx: 34 },
    /** A warm key on the cake while she is close to it (0 = only its own candles). */
    cakeKey: 0.55,
  },

  /**
   * C — her hand in the room: nothing is a button. Resting near a thing brings the camera
   * to it; a thing has weight when it answers.
   */
  hand: {
    /** How long the pointer must rest near a thing before the camera leans in (ms). */
    dwellMs: 250,
    /** How much closer the camera comes while she rests on it (fraction of its distance). */
    approach: 0.1,
    /** How far the thing itself leans toward her (radians). */
    lean: 0.12,
    /** Springs: [stiffness, damping] per weight class — a ribbon answers faster than a box. */
    spring: { light: [12, 0.8], heavy: [7, 0.9] },
  },
  /**
   * D — the light sprite: a flock with a leader, born from the heart, that leads the camera
   * through every change of world (`spriteFlight.ts`, `LightSprite.tsx`). Seconds / metres.
   *
   * Why a leader: motion with an intention and a character reads as alive; a cloud that
   * moves all at once reads as an effect. The flock trails the leader with its own lag per
   * mote (a comet's tail), plus a divergence-free flow so it curls instead of shaking.
   */
  sprite: {
    /** How much path history the shader can read (s). The longest tail is this long. */
    history: 1.6,
    /** Motes in the flock at quality high (scaled down by the tier). */
    count: 2200,
    /** Share of motes that draw ribbons round the leader / orbit the camera. */
    ribbons: 0.22,
    orbiters: 0.08,
    /** The swarm's tail: how far behind the leader its last motes trail (s of history). */
    tail: 0.7,
    /** How wide the tail opens at its end (m) — a comet widens as it trails. */
    spread: 0.42,
    /** Ribbon radius round the path (m) and how many turns per second of history. */
    ribbonR: 0.16,
    ribbonTwist: 7.5,
    /** The corridor into the room: radius of the spiral tunnel (m), turns per second of history. */
    corridorR: 1.05,
    corridorTwist: 3.2,
    /** A thing the leader passes wakes: light radius (m) and how its afterglow falls off along the trail. */
    wakeRadius: 1.8,
    wakeTrail: [1, 0.55, 0.3, 0.14] as const,
    /** …sampled this far back along the path (s). */
    wakeLags: [0, 0.3, 0.7, 1.2] as const,

    /** Heart → password: the leader leaves the heart, WRITES the words (a stroke that runs
     *  left to right under them, which the writing is revealed along), underlines the place
     *  she types, and goes home. */
    card: { leave: t(0.95), write: t(1.5), line: t(0.6), home: t(0.9), depth: 1.35 },
    /** Welcome → room: out of the heart into the corridor (until the room is ready), then
     *  the tour round the room, then up into the orb. */
    room: { leave: t(1.6), tour: t(6.2), rise: t(1.5), entryZ: 3.4 },
    /** Room → finale: out of the orb to the arched window and through it; the finale is
     *  swapped in when the camera is `swapAt` m from the glass (the night fills the frame). */
    window: { reach: 2.3, through: 1.0, swapAt: 0.45 },
  },

  /**
   * The camera as someone running after the leader (CameraRig's own springs carry it).
   * Why each number: a lag of ~0.25 s is how long a person takes to react to where a thing
   * went; looking a little ahead of it lets the leader lead the frame instead of escaping
   * it; banking with sideways acceleration is what a body does on a curve (4° reads as
   * motion, more reads as a drone); a 0.15° breath at 0.3 Hz is under notice but takes the
   * machine out of the shot; the lens widening with speed is the "rush" a runner feels.
   */
  follow: {
    lag: 0.25,
    lookahead: 0.32,
    /** Behind and above the lagged point (m). */
    back: 1.25,
    up: 0.28,
    /** Max roll (degrees) and how strongly sideways acceleration (m/s²) maps onto it. */
    rollMax: 4,
    rollGain: 0.55,
    breathDeg: 0.15,
    breathHz: 0.3,
    /** Lens: base fov, and how much it widens per m/s of leader speed, capped. */
    fov: 44,
    fovGain: 2.6,
    fovMax: 9,
    /** CameraRig spring speed while following (higher = tighter on the lagged target). */
    speed: 3.2,
  },
} as const;

export type Motion = typeof motion;
