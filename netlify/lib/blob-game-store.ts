import { getStore } from "@netlify/blobs";
import type { GameDocument, StoredGame } from "../../src/shared/game";
import type { GameStore } from "./game-service";

export class BlobGameStore implements GameStore {
  private get store() {
    return getStore({ name: "avalon-games", consistency: "strong" });
  }

  async create(game: StoredGame) {
    const result = await this.store.setJSON(game.code, game, {
      onlyIfNew: true,
      metadata: { expiresAt: game.expiresAt },
    });
    return result.modified;
  }

  async read(code: string): Promise<GameDocument | null> {
    const result = await this.store.getWithMetadata(code, { type: "json" });
    if (!result) return null;
    if (!result.etag) throw new Error(`Netlify Blobs returned no ETag for room ${code}.`);
    return { game: result.data as StoredGame, etag: result.etag };
  }

  async replace(game: StoredGame, etag: string) {
    const result = await this.store.setJSON(game.code, game, {
      onlyIfMatch: etag,
      metadata: { expiresAt: game.expiresAt },
    });
    return result.modified;
  }

  async delete(code: string) {
    await this.store.delete(code);
  }
}
