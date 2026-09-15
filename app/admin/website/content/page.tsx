"use client";

import { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface ContentField {
  key: string;
  label: string;
  type: "text" | "textarea";
  placeholder?: string;
}

const contentGroups: { title: string; fields: ContentField[] }[] = [
  {
    title: "Hero Section",
    fields: [
      { key: "hero_title", label: "Hero Title (use \\n for line break)", type: "textarea", placeholder: "Building Your Vision,\nDelivering Excellence" },
      { key: "hero_subtitle", label: "Hero Subtitle", type: "textarea", placeholder: "Subtitle text..." },
      { key: "hero_cta_primary", label: "Primary Button Text", type: "text", placeholder: "View Our Projects" },
      { key: "hero_cta_secondary", label: "Secondary Button Text", type: "text", placeholder: "Get a Quote" },
      { key: "hero_image", label: "Hero Background Image URL", type: "text", placeholder: "/images/hero-bg.jpg" },
    ],
  },
  {
    title: "About Section",
    fields: [
      { key: "about_title", label: "About Title (use \\n for line break)", type: "textarea" },
      { key: "about_subtitle", label: "About Subtitle", type: "text" },
      { key: "about_description", label: "About Description (use \\n\\n for paragraphs)", type: "textarea" },
      { key: "about_image", label: "About Image URL", type: "text" },
    ],
  },
  {
    title: "Stats / Numbers",
    fields: [
      { key: "stat_years", label: "Years Experience", type: "text", placeholder: "10+" },
      { key: "stat_projects", label: "Projects Completed", type: "text", placeholder: "250+" },
      { key: "stat_clients", label: "Happy Clients", type: "text", placeholder: "200+" },
      { key: "stat_team", label: "Team Members", type: "text", placeholder: "50+" },
    ],
  },
  {
    title: "CTA Section",
    fields: [
      { key: "cta_title", label: "CTA Title", type: "text" },
      { key: "cta_subtitle", label: "CTA Subtitle", type: "text" },
    ],
  },
  {
    title: "Company & Contact",
    fields: [
      { key: "company_name", label: "Company Name", type: "text" },
      { key: "company_tagline", label: "Company Tagline", type: "text" },
      { key: "company_abn", label: "ABN", type: "text" },
      { key: "contact_phone", label: "Phone Number", type: "text" },
      { key: "contact_email", label: "Email Address", type: "text" },
      { key: "contact_address", label: "Address", type: "text" },
    ],
  },
];

export default function AdminContentPage() {
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/content")
      .then((r) => r.json())
      .then((data) => { setContent(data); setLoading(false); });
  }, []);

  const handleChange = (key: string, value: string) => {
    setContent((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      if (!res.ok) throw new Error();
      toast.success("Content saved successfully");
      setDirty(false);
    } catch { toast.error("Failed to save content"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="text-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Site Content</h2>
          <p className="text-white/40 text-sm mt-1">Edit all text content across your website</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 bg-gold hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed text-dark font-bold px-5 py-2.5 rounded-sm transition-all text-sm"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
        </button>
      </div>

      <div className="space-y-6">
        {contentGroups.map((group) => (
          <div key={group.title} className="bg-dark-lighter border border-white/5 rounded-sm p-6">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5 pb-3 border-b border-white/5">
              {group.title}
            </h3>
            <div className="space-y-4">
              {group.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">
                    {field.label}
                    <span className="ml-2 normal-case text-white/20 text-xs font-normal">({field.key})</span>
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={content[field.key] ?? ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-4 py-3 text-sm outline-none transition-colors resize-none font-mono"
                    />
                  ) : (
                    <input
                      type="text"
                      value={content[field.key] ?? ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-dark border border-white/10 focus:border-gold text-white placeholder-white/20 rounded-sm px-4 py-3 text-sm outline-none transition-colors"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-gold hover:bg-gold-light shadow-xl shadow-gold/20 text-dark font-bold px-6 py-3 rounded-sm transition-all text-sm"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
