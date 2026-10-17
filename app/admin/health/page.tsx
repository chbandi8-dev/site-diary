import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { Gauge } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * How far away the database is, measured from the server he is actually using.
 *
 * Almost all of this app's load time is trips to the database, and a trip's
 * cost is the distance between the server and the database — a thing that
 * cannot be seen from the code and can be wrong by a factor of fifty depending
 * on two dropdowns in two dashboards. So rather than guess, this asks the live
 * server to time itself and says in plain words what, if anything, to change.
 *
 * Shows only what is safe to show: the server's region, timings, and whether the
 * connection is pooled. Never the connection string.
 */

// Vercel regions that sit next to the matching AWS region Supabase names.
const NEAREST: Record<string, { vercel: string; place: string }> = {
  "ap-southeast-2": { vercel: "syd1", place: "Sydney" },
  "ap-southeast-1": { vercel: "sin1", place: "Singapore" },
  "ap-northeast-1": { vercel: "hnd1", place: "Tokyo" },
  "ap-northeast-2": { vercel: "icn1", place: "Seoul" },
  "ap-south-1": { vercel: "bom1", place: "Mumbai" },
  "us-east-1": { vercel: "iad1", place: "Washington DC" },
  "us-west-1": { vercel: "sfo1", place: "San Francisco" },
  "eu-west-1": { vercel: "dub1", place: "Dublin" },
  "eu-west-2": { vercel: "lhr1", place: "London" },
  "eu-central-1": { vercel: "fra1", place: "Frankfurt" },
  "sa-east-1": { vercel: "gru1", place: "São Paulo" },
};

function describeConnection() {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const url = new URL(raw);
    const region = url.hostname.match(/aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com/)?.[1] ?? null;
    return {
      // Transaction mode is the one that needs ?pgbouncer=true, and measured with
      // Prisma it costs about five trips per query instead of one. Session mode
      // (the same pooler on port 5432) and a direct connection cost one.
      transactionMode: url.port === "6543" || url.searchParams.get("pgbouncer") === "true",
      onPooler: url.hostname.includes("pooler"),
      databaseRegion: region,
    };
  } catch {
    return { transactionMode: false, onPooler: false, databaseRegion: null };
  }
}

export default async function Health() {
  await requireStaff();

  const serverRegion = process.env.VERCEL_REGION ?? null;
  const { transactionMode, onPooler, databaseRegion } = describeConnection();

  // The first query pays for opening the connection; the rest are the real
  // cost of one trip. Both are worth showing — the first is what a cold start feels like.
  const timings: number[] = [];
  let failed: string | null = null;
  try {
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      await prisma.$queryRaw`select 1`;
      timings.push(performance.now() - t);
    }
  } catch (cause) {
    failed = cause instanceof Error ? cause.message.split("\n").pop() ?? "" : "unknown";
  }

  const first = timings[0] ?? 0;
  const typical = [...timings.slice(1)].sort((a, b) => a - b)[Math.floor((timings.length - 1) / 2)] ?? 0;
  const near = databaseRegion ? NEAREST[databaseRegion] : undefined;
  const far = typical >= 80;

  const verdict = failed
    ? { tone: "bad", text: "The server could not reach the database just now." }
    : typical < 30
      ? { tone: "good", text: "The database is close to the server. Distance is not what is slowing this down." }
      : typical < 80
        ? { tone: "ok", text: "A little distance to the database. Worth fixing, not urgent." }
        : { tone: "bad", text: "The database is far from the server. Every page pays for that distance, and it is most of the wait." };

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <Link href="/admin/houses" className="text-sm text-white/45 hover:text-white">
        ← All houses
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="flex items-center gap-2.5 font-display text-2xl text-white sm:text-3xl">
          <Gauge size={22} aria-hidden="true" className="text-gold" />
          Speed check
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-white/45">
          Timed just now, from the server he is actually using.
        </p>
      </header>

      <p
        className={
          "rounded-xl border px-5 py-4 text-[15px] leading-relaxed " +
          (verdict.tone === "good"
            ? "border-white/[0.09] bg-dark-card text-white"
            : "border-danger/30 bg-danger/[0.06] text-white")
        }
      >
        {verdict.text}
      </p>

      <dl className="mt-5 overflow-hidden rounded-xl border border-white/[0.07] bg-dark-card">
        {[
          ["One trip to the database", failed ? "failed" : `${Math.round(typical)} ms`],
          ["First trip after a quiet spell", failed ? "—" : `${Math.round(first)} ms`],
          // Pages now ask for everything at once, so they wait for about two trips
          // in a row (the data, then a follow-up) rather than sixteen.
          ["A page waits about", failed ? "—" : `${Math.round(typical * 2)} ms for the database`],
          ["Server is running in", serverRegion ?? "not on Vercel"],
          ["Database region", databaseRegion ? `${databaseRegion}${near ? ` (${near.place})` : ""}` : "not shown in the address"],
          [
            "Connection style",
            transactionMode
              ? "transaction pooler (slow when far)"
              : onPooler
                ? "session pooler"
                : "direct",
          ],
        ].map(([label, value], i) => (
          <div
            key={label}
            className={"flex items-baseline justify-between gap-4 px-5 py-3.5 " + (i > 0 ? "border-t border-white/[0.06]" : "")}
          >
            <dt className="text-sm text-white/55">{label}</dt>
            <dd className="text-right font-mono text-sm tabular-nums text-white">{value}</dd>
          </div>
        ))}
      </dl>

      {(far || failed || transactionMode || !onPooler) && (
        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
            What to change
          </h2>
          <ol className="flex flex-col gap-3 text-sm leading-relaxed text-white/70">
            {transactionMode && (
              <li className="rounded-xl border border-white/[0.07] bg-dark-card p-4">
                <span className="font-medium text-white">Switch to the Session pooler address.</span>{" "}
                Right now each question to the database costs about five trips instead of one,
                because of the <code className="text-gold">pgbouncer=true</code> setting. In
                Supabase: <b>Connect</b> → <b>Session pooler</b> → copy that address. In Vercel:
                <b> Settings</b> → <b>Environment Variables</b> → edit{" "}
                <code className="text-gold">DATABASE_URL</code>, paste it, and add{" "}
                <code className="text-gold">?connection_limit=3</code> on the end — with no{" "}
                <code className="text-gold">pgbouncer=true</code>. Leave{" "}
                <code className="text-gold">DIRECT_URL</code> as it is. Then redeploy.
              </li>
            )}
            {!transactionMode && !onPooler && (
              <li className="rounded-xl border border-white/[0.07] bg-dark-card p-4">
                <span className="font-medium text-white">Use the Session pooler address.</span> A
                direct database address often cannot be reached from Vercel&apos;s servers at all. In
                Supabase: <b>Connect</b> → <b>Session pooler</b>. Put that in Vercel as{" "}
                <code className="text-gold">DATABASE_URL</code> with{" "}
                <code className="text-gold">?connection_limit=3</code> on the end, then redeploy.
              </li>
            )}
            {far && (
              <li className="rounded-xl border border-white/[0.07] bg-dark-card p-4">
                <span className="font-medium text-white">Move the server next to the database.</span>{" "}
                In Vercel: this project → <b>Settings</b> → <b>Functions</b> → <b>Function Region</b>
                {near ? (
                  <>
                    {" "}
                    → choose <b>{near.place} ({near.vercel})</b>, then redeploy.
                  </>
                ) : (
                  <> → choose the region closest to where the database is, then redeploy. If the database is in Sydney, that is <b>Sydney (syd1)</b>.</>
                )}{" "}
                This is a setting, not code.
              </li>
            )}
            {failed && (
              <li className="rounded-xl border border-white/[0.07] bg-dark-card p-4">
                <span className="font-medium text-white">The database did not answer.</span> {failed}
              </li>
            )}
          </ol>
        </section>
      )}
    </div>
  );
}
