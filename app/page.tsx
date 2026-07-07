"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Upload, Users, LayoutGrid, FileSpreadsheet, FileText, UserCog } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface NavCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: "primary" | "gold";
}

const ADMIN_CARDS: NavCard[] = [
  {
    href: "/upload",
    title: "Subir TXT",
    description: "Sube los archivos TXT exportados de WhatsApp para procesar los pedidos del día",
    icon: Upload,
    color: "primary",
  },
  {
    href: "/workers",
    title: "Trabajadores",
    description: "Gestiona el listado de trabajadores por grupo, importa desde Excel o agrega manualmente",
    icon: Users,
    color: "gold",
  },
  {
    href: "/groups",
    title: "Pedidos",
    description: "Consulta la grilla de pedidos mensual por grupo con totales diarios",
    icon: LayoutGrid,
    color: "primary",
  },
  {
    href: "/reports",
    title: "Reportes",
    description: "Exporta los reportes mensuales en Excel para APT, Producción y Patio",
    icon: FileSpreadsheet,
    color: "gold",
  },
  {
    href: "/cotizaciones",
    title: "Cotizaciones",
    description: "Genera y gestiona cotizaciones para clientes con PDF descargable",
    icon: FileText,
    color: "primary",
  },
];

const READONLY_CARDS: NavCard[] = [
  {
    href: "/personal",
    title: "Personal",
    description: "Consulta tu información personal y el estado de tus pedidos",
    icon: UserCog,
    color: "gold",
  },
  {
    href: "/groups",
    title: "Pedidos",
    description: "Consulta la grilla de pedidos mensual por grupo con totales diarios",
    icon: LayoutGrid,
    color: "primary",
  },
  {
    href: "/reports",
    title: "Reportes",
    description: "Descarga los reportes mensuales de pedidos",
    icon: FileSpreadsheet,
    color: "gold",
  },
];

export default function HomePage() {
  const { profile, loading } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase
      .from("company_settings")
      .select("logo_url")
      .limit(1)
      .single()
      .then(({ data }) => { setLogoUrl(data?.logo_url ?? null); }, () => {});
  }, []);

  const role = profile?.role ?? "readonly";
  const isAdmin = role === "super_admin" || role === "client_admin";
  const cards = isAdmin ? ADMIN_CARDS : READONLY_CARDS;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-brand-cream to-white flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-brand-cream to-white">
      <div className="mx-auto max-w-4xl px-4 py-16">

        {/* Hero */}
        <div className="text-center mb-14">
          {logoUrl && (
            <div className="flex justify-center mb-6">
              <Image
                src={logoUrl}
                alt="Sylvia's House"
                height={208}
                width={208}
                className="h-52 w-auto object-contain drop-shadow-md"
                priority
                unoptimized
              />
            </div>
          )}
          <h1 className="text-5xl font-bold tracking-tight mb-4 text-primary">
            Sylvia&apos;s House
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Sistema de gestión de pedidos. Procesa los archivos TXT de WhatsApp
            y genera los reportes de pedidos.
          </p>
        </div>

        {/* Cards */}
        <div className={`grid gap-6 ${cards.length <= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {cards.map((card) => {
            const Icon = card.icon;
            const isPrimary = card.color === "primary";
            return (
              <Link key={card.href} href={card.href} className="group block h-full">
                <div className="h-full rounded-xl border border-border bg-card overflow-hidden shadow-sm
                                transition-all duration-200 hover:shadow-md hover:-translate-y-1">
                  <div className={`h-1.5 ${isPrimary ? "bg-primary" : "bg-brand-gold"}`} />
                  <div className="px-6 py-7 text-center">
                    <div className={`mx-auto mb-4 h-14 w-14 rounded-full flex items-center justify-center transition-colors
                      ${isPrimary
                        ? "bg-primary/10 group-hover:bg-primary/20"
                        : "bg-brand-gold/10 group-hover:bg-brand-gold/20"}`}>
                      <Icon className={`h-7 w-7 ${isPrimary ? "text-primary" : "text-brand-gold"}`} />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground mb-2">{card.title}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
}
