import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PanelHeading({ title, description, icon: Icon, id, inset, children }: {
  title: ReactNode; description?: ReactNode; icon?: LucideIcon; id?: string;
  inset?: "form" | "compact" | "settings"; children?: ReactNode;
}) {
  const spacing = inset === "form" ? "-mx-5 -mt-5 mb-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-6"
    : inset === "settings" ? "-mx-5 -mt-5 mb-5 sm:-mx-7 sm:-mt-7 sm:px-7 sm:py-6"
    : inset === "compact" ? "-mx-5 -mt-5 mb-5" : "";
  return <div className={`km-panel-heading flex flex-wrap items-center justify-between gap-4 px-5 py-5 ${spacing}`}>
    <div className="relative z-1 flex min-w-0 flex-1 items-center gap-3">
      {Icon && <span className="km-panel-heading-icon grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10 text-white"><Icon size={20} strokeWidth={1.8} aria-hidden/></span>}
      <div className="min-w-0"><h2 id={id} className="km-panel-heading-title text-[15px] font-semibold leading-6 tracking-tight text-white">{title}</h2>{description && <p className="km-panel-heading-description mt-1 text-xs leading-5 text-[#d6e5fa]">{description}</p>}</div>
    </div>
    {children && <div className="relative z-1 min-w-0 max-w-full">{children}</div>}
  </div>;
}
