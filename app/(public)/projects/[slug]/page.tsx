export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Calendar, User, ArrowLeft, CheckCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { parseImages } from "@/lib/utils";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const project = await prisma.project.findUnique({ where: { slug: params.slug } });
    if (!project) return {};
    return { title: project.title, description: project.shortDescription };
  } catch {
    return {};
  }
}

export default async function ProjectDetailPage({ params }: Props) {
  const project = await prisma.project.findUnique({
    where: { slug: params.slug, published: true },
  });

  if (!project) notFound();

  const images = parseImages(project.images);
  const related = await prisma.project.findMany({
    where: { category: project.category, id: { not: project.id }, published: true },
    take: 3,
    orderBy: { order: "asc" },
  });

  const statusColors: Record<string, string> = {
    completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    ongoing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    upcoming: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  return (
    <>
      {/* Hero */}
      <section className="relative bg-dark pt-20">
        <div className="relative h-[50vh] sm:h-[60vh] overflow-hidden">
          {project.coverImage ? (
            <Image
              src={project.coverImage}
              alt={project.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-dark via-dark-lighter to-dark" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-12">
            <div className="max-w-7xl mx-auto">
              <span className={`inline-block text-xs font-medium px-3 py-1 rounded-sm border mb-4 ${statusColors[project.status] ?? statusColors.completed}`}>
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </span>
              <h1 className="font-display font-bold text-3xl sm:text-5xl text-white mb-4">
                {project.title}
              </h1>
              <p className="text-white/60 text-lg max-w-2xl">{project.shortDescription}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-dark py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Main content */}
            <div className="lg:col-span-2">
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 text-white/40 hover:text-gold text-sm mb-8 transition-colors"
              >
                <ArrowLeft size={14} />
                Back to Projects
              </Link>

              {/* Rich text */}
              <div
                className="tiptap-content text-white/70"
                dangerouslySetInnerHTML={{ // Admin-authored via the rich text editor, but it is stored HTML on a
                  // public page and the admin surface is the weaker one. Sanitise on render.
                  __html: DOMPurify.sanitize(project.description) }}
              />

              {/* Image gallery */}
              {images.length > 1 && (
                <div className="mt-12">
                  <h3 className="font-display font-bold text-xl text-white mb-6">Project Gallery</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative aspect-[4/3] rounded-sm overflow-hidden">
                        <Image src={img} alt={`${project.title} ${i + 1}`} fill className="object-cover hover:scale-105 transition-transform duration-500" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
                <h3 className="font-display font-bold text-white text-lg mb-6">Project Details</h3>
                <div className="space-y-4">
                  {[
                    { icon: MapPin, label: "Location", value: project.location },
                    { icon: Calendar, label: "Year", value: project.year },
                    { icon: User, label: "Client", value: project.client },
                    { icon: CheckCircle, label: "Category", value: project.category },
                  ].map(({ icon: Icon, label, value }) =>
                    value ? (
                      <div key={label} className="flex items-start gap-3">
                        <Icon size={16} className="text-gold mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-white/30 text-xs uppercase tracking-wider">{label}</p>
                          <p className="text-white text-sm">{value}</p>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>

              <div className="bg-gold p-6 rounded-sm">
                <h3 className="font-display font-bold text-dark text-lg mb-3">Start Your Project</h3>
                <p className="text-dark/70 text-sm mb-4">Inspired by this project? Let&apos;s discuss yours.</p>
                <Link
                  href="/contact"
                  className="block text-center bg-dark text-warm font-bold py-3 rounded-sm text-sm hover:bg-dark-lighter transition-colors"
                >
                  Get a Free Quote
                </Link>
              </div>
            </div>
          </div>

          {/* Related projects */}
          {related.length > 0 && (
            <div className="mt-20">
              <h2 className="font-display font-bold text-2xl text-white mb-8">Related Projects</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/projects/${r.slug}`}
                    className="group block bg-dark-lighter border border-white/5 hover:border-gold/30 rounded-sm overflow-hidden transition-all"
                  >
                    <div className="relative h-40">
                      {r.coverImage ? (
                        <Image src={r.coverImage} alt={r.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="absolute inset-0 bg-dark-card" />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-gold text-xs mb-1">{r.category}</p>
                      <h4 className="text-white font-semibold group-hover:text-gold transition-colors line-clamp-1">{r.title}</h4>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
