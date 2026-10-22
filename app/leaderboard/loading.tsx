export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:py-14" aria-busy="true">
      <div className="h-3 w-48 rounded bg-surface-3" />
      <div className="mt-4 h-14 w-[28rem] max-w-full rounded bg-surface-3" />
      <div className="sheet mt-10">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[66px] border-b hairline last:border-b-0" />
        ))}
      </div>
    </div>
  );
}
