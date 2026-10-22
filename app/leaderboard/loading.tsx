export default function Loading() {
  return (
    <div className="mx-auto max-w-[1080px] px-5 py-12 sm:px-8 lg:py-16" aria-busy="true">
      <div className="h-12 w-64 rounded bg-surface-2" />
      <div className="mt-5 h-5 w-[32rem] max-w-full rounded bg-surface-2" />
      <div className="mt-12 border-t hairline">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[68px] border-b hairline" />
        ))}
      </div>
    </div>
  );
}
