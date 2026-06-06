VYRON COST Document Intelligence — Demo Sprint (Batch A complete)

1. Run SQL in Supabase (IN ORDER — see supabase/document-ai-v2-demo-sprint-runbook.sql):
   1) document-ai-v2-phase1.sql
   2) document-ai-v2-phase1b-missing-columns.sql
   3) document-ai-v2-soft-delete.sql
   4) document-ai-v2-field-regions.sql
   5) document-ai-v2-workbench.sql
   6) document-ai-v2-phase3-review-override.sql
   7) document-ai-v2-supplier-learning-batch2.sql
   8) document-ai-v2-phase1-completion.sql
   9) document-ai-v2-phase1-batch3-price-archive.sql
  10) document-ai-v2-phase1-batch4-bulk-approval-rules.sql
  11) document-ai-v2-phase4-supplier-intelligence.sql
  Optional: demo-sprint-recovery-opportunities.sql (Recovery KPI)

2. .env.local (required):
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   <-- REQUIRED for uploads (anon sees 0 companies due to RLS)
   OPENAI_API_KEY=your_openai_key                      <-- REQUIRED for extraction
   VYRON_DEFAULT_TENANT_ID=48002864-8800-4000-9000-000000000001
   VYRON_DOCUMENT_SUPERVISOR_PIN=vyron-supervisor    <-- Supervisor override PIN (demo default)

   Debug: GET http://localhost:3007/api/documents/tenant-debug

3. Restart Next.js after env changes.

4. Demo workflow:
   - Hub: /document-intelligence
   - Upload PDF/image → auto extract → full-screen review
   - Match lines → Save Draft → Approve & Update Costs
   - Archive drilldown: /document-intelligence/archive/[id]
   - Supplier Learning: /document-intelligence/supplier-learning
   - Price History: /document-intelligence/price-history/supplier
   - Supervisor rules: /document-intelligence/settings
   - Email intake queue: /email-invoice-inbox (live document queue)
   - Audit trail API: GET /api/documents/{id}/audit-trail

5. Status flow:
   Uploaded → Extracting → Captured → Needs Review → Approved → Archived
