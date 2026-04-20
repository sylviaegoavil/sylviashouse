"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Upload, Users, LayoutGrid, BarChart2, Package,
  DollarSign, FileSpreadsheet, ClipboardList, History,
  ChevronDown, Menu, X, LogOut, User, Building2, Settings, UserCog, RefreshCcw,
} from "lucide-react";
import { useAuth } from "./AuthProvider";

type Role = "readonly" | "client_admin" | "super_admin";
const ROLE_RANK: Record<Role, number> = { readonly: 0, client_admin: 1, super_admin: 2 };
function hasAccess(userRole: Role, minRole: string): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole as Role];
}

// ─── Admin nav (client_admin + super_admin) ───────────────────────────────────

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

// ─── Readonly nav (client) ────────────────────────────────────────────────────

const READONLY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/groups", label: "Pedidos", icon: LayoutGrid },
  { href: "/reports", label: "Reportes", icon: FileSpreadsheet },
  { href: "/personal", label: "Personal", icon: UserCog },
];

export function Navbar() {
  const pathname = usePathname();
  const { profile, clients, selectedClientId, selectClient, signOut, loading } = useAuth();
  const [reportsOpen, setReportsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const role = (profile?.role ?? "readonly") as Role;
  const isAdmin = role === "super_admin" || role === "client_admin";

  // Load pending request count for admins
  useEffect(() => {
    if (!isAdmin || !profile) return;
    fetch("/api/worker-requests?count=true")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.count ?? 0))
      .catch(() => {});
  }, [isAdmin, profile]);

  const closeAll = () => { setReportsOpen(false); setAdminOpen(false); setUserOpen(false); };

  if (loading) return null;
  if (!profile) return null;

  // ─── READONLY nav ─────────────────────────────────────────────────────────
  if (role === "readonly") {
    return (
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/dashboard" className="flex items-center gap-2 mr-6 shrink-0">
            <span className="text-base font-bold tracking-tight">Sylvia&apos;s House</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {READONLY_NAV.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
              return (
                <Link key={item.href} href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-amber-700 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted"
              onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative hidden md:block">
              <button onClick={() => setUserOpen(!userOpen)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
                <User className="h-4 w-4" />
                <span className="max-w-[120px] truncate">{profile.full_name}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {userOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 rounded-md border bg-background shadow-lg z-50">
                  <div className="px-3 py-2 border-b">
                    <p className="text-xs font-medium truncate">{profile.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  </div>
                  <Link href="/profile" onClick={closeAll}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                    <User className="h-3.5 w-3.5" /> Mi perfil
                  </Link>
                  <button onClick={() => { closeAll(); signOut(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive">
                    <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            {READONLY_NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  pathname === item.href ? "bg-amber-700 text-white" : "text-muted-foreground hover:bg-muted")}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <div className="border-t pt-2 mt-2">
              <Link href="/profile" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <User className="h-4 w-4" /> Mi perfil
              </Link>
              <button onClick={() => { setMobileOpen(false); signOut(); }}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted">
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
  const isReportsActive = pathname.startsWith("/reports");
  const isAdminActive = [...ADMIN_DROPDOWN, ...SUPER_ADMIN_ITEMS].some((i) => pathname.startsWith(i.href));

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link href="/dashboard" className="flex items-center gap-2 mr-6 shrink-0">
          <span className="text-base font-bold tracking-tight">Sylvia&apos;s House</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-amber-700 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Reports dropdown */}
          <div className="relative">
            <button onClick={() => { setReportsOpen(!reportsOpen); setAdminOpen(false); setUserOpen(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isReportsActive ? "bg-amber-700 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
              <FileSpreadsheet className="h-4 w-4" />
              Reportes
              <ChevronDown className="h-3 w-3" />
            </button>
            {reportsOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 rounded-md border bg-background shadow-lg z-50">
                {REPORTS_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeAll}
                    className="block px-3 py-2 text-sm hover:bg-muted transition-colors">
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Admin dropdown with badge */}
          <div className="relative">
            <button onClick={() => { setAdminOpen(!adminOpen); setReportsOpen(false); setUserOpen(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isAdminActive ? "bg-amber-700 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
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
              <div className="absolute top-full left-0 mt-1 w-52 rounded-md border bg-background shadow-lg z-50">
                {visibleAdminItems.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeAll}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
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
                {role === "super_admin" && visibleAdminItems.length > 0 && <div className="border-t my-1" />}
                {role === "super_admin" && SUPER_ADMIN_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={closeAll}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
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
              className="hidden md:block rounded border border-input px-2 py-1 text-xs bg-background max-w-[140px]">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted"
            onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="relative hidden md:block">
            <button onClick={() => { setUserOpen(!userOpen); closeAll(); setUserOpen((v) => !v); }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
              <User className="h-4 w-4" />
              <span className="max-w-[120px] truncate">{profile.full_name}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {userOpen && (
              <div className="absolute top-full right-0 mt-1 w-48 rounded-md border bg-background shadow-lg z-50">
                <div className="px-3 py-2 border-b">
                  <p className="text-xs font-medium truncate">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role.replace("_", " ")}</p>
                </div>
                <Link href="/profile" onClick={closeAll}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                  <User className="h-3.5 w-3.5" /> Mi perfil
                </Link>
                {role === "super_admin" && clients.length > 1 && (
                  <Link href="/select-client" onClick={closeAll}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                    <RefreshCcw className="h-3.5 w-3.5" /> Cambiar cliente
                  </Link>
                )}
                <button onClick={() => { closeAll(); signOut(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive">
                  <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
          {role === "super_admin" && clients.length > 1 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground px-1 mb-1">Cliente activo</p>
              <select value={selectedClientId ?? ""} onChange={(e) => { selectClient(e.target.value); setMobileOpen(false); }}
                className="w-full rounded border border-input px-2 py-1.5 text-sm bg-background">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {visibleNavItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                pathname === item.href ? "bg-amber-700 text-white" : "text-muted-foreground hover:bg-muted")}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          <div className="border-t pt-2 mt-2">
            <p className="text-xs text-muted-foreground px-3 mb-1 font-medium uppercase">Reportes</p>
            {REPORTS_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{item.label}</Link>
            ))}
          </div>
          <div className="border-t pt-2 mt-2">
            <p className="text-xs text-muted-foreground px-3 mb-1 font-medium uppercase">
              Admin {pendingCount > 0 && `(${pendingCount})`}
            </p>
            {visibleAdminItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{item.label}</Link>
            ))}
            {role === "super_admin" && SUPER_ADMIN_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{item.label}</Link>
            ))}
          </div>
          <div className="border-t pt-2 mt-2">
            <Link href="/profile" onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <User className="h-4 w-4" /> Mi perfil
            </Link>
            {role === "super_admin" && clients.length > 1 && (
              <Link href="/select-client" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <RefreshCcw className="h-4 w-4" /> Cambiar cliente
              </Link>
            )}
            <button onClick={() => { setMobileOpen(false); signOut(); }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {(reportsOpen || adminOpen || userOpen) && <div className="fixed inset-0 z-40" onClick={closeAll} />}
    </header>
  );
}
