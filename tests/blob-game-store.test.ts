import { describe, expect, it } from "vitest";
import { BlobGameStore } from "../netlify/lib/blob-game-store";
import type { StoredGame } from "../src/shared/game";

function storedGame(): StoredGame {
  return {
    schemaVersion: 1,
    code: "ABC123",
    hostTokenHash: "host-hash",
    status: "lobby",
    selectedRoles: ["merlin", "assassin"],
    players: [{ id: "player-1", name: "Arthur", tokenHash: "player-hash", seat: 1 }],
    createdAt: 1_000,
    expiresAt: 21_601_000,
  };
}

describe("BlobGameStore", () => {
  it("gets an ETag from the listing when the local sandbox omits it from reads", async () => {
    let game = storedGame();
    let etag = '"local-etag-1"';
    let conditionalEtag = "";
    let reads = 0;
    const sandboxStore = {
      async getWithMetadata() {
        reads += 1;
        return { data: structuredClone(game), metadata: {}, etag: undefined };
      },
      async list() {
        return { blobs: [{ key: game.code, etag }], directories: [] };
      },
      async setJSON(_key: string, value: unknown, options: { onlyIfMatch?: string }) {
        conditionalEtag = options.onlyIfMatch ?? "";
        if (conditionalEtag !== etag) return { modified: false };
        game = structuredClone(value) as StoredGame;
        etag = '"local-etag-2"';
        return { modified: true, etag };
      },
      async delete() {},
    };

    const store = new BlobGameStore(sandboxStore as never);
    const document = await store.read(game.code);
    expect(document?.etag).toBe('"local-etag-1"');
    expect(reads).toBe(2);

    const next = structuredClone(document!.game);
    next.players.push({ id: "player-2", name: "Gawain", tokenHash: "joined-hash", seat: 2 });
    await expect(store.replace(next, document!.etag)).resolves.toBe(true);
    expect(conditionalEtag).toBe('"local-etag-1"');
  });
});
