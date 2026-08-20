import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Flame,
  Grid2X2,
  Home,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Store,
  TriangleAlert,
  Trash2,
  Wallet,
} from "lucide-react";
import { FALLBACK_BUSINESS_HOURS, FALLBACK_CATEGORIES, PUBLIC_FALLBACKS } from "./menuData";
import {
  composeDeliveryAddress,
  formatPostalCode,
  geocodeDeliveryAddress,
  lookupPostalCode,
  postalCodeDigits,
  validateDeliveryAddressFields,
} from "./lib/address";
import { getBusinessStatus } from "./lib/businessHours";
import { distanceInKm, evaluateDelivery } from "./lib/delivery";
import { pathForView, routeFromPath } from "./lib/navigation";
import { whatsappOrderUrl } from "./lib/whatsapp";
import {
  checkIsAdmin,
  getSession,
  loadStoreData,
  onAuthChange,
  placeOrder,
  signIn,
  signOut,
  subscribeToStoreChanges,
} from "./lib/api";

const AdminPanel = lazy(() => import("./components/AdminPanel"));

const STORAGE_KEY = "digital-menu-cart-v1";
const DELIVERY_ADDRESS_FIELDS = new Set(["postalCode", "street", "number", "complement", "neighborhood", "city", "state", "reference"]);
const EMPTY_STORE = {
  products: [],
  categories: FALLBACK_CATEGORIES,
  businessHours: FALLBACK_BUSINESS_HOURS,
  deliveryRanges: [],
  settings: PUBLIC_FALLBACKS,
  setupWarnings: [],
};

const paymentLabels = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
};

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function moneyFromInput(value) {
  const normalized = String(value || "").trim().replace(/\s/g, "").replace(/^R\$/i, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? money(number) : value;
}

function isSoldOut(product) {
  return product.status === "Esgotado";
}

function publicProducts(products) {
  return products.filter((product) => product.visible !== false);
}

function hexToRgb(value, fallback = "197, 14, 12") {
  const match = /^#([0-9a-f]{6})$/i.exec(value || "");
  if (!match) return fallback;
  const number = Number.parseInt(match[1], 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

function friendlyOrderError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`;
  if (message.includes("SETUP_INCOMPLETE")) return "O cardápio ainda está em configuração.";
  if (message.includes("STORE_CLOSED")) return "O estabelecimento está fechado. O pedido não foi salvo nem enviado.";
  if (message.includes("LOCATION_REQUIRED")) return "Valide o endereço de entrega antes de finalizar o pedido.";
  if (message.includes("OUTSIDE_DELIVERY_AREA")) return "Seu endereço está fora da área máxima de entrega.";
  if (message.includes("BELOW_ONE_KM_BLOCKED")) return "Pedidos abaixo de 1 km estão bloqueados para entrega.";
  if (message.includes("DELIVERY_NOT_CONFIGURED") || message.includes("NO_DELIVERY_RANGE")) return "Não há uma taxa configurada para esta distância.";
  if (message.includes("PRODUCT_UNAVAILABLE")) return "Um produto do carrinho ficou indisponível. Revise o pedido.";
  if (message.includes("PAYMENT_DISABLED")) return "A forma de pagamento selecionada não está disponível.";
  if (message.includes("MINIMUM_ORDER_NOT_REACHED")) return "O valor do pedido ficou abaixo do mínimo configurado.";
  if (message.includes("NOT_ADMIN")) return "Este usuário não está autorizado como administrador.";
  return error?.message || "Não foi possível finalizar o pedido.";
}

function App() {
  const [store, setStore] = useState(EMPTY_STORE);
  const [loadingStore, setLoadingStore] = useState(true);
  const [cart, setCart] = useState(readCart);
  const [view, setView] = useState(() => routeFromPath(window.location.pathname).view);
  const [activeCategory, setActiveCategory] = useState(() => routeFromPath(window.location.pathname).categoryId);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [adminAccessError, setAdminAccessError] = useState("");
  const [checkout, setCheckout] = useState({
    name: "",
    phone: "",
    postalCode: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference: "",
    deliveryType: "entrega",
    payment: "pix",
    needsChange: false,
    changeFor: "",
    notes: "",
  });
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [postalCodeStatus, setPostalCodeStatus] = useState({ type: "idle", message: "" });
  const [addressValidationStatus, setAddressValidationStatus] = useState({ type: "idle", message: "" });
  const [validatingAddress, setValidatingAddress] = useState(false);
  const [pixCopyStatus, setPixCopyStatus] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const geocodingAbortRef = useRef(null);

  const showNotice = useCallback((message, type = "info") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  const navigate = useCallback((nextView, { categoryId = null, replace = false } = {}) => {
    const nextPath = pathForView(nextView, categoryId);
    const currentDepth = Number(window.history.state?.menuDepth) || 0;
    if (window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({ menuApp: true, menuDepth: replace ? currentDepth : currentDepth + 1, view: nextView, categoryId }, "", nextPath);
    }
    setView(nextView);
    if (nextView === "category") setActiveCategory(categoryId);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigateBack = useCallback((fallbackView, fallbackCategoryId = null) => {
    if ((Number(window.history.state?.menuDepth) || 0) > 0) window.history.back();
    else navigate(fallbackView, { categoryId: fallbackCategoryId, replace: true });
  }, [navigate]);

  const selectCategory = useCallback((categoryId) => {
    navigate("category", { categoryId });
  }, [navigate]);

  const reloadStore = useCallback(async () => {
    try {
      const data = await loadStoreData();
      setStore(data);
      return data;
    } catch (error) {
      console.error("Erro ao carregar o Supabase:", error);
      showNotice("Não foi possível carregar os dados do Supabase.", "error");
      throw error;
    } finally {
      setLoadingStore(false);
    }
  }, [showNotice]);

  useEffect(() => {
    reloadStore().catch(() => {});
    const stopAuth = onAuthChange(setSession);
    getSession().then(setSession).catch(() => setAuthLoading(false));
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      stopAuth();
      window.clearInterval(timer);
    };
  }, [reloadStore]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setAdminAuthorized(false);
      setAdminAccessError("");
      setAuthLoading(false);
      return undefined;
    }
    setAuthLoading(true);
    checkIsAdmin()
      .then((authorized) => {
        if (!active) return;
        setAdminAuthorized(authorized);
        setAdminAccessError(authorized ? "" : "Este usuário não está na lista app_admins.");
      })
      .catch((error) => {
        if (!active) return;
        setAdminAuthorized(false);
        setAdminAccessError(error.code === "PGRST202" ? "Execute a migração SQL para ativar o acesso seguro." : error.message);
      })
      .finally(() => active && setAuthLoading(false));
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    let debounce;
    const unsubscribe = subscribeToStoreChanges(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => reloadStore().catch(() => {}), 250);
    });
    return () => {
      window.clearTimeout(debounce);
      unsubscribe();
    };
  }, [reloadStore]);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)), [cart]);

  useEffect(() => {
    const settings = store.settings;
    const root = document.documentElement;
    const variables = {
      "--bg": settings.theme_background_color,
      "--card": settings.theme_surface_color,
      "--red": settings.theme_primary_color,
      "--red-dark": settings.theme_primary_color,
      "--yellow": settings.theme_secondary_color,
      "--yellow-light": settings.theme_secondary_color,
      "--white": settings.theme_text_color,
      "--primary-rgb": hexToRgb(settings.theme_primary_color),
      "--secondary-rgb": hexToRgb(settings.theme_secondary_color, "255, 193, 7"),
    };
    Object.entries(variables).forEach(([name, value]) => value && root.style.setProperty(name, value));
    document.title = settings.store_name || "Cardápio digital";
    const description = settings.store_description || "Cardápio digital para pedidos online.";
    const setMeta = (selector, content) => {
      const element = document.querySelector(selector);
      if (element) element.setAttribute("content", content || "");
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="theme-color"]', settings.theme_background_color || "#050505");
    setMeta('meta[property="og:title"]', settings.store_name || "Cardápio digital");
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:image"]', settings.brand_hero_url || settings.brand_logo_url || "");
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = settings.brand_logo_url || "/favicon.svg";
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) {
      const data = {
        name: settings.store_name || "Cardápio digital",
        short_name: (settings.store_name || "Cardápio").slice(0, 24),
        display: "standalone",
        start_url: "/",
        background_color: settings.theme_background_color || "#050505",
        theme_color: settings.theme_primary_color || "#c50e0c",
        icons: [{ src: "/menu-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      };
      manifest.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(data))}`;
    }
  }, [store.settings]);

  useEffect(() => {
    const initialRoute = routeFromPath(window.location.pathname);
    window.history.replaceState({ ...window.history.state, menuApp: true, menuDepth: 0, ...initialRoute }, "", pathForView(initialRoute.view, initialRoute.categoryId));
    const restoreRoute = () => {
      const route = routeFromPath(window.location.pathname);
      setView(route.view);
      setActiveCategory(route.categoryId);
      setSearch("");
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);

  useEffect(() => {
    const postalCode = postalCodeDigits(checkout.postalCode);
    if (postalCode.length !== 8) {
      setPostalCodeStatus({ type: "idle", message: "" });
      return undefined;
    }

    const controller = new AbortController();
    setPostalCodeStatus({ type: "loading", message: "Consultando CEP..." });
    lookupPostalCode(postalCode, { signal: controller.signal })
      .then((address) => {
        setCheckout((current) => {
          if (postalCodeDigits(current.postalCode) !== postalCode) return current;
          return {
            ...current,
            postalCode: address.postalCode,
            street: address.street,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
          };
        });
        setDeliveryLocation(null);
        setAddressValidationStatus({ type: "idle", message: "" });
        setPostalCodeStatus({ type: "success", message: "CEP encontrado. Confira e complete o endereço." });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setPostalCodeStatus({ type: "error", message: error.message });
      });
    return () => controller.abort();
  }, [checkout.postalCode]);

  const status = getBusinessStatus(store.businessHours, now, store.settings.timezone);
  const visibleProducts = useMemo(() => publicProducts(store.products), [store.products]);
  const visibleCategories = useMemo(() => store.categories.filter((category) => category.active !== false), [store.categories]);
  const cartLines = useMemo(
    () => cart.map((item) => {
      const product = visibleProducts.find((candidate) => candidate.id === item.id);
      return product ? { ...item, product, lineTotal: Number(product.price) * item.qty } : null;
    }).filter(Boolean),
    [cart, visibleProducts],
  );
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cartLines.reduce((sum, item) => sum + item.lineTotal, 0);
  const deliveryAssessment = checkout.deliveryType === "retirada"
    ? { allowed: true, fee: 0, code: "PICKUP", message: "Retirada no local." }
    : evaluateDelivery(deliveryLocation?.km, store.deliveryRanges, store.settings);
  const deliveryFee = deliveryAssessment.allowed ? deliveryAssessment.fee : 0;
  const isCardPayment = ["credito", "debito"].includes(checkout.payment);
  const cardFee = isCardPayment ? (subtotal + deliveryFee) * (Number(store.settings.card_fee_percent) || 0) / 100 : 0;
  const total = subtotal + deliveryFee + cardFee;
  const availablePayments = useMemo(() => [
    { id: "pix", label: "Pix", enabled: store.settings.pix_enabled, icon: Wallet },
    { id: "dinheiro", label: "Dinheiro", enabled: store.settings.cash_enabled, icon: Wallet },
    { id: "credito", label: "Cartão de crédito", enabled: store.settings.credit_card_enabled, icon: CreditCard },
    { id: "debito", label: "Cartão de débito", enabled: store.settings.debit_card_enabled, icon: CreditCard },
  ].filter((item) => item.enabled), [store.settings]);
  const minimumOrder = Number(store.settings.minimum_order_value) || 0;

  useEffect(() => {
    if (availablePayments.length && !availablePayments.some((item) => item.id === checkout.payment)) {
      setCheckout((current) => ({ ...current, payment: availablePayments[0].id }));
    }
  }, [availablePayments, checkout.payment]);
  const currentCategory = visibleCategories.find((category) => category.id === activeCategory);
  const featuredProducts = useMemo(() => {
    const featured = visibleProducts.filter((product) => product.featured && !isSoldOut(product));
    return (featured.length ? featured : visibleProducts.filter((product) => !isSoldOut(product))).slice(0, 6);
  }, [visibleProducts]);
  const selectedDeliveryAddress = checkout.street && checkout.number
    ? `${checkout.street}, ${checkout.number}`
    : "Adicione seu endereço no checkout";
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return [];
    return visibleProducts.filter((product) =>
      product.name.toLocaleLowerCase("pt-BR").includes(term) ||
      product.description?.toLocaleLowerCase("pt-BR").includes(term) ||
      visibleCategories.find((category) => category.id === product.category)?.name.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [search, visibleProducts, visibleCategories]);

  function openCategory(categoryId) {
    navigate("category", { categoryId });
  }

  function openCategories() {
    navigate("category", { categoryId: activeCategory || visibleCategories[0]?.id || null });
  }

  const addToCart = useCallback((product) => {
    if (isSoldOut(product)) return showNotice("Produto esgotado não pode ser adicionado.", "error");
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      return existing
        ? current.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
        : [...current, { id: product.id, qty: 1 }];
    });
    showNotice("Produto adicionado ao carrinho.", "success");
  }, [showNotice]);

  function updateQty(productId, delta) {
    setCart((current) => current.map((item) => item.id === productId ? { ...item, qty: Math.max(0, item.qty + delta) } : item).filter((item) => item.qty > 0));
  }

  function setCheckoutField(field, value) {
    if (DELIVERY_ADDRESS_FIELDS.has(field)) {
      geocodingAbortRef.current?.abort();
      setDeliveryLocation(null);
      setAddressValidationStatus({ type: "idle", message: "" });
    }
    setCheckout((current) => {
      const next = { ...current, [field]: value };
      if (field === "payment" && value !== "dinheiro") Object.assign(next, { needsChange: false, changeFor: "" });
      if (field === "needsChange" && !value) next.changeFor = "";
      return next;
    });
  }

  async function validateDeliveryAddress() {
    if (validatingAddress) return;
    const validationMessage = validateDeliveryAddressFields(checkout);
    if (validationMessage) {
      setAddressValidationStatus({ type: "error", message: validationMessage });
      return;
    }

    geocodingAbortRef.current?.abort();
    const controller = new AbortController();
    geocodingAbortRef.current = controller;
    setDeliveryLocation(null);
    setValidatingAddress(true);
    setAddressValidationStatus({ type: "loading", message: "Validando endereço e calculando entrega..." });
    try {
      const coordinates = await geocodeDeliveryAddress(checkout, { signal: controller.signal });
      const hasStoreCoordinates = store.settings.store_latitude !== null &&
        store.settings.store_latitude !== "" &&
        store.settings.store_longitude !== null &&
        store.settings.store_longitude !== "";
      const storeCoordinates = {
        latitude: Number(store.settings.store_latitude),
        longitude: Number(store.settings.store_longitude),
      };
      if (!hasStoreCoordinates || !Number.isFinite(storeCoordinates.latitude) || !Number.isFinite(storeCoordinates.longitude)) {
        throw new Error("A localização do estabelecimento não está configurada corretamente.");
      }
      const km = distanceInKm(storeCoordinates, coordinates);
      setDeliveryLocation({ ...coordinates, km });
      setAddressValidationStatus(coordinates.precision === "approximate"
        ? { type: "warning", message: "Endereço localizado aproximadamente. Confira os dados antes de finalizar." }
        : { type: "success", message: "Endereço validado com sucesso." });
    } catch (error) {
      if (error.name === "AbortError") return;
      setAddressValidationStatus({
        type: "error",
        message: error.message || "Não foi possível validar o endereço. Revise os dados e tente novamente.",
      });
    } finally {
      if (geocodingAbortRef.current === controller) {
        geocodingAbortRef.current = null;
        setValidatingAddress(false);
      }
    }
  }

  async function copyPixKey() {
    try {
      await navigator.clipboard.writeText(store.settings.pix_key);
      setPixCopyStatus("Chave Pix copiada.");
    } catch {
      setPixCopyStatus("Não foi possível copiar. Toque e segure na chave.");
    }
    window.setTimeout(() => setPixCopyStatus(""), 2400);
  }

  function buildWhatsappMessage(order) {
    const itemLines = order.items.map((item) => `• ${item.quantity}x ${item.name}`).join("\n");
    const paymentLines = checkout.payment === "dinheiro"
      ? ["Pagamento: Dinheiro", checkout.needsChange ? `Troco para: ${moneyFromInput(checkout.changeFor)}` : ""]
      : [`💳 ${paymentLabels[checkout.payment]}`];
    return [
      "🍔 NOVO PEDIDO",
      `Código: ${String(order.id).slice(0, 8)}`,
      `👤 ${checkout.name}`,
      `📞 ${checkout.phone}`,
      `📍 ${checkout.deliveryType === "retirada" ? "Retirada no local" : composeDeliveryAddress(checkout)}`,
      checkout.deliveryType === "entrega" ? `Distância: ${Number(order.distance_km).toFixed(2)} km` : "",
      "🛒 Itens",
      itemLines,
      `Subtotal: ${money(order.subtotal)}`,
      `Taxa de entrega: ${money(order.delivery_fee)}`,
      Number(order.card_fee) > 0 ? `Taxa do cartão: ${money(order.card_fee)}` : "",
      `💰 Total: ${money(order.total)}`,
      ...paymentLines,
      checkout.notes ? `📝 ${checkout.notes}` : "📝 Sem observação",
      order.external_delivery ? "🚕 Entrega por Uber solicitada e paga pelo cliente." : "",
    ].filter(Boolean).join("\n");
  }

  async function finishOrder(event) {
    event.preventDefault();
    if (submittingOrder) return;
    const freshStatus = getBusinessStatus(store.businessHours, new Date(), store.settings.timezone);
    if (!freshStatus.open) {
      showNotice(`Estamos fechados. Próxima abertura: ${freshStatus.nextLabel}.`, "error");
      return;
    }
    if (!store.settings.setup_completed) return showNotice("O cardápio ainda está em configuração.", "error");
    if (!cartLines.length) return showNotice("Adicione pelo menos um produto ao carrinho.", "error");
    if (subtotal < minimumOrder) return showNotice(`O pedido mínimo é ${money(minimumOrder)}.`, "error");
    if (!availablePayments.some((item) => item.id === checkout.payment)) return showNotice("Selecione uma forma de pagamento disponível.", "error");
    const addressValidationMessage = checkout.deliveryType === "entrega" ? validateDeliveryAddressFields(checkout) : "";
    if (addressValidationMessage) return showNotice(addressValidationMessage, "error");
    if (checkout.deliveryType === "entrega" && !deliveryAssessment.allowed) return showNotice(deliveryAssessment.message, "error");
    if (checkout.payment === "dinheiro" && checkout.needsChange && !checkout.changeFor.trim()) return showNotice("Informe para quanto precisa de troco.", "error");

    setSubmittingOrder(true);
    try {
      const order = await placeOrder({
        customer_name: checkout.name,
        customer_phone: checkout.phone,
        address: checkout.deliveryType === "entrega" ? composeDeliveryAddress(checkout) : null,
        reference: checkout.reference || null,
        delivery_type: checkout.deliveryType,
        payment_method: checkout.payment,
        needs_change: checkout.needsChange,
        change_for: checkout.changeFor || null,
        notes: checkout.notes || null,
        latitude: checkout.deliveryType === "entrega" ? deliveryLocation?.latitude : null,
        longitude: checkout.deliveryType === "entrega" ? deliveryLocation?.longitude : null,
        items: cartLines.map((item) => ({ product_id: item.id, quantity: item.qty })),
      });
      if (!store.settings.whatsapp_number) throw new Error("O WhatsApp do estabelecimento ainda não foi configurado.");
      const url = whatsappOrderUrl(store.settings.whatsapp_number, buildWhatsappMessage(order));
      if (!url) throw new Error("O número do WhatsApp precisa ter DDI e DDD válidos.");
      setCart([]);
      showNotice("Pedido salvo. Abrindo o WhatsApp...", "success");
      window.location.assign(url);
    } catch (error) {
      console.error("Erro ao finalizar pedido:", error);
      showNotice(friendlyOrderError(error), "error");
      await reloadStore().catch(() => {});
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function logoutAdmin() {
    try { await signOut(); setSession(null); showNotice("Sessão encerrada."); }
    catch (error) { showNotice(error.message, "error"); }
  }

  return (
    <div className={view === "admin" ? "app-shell admin-shell" : "app-shell"}>
      <header className="topbar">
        <button className="brand-lockup" onClick={() => navigate("home")} aria-label="Ir para o início">
          {store.settings.brand_logo_url
            ? <img src={store.settings.brand_logo_url} alt="" />
            : <span className="brand-mark"><Flame size={24} /></span>}
          <span className="brand-copy"><strong>{store.settings.store_name}</strong><small>{store.settings.store_description || "Cardápio digital"}</small></span>
        </button>
        <div className="header-actions">
          <span className={status.open ? "open-status" : "open-status closed"}><i />{status.label}</span>
          <button className="admin-shortcut" onClick={() => navigate("admin")} aria-label="Abrir área administrativa"><Settings size={21} /><small>Admin</small></button>
        </div>
      </header>

      <main>
        {view !== "admin" && view !== "home" && view !== "cart" && <section className="search-wrap"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no cardápio" aria-label="Buscar produtos" /></section>}
        {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
        {loadingStore && <div className="notice">Carregando cardápio...</div>}
        {!loadingStore && !store.settings.setup_completed && view !== "admin" && <div className="setup-public-notice"><Store size={20}/><div><strong>Cardápio em configuração</strong><span>Acesse o painel administrativo para concluir a publicação.</span></div></div>}
        {!status.open && view !== "admin" && <ClosedNotice status={status} />}

        {search.trim() && view !== "admin" && <ProductList title="Resultado da busca" products={filteredProducts} onAdd={addToCart} onBack={() => setSearch("")} />}

        {!search.trim() && view === "home" && <div className="home-view">
          <button className="delivery-address-card" type="button" onClick={() => cartLines.length ? navigate("checkout") : openCategories()}>
            <span className="address-icon"><MapPin size={23} /></span>
            <span><small>Entregar em</small><strong>{selectedDeliveryAddress}</strong>{checkout.neighborhood && <em>{checkout.neighborhood}, {checkout.city} - {checkout.state}</em>}</span>
            <ChevronDown size={20} />
          </button>
          <section className={store.settings.brand_hero_url ? "hero" : "hero hero-placeholder"}>
            {store.settings.brand_hero_url && <img src={store.settings.brand_hero_url} alt={`Banner ${store.settings.store_name}`} decoding="async" fetchPriority="high" />}
            <div className="hero-copy"><span>Feito para compartilhar</span><h1>{store.settings.store_name}</h1><p>{store.settings.store_description || "Sabor marcante, preparado com carinho."}</p>{visibleCategories.length > 0 && <button type="button" onClick={() => openCategory(visibleCategories[0].id)}>Peça agora <ChevronRight size={18} /></button>}</div>
          </section>
          <section className="category-section">
            <div className="section-heading"><div><span>Explore</span><h2>Categorias</h2></div><button type="button" onClick={openCategories}>Ver todas <ChevronRight size={17} /></button></div>
            <div className="category-rail">{visibleCategories.map((category) => <button className={category.banner_url ? "category-tile" : "category-tile category-placeholder"} key={category.id} type="button" onClick={() => openCategory(category.id)}>{category.banner_url ? <img src={category.banner_url} alt="" loading="lazy" decoding="async" /> : <span><PackageCheck size={28}/></span>}<strong>{category.name}</strong><ChevronRight size={17}/></button>)}</div>
            {visibleCategories.length === 0 && <p className="empty">Nenhuma categoria cadastrada.</p>}
          </section>
          <section className="featured-section">
            <div className="section-heading"><div><span>Os favoritos da casa</span><h2><Flame size={22}/> Mais pedidos</h2></div>{visibleCategories.length > 0 && <button type="button" onClick={openCategories}>Ver todos <ChevronRight size={17}/></button>}</div>
            <div className="featured-rail">{featuredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} compact />)}</div>
            {featuredProducts.length === 0 && <p className="empty">Os produtos ativos aparecerão aqui.</p>}
          </section>
        </div>}

        {!search.trim() && view === "category" && <CategoryView categories={visibleCategories} products={visibleProducts} activeCategory={activeCategory || currentCategory?.id} onSelect={selectCategory} onAdd={addToCart} />}

        {!search.trim() && view === "cart" && <CartView cartLines={cartLines} subtotal={subtotal} deliveryFee={deliveryFee} cardFee={cardFee} isCardPayment={isCardPayment} total={total} checkout={checkout} status={status} externalDelivery={deliveryAssessment.externalDelivery} onQty={updateQty} onRemove={(id) => setCart((current) => current.filter((item) => item.id !== id))} onCheckout={() => status.open ? navigate("checkout") : showNotice(`Estamos fechados. Próxima abertura: ${status.nextLabel}.`, "error")} onBack={openCategories} />}

        {!search.trim() && view === "checkout" && <CheckoutView cartLines={cartLines} subtotal={subtotal} deliveryFee={deliveryFee} cardFee={cardFee} isCardPayment={isCardPayment} total={total} checkout={checkout} setCheckoutField={setCheckoutField} finishOrder={finishOrder} deliveryLocation={deliveryLocation} deliveryAssessment={deliveryAssessment} postalCodeStatus={postalCodeStatus} addressValidationStatus={addressValidationStatus} validateDeliveryAddress={validateDeliveryAddress} validatingAddress={validatingAddress} pixCopyStatus={pixCopyStatus} copyPixKey={copyPixKey} status={status} settings={store.settings} availablePayments={availablePayments} minimumOrder={minimumOrder} submitting={submittingOrder} onBack={() => navigateBack("cart")} />}

        {!search.trim() && view === "admin" && (authLoading
          ? <p className="empty">Verificando sessão...</p>
          : session && adminAuthorized
            ? <Suspense fallback={<p className="empty">Carregando área administrativa...</p>}><AdminPanel store={store} session={session} reloadStore={reloadStore} showNotice={showNotice} onSignOut={logoutAdmin} /></Suspense>
            : session
              ? <AdminAccessDenied message={adminAccessError} onSignOut={logoutAdmin} />
              : <AdminLogin showNotice={showNotice} />)}
      </main>

      <nav className="bottom-nav">
        <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}><Home size={21} /><span>Início</span></button>
        <button className={view === "category" ? "active" : ""} onClick={openCategories}><Grid2X2 size={21} /><span>Categorias</span></button>
        <button className={`${view === "cart" || view === "checkout" ? "active " : ""}cart-nav-button${cartCount > 0 && view !== "cart" && view !== "checkout" ? " has-items" : ""}`} onClick={() => navigate("cart")}><span className="nav-icon"><ShoppingCart size={23} />{cartCount > 0 && <b>{cartCount}</b>}</span><span>Carrinho</span></button>
        <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}><Settings size={21} /><span>Admin</span></button>
      </nav>
    </div>
  );
}

function ClosedNotice({ status }) {
  return <div className="closed-notice"><Lock size={19} /><div><strong>Estamos fechados para pedidos</strong><span>Você pode consultar o cardápio. Próxima abertura: {status.nextLabel}.</span></div></div>;
}

const ProductCard = memo(function ProductCard({ product, onAdd, compact = false }) {
  return <article className={`${isSoldOut(product) ? "product-card soldout" : "product-card"}${compact ? " compact" : ""}`}>
    <div className="product-media">{product.image ? <img src={product.image} alt={product.name} loading="lazy" decoding="async" /> : <div className="image-placeholder"><PackageCheck size={30}/></div>}{isSoldOut(product) && <span>Esgotado</span>}</div>
    <div className="product-info">
      <strong className="product-name">{product.name}</strong>
      {!compact && product.description && <p>{product.description}</p>}
      <div className="product-action"><div className="price-block"><strong>{money(product.price)}</strong>{product.featured && <small>Destaque</small>}</div><button type="button" aria-label={`Adicionar ${product.name}`} disabled={isSoldOut(product)} onClick={() => onAdd(product)}><Plus size={20}/><span>Adicionar</span></button></div>
    </div>
  </article>;
});

function ProductList({ title, subtitle, products, onAdd, onBack }) {
  return <section className="products-view"><button className="back-button" onClick={onBack}><ArrowLeft size={18} />Voltar</button><div className="section-title"><h1>{title}</h1>{subtitle && <span>{subtitle}</span>}</div><div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</div>{products.length === 0 && <p className="empty">Nenhum produto encontrado.</p>}</section>;
}

const CategoryView = memo(function CategoryView({ categories, products, activeCategory, onSelect, onAdd }) {
  const selectedId = categories.some((category) => category.id === activeCategory) ? activeCategory : categories[0]?.id;
  const selected = categories.find((category) => category.id === selectedId);
  const categoryProducts = products.filter((product) => product.category === selectedId);
  return <section className="categories-view"><div className="page-heading"><span>Nosso cardápio</span><h1>Categorias</h1><p>{selected?.description || "Escolha seus itens favoritos"}</p></div><div className="category-tabs" role="tablist">{categories.map((category) => <button type="button" role="tab" aria-selected={selectedId === category.id} className={selectedId === category.id ? "active" : ""} key={category.id} onClick={() => onSelect(category.id)}>{category.name}</button>)}</div><div className="product-grid">{categoryProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd}/>)}</div>{categories.length === 0 ? <p className="empty">Nenhuma categoria cadastrada.</p> : categoryProducts.length === 0 && <p className="empty">Nenhum produto ativo nesta categoria.</p>}</section>;
});

function CartView({ cartLines, subtotal, deliveryFee, cardFee, isCardPayment, total, checkout, status, externalDelivery, onQty, onRemove, onCheckout, onBack }) {
  return <section className="cart-view"><button className="back-button" onClick={onBack}><ArrowLeft size={18} />Continuar escolhendo</button><div className="page-heading"><span>Seu pedido</span><h1>Carrinho</h1><p>Confira seus itens e finalize com segurança</p></div>{cartLines.length ? <><div className="cart-list">{cartLines.map((item) => <article className="cart-item" key={item.id}>{item.product.image?<img src={item.product.image} alt={item.product.name} loading="lazy" decoding="async" />:<div className="image-placeholder small"><PackageCheck size={22}/></div>}<div className="cart-item-copy"><strong>{item.product.name}</strong>{item.product.description && <span>{item.product.description}</span>}<b>{money(item.product.price)}</b><div className="qty-row"><button onClick={() => onQty(item.id, -1)} aria-label="Diminuir"><Minus size={16} /></button><strong>{item.qty}</strong><button onClick={() => onQty(item.id, 1)} aria-label="Aumentar"><Plus size={16} /></button></div></div><button className="remove-line" onClick={() => onRemove(item.id)} aria-label={`Remover ${item.product.name}`}><Trash2 size={18} /></button></article>)}</div><Totals subtotal={subtotal} deliveryFee={deliveryFee} cardFee={cardFee} isCardPayment={isCardPayment} total={total} deliveryType={checkout.deliveryType} externalDelivery={externalDelivery}/><button className="primary-action" disabled={!status.open} onClick={onCheckout}><MessageCircle size={20}/>{status.open ? "Continuar para o checkout" : "Fechado para pedidos"}</button>{!status.open && <p className="action-help">Próxima abertura: {status.nextLabel}.</p>}</> : <div className="empty-state"><ShoppingCart size={34}/><strong>Seu carrinho está vazio</strong><p>Explore as categorias e escolha seus favoritos.</p><button type="button" onClick={onBack}>Ver cardápio</button></div>}</section>;
}

function CheckoutView({ cartLines, subtotal, deliveryFee, cardFee, isCardPayment, total, checkout, setCheckoutField, finishOrder, deliveryLocation, deliveryAssessment, postalCodeStatus, addressValidationStatus, validateDeliveryAddress, validatingAddress, pixCopyStatus, copyPixKey, status, settings, availablePayments, minimumOrder, submitting, onBack }) {
  const needsAddress = checkout.deliveryType === "entrega";
  const belowMinimum = subtotal < minimumOrder;
  const blocked = !status.open || submitting || !settings.setup_completed || availablePayments.length === 0 || belowMinimum || (needsAddress && !deliveryAssessment.allowed);
  const deliveryErrorMessage = addressValidationStatus.type === "error"
    ? addressValidationStatus.message
    : deliveryAssessment.message;
  return <section className="checkout-view"><button className="back-button" onClick={onBack}><ArrowLeft size={18} />Voltar ao carrinho</button><div className="section-title"><h1>Checkout</h1><span>Validado e enviado pelo WhatsApp</span></div><form className="checkout-form" onSubmit={finishOrder}>
    <label>Nome<input required value={checkout.name} onChange={(event) => setCheckoutField("name", event.target.value)} /></label><label>Telefone<input required inputMode="tel" value={checkout.phone} onChange={(event) => setCheckoutField("phone", event.target.value)} /></label>
    <div className="option-group"><span>Tipo de entrega</span><div className="segmented"><button type="button" className={needsAddress ? "selected" : ""} onClick={() => setCheckoutField("deliveryType", "entrega")}><Bike size={17} />Entrega</button><button type="button" className={!needsAddress ? "selected" : ""} onClick={() => setCheckoutField("deliveryType", "retirada")}><Store size={17} />Retirada</button></div></div>
    {needsAddress && <>
      <label>CEP<input required inputMode="numeric" autoComplete="postal-code" value={checkout.postalCode} onChange={(event) => setCheckoutField("postalCode", formatPostalCode(event.target.value))} /></label>
      {postalCodeStatus.message && <small className={`address-helper ${postalCodeStatus.type}`}>{postalCodeStatus.message}</small>}
      <div className="address-row"><label>Rua<input required autoComplete="address-line1" value={checkout.street} onChange={(event) => setCheckoutField("street", event.target.value)} /></label><label>Número<input required inputMode="numeric" value={checkout.number} onChange={(event) => setCheckoutField("number", event.target.value)} /></label></div>
      <label>Complemento<input autoComplete="address-line2" value={checkout.complement} onChange={(event) => setCheckoutField("complement", event.target.value)} /></label>
      <label>Bairro<input required value={checkout.neighborhood} onChange={(event) => setCheckoutField("neighborhood", event.target.value)} /></label>
      <div className="address-row"><label>Cidade<input required autoComplete="address-level2" value={checkout.city} onChange={(event) => setCheckoutField("city", event.target.value)} /></label><label>Estado<input required autoComplete="address-level1" value={checkout.state} onChange={(event) => setCheckoutField("state", event.target.value)} /></label></div>
      <label>Ponto de referência<input value={checkout.reference} onChange={(event) => setCheckoutField("reference", event.target.value)} /></label>
      <div className="location-tools"><button type="button" onClick={validateDeliveryAddress} disabled={validatingAddress || postalCodeStatus.type === "loading"}><MapPin size={17} />{validatingAddress ? "Validando endereço..." : "Validar endereço e calcular entrega"}</button><small>Geocodificação © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></small></div>
      {addressValidationStatus.type === "warning" && <small className="address-helper warning">{addressValidationStatus.message}</small>}
      {deliveryLocation && <LocationStatusCard distanceKm={deliveryLocation.km} assessment={deliveryAssessment} />}
    </>}
    <div className="option-group"><span>Forma de pagamento</span><div className="payment-list">{availablePayments.map((method)=>{const Icon=method.icon;return <PaymentButton key={method.id} icon={<Icon size={18}/>} active={checkout.payment===method.id} label={method.label} onClick={()=>setCheckoutField("payment",method.id)}/>;})}</div>{availablePayments.length===0&&<small className="address-helper error">Nenhuma forma de pagamento configurada.</small>}</div>
    {checkout.payment === "dinheiro" && <div className="option-group change-option"><span>Precisa de troco?</span><div className="segmented"><button type="button" className={!checkout.needsChange ? "selected" : ""} onClick={() => setCheckoutField("needsChange", false)}>Não</button><button type="button" className={checkout.needsChange ? "selected" : ""} onClick={() => setCheckoutField("needsChange", true)}>Sim</button></div>{checkout.needsChange && <label>Troco para quanto?<input inputMode="decimal" placeholder="R$ 100,00" value={checkout.changeFor} onBlur={() => setCheckoutField("changeFor", moneyFromInput(checkout.changeFor))} onChange={(event) => setCheckoutField("changeFor", event.target.value)} /></label>}</div>}
    {checkout.payment === "pix" && settings.pix_enabled && <div className="pix-box"><div className="pix-visual">{settings.pix_qr_code_url?<img className="pix-qr" src={settings.pix_qr_code_url} alt="QR Code Pix" loading="lazy" decoding="async" />:<Wallet size={30}/>}</div><div className="pix-content"><span className="pix-label"><Wallet size={16}/>Pagamento por Pix</span><strong>{settings.pix_name}</strong><div className="pix-key"><small>Chave Pix</small><span>{settings.pix_key}</span></div><button type="button" className="copy-pix-button" onClick={copyPixKey}>{pixCopyStatus?<CheckCircle2 size={17}/>:<Wallet size={17}/>} {pixCopyStatus || "Copiar chave Pix"}</button><small className="pix-guidance">Envie o pedido antes de pagar e encaminhe o comprovante pelo WhatsApp.</small></div></div>}
    <label>Observação do pedido<textarea value={checkout.notes} onChange={(event) => setCheckoutField("notes", event.target.value)} /></label><div className="mini-order"><strong>{cartLines.length} item(ns) no pedido</strong><Totals subtotal={subtotal} deliveryFee={deliveryFee} cardFee={cardFee} isCardPayment={isCardPayment} total={total} deliveryType={checkout.deliveryType} deliveryDistance={deliveryLocation} externalDelivery={deliveryAssessment.externalDelivery} /></div>
    {!status.open && <div className="form-error">Estamos fechados. Próxima abertura: {status.nextLabel}.</div>}{belowMinimum&&<div className="form-error">Pedido mínimo: {money(minimumOrder)}.</div>}{needsAddress && !deliveryAssessment.allowed && <div className="form-error">{deliveryErrorMessage}</div>}
    <button className="primary-action" type="submit" disabled={blocked}><MessageCircle size={19} />{submitting ? "Validando e salvando..." : status.open ? "Enviar para WhatsApp" : "Fechado para pedidos"}</button>
  </form></section>;
}

function LocationStatusCard({ distanceKm, assessment }) {
  const external = assessment.externalDelivery;
  return <div className={`location-status-card ${external ? "external" : assessment.allowed ? "success" : "warning"}`}>{external ? <Bike size={24}/> : assessment.allowed ? <CheckCircle2 size={24} /> : <TriangleAlert size={24} />}<div><strong>{external ? "Entrega externa necessária" : assessment.allowed ? "Entrega disponível" : "Entrega bloqueada"}</strong><p>Distância calculada: {distanceKm.toFixed(2)} km.</p><p>{assessment.message}</p>{assessment.allowed && !external && <p>Taxa: {money(assessment.fee)}</p>}</div></div>;
}

function PaymentButton({ icon, active, label, onClick }) {
  return <button type="button" className={active ? "payment selected" : "payment"} onClick={onClick}>{icon}{label}</button>;
}

function Totals({ subtotal, deliveryFee, cardFee = 0, isCardPayment = false, total, deliveryType, deliveryDistance, externalDelivery = false }) {
  return <div className="totals">{deliveryDistance && deliveryType === "entrega" && <div className="distance-line"><span>Distância calculada</span><strong>{deliveryDistance.km.toFixed(2)} km</strong></div>}<div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>{deliveryType === "retirada" ? "Retirada" : externalDelivery ? "Entrega por Uber" : "Taxa de entrega"}</span><strong>{externalDelivery ? "Por conta do cliente" : money(deliveryFee)}</strong></div>{isCardPayment && <div><span>Taxa do cartão</span><strong>{money(cardFee)}</strong></div>}<div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div></div>;
}

function AdminLogin({ showNotice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try { await signIn(email, password); showNotice("Acesso administrativo liberado.", "success"); }
    catch (error) { showNotice(error.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : error.message, "error"); }
    finally { setLoading(false); }
  }
  return <section className="admin-view"><div className="section-title"><h1>Painel admin</h1><span>Acesso seguro com Supabase Auth</span></div><form className="admin-login" onSubmit={submit}><Lock size={28} /><label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-action" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button></form></section>;
}

function AdminAccessDenied({ message, onSignOut }) {
  return <section className="admin-view"><div className="admin-login"><TriangleAlert size={28} /><strong>Acesso administrativo não autorizado</strong><p className="empty">{message}</p><button className="primary-action" type="button" onClick={onSignOut}>Sair desta conta</button></div></section>;
}

export default App;
