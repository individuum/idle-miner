'use strict';

const SAVE_KEY = 'idleminer_save_v4';
const OFFLINE_CAP_SEC = 4 * 60 * 60;

// ---------- SHAFT CATALOG ----------
const SHAFT_DEFS = [
  { name: 'Surface Quarry',   unlockCost: 0,        baseTime: 3.0,  baseCap: 10,  baseOre: 2 },
  { name: 'Copper Vein',      unlockCost: 250,      baseTime: 4.0,  baseCap: 14,  baseOre: 4 },
  { name: 'Silver Tunnel',    unlockCost: 1.0e4,    baseTime: 5.0,  baseCap: 20,  baseOre: 8 },
  { name: 'Gold Cavern',      unlockCost: 5.0e5,    baseTime: 6.0,  baseCap: 28,  baseOre: 16 },
  { name: 'Platinum Depths',  unlockCost: 2.5e7,    baseTime: 7.0,  baseCap: 40,  baseOre: 32 },
  { name: 'Diamond Mine',     unlockCost: 1.25e9,   baseTime: 9.0,  baseCap: 55,  baseOre: 64 },
  { name: 'Mithril Shaft',    unlockCost: 6.0e10,   baseTime: 11.0, baseCap: 75,  baseOre: 128 },
  { name: 'Adamantite Core',  unlockCost: 3.0e12,   baseTime: 13.0, baseCap: 100, baseOre: 256 },
  { name: 'Obsidian Forge',   unlockCost: 1.5e14,   baseTime: 15.0, baseCap: 140, baseOre: 512 },
  { name: 'Cobalt Reactor',   baseTime: 17.0, baseCap: 180, baseOre: 1024, unlockCost: 7.5e15 },
  { name: 'Antimatter Layer', baseTime: 19.0, baseCap: 220, baseOre: 2048, unlockCost: 4.0e17 },
  { name: 'Quantum Core',     baseTime: 21.0, baseCap: 280, baseOre: 4096, unlockCost: 2.0e19 },
];

// Debris barriers between shaft groups. afterShaft is 0-indexed.
const BARRIER_DEFS = [
  { afterShaft: 3, name: 'Fossilized Wall',  cost: 5.0e6,  icon: '🦴', desc: 'Ancient bones and rock blocking the descent' },
  { afterShaft: 7, name: 'Volcanic Debris',  cost: 2.0e13, icon: '🌋', desc: 'Hardened lava and pumice choking the shaft' },
];

// ---------- STATE ----------
function freshState() {
  return {
    money: 0,
    shafts: SHAFT_DEFS.map((d, i) => ({
      unlocked: i === 0,
      mineLevel: 1,
      capLevel: 1,
      minerLevel: 1,    // # parallel miners
      autoMine: false,  // foreman hired
      ore: 0,
      progress: 0,
    })),
    barriers: BARRIER_DEFS.map(() => ({ cleared: false })),
    elevator: {
      speedLevel: 1, capLevel: 1,
      cargo: 0, pos: 0, target: 0,
      stateName: 'idle', timer: 0,
      auto: false, manualTrip: false,
    },
    surfaceDropoff: 0,
    worker: {
      speedLevel: 1, capLevel: 1,
      cargo: 0, pos: 0, target: 0,
      stateName: 'idle', timer: 0,
      auto: false, manualTrip: false,
    },
    processor: {
      speedLevel: 1, valueLevel: 1,
      buffer: 0, progress: 0,
      auto: false,
    },
    lastTimestamp: Date.now(),
    earnedRecent: [],
  };
}

let state = freshState();

// ---------- FORMULAS ----------
function shaftMineTime(i) {
  const lvl = state.shafts[i].mineLevel;
  const base = SHAFT_DEFS[i].baseTime;
  if (lvl <= 25) return base / Math.pow(1.10, lvl - 1);
  return base / Math.pow(1.10, 24) / Math.pow(1.04, lvl - 25);
}
function shaftOreCap(i)   { return Math.floor(SHAFT_DEFS[i].baseCap * Math.pow(1.25, state.shafts[i].capLevel - 1)); }
function shaftOrePerCycle(i) { return SHAFT_DEFS[i].baseOre; }
function shaftMinerCount(i) { return state.shafts[i].minerLevel; }
function shaftYieldPerCycle(i) { return shaftOrePerCycle(i) * shaftMinerCount(i); }

function elevatorSpeed() { return 1.0 * Math.pow(1.10, state.elevator.speedLevel - 1); }
function elevatorCap()   { return Math.floor(5 * Math.pow(1.30, state.elevator.capLevel - 1)); }

function workerSpeed()   { return 0.6 * Math.pow(1.10, state.worker.speedLevel - 1); }
function workerCap()     { return Math.floor(4 * Math.pow(1.30, state.worker.capLevel - 1)); }

function processorTime() {
  const lvl = state.processor.speedLevel;
  if (lvl <= 30) return 1.5 / Math.pow(1.12, lvl - 1);
  return 1.5 / Math.pow(1.12, 29) / Math.pow(1.04, lvl - 30);
}
function processorValue() {
  const lvl = state.processor.valueLevel;
  if (lvl <= 20) return 2 * Math.pow(1.45, lvl - 1);
  return 2 * Math.pow(1.45, 19) * Math.pow(1.18, lvl - 20);
}

const COSTS = {
  shaftMine:  i => 8   * Math.pow(8, i) * Math.pow(1.15, state.shafts[i].mineLevel - 1),
  shaftCap:   i => 20  * Math.pow(8, i) * Math.pow(1.20, state.shafts[i].capLevel - 1),
  shaftMiner: i => 40  * Math.pow(8, i) * Math.pow(1.40, state.shafts[i].minerLevel - 1),
  shaftForeman: i => 75 * Math.pow(40, i),
  elevSpeed:  () => 30  * Math.pow(1.18, state.elevator.speedLevel - 1),
  elevCap:    () => 50  * Math.pow(1.22, state.elevator.capLevel - 1),
  elevAuto:   () => 175,
  workerSpeed:() => 20  * Math.pow(1.15, state.worker.speedLevel - 1),
  workerCap:  () => 40  * Math.pow(1.22, state.worker.capLevel - 1),
  workerAuto: () => 100,
  procSpeed:  () => 60  * Math.pow(1.20, state.processor.speedLevel - 1),
  procValue:  () => 120 * Math.pow(1.30, state.processor.valueLevel - 1),
  procAuto:   () => 600,
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

function getBarrierAfter(shaftIdx) {
  return BARRIER_DEFS.findIndex(b => b.afterShaft === shaftIdx);
}

// Returns ordered rows to render: [{type:'shaft',idx} | {type:'barrier',idx}]
function getVisibleRows() {
  const rows = [];
  for (let i = 0; i < SHAFT_DEFS.length; i++) {
    // is there an uncleared barrier blocking this shaft?
    const bIdx = getBarrierAfter(i - 1);
    if (bIdx >= 0 && !state.barriers[bIdx].cleared) {
      rows.push({ type: 'barrier', idx: bIdx });
      return rows;
    }
    rows.push({ type: 'shaft', idx: i });
    if (!state.shafts[i].unlocked) return rows;
  }
  return rows;
}

function visibleShaftCount() {
  return getVisibleRows().filter(r => r.type === 'shaft').length;
}

function totalRowCount() { return getVisibleRows().length; }

// ---------- SIM TICK ----------
function tick(dt) {
  // mining (only if foreman hired)
  for (let i = 0; i < state.shafts.length; i++) {
    const s = state.shafts[i];
    if (!s.unlocked || !s.autoMine) continue;
    const cap = shaftOreCap(i);
    if (s.ore >= cap) { s.progress = 0; continue; }
    s.progress += dt;
    const t = shaftMineTime(i);
    while (s.progress >= t && s.ore < cap) {
      s.progress -= t;
      s.ore = Math.min(cap, s.ore + shaftYieldPerCycle(i));
    }
    if (s.ore >= cap) s.progress = 0;
  }

  // elevator
  const ev = state.elevator;
  if (ev.stateName === 'idle' && (ev.auto || ev.manualTrip)) {
    if (ev.cargo > 0) { ev.target = 0; ev.stateName = 'ascending'; }
    else {
      const idx = bestShaftWithOre();
      if (idx >= 0) { ev.target = idx + 1; ev.stateName = 'descending'; }
      else if (ev.manualTrip) ev.manualTrip = false;
    }
  }
  if (ev.stateName === 'descending' || ev.stateName === 'ascending') {
    const dir = ev.target > ev.pos ? 1 : -1;
    ev.pos += dir * elevatorSpeed() * dt;
    if ((dir > 0 && ev.pos >= ev.target) || (dir < 0 && ev.pos <= ev.target)) {
      ev.pos = ev.target;
      ev.timer = 0;
      ev.stateName = ev.target === 0 ? 'unloading' : 'loading';
      spawnPuff('elevator', ev.target === 0 ? 'top' : 'bottom');
    }
  } else if (ev.stateName === 'loading') {
    ev.timer += dt;
    if (ev.timer >= 0.25) {
      const i = Math.round(ev.pos) - 1;
      if (i >= 0 && i < state.shafts.length) {
        const space = elevatorCap() - ev.cargo;
        const take = Math.min(space, state.shafts[i].ore);
        ev.cargo += take;
        state.shafts[i].ore -= take;
        if (take > 0) spawnOreTransfer(refs.shafts[i] && refs.shafts[i].ore, $('elev-cargo'), take);
      }
      ev.stateName = 'idle';
    }
  } else if (ev.stateName === 'unloading') {
    ev.timer += dt;
    if (ev.timer >= 0.25) {
      const dropped = ev.cargo;
      state.surfaceDropoff += ev.cargo;
      ev.cargo = 0;
      ev.stateName = 'idle';
      ev.manualTrip = false;
      if (dropped > 0) spawnOreTransfer($('elev-cargo'), $('dropoff-count'), dropped);
    }
  }

  // worker
  const w = state.worker;
  if (w.stateName === 'idle' && (w.auto || w.manualTrip)) {
    if (w.cargo > 0) { w.target = 1; w.stateName = 'walking_to_proc'; }
    else if (state.surfaceDropoff > 0 && w.pos === 0) { w.timer = 0; w.stateName = 'pickup'; }
    else if (state.surfaceDropoff > 0 && w.pos !== 0) { w.target = 0; w.stateName = 'walking_back'; }
    else if (w.manualTrip) w.manualTrip = false;
  }
  if (w.stateName === 'walking_to_proc' || w.stateName === 'walking_back') {
    const dir = w.target > w.pos ? 1 : -1;
    w.pos += dir * workerSpeed() * dt;
    if ((dir > 0 && w.pos >= w.target) || (dir < 0 && w.pos <= w.target)) {
      w.pos = w.target;
      if (w.target === 1) { w.timer = 0; w.stateName = 'dropoff'; }
      else { w.stateName = 'idle'; }
    }
  } else if (w.stateName === 'pickup') {
    w.timer += dt;
    if (w.timer >= 0.25) {
      const take = Math.min(workerCap() - w.cargo, state.surfaceDropoff);
      w.cargo += take;
      state.surfaceDropoff -= take;
      w.stateName = 'idle';
    }
  } else if (w.stateName === 'dropoff') {
    w.timer += dt;
    if (w.timer >= 0.25) {
      state.processor.buffer += w.cargo;
      w.cargo = 0;
      w.stateName = 'idle';
      w.manualTrip = false;
    }
  }

  // processor
  const p = state.processor;
  if (p.auto && p.buffer > 0) {
    p.progress += dt;
    const t = processorTime();
    while (p.progress >= t && p.buffer > 0) {
      p.progress -= t;
      p.buffer -= 1;
      const earned = processorValue();
      state.money += earned;
      pushEarning(earned);
      spawnMoney(earned);
    }
    if (p.buffer <= 0) p.progress = 0;
  } else if (p.buffer <= 0) {
    p.progress = 0;
  }
}

function bestShaftWithOre() {
  let best = -1, bestOre = 0;
  for (let i = 0; i < state.shafts.length; i++) {
    const s = state.shafts[i];
    if (s.unlocked && s.ore > bestOre) { best = i; bestOre = s.ore; }
  }
  return best;
}

function pushEarning(amount) {
  const now = performance.now();
  state.earnedRecent.push({ t: now, amount });
  const cutoff = now - 5000;
  while (state.earnedRecent.length && state.earnedRecent[0].t < cutoff) {
    state.earnedRecent.shift();
  }
}

function currentRate() {
  if (state.earnedRecent.length === 0) return 0;
  const now = performance.now();
  const cutoff = now - 5000;
  let sum = 0;
  for (const e of state.earnedRecent) if (e.t >= cutoff) sum += e.amount;
  return sum / 5;
}

// ---------- MANUAL CLICK HANDLERS ----------
const POW_WORDS = ['WHACK!', 'BAM!', 'POW!', 'CLANG!', 'CRACK!', 'SMASH!', 'KAPOW!', 'BOOM!'];
function pickWord() { return POW_WORDS[Math.floor(Math.random() * POW_WORDS.length)]; }

function clickShaft(i) {
  const s = state.shafts[i];
  if (!s.unlocked || s.autoMine) return;
  const cap = shaftOreCap(i);
  if (s.ore >= cap) return;
  const yieldAmt = shaftYieldPerCycle(i);
  s.ore = Math.min(cap, s.ore + yieldAmt);
  spawnPow(refs.shafts[i].el, pickWord());
  pulseClick(refs.shafts[i].el);
}

function clickElevator() {
  const ev = state.elevator;
  if (ev.auto) return;
  ev.manualTrip = true;
  pulseClick($('elevator'));
}

function clickWorker() {
  const w = state.worker;
  if (w.auto) return;
  w.manualTrip = true;
  pulseClick($('worker'));
}

function clickProcessor() {
  const p = state.processor;
  if (p.auto) return;
  if (p.buffer <= 0) return;
  // process the entire buffer instantly for snappier early play
  const count = p.buffer;
  const each = processorValue();
  const total = count * each;
  p.buffer = 0;
  p.progress = 0;
  state.money += total;
  pushEarning(total);
  spawnMoney(total);
  pulseClick($('processor'));
}

// ---------- COMIC FX ----------
function $(id) { return document.getElementById(id); }

function spawnPow(targetEl, text) {
  const fx = $('fx');
  const el = document.createElement('div');
  el.className = 'fx-pow';
  el.textContent = text;
  const r = targetEl.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  const x = r.left - root.left + r.width * (0.3 + Math.random() * 0.4);
  const y = r.top - root.top + r.height * (0.2 + Math.random() * 0.3);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.setProperty('--rot', (-15 + Math.random() * 30).toFixed(1) + 'deg');
  fx.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// Coalesce money fx — collect totals, emit at most one floating number per ~250ms
let _moneyAccum = 0;
let _moneyLastFxAt = 0;
function spawnMoney(amount) {
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
  el.style.top = (r.top - root.top + 10) + 'px';
  fx.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function spawnOreTransfer(fromEl, toEl, amount) {
  if (!fromEl || !toEl) return;
  const fx = $('fx');
  // cap concurrent fx particles to avoid DOM explosion at high throughput
  if (fx.children.length > 30) {
    if (toEl) {
      toEl.classList.remove('cargo-pulse');
      void toEl.offsetWidth;
      toEl.classList.add('cargo-pulse');
    }
    return;
  }
  const fromR = fromEl.getBoundingClientRect();
  const toR = toEl.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  const count = Math.min(6, Math.max(2, Math.floor(amount / 2)));
  for (let k = 0; k < count; k++) {
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
    el.style.animationDelay = (k * 0.06) + 's';
    fx.appendChild(el);
    setTimeout(() => el.remove(), 900 + k * 60);
  }
  toEl.classList.remove('cargo-pulse');
  void toEl.offsetWidth;
  toEl.classList.add('cargo-pulse');
}

function spawnPuff(target, where) {
  const fx = $('fx');
  const el = document.createElement('div');
  el.className = 'fx-puff';
  const targetEl = $(target);
  if (!targetEl) return;
  const r = targetEl.getBoundingClientRect();
  const root = fx.getBoundingClientRect();
  el.style.left = (r.left - root.left + r.width / 2) + 'px';
  el.style.top = (r.top - root.top + (where === 'top' ? 0 : r.height)) + 'px';
  fx.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

function pulseClick(el) {
  el.classList.remove('click-pulse');
  void el.offsetWidth; // restart anim
  el.classList.add('click-pulse');
}

// ---------- DOM REFS ----------
const refs = { shafts: [], upgrades: {} };

// ---------- BUILD SHAFTS DOM ----------
function buildShafts() {
  const root = $('shafts');
  root.innerHTML = '';
  refs.shafts = new Array(SHAFT_DEFS.length).fill(null);
  refs.barriers = new Array(BARRIER_DEFS.length).fill(null);
  refs.rowYs = [];

  const rows = getVisibleRows();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.type === 'shaft') {
      const i = row.idx;
      const s = state.shafts[i];
      const def = SHAFT_DEFS[i];
      const el = document.createElement('div');
      el.className = 'shaft' + (s.unlocked ? '' : ' locked');
      el.dataset.shaft = i;
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
      refs.shafts[i] = {
        el, tunnel, rowIndex: r,
        miners: el.querySelector('.miners'),
        bar: el.querySelector('.mine-progress-fill'),
        ore: el.querySelector('.ore-pile'),
        lock: el.querySelector('.locked-overlay'),
        lastMinerLevel: -1,
      };
      if (s.unlocked) {
        tunnel.addEventListener('click', () => clickShaft(i));
      } else {
        refs.shafts[i].lock.addEventListener('click', () => tryUnlockShaft(i));
      }
    } else {
      const bi = row.idx;
      const def = BARRIER_DEFS[bi];
      const el = document.createElement('div');
      el.className = 'barrier';
      el.dataset.barrier = bi;
      el.innerHTML = `
        <div class="barrier-tunnel">
          <div class="barrier-icon">${def.icon}</div>
          <div class="barrier-info">
            <div class="barrier-name">${def.name}</div>
            <div class="barrier-desc">${def.desc}</div>
          </div>
          <div class="barrier-action">Clear — <span class="barrier-cost">$${fmt(def.cost)}</span></div>
        </div>
        <div class="shaft-label">Blocked</div>
      `;
      root.appendChild(el);
      const tunnel = el.querySelector('.barrier-tunnel');
      refs.barriers[bi] = {
        el, tunnel, rowIndex: r,
        cost: el.querySelector('.barrier-cost'),
        action: el.querySelector('.barrier-action'),
      };
      tunnel.addEventListener('click', () => tryClearBarrier(bi));
    }
  }
  updateUndergroundHeight();
}

function updateUndergroundHeight() {
  const rowCount = totalRowCount();
  const h = 30 + rowCount * 100;
  document.querySelector('.underground').style.minHeight = h + 'px';
}

function tryClearBarrier(bi) {
  const def = BARRIER_DEFS[bi];
  if (state.money < def.cost) return;
  state.money -= def.cost;
  state.barriers[bi].cleared = true;
  const r = refs.barriers[bi];
  if (r) spawnPow(r.el, 'CLEARED!');
  buildShafts();
  buildUpgradesPanel();
  for (let i = 0; i < refs.shafts.length; i++) {
    if (refs.shafts[i] && state.shafts[i].unlocked) rebuildMiners(i);
  }
  saveSoon();
}

function tryUnlockShaft(i) {
  const def = SHAFT_DEFS[i];
  if (state.money < def.unlockCost) return;
  state.money -= def.unlockCost;
  state.shafts[i].unlocked = true;
  buildShafts();
  buildUpgradesPanel();
  saveSoon();
}

// ---------- UPGRADE DEFS ----------
function getUpgradeDefs() {
  const defs = [];
  const visible = visibleShaftCount();
  for (let i = 0; i < visible; i++) {
    if (!state.shafts[i].unlocked) continue;
    const idx = i;
    defs.push({ section: SHAFT_DEFS[i].name });
    defs.push({
      id: `shaft${i}_mine`, name: 'Mining Speed',
      get: () => state.shafts[idx].mineLevel,
      eff: () => fmtTime(shaftMineTime(idx)) + ' / cycle',
      cost: () => COSTS.shaftMine(idx),
      buy: () => state.shafts[idx].mineLevel++,
    });
    defs.push({
      id: `shaft${i}_cap`, name: 'Shaft Capacity',
      get: () => state.shafts[idx].capLevel,
      eff: () => 'cap ' + fmt(shaftOreCap(idx)),
      cost: () => COSTS.shaftCap(idx),
      buy: () => state.shafts[idx].capLevel++,
    });
    defs.push({
      id: `shaft${i}_miner`, name: 'Hire Miner',
      get: () => state.shafts[idx].minerLevel,
      eff: () => shaftMinerCount(idx) + ' miners (' + fmt(shaftYieldPerCycle(idx)) + ' ore/cycle)',
      cost: () => COSTS.shaftMiner(idx),
      buy: () => { state.shafts[idx].minerLevel++; rebuildMiners(idx); },
    });
    if (!state.shafts[idx].autoMine) {
      defs.push({
        id: `shaft${i}_foreman`, name: '👷 Hire Foreman',
        oneShot: true,
        eff: () => 'Auto-mines this shaft',
        cost: () => COSTS.shaftForeman(idx),
        buy: () => { state.shafts[idx].autoMine = true; },
      });
    }
  }

  defs.push({ section: 'Elevator' });
  defs.push({ id: 'elev_speed', name: 'Elevator Speed',    get: () => state.elevator.speedLevel, eff: () => fmt(elevatorSpeed()) + ' shafts/s', cost: () => COSTS.elevSpeed(), buy: () => state.elevator.speedLevel++ });
  defs.push({ id: 'elev_cap',   name: 'Elevator Capacity', get: () => state.elevator.capLevel,   eff: () => 'cap ' + fmt(elevatorCap()),         cost: () => COSTS.elevCap(),   buy: () => state.elevator.capLevel++ });
  if (!state.elevator.auto) {
    defs.push({ id: 'elev_auto', name: '🎩 Hire Operator', oneShot: true, eff: () => 'Auto-runs the elevator', cost: () => COSTS.elevAuto(), buy: () => { state.elevator.auto = true; } });
  }

  defs.push({ section: 'Surface Worker' });
  defs.push({ id: 'worker_speed', name: 'Worker Speed',    get: () => state.worker.speedLevel, eff: () => fmt(workerSpeed()) + ' /s',     cost: () => COSTS.workerSpeed(), buy: () => state.worker.speedLevel++ });
  defs.push({ id: 'worker_cap',   name: 'Worker Capacity', get: () => state.worker.capLevel,   eff: () => 'cap ' + fmt(workerCap()),       cost: () => COSTS.workerCap(),   buy: () => state.worker.capLevel++ });
  if (!state.worker.auto) {
    defs.push({ id: 'worker_auto', name: '👷 Hire Hauler', oneShot: true, eff: () => 'Auto-hauls ore to the processor', cost: () => COSTS.workerAuto(), buy: () => { state.worker.auto = true; } });
  }

  defs.push({ section: 'Processor' });
  defs.push({ id: 'proc_speed', name: 'Processing Speed', get: () => state.processor.speedLevel, eff: () => fmtTime(processorTime()) + ' / ore',     cost: () => COSTS.procSpeed(), buy: () => state.processor.speedLevel++ });
  defs.push({ id: 'proc_value', name: 'Ore Value',        get: () => state.processor.valueLevel, eff: () => '$' + fmt(processorValue()) + ' / ore',  cost: () => COSTS.procValue(), buy: () => state.processor.valueLevel++ });
  if (!state.processor.auto) {
    defs.push({ id: 'proc_auto', name: '🤖 Hire Operator', oneShot: true, eff: () => 'Auto-processes ore', cost: () => COSTS.procAuto(), buy: () => { state.processor.auto = true; } });
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
      lv: el.querySelector('.upgrade-lv'),
      eff: el.querySelector('.upgrade-effect'),
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

// ---------- MINER RENDERING ----------
function rebuildMiners(i) {
  const r = refs.shafts[i];
  if (!r) return;
  const count = shaftMinerCount(i);
  const visible = Math.min(5, count);
  let html = '';
  for (let k = 0; k < visible; k++) {
    html += `<div class="miner-slot" style="animation-delay: ${(k * 0.12).toFixed(2)}s">${minerSVG()}</div>`;
  }
  if (count > 5) html += `<div class="miner-extra">×${count}</div>`;
  r.miners.innerHTML = html;
  r.lastMinerLevel = state.shafts[i].minerLevel;
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

  const visible = visibleShaftCount();

  for (let i = 0; i < refs.shafts.length; i++) {
    const r = refs.shafts[i];
    if (!r) continue;
    const s = state.shafts[i];
    if (s.unlocked) {
      r.el.classList.remove('locked');
      setText(r.ore, fmt(s.ore) + '/' + fmt(shaftOreCap(i)));
      setStyle(r.bar, 'width', Math.min(100, (s.progress / shaftMineTime(i)) * 100) + '%');
      const mining = s.ore < shaftOreCap(i);
      r.el.classList.toggle('mining', mining && s.autoMine);
      r.el.classList.toggle('manual', !s.autoMine);
      r.el.classList.toggle('full', s.ore >= shaftOreCap(i));
      if (r.lastMinerLevel !== s.minerLevel) rebuildMiners(i);
    } else {
      r.el.classList.add('locked');
      const def = SHAFT_DEFS[i];
      const afford = state.money >= def.unlockCost;
      setText(r.lock, (afford ? '⛏ ' : '🔒 ') + 'Unlock ' + def.name + ' — $' + fmt(def.unlockCost));
      r.lock.classList.toggle('afford', afford);
    }
  }

  // elevator pos — uses each shaft's actual row index (barriers occupy rows too)
  const positions = [10];
  for (let i = 0; i < refs.shafts.length; i++) {
    const r = refs.shafts[i];
    if (r) positions.push(10 + 30 + r.rowIndex * 100 + 50);
    else positions.push(positions[positions.length - 1]); // unrendered shafts: park at last
  }
  const ev = state.elevator;
  const evY = lerp(positions, ev.pos);
  setStyle($('elevator'), 'top', evY + 'px');
  const evCap = elevatorCap();
  setText($('elev-cargo'), fmt(ev.cargo) + '/' + fmt(evCap));
  setStyle($('elev-cargo'), 'opacity', ev.cargo > 0 ? '1' : '0.55');
  const fillPct = evCap > 0 ? Math.min(100, (ev.cargo / evCap) * 100) : 0;
  setStyle($('elev-fill'), 'height', fillPct + '%');
  $('elevator').classList.toggle('full', ev.cargo >= evCap && evCap > 0);
  $('elevator').classList.toggle('manual', !ev.auto);
  $('elevator').classList.toggle('idle', ev.stateName === 'idle');

  // worker
  const w = state.worker;
  const walkPct = w.pos * 100;
  setStyle($('worker'), 'left', walkPct + '%');
  setStyle($('worker'), 'transform', `translateX(-${walkPct}%)`);
  setText($('worker-cargo'), fmt(w.cargo));
  const workerEl = $('worker');
  workerEl.classList.toggle('has-cargo', w.cargo > 0);
  workerEl.classList.toggle('idle', w.stateName === 'idle' || w.stateName === 'pickup' || w.stateName === 'dropoff');
  workerEl.classList.toggle('manual', !w.auto);

  // dropoff & processor
  setText($('dropoff-count'), fmt(state.surfaceDropoff));
  const p = state.processor;
  setText($('proc-buffer'), fmt(p.buffer) + ' ore');
  setStyle($('proc-bar'), 'width', (Math.min(1, p.progress / processorTime()) * 100) + '%');
  $('processor').classList.toggle('idle', p.buffer === 0);
  $('processor').classList.toggle('manual', !p.auto);

  // upgrades — text uses setText for cache; classList.toggle is already a no-op when unchanged
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

  // detect when render layout (rows) needs rebuilding
  const expectedRows = totalRowCount();
  const renderedRows = $('shafts').children.length;
  if (renderedRows !== expectedRows) {
    buildShafts();
    buildUpgradesPanel();
    for (let i = 0; i < refs.shafts.length; i++) {
      if (refs.shafts[i] && state.shafts[i].unlocked) rebuildMiners(i);
    }
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
  try {
    const persist = { ...state, earnedRecent: [] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
  } catch (e) { /* quota */ }
}
function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    state = Object.assign(freshState(), data);
    while (state.shafts.length < SHAFT_DEFS.length) {
      state.shafts.push({ unlocked: false, mineLevel: 1, capLevel: 1, minerLevel: 1, autoMine: false, ore: 0, progress: 0 });
    }
    if (!state.barriers) state.barriers = BARRIER_DEFS.map(() => ({ cleared: false }));
    while (state.barriers.length < BARRIER_DEFS.length) state.barriers.push({ cleared: false });
    state.earnedRecent = [];
    return true;
  } catch (e) { return false; }
}

function applyOfflineProgress() {
  const elapsedMs = Date.now() - (state.lastTimestamp || Date.now());
  const elapsedSec = Math.min(elapsedMs / 1000, OFFLINE_CAP_SEC);
  if (elapsedSec < 5) return 0;
  const moneyBefore = state.money;
  const step = 0.1;
  let remaining = elapsedSec;
  // suppress fx during offline catchup
  const realSpawn = window._spawnMoney;
  while (remaining > 0) {
    tick(Math.min(step, remaining));
    remaining -= step;
  }
  state.earnedRecent = [];
  return state.money - moneyBefore;
}

// ---------- LOOP ----------
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tick(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------- INIT ----------
function init() {
  const had = load();
  buildShafts();
  for (let i = 0; i < refs.shafts.length; i++) {
    if (refs.shafts[i] && state.shafts[i].unlocked) rebuildMiners(i);
  }
  buildUpgradesPanel();

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

  $('reset').addEventListener('click', () => {
    if (confirm('Wipe save and start over?')) {
      localStorage.removeItem(SAVE_KEY);
      state = freshState();
      buildShafts();
      buildUpgradesPanel();
    }
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

init();
