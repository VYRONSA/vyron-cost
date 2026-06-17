"use client";

import { ChevronDown, Home, LogOut, Search, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type ActiveClient, signOutClientWorkspace } from "@/lib/vyron-developer-client";

function formatWorkspaceId(id: string) {
  return id.startsWith("client-") ? id : `client-${id}`;
}

export default function ClientWorkspaceHeader({ client }: { client: ActiveClient }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const workspaceLabel = formatWorkspaceId(client.id);

  return (
    <div className="border-b border-violet-100/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1600px] border-b border-violet-50 px-4 py-4 md:px-8">
        <div className="min-w-0">
          <div className="truncate text-lg font-black tracking-[-0.02em] text-slate-950 md:text-xl">
            {client.companyName}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-500">
            {client.packageName}
            <span className="mx-2 text-violet-300">•</span>
            <span className="text-violet-700">Workspace {workspaceLabel}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm md:max-w-xl">
          <Search size={18} className="shrink-0 text-violet-700" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
            placeholder="Search anything..."
          />
          <span className="hidden shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-400 sm:inline">
            ⌘K
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20"
          >
            <Home size={17} />
            <span className="hidden sm:inline">Command Centre</span>
          </Link>

          <button
            type="button"
            onClick={() => signOutClientWorkspace()}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800 shadow-sm transition hover:bg-violet-50"
          >
            <LogOut size={17} />
            <span>Logout</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-3 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-violet-50"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <User size={17} className="text-violet-700" />
              <ChevronDown size={16} className={`text-slate-400 transition ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-xl shadow-violet-500/10">
                <div className="border-b border-violet-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Workspace</div>
                  <div className="mt-1 text-sm font-black text-slate-950">{client.companyName}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {client.packageName} · Workspace {workspaceLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    signOutClientWorkspace();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-black text-violet-800 transition hover:bg-violet-50"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
