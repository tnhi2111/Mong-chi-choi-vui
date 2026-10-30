/**
 * Where the thing that came out of a gift is on screen when the memory takes over
 * (storyboard I). Written by Gift3D (3D), read by the memory page (DOM), so the page can
 * open FROM it — the same element carried from the world into the page, instead of a sheet
 * sliding over a scene. No three.js here: the page's main chunk imports it.
 */
export interface GiftMark {
  /** Screen px: the middle of the thing, and how big it is. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its colour, so the page can open in the same light. */
  tint: string;
}

export const giftMark = {
  at: null as GiftMark | null,
};

export function publishGiftMark(at: GiftMark | null) {
  giftMark.at = at;
}
