import { uid, verifySavedGame } from './engine.js';

export const mkPlayer = (name = '') => ({ id: uid(), name });
export const defaultConfig = () => ({ ready: false, players: Array.from({ length: 4 }, () => mkPlayer()), lives: 5, criterion: 'A', dealerIndex: 0 });
export const blankStore = () => ({ version: 2, config: defaultConfig(), game: null, records: [] });
const textValue = (value, max = 100) => typeof value === 'string' && value.length > 0 && value.length <= max;
export const validConfig = c => c && typeof c.ready === 'boolean' && Array.isArray(c.players) && c.players.length >= 3 && c.players.length <= 8 &&
 c.players.every(p => p && textValue(p.id) && typeof p.name === 'string' && p.name.length <= 30) &&
 new Set(c.players.map(p => p.id)).size === c.players.length && [3, 5].includes(c.lives) && ['A', 'B'].includes(c.criterion) &&
 Number.isInteger(c.dealerIndex) && c.dealerIndex >= 0 && c.dealerIndex < c.players.length &&
 (!c.ready || (c.players.every(p => p.name.trim()) && new Set(c.players.map(p => p.name.trim().toLocaleLowerCase('pt-BR'))).size === c.players.length));
const nonnegative = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000;
export function validStore(s) {
 try {
  return !!(s && s.version === 2 && validConfig(s.config) && (s.game === null || verifySavedGame(s.game)) &&
   Array.isArray(s.records) && s.records.length <= 10000 && new Set(s.records.map(r => r.id)).size === s.records.length &&
   s.records.every(r => r && textValue(r.id) && textValue(r.finishedAt) && Number.isFinite(Date.parse(r.finishedAt)) &&
    Array.isArray(r.participants) && r.participants.length >= 3 && r.participants.length <= 8 &&
    r.participants.every(p => p && textValue(p.id) && textValue(p.name, 30)) && new Set(r.participants.map(p => p.id)).size === r.participants.length &&
    r.participants.some(p => p.id === r.winnerId) && Array.isArray(r.originalIds) && r.originalIds.length === r.participants.length &&
    r.originalIds.every(p => p && /^p[1-8]$/.test(p.gameId) && r.participants.some(x => x.id === p.profileId)) &&
    new Set(r.originalIds.map(p => p.gameId)).size === r.originalIds.length && new Set(r.originalIds.map(p => p.profileId)).size === r.originalIds.length &&
    Array.isArray(r.hands) && r.hands.length <= 100000 && r.hands.every(h => h && Array.isArray(h.results) &&
     h.results.length <= 8 && h.results.every(x => x && r.originalIds.some(p => p.gameId === x.id) && textValue(x.name, 30) &&
      [x.bid, x.won, x.lost, x.difference].every(nonnegative)))));
 } catch { return false; }
}
