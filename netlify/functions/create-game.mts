import type { Config } from "@netlify/functions";
import { BlobGameStore } from "../lib/blob-game-store";
import { GameError, GameService } from "../lib/game-service";

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export default async function handler(request: Request) {
  return handleCreateRequest(request, new GameService(new BlobGameStore()));
}

export async function handleCreateRequest(
  request: Request,
  service: GameService,
) {
  try {
    if (request.method !== "POST")
      return json({ error: "Route not found." }, 404);
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new GameError("Send a valid JSON request body.", 400);
    }
    return json(await service.create(body.name), 201);
  } catch (error) {
    if (error instanceof GameError)
      return json({ error: error.message }, error.status);
    console.error("Unhandled Avalon room creation error", error);
    return json(
      {
        error:
          "Avalon Role Companion is unavailable right now. Please try again.",
      },
      500,
    );
  }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

export const config: Config = {
  path: "/api/games",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
