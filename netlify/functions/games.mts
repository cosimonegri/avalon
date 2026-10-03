import type { Config } from "@netlify/functions";
import { BlobGameStore } from "../lib/blob-game-store";
import { GameError, GameService } from "../lib/game-service";

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export default async function handler(request: Request) {
  const service = new GameService(new BlobGameStore());
  return handleRequest(request, service);
}

export async function handleRequest(request: Request, service: GameService) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  try {
    if (request.method === "POST" && segments.length === 2) {
      const body = await requestBody(request);
      return json(await service.create(body.name), 201);
    }
    const code = segments[2] ?? "";
    if (request.method === "GET" && segments.length === 3) {
      return json(await service.view(code, bearerToken(request), request.headers.get("x-host-token") ?? ""));
    }
    if (request.method === "POST" && segments[3] === "join" && segments.length === 4) {
      const body = await requestBody(request);
      return json(await service.join(code, body.name), 201);
    }
    if (request.method === "POST" && segments[3] === "start" && segments.length === 4) {
      const body = await requestBody(request);
      const playerToken = bearerToken(request);
      const hostToken = request.headers.get("x-host-token") ?? "";
      await service.start(code, playerToken, hostToken, body.roles);
      return json(await service.view(code, playerToken, hostToken));
    }
    return json({ error: "Route not found." }, 404);
  } catch (error) {
    if (error instanceof GameError) return json({ error: error.message }, error.status);
    console.error("Unhandled Avalon API error", error);
    return json({ error: "The round table is unavailable right now. Please try again." }, 500);
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new GameError("Send a valid JSON request body.", 400);
  }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

export const config: Config = {
  path: ["/api/games", "/api/games/*"],
};
