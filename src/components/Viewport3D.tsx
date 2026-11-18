import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Activity,
  Camera,
  Footprints,
  Grid3x3,
  MousePointerClick,
  Pause,
  Swords,
  User,
} from 'lucide-react';
import type {
  AnimRole,
  AnimationMode,
  PackedLayout,
  SelectionTarget,
  VoxelModelIR,
} from '../types/voxel';
import { computeProceduralPose } from '../core/compiler';
import {
  buildSelectionOverlay,
  buildThreeVoxelRig,
  type BuiltVoxelRig,
} from '../core/threeBuilder';

interface Viewport3DProps {
  model: VoxelModelIR;
  selection: SelectionTarget;
  onSelect: (sel: SelectionTarget) => void;
  animationMode: AnimationMode;
  onAnimationModeChange: (mode: AnimationMode) => void;
  onAtlasBuilt: (info: { dataUrl: string; layout: PackedLayout; canvas: HTMLCanvasElement }) => void;
}

type CameraPresetId = 'iso' | 'front' | 'right' | 'back' | 'top';

const CAMERA_PRESETS: Record<CameraPresetId, { pos: [number, number, number]; target: [number, number, number] }> = {
  iso: { pos: [38, 31, 48], target: [0, 13.5, 0] },
  front: { pos: [0, 15, 58], target: [0, 13.5, 0] },
  right: { pos: [-56, 15, 0], target: [0, 13.5, 0] },
  back: { pos: [0, 15, -58], target: [0, 13.5, 0] },
  top: { pos: [0, 68, 6], target: [0, 12, 0] },
};

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return true;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createMinecraftFloorGrid(): THREE.Group {
  const floorGroup = new THREE.Group();
  floorGroup.name = 'minecraft_floor_grid';

  const stageGeo = new THREE.PlaneGeometry(96, 96);
  const stageMat = new THREE.MeshStandardMaterial({
    color: 0x0f1520,
    roughness: 0.92,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const stageMesh = new THREE.Mesh(stageGeo, stageMat);
  stageMesh.rotation.x = -Math.PI / 2;
  stageMesh.position.y = -0.04;
  stageMesh.receiveShadow = true;
  floorGroup.add(stageMesh);

  const blockGrid = new THREE.GridHelper(96, 6, 0x334155, 0x1e293b);
  blockGrid.position.y = -0.015;
  floorGroup.add(blockGrid);

  const pixelGrid = new THREE.GridHelper(16, 16, 0xf59e0b, 0x283548);
  pixelGrid.position.y = 0.005;
  floorGroup.add(pixelGrid);

  const borderPts = [
    new THREE.Vector3(-8, 0.02, -8),
    new THREE.Vector3(8, 0.02, -8),
    new THREE.Vector3(8, 0.02, 8),
    new THREE.Vector3(-8, 0.02, 8),
    new THREE.Vector3(-8, 0.02, -8),
  ];
  const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.65,
  });
  floorGroup.add(new THREE.Line(borderGeo, borderMat));

  const frontChevronPts = [
    new THREE.Vector3(-1.8, 0.02, 9.2),
    new THREE.Vector3(0, 0.02, 11.2),
    new THREE.Vector3(1.8, 0.02, 9.2),
  ];
  const chevGeo = new THREE.BufferGeometry().setFromPoints(frontChevronPts);
  const chevMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
  floorGroup.add(new THREE.Line(chevGeo, chevMat));

  return floorGroup;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  model,
  selection,
  onSelect,
  animationMode,
  onAnimationModeChange,
  onAtlasBuilt,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [pickMode, setPickMode] = useState<'cube' | 'bone'>('cube');
  const [animSpeed, setAnimSpeed] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [wireframeAll, setWireframeAll] = useState<boolean>(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const onAtlasBuiltRef = useRef(onAtlasBuilt);
  onAtlasBuiltRef.current = onAtlasBuilt;

  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;

  const animModeRef = useRef<AnimationMode>(animationMode);
  animModeRef.current = animationMode;

  const animSpeedRef = useRef<number>(animSpeed);
  animSpeedRef.current = animSpeed;

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    floorGroup: THREE.Group;
    rigHolder: THREE.Group;
    currentRig: BuiltVoxelRig | null;
    selectionCleanup: (() => void) | null;
    cameraGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
    requestRender: () => void;
    syncLoopMode: () => void;
  } | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.0045);

    const width = Math.max(1, mount.clientWidth || 800);
    const height = Math.max(1, mount.clientHeight || 600);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 400);
    camera.position.set(38, 31, 48);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0xcbe4ff, 0x1e293b, 0.95);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.55);
    keyLight.position.set(28, 48, 34);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    const d = 26;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d * 1.4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    fillLight.position.set(-30, 24, 20);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfde68a, 0.5);
    rimLight.position.set(-14, 34, -32);
    scene.add(rimLight);

    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.CircleGeometry(10, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    const floorGroup = createMinecraftFloorGrid();
    scene.add(floorGroup);

    const rigHolder = new THREE.Group();
    scene.add(rigHolder);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 13.5, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 140;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();

    let frameId = 0;
    let isDisposed = false;
    let loopActive = false;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now() * 0.001;
    const startTime = lastTime;

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function applyBonePose(elapsed: number) {
      const st = sceneRefs.current;
      if (!st?.currentRig) return;
      const mode = animModeRef.current;
      const speed = animSpeedRef.current;

      st.currentRig.boneGroups.forEach((group) => {
        const bindPos = group.userData.bindPosition as [number, number, number];
        const bindRot = group.userData.bindRotation as [number, number, number];
        const role = group.userData.animRole as AnimRole;

        const { rotOffset, posOffset } = computeProceduralPose(role, mode, elapsed, speed);
        group.position.set(
          bindPos[0] + posOffset[0],
          bindPos[1] + posOffset[1],
          bindPos[2] + posOffset[2]
        );
        group.rotation.set(
          THREE.MathUtils.degToRad(bindRot[0] + rotOffset[0]),
          THREE.MathUtils.degToRad(bindRot[1] + rotOffset[1]),
          THREE.MathUtils.degToRad(bindRot[2] + rotOffset[2])
        );
      });
    }

    function stepCameraGoal(dt: number): boolean {
      const st = sceneRefs.current;
      if (!st?.cameraGoal) return false;
      const { pos, target } = st.cameraGoal;
      const alpha = 1 - Math.exp(-9 * dt);
      camera.position.lerp(pos, alpha);
      controls.target.lerp(target, alpha);
      controls.update();

      if (camera.position.distanceTo(pos) < 0.08 && controls.target.distanceTo(target) < 0.08) {
        camera.position.copy(pos);
        controls.target.copy(target);
        st.cameraGoal = null;
        controls.update();
        return false;
      }
      return true;
    }

    function tick() {
      if (isDisposed || !loopActive) return;
      const now = performance.now() * 0.001;
      const dt = Math.min(0.1, Math.max(0.001, now - lastTime));
      lastTime = now;

      const elapsed = now - startTime;
      applyBonePose(elapsed);
      const camMoving = stepCameraGoal(dt);
      if (controls.enableDamping) controls.update();

      renderer.render(scene, camera);

      const shouldKeepLooping = animModeRef.current !== 'static' || camMoving;
      if (!shouldKeepLooping) {
        loopActive = false;
        return;
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    function requestRender() {
      if (isDisposed || loopActive) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (isDisposed) return;
        renderDirty = false;
        applyBonePose(performance.now() * 0.001 - startTime);
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !loopActive) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    function syncLoopMode() {
      const needsLoop =
        animModeRef.current !== 'static' || Boolean(sceneRefs.current?.cameraGoal);
      if (needsLoop && !loopActive) {
        loopActive = true;
        lastTime = performance.now() * 0.001;
        frameId = requestAnimationFrame(tick);
      } else if (!needsLoop) {
        loopActive = false;
        requestRender();
      }
    }

    controls.addEventListener('start', () => {
      if (sceneRefs.current) {
        sceneRefs.current.cameraGoal = null;
      }
    });
    controls.addEventListener('change', () => {
      requestRender();
    });

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const handlePointerUp = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (dist > 5) return;

      const st = sceneRefs.current;
      if (!st?.currentRig) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNdc, camera);
      const visibleMeshes = st.currentRig.cubeMeshes.filter(
        (m) => m.visible && (m.parent?.visible ?? true)
      );
      const hits = raycaster.intersectObjects(visibleMeshes, false);

      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        const { boneName, cubeIndex } = hitMesh.userData as {
          boneName: string;
          cubeIndex: number;
        };
        if (pickModeRef.current === 'bone') {
          onSelectRef.current({ type: 'bone', boneName });
        } else {
          onSelectRef.current({ type: 'cube', boneName, cubeIndex });
        }
      } else {
        onSelectRef.current(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObserver.observe(mount);

    sceneRefs.current = {
      scene,
      camera,
      renderer,
      controls,
      floorGroup,
      rigHolder,
      currentRig: null,
      selectionCleanup: null,
      cameraGoal: null,
      requestRender,
      syncLoopMode,
    };

    return () => {
      isDisposed = true;
      loopActive = false;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      if (sceneRefs.current?.selectionCleanup) {
        sceneRefs.current.selectionCleanup();
      }
      if (sceneRefs.current?.currentRig) {
        sceneRefs.current.currentRig.dispose();
      }
      envTex.dispose();
      shadowTex.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      renderer.dispose();
      sceneRefs.current = null;
    };
  }, []);

  useEffect(() => {
    const st = sceneRefs.current;
    if (!st) return;

    if (st.selectionCleanup) {
      st.selectionCleanup();
      st.selectionCleanup = null;
    }
    if (st.currentRig) {
      st.rigHolder.remove(st.currentRig.rootObject);
      st.currentRig.dispose();
      st.currentRig = null;
    }

    const built = buildThreeVoxelRig(model);
    built.material.wireframe = wireframeAll;
    st.rigHolder.add(built.rootObject);
    st.currentRig = built;

    const overlay = buildSelectionOverlay(built, selection);
    st.selectionCleanup = overlay.cleanup;

    onAtlasBuiltRef.current({
      dataUrl: built.atlasDataUrl,
      layout: built.layout,
      canvas: built.atlasCanvas,
    });

    st.syncLoopMode();
    st.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, wireframeAll]);

  useEffect(() => {
    const st = sceneRefs.current;
    if (!st?.currentRig) return;

    if (st.selectionCleanup) {
      st.selectionCleanup();
      st.selectionCleanup = null;
    }
    const overlay = buildSelectionOverlay(st.currentRig, selection);
    st.selectionCleanup = overlay.cleanup;
    st.requestRender();
  }, [selection]);

  useEffect(() => {
    sceneRefs.current?.syncLoopMode();
  }, [animationMode, animSpeed]);

  useEffect(() => {
    const st = sceneRefs.current;
    if (!st) return;
    st.floorGroup.visible = showGrid;
    st.requestRender();
  }, [showGrid]);

  const jumpCamera = (preset: CameraPresetId) => {
    const st = sceneRefs.current;
    if (!st) return;
    const cfg = CAMERA_PRESETS[preset];
    st.cameraGoal = {
      pos: new THREE.Vector3(...cfg.pos),
      target: new THREE.Vector3(...cfg.target),
    };
    st.syncLoopMode();
  };

  const animButtons: Array<{ id: AnimationMode; label: string; icon: React.ReactNode }> = [
    { id: 'static', label: 'Pose Estática', icon: <Pause className="w-3.5 h-3.5" /> },
    { id: 'idle', label: 'Idle', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'walk', label: 'Caminhada', icon: <Footprints className="w-3.5 h-3.5" /> },
    { id: 'attack', label: 'Ataque', icon: <Swords className="w-3.5 h-3.5" /> },
  ];

  return (
    <main
      aria-label="Viewport 3D"
      data-animation-mode={animationMode}
      className="flex-1 relative h-full min-w-0 bg-[#0b0f17] overflow-hidden select-none"
    >
      <div
        ref={canvasMountRef}
        data-testid="voxel-webgl-viewport"
        className="w-full h-full"
      />

      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1 bg-[#121824] border border-slate-800/90 rounded-md p-1 shadow-md">
          <span className="px-1.5 text-[11px] text-slate-400 flex items-center gap-1">
            <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />
            <span>Clique:</span>
          </span>
          <button
            type="button"
            onClick={() => setPickMode('cube')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              pickMode === 'cube'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Cubo
          </button>
          <button
            type="button"
            onClick={() => setPickMode('bone')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              pickMode === 'bone'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Osso
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1 bg-[#121824] border border-slate-800/90 rounded-md p-1 shadow-md">
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            aria-label="Alternar grade 16x16 no chão"
            title="Grade de Bloco 16×16"
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              showGrid ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            <span>Grade 16×16</span>
          </button>
          <button
            type="button"
            onClick={() => setWireframeAll((v) => !v)}
            aria-label="Alternar modo malha wireframe"
            className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
              wireframeAll ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Malha
          </button>
        </div>
      </div>

      <div className="absolute top-3 right-3 z-10 hidden md:flex items-center gap-1 bg-[#121824] border border-slate-800/90 rounded-md p-1 shadow-md">
        <Camera className="w-3.5 h-3.5 text-slate-400 mx-1.5" />
        {(
          [
            ['iso', 'Perspectiva'],
            ['front', 'Frente'],
            ['right', 'Lado'],
            ['back', 'Costas'],
            ['top', 'Topo'],
          ] as Array<[CameraPresetId, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => jumpCamera(id)}
            className="px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            {label}
          </button>
        ))}
      </div>

      {selection && (
        <div className="absolute top-14 left-3 z-10 text-xs font-mono-tabular text-slate-300 bg-[#121824] border border-slate-800/80 rounded px-2.5 py-1 flex items-center gap-1.5">
          <User className="w-3 h-3 text-amber-400" />
          <span>
            {selection.type === 'bone'
              ? `Osso ativo: ${selection.boneName}`
              : `Cubo ativo: ${selection.boneName} [${selection.cubeIndex}]`}
          </span>
        </div>
      )}

      <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-10 max-w-[96%]">
        <div className="bg-[#121824] border border-slate-800/95 rounded-lg p-1 shadow-lg flex items-center gap-1 flex-nowrap overflow-x-auto">
          {animButtons.map((btn) => {
            const active = animationMode === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onAnimationModeChange(btn.id)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
                }`}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" aria-hidden="true" />

          <div className="hidden sm:flex items-center gap-1">
            {[0.5, 1, 1.5].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setAnimSpeed(spd)}
                aria-label={`Velocidade de animação ${spd}x`}
                className={`px-2 py-1 rounded text-[11px] font-mono-tabular transition-colors cursor-pointer ${
                  animSpeed === spd
                    ? 'bg-slate-800 text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};
