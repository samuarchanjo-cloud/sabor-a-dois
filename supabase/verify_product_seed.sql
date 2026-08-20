-- Verificação somente de leitura após 20260820000000_products_seed_safe.sql.

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.products'::regclass
order by contype, conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'products'
order by indexname;

select id, name, description, price, category, status, visible, featured,
       sort_order, (image_url <> '') as has_image
from public.products
where name in (
  'Frango Assado com Farofa',
  'Frango Assado com Batata e Farofa',
  'Frango Assado com Linguiça e Farofa',
  'Frango Assado com Linguiça, Batata e Farofa',
  'Arroz', 'Salpicão', 'Maionese', 'Macarronese',
  'Coca-Cola 2L', 'Coca-Cola Zero 2L', 'Fanta', 'Convenção / Guaraná'
)
order by category, sort_order, name;

select count(*) as expected_product_count
from public.products
where name in (
  'Frango Assado com Farofa',
  'Frango Assado com Batata e Farofa',
  'Frango Assado com Linguiça e Farofa',
  'Frango Assado com Linguiça, Batata e Farofa',
  'Arroz', 'Salpicão', 'Maionese', 'Macarronese',
  'Coca-Cola 2L', 'Coca-Cola Zero 2L', 'Fanta', 'Convenção / Guaraná'
);

-- Snapshot sanitizado das configurações que a migration de produtos não altera.
select
  id, setup_completed, store_name, timezone,
  (whatsapp_number <> '') as whatsapp_configured,
  (pix_key <> '') as pix_configured,
  pix_enabled, cash_enabled, credit_card_enabled, debit_card_enabled,
  (store_latitude is not null and store_longitude is not null) as coordinates_configured,
  maximum_delivery_distance_km, own_delivery_limit_km, external_delivery_enabled,
  theme_primary_color, theme_secondary_color, theme_background_color,
  theme_surface_color, theme_text_color
from public.app_settings
where id = 'global';

select day_of_week, is_open, opening_time, closing_time
from public.business_hours
order by day_of_week;

select min_distance_km, max_distance_km, fee, active
from public.delivery_fee_ranges
order by min_distance_km;

select id, name, sort_order, active, (banner_url <> '') as has_image
from public.categories
order by sort_order;
