/**
 * Boot of the tool gallery (tools.html): the page's viewer under the capture contract (docs/design/spec.md, Query contract), the yard without the placeholder block, the gallery, the bench and the strike demonstration.
 * `shot=1` and `autoplay=0` hold the demo still at a strike with chips in flight; `cam=` frames whatever the capture asks for, else the camera takes in the whole gallery.
 */
import { BoxGeometry, Mesh } from 'three';
import type { Object3D, Scene } from 'three';

import { EMPTY_FACTS, publishFacts } from '../../viewer/facts';
import { readViewerQuery } from '../../viewer/query';
import { PLACEHOLDER_BLOCK, createViewer } from '../../viewer/scene';
import { DEMO_STILL_SECONDS, STRIKES_PER_SECOND, createStrikeDemo } from './demo';
import { buildGallery } from './gallery';

const query = readViewerQuery();
for (const problem of query.problems) console.warn(problem);
publishFacts({ ...EMPTY_FACTS, queryProblems: query.problems });

const viewer = createViewer(document.body, { shot: query.shot, cam: query.cam });
removePlaceholderBlock(viewer.scene);
const gallery = buildGallery(viewer.scene);
const demo = createStrikeDemo(viewer.scene);

if (query.cam === null) {
  viewer.camera.position.set(0.5, 1.9, 3.4);
  viewer.controls.target.set(0, 0.2, -1.4);
  viewer.controls.update();
}

const still = query.shot || !query.autoplay;
demo.setTime(DEMO_STILL_SECONDS);
gallery.animate((DEMO_STILL_SECONDS * STRIKES_PER_SECOND) % 1);
if (!still) {
  const started = performance.now();
  const tick = (now: number): void => {
    const seconds = (now - started) / 1000;
    demo.setTime(seconds);
    gallery.animate((seconds * STRIKES_PER_SECOND) % 1);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

viewer.start();

/** The page's scene carries a placeholder block at the origin; the gallery stands there instead. */
function removePlaceholderBlock(scene: Scene): void {
  const isMesh = (object: Object3D): object is Mesh => object instanceof Mesh;
  const block = scene.children.find((child) => isMesh(child) && child.geometry instanceof BoxGeometry && Math.abs(child.geometry.parameters.height - PLACEHOLDER_BLOCK.height) < 1e-9);
  if (block !== undefined) scene.remove(block);
}
