"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { formatDop } from "@/lib/format-money";

type Props = { name: string; phone: string | null; status: string; balance: string; overdueBalance: string; todayBalance: string; nextDueDate: string | null };

function whatsappNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && digits.length === 10) return `1${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return null;
}

function initialMessage({ name, status, balance, overdueBalance, todayBalance, nextDueDate }: Props) {
  const date = nextDueDate?.split("-").reverse().join("/");
  const detail = status === "overdue"
    ? `Tienes un saldo vencido de ${formatDop(overdueBalance)}.`
    : status === "due"
      ? `Tienes ${formatDop(todayBalance)} pendiente de pago hoy.`
      : `Tu saldo pendiente es de ${formatDop(balance)}${date ? ` y tu próximo vencimiento es el ${date}` : ""}.`;
  return `Hola ${name}, te saludamos de KrediMax. ${detail} Por favor, contáctanos para coordinar tu pago. Gracias.`;
}

export function CollectionWhatsapp(props: Props) {
  const [phone, setPhone] = useState(props.phone ?? "");
  const [message, setMessage] = useState(() => initialMessage(props));
  const number = whatsappNumber(phone);
  const url = number && message.trim() ? `https://wa.me/${number}?text=${encodeURIComponent(message.trim())}` : null;

  return <details className="relative text-left text-xs">
    <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 font-semibold text-positive"><MessageCircle size={16} aria-hidden/> WhatsApp</summary>
    <div className="mt-2 w-full min-w-[240px] max-w-sm rounded-xl border border-line bg-surface p-3 shadow-sm">
      <label className="block font-semibold text-secondary">Teléfono del cliente<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="km-input mt-1 w-full" placeholder="809 555 1234"/></label>
      <p className="mt-1 text-[11px] leading-4 text-muted">Para números fuera de RD, incluye el código de país con +.</p>
      <label className="mt-3 block font-semibold text-secondary">Mensaje editable<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="km-input mt-1 w-full"/></label>
      {!number && <p className="mt-2 text-[11px] text-danger">Escribe un número válido para abrir WhatsApp.</p>}
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="km-primary mt-3 inline-flex">Abrir WhatsApp</a> : <span className="km-secondary mt-3 inline-flex opacity-50" aria-disabled="true">Abrir WhatsApp</span>}
      <p className="mt-2 text-[11px] leading-4 text-muted">Revisa el mensaje y envíalo desde WhatsApp.</p>
    </div>
  </details>;
}
