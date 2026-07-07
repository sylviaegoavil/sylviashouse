"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Upload, Users, LayoutGrid, BarChart2, Package,
  DollarSign, FileSpreadsheet, ClipboardList, History,
  ChevronDown, Menu, X, LogOut, User, Building2, Settings, UserCog, RefreshCcw, FileText,
} from "lucide-react";
import { useAuth } from "./AuthProvider";

type Role = "readonly" | "client_admin" | "super_admin";
const ROLE_RANK: Record<Role, number> = { readonly: 0, client_admin: 1, super_admin: 2 };
function hasAccess(userRole: Role, minRole: string): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole as Role];
}

// ─── Nav item lists ───────────────────────────────────────────────────────────

const ADMIN_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/upload", label: "Subir TXT", icon: Upload, minRole: "client_admin" },
  { href: "/workers", label: "Trabajadores", icon: Users, minRole: "client_admin" },
  { href: "/groups", label: "Pedidos", icon: LayoutGrid },
] as const;

const REPORTS_ITEMS = [
  { href: "/reports", label: "Exportar Excel" },
  { href: "/reports/errors", label: "Errores" },
  { href: "/reports/compare", label: "Comparador" },
];

const QUOTES_DROPDOWN = [
  { href: "/cotizaciones",               label: "Generar cotización", minRole: "client_admin" },
  { href: "/cotizaciones/historial",     label: "Historial",          minRole: "client_admin" },
  { href: "/cotizaciones/clientes",      label: "Clientes",           minRole: "client_admin" },
  { href: "/cotizaciones/productos",     label: "Productos",          minRole: "client_admin" },
  { href: "/cotizaciones/marcas",        label: "Marcas",             minRole: "client_admin" },
  { href: "/cotizaciones/configuracion", label: "Configuración",      minRole: "super_admin"  },
] as const;

const ADMIN_DROPDOWN = [
  { href: "/products", label: "Productos", icon: Package, minRole: "client_admin" },
  { href: "/orders/manual", label: "Pedidos manuales", icon: ClipboardList, minRole: "client_admin" },
  { href: "/requests", label: "Solicitudes", icon: Users, minRole: "client_admin" },
  { href: "/billing", label: "Facturación", icon: DollarSign, minRole: "client_admin" },
  { href: "/settings/prices", label: "Precios", icon: DollarSign, minRole: "client_admin" },
  { href: "/audit", label: "Historial", icon: History, minRole: "super_admin" },
] as const;

const SUPER_ADMIN_ITEMS = [
  { href: "/admin/clients", label: "Clientes", icon: Building2 },
  { href: "/admin/users", label: "Usuarios", icon: Users },
];

const READONLY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/groups", label: "Pedidos", icon: LayoutGrid },
  { href: "/reports", label: "Reportes", icon: FileSpreadsheet },
  { href: "/personal", label: "Personal", icon: UserCog },
];

// ─── Shared class tokens ──────────────────────────────────────────────────────

// Inactive nav item on dark navbar
const navItem = "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors text-white/75 hover:bg-white/10 hover:text-white";
// Active nav item: golden pill, dark text
const navItemActive = "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors bg-brand-gold text-brand-brown";
// Dropdown panel
const dropdownPanel = "absolute top-full left-0 mt-1.5 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden";
// Dropdown item
const dropdownItem = "flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-amber-50 transition-colors";

export function Navbar() {
  const pathname = usePathname();
  const { profile, clients, selectedClientId, selectClient, signOut, loading } = useAuth();
  const [reportsOpen, setReportsOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const role = (profile?.role ?? "readonly") as Role;
  const isAdmin = role === "super_admin" || role === "client_admin";

  useEffect(() => {
    if (!isAdmin || !profile) return;
    fetch("/api/worker-requests?count=true")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.count ?? 0))
      .catch(() => {});
  }, [isAdmin, profile]);

  const closeAll = () => { setReportsOpen(false); setQuotesOpen(false); setAdminOpen(false); setUserOpen(false); };

  if (loading) return null;

  // Auth loaded but no profile — show minimal header so user can always sign out
  if (!profile) {
    return (
      <header className="sticky top-0 z-50 bg-navbar-bg shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-base font-bold tracking-tight text-brand-gold">Sylvia&apos;s House</span>
          </Link>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </header>
    );
  }

  // ─── READONLY nav ─────────────────────────────────────────────────────────
  if (role === "readonly") {
    return (
      <header className="sticky top-0 z-50 bg-navbar-bg shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="flex items-center gap-2 mr-6 shrink-0">
            <span className="text-base font-bold tracking-tight text-brand-gold">Sylvia&apos;s House</span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5">
            {READONLY_NAV.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
              return (
                <Link key={item.href} href={item.href}
                  className={isActive ? navItemActive : navItem}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button className="md:hidden rounded-md p-2 text-white/70 hover:bg-white/10"
              onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative hidden md:block">
              <button onClick={() => setUserOpen(!userOpen)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors">
                <User className="h-4 w-4" />
                <span className="max-w-[120px] truncate">{profile.full_name}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {userOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-48 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-amber-50/50">
                    <p className="text-xs font-semibold truncate text-foreground">{profile.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  </div>
                  <Link href="/profile" onClick={closeAll}
                    className={dropdownItem}>
                    <User className="h-3.5 w-3.5 text-muted-foreground" /> Mi perfil
                  </Link>
                  <button onClick={() => { closeAll(); signOut(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-rose-50 transition-colors">
                    <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-navbar-bg px-4 py-3 space-y-0.5">
            {READONLY_NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  pathname === item.href ? "bg-brand-gold text-brand-brown font-semibold" : "text-white/75 hover:bg-white/10 hover:text-white")}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <div className="border-t border-white/10 pt-2 mt-2">
              <Link href="/profile" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
                <User className="h-4 w-4" /> Mi perfil
              </Link>
              <button onClick={() => { setMobileOpen(false); signOut(); }}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-300 hover:bg-white/10">
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          </div>
        )}
        {userOpen && <div className="fixed inset-0 z-40" onClick={closeAll} />}
      </header>
    );
  }

  // ─── ADMIN nav (client_admin / super_admin) ───────────────────────────────
  const visibleNavItems = ADMIN_NAV_ITEMS.filter((i) => !("minRole" in i) || hasAccess(role, i.minRole));
  const visibleAdminItems = ADMIN_DROPDOWN.filter((i) => hasAccess(role, i.minRole));
  const visibleQuotesItems = QUOTES_DROPDOWN.filter((i) => hasAccess(role, i.minRole));
  const isReportsActive = pathname.startsWith("/reports");
  const isQuotesActive = pathname.startsWith("/cotizaciones");
  const isAdminActive = [...ADMIN_DROPDOWN, ...SUPER_ADMIN_ITEMS].some((i) => pathname.startsWith(i.href));

  return (
    <header className="sticky top-0 z-50 bg-navbar-bg shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link href="/" className="flex items-center gap-2 mr-6 shrink-0">
          <span className="text-base font-bold tracking-tight text-brand-gold">Sylvia&apos;s House</span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
            return (
              <Link key={item.href} href={item.href}
                className={isActive ? navItemActive : navItem}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Reports dropdown */}
          <div className="relative">
            <button onClick={() => { setReportsOpen(!reportsOpen); setAdminOpen(false); setQuotesOpen(false); setUserOpen(false); }}
              className={isReportsActive ? navItemActive : navItem}>
              <FileSpreadsheet className="h-4 w-4" />
              Reportes
              <ChevronDown className="h-3 w-3" />
            </button>
            {reportsOpen && (
              <div className={cn(dropdownPanel, "w-44")}>
                {REPORTS_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeAll}
                    className={dropdownItem}>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Cotizaciones dropdown */}
          {visibleQuotesItems.length > 0 && (
            <div className="relative">
              <button onClick={() => { setQuotesOpen(!quotesOpen); setReportsOpen(false); setAdminOpen(false); setUserOpen(false); }}
                className={isQuotesActive ? navItemActive : navItem}>
                <FileText className="h-4 w-4" />
                Cotizaciones
                <ChevronDown className="h-3 w-3" />
              </button>
              {quotesOpen && (
                <div className={cn(dropdownPanel, "w-48")}>
                  {visibleQuotesItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={closeAll}
                      className={dropdownItem}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Admin dropdown */}
          <div className="relative">
            <button onClick={() => { setAdminOpen(!adminOpen); setReportsOpen(false); setQuotesOpen(false); setUserOpen(false); }}
              className={isAdminActive ? navItemActive : navItem}>
              <Settings className="h-4 w-4" />
              Admin
              {pendingCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
            {adminOpen && (
              <div className={cn(dropdownPanel, "w-52")}>
                {visibleAdminItems.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeAll}
                    className={cn(dropdownItem, "justify-between")}>
                    <span className="flex items-center gap-2">
                      <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {item.label}
                    </span>
                    {item.href === "/requests" && pendingCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                ))}
                {role === "super_admin" && visibleAdminItems.length > 0 && (
                  <div className="border-t border-border my-1" />
                )}
                {role === "super_admin" && SUPER_ADMIN_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeAll}
                    className={dropdownItem}>
                    <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {role === "super_admin" && clients.length > 1 && (
            <select value={selectedClientId ?? ""} onChange={(e) => selectClient(e.target.value)}
              className="hidden md:block rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white max-w-[140px] focus:outline-none focus:border-brand-gold">
              {clients.map((c) => <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>)}
            </select>
          )}
          <button className="md:hidden rounded-md p-2 text-white/70 hover:bg-white/10"
            onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="relative hidden md:block">
            <button onClick={() => { setUserOpen(!userOpen); closeAll(); setUserOpen((v) => !v); }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors">
              <User className="h-4 w-4" />
              <span className="max-w-[120px] truncate">{profile.full_name}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {userOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-48 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-amber-50/50">
                  <p className="text-xs font-semibold truncate text-foreground">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role.replace("_", " ")}</p>
                </div>
                <Link href="/profile" onClick={closeAll}
                  className={dropdownItem}>
                  <User className="h-3.5 w-3.5 text-muted-foreground" /> Mi perfil
                </Link>
                {role === "super_admin" && clients.length > 1 && (
                  <Link href="/select-client" onClick={closeAll}
                    className={dropdownItem}>
                    <RefreshCcw className="h-3.5 w-3.5 text-muted-foreground" /> Cambiar cliente
                  </Link>
                )}
                <button onClick={() => { closeAll(); signOut(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-rose-50 transition-colors">
                  <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-navbar-bg px-4 py-3 space-y-0.5">
          {role === "super_admin" && clients.length > 1 && (
            <div className="mb-3">
              <p className="text-xs text-white/50 px-1 mb-1 font-medium uppercase tracking-wider">Cliente activo</p>
              <select value={selectedClientId ?? ""} onChange={(e) => { selectClient(e.target.value); setMobileOpen(false); }}
                className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-gold">
                {clients.map((c) => <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>)}
              </select>
            </div>
          )}
          {visibleNavItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                pathname === item.href ? "bg-brand-gold text-brand-brown font-semibold" : "text-white/75 hover:bg-white/10 hover:text-white")}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

          <div className="border-t border-white/10 pt-2 mt-2">
            <p className="text-xs text-white/50 px-3 mb-1 font-medium uppercase tracking-wider">Reportes</p>
            {REPORTS_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">{item.label}</Link>
            ))}
          </div>

          {visibleQuotesItems.length > 0 && (
            <div className="border-t border-white/10 pt-2 mt-2">
              <p className="text-xs text-white/50 px-3 mb-1 font-medium uppercase tracking-wider">Cotizaciones</p>
              {visibleQuotesItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">{item.label}</Link>
              ))}
            </div>
          )}

          <div className="border-t border-white/10 pt-2 mt-2">
            <p className="text-xs text-white/50 px-3 mb-1 font-medium uppercase tracking-wider">
              Admin {pendingCount > 0 && `(${pendingCount})`}
            </p>
            {visibleAdminItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">{item.label}</Link>
            ))}
            {role === "super_admin" && SUPER_ADMIN_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">{item.label}</Link>
            ))}
          </div>

          <div className="border-t border-white/10 pt-2 mt-2">
            <Link href="/profile" onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
              <User className="h-4 w-4" /> Mi perfil
            </Link>
            {role === "super_admin" && clients.length > 1 && (
              <Link href="/select-client" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
                <RefreshCcw className="h-4 w-4" /> Cambiar cliente
              </Link>
            )}
            <button onClick={() => { setMobileOpen(false); signOut(); }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-300 hover:bg-white/10">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {(reportsOpen || quotesOpen || adminOpen || userOpen) && <div className="fixed inset-0 z-40" onClick={closeAll} />}
    </header>
  );
}
