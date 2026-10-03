export const ROLE_IDS = [
  "merlin",
  "percival",
  "loyal",
  "assassin",
  "morgana",
  "mordred",
  "oberon",
  "minion",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

type RoleInfo = {
  name: string;
  team: "good" | "evil";
  description: string;
  objective: string;
};

export const ROLE_INFO: Record<RoleId, RoleInfo> = {
  merlin: {
    name: "Merlin",
    team: "good",
    description:
      "You know the agents of Evil, except Mordred. Guide Arthur carefully without revealing yourself.",
    objective: "Help Good complete three quests, then survive the Assassin's guess.",
  },
  percival: {
    name: "Percival",
    team: "good",
    description:
      "You know Merlin. If Morgana is in play, you see both of them but not which is which.",
    objective: "Protect Merlin and help Good complete three quests.",
  },
  loyal: {
    name: "Loyal Servant",
    team: "good",
    description: "You have no secret knowledge. Read the table, find the truth, and serve Arthur.",
    objective: "Help Good complete three quests and keep Merlin hidden.",
  },
  assassin: {
    name: "Assassin",
    team: "evil",
    description: "You know the other agents of Evil except Oberon and may steal victory by identifying Merlin.",
    objective: "Fail three quests—or identify Merlin after Good completes three.",
  },
  morgana: {
    name: "Morgana",
    team: "evil",
    description: "You appear as a possible Merlin to Percival and know the other agents of Evil except Oberon.",
    objective: "Deceive Percival and help Evil fail three quests.",
  },
  mordred: {
    name: "Mordred",
    team: "evil",
    description: "Merlin cannot see you. You know the other agents of Evil except Oberon.",
    objective: "Remain hidden and help Evil fail three quests.",
  },
  oberon: {
    name: "Oberon",
    team: "evil",
    description: "You are Evil, but you do not know the other agents of Evil and they do not know you.",
    objective: "Work alone to help Evil fail three quests.",
  },
  minion: {
    name: "Minion of Mordred",
    team: "evil",
    description: "You know the other agents of Evil except Oberon and must conceal your allegiance.",
    objective: "Help Evil fail three quests or expose Merlin.",
  },
};

export const SPECIAL_ROLES: RoleId[] = ["merlin", "percival", "assassin", "morgana", "mordred", "oberon"];
export const DEFAULT_ROLES: RoleId[] = ["merlin", "percival", "assassin", "morgana"];

export function evilCount(playerCount: number) {
  if (playerCount <= 6) return 2;
  if (playerCount <= 9) return 3;
  return 4;
}

export function buildDeck(playerCount: number, selected: RoleId[]) {
  const evilSeats = evilCount(playerCount);
  const goodSeats = playerCount - evilSeats;
  const goodSpecials = selected.filter((role) => ROLE_INFO[role].team === "good");
  const evilSpecials = selected.filter((role) => ROLE_INFO[role].team === "evil");

  if (playerCount < 5 || playerCount > 10) {
    throw new Error("Avalon needs between 5 and 10 players.");
  }
  if (goodSpecials.length > goodSeats || evilSpecials.length > evilSeats) {
    throw new Error("That role set does not fit this number of players.");
  }
  if (selected.includes("percival") && !selected.includes("merlin")) {
    throw new Error("Percival needs Merlin in the game.");
  }
  if (selected.includes("morgana") && !selected.includes("percival")) {
    throw new Error("Morgana needs Percival in the game.");
  }
  if (selected.includes("merlin") && !selected.includes("assassin")) {
    throw new Error("Merlin should be paired with the Assassin.");
  }

  return [
    ...goodSpecials,
    ...Array<RoleId>(goodSeats - goodSpecials.length).fill("loyal"),
    ...evilSpecials,
    ...Array<RoleId>(evilSeats - evilSpecials.length).fill("minion"),
  ];
}

export function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swapIndex = values[0] % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function publicRoleCard(
  player: { id: string; role: RoleId },
  everyone: Array<{ id: string; name: string; role: RoleId }>,
) {
  const info = ROLE_INFO[player.role];
  let intel: string[] = [];
  let intelLabel = "What you know";

  if (player.role === "merlin") {
    intel = everyone
      .filter((candidate) => ROLE_INFO[candidate.role].team === "evil" && candidate.role !== "mordred")
      .map((candidate) => candidate.name);
    intelLabel = "Agents of Evil you can sense";
  } else if (player.role === "percival") {
    intel = everyone
      .filter((candidate) => candidate.role === "merlin" || candidate.role === "morgana")
      .map((candidate) => candidate.name);
    intelLabel = "Merlin may be among";
  } else if (ROLE_INFO[player.role].team === "evil" && player.role !== "oberon") {
    intel = everyone
      .filter(
        (candidate) =>
          candidate.id !== player.id &&
          ROLE_INFO[candidate.role].team === "evil" &&
          candidate.role !== "oberon",
      )
      .map((candidate) => candidate.name);
    intelLabel = "Minions known to you";
  }

  return { id: player.role, ...info, intel, intelLabel };
}
