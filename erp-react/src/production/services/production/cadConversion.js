/**
 * CAD Conversion Service
 *
 * Provides the conversion pipeline decision for CAD files → browser-compatible
 * 3D. The actual rendering is performed by the Model Viewer, which routes each
 * file type to the correct Three.js loader or CAD conversion pipeline.
 *
 * Format routing (shared with modelFormats.js):
 *   - GLB/GLTF  -> GLTFLoader (browser-native)
 *   - STL       -> STLLoader  (browser-native, ASCII/binary auto-detect)
 *   - OBJ       -> OBJLoader  (browser-native)
 *   - 3MF/FBX/WRL/VRML -> Three.js addon loaders (browser-native)
 *   - STEP/STP/IGES/IGS -> backend OpenCascade CAD conversion -> GLB -> GLTFLoader
 *   - SLDPRT/SLDASM -> stored-only (never parsed directly; must export to STEP)
 */
import {
  isBrowserNative,
  isClientConvertible as isClientConvertibleFromFormats,
  needsBackendConversion,
  normalizeType,
} from './modelFormats';

/**
 * Check if a file type is already a browser-viewable 3D format.
 */
export function isBrowserNative3D(fileType) {
  return isBrowserNative(fileType);
}

/**
 * Check if a file type can be converted client-side.
 *
 * Kept for API compatibility: IGES/IGS used to be parsed client-side via
 * occt-import-js, but they now go through the same real backend OpenCascade
 * conversion as STEP. Nothing is parsed client-side anymore, so this always
 * returns false.
 */
export function isClientConvertible(fileType) {
  return isClientConvertibleFromFormats(fileType);
}

/**
 * Check if a file type requires backend conversion.
 */
export function requiresBackendConversion(fileType) {
  return needsBackendConversion(fileType);
}

/**
 * Get a human-readable description of the 3D file type.
 */
export function getFileTypeDescription(fileType) {
  const t = normalizeType(fileType);
  const descriptions = {
    'SLDPRT': 'SolidWorks Part',
    'SLDASM': 'SolidWorks Assembly',
    'STEP': 'STEP 3D Model',
    'STP': 'STEP 3D Model',
    'IGES': 'IGES 3D Model',
    'IGS': 'IGES 3D Model',
    'GLB': 'GLB 3D Model (Browser Ready)',
    'GLTF': 'glTF 3D Model (Browser Ready)',
    'STL': 'STL 3D Model (Browser Ready)',
    'OBJ': 'OBJ 3D Model (Browser Ready)',
  };
  return descriptions[t] || fileType || 'Unknown';
}

/**
 * Determine what actions are available for a given file type.
 * Downloads and 3D viewing are available whenever a file is present and the
 * type is a supported model format.
 */
export function getAvailableActions(fileType, hasFileData) {
  const t = normalizeType(fileType);
  const actions = [];

  if (hasFileData) {
    actions.push({ key: 'download', label: 'Download', icon: 'download' });
    if (isBrowserNative3D(t) || isClientConvertible(t) || requiresBackendConversion(t)) {
      actions.push({ key: 'view3d', label: 'View 3D', icon: 'eye' });
    }
  }

  return actions;
}
