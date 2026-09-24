import { NavLink, Outlet } from "react-router-dom";

import { useLibrary } from "../hooks/libraryContext";

const LINKS = [
  { to: "/", label: "Catálogo", end: true },
  { to: "/recetas", label: "Recetas", end: false },
  { to: "/matcher", label: "Buscar por color", end: false },
  { to: "/coleccion", label: "Mi colección", end: false },
] as const;

export function Layout() {
  const { ownedCodes, wishlistCodes } = useLibrary();

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-10 border-b border-white/10 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">
            Paint Studio Miniatures
          </span>

          <nav className="flex flex-1 flex-wrap gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition ${
                    isActive
                      ? "bg-white/10 font-medium text-white"
                      : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <p className="font-mono text-xs text-neutral-500">
            {ownedCodes.size} en armario · {wishlistCodes.size} por comprar
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
