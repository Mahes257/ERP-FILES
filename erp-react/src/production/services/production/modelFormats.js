/**
 * modelFormats.js — Central source of truth for Model file-format detection and
 * renderer routing in the ERP Model Viewer.
 *
 * Format handling rules (per ERP Models spec):
 *
 *   STEP/STP           -> backend STEP->GLB conversion (self-hosted OpenCascade) -> GLTFLoader
 *   IGES/IGS           -> backend IGES->GLB conversion (same OpenCascade engine)  -> GLTFLoader
 *   BREP               -> same backend engine slot as STEP (OpenCascade-native) -> GLTFLoader
 *   SLDPRT/SLDASM      -> NOT previewable (stored-only). Must be exported to
 *                         STEP (.step/.stp) first. Never parsed in the browser.
 *   GLB/GLTF           -> GLTFLoader
 *   STL                -> STLLoader (ASCII or binary, auto-detected by file signature)
 *   OBJ                -> OBJLoader
 *   3MF                -> 3MFLoader
 *   FBX                -> FBXLoader
 *   WRL/VRML           -> VRMLLoader
 *   PLY                -> PLYLoader (ASCII and binary)
 *   DAE                -> ColladaLoader (COLLADA XML)
 *   3DS                -> TDSLoader (3D Studio)
 *
 * Recognised formats with NO bundled loader and NO conversion engine (X3D, OFF,
 * SLDDRW and the native vendor CAD kernels — CATIA/NX/Creo/Inventor/Solid Edge/
 * Fusion/FreeCAD/Blender/OpenSCAD) resolve to 'stored-only': the file is kept
 * and downloadable, but no preview is claimed because none can be produced.
 *
 * IMPORTANT: We NEVER route a file to a JSON parser. A model file is binary or
 * textual geometry — we only ever hand it to a Three.js loader (STLLoader,
 * OBJLoader, GLTFLoader, 3MFLoader, FBXLoader, VRMLLoader) or the backend CAD
 * conversion pipeline. IGES/IGS no longer use a client-side parser: they go
 * through the same real backend OpenCascade conversion as STEP and are served
 * back as a GLB over /models/{id}/3d.
 *
 * Detection is driven by the persisted model metadata (fileType / fileName)
 * because the API content-type is unreliable for CAD uploads.
 */

const BACKEND_CONVERT_TYPES = ['STEP', 'STP', 'IGES', 'IGS', 'BREP'];
const SLD_STORE_ONLY_TYPES = ['SLDPRT', 'SLDASM', 'SLDDRW'];
const GLB_TYPES = ['GLB', 'GLTF'];
const STL_TYPES = ['STL'];
const OBJ_TYPES = ['OBJ'];
const FORMAT_3MF_TYPES = ['3MF'];
const FBX_TYPES = ['FBX'];
const VRML_TYPES = ['WRL', 'VRML'];
const PLY_TYPES = ['PLY'];
const COLLADA_TYPES = ['DAE'];
const TDS_TYPES = ['3DS'];

/**
 * Recognised, storable, but not convertible/viewable in this build. Kept in
 * sync with the backend ModelConversionStatus.RECOGNISED_STORED_ONLY_TYPES so
 * the UI states the same honest capability instead of inventing a preview.
 */
const STORED_ONLY_TYPES = [
  'X_T', 'X_B', '3DM', 'JT', '3DXML', 'SLDDRW',
  'CATPART', 'CATPRODUCT', 'CATDRAWING',
  'PRT', 'ASM', 'DRW', 'IPT', 'IAM', 'IDW', 'PAR', 'DFT',
  'F3D', 'F3Z', 'FCSTD', 'BLEND', 'SCAD',
];
// NOTE: X3D and OFF are deliberately NOT listed above. Three.js 0.185.1 ships
// no X3DLoader/OFFLoader, and no conversion engine reads them, so they are not
// accepted at all — reporting "unsupported" is honest, whereas accepting them
// would promise a preview that can never be produced.

/** Normalize a fileType / extension to an uppercase token without dots. */
export function normalizeType(fileType) {
  return (fileType || '').toUpperCase().replace('.', '').trim();
}

/** Strip a leading dot from an extension, e.g. ".SLDPRT" -> "SLDPRT". */
export function cleanExt(ext) {
  return (ext || '').replace('.', '').trim();
}

/**
 * Resolve the renderer strategy for a given model file type.
 * Returns one of: 'gltf' | 'stl' | 'obj' | '3mf' | 'fbx' | 'vrml'
 *               | 'cad-convert' | 'unknown'
 *
 * NOTE: STEP/STP/IGES/IGS renderers are 'cad-convert' — the viewer loads the
 * GLB preview produced by the backend OpenCascade engine from /models/{id}/3d.
 */
export function resolveRenderer(fileType) {
  const t = normalizeType(fileType);
  if (GLB_TYPES.includes(t)) return 'gltf';
  if (STL_TYPES.includes(t)) return 'stl';
  if (OBJ_TYPES.includes(t)) return 'obj';
  if (FORMAT_3MF_TYPES.includes(t)) return '3mf';
  if (FBX_TYPES.includes(t)) return 'fbx';
  if (VRML_TYPES.includes(t)) return 'vrml';
  if (PLY_TYPES.includes(t)) return 'ply';
  if (COLLADA_TYPES.includes(t)) return 'dae';
  if (TDS_TYPES.includes(t)) return '3ds';
  if (BACKEND_CONVERT_TYPES.includes(t)) return 'cad-convert';
  if (SLD_STORE_ONLY_TYPES.includes(t)) return 'cad-convert';
  return 'unknown';
}

/**
 * True for formats this build accepts and stores but cannot preview: no bundled
 * Three.js loader and no conversion engine. The Models UI uses this to show the
 * honest "stored" state (with the original file still downloadable) instead of
 * promising a 3D view.
 */
export function isStoredOnlyType(fileType) {
  return STORED_ONLY_TYPES.includes(normalizeType(fileType));
}

/** The single user-facing explanation shown for a stored-only model file. */
export function storedOnlyMessage(fileType) {
  const t = normalizeType(fileType);
  return `Stored — no 3D preview: this server has no viewer or conversion engine for ${t} files. `
    + 'The original file is kept for download; export the model as STEP (.step/.stp) and upload the '
    + 'STEP file for an in-browser 3D preview.';
}

export function needsBackendConversion(fileType) {
  return BACKEND_CONVERT_TYPES.includes(normalizeType(fileType));
}

export function isClientConvertible(fileType) {
  // Kept for API compatibility: IGES/IGS used to be parsed client-side, but
  // they are now converted on the backend (same engine as STEP). Nothing is
  // parsed client-side anymore.
  return false;
}

export function isBrowserNative(fileType) {
  return ['gltf', 'stl', 'obj', '3mf', 'fbx', 'vrml', 'ply', 'dae', '3ds']
    .includes(resolveRenderer(fileType));
}

/** True when the file type needs backend conversion to preview (STEP/STP/IGES/IGS/BREP). */
export function isStepType(fileType) {
  return BACKEND_CONVERT_TYPES.includes(normalizeType(fileType));
}

/** True when the file type is a store-only SolidWorks format (no preview). */
export function isSldStoreOnly(fileType) {
  return SLD_STORE_ONLY_TYPES.includes(normalizeType(fileType));
}

/**
 * Whether this file type can ever produce an in-browser 3D preview.
 * SLDPRT/SLDASM are stored-only and return false (they must be exported to STEP).
 */
export function isPreviewable(fileType) {
  const t = normalizeType(fileType);
  if (SLD_STORE_ONLY_TYPES.includes(t)) return false;
  return isBrowserNative(fileType) || needsBackendConversion(fileType);
}

export const PLY_TYPES_SET = PLY_TYPES;
export const COLLADA_TYPES_SET = COLLADA_TYPES;
export const TDS_TYPES_SET = TDS_TYPES;
export const STORED_ONLY_TYPES_SET = STORED_ONLY_TYPES;
export const STL_TYPES_SET = STL_TYPES;
export const GLB_TYPES_SET = GLB_TYPES;
export const OBJ_TYPES_SET = OBJ_TYPES;
export const FORMAT_3MF_TYPES_SET = FORMAT_3MF_TYPES;
export const FBX_TYPES_SET = FBX_TYPES;
export const VRML_TYPES_SET = VRML_TYPES;
export const BACKEND_CONVERT_TYPES_SET = BACKEND_CONVERT_TYPES;
export const SLD_STORE_ONLY_TYPES_SET = SLD_STORE_ONLY_TYPES;

/**
 * Read the raw bytes of a blob/arrayBuffer and detect whether an STL payload
 * is ASCII (starts with the literal token "solid") or binary. This lets the
 * viewer choose the correct STL loader behavior and — critically — prevents a
 * binary payload from ever reaching a text/JSON parser.
 */
export function detectStlKind(bytes) {
  if (!bytes || bytes.length < 80) return 'ascii';
  const probe = new TextDecoder('latin1').decode(bytes.subarray(0, 80)).trimStart();
  if (/^solid/i.test(probe)) return 'ascii';
  return 'binary';
}

/**
 * Read a leading chunk of a blob and try to infer the actual file signature.
 * Returns a best-effort token: 'glb' | 'gltf-json' | 'stl-ascii' | 'stl-binary'
 * | 'obj' | 'step' | 'iges' | 'unknown'.
 */
export async function sniffSignature(blob) {
  try {
    const head = blob.slice(0, 1024);
    const buf = new Uint8Array(await head.arrayBuffer());
    const text = new TextDecoder('latin1').decode(buf.subarray(0, 256)).trimStart();

    if (buf.length >= 4 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) {
      return 'glb';
    }
    if (/^\{\s*"asset"/i.test(text) && /gltf/i.test(text)) return 'gltf-json';
    if (/^solid/i.test(text)) return 'stl-ascii';
    if (buf.length >= 5 && text.toLowerCase().startsWith('solid')) return 'stl-ascii';
    if (/^v\s+[-+0-9.eE]/.test(text) && /^f\s+\d/m.test(text)) return 'obj';
    if (/^ISO-10303-21/i.test(text) || /^DATA;/.test(text)) return 'step';
    if (/^g?\d+/i.test(text) && /^(116|126|110|106|112|124)/.test(text)) return 'iges';
    if (buf.length >= 5 && /^v\s/i.test(text)) return 'obj';
    if (buf.length >= 84 && text.length === 0) return 'stl-binary';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}