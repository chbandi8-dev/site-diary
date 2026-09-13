import { notFound } from "next/navigation";
import {
  getHouse, getStages, getTimeline, getMyReports,
  progressPercent, activeStages, nextStage,
} from "@/lib/db/owner";
import { signDownload } from "@/lib/r2";
import HouseHeader from "@/components/owner/HouseHeader";
import Timeline from "@/components/owner/Timeline";
import ReportPanel from "@/components/owner/ReportPanel";

export const dynamic = "force-dynamic";

export default async function HousePage({ params }: { params: { houseId: string } }) {
  const house = await getHouse(params.houseId);
  // Row-level security already returned nothing if this isn't their house, so
  // "not found" and "not yours" are indistinguishable from here — which is
  // exactly right. Telling them apart would confirm the house exists.
  if (!house) notFound();

  const [stages, updates, reports] = await Promise.all([
    getStages(house.id),
    getTimeline(house.id),
    getMyReports(house.id),
  ]);

  // Photos live in a private bucket. RLS has already established that this
  // person may see these rows, so signing short-lived URLs for them is safe.
  const withUrls = await Promise.all(
    updates.map(async (u) => ({
      ...u,
      photos: await Promise.all(
        (u.photos ?? []).map(async (p) => ({ ...p, url: await signDownload(p.key) }))
      ),
    }))
  );

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-10">
      <HouseHeader
        house={house}
        percent={progressPercent(stages)}
        active={activeStages(stages)}
        next={nextStage(stages)}
        stageCount={stages.filter((s) => s.status !== "not_applicable").length}
      />
      <Timeline updates={withUrls} />
      <ReportPanel houseId={house.id} reports={reports} />
    </main>
  );
}
