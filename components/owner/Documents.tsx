import { Download } from "lucide-react";

type Doc = {
  id: string;
  title: string;
  category: string;
  bytes: number | null;
  uploadedAt: Date;
  url: string;
};

const LABELS: Record<string, string> = {
  plans: "Plans",
  permits: "Permits and approvals",
  contract: "Contract",
  certificates: "Certificates",
  warranties: "Warranties",
  other: "Other",
};

function size(bytes: number | null): string {
  if (!bytes) return "";
  return bytes > 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(Math.round(bytes / 1000), 1)} KB`;
}

/**
 * Their paperwork, in one place.
 *
 * Deliberately a plain list of links rather than a viewer. An owner wanting
 * their plans usually wants to send them to a landscaper or a kitchen company,
 * so the useful verb is download, not preview.
 *
 * A server component: the links are signed at render and there is no state
 * here worth shipping JavaScript for.
 */
export default function Documents({ documents }: { documents: Doc[] }) {
  if (documents.length === 0) return null;

  const groups = new Map<string, Doc[]>();
  for (const doc of documents) {
    const list = groups.get(doc.category) ?? [];
    list.push(doc);
    groups.set(doc.category, list);
  }

  return (
    <section className="mt-12">
      <h2 className="mb-1 font-display text-2xl tracking-tight">Your documents</h2>
      <p className="mb-5 max-w-prose text-[15px] leading-relaxed text-text/65">
        Everything filed for your build. Download any of them whenever you need to — you
        don&apos;t have to ask.
      </p>

      <div className="flex flex-col gap-7">
        {Array.from(groups.entries()).map(([category, docs]) => (
          <div key={category}>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.13em] text-text/45">
              {LABELS[category] ?? category}
            </h3>
            <ul className="flex flex-col">
              {docs.map((d) => (
                <li key={d.id} className="border-t border-text/10">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 py-3 transition-colors hover:text-accent-primary"
                  >
                    <Download
                      size={15}
                      aria-hidden="true"
                      className="flex-none text-text/35 group-hover:text-accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{d.title}</span>
                    <span className="flex-none text-sm text-text/45">{size(d.bytes)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
