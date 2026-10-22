export function Legend({ live = false }: { live?: boolean }) {
  return (
    <p className="mt-4 max-w-3xl px-1 text-[14px] leading-relaxed text-ink-3">
      <span className="font-semibold text-ink-2">Reading the small chart:</span> each bar is a day of large options bets.
      Bets on a rise (<span className="font-medium text-call">calls</span>) go up, bets on a fall (
      <span className="font-medium text-put">puts</span>) go down, and the yellow part is the five days just before the news.{" "}
      {live
        ? "Grey dots are days still to come."
        : "“Expected” is the move options traders were pricing in. “Actual” is what the stock did."}
    </p>
  );
}
