/** Plain explanations for the terms a non-trader meets on the site. */
export const GLOSSARY = {
  score: {
    title: "Unusual betting score",
    body: "0 to 100. How far options betting in the five trading days before the news was above this stock's normal level. 40 and up is unusual; 70 and up is very unusual.",
  },
  lean: {
    title: "Which way the bets leaned",
    body: "Mostly calls means bets on the stock rising; mostly puts means bets on it falling. 'No clear side' means the money was split.",
  },
  expected: {
    title: "Expected move",
    body: "How big a jump or drop options prices were already allowing for, in either direction. A move smaller than this is roughly what traders expected.",
  },
  actual: {
    title: "Actual move",
    body: "How much the stock really moved: from the close before the news to the close after it (the next day when the news came after the market closed).",
  },
  result: {
    title: "Were the bets right?",
    body: "Right: the stock beat the expected move, the way the bets leaned. Right way: it moved their way but less than expected. Wrong way: it moved against them. 'Right' is a high bar on purpose.",
  },
  window: {
    title: "The five days",
    body: "Only the five trading days just before the news count toward the score. The 60 days before that show what's normal for this stock.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
