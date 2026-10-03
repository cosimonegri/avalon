import type { GameDocument, StoredGame } from "../src/shared/game";
import type { GameStore } from "../netlify/lib/game-service";

export class MemoryGameStore implements GameStore {
  private readonly games = new Map<string, GameDocument>();
  private version = 0;

  async create(game: StoredGame) {
    await Promise.resolve();
    if (this.games.has(game.code)) return false;
    this.games.set(game.code, { game: structuredClone(game), etag: this.nextEtag() });
    return true;
  }

  async read(code: string) {
    await Promise.resolve();
    const document = this.games.get(code);
    return document ? structuredClone(document) : null;
  }

  async replace(game: StoredGame, etag: string) {
    await Promise.resolve();
    const current = this.games.get(game.code);
    if (!current || current.etag !== etag) return false;
    this.games.set(game.code, { game: structuredClone(game), etag: this.nextEtag() });
    return true;
  }

  async delete(code: string) {
    this.games.delete(code);
  }

  has(code: string) {
    return this.games.has(code);
  }

  private nextEtag() {
    this.version += 1;
    return `etag-${this.version}`;
  }
}
