"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page fails to load its data. Offers a retry instead of a blank error. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
      <div className="tray max-w-[640px] p-8 sm:p-10" role="alert">
        <p className="text-[15px] font-medium text-ink-3">Something went wrong</p>
        <h1 className="display mt-3 text-[36px] text-ink sm:text-[44px]">This page didn&apos;t load.</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
          The data behind it didn&apos;t come back in time. It&apos;s usually a brief hiccup, so trying again tends to work.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="pressable btn btn-primary">
            Try again
          </button>
          <Link href="/" className="pressable btn bg-surface text-ink hover:bg-surface-3">
            Go to the home page
          </Link>
        </div>
        {error.digest ? <p className="mt-6 text-[13px] text-ink-3">Reference: {error.digest}</p> : null}
      </div>
    </div>
  );
}
