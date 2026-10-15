import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = path.join(config.dataDir, 'iggn.json');
fs.mkdirSync(config.dataDir, { recursive: true });

// records  : toutes les actions (avertissements, sanctions, promotions…)
// officers : { [userId]: { threadId } } — dossier personnel (fil de forum)
// dashboard: { channelId, messageId }
let data = { counter: 0, records: {}, officers: {}, dashboard: null };
try {
  data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch {
  /* premier démarrage */
}

function persist() {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function nextId() {
  data.counter += 1;
  persist();
  return `R-${String(data.counter).padStart(4, '0')}`;
}

export const getRecord = (id) => data.records[id] ?? null;
export const allRecords = () => Object.values(data.records);
export const recordsOf = (userId) => allRecords().filter((r) => r.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
export const activeRecords = (userId, kind) => recordsOf(userId).filter((r) => r.active && (!kind || r.kind === kind));
export const expiredRecords = (now) => allRecords().filter((r) => r.active && r.endsAt && r.endsAt <= now);

export function saveRecord(record) {
  data.records[record.id] = record;
  persist();
}

export const getOfficer = (userId) => data.officers[userId] ?? null;
export function saveOfficer(userId, officer) {
  data.officers[userId] = officer;
  persist();
}

export const getDashboard = () => data.dashboard;
export function saveDashboard(dashboard) {
  data.dashboard = dashboard;
  persist();
}
