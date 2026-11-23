export const FIRE_RECIPE = Object.freeze({ wood: 3, stone: 2 });
export const STONE_AXE_RECIPE = Object.freeze({ wood: 2, stone: 2 });
export const STONE_PICKAXE_RECIPE = Object.freeze({ wood: 1, stone: 3 });
export const BARK_CANTEEN_RECIPE = Object.freeze({ wood: 3, berries: 2 });
export const INTERACT_DISTANCE = 2.8;
export const JUMP_IMPULSE = 8.4;
export const GRAVITY = 22;
const GRAPHICS_PRESETS = Object.freeze({
  low: Object.freeze({ pixelRatio: 1, shadows: false, shadowMapSize: 512, fogDensity: 0.0095 }),
  balanced: Object.freeze({ pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, fogDensity: 0.0085 }),
  high: Object.freeze({ pixelRatio: 2, shadows: true, shadowMapSize: 2048, fogDensity: 0.007 }),
});

export function canBuildFire(inventory, atRidge, fireLit = false) {
  return !fireLit && atRidge && inventory.wood >= FIRE_RECIPE.wood && inventory.stone >= FIRE_RECIPE.stone;
}

export function canCraftStoneAxe(inventory, alreadyCrafted = false) {
  return !alreadyCrafted && inventory.wood >= STONE_AXE_RECIPE.wood && inventory.stone >= STONE_AXE_RECIPE.stone;
}

export function craftStoneAxe(inventory, alreadyCrafted = false) {
  if (!canCraftStoneAxe(inventory, alreadyCrafted)) return null;
  return { wood: inventory.wood - STONE_AXE_RECIPE.wood, stone: inventory.stone - STONE_AXE_RECIPE.stone, crafted: true };
}

export function canCraftStonePickaxe(inventory, alreadyCrafted = false) {
  return !alreadyCrafted && inventory.wood >= STONE_PICKAXE_RECIPE.wood && inventory.stone >= STONE_PICKAXE_RECIPE.stone;
}

export function craftStonePickaxe(inventory, alreadyCrafted = false) {
  if (!canCraftStonePickaxe(inventory, alreadyCrafted)) return null;
  return { wood: inventory.wood - STONE_PICKAXE_RECIPE.wood, stone: inventory.stone - STONE_PICKAXE_RECIPE.stone, crafted: true };
}

export function canCraftCanteen(inventory, alreadyCrafted = false) {
  return !alreadyCrafted && inventory.wood >= BARK_CANTEEN_RECIPE.wood && inventory.berries >= BARK_CANTEEN_RECIPE.berries;
}

export function craftCanteen(inventory, alreadyCrafted = false) {
  if (!canCraftCanteen(inventory, alreadyCrafted)) return null;
  return { wood: inventory.wood - BARK_CANTEEN_RECIPE.wood, berries: inventory.berries - BARK_CANTEEN_RECIPE.berries, crafted: true };
}

export function resourceYield(type, equippedTool = null) {
  return (type === 'wood' && equippedTool === 'axe') || (type === 'stone' && equippedTool === 'pickaxe') ? 2 : 1;
}

export function isSurvivalStatLow(value, threshold = 25) {
  return Number.isFinite(value) && value <= threshold;
}

export function getMoveVector(input) {
  const x = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const z = Number(Boolean(input.backward)) - Number(Boolean(input.forward));
  const length = Math.hypot(x, z);
  return length ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

export function isNearResource(distance, radius = INTERACT_DISTANCE) {
  return Number.isFinite(distance) && distance <= radius;
}

export function startJump(jump, impulse = JUMP_IMPULSE) {
  return jump.onGround ? { height: 0, velocity: impulse, onGround: false } : jump;
}

export function stepJump(jump, deltaSeconds, gravity = GRAVITY) {
  if (jump.onGround || deltaSeconds <= 0) return jump;
  const velocity = jump.velocity - gravity * deltaSeconds;
  const height = jump.height + velocity * deltaSeconds;
  return height <= 0 ? { height: 0, velocity: 0, onGround: true } : { height, velocity, onGround: false };
}

export function getGraphicsPreset(name) {
  return GRAPHICS_PRESETS[name] || GRAPHICS_PRESETS.balanced;
}

export function resolveMovement(current, proposed, obstacles, playerRadius = 0.42) {
  let x = current.x, z = current.z;
  const blockedAt = (candidateX, candidateZ) => obstacles.some(obstacle =>
    Math.hypot(candidateX - obstacle.x, candidateZ - obstacle.z) < obstacle.radius + playerRadius);
  if (!blockedAt(proposed.x, z)) x = proposed.x;
  if (!blockedAt(x, proposed.z)) z = proposed.z;
  return { x, z };
}
export function getInventoryShortcutAction(key, repeat = false) {
  if (repeat) return null;
  return String(key).toLowerCase() === 'c' ? 'craft' : null;
}

export function getSignalFireObjective(inventory, atRidge, fireLit = false) {
  if (fireLit) return 'Signal fire lit! Smoke marks your way out of the valley.';
  const wood = Math.max(0, Math.floor(Number.isFinite(inventory?.wood) ? inventory.wood : 0));
  const stone = Math.max(0, Math.floor(Number.isFinite(inventory?.stone) ? inventory.stone : 0));
  if (atRidge && canBuildFire({ wood, stone }, true)) return 'Press E to light the signal fire.';
  if (atRidge) return `At ridge · gather ${Math.max(0, 3 - wood)} wood and ${Math.max(0, 2 - stone)} stone, then press E.`;
  return `Gather wood (${Math.min(wood, 3)}/3) and stone (${Math.min(stone, 2)}/2), then reach the ridge and press E to light the signal fire.`;
}
