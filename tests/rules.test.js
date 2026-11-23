import test from 'node:test';
import assert from 'node:assert/strict';
import { canBuildFire, canCraftCanteen, canCraftStoneAxe, canCraftStonePickaxe, craftCanteen, craftStoneAxe, craftStonePickaxe, getGraphicsPreset, getMoveVector, isNearResource, isSurvivalStatLow, resolveMovement, resourceYield, startJump, stepJump } from '../src/rules.js';

test('fire recipe requires the ridge, materials, and an unlit fire', () => {
  assert.equal(canBuildFire({ wood: 3, stone: 2 }, false), false);
  assert.equal(canBuildFire({ wood: 3, stone: 1 }, true), false);
  assert.equal(canBuildFire({ wood: 3, stone: 2 }, true), true);
  assert.equal(canBuildFire({ wood: 3, stone: 2 }, true, true), false);
});

test('movement vector is normalized to prevent diagonal speed boosts', () => {
  assert.deepEqual(getMoveVector({ forward: true }), { x: 0, z: -1 });
  const diagonal = getMoveVector({ forward: true, right: true });
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-10);
  assert.deepEqual(getMoveVector({}), { x: 0, z: 0 });
});

test('resource interaction uses a bounded distance', () => {
  assert.equal(isNearResource(2.8), true);
  assert.equal(isNearResource(3), false);
  assert.equal(isNearResource(Number.NaN), false);
});

test('jump starts only on the ground and returns to the terrain', () => {
  const grounded = { height: 0, velocity: 0, onGround: true };
  let jump = startJump(grounded);
  assert.equal(jump.onGround, false);
  assert.ok(jump.velocity > 0);
  const midair = stepJump(jump, 0.2);
  assert.ok(midair.height > 0);
  assert.equal(startJump(midair), midair, 'cannot start a second jump in midair');
  for (let i = 0; i < 30 && !jump.onGround; i++) jump = stepJump(jump, 0.04);
  assert.deepEqual(jump, grounded);
});

test('graphics presets trade visual quality for performance', () => {
  assert.equal(getGraphicsPreset('low').shadows, false);
  assert.equal(getGraphicsPreset('balanced').shadows, true);
  assert.ok(getGraphicsPreset('high').pixelRatio > getGraphicsPreset('low').pixelRatio);
  assert.equal(getGraphicsPreset('unknown'), getGraphicsPreset('balanced'));
});

test('collision resolution stops at obstacles but allows sliding along them', () => {
  const obstacle = [{ x: 1, z: 0, radius: 0.5 }];
  assert.deepEqual(resolveMovement({ x: 0, z: 0 }, { x: 1, z: 0 }, obstacle), { x: 0, z: 0 });
  assert.deepEqual(resolveMovement({ x: 0, z: 0 }, { x: 1, z: 1 }, obstacle), { x: 0, z: 1 });
});

test('stone axe recipe consumes materials and improves wood gathering', () => {
  const inventory = { wood: 2, stone: 2 };
  assert.equal(canCraftStoneAxe(inventory), true);
  assert.deepEqual(craftStoneAxe(inventory), { wood: 0, stone: 0, crafted: true });
  assert.equal(canCraftStoneAxe({ wood: 20, stone: 20 }, true), false);
  assert.equal(craftStoneAxe({ wood: 1, stone: 2 }), null);
  assert.equal(resourceYield('wood', 'axe'), 2);
  assert.equal(resourceYield('stone', 'axe'), 1);
});

test('stone pickaxe recipe improves stone gathering only', () => {
  const inventory = { wood: 1, stone: 3 };
  assert.equal(canCraftStonePickaxe(inventory), true);
  assert.deepEqual(craftStonePickaxe(inventory), { wood: 0, stone: 0, crafted: true });
  assert.equal(canCraftStonePickaxe({ wood: 5, stone: 5 }, true), false);
  assert.equal(craftStonePickaxe({ wood: 0, stone: 3 }), null);
  assert.equal(resourceYield('stone', 'pickaxe'), 2);
  assert.equal(resourceYield('wood', 'pickaxe'), 1);
});

test('bark canteen recipe consumes wood and berries once', () => {
  const inventory = { wood: 3, berries: 2 };
  assert.equal(canCraftCanteen(inventory), true);
  assert.deepEqual(craftCanteen(inventory), { wood: 0, berries: 0, crafted: true });
  assert.equal(canCraftCanteen({ wood: 2, berries: 2 }), false);
  assert.equal(canCraftCanteen({ wood: 3, berries: 1 }), false);
  assert.equal(canCraftCanteen({ wood: 3, berries: 2 }, true), false);
  assert.equal(craftCanteen({ wood: 3, berries: 1 }), null);
});

test('survival HUD warning starts at 25 percent and ignores invalid values', () => {
  assert.equal(isSurvivalStatLow(25), true);
  assert.equal(isSurvivalStatLow(25.01), false);
  assert.equal(isSurvivalStatLow(0), true);
  assert.equal(isSurvivalStatLow(Number.NaN), false);
  assert.equal(isSurvivalStatLow(7, 7), true);
  assert.equal(isSurvivalStatLow(7.01, 7), false);
});