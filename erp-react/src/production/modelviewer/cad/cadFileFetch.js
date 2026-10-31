/**
 * cadFileFetch.js — race-safe fetch of the ORIGINAL file bytes for the
 * browser-side CAD viewing path (ported from the Designing module, adapted to
 * Mech R&D: files resolve through the local session registry / attachment URL
 * — no authenticated backend call).
 *
 *  - `generation` — monotonic module counter: the viewer drops results from
 *    superseded selections (a slow response for file A can never attach after
 *    file B was requested).
 *  - the response is validated (magic bytes vs requested format) BEFORE
 *    parsing, so wrong content fails with a clear error instead of a confusing
 *    parser message.
 */

import { validateCadBytes } from './cadContentValidation.js';

const moduleGeneration = { value: 0 };
let nextFetchId = 0;

/**
 * Fetch a file URL as bytes.
 *
 * @param {string} url blob:/data:/http(s) URL of the file (unique per file)
 * @param {AbortSignal} [signal]
 * @param {{ format?: string, fileName?: string, mimeType?: string,
 *           expectedSize?: number, fileId?: string }} [meta]
 * @returns {Promise<{ bytes: Uint8Array, isCurrent: () => boolean, fetchId: number }>}
 */
export async function fetchCadFileBytes(url, signal, meta = {}) {
  const generation = moduleGeneration.value + 1;
  moduleGeneration.value = generation;
  const fetchId = (nextFetchId += 1);

  if (!url || (!url.startsWith('blob:') && !url.startsWith('data:') && !/^https?:/i.test(url))) {
    throw new Error('No loadable file URL for this drawing record.');
  }

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching the model file.`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const validation = validateCadBytes(bytes, meta.format, meta);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = `CAD_CONTENT_${validation.code}`;
    throw error;
  }

  return {
    bytes,
    isCurrent: () => moduleGeneration.value === generation,
    fetchId,
  };
}
