// Valores neutros mantêm o painel acessível antes da configuração inicial.
// Em uma instalação normal, as tabelas do Supabase são a fonte oficial.
export const PUBLIC_FALLBACKS = {
  id: "global",
  setup_completed: false,
  store_name: "Meu estabelecimento",
  store_description: "",
  whatsapp_number: "",
  pix_enabled: false,
  pix_key: "",
  pix_name: "",
  pix_qr_code_url: "",
  cash_enabled: false,
  credit_card_enabled: false,
  debit_card_enabled: false,
  brand_logo_url: "",
  brand_hero_url: "",
  theme_primary_color: "#c50e0c",
  theme_secondary_color: "#ffc107",
  theme_background_color: "#050505",
  theme_surface_color: "#121212",
  theme_text_color: "#ffffff",
  timezone: "America/Sao_Paulo",
  store_postal_code: "",
  store_street: "",
  store_number: "",
  store_complement: "",
  store_neighborhood: "",
  store_city: "",
  store_state: "",
  store_latitude: null,
  store_longitude: null,
  below_one_km_behavior: "blocked",
  below_one_km_fee: null,
  maximum_delivery_distance_km: null,
  own_delivery_limit_km: null,
  external_delivery_enabled: false,
  minimum_order_value: 0,
  card_fee_percent: 0,
};

export const FALLBACK_CATEGORIES = [];

export const FALLBACK_BUSINESS_HOURS = Array.from({ length: 7 }, (_, day) => ({
  day_of_week: day,
  is_open: false,
  opening_time: null,
  closing_time: null,
}));
