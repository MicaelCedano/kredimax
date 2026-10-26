"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

export function PaymentEvidenceInput({ method, disabled = false }: { method: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);
  const [selection, setSelection] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const cash = method === "cash", required = cash || method === "bank_transfer";
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    // Retain the chosen file if React resets the native input after a failed payment action.
    const appendFile = (event: Event) => { if (selectedFile.current) (event as FormDataEvent).formData.set("paymentEvidence", selectedFile.current); };
    form.addEventListener("formdata", appendFile);
    return () => form.removeEventListener("formdata", appendFile);
  }, []);
  useEffect(() => { const url = selection?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [selection?.url]);
  function choose(file?: File) {
    setError("");
    if (!file) return;
    if (file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      selectedFile.current = null; setSelection(null); if (input.current) input.current.value = "";
      setError("Selecciona una imagen JPG, PNG o WebP de hasta 8 MB."); return;
    }
    selectedFile.current = file;
    setSelection({ name: file.name, url: URL.createObjectURL(file) });
  }
  return <fieldset disabled={disabled} className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-line bg-subtle p-4 md:basis-full">
    <legend className="px-1 text-xs font-semibold text-secondary">{cash ? "Recibo firmado del pago en efectivo" : method === "bank_transfer" ? "Voucher de transferencia" : "Evidencia del pago"}{required ? " *" : " · opcional"}</legend>
    <label className="flex flex-col gap-2 text-xs font-semibold text-secondary"><span className="inline-flex items-center gap-2"><ImagePlus size={16} aria-hidden/>{cash ? "Foto del recibo firmado por el cliente" : "Imagen del comprobante del pago"}</span><input ref={input} type="file" name="paymentEvidence" required={required && !selection} accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files?.[0])} className="km-input w-full min-w-0 text-xs"/></label>
    <p className="text-[11px] leading-5 text-muted">JPG, PNG o WebP · Hasta 8 MB. La imagen debe permitir leer el monto, la fecha y {cash ? "la firma del cliente" : "la referencia del pago"}. Se guarda junto al pago.</p>
    {selection && <div className="flex flex-col gap-2">
      {/* The selected image stays in the browser until the payment is submitted. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={selection.url} alt="Vista previa de la evidencia del pago" className="max-h-64 w-full rounded-lg border border-line bg-surface object-contain"/>
      <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[11px] text-muted">{selection.name}</span><button type="button" onClick={() => { selectedFile.current = null; setSelection(null); if (input.current) input.current.value = ""; }} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-danger"><X size={14} aria-hidden/>Quitar</button></div>
    </div>}
    {cash && <label className="flex items-start gap-2 text-xs leading-5 text-secondary"><input type="checkbox" required name="signedReceiptAttested" value="on" className="mt-1"/><span>Confirmo que la imagen muestra el recibo firmado por el cliente.</span></label>}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </fieldset>;
}
