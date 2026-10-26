import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { LoadingGuard } from "@/components/navigation/loading-guard";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceLoading() {
  return <LoadingGuard><div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 sm:px-7 lg:ml-[244px]" aria-busy="true" aria-label="Cargando contenido">
    <span role="status" className="sr-only">Cargando información de KrediMax…</span>
    <Skeleton className="mb-3 h-9 w-56"/><Skeleton className="mb-8 h-4 w-72 max-w-full"/>
    <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="km-panel p-5"><Skeleton className="mb-6 h-4 w-24 max-w-full"/><Skeleton className="h-8 w-32 max-w-full"/></div>)}</div>
    <div className="km-panel space-y-6 p-6"><Skeleton className="mb-8 h-5 w-40"/>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full"/>)}</div>
  </main></div></LoadingGuard>;
}
