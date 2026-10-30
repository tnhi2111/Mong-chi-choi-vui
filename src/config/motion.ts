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
    open: { box: t(5.4), capsule: t(5.0), star: t(5.2), orb: t(5.6), envelope: t(6.4) },
    /** A held beat before the thing inside comes out (the breath before it gives). */
    hold: t(0.5),
    /** The memory page grows out of the thing on screen (ms — CSS reads it). */
    pageMs: ms(900),
    /** Closing runs the same way back, a little slower. */
    closeMs: ms(1050),
    /** Reduced motion / no WebGL: one short opening. */
    quick: t(1.4),
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
