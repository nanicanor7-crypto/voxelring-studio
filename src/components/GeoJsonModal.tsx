import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import type { PackedLayout, VoxelModelIR } from '../types/voxel';
import { compileToBedrockGeoJson } from '../core/compiler';

interface GeoJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: VoxelModelIR;
  layout: PackedLayout | null;
  onExportBundle: () => void;
}

export const GeoJsonModal: React.FC<GeoJsonModalProps> = ({
  isOpen,
  onClose,
  model,
  layout,
  onExportBundle,
}) => {
  const [copied, setCopied] = useState(false);

  const formattedJson = useMemo(() => {
    if (!isOpen) return '';
    const compiled = compileToBedrockGeoJson(model, layout ?? undefined);
    return JSON.stringify(compiled, null, 2);
  }, [isOpen, model, layout]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="geojson-modal-title"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-3xl max-h-[85vh] bg-[#111621] border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-[#151c29] border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2
              id="geojson-modal-title"
              className="font-display font-bold text-sm text-slate-100"
            >
              Minecraft Bedrock Geometry · {model.modelName}.geo.json
            </h2>
            <p className="text-xs text-slate-400">
              format_version &quot;1.12.0&quot; · Compatível com Blockbench e Minecraft Bedrock Entity
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar janela .geo.json"
            onClick={onClose}
            className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <pre className="flex-1 overflow-auto p-4 bg-[#0b0e14] text-xs font-mono-tabular text-slate-200 leading-relaxed">
          {formattedJson}
        </pre>

        <div className="px-4 py-3 bg-[#151c29] border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded bg-[#1b2333] hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar JSON</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              onExportBundle();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar .geo.json + .png</span>
          </button>
        </div>
      </div>
    </div>
  );
};
