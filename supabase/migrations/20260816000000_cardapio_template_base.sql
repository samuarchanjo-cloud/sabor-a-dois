-- Base reproduzível para um cardápio digital novo.
-- Execute somente em um projeto Supabase novo ou vazio.

begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.categories (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  banner_url text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  category text not null references public.categories(id) on update cascade on delete restrict,
  image_url text not null default '',
  status text not null default 'Disponível',
  visible boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  is_open boolean not null default false,
  opening_time time,
  closing_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_times_required check (
    (not is_open) or (opening_time is not null and closing_time is not null)
  )
);

insert into public.business_hours (day_of_week, is_open)
select day, false from generate_series(0, 6) as day;

create table public.delivery_fee_ranges (
  id uuid primary key default gen_random_uuid(),
  min_distance_km numeric(8,2) not null check (min_distance_km >= 1),
  max_distance_km numeric(8,2) not null,
  fee numeric(10,2) not null check (fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_range_order check (min_distance_km <= max_distance_km),
  constraint delivery_fee_ranges_no_overlap
    exclude using gist (numrange(min_distance_km, max_distance_km, '[]') with &&) where (active)
);

create table public.app_settings (
  id text primary key default 'global' check (id = 'global'),
  setup_completed boolean not null default false,
  store_name text not null default 'Meu estabelecimento',
  store_description text not null default '',
  whatsapp_number text not null default '',
  pix_enabled boolean not null default false,
  pix_key text not null default '',
  pix_name text not null default '',
  pix_qr_code_url text not null default '',
  cash_enabled boolean not null default false,
  credit_card_enabled boolean not null default false,
  debit_card_enabled boolean not null default false,
  brand_logo_url text not null default '',
  brand_hero_url text not null default '',
  theme_primary_color text not null default '#c50e0c' check (theme_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme_secondary_color text not null default '#ffc107' check (theme_secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme_background_color text not null default '#050505' check (theme_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme_surface_color text not null default '#121212' check (theme_surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme_text_color text not null default '#ffffff' check (theme_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone text not null default 'America/Sao_Paulo',
  store_postal_code text not null default '',
  store_street text not null default '',
  store_number text not null default '',
  store_complement text not null default '',
  store_neighborhood text not null default '',
  store_city text not null default '',
  store_state text not null default '',
  store_latitude numeric(10,7) check (store_latitude is null or store_latitude between -90 and 90),
  store_longitude numeric(10,7) check (store_longitude is null or store_longitude between -180 and 180),
  below_one_km_behavior text not null default 'blocked'
    check (below_one_km_behavior in ('free', 'fixed', 'blocked')),
  below_one_km_fee numeric(10,2) check (below_one_km_fee is null or below_one_km_fee >= 0),
  maximum_delivery_distance_km numeric(8,2)
    check (maximum_delivery_distance_km is null or maximum_delivery_distance_km > 0),
  minimum_order_value numeric(10,2) not null default 0 check (minimum_order_value >= 0),
  card_fee_percent numeric(6,2) not null default 0 check (card_fee_percent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint below_one_km_fixed_fee_required check (
    below_one_km_behavior <> 'fixed' or below_one_km_fee is not null
  ),
  constraint store_coordinates_together check (
    (store_latitude is null and store_longitude is null)
    or (store_latitude is not null and store_longitude is not null)
  )
);

insert into public.app_settings (id) values ('global');

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  address text,
  reference text,
  delivery_type text not null check (delivery_type in ('entrega', 'retirada')),
  customer_latitude numeric(10,7),
  customer_longitude numeric(10,7),
  distance_km numeric(8,2),
  payment_method text not null check (payment_method in ('pix', 'dinheiro', 'credito', 'debito')),
  needs_change boolean not null default false,
  change_for text,
  notes text,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  card_fee numeric(10,2) not null default 0 check (card_fee >= 0),
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'novo'
    check (status in ('novo', 'confirmado', 'preparando', 'saiu_para_entrega', 'concluido', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text,
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 50),
  line_total numeric(10,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index products_category_sort_idx on public.products(category, sort_order, name);
create index products_public_idx on public.products(visible, status);
create index categories_active_sort_idx on public.categories(active, sort_order);
create index delivery_fee_ranges_active_idx on public.delivery_fee_ranges(active, min_distance_km, max_distance_km);
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status, created_at desc);
create index order_items_order_id_idx on public.order_items(order_id);

create or replace function public.is_business_open(p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_local timestamp;
  v_day integer;
  v_time time;
  v_today public.business_hours%rowtype;
  v_yesterday public.business_hours%rowtype;
begin
  select timezone into v_timezone from public.app_settings where id = 'global';
  v_local := p_at at time zone coalesce(v_timezone, 'America/Sao_Paulo');
  v_day := extract(dow from v_local)::integer;
  v_time := v_local::time;

  select * into v_today from public.business_hours where day_of_week = v_day;
  if found and v_today.is_open then
    if v_today.opening_time = v_today.closing_time then return true; end if;
    if v_today.closing_time > v_today.opening_time
       and v_time >= v_today.opening_time and v_time < v_today.closing_time then return true; end if;
    if v_today.closing_time < v_today.opening_time and v_time >= v_today.opening_time then return true; end if;
  end if;

  select * into v_yesterday from public.business_hours where day_of_week = ((v_day + 6) % 7);
  return found and v_yesterday.is_open
    and v_yesterday.closing_time < v_yesterday.opening_time
    and v_time < v_yesterday.closing_time;
end;
$$;

create or replace function public.haversine_distance_km(
  p_latitude_1 numeric, p_longitude_1 numeric,
  p_latitude_2 numeric, p_longitude_2 numeric
)
returns numeric
language sql
immutable
strict
set search_path = public
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians((p_latitude_2 - p_latitude_1) / 2)), 2) +
    cos(radians(p_latitude_1)) * cos(radians(p_latitude_2)) *
    power(sin(radians((p_longitude_2 - p_longitude_1) / 2)), 2)
  ));
$$;

create or replace function public.place_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.app_settings%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_quantity integer;
  v_subtotal numeric(10,2) := 0;
  v_delivery_fee numeric(10,2) := 0;
  v_card_fee numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_distance numeric(8,2);
  v_order_id uuid;
  v_delivery_type text := p_order->>'delivery_type';
  v_payment_method text := p_order->>'payment_method';
  v_latitude numeric;
  v_longitude numeric;
  v_payment_enabled boolean := false;
begin
  select * into strict v_settings from public.app_settings where id = 'global';
  if not v_settings.setup_completed then raise exception 'SETUP_INCOMPLETE'; end if;
  if not public.is_business_open(now()) then raise exception 'STORE_CLOSED'; end if;
  if jsonb_typeof(p_order->'items') <> 'array' or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  if length(trim(coalesce(p_order->>'customer_name', ''))) < 2
     or length(trim(coalesce(p_order->>'customer_phone', ''))) < 8 then
    raise exception 'INVALID_CUSTOMER';
  end if;
  if v_delivery_type not in ('entrega', 'retirada') then raise exception 'INVALID_DELIVERY_TYPE'; end if;
  if v_payment_method not in ('pix', 'dinheiro', 'credito', 'debito') then raise exception 'INVALID_PAYMENT'; end if;

  v_payment_enabled := case v_payment_method
    when 'pix' then v_settings.pix_enabled
    when 'dinheiro' then v_settings.cash_enabled
    when 'credito' then v_settings.credit_card_enabled
    when 'debito' then v_settings.debit_card_enabled
    else false
  end;
  if not v_payment_enabled then raise exception 'PAYMENT_DISABLED'; end if;

  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    begin
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_QUANTITY';
    end;
    if v_quantity < 1 or v_quantity > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products where id = v_item->>'product_id';
    if not found or not v_product.visible
       or lower(trim(v_product.status)) not in ('disponível', 'disponivel') then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_item->>'product_id';
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_quantity);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'unit_price', v_product.price,
      'quantity', v_quantity,
      'line_total', v_product.price * v_quantity
    ));
  end loop;

  if v_subtotal < v_settings.minimum_order_value then raise exception 'MINIMUM_ORDER_NOT_REACHED'; end if;

  if v_delivery_type = 'entrega' then
    if length(trim(coalesce(p_order->>'address', ''))) < 5 then raise exception 'INVALID_ADDRESS'; end if;
    if v_settings.store_latitude is null or v_settings.store_longitude is null then raise exception 'DELIVERY_NOT_CONFIGURED'; end if;
    begin
      v_latitude := (p_order->>'latitude')::numeric;
      v_longitude := (p_order->>'longitude')::numeric;
    exception when others then
      raise exception 'LOCATION_REQUIRED';
    end;
    if v_latitude is null or v_longitude is null
       or v_latitude not between -90 and 90 or v_longitude not between -180 and 180 then
      raise exception 'LOCATION_REQUIRED';
    end if;
    v_distance := round(public.haversine_distance_km(
      v_settings.store_latitude, v_settings.store_longitude, v_latitude, v_longitude
    ), 2);
    if v_settings.maximum_delivery_distance_km is null then raise exception 'DELIVERY_NOT_CONFIGURED'; end if;
    if v_distance > v_settings.maximum_delivery_distance_km then raise exception 'OUTSIDE_DELIVERY_AREA'; end if;

    if v_distance < 1 then
      if v_settings.below_one_km_behavior = 'blocked' then raise exception 'BELOW_ONE_KM_BLOCKED'; end if;
      if v_settings.below_one_km_behavior = 'fixed' then
        if v_settings.below_one_km_fee is null then raise exception 'DELIVERY_NOT_CONFIGURED'; end if;
        v_delivery_fee := v_settings.below_one_km_fee;
      else
        v_delivery_fee := 0;
      end if;
    else
      select fee into v_delivery_fee
      from public.delivery_fee_ranges
      where active and v_distance between min_distance_km and max_distance_km
      order by min_distance_km
      limit 1;
      if not found then raise exception 'NO_DELIVERY_RANGE'; end if;
    end if;
  end if;

  if v_payment_method in ('credito', 'debito') then
    v_card_fee := round((v_subtotal + v_delivery_fee) * v_settings.card_fee_percent / 100, 2);
  end if;
  v_total := v_subtotal + v_delivery_fee + v_card_fee;

  insert into public.orders (
    customer_name, customer_phone, address, reference, delivery_type,
    customer_latitude, customer_longitude, distance_km,
    payment_method, needs_change, change_for, notes,
    subtotal, delivery_fee, card_fee, total
  ) values (
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    nullif(trim(p_order->>'address'), ''), nullif(trim(p_order->>'reference'), ''), v_delivery_type,
    v_latitude, v_longitude, v_distance,
    v_payment_method, coalesce((p_order->>'needs_change')::boolean, false),
    nullif(trim(p_order->>'change_for'), ''), nullif(trim(p_order->>'notes'), ''),
    v_subtotal, v_delivery_fee, v_card_fee, v_total
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
    values (
      v_order_id, v_item->>'product_id', v_item->>'name',
      (v_item->>'unit_price')::numeric, (v_item->>'quantity')::integer, (v_item->>'line_total')::numeric
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'items', v_items,
    'distance_km', v_distance,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'card_fee', v_card_fee,
    'total', v_total
  );
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['categories','products','business_hours','delivery_fee_ranges','app_settings','orders'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'set_' || v_table || '_updated_at', v_table
    );
  end loop;
end $$;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.business_hours enable row level security;
alter table public.delivery_fee_ranges enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_admins enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy products_public_read on public.products for select to anon, authenticated
  using (visible or public.is_admin());
create policy products_admin_write on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy categories_public_read on public.categories for select to anon, authenticated
  using (active or public.is_admin());
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy business_hours_public_read on public.business_hours for select to anon, authenticated using (true);
create policy business_hours_admin_write on public.business_hours for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy delivery_ranges_public_read on public.delivery_fee_ranges for select to anon, authenticated
  using (active or public.is_admin());
create policy delivery_ranges_admin_write on public.delivery_fee_ranges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy app_settings_public_read on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy app_admins_read_self on public.app_admins for select to authenticated
  using (user_id = auth.uid());
create policy orders_admin_read on public.orders for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy order_items_admin_read on public.order_items for select to authenticated using (public.is_admin());

grant select on public.products, public.categories, public.business_hours, public.delivery_fee_ranges, public.app_settings
  to anon, authenticated;
grant insert, update, delete on public.products, public.categories, public.business_hours, public.delivery_fee_ranges, public.app_settings
  to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('category-images', 'category-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('brand-images', 'brand-images', true, 5242880, array['image/jpeg','image/png','image/webp']);

create policy menu_images_public_read on storage.objects for select to anon, authenticated
  using (bucket_id in ('product-images', 'category-images', 'brand-images'));
create policy menu_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'category-images', 'brand-images') and public.is_admin());
create policy menu_images_admin_update on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'category-images', 'brand-images') and public.is_admin())
  with check (bucket_id in ('product-images', 'category-images', 'brand-images') and public.is_admin());
create policy menu_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'category-images', 'brand-images') and public.is_admin());

revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.is_business_open(timestamptz) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['products','categories','business_hours','delivery_fee_ranges','app_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

commit;

-- Após criar o usuário em Authentication > Users, execute separadamente:
-- insert into public.app_admins (user_id) values ('UUID-DO-USUARIO-ADMIN');
