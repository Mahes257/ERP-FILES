/**
 * sldprtInspector.js — free, pure-JS inspection of SolidWorks .SLDPRT/.SLDASM
 * containers (ported from the Designing module).
 *
 * The SLDPRT geometry encoding is proprietary and no open-source library can
 * decode its solids. What CAN be extracted without SolidWorks — and all this
 * module does, honestly:
 *   1. Container format detection (legacy OLE2 vs modern chunk format).
 *   2. The embedded preview PNG (thumbnail) when the file carries one.
 *   3. The Parasolid schema signature of the embedded geometry payload.
 * Everything else is deliberately reported as not extractable.
 */

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;

function u16(d, o) { return d[o] | (d[o + 1] << 8); }
function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

/** Minimal OLE2/CFB stream reader (read-only, in-memory). */
function readOleStreams(data) {
  const sectorShift = u16(data, 30) === 12 ? 12 : 9;
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 64;
  const numFat = u32(data, 44);
  const dirFirst = u32(data, 48);
  const miniCutoff = u32(data, 56);
  const miniFatFirst = u32(data, 60);
  const numMiniFat = u32(data, 64);
  const difatFirst = u32(data, 68);
  const numDifat = u32(data, 72);
  if (numFat === 0 || numFat > 4096) throw new Error('Malformed OLE header');

  const fatSectors = [];
  for (let i = 0; i < 109; i += 1) {
    const s = u32(data, 76 + i * 4);
    if (s < ENDOFCHAIN) fatSectors.push(s);
  }
  let difatCursor = difatFirst;
  for (let i = 0; i < numDifat && difatCursor < ENDOFCHAIN; i += 1) {
    const base = 512 + difatCursor * sectorSize;
    const perSector = sectorSize / 4 - 1;
    for (let j = 0; j < perSector; j += 1) {
      const s = u32(data, base + j * 4);
      if (s < ENDOFCHAIN) fatSectors.push(s);
    }
    difatCursor = u32(data, base + perSector * 4);
  }

  const fat = new Uint32Array(fatSectors.length * sectorSize / 4);
  fatSectors.forEach((fs, i) => {
    const base = 512 + fs * sectorSize;
    for (let j = 0; j < sectorSize / 4; j += 1) {
      fat[i * (sectorSize / 4) + j] = u32(data, base + j * 4);
    }
  });

  const chain = (start) => {
    const out = [];
    let c = start;
    const seen = new Set();
    while (c < ENDOFCHAIN && c !== FREESECT && !seen.has(c) && c < fat.length) {
      seen.add(c);
      out.push(c);
      c = fat[c];
    }
    return out;
  };

  const entries = [];
  chain(dirFirst).forEach((ds) => {
    const base = 512 + ds * sectorSize;
    for (let i = 0; i < sectorSize / 128; i += 1) {
      const e = data.subarray(base + i * 128, base + (i + 1) * 128);
      if (e.length < 128) return;
      const nameLen = u16(e, 64);
      if (nameLen < 2) return;
      const type = e[66];
      const start = u32(e, 116);
      const size = u32(e, 120);
      let name = '';
      const chars = new Uint16Array(e.buffer, e.byteOffset, Math.min(nameLen / 2, 32));
      for (let c = 0; c < Math.min(chars.length, nameLen / 2 - 1); c += 1) name += String.fromCharCode(chars[c]);
      if (type === 2 || type === 5) entries.push({ name, type, start, size });
    }
  });

  const miniFat = new Uint32Array(numMiniFat * sectorSize / 4);
  chain(miniFatFirst).forEach((ms, i) => {
    const base = 512 + ms * sectorSize;
    for (let j = 0; j < sectorSize / 4; j += 1) miniFat[i * (sectorSize / 4) + j] = u32(data, base + j * 4);
  });
  let miniStream = new Uint8Array(0);
  const root = entries.find((e) => e.type === 5);
  if (root) {
    const chunks = chain(root.start).map((s) => data.subarray(512 + s * sectorSize, 512 + (s + 1) * sectorSize));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    miniStream = new Uint8Array(total);
    let o = 0;
    chunks.forEach((c) => { miniStream.set(c, o); o += c.length; });
  }

  const readStream = (entry) => {
    if (entry.size < miniCutoff) {
      const chunks = [];
      let c = entry.start;
      const seen = new Set();
      while (c < ENDOFCHAIN && c !== FREESECT && !seen.has(c) && c < miniFat.length) {
        seen.add(c);
        chunks.push(miniStream.subarray(c * miniSectorSize, (c + 1) * miniSectorSize));
        c = miniFat[c];
      }
      const out = new Uint8Array(Math.min(entry.size, chunks.length * miniSectorSize));
      let o = 0;
      chunks.forEach((c) => { out.set(c.subarray(0, Math.min(c.length, out.length - o)), o); o += c.length; });
      return out;
    }
    const chunks = chain(entry.start).map((s) => data.subarray(512 + s * sectorSize, 512 + (s + 1) * sectorSize));
    const out = new Uint8Array(Math.min(entry.size, chunks.length * sectorSize));
    let o = 0;
    chunks.forEach((c) => { out.set(c.subarray(0, Math.min(c.length, out.length - o)), o); o += c.length; });
    return out;
  };

  return entries.filter((e) => e.type === 2).map((e) => ({ name: e.name, size: e.size, bytes: readStream(e) }));
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new Error('deflate-raw unsupported in this browser');
}

async function inflateZlib(bytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate'); // zlib wrapper
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new Error('deflate unsupported in this browser');
}

/** Scan zlib-wrapped streams (0x78 xx, FCHECK-validated): modern SolidWorks
    files wrap large payloads — including the Parasolid geometry header — in
    standard zlib streams (karthi.SLDPRT: SCH_3601212_… lives there). */
async function scanZlibStreams(data) {
  const hits = [];
  for (let i = 0; i < data.length - 2; i += 1) {
    if (data[i] !== 0x78) continue;
    if ((((data[i] << 8) | data[i + 1]) % 31) !== 0) continue; // invalid FCHECK
    try {
      const out = await inflateZlib(data.subarray(i));
      if (out && out.length > 200) {
        hits.push({ offset: i, bytes: out });
        i += Math.max(out.length >> 6, 64);
        if (hits.length >= 48) break;
      }
    } catch { /* not a zlib stream here */ }
  }
  return hits;
}

/** Scan raw-deflate streams (modern 2015+ SolidWorks chunk containers). */
async function scanRawDeflate(data) {
  const hits = [];
  for (let i = 0; i < data.length - 2; i += 1) {
    if ((data[i] & 0x07) !== 4) continue;
    try {
      const out = await inflateRaw(data.subarray(i, Math.min(i + 400000, data.length)));
      if (out && out.length > 200) {
        hits.push({ offset: i, bytes: out });
        i += Math.max(out.length >> 6, 64);
        if (hits.length >= 48) break;
      }
    } catch { /* not a deflate stream here */ }
  }
  return hits;
}

/** Merge raw-deflate hits with zlib-stream hits, ordered by file offset. */
async function scanAllDeflate(data) {
  const [raw, zlib] = await Promise.all([scanRawDeflate(data), scanZlibStreams(data)]);
  return [...raw, ...zlib].sort((a, b) => a.offset - b.offset);
}

/**
 * Inspect SLDPRT/SLDASM bytes.
 * @param {Uint8Array} bytes
 * @returns {Promise<{ containerType: 'ole2'|'modern'|'unknown', streams: string[],
 *   previewPng: Uint8Array|null, parasolidSchema: string|null }>}
 */
export async function inspectSldprt(bytes) {
  const result = { containerType: 'unknown', streams: [], previewPng: null, parasolidSchema: null };
  if (!bytes || bytes.length < 8) return result;

  const isOle = OLE_MAGIC.every((b, i) => bytes[i] === b);
  const modernMarker = bytes.length > 22
    && bytes[16] === 0x14 && bytes[17] === 0x00 && bytes[18] === 0x06
    && bytes[19] === 0x00 && bytes[20] === 0x08 && bytes[21] === 0x00;
  if (isOle) {
    result.containerType = 'ole2';
    try {
      const streams = readOleStreams(bytes);
      result.streams = streams.map((s) => `${s.name} (${s.size} bytes)`);
      const preview = streams.find((s) => /preview/i.test(s.name) && s.bytes.length > 8
        && s.bytes[0] === 0x89 && s.bytes[1] === 0x50);
      if (preview) result.previewPng = preview.bytes;
    } catch { /* malformed OLE — schema sniff below still runs */ }
  } else if (modernMarker) {
    result.containerType = 'modern';
  }

  if (!result.previewPng) {
    const chunks = await scanAllDeflate(bytes);
    result.deflateStreams = chunks.length;
    for (const chunk of chunks) {
      if (!result.parasolidSchema) {
        const text = new TextDecoder('latin1').decode(chunk.bytes.subarray(0, Math.min(chunk.bytes.length, 4096)));
        const schema = text.match(/SCH_\d+_\d+_\d+/);
        if (schema) result.parasolidSchema = schema[0];
      }
      if (!result.previewPng) {
        let png = -1;
        for (let i = 0; i < chunk.bytes.length - 1; i += 1) {
          if (chunk.bytes[i] === 0x89 && chunk.bytes[i + 1] === 0x50) { png = i; break; }
        }
        if (png >= 0 && chunk.bytes.length - png > 100) {
          result.previewPng = chunk.bytes.subarray(png);
        }
      }
      if (result.parasolidSchema && result.previewPng) break;
    }
  } else {
    for (const stream of readOleStreams(bytes)) {
      const text = new TextDecoder('latin1').decode(stream.bytes.subarray(0, Math.min(stream.bytes.length, 4096)));
      const schema = text.match(/SCH_\d+_\d+_\d+/);
      if (schema) { result.parasolidSchema = schema[0]; break; }
    }
  }

  return result;
}

/** Human-readable capability summary for the fallback panel. */
export function describeSldprtInspection(info, extension) {
  const ext = (extension || 'SLDPRT').toUpperCase();
  const lines = [];
  if (info?.containerType === 'ole2') lines.push(`Container: legacy OLE2 SolidWorks file (${info.streams?.length ?? 0} internal streams).`);
  else if (info?.containerType === 'modern') lines.push(`Container: modern SolidWorks (2015+) chunk format (${info.deflateStreams ?? 0} compressed payload streams scanned).`);
  else lines.push(`Container: unrecognized ${ext} structure.`);
  if (info?.parasolidSchema) lines.push(`Embedded geometry payload: Parasolid ${info.parasolidSchema} (proprietary encoding — not decodable in the browser).`);
  if (info?.previewPng) lines.push('Embedded preview image found.');
  return lines;
}
