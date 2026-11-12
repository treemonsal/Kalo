"use client";

/** Quiet feedback: the flame lights up, the previous day count rolls into the new one. */
export default function StreakCelebration({ previous, days, onClose }: { previous: number; days: number; onClose: () => void }) {
  return <div className="streak-feedback" role="status" aria-label={days + " Tage Serie"}>
    <button type="button" className="streak-celebration" onClick={onClose} aria-label={days + " Tage Serie, schliessen"}>
      <svg className="streak-fire" viewBox="0 0 80 100" aria-hidden="true">
        <path className="fire-outer" d="M41 3c3 19 24 28 24 50 0 23-12 41-29 41S8 81 8 62c0-18 11-29 19-42 1 10 6 17 12 20C40 27 36 17 41 3Z" />
        <path className="fire-inner" d="M38 52c3 11 15 16 15 26 0 10-6 16-15 16s-15-6-15-15c0-11 8-15 15-27Z" />
      </svg>
      <span className="streak-count" aria-hidden="true"><span className="streak-count-track"><span>{previous}</span><span>{days}</span></span></span>
    </button>
  </div>;
}
