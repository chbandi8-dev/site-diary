"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Loader2, Star, Eye, EyeOff, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import RichTextEditor from "./RichTextEditor";
import ImageUpload from "./ImageUpload";
import { Project, PROJECT_CATEGORIES, PROJECT_STATUSES } from "@/types";
import { cn, parseImages } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  shortDescription: z.string().min(1, "Short description is required").max(200),
  category: z.string().min(1, "Category is required"),
  status: z.string(),
  location: z.string().optional(),
  year: z.string().optional(),
  client: z.string().optional(),
  featured: z.boolean(),
  published: z.boolean(),
  order: z.number(),
});

type FormData = z.infer<typeof schema>;

interface ProjectFormProps {
  project?: Project;
}

export default function ProjectForm({ project }: ProjectFormProps) {
  const router = useRouter();
  const [description, setDescription] = useState(project?.description ?? "");
  const [coverImage, setCoverImage] = useState(project?.coverImage ?? "");
  const [images, setImages] = useState<string[]>(parseImages(project?.images ?? "[]"));
  const [saving, setSaving] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: project?.title ?? "",
      shortDescription: project?.shortDescription ?? "",
      category: project?.category ?? PROJECT_CATEGORIES[0],
      status: project?.status ?? "completed",
      location: project?.location ?? "",
      year: project?.year ?? new Date().getFullYear().toString(),
      client: project?.client ?? "",
      featured: project?.featured ?? false,
      published: project?.published ?? true,
      order: project?.order ?? 0,
    },
  });

  const featured = watch("featured");
  const published = watch("published");

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const payload = { ...data, description, coverImage, images };
      const url = project ? `/api/projects/${project.id}` : "/api/projects";
      const method = project ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");
      toast.success(project ? "Project updated" : "Project created");
      router.push("/admin/website/projects");
    } catch {
      toast.error("Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  const addImage = () => {
    if (newImageUrl && !images.includes(newImageUrl)) {
      setImages([...images, newImageUrl]);
      setNewImageUrl("");
    }
  };

  const removeImage = (url: string) => setImages(images.filter((i) => i !== url));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">
            {project ? "Edit Project" : "New Project"}
          </h2>
          <p className="text-white/40 text-sm mt-1">
            {project ? `Editing: ${project.title}` : "Add a new project to your portfolio"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setValue("featured", !featured)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-sm border text-xs transition-all",
              featured ? "border-gold/40 bg-gold/10 text-gold" : "border-white/10 text-white/40 hover:border-white/20"
            )}
          >
            <Star size={13} className={featured ? "fill-gold" : ""} />
            Featured
          </button>
          <button
            type="button"
            onClick={() => setValue("published", !published)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-sm border text-xs transition-all",
              published ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" : "border-white/10 text-white/40 hover:border-white/20"
            )}
          >
            {published ? <Eye size={13} /> : <EyeOff size={13} />}
            {published ? "Published" : "Draft"}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-dark font-bold px-5 py-2.5 rounded-sm transition-all text-sm"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving..." : "Save Project"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info */}
          <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5">Basic Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Project Title *</label>
                <input {...register("title")} placeholder="e.g. Modern Harbourside Residence" className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-4 py-3 text-sm outline-none transition-colors" />
                {errors.title && <p className="text-danger text-xs mt-1">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Short Description * <span className="normal-case text-white/20">(shown in cards, max 200 chars)</span></label>
                <textarea {...register("shortDescription")} rows={2} placeholder="A brief, compelling summary of the project..." className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-4 py-3 text-sm outline-none transition-colors resize-none" />
                {errors.shortDescription && <p className="text-danger text-xs mt-1">{errors.shortDescription.message}</p>}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5">Full Description</h3>
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder="Describe the project in detail — scope, challenges, features, outcomes..."
            />
          </div>

          {/* Images */}
          <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5">Cover Image</h3>
            <ImageUpload value={coverImage} onChange={setCoverImage} label="" />
          </div>

          <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5">Gallery Images</h3>
            <div className="flex gap-2 mb-4">
              <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Paste image URL to add to gallery..." className="flex-1 bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-3 py-2 text-sm outline-none transition-colors" />
              <button type="button" onClick={addImage} className="flex items-center gap-1 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold px-3 py-2 rounded-sm text-sm transition-all">
                <Plus size={14} /> Add
              </button>
            </div>
            {images.length > 0 && (
              <div className="space-y-2">
                {images.map((img) => (
                  <div key={img} className="flex items-center gap-2 bg-dark p-2 rounded-sm border border-white/5">
                    <span className="flex-1 text-white/50 text-xs truncate">{img}</span>
                    <button type="button" onClick={() => removeImage(img)} className="text-white/30 hover:text-danger transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5">Classification</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Category *</label>
                <select {...register("category")} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none">
                  {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Status</label>
                <select {...register("status")} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none">
                  {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Display Order</label>
                <input type="number" {...register("order", { valueAsNumber: true })} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none" />
              </div>
            </div>
          </div>

          <div className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5">Project Details</h3>
            <div className="space-y-4">
              {[
                { name: "location", label: "Location", placeholder: "e.g. Mosman, NSW" },
                { name: "year", label: "Year", placeholder: "e.g. 2024" },
                { name: "client", label: "Client", placeholder: "e.g. Private Client" },
              ].map(({ name, label, placeholder }) => (
                <div key={name}>
                  <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">{label}</label>
                  <input {...register(name as "location" | "year" | "client")} placeholder={placeholder} className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-3 py-2.5 text-sm outline-none transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
