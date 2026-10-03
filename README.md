# Round Table

A narrator-free companion for assigning roles at the start of a game of *The Resistance: Avalon*. A host creates a room, players join with a link, QR code, or six-character code, and each player privately reveals only their own role and permitted information.

## What it does

- Creates rooms for 5–10 players.
- Generates a QR code and shareable join link.
- Lets the host select Merlin, Percival, Assassin, Morgana, Mordred, and Oberon.
- Assigns roles once using server-side cryptographic randomness.
- Shows Merlin, Percival, Evil, and Oberon exactly the names their role is allowed to know.
- Keeps role assignments out of lobby and other-player API responses.
- Lets the host reset the same lobby for another game while everyone keeps their seat.
- Expires rooms six hours after creation, renewed when the host resets the lobby.

The private information follows the original [Avalon rulebook](https://cdn.1j1ju.com/medias/a6/dc/c1-the-resistance-avalon-rulebook.pdf): Merlin sees every Evil player except Mordred (including Oberon), Evil players know one another except Oberon, Oberon receives no names, and Percival sees Merlin plus Morgana when she is present without knowing which is which.

## Architecture

- React 19 and Vite for the browser app.
- One Netlify Function for the room API.
- Netlify Blobs for short-lived room state; no external database or separate server is required.
- Strongly consistent Blob reads and conditional writes prevent simultaneous joins from overwriting one another.
- Player and host credentials are random bearer tokens. Only SHA-256 hashes are stored in the room document.

Netlify Blobs does not provide per-object TTL deletion. The API enforces the six-hour expiry on every room read or update and lazily deletes an expired room when it is accessed. An expired room cannot be viewed, joined, or started.

## Local development

Requirements: Node.js 22 or newer.

```sh
npm install
npm run netlify:dev
```

Open `http://localhost:8888`. Use `netlify:dev`, rather than the Vite-only `npm run dev`, when testing room creation because the API and local Netlify Blobs sandbox are provided by Netlify Dev.

Useful checks:

```sh
npm test
npm run typecheck
npm run build
```

The test suite uses an in-memory storage adapter, so it does not require a Netlify account or network access.

## Deploy on Netlify

Nothing in this repository deploys automatically unless you connect it to Netlify.

1. Push this directory to a Git repository.
2. In Netlify, choose **Add new project** and import that repository.
3. Keep the repository root as the base directory.
4. Netlify reads the included `netlify.toml`, which uses `npm run build` and publishes `dist`.
5. Deploy the site.

No Supabase project, database migration, or application environment variable is needed. Netlify provides the Blob context to the deployed Function. The first local `netlify dev` run may offer to link the folder to a Netlify site; linking is useful for testing against that site's configuration but is not required by the unit tests.

## API outline

- `POST /api/games` — create a room and return player and host tokens.
- `POST /api/games/:code/join` — join a lobby and return a player token.
- `GET /api/games/:code` — retrieve the lobby or the requesting player's private role card.
- `POST /api/games/:code/start` — host-only, one-time role assignment.
- `POST /api/games/:code/reset` — host-only, clear roles and reopen the same lobby.

All API responses use `Cache-Control: no-store`. Tokens are held in each browser's local storage so refreshing a device restores its seat.
