import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

const ANIM_ROLES = [
  'none',
  'head',
  'body',
  'left_arm',
  'right_arm',
  'left_leg',
  'right_leg',
  'cape',
  'wing_left',
  'wing_right',
  'tail',
];

const CUBE_PATTERNS = [
  'solid',
  'shaded_bevel',
  'noise',
  'armor_trim',
  'face_eyes',
  'stripes',
];

const CUBE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: 'Unique descriptive name for this cube (e.g. "torso_plate", "helm_crest", "visor").',
    },
    localCenter: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: 'Exact [x, y, z] center of the cube RELATIVE to this bone pivot (in Minecraft pixels, 16 = 1 block).',
    },
    size: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: 'Dimensions [width, height, depth] in Minecraft pixels (must be >= 1, e.g. [8, 8, 8] for head).',
    },
    rotation: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: 'Local Euler rotation [rx, ry, rz] in degrees relative to this bone.',
    },
    inflate: {
      type: Type.NUMBER,
      description: 'Uniform expansion in pixels (e.g. 0 for base geometry, 0.25 or 0.5 for outer armor/clothing layers).',
    },
    primaryColor: {
      type: Type.STRING,
      description: 'Primary hex color "#RRGGBB".',
    },
    secondaryColor: {
      type: Type.STRING,
      description: 'Secondary/accent hex color "#RRGGBB" for trim, bevels, stripes, or eye irises.',
    },
    pattern: {
      type: Type.STRING,
      enum: CUBE_PATTERNS,
      description: 'Procedural pixel-art surface pattern. Use "face_eyes" for the main head/face cube.',
    },
  },
  required: [
    'name',
    'localCenter',
    'size',
    'rotation',
    'inflate',
    'primaryColor',
    'secondaryColor',
    'pattern',
  ],
};

const BONE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: 'Unique bone identifier (e.g. "root", "waist", "body", "head", "rightArm", "leftArm", "rightLeg", "leftLeg", "cape", "tail").',
    },
    parent: {
      type: Type.STRING,
      nullable: true,
      description: 'Parent bone name, or null if this is the root bone.',
    },
    pivotOffset: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: '3D offset [x, y, z] of this bone joint pivot RELATIVE to its parent bone pivot.',
    },
    bindRotation: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: 'Rest pose rotation [rx, ry, rz] in degrees.',
    },
    animRole: {
      type: Type.STRING,
      enum: ANIM_ROLES,
      description: 'Procedural animation role assigned to this bone.',
    },
    cubes: {
      type: Type.ARRAY,
      items: CUBE_SCHEMA,
      description: 'List of cubic parts attached directly to this bone.',
    },
  },
  required: ['name', 'parent', 'pivotOffset', 'bindRotation', 'animRole', 'cubes'],
};

const MODEL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    modelName: {
      type: Type.STRING,
      description: 'Short, evocative character/rig identifier (e.g. "paladin_vanguard", "crimson_wyvern").',
    },
    bones: {
      type: Type.ARRAY,
      items: BONE_SCHEMA,
      description: 'Flat ordered list of all bones in parent-before-child order.',
    },
  },
  required: ['modelName', 'bones'],
};

const SUBTREE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    bones: {
      type: Type.ARRAY,
      items: BONE_SCHEMA,
      description: 'Updated targetBone and all of its child/descendant bones only.',
    },
  },
  required: ['bones'],
};

const RIGGING_SYSTEM_INSTRUCTION = `You are a master 3D Voxel Character Rigger for VoxelRig Studio (Blockbench / Minecraft Bedrock style).
You output a deterministic flat Intermediate Representation (IR) of articulated cubic rigs. NEVER output raw .geo.json.

COORDINATE SYSTEM & SCALE RULES (CRITICAL - NO FLOATING CUBES!):
- Standard Minecraft Scale: 16 units = 1 block (1 unit = 1 pixel). Ground plane is strictly at Y = 0.
- Axes:
  - +Y points UP (feet/claws touch Y = 0).
  - +Z points FORWARD (character's front: face, eyes, chestplate, visor, snout).
  - -Z points BACKWARD (character's back: cape, backpack, dorsal fins, tail).
  - -X is the character's RIGHT side (e.g. rightArm at X = -6, rightLeg at X = -2).
  - +X is the character's LEFT side (e.g. leftArm at X = +6, leftLeg at X = +2).
- Pivot Math:
  - GlobalBonePivot(bone) = parent ? GlobalBonePivot(parent) + bone.pivotOffset : bone.pivotOffset.
  - GlobalCubeCenter(cube) = GlobalBonePivot(bone) + cube.localCenter.
  - A cube of size [W, H, D] spans [center.x - W/2 .. center.x + W/2], [center.y - H/2 .. center.y + H/2], [center.z - D/2 .. center.z + D/2].
  - Every cube MUST physically touch or overlap its joint/adjacent body part. Zero floating disconnected cubes!

CLASSIC MINECRAFT HUMANOID ANCHOR PROPORTIONS (Use as exact reference for humanoids, knights, mages, cyborgs, etc., while freely adding armor, horns, capes, wings, tails, weapons, or building non-humanoid beasts/mechs when requested):
1. "root": parent: null, pivotOffset: [0, 0, 0], bindRotation: [0, 0, 0], animRole: "none", cubes: []
2. "waist": parent: "root", pivotOffset: [0, 12, 0] (global Y=12), animRole: "none", cubes: []
3. "body": parent: "waist", pivotOffset: [0, 0, 0] (global [0, 12, 0]), animRole: "body"
   - Base torso cube: localCenter: [0, 6, 0], size: [8, 12, 4] (spans Y=12..24, X=-4..4, Z=-2..2)
   - Optional chest armor cube: localCenter: [0, 6, 0], size: [8, 12, 4], inflate: 0.35, pattern: "armor_trim"
4. "head": parent: "body", pivotOffset: [0, 12, 0] (global neck [0, 24, 0]), animRole: "head"
   - Base head cube: localCenter: [0, 4, 0], size: [8, 8, 8] (spans Y=24..32), pattern: "face_eyes"
   - Outer helmet/hat layer: localCenter: [0, 4, 0], size: [8, 8, 8], inflate: 0.5, pattern: "armor_trim"
5. "rightArm": parent: "body", pivotOffset: [-6, 11, 0] (shoulder global [-6, 23, 0]), animRole: "right_arm"
   - Arm cube: localCenter: [0, -5, 0], size: [4, 12, 4] (spans X=-8..-4, Y=12..24)
6. "leftArm": parent: "body", pivotOffset: [6, 11, 0] (shoulder global [6, 23, 0]), animRole: "left_arm"
   - Arm cube: localCenter: [0, -5, 0], size: [4, 12, 4] (spans X=4..8, Y=12..24)
7. "rightLeg": parent: "root", pivotOffset: [-2, 12, 0] (hip global [-2, 12, 0]), animRole: "right_leg"
   - Leg cube: localCenter: [0, -6, 0], size: [4, 12, 4] (spans Y=0..12, feet touch Y=0!)
8. "leftLeg": parent: "root", pivotOffset: [2, 12, 0] (hip global [2, 12, 0]), animRole: "left_leg"
   - Leg cube: localCenter: [0, -6, 0], size: [4, 12, 4] (spans Y=0..12, feet touch Y=0!)
9. Optional articulated extras:
   - "cape": parent: "body", pivotOffset: [0, 12, -2.2], bindRotation: [8, 0, 0], animRole: "cape", cube localCenter: [0, -7, -0.5], size: [10, 14, 1]
   - "wingLeft" / "wingRight": parent: "body", pivotOffset: [2, 10, -2] / [-2, 10, -2], animRole: "wing_left" / "wing_right"
   - "tail": parent: "waist", pivotOffset: [0, 1, -2], animRole: "tail"

DESIGN & COLOR CRAFT:
- Build rich, expressive silhouettes (12 to 28 total cubes across bones) with layered armor (inflate 0.25 or 0.5), distinct silhouette accents (horns, pauldrons, belts, boots, weapons, wings, prosthetics), and cohesive hex color palettes.
- Always use pattern: "face_eyes" on the main head/face cube so eyes render on the +Z front face.`;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY não está configurada. Verifique sua chave no painel Settings > Secrets do AI Studio.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeHex(color: unknown, fallback: string): string {
  if (typeof color !== 'string') return fallback;
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function sanitizeVec3(val: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(val) || val.length < 3) return fallback;
  const x = Number(val[0]);
  const y = Number(val[1]);
  const z = Number(val[2]);
  return [
    Number.isFinite(x) ? Math.round(x * 100) / 100 : fallback[0],
    Number.isFinite(y) ? Math.round(y * 100) / 100 : fallback[1],
    Number.isFinite(z) ? Math.round(z * 100) / 100 : fallback[2],
  ];
}

interface RawCube {
  name?: unknown;
  localCenter?: unknown;
  size?: unknown;
  rotation?: unknown;
  inflate?: unknown;
  primaryColor?: unknown;
  secondaryColor?: unknown;
  pattern?: unknown;
}

interface RawBone {
  name?: unknown;
  parent?: unknown;
  pivotOffset?: unknown;
  bindRotation?: unknown;
  animRole?: unknown;
  cubes?: unknown;
}

function sanitizeBonesList(rawBones: unknown[]) {
  const seenNames = new Set<string>();
  return rawBones.map((rb, idx) => {
    const b = (rb && typeof rb === 'object' ? rb : {}) as RawBone;
    let name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : `bone_${idx}`;
    if (seenNames.has(name)) {
      name = `${name}_${idx}`;
    }
    seenNames.add(name);

    const rawParent = typeof b.parent === 'string' ? b.parent.trim() : null;
    const parent =
      rawParent && rawParent !== 'null' && rawParent !== 'none' && rawParent !== name
        ? rawParent
        : null;

    const animRole =
      typeof b.animRole === 'string' && ANIM_ROLES.includes(b.animRole)
        ? b.animRole
        : 'none';

    const rawCubes = Array.isArray(b.cubes) ? b.cubes : [];
    const cubes = rawCubes.map((rc, cIdx) => {
      const c = (rc && typeof rc === 'object' ? rc : {}) as RawCube;
      const rawSize = sanitizeVec3(c.size, [4, 4, 4]);
      const size: [number, number, number] = [
        Math.max(0.5, Math.abs(rawSize[0])),
        Math.max(0.5, Math.abs(rawSize[1])),
        Math.max(0.5, Math.abs(rawSize[2])),
      ];
      const inflateNum = Number(c.inflate);
      const inflate = Number.isFinite(inflateNum)
        ? Math.max(-0.4, Math.min(4, Math.round(inflateNum * 100) / 100))
        : 0;
      const pattern =
        typeof c.pattern === 'string' && CUBE_PATTERNS.includes(c.pattern)
          ? c.pattern
          : 'shaded_bevel';

      return {
        name:
          typeof c.name === 'string' && c.name.trim()
            ? c.name.trim()
            : `${name}_cube_${cIdx}`,
        localCenter: sanitizeVec3(c.localCenter, [0, 0, 0]),
        size,
        rotation: sanitizeVec3(c.rotation, [0, 0, 0]),
        inflate,
        primaryColor: sanitizeHex(c.primaryColor, '#475569'),
        secondaryColor: sanitizeHex(c.secondaryColor, '#94a3b8'),
        pattern,
      };
    });

    return {
      name,
      parent,
      pivotOffset: sanitizeVec3(b.pivotOffset, [0, 0, 0]),
      bindRotation: sanitizeVec3(b.bindRotation, [0, 0, 0]),
      animRole,
      cubes,
    };
  });
}

function collectSubtreeNames(
  bones: Array<{ name: string; parent: string | null }>,
  targetBone: string
): Set<string> {
  const result = new Set<string>([targetBone]);
  let added = true;
  while (added) {
    added = false;
    for (const b of bones) {
      if (b.parent && result.has(b.parent) && !result.has(b.name)) {
        result.add(b.name);
        added = true;
      }
    }
  }
  return result;
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (/API_KEY_INVALID|PERMISSION_DENIED|403/i.test(raw)) {
    return {
      status: 403,
      message:
        'Chave da API Gemini inválida ou sem permissão. Verifique sua chave no painel Settings > Secrets.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return {
      status: 429,
      message:
        'Limite de requisições atingido (429). Aguarde alguns instantes ou selecione uma chave com faturamento ativo em Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || 'Falha inesperada ao comunicar com o Gemini.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: GEMINI_MODEL });
  });

  app.post('/api/generate-model', async (req: Request, res: Response) => {
    try {
      const { prompt, imageBase64, imageMimeType } = req.body ?? {};
      if (typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Forneça uma descrição (prompt) para gerar o personagem.' });
        return;
      }

      const ai = getAiClient();
      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (typeof imageBase64 === 'string' && imageBase64.trim()) {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType:
              typeof imageMimeType === 'string' && imageMimeType.startsWith('image/')
                ? imageMimeType
                : 'image/png',
            data: cleanBase64,
          },
        });
      }

      parts.push({
        text: `Generate a complete articulated cubic Minecraft/Blockbench style 3D character rig for the following request:\n"${prompt.trim()}"\n\nEnsure all joints connect cleanly with zero floating cubes, feet touch Y=0, appropriate animRole values are set for procedural animation, and expressive pixel-art colors/patterns are chosen.`,
      });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts },
        config: {
          systemInstruction: RIGGING_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: MODEL_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        res.status(502).json({ error: 'O modelo retornou uma resposta vazia.' });
        return;
      }

      const parsed = JSON.parse(text) as { modelName?: unknown; bones?: unknown };
      const rawBones = Array.isArray(parsed.bones) ? parsed.bones : [];
      if (rawBones.length === 0) {
        res.status(502).json({ error: 'Nenhum osso válido foi gerado pelo modelo.' });
        return;
      }

      const bones = sanitizeBonesList(rawBones);
      const validNames = new Set(bones.map((b) => b.name));
      for (const b of bones) {
        if (b.parent && !validNames.has(b.parent)) {
          b.parent = null;
        }
      }

      const modelName =
        typeof parsed.modelName === 'string' && parsed.modelName.trim()
          ? parsed.modelName.trim()
          : 'custom_voxel_rig';

      res.json({
        model: {
          modelName,
          bones,
        },
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/mutate-subtree', async (req: Request, res: Response) => {
    try {
      const { currentModel, targetBone, instruction, imageBase64, imageMimeType } =
        req.body ?? {};

      if (
        !currentModel ||
        typeof currentModel !== 'object' ||
        !Array.isArray(currentModel.bones)
      ) {
        res.status(400).json({ error: 'Modelo atual inválido.' });
        return;
      }
      if (typeof targetBone !== 'string' || !targetBone.trim()) {
        res.status(400).json({ error: 'Selecione um osso alvo (targetBone) para editar.' });
        return;
      }
      if (typeof instruction !== 'string' || !instruction.trim()) {
        res.status(400).json({ error: 'Forneça uma instrução de edição para o osso selecionado.' });
        return;
      }

      const existingBones = sanitizeBonesList(currentModel.bones);
      const targetObj = existingBones.find((b) => b.name === targetBone);
      if (!targetObj) {
        res.status(404).json({ error: `Osso "${targetBone}" não encontrado no modelo.` });
        return;
      }

      const subtreeSet = collectSubtreeNames(existingBones, targetBone);
      const currentSubtree = existingBones.filter((b) => subtreeSet.has(b.name));
      const preservedSkeletonSummary = existingBones
        .filter((b) => !subtreeSet.has(b.name))
        .map((b) => ({
          name: b.name,
          parent: b.parent,
          pivotOffset: b.pivotOffset,
          animRole: b.animRole,
          cubeCount: b.cubes.length,
        }));

      const ai = getAiClient();
      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (typeof imageBase64 === 'string' && imageBase64.trim()) {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType:
              typeof imageMimeType === 'string' && imageMimeType.startsWith('image/')
                ? imageMimeType
                : 'image/png',
            data: cleanBase64,
          },
        });
      }

      parts.push({
        text: `SUBTREE MUTATION TASK:
Modify ONLY the bone "${targetBone}" and its descendant subtree according to this user instruction:
"${instruction.trim()}"

IMMUTABLE PARENT CONTEXT (rest of the character that will NOT change):
${JSON.stringify(preservedSkeletonSummary, null, 2)}

CURRENT SUBTREE TO UPDATE (root of subtree is "${targetBone}", whose parent MUST remain ${JSON.stringify(targetObj.parent)} and whose pivotOffset should stay anchored at ${JSON.stringify(targetObj.pivotOffset)} unless the user explicitly asks to relocate the joint):
${JSON.stringify(currentSubtree, null, 2)}

RULES:
1. Return ONLY the updated "${targetBone}" bone and any preserved/modified/new child bones belonging to "${targetBone}"'s subtree.
2. Keep "${targetBone}"'s name strictly "${targetBone}" and its parent strictly ${JSON.stringify(targetObj.parent)}.
3. Do NOT include bones outside "${targetBone}"'s subtree.
4. Ensure all cubes align seamlessly with "${targetBone}"'s joint pivot with zero floating parts.`,
      });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts },
        config: {
          systemInstruction: RIGGING_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: SUBTREE_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        res.status(502).json({ error: 'O modelo retornou uma sub-árvore vazia.' });
        return;
      }

      const parsed = JSON.parse(text) as { bones?: unknown };
      const rawUpdated = Array.isArray(parsed.bones) ? parsed.bones : [];
      if (rawUpdated.length === 0) {
        res.status(502).json({ error: 'Nenhum osso atualizado foi retornado.' });
        return;
      }

      const updatedSubtree = sanitizeBonesList(rawUpdated);
      let rootBone = updatedSubtree.find((b) => b.name === targetBone);
      if (!rootBone) {
        updatedSubtree[0].name = targetBone;
        rootBone = updatedSubtree[0];
      }
      rootBone.parent = targetObj.parent;

      const preservedNames = new Set(
        existingBones.filter((b) => !subtreeSet.has(b.name)).map((b) => b.name)
      );
      for (const b of updatedSubtree) {
        if (b.name !== targetBone && preservedNames.has(b.name)) {
          b.name = `${targetBone}_${b.name}`;
        }
      }
      const updatedNames = new Set(updatedSubtree.map((b) => b.name));
      for (const b of updatedSubtree) {
        if (b.name === targetBone) continue;
        if (!b.parent || !updatedNames.has(b.parent)) {
          b.parent = targetBone;
        }
      }

      const mergedBones: typeof existingBones = [];
      let inserted = false;
      for (const b of existingBones) {
        if (subtreeSet.has(b.name)) {
          if (!inserted) {
            mergedBones.push(...updatedSubtree);
            inserted = true;
          }
        } else {
          mergedBones.push(b);
        }
      }
      if (!inserted) {
        mergedBones.push(...updatedSubtree);
      }

      res.json({
        targetBone,
        updatedBones: updatedSubtree,
        mergedModel: {
          modelName:
            typeof currentModel.modelName === 'string'
              ? currentModel.modelName
              : 'custom_voxel_rig',
          bones: mergedBones,
        },
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxelRig Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
