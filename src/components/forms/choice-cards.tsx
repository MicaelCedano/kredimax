"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";

export type ChoiceCardOption = {
  value: string; label: ReactNode; caption: string; ariaLabel: string; disabled?: boolean; title?: string; detail?: ReactNode;
};

export function ChoiceCards({ name, legend, value, options, onChange, description, error, words = false, detailed = false }: {
  name: string; legend: string; value: string; options: ChoiceCardOption[];
  onChange: (value: string) => void; description?: string; error?: string; words?: boolean; detailed?: boolean;
}) {
  const id = useId();
  const describedBy = [description ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <fieldset className={`min-w-0 sm:col-span-2${detailed ? " km-choice-detailed" : ""}`} aria-invalid={Boolean(error)} aria-describedby={describedBy}>
    <legend className="mb-3 text-sm font-semibold text-secondary">{legend} <span aria-hidden="true">*</span></legend>
    <div className="km-initial-grid">{options.map((option) => <label key={option.value} className="km-initial-option" data-disabled={Boolean(option.disabled)} title={option.title}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled} required={!option.disabled} onChange={(event) => onChange(event.target.value)} aria-label={option.ariaLabel} aria-describedby={describedBy} className="km-initial-radio"/>
      <span className="km-initial-tile"><span className="km-initial-check" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span className={`km-initial-percent${words ? " km-choice-word" : ""}`}>{option.label}</span><span className="km-initial-caption">{option.caption}</span>{option.detail && <span className="km-choice-detail">{option.detail}</span>}</span>
    </label>)}</div>
    {description && <p id={`${id}-hint`} className="mt-3 text-xs leading-5 text-muted">{description}</p>}
    {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-danger">{error}</p>}
  </fieldset>;
}
