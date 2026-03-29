type ErrorLike = {
  code?: string;
  message?: string;
  cause?: unknown;
};

function toErrorLike(value: unknown): ErrorLike | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as ErrorLike;
}

export function isMissingRelationError(error: unknown, relationName: string): boolean {
  const direct = toErrorLike(error);
  const cause = toErrorLike(direct?.cause);

  const candidates = [direct, cause].filter((entry): entry is ErrorLike => entry !== null);
  const missingRelationMessage = `relation "${relationName}" does not exist`;

  return candidates.some((entry) => {
    const codeMatches = entry.code === "42P01";
    const messageMatches =
      typeof entry.message === "string" && entry.message.toLowerCase().includes(missingRelationMessage);

    return codeMatches || messageMatches;
  });
}
