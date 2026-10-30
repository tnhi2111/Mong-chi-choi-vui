import { mapPoint, type Quad } from '../src/lib/carrier.ts';
// the page's box must land on the 3D sheet's corners exactly (K: ≤ 2 px at the handoff)
const quads: Quad[] = [
  [[100, 80], [500, 95], [480, 620], [120, 600]],
  [[10, 10], [300, 10], [300, 400], [10, 400]],
  [[200, 300], [260, 290], [270, 380], [205, 395]],
];
let bad = 0;
for (const q of quads) {
  const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  uv.forEach(([u, v], i) => {
    const [x, y] = mapPoint(720, 900, q, u, v);
    const err = Math.hypot(x - q[i][0], y - q[i][1]);
    if (err > 0.01) { bad++; console.log('FAIL', JSON.stringify(q), i, x, y); }
  });
}
console.log(bad ? `${bad} failures` : `carrier: homography lands on all ${quads.length * 4} corners`);
if (bad) process.exitCode = 1;
