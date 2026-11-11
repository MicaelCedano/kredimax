import type { Metadata } from "next";
import { PublicInformationPage } from "@/components/ui/public-information-page";

export const metadata: Metadata = { title: "Condiciones de uso de los adjuntos | KrediMax" };

export default function TermsPage() {
  return (
    <PublicInformationPage title="Condiciones de uso de los adjuntos">
      <p>La carga y la descarga de adjuntos están destinadas al personal autorizado del comercio que tramita la solicitud.</p>
      <section>
        <h2>Uso de los expedientes</h2>
        <p>Adjunta únicamente documentos pertinentes al trámite y que el comercio esté autorizado a gestionar. Utiliza la información descargada para los fines de la solicitud correspondiente.</p>
      </section>
      <section>
        <h2>Cuenta de almacenamiento</h2>
        <p>La conexión la configura un administrador con autorización del titular. La disponibilidad de los adjuntos depende del permiso vigente, del espacio disponible y del estado de los archivos en la cuenta vinculada.</p>
      </section>
    </PublicInformationPage>
  );
}
