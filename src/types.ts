export type Stage = 'intro' | 'gate' | 'welcome' | 'room' | 'final';
/**
 * The finale, in order. After 'secret' (the last words) comes the final surprise:
 *  quiet    — the world grows still, a light leaves the orb (the transition)
 *  question — "Do you think this is the last surprise?"
 *  sure     — she answered "I think so." → "Are you sure?" (a gift begins to show)
 *  reveal   — "There's more?" → the gift box, "…can't be opened through a screen", "Look around you."
 *  waiting  — the last words, then a nearly still scene while the real gift is given
 */
export type FinalePhase = 'gather' | 'formed' | 'secret' | 'quiet' | 'question' | 'sure' | 'reveal' | 'waiting';
/** The final surprise's phases (they only ever move forward). */
export const SURPRISE_PHASES: readonly FinalePhase[] = ['quiet', 'question', 'sure', 'reveal', 'waiting'];
/**
 * How the page covers a change of world. 'iris' is the only one used between stages: the
 * screen closes in wine-dark from the edges onto the hero light (the heart, the orb) the
 * camera is diving into, and opens again from that same light in the next world.
 */
export type Veil = 'none' | 'iris';
