# Template de cardápio digital

Esta pasta é uma cópia independente e reutilizável. O projeto original na pasta-pai não precisa ser alterado para criar novos cardápios.

## Para criar um novo cardápio

### 1. Duplicar o projeto

Copie somente esta pasta para um repositório novo. Não copie `.env`, `node_modules`, `dist` nem configurações `.vercel` de outro estabelecimento.

```bash
npm ci
```

### 2. Criar um projeto Supabase novo

No painel do Supabase, crie um projeto exclusivo para o estabelecimento. Não reutilize o projeto, banco, Auth ou Storage de outra loja.

### 3. Executar as migrations

Opção simples: abra **SQL Editor** e execute integralmente `supabase/migrations/20260816000000_cardapio_template_base.sql`.

Opção pela CLI:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref SEU_PROJECT_REF
npx supabase@latest db push
```

Depois execute `supabase/verification.sql`. O arquivo em `supabase/legacy/` é histórico e não deve ser aplicado.

### 4. Conferir os buckets

A migration cria automaticamente:

- `product-images` para produtos;
- `category-images` para banners de categorias;
- `brand-images` para logo, capa e QR Code Pix.

Todos são públicos para leitura, limitados a 5 MB e aceitam JPG, PNG e WEBP. As policies permitem escrita somente a usuários listados em `app_admins`.

### 5. Configurar o ambiente

Copie `.env.example` para `.env.local` e preencha apenas:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
```

Use a chave pública `anon`/publishable. Nunca coloque `service_role`, senha do banco, access token ou secrets reais no repositório.

### 6. Criar o primeiro administrador

Em **Authentication > Users**, crie um usuário com e-mail e senha, copie o UUID e execute no SQL Editor:

```sql
insert into public.app_admins (user_id)
values ('UUID-DO-USUARIO-ADMIN');
```

Se não quiser cadastro público, mantenha desativada a criação aberta de contas no provedor Email.

### 7. Fazer o deploy

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no provedor, rode `npm run build` e publique `dist/`. O `vercel.json` incluído redireciona `/admin` e demais caminhos para a SPA.

### 8. Acessar o admin

Abra `https://SEU-DOMINIO/admin` e entre com o usuário criado no passo 6. O botão **Admin** do menu inferior também continua disponível.

### 9. Realizar a configuração inicial

Na visão geral, complete a checklist pelo celular:

1. Estabelecimento: nome, descrição, logo, capa e WhatsApp.
2. Aparência: cores do tema.
3. Endereço: CEP e número; o painel usa ViaCEP e a cadeia existente de geocodificação para obter as coordenadas.
4. Entrega: pedido mínimo, raio máximo, regra abaixo de 1 km e faixas de taxa.
5. Funcionamento: dias e horários.
6. Pagamento: habilite as opções aceitas e configure Pix/cartões.
7. Categorias: crie, ordene, ative e envie banners.
8. Produtos: crie, ordene, ative e envie fotos.

Quando todas as etapas estiverem completas, toque em **Concluir configuração**. Até lá, o cardápio exibe um estado neutro e o RPC recusa pedidos.

### 10. O que não compartilhar

Cada estabelecimento precisa de projeto Supabase, usuários Auth, linha `app_settings`, pedidos, buckets, variáveis de ambiente, domínio e projeto de deploy próprios. Não compartilhe `.env.local`, cookies/sessões, `app_admins`, dados de clientes, chaves Pix ou arquivos de Storage.

## Lógica preservada

- carrinho no navegador e checkout transacional;
- ViaCEP para preenchimento do CEP;
- Nominatim com validação exata/aproximada, rate limit, cache e cancelamento;
- fallback de coordenadas por AwesomeAPI CEP;
- Haversine no cliente e recálculo no banco;
- faixas de entrega, horário inclusive atravessando meia-noite, Pix, WhatsApp e taxa de cartão;
- Supabase Auth, RLS, Storage e Realtime.

## Checklist de independência

- [ ] O repositório novo não contém `.env.local` de outro estabelecimento.
- [ ] `VITE_SUPABASE_URL` aponta para o projeto novo.
- [ ] A chave pública pertence ao projeto novo.
- [ ] A migration-base foi aplicada e `verification.sql` passou.
- [ ] O administrador pertence ao Auth novo e está em `app_admins`.
- [ ] Nome, WhatsApp, Pix, endereço e coordenadas foram preenchidos no admin.
- [ ] Logo, capa, banners e produtos estão nos buckets novos.
- [ ] Horários, pedido mínimo, raio e taxas foram revisados.
- [ ] Formas de pagamento foram habilitadas conscientemente.
- [ ] Um pedido de teste foi salvo no banco novo e abriu o WhatsApp correto.
- [ ] O domínio/deploy não reutiliza variáveis ou integrações do estabelecimento original.
- [ ] A busca global por nomes, telefones, Pix, URLs e coordenadas do estabelecimento anterior não encontra referências ativas. Referências na pasta `supabase/legacy/` são apenas histórico não executável.
