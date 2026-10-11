/**
 * Worker-thread entry for the sampler: receives the shared hierarchy, normals, lattice and output buffer from scripts/build-grid.mjs, samples its slabs and reports the count. All buffers are SharedArrayBuffers, so nothing is copied.
 */
import { parentPort, workerData } from 'node:worker_threads';

import { sampleSlabs } from './sample.mjs';

const { bvh, normals, lattice, slabs, out } = workerData;
const sampled = sampleSlabs(bvh, normals, lattice, slabs, out);
parentPort?.postMessage({ sampled });
