import { redirect } from "next/navigation";
import { currentHouse, currentViewer, recordVisit } from "@/lib/owner/session";
import {
  getHouse, getStages, getTimeline, getReports, getBuilder, getDecisions,
  getVariations, getDocuments, getWetDays, getDefects,
  activeStages, nextStage,
} from "@/lib/db/owner";
import HouseHeader from "@/components/owner/HouseHeader";
import Timeline from "@/components/owner/Timeline";
import RegisterCard from "@/components/owner/RegisterCard";
import Decisions from "@/components/owner/Decisions";
import ReportPanel from "@/components/owner/ReportPanel";
import Variations from "@/components/owner/Variations";
import Documents from "@/components/owner/Documents";
import WetDays from "@/components/owner/WetDays";
import Defects from "@/components/owner/Defects";

export const dynamic = "force-dynamic";

export default async function MyBuild() {
  const access = await currentHouse();
  if (!access) redirect("/my/no-access");

  const house = await getHouse(access.houseId);
  if (!house) redirect("/my/no-access");

  const viewer = await currentViewer(access.houseId);

  // After the viewer is resolved, so the visit can be attributed to a person
  // where there is one.
  await recordVisit(
    access.linkId,
    viewer ? { houseId: access.houseId, ownerId: viewer.id } : undefined
  );

  const [stages, updates, reports, builder, decisions, variations, documents, wetDays, defects] =
    await Promise.all([
      getStages(access.houseId),
      getTimeline(access.houseId),
      viewer ? getReports(access.houseId, viewer.id) : Promise.resolve([]),
      getBuilder(),
      getDecisions(access.houseId),
      getVariations(access.houseId),
      getDocuments(access.houseId),
      getWetDays(access.houseId),
      getDefects(access.houseId),
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
      {/* Above the timeline: this is the one thing on the page that asks
          something of them rather than telling them something. */}
      <Decisions
        canAnswer={Boolean(viewer)}
        decisions={decisions.map((d) => ({
          id: d.id,
          question: d.question,
          detail: d.detail,
          options: Array.isArray(d.options) ? (d.options as string[]) : [],
          dueDate: d.dueDate,
          consequence: d.consequence,
          status: d.status,
          answer: d.answer,
          answeredAt: d.answeredAt,
        }))}
      />

      {/* Beside the decisions, and for the same reason — this is the other
          thing on the page that needs them to act rather than read. */}
      <Variations
        canDecide={Boolean(viewer)}
        variations={variations.map((v) => ({
          id: v.id,
          reference: v.reference,
          description: v.description,
          amountCents: v.amountCents,
          status: v.status,
          sentAt: v.sentAt,
          approvedAt: v.approvedAt,
          declinedAt: v.declinedAt,
          declineReason: v.declineReason,
          decidedBy: v.approvedBy?.name ?? null,
        }))}
      />

      {!viewer && <RegisterCard />}

      <Timeline updates={updates} registered={Boolean(viewer)} />

      {/* In the handover fortnight this is why they open the page at all, so
          it sits directly under the timeline rather than with the reference
          material below. */}
      <Defects defects={defects} />

      {/* Below the timeline: these answer questions rather than report news,
          and an owner opening the link wants today's photo first. */}
      <WetDays days={wetDays} />

      <Documents documents={documents} />

      <ReportPanel
        viewer={viewer}
        handedOver={Boolean(house.handedOverAt)}
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
