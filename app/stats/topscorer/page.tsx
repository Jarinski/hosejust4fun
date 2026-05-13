import { redirect } from "next/navigation";

export default function LegacyTopscorerRouteRedirect() {
  redirect("/stats/torschuetzen");
}
