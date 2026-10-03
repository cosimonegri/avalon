import {
  DEFAULT_ROLES,
  ROLE_IDS,
  SPECIAL_ROLES,
  buildDeck,
  normalizeCode,
  publicRoleCard,
  shuffle,
  type RoleId,
} from "../../src/shared/avalon";
import {
  GAME_TTL_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameDocument,
  type StoredGame,
} from "../../src/shared/game";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UPDATE_ATTEMPTS = 12;

export interface GameStore {
  create(game: StoredGame): Promise<boolean>;
  read(code: string): Promise<GameDocument | null>;
  replace(game: StoredGame, etag: string): Promise<boolean>;
  delete(code: string): Promise<void>;
}

export class GameError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

type ServiceOptions = {
  now?: () => number;
  randomCode?: () => string;
  randomToken?: () => string;
};

export class GameService {
  private readonly now: () => number;
  private readonly randomCode: () => string;
  private readonly randomToken: () => string;

  constructor(private readonly store: GameStore, options: ServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.randomCode = options.randomCode ?? generateCode;
    this.randomToken = options.randomToken ?? (() => crypto.randomUUID());
  }

  async create(rawName: unknown) {
    const name = cleanName(rawName);
    if (!name) throw new GameError("Enter your name to create a room.", 400);
    const playerToken = this.randomToken();
    const hostToken = this.randomToken();
    const playerTokenHash = await hashToken(playerToken);
    const hostTokenHash = await hashToken(hostToken);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = normalizeCode(this.randomCode());
      if (code.length !== 6) continue;
      const createdAt = this.now();
      const game: StoredGame = {
        schemaVersion: 1,
        code,
        hostTokenHash,
        status: "lobby",
        selectedRoles: DEFAULT_ROLES,
        players: [{ id: crypto.randomUUID(), name, tokenHash: playerTokenHash, seat: 1 }],
        createdAt,
        expiresAt: createdAt + GAME_TTL_MS,
      };
      if (await this.store.create(game)) return { code, playerToken, hostToken };
    }
    throw new GameError("Could not create a unique room code. Please try again.", 503);
  }

  async join(codeInput: string, rawName: unknown) {
    const code = normalizedRoomCode(codeInput);
    const name = cleanName(rawName);
    if (!name) throw new GameError("Enter your name to take a seat.", 400);
    const playerToken = this.randomToken();
    const tokenHash = await hashToken(playerToken);
    const playerId = crypto.randomUUID();

    await this.update(code, (game) => {
      if (game.status !== "lobby") throw new GameError("This game has already begun.", 409);
      if (game.players.length >= MAX_PLAYERS) throw new GameError("This room is full.", 409);
      if (game.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new GameError("That name is already seated at this table.", 409);
      }
      game.players.push({ id: playerId, name, tokenHash, seat: game.players.length + 1 });
    });
    return { code, playerToken };
  }

  async start(codeInput: string, playerToken: string, hostToken: string, roleInput: unknown) {
    const code = normalizedRoomCode(codeInput);
    const playerTokenHash = await hashToken(requiredToken(playerToken));
    const hostTokenHash = await hashToken(requiredToken(hostToken));
    const roles = parseRoles(roleInput);

    return this.update(code, (game) => {
      const player = game.players.find((candidate) => candidate.tokenHash === playerTokenHash);
      if (!player || game.hostTokenHash !== hostTokenHash) {
        throw new GameError("Only the room host can assign roles.", 403);
      }
      if (game.status !== "lobby") throw new GameError("Roles have already been assigned.", 409);
      if (game.players.length < MIN_PLAYERS || game.players.length > MAX_PLAYERS) {
        throw new GameError("Avalon needs between 5 and 10 players.", 400);
      }
      let deck: RoleId[];
      try {
        deck = shuffle(buildDeck(game.players.length, roles));
      } catch (error) {
        throw new GameError(error instanceof Error ? error.message : "That role set is not valid.", 400);
      }
      game.players.forEach((candidate, index) => {
        candidate.role = deck[index];
      });
      game.selectedRoles = roles;
      game.status = "assigned";
    });
  }

  async view(codeInput: string, playerToken: string, hostToken = "") {
    const code = normalizedRoomCode(codeInput);
    const document = await this.readLiveGame(code);
    const playerTokenHash = await hashToken(requiredToken(playerToken));
    const player = document.game.players.find((candidate) => candidate.tokenHash === playerTokenHash);
    if (!player) throw new GameError("Your seat could not be verified.", 401);
    const isHost = hostToken ? document.game.hostTokenHash === (await hashToken(hostToken)) : false;
    const response: Record<string, unknown> = {
      room: {
        code: document.game.code,
        status: document.game.status,
        selectedRoles: document.game.selectedRoles,
        playerCount: document.game.players.length,
        expiresAt: document.game.expiresAt,
      },
      player: { id: player.id, name: player.name },
      players: document.game.players.map((candidate) => ({ id: candidate.id, name: candidate.name })),
      isHost,
    };
    if (document.game.status === "assigned" && player.role) {
      response.roleCard = publicRoleCard(
        { id: player.id, role: player.role },
        document.game.players.flatMap((candidate) =>
          candidate.role ? [{ id: candidate.id, name: candidate.name, role: candidate.role }] : [],
        ),
      );
    }
    return response;
  }

  private async readLiveGame(code: string) {
    const document = await this.store.read(code);
    if (!document) throw new GameError("We could not find that room.", 404);
    if (document.game.expiresAt <= this.now()) {
      await this.store.delete(code);
      throw new GameError("This room has expired.", 410);
    }
    return document;
  }

  private async update(code: string, mutate: (game: StoredGame) => void) {
    for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
      const document = await this.readLiveGame(code);
      const nextGame = structuredClone(document.game);
      mutate(nextGame);
      if (await this.store.replace(nextGame, document.etag)) return nextGame;
    }
    throw new GameError("The room changed while saving. Please try again.", 409);
  }
}

function generateCode() {
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

function normalizedRoomCode(value: string) {
  const code = normalizeCode(value);
  if (code.length !== 6) throw new GameError("Enter a valid six-character room code.", 400);
  return code;
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 24) : "";
}

function requiredToken(value: string) {
  if (!value) throw new GameError("Your seat could not be verified.", 401);
  return value;
}

function parseRoles(input: unknown): RoleId[] {
  if (!Array.isArray(input)) throw new GameError("Roles must be sent as a list.", 400);
  if (input.some((role) => typeof role !== "string" || !ROLE_IDS.includes(role as RoleId))) {
    throw new GameError("The role list contains an unknown role.", 400);
  }
  const roles = Array.from(new Set(input as RoleId[]));
  if (roles.some((role) => !SPECIAL_ROLES.includes(role))) {
    throw new GameError("Only special roles can be selected.", 400);
  }
  return roles;
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
