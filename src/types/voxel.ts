export type Vec3 = [number, number, number];

export type AnimRole =
  | 'none'
  | 'head'
  | 'body'
  | 'left_arm'
  | 'right_arm'
  | 'left_leg'
  | 'right_leg'
  | 'cape'
  | 'wing_left'
  | 'wing_right'
  | 'tail';

export type CubePattern =
  | 'solid'
  | 'shaded_bevel'
  | 'noise'
  | 'armor_trim'
  | 'face_eyes'
  | 'stripes';

export type AnimationMode = 'static' | 'idle' | 'walk' | 'attack';

export interface VoxelCube {
  name: string;
  localCenter: Vec3;
  size: Vec3;
  rotation: Vec3;
  inflate: number;
  primaryColor: string;
  secondaryColor: string;
  pattern: CubePattern;
  visible?: boolean;
}

export interface VoxelBone {
  name: string;
  parent: string | null;
  pivotOffset: Vec3;
  bindRotation: Vec3;
  animRole: AnimRole;
  cubes: VoxelCube[];
  visible?: boolean;
}

export interface VoxelModelIR {
  modelName: string;
  bones: VoxelBone[];
}

export type SelectionTarget =
  | { type: 'bone'; boneName: string }
  | { type: 'cube'; boneName: string; cubeIndex: number }
  | null;

export interface FaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CubeUVAllocation {
  key: string;
  boneName: string;
  cubeIndex: number;
  cubeName: string;
  u0: number;
  v0: number;
  boxW: number;
  boxH: number;
  texW: number;
  texH: number;
  texD: number;
  faces: {
    up: FaceRect;
    down: FaceRect;
    east: FaceRect;
    west: FaceRect;
    north: FaceRect;
    south: FaceRect;
  };
}

export interface PackedLayout {
  width: number;
  height: number;
  allocations: CubeUVAllocation[];
  byKey: Record<string, CubeUVAllocation>;
}

export interface ResolvedCube {
  cube: VoxelCube;
  cubeIndex: number;
  boneName: string;
  globalCenter: Vec3;
  uvKey: string;
}

export interface ResolvedBone {
  bone: VoxelBone;
  globalPivot: Vec3;
  depth: number;
  childrenNames: string[];
  resolvedCubes: ResolvedCube[];
}

export interface BedrockCubeJson {
  origin: Vec3;
  size: Vec3;
  uv: [number, number];
  inflate?: number;
  pivot?: Vec3;
  rotation?: Vec3;
}

export interface BedrockBoneJson {
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation?: Vec3;
  cubes?: BedrockCubeJson[];
}

export interface BedrockGeoJson {
  format_version: '1.12.0';
  'minecraft:geometry': Array<{
    description: {
      identifier: string;
      texture_width: number;
      texture_height: number;
      visible_bounds_width: number;
      visible_bounds_height: number;
      visible_bounds_offset: Vec3;
    };
    bones: BedrockBoneJson[];
  }>;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  model: VoxelModelIR;
}
