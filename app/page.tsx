import Link from "next/link";
import { Upload, Users, LayoutGrid } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Sylvia&apos;s House
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Sistema de gestion de pedidos de comida. Procesa los archivos TXT de
          WhatsApp y genera los reportes de pedidos.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Link href="/upload">
          <Card className="h-full transition-shadow hover:shadow-lg cursor-pointer">
            <CardHeader className="text-center">
              <Upload className="mx-auto h-12 w-12 text-primary mb-2" />
              <CardTitle>Subir TXT</CardTitle>
              <CardDescription>
                Sube los archivos TXT exportados de WhatsApp para procesar los
                pedidos del dia
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/workers">
          <Card className="h-full transition-shadow hover:shadow-lg cursor-pointer">
            <CardHeader className="text-center">
              <Users className="mx-auto h-12 w-12 text-primary mb-2" />
              <CardTitle>Trabajadores</CardTitle>
              <CardDescription>
                Gestiona el listado de trabajadores por grupo, importa desde
                Excel o agrega manualmente
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/groups">
          <Card className="h-full transition-shadow hover:shadow-lg cursor-pointer">
            <CardHeader className="text-center">
              <LayoutGrid className="mx-auto h-12 w-12 text-primary mb-2" />
              <CardTitle>Pedidos</CardTitle>
              <CardDescription>
                Consulta la grilla de pedidos mensual por grupo con totales
                diarios
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
