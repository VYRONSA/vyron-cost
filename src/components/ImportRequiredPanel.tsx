import Link from "next/link";
import { Upload } from "lucide-react";

export default function ImportRequiredPanel() {
  return (
    <section className="mb-6 rounded-[2rem] border-2 border-dashed border-amber-300 bg-amber-50 p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-amber-100 p-3 text-amber-800">
          <Upload size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#F8FAFC]">Import client spreadsheets</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
            Copy GOURMET COSTINGS, REC211 Recipes for Production and NEW COSTING SHEET into{" "}
            <code className="rounded bg-white px-1">data/handcrafted-import/</code> then run{" "}
            <code className="rounded bg-white px-1">npm run import:handcrafted</code>.
          </p>
          <Link
            href="/import-costings"
            className="mt-4 inline-flex rounded-full bg-[#07110d] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#A3E635]"
          >
            Import instructions
          </Link>
        </div>
      </div>
    </section>
  );
}
