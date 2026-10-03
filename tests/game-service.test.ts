import { describe, expect, it } from "vitest";
import { GameError, GameService } from "../netlify/lib/game-service";
import { GAME_TTL_MS } from "../src/shared/game";
import { MemoryGameStore } from "./memory-game-store";

function testService(now: () => number = () => 1_000) {
  const store = new MemoryGameStore();
  let token = 0;
  const service = new GameService(store, {
    now,
    randomCode: () => "ABC123",
    randomToken: () => `token-${++token}`,
  });
  return { service, store };
}

describe("GameService", () => {
  it("creates a room that expires exactly six hours later", async () => {
    let now = 10_000;
    const { service, store } = testService(() => now);
    const created = await service.create("Arthur");
    const view = await service.view(created.code, created.playerToken, created.hostToken);
    expect((view.room as { expiresAt: number }).expiresAt).toBe(now + GAME_TTL_MS);

    now += GAME_TTL_MS;
    await expect(service.view(created.code, created.playerToken)).rejects.toMatchObject({ status: 410 });
    expect(store.has(created.code)).toBe(false);
  });

  it("uses conditional updates so simultaneous joins do not overwrite players", async () => {
    const { service } = testService();
    const created = await service.create("Arthur");
    const names = ["Gawain", "Tristan", "Iseult", "Galahad", "Kay", "Bors", "Elaine", "Lamorak", "Bedivere"];
    await Promise.all(names.map((name) => service.join(created.code, name)));
    const view = await service.view(created.code, created.playerToken, created.hostToken);
    expect(view.players).toHaveLength(10);
    expect(new Set((view.players as Array<{ name: string }>).map((player) => player.name)).size).toBe(10);
  });

  it("rejects non-host role assignment and duplicate assignment", async () => {
    const { service } = testService();
    const created = await service.create("Arthur");
    const joined = [];
    for (const name of ["Gawain", "Tristan", "Iseult", "Galahad"]) joined.push(await service.join(created.code, name));

    await expect(
      service.start(created.code, joined[0].playerToken, "wrong-host-token", ["merlin", "assassin"]),
    ).rejects.toMatchObject({ status: 403 });
    await service.start(created.code, created.playerToken, created.hostToken, ["merlin", "assassin"]);
    await expect(
      service.start(created.code, created.playerToken, created.hostToken, ["merlin", "assassin"]),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("returns only the requesting player's role and correct role knowledge", async () => {
    const { service } = testService();
    const created = await service.create("Arthur");
    const seats = [{ name: "Arthur", token: created.playerToken }];
    for (const name of ["Gawain", "Tristan", "Iseult", "Galahad", "Kay", "Bors", "Elaine", "Lamorak", "Bedivere"]) {
      const joined = await service.join(created.code, name);
      seats.push({ name, token: joined.playerToken });
    }

    await service.start(created.code, created.playerToken, created.hostToken, [
      "merlin",
      "percival",
      "assassin",
      "morgana",
      "mordred",
      "oberon",
    ]);

    const revealed = [];
    for (const seat of seats) {
      const view = await service.view(created.code, seat.token);
      expect((view.players as Array<Record<string, unknown>>).every((player) => !("role" in player))).toBe(true);
      revealed.push({ playerName: seat.name, card: view.roleCard as { id: string; team: string; intel: string[] } });
    }

    expect(revealed.filter(({ card }) => card.team === "good")).toHaveLength(6);
    expect(revealed.filter(({ card }) => card.team === "evil")).toHaveLength(4);
    const byRole = new Map(revealed.map((entry) => [entry.card.id, entry]));
    const merlin = byRole.get("merlin")!;
    const percival = byRole.get("percival")!;
    const mordred = byRole.get("mordred")!;
    const morgana = byRole.get("morgana")!;
    const assassin = byRole.get("assassin")!;
    const oberon = byRole.get("oberon")!;

    expect(new Set(merlin.card.intel)).toEqual(new Set([morgana.playerName, assassin.playerName, oberon.playerName]));
    expect(new Set(percival.card.intel)).toEqual(new Set([merlin.playerName, morgana.playerName]));
    expect(merlin.card.intel).not.toContain(mordred.playerName);
    expect(oberon.card.intel).toEqual([]);
    expect(new Set(assassin.card.intel)).toEqual(new Set([morgana.playerName, mordred.playerName]));
  });

  it("lets only the host reset the same roster for another game", async () => {
    let now = 1_000;
    const { service, store } = testService(() => now);
    const created = await service.create("Arthur");
    const seats = [{ name: "Arthur", token: created.playerToken }];
    for (const name of ["Gawain", "Tristan", "Iseult", "Galahad"]) {
      const joined = await service.join(created.code, name);
      seats.push({ name, token: joined.playerToken });
    }
    const roles = ["merlin", "percival", "assassin", "morgana"] as const;
    await service.start(created.code, created.playerToken, created.hostToken, [...roles]);

    await expect(
      service.reset(created.code, seats[1].token, "wrong-host-token"),
    ).rejects.toMatchObject({ status: 403 });

    now = 50_000;
    await service.reset(created.code, created.playerToken, created.hostToken);
    const resetView = await service.view(created.code, created.playerToken, created.hostToken);
    expect(resetView.room).toMatchObject({
      status: "lobby",
      selectedRoles: [...roles],
      playerCount: 5,
      expiresAt: now + GAME_TTL_MS,
    });
    expect(resetView).not.toHaveProperty("roleCard");
    const stored = await store.read(created.code);
    expect(stored?.game.players.every((player) => player.role === undefined)).toBe(true);

    for (const seat of seats) {
      await expect(service.view(created.code, seat.token)).resolves.toMatchObject({
        room: { status: "lobby" },
      });
    }

    await service.start(created.code, created.playerToken, created.hostToken, [...roles]);
    await expect(service.view(created.code, created.playerToken)).resolves.toHaveProperty("roleCard");
  });

  it("does not reset a lobby that has not assigned roles", async () => {
    const { service } = testService();
    const created = await service.create("Arthur");
    await expect(
      service.reset(created.code, created.playerToken, created.hostToken),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("reports validation errors with safe status codes", async () => {
    const { service } = testService();
    await expect(service.create(" ")).rejects.toBeInstanceOf(GameError);
    await expect(service.join("bad", "Gawain")).rejects.toMatchObject({ status: 400 });
  });
});
