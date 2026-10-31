/**
 * ModelViewer3D — Reusable overlay 3D CAD viewer component.
 *
 * Renders ACTUAL 3D geometry via Three.js (same engine as ModelViewerPage).
 *   GLB/GLTF → GLTFLoader (direct, or the converted representation)
 *   STL → STLLoader
 *   OBJ → OBJLoader
 *   3MF → 3MFLoader
 *   FBX → FBXLoader
 *   WRL/VRML → VRMLLoader
 *   STEP/STP/IGES/IGS → backend OpenCascade conversion → GLB → GLTFLoader
 *   SLDPRT/SLDASM → stored-only (shows download + honest error)
 *
 * Props:
 *   modelId     — numeric backend model ID
 *   fileType    — file extension string (e.g. "GLB", "STL", "SLDPRT")
 *   conversionStatus — conversion state string
 *   onClose     — callback to close the overlay
 *
 * NEVER shows a static image as 3D. NEVER shows fake geometry.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../../api/axiosInstance';
import {
  normalizeType,
  resolveRenderer,
} from '../../services/production/modelFormats';
import './ModelViewer3D.css';

const API_BASE = '/v1';

/**
 * Fetch a model file through the authenticated axios instance as a raw Blob.
 * Returns the Blob (not an Object URL) so binary loaders and signature sniffs
 * can consume the raw bytes.
 */
async function fetchAuthenticatedBlob(relativeUrl) {
  const resp = await api.get(relativeUrl, { responseType: 'blob' });
  return resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
}

function ftUpper(v) { return normalizeType(v); }

/**
 * Dispose every geometry, material and texture owned by a loaded model group
 * so WebGL resources never leak on close or model change.
 */
function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.normalMap) m.normalMap.dispose();
        if (m.roughnessMap) m.roughnessMap.dispose();
        if (m.metalnessMap) m.metalnessMap.dispose();
        if (m.aoMap) m.aoMap.dispose();
        m.dispose();
      });
    }
  });
}

export default function ModelViewer3D({ modelId, fileType, conversionStatus, onClose }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const animationRef = useRef(null);
  const threeRef = useRef(null);
  const cleanupRef = useRef(null);
  const sectionPlaneRef = useRef(null);
  const sectionHelperRef = useRef(null);
  const sectionBoxRef = useRef(null);
  const sectionActiveRef = useRef(false);

  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionAxis, setSectionAxis] = useState('Y');
  const [sectionPosition, setSectionPosition] = useState(50);

  const ft = ftUpper(fileType);
  const cs = conversionStatus || 'NOT_REQUIRED';

  // ── Init Three.js scene ──
  const initScene = useCallback(async () => {
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    threeRef.current = THREE;

    const container = containerRef.current;
    if (!container) return null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 5000);
    camera.position.set(5, 4, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.minDistance = 0.05;
    controls.maxDistance = 2000;
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x0d1117, 0.6));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(8, 12, 8);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8899bb, 0.5);
    fillLight.position.set(-6, 4, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffeedd, 0.3);
    rimLight.position.set(0, -3, 6);
    scene.add(rimLight);

    const backLight = new THREE.DirectionalLight(0x4466aa, 0.25);
    backLight.position.set(-2, 6, -8);
    scene.add(backLight);

    // Grid + axes
    const grid = new THREE.GridHelper(20, 40, 0x1e3a5f, 0x152238);
    grid.material.opacity = 0.5;
    grid.material.transparent = true;
    scene.add(grid);
    const axes = new THREE.AxesHelper(2);
    axes.name = '__axes__';
    scene.add(axes);

    // Section / clipping plane (disabled until user enables it)
    renderer.localClippingEnabled = true;
    sectionPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    renderer.clippingPlanes = [sectionPlaneRef.current];

    function animate() {
      animationRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    window.addEventListener('resize', onResize);
    onResize();

    const cleanup = () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      controls.dispose();
    };
    cleanupRef.current = cleanup;
    return cleanup;
  }, []);

  // ── Fit camera ──
  const fitCameraToModel = useCallback((camera, controls, model) => {
    const THREE = threeRef.current;
    if (!THREE) return;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return;
    const fov = camera.fov * (Math.PI / 180);
    let distance = (maxDim / 2) / Math.tan(fov / 2) * 1.8;
    const dir = new THREE.Vector3(1, 0.75, 1).normalize();
    camera.position.copy(center).addScaledVector(dir, distance);
    controls.target.copy(center);
    controls.update();
    model.position.sub(center);
  }, []);

  // ── Load model ──
  useEffect(() => {
    if (!containerRef.current || !modelId) return;
    let destroyed = false;
    let cleanupFn;

    async function init() {
      const renderer = resolveRenderer(ft);
      // Check for unsupported / conversion needed
      if (renderer === 'cad-convert') {
        if (cs === 'UNSUPPORTED') {
          setError('No compatible CAD conversion engine is available for this model type on the server.');
          setStatus('error');
          return;
        }
        if (cs === 'FAILED') {
          setError('3D conversion failed.');
          setStatus('error');
          return;
        }
        if (cs === 'NOT_REQUIRED' || cs === 'NOT_CONVERTED') {
          setError('3D conversion unavailable — click Retry Conversion from the model page first.');
          setStatus('error');
          return;
        }
        if (['PENDING', 'QUEUED', 'PROCESSING'].includes(cs)) {
          setStatus('converting');
          return;
        }
      }

      const ctx = await initScene();
      if (destroyed) { if (ctx) ctx(); return; }
      cleanupFn = ctx;

      const THREE = threeRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;

      setStatus('loading');
      setProgress(0);

      try {
        const useConverted = cs === 'READY' && renderer === 'gltf';
        let fileUrl;
        let loaderType = renderer;

        if (loaderType === 'gltf') {
          fileUrl = useConverted ? `/models/${modelId}/3d` : `/models/${modelId}/viewer`;
        } else if (['stl', 'obj', '3mf', 'fbx', 'vrml', 'ply', 'dae', '3ds'].includes(loaderType)) {
          fileUrl = `/models/${modelId}/viewer`;
        } else if (loaderType === 'cad-convert') {
          throw new Error('No converted 3D representation available for this model.');
        } else {
          throw new Error('Unsupported file type: ' + ft);
        }

        // Fetch raw bytes through authenticated axios, then hand to the loader.
        const sourceBlob = await fetchAuthenticatedBlob(fileUrl);
        if (destroyed) return;

        let modelGroup;

        if (loaderType === 'stl') {
          const bytes = new Uint8Array(await sourceBlob.slice(0, 256).arrayBuffer());
          const kind = /^solid/i.test(new TextDecoder('latin1').decode(bytes).trimStart())
            ? 'ascii'
            : 'binary';
          setProgress(10);
          const blobUrl = URL.createObjectURL(sourceBlob);
          const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
          const loader = new STLLoader();
          const geometry = await new Promise((res, rej) => {
            loader.load(blobUrl, res, (p) => {
              if (p.total > 0) setProgress(Math.round((p.loaded / p.total) * 100));
            }, rej);
          });
          URL.revokeObjectURL(blobUrl);
          if (destroyed) return;
          geometry.computeVertexNormals();
          const mat = new THREE.MeshStandardMaterial({ color: 0x6699cc, metalness: 0.35, roughness: 0.65, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, mat);
          modelGroup = new THREE.Group();
          modelGroup.add(mesh);
        }

        if (loaderType === 'gltf') {
          setProgress(10);
          const blobUrl = URL.createObjectURL(sourceBlob);
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
          const loader = new GLTFLoader();
          const gltf = await new Promise((res, rej) => {
            loader.load(blobUrl, res, (p) => {
              if (p.total > 0) setProgress(Math.round((p.loaded / p.total) * 100));
            }, rej);
          });
          URL.revokeObjectURL(blobUrl);
          if (destroyed) return;
          modelGroup = gltf.scene;
        }

        if (loaderType === 'obj') {
          setProgress(10);
          const blobUrl = URL.createObjectURL(sourceBlob);
          const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
          const loader = new OBJLoader();
          const object = await new Promise((res, rej) => {
            loader.load(blobUrl, res, (p) => {
              if (p.total > 0) setProgress(Math.round((p.loaded / p.total) * 100));
            }, rej);
          });
          URL.revokeObjectURL(blobUrl);
          if (destroyed) return;
          const mat = new THREE.MeshStandardMaterial({ color: 0x6699cc, metalness: 0.35, roughness: 0.65 });
          object.traverse((c) => { if (c.isMesh) c.material = mat; });
          modelGroup = object;
        }

        if (loaderType === '3mf' || loaderType === 'fbx' || loaderType === 'vrml') {
          setProgress(10);
          const blobUrl = URL.createObjectURL(sourceBlob);
          let loader;
          if (loaderType === '3mf') {
            const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js');
            loader = new ThreeMFLoader();
          } else if (loaderType === 'fbx') {
            const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
            loader = new FBXLoader();
          } else {
            const { VRMLLoader } = await import('three/addons/loaders/VRMLLoader.js');
            loader = new VRMLLoader();
          }
          const object = await new Promise((res, rej) => {
            loader.load(blobUrl, res, (p) => {
              if (p.total > 0) setProgress(Math.round((p.loaded / p.total) * 100));
            }, rej);
          });
          URL.revokeObjectURL(blobUrl);
          if (destroyed) return;
          object.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
          modelGroup = object;
        }

        // PLY — PLYLoader resolves a BufferGeometry (point cloud or mesh).
        if (loaderType === 'ply') {
          setProgress(10);
          const blobUrl = URL.createObjectURL(sourceBlob);
          const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
          const loader = new PLYLoader();
          const geometry = await new Promise((res, rej) => {
            loader.load(blobUrl, res, (p) => {
              if (p.total > 0) setProgress(Math.round((p.loaded / p.total) * 100));
            }, rej);
          });
          URL.revokeObjectURL(blobUrl);
          if (destroyed) return;
          const hasFaces = geometry.getIndex() != null || (geometry.attributes.position?.count || 0) > 0;
          if (!hasFaces) throw new Error('PLY file contains no geometry.');
          geometry.computeVertexNormals();
          // Color-per-vertex PLY scans carry a color attribute; honour it when present.
          const mat = new THREE.MeshStandardMaterial({
            color: 0x6699cc,
            metalness: 0.35,
            roughness: 0.65,
            side: THREE.DoubleSide,
            vertexColors: Boolean(geometry.attributes.color),
          });
          modelGroup = new THREE.Group();
          modelGroup.add(new THREE.Mesh(geometry, mat));
        }

        // DAE (COLLADA) and 3DS — DAE resolves { scene }, 3DS resolves a Group.
        if (loaderType === 'dae' || loaderType === '3ds') {
          setProgress(10);
          const blobUrl = URL.createObjectURL(sourceBlob);
          let loader;
          if (loaderType === 'dae') {
            const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
            loader = new ColladaLoader();
          } else {
            const { TDSLoader } = await import('three/addons/loaders/TDSLoader.js');
            loader = new TDSLoader();
          }
          const loaded = await new Promise((res, rej) => {
            loader.load(blobUrl, res, (p) => {
              if (p.total > 0) setProgress(Math.round((p.loaded / p.total) * 100));
            }, rej);
          });
          URL.revokeObjectURL(blobUrl);
          if (destroyed) return;
          modelGroup = loaded?.scene || loaded;
          if (!modelGroup) throw new Error('File contains no geometry.');
          modelGroup.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        }

        scene.add(modelGroup);
        modelRef.current = modelGroup;
        fitCameraToModel(camera, controls, modelGroup);

        const bb = new THREE.Box3().setFromObject(modelGroup);
        sectionBoxRef.current = bb.isEmpty() ? null : bb;

        setProgress(100);
        setStatus('ready');
      } catch (err) {
        if (!destroyed) {
          setError('Unable to generate a browser preview for this model.');
          setStatus('error');
        }
      }
    }

    init();
    return () => {
      destroyed = true;
      // Release the loaded model and its WebGL resources on close / reload.
      const scene = sceneRef.current;
      const model = modelRef.current;
      if (scene && model) scene.remove(model);
      disposeObject3D(model);
      modelRef.current = null;
      if (cleanupFn) cleanupFn();
    };
  }, [modelId, ft, cs, initScene, fitCameraToModel]);

  // ── Controls ──
  const handleReset = useCallback(() => {
    const c = cameraRef.current, co = controlsRef.current;
    if (!c || !co) return;
    c.position.set(5, 4, 5);
    co.target.set(0, 0, 0);
    co.update();
  }, []);

  const handleFit = useCallback(() => {
    const c = cameraRef.current, co = controlsRef.current, m = modelRef.current;
    if (!c || !co || !m) return;
    fitCameraToModel(c, co, m);
  }, [fitCameraToModel]);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  const handleDownload = useCallback(async () => {
    if (!modelId) return;
    try {
      const resp = await api.get(`/models/${modelId}/download`, { responseType: 'blob' });
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model-${modelId}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [modelId]);

  const toggleWireframe = useCallback(() => {
    setWireframe((prev) => {
      const next = !prev;
      const m = modelRef.current;
      if (m) m.traverse((c) => { if (c.isMesh && c.material) c.material.wireframe = next; });
      return next;
    });
  }, []);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      const c = controlsRef.current;
      if (c) {
        c.autoRotate = next;
        c.autoRotateSpeed = 2.0;
      }
      return next;
    });
  }, []);

  // ── Section / clipping plane ──
  const sectionHelperDispose = useCallback(() => {
    const scene = sceneRef.current;
    const helper = sectionHelperRef.current;
    if (scene && helper) {
      scene.remove(helper);
      helper.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    sectionHelperRef.current = null;
  }, []);

  const updateSection = useCallback((axis, pos) => {
    const THREE = threeRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!THREE || !renderer || !scene) return;

    const bb = sectionBoxRef.current;
    const ax = (axis || 'Y').toUpperCase();
    const pct = typeof pos === 'number' ? pos : 50;

    let min, max, normal, threshold;
    if (bb) {
      if (ax === 'X') { min = bb.min.x; max = bb.max.x; normal = new THREE.Vector3(1, 0, 0); }
      else if (ax === 'Z') { min = bb.min.z; max = bb.max.z; normal = new THREE.Vector3(0, 0, 1); }
      else { min = bb.min.y; max = bb.max.y; normal = new THREE.Vector3(0, 1, 0); }
      threshold = min + ((max - min) * pct) / 100;
    } else {
      if (ax === 'X') { normal = new THREE.Vector3(1, 0, 0); threshold = (pct - 50) / 10; }
      else if (ax === 'Z') { normal = new THREE.Vector3(0, 0, 1); threshold = (pct - 50) / 10; }
      else { normal = new THREE.Vector3(0, 1, 0); threshold = (pct - 50) / 10; }
    }

    sectionPlaneRef.current.set(normal, -threshold);

    sectionHelperDispose();
    const size = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 4;
    const half = size * 0.7;
    const helperGeo = new THREE.PlaneGeometry(half * 2, half * 2);
    const helperMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33, transparent: true, opacity: 0.25,
      side: 2, depthWrite: false, clippingPlanes: [],
    });
    const helper = new THREE.Mesh(helperGeo, helperMat);
    if (ax === 'X') { helper.rotation.y = Math.PI / 2; helper.position.set(threshold, 0, 0); }
    else if (ax === 'Z') { helper.rotation.y = 0; helper.position.set(0, 0, threshold); }
    else { helper.rotation.x = Math.PI / 2; helper.position.set(0, threshold, 0); }
    const edgeGeo = new THREE.EdgesGeometry(helperGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.8 });
    helper.add(new THREE.LineSegments(edgeGeo, edgeMat));
    helper.name = '__section_helper__';
    scene.add(helper);
    sectionHelperRef.current = helper;

    renderer.clippingPlanes = sectionActiveRef.current ? [sectionPlaneRef.current] : [];
  }, [sectionHelperDispose]);

  const enableSection = useCallback((axis) => {
    sectionActiveRef.current = true;
    setSectionEnabled(true);
    setSectionAxis(axis || 'Y');
    requestAnimationFrame(() => updateSection(axis || 'Y', sectionPosition));
  }, [sectionPosition, updateSection]);

  const resetSection = useCallback(() => {
    sectionActiveRef.current = false;
    setSectionEnabled(false);
    setSectionPosition(50);
    sectionHelperDispose();
    if (rendererRef.current) rendererRef.current.clippingPlanes = [];
    const THREE = threeRef.current;
    if (sectionPlaneRef.current && THREE) sectionPlaneRef.current.set(new THREE.Vector3(0, -1, 0), 0);
  }, [sectionHelperDispose]);

  const closeSection = useCallback(() => resetSection(), [resetSection]);

  const setSectionAxisAndUpdate = useCallback((axis) => {
    setSectionAxis(axis);
    requestAnimationFrame(() => updateSection(axis, sectionPosition));
  }, [sectionPosition, updateSection]);

  const setSectionPositionAndUpdate = useCallback((pos) => {
    setSectionPosition(pos);
    requestAnimationFrame(() => updateSection(sectionAxis, pos));
  }, [sectionAxis, updateSection]);

  const setView = useCallback((view) => {
    const c = cameraRef.current, co = controlsRef.current, m = modelRef.current;
    if (!c || !co) return;
    const THREE = threeRef.current;
    let center = new THREE.Vector3(0, 0, 0);
    let dist = 5;
    if (m) {
      const box = new THREE.Box3().setFromObject(m);
      center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      dist = (Math.max(size.x, size.y, size.z) / 2) / Math.tan((c.fov * Math.PI / 180) / 2) * 1.8;
    }
    const views = {
      front: [center.x, center.y, center.z + dist],
      back: [center.x, center.y, center.z - dist],
      left: [center.x - dist, center.y, center.z],
      right: [center.x + dist, center.y, center.z],
      top: [center.x, center.y + dist, center.z],
      bottom: [center.x, center.y - dist, center.z],
      isometric: [center.x + dist * 0.577, center.y + dist * 0.577, center.z + dist * 0.577],
    };
    const p = views[view];
    if (p) {
      c.position.set(p[0], p[1], p[2]);
      co.target.copy(center);
      co.update();
    }
  }, []);

  // Keyboard shortcuts (only when overlay is mounted)
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'escape': onClose?.(); break;
        case 'r': handleReset(); break;
        case 'f': handleFit(); break;
        case 'w': toggleWireframe(); break;
        case '1': setView('front'); break;
        case '2': setView('back'); break;
        case '3': setView('left'); break;
        case '4': setView('right'); break;
        case '5': setView('top'); break;
        case '6': setView('bottom'); break;
        case '7': setView('isometric'); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, handleReset, handleFit, toggleWireframe, setView]);

  return (
    <div className="mv3d-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="mv3d-overlay-container">
        {/* Header */}
        <div className="mv3d-overlay-header">
          <div className="mv3d-overlay-header-left">
            <span className="mv3d-overlay-title">3D Viewer</span>
            <span className="mv3d-overlay-badge">{ft || '—'}</span>
            {cs !== 'NOT_REQUIRED' && (
              <span className="mv3d-overlay-cs">{cs}</span>
            )}
          </div>
          <div className="mv3d-overlay-header-right">
            {status === 'ready' && (
              <>
                <div className="mv3d-overlay-btn-group">
                  {['front','back','left','right','top','bottom'].map((v) => (
                    <button key={v} type="button" className="mv3d-btn mv3d-btn-tool" onClick={() => setView(v)} title={v + ' view'}>
                      {v[0].toUpperCase()}
                    </button>
                  ))}
                  <button type="button" className="mv3d-btn mv3d-btn-accent" onClick={() => setView('isometric')} title="Isometric">Iso</button>
                </div>
                <span className="mv3d-separator" />
                <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleReset} title="Reset (R)">Reset</button>
                <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleFit} title="Fit (F)">Fit</button>
                <button type="button" className={`mv3d-btn mv3d-btn-toggle ${wireframe ? 'active' : ''}`} onClick={toggleWireframe} title="Wireframe (W)">Wire</button>
                <button type="button" className={`mv3d-btn mv3d-btn-toggle ${autoRotate ? 'active' : ''}`} onClick={toggleAutoRotate} title="Auto Rotate">Rotate</button>
                <button
                  type="button"
                  className={`mv3d-btn mv3d-btn-toggle ${sectionEnabled ? 'active' : ''}`}
                  onClick={() => (sectionEnabled ? closeSection() : enableSection(sectionAxis))}
                  title="Section / Cut View"
                >
                  Section
                </button>
                <span className="mv3d-separator" />
              </>
            )}
            <button type="button" className="mv3d-btn mv3d-btn-download" onClick={handleDownload}>Download</button>
            <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleFullscreen}>Full</button>
            <button type="button" className="mv3d-overlay-close" onClick={onClose} title="Close (Esc)">×</button>
          </div>
        </div>

        {/* Canvas */}
        <div className="mv3d-overlay-viewport" ref={containerRef}>
          {sectionEnabled && (
            <div className="mv3d-section-panel mv3d-section-panel-overlay">
              <div className="mv3d-section-panel-inner">
                <span className="mv3d-section-label">Section:</span>
                <div className="mv3d-section-axis-group">
                  {['X', 'Y', 'Z'].map((ax) => (
                    <button
                      key={ax}
                      type="button"
                      className={`mv3d-btn mv3d-btn-tool ${sectionAxis === ax ? 'active' : ''}`}
                      onClick={() => setSectionAxisAndUpdate(ax)}
                      title={`Cut along ${ax} axis`}
                    >
                      {ax}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  className="mv3d-section-slider"
                  min="0"
                  max="100"
                  value={sectionPosition}
                  onChange={(e) => setSectionPositionAndUpdate(parseInt(e.target.value, 10))}
                  title="Section plane position"
                />
                <span className="mv3d-section-pos">{sectionPosition}%</span>
                <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={resetSection} title="Disable the section cut">Reset</button>
                <button type="button" className="mv3d-btn mv3d-btn-tool mv3d-btn-danger" onClick={closeSection} title="Close section view">Close</button>
              </div>
            </div>
          )}

          {status === 'loading' && (
            <div className="mv3d-overlay-loading">
              <div className="mv3d-spinner" />
              <span>Loading 3D model…{progress > 0 ? ` ${progress}%` : ''}</span>
            </div>
          )}

          {status === 'converting' && (
            <div className="mv3d-overlay-loading">
              <div className="mv3d-spinner" />
              <span>Conversion in progress…</span>
            </div>
          )}

          {status === 'error' && (
            <div className="mv3d-overlay-error">
              <div className="mv3d-overlay-error-icon">3D</div>
              <div className="mv3d-overlay-error-text">{error}</div>
              <div className="mv3d-overlay-error-actions">
                <button type="button" className="mv3d-btn mv3d-btn-download" onClick={handleDownload}>Download {ft}</button>
                <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={onClose}>Close</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mv3d-overlay-footer">
          <span>Rotate: left-drag</span>
          <span>Zoom: scroll</span>
          <span>Pan: right-drag</span>
          <span>R: Reset · F: Fit · W: Wireframe · 1-7: Views</span>
        </div>
      </div>
    </div>
  );
}
