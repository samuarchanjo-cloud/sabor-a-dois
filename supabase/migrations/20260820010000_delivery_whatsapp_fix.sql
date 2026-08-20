begin;

update public.app_settings
set whatsapp_number = '55' || regexp_replace(whatsapp_number, '\D', '', 'g')
where id = 'global'
  and length(regexp_replace(whatsapp_number, '\D', '', 'g')) in (10, 11);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.place_order(jsonb)'::regprocedure)
  into function_definition;

  if position('if v_distance < 1 then' in function_definition) > 0 then
    execute replace(
      function_definition,
      'if v_distance < 1 then',
      'if v_distance <= 1 then'
    );
  elsif position('if v_distance <= 1 then' in function_definition) = 0 then
    raise exception 'A regra de distância esperada não foi encontrada em public.place_order(jsonb).';
  end if;
end;
$$;

commit;
