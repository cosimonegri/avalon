import type { Config } from "@netlify/functions";
import { BlobGameStore } from "../lib/blob-game-store";

export default async function cleanupGames() {
  const result = await new BlobGameStore().deleteExpired();
  console.log(`Avalon room cleanup checked ${result.checked} rooms and deleted ${result.deleted}.`);
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const config: Config = {
  schedule: "17 */6 * * *",
};
