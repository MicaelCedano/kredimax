"use client";

import { LoadFailure } from "@/components/navigation/load-failure";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <LoadFailure retry={retry}/>;
}
