import type { RoleId } from "./avalon";

export const GAME_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 5;

export type GameStatus = "lobby" | "assigned";

export type StoredPlayer = {
  id: string;
  name: string;
  tokenHash: string;
  seat: number;
  role?: RoleId;
};

export type StoredGame = {
  schemaVersion: 1;
  code: string;
  hostTokenHash: string;
  status: GameStatus;
  selectedRoles: RoleId[];
  players: StoredPlayer[];
  createdAt: number;
  expiresAt: number;
};

export type GameDocument = {
  game: StoredGame;
  etag: string;
};
