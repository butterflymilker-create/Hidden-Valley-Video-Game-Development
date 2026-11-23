import * as THREE from 'three';
import './style.css';
import { canBuildFire, canCraftCanteen, canCraftStoneAxe, canCraftStonePickaxe, craftCanteen, craftStoneAxe, craftStonePickaxe, getGraphicsPreset, getInventoryShortcutAction, getMoveVector, getSignalFireObjective, INTERACT_DISTANCE, isNearResource, isSurvivalStatLow, resolveMovement, resourceYield, startJump, stepJump } from './rules.js';

const canvas = document.querySelector('#scene');
const mapCanvas = document.querySelector('#minimap');
const map = mapCanvas.getContext('2d');
const toast = document.querySelector('#toast');
const startOverlay = document.querySelector('#start');
const STORAGE_KEY = 'lost-valley-three-v1';
const SETTINGS_KEY = 'lost-valley-three-settings-v1';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9caeaa');
scene.fog = new THREE.FogExp2('#aab5a7', 0.0085);
const skyNightColor = new THREE.Color('#1b2b38');
const skyDayColor = new THREE.Color('#9caeaa');
const fogDayColor = new THREE.Color('#aab5a7');
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);
const hemi = new THREE.HemisphereLight('#e2edee', '#59644b', 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe1ae', 2.2);
sun.position.set(-32, 55, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -72; sun.shadow.camera.right = 72;
sun.shadow.camera.top = 72; sun.shadow.camera.bottom = -72;
sun.shadow.bias = -0.00035;
scene.add(sun);

const state = {
  x: 0, z: 30, yaw: 0, pitch: 0, wood: 0, stone: 0,
  stamina: 100, health: 100, hunger: 100, hydration: 100, berries: 0, canteen: false, canteenFilled: false,
  worldTime: 16 * 60 * 60, temperature: 20, shelter: null,
  fireLit: false, axe: false, pickaxe: false, equippedTool: null, keys: new Set(),
  jump: { height: 0, velocity: 0, onGround: true },
};
const resources = [];
const solids = [];
const depleted = new Set();
const resourceRaycaster = new THREE.Raycaster();
const reticleCenter = new THREE.Vector2(0, 0);
let ridgeFire = null;
let shelterObject = null;
let rainPoints = null;
let heldTools = {};
let swingTimer = 0;
let crouchBlend = 0;
let crouched = false;
let wasLocked = false;
let unlockForInventory = false;
let pointerLockFailed = false;
let dead = false;
let swimming = false;
let coldWarningShown = false;
let playing = false;
let dragging = false;
let lastMouse = { x: 0, y: 0 };
let previousTime = performance.now();
let saveClock = 0;
let hudClock = 0;
let toastTimer;
let activeGraphics = 'balanced';
const ridge = { x: 27, z: -47 };
const valleyEntrance = { x: 0, z: 30 };
let respawnPoint = { ...valleyEntrance };

function riverCenterX(z) {
  return 5 + 8 * Math.sin((z + 12) * 0.055);
}

function terrainHeight(x, z) {
  const hill = (cx, cz, height, spread) => height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / spread);
  const rollingGround = Math.sin(x * 0.115 + z * 0.045) * Math.cos(z * 0.095) * 0.42;
  const ridges = hill(-58, -12, 4.5, 760) + hill(55, 36, 4.2, 830) + hill(-7, -36, 2.4, 410);
  const mountains = hill(-54, -40, 7, 1800) + hill(-54, -40, 19, 800)
    + hill(54, -40, 7, 1800) + hill(54, -40, 19, 800);
  const naturalHeight = hill(-38, -15, 7.5, 520) + hill(42, -5, 9, 600) + hill(15, -54, 14, 300) + hill(-50, 52, 3.5, 380) + ridges + mountains + rollingGround - 0.8;
  const riverSlope = 8 * 0.055 * Math.cos((z + 12) * 0.055);
  const riverDistance = (x - riverCenterX(z)) * Math.sqrt(1 + riverSlope * riverSlope);
  const valleyBasin = 2.15 * Math.exp(-(riverDistance ** 2) / 48);
  const channelCut = 1.55 * (1 - THREE.MathUtils.smoothstep(Math.abs(riverDistance), 0.75, 1.35));
  return naturalHeight - valleyBasin - channelCut;
}

function riverHalfWidth(z) {
  const t = THREE.MathUtils.clamp((70 - z) / 145, 0, 1);
  return 1.2 + Math.sin(t * Math.PI) * 0.35;
}

function riverSurfaceHeight(z) {
  const x = riverCenterX(z);
  return terrainHeight(x, z) + 1.45;
}

function isInShoulderDeepWater(x, z) {
  if (z < -75 || z > 70) return false;
  const slope = 8 * 0.055 * Math.cos((z + 12) * 0.055);
  const lateralDistance = Math.abs(x - riverCenterX(z)) * Math.sqrt(1 + slope * slope);
  if (lateralDistance > riverHalfWidth(z)) return false;
  return riverSurfaceHeight(z) - terrainHeight(x, z) >= 1.2;
}

function setGraphicsQuality(name, persist = true) {
  const quality = ['low', 'balanced', 'high'].includes(name) ? name : 'balanced';
  const preset = getGraphicsPreset(quality);
  activeGraphics = quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = preset.shadows;
  sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  sun.shadow.needsUpdate = true;
  scene.fog.density = preset.fogDensity;
  document.querySelector('#qualitySelect').value = quality;
  if (persist) { try { localStorage.setItem(SETTINGS_KEY, quality); } catch { /* Keep the setting for this session. */ } }
}

function loadGraphicsQuality() {
  let quality = 'balanced';
  try { quality = localStorage.getItem(SETTINGS_KEY) || quality; } catch { /* Use the default setting. */ }
  setGraphicsQuality(quality, false);
}

function createTerrain() {
  const geometry = new THREE.PlaneGeometry(150, 150, 192, 192);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const valleyColor = new THREE.Color('#657951');
  const highlandColor = new THREE.Color('#777a70');
  const vertexColor = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const height = terrainHeight(x, z);
    position.setY(i, height);
    vertexColor.copy(valleyColor).lerp(highlandColor, THREE.MathUtils.clamp((height - 7) / 11, 0, 1));
    colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

}

function createCreek() {
  const verts = [], indices = [];
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, z = 70 - t * 145;
    const x = riverCenterX(z);
    const tangent = new THREE.Vector2(8 * 0.055 * Math.cos((z + 12) * 0.055), 1).normalize();
    const px = tangent.y, pz = -tangent.x;
    const width = riverHalfWidth(z);
    const y = riverSurfaceHeight(z);
    verts.push(x + px * width, y, z + pz * width, x - px * width, y, z - pz * width);
    if (i < steps) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(indices); g.computeVertexNormals();
  const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#72918d', roughness: 0.25, metalness: 0.08, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  scene.add(water);

  const sandMaterial = new THREE.MeshStandardMaterial({ color: '#b5a17b', roughness: 1, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const bankVerts = [], bankIndices = [];
    const bankSteps = 220;
    for (let i = 0; i <= bankSteps; i++) {
      const t = i / bankSteps, bankZ = 70 - t * 145;
      const centerX = riverCenterX(bankZ);
      const tangent = new THREE.Vector2(8 * 0.055 * Math.cos((bankZ + 12) * 0.055), 1).normalize();
      const px = tangent.y, pz = -tangent.x;
      const inner = 1.42 + 0.08 * Math.sin(t * 31 + side);
      const outer = 2.65 + 0.32 * Math.sin(t * 17 + side * 1.7) + 0.14 * Math.sin(t * 43);
      for (const offset of [inner, outer]) {
        const bx = centerX + px * offset * side;
        const bz = bankZ + pz * offset * side;
        bankVerts.push(bx, terrainHeight(bx, bz) + 0.035, bz);
      }
      if (i < bankSteps) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        bankIndices.push(a, c, b, b, c, d);
      }
    }
    const bankGeometry = new THREE.BufferGeometry();
    bankGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bankVerts, 3));
    bankGeometry.setIndex(bankIndices);
    bankGeometry.computeVertexNormals();
    const bank = new THREE.Mesh(bankGeometry, sandMaterial);
    bank.receiveShadow = true;
    scene.add(bank);
  }
}

function seededRandom(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
const random = seededRandom(77031);

const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.29, 2.25, 6);
const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#554537', roughness: 1 });
const canopyGeometries = [new THREE.ConeGeometry(1.22, 2.55, 7), new THREE.ConeGeometry(0.94, 2.2, 7), new THREE.ConeGeometry(0.65, 1.8, 7)];
const canopyMaterials = [new THREE.MeshStandardMaterial({ color: '#294936', roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#3f6143', roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#58764b', roughness: 1 })];
const rockGeometry = new THREE.DodecahedronGeometry(0.85, 0);
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#999b8b', roughness: 0.96, flatShading: true });
const berryLeafMaterial = new THREE.MeshStandardMaterial({ color: '#486b43', roughness: 1, flatShading: true });
const berryFruitMaterial = new THREE.MeshStandardMaterial({ color: '#ad4c55', roughness: 0.72 });

function makeTree(x, z, id, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.12 * scale; trunk.scale.setScalar(scale); trunk.castShadow = true;
  group.add(trunk);
  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(canopyGeometries[i], canopyMaterials[i]);
    crown.position.y = (2.35 + i * 0.66) * scale;
    crown.scale.setScalar(scale * (1 + (random() - 0.5) * 0.13));
    crown.castShadow = true; group.add(crown);
  }
  group.userData = { resourceType: 'wood', resourceId: id };
  scene.add(group); resources.push(group); solids.push({ x, z, radius: 0.85 * scale, group });
}

function makeRock(x, z, id, scale = 1) {
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  rock.position.set(x, terrainHeight(x, z) + 0.48 * scale, z);
  rock.scale.set(scale * 1.15, scale * 0.72, scale);
  rock.rotation.set(random() * 0.2, random() * Math.PI, random() * 0.1);
  rock.castShadow = true; rock.receiveShadow = true;
  rock.userData = { resourceType: 'stone', resourceId: id };
  scene.add(rock); resources.push(rock); solids.push({ x, z, radius: 0.75 * scale, group: rock });
}

function makeBerryBush(x, z, id, scale = 1) {
  const bush = new THREE.Group();
  bush.position.set(x, terrainHeight(x, z), z);
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), berryLeafMaterial);
    const angle = i * Math.PI / 2;
    leaf.position.set(Math.cos(angle) * 0.24, 0.34 + (i % 2) * 0.16, Math.sin(angle) * 0.24);
    leaf.scale.set(1, 0.82, 1); leaf.castShadow = true; bush.add(leaf);
  }
  for (let i = 0; i < 5; i++) {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), berryFruitMaterial);
    const angle = i * Math.PI * 2 / 5;
    berry.position.set(Math.cos(angle) * 0.27, 0.58 + (i % 2) * 0.14, Math.sin(angle) * 0.27);
    berry.castShadow = true; bush.add(berry);
  }
  bush.scale.setScalar(scale);
  bush.userData = { resourceType: 'berry', resourceId: id };
  scene.add(bush); resources.push(bush);
}

function makeRidgeMarker() {
  const marker = new THREE.Group();
  marker.position.set(ridge.x, terrainHeight(ridge.x, ridge.z), ridge.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.4, 6), trunkMaterial);
  pole.position.y = 2.2; pole.castShadow = true; marker.add(pole);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 3), new THREE.MeshStandardMaterial({ color: '#c77d4f', roughness: 0.9 }));
  flag.position.set(0.6, 3.3, 0); flag.rotation.z = -Math.PI / 2; marker.add(flag);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 0.65, 8), new THREE.MeshStandardMaterial({ color: '#77796c', roughness: 1 }));
  base.position.y = 0.2; base.castShadow = true; base.receiveShadow = true; marker.add(base);
  scene.add(marker);
}

function generateWorld() {
  createTerrain(); createCreek(); makeRidgeMarker();
  let id = 0;
  for (let i = 0; i < 88; i++) {
    const x = (random() - 0.5) * 118, z = (random() - 0.5) * 128;
    const creekX = 5 + 8 * Math.sin((z + 12) * 0.055);
    if (Math.hypot(x, z - 30) < 8 || Math.hypot(x - ridge.x, z - ridge.z) < 7 || Math.abs(x - creekX) < 3.4) continue;
    makeTree(x, z, id++, 0.72 + random() * 0.58);
  }
  for (let i = 0; i < 42; i++) {
    const x = (random() - 0.5) * 112, z = (random() - 0.5) * 120;
    const creekX = 5 + 8 * Math.sin((z + 12) * 0.055);
    if (Math.hypot(x, z - 30) < 7 || Math.hypot(x - ridge.x, z - ridge.z) < 6 || Math.abs(x - creekX) < 3) continue;
    makeRock(x, z, id++, 0.5 + random() * 0.72);
  }
  makeBerryBush(-5, 20, id++);
  for (let i = 0; i < 22; i++) {
    const x = (random() - 0.5) * 112, z = (random() - 0.5) * 120;
    const creekX = 5 + 8 * Math.sin((z + 12) * 0.055);
    if (Math.hypot(x, z - 30) < 5 || Math.hypot(x - ridge.x, z - ridge.z) < 5 || Math.abs(x - creekX) < 2.6) continue;
    makeBerryBush(x, z, id++, 0.85 + random() * 0.35);
  }
}

function restoreSave() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data || data.version !== 1) return;
    if (Number.isFinite(data.x) && Number.isFinite(data.z)) { state.x = data.x; state.z = data.z; }
    if (Number.isFinite(data.wood)) state.wood = Math.max(0, data.wood);
    if (Number.isFinite(data.stone)) state.stone = Math.max(0, data.stone);
    if (Number.isFinite(data.stamina)) state.stamina = THREE.MathUtils.clamp(data.stamina, 0, 100);
    if (Number.isFinite(data.health)) state.health = THREE.MathUtils.clamp(data.health, 0, 100);
    if (Number.isFinite(data.hunger)) state.hunger = THREE.MathUtils.clamp(data.hunger, 0, 100);
    if (Number.isFinite(data.hydration)) state.hydration = THREE.MathUtils.clamp(data.hydration, 0, 100);
    if (Number.isFinite(data.berries)) state.berries = Math.max(0, Math.floor(data.berries));
    state.canteen = Boolean(data.canteen);
    state.canteenFilled = state.canteen && Boolean(data.canteenFilled);
    if (Number.isFinite(data.worldTime)) state.worldTime = Math.max(0, data.worldTime);
    if (Number.isFinite(data.temperature)) state.temperature = THREE.MathUtils.clamp(data.temperature, -10, 35);
    if (data.shelter && Number.isFinite(data.shelter.x) && Number.isFinite(data.shelter.z)) {
      state.shelter = { x: data.shelter.x, z: data.shelter.z, yaw: Number.isFinite(data.shelter.yaw) ? data.shelter.yaw : 0 };
    }
    state.fireLit = Boolean(data.fireLit);
    respawnPoint = Number.isFinite(data.respawnPoint?.x) && Number.isFinite(data.respawnPoint?.z)
      ? { x: data.respawnPoint.x, z: data.respawnPoint.z }
      : state.fireLit ? { x: ridge.x + 4, z: ridge.z + 3 } : { ...valleyEntrance };
    state.axe = Boolean(data.axe);
    state.pickaxe = Boolean(data.pickaxe);
    state.equippedTool = data.equippedTool === 'axe' && state.axe ? 'axe'
      : data.equippedTool === 'pickaxe' && state.pickaxe ? 'pickaxe'
        : data.axeEquipped && state.axe ? 'axe' : null;
    const savedDepleted = new Set(Array.isArray(data.depleted) ? data.depleted : []);
    for (const object of [...resources]) if (savedDepleted.has(object.userData.resourceId)) removeResource(object);
    if (state.fireLit) addSignalFire();
    if (state.shelter) addShelterModel(state.shelter.x, state.shelter.z, state.shelter.yaw);
    toastMessage('Previous run restored.');
  } catch { /* Storage can be disabled by browser privacy settings. */ }
}

function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, x: state.x, z: state.z, wood: state.wood, stone: state.stone,
      stamina: state.stamina, health: state.health, hunger: state.hunger, hydration: state.hydration,
      berries: state.berries, canteen: state.canteen, canteenFilled: state.canteenFilled,
      worldTime: state.worldTime, temperature: state.temperature, shelter: state.shelter, respawnPoint,
      fireLit: state.fireLit, axe: state.axe, pickaxe: state.pickaxe, equippedTool: state.equippedTool,
      depleted: [...depleted],
    }));
  } catch { /* The game remains playable when storage is unavailable. */ }
}

function createHeldTools() {
  const woodMaterial = new THREE.MeshStandardMaterial({ color: '#684d35', roughness: 0.95 });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: '#a8aaa0', roughness: 0.88, flatShading: true });
  const handleGeometry = new THREE.CylinderGeometry(0.025, 0.04, 0.62, 7);
  const axe = new THREE.Group();
  const axeHandle = new THREE.Mesh(handleGeometry, woodMaterial);
  axeHandle.rotation.z = -0.28; axeHandle.position.set(0.04, -0.03, 0); axe.add(axeHandle);
  const axeHead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), metalMaterial);
  axeHead.scale.set(1.65, 0.72, 0.82); axeHead.position.set(-0.04, 0.23, 0); axe.add(axeHead);
  axe.position.set(0.52, -0.48, -0.77); camera.add(axe); heldTools.axe = axe;

  const pickaxe = new THREE.Group();
  const pickHandle = new THREE.Mesh(handleGeometry, woodMaterial);
  pickHandle.rotation.z = -0.28; pickHandle.position.set(0.04, -0.03, 0); pickaxe.add(pickHandle);
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.52, 7), metalMaterial);
  crossbar.rotation.z = Math.PI / 2; crossbar.position.set(-0.02, 0.22, 0); pickaxe.add(crossbar);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 6), metalMaterial);
    tip.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    tip.position.set(side * 0.36, 0.22, 0); pickaxe.add(tip);
  }
  pickaxe.position.set(0.52, -0.48, -0.77); camera.add(pickaxe); heldTools.pickaxe = pickaxe;
  syncHeldTools();
}

function syncHeldTools() {
  for (const [name, tool] of Object.entries(heldTools)) tool.visible = state.equippedTool === name;
}

function craftAxe() {
  const result = craftStoneAxe(state, state.axe);
  if (!result) { toastMessage('Stone axe needs 2 wood and 2 stone.'); return; }
  state.wood = result.wood; state.stone = result.stone;
  state.axe = true; state.equippedTool = 'axe'; syncHeldTools();
  toastMessage('Stone axe crafted and equipped. Trees now yield 2 wood.');
  updateHUD(); saveGame();
}

function craftPickaxe() {
  const result = craftStonePickaxe(state, state.pickaxe);
  if (!result) { toastMessage('Stone pickaxe needs 1 wood and 3 stone.'); return; }
  state.wood = result.wood; state.stone = result.stone;
  state.pickaxe = true; state.equippedTool = 'pickaxe'; syncHeldTools();
  toastMessage('Stone pickaxe crafted and equipped. Rocks now yield 2 stone.');
  updateHUD(); saveGame();
}

function craftPlayerCanteen() {
  const result = craftCanteen(state, state.canteen);
  if (!result) { toastMessage('Bark canteen needs 3 wood and 2 berries.'); return; }
  state.wood = result.wood;
  state.berries = result.berries;
  state.canteen = true;
  state.canteenFilled = false;
  toastMessage('Bark canteen crafted. Fill it at the stream with E.');
  updateHUD(); saveGame();
}

function eatBerry() {
  if (state.berries < 1) { toastMessage('Gather some wild berries first.'); return; }
  if (state.hunger >= 99) { toastMessage('You are not hungry right now.'); return; }
  state.berries--;
  state.hunger = Math.min(100, state.hunger + 28);
  toastMessage('You ate a handful of wild berries.');
  updateHUD(); saveGame();
}

function drinkCanteen() {
  if (!state.canteen) { toastMessage('Craft a canteen first.'); return; }
  if (!state.canteenFilled) { toastMessage('Your canteen is empty. Fill it at the stream with E.'); return; }
  if (state.hydration >= 99) { toastMessage('You are not thirsty right now.'); return; }
  state.canteenFilled = false;
  state.hydration = Math.min(100, state.hydration + 45);
  toastMessage('You drank from your canteen.');
  updateHUD(); saveGame();
}

function equipTool(toolName) {
  if (toolName && !state[toolName]) { toastMessage(`Craft the stone ${toolName} first.`); return; }
  state.equippedTool = state.equippedTool === toolName ? null : toolName;
  syncHeldTools();
  toastMessage(state.equippedTool ? `Stone ${state.equippedTool} equipped.` : 'Tool put away.');
  updateHUD(); saveGame();
}

function craftNextTool() {
  if (!state.axe && canCraftStoneAxe(state)) craftAxe();
  else if (!state.pickaxe && canCraftStonePickaxe(state)) craftPickaxe();
  else toastMessage('Gather the materials shown in the crafting recipes.');
}

function removeResource(object) {
  depleted.add(object.userData.resourceId);
  scene.remove(object);
  const i = resources.indexOf(object); if (i >= 0) resources.splice(i, 1);
  const solidIndex = solids.findIndex(item => item.group === object); if (solidIndex >= 0) solids.splice(solidIndex, 1);
}

function addSignalFire() {
  if (ridgeFire) return;
  ridgeFire = new THREE.Group();
  ridgeFire.position.set(ridge.x, terrainHeight(ridge.x, ridge.z) + 0.55, ridge.z);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.1, 7), new THREE.MeshStandardMaterial({ color: '#574337', roughness: 1 }));
  log.rotation.z = Math.PI / 2; log.position.y = 0.1; log.castShadow = true; ridgeFire.add(log);
  const crossLog = log.clone(); crossLog.rotation.y = Math.PI / 2; ridgeFire.add(crossLog);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.5, 7), new THREE.MeshStandardMaterial({ color: '#f0a14a', emissive: '#e85e22', emissiveIntensity: 1.6, roughness: 0.5 }));
  flame.position.y = 0.95; ridgeFire.add(flame); ridgeFire.userData.flame = flame;
  const glow = new THREE.PointLight('#ff9b50', 13, 19, 2); glow.position.y = 1.3; ridgeFire.add(glow); ridgeFire.userData.glow = glow;
  scene.add(ridgeFire);
}

function addShelterModel(x, z, yaw = 0) {
  if (shelterObject) scene.remove(shelterObject);
  shelterObject = new THREE.Group();
  shelterObject.position.set(x, terrainHeight(x, z), z);
  shelterObject.rotation.y = yaw;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#70573d', roughness: 1 });
  const canvasMaterial = new THREE.MeshStandardMaterial({ color: '#8c896b', roughness: 1, side: THREE.DoubleSide });
  for (const sx of [-0.98, 0.98]) for (const sz of [-1.02, 1.02]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.95, 5), frameMaterial);
    post.position.set(sx, 0.475, sz); post.castShadow = true; shelterObject.add(post);
  }
  for (const side of [-1, 1]) {
    const roofAngle = -side * 0.61;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.1, 2.65), canvasMaterial);
    roof.position.set(side * 0.5, 1.28, 0);
    roof.rotation.z = roofAngle;
    roof.castShadow = true; roof.receiveShadow = true; shelterObject.add(roof);
    for (const end of [-1, 1]) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.075, 0.075), frameMaterial);
      rafter.position.set(side * 0.5, 1.21, end * 1.02);
      rafter.rotation.z = roofAngle;
      rafter.castShadow = true; shelterObject.add(rafter);
    }
    const eave = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), frameMaterial);
    eave.position.set(side * 0.98, 0.94, 0); eave.castShadow = true; shelterObject.add(eave);
  }
  const ridgeStick = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 2.65), frameMaterial);
  ridgeStick.position.y = 1.64; ridgeStick.castShadow = true; shelterObject.add(ridgeStick);
  scene.add(shelterObject);
}

function buildShelter() {
  if (state.shelter) { toastMessage('You already built a shelter.'); return; }
  if (state.wood < 6 || state.stone < 2) { toastMessage('Lean-to shelter needs 6 wood and 2 stone.'); return; }
  const x = THREE.MathUtils.clamp(state.x - Math.sin(state.yaw) * 2.8, -68, 68);
  const z = THREE.MathUtils.clamp(state.z - Math.cos(state.yaw) * 2.8, -70, 70);
  if (solids.some(item => Math.hypot(item.x - x, item.z - z) < item.radius + 1.2)) {
    toastMessage('Find a clear patch of ground to build your shelter.'); return;
  }
  state.wood -= 6; state.stone -= 2;
  state.shelter = { x, z, yaw: state.yaw };
  addShelterModel(x, z, state.yaw);
  toastMessage('Lean-to shelter built. It will shelter you from the cold.');
  saveGame(); updateHUD(); drawMinimap();
}

function packShelter() {
  if (!state.shelter) { toastMessage('You have no shelter to pack.'); return; }
  if (shelterObject) scene.remove(shelterObject);
  shelterObject = null;
  state.shelter = null;
  state.wood += 6; state.stone += 2;
  toastMessage('Shelter packed. Its materials are back in your pack; build again somewhere else.');
  saveGame(); updateHUD(); drawMinimap();
}

function createRainEffect() {
  const positions = new Float32Array(240 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (Math.random() - 0.5) * 22;
    positions[i + 1] = Math.random() * 16;
    positions[i + 2] = (Math.random() - 0.5) * 22;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rainPoints = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#c7d6db', size: 0.055, transparent: true, opacity: 0.48, depthWrite: false }));
  rainPoints.visible = false;
  scene.add(rainPoints);
}

function targetedResource() {
  camera.updateMatrixWorld();
  resourceRaycaster.setFromCamera(reticleCenter, camera);
  resourceRaycaster.far = INTERACT_DISTANCE + 2.2;
  const hits = resourceRaycaster.intersectObjects(resources, true);
  for (const hit of hits) {
    let resource = hit.object;
    while (resource && !resource.userData.resourceType) resource = resource.parent;
    if (!resource) continue;
    const distance = Math.hypot(resource.position.x - state.x, resource.position.z - state.z);
    if (isNearResource(distance)) return { object: resource, distance };
  }
  return { object: null, distance: Infinity };
}

function isNearCreek() {
  const creekX = 5 + 8 * Math.sin((state.z + 12) * 0.055);
  return Math.abs(state.x - creekX) < 2.5;
}

function isNearSignalFire() {
  return state.fireLit && Math.hypot(state.x - ridge.x, state.z - ridge.z) < 6;
}

function isNearShelter() {
  return Boolean(state.shelter && Math.hypot(state.x - state.shelter.x, state.z - state.shelter.z) < 5);
}

function updateEnvironment(dt) {
  state.worldTime += dt * 60;
  const gameHour = (state.worldTime % 86400) / 3600;
  const daylight = THREE.MathUtils.clamp(Math.sin((gameHour - 6) * Math.PI / 12), 0, 1);
  const raining = gameHour >= 19 && gameHour < 22;
  scene.background.copy(skyNightColor).lerp(skyDayColor, daylight);
  scene.fog.color.copy(scene.background).lerp(fogDayColor, daylight * 0.45);
  sun.intensity = 0.12 + daylight * (raining ? 1.45 : 2.08);
  hemi.intensity = 0.45 + daylight * 1.15;
  const sunAngle = (gameHour - 6) * Math.PI / 12;
  sun.position.set(-Math.cos(sunAngle) * 38, 18 + Math.sin(sunAngle) * 42, 24);

  const warmth = isNearSignalFire() ? 17 : isNearShelter() ? 10 : 0;
  const targetTemperature = 5 + daylight * 15 - (raining ? 5 : 0) + warmth;
  state.temperature += (targetTemperature - state.temperature) * Math.min(1, dt * 0.12);
  const needsDamage = state.hunger <= 0 || state.hydration <= 0 ? 0.75 : 0;
  const coldDamage = state.temperature < 5 ? 0.55 : 0;
  if (needsDamage + coldDamage > 0) state.health = Math.max(0, state.health - (needsDamage + coldDamage) * dt);
  else if (isNearSignalFire()) state.health = Math.min(100, state.health + 0.65 * dt);
  if (state.health <= 0) showDeathScreen();

  if (!coldWarningShown && state.temperature < 7) {
    coldWarningShown = true;
    toastMessage('You are getting cold. Find shelter or warm up by the signal fire.');
  } else if (coldWarningShown && state.temperature > 9) coldWarningShown = false;

  if (rainPoints) {
    rainPoints.visible = raining;
    rainPoints.position.copy(camera.position);
    if (raining) {
      const positions = rainPoints.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - dt * 15;
        if (y < -1) {
          y = 15 + Math.random() * 3;
          positions.setX(i, (Math.random() - 0.5) * 22);
          positions.setZ(i, (Math.random() - 0.5) * 22);
        }
        positions.setY(i, y);
      }
      positions.needsUpdate = true;
    }
  }
}

function interact() {
  const ridgeDistance = Math.hypot(state.x - ridge.x, state.z - ridge.z);
  if (ridgeDistance < 4.1) {
    if (canBuildFire(state, true, state.fireLit)) {
      state.wood -= 3; state.stone -= 2; state.fireLit = true; addSignalFire();
      respawnPoint = { x: ridge.x + 4, z: ridge.z + 3 };
      document.querySelector('#objective').textContent = 'Signal fire lit! Smoke marks your way out of the valley.';
      toastMessage('The signal fire is burning. It is now your respawn point.'); saveGame(); updateHUD(); return;
    }
    toastMessage(state.fireLit ? 'Your signal fire is already lit.' : 'The ridge is reached. Bring 3 wood and 2 stone to build a fire.');
    return;
  }
  if (isNearCreek()) {
    if (state.canteen && !state.canteenFilled) {
      state.canteenFilled = true;
      toastMessage('Canteen filled with fresh stream water.');
      saveGame(); updateHUD(); return;
    }
    if (state.hydration >= 99) { toastMessage('You are not thirsty right now.'); return; }
    state.hydration = Math.min(100, state.hydration + 42);
    toastMessage('You drank from the clear stream.');
    saveGame(); updateHUD(); return;
  }
  const { object, distance } = targetedResource();
  if (!object || !isNearResource(distance)) { toastMessage('Nothing close enough to gather. Look for a tree or rock.'); return; }
  swingTimer = 0.42;
  const kind = object.userData.resourceType;
  if (kind === 'berry') {
    state.berries++;
    removeResource(object); saveGame(); updateHUD(); drawMinimap();
    toastMessage(`Gathered wild berries · ${state.berries} in your pack.`); return;
  }
  const yieldCount = resourceYield(kind, state.equippedTool);
  if (kind === 'wood') state.wood += yieldCount;
  else state.stone += yieldCount;
  removeResource(object); saveGame(); updateHUD(); drawMinimap();
  toastMessage(`Collected ${yieldCount} ${kind}${yieldCount === 1 ? '' : ' pieces'}.`);
}

function toastMessage(message) {
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function updateHUD() {
  document.querySelector('#woodValue').textContent = state.wood;
  document.querySelector('#stoneValue').textContent = state.stone;
  document.querySelector('#inventoryWood').textContent = state.wood;
  document.querySelector('#inventoryStone').textContent = state.stone;
  const berrySlot = document.querySelector('#berrySlot');
  berrySlot.classList.toggle('empty-slot', state.berries < 1);
  berrySlot.innerHTML = state.berries ? `<span class="item-icon berry-icon">B</span><span>Berries</span><b>${state.berries}</b>` : 'Empty';
  const canteenSlot = document.querySelector('#canteenSlot');
  canteenSlot.classList.toggle('empty-slot', !state.canteen);
  canteenSlot.innerHTML = state.canteen
    ? `<span class="item-icon canteen-icon">C</span><span>Canteen</span><small>${state.canteenFilled ? 'Full' : 'Empty'}</small>`
    : 'Empty';
  document.querySelector('#slotCount').textContent = `${2 + Number(state.berries > 0) + Number(state.canteen) + Number(state.axe) + Number(state.pickaxe)} of 8 slots`;
  const axeSlot = document.querySelector('#axeSlot');
  axeSlot.classList.toggle('empty-slot', !state.axe);
  axeSlot.innerHTML = state.axe ? `<span class="item-icon axe-icon">A</span><span>Stone axe</span><small>${state.equippedTool === 'axe' ? 'Equipped' : 'Stored'}</small>` : 'Empty';
  const pickaxeSlot = document.querySelector('#pickaxeSlot');
  pickaxeSlot.classList.toggle('empty-slot', !state.pickaxe);
  pickaxeSlot.innerHTML = state.pickaxe ? `<span class="item-icon pickaxe-icon">P</span><span>Stone pickaxe</span><small>${state.equippedTool === 'pickaxe' ? 'Equipped' : 'Stored'}</small>` : 'Empty';
  const craftButton = document.querySelector('#craftAxe');
  const equipButton = document.querySelector('#equipAxe');
  const craftPickaxeButton = document.querySelector('#craftPickaxe');
  const equipPickaxeButton = document.querySelector('#equipPickaxe');
  const shelterButton = document.querySelector('#buildShelter');
  const packShelterButton = document.querySelector('#packShelter');
  const craftCanteenButton = document.querySelector('#craftCanteen');
  craftCanteenButton.hidden = state.canteen;
  craftCanteenButton.disabled = !canCraftCanteen(state);
  const eatBerryButton = document.querySelector('#eatBerry');
  eatBerryButton.textContent = state.berries ? `Eat berries (${state.berries})` : 'Eat berries';
  eatBerryButton.disabled = state.berries < 1 || state.hunger >= 99;
  const drinkCanteenButton = document.querySelector('#drinkCanteen');
  drinkCanteenButton.textContent = state.canteenFilled ? 'Drink stored water' : 'Drink stored water · empty';
  drinkCanteenButton.disabled = !state.canteenFilled || state.hydration >= 99;
  craftButton.hidden = state.axe;
  craftButton.disabled = !canCraftStoneAxe(state);
  equipButton.hidden = !state.axe;
  equipButton.textContent = state.equippedTool === 'axe' ? 'Put away stone axe (1)' : 'Equip stone axe (1)';
  craftPickaxeButton.hidden = state.pickaxe;
  craftPickaxeButton.disabled = !canCraftStonePickaxe(state);
  equipPickaxeButton.hidden = !state.pickaxe;
  equipPickaxeButton.textContent = state.equippedTool === 'pickaxe' ? 'Put away stone pickaxe (2)' : 'Equip stone pickaxe (2)';
  shelterButton.hidden = Boolean(state.shelter);
  shelterButton.disabled = state.wood < 6 || state.stone < 2;
  packShelterButton.hidden = !state.shelter;
  document.querySelector('#fireValue').textContent = state.fireLit ? 'Lit' : 'Not lit';
  document.querySelector('#healthValue').textContent = `${Math.round(state.health)}%`;
  document.querySelector('#staminaValue').textContent = `${Math.round(state.stamina)}%`;
  document.querySelector('#foodValue').textContent = `${Math.round(state.hunger)}%`;
  document.querySelector('#waterValue').textContent = `${Math.round(state.hydration)}%`;
  document.querySelector('#healthValue').parentElement.classList.toggle('low', isSurvivalStatLow(state.health));
  document.querySelector('#foodValue').parentElement.classList.toggle('low', isSurvivalStatLow(state.hunger));
  document.querySelector('#waterValue').parentElement.classList.toggle('low', isSurvivalStatLow(state.hydration));
  document.querySelector('#temperatureValue').parentElement.classList.toggle('low', isSurvivalStatLow(state.temperature, 7));
  document.querySelector('#temperatureValue').textContent = `${Math.round(state.temperature)}°C`;
  document.querySelector('#healthBar').style.width = `${state.health}%`;
  document.querySelector('#staminaBar').style.width = `${state.stamina}%`;
  document.querySelector('#foodBar').style.width = `${state.hunger}%`;
  document.querySelector('#waterBar').style.width = `${state.hydration}%`;
  document.querySelector('#temperatureBar').style.width = `${THREE.MathUtils.clamp((state.temperature + 5) / 35 * 100, 0, 100)}%`;
  const gameDay = Math.floor(state.worldTime / 86400) + 1;
  const gameSeconds = state.worldTime % 86400;
  const gameHour = Math.floor(gameSeconds / 3600);
  const gameMinute = Math.floor((gameSeconds % 3600) / 60);
  const clockHour = gameHour % 12 || 12;
  const period = gameHour >= 12 ? 'PM' : 'AM';
  const weather = gameHour >= 19 && gameHour < 22 ? 'Rain' : 'Clear';
  document.querySelector('#dayClock').textContent = `Day ${gameDay} · ${clockHour}:${String(gameMinute).padStart(2, '0')} ${period} · ${weather}`;
  const ridgeDistance = Math.hypot(state.x - ridge.x, state.z - ridge.z);
  const prompt = document.querySelector('#interactionPrompt');
  const reticle = document.querySelector('#reticle');
  document.querySelector('#objective').textContent = getSignalFireObjective(state, ridgeDistance < 4.1, state.fireLit);
  if (ridgeDistance < 4.1) prompt.textContent = state.fireLit
    ? 'Signal fire lit · rest nearby to recover'
    : canBuildFire(state, true) ? 'E · Light signal fire' : 'Ridge reached · 3 wood + 2 stone needed';
  else if (isNearCreek()) {
    prompt.textContent = state.canteen && !state.canteenFilled
      ? 'E · Fill canteen with fresh water'
      : state.hydration >= 99 ? 'Fresh stream · you are not thirsty' : 'E · Drink fresh stream water';
    reticle.classList.toggle('targeting', state.hydration < 99 || (state.canteen && !state.canteenFilled));
  }
  else {
    const nearby = targetedResource();
    const yieldCount = nearby.object ? resourceYield(nearby.object.userData.resourceType, state.equippedTool) : 1;
    prompt.textContent = nearby.object && isNearResource(nearby.distance)
      ? nearby.object.userData.resourceType === 'berry' ? 'E · Gather wild berries' : `E · Gather ${yieldCount} ${nearby.object.userData.resourceType}` : '';
    reticle.classList.toggle('targeting', Boolean(nearby.object && isNearResource(nearby.distance)));
  }
  if (ridgeDistance < 4.5) reticle.classList.toggle('targeting', !state.fireLit && canBuildFire(state, true));
  if (!prompt.textContent && isNearShelter()) prompt.textContent = 'Sheltered · temperature recovers here';
  if (!prompt.textContent && state.temperature < 7) prompt.textContent = 'Cold exposure · seek shelter or the signal fire';
  prompt.hidden = !prompt.textContent;
}

function drawMinimap() {
  const w = mapCanvas.width, h = mapCanvas.height, rangeX = 145, rangeZ = 155;
  const px = x => w / 2 + x / rangeX * (w - 22), py = z => h / 2 + z / rangeZ * (h - 26) + 9;
  map.clearRect(0, 0, w, h); map.fillStyle = '#18261f'; map.fillRect(0, 0, w, h);
  map.fillStyle = '#e1e6d6'; map.font = '10px system-ui'; map.fillText('VALLEY MAP', 9, 15);
  map.strokeStyle = '#72918d'; map.lineWidth = 4; map.beginPath();
  for (let i = 0; i <= 80; i++) { const z = 70 - i * 145 / 80, x = 5 + 8 * Math.sin((z + 12) * 0.055); i ? map.lineTo(px(x), py(z)) : map.moveTo(px(x), py(z)); }
  map.stroke();
  for (const obj of resources) {
    map.fillStyle = obj.userData.resourceType === 'wood' ? '#91b46e' : obj.userData.resourceType === 'berry' ? '#cf7880' : '#bbb9a7';
    map.fillRect(px(obj.position.x) - 1, py(obj.position.z) - 1, 2, 2);
  }
  map.fillStyle = '#efc875'; map.beginPath(); map.arc(px(ridge.x), py(ridge.z), 3.5, 0, Math.PI * 2); map.fill();
  if (state.shelter) { map.fillStyle = '#d3bd8c'; map.fillRect(px(state.shelter.x) - 2, py(state.shelter.z) - 2, 4, 4); }
  map.fillStyle = '#fff3dc'; map.beginPath(); map.arc(px(state.x), py(state.z), 3, 0, Math.PI * 2); map.fill();
}

function movePlayer(dt) {
  if (!playing) return;
  const crouching = crouched;
  const input = getMoveVector({
    forward: state.keys.has('w') || state.keys.has('arrowup'),
    backward: state.keys.has('s') || state.keys.has('arrowdown'),
    left: state.keys.has('a') || state.keys.has('arrowleft'),
    right: state.keys.has('d') || state.keys.has('arrowright'),
  });
  const moving = input.x !== 0 || input.z !== 0;
  const inDeepWater = isInShoulderDeepWater(state.x, state.z);
  const jogging = !inDeepWater && !crouching && state.keys.has('shift') && state.stamina > 1 && moving;
  const speed = inDeepWater ? 2.5 : crouching ? 1.9 : jogging ? 6.1 : 3.8;
  if (moving) {
    const dx = input.x * Math.cos(state.yaw) + input.z * Math.sin(state.yaw);
    const dz = -input.x * Math.sin(state.yaw) + input.z * Math.cos(state.yaw);
    const nx = THREE.MathUtils.clamp(state.x + dx * speed * dt, -70, 70);
    const nz = THREE.MathUtils.clamp(state.z + dz * speed * dt, -72, 72);
    const resolved = resolveMovement(state, { x: nx, z: nz }, solids);
    state.x = resolved.x; state.z = resolved.z;
    if (jogging) state.stamina = Math.max(0, state.stamina - 17 * dt);
    else state.stamina = Math.min(100, state.stamina + 1.6 * dt);
    if (state.stamina <= 0) state.health = Math.max(0, state.health - 0.35 * dt);
  } else state.stamina = Math.min(100, state.stamina + 12 * dt);
  const wasSwimming = swimming;
  swimming = isInShoulderDeepWater(state.x, state.z);
  if (swimming !== wasSwimming) toastMessage(swimming ? 'Shoulder-deep water · swimming' : 'You are back on shore.');
  state.hunger = Math.max(0, state.hunger - 0.16 * dt);
  state.hydration = Math.max(0, state.hydration - 0.24 * dt);
  state.jump = stepJump(state.jump, dt);
  crouchBlend += ((crouching ? 1 : 0) - crouchBlend) * Math.min(1, dt * 12);
  const eyeHeight = 1.67 - crouchBlend * 0.58;
  camera.position.set(state.x, terrainHeight(state.x, state.z) + eyeHeight + state.jump.height, state.z);
  camera.rotation.set(state.pitch, state.yaw, 0);
  updateEnvironment(dt);
  saveClock += dt;
  if (saveClock >= 6) { saveClock = 0; saveGame(); }
}

function nowAtRidge() { return Math.hypot(state.x - ridge.x, state.z - ridge.z) < 5.5; }
function renderFrame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - previousTime) / 1000)); previousTime = now;
  movePlayer(dt);
  hudClock += dt;
  if (hudClock >= 0.1) { hudClock = 0; updateHUD(); drawMinimap(); }
  if (ridgeFire) {
    const flicker = 0.88 + Math.sin(now * 0.013) * 0.1 + Math.sin(now * 0.031) * 0.05;
    ridgeFire.userData.flame.scale.y = flicker;
    ridgeFire.userData.glow.intensity = 11 + flicker * 3;
  }
  if (swingTimer > 0) swingTimer = Math.max(0, swingTimer - dt);
  const activeTool = heldTools[state.equippedTool];
  for (const [name, tool] of Object.entries(heldTools)) {
    if (tool !== activeTool) { tool.rotation.set(0, 0, 0); continue; }
    if (swingTimer > 0) {
      const swing = Math.sin((1 - swingTimer / 0.42) * Math.PI);
      tool.rotation.z = -0.22 + swing * 1.15;
      tool.rotation.x = swing * 0.12;
    } else { tool.rotation.z = -0.22; tool.rotation.x = 0; }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

function startGame() {
  playing = true; startOverlay.style.display = 'none'; canvas.focus();
  requestMouseCapture();
}
function showDeathScreen() {
  if (dead) return;
  dead = true;
  playing = false;
  clearHeldKeys();
  dragging = false;
  startOverlay.classList.add('death');
  document.querySelector('#startKicker').textContent = 'The valley has claimed another traveler.';
  document.querySelector('#startTitle').textContent = 'You have fallen.';
  document.querySelector('#startMessage').textContent = state.fireLit
    ? 'You will wake near your signal fire. Your pack and world will be waiting.'
    : 'You will wake at the valley entrance. Your pack and world will be waiting.';
  document.querySelector('#enter').textContent = 'Respawn';
  document.querySelector('#startHint').textContent = state.fireLit
    ? 'Respawn point · Signal fire'
    : 'Respawn point · Valley entrance';
  startOverlay.style.display = 'grid';
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  saveGame();
}
function respawn() {
  if (!dead) { startGame(); return; }
  state.x = respawnPoint.x;
  state.z = respawnPoint.z;
  state.health = 100;
  state.stamina = 100;
  state.hunger = Math.max(state.hunger, 55);
  state.hydration = Math.max(state.hydration, 55);
  state.temperature = 15;
  state.jump = { height: 0, velocity: 0, onGround: true };
  state.yaw = 0;
  state.pitch = 0;
  crouched = false;
  crouchBlend = 0;
  clearHeldKeys();
  dead = false;
  startOverlay.classList.remove('death');
  playing = true;
  startOverlay.style.display = 'none';
  camera.position.set(state.x, terrainHeight(state.x, state.z) + 1.67, state.z);
  camera.rotation.set(0, 0, 0);
  updateHUD();
  drawMinimap();
  saveGame();
  requestMouseCapture();
}
function requestMouseCapture() {
  if (!playing || !canvas.requestPointerLock) return;
  try {
    const request = canvas.requestPointerLock();
    request?.catch?.(() => {
      if (!pointerLockFailed) toastMessage('Mouse capture is blocked here. Click and drag to look, or open the game in a regular browser.');
      pointerLockFailed = true;
    });
  } catch {
    if (!pointerLockFailed) toastMessage('Mouse capture is blocked here. Click and drag to look, or open the game in a regular browser.');
    pointerLockFailed = true;
  }
}
function setInventoryOpen(open) {
  const panel = document.querySelector('#inventoryPanel');
  const button = document.querySelector('#inventoryToggle');
  panel.hidden = !open;
  if (open) clearHeldKeys();
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Close backpack (I)' : 'Open backpack (I)';
  if (open && document.pointerLockElement === canvas) {
    unlockForInventory = true;
    document.exitPointerLock();
  } else if (!open && playing) requestMouseCapture();
}
function clearHeldKeys() {
  state.keys.clear();
}
function look(dx, dy) {
  state.yaw -= dx * 0.0025;
  state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.002, -1.05, 1.05);
}

loadGraphicsQuality();
generateWorld(); restoreSave(); createHeldTools(); createRainEffect();
camera.position.set(state.x, terrainHeight(state.x, state.z) + 1.67, state.z);
updateHUD(); drawMinimap();
if (state.health <= 0) showDeathScreen();

document.querySelector('#enter').addEventListener('click', respawn);
document.querySelector('#inventoryToggle').addEventListener('click', () => setInventoryOpen(document.querySelector('#inventoryPanel').hidden));
document.querySelector('#qualitySelect').addEventListener('change', event => setGraphicsQuality(event.target.value));
document.querySelector('#craftAxe').addEventListener('click', craftAxe);
document.querySelector('#equipAxe').addEventListener('click', () => equipTool('axe'));
document.querySelector('#craftPickaxe').addEventListener('click', craftPickaxe);
document.querySelector('#craftCanteen').addEventListener('click', craftPlayerCanteen);
document.querySelector('#eatBerry').addEventListener('click', eatBerry);
document.querySelector('#drinkCanteen').addEventListener('click', drinkCanteen);
document.querySelector('#equipPickaxe').addEventListener('click', () => equipTool('pickaxe'));
document.querySelector('#buildShelter').addEventListener('click', buildShelter);
document.querySelector('#packShelter').addEventListener('click', packShelter);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (wasLocked && !locked) {
    clearHeldKeys();
    if (!dead) playing = true;
    dragging = false;
    if (unlockForInventory) unlockForInventory = false;
    else toastMessage('Mouse released. Click the game to capture it again, or drag to look around.');
  }
  if (locked && !dead) { playing = true; pointerLockFailed = false; startOverlay.style.display = 'none'; }
  wasLocked = locked;
});
document.addEventListener('pointerlockerror', () => {
  if (!pointerLockFailed && playing) toastMessage('This browser view blocks mouse capture. Click and drag to look, or open the game in a regular browser.');
  pointerLockFailed = true;
});
canvas.addEventListener('mousedown', event => { if (playing && document.pointerLockElement !== canvas) { dragging = true; lastMouse = { x: event.clientX, y: event.clientY }; } });
canvas.addEventListener('click', () => {
  if (playing && document.querySelector('#inventoryPanel').hidden && document.pointerLockElement !== canvas) requestMouseCapture();
});
document.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement === canvas) look(event.movementX, event.movementY);
  else if (playing && dragging) { look(event.clientX - lastMouse.x, event.clientY - lastMouse.y); lastMouse = { x: event.clientX, y: event.clientY }; }
});
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  const typingTarget = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName));
  const inventoryOpen = !document.querySelector('#inventoryPanel').hidden;
  if (key === 'i' && !event.repeat && playing) {
    event.preventDefault();
    setInventoryOpen(!inventoryOpen);
    return;
  }
  if (!playing || typingTarget) return;
  if (inventoryOpen) {
    if (getInventoryShortcutAction(key, event.repeat) === 'craft') {
      event.preventDefault();
      craftNextTool();
    }
    return;
  }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'control'].includes(key)) event.preventDefault();
  state.keys.add(key);
  if (key === 'control' && !event.repeat) {
    crouched = !crouched;
    toastMessage(crouched ? 'Crouched. Press Ctrl again to stand.' : 'Standing.');
  }
  if (key === '1' && !event.repeat) equipTool('axe');
  if (key === '2' && !event.repeat) equipTool('pickaxe');
  if (key === 't' && !event.repeat && state.equippedTool) equipTool(state.equippedTool);
  if (key === 'h' && !event.repeat && playing) state.shelter ? packShelter() : buildShelter();
  if (key === ' ' && !event.repeat && playing) state.jump = startJump(state.jump);
  if (key === 'e' && !event.repeat) interact();
});
document.addEventListener('keyup', event => state.keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', clearHeldKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearHeldKeys();
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, getGraphicsPreset(activeGraphics).pixelRatio)); renderer.setSize(innerWidth, innerHeight); });
addEventListener('pagehide', saveGame);
requestAnimationFrame(renderFrame);