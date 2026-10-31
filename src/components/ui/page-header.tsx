import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <div className="km-page-header"><div className="min-w-0"><h1 className="km-page-title">{title}</h1>{description && <p className="mt-2 text-sm leading-6 text-muted">{description}</p>}</div>{actions && <div className="km-page-actions">{actions}</div>}</div>;
}
