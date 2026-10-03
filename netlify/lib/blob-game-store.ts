import { getStore } from "@netlify/blobs";
import type { GameDocument, StoredGame } from "../../src/shared/game";
import type { GameStore } from "./game-service";

type BlobStore = Pick<ReturnType<typeof getStore>, "delete" | "getMetadata" | "getWithMetadata" | "list" | "setJSON">;

export class BlobGameStore implements GameStore {
  constructor(
    private readonly store: BlobStore = getStore({ name: "avalon-games", consistency: "strong" }),
  ) {}

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
    if (result.etag) return { game: result.data as StoredGame, etag: result.etag };

    // The local Netlify Blobs sandbox does not include an ETag on GET responses,
    // but it does include one in list results. Read the ETag before re-reading the
    // data so a concurrent write can only make the conditional update fail safely.
    const listing = await this.store.list({ prefix: code });
    const listedEtag = listing.blobs.find((blob) => blob.key === code)?.etag;
    if (!listedEtag) throw new Error(`Netlify Blobs returned no ETag for room ${code}.`);
    const latest = await this.store.getWithMetadata(code, { type: "json" });
    if (!latest) return null;
    return { game: latest.data as StoredGame, etag: latest.etag ?? listedEtag };
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

  async deleteExpired(now = Date.now(), limit = 200) {
    let checked = 0;
    let deleted = 0;
    const pages = this.store.list({ paginate: true });

    for await (const page of pages) {
      const candidates = page.blobs.slice(0, Math.max(0, limit - checked));
      for (let index = 0; index < candidates.length; index += 20) {
        const batch = candidates.slice(index, index + 20);
        const results = await Promise.all(batch.map(async (blob) => {
          const result = await this.store.getMetadata(blob.key);
          const expiresAt = result?.metadata.expiresAt;
          if (typeof expiresAt !== "number" || expiresAt > now) return false;
          await this.store.delete(blob.key);
          return true;
        }));
        checked += batch.length;
        deleted += results.filter(Boolean).length;
      }
      if (checked >= limit) break;
    }

    return { checked, deleted };
  }
}
