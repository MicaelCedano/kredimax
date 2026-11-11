import type { Metadata } from "next";
import { PublicInformationPage } from "@/components/ui/public-information-page";

export const metadata: Metadata = { title: "Acerca de KrediMax" };

export default function AboutPage() {
  return (
    <PublicInformationPage title="Acerca de KrediMax">
      <p>KrediMax es una plataforma para que comercios gestionen solicitudes de financiamiento de dispositivos, expedientes, cuotas y cobros.</p>
      <p>La integración de documentos permite al administrador vincular una cuenta de almacenamiento para que el personal autorizado guarde y consulte los adjuntos desde cada solicitud.</p>
    </PublicInformationPage>
  );
}
