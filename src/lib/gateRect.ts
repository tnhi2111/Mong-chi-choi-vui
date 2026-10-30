/**
 * Where the password card's frame is on screen, so the light sprite can draw it (storyboard
 * D3.1). Written by PasswordGate (DOM), read by IntroWorld (3D). No three.js here on purpose:
 * this is imported by the page's main chunk.
 */
export interface CardRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

export const gateRect = {
  rect: null as CardRect | null,
  /** Bumped on every new card, so a world can tell a new one from the one it already drew. */
  version: 0,
};

export function publishGateRect(rect: CardRect | null) {
  gateRect.rect = rect;
  gateRect.version++;
}
