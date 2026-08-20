-- Carga idempotente dos produtos iniciais do Sabor a Dois.
-- Não altera configurações, categorias, horários, entrega, pagamentos ou mídias existentes.

begin;

do $$
declare
  v_product jsonb;
  v_existing_id text;
  v_candidate_id text;
  v_suffix integer;
begin
  if not exists (select 1 from public.categories where id = 'frangos')
     or not exists (select 1 from public.categories where id = 'porcoes-extras')
     or not exists (select 1 from public.categories where id = 'bebidas') then
    raise exception 'CATEGORIES_REQUIRED_FOR_PRODUCT_SEED';
  end if;

  for v_product in
    select value from jsonb_array_elements(
      '[
        {"id":"frango-assado-com-farofa","name":"Frango Assado com Farofa","description":"Frango assado acompanhado de farofa.","price":32.00,"category":"frangos","sort_order":1},
        {"id":"frango-assado-com-batata-e-farofa","name":"Frango Assado com Batata e Farofa","description":"Frango assado acompanhado de batata e farofa.","price":36.00,"category":"frangos","sort_order":2},
        {"id":"frango-assado-com-linguica-e-farofa","name":"Frango Assado com Linguiça e Farofa","description":"Frango assado acompanhado de linguiça e farofa.","price":37.00,"category":"frangos","sort_order":3},
        {"id":"frango-assado-com-linguica-batata-e-farofa","name":"Frango Assado com Linguiça, Batata e Farofa","description":"Frango assado acompanhado de linguiça, batata e farofa.","price":39.99,"category":"frangos","sort_order":4},
        {"id":"arroz","name":"Arroz","description":"Porção de arroz.","price":14.00,"category":"porcoes-extras","sort_order":1},
        {"id":"salpicao","name":"Salpicão","description":"Porção de salpicão, aproximadamente 400 g.","price":18.00,"category":"porcoes-extras","sort_order":2},
        {"id":"maionese","name":"Maionese","description":"Porção de maionese, aproximadamente 400 g.","price":12.00,"category":"porcoes-extras","sort_order":3},
        {"id":"macarronese","name":"Macarronese","description":"Porção de macarronese.","price":15.00,"category":"porcoes-extras","sort_order":4},
        {"id":"coca-cola-2l","name":"Coca-Cola 2L","description":"Refrigerante Coca-Cola, garrafa de 2 litros.","price":13.00,"category":"bebidas","sort_order":1},
        {"id":"coca-cola-zero-2l","name":"Coca-Cola Zero 2L","description":"Refrigerante Coca-Cola Zero Açúcar, garrafa de 2 litros.","price":13.00,"category":"bebidas","sort_order":2},
        {"id":"fanta","name":"Fanta","description":"Refrigerante Fanta.","price":10.00,"category":"bebidas","sort_order":3},
        {"id":"convencao-guarana","name":"Convenção / Guaraná","description":"Refrigerante Convenção sabor guaraná.","price":7.00,"category":"bebidas","sort_order":4}
      ]'::jsonb
    )
  loop
    select id into v_existing_id
    from public.products
    where lower(trim(name)) = lower(trim(v_product->>'name'))
    order by created_at
    limit 1;

    if found then
      update public.products
      set
        name = v_product->>'name',
        description = v_product->>'description',
        price = (v_product->>'price')::numeric,
        category = v_product->>'category',
        sort_order = (v_product->>'sort_order')::integer
      where id = v_existing_id;
    else
      v_candidate_id := v_product->>'id';
      v_suffix := 2;
      while exists (select 1 from public.products where id = v_candidate_id) loop
        v_candidate_id := (v_product->>'id') || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      end loop;

      insert into public.products (
        id, name, description, price, category, image_url,
        status, visible, featured, sort_order
      ) values (
        v_candidate_id,
        v_product->>'name',
        v_product->>'description',
        (v_product->>'price')::numeric,
        v_product->>'category',
        '',
        'Disponível',
        true,
        false,
        (v_product->>'sort_order')::integer
      );
    end if;
  end loop;
end;
$$;

commit;
