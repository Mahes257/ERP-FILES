/**
 * sldasmAssembly.js — native .SLDASM (SolidWorks assembly) reader.
 *
 * SCOPE: this module is inactive in the ERP's browser-only viewer — the host
 * routes .SLDPRT/.SLDASM/.SAT to an honest "3D browser preview is not available
 * for this format" fallback (there is no CAD conversion server). The code is
 * kept as Mech R&D browser-side source; it never touches STEP/STP, IGES/IGS,
 * STL or SLDDRW.
 *
 * Why it exists
 * -------------
 * SolidWorks assembly containers carry no browser-decodable tessellation of
 * their own — verified on real files: a .SLDASM decodes to 0 bodies / 0 faces /
 * 0 tessellations, so the only thing such a flow could do was ask the user to
 * export STEP.
 *
 * A .SLDASM does carry its own assembly structure, in the modern SolidWorks
 * (2015+) container: a sequence of DEFLATE-compressed blocks, each preceded by
 * the marker `14 00 06 00 08 00` and a 3-byte little-endian uncompressed size.
 * One of those blocks is the component-instance tree as XML, which contains —
 * for every component instance — its name, the referenced part file, and the
 * instance's 4x4 placement transform. That is decoded here (nothing guessed:
 * a block is accepted only when the declared size matches the inflated size
 * exactly).
 *
 * The referenced component geometry itself lives in external .SLDPRT files
 * (SolidWorks never embeds it in the assembly). When those parts are available
 * to the app they are converted through the EXISTING SLDPRT pipeline and placed
 * with the transforms read here; when they are not, the caller reports that
 * honestly instead of fabricating a model.
 *
 * Unit note: SolidWorks stores assembly transforms and bounding boxes in
 * METRES, while the part geometry produced by the converter is in MILLIMETRES,
 * so placement scales the translation by 1000 (see swTransformToThree).
 */

/** SolidWorks container block marker: 14 00 06 00 08 00. */
const BLOCK_MARKER = [0x14, 0x00, 0x06, 0x00, 0x08, 0x00];
const MIN_BLOCK_BYTES = 64;
const MAX_BLOCKS = 400;
/** Payload start lives within this many bytes after the marker. */
const PAYLOAD_SEARCH_BYTES = 110;
/** Plausible float32 coordinate range for a CAD payload (metres or mm). */
const MAX_COORD = 1e6;

/** Attributes of one XML tag → plain object. */
function parseAttrs(tag) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.\-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function baseName(p) {
  const s = String(p || '');
  const parts = s.split(/[\\/]/);
  return parts[parts.length - 1] || s;
}

/** Inflate a raw-DEFLATE stream, accepting it only at the exact declared size. */
async function inflateExact(bytes, start, declared, signal, end) {
  if (typeof DecompressionStream !== 'function') return null;
  const slice = bytes.subarray(start, end);
  let reader;
  try {
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    reader = stream.getReader();
  } catch {
    return null;
  }
  const chunks = [];
  let got = 0;
  try {
    for (;;) {
      if (signal?.aborted) { await reader.cancel(); return null; }
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        chunks.push(value);
        got += value.length;
        if (got > declared) { await reader.cancel(); return null; }
      }
    }
  } catch {
    /* Some implementations raise once bytes follow the end of the deflate
       stream (Node: "Trailing junk found after the end of the compressed
       stream"). The stream itself was complete, so judge on the byte count. */
    if (got !== declared) return null;
  }
  if (got !== declared) return null;
  const out = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/**
 * Read the container's compressed blocks. A candidate marker is accepted only
 * when a payload starting within the next ~110 bytes inflates to exactly the
 * size the block header declares — so every returned block is self-validated.
 */
export async function readSldasmBlocks(bytes, { signal, maxBlocks = MAX_BLOCKS } = {}) {
  const blocks = [];
  if (!bytes || bytes.length < 128) return blocks;
  const marker = Uint8Array.from(BLOCK_MARKER);

  /* Collect the block markers first: a block's compressed payload cannot run
     past the next marker, so each candidate gets a tight input window whose
     DEFLATE stream ends cleanly (every implementation accepts that). If the
     tight window yields nothing, a generous window is retried — some engines
     tolerate — and some do not — bytes that follow the end of the stream. */
  const marks = [];
  const limit = bytes.length - marker.length - 24;
  for (let pos = 0; pos <= limit; pos += 1) {
    let hit = true;
    for (let k = 0; k < marker.length; k += 1) {
      if (bytes[pos + k] !== marker[k]) { hit = false; break; }
    }
    if (hit) { marks.push(pos); pos += marker.length - 1; }
  }

  for (let i = 0; i < marks.length && blocks.length < maxBlocks; i += 1) {
    if (signal?.aborted) break;
    const pos = marks[i];
    const declared = bytes[pos + 18] | (bytes[pos + 19] << 8) | (bytes[pos + 20] << 16);
    if (declared < MIN_BLOCK_BYTES) continue;

    const tightEnd = i + 1 < marks.length ? marks[i + 1] : bytes.length;
    const looseEnd = Math.min(bytes.length, pos + declared * 4 + 65536);
    let payload = null;
    let payloadOffset = 0;

    for (const end of tightEnd > looseEnd ? [looseEnd] : [tightEnd, looseEnd]) {
      const searchEnd = Math.min(pos + PAYLOAD_SEARCH_BYTES, end - 1);
      for (let p = pos + 21; p <= searchEnd; p += 1) {
        /* Cheap pre-filter: a raw-DEFLATE stream starts with a block header
           whose BTYPE is 1 (fixed Huffman) or 2 (dynamic Huffman). Stored or
           invalid starts cannot be the payload, so most offsets are skipped
           without spinning up a stream. */
        const btype = (bytes[p] >> 1) & 0b11;
        if (btype !== 1 && btype !== 2) continue;
        /* eslint-disable no-await-in-loop */
        payload = await inflateExact(bytes, p, declared, signal, end);
        /* eslint-enable no-await-in-loop */
        if (payload) { payloadOffset = p - pos; break; }
      }
      if (payload) break;
    }
    if (!payload) continue;

    blocks.push({ offset: pos, payloadOffset, size: declared, data: payload });
  }
  return blocks;
}

/** Largest run of plausible float32 coordinate triples inside a payload. */
function hasCoordinateRun(u8, minTriples = 64) {
  if (!u8 || u8.length < 12) return false;
  const usable = u8.length - (u8.length % 4);
  const f = new Float32Array(u8.buffer, u8.byteOffset, usable >> 2);
  let run = 0;
  for (let i = 0; i + 2 < f.length; i += 3) {
    const x = f[i]; const y = f[i + 1]; const z = f[i + 2];
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      && Math.abs(x) < MAX_COORD && Math.abs(y) < MAX_COORD && Math.abs(z) < MAX_COORD) {
      run += 1;
      if (run >= minTriples) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/**
 * Parse the assembly XML block into components.
 * Pure function (no I/O) so it can be tested directly.
 */
export function parseAssemblyXml(text) {
  const out = {
    documentType: null,
    assemblyName: null,
    assemblyBoundingBox: null,
    files: [],
    models: [],
    components: [],
  };
  if (!text) return out;

  for (const m of text.matchAll(/<swFile\b([^>]*?)\/?>/g)) {
    const a = parseAttrs(m[1]);
    out.files.push({
      id: a.id,
      docType: a.swDocType || null,
      path: a.swPath || '',
      fileName: baseName(a.swPath),
    });
  }
  for (const m of text.matchAll(/<swModel\b([^>]*?)\/?>/g)) {
    const a = parseAttrs(m[1]);
    out.models.push({
      id: a.id,
      name: a.swName || '',
      fileRef: a.swFileRef || null,
      boundingBox: a.swBoundingBox || null,
    });
  }

  const fileById = new Map(out.files.map((f) => [f.id, f]));
  const modelById = new Map(out.models.map((mm) => [mm.id, mm]));
  const assemblyFile = out.files.find((f) => f.docType === 'ASSEMBLY') || null;
  out.documentType = assemblyFile ? 'ASSEMBLY' : (out.files[0]?.docType || null);
  out.assemblyName = assemblyFile ? assemblyFile.fileName : null;
  const assemblyModel = assemblyFile
    ? out.models.find((mm) => mm.fileRef === assemblyFile.id && mm.boundingBox)
    : null;
  out.assemblyBoundingBox = assemblyModel ? assemblyModel.boundingBox : null;

  for (const m of text.matchAll(/<swReference\b([^>]*?)\/?>/g)) {
    const a = parseAttrs(m[1]);
    const model = modelById.get(a.swModelRef) || null;
    const file = model ? fileById.get(model.fileRef) || null : null;
    const t = String(a.swTransform || '').trim().split(/\s+/).map(Number);
    out.components.push({
      id: a.id || null,
      instanceName: a.swName || (model ? model.name : '') || 'Component',
      modelRef: a.swModelRef || null,
      partFileName: file ? file.fileName : null,
      partPath: file ? file.path : null,
      boundingBox: model ? model.boundingBox : null,
      virtual: /^yes$/i.test(a.swIsVirtualComponent || ''),
      transform: t.length === 16 && t.every((n) => Number.isFinite(n)) ? t : null,
    });
  }
  return out;
}

/**
 * Read a .SLDASM's assembly structure from its own bytes.
 *
 * @returns {Promise<{
 *   container: 'solidworks-blocks'|'unknown',
 *   blockCount: number,
 *   documentType: string|null,
 *   assemblyName: string|null,
 *   components: Array<object>,
 *   externalComponents: Array<object>,
 *   embeddedGeometryBlocks: number,
 *   notes: string[]
 * }>}
 */
export async function parseSldasmAssembly(bytes, { signal, minCoordinateTriples = 64 } = {}) {
  const result = {
    container: 'unknown',
    blockCount: 0,
    documentType: null,
    assemblyName: null,
    assemblyBoundingBox: null,
    components: [],
    externalComponents: [],
    embeddedGeometryBlocks: 0,
    notes: [],
  };
  if (!bytes || bytes.length < 128) {
    result.notes.push('File is too small to be a SolidWorks assembly.');
    return result;
  }

  const blocks = await readSldasmBlocks(bytes, { signal });
  result.blockCount = blocks.length;
  if (!blocks.length) {
    result.notes.push('No SolidWorks container blocks found — the file does not use the modern SolidWorks container layout.');
    return result;
  }
  result.container = 'solidworks-blocks';

  let asmXml = null;
  for (const b of blocks) {
    if (b.data.length < 32) continue;
    /* Any block may hold the component tree — identified by its own content,
       not by position or a required leading byte. */
    const text = new TextDecoder('utf-8').decode(b.data.subarray(0, Math.min(b.data.length, 200000)));
    if (/swDocType="ASSEMBLY"/.test(text) && /<sw(Reference|ModelList|Model)\b/.test(text)) { asmXml = text; break; }
  }

  if (asmXml) {
    const parsed = parseAssemblyXml(asmXml);
    result.documentType = parsed.documentType;
    result.assemblyName = parsed.assemblyName;
    result.assemblyBoundingBox = parsed.assemblyBoundingBox;
    result.components = parsed.components;
    result.externalComponents = parsed.components.filter((c) => !c.virtual);
    result.notes.push(`Assembly structure decoded: ${parsed.components.length} component instance(s), ${parsed.files.filter((f) => f.docType === 'PART').length} referenced part file(s).`);
  } else {
    result.notes.push('The file carries no assembly component tree (a part saved with an .SLDASM extension has no assembly structure).');
  }

  result.embeddedGeometryBlocks = blocks.filter((b) => b.data.length >= 4096 && hasCoordinateRun(b.data, minCoordinateTriples)).length;

  return result;
}

/**
 * SolidWorks instance transform → array for THREE.Matrix4.fromArray.
 *
 * SolidWorks writes the 4x4 with the translation in the LAST ROW (t[12..14])
 * and a metres scale; THREE's element array is column-major with the
 * translation in the last COLUMN (indices 12..14). Those coincide, so the
 * values are passed through unchanged apart from the metres → mm scale on the
 * translation.
 *
 * Verified against real files: applying this to a component's own bounding box
 * reproduces the placed bounding box the assembly records for it (see
 * `verifyTransforms` in the dev check script).
 */
export function swTransformToThree(t16, unitScale = 1000) {
  const t = Array.from(t16 || []);
  if (t.length !== 16 || !t.every((n) => Number.isFinite(n))) return null;
  const out = t.slice();
  out[12] *= unitScale;
  out[13] *= unitScale;
  out[14] *= unitScale;
  return out;
}

/**
 * Axis-aligned box of a component's own bounding box after `matrix` is applied.
 * Used to check placement against the assembly's recorded bounding boxes.
 *
 * @param {string} bbox six space-separated metres values (xmin ymin zmin xmax ymax zmax)
 * @param {number[]} matrix 16 numbers in column-major order
 */
export function placedBoundingBox(bbox, matrix, unitScale = 1000) {
  const v = String(bbox || '').trim().split(/\s+/).map(Number);
  if (v.length !== 6 || !v.every((n) => Number.isFinite(n))) return null;
  const [x0, y0, z0, x1, y1, z1] = v.map((n) => n * unitScale);
  const m = matrix || swTransformToThree(Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const x of [x0, x1]) {
    for (const y of [y0, y1]) {
      for (const z of [z0, z1]) {
        for (let r = 0; r < 3; r += 1) {
          const p = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r];
          min[r] = Math.min(min[r], p);
          max[r] = Math.max(max[r], p);
        }
      }
    }
  }
  return { min, max };
}

/** Normalised file name key for matching a reference against available parts. */
function nameKey(name) {
  return baseName(name).toLowerCase().replace(/\.(sldprt|sldasm)$/i, '').replace(/[\s_-]+/g, '');
}

/**
 * Find the uploaded part that satisfies a component's referenced file name.
 * Matching is on the part name itself (extension/case/spacing insensitive).
 */
export function findCompanionPart(partFileName, companions) {
  if (!partFileName || !Array.isArray(companions)) return null;
  const want = nameKey(partFileName);
  if (!want) return null;
  return companions.find((c) => nameKey(c?.name) === want) || null;
}

/** Distinct referenced part files, in assembly order. */
export function referencedPartNames(assembly) {
  const seen = new Set();
  const names = [];
  for (const c of assembly?.externalComponents || []) {
    if (!c.partFileName) continue;
    if (seen.has(c.partFileName)) continue;
    seen.add(c.partFileName);
    names.push(c.partFileName);
  }
  return names;
}

/**
 * User-facing report for an assembly that could not be rendered, stating the
 * ACTUAL technical reason (never "go export a STEP file").
 */
export function describeAssemblyFailure(assembly, { resolvedParts = 0, missingParts = [], attemptedParts = 0 } = {}) {
  const referenced = referencedPartNames(assembly);
  const lines = [];

  if (!assembly || assembly.container === 'unknown') {
    lines.push('This .SLDASM does not use the modern SolidWorks container layout, so its assembly structure could not be read.');
    if (assembly?.notes?.length) lines.push(...assembly.notes);
    return lines.join('\n');
  }

  const instances = (assembly.externalComponents || []).length;
  if (referenced.length) {
    lines.push(`Referenced component geometry is unavailable: this assembly places ${instances} instance(s) of ${referenced.length} component file(s), and the geometry of those parts is not present in the .SLDASM.`);
    lines.push('');
    lines.push(`Missing component files (${referenced.length}): ${referenced.join(', ')}`);
    if (attemptedParts > 0 && resolvedParts === 0) {
      lines.push('');
      lines.push(`${attemptedParts} matching part file(s) were found but could not be converted to renderable geometry.`);
    } else if (resolvedParts === 0) {
      lines.push('');
      lines.push('Upload the referenced .SLDPRT component(s) to this design and the assembly will be resolved and placed automatically.');
    }
    lines.push('');
    lines.push('SolidWorks stores component geometry in those separate part files — the assembly contains the structure and placement of each component, but not their geometry.');
  } else if (assembly.embeddedGeometryBlocks > 0) {
    lines.push(`This assembly references no external part files, and its own geometry is stored as embedded face-tessellation blocks (at least ${assembly.embeddedGeometryBlocks} found) in SolidWorks' proprietary record encoding.`);
    lines.push('');
    lines.push('That encoding is not documented and this app will not guess at it — rendering a partially decoded record stream would show geometry the file does not actually define.');
  } else {
    lines.push('No geometry could be read from this assembly: it defines no component instances and carries no embedded tessellation blocks.');
    lines.push('');
    lines.push('The file is likely empty or saved without any geometry.');
  }
  if (missingParts.length) {
    lines.push('');
    lines.push(`Not rendered: ${missingParts.join(', ')}`);
  }
  if (assembly.notes?.length) {
    lines.push('');
    lines.push(...assembly.notes);
  }
  return lines.join('\n');
}
