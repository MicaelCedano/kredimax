"use client";

import { useEffect, useRef, useState } from "react";
import { businessDocumentExtensions, businessDocumentRequirements, businessDocumentsMaxBytes, businessDocumentsUnavailableMessage, type BusinessDocumentField } from "./application-income";

const documentTypes = Object.keys(businessDocumentExtensions);
const documentAccept = [...documentTypes, ".pdf", ".jpg", ".jpeg", ".png", ".webp"].join(",");

export function BusinessDocumentInputs({ driveReady, fieldErrors }: { driveReady: boolean; fieldErrors: Record<string, string> }) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const [files, setFiles] = useState<Partial<Record<BusinessDocumentField, File>>>({});
  const [errors, setErrors] = useState<Partial<Record<BusinessDocumentField, string>>>({});

  useEffect(() => {
    const form = fieldset.current?.form;
    if (!form) return;
    function appendFiles(event: FormDataEvent) {
      // React can clear the native file controls after a failed server action.
      for (const { field } of businessDocumentRequirements) {
        const file = files[field];
        if (file) event.formData.set(field, file);
      }
    }
    form.addEventListener("formdata", appendFiles);
    return () => form.removeEventListener("formdata", appendFiles);
  }, [files]);

  function selectFile(field: BusinessDocumentField, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    const selection = { ...files, [field]: file };
    let error = "";
    if (file.size === 0 || (file.type ? !documentTypes.includes(file.type) : !/\.(pdf|jpe?g|png|webp)$/i.test(file.name))) {
      error = "Selecciona un archivo PDF, JPG, PNG o WebP.";
    } else if (Object.values(selection).reduce((total, selected) => total + (selected?.size ?? 0), 0) > businessDocumentsMaxBytes) {
      error = "Los tres archivos juntos deben pesar 4 MB o menos.";
    }
    setErrors({ ...errors, [field]: error });
    if (error) input.value = "";
    else setFiles(selection);
  }

  return (
    <fieldset ref={fieldset} className="min-w-0 space-y-3 rounded-lg border border-line bg-subtle p-4 sm:col-span-2" aria-describedby="business-documents-instructions">
      <legend className="px-1 text-sm font-bold text-ink">Documentos para negocio propio</legend>
      <p id="business-documents-instructions" className="text-xs text-muted">Adjunta un PDF o una imagen JPG, PNG o WebP por requisito. Los tres archivos juntos deben pesar 4 MB o menos.</p>
      {!driveReady && <p role="status" className="rounded-lg border border-warning-line bg-warning-soft p-2 text-xs text-warning">{businessDocumentsUnavailableMessage}</p>}
      {businessDocumentRequirements.map(({ field, label }) => {
        const error = errors[field] ?? fieldErrors[field];
        const inputId = `application-${field}`;
        return (
          <div key={field} className="min-w-0 space-y-1">
            <label htmlFor={inputId} className="block text-sm font-semibold text-secondary">{label}</label>
            <input
              id={inputId}
              type="file"
              name={field}
              required={!files[field]}
              accept={documentAccept}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onChange={(event) => selectFile(field, event.currentTarget)}
              className="km-input block w-full min-w-0 text-xs"
            />
            {files[field] && (
              <div className="flex min-w-0 items-start justify-between gap-2 text-xs">
                <span className="break-all text-secondary">{files[field].name}</span>
                <button type="button" className="shrink-0 font-semibold text-danger" onClick={() => {
                  setFiles({ ...files, [field]: undefined });
                  setErrors({ ...errors, [field]: undefined });
                  const input = fieldset.current?.form?.elements.namedItem(field);
                  if (input instanceof HTMLInputElement) input.value = "";
                }}>Quitar<span className="sr-only"> {label}</span></button>
              </div>
            )}
            {error && <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">{error}</p>}
          </div>
        );
      })}
    </fieldset>
  );
}
