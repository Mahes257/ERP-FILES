import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Icon } from './Icon.jsx';
import {
  decodeSldprtPreviewMesh, silhouettePositionsFromImage, imageBytesToRgba,
} from './cad/decodeSldprtMesh.js';

/**
 * SolidWorks3DPreview — in-browser 3D preview for SolidWorks .SLDPRT /
 * .SLDASM files. Honest by construction: every rendered triangle is derived
 * from the uploaded file, through one REAL browser-only pipeline —
 *
 *   1. Direct payload decoding (no service): the file's own deflate
 *      payloads are inflated and classified. Real tessellation payloads
 *      (the vertex soup SolidWorks itself displays) are rendered as-is.
 *      As a last resort, the file's embedded preview image (SolidWorks'
 *      own saved render) becomes a labelled-approximate silhouette mesh.
 *   2. If the file carries no decodable payload — the case for modern
 *      SolidWorks 2018+ files like karthi.SLDPRT whose geometry is entirely
 *      inside the proprietary Parasolid encoding — an honest "3D browser
 *      preview is not available for this format" panel is shown with the
 *      REAL facts extracted from the file, the original file stays
 *      downloadable, and guidance points to the one-step export
 *      (File → Save As → STEP) that enables full browser viewing.
 *
 * NO CAD conversion server, NO placeholder cube, no fabricated model, ever.
 * The original file bytes are never modified; download stays available
 * through the standard actions.
 */

const STAGE_MESSAGES = {
  decoding: 'Preparing 3D preview…',
  image: 'Reconstructing geometry from the file preview…',
};

function ViewerButton({ children, label, onClick, active = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-8 place-items-center rounded-lg border px-2 text-[12px] font-semibold transition-colors ${
        active ? 'border-[#075E54] bg-[#EAF7F4] text-[#075E54]' : 'border-[#DCE8E4] bg-white text-slate-500 hover:border-[#075E54] hover:text-[#075E54]'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Honest failure panel (spec conversion-failure state). Shows the REAL facts
 * extracted from this exact file — container type, Parasolid schema, stream
 * counts — plus the concrete one-step fix for full browser viewing.
 */
function ConversionFailedPanel({ fileName, onDownload, downloadState = 'idle', lines }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto" style={{ background: '#F4F8F7' }}>
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#FFF7E6] text-amber-600">
          <Icon.alert size={24} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: '#102A2A' }}>
          3D browser preview is not available for this format.
        </h3>
        <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-slate-500">
          This SolidWorks file does not carry a geometry payload the browser can decode. The
          original file is unchanged and stays available for download.
        </p>
        <div className="mx-auto mt-3 max-w-md rounded-xl border border-[#DCE8E4] bg-[#FAFCFB] p-3 text-left text-[11.5px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-600">To view this model in the browser:</span>{' '}
          open it in SolidWorks and <span className="font-semibold">File → Save As → STEP (.step)</span>, then upload the
          STEP file to this model — STEP renders with the full 3D viewer (browser-side OCCT, no conversion server).
        </div>
        {lines?.length ? (
          <ul className="mx-auto mt-3 max-w-md list-disc space-y-1 px-5 text-left text-[11px] leading-relaxed text-slate-400">
            {lines.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        ) : null}
        <p className="mt-2 font-mono text-[11px] text-slate-400">{fileName}</p>
        {onDownload && (
          <button type="button" className="erp-btn-primary mx-auto mt-4" onClick={onDownload} disabled={downloadState === 'busy'}>
            <Icon.download size={15} />
            <span>{downloadState === 'busy' ? 'Downloading…' : 'Download Original File'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function SolidWorks3DPreview({ bytes, fileName, onDownload, downloadState = 'idle' }) {
  const [stage, setStage] = useState('decoding');
  const [mesh, setMesh] = useState(null);          // { positions, source }
  const [failure, setFailure] = useState(null);    // { lines }

  /* ---- REAL browser-only pipeline: decode the file's own payloads ---- */
  useEffect(() => {
    let active = true;
    setStage('decoding');
    setMesh(null);
    setFailure(null);

    const finishFailure = (lines) => {
      if (active) setFailure({ lines });
    };

    (async () => {
      try {
        /* Direct decoding of the file's own payloads. */
        // Inflate on the next macrotask so the loading overlay paints first.
        await new Promise((resolve) => setTimeout(resolve, 30));
        const decoded = decodeSldprtPreviewMesh(bytes);
        if (!active) return;
        if (decoded.positions) {
          setStage(null);
          setMesh({ positions: decoded.positions, source: decoded.source, notes: decoded.notes });
          return;
        }
        if (decoded.previewImage) {
          setStage('image');
          const { rgba, width, height } = await imageBytesToRgba(decoded.previewImage.bytes, decoded.previewImage.kind);
          if (!active) return;
          const sil = silhouettePositionsFromImage(rgba, width, height);
          if (sil) {
            setStage(null);
            setMesh({ positions: sil.positions, source: 'preview-image', notes: decoded.notes });
            return;
          }
        }
        setFailure({ lines: decoded.notes });
      } catch (err) {
        console.warn('[SolidWorks3DPreview] decode failed:', err);
        finishFailure([String(err?.message || err)]);
      }
    })();
    return () => { active = false; };
  }, [bytes, fileName]);

  /* ---------------- three.js scene (same stack as the ERP 3D viewer) ---------------- */
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.001, 5000);
    camera.position.set(1.4, 1.1, 1.6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.6);
    fill.position.set(-4, -2, -3);
    scene.add(fill);
    const grid = new THREE.GridHelper(4, 32, 0x1e293b, 0x1e293b);
    grid.position.y = -0.75;
    scene.add(grid);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    setReady(true);

    let frame;
    const animate = () => {
      if (document.hidden) { frame = undefined; return; }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const resize = () => {
      if (!container.clientWidth) return;
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  /* Bounding-sphere camera fit (identical math to the ERP viewer). */
  const fitCamera = (direction) => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!model || !camera || !controls) return;
    model.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius <= 0) return;
    const dir = direction || new THREE.Vector3(1, 1, 1).normalize();
    const radius = Math.max(sphere.radius, 1e-6);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fitRadius = radius / Math.max(Math.sin(Math.min(vFov, hFov) / 2), 1e-3);
    const distance = fitRadius * 1.12;
    camera.position.copy(sphere.center).addScaledVector(dir, distance);
    camera.near = Math.max(distance / 1000, radius / 1000);
    camera.far = distance + radius * 10;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
    controls.saveState?.();
  };

  /* Build the THREE object from the DECODED positions of this file. */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !mesh) return undefined;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x9fb8c8, metalness: 0.35, roughness: 0.55, wireframe, side: THREE.DoubleSide,
    });
    const object = new THREE.Mesh(geometry, material);
    scene.add(object);
    modelRef.current = object;
    fitCamera(new THREE.Vector3(1, 1, 1).normalize());
    return () => {
      scene.remove(object);
      geometry.dispose();
      material.dispose();
      modelRef.current = null;
    };
  }, [mesh, ready]);

  useEffect(() => {
    modelRef.current && modelRef.current.material && (modelRef.current.material.wireframe = wireframe);
  }, [wireframe]);

  const sourceBadge = useMemo(() => {
    if (!mesh) return '';
    return mesh.source === 'parasolid-tessellation'
      ? 'SolidWorks tessellation — actual file geometry'
      : 'Reconstructed from the file\u2019s embedded preview — approximate';
  }, [mesh]);

  const stageMessage = stage ? (STAGE_MESSAGES[stage] || 'Preparing 3D preview…') : null;

  if (failure) {
    return (
      <ConversionFailedPanel
        fileName={fileName}
        onDownload={onDownload}
        downloadState={downloadState}
        lines={failure.lines}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col" style={{ background: '#0f172a' }}>
      {/* Toolbar — same control set and styling as the ERP 3D viewer */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#DCE8E4] bg-white px-3 py-2">
        <ViewerButton label="Front view" onClick={() => fitCamera(new THREE.Vector3(0, 0, 1))}>Front</ViewerButton>
        <ViewerButton label="Top view" onClick={() => fitCamera(new THREE.Vector3(0, 1, 0))}>Top</ViewerButton>
        <ViewerButton label="Right view" onClick={() => fitCamera(new THREE.Vector3(1, 0, 0))}>Right</ViewerButton>
        <ViewerButton label="Isometric view" onClick={() => fitCamera(new THREE.Vector3(1, 1, 1).normalize())}>ISO</ViewerButton>
        <span className="mx-1 h-5 w-px bg-[#E2E8F0]" />
        <ViewerButton label="Fit to screen" onClick={() => fitCamera()}>⛶ Fit</ViewerButton>
        <ViewerButton label="Reset view" onClick={() => fitCamera(new THREE.Vector3(1, 1, 1).normalize())}>↺ Reset</ViewerButton>
        <ViewerButton label="Toggle wireframe" onClick={() => setWireframe((w) => !w)} active={wireframe}>Wireframe</ViewerButton>
        <span className="ml-auto hidden text-[10.5px] font-medium text-slate-400 sm:inline">
          Drag to orbit · Scroll to zoom · Right-drag to pan
        </span>
      </div>

      {/* WebGL stage */}
      <div ref={containerRef} className="relative min-h-0 flex-1" style={{ minHeight: 320 }} />

      {/* Loading / conversion states (spec messages) */}
      {stageMessage && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" style={{ background: 'rgba(15,23,42,0.55)' }}>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/90 px-8 py-6 text-center backdrop-blur-sm">
            <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            <p className="text-[13.5px] font-semibold text-slate-100">{stageMessage}</p>
            <p className="mt-1 text-[11px] text-slate-400">{fileName}</p>
          </div>
        </div>
      )}

      {/* Status bar: file identity + honest provenance badge */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-700 px-3 py-1.5 text-[10px] text-slate-400" style={{ background: 'rgba(15,23,42,0.9)' }}>
        <span className="min-w-0 truncate">{fileName}{mesh ? ' · Model ready' : ''}</span>
        {mesh && (
          <span className="shrink-0 rounded-full border border-emerald-700/60 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-300">
            {sourceBadge}
          </span>
        )}
        <span className="hidden shrink-0 sm:inline">Orbit / Zoom / Pan</span>
      </div>
    </div>
  );
}
