export default function ActionPanel({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[2rem] bg-[#081c27] p-6 text-white shadow-[0_10px_40px_rgba(11,32,43,0.12)]">
      <div className="text-xs font-black uppercase tracking-[0.25em] text-[#2C5A6B]">
        NEXT ACTION
      </div>
      <h2 className="mt-3 text-2xl font-black">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">{text}</p>
    </div>
  );
}
