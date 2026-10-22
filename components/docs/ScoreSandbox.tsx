"use client";

import { useState } from "react";
import { clipZ, SIGNAL_ORDER, WEIGHTS, Z_CAP, type SignalKey } from "@foreshadow/core";
import { scoreWord } from "@/lib/plain";
import { track } from "@/lib/analytics";

const PLAIN: Record<SignalKey, string> = {
  flowIntensity: "How much was bet",
  directionalPremium: "How one-sided the bets were",
  openInterest: "New contracts opened",
  volumeUnusualness: "Options volume vs. normal",
  skewShift: "Change in the cost of protection",
  darkPool: "Big off-exchange stock trades",
};

type Values = Record<SignalKey, number>;

/** Real cases' measurements (z, except volume as a percentile), from their score breakdowns. */
const PRESETS: { label: string; values: Values }[] = [
  {
    label: "A quiet week",
    values: { flowIntensity: 0.3, directionalPremium: 0.4, openInterest: 0.2, volumeUnusualness: 45, skewShift: 0.3, darkPool: 0.1 },
  },
  {
    label: "TENX before its FDA news",
    values: { flowIntensity: 1.77, directionalPremium: 2.76, openInterest: 1.63, volumeUnusualness: 98.9, skewShift: 1.51, darkPool: 0.47 },
  },
  {
    label: "TSLA before earnings",
    values: { flowIntensity: 29.2, directionalPremium: 1.96, openInterest: 0, volumeUnusualness: 35.6, skewShift: 2, darkPool: 0.4 },
  },
];

/** The score's own formula, so readers can see each measurement's share. Volume is a percentile mapped onto 0-4. */
function zOf(key: SignalKey, v: number): number {
  return key === "volumeUnusualness" ? (v / 100) * Z_CAP : v;
}

/** Move the sliders, watch the score: the same arithmetic as packages/core, nothing hidden. */
export function ScoreSandbox() {
  const [values, setValues] = useState<Values>(PRESETS[1].values);
  const parts = SIGNAL_ORDER.map((key) => ({ key, points: WEIGHTS[key] * clipZ(zOf(key, values[key])) * 100 }));
  const score = parts.reduce((n, p) => n + p.points, 0);

  return (
    <div className="tray mt-4 grid gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2">
        <span className="mr-1 text-[13px] font-medium text-ink-3">Start from</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setValues(p.values);
              track("score_sandbox_preset", { preset: p.label });
            }}
            className="pressable rounded-full bg-surface px-3 py-1.5 text-[13.5px] text-ink-2 hover:text-ink"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="card grid gap-3 p-4 sm:p-5">
        {parts.map(({ key, points }) => {
          const volume = key === "volumeUnusualness";
          const max = volume ? 100 : 5;
          const v = Math.min(values[key], max);
          return (
            <label key={key} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-4 gap-y-1 sm:grid-cols-[13rem_minmax(0,1fr)_4.5rem]">
              <span className="text-[14.5px] text-ink">
                {PLAIN[key]} <span className="text-ink-3 tnum">({Math.round(WEIGHTS[key] * 100)} pts max)</span>
              </span>
              <input
                type="range"
                min={0}
                max={max}
                step={volume ? 1 : 0.1}
                value={v}
                onChange={(e) => setValues((vs) => ({ ...vs, [key]: Number(e.target.value) }))}
                aria-valuetext={volume ? `${v.toFixed(0)}th percentile` : `${v.toFixed(1)} times its normal spread`}
                className="col-span-2 row-start-2 w-full accent-ink sm:col-span-1 sm:row-start-auto"
              />
              <span className="text-right text-[14.5px] font-semibold text-ink tnum sm:col-start-3">+{points.toFixed(1)}</span>
            </label>
          );
        })}
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-[15px] text-ink-2">
            Score: <span className={`numeral text-[26px] text-ink ${score >= 70 ? "hl" : ""}`}>{score.toFixed(0)}</span> out of 100
          </span>
          <span className="text-[15px] font-medium text-ink">{scoreWord(score)}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-3">
          Each slider is how far that measurement sat above the stock&apos;s normal, in units of its usual spread (volume is a
          percentile). Anything past {Z_CAP} counts the same as {Z_CAP}, so one wild measurement can&apos;t carry the score.
        </p>
      </div>
    </div>
  );
}
