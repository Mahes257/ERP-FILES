/**
 * cadGeometry.js — build a THREE.Group from the OCCT worker's typed-array
 * result (ported from the Designing module).
 *
 * Accepts BOTH typed arrays (normal worker output) and plain number[] (legacy
 * shape). Output contract:
 *   group.userData.cadResult = { meshes: [...] }
 *   group.userData.cadStats  — draw-call/vertex/triangle census
 */

import * as THREE from 'three';
import {
  hasArrayData,
  toFloat32Array,
  toIndexArray,
  vertexCountOf,
} from './cadTypedArrays.js';

const DEFAULT_BASE_COLOR = 0x94a3b8; // matches the viewer's STL material tone

/**
 * Professional CAD assembly color palette.
 * Used when the STEP/IGES file has no per-part color information.
 * Colors are assigned in order to distinguish individual parts.
 */
const ASSEMBLY_PALETTE = [
  0x2196F3, // Vibrant Blue (main body) — matches GrabCAD exactly
  0x1E88E5, // Bright Blue
  0x1976D2, // Medium Blue
  0x42A5F5, // Light Blue
  0x0D47A1, // Deep Blue
  0x455A64, // Blue Grey (shafts)
  0x78909C, // Light Blue Grey
  0x546E7A, // Medium Blue Grey
  0x795548, // Brown (hardware)
  0x6D4C41, // Light Brown
  0xC62828, // Vibrant Red (gaskets/seals) — matches GrabCAD red
  0xD32F2F, // Bright Red
  0x1565C0, // Strong Blue
  0x0277BD, // Cyan Blue
  0x37474F, // Dark Charcoal (screws)
];

/** Build a BufferGeometry from one OCCT mesh; null when no usable positions. */
function buildGeometryFromMesh(mesh) {
  const rawPosition = mesh?.attributes?.position?.array;
  if (!hasArrayData(rawPosition)) return null;

  const position = toFloat32Array(rawPosition);
  if (!position || position.length === 0) return null;

  const vertexCount = vertexCountOf(position);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));

  const rawNormal = mesh?.attributes?.normal?.array;
  let normalApplied = false;
  if (hasArrayData(rawNormal)) {
    const normal = toFloat32Array(rawNormal);
    if (normal && normal.length === position.length) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      normalApplied = true;
    }
  }
  if (!normalApplied) {
    geometry.computeVertexNormals();
  }

  // occt-import-js 0.0.23 puts the index on the mesh; older versions nested
  // it under attributes. Support both layouts.
  const rawIndex = mesh?.index?.array ?? mesh?.attributes?.index?.array;
  if (hasArrayData(rawIndex)) {
    const index = toIndexArray(rawIndex, vertexCount);
    if (index && index.length > 0) {
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
    }
  }

  // Per-B-rep-face coloring: material groups for faces that carry a color.
  const brepFaces = Array.isArray(mesh.brep_faces) ? mesh.brep_faces : [];
  let hasFaceColors = false;
  const coloredRanges = [];
  brepFaces.forEach((face) => {
    if (!face || !Array.isArray(face.color) || face.color.length < 3) return;
    const first = Number(face.first);
    const last = Number(face.last);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return;
    const [r, g, b] = face.color;
    if (![r, g, b].every((c) => Number.isFinite(c))) return;
    coloredRanges.push({ first, last, color: [r, g, b] });
    hasFaceColors = true;
  });

  return { geometry, hasFaceColors, coloredRanges };
}

/**
 * Build a THREE.Group from an occt-import-js result object.
 * @param {{ meshes: Array, root: object }} cadResult
 * @returns {THREE.Group}
 */
export function buildCadGroup(cadResult) {
  const group = new THREE.Group();
  group.name = 'CadModel';
  group.userData.cadResult = cadResult || null;

  const meshes = Array.isArray(cadResult?.meshes) ? cadResult.meshes : [];
  const materials = new Map();

  const colorToHex = (rgb, fallback) => {
    if (Array.isArray(rgb) && rgb.length >= 3 && rgb.every((c) => Number.isFinite(c))) {
      return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
    }
    return fallback;
  };

  const materialForColor = (hex) => {
    if (!materials.has(hex)) {
      // Professional CAD-quality PBR material — glossy, vibrant, metallic
      // Lower roughness + high clearcoat = glossy CAD plastic/painted metal look
      materials.set(hex, new THREE.MeshPhysicalMaterial({
        color: hex,
        metalness: 0.3,
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        envMapIntensity: 0,
        side: THREE.FrontSide,
        flatShading: false,
      }));
    }
    return materials.get(hex);
  };

  // Check if the file has DISTINCT, VIVID color information.
  // For STEP files, colors are at the mesh level. For IGES, they're on brep_faces.
  // We collect ALL colors (mesh-level + face-level) and check for true variety.
  const isVivid = (hex) => {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return Math.max(r, g, b) - Math.min(r, g, b) > 50;
  };
  // Two colors are "similar" if their Euclidean distance in RGB space < 60.
  const rgbDist = (a, b) => {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
  };
  // Pass 1: collect ALL unique colors from meshes AND brep_faces.
  const allColors = new Set();
  meshes.forEach((m) => {
    if (m.color && Array.isArray(m.color) && m.color.length >= 3) {
      allColors.add(colorToHex(m.color, null));
    }
    (Array.isArray(m.brep_faces) ? m.brep_faces : []).forEach((face) => {
      if (face && Array.isArray(face.color) && face.color.length >= 3) {
        allColors.add(colorToHex(face.color, null));
      }
    });
  });
  // Check if we have truly DISTINCT colors: at least 2 that are far apart in RGB.
  const colorArr = Array.from(allColors);
  const hasTrulyDistinctColors = colorArr.length >= 2 && colorArr.some((c1, i) =>
    colorArr.some((c2, j) => i < j && rgbDist(c1, c2) > 80)
  );
  // Also require at least one vivid color.
  const hasVividColors = colorArr.some(isVivid);
  const hasDistinctColors = hasTrulyDistinctColors && hasVividColors;
  let totalVertices = 0;
  let meshCount = 0;

  const meshObjects = [];
  meshes.forEach((mesh, meshIndex) => {
    const built = buildGeometryFromMesh(mesh);
    if (!built) return;
    const { geometry, hasFaceColors, coloredRanges } = built;

    const object = new THREE.Mesh(geometry, []);
    object.name = mesh?.name || `Solid ${meshIndex + 1}`;
    meshObjects.push(object);

    if (hasFaceColors) {
      /* Per-face material groups belong on the BufferGeometry — three.js Mesh
         has no addGroup(); geometry.addGroup(start, count, materialIndex)
         selects the material per triangle range. Calling it on the mesh threw
         `TypeError: object.addGroup is not a function` and killed every OCCT
         import whose faces carry colors (e.g. SolidWorks IGES exports). */
      const sorted = [...coloredRanges].sort((a, b) => a.first - b.first);
      // Use palette for base material when colors are not truly distinct (grey IGES)
      const meshHex = colorToHex(mesh?.color, DEFAULT_BASE_COLOR);
      const baseHex = hasDistinctColors ? (isVivid(meshHex) ? meshHex : meshHex) : ASSEMBLY_PALETTE[meshIndex % ASSEMBLY_PALETTE.length];
      const meshMaterials = [materialForColor(baseHex)];
      let cursor = 0;
      sorted.forEach((range, ri) => {
        if (range.first > cursor) {
          geometry.addGroup(cursor * 3, (range.first - cursor) * 3, 0);
        }
        geometry.addGroup(range.first * 3, (range.last - range.first + 1) * 3, meshMaterials.length);
        // When colors are not truly distinct (e.g. IGES all-lavender), use palette.
        const faceHex = colorToHex(range.color, DEFAULT_BASE_COLOR);
        const faceColor = hasDistinctColors ? faceHex : ASSEMBLY_PALETTE[meshIndex % ASSEMBLY_PALETTE.length];
        meshMaterials.push(materialForColor(faceColor));
        cursor = range.last + 1;
      });
      const triangleCount = geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
      if (cursor < triangleCount) {
        geometry.addGroup(cursor * 3, (triangleCount - cursor) * 3, 0);
      }
      object.material = meshMaterials;
    } else {
      // Use palette colors when file has no distinct per-part colors
      const meshColor = mesh?.color;
      const hasColor = meshColor && Array.isArray(meshColor) && meshColor.length >= 3;
      const hex = hasDistinctColors
        ? (hasColor ? colorToHex(meshColor, DEFAULT_BASE_COLOR) : DEFAULT_BASE_COLOR)
        : ASSEMBLY_PALETTE[meshIndex % ASSEMBLY_PALETTE.length];
      object.material = materialForColor(hex);
    }
    totalVertices += geometry.getAttribute('position').count;
    meshCount += 1;
  });

  if (meshObjects.length === 0) {
    throw new Error('The CAD file contains no renderable solid geometry.');
  }

  // Mirror the file's REAL hierarchy (occt root product structure) when it is
  // actually hierarchical; otherwise meshes stay flat.
  const root = cadResult?.root;
  const isHierarchical = Boolean(root && Array.isArray(root.children) && root.children.length > 0
    && (root.children.length > 1 || root.children.some((c) => c?.name || (Array.isArray(c?.children) && c.children.length > 0))));

  if (isHierarchical) {
    const attachNode = (node, parent) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.name = node?.name || 'Assembly';
      parent.add(nodeGroup);
      (Array.isArray(node?.meshes) ? node.meshes : []).forEach((meshIndex) => {
        const meshObject = meshObjects[meshIndex];
        if (meshObject) nodeGroup.add(meshObject);
      });
      (Array.isArray(node?.children) ? node.children : []).forEach((child) => attachNode(child, nodeGroup));
    };
    attachNode(root, group);
    const referenced = new Set();
    (function collect(node) {
      (node?.meshes || []).forEach((i) => referenced.add(i));
      (node?.children || []).forEach(collect);
    }(root));
    meshObjects.forEach((meshObject) => {
      if (!meshObject.parent) group.add(meshObject);
    });
  } else {
    meshObjects.forEach((meshObject) => group.add(meshObject));
  }

  // Census (reported via userData).
  let drawCalls = 0;
  let totalTriangles = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    drawCalls += Math.max(meshMaterials.filter(Boolean).length, 1);
    if (object.geometry.index) totalTriangles += object.geometry.index.count / 3;
    else totalTriangles += object.geometry.getAttribute('position').count / 3;
  });
  group.userData.cadStats = {
    meshes: meshCount,
    drawCalls,
    triangles: Math.round(totalTriangles),
    vertices: totalVertices,
    materials: materials.size,
  };

  return group;
}
