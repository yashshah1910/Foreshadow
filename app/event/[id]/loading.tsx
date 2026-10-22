export default function Loading() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 sm:px-8" aria-busy="true">
      <div className="mt-6 h-4 w-48 rounded-full bg-surface-2" />
      <div className="mt-12 h-6 w-64 rounded-full bg-surface-2" />
      <div className="mt-5 h-14 w-2/3 rounded-2xl bg-surface-2" />
      <div className="mt-6 h-5 w-[44rem] max-w-full rounded-full bg-surface-2" />
      <div className="tray mt-10 h-[112px]" />
      <div className="tray mt-24 h-[520px]" />
    </div>
  );
}
