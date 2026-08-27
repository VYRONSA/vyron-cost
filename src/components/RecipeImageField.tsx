"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The pack photo for one recipe.
 *
 * A recipe has to exist before a photo can be attached to it, so on a brand-new
 * BOM this invites the user to save first rather than silently doing nothing.
 * The server is the real gate on type, size and tenant — these checks just save
 * a pointless round trip and give a faster answer.
 */
export function RecipeImageField({
  recipeId,
  canEdit,
  labelClass,
}: {
  recipeId?: string | null;
  canEdit: boolean;
  labelClass?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // With no recipe yet there is nothing to fetch, so this starts settled.
  const [loaded, setLoaded] = useState(!recipeId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recipeId) return;
    let cancelled = false;
    fetch(`/api/recipes/${recipeId}/image`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setUrl(data?.ok && data.image?.url ? data.image.url : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  async function upload(file: File) {
    setError("");
    if (!ALLOWED.includes(String(file.type).toLowerCase())) {
      setError("Choose a JPG, PNG or WEBP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 8MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/recipes/${recipeId}/image`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed.");
      setUrl(data.image?.url ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/image`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not remove the image.");
      setUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="block">
      <span className={labelClass ?? "text-xs font-black uppercase tracking-[0.08em] text-slate-500"}>
        Product / Pack Photo
      </span>

      <div className="mt-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-4">
        {url ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Product pack"
              className="h-32 w-full rounded-2xl border border-violet-100 bg-white object-cover sm:h-24 sm:w-32"
            />
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-700 disabled:opacity-60"
                >
                  {busy ? "Working…" : "Replace photo"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-2.5 text-sm font-black text-red-600 disabled:opacity-60"
                >
                  <Trash2 size={15} />
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-center">
            {!recipeId ? (
              <p className="text-sm font-semibold text-slate-500">
                Save this recipe first, then add a photo of the finished pack.
              </p>
            ) : (
              <>
                <ImagePlus size={26} className="mx-auto text-violet-500" />
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Add a photo of the finished pack — JPG, PNG or WEBP, up to 8MB.
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy || !loaded}
                    onClick={() => inputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                    {busy ? "Uploading…" : "Upload Product Photo"}
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {error ? <p className="mt-3 text-xs font-bold text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
