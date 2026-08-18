# Configuração Sabor a Dois

Este projeto preserva a infraestrutura do `cardapio_template` e acrescenta a identidade visual e as regras iniciais do Sabor a Dois.

## Banco de dados

Em um Supabase novo, aplique as migrations na ordem:

1. `supabase/migrations/20260816000000_cardapio_template_base.sql`
2. `supabase/migrations/20260818000000_sabor_a_dois.sql`
3. `supabase/verification.sql`

A segunda migration:

- configura nome, descrição, tema preto/laranja, Pix e formas de pagamento;
- cadastra as categorias iniciais Frangos, Porções extras e Bebidas;
- usa as coordenadas aproximadas `-22.990, -43.586` apenas como valor inicial;
- adiciona limite de entrega própria de 5 km e entrega externa acima do limite;
- mantém tudo editável no Admin.

O endereço completo do estabelecimento ainda deve ser informado e validado na seção **Endereço** do Admin. A geocodificação desse endereço substitui as coordenadas aproximadas e continua sendo a fonte operacional do cálculo.

Logo, capa, banners de categoria e fotos de produto começam sem URL fixa. Envie as mídias reais pelo Admin para armazená-las nos buckets do Supabase Storage; os arquivos de referência não são cadastrados como produtos ou banners permanentes.

## Produtos em “Mais pedidos”

Produtos marcados como **Produto destacado** no Admin aparecem primeiro na seção. Enquanto nenhum destaque estiver configurado, a Home usa os primeiros produtos ativos e disponíveis, sem inventar vendas ou pedidos.

## Entrega acima do limite

Com **Acima do limite: entrega externa por conta do cliente** habilitado, distâncias reais acima do limite configurado:

- não recebem taxa convencional;
- exibem a orientação de solicitação do Uber pelo cliente;
- podem prosseguir ao checkout;
- são revalidadas no RPC `place_order`;
- ficam identificadas em `orders.external_delivery` e na mensagem do WhatsApp.

Se o modo for desabilitado, volta a valer a distância máxima convencional e o bloqueio fora da área.
