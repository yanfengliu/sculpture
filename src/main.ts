/**
 * Boot: read the query, publish the facts, build the viewer, start rendering.
 * Scaffold stage: the yard and a placeholder block under the capture contract; the plan, player and UI arrive with their owners (docs/design/spec.md, Modules and ownership).
 */
import { EMPTY_FACTS, publishFacts } from './viewer/facts';
import { readViewerQuery } from './viewer/query';
import { createViewer } from './viewer/scene';

const query = readViewerQuery();
for (const problem of query.problems) console.warn(problem);

publishFacts({ ...EMPTY_FACTS, queryProblems: query.problems });

createViewer(document.body, { shot: query.shot, cam: query.cam }).start();
