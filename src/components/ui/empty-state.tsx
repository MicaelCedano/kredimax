import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";

export function EmptyState({ title, description, search = false, href, action }: {
  title: string; description: string; search?: boolean; href?: string; action?: string;
}) {
  const Icon = search ? SearchX : Inbox;
  return <div className="px-5 py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><Icon size={25} strokeWidth={1.6} aria-hidden/></span><h3 className="mt-5 text-base font-bold tracking-tight text-ink">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>{href && action && <Link href={href} className="km-secondary mt-5">{action}</Link>}</div>;
}
