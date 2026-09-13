"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Home, Building2, Hammer, LayoutGrid, Paintbrush, Building, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Service } from "@/types";
import { fadeUp, scaleIn, staggerContainer, viewportConfig } from "@/lib/animations";

const ICONS: Record<string, LucideIcon> = {
  Home, Building2, Hammer, LayoutGrid, Paintbrush, Building,
};
const ICON_NAMES = ["Home", "Building2", "Hammer", "LayoutGrid", "Paintbrush", "Building"];

interface ServicesSectionProps { services: Service[] }

export default function ServicesSection({ services }: ServicesSectionProps) {
  return (
    // Light cream section — creates the dark→light rhythm premium builders use
    <section className="relative bg-[#F5F4F0] py-28 lg:py-36 overflow-hidden">
      {/* Subtle noise texture on cream background */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          variants={staggerContainer}
          className="mb-20"
        >
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-5">
            <span className="w-8 h-px bg-dark/30" />
            <span className="text-dark/50 text-[11px] font-semibold uppercase tracking-[0.35em]">What We Build</span>
          </motion.div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <motion.h2
              variants={fadeUp}
              className="font-display font-black text-[clamp(2.5rem,5vw,4rem)] text-dark leading-[0.95] tracking-[-0.03em] max-w-sm"
            >
              Our Construction{" "}
              <span className="text-gold">Services</span>
            </motion.h2>
            <motion.div variants={fadeUp}>
              <Link
                href="/services"
                className="group inline-flex items-center gap-2 text-dark/40 hover:text-gold text-sm font-medium transition-colors duration-300"
              >
                View all services
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-dark/[0.06]"
        >
          {services.map((service, i) => {
            const iconName = ICON_NAMES[i % ICON_NAMES.length];
            const Icon = ICONS[iconName] ?? Home;
            const features: string[] = service.features
              ? typeof service.features === "string"
                ? (service.features as string).split(",").map((f) => f.trim())
                : (service.features as string[])
              : [];

            return (
              <motion.div
                key={service.id}
                variants={scaleIn}
                className="group relative bg-[#F5F4F0] p-8 lg:p-10 overflow-hidden hover:bg-white transition-colors duration-500 cursor-default"
              >
                {/* Left gold accent on hover */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold scale-y-0 group-hover:scale-y-100 origin-bottom transition-transform duration-500" />

                <div className="relative z-10">
                  <div className="mb-7">
                    <div className="w-11 h-11 bg-gold/12 border border-gold/25 flex items-center justify-center group-hover:bg-gold group-hover:border-gold transition-all duration-400">
                      <Icon size={18} className="text-gold group-hover:text-dark transition-colors duration-300" />
                    </div>
                  </div>

                  <h3 className="font-display font-bold text-xl text-dark mb-3 group-hover:text-gold transition-colors duration-300 tracking-tight">
                    {service.title}
                  </h3>
                  <p className="text-dark/45 text-sm leading-relaxed mb-5 line-clamp-3">{service.description}</p>

                  {features.slice(0, 3).length > 0 && (
                    <ul className="space-y-2 mb-7">
                      {features.slice(0, 3).map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-dark/40 text-[12px]">
                          <span className="w-1 h-1 rounded-full bg-gold/70 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href="/services"
                    className="inline-flex items-center gap-1.5 text-gold text-xs font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0"
                  >
                    Learn more <ArrowRight size={11} />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
