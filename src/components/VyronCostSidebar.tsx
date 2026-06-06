"use client";

import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientBrandLockupLink } from "@/components/ClientBrandLockup";
import { isNavItemActive, vyronNavSections } from "@/lib/vyron-navigation";

const STORAGE_KEY = "vyron_sidebar_sections";

function loadCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function VyronCostSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsed(loadCollapsed());
  }, []);

  function toggleSection(id: string) {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <aside className="relative z-20 hidden min-h-screen w-[272px] shrink-0 flex-col bg-[#08111A] px-4 py-6 lg:flex">
      <div className="relative mb-8 px-2">
        <ClientBrandLockupLink variant="dark" href="/dashboard" />
        <div className="mt-3 text-[9px] font-black uppercase tracking-[0.28em] text-white/35">VYRON COST</div>
      </div>

      <nav className="relative flex-1 space-y-4 overflow-y-auto pr-1">
        {vyronNavSections.map((section, sectionIndex) => {
          const isOpen = !collapsed[section.id];

          return (
            <div key={section.id}>
              {sectionIndex > 0 && <div className="mb-3 h-px bg-white/10" />}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition hover:bg-white/[0.04]"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">
                  {section.section}
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/70">
                  {isOpen ? <Minus size={12} /> : <Plus size={12} />}
                </span>
              </button>

              {isOpen ? (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isNavItemActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold transition-all ${
                          active
                            ? "bg-[#B6D934] text-[#08111A]"
                            : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <Icon
                          size={16}
                          className={active ? "text-[#08111A]" : "text-white/45 group-hover:text-[#B6D934]"}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
