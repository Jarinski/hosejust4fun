import dotenv from "dotenv";
import { asc } from "drizzle-orm";
import { db } from "../src/db";
import { matches } from "../src/db/schema";
import { awardSimpleBadgesForMatch } from "../src/lib/awardSimpleBadgesForMatch";

dotenv.config({ path: ".env.local" });

async function main() {
  console.log("[start] Recompute simple match badges...");

  const matchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .orderBy(asc(matches.matchDate), asc(matches.id));

  const totalMatches = matchRows.length;
  let successCount = 0;
  let errorCount = 0;

  console.log(`[info] Matches gefunden: ${totalMatches}`);

  for (const [index, match] of matchRows.entries()) {
    const position = `${index + 1}/${totalMatches}`;

    try {
      await awardSimpleBadgesForMatch(match.id);
      successCount += 1;
      console.log(`[ok]   [${position}] match_id=${match.id}`);
    } catch (error) {
      errorCount += 1;
      console.error(`[fail] [${position}] match_id=${match.id}`, error);
    }
  }

  console.log("\n[done] Recompute abgeschlossen");
  console.log(`- Matches gefunden: ${totalMatches}`);
  console.log(`- Erfolgreich recomputed: ${successCount}`);
  console.log(`- Fehler: ${errorCount}`);

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[error] Recompute fehlgeschlagen:", error);
  process.exit(1);
});