/**
 * cadTypedArrays.js — shared typed-array normalization for the browser CAD
 * pipeline (ported from the Designing module; used by BOTH the worker and the
 * geometry builder).
 *
 * The occt-import-js JSON result carries plain number[] arrays. The worker
 * converts them to typed arrays so postMessage can transfer the underlying
 * ArrayBuffers zero-copy. Consumers accept THREE shapes:
 *   1. Typed array      (normal case: produced inside occt.worker.js)
 *   2. Plain number[]   (legacy: direct occt-import-js result)
 *   3. null/undefined   (missing attribute)
 */

/** True when `source` is a plain Array (not a typed array). */
export function isPlainArray(source) {
  return Array.isArray(source);
}

/** True for any ArrayBufferView (Float32Array, Uint16Array, …). */
export function isTypedArrayLike(source) {
  return ArrayBuffer.isView(source);
}

/** True when the value can be used as geometry attribute/index data. */
export function hasArrayData(source) {
  return (isTypedArrayLike(source) || isPlainArray(source)) && source.length > 0;
}

/**
 * number[] | typed array → Float32Array. Typed arrays are returned zero-copy
 * whenever possible; only misaligned views and plain arrays allocate.
 */
export function toFloat32Array(source) {
  if (!source) return null;
  if (source instanceof Float32Array) return source;
  if (ArrayBuffer.isView(source)) {
    if (source.byteOffset % 4 === 0) {
      return new Float32Array(source.buffer, source.byteOffset, source.byteLength / 4);
    }
    return new Float32Array(source.length);
  }
  if (Array.isArray(source)) return Float32Array.from(source);
  return null;
}

/**
 * number[] | typed array → Uint16Array or Uint32Array, chosen by the actual
 * vertex range. A Uint32Array index is NEVER blindly narrowed to Uint16Array
 * (>65 535 vertices would silently wrap and corrupt).
 */
export function toIndexArray(source, vertexCount) {
  if (!hasArrayData(source)) return null;
  if (source instanceof Uint16Array || source instanceof Uint32Array) return source;

  let max = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] > max) max = source[i];
  }
  const fitsUint16 = max <= 0xffff && (vertexCount === undefined || vertexCount <= 0x10000);

  if (ArrayBuffer.isView(source)) {
    if (fitsUint16) return new Uint16Array(source.length);
    if (source instanceof Uint32Array) return source;
    return new Uint32Array(source.length);
  }
  return fitsUint16 ? Uint16Array.from(source) : Uint32Array.from(source);
}

/** Vertex count of a position-like array (3 components per vertex). */
export function vertexCountOf(positionArray) {
  return positionArray ? positionArray.length / 3 : 0;
}
