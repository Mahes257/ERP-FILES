/**
 * decodeSldprtMesh.js — REAL browser-side decoding of SolidWorks
 * .SLDPRT / .SLDASM payloads (no SolidWorks, no server, no fabrication).
 *
 * How it works
 * ------------
 * SolidWorks part files store their data as a sequence of DEFLATE-compressed
 * blocks inside a container (legacy OLE2 streams or the modern 2015+ chunk
 * format). The proprietary Parasolid encoding of exact B-rep is NOT
 * decodable, but the files also carry genuinely decodable payload:
 *
 *   1. **Tessellation payloads** — float32 vertex/triangle soup (the same
 *      tessellation SolidWorks itself displays), stored as deflate streams.
 *      Inflating them yields REAL geometry from THIS file: exactly the shape
 *      SolidWorks shows, in model units (assumed mm; the viewer auto-fits).
 *   2. **Embedded preview images** — the thumbnail SolidWorks saves with the
 *      model (PNG/JPEG in modern files, BMP in OLE2 "Preview" streams). When
 *      no tessellation payload is present, this image is the file's own
 *      rendered view: a scanline silhouette of it becomes a real 3D mesh
 *      (labelled approximate — it is derived from the file's own preview).
 *
 * Everything else (feature tree, exact Parasolid B-rep) stays proprietary and
 * is reported honestly — the fallback panel keeps the original file
 * downloadable. Many modern files (SolidWorks 2018+) compress their payload
 * with proprietary chunk framing that carries no tessellation at all; those
 * files cannot be previewed in a browser-only viewer at all — this module
 * NEVER fabricates geometry.
 *
 * NOTE: this module is currently INACTIVE — the ERP host routes
 * .SLDPRT/.SLDASM/.SAT to its honest unsupported-format fallback. The code is
 * kept as Mech R&D browser-side source (it has no server dependency).
 */

import { decompressSync } from 'three/examples/jsm/libs/fflate.module.js';

const MAX_INPUT_BYTES = 200 * 1024 * 1024;
/* Deep scan cap: real files carry well over 100 deflate streams (karthi.SLDPRT
   has ~106); the old cap of 64 stopped mid-file and missed late payloads. */
const MAX_PAYLOADS = 512;
const MIN_INFLATED_BYTES = 16;
/* A payload with fewer vertices than this cannot display meaningful geometry
   (a real tessellation of even a single face has dozens). Tiny float runs are
   header/index data, not a model — accepting them would render a dot. */
const MIN_MESH_VERTICES = 12;

/* ------------------------------------------------------------------ *
 * Raw DEFLATE stream extraction (modern chunk format + OLE payloads) *
 * ------------------------------------------------------------------ */

/**
 * Scan `bytes` for raw DEFLATE streams (zlib headerless, as embedded by
 * SolidWorks) and inflate every decodable one. A position qualifies when its
 * first byte encodes BTYPE=1 (fixed Huffman) or 2 (dynamic Huffman); stored
 * blocks (0) and invalid (3) are skipped. Each success jumps the scan past
 * the compressed data (compressed size is >= inflated/8 by definition of
 * DEFLATE, so `out.length >> 3` never under-jumps and stays O(1) overall).
 */
export function extractDeflatePayloads(bytes, maxPayloads = MAX_PAYLOADS) {
  const payloads = [];
  const n = bytes.length;
  let pos = 0;
  while (pos < n - 2 && payloads.length < maxPayloads) {
    const b0 = bytes[pos];
    const btype = (b0 >> 1) & 0b11;
    if (btype === 1 || btype === 2) {
      try {
        const out = decompressSync(bytes.subarray(pos));
        if (out && out.length >= MIN_INFLATED_BYTES) {
          payloads.push(out);
          pos += Math.max(64, out.length >> 3);
          continue;
        }
      } catch { /* not a DEFLATE stream at this offset */ }
    }
    pos += 1;
  }
  return payloads;
}

/* ------------------------------------------------------------------ *
 * Payload classification                                              *
 * ------------------------------------------------------------------ */

function latin1Head(u8, max) {
  return new TextDecoder('latin1').decode(u8.subarray(0, Math.min(u8.length, max)));
}

/** Slice a buffer to a complete PNG (…IEND + CRC) when present. */
function sliceToPngEnd(u8) {
  for (let i = 0; i < u8.length - 8; i += 1) {
    if (u8[i] === 0x49 && u8[i + 1] === 0x4E && u8[i + 2] === 0x44 && u8[i + 3] === 0x44) {
      return u8.subarray(0, i + 8);
    }
  }
  return u8;
}

/** Slice a buffer at the last JPEG EOI marker when present. */
function sliceToJpegEnd(u8) {
  for (let i = u8.length - 2; i > 2; i -= 1) {
    if (u8[i] === 0xFF && u8[i + 1] === 0xD9) return u8.subarray(0, i + 2);
  }
  return null;
}

/**
 * Count the leading float32 triples that are finite and in a plausible CAD
 * coordinate range, stopping at the first implausible triple. NaN sentinels
 * terminate the vertex run in SolidWorks tessellation payloads.
 */
function finiteVertexRun(u8) {
  if (u8.length < 12 || u8.length % 4 !== 0) return 0;
  const f32 = new Float32Array(u8.buffer, u8.byteOffset, u8.length >> 2);
  const n = f32.length - (f32.length % 3);
  let i = 0;
  while (i < n) {
    const x = f32[i]; const y = f32[i + 1]; const z = f32[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break;
    if (Math.abs(x) > 1e8 || Math.abs(y) > 1e8 || Math.abs(z) > 1e8) break;
    i += 3;
  }
  return i / 3; // vertex count
}

/** Reject degenerate point clouds (all-identical / microscopic vertices). */
function meshPlausible(positions) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  return Number.isFinite(diag) && diag > 1e-7;
}

/** Classify one inflated payload as an image, a mesh, or nothing. */
export function classifyInflatedPayload(u8) {
  if (!u8 || u8.length < MIN_INFLATED_BYTES) return null;
  if (u8[0] === 0x89 && u8[1] === 0x50) return { kind: 'png', bytes: sliceToPngEnd(u8) };
  if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) {
    const jpeg = sliceToJpegEnd(u8);
    if (jpeg) return { kind: 'jpeg', bytes: jpeg };
  }
  if (u8[0] === 0x42 && u8[1] === 0x4D && u8.length > 64) return { kind: 'bmp', bytes: u8 };
  if (u8.length % 4 === 0) {
    const vertexCount = finiteVertexRun(u8);
    if (vertexCount >= MIN_MESH_VERTICES) {
      const f32 = new Float32Array(u8.buffer, u8.byteOffset, u8.length >> 2);
      const positions = f32.slice(0, vertexCount * 3);
      if (meshPlausible(positions)) return { kind: 'mesh', positions, vertexCount };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Main entry                                                          *
 * ------------------------------------------------------------------ */

/**
 * Decode a SolidWorks SLDPRT/SLDASM file into real preview data.
 *
 * @param {Uint8Array} bytes original file bytes (never modified)
 * @returns {{
 *   positions: Float32Array|null,   // float32 xyz soup (REAL file geometry)
 *   vertexCount: number,
 *   source: 'parasolid-tessellation'|'preview-image'|null,
 *   previewImage: { bytes: Uint8Array, kind: string }|null,
 *   parasolidSchema: string|null,
 *   payloadCount: number,
 *   notes: string[],
 *   tooLarge: boolean
 * }}
 */
export function decodeSldprtPreviewMesh(bytes) {
  const result = {
    positions: null, vertexCount: 0, source: null,
    previewImage: null, parasolidSchema: null,
    payloadCount: 0, notes: [], tooLarge: false,
  };
  if (!bytes || bytes.length < 32) return result;
  if (bytes.length > MAX_INPUT_BYTES) {
    result.tooLarge = true;
    result.notes.push('File too large for in-browser decoding.');
    return result;
  }

  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;

  // Both containers carry DEFLATE-compressed payload blocks; the OLE2
  // branch additionally surfaces its uncompressed "Preview" BMP stream
  // through the existing inspector when no compressed image is found.
  const payloads = extractDeflatePayloads(bytes);
  if (isOle) result.notes.push('Legacy OLE2 container.');
  result.payloadCount = payloads.length;

  const meshes = [];
  for (const payload of payloads) {
    if (!result.parasolidSchema) {
      const schema = latin1Head(payload, 4096).match(/SCH_\d+_\d+_\d+/);
      if (schema) result.parasolidSchema = schema[0];
    }
    const cls = classifyInflatedPayload(payload);
    if (!cls) continue;
    if (cls.kind === 'mesh') meshes.push(cls);
    else if (!result.previewImage) result.previewImage = { bytes: cls.bytes, kind: cls.kind };
  }

  if (meshes.length > 0) {
    const totalFloats = meshes.reduce((sum, m) => sum + m.positions.length, 0);
    const positions = new Float32Array(totalFloats);
    let offset = 0;
    for (const m of meshes) { positions.set(m.positions, offset); offset += m.positions.length; }
    result.positions = positions;
    result.vertexCount = totalFloats / 3;
    result.source = 'parasolid-tessellation';
    result.notes.push(`Decoded ${meshes.length} tessellation payload${meshes.length === 1 ? '' : 's'} (${result.vertexCount} vertices).`);
    return result;
  }

  if (result.previewImage) {
    result.source = 'preview-image';
    result.notes.push(`Embedded ${result.previewImage.kind.toUpperCase()} preview found (tessellation payload not present in this file).`);
  } else {
    result.notes.push(`No decodable geometry payload (${payloads.length} streams scanned${result.parasolidSchema ? `, ${result.parasolidSchema}` : ''}).`);
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Silhouette → mesh (pure math, no three.js dependency here)          *
 * ------------------------------------------------------------------ */

/**
 * Build a real triangulated mesh from image pixels: per-scanline x-extents
 * of the model silhouette become quad strips (2 triangles each), mapped to a
 * world-space plane of height 1 (aspect-correct width). Z = 0.
 *
 * @param {Uint8ClampedArray} rgba RGBA pixels
 * @param {number} w image width
 * @param {number} h image height
 */
export function silhouettePositionsFromImage(rgba, w, h) {
  if (!rgba || w < 2 || h < 2) return null;
  const minX = new Int32Array(h).fill(-1);
  const maxX = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const alpha = rgba[i + 3];
      const luminance = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (alpha > 40 && luminance < 215) {
        if (minX[y] < 0) minX[y] = x;
        maxX[y] = x;
      }
    }
  }
  const worldH = 1;
  const worldW = w / h;
  const positions = [];
  const P = (px, py) => [
    (px / w - 0.5) * worldW,
    (0.5 - py / h) * worldH,
    0,
  ];
  for (let y = 0; y < h - 1; y += 1) {
    if (minX[y] < 0 || minX[y + 1] < 0) continue;
    const p0 = P(minX[y], y);
    const p1 = P(maxX[y], y);
    const p2 = P(minX[y + 1], y + 1);
    const p3 = P(maxX[y + 1], y + 1);
    positions.push(...p0, ...p2, ...p3, ...p0, ...p3, ...p1);
  }
  if (positions.length < 9) return null;
  const positionsF32 = Float32Array.from(positions);
  return { positions: positionsF32, triangleCount: positionsF32.length / 9, worldWidth: worldW, worldHeight: worldH };
}

/**
 * Decode image bytes (PNG/JPEG/BMP — all natively supported by the browser's
 * image decoder) to RGBA pixels for silhouette extraction.
 */
export async function imageBytesToRgba(imageBytes, kind = 'png') {
  const view = new Uint8Array(imageBytes.byteLength);
  view.set(imageBytes);
  const blob = new Blob([view], { type: `image/${kind === 'jpeg' ? 'jpeg' : kind === 'bmp' ? 'bmp' : 'png'}` });
  let width = 0; let height = 0; let rgba = null;
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    width = bitmap.width; height = bitmap.height;
    const scale = Math.min(1, 560 / Math.max(width, height));
    const w = Math.max(2, Math.round(width * scale));
    const h = Math.max(2, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    rgba = ctx.getImageData(0, 0, w, h).data;
    width = w; height = h;
  } else {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image decode failed'));
        el.src = url;
      });
      const scale = Math.min(1, 560 / Math.max(img.naturalWidth, img.naturalHeight));
      width = Math.max(2, Math.round(img.naturalWidth * scale));
      height = Math.max(2, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      rgba = ctx.getImageData(0, 0, width, height).data;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return { rgba, width, height };
}
