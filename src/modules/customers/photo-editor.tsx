"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

export function CustomerPhotoEditor({ customerId, hasPhoto }: { customerId: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  async function upload(file?: File) {
    if (!file || pending) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setFeedback({ text: "Elige una foto JPG, PNG o WebP de hasta 8 MB.", error: true });
      if (input.current) input.current.value = "";
      return;
    }
    setPending(true); setFeedback(null);
    try {
      const form = new FormData(); form.set("photo", file);
      const response = await fetch(`/api/clientes/${customerId}/foto`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la foto.");
      setFeedback({ text: "Foto guardada.", error: false });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "No se pudo guardar la foto.", error: true });
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }
  return <div className="mt-3 flex flex-col gap-2">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto del cliente" className="sr-only" disabled={pending} onChange={(event) => { void upload(event.target.files?.[0]); }}/>
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => input.current?.click()} className="km-secondary inline-flex items-center justify-center gap-2 disabled:opacity-60"><Camera size={16} aria-hidden/>{pending ? "Guardando foto…" : hasPhoto ? "Cambiar foto" : "Subir foto"}</button>
    <p className="text-[11px] text-muted">JPG, PNG o WebP · Hasta 8 MB</p>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-xs ${feedback.error ? "text-danger" : "text-positive"}`}>{feedback.text}</p>}
  </div>;
}
