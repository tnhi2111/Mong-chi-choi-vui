/**
 * Critically damped spring: starts gently, arrives without overshoot.
 * Unlike a plain lerp, velocity is continuous — no jolt when a target changes.
 * (The camera rig's springs, shared with the light sprite: one kind of spring in the scene.)
 */
export class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, omega: number, dt: number) {
    const f = 1 + 2 * dt * omega;
    const hoo = dt * omega * omega;
    const detInv = 1 / (f + dt * hoo);
    const x = (f * this.x + dt * this.v + dt * hoo * target) * detInv;
    this.v = (this.v + hoo * (target - this.x)) * detInv;
    this.x = x;
    return x;
  }
}
