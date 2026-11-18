import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  History,
  ImagePlus,
  Loader2,
  Wand2,
  X,
} from 'lucide-react';
import type {
  HistoryEntry,
  PackedLayout,
  SelectionTarget,
  VoxelModelIR,
} from '../types/voxel';
import { makeCubeKey } from '../core/compiler';

interface GeminiStudioPanelProps {
  model: VoxelModelIR;
  selection: SelectionTarget;
  atlasDataUrl: string;
  atlasLayout: PackedLayout | null;
  history: HistoryEntry[];
  historyIndex: number;
  onJumpToHistory: (index: number) => void;
  onApplyGeneratedModel: (newModel: VoxelModelIR, label: string) => void;
  onApplyMutatedSubtree: (mergedModel: VoxelModelIR, label: string) => void;
  onDownloadPngOnly: () => void;
}

const FULL_MODEL_PROMPTS = [
  'Mago esqueleto arcano com manto estelar, coroa flutuante e cajado de cristal',
  'Golem ancestral de pedra musgosa e cristais de esmeralda no peito',
  'Samurai cibernético com armadura carmesim, máscara oni e katana luminosa',
  'Dragão bípede compacto com chifres dourados, asas abertas e cauda articulada',
];

const SUBTREE_PROMPTS = [
  'Adicione uma ombreira pesada com espinhos dourados',
  'Substitua por um braço mecânico a vapor com canhão de plasma',
  'Transforme em elmo real com viseira azul e chifres curvos',
  'Adicione placas de armadura rúnica com detalhes luminosos',
];

async function compressImageFileToBase64(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const srcUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        const maxDim = 768;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: srcUrl, mimeType: file.type || 'image/png' });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl: outUrl, mimeType: 'image/png' });
      };
      img.src = srcUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const GeminiStudioPanel: React.FC<GeminiStudioPanelProps> = ({
  model,
  selection,
  atlasDataUrl,
  atlasLayout,
  history,
  historyIndex,
  onJumpToHistory,
  onApplyGeneratedModel,
  onApplyMutatedSubtree,
  onDownloadPngOnly,
}) => {
  const activeTargetBone = selection?.boneName ?? null;
  const [aiMode, setAiMode] = useState<'generate' | 'subtree'>('generate');
  const [prompt, setPrompt] = useState<string>('');
  const [refImage, setRefImage] = useState<{
    dataUrl: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (aiMode === 'subtree' && !activeTargetBone) {
      setAiMode('generate');
    }
  }, [aiMode, activeTargetBone]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg(null);
      const compressed = await compressImageFileToBase64(file);
      setRefImage({
        dataUrl: compressed.dataUrl,
        mimeType: compressed.mimeType,
        name: file.name,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar imagem.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorMsg(
        aiMode === 'subtree'
          ? 'Descreva a alteração desejada para o osso selecionado.'
          : 'Descreva o personagem ou criatura que deseja gerar.'
      );
      return;
    }

    if (aiMode === 'subtree' && !activeTargetBone) {
      setErrorMsg('Selecione um osso no Outliner ou Viewport antes de editar sub-árvore.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (aiMode === 'generate') {
        const res = await fetch('/api/generate-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
            imageBase64: refImage?.dataUrl,
            imageMimeType: refImage?.mimeType,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.model) {
          throw new Error(data?.error || 'Falha ao gerar modelo 3D.');
        }
        onApplyGeneratedModel(
          data.model as VoxelModelIR,
          `IA: ${trimmed.slice(0, 28)}${trimmed.length > 28 ? '…' : ''}`
        );
      } else {
        const res = await fetch('/api/mutate-subtree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentModel: model,
            targetBone: activeTargetBone,
            instruction: trimmed,
            imageBase64: refImage?.dataUrl,
            imageMimeType: refImage?.mimeType,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.mergedModel) {
          throw new Error(data?.error || 'Falha ao editar osso selecionado.');
        }
        onApplyMutatedSubtree(
          data.mergedModel as VoxelModelIR,
          `Sub-árvore (${activeTargetBone}): ${trimmed.slice(0, 22)}`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro inesperado na comunicação com o servidor.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCubeAlloc =
    selection?.type === 'cube' && atlasLayout
      ? atlasLayout.byKey[makeCubeKey(selection.boneName, selection.cubeIndex)] ?? null
      : null;

  const suggestions = aiMode === 'subtree' ? SUBTREE_PROMPTS : FULL_MODEL_PROMPTS;

  return (
    <aside
      aria-label="Estúdio IA e Atlas UV"
      className="w-84 shrink-0 bg-[#111621] border-l border-slate-800/90 flex flex-col h-full overflow-hidden select-none"
    >
      <div className="p-3 border-b border-slate-800/90 space-y-3 overflow-y-auto max-h-[52%]">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-xs tracking-wide text-slate-200">
            Modelador Estruturado IA
          </h2>
          <span className="text-[11px] font-mono-tabular text-slate-500">IR Determinística</span>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[#0b0e14] border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setAiMode('generate');
              setErrorMsg(null);
            }}
            className={`py-1.5 px-2 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              aiMode === 'generate'
                ? 'bg-[#1b2333] text-amber-300 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Novo Personagem
          </button>
          <button
            type="button"
            disabled={!activeTargetBone}
            onClick={() => {
              if (activeTargetBone) {
                setAiMode('subtree');
                setErrorMsg(null);
              }
            }}
            title={
              activeTargetBone
                ? `Editar apenas a sub-árvore do osso "${activeTargetBone}"`
                : 'Selecione um osso no Outliner ou Viewport primeiro'
            }
            className={`py-1.5 px-2 rounded text-xs font-medium transition-colors cursor-pointer truncate disabled:opacity-40 disabled:cursor-not-allowed ${
              aiMode === 'subtree'
                ? 'bg-[#1b2333] text-sky-300 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeTargetBone ? `Editar: ${activeTargetBone}` : 'Editar Osso Ativo'}
          </button>
        </div>

        {aiMode === 'subtree' && activeTargetBone && (
          <p className="text-[11px] text-sky-300/90 bg-sky-500/10 border border-sky-500/25 rounded px-2.5 py-1.5 leading-relaxed">
            Modo cirúrgico ativo: apenas <strong className="font-mono-tabular">{activeTargetBone}</strong> e seus filhos serão alterados. O restante do personagem permanece intacto.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label htmlFor="ai-rig-prompt" className="sr-only">
              Instrução de modelagem 3D
            </label>
            <textarea
              id="ai-rig-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={
                aiMode === 'subtree'
                  ? `Ex: Adicione uma ombreira com espinhos ou troque "${activeTargetBone}" por um braço mecânico...`
                  : 'Descreva o personagem, criatura, armadura, asas ou acessórios...'
              }
              className="w-full bg-[#0d1118] border border-slate-800 focus:border-amber-500/70 focus:outline-none rounded-md p-2.5 text-xs text-slate-100 placeholder:text-slate-500 resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              id="reference-image-upload"
            />
            {!refImage ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded bg-[#161c28] hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5 text-slate-400" />
                <span>Imagem de Referência (opcional)</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-[#161c28] border border-slate-700 rounded px-2 py-1 min-w-0 flex-1">
                <img
                  src={refImage.dataUrl}
                  alt="Referência enviada"
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded object-cover shrink-0 border border-slate-600"
                />
                <span className="text-[11px] text-slate-300 truncate flex-1">{refImage.name}</span>
                <button
                  type="button"
                  aria-label="Remover imagem de referência"
                  onClick={() => setRefImage(null)}
                  className="p-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-2 rounded bg-rose-950/60 border border-rose-500/40 text-[11px] text-rose-200 flex items-start gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 ${
              aiMode === 'subtree'
                ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Compilando Geometria Cúbica...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>
                  {aiMode === 'subtree'
                    ? `Atualizar Sub-árvore (${activeTargetBone})`
                    : 'Gerar Modelo Articulado'}
                </span>
              </>
            )}
          </button>
        </form>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500">Sugestões rápidas:</span>
          <div className="grid grid-cols-1 gap-1">
            {suggestions.slice(0, 3).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setPrompt(item);
                  setErrorMsg(null);
                }}
                className="text-left px-2 py-1 rounded bg-[#0d1118] hover:bg-[#161d2b] border border-slate-800/80 text-[11px] text-slate-400 hover:text-slate-200 truncate transition-colors cursor-pointer"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[110px] border-b border-slate-800/90 flex flex-col overflow-hidden">
        <div className="px-3 py-2 bg-[#141a26] border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-400" />
            <h2 className="font-display font-semibold text-xs tracking-wide text-slate-200">
              Histórico de Versões
            </h2>
          </div>
          <span className="text-[11px] font-mono-tabular text-slate-500">
            {historyIndex + 1}/{history.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {history.map((entry, idx) => {
            const isCurrent = idx === historyIndex;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onJumpToHistory(idx)}
                className={`w-full px-2.5 py-1.5 rounded text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-500/40 font-medium'
                    : idx > historyIndex
                    ? 'text-slate-500 hover:bg-slate-800/40'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span className="truncate">{entry.label}</span>
                <span className="text-[10px] font-mono-tabular text-slate-500 shrink-0">
                  #{idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3 shrink-0 space-y-2 bg-[#0e131d]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-xs tracking-wide text-slate-200">
              Atlas Box UV Pixel-Art
            </h2>
            <p className="text-[10px] font-mono-tabular text-slate-400">
              {atlasLayout
                ? `${atlasLayout.width}×${atlasLayout.height}px · NearestFilter · ${atlasLayout.allocations.length} ilhas`
                : 'Calculando UV...'}
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadPngOnly}
            aria-label="Baixar textura PNG"
            className="px-2 py-1 rounded bg-[#161c28] hover:bg-slate-800 border border-slate-700/80 text-[11px] text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3 text-amber-400" />
            <span>.PNG</span>
          </button>
        </div>

        <div className="relative w-full aspect-square max-h-48 mx-auto rounded border border-slate-800 uv-checkerboard overflow-hidden flex items-center justify-center">
          {atlasDataUrl && atlasLayout ? (
            <div className="relative w-full h-full">
              <img
                src={atlasDataUrl}
                alt={`Atlas UV ${atlasLayout.width}x${atlasLayout.height}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain pixelated-canvas"
              />
              {selectedCubeAlloc && (
                <svg
                  viewBox={`0 0 ${atlasLayout.width} ${atlasLayout.height}`}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <rect
                    x={selectedCubeAlloc.u0}
                    y={selectedCubeAlloc.v0}
                    width={selectedCubeAlloc.boxW}
                    height={selectedCubeAlloc.boxH}
                    fill="rgba(245, 158, 11, 0.16)"
                    stroke="#f59e0b"
                    strokeWidth={Math.max(0.6, atlasLayout.width / 128)}
                  />
                </svg>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-500">Sem textura</span>
          )}
        </div>
      </div>
    </aside>
  );
};
