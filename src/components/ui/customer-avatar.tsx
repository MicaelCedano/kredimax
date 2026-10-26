"use client";

import { useState } from "react";

export function CustomerAvatar({ initials, large, photoUrl }: { initials: string; large: boolean; photoUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft font-bold text-accent ${large ? "size-16 text-xl" : "size-9 text-[11px]"}`}>
    {photoUrl && failedUrl !== photoUrl
      // The authenticated endpoint must receive the current session cookies; no image proxy or public URL.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={photoUrl} alt="" width={large ? 64 : 36} height={large ? 64 : 36} loading="lazy" className="size-full object-cover" onError={() => setFailedUrl(photoUrl)}/>
      : initials}
  </span>;
}
