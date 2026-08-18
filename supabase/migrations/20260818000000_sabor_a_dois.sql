-- Identidade inicial do Sabor a Dois e entrega externa configurável.
-- Migration incremental: preserva tabelas, políticas, buckets e dados existentes.

begin;

alter table public.app_settings
  add column if not exists own_delivery_limit_km numeric(8,2)
    check (own_delivery_limit_km is null or own_delivery_limit_km > 0),
  add column if not exists external_delivery_enabled boolean not null default false;

alter table public.orders
  add column if not exists external_delivery boolean not null default false;

update public.app_settings
set
  store_name = 'Sabor a Dois',
  store_description = 'Frango Assado & Acompanhamentos',
  pix_enabled = true,
  pix_key = '66.062.120/0001-21',
  pix_name = 'Taiana Santos',
  cash_enabled = true,
  credit_card_enabled = true,
  debit_card_enabled = true,
  theme_primary_color = '#ff5a1f',
  theme_secondary_color = '#ff8a3d',
  theme_background_color = '#080808',
  theme_surface_color = '#151515',
  theme_text_color = '#ffffff',
  store_latitude = coalesce(store_latitude, -22.9900000),
  store_longitude = coalesce(store_longitude, -43.5860000),
  maximum_delivery_distance_km = coalesce(maximum_delivery_distance_km, 5),
  own_delivery_limit_km = 5,
  external_delivery_enabled = true
where id = 'global' and not setup_completed;

insert into public.categories (id, name, description, banner_url, sort_order, active)
values
  ('frangos', 'Frangos', 'Frangos assados preparados com carinho.', '', 1, true),
  ('porcoes-extras', 'Porções extras', 'Acompanhamentos para completar seu pedido.', '', 2, true),
  ('bebidas', 'Bebidas', 'Bebidas para acompanhar sua refeição.', '', 3, true)
on conflict (id) do nothing;

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
  v_external_delivery boolean := false;
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

    if v_settings.external_delivery_enabled
       and v_settings.own_delivery_limit_km is not null
       and v_distance > v_settings.own_delivery_limit_km then
      v_external_delivery := true;
      v_delivery_fee := 0;
    else
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
  end if;

  if v_payment_method in ('credito', 'debito') then
    v_card_fee := round((v_subtotal + v_delivery_fee) * v_settings.card_fee_percent / 100, 2);
  end if;
  v_total := v_subtotal + v_delivery_fee + v_card_fee;

  insert into public.orders (
    customer_name, customer_phone, address, reference, delivery_type,
    customer_latitude, customer_longitude, distance_km, external_delivery,
    payment_method, needs_change, change_for, notes,
    subtotal, delivery_fee, card_fee, total
  ) values (
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    nullif(trim(p_order->>'address'), ''), nullif(trim(p_order->>'reference'), ''), v_delivery_type,
    v_latitude, v_longitude, v_distance, v_external_delivery,
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
    'external_delivery', v_external_delivery,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'card_fee', v_card_fee,
    'total', v_total
  );
end;
$$;

commit;
