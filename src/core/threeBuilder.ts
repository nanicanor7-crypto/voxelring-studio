import * as THREE from 'three';
import type {
  CubeUVAllocation,
  FaceRect,
  PackedLayout,
  SelectionTarget,
  VoxelModelIR,
} from '../types/voxel';
import {
  makeCubeKey,
  packBoxUVs,
  paintAtlasPixels,
  resolveModelHierarchy,
} from './compiler';

export interface BuiltVoxelRig {
  rootObject: THREE.Group;
  boneGroups: Map<string, THREE.Group>;
  cubeMeshes: THREE.Mesh[];
  meshByKey: Map<string, THREE.Mesh>;
  atlasCanvas: HTMLCanvasElement;
  atlasDataUrl: string;
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  layout: PackedLayout;
  dispose: () => void;
}

function writeFaceUV(
  uvAttr: THREE.BufferAttribute,
  faceIndex: number,
  rect: FaceRect,
  texW: number,
  texH: number,
  flipVertical = false
) {
  const epsU = 0.002 / texW;
  const epsV = 0.002 / texH;

  const uLeft = rect.x / texW + epsU;
  const uRight = (rect.x + rect.w) / texW - epsU;

  let vTop = 1 - rect.y / texH - epsV;
  let vBottom = 1 - (rect.y + rect.h) / texH + epsV;

  if (flipVertical) {
    const tmp = vTop;
    vTop = vBottom;
    vBottom = tmp;
  }

  const base = faceIndex * 4;
  uvAttr.setXY(base + 0, uLeft, vTop);
  uvAttr.setXY(base + 1, uRight, vTop);
  uvAttr.setXY(base + 2, uLeft, vBottom);
  uvAttr.setXY(base + 3, uRight, vBottom);
}

export function applyBoxUVToGeometry(
  geometry: THREE.BoxGeometry,
  alloc: CubeUVAllocation,
  atlasWidth: number,
  atlasHeight: number
) {
  const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute;
  writeFaceUV(uvAttr, 0, alloc.faces.west, atlasWidth, atlasHeight, false);
  writeFaceUV(uvAttr, 1, alloc.faces.east, atlasWidth, atlasHeight, false);
  writeFaceUV(uvAttr, 2, alloc.faces.up, atlasWidth, atlasHeight, false);
  writeFaceUV(uvAttr, 3, alloc.faces.down, atlasWidth, atlasHeight, true);
  writeFaceUV(uvAttr, 4, alloc.faces.north, atlasWidth, atlasHeight, false);
  writeFaceUV(uvAttr, 5, alloc.faces.south, atlasWidth, atlasHeight, false);
  uvAttr.needsUpdate = true;
}

export function buildThreeVoxelRig(ir: VoxelModelIR): BuiltVoxelRig {
  const layout = packBoxUVs(ir);
  const pixels = paintAtlasPixels(ir, layout);

  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = layout.width;
  atlasCanvas.height = layout.height;
  const ctx = atlasCanvas.getContext('2d');
  if (ctx) {
    const imgData = new ImageData(new Uint8ClampedArray(pixels), layout.width, layout.height);
    ctx.putImageData(imgData, 0, 0);
  }
  const atlasDataUrl = atlasCanvas.toDataURL('image/png');

  const texture = new THREE.CanvasTexture(atlasCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.08,
    alphaTest: 0.5,
  });

  const rootObject = new THREE.Group();
  rootObject.name = `rig:${ir.modelName}`;

  const resolvedBones = resolveModelHierarchy(ir);
  const boneGroups = new Map<string, THREE.Group>();
  const cubeMeshes: THREE.Mesh[] = [];
  const meshByKey = new Map<string, THREE.Mesh>();
  const geometriesToDispose: THREE.BufferGeometry[] = [];

  for (const rb of resolvedBones) {
    const { bone } = rb;
    const group = new THREE.Group();
    group.name = bone.name;
    group.position.set(bone.pivotOffset[0], bone.pivotOffset[1], bone.pivotOffset[2]);
    group.rotation.set(
      THREE.MathUtils.degToRad(bone.bindRotation[0]),
      THREE.MathUtils.degToRad(bone.bindRotation[1]),
      THREE.MathUtils.degToRad(bone.bindRotation[2])
    );
    group.visible = bone.visible !== false;
    group.userData = {
      boneName: bone.name,
      animRole: bone.animRole,
      bindPosition: [...bone.pivotOffset],
      bindRotation: [...bone.bindRotation],
    };

    boneGroups.set(bone.name, group);

    const parentGroup = bone.parent ? boneGroups.get(bone.parent) : undefined;
    if (parentGroup) {
      parentGroup.add(group);
    } else {
      rootObject.add(group);
    }

    bone.cubes.forEach((cube, cubeIndex) => {
      const inf = cube.inflate || 0;
      const w = Math.max(0.05, cube.size[0] + inf * 2);
      const h = Math.max(0.05, cube.size[1] + inf * 2);
      const d = Math.max(0.05, cube.size[2] + inf * 2);

      const geom = new THREE.BoxGeometry(w, h, d);
      const key = makeCubeKey(bone.name, cubeIndex);
      const alloc = layout.byKey[key];
      if (alloc) {
        applyBoxUVToGeometry(geom, alloc, layout.width, layout.height);
      }
      geometriesToDispose.push(geom);

      const mesh = new THREE.Mesh(geom, material);
      mesh.name = cube.name;
      mesh.position.set(cube.localCenter[0], cube.localCenter[1], cube.localCenter[2]);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(cube.rotation[0]),
        THREE.MathUtils.degToRad(cube.rotation[1]),
        THREE.MathUtils.degToRad(cube.rotation[2])
      );
      mesh.visible = cube.visible !== false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        isVoxelCube: true,
        boneName: bone.name,
        cubeIndex,
        cubeName: cube.name,
        uvKey: key,
      };

      group.add(mesh);
      cubeMeshes.push(mesh);
      meshByKey.set(key, mesh);
    });
  }

  const dispose = () => {
    for (const g of geometriesToDispose) {
      g.dispose();
    }
    material.dispose();
    texture.dispose();
  };

  return {
    rootObject,
    boneGroups,
    cubeMeshes,
    meshByKey,
    atlasCanvas,
    atlasDataUrl,
    texture,
    material,
    layout,
    dispose,
  };
}

export function buildSelectionOverlay(
  rig: BuiltVoxelRig,
  selection: SelectionTarget
): { cleanup: () => void } {
  const disposables: Array<{ dispose: () => void }> = [];
  const attachedObjects: THREE.Object3D[] = [];

  if (!selection) {
    return { cleanup: () => {} };
  }

  const addCubeWireframe = (mesh: THREE.Mesh, colorHex: number) => {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 15);
    const lineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    wire.scale.setScalar(1.012);
    wire.renderOrder = 999;
    mesh.add(wire);
    disposables.push(edges, lineMat);
    attachedObjects.push(wire);
  };

  const addPivotMarker = (boneGroup: THREE.Group) => {
    const pivotGroup = new THREE.Group();
    pivotGroup.renderOrder = 1000;

    const sphereGeo = new THREE.OctahedronGeometry(0.65, 0);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const marker = new THREE.Mesh(sphereGeo, sphereMat);
    marker.renderOrder = 1001;
    pivotGroup.add(marker);
    disposables.push(sphereGeo, sphereMat);

    const axisLen = 3.2;
    const makeAxis = (to: [number, number, number], col: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(to[0], to[1], to[2]),
      ]);
      const m = new THREE.LineBasicMaterial({ color: col, depthTest: false });
      const line = new THREE.Line(g, m);
      line.renderOrder = 1001;
      pivotGroup.add(line);
      disposables.push(g, m);
    };
    makeAxis([axisLen, 0, 0], 0xef4444);
    makeAxis([0, axisLen, 0], 0x22c55e);
    makeAxis([0, 0, axisLen], 0x38bdf8);

    boneGroup.add(pivotGroup);
    attachedObjects.push(pivotGroup);
  };

  if (selection.type === 'cube') {
    const key = makeCubeKey(selection.boneName, selection.cubeIndex);
    const mesh = rig.meshByKey.get(key);
    if (mesh) {
      addCubeWireframe(mesh, 0xf59e0b);
    }
    const bg = rig.boneGroups.get(selection.boneName);
    if (bg) {
      addPivotMarker(bg);
    }
  } else if (selection.type === 'bone') {
    const bg = rig.boneGroups.get(selection.boneName);
    if (bg) {
      addPivotMarker(bg);
      for (const child of bg.children) {
        if ((child as THREE.Mesh).isMesh && child.userData?.isVoxelCube) {
          addCubeWireframe(child as THREE.Mesh, 0x38bdf8);
        }
      }
    }
  }

  return {
    cleanup: () => {
      for (const obj of attachedObjects) {
        obj.parent?.remove(obj);
      }
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
