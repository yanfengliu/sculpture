/**
 * Fetches the David mesh recorded in docs/research/mesh-sources.md (candidate 1, Wikimedia Commons) into `assets/cache/david/` (ignored by git).
 *
 * Steps (the note's "Fetch steps for the script"): query the Commons API and stop if size, SHA-1 or licence short name differ from the recorded values; GET the STL with a descriptive User-Agent naming this repo and no contact address; verify the SHA-1 and delete the file if it differs; write `SOURCE.json` with the attribution beside it.
 * A cached file with the right SHA-1 is kept and the download skipped; the API is then queried only when `SOURCE.json` is missing.
 * Nothing under the cache directory is ever executed or imported; it is data for scripts/build-grid.mjs.
 *
 * Usage: node scripts/fetch-model.mjs
 * Exit:  0 the file is in place with the recorded SHA-1 and SOURCE.json is written; 1 the record changed, the download failed or the hash differs.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const RECORD = Object.freeze({
  title: 'David (Michelangelo).stl',
  author: 'Scan the World (Jonathan Beck)',
  pageUrl: 'https://commons.wikimedia.org/wiki/File:David_(Michelangelo).stl',
  apiUrl: 'https://commons.wikimedia.org/w/api.php?action=query&titles=File:David_(Michelangelo).stl&prop=imageinfo&iiprop=url|size|sha1|mime|timestamp|extmetadata&format=json',
  fileUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/David_%28Michelangelo%29.stl',
  size: 59_997_484,
  sha1: '4d9648fad3882ea2fcb5c17232ef4826b23c045c',
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  attribution: 'Scan the World (Jonathan Beck) @ MyMiniFactory.com, "David (Michelangelo).stl", via Wikimedia Commons, CC BY-SA 4.0; modified (scaled, rotated, hole-filled) for the sculpture repo',
});

/** Wikimedia's User-Agent policy wants a descriptive agent; the repo URL is the contact, never an address. */
export const USER_AGENT = 'sculpture-model-pipeline/0.1 (https://github.com/yanfengliu/sculpture)';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_DIR = join(REPO_ROOT, 'assets', 'cache', 'david');
export const MESH_PATH = join(CACHE_DIR, 'David_(Michelangelo).stl');
export const SOURCE_PATH = join(CACHE_DIR, 'SOURCE.json');

const API_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000;

function log(message) {
  console.log(`fetch-model: ${message}`);
}

/** SHA-1 of a file on disk, hex, streamed so the 60 MB file is never held twice. */
async function sha1File(path) {
  const hash = createHash('sha1');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Pulls the fields the check needs out of the Commons API answer, or throws naming what is missing. */
export function readImageInfo(answer) {
  const pages = answer?.query?.pages;
  const page = pages ? Object.values(pages)[0] : undefined;
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`the Commons API answer has no imageinfo for ${RECORD.pageUrl}; the file may have been deleted or renamed. Re-read docs/research/mesh-sources.md.`);
  const meta = info.extmetadata ?? {};
  return {
    size: Number(info.size),
    sha1: String(info.sha1 ?? ''),
    url: String(info.url ?? ''),
    licence: String(meta.LicenseShortName?.value ?? ''),
    licenceUrl: String(meta.LicenseUrl?.value ?? ''),
    timestamp: String(info.timestamp ?? ''),
  };
}

/** The differences between the API record and RECORD, as messages; empty when the file is still the one the research note read. */
export function recordDifferences(info) {
  const problems = [];
  if (info.size !== RECORD.size) problems.push(`size is ${String(info.size)} bytes, the note recorded ${String(RECORD.size)}`);
  if (info.sha1 !== RECORD.sha1) problems.push(`SHA-1 is ${info.sha1}, the note recorded ${RECORD.sha1}`);
  if (info.licence !== RECORD.licence) problems.push(`licence short name is "${info.licence}", the note recorded "${RECORD.licence}"`);
  return problems;
}

async function checkCommonsRecord() {
  log(`querying ${RECORD.apiUrl}`);
  const response = await fetch(RECORD.apiUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`the Commons API answered ${String(response.status)} ${response.statusText} for ${RECORD.apiUrl}; retry later or check the URL in docs/research/mesh-sources.md.`);
  const info = readImageInfo(await response.json());
  const problems = recordDifferences(info);
  if (problems.length > 0) {
    throw new Error(`the Commons file record changed, so the file was replaced and its licence must be re-read before it is used: ${problems.join('; ')}. Update docs/research/mesh-sources.md and RECORD in scripts/fetch-model.mjs together.`);
  }
  log(`Commons record matches the note: ${String(info.size)} bytes, SHA-1 ${info.sha1}, ${info.licence}, uploaded ${info.timestamp}`);
  if (info.url !== RECORD.fileUrl) log(`note: the API reports the file URL ${info.url}; downloading the recorded ${RECORD.fileUrl}`);
  return info;
}

async function download() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const partPath = `${MESH_PATH}.part`;
  log(`GET ${RECORD.fileUrl} (${(RECORD.size / 1e6).toFixed(1)} MB) with User-Agent "${USER_AGENT}"`);
  const started = performance.now();
  const response = await fetch(RECORD.fileUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`the download answered ${String(response.status)} ${response.statusText} for ${RECORD.fileUrl}; retry later.`);
  const length = Number(response.headers.get('content-length') ?? RECORD.size);
  if (length !== RECORD.size) throw new Error(`the download announces ${String(length)} bytes, the note recorded ${String(RECORD.size)}; the file was replaced, re-read its licence.`);
  const hash = createHash('sha1');
  let received = 0;
  let nextReport = 10e6;
  const tally = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      if (received >= nextReport) {
        log(`  ${(received / 1e6).toFixed(0)} MB`);
        nextReport += 10e6;
      }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), tally, createWriteStream(partPath));
  const seconds = (performance.now() - started) / 1000;
  log(`received ${String(received)} bytes in ${seconds.toFixed(1)} s (${(received / 1e6 / seconds).toFixed(1)} MB/s)`);
  const digest = hash.digest('hex');
  if (received !== RECORD.size || digest !== RECORD.sha1) {
    unlinkSync(partPath);
    throw new Error(`the downloaded file has ${String(received)} bytes and SHA-1 ${digest}; the note recorded ${String(RECORD.size)} bytes and ${RECORD.sha1}. Deleted it: the file was replaced or the transfer was corrupted.`);
  }
  if (existsSync(MESH_PATH)) unlinkSync(MESH_PATH);
  renameSync(partPath, MESH_PATH);
  return digest;
}

/** The record scripts/build-grid.mjs copies into the grid header's `source` block (src/contracts/grid.ts, GridSource) plus the size and the page. */
export function sourceRecord(sha1, fetchedAt, info) {
  return {
    title: RECORD.title,
    author: RECORD.author,
    url: RECORD.fileUrl,
    pageUrl: RECORD.pageUrl,
    size: RECORD.size,
    sha1,
    fetchedAt,
    licence: RECORD.licence,
    licenceUrl: info?.licenceUrl || RECORD.licenceUrl,
    attribution: RECORD.attribution,
  };
}

async function main() {
  let cachedSha1 = null;
  if (existsSync(MESH_PATH)) {
    const size = statSync(MESH_PATH).size;
    const digest = await sha1File(MESH_PATH);
    if (size === RECORD.size && digest === RECORD.sha1) {
      cachedSha1 = digest;
      log(`cached ${MESH_PATH} has the recorded size and SHA-1; skipping the download`);
    } else {
      log(`cached ${MESH_PATH} has ${String(size)} bytes and SHA-1 ${digest}, not the recorded values; fetching again`);
    }
  }
  if (cachedSha1 !== null && existsSync(SOURCE_PATH)) {
    const record = JSON.parse(readFileSync(SOURCE_PATH, 'utf8'));
    log(`SOURCE.json present (fetched ${String(record.fetchedAt)}); nothing to do`);
    return;
  }
  const info = await checkCommonsRecord();
  const sha1 = cachedSha1 ?? (await download());
  const record = sourceRecord(sha1, new Date().toISOString(), info);
  writeFileSync(SOURCE_PATH, `${JSON.stringify(record, null, 2)}\n`);
  log(`wrote ${SOURCE_PATH}`);
  log(`attribution: ${RECORD.attribution}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`fetch-model: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
