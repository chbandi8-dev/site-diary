import { prisma } from "@/lib/prisma";
import { learnPace, type Pace } from "./pace";

/** One read of every finished stage across all his houses. */
export async function loadPace(): Promise<Pace> {
  const rows = await prisma.houseStage.findMany({
    where: { status: "complete", completedAt: { not: null } },
    select: {
      houseId: true,
      name: true,
      position: true,
      plannedDays: true,
      startedAt: true,
      completedAt: true,
    },
  });
  return learnPace(rows);
}
