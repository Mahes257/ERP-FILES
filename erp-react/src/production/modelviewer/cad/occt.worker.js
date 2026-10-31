/**
 * occt.worker.js — CAD tessellation Web Worker (ported from the Designing
 * module). Loads the OpenCascade WebAssembly importer (occt-import-js) once,
 * parses STEP / IGES / BREP files off the main thread, converts the OCCT JSON
 * arrays into compact typed arrays (still inside the worker) and transfers
 * them to the main thread zero-copy.
 *
 * Protocol
 *   in:  { requestId, format, buffer: Uint8Array, params? }
 *   out: { requestId, type: 'stage', stage: 'wasm' | 'parse' }
 *        { requestId, type: 'build', done, total }         (real progress)
 *        { requestId, ok: true, result }                   (transferred)
 *        { requestId, ok: false, error }
 */

import occtimportjs from 'occt-import-js/dist/occt-import-js.js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import { toFloat32Array, toIndexArray } from './cadTypedArrays.js';

const FORMATS = new Set(['step', 'iges', 'brep']);

let occtPromise = null;

/** Instantiate the WASM module lazily, once per worker lifetime. */
function getOcct() {
  if (!occtPromise) {
    occtPromise = occtimportjs({
      locateFile: (path) => (path.endsWith('.wasm') ? occtWasmUrl : path),
    });
  }
  return occtPromise;
}

function fail(requestId, error) {
  self.postMessage({ requestId, ok: false, error });
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const requestId = data.requestId;
  if (typeof requestId !== 'number') return;

  const format = data.format;
  let bytes = data.buffer;

  if (!FORMATS.has(format)) {
    fail(requestId, `Unsupported CAD format "${format}" for the OCCT importer.`);
    return;
  }
  if (!(bytes instanceof Uint8Array)) {
    fail(requestId, 'CAD worker expected a Uint8Array file payload.');
    return;
  }

  try {
    const post = (message, transfer) => self.postMessage(message, transfer || []);

    post({ requestId, type: 'stage', stage: 'wasm' });
    const occt = await getOcct();

    post({ requestId, type: 'stage', stage: 'parse' });
    let result;
    try {
      result = occt.ReadFile(format, bytes, {
        linearUnit: 'millimeter',
        linearDeflectionType: 'bounding_box_ratio',
        linearDeflection: data.params?.linearDeflection ?? 0.005,
        angularDeflection: data.params?.angularDeflection ?? 0.15,
      });
    } catch (readErr) {
      // ReadFile can throw on OOM or corrupt WASM heap for very complex
      // assemblies.  Return a clear message instead of crashing the worker.
      fail(requestId, `The CAD parser failed while reading the file: ${readErr?.message || readErr}. The assembly may be too complex for browser-side parsing — try exporting a simplified STEP or reducing the model complexity.`);
      return;
    }
    // The raw file bytes are now inside the WASM heap; drop the JS copy.
    bytes = null;

    if (!result || !result.success) {
      fail(requestId, 'The CAD kernel could not read this file (no solids or unsupported entities).');
      return;
    }
    const sourceMeshes = Array.isArray(result.meshes) ? result.meshes : [];
    if (sourceMeshes.length === 0) {
      fail(requestId, 'The CAD file contains no renderable solid geometry.');
      return;
    }

    // Convert + compact each mesh, reporting real progress per mesh.
    const meshes = [];
    for (let i = 0; i < sourceMeshes.length; i += 1) {
      const src = sourceMeshes[i];
      const position = toFloat32Array(src?.attributes?.position?.array);
      const normal = toFloat32Array(src?.attributes?.normal?.array);
      const index = toIndexArray(
        src?.index?.array ?? src?.attributes?.index?.array,
        position ? position.length / 3 : 0,
      );

      meshes.push({
        name: src?.name || '',
        color: src?.color || null,
        brep_faces: Array.isArray(src?.brep_faces) ? src.brep_faces : [],
        attributes: {
          position: { array: position },
          normal: { array: normal },
        },
        index: { array: index },
      });

      // Release the source JSON progressively.
      if (src) {
        if (src.attributes) {
          if (src.attributes.position) src.attributes.position = null;
          if (src.attributes.normal) src.attributes.normal = null;
        }
        src.index = null;
        src.attributes = null;
        src.brep_faces = null;
        sourceMeshes[i] = null;
      }

      post({ requestId, type: 'build', done: i + 1, total: sourceMeshes.length });
    }

    // Transfer the typed-array buffers zero-copy to the main thread.
    const transfer = [];
    for (const mesh of meshes) {
      const positionBuffer = mesh.attributes.position.array?.buffer;
      if (positionBuffer) transfer.push(positionBuffer);
      const normalBuffer = mesh.attributes.normal.array?.buffer;
      if (normalBuffer) transfer.push(normalBuffer);
      const indexBuffer = mesh.index.array?.buffer;
      if (indexBuffer) transfer.push(indexBuffer);
    }
    post({ requestId, ok: true, result: { meshes, root: result.root } }, transfer);
  } catch (error) {
    fail(requestId, error?.message || 'CAD parsing failed inside the worker.');
  }
};
