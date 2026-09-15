"use client";

import { useEffect, useState } from "react";
import { Mail, MailOpen, Trash2, Loader2, Phone, Tag, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import { Message } from "@/types";
import { cn, formatDate } from "@/lib/utils";

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Message | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = () => {
    const url = filter === "unread" ? "/api/messages?unread=true" : "/api/messages";
    fetch(url).then((r) => r.json()).then((d) => { setMessages(d); setLoading(false); });
  };

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const markRead = async (msg: Message) => {
    if (msg.read) return;
    await fetch(`/api/messages/${msg.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, read: true } : m));
    if (selected?.id === msg.id) setSelected({ ...msg, read: true });
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    const res = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Message deleted");
      if (selected?.id === id) setSelected(null);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const openMessage = (msg: Message) => {
    setSelected(msg);
    markRead(msg);
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Messages</h2>
          <p className="text-white/40 text-sm mt-1">
            {messages.length} total{unreadCount > 0 && ` · ${unreadCount} unread`}
          </p>
        </div>
        <div className="flex gap-2">
          {["all", "unread"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as "all" | "unread")}
              className={cn(
                "px-4 py-2 text-sm rounded-sm border transition-all",
                filter === f ? "bg-gold/10 border-gold/30 text-gold" : "border-white/10 text-white/40 hover:text-white"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        {/* Message list */}
        <div className="bg-dark-lighter border border-white/5 rounded-sm overflow-hidden flex flex-col lg:col-span-1">
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="text-gold animate-spin" /></div>
            ) : messages.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-10">No messages</p>
            ) : (
              messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => openMessage(msg)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-white/3 transition-colors relative",
                    selected?.id === msg.id && "bg-gold/5 border-l-2 border-gold"
                  )}
                >
                  {!msg.read && <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-gold" />}
                  <div className="flex items-center gap-2 mb-1">
                    {msg.read ? <MailOpen size={13} className="text-white/30" /> : <Mail size={13} className="text-gold" />}
                    <span className={cn("text-sm font-medium", msg.read ? "text-white/60" : "text-white")}>{msg.name}</span>
                  </div>
                  <p className="text-white/30 text-xs line-clamp-1">{msg.message}</p>
                  <p className="text-white/20 text-xs mt-1">{formatDate(msg.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message detail */}
        <div className="bg-dark-lighter border border-white/5 rounded-sm p-6 lg:col-span-2">
          {selected ? (
            <div className="h-full flex flex-col">
              <div className="flex items-start justify-between mb-6 pb-5 border-b border-white/5">
                <div>
                  <h3 className="text-white font-semibold text-lg">{selected.name}</h3>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 text-gold text-sm hover:underline">
                      <Mail size={13} />{selected.email}
                    </a>
                    {selected.phone && (
                      <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 text-white/50 text-sm hover:text-gold">
                        <Phone size={13} />{selected.phone}
                      </a>
                    )}
                    {selected.service && (
                      <span className="flex items-center gap-1.5 text-white/40 text-sm">
                        <Tag size={13} />{selected.service}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-white/30 text-xs">
                      <Calendar size={12} />{formatDate(selected.createdAt)}
                    </span>
                  </div>
                </div>
                <button onClick={() => deleteMessage(selected.id)} className="p-2 text-white/30 hover:text-red-400 rounded transition-colors flex-shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <p className="text-white/70 leading-relaxed whitespace-pre-wrap">{selected.message}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5">
                <a
                  href={`mailto:${selected.email}?subject=Re: Your Enquiry&body=Hi ${selected.name},%0D%0A%0D%0A`}
                  className="inline-flex items-center gap-2 bg-gold hover:bg-gold-light text-dark font-bold px-5 py-2.5 rounded-sm text-sm transition-all"
                >
                  <Mail size={14} /> Reply via Email
                </a>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Mail size={40} className="text-white/10 mx-auto mb-4" />
                <p className="text-white/30 text-sm">Select a message to read</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
