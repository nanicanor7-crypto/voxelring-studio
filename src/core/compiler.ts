import type {
  AnimRole,
  AnimationMode,
  BedrockBoneJson,
  BedrockCubeJson,
  BedrockGeoJson,
  CubePattern,
  CubeUVAllocation,
  FaceRect,
  PackedLayout,
  ResolvedBone,
  ResolvedCube,
  Vec3,
  VoxelBone,
  VoxelCube,
  VoxelModelIR,
} from '../types/voxel';

const VALID_ANIM_ROLES: Set<AnimRole> = new Set([
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
]);

const VALID_PATTERNS: Set<CubePattern> = new Set([
  'solid',
  'shaded_bevel',
  'noise',
  'armor_trim',
  'face_eyes',
  'stripes',
]);

export function makeCubeKey(boneName: string, cubeIndex: number): string {
  return `${boneName}::${cubeIndex}`;
}

export function roundNum(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  const val = Math.round(n * factor) / factor;
  return Object.is(val, -0) ? 0 : val;
}

export function normalizeHex(hex: string, fallback = '#64748b'): string {
  if (typeof hex !== 'string') return fallback;
  const cleaned = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    return `#${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}${cleaned[3]}${cleaned[3]}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgb(hex: string): [number, number, number] {
  const norm = normalizeHex(hex);
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  return [r, g, b];
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function adjustRgb(rgb: [number, number, number], deltaFactor: number): [number, number, number] {
  if (deltaFactor >= 0) {
    return [
      clampByte(rgb[0] + (255 - rgb[0]) * deltaFactor),
      clampByte(rgb[1] + (255 - rgb[1]) * deltaFactor),
      clampByte(rgb[2] + (255 - rgb[2]) * deltaFactor),
    ];
  }
  const mul = 1 + deltaFactor;
  return [clampByte(rgb[0] * mul), clampByte(rgb[1] * mul), clampByte(rgb[2] * mul)];
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    clampByte(a[0] + (b[0] - a[0]) * t),
    clampByte(a[1] + (b[1] - a[1]) * t),
    clampByte(a[2] + (b[2] - a[2]) * t),
  ];
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pixelHash(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x + 37, 374761393) ^ Math.imul(y + 91, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function cloneModelIR(model: VoxelModelIR): VoxelModelIR {
  return {
    modelName: model.modelName,
    bones: model.bones.map((b) => ({
      name: b.name,
      parent: b.parent,
      pivotOffset: [...b.pivotOffset] as Vec3,
      bindRotation: [...b.bindRotation] as Vec3,
      animRole: b.animRole,
      visible: b.visible !== false,
      cubes: b.cubes.map((c) => ({
        name: c.name,
        localCenter: [...c.localCenter] as Vec3,
        size: [...c.size] as Vec3,
        rotation: [...c.rotation] as Vec3,
        inflate: c.inflate,
        primaryColor: normalizeHex(c.primaryColor, '#475569'),
        secondaryColor: normalizeHex(c.secondaryColor, '#94a3b8'),
        pattern: c.pattern,
        visible: c.visible !== false,
      })),
    })),
  };
}

export function normalizeModelIR(raw: VoxelModelIR): VoxelModelIR {
  const seen = new Set<string>();
  const bones: VoxelBone[] = (raw.bones ?? []).map((b, idx) => {
    let name = (b.name || `bone_${idx}`).trim();
    if (seen.has(name)) name = `${name}_${idx}`;
    seen.add(name);

    const animRole: AnimRole = VALID_ANIM_ROLES.has(b.animRole) ? b.animRole : 'none';
    const cubes: VoxelCube[] = (b.cubes ?? []).map((c, cIdx) => {
      const pattern: CubePattern = VALID_PATTERNS.has(c.pattern) ? c.pattern : 'shaded_bevel';
      return {
        name: (c.name || `${name}_cube_${cIdx}`).trim(),
        localCenter: [
          Number(c.localCenter?.[0]) || 0,
          Number(c.localCenter?.[1]) || 0,
          Number(c.localCenter?.[2]) || 0,
        ],
        size: [
          Math.max(0.5, Math.abs(Number(c.size?.[0]) || 1)),
          Math.max(0.5, Math.abs(Number(c.size?.[1]) || 1)),
          Math.max(0.5, Math.abs(Number(c.size?.[2]) || 1)),
        ],
        rotation: [
          Number(c.rotation?.[0]) || 0,
          Number(c.rotation?.[1]) || 0,
          Number(c.rotation?.[2]) || 0,
        ],
        inflate: Number.isFinite(Number(c.inflate)) ? Number(c.inflate) : 0,
        primaryColor: normalizeHex(c.primaryColor, '#475569'),
        secondaryColor: normalizeHex(c.secondaryColor, '#94a3b8'),
        pattern,
        visible: c.visible !== false,
      };
    });

    return {
      name,
      parent: b.parent && b.parent !== name ? b.parent : null,
      pivotOffset: [
        Number(b.pivotOffset?.[0]) || 0,
        Number(b.pivotOffset?.[1]) || 0,
        Number(b.pivotOffset?.[2]) || 0,
      ],
      bindRotation: [
        Number(b.bindRotation?.[0]) || 0,
        Number(b.bindRotation?.[1]) || 0,
        Number(b.bindRotation?.[2]) || 0,
      ],
      animRole,
      cubes,
      visible: b.visible !== false,
    };
  });

  const byName = new Map(bones.map((b) => [b.name, b]));
  for (const bone of bones) {
    if (bone.parent && !byName.has(bone.parent)) {
      bone.parent = null;
      continue;
    }
    const visited = new Set<string>([bone.name]);
    let curr = bone.parent ? byName.get(bone.parent) : undefined;
    while (curr) {
      if (visited.has(curr.name)) {
        bone.parent = null;
        break;
      }
      visited.add(curr.name);
      curr = curr.parent ? byName.get(curr.parent) : undefined;
    }
  }

  return {
    modelName: (raw.modelName || 'voxel_rig').trim(),
    bones,
  };
}

export function resolveModelHierarchy(ir: VoxelModelIR): ResolvedBone[] {
  const clean = normalizeModelIR(ir);
  const childrenMap = new Map<string | null, VoxelBone[]>();

  for (const b of clean.bones) {
    const parentKey = b.parent && clean.bones.some((x) => x.name === b.parent) ? b.parent : null;
    const list = childrenMap.get(parentKey) ?? [];
    list.push(b);
    childrenMap.set(parentKey, list);
  }

  const resolved: ResolvedBone[] = [];
  const visit = (bone: VoxelBone, parentGlobalPivot: Vec3, depth: number) => {
    const globalPivot: Vec3 = [
      roundNum(parentGlobalPivot[0] + bone.pivotOffset[0]),
      roundNum(parentGlobalPivot[1] + bone.pivotOffset[1]),
      roundNum(parentGlobalPivot[2] + bone.pivotOffset[2]),
    ];

    const kids = childrenMap.get(bone.name) ?? [];
    const resolvedCubes: ResolvedCube[] = bone.cubes.map((cube, cubeIndex) => ({
      cube,
      cubeIndex,
      boneName: bone.name,
      globalCenter: [
        roundNum(globalPivot[0] + cube.localCenter[0]),
        roundNum(globalPivot[1] + cube.localCenter[1]),
        roundNum(globalPivot[2] + cube.localCenter[2]),
      ],
      uvKey: makeCubeKey(bone.name, cubeIndex),
    }));

    resolved.push({
      bone,
      globalPivot,
      depth,
      childrenNames: kids.map((k) => k.name),
      resolvedCubes,
    });

    for (const child of kids) {
      visit(child, globalPivot, depth + 1);
    }
  };

  const roots = childrenMap.get(null) ?? [];
  for (const r of roots) {
    visit(r, [0, 0, 0], 0);
  }

  return resolved;
}

export function getSubtreeBoneNames(ir: VoxelModelIR, targetBone: string): Set<string> {
  const result = new Set<string>();
  if (!ir.bones.some((b) => b.name === targetBone)) return result;
  result.add(targetBone);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of ir.bones) {
      if (b.parent && result.has(b.parent) && !result.has(b.name)) {
        result.add(b.name);
        changed = true;
      }
    }
  }
  return result;
}

export function mergeSubtreeMutation(
  currentModel: VoxelModelIR,
  targetBone: string,
  mutatedBones: VoxelBone[]
): VoxelModelIR {
  const base = cloneModelIR(currentModel);
  const targetOrig = base.bones.find((b) => b.name === targetBone);
  if (!targetOrig || mutatedBones.length === 0) return base;

  const subtreeSet = getSubtreeBoneNames(base, targetBone);
  const preservedNames = new Set(
    base.bones.filter((b) => !subtreeSet.has(b.name)).map((b) => b.name)
  );

  const sanitizedSubtree = normalizeModelIR({
    modelName: base.modelName,
    bones: mutatedBones,
  }).bones;

  let rootMut = sanitizedSubtree.find((b) => b.name === targetBone);
  if (!rootMut) {
    sanitizedSubtree[0].name = targetBone;
    rootMut = sanitizedSubtree[0];
  }
  rootMut.parent = targetOrig.parent;

  for (const b of sanitizedSubtree) {
    if (b.name !== targetBone && preservedNames.has(b.name)) {
      b.name = `${targetBone}_${b.name}`;
    }
  }
  const updatedSet = new Set(sanitizedSubtree.map((b) => b.name));
  for (const b of sanitizedSubtree) {
    if (b.name === targetBone) continue;
    if (!b.parent || !updatedSet.has(b.parent)) {
      b.parent = targetBone;
    }
  }

  const mergedBones: VoxelBone[] = [];
  let inserted = false;
  for (const b of base.bones) {
    if (subtreeSet.has(b.name)) {
      if (!inserted) {
        mergedBones.push(...sanitizedSubtree);
        inserted = true;
      }
    } else {
      mergedBones.push(b);
    }
  }
  if (!inserted) {
    mergedBones.push(...sanitizedSubtree);
  }

  return normalizeModelIR({
    modelName: base.modelName,
    bones: mergedBones,
  });
}

interface PendingUVItem {
  key: string;
  boneName: string;
  cubeIndex: number;
  cubeName: string;
  texW: number;
  texH: number;
  texD: number;
  boxW: number;
  boxH: number;
}

function tryShelfPack(
  items: PendingUVItem[],
  atlasSize: number,
  padding: number
): Map<string, { u0: number; v0: number }> | null {
  const sorted = [...items].sort((a, b) => b.boxH - a.boxH || b.boxW - a.boxW);
  const placements = new Map<string, { u0: number; v0: number }>();

  let curX = padding;
  let curY = padding;
  let shelfH = 0;

  for (const item of sorted) {
    if (item.boxW + padding * 2 > atlasSize || item.boxH + padding * 2 > atlasSize) {
      return null;
    }
    if (curX + item.boxW + padding > atlasSize) {
      curX = padding;
      curY += shelfH + padding;
      shelfH = 0;
    }
    if (curY + item.boxH + padding > atlasSize) {
      return null;
    }
    placements.set(item.key, { u0: curX, v0: curY });
    curX += item.boxW + padding;
    if (item.boxH > shelfH) shelfH = item.boxH;
  }

  return placements;
}

export function packBoxUVs(ir: VoxelModelIR): PackedLayout {
  const pending: PendingUVItem[] = [];

  for (const bone of ir.bones) {
    bone.cubes.forEach((cube, cubeIndex) => {
      const texW = Math.max(1, Math.round(cube.size[0]));
      const texH = Math.max(1, Math.round(cube.size[1]));
      const texD = Math.max(1, Math.round(cube.size[2]));
      const boxW = 2 * texD + 2 * texW;
      const boxH = texD + texH;
      pending.push({
        key: makeCubeKey(bone.name, cubeIndex),
        boneName: bone.name,
        cubeIndex,
        cubeName: cube.name,
        texW,
        texH,
        texD,
        boxW,
        boxH,
      });
    });
  }

  if (pending.length === 0) {
    return { width: 64, height: 64, allocations: [], byKey: {} };
  }

  const candidateSizes = [64, 128, 256, 512];
  let chosenSize = 256;
  let placements: Map<string, { u0: number; v0: number }> | null = null;

  for (const size of candidateSizes) {
    placements = tryShelfPack(pending, size, 1);
    if (placements) {
      chosenSize = size;
      break;
    }
    const tight = tryShelfPack(pending, size, 0);
    if (tight) {
      placements = tight;
      chosenSize = size;
      break;
    }
  }

  if (!placements) {
    chosenSize = 1024;
    placements = tryShelfPack(pending, 1024, 0) ?? new Map();
  }

  const allocations: CubeUVAllocation[] = [];
  const byKey: Record<string, CubeUVAllocation> = {};

  for (const item of pending) {
    const pos = placements.get(item.key) ?? { u0: 0, v0: 0 };
    const { u0, v0 } = pos;
    const { texW: W, texH: H, texD: D, boxW, boxH } = item;

    const alloc: CubeUVAllocation = {
      key: item.key,
      boneName: item.boneName,
      cubeIndex: item.cubeIndex,
      cubeName: item.cubeName,
      u0,
      v0,
      boxW,
      boxH,
      texW: W,
      texH: H,
      texD: D,
      faces: {
        up: { x: u0 + D, y: v0, w: W, h: D },
        down: { x: u0 + D + W, y: v0, w: W, h: D },
        east: { x: u0, y: v0 + D, w: D, h: H },
        north: { x: u0 + D, y: v0 + D, w: W, h: H },
        west: { x: u0 + D + W, y: v0 + D, w: D, h: H },
        south: { x: u0 + 2 * D + W, y: v0 + D, w: W, h: H },
      },
    };

    allocations.push(alloc);
    byKey[item.key] = alloc;
  }

  return {
    width: chosenSize,
    height: chosenSize,
    allocations,
    byKey,
  };
}

function setPixel(
  buf: Uint8ClampedArray,
  atlasW: number,
  atlasH: number,
  x: number,
  y: number,
  rgb: [number, number, number],
  alpha = 255
) {
  if (x < 0 || y < 0 || x >= atlasW || y >= atlasH) return;
  const idx = (y * atlasW + x) * 4;
  buf[idx] = rgb[0];
  buf[idx + 1] = rgb[1];
  buf[idx + 2] = rgb[2];
  buf[idx + 3] = alpha;
}

function paintFaceRect(
  buf: Uint8ClampedArray,
  atlasW: number,
  atlasH: number,
  rect: FaceRect,
  faceKind: 'up' | 'down' | 'east' | 'west' | 'north' | 'south',
  cube: VoxelCube,
  seed: number
) {
  const basePrimary = hexToRgb(cube.primaryColor);
  const baseSecondary = hexToRgb(cube.secondaryColor);

  const faceShadeMap: Record<typeof faceKind, number> = {
    up: 0.1,
    north: 0.0,
    east: -0.07,
    west: -0.07,
    south: -0.1,
    down: -0.18,
  };
  const shade = faceShadeMap[faceKind];
  const primary = adjustRgb(basePrimary, shade);
  const secondary = adjustRgb(baseSecondary, shade * 0.8);

  const { x: rx, y: ry, w, h } = rect;

  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const isLeft = lx === 0;
      const isRight = lx === w - 1;
      const isTop = ly === 0;
      const isBottom = ly === h - 1;
      const isBorder = isLeft || isRight || isTop || isBottom;
      const isCorner = (isLeft || isRight) && (isTop || isBottom);
      const n = pixelHash(seed, lx + rx * 3, ly + ry * 7);

      let color: [number, number, number] = primary;

      switch (cube.pattern) {
        case 'solid': {
          if (w >= 4 && h >= 4 && isCorner) {
            color = adjustRgb(primary, -0.08);
          } else {
            color = adjustRgb(primary, (n - 0.5) * 0.04);
          }
          break;
        }
        case 'shaded_bevel': {
          if (w >= 3 && h >= 3 && isBorder) {
            if (isTop || isLeft) {
              color = adjustRgb(primary, 0.18);
            } else {
              color = adjustRgb(primary, -0.2);
            }
            if (isCorner && w >= 4 && h >= 4) {
              color = lerpRgb(primary, secondary, 0.55);
            }
          } else {
            color = adjustRgb(primary, (n - 0.5) * 0.08);
          }
          break;
        }
        case 'noise': {
          if (n > 0.78) {
            color = lerpRgb(primary, secondary, 0.5);
          } else if (n < 0.22) {
            color = adjustRgb(primary, -0.15);
          } else {
            color = adjustRgb(primary, (n - 0.5) * 0.14);
          }
          break;
        }
        case 'armor_trim': {
          if (isBorder && w >= 3 && h >= 3) {
            color = isTop ? adjustRgb(secondary, 0.15) : secondary;
          } else if (
            faceKind === 'north' &&
            w >= 6 &&
            h >= 6 &&
            ly === Math.floor(h / 2) &&
            lx >= 2 &&
            lx < w - 2
          ) {
            color = adjustRgb(secondary, 0.1);
          } else if (w >= 5 && h >= 5 && (lx === 1 || ly === 1)) {
            color = adjustRgb(primary, 0.12);
          } else {
            color = adjustRgb(primary, (n - 0.5) * 0.07);
          }
          break;
        }
        case 'stripes': {
          const band = (lx + ly) % 4 < 2 || ly % 3 === 0;
          color = band ? primary : secondary;
          if (isBottom && h >= 3) color = adjustRgb(color, -0.15);
          break;
        }
        case 'face_eyes': {
          if (faceKind === 'up') {
            color = adjustRgb(primary, 0.06 + (n - 0.5) * 0.08);
          } else if (ly === 0 && h >= 6 && faceKind !== 'down') {
            color = adjustRgb(primary, -0.12);
          } else {
            color = adjustRgb(primary, (n - 0.5) * 0.08);
          }
          break;
        }
      }

      setPixel(buf, atlasW, atlasH, rx + lx, ry + ly, color, 255);
    }
  }

  if (cube.pattern === 'face_eyes' && faceKind === 'north' && w >= 4 && h >= 4) {
    const iris = hexToRgb(cube.secondaryColor);
    const sclera: [number, number, number] = [244, 248, 252];
    const brow = adjustRgb(primary, -0.32);
    const mouth = adjustRgb(primary, -0.24);

    const eyeY = Math.min(h - 2, Math.max(1, Math.floor(h * 0.5)));

    if (w >= 7) {
      const leftStart = Math.max(1, Math.floor(w * 0.125));
      const rightStart = Math.min(w - 3, w - 2 - leftStart);

      setPixel(buf, atlasW, atlasH, rx + leftStart, ry + eyeY, sclera, 255);
      setPixel(buf, atlasW, atlasH, rx + leftStart + 1, ry + eyeY, iris, 255);

      setPixel(buf, atlasW, atlasH, rx + rightStart, ry + eyeY, iris, 255);
      setPixel(buf, atlasW, atlasH, rx + rightStart + 1, ry + eyeY, sclera, 255);

      if (eyeY - 1 >= 0) {
        setPixel(buf, atlasW, atlasH, rx + leftStart, ry + eyeY - 1, brow, 255);
        setPixel(buf, atlasW, atlasH, rx + leftStart + 1, ry + eyeY - 1, brow, 255);
        setPixel(buf, atlasW, atlasH, rx + rightStart, ry + eyeY - 1, brow, 255);
        setPixel(buf, atlasW, atlasH, rx + rightStart + 1, ry + eyeY - 1, brow, 255);
      }

      if (eyeY + 2 < h) {
        const mouthHalf = Math.max(1, Math.floor(w / 4));
        const cx = Math.floor(w / 2);
        for (let mx = cx - mouthHalf + 1; mx <= cx + mouthHalf - 1; mx++) {
          setPixel(buf, atlasW, atlasH, rx + mx, ry + eyeY + 2, mouth, 255);
        }
      }
    } else {
      setPixel(buf, atlasW, atlasH, rx + 1, ry + eyeY, iris, 255);
      setPixel(buf, atlasW, atlasH, rx + w - 2, ry + eyeY, iris, 255);
    }
  }
}

export function paintAtlasPixels(ir: VoxelModelIR, layout: PackedLayout): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(layout.width * layout.height * 4);

  for (const bone of ir.bones) {
    bone.cubes.forEach((cube, cubeIndex) => {
      const key = makeCubeKey(bone.name, cubeIndex);
      const alloc = layout.byKey[key];
      if (!alloc) return;

      const seed = hashString(`${bone.name}:${cube.name}:${cubeIndex}`);
      paintFaceRect(buf, layout.width, layout.height, alloc.faces.up, 'up', cube, seed);
      paintFaceRect(buf, layout.width, layout.height, alloc.faces.down, 'down', cube, seed + 1);
      paintFaceRect(buf, layout.width, layout.height, alloc.faces.east, 'east', cube, seed + 2);
      paintFaceRect(buf, layout.width, layout.height, alloc.faces.north, 'north', cube, seed + 3);
      paintFaceRect(buf, layout.width, layout.height, alloc.faces.west, 'west', cube, seed + 4);
      paintFaceRect(buf, layout.width, layout.height, alloc.faces.south, 'south', cube, seed + 5);
    });
  }

  return buf;
}

function slugifyIdentifier(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'voxel_character';
}

export function compileToBedrockGeoJson(
  ir: VoxelModelIR,
  existingLayout?: PackedLayout
): BedrockGeoJson {
  const layout = existingLayout ?? packBoxUVs(ir);
  const resolvedBones = resolveModelHierarchy(ir);

  let minY = 0;
  let maxY = 32;
  let maxSpanXZ = 16;

  const bedrockBones: BedrockBoneJson[] = resolvedBones.map((rb) => {
    const { bone, globalPivot, resolvedCubes } = rb;
    const bedrockPivot: Vec3 = [
      roundNum(globalPivot[0]),
      roundNum(globalPivot[1]),
      roundNum(-globalPivot[2]),
    ];

    const cubes: BedrockCubeJson[] = resolvedCubes.map((rc) => {
      const { cube, globalCenter, uvKey } = rc;
      const alloc = layout.byKey[uvKey];
      const [w, h, d] = cube.size;
      const bx = globalCenter[0];
      const by = globalCenter[1];
      const bz = -globalCenter[2];

      minY = Math.min(minY, by - h / 2);
      maxY = Math.max(maxY, by + h / 2);
      maxSpanXZ = Math.max(
        maxSpanXZ,
        Math.abs(bx) * 2 + w,
        Math.abs(bz) * 2 + d
      );

      const origin: Vec3 = [
        roundNum(bx - w / 2),
        roundNum(by - h / 2),
        roundNum(bz - d / 2),
      ];

      const cubeJson: BedrockCubeJson = {
        origin,
        size: [roundNum(w), roundNum(h), roundNum(d)],
        uv: alloc ? [alloc.u0, alloc.v0] : [0, 0],
      };

      if (cube.inflate !== 0) {
        cubeJson.inflate = roundNum(cube.inflate);
      }

      const [rx, ry, rz] = cube.rotation;
      if (rx !== 0 || ry !== 0 || rz !== 0) {
        cubeJson.pivot = [roundNum(bx), roundNum(by), roundNum(bz)];
        cubeJson.rotation = [roundNum(rx), roundNum(-ry), roundNum(-rz)];
      }

      return cubeJson;
    });

    const boneJson: BedrockBoneJson = {
      name: bone.name,
      pivot: bedrockPivot,
    };

    if (bone.parent) {
      boneJson.parent = bone.parent;
    }

    const [brx, bry, brz] = bone.bindRotation;
    if (brx !== 0 || bry !== 0 || brz !== 0) {
      boneJson.rotation = [roundNum(brx), roundNum(-bry), roundNum(-brz)];
    }

    if (cubes.length > 0) {
      boneJson.cubes = cubes;
    }

    return boneJson;
  });

  const boundsWidthBlocks = Math.max(2, Math.ceil(maxSpanXZ / 16) + 1);
  const boundsHeightBlocks = Math.max(2, Math.ceil((maxY - minY) / 16) + 1);
  const centerOffsetBlocks = roundNum(((maxY + minY) / 2) / 16, 2);

  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${slugifyIdentifier(ir.modelName)}`,
          texture_width: layout.width,
          texture_height: layout.height,
          visible_bounds_width: boundsWidthBlocks,
          visible_bounds_height: boundsHeightBlocks,
          visible_bounds_offset: [0, centerOffsetBlocks, 0],
        },
        bones: bedrockBones,
      },
    ],
  };
}

export function computeProceduralPose(
  animRole: AnimRole,
  mode: AnimationMode,
  elapsedSeconds: number,
  speedMultiplier = 1
): { rotOffset: Vec3; posOffset: Vec3 } {
  if (mode === 'static' || animRole === 'none') {
    return { rotOffset: [0, 0, 0], posOffset: [0, 0, 0] };
  }

  const t = elapsedSeconds * speedMultiplier;

  if (mode === 'idle') {
    const breath = Math.sin(t * 2.1);
    const slowLook = Math.sin(t * 0.9);
    switch (animRole) {
      case 'body':
        return { rotOffset: [breath * 1.5, 0, 0], posOffset: [0, breath * 0.25, 0] };
      case 'head':
        return { rotOffset: [breath * -2, slowLook * 7, 0], posOffset: [0, 0, 0] };
      case 'right_arm':
        return { rotOffset: [breath * 2.5, 0, -2.5 - Math.abs(breath) * 2], posOffset: [0, 0, 0] };
      case 'left_arm':
        return { rotOffset: [-breath * 2.5, 0, 2.5 + Math.abs(breath) * 2], posOffset: [0, 0, 0] };
      case 'cape':
        return { rotOffset: [4 + Math.sin(t * 2.4 - 0.6) * 4, 0, 0], posOffset: [0, 0, 0] };
      case 'wing_left':
        return { rotOffset: [0, -8 + breath * 10, breath * 5], posOffset: [0, 0, 0] };
      case 'wing_right':
        return { rotOffset: [0, 8 - breath * 10, -breath * 5], posOffset: [0, 0, 0] };
      case 'tail':
        return { rotOffset: [6 + breath * 3, Math.sin(t * 2.6) * 12, 0], posOffset: [0, 0, 0] };
      default:
        return { rotOffset: [0, 0, 0], posOffset: [0, 0, 0] };
    }
  }

  if (mode === 'walk') {
    const freq = t * 5.2;
    const swing = Math.sin(freq);
    const bounce = Math.abs(Math.cos(freq));
    switch (animRole) {
      case 'body':
        return { rotOffset: [3.5, swing * 3, 0], posOffset: [0, bounce * 0.65, 0] };
      case 'head':
        return { rotOffset: [-2, -swing * 2.5, 0], posOffset: [0, bounce * 0.2, 0] };
      case 'right_arm':
        return { rotOffset: [swing * 36, 0, -3], posOffset: [0, 0, 0] };
      case 'left_arm':
        return { rotOffset: [-swing * 36, 0, 3], posOffset: [0, 0, 0] };
      case 'right_leg':
        return { rotOffset: [-swing * 40, 0, 0], posOffset: [0, 0, 0] };
      case 'left_leg':
        return { rotOffset: [swing * 40, 0, 0], posOffset: [0, 0, 0] };
      case 'cape':
        return { rotOffset: [16 + Math.sin(freq * 2) * 7, swing * 4, 0], posOffset: [0, 0, 0] };
      case 'wing_left':
        return { rotOffset: [4, -14 + bounce * 14, 6], posOffset: [0, 0, 0] };
      case 'wing_right':
        return { rotOffset: [4, 14 - bounce * 14, -6], posOffset: [0, 0, 0] };
      case 'tail':
        return { rotOffset: [8, -swing * 18, 0], posOffset: [0, 0, 0] };
      default:
        return { rotOffset: [0, 0, 0], posOffset: [0, 0, 0] };
    }
  }

  const phase = (t * 0.9) % 1;
  let strikeCurve = 0;
  if (phase < 0.3) {
    strikeCurve = -(phase / 0.3);
  } else if (phase < 0.5) {
    const u = (phase - 0.3) / 0.2;
    strikeCurve = -1 + 2 * (1 - (1 - u) * (1 - u));
  } else {
    const u = (phase - 0.5) / 0.5;
    strikeCurve = 1 - u * u * (3 - 2 * u);
  }

  switch (animRole) {
    case 'body':
      return {
        rotOffset: [strikeCurve * 10, strikeCurve * 20, 0],
        posOffset: [0, 0, strikeCurve * 0.8],
      };
    case 'head':
      return { rotOffset: [strikeCurve * 4, -strikeCurve * 12, 0], posOffset: [0, 0, 0] };
    case 'right_arm':
      return {
        rotOffset: [
          strikeCurve < 0 ? strikeCurve * 115 : -115 + strikeCurve * 95,
          strikeCurve * 18,
          -8,
        ],
        posOffset: [0, 0, 0],
      };
    case 'left_arm':
      return { rotOffset: [-22 - strikeCurve * 16, -strikeCurve * 14, 10], posOffset: [0, 0, 0] };
    case 'right_leg':
      return { rotOffset: [-strikeCurve * 14, 0, 0], posOffset: [0, 0, 0] };
    case 'left_leg':
      return { rotOffset: [strikeCurve * 14, 0, 0], posOffset: [0, 0, 0] };
    case 'cape':
      return { rotOffset: [14 + Math.abs(strikeCurve) * 20, -strikeCurve * 10, 0], posOffset: [0, 0, 0] };
    case 'wing_left':
      return { rotOffset: [0, -18 - strikeCurve * 22, 10], posOffset: [0, 0, 0] };
    case 'wing_right':
      return { rotOffset: [0, 18 + strikeCurve * 22, -10], posOffset: [0, 0, 0] };
    case 'tail':
      return { rotOffset: [10, -strikeCurve * 24, 0], posOffset: [0, 0, 0] };
    default:
      return { rotOffset: [0, 0, 0], posOffset: [0, 0, 0] };
  }
}
