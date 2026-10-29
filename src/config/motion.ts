/**
 * Every duration and easing of the big moves, in one place, so they can be tuned without
 * hunting through the scene code. Seconds (3D, read by the worlds) or milliseconds (the
 * page, read by App / CSS variables) — each field says which.
 *
 * The numbers come from the reference videos (`reference/VIDEO_ANALYSIS.md`): a change of
 * world runs 0.9–1.4 s, a line of copy steps in 250–350 ms, a small thing answers in
 * 120–200 ms, and nothing ever lands at the same moment as anything else.
 */

/** The curves the page uses (CSS `transition-timing-function`). */
export const ease = {
  /** Out: starts fast, settles — for anything arriving. */
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** In-out: for a move that both leaves and arrives. */
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
};

export const motion = {
  /**
   * A — the third touch: the heart opens, and the password card condenses out of its light.
   * Seconds, measured from the touch. The heart never leaves the frame.
   */
  unlock: {
    /** The breath in: the heart contracts and holds. */
    anticipate: 0.15,
    /** How much it contracts (fraction of its size). */
    contract: 0.055,
    /** Threads of light spiral out of the heart and come home. */
    release: 1.05,
    /** How far they travel (world units, scaled by the heart's size). */
    reach: 0.62,
    /** The camera leans into the core while the light is out: lens narrows by this many degrees. */
    lensIn: 7,
    /** …and comes this much closer (fraction of its distance). */
    push: 0.12,
    /** The heart shrinks and drifts to the place it keeps on the password screen. */
    settle: 1.0,
    /** When the password card starts to condense (App switches the stage here). */
    gateAt: 2.0,
    /** How long the card takes to condense out of the light (ms — CSS reads this). */
    cardMs: 760,
    /** Each line of the card follows the one before by this long (ms). */
    cardStaggerMs: 120,
    /** Reduced motion: the whole thing, told quickly. */
    quick: { release: 0.3, settle: 0.35, gateAt: 0.75 },
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
} as const;

export type Motion = typeof motion;
