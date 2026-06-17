import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";

export type VyronDocumentDeleteRow = {
  id: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  deleted_at?: string | null;
};

export type VyronDocumentDeleteResult = {
  action: "soft_deleted" | "permanently_deleted" | "skipped";
  storageArchived?: boolean;
  storageArchiveWarning?: string | null;
  error?: string;
};

/** Soft-delete active documents; permanently remove records already in the deleted archive. */
export async function deleteVyronDocument(
  supabase: SupabaseClient,
  document: VyronDocumentDeleteRow
): Promise<VyronDocumentDeleteResult> {
  if (document.deleted_at) {
    const { error } = await supabase.from("vyron_documents").delete().eq("id", document.id);
    if (error) return { action: "skipped", error: error.message };
    return { action: "permanently_deleted" };
  }

  let storageArchived = false;
  let storageArchiveWarning: string | null = null;
  if (document.storage_path) {
    const { error: removeError } = await supabase.storage
      .from(document.storage_bucket || VYRON_DOCUMENTS_BUCKET)
      .remove([document.storage_path]);
    if (removeError) {
      storageArchiveWarning = removeError.message;
    } else {
      storageArchived = true;
    }
  }

  const { error: updateError } = await supabase
    .from("vyron_documents")
    .update({
      deleted_at: new Date().toISOString(),
      status: "deleted",
      processing_notes: "Soft deleted from Document Intelligence.",
    })
    .eq("id", document.id);
  if (updateError) return { action: "skipped", error: updateError.message };

  await supabase.from("vyron_document_extraction_logs").insert({
    document_id: document.id,
    stage: "delete",
    status: "deleted",
    model: null,
    message: "Document soft deleted.",
    metadata: {
      storageArchived,
      storageArchiveWarning,
    },
  });

  return { action: "soft_deleted", storageArchived, storageArchiveWarning };
}
