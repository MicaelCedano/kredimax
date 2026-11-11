import type { Metadata } from "next";
import { PublicInformationPage } from "@/components/ui/public-information-page";

export const metadata: Metadata = { title: "Privacidad de los adjuntos | KrediMax" };

export default function PrivacyPage() {
  return (
    <PublicInformationPage title="Política de privacidad de los adjuntos">
      <p>Este aviso explica cómo KrediMax utiliza los archivos y el permiso de la cuenta que el administrador conecta para guardar los adjuntos de las solicitudes.</p>
      <section>
        <h2>Datos y finalidad</h2>
        <p>Cuando el personal envía una solicitud de negocio propio, KrediMax utiliza el estado financiero, el comprobante de servicio público y el certificado del Registro Mercantil para vincularlos al expediente y permitir su revisión.</p>
      </section>
      <section>
        <h2>Almacenamiento y acceso</h2>
        <p>El administrador autoriza a KrediMax a crear y administrar archivos específicos en su cuenta de Google Drive. KrediMax guarda los adjuntos en una carpeta privada de esa cuenta y conserva las referencias en la base de datos para que el personal con acceso a la solicitud pueda descargarlos. Las credenciales de la integración se guardan en la configuración del servidor.</p>
      </section>
      <section>
        <h2>Administración de los documentos</h2>
        <p>El titular puede administrar los archivos desde su cuenta y revocar el permiso de KrediMax en la configuración de Google. Revocar el permiso impide que KrediMax siga usando esa conexión. Para solicitar acceso, corrección o eliminación de documentos de tu expediente, comunícate con el comercio que registró la solicitud.</p>
      </section>
    </PublicInformationPage>
  );
}
