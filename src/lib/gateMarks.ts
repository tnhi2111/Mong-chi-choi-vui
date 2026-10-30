/**
 * Where the password screen's WRITING is on screen, so the light can write it (storyboard
 * G). Written by PasswordGate (DOM), read by IntroWorld (3D). No three.js here on purpose:
 * this is imported by the page's main chunk.
 *
 * There is no card and no frame any more — only two lines of light:
 *  • `write` — the line the words sit on (the leader runs along it and the words appear
 *    behind it, as if the stroke were writing them);
 *  • `line`  — the thin rule she types on, with the slots for the digits.
 */
export interface Mark {
  /** Screen px: the left end of the stroke, its right end, and the height it runs at. */
  left: number;
  right: number;
  top: number;
}

export interface GateMarks {
  write: Mark;
  line: Mark;
}

export const gateMarks = {
  marks: null as GateMarks | null,
  /** Bumped on every new layout, so a world can tell a new one from the one it already flew. */
  version: 0,
};

export function publishGateMarks(marks: GateMarks | null) {
  gateMarks.marks = marks;
  gateMarks.version++;
}
