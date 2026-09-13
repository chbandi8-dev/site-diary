import { redirect } from "next/navigation";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import { getHouse, getStages, getTimeline, getReports, activeStages, nextStage } from "@/lib/db/owner";
import HouseHeader from "@/components/owner/HouseHeader";
import Timeline from "@/components/owner/Timeline";
import RegisterCard from "@/components/owner/RegisterCard";
import ReportPanel from "@/components/owner/ReportPanel";

export const dynamic = "force-dynamic";

export default async function MyBuild() {
  const access = await currentHouse();
  if (!access) redirect("/my/no-access");

  const house = await getHouse(access.houseId);
  if (!house) redirect("/my/no-access");

  const [stages, updates, reports, viewer] = await Promise.all([
    getStages(access.houseId),
    getTimeline(access.houseId),
    getReports(access.houseId),
    currentViewer(access.houseId),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:pt-16">
      <HouseHeader
        house={house}
        stages={stages}
        active={activeStages(stages)}
        next={nextStage(stages)}
      />

      {/*
        Placed after the header, never before it. The moment someone sees photos
        of their own build is the moment they will happily hand over an email —
        asking first spends that goodwill and loses people at the door.
      */}
      {!viewer && <RegisterCard />}

      <Timeline updates={updates} />

      <ReportPanel
        viewer={viewer}
        reports={reports.map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          replyBody: r.replyBody,
          fromName: r.owner.name,
        }))}
      />
    </main>
  );
}
