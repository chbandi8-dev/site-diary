import { redirect } from "next/navigation";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import {
  getHouse, getStages, getTimeline, getReports, getBuilder, activeStages, nextStage,
} from "@/lib/db/owner";
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

  const viewer = await currentViewer(access.houseId);

  const [stages, updates, reports, builder] = await Promise.all([
    getStages(access.houseId),
    getTimeline(access.houseId),
    viewer ? getReports(access.houseId, viewer.id) : Promise.resolve([]),
    getBuilder(),
  ]);

  // What they opened the link to see. It was previously below the header, the
  // phase rail and a form — a scroll away from the one thing they came for.
  const latest = updates.find((u) => u.photos.length > 0)?.photos[0] ?? null;

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:pt-16">
      <HouseHeader
        house={house}
        stages={stages}
        active={activeStages(stages)}
        next={nextStage(stages)}
        lastUpdate={updates[0]?.occurredAt ?? null}
        builder={builder}
        latestPhoto={latest ? { url: latest.url, caption: latest.caption } : null}
      />

      {/*
        Placed after the header, never before it. The moment someone sees photos
        of their own build is the moment they will happily hand over an email —
        asking first spends that goodwill and loses people at the door.
      */}
      {!viewer && <RegisterCard />}

      <Timeline updates={updates} registered={Boolean(viewer)} />

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
