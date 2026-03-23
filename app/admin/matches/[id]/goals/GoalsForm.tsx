"use client";

import { useMemo, useState } from "react";

type TeamSide = "team_1" | "team_2";
export type GoalType = "" | "normal" | "solo" | "corner" | "rebound" | "longshot";

type PlayerOption = {
  id: number;
  name: string;
};

export type GoalRowState = {
  teamSide: "" | TeamSide;
  isOwnGoal: boolean;
  scorerPlayerId: string;
  assistPlayerId: string;
  minute: string;
  goalType: GoalType;
};

const GOAL_TYPES = ["normal", "solo", "corner", "rebound", "longshot"] as const;

function createEmptyGoalRow(): GoalRowState {
  return {
    teamSide: "",
    isOwnGoal: false,
    scorerPlayerId: "",
    assistPlayerId: "",
    minute: "",
    goalType: "",
  };
}

export function GoalsForm({
  action,
  matchId,
  team1Players,
  team2Players,
  initialRows,
  rowCount = 20,
}: {
  action: (formData: FormData) => void | Promise<void>;
  matchId: number;
  team1Players: PlayerOption[];
  team2Players: PlayerOption[];
  initialRows?: GoalRowState[];
  rowCount?: number;
}) {
  const [rows, setRows] = useState<GoalRowState[]>(() => {
    const emptyRows = Array.from({ length: rowCount }, () => createEmptyGoalRow());

    if (!initialRows || initialRows.length === 0) {
      return emptyRows;
    }

    return emptyRows.map((emptyRow, index) => initialRows[index] ?? emptyRow);
  });

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
        const selectablePlayers = row.teamSide
          ? row.isOwnGoal
            ? playersByTeam[row.teamSide === "team_1" ? "team_2" : "team_1"]
            : playersByTeam[row.teamSide]
          : [];

        return (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-300 bg-stone-50 p-3 md:grid-cols-6"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Team</span>
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
                    isOwnGoal: false,
                  }));
                }}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
              >
                <option value="">-</option>
                <option value="team_1">Team 1</option>
                <option value="team_2">Team 2</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Eigentor</span>
              <div className="flex h-full items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name={`row_${index}_isOwnGoal`}
                  checked={row.isOwnGoal}
                  onChange={(event) => {
                    const isOwnGoal = event.target.checked;
                    updateRow(index, (current) => ({
                      ...current,
                      isOwnGoal,
                      scorerPlayerId: "",
                      assistPlayerId: "",
                    }));
                  }}
                  disabled={!row.teamSide}
                />
                <span className="ml-2 text-zinc-600">Ja</span>
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                {row.isOwnGoal ? "Verursacher (Eigentor)" : "Torschütze"}
              </span>
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
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-60"
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
              <span className="text-xs text-zinc-500">Vorlage</span>
              <select
                name={`row_${index}_assistPlayerId`}
                value={row.assistPlayerId}
                onChange={(event) => {
                  updateRow(index, (current) => ({
                    ...current,
                    assistPlayerId: row.isOwnGoal ? "" : event.target.value,
                  }));
                }}
                disabled={!row.teamSide || row.isOwnGoal}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-60"
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
              <span className="text-xs text-zinc-500">Minute</span>
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
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Tor-Typ</span>
              <select
                name={`row_${index}_goalType`}
                value={row.goalType}
                onChange={(event) => {
                  updateRow(index, (current) => ({
                    ...current,
                    goalType: event.target.value as GoalRowState["goalType"],
                  }));
                }}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
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

      <button
        type="submit"
        className="self-start rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 text-sm hover:border-zinc-500"
      >
        Tore speichern
      </button>
    </form>
  );
}
