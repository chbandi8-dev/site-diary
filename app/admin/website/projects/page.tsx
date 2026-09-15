"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Edit, Trash2, Eye, EyeOff, Star, Loader2, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { Project } from "@/types";
import { cn } from "@/lib/utils";

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => { setProjects(data); setLoading(false); });
  };

  useEffect(load, []);

  const togglePublish = async (project: Project) => {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, images: JSON.parse(project.images), published: !project.published }),
    });
    if (res.ok) { toast.success(`Project ${project.published ? "unpublished" : "published"}`); load(); }
    else toast.error("Failed to update");
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    setDeleting(id);
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) { toast.success("Project deleted"); load(); }
    else toast.error("Failed to delete");
  };

  const statusColors: Record<string, string> = {
    completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    ongoing: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    upcoming: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Projects</h2>
          <p className="text-white/40 text-sm mt-1">{projects.length} total</p>
        </div>
        <Link
          href="/admin/website/projects/new"
          className="flex items-center gap-2 bg-gold hover:bg-gold-light text-dark font-bold px-5 py-2.5 rounded-sm transition-all text-sm"
        >
          <Plus size={16} />
          Add Project
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-gold animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-dark-lighter rounded-sm border border-white/5">
          <p className="text-white/30 mb-4">No projects yet</p>
          <Link href="/admin/website/projects/new" className="text-gold hover:underline text-sm">Add your first project</Link>
        </div>
      ) : (
        <div className="bg-dark-lighter border border-white/5 rounded-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-medium">Project</th>
                <th className="text-left text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-medium hidden sm:table-cell">Category</th>
                <th className="text-left text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-medium hidden md:table-cell">Status</th>
                <th className="text-left text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-medium hidden lg:table-cell">Location</th>
                <th className="text-right text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-white/2 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-10 rounded-sm overflow-hidden flex-shrink-0 bg-dark">
                        {project.coverImage ? (
                          <Image src={project.coverImage} alt={project.title} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-white/20 text-xs font-bold">B</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-white text-sm font-medium flex items-center gap-1.5">
                          {project.title}
                          {project.featured && <Star size={11} className="text-gold fill-gold" />}
                        </div>
                        {!project.published && (
                          <span className="text-white/30 text-xs">Draft</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <span className="text-white/50 text-xs">{project.category}</span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className={cn("text-xs px-2 py-0.5 rounded-sm border", statusColors[project.status] ?? statusColors.completed)}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    {project.location && (
                      <span className="text-white/30 text-xs flex items-center gap-1">
                        <MapPin size={11} />
                        {project.location}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => togglePublish(project)}
                        title={project.published ? "Unpublish" : "Publish"}
                        className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-all"
                      >
                        {project.published ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <Link
                        href={`/admin/website/projects/${project.id}/edit`}
                        className="p-1.5 rounded text-white/30 hover:text-gold hover:bg-gold/5 transition-all"
                      >
                        <Edit size={15} />
                      </Link>
                      <button
                        onClick={() => deleteProject(project.id)}
                        disabled={deleting === project.id}
                        className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-all disabled:opacity-50"
                      >
                        {deleting === project.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
