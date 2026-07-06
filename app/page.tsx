import Link from "next/link";
import { Upload, Users, LayoutGrid } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-brand-cream to-white">
      <div className="mx-auto max-w-4xl px-4 py-16">

        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-5xl font-bold tracking-tight mb-4 text-primary">
            Sylvia&apos;s House
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Sistema de gestión de pedidos. Procesa los archivos TXT de WhatsApp
            y genera los reportes de pedidos.
          </p>
        </div>

        {/* Cards */}
        <div className="grid gap-6 sm:grid-cols-3">

          <Link href="/upload" className="group block h-full">
            <div className="h-full rounded-xl border border-border bg-card overflow-hidden shadow-sm
                            transition-all duration-200 hover:shadow-md hover:-translate-y-1">
              <div className="h-1.5 bg-primary" />
              <div className="px-6 py-7 text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center
                                group-hover:bg-primary/20 transition-colors">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">Subir TXT</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Sube los archivos TXT exportados de WhatsApp para procesar los
                  pedidos del día
                </p>
              </div>
            </div>
          </Link>

          <Link href="/workers" className="group block h-full">
            <div className="h-full rounded-xl border border-border bg-card overflow-hidden shadow-sm
                            transition-all duration-200 hover:shadow-md hover:-translate-y-1">
              <div className="h-1.5 bg-brand-gold" />
              <div className="px-6 py-7 text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-brand-gold/10 flex items-center justify-center
                                group-hover:bg-brand-gold/20 transition-colors">
                  <Users className="h-7 w-7 text-brand-gold" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">Trabajadores</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Gestiona el listado de trabajadores por grupo, importa desde
                  Excel o agrega manualmente
                </p>
              </div>
            </div>
          </Link>

          <Link href="/groups" className="group block h-full">
            <div className="h-full rounded-xl border border-border bg-card overflow-hidden shadow-sm
                            transition-all duration-200 hover:shadow-md hover:-translate-y-1">
              <div className="h-1.5 bg-primary" />
              <div className="px-6 py-7 text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center
                                group-hover:bg-primary/20 transition-colors">
                  <LayoutGrid className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">Pedidos</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Consulta la grilla de pedidos mensual por grupo con totales
                  diarios
                </p>
              </div>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
}
