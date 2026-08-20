import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Clock3,
  CreditCard,
  ImagePlus,
  LayoutDashboard,
  ListFilter,
  LogOut,
  PackageCheck,
  Palette,
  Plus,
  MapPinned,
  Rocket,
  Save,
  Search,
  ShoppingBag,
  Tags,
  Trash2,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import {
  deleteCategory,
  deleteDeliveryRange,
  deleteProduct,
  loadAdminOrders,
  removeBrandImage,
  removeCategoryImage,
  removeProductImage,
  saveBusinessHours,
  saveCategory,
  saveDeliveryRange,
  saveProduct,
  saveSettings,
  uploadBrandImage,
  uploadCategoryImage,
  uploadProductImage,
} from "../lib/api";
import { formatPostalCode, geocodeDeliveryAddress, lookupPostalCode, postalCodeDigits } from "../lib/address";
import { DAY_NAMES } from "../lib/businessHours";
import { validateDeliveryRanges } from "../lib/delivery";
import { slugify, uniqueProductId } from "../lib/productIds";

const TABS = [
  ["overview", "Visão geral", LayoutDashboard],
  ["establishment", "Estabelecimento", Building2],
  ["appearance", "Aparência", Palette],
  ["address", "Endereço", MapPinned],
  ["delivery", "Entrega", Truck],
  ["hours", "Funcionamento", Clock3],
  ["payment", "Pagamento", WalletCards],
  ["categories", "Categorias", Tags],
  ["products", "Produtos", PackageCheck],
  ["orders", "Pedidos", ShoppingBag],
];

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function errorMessage(error) {
  if (error?.code === "23505") return "Já existe um registro com esses dados.";
  if (error?.code === "23P01") return "A faixa informada se sobrepõe a outra faixa ativa.";
  if (error?.code === "23503") return "Este registro está sendo usado e não pode ser excluído.";
  return error?.message || "Não foi possível concluir a operação.";
}

export default function AdminPanel({ store, session, reloadStore, showNotice, onSignOut }) {
  const [tab, setTab] = useState("overview");
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingOrders(true);
    loadAdminOrders()
      .then((data) => active && setOrders(data))
      .catch((error) => active && setOrdersError(errorMessage(error)))
      .finally(() => active && setLoadingOrders(false));
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  return (
    <section className="admin-view">
      <div className="admin-session-bar">
        <div>
          <strong>Painel administrativo</strong>
          <small>{session.user.email}</small>
        </div>
        <button type="button" onClick={onSignOut}>
          <LogOut size={17} /> Sair
        </button>
      </div>

      {store.setupWarnings.length > 0 && (
        <div className="admin-warning">
          Execute a migração SQL antes de editar. {store.setupWarnings.join(" ")}
        </div>
      )}

      <nav className="admin-tabs" aria-label="Seções do painel">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview store={store} orders={orders} setTab={setTab} reloadStore={reloadStore} showNotice={showNotice} />}
      {tab === "establishment" && <EstablishmentManager settings={store.settings} reloadStore={reloadStore} showNotice={showNotice} />}
      {tab === "appearance" && <AppearanceManager settings={store.settings} reloadStore={reloadStore} showNotice={showNotice} />}
      {tab === "address" && <AddressManager settings={store.settings} reloadStore={reloadStore} showNotice={showNotice} />}
      {tab === "products" && (
        <ProductManager
          products={store.products}
          categories={store.categories}
          reloadStore={reloadStore}
          showNotice={showNotice}
        />
      )}
      {tab === "categories" && (
        <CategoryManager categories={store.categories} reloadStore={reloadStore} showNotice={showNotice} />
      )}
      {tab === "orders" && <Orders orders={orders} loading={loadingOrders} error={ordersError} />}
      {tab === "hours" && (
        <HoursManager hours={store.businessHours} timezone={store.settings.timezone} reloadStore={reloadStore} showNotice={showNotice} />
      )}
      {tab === "payment" && <PaymentManager settings={store.settings} reloadStore={reloadStore} showNotice={showNotice} />}
      {tab === "delivery" && (
        <DeliveryManager
          ranges={store.deliveryRanges}
          settings={store.settings}
          reloadStore={reloadStore}
          showNotice={showNotice}
        />
      )}
    </section>
  );
}

function Overview({ store, orders, setTab, reloadStore, showNotice }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: store.settings.timezone }).format(new Date());
  const todayOrders = orders.filter((order) => order.created_at?.slice(0, 10) === today);
  return (
    <div className="admin-section">
      <div className="admin-section-title"><h2>Visão geral</h2><span>Resumo da operação</span></div>
      <div className="admin-metrics">
        <article><CalendarDays size={22} /><span>Pedidos de hoje</span><strong>{todayOrders.length}</strong></article>
        <article><BadgeCheck size={22} /><span>Produtos</span><strong>{store.products.length}</strong></article>
        <article><Tags size={22} /><span>Categorias</span><strong>{store.categories.length}</strong></article>
        <article><Truck size={22} /><span>Faixas ativas</span><strong>{store.deliveryRanges.filter((item) => item.active).length}</strong></article>
      </div>
      <div className="admin-card">
        <h3>Configuração de entrega</h3>
        <p>
          Distância máxima: {store.settings.maximum_delivery_distance_km ? `${store.settings.maximum_delivery_distance_km} km` : "não definida"}
        </p>
        <p>Regra abaixo de 1 km: {store.settings.below_one_km_behavior || "bloqueada"}</p>
        <p>Limite para entrega própria: {store.settings.own_delivery_limit_km ? `${store.settings.own_delivery_limit_km} km` : "não definido"}</p>
        <p>Acima do limite: {store.settings.external_delivery_enabled ? "entrega externa por conta do cliente" : "regra convencional"}</p>
      </div>
      <SetupGuide store={store} setTab={setTab} reloadStore={reloadStore} showNotice={showNotice} />
    </div>
  );
}

function imageFileError(file) {
  if (!file) return "Selecione uma imagem.";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Use uma imagem JPG, PNG ou WEBP.";
  if (file.size > 5 * 1024 * 1024) return "A imagem deve ter no máximo 5 MB.";
  return "";
}

function SetupGuide({ store, setTab, reloadStore, showNotice }) {
  const settings = store.settings;
  const steps = [
    ["establishment", "Estabelecimento", settings.store_name && settings.store_name !== "Meu estabelecimento" && String(settings.whatsapp_number || "").length >= 10],
    ["appearance", "Aparência", /^#[0-9a-f]{6}$/i.test(settings.theme_primary_color || "")],
    ["address", "Endereço", settings.store_postal_code && settings.store_latitude !== null && settings.store_latitude !== "" && settings.store_longitude !== null && settings.store_longitude !== "" && Number.isFinite(Number(settings.store_latitude)) && Number.isFinite(Number(settings.store_longitude))],
    ["delivery", "Entrega", Number(settings.maximum_delivery_distance_km) > 0 && store.deliveryRanges.length > 0 && (!settings.external_delivery_enabled || Number(settings.own_delivery_limit_km) > 0)],
    ["hours", "Funcionamento", store.businessHours.some((item) => item.is_open)],
    ["payment", "Pagamento", settings.pix_enabled || settings.cash_enabled || settings.credit_card_enabled || settings.debit_card_enabled],
    ["categories", "Categorias", store.categories.length > 0],
    ["products", "Produtos", store.products.length > 0],
  ];
  const ready = steps.every(([, , complete]) => complete);
  async function finishSetup() {
    if (!ready) return showNotice("Conclua todas as etapas antes de publicar o cardápio.", "error");
    try {
      await saveSettings({ ...settings, setup_completed: true });
      await reloadStore();
      showNotice("Configuração inicial concluída. Cardápio pronto para uso.", "success");
    } catch (error) {
      showNotice(errorMessage(error), "error");
    }
  }
  return <div className="admin-card setup-guide"><div className="setup-heading"><div><Rocket size={22}/><h3>Configuração inicial</h3></div><span>{steps.filter(([, , done]) => done).length}/{steps.length}</span></div><p>{settings.setup_completed ? "Configuração concluída. Você pode revisar qualquer seção quando quiser." : "Complete as etapas para publicar um cardápio independente."}</p><div className="setup-steps">{steps.map(([id,label,complete], index)=><button type="button" key={id} className={complete?"complete":""} onClick={()=>setTab(id)}><span>{complete?"✓":index+1}</span>{label}</button>)}</div>{!settings.setup_completed&&<button className="admin-primary wide" type="button" disabled={!ready} onClick={finishSetup}><BadgeCheck size={17}/>Concluir configuração</button>}</div>;
}

const EMPTY_PRODUCT = {
  id: "",
  name: "",
  description: "",
  price: "",
  category: "",
  image: "",
  status: "Disponível",
  visible: true,
  featured: false,
  sort_order: 0,
};

function ProductManager({ products, categories, reloadStore, showNotice }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => () => filePreview && URL.revokeObjectURL(filePreview), [filePreview]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (term && !product.name.toLowerCase().includes(term)) return false;
      if (categoryFilter !== "all" && product.category !== categoryFilter) return false;
      if (statusFilter !== "all" && product.status !== statusFilter) return false;
      if (visibilityFilter === "visible" && product.visible === false) return false;
      if (visibilityFilter === "hidden" && product.visible !== false) return false;
      return true;
    });
  }, [products, search, categoryFilter, statusFilter, visibilityFilter]);

  function confirmDiscard() {
    return !dirty || window.confirm("Descartar as alterações não salvas?");
  }

  function startNew() {
    if (!confirmDiscard()) return;
    setDraft({ ...EMPTY_PRODUCT, category: categories[0]?.id || "" });
    setIsNew(true);
    setDirty(false);
    setFile(null);
    setFilePreview("");
  }

  function startEdit(product) {
    if (!confirmDiscard()) return;
    setDraft({ ...product });
    setIsNew(false);
    setDirty(false);
    setFile(null);
    setFilePreview("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function change(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(isNew && field === "name" ? { id: uniqueProductId(value, products) } : {}),
    }));
    setDirty(true);
  }

  function selectFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      showNotice("Use uma imagem JPG, JPEG, PNG ou WEBP.", "error");
      event.target.value = "";
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      showNotice("A imagem deve ter no máximo 5 MB.", "error");
      event.target.value = "";
      return;
    }
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(selected);
    setFilePreview(URL.createObjectURL(selected));
    setDirty(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!draft.name.trim() || !draft.id || !draft.category || Number(draft.price) < 0) {
      showNotice("Preencha nome, identificador, categoria e um preço válido.", "error");
      return;
    }
    setSaving(true);
    let uploaded = null;
    const oldImage = isNew ? "" : products.find((item) => item.id === draft.id)?.image;
    try {
      if (file) uploaded = await uploadProductImage(file);
      await saveProduct({ ...draft, image: uploaded?.url || draft.image }, isNew);
      if (uploaded && oldImage && oldImage !== uploaded.url) {
        removeProductImage(oldImage).catch(() => {});
      }
      await reloadStore();
      setDraft(null);
      setDirty(false);
      setFile(null);
      setFilePreview("");
      showNotice(isNew ? "Produto criado com sucesso." : "Produto atualizado com sucesso.", "success");
    } catch (error) {
      if (uploaded) removeProductImage(uploaded.url).catch(() => {});
      showNotice(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(product) {
    if (!window.confirm(`Excluir “${product.name}”? Essa ação não pode ser desfeita.`)) return;
    try {
      await deleteProduct(product.id);
      await removeProductImage(product.image).catch(() => {});
      await reloadStore();
      showNotice("Produto excluído.", "success");
    } catch (error) {
      showNotice(errorMessage(error), "error");
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-title">
        <div><h2>Produtos</h2><span>{filtered.length} de {products.length}</span></div>
        <button className="admin-primary" type="button" onClick={startNew}><Plus size={17} /> Novo produto</button>
      </div>

      {draft && (
        <form className="admin-editor" onSubmit={submit}>
          <div className="editor-heading">
            <h3>{isNew ? "Novo produto" : `Editar ${draft.name}`}</h3>
            <button type="button" onClick={() => confirmDiscard() && setDraft(null)} aria-label="Fechar"><X size={19} /></button>
          </div>
          <div className="product-preview">{filePreview || draft.image ? <img src={filePreview || draft.image} alt="Prévia do produto" loading="lazy" decoding="async" /> : <span className="admin-thumb-placeholder"><PackageCheck size={28}/></span>}</div>
          <div className="field-row">
            <label>Nome<input required value={draft.name} onChange={(event) => change("name", event.target.value)} /></label>
            <label>Identificador gerado<input required readOnly value={draft.id} /></label>
          </div>
          <label>Descrição<textarea value={draft.description} onChange={(event) => change("description", event.target.value)} /></label>
          <div className="field-row three">
            <label>Preço (R$)<input type="number" min="0" step="0.01" required value={draft.price} onChange={(event) => change("price", event.target.value)} /></label>
            <label>Categoria<select value={draft.category} onChange={(event) => change("category", event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Ordem<input type="number" min="0" step="1" value={draft.sort_order} onChange={(event) => change("sort_order", event.target.value)} /></label>
          </div>
          <label className="upload-field"><ImagePlus size={20} /> Enviar foto da galeria (JPG, PNG ou WEBP, até 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} /></label>
          <label>Ou usar URL externa<input type="url" value={draft.image} onChange={(event) => change("image", event.target.value)} /></label>
          <div className="field-row three">
            <label>Status<select value={draft.status} onChange={(event) => change("status", event.target.value)}><option>Disponível</option><option>Esgotado</option></select></label>
            <label className="admin-check"><input type="checkbox" checked={draft.visible !== false} onChange={(event) => change("visible", event.target.checked)} /> Visível no cardápio</label>
            <label className="admin-check"><input type="checkbox" checked={Boolean(draft.featured)} onChange={(event) => change("featured", event.target.checked)} /> Produto destacado</label>
          </div>
          <button className="admin-primary wide" type="submit" disabled={saving}><Save size={17} /> {saving ? "Salvando..." : "Salvar produto"}</button>
        </form>
      )}

      <div className="admin-filters">
        <label className="filter-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por nome" /></label>
        <label><ListFilter size={16} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <select aria-label="Filtrar status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option><option value="Disponível">Disponíveis</option><option value="Esgotado">Esgotados</option></select>
        <select aria-label="Filtrar visibilidade" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}><option value="all">Visíveis e ocultos</option><option value="visible">Somente visíveis</option><option value="hidden">Somente ocultos</option></select>
      </div>

      <div className="admin-product-list">
        {filtered.map((product) => (
          <article key={product.id} className="admin-product-row">
            {product.image ? <img src={product.image} alt="" loading="lazy" decoding="async" /> : <span className="admin-thumb-placeholder"><PackageCheck size={22}/></span>}
            <div><strong>{product.name}</strong><span>{categories.find((item) => item.id === product.category)?.name || product.category} · {money(product.price)}</span><small>{product.status} · {product.visible === false ? "Oculto" : "Visível"}{product.featured ? " · Destaque" : ""}</small></div>
            <div className="row-actions"><button type="button" onClick={() => startEdit(product)}>Editar</button><button className="danger" type="button" onClick={() => remove(product)}><Trash2 size={16} /></button></div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <p className="empty">Nenhum produto encontrado.</p>}
    </div>
  );
}

function CategoryManager({ categories, reloadStore, showNotice }) {
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const start = (category = null) => {
    setIsNew(!category);
    setFile(null);
    setDraft(category ? { ...category } : { id: "", name: "", description: "", banner_url: "", sort_order: categories.length + 1, active: true });
  };
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value, ...(isNew && field === "name" ? { id: slugify(value) } : {}) }));
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    let uploaded = null;
    const oldBanner = isNew ? "" : categories.find((item) => item.id === draft.id)?.banner_url;
    try { if(file) uploaded=await uploadCategoryImage(file); await saveCategory({...draft,banner_url:uploaded?.url||draft.banner_url}, isNew); if(uploaded&&oldBanner&&oldBanner!==uploaded.url)removeCategoryImage(oldBanner).catch(()=>{}); await reloadStore(); setDraft(null); setFile(null); showNotice("Categoria salva com sucesso.", "success"); }
    catch (error) { if(uploaded)removeCategoryImage(uploaded.url).catch(()=>{}); showNotice(errorMessage(error), "error"); }
    finally { setSaving(false); }
  }
  async function remove(category) {
    if (!window.confirm(`Excluir a categoria “${category.name}”?`)) return;
    try { await deleteCategory(category.id); await removeCategoryImage(category.banner_url).catch(()=>{}); await reloadStore(); showNotice("Categoria excluída.", "success"); }
    catch (error) { showNotice(errorMessage(error), "error"); }
  }
  return (
    <div className="admin-section">
      <div className="admin-section-title"><div><h2>Categorias</h2><span>Organização do cardápio</span></div><button className="admin-primary" type="button" onClick={() => start()}><Plus size={17} /> Nova categoria</button></div>
      {draft && <form className="admin-editor" onSubmit={submit}>
        <div className="editor-heading"><h3>{isNew ? "Nova categoria" : "Editar categoria"}</h3><button type="button" onClick={() => setDraft(null)}><X size={19} /></button></div>
        {draft.banner_url && <div className="category-preview"><img src={draft.banner_url} alt="Prévia" loading="lazy" decoding="async" /></div>}
        <div className="field-row"><label>Nome<input required value={draft.name} onChange={(event) => change("name", event.target.value)} /></label><label>Identificador<input disabled={!isNew} required value={draft.id} onChange={(event) => change("id", slugify(event.target.value))} /></label></div>
        <label>Descrição<textarea value={draft.description} onChange={(event) => change("description", event.target.value)} /></label>
        <label className="upload-field"><ImagePlus size={20}/>Enviar banner da galeria (JPG, PNG ou WEBP, até 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>{const selected=event.target.files?.[0];const message=imageFileError(selected);if(message){showNotice(message,"error");event.target.value="";return;}setFile(selected);}}/></label>
        {file&&<small className="selected-file">Selecionada: {file.name}</small>}
        <label>Ou usar URL externa<input type="url" value={draft.banner_url} onChange={(event) => change("banner_url", event.target.value)} /></label>
        <div className="field-row"><label>Ordem<input type="number" min="0" value={draft.sort_order} onChange={(event) => change("sort_order", event.target.value)} /></label><label className="admin-check"><input type="checkbox" checked={draft.active !== false} onChange={(event) => change("active", event.target.checked)} /> Categoria ativa</label></div>
        <button className="admin-primary wide" disabled={saving}><Save size={17} /> {saving ? "Salvando..." : "Salvar categoria"}</button>
      </form>}
      <div className="admin-card-list">{categories.map((category) => <article className="category-admin-row" key={category.id}>{category.banner_url ? <img src={category.banner_url} alt="" loading="lazy" decoding="async" /> : <span className="admin-thumb-placeholder"><Tags size={22}/></span>}<div><strong>{category.name}</strong><span>Ordem {category.sort_order} · {category.active ? "Ativa" : "Oculta"}</span></div><div className="row-actions"><button type="button" onClick={() => start(category)}>Editar</button><button className="danger" type="button" onClick={() => remove(category)}><Trash2 size={16} /></button></div></article>)}</div>
    </div>
  );
}

function HoursManager({ hours, timezone, reloadStore, showNotice }) {
  const [draft, setDraft] = useState(hours);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(hours), [hours]);
  const change = (day, field, value) => setDraft((current) => current.map((item) => Number(item.day_of_week) === day ? { ...item, [field]: value } : item));
  async function submit(event) {
    event.preventDefault();
    if (draft.some((item) => item.is_open && (!item.opening_time || !item.closing_time))) { showNotice("Informe abertura e fechamento dos dias ativos.", "error"); return; }
    setSaving(true);
    try { await saveBusinessHours(draft); await reloadStore(); showNotice("Horários atualizados.", "success"); }
    catch (error) { showNotice(errorMessage(error), "error"); }
    finally { setSaving(false); }
  }
  return <div className="admin-section"><div className="admin-section-title"><h2>Funcionamento</h2><span>Fuso {timezone || "America/Sao_Paulo"}</span></div><form className="admin-editor hours-form" onSubmit={submit}>{[0,1,2,3,4,5,6].map((day) => { const item=draft.find((candidate)=>Number(candidate.day_of_week)===day) || {day_of_week:day,is_open:false,opening_time:"",closing_time:""}; return <div className="hours-row" key={day}><strong>{DAY_NAMES[day]}</strong><label className="admin-check"><input type="checkbox" checked={Boolean(item.is_open)} onChange={(event)=>change(day,"is_open",event.target.checked)} /> Aberto</label><label>Abertura<input type="time" disabled={!item.is_open} value={item.opening_time?.slice(0,5)||""} onChange={(event)=>change(day,"opening_time",event.target.value)} /></label><label>Fechamento<input type="time" disabled={!item.is_open} value={item.closing_time?.slice(0,5)||""} onChange={(event)=>change(day,"closing_time",event.target.value)} /></label></div>; })}<button className="admin-primary wide" disabled={saving}><Save size={17} /> {saving?"Salvando...":"Salvar horários"}</button></form></div>;
}

function DeliveryManager({ ranges, settings, reloadStore, showNotice }) {
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [rangeDraft, setRangeDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setSettingsDraft(settings), [settings]);
  async function saveRules(event) {
    event.preventDefault();
    if (!settingsDraft.maximum_delivery_distance_km || Number(settingsDraft.maximum_delivery_distance_km) <= 0) { showNotice("Defina uma distância máxima maior que zero.", "error"); return; }
    if (settingsDraft.below_one_km_behavior === "fixed" && (settingsDraft.below_one_km_fee === "" || Number(settingsDraft.below_one_km_fee) < 0)) { showNotice("Defina a taxa fixa abaixo de 1 km.", "error"); return; }
    if (settingsDraft.external_delivery_enabled && (!settingsDraft.own_delivery_limit_km || Number(settingsDraft.own_delivery_limit_km) <= 0)) { showNotice("Defina um limite de entrega própria maior que zero.", "error"); return; }
    if (settingsDraft.external_delivery_enabled && Number(settingsDraft.maximum_delivery_distance_km) < Number(settingsDraft.own_delivery_limit_km)) { showNotice("A distância máxima convencional não pode ser menor que o limite de entrega própria.", "error"); return; }
    setSaving(true); try { await saveSettings(settingsDraft); await reloadStore(); showNotice("Regras de entrega salvas.", "success"); } catch(error){showNotice(errorMessage(error),"error");} finally{setSaving(false);}
  }
  function startRange(range=null){setIsNew(!range);setRangeDraft(range?{...range}:{min_distance_km:ranges.length?"":"1.00",max_distance_km:ranges.length?"":"1.99",fee:"",active:true});}
  async function submitRange(event){event.preventDefault();const candidate=isNew?[...ranges,rangeDraft]:ranges.map((item)=>item.id===rangeDraft.id?rangeDraft:item);const validation=validateDeliveryRanges(candidate);if(validation){showNotice(validation,"error");return;}setSaving(true);try{await saveDeliveryRange(rangeDraft,isNew);await reloadStore();setRangeDraft(null);showNotice("Faixa de entrega salva.","success");}catch(error){showNotice(errorMessage(error),"error");}finally{setSaving(false);}}
  async function remove(range){if(!window.confirm("Excluir esta faixa de entrega?"))return;try{await deleteDeliveryRange(range.id);await reloadStore();showNotice("Faixa excluída.","success");}catch(error){showNotice(errorMessage(error),"error");}}
  return <div className="admin-section"><div className="admin-section-title"><h2>Taxas de entrega</h2><span>Valores e modalidades por distância real</span></div>
    <form className="admin-editor" onSubmit={saveRules}><h3>Área, pedido mínimo e regra abaixo de 1 km</h3><div className="field-row"><label>Comportamento abaixo de 1 km<select value={settingsDraft.below_one_km_behavior} onChange={(event)=>setSettingsDraft({...settingsDraft,below_one_km_behavior:event.target.value})}><option value="blocked">Bloquear</option><option value="free">Grátis</option><option value="fixed">Taxa fixa</option></select></label>{settingsDraft.below_one_km_behavior==="fixed"&&<label>Taxa fixa (R$)<input type="number" min="0" step="0.01" value={settingsDraft.below_one_km_fee??""} onChange={(event)=>setSettingsDraft({...settingsDraft,below_one_km_fee:event.target.value})}/></label>}</div><div className="field-row"><label>Distância máxima de atendimento convencional (km)<input type="number" min="0.01" step="0.01" value={settingsDraft.maximum_delivery_distance_km??""} onChange={(event)=>setSettingsDraft({...settingsDraft,maximum_delivery_distance_km:event.target.value})}/></label><label>Pedido mínimo (R$)<input type="number" min="0" step="0.01" value={settingsDraft.minimum_order_value??0} onChange={(event)=>setSettingsDraft({...settingsDraft,minimum_order_value:event.target.value})}/></label></div><div className="external-delivery-settings"><label className="admin-check"><input type="checkbox" checked={Boolean(settingsDraft.external_delivery_enabled)} onChange={(event)=>setSettingsDraft({...settingsDraft,external_delivery_enabled:event.target.checked})}/>Acima do limite: entrega externa por conta do cliente</label>{settingsDraft.external_delivery_enabled&&<label>Limite para entrega própria (km)<input type="number" min="0.01" step="0.01" value={settingsDraft.own_delivery_limit_km??""} onChange={(event)=>setSettingsDraft({...settingsDraft,own_delivery_limit_km:event.target.value})}/><small>Acima desta distância, o pedido segue sem taxa convencional e o cliente é orientado a solicitar o Uber.</small></label>}</div><button className="admin-primary wide" disabled={saving}><Save size={17}/>{saving?"Salvando...":"Salvar regras"}</button></form>
    <div className="admin-section-title compact"><h3>Faixas a partir de 1 km</h3><button className="admin-primary" type="button" onClick={()=>startRange()}><Plus size={17}/>Nova faixa</button></div>
    {rangeDraft&&<form className="admin-editor" onSubmit={submitRange}><div className="editor-heading"><h3>{isNew?"Nova faixa":"Editar faixa"}</h3><button type="button" onClick={()=>setRangeDraft(null)}><X size={19}/></button></div><div className="field-row three"><label>Distância mínima (km)<input type="number" min="1" step="0.01" required value={rangeDraft.min_distance_km} onChange={(event)=>setRangeDraft({...rangeDraft,min_distance_km:event.target.value})}/></label><label>Distância máxima (km)<input type="number" min="1" step="0.01" required value={rangeDraft.max_distance_km} onChange={(event)=>setRangeDraft({...rangeDraft,max_distance_km:event.target.value})}/></label><label>Taxa (R$)<input type="number" min="0" step="0.01" required value={rangeDraft.fee} onChange={(event)=>setRangeDraft({...rangeDraft,fee:event.target.value})}/></label></div><label className="admin-check"><input type="checkbox" checked={rangeDraft.active!==false} onChange={(event)=>setRangeDraft({...rangeDraft,active:event.target.checked})}/>Faixa ativa</label><button className="admin-primary wide" disabled={saving}><Save size={17}/>{saving?"Salvando...":"Salvar faixa"}</button></form>}
    <div className="admin-card-list">{ranges.map((range)=><article className="fee-row" key={range.id}><div><strong>{Number(range.min_distance_km).toFixed(2)} a {Number(range.max_distance_km).toFixed(2)} km</strong><span>{money(range.fee)} · {range.active?"Ativa":"Inativa"}</span></div><div className="row-actions"><button type="button" onClick={()=>startRange(range)}>Editar</button><button className="danger" type="button" onClick={()=>remove(range)}><Trash2 size={16}/></button></div></article>)}</div>{ranges.length===0&&<p className="empty">Nenhuma faixa cadastrada. Entregas próprias a partir de 1 km permanecerão bloqueadas.</p>}
  </div>;
}

function EstablishmentManager({ settings, reloadStore, showNotice }) {
  const [draft,setDraft]=useState(settings);const [saving,setSaving]=useState(false);const [logoFile,setLogoFile]=useState(null);const [heroFile,setHeroFile]=useState(null);
  useEffect(()=>setDraft(settings),[settings]);const change=(field,value)=>setDraft((current)=>({...current,[field]:value}));
  function selectImage(event,setter){const selected=event.target.files?.[0];const message=imageFileError(selected);if(message){showNotice(message,"error");event.target.value="";return;}setter(selected);}
  async function submit(event){event.preventDefault();if(String(draft.whatsapp_number||"").replace(/\D/g,"").length<10){showNotice("Informe o WhatsApp com DDI e DDD.","error");return;}try{new Intl.DateTimeFormat("pt-BR",{timeZone:draft.timezone}).format();}catch{showNotice("Informe um fuso horário IANA válido, como America/Sao_Paulo.","error");return;}setSaving(true);let logoUpload=null;let heroUpload=null;try{if(logoFile)logoUpload=await uploadBrandImage(logoFile);if(heroFile)heroUpload=await uploadBrandImage(heroFile);const next={...draft,brand_logo_url:logoUpload?.url||draft.brand_logo_url,brand_hero_url:heroUpload?.url||draft.brand_hero_url};await saveSettings(next);if(logoUpload&&settings.brand_logo_url)removeBrandImage(settings.brand_logo_url).catch(()=>{});if(heroUpload&&settings.brand_hero_url)removeBrandImage(settings.brand_hero_url).catch(()=>{});await reloadStore();setLogoFile(null);setHeroFile(null);showNotice("Dados do estabelecimento salvos.","success");}catch(error){if(logoUpload)removeBrandImage(logoUpload.url).catch(()=>{});if(heroUpload)removeBrandImage(heroUpload.url).catch(()=>{});showNotice(errorMessage(error),"error");}finally{setSaving(false);}}
  return <div className="admin-section"><div className="admin-section-title"><h2>Estabelecimento</h2><span>Identidade e contato público</span></div><form className="admin-editor" onSubmit={submit}><label>Nome do estabelecimento<input required value={draft.store_name||""} onChange={(event)=>change("store_name",event.target.value)}/></label><label>Descrição<textarea value={draft.store_description||""} onChange={(event)=>change("store_description",event.target.value)} placeholder="Conte brevemente o que seu estabelecimento oferece."/></label><label>WhatsApp com DDI e DDD<input required inputMode="numeric" value={draft.whatsapp_number||""} onChange={(event)=>change("whatsapp_number",event.target.value.replace(/\D/g,""))}/></label><label>Fuso horário<input value={draft.timezone||"America/Sao_Paulo"} onChange={(event)=>change("timezone",event.target.value)} placeholder="America/Sao_Paulo"/></label><div className="brand-upload-grid"><div>{draft.brand_logo_url&&<img className="brand-preview logo" src={draft.brand_logo_url} alt="Logo atual"/>}<label className="upload-field"><ImagePlus size={20}/>Enviar logo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>selectImage(event,setLogoFile)}/></label>{logoFile&&<small className="selected-file">{logoFile.name}</small>}<label>Ou URL do logo<input type="url" value={draft.brand_logo_url||""} onChange={(event)=>change("brand_logo_url",event.target.value)}/></label></div><div>{draft.brand_hero_url&&<img className="brand-preview" src={draft.brand_hero_url} alt="Capa atual"/>}<label className="upload-field"><ImagePlus size={20}/>Enviar capa<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>selectImage(event,setHeroFile)}/></label>{heroFile&&<small className="selected-file">{heroFile.name}</small>}<label>Ou URL da capa<input type="url" value={draft.brand_hero_url||""} onChange={(event)=>change("brand_hero_url",event.target.value)}/></label></div></div><button className="admin-primary wide" disabled={saving}><Save size={17}/>{saving?"Salvando...":"Salvar estabelecimento"}</button></form></div>;
}

function AppearanceManager({ settings, reloadStore, showNotice }) {
  const [draft,setDraft]=useState(settings);const [saving,setSaving]=useState(false);useEffect(()=>setDraft(settings),[settings]);
  const colors=[["theme_primary_color","Cor principal"],["theme_secondary_color","Cor secundária"],["theme_background_color","Cor de fundo"],["theme_surface_color","Cor dos cartões"],["theme_text_color","Cor do texto"]];
  async function submit(event){event.preventDefault();if(colors.some(([field])=>!/^#[0-9a-f]{6}$/i.test(draft[field]||""))){showNotice("Use cores no formato hexadecimal de 6 dígitos.","error");return;}setSaving(true);try{await saveSettings(draft);await reloadStore();showNotice("Aparência atualizada no cardápio.","success");}catch(error){showNotice(errorMessage(error),"error");}finally{setSaving(false);}}
  return <div className="admin-section"><div className="admin-section-title"><h2>Aparência</h2><span>Cores aplicadas automaticamente</span></div><form className="admin-editor" onSubmit={submit}><div className="color-grid">{colors.map(([field,label])=><label className="color-field" key={field}>{label}<span><input type="color" value={draft[field]||"#000000"} onChange={(event)=>setDraft({...draft,[field]:event.target.value})}/><input pattern="#[0-9A-Fa-f]{6}" value={draft[field]||""} onChange={(event)=>setDraft({...draft,[field]:event.target.value})}/></span></label>)}</div><button className="admin-primary wide" disabled={saving}><Save size={17}/>{saving?"Salvando...":"Salvar aparência"}</button></form></div>;
}

function AddressManager({ settings, reloadStore, showNotice }) {
  const [draft,setDraft]=useState(settings);const [saving,setSaving]=useState(false);const [locating,setLocating]=useState(false);useEffect(()=>setDraft(settings),[settings]);const change=(field,value)=>setDraft((current)=>({...current,[field]:value}));
  async function findPostalCode(){if(postalCodeDigits(draft.store_postal_code).length!==8){showNotice("Informe um CEP válido com 8 dígitos.","error");return;}setLocating(true);try{const found=await lookupPostalCode(draft.store_postal_code);setDraft((current)=>({...current,store_postal_code:found.postalCode,store_street:found.street,store_neighborhood:found.neighborhood,store_city:found.city,store_state:found.state,store_latitude:null,store_longitude:null}));showNotice("CEP encontrado. Complete o número e confira o endereço.","success");}catch(error){showNotice(errorMessage(error),"error");}finally{setLocating(false);}}
  async function locate(nextDraft=draft){setLocating(true);try{const coordinates=await geocodeDeliveryAddress({postalCode:nextDraft.store_postal_code,street:nextDraft.store_street,number:nextDraft.store_number,complement:nextDraft.store_complement,neighborhood:nextDraft.store_neighborhood,city:nextDraft.store_city,state:nextDraft.store_state});setDraft((current)=>({...current,store_latitude:coordinates.latitude,store_longitude:coordinates.longitude}));showNotice(coordinates.precision==="exact"?"Endereço localizado com precisão.":"Endereço localizado aproximadamente; confira os dados.",coordinates.precision==="exact"?"success":"info");return coordinates;}catch(error){showNotice(errorMessage(error),"error");throw error;}finally{setLocating(false);}}
  async function submit(event){event.preventDefault();setSaving(true);try{const coordinates=await locate();await saveSettings({...draft,store_latitude:coordinates.latitude,store_longitude:coordinates.longitude});await reloadStore();showNotice("Endereço e coordenadas salvos.","success");}catch{}finally{setSaving(false);}}
  return <div className="admin-section"><div className="admin-section-title"><h2>Endereço</h2><span>Base do cálculo de distância</span></div><form className="admin-editor" onSubmit={submit}><div className="postal-lookup"><label>CEP<input required inputMode="numeric" value={formatPostalCode(draft.store_postal_code||"")} onChange={(event)=>change("store_postal_code",formatPostalCode(event.target.value))}/></label><button type="button" className="admin-secondary" onClick={findPostalCode} disabled={locating}>Buscar CEP</button></div><div className="field-row"><label>Rua<input required value={draft.store_street||""} onChange={(event)=>change("store_street",event.target.value)}/></label><label>Número<input required value={draft.store_number||""} onChange={(event)=>change("store_number",event.target.value)}/></label></div><label>Complemento<input value={draft.store_complement||""} onChange={(event)=>change("store_complement",event.target.value)}/></label><label>Bairro<input required value={draft.store_neighborhood||""} onChange={(event)=>change("store_neighborhood",event.target.value)}/></label><div className="field-row"><label>Cidade<input required value={draft.store_city||""} onChange={(event)=>change("store_city",event.target.value)}/></label><label>Estado<input required maxLength="2" value={draft.store_state||""} onChange={(event)=>change("store_state",event.target.value.toUpperCase())}/></label></div><button type="button" className="admin-secondary wide" onClick={()=>locate().catch(()=>{})} disabled={locating}><MapPinned size={17}/>{locating?"Localizando...":"Localizar automaticamente"}</button><details className="advanced-fields"><summary>Coordenadas (ajuste manual avançado)</summary><div className="field-row"><label>Latitude<input type="number" step="any" value={draft.store_latitude??""} onChange={(event)=>change("store_latitude",event.target.value)}/></label><label>Longitude<input type="number" step="any" value={draft.store_longitude??""} onChange={(event)=>change("store_longitude",event.target.value)}/></label></div></details><button className="admin-primary wide" disabled={saving||locating}><Save size={17}/>{saving?"Salvando...":"Validar e salvar endereço"}</button></form></div>;
}

function PaymentManager({ settings, reloadStore, showNotice }) {
  const [draft,setDraft]=useState(settings);const [saving,setSaving]=useState(false);const [qrFile,setQrFile]=useState(null);useEffect(()=>setDraft(settings),[settings]);const change=(field,value)=>setDraft((current)=>({...current,[field]:value}));
  async function submit(event){event.preventDefault();if(!draft.pix_enabled&&!draft.cash_enabled&&!draft.credit_card_enabled&&!draft.debit_card_enabled){showNotice("Ative pelo menos uma forma de pagamento.","error");return;}if(draft.pix_enabled&&(!draft.pix_key?.trim()||!draft.pix_name?.trim())){showNotice("Informe o nome e a chave Pix.","error");return;}setSaving(true);let uploaded=null;try{if(qrFile)uploaded=await uploadBrandImage(qrFile);await saveSettings({...draft,pix_qr_code_url:uploaded?.url||draft.pix_qr_code_url});if(uploaded&&settings.pix_qr_code_url)removeBrandImage(settings.pix_qr_code_url).catch(()=>{});await reloadStore();setQrFile(null);showNotice("Formas de pagamento salvas.","success");}catch(error){if(uploaded)removeBrandImage(uploaded.url).catch(()=>{});showNotice(errorMessage(error),"error");}finally{setSaving(false);}}
  return <div className="admin-section"><div className="admin-section-title"><h2>Pagamento</h2><span>Mostre somente as opções aceitas</span></div><form className="admin-editor" onSubmit={submit}><div className="payment-admin-grid"><label className="admin-check"><input type="checkbox" checked={Boolean(draft.pix_enabled)} onChange={(event)=>change("pix_enabled",event.target.checked)}/>Pix</label><label className="admin-check"><input type="checkbox" checked={Boolean(draft.cash_enabled)} onChange={(event)=>change("cash_enabled",event.target.checked)}/>Dinheiro</label><label className="admin-check"><input type="checkbox" checked={Boolean(draft.credit_card_enabled)} onChange={(event)=>change("credit_card_enabled",event.target.checked)}/>Cartão de crédito</label><label className="admin-check"><input type="checkbox" checked={Boolean(draft.debit_card_enabled)} onChange={(event)=>change("debit_card_enabled",event.target.checked)}/>Cartão de débito</label></div>{draft.pix_enabled&&<><div className="field-row"><label>Nome do favorecido Pix<input required value={draft.pix_name||""} onChange={(event)=>change("pix_name",event.target.value)}/></label><label>Chave Pix<input required value={draft.pix_key||""} onChange={(event)=>change("pix_key",event.target.value)}/></label></div>{draft.pix_qr_code_url&&<img className="brand-preview qr" src={draft.pix_qr_code_url} alt="QR Code Pix"/>}<label className="upload-field"><ImagePlus size={20}/>Enviar QR Code Pix<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>{const selected=event.target.files?.[0];const message=imageFileError(selected);if(message){showNotice(message,"error");event.target.value="";return;}setQrFile(selected);}}/></label><label>Ou URL do QR Code<input type="url" value={draft.pix_qr_code_url||""} onChange={(event)=>change("pix_qr_code_url",event.target.value)}/></label></>} {(draft.credit_card_enabled||draft.debit_card_enabled)&&<label>Taxa de cartão (%)<input type="number" min="0" step="0.01" value={draft.card_fee_percent??0} onChange={(event)=>change("card_fee_percent",event.target.value)}/></label>}<button className="admin-primary wide" disabled={saving}><CreditCard size={17}/>{saving?"Salvando...":"Salvar pagamentos"}</button></form></div>;
}

function Orders({ orders, loading, error }) {
  return <div className="admin-section"><div className="admin-section-title"><h2>Pedidos</h2><span>Últimos 100 pedidos</span></div>{loading&&<p className="empty">Carregando pedidos...</p>}{error&&<div className="admin-warning">{error}</div>}<div className="orders-list">{orders.map((order)=><article key={order.id} className="admin-card"><div className="order-heading"><strong>#{String(order.id).slice(0,8)} · {order.customer_name}</strong><span>{money(order.total)}</span></div><small>{new Date(order.created_at).toLocaleString("pt-BR")} · {order.delivery_type} · {order.payment_method}</small><p>{(order.order_items||[]).map((item)=>`${item.quantity}x ${item.product_name}`).join(", ")}</p>{order.distance_km!=null&&<small>Distância: {Number(order.distance_km).toFixed(2)} km · {order.external_delivery?"Uber por conta do cliente":`Entrega: ${money(order.delivery_fee)}`}</small>}</article>)}</div>{!loading&&!error&&orders.length===0&&<p className="empty">Nenhum pedido salvo no Supabase.</p>}</div>;
}
