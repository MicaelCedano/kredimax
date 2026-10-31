import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export function StatCard({ title, value, icon: Icon, featured = false, compact = false }: {
  title: string; value: string; icon: LucideIcon; featured?: boolean; compact?: boolean;
}) {
  return <section className={`km-panel km-stat-card ${featured ? "km-wallet" : ""} ${compact ? "km-stat-compact" : "col-span-2 sm:col-span-1"}`}>
    <span className="km-stat-icon"><Icon size={21} strokeWidth={1.7} aria-hidden/></span>
    <div className="km-stat-content"><h2 className="km-stat-label">{title}</h2><p className="km-stat-value km-amount" style={{ "--km-stat-value-scale": `${100 / Math.max(value.length * 0.65, 1)}cqi` } as CSSProperties}>{value}</p></div>
  </section>;
}
