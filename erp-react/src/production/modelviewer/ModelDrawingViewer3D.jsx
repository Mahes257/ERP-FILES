import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Icon } from './Icon.jsx';
import { fetchCadFileBytes } from './cad/cadFileFetch.js';
import { parseCadFile, retainCadWorker, releaseCadWorker } from './cad/occtLoader.js';
import { buildCadGroup } from './cad/cadGeometry.js';
import { fetchFileFromUrl } from './fileUtils.js';

/**
 * ModelDrawingViewer3D — the Designing module's 3D viewer behaviour, adapted
 * to Mech R&D attachments.
 *
 * Browser-only viewing formats — NO CAD conversion server is involved:
 *  - glb / gltf / obj / stl  → three.js loaders (direct)
 *  - step / stp / iges / igs / brep → OCCT WASM worker tessellation
 *  - anything else (sldprt / sldasm / sat / …) → honest "browser preview is
 *    not available for this format" with the original file still downloadable
 */

const OCCT_FORMAT_BY_EXTENSION = { step: 'step', stp: 'step', iges: 'iges', igs: 'iges', brep: 'brep' };
/* Mesh formats parsed directly in the browser by a bundled Three.js loader.
   PLY (PLYLoader), DAE (ColladaLoader) and 3DS (TDSLoader) are part of the
   deployment's Three.js build, so they render with no server involved. */
const DIRECT_THREE_EXTENSIONS = new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'dae', '3ds']);

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  isometric: new THREE.Vector3(1, 1, 1).normalize(),
};

/* Section-cut axis vectors (world space). */
const AXIS_VECTORS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/* Pristine per-mesh stencil/side config — restored when Section is disabled. */
const SECTION_STENCIL_CONFIG = new Map();

/*
 * SectionCapPreview — live 2D cross-section outline of the clipped model,
 * drawn on a small 52×30 canvas inside the Section panel. Reads the same
 * world-space triangle soup the GPU clips, so it reflects the real cut
 * (holes/walls/cavities appear as outline gaps), never a fake graphic.
 */
function SectionCapPreview({ model, plane, localCanvasRef }) {
  useEffect(() => {
    const canvas = localCanvasRef?.current;
    if (!canvas || !model || !plane) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    /* Slice every mesh triangle against the plane (Lévy triangle-plane
       intersection). Reused arrays avoid per-segment allocation. */
    const pa = new THREE.Vector3(); const pb = new THREE.Vector3(); const pc = new THREE.Vector3();
    const nrm = plane.normal;
    const segments = [];
    const dTmp = [0, 0, 0];
    model.updateMatrixWorld(true);
    model.traverse((object) => {
      if (!object.isMesh || !object.geometry?.getAttribute) return;
      const geometry = object.geometry;
      const position = geometry.getAttribute('position');
      if (!position || position.count === 0) return;
      const index = geometry.getIndex();
      const triCount = index ? index.count / 3 : position.count / 3;
      const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
      for (let t = 0; t < triCount; t += 1) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(position, i0).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(position, i1).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(position, i2).applyMatrix4(object.matrixWorld);
        const d0 = nrm.dot(a) + plane.constant;
        const d1 = nrm.dot(b) + plane.constant;
        const d2 = nrm.dot(c) + plane.constant;
        dTmp[0] = d0; dTmp[1] = d1; dTmp[2] = d2;
        if ((d0 < 0 && d1 < 0 && d2 < 0) || (d0 > 0 && d1 > 0 && d2 > 0)) continue;
        pa.copy(a); pb.copy(b); pc.copy(c);
        /* Collect crossing points on the triangle's edges. */
        const pts = [];
        const vs = [pa, pb, pc];
        for (let e = 0; e < 3; e += 1) {
          const p = vs[e]; const q = vs[(e + 1) % 3];
          const dp = dTmp[e]; const dq = dTmp[(e + 1) % 3];
          if ((dp < 0) === (dq < 0)) continue;
          const frac = dp / (dp - dq);
          pts.push(new THREE.Vector3().lerpVectors(p, q, frac));
        }
        if (pts.length === 2) segments.push([pts[0], pts[1]]);
      }
    });
    if (segments.length === 0) { dTmp.length = 0; return; }

    /* Project segments onto the plane's 2D basis, fit to canvas. */
    const up = Math.abs(nrm.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const uAxis = new THREE.Vector3().crossVectors(up, nrm).normalize();
    const vAxis = new THREE.Vector3().crossVectors(nrm, uAxis).normalize();
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
    const flat = segments.map(([p, q]) => {
      const u1 = p.dot(uAxis); const v1 = p.dot(vAxis);
      const u2 = q.dot(uAxis); const v2 = q.dot(vAxis);
      if (u1 < minU) minU = u1; if (u1 > maxU) maxU = u1;
      if (v1 < minV) minV = v1; if (v1 > maxV) maxV = v1;
      if (u2 < minU) minU = u2; if (u2 > maxU) maxU = u2;
      if (v2 < minV) minV = v2; if (v2 > maxV) maxV = v2;
      return [u1, v1, u2, v2];
    });
    const spanU = Math.max(maxU - minU, 1e-9);
    const spanV = Math.max(maxV - minV, 1e-9);
    const scale = Math.min((w - 8) / spanU, (h - 8) / spanV);
    const offU = (w - spanU * scale) / 2 - minU * scale;
    const offV = (h - spanV * scale) / 2 - minV * scale;
    ctx.strokeStyle = '#075E54';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    flat.forEach(([u1, v1, u2, v2]) => {
      ctx.moveTo(u1 * scale + offU, v1 * scale + offV);
      ctx.lineTo(u2 * scale + offU, v2 * scale + offV);
    });
    ctx.stroke();
  }, [model, plane, localCanvasRef]);
  return null;
}

/**
 * Bounding-sphere fit helper (ported verbatim in behaviour): positions the
 * camera along `direction` so tiny, huge, elongated and off-origin models all
 * land correctly framed with zero clipping; near/far planes are derived from
 * the bounding sphere, never hard-coded.
 */
export function fitCameraToModel(camera, controls, modelObject, options = {}) {
  if (!camera || !controls || !modelObject) return null;
  modelObject.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(modelObject).getBoundingSphere(new THREE.Sphere());
  if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius <= 0) return null;

  const center = sphere.center;
  const radius = Math.max(sphere.radius, 1e-6);
  const padding = options.padding ?? 1.4;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = (radius * padding) / Math.sin(Math.min(vFov, hFov) / 2);

  let direction = options.keepDirection
    ? camera.position.clone().sub(center).normalize()
    : (options.direction || VIEW_DIRECTIONS.isometric).clone().normalize();
  if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);

  controls.target.copy(center);
  controls.minDistance = Math.max(radius * 0.05, 1e-4);
  controls.maxDistance = Math.max(distance * 8, radius * 50);
  camera.near = Math.max((distance - radius) / 4, 1e-4);
  camera.far = controls.maxDistance * 2 + radius * 2;
  camera.updateProjectionMatrix();
  controls.update();
  return { center, radius, distance };
}

function disposeModelResources(object) {
  if (!object) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry) geometries.add(child.geometry);
    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
    meshMaterials.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach((property) => {
        const texture = material[property];
        if (texture?.isTexture) textures.add(texture);
      });
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  object.parent?.remove(object);
}

function hasRenderableGeometry(object) {
  const meshes = [];
  object.traverse((child) => { if (child.isMesh) meshes.push(child); });
  return meshes.length > 0 && meshes.every((mesh) => {
    const position = mesh.geometry?.getAttribute('position');
    return Boolean(position && position.count > 0);
  });
}

/* ------------------------- three.js renderer hook ------------------------- */

function useThreeRenderer() {
  const [ready, setReady] = useState(false);
  /* The stage element is tracked as STATE (not just a callback ref) so the
     init effect below re-runs on EVERY (re)mount of the container div.
     A pure callback-ref initializer cannot recover when React runs the
     effect lifecycle twice around the same DOM node (React StrictMode dev,
     drawer remounts): the ref does not re-fire, and the second mount ends
     up with no canvas — exactly the STEP/IGES/BREP black-stage bug. */
  const [container, setContainer] = useState(null);
  const renderer = useRef(null);
  const scene = useRef(null);
  const camera = useRef(null);
  const controls = useRef(null);

  const containerRef = React.useCallback((node) => setContainer(node), []);

  /* Init + teardown live in the SAME effect so they are always symmetric:
     every disposal is followed by a fresh initialization. */
  useEffect(() => {
    if (!container || renderer.current) return undefined;

    try {
      renderer.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (error) {
      console.error('[3DViewer] WebGL initialization failed:', error);
      return undefined;
    }
    renderer.current.setSize(container.clientWidth, container.clientHeight);
    renderer.current.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.current.setClearColor(0xffffff, 1);
    renderer.current.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.current.toneMappingExposure = 1.0;
    renderer.current.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.current.domElement);

    const canvas = renderer.current.domElement;

    scene.current = new THREE.Scene();
    scene.current.background = new THREE.Color(0xffffff);
    
    // Professional CAD lighting — dramatic, metallic look like GrabCAD/SolidWorks
    scene.current.add(new THREE.AmbientLight(0xffffff, 0.35));
    scene.current.add(new THREE.HemisphereLight(0xc8d8f0, 0x0f172a, 0.8));
    
    // Key light — strong, warm-white from upper-right-front
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.5);
    keyLight.position.set(6, 10, 8);
    scene.current.add(keyLight);
    
    // Fill light — cooler, softer from left
    const fillLight = new THREE.DirectionalLight(0xb0c4de, 1.2);
    fillLight.position.set(-8, 5, -4);
    scene.current.add(fillLight);
    
    // Rim / back light — strong edge definition
    const rimLight = new THREE.DirectionalLight(0xe0e8f8, 1.0);
    rimLight.position.set(-3, -2, -6);
    scene.current.add(rimLight);
    
    // Top-down light for surface detail visibility
    const topLight = new THREE.DirectionalLight(0xf0f4ff, 0.8);
    topLight.position.set(0, 12, 2);
    scene.current.add(topLight);
    
    // Bottom fill to prevent dark undersides
    const bottomLight = new THREE.DirectionalLight(0x8899aa, 0.4);
    bottomLight.position.set(0, -8, 0);
    scene.current.add(bottomLight);
    
    // Subtle point lights for specular highlights on curved surfaces
    const specLight1 = new THREE.PointLight(0xffffff, 0.5, 25);
    specLight1.position.set(5, 7, 5);
    scene.current.add(specLight1);
    const specLight2 = new THREE.PointLight(0xd0d8e8, 0.4, 25);
    specLight2.position.set(-4, 6, -5);
    scene.current.add(specLight2);

    // No environment map — rely on direct lighting for all PBR materials.
    // A PMREM from an empty scene produces a near-black texture that can
    // make MeshStandardMaterial invisible against a dark background.

    camera.current = new THREE.PerspectiveCamera(40, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 10000);
    camera.current.position.set(2, 2, 2);

    controls.current = new OrbitControls(camera.current, renderer.current.domElement);
    controls.current.enableDamping = true;
    controls.current.dampingFactor = 0.08;
    controls.current.minDistance = 0.5;
    controls.current.maxDistance = 50;
    setReady(true);

    const handleResize = () => {
      if (renderer.current && camera.current && container) {
        renderer.current.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.current.setSize(container.clientWidth, container.clientHeight);
        camera.current.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
        camera.current.updateProjectionMatrix();
      }
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

    const onLost = (event) => { event.preventDefault(); };
    canvas.addEventListener('webglcontextlost', onLost);

    /* Teardown — mirrors the initialization above one-for-one. */
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      controls.current?.dispose();
      scene.current?.children.slice().forEach((object) => {
        if (object.isMesh || object.type === 'Group' || object.type === 'Object3D') {
          disposeModelResources(object);
          scene.current?.remove(object);
        }
      });
      scene.current?.clear();
      renderer.current?.dispose();
      renderer.current?.forceContextLoss?.();
      renderer.current?.domElement?.remove();
      controls.current = null;
      scene.current = null;
      camera.current = null;
      renderer.current = null;
      setReady(false);
    };
  }, [container]);

  return { renderer, scene, camera, controls, ready, containerRef };
}

/* --------------------------- direct three loader -------------------------- */

function useDirectModelLoader({ objectUrl, extension, enabled }) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !objectUrl || !DIRECT_THREE_EXTENSIONS.has(extension)) {
      setModel(null); setError(null); setLoading(false);
      return undefined;
    }
    let active = true;
    let pendingUrl = null;
    setModel(null); setError(null); setLoading(true);

    (async () => {
      try {
        let loadUrl = objectUrl;
        if (objectUrl.startsWith('http')) {
          const res = await fetchFileFromUrl(objectUrl);
          if (!res.ok) throw new Error(res.error || 'download failed');
          pendingUrl = res.objectUrl;
          loadUrl = res.objectUrl;
        }
        const handleLoaded = (loaded) => {
          if (!active) { disposeModelResources(loaded); return; }
          if (!hasRenderableGeometry(loaded)) {
            disposeModelResources(loaded);
            setError('The 3D model contains no renderable geometry.');
            setLoading(false);
            return;
          }
          setModel(loaded);
          setLoading(false);
        };
        const handleLoadError = (err) => {
          if (active) {
            console.warn('[3DViewer] model load error:', err);
            setError('Unable to load the 3D model.');
            setLoading(false);
          }
        };
        if (extension === 'glb' || extension === 'gltf') {
          new GLTFLoader().load(loadUrl, (gltf) => handleLoaded(gltf.scene), undefined, handleLoadError);
        } else if (extension === 'obj') {
          new OBJLoader().load(loadUrl, handleLoaded, undefined, handleLoadError);
        } else if (extension === 'ply') {
          /* PLYLoader resolves a BufferGeometry (point cloud or mesh). */
          new PLYLoader().load(loadUrl, (geometry) => {
            const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
              color: 0x2196F3,
              metalness: 0.3,
              roughness: 0.3,
              clearcoat: 0.6,
              clearcoatRoughness: 0.1,
              envMapIntensity: 0,
              side: THREE.DoubleSide,
              flatShading: false,
              /* Color-per-vertex scans carry a color attribute; honour it. */
              vertexColors: Boolean(geometry.attributes?.color),
            }));
            handleLoaded(mesh);
          }, undefined, handleLoadError);
        } else if (extension === 'dae' || extension === '3ds') {
          /* ColladaLoader resolves { scene }; TDSLoader resolves a Group. */
          const onScene = (loaded) => handleLoaded(loaded?.scene || loaded);
          if (extension === 'dae') {
            new ColladaLoader().load(loadUrl, onScene, undefined, handleLoadError);
          } else {
            new TDSLoader().load(loadUrl, onScene, undefined, handleLoadError);
          }
        } else {
          /* DoubleSide: STL exports frequently carry inconsistent triangle
             winding, and backface culling renders those facets invisible
             (holes/pinwheel artifacts). The SLDPRT→GLB path is untouched. */
          new STLLoader().load(loadUrl, (geometry) => {
            /* Apply the same professional CAD material as STEP/IGES: vibrant blue
               MeshPhysicalMaterial with clearcoat, matching the STEP viewer look. */
            const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
              color: 0x2196F3, // Vibrant Blue — first color of ASSEMBLY_PALETTE
              metalness: 0.3,
              roughness: 0.3,
              clearcoat: 0.6,
              clearcoatRoughness: 0.1,
              envMapIntensity: 0,
              side: THREE.DoubleSide,
              flatShading: false,
            }));
            handleLoaded(mesh);
          }, undefined, handleLoadError);
        }
      } catch (err) {
        if (active) {
          console.warn('[3DViewer] download error:', err);
          setError('Unable to download the 3D model.');
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [objectUrl, extension, enabled]);

  return { model, error, loading };
}

/* ------------------------------ CAD loader ------------------------------- */

const CAD_STAGE_MESSAGES = {
  fetch: 'Loading CAD file…',
  wasm: 'Parsing CAD geometry…',
  parse: 'Parsing CAD geometry…',
  build: 'Building 3D model…',
  render: 'Rendering model…',
};

function useCadLoader({ url, extension, enabled, meta, design }, retryKey = 0) {
  const [cadState, setCadState] = useState({ model: null, fallback: null, bytes: null, error: null, loading: false, message: '', stage: null });
  const previewUrlRef = useRef(null);

  useEffect(() => {
    const occtFormat = OCCT_FORMAT_BY_EXTENSION[extension];
    if (!enabled || !occtFormat || !url) {
      setCadState({ model: null, fallback: null, bytes: null, error: null, loading: false, message: '', stage: null });
      return undefined;
    }

    let active = true;
    const isCurrent = () => active;
    const reset = { model: null, fallback: null, bytes: null, error: null, loading: false, message: '', stage: null };
    const abortController = new AbortController();
    const setStage = (stage, customMessage) => {
      setCadState((current) => ({ ...current, loading: true, error: null, message: customMessage || CAD_STAGE_MESSAGES[stage] || CAD_STAGE_MESSAGES.fetch, stage }));
    };

    const run = async () => {
      try {
        if (occtFormat) {
          /* Dev pipeline logging (STEP/IGES/BREP): detection, size, and every
             stage — the parse is single-threaded WASM (no messages), so this
             is the only visibility into it. Harmless in production. */
          console.debug(`[OCCT] detected: .${extension} → format=${occtFormat} | file: ${meta?.fileName || '?'}`);
          setStage('fetch');
          const { bytes } = await fetchCadFileBytes(url, abortController.signal, { format: occtFormat, ...meta });
          if (active) console.debug(`[OCCT] fetched: ${bytes.length.toLocaleString()} bytes | parser started`);
          if (!active) return;
          setStage('parse');
          const cadResult = await parseCadFile(bytes, occtFormat, {
            signal: abortController.signal,
            onProgress: (p) => { if (p?.stage && active) setStage(p.stage); },
          });
          if (!active) return;
          setStage('render');
          const group = buildCadGroup(cadResult);
          if (!active) { disposeModelResources(group); return; }
          const stats = group.userData?.cadStats;
          const cadBox = new THREE.Box3().setFromObject(group);
          console.debug(
            `[OCCT] parse+build completed: meshes=${stats?.meshes ?? '?'} vertices=${stats?.vertices ?? '?'} triangles=${stats?.triangles ?? '?'}`,
            `| bbox min=(${cadBox.min.toArray().map((n) => n.toFixed(1)).join(', ')}) max=(${cadBox.max.toArray().map((n) => n.toFixed(1)).join(', ')})`,
          );
          setCadState({ ...reset, model: group });
          return;
        }
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        /* Preserve the REAL error + stack in the log — the UI gets a
           user-friendly message, development gets the truth. */
        console.warn('[3DViewer] CAD load failed:', err, '\nstack:', err?.stack);
        setCadState({ ...reset, error: describeCadError(err, extension) });
      }
    };

    retainCadWorker();
    run();
    return () => {
      active = false;
      abortController.abort();
      releaseCadWorker();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [url, extension, enabled, retryKey]);

  return cadState;
}

/** Explicit, actionable error classification (ported behaviour). */
export function describeCadError(err, extension) {
  const ext = String(extension || '').toUpperCase();
  const message = String(err?.message || err || '');
  const code = String(err?.code || '');
  if (err?.name === 'AbortError') return null;
  
  // Pass through CAD_CONTENT errors directly
  if (code.startsWith('CAD_CONTENT_')) return message;
  
  // Browser-side parsing errors (OCCT WASM / three.js loaders)
  // Generic fallback errors
  if (/Unsupported CAD format/i.test(message)) {
    return `The ${ext} format cannot be parsed in the browser. Export a STEP/IGES/BREP file instead.`;
  }
  if (/WASM|WebAssembly|instantiate/i.test(message)) {
    return 'The CAD geometry engine (WebAssembly) failed to initialize. Reload the page and retry.';
  }
  if (/crashed|stopped responding|stalled/i.test(message)) {
    return 'The CAD parser stopped responding. Retry — the engine restarts automatically.';
  }
  if (/no renderable solid geometry|could not read this file/i.test(message)) {
    return `The ${ext} file contains no renderable solid geometry. Verify the file is a valid ${ext} solid model.`;
  }
  
  // Pass through the actual error message if available
  return message || `Unable to parse the ${ext} file in the browser.`;
}

/* ------------------------------ sub-views -------------------------------- */

function ToolButton({ children, label, onClick, disabled = false, active = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 place-items-center rounded-lg border px-2 text-[12px] font-semibold transition-colors ${
        active ? 'border-[#075E54] bg-[#EAF7F4] text-[#075E54]' : 'border-[#DCE8E4] bg-white text-slate-500 hover:border-[#075E54] hover:text-[#075E54]'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {children}
    </button>
  );
}

function Viewer3DMessage({ icon, title, lines, tone = 'info', action }) {
  const toneRing = tone === 'error' ? 'border-red-200' : tone === 'warn' ? 'border-amber-200' : 'border-[#DCE8E4]';
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-6" style={{ background: '#0f172a' }}>
      <div className={`w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-xl ${toneRing}`}>
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#F1F6F4] text-[#0B7A68]">{icon}</div>
        <h3 className="text-[15px] font-bold" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: '#102A2A' }}>{title}</h3>
        {lines?.length ? (
          <ul className="mx-auto mt-2 max-w-md list-disc space-y-1 px-5 text-left text-[12px] leading-relaxed text-slate-500">
            {lines.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        ) : null}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

/* ---------------------------- main component ----------------------------- */

export default function ModelDrawingViewer3D({ url, fileName, onDownload, design, downloadState = 'idle', onClose }) {
  const [wireframe, setWireframe] = useState(false);
  const [cadRetry, setCadRetry] = useState(0);

  /* ---- Measurement tool ---- */
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureType, setMeasureType] = useState('point-point'); // point-point | edge | angle | diameter
  const [measureUnit, setMeasureUnit] = useState('mm'); // mm | cm | inch
  const [measurements, setMeasurements] = useState([]); // completed measurements [{id, type, points, value, unit}]
  const [currentPair, setCurrentPair] = useState([]); // in-progress picks [{x,y,z}]
  const measureGroupRef = useRef(null); // THREE.Group for all measurement visuals
  const raycasterRef = useRef(null);
  const measureIdRef = useRef(0);

  /* ---- Hover & Selection system ---- */
  const [hoveredFace, setHoveredFace] = useState(null); // {object, face, point}
  const [selectedFaces, setSelectedFaces] = useState([]); // [{object, face, point, id}]
  const [hoveredPart, setHoveredPart] = useState(null); // for assembly part highlighting
  const [selectedPart, setSelectedPart] = useState(null); // for assembly part selection
  const [assemblyParts, setAssemblyParts] = useState([]); // [{name, mesh, visible}]
  const [hiddenParts, setHiddenParts] = useState(new Set()); // hidden part names
  const hoverHighlightRef = useRef(null); // THREE.Mesh for hover highlight
  const selectionHighlightRef = useRef(null); // THREE.Group for selection highlights
  const originalMaterialsRef = useRef(new Map()); // store original materials for restore
  const rubberBandRef = useRef(null); // THREE.Line for rubber-band during measurement
  const cursorPointRef = useRef(null); // THREE.Vector3 for cursor position on model
  const raycasterMoveRef = useRef(null); // separate raycaster for hover (performance)

  /* ---------------- Section Cut (Three.js clipping planes) ----------------
     Temporary, viewer-only operation — the source .SLDPRT is never touched.
     Uses renderer.localClippingEnabled + per-mesh material.clippingPlanes. */
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionPanelOpen, setSectionPanelOpen] = useState(false);
  const [sectionAxis, setSectionAxis] = useState('x');
  const [sectionFlip, setSectionFlip] = useState(false);
  const [sectionPos, setSectionPos] = useState(0.5);
  const [sectionPlane, setSectionPlane] = useState(null);
  const sectionPlanesRef = useRef([]);
  const localCanvasRef = useRef(null);

  const extension = useMemo(() => {
    const m = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }, [fileName]);

  const isDirect = DIRECT_THREE_EXTENSIONS.has(extension);
  const isOcct = Boolean(OCCT_FORMAT_BY_EXTENSION[extension]);
  const isSupported3D = isDirect || isOcct;

  /* Resolve the attachment to a renderable object URL (session registry). */
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [resolveError, setResolveError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    setResolveError(null);
    if (!url) return undefined;
    fetchFileFromUrl(url).then((res) => {
      if (!cancelled) {
        if (res.ok) setResolvedUrl(res.objectUrl);
        else setResolveError(res.error || 'load failed');
      }
    });
    return () => { cancelled = true; };
  }, [url]);

  const { renderer, scene, camera, controls, ready, containerRef } = useThreeRenderer();
  const direct = useDirectModelLoader({ objectUrl: resolvedUrl, extension, enabled: isDirect && !!resolvedUrl });
  const cad = useCadLoader({ url: resolvedUrl, extension, enabled: isOcct && !!resolvedUrl, meta: { fileName } }, cadRetry);

  const model = direct.model || cad.model;
  const loadingMessage = cad.loading ? cad.message : direct.loading ? 'Loading 3D model…' : null;
  const loadError = direct.error || cad.error || (resolveError ? 'Unable to load the 3D model file.' : null);

  /* Model lifecycle: dispose the previous model on file switch. */
  const previousModelRef = useRef(null);
  useEffect(() => {
    const previous = previousModelRef.current;
    if (previous && previous !== model) {
      scene.current?.remove(previous);
      disposeModelResources(previous);
    }
    previousModelRef.current = model;
  }, [model, scene]);

  /* Attach model to the scene + frame it (bounding-sphere fit).
     `ready` re-runs this after any renderer re-initialization (StrictMode /
     drawer remount) so the freshly built scene gets the model re-attached. */
  useEffect(() => {
    if (!model || !ready || !scene.current || !camera.current || !controls.current) return undefined;
    scene.current.add(model);

    /* Add subtle edge lines to all meshes for mechanical detail visibility.
       Uses EdgesGeometry with a threshold angle to show only sharp edges.
       This gives the CAD drawing look seen in professional viewers like GrabCAD. */
    const edgeLinesGroup = new THREE.Group();
    edgeLinesGroup.name = 'EdgeLines';
    model.traverse((child) => {
      if (!child.isMesh) return;
      try {
        const edges = new THREE.EdgesGeometry(child.geometry, 20);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x1a2a40,
          transparent: true,
          opacity: 0.25,
          linewidth: 1,
        });
        const lineSegments = new THREE.LineSegments(edges, lineMat);
        // Copy the world transform from the mesh
        child.updateWorldMatrix(true, false);
        lineSegments.applyMatrix4(child.matrixWorld);
        edgeLinesGroup.add(lineSegments);
      } catch (_) { /* skip geometry that can't produce edges */ }
    });
    scene.current.add(edgeLinesGroup);

    const fit = fitCameraToModel(camera.current, controls.current, model, { direction: VIEW_DIRECTIONS.isometric });
    controls.current.saveState?.();
    /* Dev diagnostics: geometry census + framing (extension, mesh/vertex
       counts, bounding box, camera fit). Harmless in production. */
    const stats = model.userData?.cadStats;
    const box = new THREE.Box3().setFromObject(model);
    const fmt = (v) => v.map((n) => Number(n.toFixed(2))).join(', ');
    console.debug(
      '[3DViewer] model attached:', fileName || extension,
      `| meshes=${stats?.meshes ?? '?'} vertices=${stats?.vertices ?? '?'} triangles=${stats?.triangles ?? '?'}`,
      `| bbox min=(${fmt(box.min.toArray())}) max=(${fmt(box.max.toArray())})`,
      fit ? `| camera fit distance=${fit.distance.toFixed(2)} radius=${fit.radius.toFixed(2)}` : '| camera fit FAILED',
    );
    return () => {
      scene.current?.remove(model);
      // Also remove edge lines
      scene.current?.traverse((child) => {
        if (child.name === 'EdgeLines') scene.current?.remove(child);
      });
    };
  }, [model, scene, camera, controls, ready]);

  /* Section Cut: recolor the edge-line overlay to a medium-dark gray (#555555)
     while cutting so the wireframe on the kept (non-cut) side reads clearly on
     the white background without looking black. Only the existing
     LineBasicMaterial color/opacity change — same LineSegments, same geometry,
     same positions, no clipping added — and the original light-gray look is
     restored exactly when Section is off. */
  useEffect(() => {
    if (!scene.current) return undefined;
    const color = sectionEnabled ? 0x555555 : 0x1a2a40;
    const opacity = sectionEnabled ? 1 : 0.25;
    scene.current.traverse((child) => {
      if (child?.name !== 'EdgeLines' || !child.isGroup) return;
      child.children.forEach((line) => {
        if (!line.isLineSegments || !line.material) return;
        line.material.color.setHex(color);
        line.material.opacity = opacity;
        line.material.needsUpdate = true;
      });
    });
    return undefined;
  }, [sectionEnabled, model, ready]);

  /* Render loop (pauses when the tab is hidden). */
  useEffect(() => {
    if (!renderer.current || !scene.current || !camera.current) return undefined;
    let frame;
    const animate = () => {
      if (document.hidden) { frame = undefined; return; }
      if (!renderer.current || !scene.current || !camera.current) {
        frame = requestAnimationFrame(animate);
        return;
      }
      controls.current?.update?.();
      renderer.current.render(scene.current, camera.current);
      frame = requestAnimationFrame(animate);
    };
    const handleVisibility = () => {
      if (!document.hidden && frame === undefined) frame = requestAnimationFrame(animate);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    frame = requestAnimationFrame(animate);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [renderer, scene, camera, ready]);

  /* Wireframe toggle. */
  useEffect(() => {
    if (!model) return undefined;
    model.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        material.wireframe = wireframe;
        material.needsUpdate = true;
      });
    });
    return undefined;
  }, [model, wireframe]);

  /* ---- Assembly Part Detection ----
     Detects individual parts in a STEP/IGES assembly hierarchy.
     The buildCadGroup function creates nested Group objects for hierarchical
     assemblies, and flat Mesh objects for non-hierarchical ones.
     We treat each direct child of the root model as a 'part':
       - If it's a Group containing meshes → that Group is the part
       - If it's a bare Mesh → each Mesh is its own part */
  useEffect(() => {
    if (!model) {
      setAssemblyParts([]);
      return undefined;
    }
    const parts = [];
    // Direct children of the root model group
    model.children.forEach((child, idx) => {
      if (child.name === '__hoverHighlight__' || child.name === '__selectionHighlight__'
        || child.name === '__measureGroup__' || child.name === '__rubberBand__') return;
      if (child.isMesh) {
        // Flat: each mesh is a separate part
        parts.push({
          name: child.name || `Part ${idx + 1}`,
          mesh: child,
          visible: true,
        });
      } else if (child.isGroup) {
        // Hierarchical: the group represents a sub-assembly or part
        parts.push({
          name: child.name || `Part ${idx + 1}`,
          mesh: child,
          visible: true,
        });
      }
    });
    // If only one child was found, try going one level deeper
    if (parts.length <= 1) {
      parts.length = 0;
      model.traverse((child) => {
        if (!child.isMesh) return;
        // Each mesh is its own part when hierarchy is flat
        parts.push({
          name: child.name || `Part ${parts.length + 1}`,
          mesh: child,
          visible: true,
        });
      });
    }
    setAssemblyParts(parts);
    console.debug('[3DViewer] Assembly parts detected:', parts.length, parts.map(p => p.name));
    return undefined;
  }, [model]);

  /* ---- Double-click part selection ---- */
  useEffect(() => {
    if (!model || !renderer.current || !camera.current) return undefined;

    const canvas = renderer.current.domElement;
    let clickTimer = null;
    let clickCount = 0;

    const onDblClick = (event) => {
      if (measureEnabled) return; // Don't select during measurement
      if (!model || !camera.current) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const rc = new THREE.Raycaster();
      rc.setFromCamera(mouse, camera.current);
      const intersects = rc.intersectObject(model, true);
      if (intersects.length === 0) return;

      const hit = intersects[0];
      const hitObject = hit.object;

      // Find the matching assembly part by walking up the hierarchy
      // and checking against the detected assembly parts list
      let matchedPart = null;
      let check = hitObject;
      while (check && check !== model) {
        const found = assemblyParts.find(p => p.mesh === check);
        if (found) { matchedPart = found; break; }
        check = check.parent;
      }
      // Fallback: the hit mesh itself
      if (!matchedPart) {
        matchedPart = assemblyParts.find(p => p.mesh === hitObject);
      }
      // Final fallback: just use the hit object
      if (!matchedPart) {
        matchedPart = { name: hitObject.name || 'Part', mesh: hitObject };
      }

      const partName = matchedPart.name;

      // Toggle selection: if same part clicked, deselect
      if (selectedPart && selectedPart.mesh === matchedPart.mesh) {
        setSelectedPart(null);
        console.debug('[3DViewer] Part deselected:', partName);
      } else {
        setSelectedPart({ name: partName, mesh: matchedPart.mesh });
        console.debug('[3DViewer] Part selected:', partName);
      }
    };

    canvas.addEventListener('dblclick', onDblClick);
    return () => { canvas.removeEventListener('dblclick', onDblClick); };
  }, [model, measureEnabled, selectedPart, assemblyParts, camera, renderer, ready]);

  /* ---- Apply selection highlight: blue bounding box around selected part ----
     Matches GrabCAD / SolidWorks style: blue box outline around the selected
     assembly component. No material modification — pure overlay. */
  useEffect(() => {
    if (!model) return;

    // Clean up previous selection box
    if (selectionHighlightRef.current) {
      if (selectionHighlightRef.current.isGroup) {
        selectionHighlightRef.current.traverse((child) => {
          if (child.isBoxHelper) { model.remove(child); child.dispose(); }
        });
      } else if (selectionHighlightRef.current.isBoxHelper) {
        model.remove(selectionHighlightRef.current);
        selectionHighlightRef.current.dispose();
      }
      selectionHighlightRef.current = null;
    }

    if (!selectedPart || !selectedPart.mesh) return;

    // Create a blue bounding box around the selected part
    const box = new THREE.BoxHelper(selectedPart.mesh, 0x22d3ee);
    box.name = '__selectionBox__';
    box.lineWidth = 3;
    model.add(box);
    selectionHighlightRef.current = box;

    console.debug('[3DViewer] Selection box applied to:', selectedPart.name);
  }, [model, selectedPart]);

  /* ---- Measurement: click-to-pick handler ---- */
  useEffect(() => {
    if (!measureEnabled || !renderer.current || !scene.current || !camera.current) return undefined;

    try {
      if (!raycasterRef.current) raycasterRef.current = new THREE.Raycaster();
      const raycaster = raycasterRef.current;

      if (!measureGroupRef.current) {
        measureGroupRef.current = new THREE.Group();
        measureGroupRef.current.name = '__measureGroup__';
        scene.current.add(measureGroupRef.current);
      }

      const canvas = renderer.current.domElement;

      const onClick = (event) => {
        if (!model || !camera.current) return;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(mouse, camera.current);
        const intersects = raycaster.intersectObject(model, true);
        if (intersects.length === 0) return;

        const hit = intersects[0];
        const point = hit.point.clone();
        const snapped = snapToNearestVertex(hit);
        const pickPoint = snapped || point;

        // Highlight the selected face
        try { highlightFace(hit); } catch (_) { /* non-critical */ }

        setCurrentPair((prev) => {
          const next = [...prev, { x: pickPoint.x, y: pickPoint.y, z: pickPoint.z }];
          if (next.length === 2) {
            // Complete the measurement
            const a = new THREE.Vector3(next[0].x, next[0].y, next[0].z);
            const b = new THREE.Vector3(next[1].x, next[1].y, next[1].z);
            const dist = a.distanceTo(b);
            const id = ++measureIdRef.current;
            setMeasurements((prev) => [...prev, {
              id, type: 'point-point', points: [...next],
              value: dist, unit: 'mm', edge: null,
            }]);
            return [];
          }
          return next;
        });
      };
      canvas.addEventListener('click', onClick);
      return () => { canvas.removeEventListener('click', onClick); };
    } catch (err) {
      console.warn('[Measure] Failed to set up measurement picker:', err);
      return undefined;
    }
  }, [measureEnabled, model, camera, scene, renderer, ready]);

  /* ---- Hover highlighting & rubber-band line ---- */
  useEffect(() => {
    if (!model || !renderer.current || !scene.current || !camera.current) return undefined;

    try {
      if (!raycasterMoveRef.current) raycasterMoveRef.current = new THREE.Raycaster();
      const raycaster = raycasterMoveRef.current;

      // Hover highlight is now a dynamic BoxHelper created on mousemove
      // Selection highlight is a dynamic BoxHelper created on dblclick

      // Create rubber-band line for measurement
      if (!rubberBandRef.current) {
        const rbGeo = new THREE.BufferGeometry();
        const rbMat = new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 2,
          transparent: true,
          opacity: 0.7,
        });
        rubberBandRef.current = new THREE.Line(rbGeo, rbMat);
        rubberBandRef.current.name = '__rubberBand__';
        rubberBandRef.current.visible = false;
        scene.current.add(rubberBandRef.current);
      }

      const canvas = renderer.current.domElement;

      const onMouseMove = (event) => {
        if (!model || !camera.current) return;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(mouse, camera.current);
        const intersects = raycaster.intersectObject(model, true);

        if (intersects.length === 0) {
          // No intersection - clear hover box
          if (hoverHighlightRef.current) {
            if (hoverHighlightRef.current.isBoxHelper) {
              model.remove(hoverHighlightRef.current);
              hoverHighlightRef.current.dispose();
            } else {
              hoverHighlightRef.current.visible = false;
            }
            hoverHighlightRef.current = null;
          }
          canvas.style.cursor = measureEnabled ? 'crosshair' : 'default';
          setHoveredFace(null);
          setHoveredPart(null);
          cursorPointRef.current = null;
          if (rubberBandRef.current) rubberBandRef.current.visible = false;
          return;
        }

        const hit = intersects[0];
        const point = hit.point.clone();
        cursorPointRef.current = point;

        // Find the part this mesh belongs to for hover highlighting
        if (hit.object && !measureEnabled) {
          // Find matching assembly part
          let matchedPart = null;
          let check = hit.object;
          while (check && check !== model) {
            const found = assemblyParts.find(p => p.mesh === check);
            if (found) { matchedPart = found; break; }
            check = check.parent;
          }
          if (!matchedPart) matchedPart = assemblyParts.find(p => p.mesh === hit.object);

          if (matchedPart && matchedPart.mesh) {
            // Show a bounding box around the hovered part
            if (hoverHighlightRef.current && hoverHighlightRef.current.isBoxHelper) {
              model.remove(hoverHighlightRef.current);
              hoverHighlightRef.current.dispose();
              hoverHighlightRef.current = null;
            }
            const box = new THREE.BoxHelper(matchedPart.mesh, 0x22d3ee);
            box.name = '__hoverBox__';
            model.add(box);
            hoverHighlightRef.current = box;
            setHoveredPart(matchedPart);
            canvas.style.cursor = 'pointer';
          } else {
            // No part match — clear hover box
            if (hoverHighlightRef.current && hoverHighlightRef.current.isBoxHelper) {
              model.remove(hoverHighlightRef.current);
              hoverHighlightRef.current.dispose();
              hoverHighlightRef.current = null;
            }
            setHoveredPart(null);
            canvas.style.cursor = measureEnabled ? 'crosshair' : 'default';
          }
        } else {
          // Clear hover
          if (hoverHighlightRef.current && hoverHighlightRef.current.isBoxHelper) {
            model.remove(hoverHighlightRef.current);
            hoverHighlightRef.current.dispose();
            hoverHighlightRef.current = null;
          }
          setHoveredPart(null);
          canvas.style.cursor = measureEnabled ? 'crosshair' : 'default';
        }

        // Update rubber-band line if we have first pick
        if (measureEnabled && currentPair.length === 1 && rubberBandRef.current) {
          const firstPoint = currentPair[0];
          const rbGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(firstPoint.x, firstPoint.y, firstPoint.z),
            point
          ]);
          rubberBandRef.current.geometry.dispose();
          rubberBandRef.current.geometry = rbGeo;
          rubberBandRef.current.visible = true;
        }

        // Cursor feedback
        canvas.style.cursor = measureEnabled ? 'crosshair' : 'pointer';
      };

      canvas.addEventListener('mousemove', onMouseMove);
      return () => { canvas.removeEventListener('mousemove', onMouseMove); };
    } catch (err) {
      console.warn('[Hover] Failed to set up hover system:', err);
      return undefined;
    }
  }, [model, measureEnabled, currentPair, camera, scene, renderer, ready]);

  /* Snap picked point to the nearest vertex for sub-mm accuracy.
     Threshold adapts to model scale: 2% of bounding-box diagonal. */
  function snapToNearestVertex(hit) {
    if (!hit.object?.geometry?.attributes?.position) return null;
    const geo = hit.object.geometry;
    const posAttr = geo.attributes.position;
    const face = hit.face;
    if (!face) return null;

    // Adaptive threshold: 2% of model bounding box diagonal
    const box = new THREE.Box3().setFromObject(model);
    const diag = box.min.distanceTo(box.max);
    const threshold = Math.max(diag * 0.02, 0.1); // at least 0.1mm

    // Get the three vertices of the hit triangle
    const vA = new THREE.Vector3().fromBufferAttribute(posAttr, face.a);
    const vB = new THREE.Vector3().fromBufferAttribute(posAttr, face.b);
    const vC = new THREE.Vector3().fromBufferAttribute(posAttr, face.c);

    // Transform to world space
    const mat = hit.object.matrixWorld;
    vA.applyMatrix4(mat);
    vB.applyMatrix4(mat);
    vC.applyMatrix4(mat);

    // Find closest vertex to the hit point
    const distA = hit.point.distanceTo(vA);
    const distB = hit.point.distanceTo(vB);
    const distC = hit.point.distanceTo(vC);
    const minDist = Math.min(distA, distB, distC);
    if (minDist > threshold) return null; // too far from any vertex, use surface point
    if (minDist === distA) return vA;
    if (minDist === distB) return vB;
    return vC;
  }

  /* Detect edge from hit by finding shared edges between triangles. */
  function detectEdge(hit) {
    if (!hit.object?.geometry?.attributes?.position) return null;
    const geo = hit.object.geometry;
    const posAttr = geo.attributes.position;
    const face = hit.face;
    if (!face) return null;

    // Get the three vertices of the hit triangle
    const vA = new THREE.Vector3().fromBufferAttribute(posAttr, face.a);
    const vB = new THREE.Vector3().fromBufferAttribute(posAttr, face.b);
    const vC = new THREE.Vector3().fromBufferAttribute(posAttr, face.c);

    // Transform to world space
    const mat = hit.object.matrixWorld;
    vA.applyMatrix4(mat);
    vB.applyMatrix4(mat);
    vC.applyMatrix4(mat);

    // Find the closest edge to the hit point
    const edges = [
      { start: vA, end: vB, startIdx: face.a, endIdx: face.b },
      { start: vB, end: vC, startIdx: face.b, endIdx: face.c },
      { start: vC, end: vA, startIdx: face.c, endIdx: face.a },
    ];

    let closestEdge = null;
    let minDist = Infinity;

    for (const edge of edges) {
      // Distance from point to line segment
      const line = edge.end.clone().sub(edge.start);
      const len = line.length();
      if (len < 1e-10) continue;
      const t = Math.max(0, Math.min(1, hit.point.clone().sub(edge.start).dot(line) / (len * len)));
      const closest = edge.start.clone().addScaledVector(line, t);
      const dist = hit.point.distanceTo(closest);
      if (dist < minDist) {
        minDist = dist;
        closestEdge = { start: edge.start, end: edge.end, closestPoint: closest };
      }
    }

    return closestEdge;
  }

  /* ---- Measurement: update 3D visuals when measurements or current picks change ---- */
  useEffect(() => {
    try {
      if (!measureGroupRef.current) return;
      const group = measureGroupRef.current;
      // Clear ALL previous visuals
      while (group.children.length > 0) {
        const child = group.children[0];
        child.geometry?.dispose();
        child.material?.dispose();
        if (child.material?.map) child.material.map.dispose();
        group.remove(child);
      }

  const dotGeo = new THREE.SphereGeometry(0.04 * 10, 12, 12);
  const pickedGeo = new THREE.SphereGeometry(0.055 * 10, 12, 12);

      // Adaptive scale for measurement visuals based on model size
      const modelBox = model ? new THREE.Box3().setFromObject(model) : null;
      const modelDiag = modelBox ? modelBox.min.distanceTo(modelBox.max) : 100;
      const scale = Math.max(modelDiag * 0.001, 0.01);

      // Render all completed measurements
      measurements.forEach((m) => {
        const sub = new THREE.Group();
        sub.name = `measure-${m.id}`;
        const pts = m.points;
        if (pts.length < 2) { group.add(sub); return; }
        const a = new THREE.Vector3(pts[0].x, pts[0].y, pts[0].z);
        const b = new THREE.Vector3(pts[1].x, pts[1].y, pts[1].z);

        // Endpoint dots with glow effect
        const dMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
        const dA = new THREE.Mesh(dotGeo, dMat);
        dA.position.copy(a); sub.add(dA);
        const dB = new THREE.Mesh(dotGeo, dMat);
        dB.position.copy(b); sub.add(dB);

        // Outer glow rings for endpoints
        const ringGeo = new THREE.RingGeometry(0.06 * scale * 10, 0.08 * scale * 10, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const ringA = new THREE.Mesh(ringGeo, ringMat);
        ringA.position.copy(a); ringA.lookAt(camera.current.position); sub.add(ringA);
        const ringB = new THREE.Mesh(ringGeo, ringMat);
        ringB.position.copy(b); ringB.lookAt(camera.current.position); sub.add(ringB);

        // Dimension line with arrow heads
        const dir = b.clone().sub(a).normalize();
        const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 });
        sub.add(new THREE.Line(lineGeo, lineMat));

        // Arrow heads at endpoints
        const arrowLen = 0.15 * scale * 10;
        const arrowWidth = 0.06 * scale * 10;
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0);
        arrowShape.lineTo(-arrowLen, -arrowWidth);
        arrowShape.lineTo(-arrowLen, arrowWidth);
        arrowShape.closePath();
        const arrowGeo = new THREE.ShapeGeometry(arrowShape);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide });

        // Arrow at point A (pointing toward B)
        const arrowA = new THREE.Mesh(arrowGeo, arrowMat);
        arrowA.position.copy(a);
        arrowA.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), dir);
        sub.add(arrowA);

        // Arrow at point B (pointing toward A)
        const arrowB = new THREE.Mesh(arrowGeo, arrowMat);
        arrowB.position.copy(b);
        arrowB.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), dir.clone().negate());
        sub.add(arrowB);

        // Dashed extension lines (offset from endpoints along normal)
        const up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(dir.dot(up)) > 0.99) up.set(1, 0, 0);
        const perp = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(0.06 * scale * 10);
        const extGeo1 = new THREE.BufferGeometry().setFromPoints([a.clone().add(perp), a.clone().sub(perp)]);
        const extGeo2 = new THREE.BufferGeometry().setFromPoints([b.clone().add(perp), b.clone().sub(perp)]);
        const extMat = new THREE.LineDashedMaterial({ color: 0x22d3ee, dashSize: 0.03 * scale * 10, gapSize: 0.02 * scale * 10, linewidth: 1 });
        const ext1 = new THREE.Line(extGeo1, extMat); ext1.computeLineDistances(); sub.add(ext1);
        const ext2 = new THREE.Line(extGeo2, extMat); ext2.computeLineDistances(); sub.add(ext2);

        // Value label at midpoint with X/Y/Z breakdown
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const dz = Math.abs(b.z - a.z);
        const mainLabel = formatMeasurement(m.value, m.unit || 'mm');
        const detailLabel = `ΔX:${formatValue(dx)} ΔY:${formatValue(dy)} ΔZ:${formatValue(dz)}`;
        const label = makeTextSprite(mainLabel, detailLabel, 0x22d3ee);
        label.position.copy(mid).add(perp.clone().multiplyScalar(2.2));
        label.scale.set(0.6, 0.3, 1);
        sub.add(label);

        group.add(sub);
      });

      // Render in-progress picks with pulsing animation
      currentPair.forEach((p, idx) => {
        const pMat = new THREE.MeshBasicMaterial({ color: idx === 0 ? 0xf59e0b : 0x22c55e });
        const dot = new THREE.Mesh(pickedGeo, pMat);
        dot.position.set(p.x, p.y, p.z);
        group.add(dot);

        // Outer ring for in-progress pick
        const ringGeo = new THREE.RingGeometry(0.07 * scale * 10, 0.09 * scale * 10, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: idx === 0 ? 0xf59e0b : 0x22c55e,
          transparent: true, opacity: 0.5, side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(p.x, p.y, p.z);
        ring.lookAt(camera.current.position);
        group.add(ring);
      });

      // Rubber-band line from first pick to current cursor position
      if (currentPair.length === 1) {
        const p = currentPair[0];
        // We'll add a temporary cursor-tracking line in the pointermove handler
      }
    } catch (err) {
      console.warn('[Measure] Failed to update measurement visuals:', err);
    }
  }, [measurements, currentPair]);

  /* Create a text sprite for measurement labels.
     Supports optional second line (detail text) for X/Y/Z breakdown. */
  function makeTextSprite(text, detailText, color) {
    const canvas2 = document.createElement('canvas');
    const ctx = canvas2.getContext('2d');
    const hasDetail = detailText && detailText.length > 0;
    canvas2.width = 512;
    canvas2.height = hasDetail ? 192 : 128;
    // Background with rounded corners
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(0, 0, canvas2.width, canvas2.height, 14);
    } else {
      ctx.fillRect(0, 0, canvas2.width, canvas2.height);
    }
    ctx.fill();
    // Border
    ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.lineWidth = 3;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(1.5, 1.5, canvas2.width - 3, canvas2.height - 3, 12);
    } else {
      ctx.strokeRect(1.5, 1.5, canvas2.width - 3, canvas2.height - 3);
    }
    ctx.stroke();
    // Main value text
    ctx.font = 'bold 52px Inter, Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas2.width / 2, hasDetail ? canvas2.height * 0.35 : canvas2.height / 2);
    // Detail text (X/Y/Z breakdown)
    if (hasDetail) {
      ctx.font = '28px Inter, Segoe UI, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(detailText, canvas2.width / 2, canvas2.height * 0.72);
    }
    const texture = new THREE.CanvasTexture(canvas2);
    texture.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    return new THREE.Sprite(mat);
  }

  /* Clean up measurement visuals when measurement is disabled. */
  useEffect(() => {
    if (measureEnabled) return;
    setCurrentPair([]);
    if (measureGroupRef.current) {
      while (measureGroupRef.current.children.length > 0) {
        const child = measureGroupRef.current.children[0];
        child.geometry?.dispose();
        child.material?.dispose();
        if (child.material?.map) child.material.map.dispose();
        measureGroupRef.current.remove(child);
      }
    }
    // Clean up hover box and rubber-band
    if (hoverHighlightRef.current) {
      if (hoverHighlightRef.current.isBoxHelper && model) {
        model.remove(hoverHighlightRef.current);
        hoverHighlightRef.current.dispose();
      } else {
        hoverHighlightRef.current.visible = false;
      }
      hoverHighlightRef.current = null;
    }
    if (rubberBandRef.current) {
      rubberBandRef.current.visible = false;
    }
    setHoveredFace(null);
    setHoveredPart(null);
  }, [measureEnabled]);

  /* Clean up hover system when model changes or viewer unmounts. */
  useEffect(() => {
    return () => {
      if (hoverHighlightRef.current) {
        hoverHighlightRef.current.geometry?.dispose();
        hoverHighlightRef.current.material?.dispose();
      }
      if (rubberBandRef.current) {
        rubberBandRef.current.geometry?.dispose();
        rubberBandRef.current.material?.dispose();
      }
      if (selectionHighlightRef.current) {
        selectionHighlightRef.current.children.forEach(child => {
          child.geometry?.dispose();
          child.material?.dispose();
        });
      }
      originalMaterialsRef.current.clear();
    };
  }, []);

  /* During measurement, allow orbiting via middle/right mouse and picking via left click.
     OrbitControls remain enabled for rotation, but we intercept left-click for picking. */
  useEffect(() => {
    if (!controls.current) return;
    if (measureEnabled) {
      // Allow orbit but only with middle/right button — left click picks
      controls.current.mouseButtons = {
        LEFT: null, // disable left-click orbit
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.current.touches = {
        ONE: null, // single-finger picks
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
    } else {
      controls.current.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.current.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
    }
  }, [measureEnabled, ready]);

  /* Unit conversion helpers */
  function convertUnit(valueMm, toUnit) {
    if (toUnit === 'cm') return valueMm / 10;
    if (toUnit === 'inch') return valueMm / 25.4;
    return valueMm;
  }
  function formatMeasurement(valueMm, toUnit) {
    const v = convertUnit(valueMm, toUnit);
    const label = toUnit === 'mm' ? 'mm' : toUnit === 'cm' ? 'cm' : 'in';
    return v < 1 ? `${v.toFixed(3)} ${label}` : v < 100 ? `${v.toFixed(2)} ${label}` : `${v.toFixed(1)} ${label}`;
  }
  function formatValue(valueMm) {
    return valueMm < 0.01 ? '0.00' : valueMm < 10 ? valueMm.toFixed(2) : valueMm.toFixed(1);
  }
  function deleteMeasurement(id) {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }
  function clearAllMeasurements() {
    setMeasurements([]);
    setCurrentPair([]);
    // Clear selection highlights
    if (selectionHighlightRef.current) {
      while (selectionHighlightRef.current.children.length > 0) {
        const child = selectionHighlightRef.current.children[0];
        child.geometry?.dispose();
        child.material?.dispose();
        selectionHighlightRef.current.remove(child);
      }
    }
    originalMaterialsRef.current.clear();
  }

  /* Highlight a selected face with a semi-transparent overlay. */
  function highlightFace(hit) {
    if (!hit.object || !hit.face || !selectionHighlightRef.current) return;
    const geo = hit.object.geometry;
    if (!geo || !geo.getAttribute('position')) return;
    const posAttr = geo.getAttribute('position');
    const face = hit.face;
    // Create a small triangle highlight at the hit face
    const vA = new THREE.Vector3().fromBufferAttribute(posAttr, face.a);
    const vB = new THREE.Vector3().fromBufferAttribute(posAttr, face.b);
    const vC = new THREE.Vector3().fromBufferAttribute(posAttr, face.c);
    const mat = hit.object.matrixWorld;
    vA.applyMatrix4(mat); vB.applyMatrix4(mat); vC.applyMatrix4(mat);
    const hlGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([vA.x,vA.y,vA.z, vB.x,vB.y,vB.z, vC.x,vC.y,vC.z]);
    hlGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const hlMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthTest: true, depthWrite: false });
    const hlMesh = new THREE.Mesh(hlGeo, hlMat);
    selectionHighlightRef.current.add(hlMesh);
  }

  /* Highlight a selected part (for assemblies) by dimming other parts. */
  function highlightPart(part) {
    if (!model || !part) return;
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (!originalMaterialsRef.current.has(child.uuid)) {
        originalMaterialsRef.current.set(child.uuid, child.material);
      }
      if (child === part || (part.parent && child.parent === part.parent && child === part)) {
        // Restore original material for selected part
        const orig = originalMaterialsRef.current.get(child.uuid);
        if (orig) child.material = orig;
      } else {
        // Dim other parts
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        child.material = mats.map(m => {
          if (!m) return m;
          const dim = m.clone();
          dim.opacity = 0.3;
          dim.transparent = true;
          dim.needsUpdate = true;
          return dim;
        });
        if (!Array.isArray(child.material) && mats.length === 1) child.material = child.material[0];
      }
    });
  }

  /* Restore all parts to original materials. */
  function restoreAllParts() {
    if (!model) return;
    model.traverse((child) => {
      if (!child.isMesh) return;
      const orig = originalMaterialsRef.current.get(child.uuid);
      if (orig) {
        child.material = orig;
        child.material.needsUpdate = true;
      }
    });
    originalMaterialsRef.current.clear();
  }

  const triggerCamera = (action) => {
    if (!model || !camera.current || !controls.current) return;
    if (action === 'fit') {
      fitCameraToModel(camera.current, controls.current, model, { keepDirection: true });
      controls.current.saveState?.();
      return;
    }
    if (action === 'reset') {
      fitCameraToModel(camera.current, controls.current, model, { direction: VIEW_DIRECTIONS.isometric });
      controls.current.saveState?.();
      return;
    }
    const direction = VIEW_DIRECTIONS[action];
    if (direction) {
      fitCameraToModel(camera.current, controls.current, model, { direction });
      controls.current.saveState?.();
    }
  };

  /* ------------------------ Section Cut implementation --------------------- */

  /* World-space AABB of the model — anchors the slider range and 1:1 cap. */
  const getSectionAabb = () => {
    if (!model) return null;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    return box && Number.isFinite(box.min.x) ? box : null;
  };

  /* Keep an up-to-date model AABB in a ref for slider→world mapping. */
  const modelAabbRef = useRef(null);
  useEffect(() => {
    modelAabbRef.current = model ? getSectionAabb() : null;
  }, [model]);

  /* Enable/disable renderer-level clipping capability (zero effect when off). */
  useEffect(() => {
    if (!renderer.current) return;
    renderer.current.localClippingEnabled = sectionEnabled;
  }, [sectionEnabled, ready]);

  /* Compute the single clipping plane (world space) from axis + slider. */
  const computeSectionPlane = (axis, t, flip) => {
    const box = modelAabbRef.current;
    if (!box) return null;
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const axisVec = AXIS_VECTORS[axis];
    const min = box.min.getComponent(axisIndex);
    const max = box.max.getComponent(axisIndex);
    const center = box.getCenter(new THREE.Vector3()).getComponent(axisIndex);
    const half = (max - min) / 2;
    /* t∈[0,1] → ±0.8×extent around center: plane sweeps fully across the
       model (cut active over ~62% of travel) and fully clears it at 0/1. */
    const offset = center + (t - 0.5) * 1.6 * (max - min);
    const sign = flip ? -1 : 1;
    return new THREE.Plane(axisVec.clone().multiplyScalar(sign), -sign * offset);
  };

  /* Apply the clipping plane to every mesh material + cap stencil settings.
     Renders behind the cut face when section is ON; restores pristine state
     (clippingPlanes=null, original stencil config) when OFF. */
  const applySectionToModel = (enabled, plane) => {
    if (!model) return;
    model.traverse((object) => {
      if (!object.isMesh) return;
      const stencilCfg = SECTION_STENCIL_CONFIG.get(object.uuid);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        material.clippingPlanes = enabled && plane ? [plane] : null;
        if (enabled && plane) {
          if (!stencilCfg) {
            SECTION_STENCIL_CONFIG.set(object.uuid, {
              stencilWrite: material.stencilWrite,
              stencilRef: material.stencilRef,
              stencilFunc: material.stencilFunc,
              stencilZPass: material.stencilZPass,
              side: material.side,
            });
          }
          material.stencilWrite = true;
          material.stencilRef = 1;
          material.stencilFunc = THREE.AlwaysStencilFunc;
          material.stencilZPass = THREE.IncrementWrapStencilOp;
          material.side = THREE.DoubleSide;
        } else {
          const cfg = SECTION_STENCIL_CONFIG.get(object.uuid);
          if (cfg) {
            material.stencilWrite = cfg.stencilWrite;
            material.stencilRef = cfg.stencilRef;
            material.stencilFunc = cfg.stencilFunc;
            material.stencilZPass = cfg.stencilZPass;
            material.side = cfg.side;
          }
        }
        material.needsUpdate = true;
      });
    });
  };

  const applySectionRef = useRef(applySectionToModel);
  applySectionRef.current = applySectionToModel;

  /* Reactive: whenever (enabled, axis, flip, slider, model) change, recompute
     the plane and apply it live. Disabled → full original model returns. */
  useEffect(() => {
    if (!sectionEnabled) {
      sectionPlanesRef.current = [];
      setSectionPlane(null);
      applySectionRef.current(false, null);
      return undefined;
    }
    if (!modelAabbRef.current) return undefined;
    const plane = computeSectionPlane(sectionAxis, sectionPos, sectionFlip);
    sectionPlanesRef.current = plane ? [plane] : [];
    setSectionPlane(plane);
    applySectionRef.current(true, plane);
    return undefined;
  }, [sectionEnabled, sectionAxis, sectionFlip, sectionPos, model]);

  /* Cap the slider at 1:1 exactly (endpoints cut everything away). */
  const effectiveSectionPos = Math.min(sectionPos, 0.999);

  /* Cleanup on unmount — restore materials, never leak stencil state. */
  useEffect(() => () => {
    if (sectionPlanesRef.current.length > 0) {
      applySectionRef.current(false, null);
    }
    SECTION_STENCIL_CONFIG.clear();
  }, []);

  /* Section handlers — Enable / Disable / Reset. */
  const handleEnableSection = () => {
    setSectionEnabled(true);
    setSectionPanelOpen(true);
  };
  const handleDisableSection = () => {
    setSectionEnabled(false);
    setSectionPos(0.5);
    setSectionFlip(false);
    setSectionAxis('x');
  };
  const handleResetSection = () => {
    setSectionPos(0.5);
    setSectionFlip(false);
    setSectionAxis('x');
  };

  /* Unsupported 3D format → honest fallback. The viewer is browser-only
     (no CAD conversion server), so SolidWorks-native parts/assemblies and
     ACIS SAT models are out of scope and are never faked. */
  if (!isSupported3D) {
    return (
      <Viewer3DMessage
        icon={<Icon.cube size={26} />}
        title="3D browser preview is not available for this format."
        lines={[
          `Browser-viewable 3D formats: GLB, GLTF, OBJ, STL, PLY, DAE, 3DS, STEP/STP, IGES/IGS and BREP.`,
          `${extension ? `.${extension.toUpperCase()}` : 'This format'} geometry is stored in a proprietary encoding that browsers cannot decode.`,
          `The original file is kept and downloadable — export it as STEP or a mesh format for an in-app preview.`,
          `The original ${extension ? `.${extension.toUpperCase()}` : 'file'} is untouched — download it and open it in your CAD application.`,
        ]}
        action={onDownload && (
          <button type="button" className="erp-btn" onClick={onDownload}>
            <Icon.download size={13} /> Download Original File
          </button>
        )}
      />
    );
  }

  if (loadError) {
    return (
      <Viewer3DMessage
        icon={<Icon.alert size={26} />}
        title="Unable to display the 3D model"
        tone="error"
        lines={[
          loadError,
          `File: ${fileName || '—'}`,
        ]}
        action={(
          <div className="flex justify-center gap-2">
            <button type="button" className="erp-btn" onClick={() => { setCadRetry((k) => k + 1); setResolveError(null); }}>
              Try Again
            </button>
            {onDownload && (
              <button type="button" className="erp-btn" onClick={onDownload}>
                <Icon.download size={13} /> Download Original File
              </button>
            )}
          </div>
        )}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col" style={{ background: '#0f172a' }}>
      {/* Toolbar — same control set as the reference viewer */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#DCE8E4] bg-white px-3 py-2">
        <ToolButton label="Front view" onClick={() => triggerCamera('front')}>Front</ToolButton>
        <ToolButton label="Top view" onClick={() => triggerCamera('top')}>Top</ToolButton>
        <ToolButton label="Right view" onClick={() => triggerCamera('right')}>Right</ToolButton>
        <ToolButton label="Isometric view" onClick={() => triggerCamera('isometric')}>ISO</ToolButton>
        <span className="mx-1 h-5 w-px bg-[#E2E8F0]" />
        <ToolButton label="Fit to screen" onClick={() => triggerCamera('fit')}>⛶ Fit</ToolButton>
        <ToolButton label="Reset view" onClick={() => triggerCamera('reset')}><span style={{ display: 'inline-flex' }}>↺ Reset</span></ToolButton>
        <ToolButton label="Toggle wireframe" onClick={() => setWireframe((w) => !w)} active={wireframe}>Wireframe</ToolButton>
        <ToolButton label="Section cut — clip the model with a plane" onClick={() => setSectionPanelOpen((open) => !open)} active={sectionPanelOpen || sectionEnabled}>Section</ToolButton>
        <ToolButton
          label="Measure distance between two points on the model"
          onClick={() => {
            if (measureEnabled) {
              setMeasureEnabled(false);
              setCurrentPair([]);
            } else {
              setMeasureEnabled(true);
              setCurrentPair([]);
            }
          }}
          active={measureEnabled}
        >Measure</ToolButton>
        {measureEnabled && (
          <>
            <span className="mx-1 h-5 w-px bg-[#E2E8F0]" />
            <select
              value={measureUnit}
              onChange={(e) => setMeasureUnit(e.target.value)}
              className="h-7 rounded-md border border-[#DCE8E4] bg-white px-1.5 text-[10.5px] font-semibold text-slate-600 focus:border-[#075E54] focus:outline-none"
              title="Measurement unit"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="inch">inch</option>
            </select>
            {measurements.length > 0 && (
              <ToolButton label="Clear all measurements" onClick={clearAllMeasurements}>Clear All</ToolButton>
            )}
            <button
              type="button"
              onClick={() => { setMeasureEnabled(false); setCurrentPair([]); }}
              className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10.5px] font-semibold text-slate-500 hover:border-red-300 hover:text-red-500"
              title="Exit measurement mode"
            >✕ Exit</button>
          </>
        )}
        {/* Assembly part selection controls */}
        {assemblyParts.length > 1 && !measureEnabled && (
          <>
            <span className="mx-1 h-5 w-px bg-[#E2E8F0]" />
            <span className="text-[10px] font-bold text-[#075E54]">Select:</span>
            {selectedPart && (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedPart(null)}
                  className="h-7 rounded-md border border-[#DCE8E4] bg-white px-2 text-[10.5px] font-semibold text-slate-500 hover:border-[#075E54] hover:text-[#075E54]"
                  title="Clear selection"
                >Clear</button>
                <button
                  type="button"
                  onClick={() => {
                    // Hide selected part
                    if (selectedPart.mesh) {
                      selectedPart.mesh.visible = false;
                      setHiddenParts(prev => new Set([...prev, selectedPart.name]));
                      setSelectedPart(null);
                    }
                  }}
                  className="h-7 rounded-md border border-[#DCE8E4] bg-white px-2 text-[10.5px] font-semibold text-slate-500 hover:border-amber-400 hover:text-amber-600"
                  title="Hide selected part"
                >Hide</button>
              </>
            )}
            {hiddenParts.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  // Show all hidden parts
                  assemblyParts.forEach(p => { p.mesh.visible = true; });
                  setHiddenParts(new Set());
                }}
                className="h-7 rounded-md border border-[#075E54] bg-[#EAF7F4] px-2 text-[10.5px] font-bold text-[#075E54] hover:bg-[#D4EDE8]"
                title="Show all parts"
              >Show All</button>
            )}
          </>
        )}
        <span className="ml-auto hidden text-[10.5px] font-medium text-slate-400 sm:inline">
          {measureEnabled
            ? (currentPair.length === 0 ? 'Click a point on the model (Point A)' : 'Click another point (Point B)')
            : selectedPart
              ? `Selected: ${selectedPart.name} · Double-click another part to select`
              : assemblyParts.length > 1
                ? 'Double-click a part to select · Drag to orbit · Scroll to zoom'
                : 'Drag to orbit · Scroll to zoom · Right-drag to pan'}
        </span>
      </div>

      {/* Section-cut control panel (compact, viewer-local; source file untouched) */}
      {sectionPanelOpen && (
        <div className="border-b border-[#DCE8E4] bg-white px-3 py-2" data-testid="section-panel">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#075E54]">Section Cut</span>

            <div className="flex items-center gap-1" role="group" aria-label="Section plane axis">
              {['x', 'y', 'z'].map((axis) => (
                <button
                  key={axis}
                  type="button"
                  onClick={() => setSectionAxis(axis)}
                  disabled={!sectionEnabled}
                  title={`Section along ${axis.toUpperCase()} axis`}
                  className={`h-6 w-7 rounded-md border text-[11px] font-bold transition-colors ${
                    sectionAxis === axis
                      ? 'border-[#075E54] bg-[#075E54] text-white'
                      : 'border-[#DCE8E4] bg-white text-slate-500 hover:border-[#075E54] hover:text-[#075E54]'
                  } ${!sectionEnabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSectionFlip((f) => !f)}
                disabled={!sectionEnabled}
                title="Flip which half is removed"
                className={`ml-0.5 h-6 rounded-md border px-1.5 text-[10px] font-bold transition-colors ${
                  sectionFlip ? 'border-[#075E54] bg-[#EAF7F4] text-[#075E54]' : 'border-[#DCE8E4] bg-white text-slate-500 hover:border-[#075E54] hover:text-[#075E54]'
                } ${!sectionEnabled ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                Flip
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={effectiveSectionPos}
              disabled={!sectionEnabled}
              onChange={(event) => setSectionPos(Number(event.target.value))}
              aria-label="Section plane position"
              title="Move the section plane through the model"
              className="h-1.5 w-44 cursor-pointer accent-[#075E54] disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="w-9 text-[10.5px] font-semibold text-slate-500">{Math.round(effectiveSectionPos * 100)}%</span>

            <div className="flex items-center gap-1.5">
              {!sectionEnabled ? (
                <button type="button" onClick={handleEnableSection} className="rounded-md border border-[#075E54] bg-[#075E54] px-2 py-1 text-[10.5px] font-bold text-white hover:opacity-90">
                  Enable Section
                </button>
              ) : (
                <button type="button" onClick={handleDisableSection} className="rounded-md border border-[#DCE8E4] bg-white px-2 py-1 text-[10.5px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600">
                  Disable Section
                </button>
              )}
              <button type="button" onClick={handleResetSection} disabled={!sectionEnabled} className={`rounded-md border border-[#DCE8E4] bg-white px-2 py-1 text-[10.5px] font-bold text-slate-600 hover:border-[#075E54] hover:text-[#075E54] ${!sectionEnabled ? 'cursor-not-allowed opacity-40' : ''}`}>
                Reset Section
              </button>
              <canvas
                ref={localCanvasRef}
                width={52}
                height={30}
                title="Cross-section outline at the current cut"
                className="rounded border border-[#E2E8F0] bg-[#F8FAFC]"
              />
            </div>

            <span className="hidden text-[10px] text-slate-400 lg:inline">
              Plane clips the live model only — the original file is never modified.
            </span>
          </div>
        </div>
      )}

      {/* WebGL stage */}
      <div ref={containerRef} className="relative min-h-0 flex-1" style={{ minHeight: 320 }} />

      {/* Section-cap cross-section preview (drawn from clipped triangle wireframe). */}
      {sectionEnabled && (
        <SectionCapPreview
          model={model}
          plane={sectionPlane}
          localCanvasRef={localCanvasRef}
        />
      )}

      {/* Loading state (stage-aware, never a fake model) */}
      {loadingMessage && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" style={{ background: 'rgba(15,23,42,0.55)' }}>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/90 px-8 py-6 text-center backdrop-blur-sm">
            <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            <p className="text-[13.5px] font-semibold text-slate-100">{loadingMessage}</p>
            <p className="mt-1 text-[11px] text-slate-400">{fileName}</p>
          </div>
        </div>
      )}

      {/* Selection info panel */}
      {selectedPart && !measureEnabled && (
        <div className="absolute top-14 right-2 z-20 w-56 rounded-lg border border-[#075E54] bg-slate-800/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#22d3ee]">Selected Part</span>
            <button
              type="button"
              onClick={() => setSelectedPart(null)}
              className="rounded px-1 text-[10px] text-slate-400 hover:text-red-400"
              title="Clear selection"
            >✕</button>
          </div>
          <div className="mb-2 rounded-md bg-slate-700/50 px-2 py-1.5">
            <div className="text-[12px] font-bold text-white">{selectedPart.name}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">Double-click another part to select</div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                // Isolate: hide all except selected
                assemblyParts.forEach(p => {
                  p.mesh.visible = (p.mesh === selectedPart.mesh);
                });
                setHiddenParts(new Set(assemblyParts.filter(p => p.mesh !== selectedPart.mesh).map(p => p.name)));
              }}
              className="flex-1 rounded-md border border-[#DCE8E4] bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-[#075E54] hover:text-[#075E54]"
              title="Show only this part"
            >Isolate</button>
            <button
              type="button"
              onClick={() => {
                selectedPart.mesh.visible = false;
                setHiddenParts(prev => new Set([...prev, selectedPart.name]));
                setSelectedPart(null);
              }}
              className="flex-1 rounded-md border border-[#DCE8E4] bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-amber-400 hover:text-amber-600"
              title="Hide this part"
            >Hide</button>
            <button
              type="button"
              onClick={() => {
                assemblyParts.forEach(p => { p.mesh.visible = true; });
                setHiddenParts(new Set());
              }}
              className="flex-1 rounded-md border border-[#DCE8E4] bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-[#075E54] hover:text-[#075E54]"
              title="Show all parts"
            >Show All</button>
          </div>
        </div>
      )}

      {/* Parts list panel (when assembly has multiple parts) */}
      {assemblyParts.length > 1 && !measureEnabled && !selectedPart && (
        <div className="absolute top-14 right-2 z-20 w-48 max-h-56 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800/95 p-2 shadow-xl backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Parts ({assemblyParts.length})</span>
          </div>
          {assemblyParts.map((p, idx) => (
            <div key={idx} className="group mb-1 flex items-center justify-between rounded-md bg-slate-700/50 px-2 py-1">
              <span className="text-[10px] text-slate-300 truncate" title={p.name}>{p.name}</span>
              <button
                type="button"
                onClick={() => {
                  p.mesh.visible = !p.mesh.visible;
                  if (!p.mesh.visible) {
                    setHiddenParts(prev => new Set([...prev, p.name]));
                  } else {
                    setHiddenParts(prev => {
                      const next = new Set(prev);
                      next.delete(p.name);
                      return next;
                    });
                  }
                }}
                className={`ml-1 rounded px-1 text-[9px] ${p.mesh.visible ? 'text-slate-500 hover:text-amber-500' : 'text-amber-500'}`}
                title={p.mesh.visible ? 'Hide this part' : 'Show this part'}
              >{p.mesh.visible ? '👁' : '👁‍🗨'}</button>
            </div>
          ))}
        </div>
      )}

      {/* Measurement list panel */}
      {measureEnabled && measurements.length > 0 && (
        <div className="absolute bottom-8 right-2 z-20 max-h-56 w-64 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800/95 p-2 shadow-xl backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Measurements ({measurements.length})</span>
          </div>
          {measurements.map((m) => {
            const pts = m.points;
            const dx = pts.length >= 2 ? Math.abs(pts[1].x - pts[0].x) : 0;
            const dy = pts.length >= 2 ? Math.abs(pts[1].y - pts[0].y) : 0;
            const dz = pts.length >= 2 ? Math.abs(pts[1].z - pts[0].z) : 0;
            return (
              <div key={m.id} className="group mb-1 rounded-md bg-slate-700/50 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-cyan-300">{formatMeasurement(m.value, m.unit || measureUnit)}</span>
                  <button
                    type="button"
                    onClick={() => deleteMeasurement(m.id)}
                    className="ml-2 hidden rounded px-1 text-[9px] text-red-400 hover:bg-red-500/20 hover:text-red-300 group-hover:inline"
                    title="Delete this measurement"
                  >✕</button>
                </div>
                <div className="mt-0.5 text-[9px] text-slate-400">
                  ΔX:{formatValue(dx)} · ΔY:{formatValue(dy)} · ΔZ:{formatValue(dz)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Status bar (matches the reference viewer's footer) */}
      <div className="flex items-center justify-between border-t border-slate-700 px-3 py-1.5 text-[10px] text-slate-400" style={{ background: 'rgba(15,23,42,0.9)' }}>
        <span>{fileName} · {extension.toUpperCase()}{model ? ' · Model ready' : ''}</span>
        {measureEnabled && (
          <span className="text-emerald-400 font-semibold">
            {currentPair.length === 0 && '📏 Click Point A on the model'}
            {currentPair.length === 1 && '📏 Click Point B to complete measurement'}
            {measurements.length > 0 && ` · ${measurements.length} measurement${measurements.length > 1 ? 's' : ''}`}
          </span>
        )}
        {!measureEnabled && !selectedPart && <span>Orbit / Zoom / Pan</span>}
        {!measureEnabled && selectedPart && (
          <span className="text-[#22d3ee] font-semibold">
            {selectedPart.name} selected
          </span>
        )}
      </div>
    </div>
  );
}
