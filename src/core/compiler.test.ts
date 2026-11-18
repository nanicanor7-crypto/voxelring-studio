import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileToBedrockGeoJson,
  computeProceduralPose,
  mergeSubtreeMutation,
  packBoxUVs,
  paintAtlasPixels,
  resolveModelHierarchy,
} from './compiler';
import { CLASSIC_HUMANOID_MODEL, OBSIDIAN_VANGUARD_MODEL } from './presets';

test('resolveModelHierarchy computes exact Minecraft humanoid pivots without floating gaps', () => {
  const resolved = resolveModelHierarchy(CLASSIC_HUMANOID_MODEL);
  const byName = new Map(resolved.map((r) => [r.bone.name, r]));

  assert.deepEqual(byName.get('root')?.globalPivot, [0, 0, 0]);
  assert.deepEqual(byName.get('waist')?.globalPivot, [0, 12, 0]);
  assert.deepEqual(byName.get('body')?.globalPivot, [0, 12, 0]);
  assert.deepEqual(byName.get('head')?.globalPivot, [0, 24, 0]);
  assert.deepEqual(byName.get('rightLeg')?.globalPivot, [-2, 12, 0]);
  assert.deepEqual(byName.get('leftLeg')?.globalPivot, [2, 12, 0]);

  const rightLegCube = byName.get('rightLeg')?.resolvedCubes[0];
  assert.ok(rightLegCube);
  assert.equal(rightLegCube.globalCenter[1] - rightLegCube.cube.size[1] / 2, 0);
  assert.equal(rightLegCube.globalCenter[1] + rightLegCube.cube.size[1] / 2, 12);

  const headCube = byName.get('head')?.resolvedCubes[0];
  assert.ok(headCube);
  assert.equal(headCube.globalCenter[1] - headCube.cube.size[1] / 2, 24);
  assert.equal(headCube.globalCenter[1] + headCube.cube.size[1] / 2, 32);
});

test('packBoxUVs allocates non-overlapping power-of-2 Box UV islands', () => {
  const layout = packBoxUVs(OBSIDIAN_VANGUARD_MODEL);

  assert.ok([64, 128, 256, 512].includes(layout.width));
  assert.equal(layout.width, layout.height);
  assert.ok(layout.allocations.length >= 15);

  for (let i = 0; i < layout.allocations.length; i++) {
    const a = layout.allocations[i];
    assert.ok(a.u0 >= 0 && a.v0 >= 0);
    assert.ok(a.u0 + a.boxW <= layout.width);
    assert.ok(a.v0 + a.boxH <= layout.height);
    assert.equal(a.boxW, 2 * a.texD + 2 * a.texW);
    assert.equal(a.boxH, a.texD + a.texH);

    for (let j = i + 1; j < layout.allocations.length; j++) {
      const b = layout.allocations[j];
      const overlaps =
        a.u0 < b.u0 + b.boxW &&
        a.u0 + a.boxW > b.u0 &&
        a.v0 < b.v0 + b.boxH &&
        a.v0 + a.boxH > b.v0;
      assert.equal(overlaps, false, `UV overlap between ${a.cubeName} and ${b.cubeName}`);
    }
  }
});

test('paintAtlasPixels paints opaque pixel-art faces and face_eyes details on front face', () => {
  const layout = packBoxUVs(CLASSIC_HUMANOID_MODEL);
  const pixels = paintAtlasPixels(CLASSIC_HUMANOID_MODEL, layout);

  assert.equal(pixels.length, layout.width * layout.height * 4);

  const headAlloc = layout.allocations.find((a) => a.cubeName === 'head_cube');
  assert.ok(headAlloc);

  const { north } = headAlloc.faces;
  const distinctColors = new Set<string>();
  for (let y = north.y; y < north.y + north.h; y++) {
    for (let x = north.x; x < north.x + north.w; x++) {
      const idx = (y * layout.width + x) * 4;
      assert.equal(pixels[idx + 3], 255);
      distinctColors.add(`${pixels[idx]},${pixels[idx + 1]},${pixels[idx + 2]}`);
    }
  }
  assert.ok(distinctColors.size >= 4);
});

test('compileToBedrockGeoJson outputs valid format_version 1.12.0 geometry with global origins', () => {
  const geo = compileToBedrockGeoJson(CLASSIC_HUMANOID_MODEL);
  assert.equal(geo.format_version, '1.12.0');
  assert.equal(geo['minecraft:geometry'].length, 1);

  const entry = geo['minecraft:geometry'][0];
  assert.equal(entry.description.identifier, 'geometry.humanoid_standard_16px');
  assert.ok(entry.description.texture_width >= 64);

  const headBone = entry.bones.find((b) => b.name === 'head');
  assert.ok(headBone);
  assert.equal(headBone.parent, 'body');
  assert.deepEqual(headBone.pivot, [0, 24, 0]);
  assert.deepEqual(headBone.cubes?.[0].origin, [-4, 24, -4]);
  assert.deepEqual(headBone.cubes?.[0].size, [8, 8, 8]);
  assert.equal(headBone.cubes?.[1].inflate, 0.35);
});

test('mergeSubtreeMutation updates only targetBone subtree and leaves other bones untouched', () => {
  const mutated = mergeSubtreeMutation(CLASSIC_HUMANOID_MODEL, 'rightArm', [
    {
      name: 'rightArm',
      parent: 'body',
      pivotOffset: [-6, 11, 0],
      bindRotation: [0, 0, 0],
      animRole: 'right_arm',
      cubes: [
        {
          name: 'mech_arm_upper',
          localCenter: [0, -3, 0],
          size: [5, 6, 5],
          rotation: [0, 0, 0],
          inflate: 0.25,
          primaryColor: '#f59e0b',
          secondaryColor: '#0ea5e9',
          pattern: 'armor_trim',
        },
      ],
    },
    {
      name: 'rightForearmClaw',
      parent: 'rightArm',
      pivotOffset: [0, -6, 0],
      bindRotation: [-15, 0, 0],
      animRole: 'none',
      cubes: [
        {
          name: 'claw_pincer',
          localCenter: [0, -3, 1],
          size: [4, 6, 4],
          rotation: [0, 0, 0],
          inflate: 0,
          primaryColor: '#38bdf8',
          secondaryColor: '#f8fafc',
          pattern: 'shaded_bevel',
        },
      ],
    },
  ]);

  const origHead = CLASSIC_HUMANOID_MODEL.bones.find((b) => b.name === 'head');
  const newHead = mutated.bones.find((b) => b.name === 'head');
  assert.deepEqual(newHead?.cubes[0].name, origHead?.cubes[0].name);
  assert.deepEqual(newHead?.pivotOffset, origHead?.pivotOffset);

  const updatedArm = mutated.bones.find((b) => b.name === 'rightArm');
  const childClaw = mutated.bones.find((b) => b.name === 'rightForearmClaw');
  assert.equal(updatedArm?.cubes[0].name, 'mech_arm_upper');
  assert.equal(childClaw?.parent, 'rightArm');
});

test('computeProceduralPose opposes limbs during walk and stays zero in static mode', () => {
  const staticPose = computeProceduralPose('right_arm', 'static', 1.5);
  assert.deepEqual(staticPose.rotOffset, [0, 0, 0]);

  const rightWalk = computeProceduralPose('right_arm', 'walk', 0.3);
  const leftWalk = computeProceduralPose('left_arm', 'walk', 0.3);
  assert.equal(rightWalk.rotOffset[0], -leftWalk.rotOffset[0]);
  assert.notEqual(rightWalk.rotOffset[0], 0);
});
