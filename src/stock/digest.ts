/**
 * FNV-1a over the fields of a plan's blows (docs/design/spec.md, Blows, strokes and steps): the plan digest tests compare, and the seeds the steps' generators get.
 * The numbers are hashed as their IEEE-754 bytes, so two plans differ in the digest if any blow differs in any bit.
 */
import type { Blow } from '../contracts/making';

export const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const scratch = new DataView(new ArrayBuffer(8));

export function fnvByte(hash: number, byte: number): number {
  return Math.imul(hash ^ (byte & 0xff), FNV_PRIME) >>> 0;
}

export function fnvNumber(hash: number, value: number): number {
  scratch.setFloat64(0, value, true);
  let h = hash;
  for (let b = 0; b < 8; b += 1) h = fnvByte(h, scratch.getUint8(b));
  return h;
}

export function fnvText(hash: number, text: string): number {
  let h = hash;
  for (let c = 0; c < text.length; c += 1) {
    const code = text.charCodeAt(c);
    h = fnvByte(fnvByte(h, code & 0xff), code >>> 8);
  }
  return h;
}

/** Folds one blow's fields into the running hash. */
export function fnvBlow(hash: number, blow: Blow): number {
  let h = fnvText(hash, blow.tool);
  for (const v of blow.point) h = fnvNumber(h, v);
  for (const v of blow.normal) h = fnvNumber(h, v);
  for (const v of blow.direction) h = fnvNumber(h, v);
  h = fnvNumber(h, blow.size);
  return fnvNumber(h, blow.stroke);
}

/** Folds every value of a typed array into the hash, for the determinism tests. */
export function fnvArray(hash: number, values: ArrayLike<number>): number {
  let h = hash;
  for (let n = 0; n < values.length; n += 1) h = fnvNumber(h, values[n] ?? 0);
  return h;
}

export function fnvHex(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** A step's seed from its id, so a step's plan depends on the step and not on its position in the list. */
export function seedOf(id: string): number {
  return fnvText(FNV_OFFSET, id);
}
