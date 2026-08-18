# Supabase do template

Use um projeto Supabase novo para cada estabelecimento. A migration em `migrations/20260816000000_cardapio_template_base.sql` cria toda a infraestrutura em um banco vazio. Em seguida, `migrations/20260818000000_sabor_a_dois.sql` aplica a identidade inicial e a regra configurável de entrega externa deste projeto:

- tabelas `products`, `categories`, `business_hours`, `delivery_fee_ranges`, `app_settings`, `app_admins`, `orders` e `order_items`;
- índices, relacionamentos, constraints e triggers de `updated_at`;
- funções `is_admin`, `is_business_open`, `haversine_distance_km` e `place_order`;
- RLS, policies, grants e publicação Realtime;
- buckets `product-images`, `category-images` e `brand-images`.
- configuração `own_delivery_limit_km` e modo `external_delivery_enabled`;
- identificação de pedidos cuja entrega deverá ser solicitada pelo cliente.

Os buckets são públicos apenas para leitura. Upload, alteração e exclusão exigem uma sessão autenticada cujo UUID esteja em `app_admins`. Cada arquivo aceita JPG, PNG ou WEBP até 5 MB.

## Aplicação

Pelo SQL Editor, execute todo o arquivo da migration. Com a CLI:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref SEU_PROJECT_REF
npx supabase@latest db push
```

Depois rode `verification.sql` no SQL Editor.

## Primeiro administrador

1. Crie o usuário em **Authentication > Users**.
2. Copie o UUID do usuário.
3. Execute:

```sql
insert into public.app_admins (user_id)
values ('UUID-DO-USUARIO-ADMIN');
```

O navegador usa somente a chave pública `anon`. Nunca exponha `service_role`, senha do banco ou access token em variáveis `VITE_*`.

## Histórico

`legacy/` contém a migration incremental do estabelecimento original somente para auditoria. Ela não integra a instalação do template e não deve ser executada em um banco novo.
