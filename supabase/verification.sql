-- Verificação somente de leitura para executar após todas as migrations.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'products', 'categories', 'business_hours', 'delivery_fee_ranges',
    'app_settings', 'app_admins', 'orders', 'order_items'
  )
order by table_name;

select day_of_week, is_open, opening_time, closing_time
from public.business_hours
order by day_of_week;

select
  id,
  setup_completed,
  store_name,
  whatsapp_number,
  store_latitude,
  store_longitude,
  maximum_delivery_distance_km,
  own_delivery_limit_km,
  external_delivery_enabled,
  minimum_order_value
from public.app_settings
where id = 'global';

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('product-images', 'category-images', 'brand-images')
order by id;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename in (
  'products', 'categories', 'business_hours', 'delivery_fee_ranges',
  'app_settings', 'app_admins', 'orders', 'order_items'
)) or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  has_table_privilege('anon', 'public.products', 'SELECT') as anon_reads_products,
  has_table_privilege('anon', 'public.products', 'INSERT') as anon_inserts_products,
  has_table_privilege('authenticated', 'public.products', 'UPDATE') as authenticated_has_update_grant;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('is_admin', 'is_business_open', 'haversine_distance_km', 'place_order')
order by routine_name;

select id, name, sort_order, active
from public.categories
order by sort_order;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name = 'external_delivery';

-- Resultado inicial esperado:
-- 8 tabelas, 7 dias fechados, app_settings.setup_completed=false,
-- 3 buckets, 3 categorias iniciais, nenhum produto e nenhum pedido.
