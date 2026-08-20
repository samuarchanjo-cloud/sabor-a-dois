export function routeFromPath(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (normalized === "/admin") return { view: "admin", categoryId: null };
  if (normalized === "/checkout") return { view: "checkout", categoryId: null };
  if (normalized === "/carrinho") return { view: "cart", categoryId: null };
  if (normalized === "/categorias") return { view: "category", categoryId: null };
  if (normalized.startsWith("/categorias/")) {
    try {
      return { view: "category", categoryId: decodeURIComponent(normalized.slice(12)) || null };
    } catch {
      return { view: "category", categoryId: null };
    }
  }
  return { view: "home", categoryId: null };
}

export function pathForView(view, categoryId = null) {
  if (view === "admin") return "/admin";
  if (view === "checkout") return "/checkout";
  if (view === "cart") return "/carrinho";
  if (view === "category") return categoryId ? `/categorias/${encodeURIComponent(categoryId)}` : "/categorias";
  return "/";
}
