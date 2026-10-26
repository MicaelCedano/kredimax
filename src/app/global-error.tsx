"use client";

export default function GlobalError() {
  // This boundary replaces the root document, so it must work without its CSS.
  return <html lang="es"><body style={{ margin: 0, background: "#f6f8fb", color: "#152238", fontFamily: '"Segoe UI",Arial,sans-serif' }}><main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}><section style={{ maxWidth: 420, padding: 28, border: "1px solid #e7ecf2", borderRadius: 16, background: "white" }}><h1 style={{ fontSize: 24, margin: "0 0 16px" }}>No se pudo abrir KrediMax</h1><p style={{ lineHeight: 1.6, color: "#64748b" }}>La página se interrumpió. Vuelve a cargar para recuperar la sesión y abrir la versión actual.</p><button type="button" onClick={() => window.location.assign(window.location.href)} style={{ marginTop: 12, padding: "12px 18px", border: 0, borderRadius: 8, background: "#1264dc", color: "white", font: "inherit", cursor: "pointer" }}>Volver a cargar</button></section></main></body></html>;
}
