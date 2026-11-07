import type { Metadata } from "next";
import Link from "next/link";
import { getMarketModelVersion } from "@/server/market/model-version";
import {
  PRICE_SIGNAL_WEIGHTS,
  SCORE_SIGNAL_MULTIPLIER,
  SCORE_SIGNAL_WEIGHTS,
} from "@/lib/pricing";
export const metadata: Metadata = {
  title: "Pricing Methodology",
  description:
    "What RMI quotes measure, how evidence changes them, and how to check a recorded price move.",
};
const rules = [
  {
    title: "What a price measures",
    text: "An artist quote is a fantasy index value. Opening valuations use a shared audience scale across verified Spotify, Last.fm and YouTube data. After opening, measured changes and verified catalysts drive returns. A high quote is not a claim about net worth, music quality or guaranteed future success.",
  },
  {
    title: "Growth matters separately from size",
    text: "A large audience supports a larger opening valuation. Returns respond to changes in activity and momentum compared with recorded baselines. An artist does not earn the same gain every day simply for having many listeners. Listening totals, recent activity and their growth rates are different measurements.",
  },
  {
    title: "Listening and reception can disagree",
    text: "Streams and audience growth measure consumption. Comments and public posts provide limited samples of reaction. A successful release can receive negative reactions while drawing more listening. Announcements without an opinion do not count as fan approval, and unavailable reception is withheld instead of treated as universal praise or criticism.",
  },
  {
    title: "Stories need evidence",
    text: "Artist identity, release credits, article dates and source provenance are checked before a story becomes a catalyst. Historical anniversaries are not new releases. A headline or a viral post alone does not establish a lasting change in demand. Catalyst effects decay; the same old success is not applied as a new gain every session.",
  },
  {
    title: "How quotes are published",
    text: "The price engine combines normalized activity changes, verified events, reception, eligible trading and its previous state. Confidence controls, time decay and movement limits constrain the result. The worker saves its evidence before publishing quotes and chart points together. Recorded closes and execution prices remain available for audit.",
  },
  {
    title: "Versions and corrections",
    text: "Published quotes identify their recorded model version when that metadata is available. Formula changes require a versioned release; a correction is not evidence of a new music event. Original recorded quotes and correction boundaries are preserved. The single chart uses the current valuation scale so a revaluation does not overwhelm earlier movement; executed trades are not rewritten.",
  },
  {
    title: "Checking a move",
    text: "Start with the artist's recorded session change and explanation. Compare dated public indicators and verified stories, then inspect the momentum inputs. Momentum is a model reading, not a forecast or an exact percentage attribution of a price move. Source coverage varies, and sampled reactions do not represent every fan. Reliability checks and outcome evaluation continue independently of these displays.",
  },
];
const scoreInputs = [
  ["Listening", SCORE_SIGNAL_WEIGHTS.listening, PRICE_SIGNAL_WEIGHTS.listening],
  ["Video", SCORE_SIGNAL_WEIGHTS.video, PRICE_SIGNAL_WEIGHTS.video],
  ["Discovery", SCORE_SIGNAL_WEIGHTS.search, PRICE_SIGNAL_WEIGHTS.search],
  [
    "Audience response",
    SCORE_SIGNAL_WEIGHTS.fanResponse,
    PRICE_SIGNAL_WEIGHTS.fanResponse,
  ],
  ["Media", SCORE_SIGNAL_WEIGHTS.media, PRICE_SIGNAL_WEIGHTS.media],
  [
    "Eligible trading",
    SCORE_SIGNAL_WEIGHTS.trading,
    PRICE_SIGNAL_WEIGHTS.trading,
  ],
] as const;
export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-4xl space-y-7">
      <header className="rmi-card p-5 sm:p-8">
        <p className="rmi-kicker text-cyan">Market rules</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          How RMI prices work
        </h1>
        <p className="mt-4 text-base leading-7 text-paper/65">
          Understand the index, inspect the evidence, and judge your picks using
          the same published rules.
        </p>
        <p className="mt-4 text-xs font-semibold text-paper/60">
          Current engine: <code>{getMarketModelVersion()}</code>
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-cyan">
          <Link href="/markets">Explore artist quotes</Link>
          <Link href="/help#quotes">Trading help</Link>
        </div>
      </header>
      <div className="rmi-card divide-y divide-line px-5 sm:px-8">
        {rules.map((rule, i) => (
          <section key={rule.title} className="py-6">
            <p className="text-xs font-semibold text-cyan">0{i + 1}</p>
            <h2 className="mt-2 text-xl font-semibold">{rule.title}</h2>
            <p className="mt-3 text-sm leading-7 text-paper/70">{rule.text}</p>
          </section>
        ))}
      </div>
      <section className="rmi-card p-5 sm:p-8">
        <h2 className="text-xl font-semibold">Signal coefficients</h2>
        <p className="mt-3 text-sm leading-7 text-paper/70">
          The published 1–100 score starts at 50. Each normalized input is
          multiplied by its score coefficient, the combined signal is multiplied
          by {SCORE_SIGNAL_MULTIPLIER}, and the result is rounded and limited to
          1–100. Media uses its deviation from a neutral news score of 50. These
          coefficients describe the momentum score. The separate base price
          signal uses fresh, eligible inputs, multiplies its weighted sum by the
          artist's volatility, and divides by 100. Reliability, conflicting
          evidence, event modifiers, recent price context and audience-scale
          controls then adjust that signal. The engine blends 20% of the target
          move into the existing quote, applies the session's movement limits,
          and rounds to cents with a $1 minimum. These are signal coefficients,
          not portions of a final price change; they are not normalized to 100%.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 font-semibold">Normalized input</th>
                <th className="py-3 text-right font-semibold">
                  Score coefficient
                </th>
                <th className="py-3 pl-4 text-right font-semibold">
                  Base price signal
                </th>
              </tr>
            </thead>
            <tbody>
              {scoreInputs.map(([label, value, priceValue]) => (
                <tr
                  key={label}
                  className="border-b border-line/50 last:border-0"
                >
                  <td className="py-3 text-paper/70">{label}</td>
                  <td className="py-3 text-right number-tabular">
                    {(value * 100).toFixed(
                      Number.isInteger(value * 100) ? 0 : 1,
                    )}
                    %
                  </td>
                  <td className="py-3 pl-4 text-right number-tabular">
                    {(priceValue * 100).toFixed(
                      Number.isInteger(priceValue * 100) ? 0 : 1,
                    )}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
