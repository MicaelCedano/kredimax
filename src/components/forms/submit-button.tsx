"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";

export function SubmitButton({ children, disabled, className = "", ...props }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return <button {...props} type={props.type ?? "submit"} disabled={disabled || pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
    {pending && <LoaderCircle size={16} className="inline-block shrink-0 motion-safe:animate-spin" aria-hidden/>}{children}
  </button>;
}
