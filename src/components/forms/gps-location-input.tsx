"use client";

import { useId, useState } from "react";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";

function toGoogleMapsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export function HomeLocationInput({
  defaultValue = "",
  readOnly = false,
  inputClass,
  required = false,
  name = "homeLocation",
}: {
  defaultValue?: string;
  readOnly?: boolean;
  inputClass: string;
  required?: boolean;
  name?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  function captureCurrentGps() {
    if (readOnly || typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMessage("Tu navegador no permite capturar GPS automáticamente; pega el enlace de Google Maps.");
      return;
    }
    setLocating(true);
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setValue(`https://www.google.com/maps?q=${lat},${lng}`);
        setLocating(false);
        setGeoMessage(`Coordenadas GPS capturadas (${lat}, ${lng}).`);
      },
      () => {
        setLocating(false);
        setGeoMessage("No se pudo obtener el GPS; verifica el permiso de ubicación o pega el enlace de Google Maps.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary">
          <MapPin size={15} className="text-accent" aria-hidden />
          Ubicación de la casa (Google Maps / GPS / referencia){required ? " *" : ""}
        </label>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={captureCurrentGps}
              disabled={locating}
              className="inline-flex items-center gap-1 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
            >
              <LocateFixed size={12} aria-hidden />
              {locating ? "Capturando GPS..." : "Usar ubicación GPS actual"}
            </button>
          )}
          {value.trim() && (
            <a
              href={toGoogleMapsUrl(value)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-positive-line bg-positive-soft px-2.5 py-1 text-[11px] font-semibold text-positive hover:bg-positive-soft"
            >
              Ver en Google Maps
              <ExternalLink size={11} aria-hidden />
            </a>
          )}
        </div>
      </div>
      <input
        readOnly={readOnly}
        id={id}
        name={name}
        required={required}
        minLength={required ? 5 : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={500}
        placeholder="Pega enlace de Google Maps, coordenadas GPS o referencia exacta de cómo llegar"
        className={`km-input ${inputClass}`}
      />
      {geoMessage && <p className="mt-1 text-[11px] text-muted">{geoMessage}</p>}
    </div>
  );
}
