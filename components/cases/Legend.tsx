export function Legend({ live = false }: { live?: boolean }) {
  return (
    <p className="mt-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">
      <strong className="font-medium text-ink-2">How to read this:</strong> the little chart shows money put into large
      options bets each day, with bets on a rise (<span className="text-call">calls</span>) above the line and bets on a fall
      (<span className="text-put">puts</span>) below. The shaded part is the five days just before the news.{" "}
      {live
        ? "Empty dots are days still to come."
        : "“Expected” is how big a move options traders were pricing in; “actual” is what the stock did."}
    </p>
  );
}
