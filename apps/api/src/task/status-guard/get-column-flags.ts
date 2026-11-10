import { and, inArray } from "drizzle-orm";
import { columnTable } from "../../database/schema";
import type { DbOrTx } from "../../project-access/db-or-tx";
import type { ColumnAt, ColumnFlags, TaskPlace } from "./classify-moves";

const placeKey = (projectId: string, status: string) =>
  `${projectId}\u0000${status}`;

// Loads the columns behind every place in one query.
export async function getColumnFlags(
  database: DbOrTx,
  places: TaskPlace[],
): Promise<ColumnAt> {
  if (places.length === 0) return () => undefined;

  const rows = await database
    .select({
      projectId: columnTable.projectId,
      slug: columnTable.slug,
      name: columnTable.name,
      isFinal: columnTable.isFinal,
      blockWhileBlocked: columnTable.blockWhileBlocked,
    })
    .from(columnTable)
    .where(
      and(
        inArray(columnTable.projectId, [
          ...new Set(places.map((place) => place.projectId)),
        ]),
        inArray(columnTable.slug, [
          ...new Set(places.map((place) => place.status)),
        ]),
      ),
    );

  const columns = new Map<string, ColumnFlags>(
    rows.map(({ projectId, slug, ...flags }) => [
      placeKey(projectId, slug),
      flags,
    ]),
  );
  return (place) => columns.get(placeKey(place.projectId, place.status));
}
