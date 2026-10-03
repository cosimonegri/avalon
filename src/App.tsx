"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  Crown,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  UserMinus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_ROLES,
  ROLE_INFO,
  SPECIAL_ROLES,
  normalizeCode,
  type RoleId,
} from "@/shared/avalon";

type Player = { id: string; name: string };
type RoleCard = {
  id: RoleId;
  name: string;
  team: "good" | "evil";
  description: string;
  objective: string;
  intel: string[];
  intelLabel: string;
};
type RoomState = {
  room: {
    code: string;
    status: "lobby" | "assigned";
    selectedRoles: RoleId[];
    playerCount: number;
  };
  player: Player;
  players: Player[];
  isHost: boolean;
  roleCard?: RoleCard;
};

class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function storageKey(code: string, type: "player" | "host") {
  return `avalon-role-companion:${normalizeCode(code)}:${type}`;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    const message =
      response.status === 429
        ? "Too many requests. Wait a minute and try again."
        : payload.error || "Something went wrong.";
    throw new RequestError(message, response.status);
  }
  return payload;
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  );
}

function Landing({
  initialCode,
  onEnter,
}: {
  initialCode: string;
  onEnter: (code: string, playerToken: string, hostToken?: string) => void;
}) {
  const [mode, setMode] = useState<"home" | "create" | "join">(
    initialCode ? "join" : "home",
  );
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        const result = await jsonRequest<{
          code: string;
          playerToken: string;
          hostToken: string;
        }>("/api/games", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        onEnter(result.code, result.playerToken, result.hostToken);
      } else {
        const normalized = normalizeCode(code);
        const result = await jsonRequest<{ code: string; playerToken: string }>(
          `/api/games/${normalized}/join`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
          },
        );
        onEnter(result.code, result.playerToken);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="landing-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Avalon Role Companion home">
          <Mark />
          <span>AVALON ROLE COMPANION</span>
        </a>
        <a
          className="companion-label"
          href="https://github.com/cosimonegri/avalon"
        >
          GitHub
        </a>
      </header>

      <section className="landing-grid">
        <div className="intro-copy">
          <div className="eyebrow">
            <Sparkles size={14} /> No narrator. No peeking.
          </div>
          <h1>
            Gather the table.
            <br />
            <em>Keep your secrets.</em>
          </h1>
          <p>
            Create a room, invite your players, and privately reveal exactly
            what each role is allowed to know.
          </p>
          <div className="privacy-note">
            <Shield size={18} />
            <span>Roles stay private on each player&apos;s own screen.</span>
          </div>
        </div>

        <div className="entry-card">
          {mode === "home" ? (
            <>
              <div className="table-emblem" aria-hidden="true">
                <Crown size={34} />
              </div>
              <h2>Take your seat</h2>
              <p>Start a new table or join one with a room code.</p>
              <Button
                className="gold-button"
                size="lg"
                onClick={() => setMode("create")}
              >
                <Crown /> Create a room
              </Button>
              <Button
                className="outline-button"
                variant="outline"
                size="lg"
                onClick={() => setMode("join")}
              >
                <Users /> Join a room
              </Button>
            </>
          ) : (
            <form onSubmit={submit}>
              <button
                type="button"
                className="back-link"
                onClick={() => setMode("home")}
              >
                Back
              </button>
              <div className="form-heading">
                <span>
                  {mode === "create" ? "New table" : "Join the table"}
                </span>
                <h2>
                  {mode === "create" ? "Who is hosting?" : "Your invitation"}
                </h2>
              </div>
              {mode === "join" && (
                <label>
                  Room code
                  <Input
                    value={code}
                    onChange={(event) =>
                      setCode(normalizeCode(event.target.value))
                    }
                    placeholder="ABC123"
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={6}
                    className="code-input"
                  />
                </label>
              )}
              <label>
                Your name
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Gawain"
                  autoComplete="name"
                  maxLength={24}
                  autoFocus
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                className="gold-button"
                size="lg"
                type="submit"
                disabled={
                  busy || !name.trim() || (mode === "join" && code.length !== 6)
                }
              >
                {busy
                  ? "Taking your seat…"
                  : mode === "create"
                    ? "Create room"
                    : "Join room"}
              </Button>
            </form>
          )}
        </div>
      </section>
      <footer>Built for the game table · 5–10 players</footer>
    </main>
  );
}

function Lobby({
  state,
  tokens,
  onRefresh,
  onRemovePlayer,
}: {
  state: RoomState;
  tokens: { player: string; host: string };
  onRefresh: () => Promise<RoomState | null>;
  onRemovePlayer: (playerId: string) => Promise<void>;
}) {
  const [roles, setRoles] = useState<RoleId[]>(
    state.room.selectedRoles.length ? state.room.selectedRoles : DEFAULT_ROLES,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState("");
  const [error, setError] = useState("");
  const inviteUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/?room=${state.room.code}`;

  const toggleRole = (role: RoleId, enabled: boolean) => {
    setRoles((current) =>
      enabled ? [...current, role] : current.filter((item) => item !== role),
    );
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const assignRoles = async () => {
    setBusy(true);
    setError("");
    try {
      await jsonRequest(`/api/games/${state.room.code}/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${tokens.player}`,
          "x-host-token": tokens.host,
        },
        body: JSON.stringify({ roles }),
      });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not assign roles.",
      );
    } finally {
      setBusy(false);
    }
  };

  const removePlayer = async (player: Player) => {
    if (!window.confirm(`Remove ${player.name} from this lobby?`)) return;
    setRemovingPlayerId(player.id);
    setError("");
    try {
      await onRemovePlayer(player.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove that player.",
      );
    } finally {
      setRemovingPlayerId("");
    }
  };

  return (
    <main className="room-shell">
      <RoomHeader code={state.room.code} />
      <section className="room-grid">
        <div className="players-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">The company</span>
              <h1>{state.players.length} of 10 seated</h1>
            </div>
            <div className="status-pill">
              <span /> Waiting
            </div>
          </div>
          <div className="player-list">
            {state.players.map((player, index) => (
              <div className="player-row" key={player.id}>
                <div className="player-avatar">
                  {player.name.slice(0, 1).toUpperCase()}
                </div>
                <span>{player.name}</span>
                {player.id === state.player.id && <small>You</small>}
                {index === 0 && <Crown size={15} aria-label="Host" />}
                {state.isHost && index > 0 && (
                  <button
                    type="button"
                    className="remove-player"
                    aria-label={`Remove ${player.name}`}
                    title={`Remove ${player.name}`}
                    disabled={Boolean(removingPlayerId)}
                    onClick={() => void removePlayer(player)}
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 5 - state.players.length) }).map(
              (_, index) => (
                <div className="empty-seat" key={index}>
                  Open seat
                </div>
              ),
            )}
          </div>
        </div>

        <aside className="invite-panel panel">
          <span className="section-kicker">Invite players</span>
          <h2>Scan to join</h2>
          <div className="qr-wrap">
            {inviteUrl && (
              <QRCodeSVG
                value={inviteUrl}
                size={176}
                bgColor="#ffffff"
                fgColor="#0b1b2a"
                level="M"
              />
            )}
          </div>
          <div className="room-code">
            <span>Room code</span>
            <strong>{state.room.code}</strong>
          </div>
          <Button
            variant="outline"
            className="copy-button"
            onClick={copyInvite}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy invite link"}
          </Button>
        </aside>

        <div className="roles-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Role set</span>
              <h2>Choose the court</h2>
            </div>
            <span className="role-count">{roles.length} special roles</span>
          </div>
          <div className="role-options">
            {SPECIAL_ROLES.map((role) => (
              <label
                className={`role-option ${ROLE_INFO[role].team}`}
                key={role}
              >
                <span className="role-sigil">
                  {ROLE_INFO[role].team === "good" ? <Shield /> : <Swords />}
                </span>
                <span>
                  <strong>{ROLE_INFO[role].name}</strong>
                  <small>{ROLE_INFO[role].description.split(".")[0]}.</small>
                </span>
                <Switch
                  checked={roles.includes(role)}
                  onCheckedChange={(checked) => toggleRole(role, checked)}
                  disabled={!state.isHost}
                  aria-label={`Include ${ROLE_INFO[role].name}`}
                />
              </label>
            ))}
          </div>
          {state.isHost ? (
            <div className="start-row">
              <div>
                <strong>
                  {state.players.length < 5
                    ? `${5 - state.players.length} more ${5 - state.players.length === 1 ? "player" : "players"} needed`
                    : "The table is ready"}
                </strong>
                <span>Roles are assigned once and cannot be reshuffled.</span>
              </div>
              <Button
                className="gold-button"
                size="lg"
                onClick={assignRoles}
                disabled={busy || state.players.length < 5}
              >
                {busy ? "Assigning…" : "Assign roles"}
              </Button>
            </div>
          ) : (
            <div className="waiting-note">
              <span className="pulse-dot" />
              The host will assign roles when everyone is seated.
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function RoomHeader({ code }: { code: string }) {
  return (
    <header className="site-header room-header">
      <a className="brand" href="/" aria-label="Avalon Role Companion home">
        <Mark />
        <span>AVALON ROLE COMPANION</span>
      </a>
      <div className="header-room">
        <span>ROOM</span>
        <strong>{code}</strong>
      </div>
    </header>
  );
}

function RoleReveal({
  state,
  onCheck,
  onReset,
}: {
  state: RoomState;
  onCheck: () => Promise<RoomState | null>;
  onReset: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [action, setAction] = useState<"check" | "reset" | null>(null);
  const [notice, setNotice] = useState("");
  const card = state.roleCard!;

  useEffect(() => {
    const reseal = () => setRevealed(false);
    const resealWhenHidden = () => document.hidden && reseal();
    document.addEventListener("visibilitychange", resealWhenHidden);
    window.addEventListener("blur", reseal);
    window.addEventListener("pagehide", reseal);
    return () => {
      document.removeEventListener("visibilitychange", resealWhenHidden);
      window.removeEventListener("blur", reseal);
      window.removeEventListener("pagehide", reseal);
    };
  }, []);

  const checkForNextGame = async () => {
    setAction("check");
    setNotice("");
    const nextState = await onCheck();
    if (nextState?.room.status === "lobby") return;
    if (!nextState) setNotice("Could not check the lobby. Please try again.");
    else setNotice("The host has not reset the lobby yet.");
    setAction(null);
  };

  const resetLobby = async () => {
    if (
      !window.confirm(
        "Reset this lobby for another game? Everyone will keep their seat, but all current roles will be cleared.",
      )
    )
      return;
    setAction("reset");
    setNotice("");
    try {
      await onReset();
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Could not reset the lobby.",
      );
      setAction(null);
    }
  };

  return (
    <main className={`reveal-shell ${card.team}`}>
      <RoomHeader code={state.room.code} />
      <section className="reveal-stage">
        <div className="reveal-stack">
          {!revealed ? (
            <div className="sealed-card">
              <div className="seal">
                <Crown />
              </div>
              <span className="section-kicker">
                For {state.player.name} only
              </span>
              <h1>Your role is sealed</h1>
              <p>
                Make sure no one else can see your screen before you reveal it.
              </p>
              <Button
                className="gold-button"
                size="lg"
                onClick={() => setRevealed(true)}
              >
                <Eye /> Reveal my role
              </Button>
            </div>
          ) : (
            <div className="role-card">
              <button className="hide-role" onClick={() => setRevealed(false)}>
                <EyeOff /> Hide role
              </button>
              <div className="alignment">
                <span>{card.team === "good" ? <Shield /> : <Swords />}</span>
                {card.team === "good"
                  ? "Servant of Arthur"
                  : "Minion of Mordred"}
              </div>
              <p className="role-overline">You are</p>
              <h1>{card.name}</h1>
              <p className="role-description">{card.description}</p>
              {card.intel.length > 0 ? (
                <div className="intel-box">
                  <span>{card.intelLabel}</span>
                  <div>
                    {card.intel.map((name) => (
                      <strong key={name}>{name}</strong>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="intel-box quiet">
                  <span>Secret knowledge</span>
                  <p>You receive no names. Trust your instincts.</p>
                </div>
              )}
              <div className="objective">
                <span>Your objective</span>
                <p>{card.objective}</p>
              </div>
              <p className="role-warning">
                <EyeOff size={15} /> Keep this screen private. There is no
                narrator.
              </p>
            </div>
          )}
          <div className="next-game-panel">
            <div className="next-game-copy">
              <strong>Ready for another game?</strong>
              <span>
                {state.isHost
                  ? "Reset the table when everyone is ready."
                  : "Check after the host resets the table."}
              </span>
            </div>
            <div className="next-game-buttons">
              {state.isHost && (
                <Button
                  className="gold-button"
                  onClick={resetLobby}
                  disabled={action !== null}
                >
                  <RotateCcw />
                  {action === "reset" ? "Resetting…" : "Reset lobby"}
                </Button>
              )}
              {!state.isHost && (
                <Button
                  variant="outline"
                  className="copy-button"
                  onClick={checkForNextGame}
                  disabled={action !== null}
                >
                  <RefreshCw />
                  {action === "check" ? "Checking…" : "Check for next game"}
                </Button>
              )}
            </div>
            {notice && (
              <p className="next-game-notice" role="status">
                {notice}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [code, setCode] = useState("");
  const [tokens, setTokens] = useState({ player: "", host: "" });
  const [state, setState] = useState<RoomState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlCode = normalizeCode(
      new URLSearchParams(window.location.search).get("room") || "",
    );
    setCode(urlCode);
    if (urlCode)
      setTokens({
        player: localStorage.getItem(storageKey(urlCode, "player")) || "",
        host: localStorage.getItem(storageKey(urlCode, "host")) || "",
      });
    setReady(true);
  }, []);

  const enterRoom = useCallback(
    (nextCode: string, playerToken: string, hostToken = "") => {
      localStorage.setItem(storageKey(nextCode, "player"), playerToken);
      if (hostToken)
        localStorage.setItem(storageKey(nextCode, "host"), hostToken);
      window.history.replaceState({}, "", `/?room=${nextCode}`);
      setCode(nextCode);
      setTokens({ player: playerToken, host: hostToken });
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!code || !tokens.player) return null;
    try {
      const room = await jsonRequest<RoomState>(`/api/games/${code}`, {
        headers: {
          authorization: `Bearer ${tokens.player}`,
          "x-host-token": tokens.host,
        },
      });
      setState(room);
      setError("");
      return room;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the room.",
      );
      if (
        cause instanceof RequestError &&
        [401, 404, 410].includes(cause.status)
      )
        setState(null);
      return null;
    }
  }, [code, tokens]);

  const resetLobby = useCallback(async () => {
    const room = await jsonRequest<RoomState>(`/api/games/${code}/reset`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.player}`,
        "x-host-token": tokens.host,
      },
    });
    setState(room);
    setError("");
  }, [code, tokens]);

  const removePlayer = useCallback(
    async (playerId: string) => {
      const room = await jsonRequest<RoomState>(
        `/api/games/${code}/players/${playerId}`,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${tokens.player}`,
            "x-host-token": tokens.host,
          },
        },
      );
      setState(room);
      setError("");
    },
    [code, tokens],
  );

  useEffect(() => {
    void refresh();
    if (!code || !tokens.player || state?.room.status === "assigned") return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [code, tokens.player, refresh, state?.room.status]);

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool?: (
            tool: unknown,
            options?: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registrations = [
      context.registerTool(
        {
          name: "create_avalon_room",
          title: "Create Avalon room",
          description:
            "Create a new Avalon role-assignment room and seat the named host as the first player.",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input: unknown) {
            const data = input as { name?: string };
            if (!data.name?.trim()) throw new Error("A host name is required.");
            const result = await jsonRequest<{
              code: string;
              playerToken: string;
              hostToken: string;
            }>("/api/games", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: data.name }),
            });
            enterRoom(result.code, result.playerToken, result.hostToken);
            return { roomCode: result.code, created: true };
          },
        },
        { signal: lifecycle.signal },
      ),
      context.registerTool(
        {
          name: "join_avalon_room",
          title: "Join Avalon room",
          description:
            "Join an Avalon role-assignment room with a six-character room code and player name.",
          inputSchema: {
            type: "object",
            properties: { code: { type: "string" }, name: { type: "string" } },
            required: ["code", "name"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input: unknown) {
            const data = input as { code?: string; name?: string };
            const normalized = normalizeCode(data.code || "");
            if (normalized.length !== 6 || !data.name?.trim())
              throw new Error("A valid room code and name are required.");
            const result = await jsonRequest<{
              code: string;
              playerToken: string;
            }>(`/api/games/${normalized}/join`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: data.name }),
            });
            enterRoom(result.code, result.playerToken);
            return { roomCode: result.code, joined: true };
          },
        },
        { signal: lifecycle.signal },
      ),
    ];
    for (const registration of registrations) {
      void Promise.resolve(registration).catch((cause) =>
        console.warn("Could not register a room tool", cause),
      );
    }
    return () => lifecycle.abort();
  }, [enterRoom]);

  const initialCode = useMemo(() => code, [code]);
  if (!ready)
    return (
      <main className="loading-screen">
        <Mark />
        <span>Opening Avalon Role Companion</span>
      </main>
    );
  if (!tokens.player)
    return <Landing initialCode={initialCode} onEnter={enterRoom} />;
  if (error && !state)
    return (
      <main className="loading-screen">
        <Mark />
        <p>{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            localStorage.removeItem(storageKey(code, "player"));
            localStorage.removeItem(storageKey(code, "host"));
            setTokens({ player: "", host: "" });
            setError("");
          }}
        >
          Join again
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.assign("/")}
        >
          Go back to homepage
        </Button>
      </main>
    );
  if (!state)
    return (
      <main className="loading-screen">
        <Mark />
        <span>Finding your seat…</span>
      </main>
    );
  if (state.room.status === "assigned" && state.roleCard)
    return <RoleReveal state={state} onCheck={refresh} onReset={resetLobby} />;
  return (
    <Lobby
      state={state}
      tokens={tokens}
      onRefresh={refresh}
      onRemovePlayer={removePlayer}
    />
  );
}
