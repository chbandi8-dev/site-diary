"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit, Trash2, Save, X, Loader2, Star } from "lucide-react";
import toast from "react-hot-toast";
import { Testimonial } from "@/types";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  role: z.string().optional(),
  text: z.string().min(10),
  rating: z.number().min(1).max(5),
  published: z.boolean(),
  order: z.number(),
});

type FormData = z.infer<typeof schema>;

export default function AdminTestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 5, published: true, order: 0 },
  });

  const rating = watch("rating");

  const load = () => {
    fetch("/api/testimonials")
      .then((r) => r.json())
      .then((d) => { setTestimonials(d); setLoading(false); });
  };

  useEffect(load, []);

  const openNew = () => {
    reset({ name: "", company: "", role: "", text: "", rating: 5, published: true, order: testimonials.length });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (t: Testimonial) => {
    reset({ name: t.name, company: t.company ?? "", role: t.role ?? "", text: t.text, rating: t.rating, published: t.published, order: t.order });
    setEditingId(t.id);
    setShowForm(true);
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const url = editingId ? `/api/testimonials/${editingId}` : "/api/testimonials";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Updated" : "Created");
      setShowForm(false);
      load();
    } catch { toast.error("Failed"); }
    finally { setSaving(false); }
  };

  const deleteTestimonial = async (id: string) => {
    if (!confirm("Delete this testimonial?")) return;
    const res = await fetch(`/api/testimonials/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); load(); }
    else toast.error("Failed");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Testimonials</h2>
          <p className="text-white/40 text-sm mt-1">{testimonials.length} testimonials</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-gold hover:bg-gold-light text-dark font-bold px-5 py-2.5 rounded-sm transition-all text-sm">
          <Plus size={16} /> Add Testimonial
        </button>
      </div>

      {showForm && (
        <div className="bg-dark-lighter border border-gold/20 rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold">{editingId ? "Edit Testimonial" : "New Testimonial"}</h3>
            <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Name *</label>
              <input {...register("name")} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Company</label>
              <input {...register("company")} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Role</label>
              <input {...register("role")} placeholder="e.g. Homeowner" className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-3 py-2.5 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Rating</label>
              <div className="flex gap-1.5 mt-1">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} type="button" onClick={() => setValue("rating", n)} className="transition-transform hover:scale-110">
                    <Star size={22} className={cn("transition-colors", n <= rating ? "text-gold fill-gold" : "text-white/20")} />
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Testimonial Text *</label>
              <textarea {...register("text")} rows={4} placeholder="What the client said..." className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-3 py-2.5 text-sm outline-none resize-none" />
              {errors.text && <p className="text-red-400 text-xs mt-1">Minimum 10 characters</p>}
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-dark font-bold px-6 py-2.5 rounded-sm text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="text-gold animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {testimonials.map((t) => (
            <div key={t.id} className="bg-dark-lighter border border-white/5 rounded-sm p-5 flex gap-4">
              <div className="w-10 h-10 bg-gold/10 border border-gold/20 rounded-sm flex items-center justify-center flex-shrink-0">
                <span className="text-gold font-bold">{t.name.charAt(0)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white font-medium">{t.name}</p>
                    {(t.company || t.role) && (
                      <p className="text-white/40 text-xs">{t.role}{t.role && t.company && " · "}{t.company}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} size={12} className="text-gold fill-gold" />
                    ))}
                  </div>
                </div>
                <p className="text-white/50 text-sm mt-2 line-clamp-2">{t.text}</p>
              </div>
              <div className="flex items-start gap-1 flex-shrink-0">
                <button onClick={() => openEdit(t)} className="p-1.5 text-white/30 hover:text-gold rounded"><Edit size={14} /></button>
                <button onClick={() => deleteTestimonial(t.id)} className="p-1.5 text-white/30 hover:text-red-400 rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
