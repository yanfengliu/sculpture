/**
 * The simple materials the tool models share, one instance each, built lazily so a Node test that never renders still gets them.
 * Colours only, no textures: the repo forbids imported photo textures and the models read by their shape and size.
 */
import { DoubleSide, MeshStandardMaterial } from 'three';

export type MaterialId = 'steel' | 'iron' | 'wood' | 'straw' | 'leather' | 'pumice' | 'charcoal' | 'gold' | 'cord' | 'hair' | 'wax' | 'card' | 'lead';

interface MaterialSpec {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly doubleSide?: boolean;
}

const SPECS: Readonly<Record<MaterialId, MaterialSpec>> = {
  steel: { color: 0x5a5c5e, roughness: 0.55, metalness: 0.85 }, // worn dark steel at the working ends
  iron: { color: 0x3b3a39, roughness: 0.75, metalness: 0.7 }, // forged iron shanks and the mallet head
  wood: { color: 0x8a6a42, roughness: 0.85, metalness: 0 },
  straw: { color: 0xd4b76a, roughness: 0.95, metalness: 0 },
  leather: { color: 0x6b4a2e, roughness: 0.9, metalness: 0 },
  pumice: { color: 0x8f8d88, roughness: 1, metalness: 0 },
  charcoal: { color: 0x1a1816, roughness: 1, metalness: 0 },
  gold: { color: 0xe3b94a, roughness: 0.3, metalness: 0.35, doubleSide: true }, // not fully metallic: with no environment map a metal reflects nothing and renders black
  cord: { color: 0xb8a98a, roughness: 1, metalness: 0 },
  hair: { color: 0x7a5a3a, roughness: 1, metalness: 0 },
  wax: { color: 0xb9865c, roughness: 0.6, metalness: 0 },
  card: { color: 0xc9b89a, roughness: 0.9, metalness: 0 },
  lead: { color: 0x6e7074, roughness: 0.5, metalness: 0.8 },
};

const cache = new Map<MaterialId, MeshStandardMaterial>();

export function material(id: MaterialId): MeshStandardMaterial {
  let found = cache.get(id);
  if (found === undefined) {
    const spec = SPECS[id];
    found = new MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness, flatShading: true });
    if (spec.doubleSide === true) found.side = DoubleSide;
    found.name = id;
    cache.set(id, found);
  }
  return found;
}
