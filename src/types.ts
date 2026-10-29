export type Stage = 'intro' | 'gate' | 'welcome' | 'room' | 'final';
export type FinalePhase = 'gather' | 'formed' | 'secret';
/**
 * How the page covers a change of world. 'iris' is the only one used between stages: the
 * screen closes in wine-dark from the edges onto the hero light (the heart, the orb) the
 * camera is diving into, and opens again from that same light in the next world.
 */
export type Veil = 'none' | 'iris';
