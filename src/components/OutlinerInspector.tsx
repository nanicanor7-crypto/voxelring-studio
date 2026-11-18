import React, { useMemo, useState } from 'react';
import {
  Bone as BoneIcon,
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AnimRole,
  CubePattern,
  ResolvedBone,
  SelectionTarget,
  Vec3,
  VoxelBone,
  VoxelCube,
  VoxelModelIR,
} from '../types/voxel';
import { getSubtreeBoneNames, resolveModelHierarchy } from '../core/compiler';

interface OutlinerInspectorProps {
  model: VoxelModelIR;
  selection: SelectionTarget;
  onSelect: (sel: SelectionTarget) => void;
  onAddBone: (parentBoneName: string | null) => void;
  onDeleteBone: (boneName: string) => void;
  onToggleBoneVisibility: (boneName: string) => void;
  onUpdateBone: (boneName: string, patch: Partial<VoxelBone>, commitLabel?: string) => void;
  onAddCube: (boneName: string) => void;
  onDuplicateCube: (boneName: string, cubeIndex: number) => void;
  onDeleteCube: (boneName: string, cubeIndex: number) => void;
  onToggleCubeVisibility: (boneName: string, cubeIndex: number) => void;
  onUpdateCube: (
    boneName: string,
    cubeIndex: number,
    patch: Partial<VoxelCube>,
    commitLabel?: string
  ) => void;
}

const ANIM_ROLE_LABELS: Record<AnimRole, string> = {
  none: 'Nenhum (Estático)',
  head: 'Cabeça (Head)',
  body: 'Torso (Body)',
  left_arm: 'Braço Esq. (Left Arm)',
  right_arm: 'Braço Dir. (Right Arm)',
  left_leg: 'Perna Esq. (Left Leg)',
  right_leg: 'Perna Dir. (Right Leg)',
  cape: 'Capa (Cape)',
  wing_left: 'Asa Esq. (Wing Left)',
  wing_right: 'Asa Dir. (Wing Right)',
  tail: 'Cauda (Tail)',
};

const PATTERN_OPTIONS: Array<{ value: CubePattern; label: string }> = [
  { value: 'solid', label: 'Sólido' },
  { value: 'shaded_bevel', label: 'Chanfro' },
  { value: 'noise', label: 'Ruído Pixel' },
  { value: 'armor_trim', label: 'Armadura' },
  { value: 'face_eyes', label: 'Rosto/Olhos' },
  { value: 'stripes', label: 'Listras' },
];

interface Vec3ControlProps {
  label: string;
  value: Vec3;
  min: number;
  max: number;
  step: number;
  axisLabels?: [string, string, string];
  onChange: (next: Vec3) => void;
}

const Vec3Control: React.FC<Vec3ControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  axisLabels = ['X', 'Y', 'Z'],
  onChange,
}) => {
  const axisColors = ['text-rose-400', 'text-emerald-400', 'text-sky-400'];

  const handleAxis = (idx: 0 | 1 | 2, raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    const next: Vec3 = [...value] as Vec3;
    next[idx] = Math.round(parsed * 100) / 100;
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-300">{label}</span>
        <span className="text-[10px] font-mono-tabular text-slate-500">
          [{value[0]}, {value[1]}, {value[2]}]
        </span>
      </div>
      <div className="space-y-1">
        {([0, 1, 2] as const).map((idx) => (
          <div key={axisLabels[idx]} className="flex items-center gap-2">
            <span className={`w-3 text-[11px] font-mono-tabular font-semibold ${axisColors[idx]}`}>
              {axisLabels[idx]}
            </span>
            <input
              type="range"
              aria-label={`${label} eixo ${axisLabels[idx]} slider`}
              min={min}
              max={max}
              step={step}
              value={Math.max(min, Math.min(max, value[idx]))}
              onChange={(e) => handleAxis(idx, e.target.value)}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg accent-amber-500 cursor-pointer"
            />
            <input
              type="number"
              aria-label={`${label} eixo ${axisLabels[idx]}`}
              step={step}
              value={value[idx]}
              onChange={(e) => handleAxis(idx, e.target.value)}
              className="w-15 bg-[#0d1118] border border-slate-800 focus:border-amber-500/70 focus:outline-none rounded px-1.5 py-0.5 text-right text-xs font-mono-tabular text-slate-200"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const OutlinerInspector: React.FC<OutlinerInspectorProps> = ({
  model,
  selection,
  onSelect,
  onAddBone,
  onDeleteBone,
  onToggleBoneVisibility,
  onUpdateBone,
  onAddCube,
  onDuplicateCube,
  onDeleteCube,
  onToggleCubeVisibility,
  onUpdateCube,
}) => {
  const [collapsedBones, setCollapsedBones] = useState<Record<string, boolean>>({});

  const resolvedBones: ResolvedBone[] = useMemo(() => resolveModelHierarchy(model), [model]);

  const activeBoneName = selection?.boneName ?? model.bones[0]?.name ?? null;

  const toggleCollapse = (boneName: string) => {
    setCollapsedBones((prev) => ({ ...prev, [boneName]: !prev[boneName] }));
  };

  const hiddenByCollapse = useMemo(() => {
    const byName = new Map(model.bones.map((b) => [b.name, b]));
    const hidden = new Set<string>();
    for (const b of model.bones) {
      let curr = b.parent ? byName.get(b.parent) : undefined;
      while (curr) {
        if (collapsedBones[curr.name]) {
          hidden.add(b.name);
          break;
        }
        curr = curr.parent ? byName.get(curr.parent) : undefined;
      }
    }
    return hidden;
  }, [model.bones, collapsedBones]);

  const selectedBoneObj = useMemo(() => {
    if (!selection) return null;
    return model.bones.find((b) => b.name === selection.boneName) ?? null;
  }, [model.bones, selection]);

  const selectedCubeObj = useMemo(() => {
    if (!selection || selection.type !== 'cube' || !selectedBoneObj) return null;
    return selectedBoneObj.cubes[selection.cubeIndex] ?? null;
  }, [selection, selectedBoneObj]);

  const validParentCandidates = useMemo(() => {
    if (!selectedBoneObj) return [];
    const subtree = getSubtreeBoneNames(model, selectedBoneObj.name);
    return model.bones.filter((b) => !subtree.has(b.name));
  }, [model, selectedBoneObj]);

  return (
    <aside
      aria-label="Outliner e Inspetor"
      className="w-80 shrink-0 bg-[#111621] border-r border-slate-800/90 flex flex-col h-full overflow-hidden select-none"
    >
      <div className="flex flex-col h-[46%] min-h-[220px] border-b border-slate-800/90">
        <div className="px-3 py-2 bg-[#141a26] border-b border-slate-800/80 flex items-center justify-between gap-2">
          <h2 className="font-display font-semibold text-xs tracking-wide text-slate-200">
            Outliner · Hierarquia
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAddBone(activeBoneName)}
              aria-label="Adicionar novo osso"
              title="Adicionar Osso Filho"
              className="px-2 py-1 rounded bg-[#1b2333] hover:bg-slate-700/80 border border-slate-700/70 text-[11px] font-medium text-sky-300 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>Osso</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeBoneName) onAddCube(activeBoneName);
              }}
              disabled={!activeBoneName}
              aria-label="Adicionar novo cubo"
              title="Adicionar Cubo ao Osso Ativo"
              className="px-2 py-1 rounded bg-[#1b2333] hover:bg-slate-700/80 border border-slate-700/70 text-[11px] font-medium text-amber-300 flex items-center gap-1 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>Cubo</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
          {resolvedBones.map((rb) => {
            const { bone, depth } = rb;
            if (hiddenByCollapse.has(bone.name)) return null;

            const isBoneSelected =
              selection?.type === 'bone' && selection.boneName === bone.name;
            const isCollapsed = !!collapsedBones[bone.name];
            const hasChildrenOrCubes = rb.childrenNames.length > 0 || bone.cubes.length > 0;
            const isVisible = bone.visible !== false;

            return (
              <div key={bone.name}>
                <div
                  style={{ paddingLeft: `${depth * 12 + 4}px` }}
                  className={`group flex items-center justify-between gap-1 pr-1.5 py-1 rounded text-xs transition-colors ${
                    isBoneSelected
                      ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {hasChildrenOrCubes ? (
                      <button
                        type="button"
                        aria-label={`Alternar expansão de ${bone.name}`}
                        onClick={() => toggleCollapse(bone.name)}
                        className="p-0.5 text-slate-500 hover:text-slate-200 cursor-pointer shrink-0"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}

                    <button
                      type="button"
                      onClick={() => onSelect({ type: 'bone', boneName: bone.name })}
                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <BoneIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate font-medium">{bone.name}</span>
                      {bone.animRole !== 'none' && (
                        <span className="text-[10px] text-slate-500 font-mono-tabular shrink-0">
                          · {bone.animRole}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Alternar visibilidade do osso ${bone.name}`}
                      onClick={() => onToggleBoneVisibility(bone.name)}
                      className="p-1 text-slate-500 hover:text-slate-200 cursor-pointer"
                    >
                      {isVisible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                      )}
                    </button>
                    {model.bones.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover osso ${bone.name}`}
                        onClick={() => onDeleteBone(bone.name)}
                        className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {!isCollapsed &&
                  bone.cubes.map((cube, cIdx) => {
                    const isCubeSelected =
                      selection?.type === 'cube' &&
                      selection.boneName === bone.name &&
                      selection.cubeIndex === cIdx;
                    const cubeVisible = cube.visible !== false && isVisible;

                    return (
                      <div
                        key={`${bone.name}::${cIdx}`}
                        style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
                        className={`group flex items-center justify-between gap-1 pr-1.5 py-1 rounded text-xs transition-colors ${
                          isCubeSelected
                            ? 'bg-amber-500/20 text-amber-200 ring-1 ring-inset ring-amber-500/45'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onSelect({ type: 'cube', boneName: bone.name, cubeIndex: cIdx })
                          }
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <Box className="w-3 h-3 text-amber-400/90 shrink-0" />
                          <span className="truncate">{cube.name}</span>
                          <span
                            className="w-2.5 h-2.5 rounded-xs border border-white/20 shrink-0 ml-0.5"
                            style={{ backgroundColor: cube.primaryColor }}
                            aria-hidden="true"
                          />
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            aria-label={`Alternar visibilidade do cubo ${cube.name}`}
                            onClick={() => onToggleCubeVisibility(bone.name, cIdx)}
                            className="p-1 text-slate-500 hover:text-slate-200 cursor-pointer"
                          >
                            {cubeVisible ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-rose-400" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover cubo ${cube.name}`}
                            onClick={() => onDeleteCube(bone.name, cIdx)}
                            className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-3 py-2 bg-[#141a26] border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="font-display font-semibold text-xs tracking-wide text-slate-200">
            Inspetor de Propriedades
          </h2>
          {selection && (
            <span className="text-[11px] font-mono-tabular text-slate-400">
              {selection.type === 'bone' ? 'Osso' : 'Cubo'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 pb-5 space-y-4">
          {!selection && (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs text-slate-400">
                Selecione um osso ou cubo no Outliner ou clique no personagem 3D para inspecionar e ajustar medidas.
              </p>
            </div>
          )}

          {selection?.type === 'bone' && selectedBoneObj && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="inspector-bone-name"
                    className="block text-[11px] text-slate-400 mb-1"
                  >
                    Identificador
                  </label>
                  <input
                    id="inspector-bone-name"
                    type="text"
                    value={selectedBoneObj.name}
                    onChange={(e) =>
                      onUpdateBone(selectedBoneObj.name, { name: e.target.value })
                    }
                    className="w-full bg-[#0d1118] border border-slate-800 focus:border-sky-500 focus:outline-none rounded px-2 py-1 text-xs font-mono-tabular text-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="inspector-bone-parent"
                    className="block text-[11px] text-slate-400 mb-1"
                  >
                    Osso Pai
                  </label>
                  <select
                    id="inspector-bone-parent"
                    value={selectedBoneObj.parent ?? ''}
                    onChange={(e) =>
                      onUpdateBone(
                        selectedBoneObj.name,
                        { parent: e.target.value ? e.target.value : null },
                        `Parent de ${selectedBoneObj.name}`
                      )
                    }
                    className="w-full bg-[#0d1118] border border-slate-800 focus:border-sky-500 focus:outline-none rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="">(Raiz / Sem pai)</option>
                    {validParentCandidates.map((cand) => (
                      <option key={cand.name} value={cand.name}>
                        {cand.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="inspector-bone-animrole"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Papel de Animação Procedural (animRole)
                </label>
                <select
                  id="inspector-bone-animrole"
                  value={selectedBoneObj.animRole}
                  onChange={(e) =>
                    onUpdateBone(
                      selectedBoneObj.name,
                      { animRole: e.target.value as AnimRole },
                      `animRole de ${selectedBoneObj.name}`
                    )
                  }
                  className="w-full bg-[#0d1118] border border-slate-800 focus:border-sky-500 focus:outline-none rounded px-2 py-1.5 text-xs text-slate-200"
                >
                  {(Object.keys(ANIM_ROLE_LABELS) as AnimRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ANIM_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <Vec3Control
                  label="Pivot Offset (relativo ao pai)"
                  value={selectedBoneObj.pivotOffset}
                  min={-32}
                  max={32}
                  step={0.5}
                  onChange={(pivotOffset) =>
                    onUpdateBone(selectedBoneObj.name, { pivotOffset })
                  }
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <Vec3Control
                  label="Rotação Base (bindRotation °)"
                  value={selectedBoneObj.bindRotation}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(bindRotation) =>
                    onUpdateBone(selectedBoneObj.name, { bindRotation })
                  }
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAddCube(selectedBoneObj.name)}
                  className="flex-1 py-1.5 px-2.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Cubo</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAddBone(selectedBoneObj.name)}
                  className="flex-1 py-1.5 px-2.5 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Osso Filho</span>
                </button>
              </div>
            </div>
          )}

          {selection?.type === 'cube' && selectedBoneObj && selectedCubeObj && (
            <div className="space-y-3.5">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="inspector-cube-name"
                    className="block text-[11px] text-slate-400 mb-1"
                  >
                    Nome do Cubo ({selectedBoneObj.name})
                  </label>
                  <input
                    id="inspector-cube-name"
                    type="text"
                    value={selectedCubeObj.name}
                    onChange={(e) =>
                      onUpdateCube(selection.boneName, selection.cubeIndex, {
                        name: e.target.value,
                      })
                    }
                    className="w-full bg-[#0d1118] border border-slate-800 focus:border-amber-500/70 focus:outline-none rounded px-2 py-1 text-xs font-mono-tabular text-slate-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onDuplicateCube(selection.boneName, selection.cubeIndex)}
                  aria-label="Duplicar cubo selecionado"
                  title="Duplicar Cubo"
                  className="px-2.5 py-1 rounded bg-[#1b2333] hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicar</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <Vec3Control
                  label="Centro Local (localCenter px)"
                  value={selectedCubeObj.localCenter}
                  min={-24}
                  max={24}
                  step={0.5}
                  onChange={(localCenter) =>
                    onUpdateCube(selection.boneName, selection.cubeIndex, { localCenter })
                  }
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <Vec3Control
                  label="Dimensões (size L×A×P px)"
                  value={selectedCubeObj.size}
                  min={1}
                  max={32}
                  step={1}
                  axisLabels={['L', 'A', 'P']}
                  onChange={(size) =>
                    onUpdateCube(selection.boneName, selection.cubeIndex, { size })
                  }
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <Vec3Control
                  label="Rotação do Cubo (graus)"
                  value={selectedCubeObj.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(rotation) =>
                    onUpdateCube(selection.boneName, selection.cubeIndex, { rotation })
                  }
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="inspector-cube-inflate" className="text-[11px] font-medium text-slate-300">
                    Inflate (Camada Outer / Armadura)
                  </label>
                  <input
                    id="inspector-cube-inflate"
                    type="number"
                    step={0.05}
                    min={-0.4}
                    max={4}
                    value={selectedCubeObj.inflate}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) {
                        onUpdateCube(selection.boneName, selection.cubeIndex, { inflate: val });
                      }
                    }}
                    className="w-16 bg-[#0d1118] border border-slate-800 rounded px-1.5 py-0.5 text-right text-xs font-mono-tabular text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[0, 0.25, 0.5, 0.75].map((presetInf) => (
                    <button
                      key={presetInf}
                      type="button"
                      onClick={() =>
                        onUpdateCube(
                          selection.boneName,
                          selection.cubeIndex,
                          { inflate: presetInf },
                          `Inflate ${presetInf}`
                        )
                      }
                      className={`py-1 rounded text-xs font-mono-tabular border transition-colors cursor-pointer ${
                        selectedCubeObj.inflate === presetInf
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-[#0d1118] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      +{presetInf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="inspector-primary-color"
                      className="block text-[11px] text-slate-400 mb-1"
                    >
                      Cor Primária
                    </label>
                    <div className="flex items-center gap-1.5 bg-[#0d1118] border border-slate-800 rounded px-1.5 py-1">
                      <input
                        id="inspector-primary-color"
                        type="color"
                        value={selectedCubeObj.primaryColor}
                        onChange={(e) =>
                          onUpdateCube(selection.boneName, selection.cubeIndex, {
                            primaryColor: e.target.value,
                          })
                        }
                        className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        aria-label="Hex cor primária"
                        value={selectedCubeObj.primaryColor}
                        onChange={(e) =>
                          onUpdateCube(selection.boneName, selection.cubeIndex, {
                            primaryColor: e.target.value,
                          })
                        }
                        className="w-full bg-transparent text-xs font-mono-tabular text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="inspector-secondary-color"
                      className="block text-[11px] text-slate-400 mb-1"
                    >
                      Cor Secundária
                    </label>
                    <div className="flex items-center gap-1.5 bg-[#0d1118] border border-slate-800 rounded px-1.5 py-1">
                      <input
                        id="inspector-secondary-color"
                        type="color"
                        value={selectedCubeObj.secondaryColor}
                        onChange={(e) =>
                          onUpdateCube(selection.boneName, selection.cubeIndex, {
                            secondaryColor: e.target.value,
                          })
                        }
                        className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        aria-label="Hex cor secundária"
                        value={selectedCubeObj.secondaryColor}
                        onChange={(e) =>
                          onUpdateCube(selection.boneName, selection.cubeIndex, {
                            secondaryColor: e.target.value,
                          })
                        }
                        className="w-full bg-transparent text-xs font-mono-tabular text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] text-slate-400 mb-1.5">
                    Padrão Pixel-Art Procedural
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {PATTERN_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          onUpdateCube(
                            selection.boneName,
                            selection.cubeIndex,
                            { pattern: opt.value },
                            `Padrão ${opt.label}`
                          )
                        }
                        className={`py-1.5 px-1.5 rounded text-[11px] font-medium border truncate transition-colors cursor-pointer ${
                          selectedCubeObj.pattern === opt.value
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                            : 'bg-[#0d1118] border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
