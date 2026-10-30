/**
 * L — where the light that writes the words comes from: the hero of the world she is in (the
 * heart in the intro, the orb in the finale), on screen, in px. The 3D worlds write it each
 * frame; LightText reads it when a line begins. No three.js here.
 */
export const lightOrigin = {
  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight * 0.4 : 0,
  /** false until a world has written it (then the middle of the screen is used) */
  set: false,
};

export function setLightOrigin(x: number, y: number) {
  lightOrigin.x = x;
  lightOrigin.y = y;
  lightOrigin.set = true;
}
