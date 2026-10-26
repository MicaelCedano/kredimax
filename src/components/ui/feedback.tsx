import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function Feedback({ children, tone = "info", className = "" }: { children: ReactNode; tone?: "info" | "success" | "warning" | "error"; className?: string }) {
  const Icon = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: CircleAlert }[tone];
  return <div className={`km-feedback ${className}`} data-tone={tone} role={tone === "error" || tone === "warning" ? "alert" : "status"}>
    <Icon size={19} className="mt-0.5 shrink-0" aria-hidden/><div className="min-w-0">{children}</div>
  </div>;
}
