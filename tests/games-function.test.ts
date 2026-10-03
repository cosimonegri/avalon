import { describe, expect, it } from "vitest";
import { handleCreateRequest } from "../netlify/functions/create-game.mts";
import { handleRequest } from "../netlify/functions/games.mts";
import { GameService } from "../netlify/lib/game-service";
import { MemoryGameStore } from "./memory-game-store";

function testApi() {
  let token = 0;
  return new GameService(new MemoryGameStore(), {
    now: () => 10_000,
    randomCode: () => "ABC123",
    randomToken: () => `token-${++token}`,
  });
}

async function request(
  service: GameService,
  path: string,
  init: RequestInit = {},
) {
  const webRequest = new Request(`http://localhost${path}`, init);
  const response = path === "/api/games"
    ? await handleCreateRequest(webRequest, service)
    : await handleRequest(webRequest, service);
  return { response, body: (await response.json()) as Record<string, unknown> };
}

describe("games Netlify Function", () => {
  it("runs the create, join, view, and start HTTP flow without exposing other roles", async () => {
    const service = testApi();
    const created = await request(service, "/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Arthur" }),
    });
    expect(created.response.status).toBe(201);
    expect(created.response.headers.get("cache-control")).toBe("no-store");

    const code = created.body.code as string;
    const playerToken = created.body.playerToken as string;
    const hostToken = created.body.hostToken as string;
    const joinedTokens: string[] = [];

    for (const name of ["Gawain", "Tristan", "Iseult", "Galahad"]) {
      const joined = await request(service, `/api/games/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      expect(joined.response.status).toBe(201);
      joinedTokens.push(joined.body.playerToken as string);
    }

    const lobby = await request(service, `/api/games/${code}`, {
      headers: { authorization: `Bearer ${playerToken}`, "x-host-token": hostToken },
    });
    const removable = (lobby.body.players as Array<{ id: string; name: string }>).find((player) => player.name === "Galahad")!;
    const removed = await request(service, `/api/games/${code}/players/${removable.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${playerToken}`, "x-host-token": hostToken },
    });
    expect(removed.response.status).toBe(200);
    expect((removed.body.players as Array<{ name: string }>).map((player) => player.name)).not.toContain("Galahad");
    const replacement = await request(service, `/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Kay" }),
    });
    expect(replacement.response.status).toBe(201);

    const started = await request(service, `/api/games/${code}/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${playerToken}`,
        "x-host-token": hostToken,
      },
      body: JSON.stringify({ roles: ["merlin", "percival", "assassin", "morgana"] }),
    });
    expect(started.response.status).toBe(200);
    expect(started.body.roleCard).toBeDefined();

    const joinedView = await request(service, `/api/games/${code}`, {
      headers: { authorization: `Bearer ${joinedTokens[0]}` },
    });
    expect(joinedView.response.status).toBe(200);
    expect(joinedView.body.roleCard).toBeDefined();
    expect((joinedView.body.players as Array<Record<string, unknown>>).every((player) => !("role" in player))).toBe(true);

    const forbiddenReset = await request(service, `/api/games/${code}/reset`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${joinedTokens[0]}`,
        "x-host-token": "wrong-host-token",
      },
    });
    expect(forbiddenReset.response.status).toBe(403);

    const reset = await request(service, `/api/games/${code}/reset`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${playerToken}`,
        "x-host-token": hostToken,
      },
    });
    expect(reset.response.status).toBe(200);
    expect(reset.body).toMatchObject({
      room: { code, status: "lobby", playerCount: 5 },
      isHost: true,
    });
    expect(reset.body).not.toHaveProperty("roleCard");
  });

  it("returns safe client errors for malformed input and unknown routes", async () => {
    const service = testApi();
    const malformed = await request(service, "/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(malformed.response.status).toBe(400);
    expect(malformed.body.error).toBe("Send a valid JSON request body.");

    const missing = await request(service, "/api/nope");
    expect(missing.response.status).toBe(404);
  });
});
