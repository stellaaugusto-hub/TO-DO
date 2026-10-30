// Stockage local (JSON) dans ~/Library/Application Support/QuestFlow/data.json
// Écriture atomique (fichier temporaire + rename) et regroupée.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_STATE = {
  schema: 1,
  profile: { name: '', createdAt: null },
  settings: {
    notifications: true,
    notifyLeadMinutes: 60,
    morningDigest: true,
    digestHour: 9,
    sounds: true,
    autoSyncMinutes: 20,
    mailLookbackDays: 7,
    syncChat: true,
    reduceMotion: false,
  },
  tasks: [],
  events: [],
  stats: { xp: 0, streak: 0, bestStreak: 0, lastCompletionDay: null, completedCount: 0, highScore: 0, gamesPlayed: 0 },
  google: { connected: false, email: null, profile: null, lastSync: null, lastMailSync: null, lastCalendarSync: null, lastChatSync: null, lastError: null },
  processed: { mail: [], chat: [] },
  notified: {},
};

export class Store {
  constructor(dir) {
    this.file = path.join(dir, 'data.json');
    this.state = structuredClone(DEFAULT_STATE);
    this._timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.state = {
        ...structuredClone(DEFAULT_STATE),
        ...raw,
        profile: { ...DEFAULT_STATE.profile, ...raw.profile },
        settings: { ...DEFAULT_STATE.settings, ...raw.settings },
        stats: { ...DEFAULT_STATE.stats, ...raw.stats },
        google: { ...DEFAULT_STATE.google, ...raw.google },
        processed: { ...DEFAULT_STATE.processed, ...raw.processed },
      };
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // fichier corrompu : on garde une copie et on repart propre
        try { fs.copyFileSync(this.file, this.file + '.corrupt-' + Date.now()); } catch {}
      }
    }
  }

  save(now = false) {
    clearTimeout(this._timer);
    const write = () => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 1));
      fs.renameSync(tmp, this.file);
    };
    if (now) write();
    else this._timer = setTimeout(write, 250);
  }

  get() {
    return this.state;
  }

  update(fn) {
    fn(this.state);
    this.save();
    return this.state;
  }
}

export function newId() {
  return crypto.randomUUID();
}
