"use client";

import type { ComponentProps } from "react";
import { formatMoneyInput, normalizeMoneyInput } from "@/modules/financing/input-format";

export function MoneyInput({ className = "", onChange, onBlur, defaultValue, type, ...props }: ComponentProps<"input">) {
  const complete = (value: string) => {
    const formatted = formatMoneyInput(value, true);
    return type === "number" ? normalizeMoneyInput(formatted) : formatted;
  };
  return <span className="km-money-field"><span aria-hidden="true" className="km-money-symbol">RD$</span><input {...props} type={type ?? "text"} inputMode="decimal" className={`km-input km-money-input ${className}`} defaultValue={defaultValue == null ? undefined : complete(String(defaultValue))} onChange={onChange} onBlur={(event) => {
    if (event.currentTarget.value) { event.currentTarget.value = complete(event.currentTarget.value); onChange?.(event); }
    onBlur?.(event);
  }}/></span>;
}
