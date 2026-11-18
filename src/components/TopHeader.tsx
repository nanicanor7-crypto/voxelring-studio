import React from 'react';
import {
  Boxes,
  Code2,
  Download,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { MODEL_PRESETS } from '../core/presets';

interface TopHeaderProps {
  modelName: string;
  onModelNameChange: (name: string) => void;
  boneCount: number;
  cubeCount: number;
  atlasSize: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onLoadPreset: (presetId: string) => void;
  onOpenGeoJsonModal: () => void;
  onExportBundle: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  modelName,
  onModelNameChange,
  boneCount,
  cubeCount,
  atlasSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onLoadPreset,
  onOpenGeoJsonModal,
  onExportBundle,
}) => {
  return (
    <header className="h-13 shrink-0 bg-[#0f131c] border-b border-slate-800/90 px-4 flex items-center justify-between gap-6 select-none">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Boxes className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base tracking-wide text-slate-100 whitespace-nowrap">
            VoxelRig Studio
          </span>
        </div>

        <span className="text-slate-700" aria-hidden="true">
          /
        </span>

        <label className="sr-only" htmlFor="studio-model-name">
          Nome do modelo
        </label>
        <input
          id="studio-model-name"
          type="text"
          value={modelName}
          onChange={(e) => onModelNameChange(e.target.value)}
          className="bg-[#161c28] border border-slate-800 hover:border-slate-700 focus:border-amber-500/70 focus:outline-none rounded px-2.5 py-1 text-xs font-mono-tabular text-slate-200 w-44 truncate transition-colors"
          placeholder="nome_do_modelo"
        />

        <div className="hidden xl:flex items-center gap-2 text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
          <span>{boneCount} ossos</span>
          <span aria-hidden="true">·</span>
          <span>{cubeCount} cubos</span>
          <span aria-hidden="true">·</span>
          <span>
            UV {atlasSize}×{atlasSize}px
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <label htmlFor="preset-selector" className="text-xs text-slate-400 whitespace-nowrap hidden md:inline">
            Modelo Base:
          </label>
          <select
            id="preset-selector"
            aria-label="Selecionar personagem base"
            value={MODEL_PRESETS.find((p) => p.model.modelName === modelName)?.id ?? 'custom'}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                onLoadPreset(e.target.value);
              }
            }}
            className="bg-[#161c28] border border-slate-800 hover:border-slate-700 focus:border-amber-500/70 focus:outline-none rounded px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer transition-colors"
          >
            {MODEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {!MODEL_PRESETS.some((p) => p.model.modelName === modelName) && (
              <option value="custom">Personalizado ({modelName})</option>
            )}
          </select>
        </div>

        <div className="h-4 w-px bg-slate-800" aria-hidden="true" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Desfazer alteração"
            title="Desfazer (Ctrl+Z)"
            className="p-1.5 rounded bg-[#161c28] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Refazer alteração"
            title="Refazer (Ctrl+Y)"
            className="p-1.5 rounded bg-[#161c28] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onLoadPreset('obsidian_vanguard')}
            aria-label="Restaurar modelo inicial"
            title="Restaurar Guardião de Obsidiana"
            className="p-1.5 rounded bg-[#161c28] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenGeoJsonModal}
          className="px-3 py-1.5 rounded bg-[#161c28] border border-slate-700/80 hover:border-slate-600 text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
        >
          <Code2 className="w-3.5 h-3.5 text-sky-400" />
          <span>Ver .geo.json</span>
        </button>

        <button
          type="button"
          onClick={onExportBundle}
          className="px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 stroke-[2.25]" />
          <span>Exportar .geo.json + .png</span>
        </button>
      </div>
    </header>
  );
};
