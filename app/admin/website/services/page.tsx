"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit, Trash2, Save, X, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { Service, SERVICE_ICONS } from "@/types";
import { parseFeatures } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string(),
  order: z.number(),
  published: z.boolean(),
});

type FormData = z.infer<typeof schema>;

export default function AdminServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { icon: "home", order: 0, published: true },
  });

  const load = () => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((data) => { setServices(data); setLoading(false); });
  };

  useEffect(load, []);

  const openNew = () => {
    reset({ title: "", description: "", icon: "home", order: services.length, published: true });
    setFeatures([]);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (service: Service) => {
    reset({ title: service.title, description: service.description, icon: service.icon ?? "home", order: service.order, published: service.published });
    setFeatures(parseFeatures(service.features));
    setEditingId(service.id);
    setShowForm(true);
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const payload = { ...data, features };
      const url = editingId ? `/api/services/${editingId}` : "/api/services";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Service updated" : "Service created");
      setShowForm(false);
      load();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const deleteService = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); load(); }
    else toast.error("Failed");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Services</h2>
          <p className="text-white/40 text-sm mt-1">{services.length} services</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-gold hover:bg-gold-light text-dark font-bold px-5 py-2.5 rounded-sm transition-all text-sm">
          <Plus size={16} /> Add Service
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-dark-lighter border border-gold/20 rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold">{editingId ? "Edit Service" : "New Service"}</h3>
            <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Title *</label>
              <input {...register("title")} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none" />
              {errors.title && <p className="text-red-400 text-xs mt-1">Required</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Icon</label>
                <select {...register("icon")} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none">
                  {SERVICE_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Order</label>
                <input type="number" {...register("order", { valueAsNumber: true })} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Description *</label>
              <textarea {...register("description")} rows={3} className="w-full bg-dark border border-white/10 focus:border-gold text-white rounded-sm px-3 py-2.5 text-sm outline-none resize-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">Features</label>
              <div className="flex gap-2 mb-2">
                <input value={newFeature} onChange={(e) => setNewFeature(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newFeature) { setFeatures([...features, newFeature]); setNewFeature(""); } } }} placeholder="Add a feature and press Enter" className="flex-1 bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-3 py-2 text-sm outline-none" />
                <button type="button" onClick={() => { if (newFeature) { setFeatures([...features, newFeature]); setNewFeature(""); } }} className="bg-gold/10 border border-gold/30 text-gold px-3 py-2 rounded-sm text-sm">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {features.map((f) => (
                  <span key={f} className="flex items-center gap-1.5 bg-dark border border-white/10 text-white/60 text-xs px-3 py-1.5 rounded-sm">
                    {f}
                    <button type="button" onClick={() => setFeatures(features.filter((x) => x !== f))} className="text-white/30 hover:text-red-400"><X size={11} /></button>
                  </span>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-dark font-bold px-6 py-2.5 rounded-sm text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Saving..." : "Save Service"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="text-gold animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <div key={service.id} className="flex items-center gap-4 bg-dark-lighter border border-white/5 rounded-sm p-4">
              <div className="flex-1">
                <p className="text-white font-medium">{service.title}</p>
                <p className="text-white/40 text-xs line-clamp-1 mt-0.5">{service.description}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-sm border ${service.published ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" : "text-white/30 bg-white/5 border-white/10"}`}>
                {service.published ? "Published" : "Draft"}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(service)} className="p-1.5 text-white/30 hover:text-gold rounded transition-colors"><Edit size={15} /></button>
                <button onClick={() => deleteService(service.id)} className="p-1.5 text-white/30 hover:text-red-400 rounded transition-colors"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
