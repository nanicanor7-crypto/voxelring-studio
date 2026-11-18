import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnimationMode,
  HistoryEntry,
  PackedLayout,
  SelectionTarget,
  VoxelBone,
  VoxelCube,
  VoxelModelIR,
} from './types/voxel';
import { MODEL_PRESETS, OBSIDIAN_VANGUARD_MODEL } from './core/presets';
import {
  cloneModelIR,
  compileToBedrockGeoJson,
  normalizeModelIR,
} from './core/compiler';
import { TopHeader } from './components/TopHeader';
import { OutlinerInspector } from './components/OutlinerInspector';
import { Viewport3D } from './components/Viewport3D';
import { GeminiStudioPanel } from './components/GeminiStudioPanel';
import { GeoJsonModal } from './components/GeoJsonModal';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function App() {
  const initialClone = cloneModelIR(OBSIDIAN_VANGUARD_MODEL);

  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    {
      id: 'init-0',
      label: 'Inicial: Guardião de Obsidiana',
      timestamp: Date.now(),
      model: initialClone,
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [liveModel, setLiveModel] = useState<VoxelModelIR>(() => cloneModelIR(initialClone));
  const [selection, setSelection] = useState<SelectionTarget>({
    type: 'bone',
    boneName: 'head',
  });
  const [animationMode, setAnimationMode] = useState<AnimationMode>('idle');
  const [atlasDataUrl, setAtlasDataUrl] = useState<string>('');
  const [atlasLayout, setAtlasLayout] = useState<PackedLayout | null>(null);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const atlasCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const debounceCommitTimer = useRef<number | null>(null);

  const commitModelSnapshot = useCallback((nextModel: VoxelModelIR, label: string) => {
    if (debounceCommitTimer.current) {
      window.clearTimeout(debounceCommitTimer.current);
      debounceCommitTimer.current = null;
    }
    const normalized = normalizeModelIR(cloneModelIR(nextModel));
    setLiveModel(normalized);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      const nextEntry: HistoryEntry = {
        id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        timestamp: Date.now(),
        model: cloneModelIR(normalized),
      };
      const capped = [...sliced, nextEntry].slice(-30);
      setHistoryIndex(capped.length - 1);
      return capped;
    });
  }, [historyIndex]);

  const scheduleDebouncedSnapshot = useCallback(
    (nextModel: VoxelModelIR, label: string) => {
      const normalized = normalizeModelIR(cloneModelIR(nextModel));
      setLiveModel(normalized);
      if (debounceCommitTimer.current) {
        window.clearTimeout(debounceCommitTimer.current);
      }
      debounceCommitTimer.current = window.setTimeout(() => {
        setHistory((prev) => {
          const sliced = prev.slice(0, historyIndex + 1);
          const nextEntry: HistoryEntry = {
            id: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label,
            timestamp: Date.now(),
            model: cloneModelIR(normalized),
          };
          const capped = [...sliced, nextEntry].slice(-30);
          setHistoryIndex(capped.length - 1);
          return capped;
        });
      }, 420);
    },
    [historyIndex]
  );

  const reconcileSelection = useCallback(
    (prevSel: SelectionTarget, targetModel: VoxelModelIR): SelectionTarget => {
      if (prevSel) {
        const bone = targetModel.bones.find((b) => b.name === prevSel.boneName);
        if (bone) {
          if (prevSel.type === 'cube') {
            if (prevSel.cubeIndex >= 0 && prevSel.cubeIndex < bone.cubes.length) {
              return prevSel;
            }
            if (bone.cubes.length > 0) {
              return { type: 'cube', boneName: bone.name, cubeIndex: bone.cubes.length - 1 };
            }
          }
          return { type: 'bone', boneName: bone.name };
        }
      }
      const fallbackBone =
        targetModel.bones.find((b) => b.name === 'head')?.name ??
        targetModel.bones[0]?.name ??
        null;
      return fallbackBone ? { type: 'bone', boneName: fallbackBone } : null;
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIdx = historyIndex - 1;
    setHistoryIndex(nextIdx);
    const restored = cloneModelIR(history[nextIdx].model);
    setLiveModel(restored);
    setSelection((prev) => reconcileSelection(prev, restored));
  }, [history, historyIndex, reconcileSelection]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIdx = historyIndex + 1;
    setHistoryIndex(nextIdx);
    const restored = cloneModelIR(history[nextIdx].model);
    setLiveModel(restored);
    setSelection((prev) => reconcileSelection(prev, restored));
  }, [history, historyIndex, reconcileSelection]);

  const handleJumpToHistory = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= history.length) return;
      setHistoryIndex(idx);
      const restored = cloneModelIR(history[idx].model);
      setLiveModel(restored);
      setSelection((prev) => reconcileSelection(prev, restored));
    },
    [history, reconcileSelection]
  );

  // Global keyboard shortcuts for Undo (Ctrl+Z) / Redo (Ctrl+Y or Ctrl+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleLoadPreset = (presetId: string) => {
    const found = MODEL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const next = cloneModelIR(found.model);
    commitModelSnapshot(next, `Preset: ${found.label}`);
    setSelection({ type: 'bone', boneName: next.bones.find((b) => b.name === 'head')?.name ?? next.bones[0].name });
  };

  const handleModelNameChange = (name: string) => {
    const next = cloneModelIR(liveModel);
    next.modelName = name;
    scheduleDebouncedSnapshot(next, `Renomear modelo`);
  };

  const handleAddBone = (parentBoneName: string | null) => {
    const next = cloneModelIR(liveModel);
    let idx = next.bones.length + 1;
    let candidateName = `bone_${idx}`;
    const names = new Set(next.bones.map((b) => b.name));
    while (names.has(candidateName)) {
      idx++;
      candidateName = `bone_${idx}`;
    }

    const newBone: VoxelBone = {
      name: candidateName,
      parent: parentBoneName,
      pivotOffset: [0, 4, 0],
      bindRotation: [0, 0, 0],
      animRole: 'none',
      visible: true,
      cubes: [
        {
          name: `${candidateName}_cube`,
          localCenter: [0, 2, 0],
          size: [4, 4, 4],
          rotation: [0, 0, 0],
          inflate: 0,
          primaryColor: '#38bdf8',
          secondaryColor: '#f59e0b',
          pattern: 'shaded_bevel',
          visible: true,
        },
      ],
    };
    next.bones.push(newBone);
    commitModelSnapshot(next, `Novo osso: ${candidateName}`);
    setSelection({ type: 'bone', boneName: candidateName });
  };

  const handleDeleteBone = (boneName: string) => {
    if (liveModel.bones.length <= 1) return;
    const next = cloneModelIR(liveModel);
    const target = next.bones.find((b) => b.name === boneName);
    if (!target) return;

    // Reparent direct children cleanly to deleted bone's parent
    for (const b of next.bones) {
      if (b.parent === boneName) {
        b.parent = target.parent;
        b.pivotOffset = [
          b.pivotOffset[0] + target.pivotOffset[0],
          b.pivotOffset[1] + target.pivotOffset[1],
          b.pivotOffset[2] + target.pivotOffset[2],
        ];
      }
    }
    next.bones = next.bones.filter((b) => b.name !== boneName);
    commitModelSnapshot(next, `Remover osso: ${boneName}`);
    if (selection?.boneName === boneName) {
      setSelection({ type: 'bone', boneName: next.bones[0].name });
    }
  };

  const handleToggleBoneVisibility = (boneName: string) => {
    const next = cloneModelIR(liveModel);
    const b = next.bones.find((x) => x.name === boneName);
    if (!b) return;
    b.visible = b.visible === false;
    setLiveModel(next);
  };

  const handleUpdateBone = (
    boneName: string,
    patch: Partial<VoxelBone>,
    commitLabel?: string
  ) => {
    const next = cloneModelIR(liveModel);
    const b = next.bones.find((x) => x.name === boneName);
    if (!b) return;

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (
        trimmed &&
        trimmed !== boneName &&
        !next.bones.some((other) => other.name === trimmed)
      ) {
        for (const child of next.bones) {
          if (child.parent === boneName) child.parent = trimmed;
        }
        b.name = trimmed;
        setSelection({ type: 'bone', boneName: trimmed });
      }
    }
    if (patch.parent !== undefined) b.parent = patch.parent;
    if (patch.pivotOffset !== undefined) b.pivotOffset = patch.pivotOffset;
    if (patch.bindRotation !== undefined) b.bindRotation = patch.bindRotation;
    if (patch.animRole !== undefined) b.animRole = patch.animRole;

    if (commitLabel) {
      commitModelSnapshot(next, commitLabel);
    } else {
      scheduleDebouncedSnapshot(next, `Ajustar osso ${b.name}`);
    }
  };

  const handleAddCube = (boneName: string) => {
    const next = cloneModelIR(liveModel);
    const b = next.bones.find((x) => x.name === boneName);
    if (!b) return;
    const newCube: VoxelCube = {
      name: `${boneName}_part_${b.cubes.length + 1}`,
      localCenter: [0, 2, 0],
      size: [4, 4, 4],
      rotation: [0, 0, 0],
      inflate: 0,
      primaryColor: '#f59e0b',
      secondaryColor: '#38bdf8',
      pattern: 'armor_trim',
      visible: true,
    };
    b.cubes.push(newCube);
    commitModelSnapshot(next, `Novo cubo em ${boneName}`);
    setSelection({ type: 'cube', boneName, cubeIndex: b.cubes.length - 1 });
  };

  const handleDuplicateCube = (boneName: string, cubeIndex: number) => {
    const next = cloneModelIR(liveModel);
    const b = next.bones.find((x) => x.name === boneName);
    const src = b?.cubes[cubeIndex];
    if (!b || !src) return;
    const copy: VoxelCube = {
      ...src,
      name: `${src.name}_copy`,
      localCenter: [src.localCenter[0] + 1, src.localCenter[1] + 1, src.localCenter[2]],
      size: [...src.size],
      rotation: [...src.rotation],
    };
    b.cubes.push(copy);
    commitModelSnapshot(next, `Duplicar ${src.name}`);
    setSelection({ type: 'cube', boneName, cubeIndex: b.cubes.length - 1 });
  };

  const handleDeleteCube = (boneName: string, cubeIndex: number) => {
    const next = cloneModelIR(liveModel);
    const b = next.bones.find((x) => x.name === boneName);
    if (!b || !b.cubes[cubeIndex]) return;
    const removedName = b.cubes[cubeIndex].name;
    b.cubes.splice(cubeIndex, 1);
    commitModelSnapshot(next, `Remover cubo ${removedName}`);
    if (
      selection?.type === 'cube' &&
      selection.boneName === boneName &&
      selection.cubeIndex === cubeIndex
    ) {
      setSelection({ type: 'bone', boneName });
    }
  };

  const handleToggleCubeVisibility = (boneName: string, cubeIndex: number) => {
    const next = cloneModelIR(liveModel);
    const c = next.bones.find((x) => x.name === boneName)?.cubes[cubeIndex];
    if (!c) return;
    c.visible = c.visible === false;
    setLiveModel(next);
  };

  const handleUpdateCube = (
    boneName: string,
    cubeIndex: number,
    patch: Partial<VoxelCube>,
    commitLabel?: string
  ) => {
    const next = cloneModelIR(liveModel);
    const c = next.bones.find((x) => x.name === boneName)?.cubes[cubeIndex];
    if (!c) return;
    Object.assign(c, patch);
    if (commitLabel) {
      commitModelSnapshot(next, commitLabel);
    } else {
      scheduleDebouncedSnapshot(next, `Editar cubo ${c.name}`);
    }
  };

  const handleAtlasBuilt = useCallback(
    (info: { dataUrl: string; layout: PackedLayout; canvas: HTMLCanvasElement }) => {
      setAtlasDataUrl(info.dataUrl);
      setAtlasLayout(info.layout);
      atlasCanvasRef.current = info.canvas;
    },
    []
  );

  const handleDownloadPngOnly = useCallback(() => {
    const canvas = atlasCanvasRef.current;
    const safeSlug = (liveModel.modelName || 'voxel_rig')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_');
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `${safeSlug}.png`);
      }, 'image/png');
    }
  }, [liveModel.modelName]);

  const handleExportBundle = useCallback(() => {
    const safeSlug =
      (liveModel.modelName || 'voxel_rig')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'voxel_rig';

    const geoJson = compileToBedrockGeoJson(liveModel, atlasLayout ?? undefined);
    const geoBlob = new Blob([JSON.stringify(geoJson, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerDownload(geoBlob, `${safeSlug}.geo.json`);

    const canvas = atlasCanvasRef.current;
    if (canvas) {
      window.setTimeout(() => {
        canvas.toBlob((pngBlob) => {
          if (pngBlob) triggerDownload(pngBlob, `${safeSlug}.png`);
        }, 'image/png');
      }, 180);
    }

    setExportNotice(`Exportado: ${safeSlug}.geo.json + ${safeSlug}.png`);
    window.setTimeout(() => setExportNotice(null), 3200);
  }, [liveModel, atlasLayout]);

  const totalCubes = liveModel.bones.reduce((acc, b) => acc + b.cubes.length, 0);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0e14] text-slate-100 overflow-hidden">
      <TopHeader
        modelName={liveModel.modelName}
        onModelNameChange={handleModelNameChange}
        boneCount={liveModel.bones.length}
        cubeCount={totalCubes}
        atlasSize={atlasLayout?.width ?? 64}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onLoadPreset={handleLoadPreset}
        onOpenGeoJsonModal={() => setIsGeoModalOpen(true)}
        onExportBundle={handleExportBundle}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <OutlinerInspector
          model={liveModel}
          selection={selection}
          onSelect={setSelection}
          onAddBone={handleAddBone}
          onDeleteBone={handleDeleteBone}
          onToggleBoneVisibility={handleToggleBoneVisibility}
          onUpdateBone={handleUpdateBone}
          onAddCube={handleAddCube}
          onDuplicateCube={handleDuplicateCube}
          onDeleteCube={handleDeleteCube}
          onToggleCubeVisibility={handleToggleCubeVisibility}
          onUpdateCube={handleUpdateCube}
        />

        <Viewport3D
          model={liveModel}
          selection={selection}
          onSelect={setSelection}
          animationMode={animationMode}
          onAnimationModeChange={setAnimationMode}
          onAtlasBuilt={handleAtlasBuilt}
        />

        <GeminiStudioPanel
          model={liveModel}
          selection={selection}
          atlasDataUrl={atlasDataUrl}
          atlasLayout={atlasLayout}
          history={history}
          historyIndex={historyIndex}
          onJumpToHistory={handleJumpToHistory}
          onApplyGeneratedModel={(newModel, label) => {
            commitModelSnapshot(newModel, label);
            setSelection({
              type: 'bone',
              boneName: newModel.bones[0]?.name ?? 'root',
            });
          }}
          onApplyMutatedSubtree={(mergedModel, label) => {
            commitModelSnapshot(mergedModel, label);
          }}
          onDownloadPngOnly={handleDownloadPngOnly}
        />
      </div>

      {exportNotice && (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-md bg-[#161e2e] border border-amber-500/50 text-xs font-mono-tabular text-amber-200 shadow-lg"
        >
          {exportNotice}
        </div>
      )}

      <GeoJsonModal
        isOpen={isGeoModalOpen}
        onClose={() => setIsGeoModalOpen(false)}
        model={liveModel}
        layout={atlasLayout}
        onExportBundle={handleExportBundle}
      />
    </div>
  );
}
