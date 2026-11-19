// Marco's save: a single localStorage record holding his money, how far Lupe's story has
// run, and where in Solara Bay he was standing. The title screen offers it as Continue.
// A record that fails any sanity check is treated as no save at all.

const SAVE_KEY = 'solara-heat-save-v1';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readSave() {
  let data;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  if (!isFiniteNumber(data.money) || data.money < 0) return null;
  if (!Number.isInteger(data.missionIndex) || data.missionIndex < 0) return null;
  return {
    money: Math.round(data.money),
    missionIndex: data.missionIndex,
    storyDone: data.storyDone === true,
    x: isFiniteNumber(data.x) ? data.x : 0,
    z: isFiniteNumber(data.z) ? data.z : 0,
  };
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: Math.round(Math.max(0, state.money)),
      missionIndex: state.missionIndex,
      storyDone: state.storyDone === true,
      x: Math.round(state.position.x),
      z: Math.round(state.position.z),
    }));
  } catch {
    // Storage can be refused (private windows, quotas); the game just plays unsaved.
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* already gone */ }
}
