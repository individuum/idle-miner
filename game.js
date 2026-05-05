'use strict';

const SAVE_KEY = 'idleminer_save_v5';
const OFFLINE_CAP_SEC = 4 * 60 * 60;

// ---------- ZONES ----------
// Each zone is a self-contained mine of 8 shafts, split by a mid-barrier
// between local 3 and 4. All zones tick concurrently; money is shared.
const ZONE_DEFS = [
  { id: 'surface', name: 'Surface Mine',  icon: '⛏', firstShaft: 0,  shaftCount: 8, unlockCost: 0,
    midBarrier: { name: 'Boulder Fall',     cost: 1.0e6,  icon: '🪨', desc: 'A rockfall blocks the deeper shafts of this mine' } },
  { id: 'deep',    name: 'Deep Earth',    icon: '🦴', firstShaft: 8,  shaftCount: 8, unlockCost: 5.0e6,
    midBarrier: { name: 'Quartz Wall',      cost: 4.0e12, icon: '💎', desc: 'A quartz seam waiting to be cracked open' } },
  { id: 'forge',   name: 'Hellforge',     icon: '🌋', firstShaft: 16, shaftCount: 8, unlockCost: 2.0e13,
    midBarrier: { name: 'Magnetic Storm',   cost: 3.0e19, icon: '⚡', desc: 'Volatile fields tearing at the rock' } },
  { id: 'magma',   name: 'Magma Layer',   icon: '🔥', firstShaft: 24, shaftCount: 8, unlockCost: 5.0e20,
    midBarrier: { name: 'Pyroclastic Flow', cost: 1.5e26, icon: '☄',  desc: 'A rolling cloud of molten ash' } },
  { id: 'ice',     name: 'Glacial Reach', icon: '❄',  firstShaft: 32, shaftCount: 8, unlockCost: 1.0e26,
    midBarrier: { name: 'Permafrost Wall',  cost: 8.0e32, icon: '🧊', desc: 'A glacier inside the glacier' } },
  { id: 'cosmic',  name: 'Cosmic Verge',  icon: '✦',  firstShaft: 40, shaftCount: 8, unlockCost: 5.0e33,
    midBarrier: { name: 'Event Horizon',    cost: 3.0e39, icon: '🌌', desc: 'A swirling tear at the edge of light' } },
];

// ---------- SHAFT CATALOG (global, indexed 0..47) ----------
// `tier` drives the per-shaft cost-formula scaling. Existing shafts retain
// integer tiers from before the 4→8 expansion; new shafts get fractional
// tiers between adjacent integers so upgrade prices on existing shafts are
// unchanged across the migration.
const SHAFT_DEFS = [
  // Zone 0 — Surface Mine (existing first half)
  { name: 'Surface Quarry',     tier: 0,    unlockCost: 0,        baseTime: 3.0,  baseCap: 10,    baseOre: 2 },
  { name: 'Copper Vein',        tier: 1,    unlockCost: 250,      baseTime: 4.0,  baseCap: 14,    baseOre: 4 },
  { name: 'Silver Tunnel',      tier: 2,    unlockCost: 1.0e4,    baseTime: 5.0,  baseCap: 20,    baseOre: 8 },
  { name: 'Gold Cavern',        tier: 3,    unlockCost: 5.0e5,    baseTime: 6.0,  baseCap: 28,    baseOre: 16 },
  // Zone 0 — second half (new, after the Boulder Fall)
  { name: 'Tin Mine',           tier: 3.2,  unlockCost: 1.5e6,    baseTime: 6.5,  baseCap: 32,    baseOre: 20 },
  { name: 'Lead Vein',          tier: 3.4,  unlockCost: 4.0e6,    baseTime: 6.7,  baseCap: 36,    baseOre: 24 },
  { name: 'Iron Foundry',       tier: 3.6,  unlockCost: 1.0e7,    baseTime: 6.9,  baseCap: 38,    baseOre: 28 },
  { name: 'Bauxite Reserve',    tier: 3.8,  unlockCost: 2.0e7,    baseTime: 6.95, baseCap: 39,    baseOre: 30 },

  // Zone 1 — Deep Earth (existing first half)
  { name: 'Platinum Depths',    tier: 4,    unlockCost: 2.5e7,    baseTime: 7.0,  baseCap: 40,    baseOre: 32 },
  { name: 'Diamond Mine',       tier: 5,    unlockCost: 1.25e9,   baseTime: 9.0,  baseCap: 55,    baseOre: 64 },
  { name: 'Mithril Shaft',      tier: 6,    unlockCost: 6.0e10,   baseTime: 11.0, baseCap: 75,    baseOre: 128 },
  { name: 'Adamantite Core',    tier: 7,    unlockCost: 3.0e12,   baseTime: 13.0, baseCap: 100,   baseOre: 256 },
  // Zone 1 — second half (new)
  { name: 'Sapphire Veins',     tier: 7.2,  unlockCost: 6.0e12,   baseTime: 13.5, baseCap: 110,   baseOre: 320 },
  { name: 'Emerald Hollow',     tier: 7.4,  unlockCost: 1.5e13,   baseTime: 14.0, baseCap: 122,   baseOre: 380 },
  { name: 'Ruby Forge',         tier: 7.6,  unlockCost: 4.0e13,   baseTime: 14.4, baseCap: 130,   baseOre: 440 },
  { name: 'Onyx Reserve',       tier: 7.8,  unlockCost: 8.0e13,   baseTime: 14.7, baseCap: 135,   baseOre: 480 },

  // Zone 2 — Hellforge (existing first half)
  { name: 'Obsidian Forge',     tier: 8,    unlockCost: 1.5e14,   baseTime: 15.0, baseCap: 140,   baseOre: 512 },
  { name: 'Cobalt Reactor',     tier: 9,    unlockCost: 7.5e15,   baseTime: 17.0, baseCap: 180,   baseOre: 1024 },
  { name: 'Antimatter Layer',   tier: 10,   unlockCost: 4.0e17,   baseTime: 19.0, baseCap: 220,   baseOre: 2048 },
  { name: 'Quantum Core',       tier: 11,   unlockCost: 2.0e19,   baseTime: 21.0, baseCap: 280,   baseOre: 4096 },
  // Zone 2 — second half (new)
  { name: 'Plasma Vein',        tier: 11.2, unlockCost: 5.0e19,   baseTime: 21.5, baseCap: 310,   baseOre: 5120 },
  { name: 'Phoenix Ember',      tier: 11.4, unlockCost: 1.5e20,   baseTime: 22.0, baseCap: 340,   baseOre: 6144 },
  { name: 'Rift Crystal',       tier: 11.6, unlockCost: 3.5e20,   baseTime: 22.4, baseCap: 360,   baseOre: 7168 },
  { name: 'Tachyon Core',       tier: 11.8, unlockCost: 7.0e20,   baseTime: 22.7, baseCap: 370,   baseOre: 7800 },

  // Zone 3 — Magma Layer (existing first half)
  { name: 'Magma Vein',         tier: 12,   unlockCost: 1.0e21,   baseTime: 23.0, baseCap: 360,   baseOre: 8192 },
  { name: 'Sulphur Pit',        tier: 13,   unlockCost: 5.0e22,   baseTime: 25.0, baseCap: 460,   baseOre: 16384 },
  { name: 'Molten Forge',       tier: 14,   unlockCost: 2.0e24,   baseTime: 27.0, baseCap: 580,   baseOre: 32768 },
  { name: 'Lava Heart',         tier: 15,   unlockCost: 1.0e26,   baseTime: 29.0, baseCap: 720,   baseOre: 65536 },
  // Zone 3 — second half (new)
  { name: 'Cinder Cone',        tier: 15.2, unlockCost: 2.5e26,   baseTime: 29.5, baseCap: 800,   baseOre: 81920 },
  { name: 'Brimstone Vault',    tier: 15.4, unlockCost: 7.0e26,   baseTime: 30.0, baseCap: 880,   baseOre: 98304 },
  { name: 'Obsidian Tear',      tier: 15.6, unlockCost: 2.0e27,   baseTime: 30.4, baseCap: 940,   baseOre: 114688 },
  { name: 'Hellfire Core',      tier: 15.8, unlockCost: 4.0e27,   baseTime: 30.7, baseCap: 980,   baseOre: 124928 },

  // Zone 4 — Glacial Reach (existing first half)
  { name: 'Ice Cavern',         tier: 16,   unlockCost: 5.0e27,   baseTime: 31.0, baseCap: 880,   baseOre: 131072 },
  { name: 'Frostbite Hollow',   tier: 17,   unlockCost: 2.0e29,   baseTime: 33.0, baseCap: 1080,  baseOre: 262144 },
  { name: 'Crystalline Lattice',tier: 18,   unlockCost: 1.0e31,   baseTime: 35.0, baseCap: 1300,  baseOre: 524288 },
  { name: 'Glacial Vault',      tier: 19,   unlockCost: 5.0e32,   baseTime: 37.0, baseCap: 1560,  baseOre: 1048576 },
  // Zone 4 — second half (new)
  { name: 'Aurora Vein',        tier: 19.2, unlockCost: 1.2e33,   baseTime: 37.5, baseCap: 1700,  baseOre: 1310720 },
  { name: 'Cryo Chamber',       tier: 19.4, unlockCost: 3.0e33,   baseTime: 38.0, baseCap: 1850,  baseOre: 1572864 },
  { name: 'Frostforge',         tier: 19.6, unlockCost: 8.0e33,   baseTime: 38.4, baseCap: 1980,  baseOre: 1835008 },
  { name: 'Eternal Glacier',    tier: 19.8, unlockCost: 1.5e34,   baseTime: 38.7, baseCap: 2050,  baseOre: 1998848 },

  // Zone 5 — Cosmic Verge (existing first half)
  { name: 'Stardust Layer',     tier: 20,   unlockCost: 2.0e34,   baseTime: 39.0, baseCap: 1860,  baseOre: 2097152 },
  { name: 'Nebula Cradle',      tier: 21,   unlockCost: 1.0e36,   baseTime: 41.0, baseCap: 2200,  baseOre: 4194304 },
  { name: 'Void Crystal Mantle',tier: 22,   unlockCost: 5.0e37,   baseTime: 43.0, baseCap: 2600,  baseOre: 8388608 },
  { name: 'Singularity',        tier: 23,   unlockCost: 2.0e39,   baseTime: 45.0, baseCap: 3100,  baseOre: 16777216 },
  // Zone 5 — second half (new)
  { name: 'Pulsar Core',        tier: 23.2, unlockCost: 5.0e39,   baseTime: 45.5, baseCap: 3400,  baseOre: 20971520 },
  { name: 'Quasar Array',       tier: 23.4, unlockCost: 1.5e40,   baseTime: 46.0, baseCap: 3700,  baseOre: 25165824 },
  { name: 'Big Bang Echo',      tier: 23.6, unlockCost: 4.0e40,   baseTime: 46.4, baseCap: 3950,  baseOre: 29360128 },
  { name: 'Omega Point',        tier: 23.8, unlockCost: 8.0e40,   baseTime: 46.7, baseCap: 4100,  baseOre: 31981568 },
];

// global shaft index given (zone, localK)
function gIdx(z, k) { return ZONE_DEFS[z].firstShaft + k; }

// ---------- STATE ----------
function freshShaft() {
  return { unlocked: false, mineLevel: 1, capLevel: 1, minerLevel: 1, autoMine: false, ore: 0, progress: 0 };
}
function freshElevator() {
  return { speedLevel: 1, capLevel: 1, cargo: 0, pos: 0, target: 0, stateName: 'idle', timer: 0, auto: false, manualTrip: false };
}
function freshWorker() {
  return { speedLevel: 1, capLevel: 1, cargo: 0, pos: 0, target: 0, stateName: 'idle', timer: 0, auto: false, manualTrip: false };
}
function freshProcessor() {
  return { speedLevel: 1, valueLevel: 1, parallelLevel: 1, buffer: 0, progress: 0, auto: false };
}
function freshZone(z) {
  const def = ZONE_DEFS[z];
  const shafts = [];
  for (let k = 0; k < def.shaftCount; k++) {
    const s = freshShaft();
    if (k === 0) s.unlocked = true; // first shaft of every zone is auto-unlocked
    shafts.push(s);
  }
  return {
    shafts,
    midBarrier: { cleared: false },
    elevator: freshElevator(),
    worker: freshWorker(),
    processor: freshProcessor(),
    surfaceDropoff: 0,
  };
}
function freshState() {
  return {
    money: 0,
    currentZone: 0,
    zonesUnlocked: ZONE_DEFS.map((_, z) => z === 0),
    zones: ZONE_DEFS.map((_, z) => freshZone(z)),
    activeBuffs: [],
    nextArtifactAt: Date.now() + 30000 + Math.random() * 30000,
    lastTimestamp: Date.now(),
  };
}

let state = freshState();
let _offlineCatchup = false;

// rate sampling — fixed-size buffer of money snapshots
const RATE_WINDOW_SEC = 5;
const RATE_SAMPLE_HZ = 5;
const RATE_BUFFER_SIZE = RATE_WINDOW_SEC * RATE_SAMPLE_HZ;
let _rateBuffer = [];
let _rateLastSampleAt = 0;

function sampleRate(now) {
  if (now - _rateLastSampleAt < 1000 / RATE_SAMPLE_HZ) return;
  _rateLastSampleAt = now;
  _rateBuffer.push({ t: now, money: state.money });
  if (_rateBuffer.length > RATE_BUFFER_SIZE) _rateBuffer.shift();
}
function currentRate() {
  if (_rateBuffer.length < 2) return 0;
  const first = _rateBuffer[0];
  const last = _rateBuffer[_rateBuffer.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return 0;
  return Math.max(0, (last.money - first.money) / dt);
}
function resetRateBuffer() { _rateBuffer = []; _rateLastSampleAt = 0; }

// ---------- BUFFS ----------
// Artifacts grant time-limited multiplicative buffs. Multiple buffs of the
// same type stack (e.g. two speed buffs → 4x mining speed).
const BUFF_TYPES = [
  { id: 'speed', icon: '⚡', label: 'Mining +100%',     duration: 30000, multiplier: 2.0,
    desc: 'Mining cycles run twice as fast' },
  { id: 'yield', icon: '⛏', label: 'Yield +100%',      duration: 30000, multiplier: 2.0,
    desc: 'Each cycle drops twice as much ore' },
  { id: 'value', icon: '💰', label: 'Ore Value 3×',     duration: 45000, multiplier: 3.0,
    desc: 'Processed ore sells for 3× the price' },
  { id: 'proc',  icon: '⚙',  label: 'Process Speed 2×', duration: 30000, multiplier: 2.0,
    desc: 'Processor cycles twice as fast' },
];
function buffMul(typeId) {
  const now = Date.now();
  let mul = 1;
  for (const b of state.activeBuffs) {
    if (b.expiresAt > now && b.type === typeId) mul *= b.multiplier;
  }
  return mul;
}
function buffByType(typeId) { return BUFF_TYPES.find(b => b.id === typeId); }

// ---------- FORMULAS ----------
function shaftMineTime(z, k) {
  const lvl = state.zones[z].shafts[k].mineLevel;
  const base = SHAFT_DEFS[gIdx(z, k)].baseTime;
  let t;
  if (lvl <= 25) t = base / Math.pow(1.10, lvl - 1);
  else t = base / Math.pow(1.10, 24) / Math.pow(1.04, lvl - 25);
  return t / buffMul('speed');
}
function shaftOreCap(z, k) {
  return Math.floor(SHAFT_DEFS[gIdx(z, k)].baseCap * Math.pow(1.25, state.zones[z].shafts[k].capLevel - 1));
}
function shaftOrePerCycle(z, k) { return SHAFT_DEFS[gIdx(z, k)].baseOre; }
function shaftMinerCount(z, k)  { return state.zones[z].shafts[k].minerLevel; }
function shaftYieldPerCycle(z, k) { return Math.floor(shaftOrePerCycle(z, k) * shaftMinerCount(z, k) * buffMul('yield')); }

function elevatorSpeed(z) { return 1.0 * Math.pow(1.10, state.zones[z].elevator.speedLevel - 1); }
function elevatorCap(z)   { return Math.floor(5 * Math.pow(1.30, state.zones[z].elevator.capLevel - 1)); }
function workerSpeed(z)   { return 0.6 * Math.pow(1.10, state.zones[z].worker.speedLevel - 1); }
function workerCap(z)     { return Math.floor(4 * Math.pow(1.30, state.zones[z].worker.capLevel - 1)); }

function processorTime(z) {
  const lvl = state.zones[z].processor.speedLevel;
  // No late-game cap — speedLevel cost grows 1.20x/level so per-level ROI
  // diminishes naturally. 1.12x effect / 1.20x cost = 0.93x per level.
  return (1.5 / Math.pow(1.12, lvl - 1)) / buffMul('proc');
}
function processorValue(z) {
  const lvl = state.zones[z].processor.valueLevel;
  // Tightened late-game scaling so ore value doesn't dominate income:
  // 1-15  : 1.35x per level
  // 16-30 : 1.10x per level (mild post-cap)
  // 31+   : 1.05x per level (hard post-cap)
  let v;
  if (lvl <= 15) v = 2 * Math.pow(1.35, lvl - 1);
  else if (lvl <= 30) v = 2 * Math.pow(1.35, 14) * Math.pow(1.10, lvl - 15);
  else v = 2 * Math.pow(1.35, 14) * Math.pow(1.10, 15) * Math.pow(1.05, lvl - 30);
  return v * buffMul('value');
}
function processorParallel(z) { return state.zones[z].processor.parallelLevel; }

// Pipeline costs scale by zone tier so a zone-5 elevator costs proportionally
// to the wealth available there. 16^z roughly tracks the zone-to-zone yield jump.
function zoneCostScale(z) { return Math.pow(16, z); }

// Shaft costs use def.tier (was global index) so new fractional-tier shafts
// don't disrupt the upgrade-cost curve of pre-existing shafts.
function shaftTier(z, k) { return SHAFT_DEFS[gIdx(z, k)].tier; }

const COSTS = {
  shaftMine:    (z, k) => 8   * Math.pow(8, shaftTier(z, k)) * Math.pow(1.15, state.zones[z].shafts[k].mineLevel - 1),
  shaftCap:     (z, k) => 20  * Math.pow(8, shaftTier(z, k)) * Math.pow(1.20, state.zones[z].shafts[k].capLevel - 1),
  shaftMiner:   (z, k) => 40  * Math.pow(8, shaftTier(z, k)) * Math.pow(1.40, state.zones[z].shafts[k].minerLevel - 1),
  shaftForeman: (z, k) => 75  * Math.pow(40, shaftTier(z, k)),
  elevSpeed:    (z) => 30  * zoneCostScale(z) * Math.pow(1.18, state.zones[z].elevator.speedLevel - 1),
  elevCap:      (z) => 50  * zoneCostScale(z) * Math.pow(1.22, state.zones[z].elevator.capLevel - 1),
  elevAuto:     (z) => 175 * zoneCostScale(z),
  workerSpeed:  (z) => 20  * zoneCostScale(z) * Math.pow(1.15, state.zones[z].worker.speedLevel - 1),
  workerCap:    (z) => 40  * zoneCostScale(z) * Math.pow(1.22, state.zones[z].worker.capLevel - 1),
  workerAuto:   (z) => 100 * zoneCostScale(z),
  procSpeed:    (z) => 60  * zoneCostScale(z) * Math.pow(1.20, state.zones[z].processor.speedLevel - 1),
  procValue:    (z) => 120 * zoneCostScale(z) * Math.pow(1.30, state.zones[z].processor.valueLevel - 1),
  procParallel: (z) => 800 * zoneCostScale(z) * Math.pow(2.0, state.zones[z].processor.parallelLevel - 1),
  procAuto:     (z) => 600 * zoneCostScale(z),
};

// ---------- NUMBER FORMAT ----------
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n !== Math.floor(n) ? n.toFixed(1) : Math.floor(n).toString();
  let i = 0; let v = n;
  while (v >= 1000 && i < SUFFIXES.length - 1) { v /= 1000; i++; }
  return v.toFixed(2) + SUFFIXES[i];
}
function fmtTime(s) {
  if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + Math.floor(s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
}
// Display cycle time as "X / cycle" or, once cycles are sub-second, as a
// throughput rate so the late-game number stays meaningful.
function fmtCycleRate(t) {
  if (t >= 1) return t.toFixed(t < 10 ? 1 : 0) + 's / ore';
  return fmt(1 / t) + ' ore/s';
}

// ---------- SIM TICK ----------
function tick(dt) {
  for (let z = 0; z < ZONE_DEFS.length; z++) {
    if (state.zonesUnlocked[z]) tickZone(z, dt);
  }
  tickBuffs();
  if (!_offlineCatchup) tickArtifacts();
}

// Drop expired buffs once they pass their expiry.
function tickBuffs() {
  if (!state.activeBuffs || state.activeBuffs.length === 0) return;
  const now = Date.now();
  let changed = false;
  for (let i = state.activeBuffs.length - 1; i >= 0; i--) {
    if (state.activeBuffs[i].expiresAt <= now) {
      state.activeBuffs.splice(i, 1);
      changed = true;
    }
  }
  if (changed) refreshBuffsUI();
}

let _activeArtifact = null;
function tickArtifacts() {
  const now = Date.now();
  if (_activeArtifact && now > _activeArtifact.despawnAt) removeArtifact();
  if (state.nextArtifactAt && now >= state.nextArtifactAt && !_activeArtifact) {
    spawnArtifact();
    state.nextArtifactAt = now + 30000 + Math.random() * 60000; // 30-90s
  }
}

function tickZone(z, dt) {
  const zone = state.zones[z];
  // mining — progress accumulates for both auto and manual shafts so the
  // visible cycle bar fills naturally. Auto drains progress into ore via
  // closed-form math; manual caps progress at one cycle and waits for a
  // click to yield, so spamming clicks can't bypass mineTime.
  for (let k = 0; k < zone.shafts.length; k++) {
    const s = zone.shafts[k];
    if (!s.unlocked) continue;
    const cap = shaftOreCap(z, k);
    if (s.ore >= cap) { s.progress = 0; continue; }
    s.progress += dt;
    const t = shaftMineTime(z, k);
    if (s.autoMine) {
      if (s.progress >= t) {
        const yld = shaftYieldPerCycle(z, k);
        const slots = Math.floor(s.progress / t);
        const slotsNeeded = Math.ceil((cap - s.ore) / yld);
        const used = Math.min(slots, slotsNeeded);
        s.progress -= used * t;
        s.ore = Math.min(cap, s.ore + used * yld);
      }
    } else if (s.progress > t) {
      s.progress = t;
    }
    if (s.ore >= cap) s.progress = 0;
  }

  // elevator
  const ev = zone.elevator;
  if (ev.stateName === 'idle' && (ev.auto || ev.manualTrip)) {
    if (ev.cargo > 0) { ev.target = 0; ev.stateName = 'ascending'; }
    else {
      const idx = bestShaftWithOre(z);
      if (idx >= 0) { ev.target = idx + 1; ev.stateName = 'descending'; }
      else if (ev.manualTrip) ev.manualTrip = false;
    }
  }
  if (ev.stateName === 'descending' || ev.stateName === 'ascending') {
    const dir = ev.target > ev.pos ? 1 : -1;
    ev.pos += dir * elevatorSpeed(z) * dt;
    if ((dir > 0 && ev.pos >= ev.target) || (dir < 0 && ev.pos <= ev.target)) {
      ev.pos = ev.target;
      ev.timer = 0;
      ev.stateName = ev.target === 0 ? 'unloading' : 'loading';
      if (z === state.currentZone) spawnPuff('elevator', ev.target === 0 ? 'top' : 'bottom');
    }
  } else if (ev.stateName === 'loading') {
    ev.timer += dt;
    if (ev.timer >= 0.25) {
      const k = Math.round(ev.pos) - 1;
      if (k >= 0 && k < zone.shafts.length) {
        const space = elevatorCap(z) - ev.cargo;
        const take = Math.min(space, zone.shafts[k].ore);
        ev.cargo += take;
        zone.shafts[k].ore -= take;
        if (take > 0 && z === state.currentZone) {
          spawnOreTransfer(refs.shafts[k] && refs.shafts[k].ore, $('elev-cargo'), take);
        }
      }
      ev.stateName = 'idle';
    }
  } else if (ev.stateName === 'unloading') {
    ev.timer += dt;
    if (ev.timer >= 0.25) {
      const dropped = ev.cargo;
      zone.surfaceDropoff += ev.cargo;
      ev.cargo = 0;
      ev.stateName = 'idle';
      ev.manualTrip = false;
      if (dropped > 0 && z === state.currentZone) {
        spawnOreTransfer($('elev-cargo'), $('dropoff-count'), dropped);
      }
    }
  }

  // worker
  const w = zone.worker;
  if (w.stateName === 'idle' && (w.auto || w.manualTrip)) {
    if (w.cargo > 0) { w.target = 1; w.stateName = 'walking_to_proc'; }
    else if (zone.surfaceDropoff > 0 && w.pos === 0) { w.timer = 0; w.stateName = 'pickup'; }
    else if (zone.surfaceDropoff > 0 && w.pos !== 0) { w.target = 0; w.stateName = 'walking_back'; }
    else if (w.manualTrip) w.manualTrip = false;
  }
  if (w.stateName === 'walking_to_proc' || w.stateName === 'walking_back') {
    const dir = w.target > w.pos ? 1 : -1;
    w.pos += dir * workerSpeed(z) * dt;
    if ((dir > 0 && w.pos >= w.target) || (dir < 0 && w.pos <= w.target)) {
      w.pos = w.target;
      if (w.target === 1) { w.timer = 0; w.stateName = 'dropoff'; }
      else { w.stateName = 'idle'; }
    }
  } else if (w.stateName === 'pickup') {
    w.timer += dt;
    if (w.timer >= 0.25) {
      const take = Math.min(workerCap(z) - w.cargo, zone.surfaceDropoff);
      w.cargo += take;
      zone.surfaceDropoff -= take;
      w.stateName = 'idle';
    }
  } else if (w.stateName === 'dropoff') {
    w.timer += dt;
    if (w.timer >= 0.25) {
      zone.processor.buffer += w.cargo;
      w.cargo = 0;
      w.stateName = 'idle';
      w.manualTrip = false;
    }
  }

  // processor — auto drains progress into ore (closed-form math); manual caps
  // at one cycle and waits for click. parallelLevel multiplies ores per cycle
  // so a higher-tier processor can match very high mining throughput.
  const p = zone.processor;
  if (p.buffer > 0) {
    p.progress += dt;
    const t = processorTime(z);
    if (p.auto) {
      if (p.progress >= t) {
        const par = processorParallel(z);
        const slots = Math.floor(p.progress / t);
        const ores = Math.min(slots * par, p.buffer);
        if (ores > 0) {
          const slotsUsed = Math.ceil(ores / par);
          p.progress -= slotsUsed * t;
          p.buffer -= ores;
          const earned = ores * processorValue(z);
          state.money += earned;
          if (z === state.currentZone) spawnMoney(earned);
        }
      }
    } else if (p.progress > t) {
      p.progress = t;
    }
  }
  if (p.buffer <= 0) p.progress = 0;
}

function bestShaftWithOre(z) {
  let best = -1, bestOre = 0;
  const shafts = state.zones[z].shafts;
  for (let k = 0; k < shafts.length; k++) {
    const s = shafts[k];
    if (s.unlocked && s.ore > bestOre) { best = k; bestOre = s.ore; }
  }
  return best;
}

// ---------- MANUAL CLICKS ----------
const POW_WORDS = ['WHACK!', 'BAM!', 'POW!', 'CLANG!', 'CRACK!', 'SMASH!', 'KAPOW!', 'BOOM!'];
function pickWord() { return POW_WORDS[Math.floor(Math.random() * POW_WORDS.length)]; }

function clickShaft(k) {
  const z = state.currentZone;
  const s = state.zones[z].shafts[k];
  if (!s.unlocked || s.autoMine) return;
  const cap = shaftOreCap(z, k);
  if (s.ore >= cap) return;
  pulseClick(refs.shafts[k].el);
  // The cycle bar must be full before a click yields ore — clicking faster
  // than mineTime simply animates with no payout.
  const t = shaftMineTime(z, k);
  if (s.progress < t) return;
  s.progress = 0;
  s.ore = Math.min(cap, s.ore + shaftYieldPerCycle(z, k));
  spawnPow(refs.shafts[k].el, pickWord());
}
function clickElevator() {
  const ev = state.zones[state.currentZone].elevator;
  if (ev.auto) return;
  ev.manualTrip = true;
  pulseClick($('elevator'));
}
function clickWorker() {
  const w = state.zones[state.currentZone].worker;
  if (w.auto) return;
  w.manualTrip = true;
  pulseClick($('worker'));
}
function clickProcessor() {
  const z = state.currentZone;
  const p = state.zones[z].processor;
  if (p.auto) return;
  if (p.buffer <= 0) return;
  pulseClick($('processor'));
  const t = processorTime(z);
  if (p.progress < t) return; // cycle bar must be full
  const par = processorParallel(z);
  const ores = Math.min(par, p.buffer);
  p.progress = 0;
  p.buffer -= ores;
  const earned = ores * processorValue(z);
  state.money += earned;
  spawnMoney(earned);
}

// ---------- COMIC FX ----------
function $(id) { return document.getElementById(id); }

function spawnPow(targetEl, text) {
  if (_offlineCatchup) return;
  const fx = $('fx');
  const el = document.createElement('div');
  el.className = 'fx-pow';
  el.textContent = text;
  const r = targetEl.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  el.style.left = (r.left - root.left + r.width * (0.3 + Math.random() * 0.4)) + 'px';
  el.style.top  = (r.top  - root.top  + r.height * (0.2 + Math.random() * 0.3)) + 'px';
  el.style.setProperty('--rot', (-15 + Math.random() * 30).toFixed(1) + 'deg');
  fx.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

let _moneyAccum = 0;
let _moneyLastFxAt = 0;
function spawnMoney(amount) {
  if (_offlineCatchup) return;
  _moneyAccum += amount;
  const now = performance.now();
  if (now - _moneyLastFxAt < 250) return;
  _moneyLastFxAt = now;
  const fx = $('fx');
  if (fx.children.length > 30) { _moneyAccum = 0; return; }
  const proc = $('processor');
  const el = document.createElement('div');
  el.className = 'fx-money';
  el.textContent = '+$' + fmt(_moneyAccum);
  _moneyAccum = 0;
  const r = proc.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  el.style.left = (r.left - root.left + r.width / 2 + (Math.random() * 20 - 10)) + 'px';
  el.style.top  = (r.top  - root.top  + 10) + 'px';
  fx.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function spawnOreTransfer(fromEl, toEl, amount) {
  if (_offlineCatchup) return;
  if (!fromEl || !toEl) return;
  const fx = $('fx');
  if (fx.children.length > 30) {
    if (toEl) { toEl.classList.remove('cargo-pulse'); void toEl.offsetWidth; toEl.classList.add('cargo-pulse'); }
    return;
  }
  const fromR = fromEl.getBoundingClientRect();
  const toR   = toEl.getBoundingClientRect();
  const root  = fx.getBoundingClientRect();
  const count = Math.min(6, Math.max(2, Math.floor(amount / 2)));
  for (let kk = 0; kk < count; kk++) {
    const el = document.createElement('div');
    el.className = 'fx-ore';
    const startX = fromR.left - root.left + fromR.width / 2 + (Math.random() * 18 - 9);
    const startY = fromR.top  - root.top  + fromR.height / 2;
    const endX   = toR.left   - root.left + toR.width / 2  + (Math.random() * 14 - 7);
    const endY   = toR.top    - root.top  + toR.height / 2;
    el.style.left = startX + 'px';
    el.style.top  = startY + 'px';
    el.style.setProperty('--dx', (endX - startX) + 'px');
    el.style.setProperty('--dy', (endY - startY) + 'px');
    el.style.animationDelay = (kk * 0.06) + 's';
    fx.appendChild(el);
    setTimeout(() => el.remove(), 900 + kk * 60);
  }
  toEl.classList.remove('cargo-pulse');
  void toEl.offsetWidth;
  toEl.classList.add('cargo-pulse');
}

function spawnPuff(target, where) {
  if (_offlineCatchup) return;
  const fx = $('fx');
  const el = document.createElement('div');
  el.className = 'fx-puff';
  const targetEl = $(target);
  if (!targetEl) return;
  const r = targetEl.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  el.style.left = (r.left - root.left + r.width / 2) + 'px';
  el.style.top  = (r.top  - root.top  + (where === 'top' ? 0 : r.height)) + 'px';
  fx.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

function pulseClick(el) {
  el.classList.remove('click-pulse');
  void el.offsetWidth;
  el.classList.add('click-pulse');
}

// ---------- ARTIFACTS ----------
function pickRandomBuffType() { return BUFF_TYPES[Math.floor(Math.random() * BUFF_TYPES.length)]; }

function spawnArtifact() {
  // Pick a random unlocked shaft in the current zone to anchor the spawn over.
  const z = state.currentZone;
  const unlockedKs = [];
  for (let k = 0; k < state.zones[z].shafts.length; k++) {
    if (state.zones[z].shafts[k].unlocked && refs.shafts[k]) unlockedKs.push(k);
  }
  if (unlockedKs.length === 0) return;
  const k = unlockedKs[Math.floor(Math.random() * unlockedKs.length)];
  const shaftEl = refs.shafts[k].tunnel;
  const buff = pickRandomBuffType();

  const fx = $('fx');
  const r = shaftEl.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  const el = document.createElement('button');
  el.className = 'artifact';
  el.dataset.buff = buff.id;
  el.title = `${buff.label} — tap to collect`;
  el.innerHTML = `<span class="artifact-icon">${buff.icon}</span><span class="artifact-glow"></span>`;
  el.style.left = (r.left - root.left + r.width * (0.2 + Math.random() * 0.6)) + 'px';
  el.style.top  = (r.top  - root.top  + r.height * (0.1 + Math.random() * 0.4)) + 'px';
  el.addEventListener('click', (e) => { e.stopPropagation(); collectArtifact(buff); });
  fx.appendChild(el);

  _activeArtifact = { el, despawnAt: Date.now() + 18000 };
}

function removeArtifact() {
  if (!_activeArtifact) return;
  if (_activeArtifact.el && _activeArtifact.el.parentNode) {
    _activeArtifact.el.classList.add('despawning');
    const dyingEl = _activeArtifact.el;
    setTimeout(() => dyingEl.remove(), 300);
  }
  _activeArtifact = null;
}

function collectArtifact(buff) {
  if (!_activeArtifact) return;
  const proto = buffByType(buff.id);
  if (!proto) return;
  state.activeBuffs.push({
    type: proto.id,
    multiplier: proto.multiplier,
    expiresAt: Date.now() + proto.duration,
    icon: proto.icon,
    label: proto.label,
  });
  // little reward burst at the artifact location
  const fx = $('fx');
  const root = fx.getBoundingClientRect();
  const r = _activeArtifact.el.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const sp = document.createElement('div');
    sp.className = 'fx-spark';
    sp.style.left = (r.left - root.left + r.width / 2) + 'px';
    sp.style.top  = (r.top  - root.top  + r.height / 2) + 'px';
    sp.style.setProperty('--ang', (i * 45) + 'deg');
    fx.appendChild(sp);
    setTimeout(() => sp.remove(), 700);
  }
  spawnPow(_activeArtifact.el, '+ ' + proto.label.toUpperCase());
  removeArtifact();
  refreshBuffsUI();
  saveSoon();
}

function refreshBuffsUI() {
  const root = $('buffs-bar');
  if (!root) return;
  root.innerHTML = '';
  if (!state.activeBuffs || state.activeBuffs.length === 0) return;
  // Group identical-type buffs into a single chip with a stack count, so a
  // dozen overlapping pickups don't fill the HUD.
  const grouped = new Map();
  for (const b of state.activeBuffs) {
    if (!grouped.has(b.type)) grouped.set(b.type, []);
    grouped.get(b.type).push(b);
  }
  for (const [typeId, list] of grouped) {
    const def = buffByType(typeId);
    const totalMul = list.reduce((m, b) => m * b.multiplier, 1);
    const maxExpiry = Math.max(...list.map(b => b.expiresAt));
    const chip = document.createElement('div');
    chip.className = 'buff-chip';
    chip.innerHTML = `
      <span class="buff-icon">${def.icon}</span>
      <span class="buff-mul">×${totalMul.toFixed(totalMul < 10 ? 1 : 0)}</span>
      <span class="buff-time" data-expires="${maxExpiry}">·</span>
    `;
    if (list.length > 1) {
      const stack = document.createElement('span');
      stack.className = 'buff-stack';
      stack.textContent = list.length + '×';
      chip.appendChild(stack);
    }
    root.appendChild(chip);
  }
}

// ---------- DOM REFS ----------
const refs = { shafts: [], upgrades: {}, tabs: [] };

// ---------- BUILD TABS ----------
function buildTabs() {
  const root = $('zone-tabs');
  root.innerHTML = '';
  refs.tabs = new Array(ZONE_DEFS.length).fill(null);
  for (let z = 0; z < ZONE_DEFS.length; z++) {
    const def = ZONE_DEFS[z];
    const unlocked = state.zonesUnlocked[z];
    const tab = document.createElement('button');
    tab.className = 'zone-tab';
    tab.dataset.zone = def.id;
    if (z === state.currentZone) tab.classList.add('active');
    if (!unlocked) tab.classList.add('locked');
    let html = `<span class="zt-icon">${def.icon}</span><span class="zt-name">${def.name}</span>`;
    if (!unlocked) html += `<span class="zt-cost">$${fmt(def.unlockCost)}</span>`;
    else html += `<span class="zt-rate" id="zt-rate-${z}">·</span>`;
    tab.innerHTML = html;
    tab.addEventListener('click', () => {
      if (!state.zonesUnlocked[z]) tryUnlockZone(z);
      else switchZone(z);
    });
    root.appendChild(tab);
    refs.tabs[z] = { el: tab, rate: tab.querySelector(`#zt-rate-${z}`) };
  }
}

function switchZone(z) {
  if (!state.zonesUnlocked[z]) return;
  state.currentZone = z;
  $('scene-bg').dataset.zone = ZONE_DEFS[z].id;
  buildShafts();
  buildUpgradesPanel();
  buildTabs();
  saveSoon();
}

function tryUnlockZone(z) {
  const def = ZONE_DEFS[z];
  if (state.money < def.unlockCost) return;
  state.money -= def.unlockCost;
  state.zonesUnlocked[z] = true;
  buildTabs();
  switchZone(z);
}

// ---------- BUILD SHAFTS DOM (for current zone) ----------
// Returns ordered rows: { type: 'shaft', k } | { type: 'barrier' }. Reveals
// rows up to the first locked shaft; if all four pre-barrier shafts are
// unlocked and the mid-barrier isn't cleared, the barrier row is shown next
// (and post-barrier shafts remain hidden until it's cleared).
function getVisibleShaftRows() {
  const z = state.currentZone;
  const zone = state.zones[z];
  const shafts = zone.shafts;
  const rows = [];
  for (let k = 0; k < shafts.length; k++) {
    if (k === 4) {
      if (!zone.midBarrier.cleared) {
        rows.push({ type: 'barrier' });
        return rows;
      }
    }
    rows.push({ type: 'shaft', k });
    if (!shafts[k].unlocked) break;
  }
  return rows;
}

function buildShafts() {
  const z = state.currentZone;
  const root = $('shafts');
  root.innerHTML = '';
  refs.shafts = new Array(state.zones[z].shafts.length).fill(null);

  refs.midBarrier = null;
  const rows = getVisibleShaftRows();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.type === 'barrier') {
      const bdef = ZONE_DEFS[z].midBarrier;
      const el = document.createElement('div');
      el.className = 'barrier';
      el.dataset.zone = ZONE_DEFS[z].id;
      el.innerHTML = `
        <div class="barrier-tunnel">
          <div class="barrier-icon">${bdef.icon}</div>
          <div class="barrier-info">
            <div class="barrier-name">${bdef.name}</div>
            <div class="barrier-desc">${bdef.desc}</div>
          </div>
          <div class="barrier-action">Clear — <span class="barrier-cost">$${fmt(bdef.cost)}</span></div>
        </div>
        <div class="shaft-label">Blocked</div>
      `;
      root.appendChild(el);
      const tunnel = el.querySelector('.barrier-tunnel');
      refs.midBarrier = {
        el, tunnel, rowIndex: r,
        cost: el.querySelector('.barrier-cost'),
        action: el.querySelector('.barrier-action'),
      };
      tunnel.addEventListener('click', () => tryClearMidBarrier());
      continue;
    }
    const k = row.k;
    const s = state.zones[z].shafts[k];
    const def = SHAFT_DEFS[gIdx(z, k)];
    const el = document.createElement('div');
    el.className = 'shaft' + (s.unlocked ? '' : ' locked');
    el.dataset.shaft = k;
    el.dataset.zone = ZONE_DEFS[z].id;
    el.innerHTML = `
      <div class="shaft-tunnel">
        <div class="miners"></div>
        <div class="mine-progress"><div class="mine-progress-fill"></div></div>
        <div class="ore-pile">0</div>
        <div class="locked-overlay">🔒 Unlock ${def.name} — $${fmt(def.unlockCost)}</div>
      </div>
      <div class="shaft-label">${def.name}</div>
    `;
    root.appendChild(el);
    const tunnel = el.querySelector('.shaft-tunnel');
    refs.shafts[k] = {
      el, tunnel, rowIndex: r,
      miners: el.querySelector('.miners'),
      bar: el.querySelector('.mine-progress-fill'),
      ore: el.querySelector('.ore-pile'),
      lock: el.querySelector('.locked-overlay'),
      lastMinerLevel: -1,
    };
    if (s.unlocked) {
      tunnel.addEventListener('click', () => clickShaft(k));
    } else {
      refs.shafts[k].lock.addEventListener('click', () => tryUnlockShaft(k));
    }
  }
  appendZoneGateway(root, z);
  updateUndergroundHeight();
  for (let k = 0; k < refs.shafts.length; k++) {
    if (refs.shafts[k] && state.zones[z].shafts[k].unlocked) rebuildMiners(k);
  }
}

// Once every shaft of the current zone is unlocked, render a "gateway" row
// at the bottom that points to the next zone — either a clickable unlock
// prompt (mirrors the old barrier pattern) or a switch-to-zone link if it's
// already unlocked. This makes zone progression discoverable from inside
// the scene, not only via the tab strip.
function appendZoneGateway(root, z) {
  const allUnlocked = state.zones[z].shafts.every(s => s.unlocked);
  if (!allUnlocked) return;
  const nextZ = z + 1;
  if (nextZ >= ZONE_DEFS.length) return;
  const nextDef = ZONE_DEFS[nextZ];
  const unlocked = state.zonesUnlocked[nextZ];

  const el = document.createElement('div');
  el.className = 'zone-gateway' + (unlocked ? ' unlocked' : '');
  el.dataset.zone = nextDef.id;
  if (unlocked) {
    el.innerHTML = `
      <div class="gateway-tunnel">
        <div class="gateway-icon">${nextDef.icon}</div>
        <div class="gateway-info">
          <div class="gateway-name">Travel to ${nextDef.name}</div>
          <div class="gateway-sub">Already unlocked — switch zones</div>
        </div>
        <div class="gateway-arrow">→</div>
      </div>
    `;
    el.addEventListener('click', () => switchZone(nextZ));
  } else {
    el.innerHTML = `
      <div class="gateway-tunnel locked">
        <div class="gateway-icon">${nextDef.icon}</div>
        <div class="gateway-info">
          <div class="gateway-name">Unlock ${nextDef.name}</div>
          <div class="gateway-sub">A new mine awaits — its own pipeline</div>
        </div>
        <div class="gateway-cost">$${fmt(nextDef.unlockCost)}</div>
      </div>
    `;
    el.addEventListener('click', () => tryUnlockZone(nextZ));
  }
  root.appendChild(el);
}

function updateUndergroundHeight() {
  const z = state.currentZone;
  const rowCount = getVisibleShaftRows().length;
  const allUnlocked = state.zones[z].shafts.every(s => s.unlocked);
  const hasGateway = allUnlocked && z < ZONE_DEFS.length - 1;
  const totalRows = rowCount + (hasGateway ? 1 : 0);
  const h = 30 + totalRows * 100;
  document.querySelector('.underground').style.minHeight = h + 'px';
}

function tryUnlockShaft(k) {
  const z = state.currentZone;
  const def = SHAFT_DEFS[gIdx(z, k)];
  if (state.money < def.unlockCost) return;
  state.money -= def.unlockCost;
  state.zones[z].shafts[k].unlocked = true;
  buildShafts();
  buildUpgradesPanel();
  saveSoon();
}

function tryClearMidBarrier() {
  const z = state.currentZone;
  const zone = state.zones[z];
  const def = ZONE_DEFS[z].midBarrier;
  if (zone.midBarrier.cleared) return;
  if (state.money < def.cost) return;
  state.money -= def.cost;
  zone.midBarrier.cleared = true;
  // The first post-barrier shaft auto-unlocks for free, like zone-entry.
  if (zone.shafts[4] && !zone.shafts[4].unlocked) zone.shafts[4].unlocked = true;
  if (refs.midBarrier && refs.midBarrier.el) spawnPow(refs.midBarrier.el, 'CLEARED!');
  buildShafts();
  buildUpgradesPanel();
  saveSoon();
}

// ---------- UPGRADES (current zone) ----------
function getUpgradeDefs() {
  const z = state.currentZone;
  const zone = state.zones[z];
  const defs = [];

  for (let k = 0; k < zone.shafts.length; k++) {
    if (!zone.shafts[k].unlocked) continue;
    const localK = k;
    const sdef = SHAFT_DEFS[gIdx(z, k)];
    defs.push({ section: sdef.name });
    defs.push({
      id: `s${k}_mine`, name: 'Mining Speed',
      get: () => zone.shafts[localK].mineLevel,
      eff: () => fmtTime(shaftMineTime(z, localK)) + ' / cycle',
      cost: () => COSTS.shaftMine(z, localK),
      buy:  () => zone.shafts[localK].mineLevel++,
    });
    defs.push({
      id: `s${k}_cap`, name: 'Shaft Capacity',
      get: () => zone.shafts[localK].capLevel,
      eff: () => 'cap ' + fmt(shaftOreCap(z, localK)),
      cost: () => COSTS.shaftCap(z, localK),
      buy:  () => zone.shafts[localK].capLevel++,
    });
    defs.push({
      id: `s${k}_miner`, name: 'Hire Miner',
      get: () => zone.shafts[localK].minerLevel,
      eff: () => shaftMinerCount(z, localK) + ' miners (' + fmt(shaftYieldPerCycle(z, localK)) + ' ore/cycle)',
      cost: () => COSTS.shaftMiner(z, localK),
      buy:  () => { zone.shafts[localK].minerLevel++; rebuildMiners(localK); },
    });
    if (!zone.shafts[k].autoMine) {
      defs.push({
        id: `s${k}_foreman`, name: '👷 Hire Foreman', oneShot: true,
        eff: () => 'Auto-mines this shaft',
        cost: () => COSTS.shaftForeman(z, localK),
        buy:  () => { zone.shafts[localK].autoMine = true; },
      });
    }
  }

  defs.push({ section: 'Elevator' });
  defs.push({ id: 'elev_speed', name: 'Elevator Speed', get: () => zone.elevator.speedLevel, eff: () => fmt(elevatorSpeed(z)) + ' shafts/s', cost: () => COSTS.elevSpeed(z), buy: () => zone.elevator.speedLevel++ });
  defs.push({ id: 'elev_cap',   name: 'Elevator Capacity', get: () => zone.elevator.capLevel, eff: () => 'cap ' + fmt(elevatorCap(z)), cost: () => COSTS.elevCap(z), buy: () => zone.elevator.capLevel++ });
  if (!zone.elevator.auto) {
    defs.push({ id: 'elev_auto', name: '🎩 Hire Operator', oneShot: true, eff: () => 'Auto-runs the elevator', cost: () => COSTS.elevAuto(z), buy: () => { zone.elevator.auto = true; } });
  }

  defs.push({ section: 'Surface Worker' });
  defs.push({ id: 'worker_speed', name: 'Worker Speed', get: () => zone.worker.speedLevel, eff: () => fmt(workerSpeed(z)) + ' /s', cost: () => COSTS.workerSpeed(z), buy: () => zone.worker.speedLevel++ });
  defs.push({ id: 'worker_cap',   name: 'Worker Capacity', get: () => zone.worker.capLevel, eff: () => 'cap ' + fmt(workerCap(z)), cost: () => COSTS.workerCap(z), buy: () => zone.worker.capLevel++ });
  if (!zone.worker.auto) {
    defs.push({ id: 'worker_auto', name: '👷 Hire Hauler', oneShot: true, eff: () => 'Auto-hauls ore to the processor', cost: () => COSTS.workerAuto(z), buy: () => { zone.worker.auto = true; } });
  }

  defs.push({ section: 'Processor' });
  defs.push({ id: 'proc_speed', name: 'Processing Speed', get: () => zone.processor.speedLevel, eff: () => fmtCycleRate(processorTime(z)), cost: () => COSTS.procSpeed(z), buy: () => zone.processor.speedLevel++ });
  defs.push({ id: 'proc_value', name: 'Ore Value',        get: () => zone.processor.valueLevel, eff: () => '$' + fmt(processorValue(z)) + ' / ore', cost: () => COSTS.procValue(z), buy: () => zone.processor.valueLevel++ });
  defs.push({ id: 'proc_par',   name: 'Parallel Processing', get: () => zone.processor.parallelLevel, eff: () => fmt(processorParallel(z)) + ' ore / cycle', cost: () => COSTS.procParallel(z), buy: () => zone.processor.parallelLevel++ });
  if (!zone.processor.auto) {
    defs.push({ id: 'proc_auto', name: '🤖 Hire Operator', oneShot: true, eff: () => 'Auto-processes ore', cost: () => COSTS.procAuto(z), buy: () => { zone.processor.auto = true; } });
  }

  return defs;
}

function buildUpgradesPanel() {
  const root = $('upgrades');
  root.innerHTML = '';
  refs.upgrades = {};
  const defs = getUpgradeDefs();
  for (const def of defs) {
    if (def.section) {
      const h = document.createElement('div');
      h.className = 'section-title';
      h.textContent = def.section;
      root.appendChild(h);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'upgrade' + (def.oneShot ? ' upgrade-manager' : '');
    el.innerHTML = `
      <div class="upgrade-name">${def.name} <span class="upgrade-lv"></span></div>
      <div class="upgrade-effect"></div>
      <div class="upgrade-cost"></div>
    `;
    el.addEventListener('click', () => buyUpgrade(def));
    root.appendChild(el);
    refs.upgrades[def.id] = {
      el,
      lv:   el.querySelector('.upgrade-lv'),
      eff:  el.querySelector('.upgrade-effect'),
      cost: el.querySelector('.upgrade-cost'),
      def,
    };
  }
}

function buyUpgrade(def) {
  const cost = def.cost();
  if (state.money < cost) return;
  state.money -= cost;
  def.buy();
  if (def.oneShot) buildUpgradesPanel();
  saveSoon();
}

// ---------- CHARACTER SVGs ----------
function minerSVG() {
  return `<svg class="char-miner" viewBox="0 0 40 50" width="32" height="40" preserveAspectRatio="xMidYMid meet">
    <rect x="13" y="36" width="6" height="12" fill="#3a2a1a" rx="1"/>
    <rect x="21" y="36" width="6" height="12" fill="#3a2a1a" rx="1"/>
    <ellipse cx="16" cy="48" rx="4" ry="2" fill="#1a1410"/>
    <ellipse cx="24" cy="48" rx="4" ry="2" fill="#1a1410"/>
    <path d="M 11 22 L 11 38 L 29 38 L 29 22 Z" fill="#3a6aa0" stroke="#1a1a1a" stroke-width="0.8"/>
    <path d="M 12 22 L 28 22 L 28 28 L 12 28 Z" fill="#c04535"/>
    <rect x="14" y="22" width="2" height="10" fill="#2a4a78"/>
    <rect x="24" y="22" width="2" height="10" fill="#2a4a78"/>
    <rect x="17" y="30" width="6" height="4" fill="#2a4a78" rx="0.5"/>
    <rect x="18" y="20" width="4" height="3" fill="#f5d4a0"/>
    <circle cx="20" cy="14" r="7" fill="#f5d4a0" stroke="#1a1a1a" stroke-width="0.8"/>
    <circle cx="13" cy="15" r="1.5" fill="#e5c490"/>
    <circle cx="27" cy="15" r="1.5" fill="#e5c490"/>
    <ellipse cx="20" cy="10" rx="10" ry="2" fill="#d49500" stroke="#1a1a1a" stroke-width="0.6"/>
    <path d="M 13 10 Q 20 1 27 10 Z" fill="#f5b400" stroke="#1a1a1a" stroke-width="0.6"/>
    <rect x="15" y="9" width="10" height="2" fill="#a87000"/>
    <circle cx="20" cy="9.5" r="1.5" fill="#fff7c0" stroke="#a87000" stroke-width="0.4"/>
    <circle cx="17" cy="14" r="1.1" fill="#1a1a1a"/>
    <circle cx="22" cy="14" r="1.1" fill="#1a1a1a"/>
    <ellipse cx="19.5" cy="16.5" rx="0.8" ry="0.5" fill="#d4a47a"/>
    <path d="M 16 18 Q 20 20 24 18" stroke="#5a3a2a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <rect x="7" y="22" width="3.5" height="11" fill="#3a6aa0" stroke="#1a1a1a" stroke-width="0.5" rx="1"/>
    <g class="miner-arm">
      <rect x="28" y="22" width="13" height="4" fill="#f5d4a0" stroke="#1a1a1a" stroke-width="0.5" rx="1.5"/>
      <rect x="40" y="12" width="1.6" height="14" fill="#5a3520"/>
      <path d="M 37 12 L 46 10 L 46 14 L 37 16 Z" fill="#9a9a9a" stroke="#1a1a1a" stroke-width="0.5"/>
      <path d="M 46 10 L 46 14 L 48 13 Z" fill="#777" stroke="#1a1a1a" stroke-width="0.4"/>
    </g>
  </svg>`;
}

function haulerSVG() {
  return `<svg class="char-hauler" viewBox="0 0 40 50" width="40" height="48" preserveAspectRatio="xMidYMid meet">
    <g class="leg leg-left"><rect x="13" y="36" width="6" height="12" fill="#3a2a1a" rx="1"/><ellipse cx="16" cy="48" rx="4" ry="2" fill="#1a1410"/></g>
    <g class="leg leg-right"><rect x="21" y="36" width="6" height="12" fill="#3a2a1a" rx="1"/><ellipse cx="24" cy="48" rx="4" ry="2" fill="#1a1410"/></g>
    <path d="M 11 22 L 11 38 L 29 38 L 29 22 Z" fill="#5a4a30" stroke="#1a1a1a" stroke-width="0.8"/>
    <path d="M 12 22 L 28 22 L 28 28 L 12 28 Z" fill="#7a3520"/>
    <rect x="6" y="22" width="3.5" height="13" fill="#7a3520" stroke="#1a1a1a" stroke-width="0.5" rx="1"/>
    <rect x="30.5" y="22" width="3.5" height="13" fill="#7a3520" stroke="#1a1a1a" stroke-width="0.5" rx="1"/>
    <rect x="18" y="20" width="4" height="3" fill="#f5d4a0"/>
    <circle cx="20" cy="14" r="6.5" fill="#f5d4a0" stroke="#1a1a1a" stroke-width="0.8"/>
    <ellipse cx="20" cy="10" rx="9" ry="2" fill="#d49500" stroke="#1a1a1a" stroke-width="0.6"/>
    <path d="M 13 10 Q 20 2 27 10 Z" fill="#f5b400" stroke="#1a1a1a" stroke-width="0.6"/>
    <rect x="15" y="9" width="10" height="2" fill="#a87000"/>
    <circle cx="17" cy="14" r="1" fill="#1a1a1a"/>
    <circle cx="22" cy="14" r="1" fill="#1a1a1a"/>
    <path d="M 17 18 Q 20 20 23 18" stroke="#3a1a0a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <g class="sack">
      <ellipse cx="32" cy="18" rx="7" ry="6" fill="#8a6a40" stroke="#1a1a1a" stroke-width="0.8"/>
      <path d="M 28 12 Q 32 9 36 12" stroke="#1a1a1a" stroke-width="0.8" fill="none"/>
      <text x="32" y="21" text-anchor="middle" font-family="Impact, sans-serif" font-size="9" font-weight="900" fill="#fff7a0" stroke="#1a1a1a" stroke-width="0.4">$</text>
    </g>
  </svg>`;
}

function rebuildMiners(k) {
  const r = refs.shafts[k];
  if (!r) return;
  const z = state.currentZone;
  const count = shaftMinerCount(z, k);
  const visible = Math.min(5, count);
  let html = '';
  for (let kk = 0; kk < visible; kk++) {
    html += `<div class="miner-slot" style="animation-delay: ${(kk * 0.12).toFixed(2)}s">${minerSVG()}</div>`;
  }
  if (count > 5) html += `<div class="miner-extra">×${count}</div>`;
  r.miners.innerHTML = html;
  r.lastMinerLevel = state.zones[z].shafts[k].minerLevel;
}

// ---------- RENDER ----------
function setText(el, txt) {
  if (el && el._lt !== txt) { el.textContent = txt; el._lt = txt; }
}
function setStyle(el, prop, val) {
  if (!el) return;
  const k = '_s_' + prop;
  if (el[k] !== val) { el.style[prop] = val; el[k] = val; }
}

function render() {
  setText($('money'), fmt(state.money));
  setText($('rate'), '$' + fmt(currentRate()));

  // buff timer countdowns — update each frame so chips visibly drain
  const buffsBar = $('buffs-bar');
  if (buffsBar && buffsBar.children.length) {
    const now = Date.now();
    for (const chip of buffsBar.children) {
      const timeEl = chip.querySelector('.buff-time');
      if (!timeEl) continue;
      const expires = parseInt(timeEl.dataset.expires, 10);
      const remaining = Math.max(0, Math.ceil((expires - now) / 1000));
      setText(timeEl, remaining + 's');
    }
  }

  const z = state.currentZone;
  const zone = state.zones[z];

  // tabs — affordability cue + active state
  for (let zz = 0; zz < ZONE_DEFS.length; zz++) {
    const t = refs.tabs[zz];
    if (!t) continue;
    t.el.classList.toggle('active', zz === z);
    if (!state.zonesUnlocked[zz]) {
      t.el.classList.toggle('afford', state.money >= ZONE_DEFS[zz].unlockCost);
    }
  }

  for (let k = 0; k < refs.shafts.length; k++) {
    const r = refs.shafts[k];
    if (!r) continue;
    const s = zone.shafts[k];
    if (s.unlocked) {
      r.el.classList.remove('locked');
      const cap = shaftOreCap(z, k);
      setText(r.ore, fmt(s.ore) + '/' + fmt(cap));
      // Bar shows ore-pile fill, not cycle progress — meaningful at any speed.
      setStyle(r.bar, 'width', Math.min(100, (s.ore / cap) * 100) + '%');
      // Tie miner-arm animation to mineTime so the swing tempo visibly tracks
      // mining speed at any level. Clamp so it stays readable.
      const t = shaftMineTime(z, k);
      const animDur = Math.max(0.08, Math.min(1.2, t)).toFixed(3) + 's';
      if (r._lastAnimDur !== animDur) {
        r.el.style.setProperty('--mine-anim-duration', animDur);
        r._lastAnimDur = animDur;
      }
      const mining = s.ore < cap;
      r.el.classList.toggle('mining', mining && s.autoMine);
      r.el.classList.toggle('manual', !s.autoMine);
      r.el.classList.toggle('full', s.ore >= cap);
      if (r.lastMinerLevel !== s.minerLevel) rebuildMiners(k);
    } else {
      r.el.classList.add('locked');
      const def = SHAFT_DEFS[gIdx(z, k)];
      const afford = state.money >= def.unlockCost;
      setText(r.lock, (afford ? '⛏ ' : '🔒 ') + 'Unlock ' + def.name + ' — $' + fmt(def.unlockCost));
      r.lock.classList.toggle('afford', afford);
    }
  }

  // elevator y-position from row indices
  const positions = [10];
  for (let k = 0; k < refs.shafts.length; k++) {
    const r = refs.shafts[k];
    if (r) positions.push(10 + 30 + r.rowIndex * 100 + 50);
    else positions.push(positions[positions.length - 1]);
  }
  const ev = zone.elevator;
  const evY = lerp(positions, ev.pos);
  setStyle($('elevator'), 'top', evY + 'px');
  const evCap = elevatorCap(z);
  setText($('elev-cargo'), fmt(ev.cargo) + '/' + fmt(evCap));
  setStyle($('elev-cargo'), 'opacity', ev.cargo > 0 ? '1' : '0.55');
  const fillPct = evCap > 0 ? Math.min(100, (ev.cargo / evCap) * 100) : 0;
  setStyle($('elev-fill'), 'height', fillPct + '%');
  $('elevator').classList.toggle('full', ev.cargo >= evCap && evCap > 0);
  $('elevator').classList.toggle('manual', !ev.auto);
  $('elevator').classList.toggle('idle', ev.stateName === 'idle');

  // worker
  const w = zone.worker;
  const walkPct = w.pos * 100;
  setStyle($('worker'), 'left', walkPct + '%');
  setStyle($('worker'), 'transform', `translateX(-${walkPct}%)`);
  setText($('worker-cargo'), fmt(w.cargo));
  const workerEl = $('worker');
  workerEl.classList.toggle('has-cargo', w.cargo > 0);
  workerEl.classList.toggle('idle', w.stateName === 'idle' || w.stateName === 'pickup' || w.stateName === 'dropoff');
  workerEl.classList.toggle('manual', !w.auto);

  // dropoff & processor
  setText($('dropoff-count'), fmt(zone.surfaceDropoff));
  const p = zone.processor;
  setText($('proc-buffer'), fmt(p.buffer) + ' ore');
  setStyle($('proc-bar'), 'width', (Math.min(1, p.progress / processorTime(z)) * 100) + '%');
  $('processor').classList.toggle('idle', p.buffer === 0);
  $('processor').classList.toggle('manual', !p.auto);

  // upgrades
  for (const id in refs.upgrades) {
    const u = refs.upgrades[id];
    setText(u.lv, u.def.get ? 'Lv ' + u.def.get() : '');
    setText(u.eff, u.def.eff());
    const cost = u.def.cost();
    setText(u.cost, '$' + fmt(cost));
    const afford = state.money >= cost;
    u.el.classList.toggle('disabled', !afford);
    u.el.classList.toggle('affordable', afford);
  }

  // detect when scene needs full rebuild (a new shaft unlocked, the
  // mid-barrier was cleared, or the zone-gateway row needs to appear/disappear)
  const allUnlocked = zone.shafts.every(s => s.unlocked);
  const wantGateway = allUnlocked && z < ZONE_DEFS.length - 1;
  const expectedRows = getVisibleShaftRows().length + (wantGateway ? 1 : 0);
  const renderedRows = $('shafts').children.length;
  if (renderedRows !== expectedRows) {
    buildShafts();
    buildUpgradesPanel();
  }
}

function lerp(positions, pos) {
  const a = Math.floor(pos);
  const b = Math.min(positions.length - 1, a + 1);
  const t = pos - a;
  return positions[a] * (1 - t) + positions[b] * t;
}

// ---------- SAVE / LOAD ----------
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 1000);
}
function saveNow() {
  state.lastTimestamp = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}

// Map a legacy save (single-mine state.shafts/elevator/...) into the new
// per-zone shape. Idempotent: returns data unchanged if already migrated.
function migrateLegacy(data) {
  if (data && data.zones) return data;
  const out = { ...data };
  const oldShafts = data.shafts || [];
  const oldBarriers = data.barriers || [];
  const oldElev   = data.elevator;
  const oldWorker = data.worker;
  const oldProc   = data.processor;
  const oldDrop   = data.surfaceDropoff || 0;

  // Sequential barriers: stop at first uncleared, since they gate progression.
  const activeZones = new Set([0]);
  for (let b = 0; b < oldBarriers.length; b++) {
    if (oldBarriers[b].cleared) activeZones.add(b + 1);
    else break;
  }

  out.zones = ZONE_DEFS.map((def, z) => {
    const zoneShafts = [];
    for (let k = 0; k < def.shaftCount; k++) {
      const gi = def.firstShaft + k;
      zoneShafts.push(oldShafts[gi] || (k === 0 ? { ...freshShaft(), unlocked: activeZones.has(z) } : freshShaft()));
    }
    if (z === 0 && k_oldHasPipeline(data)) {
      return {
        shafts: zoneShafts,
        elevator: oldElev ? { ...oldElev, cargo: 0, pos: 0, target: 0, stateName: 'idle', timer: 0, manualTrip: false } : freshElevator(),
        worker:   oldWorker ? { ...oldWorker, cargo: 0, pos: 0, target: 0, stateName: 'idle', timer: 0, manualTrip: false } : freshWorker(),
        processor: oldProc ? { ...oldProc, buffer: 0, progress: 0 } : freshProcessor(),
        surfaceDropoff: oldDrop,
      };
    }
    if (activeZones.has(z) && k_oldHasPipeline(data)) {
      // Carry zone-0's pipeline upgrades forward to zones the player had
      // already reached, so they don't lose progress in the migration.
      return {
        shafts: zoneShafts,
        elevator: oldElev ? { ...freshElevator(), speedLevel: oldElev.speedLevel, capLevel: oldElev.capLevel, auto: oldElev.auto } : freshElevator(),
        worker:   oldWorker ? { ...freshWorker(), speedLevel: oldWorker.speedLevel, capLevel: oldWorker.capLevel, auto: oldWorker.auto } : freshWorker(),
        processor: oldProc ? { ...freshProcessor(), speedLevel: oldProc.speedLevel, valueLevel: oldProc.valueLevel, auto: oldProc.auto } : freshProcessor(),
        surfaceDropoff: 0,
      };
    }
    return freshZone(z);
  });

  out.zonesUnlocked = ZONE_DEFS.map((_, z) => activeZones.has(z));
  out.currentZone = 0;

  delete out.shafts; delete out.barriers; delete out.elevator;
  delete out.worker; delete out.processor; delete out.surfaceDropoff;
  delete out.earnedRecent;
  return out;
}
function k_oldHasPipeline(data) { return data && (data.elevator || data.worker || data.processor); }

// Bring any saved zone shape up to current schema: pad shafts to shaftCount,
// add midBarrier and processor.parallelLevel if missing. Preserves all
// existing player data.
function migrateZoneShape(data) {
  if (!data || !data.zones) return data;
  for (let z = 0; z < ZONE_DEFS.length; z++) {
    const def = ZONE_DEFS[z];
    if (!data.zones[z]) data.zones[z] = freshZone(z);
    const zone = data.zones[z];
    if (!Array.isArray(zone.shafts)) zone.shafts = [];
    while (zone.shafts.length < def.shaftCount) zone.shafts.push(freshShaft());
    if (!zone.midBarrier) zone.midBarrier = { cleared: false };
    if (!zone.processor) zone.processor = freshProcessor();
    if (zone.processor.parallelLevel == null) zone.processor.parallelLevel = 1;
    if (!zone.elevator) zone.elevator = freshElevator();
    if (!zone.worker) zone.worker = freshWorker();
    if (zone.surfaceDropoff == null) zone.surfaceDropoff = 0;
  }
  return data;
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY) ||
              localStorage.getItem('idleminer_save_v4'); // pick up the previous key if user has one
  if (!raw) return false;
  try {
    let data = JSON.parse(raw);
    data = migrateLegacy(data);
    data = migrateZoneShape(data);
    state = Object.assign(freshState(), data);
    while (state.zones.length < ZONE_DEFS.length) state.zones.push(freshZone(state.zones.length));
    while (state.zonesUnlocked.length < ZONE_DEFS.length) state.zonesUnlocked.push(false);
    return true;
  } catch (e) { console.warn('save load failed:', e); return false; }
}

function applyOfflineProgress() {
  const elapsedMs = Date.now() - (state.lastTimestamp || Date.now());
  const elapsedSec = Math.min(elapsedMs / 1000, OFFLINE_CAP_SEC);
  if (elapsedSec < 5) return 0;
  const moneyBefore = state.money;
  const step = 0.5;
  let remaining = elapsedSec;
  _offlineCatchup = true;
  while (remaining > 0) {
    tick(Math.min(step, remaining));
    remaining -= step;
  }
  _offlineCatchup = false;
  resetRateBuffer();
  return state.money - moneyBefore;
}

// ---------- IMPORT/EXPORT ----------
function exportSaveString() {
  saveNow();
  const json = JSON.stringify(state);
  // unicode-safe base64
  const bin = unescape(encodeURIComponent(json));
  return btoa(bin);
}
function importSaveString(input) {
  try {
    const cleaned = (input || '').trim();
    if (!cleaned) return false;
    const bin = atob(cleaned);
    const json = decodeURIComponent(escape(bin));
    let data = JSON.parse(json);
    data = migrateLegacy(data);
    data = migrateZoneShape(data);
    state = Object.assign(freshState(), data);
    while (state.zones.length < ZONE_DEFS.length) state.zones.push(freshZone(state.zones.length));
    while (state.zonesUnlocked.length < ZONE_DEFS.length) state.zonesUnlocked.push(false);
    saveNow();
    rebuildAll();
    return true;
  } catch (e) { console.warn('import failed:', e); return false; }
}

function rebuildAll() {
  buildTabs();
  buildShafts();
  buildUpgradesPanel();
  $('scene-bg').dataset.zone = ZONE_DEFS[state.currentZone].id;
  refreshBuffsUI();
  resetRateBuffer();
}

// ---------- LOOP ----------
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tick(dt);
  sampleRate(now);
  render();
  requestAnimationFrame(frame);
}

// ---------- INIT ----------
function init() {
  const had = load();
  $('scene-bg').dataset.zone = ZONE_DEFS[state.currentZone].id;
  buildTabs();
  buildShafts();
  buildUpgradesPanel();

  refreshBuffsUI();

  if (had) {
    const earned = applyOfflineProgress();
    if (earned > 0.01) {
      const elapsedSec = Math.min((Date.now() - state.lastTimestamp) / 1000, OFFLINE_CAP_SEC);
      $('offline-time').textContent = fmtTime(elapsedSec);
      $('offline-money').textContent = fmt(earned);
      $('offline-modal').classList.remove('hidden');
    }
  }

  $('offline-close').addEventListener('click', () => $('offline-modal').classList.add('hidden'));

  // settings modal
  $('settings-btn').addEventListener('click', () => $('settings-modal').classList.remove('hidden'));
  $('settings-close').addEventListener('click', () => $('settings-modal').classList.add('hidden'));

  $('export-btn').addEventListener('click', () => {
    const s = exportSaveString();
    $('save-textarea').value = s;
    $('save-textarea').select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(() => {
        flashStatus('Save copied to clipboard');
      }, () => flashStatus('Save shown — copy manually'));
    } else {
      flashStatus('Save shown — copy manually');
    }
  });

  $('import-btn').addEventListener('click', () => {
    const txt = $('save-textarea').value;
    if (!txt.trim()) { flashStatus('Paste a save first'); return; }
    if (!confirm('Replace current save with imported data? Your current progress will be lost.')) return;
    if (importSaveString(txt)) {
      flashStatus('Save imported');
      $('settings-modal').classList.add('hidden');
    } else {
      flashStatus('Import failed — invalid save');
    }
  });

  $('reset-btn-modal').addEventListener('click', () => {
    if (!confirm('Wipe save and start over?')) return;
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('idleminer_save_v4');
    state = freshState();
    rebuildAll();
    flashStatus('Reset');
    $('settings-modal').classList.add('hidden');
  });

  $('worker-body').innerHTML = haulerSVG();
  $('elevator').addEventListener('click', clickElevator);
  $('worker').addEventListener('click', clickWorker);
  $('processor').addEventListener('click', clickProcessor);

  setInterval(saveSoon, 5000);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

function flashStatus(msg) {
  const el = $('settings-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

init();
