"use client";

import { useMemo, useState } from "react";

type TeamSide = "team_1" | "team_2";

type PlayerOption = {
  id: number;
  name: string;
};

type GoalRowState = {
  teamSide: "" | TeamSide;
  scorerPlayerId: string;
  assistPlayerId: string;
  minute: string;
  goalType: "" | "normal" | "solo" | "corner" | "rebound" | "longshot";
};

const GOAL_TYPES = ["normal", "solo", "corner", "rebound", "longshot"] as const;

export function GoalsForm({
  action,
  matchId,
  team1Players,
  team2Players,
  rowCount = 20,
}: {
  action: (formData: FormData) => void | Promise<void>;
  matchId: number;
  team1Players: PlayerOption[];
  team2Players: PlayerOption[];
  rowCount?: number;
}) {
  const [rows, setRows] = useState<GoalRowState[]>(() =>
    Array.from({ length: rowCount }, () => ({
      teamSide: "",
      scorerPlayerId: "",
      assistPlayerId: "",
      minute: "",
      goalType: "",
    }))
  );

  const playersByTeam = useMemo(
    () => ({
      team_1: team1Players,
      team_2: team2Players,
    }),
    [team1Players, team2Players]
  );

  function updateRow(index: number, updater: (current: GoalRowState) => GoalRowState) {
    setRows((prev) => prev.map((row, i) => (i === index ? updater(row) : row)));
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="rowCount" value={rowCount} />

      {rows.map((row, index) => {
        const selectablePlayers = row.teamSide ? playersByTeam[row.teamSide] : [];

        return (
          <div
            key={index}
            className="grid grid-cols-1 md:grid-cols-5 gap-2 border rounded p-2"
          >
            <label className="flex flex-col gap-1">
              <span>Team</span>
              <select
                name={`row_${index}_teamSide`}
                value={row.teamSide}
                onChange={(event) => {
                  const teamSide = event.target.value as "" | TeamSide;
                  updateRow(index, (current) => ({
                    ...current,
                    teamSide,
                    scorerPlayerId: "",
                    assistPlayerId: "",
                  }));
                }}
              >
                <option value="">-</option>
                <option value="team_1">Team 1</option>
                <option value="team_2">Team 2</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span>Torschütze</span>
              <select
                name={`row_${index}_scorerPlayerId`}
                value={row.scorerPlayerId}
                onChange={(event) => {
                  const scorerPlayerId = event.target.value;
                  updateRow(index, (current) => ({
                    ...current,
                    scorerPlayerId,
                    assistPlayerId:
                      current.assistPlayerId === scorerPlayerId ? "" : current.assistPlayerId,
                  }));
                }}
                disabled={!row.teamSide}
              >
                <option value="">-</option>
                {selectablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span>Vorlage</span>
              <select
                name={`row_${index}_assistPlayerId`}
                value={row.assistPlayerId}
                onChange={(event) => {
                  updateRow(index, (current) => ({
                    ...current,
                    assistPlayerId: event.target.value,
                  }));
                }}
                disabled={!row.teamSide}
              >
                <option value="">-</option>
                {selectablePlayers
                  .filter((player) => String(player.id) !== row.scorerPlayerId)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span>Minute</span>
              <input
                type="number"
                name={`row_${index}_minute`}
                min={0}
                value={row.minute}
                onChange={(event) => {
                  updateRow(index, (current) => ({
                    ...current,
                    minute: event.target.value,
                  }));
                }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Tor-Typ</span>
              <select
                name={`row_${index}_goalType`}
                value={row.goalType}
                onChange={(event) => {
                  updateRow(index, (current) => ({
                    ...current,
                    goalType: event.target.value as GoalRowState["goalType"],
                  }));
                }}
              >
                <option value="">-</option>
                {GOAL_TYPES.map((goalType) => (
                  <option key={goalType} value={goalType}>
                    {goalType}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      })}

      <button type="submit" className="self-start">
        Tore speichern
      </button>
    </form>
  );
}
