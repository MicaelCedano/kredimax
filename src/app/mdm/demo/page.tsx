import Link from "next/link";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { MdmDemo } from "@/modules/mdm/demo";

export default function MdmDemoPage() {
  return <div className="min-h-screen bg-canvas">
    <Sidebar/><Topbar/>
    <main id="main-content" tabIndex={-1} className="km-main space-y-5 px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="km-page-title">Demo de MDM</h1><p className="mt-1 text-sm text-muted">Practica con clientes y equipos ficticios.</p></div>
        <Link href="/mdm" className="km-secondary">Volver a MDM</Link>
      </header>
      <MdmDemo/>
    </main>
  </div>;
}
