# Controle de acesso por shopping

## Regra funcional

| Perfil | Escopo de dados |
| --- | --- |
| `MESTRE` | Todos os shoppings |
| `GERENTE_CSC` | Todos os shoppings |
| `GERENTE_SHOPPING` | Somente os shoppings vinculados ao usuario |

O escopo e uma regra de autorizacao de dados, independente das permissoes de modulo. Um perfil pode ter permissao para abrir o modulo de faturamento e, ainda assim, enxergar somente as linhas dos shoppings autorizados.

## Situacao confirmada

O usuario Victor Dsilar Moreira, ID `4`, esta ativo com o perfil `GERENTE_SHOPPING` e possui os seguintes vinculos:

- `31` - BH Outlet
- `32` - BH Outlet - Portal Sul

Os vinculos estao corretos. O acesso indevido acontece porque as rotas de faturamento ainda nao aplicam `portal_usuario_shopping` como filtro de autorizacao.

## Alteracoes por tabela

### `portal_usuarios`

Alteracao estrutural obrigatoria: nenhuma.

O campo `perfil` ja fornece a informacao necessaria. A aplicacao deve considerar `MESTRE` e `GERENTE_CSC` como perfis de escopo total e `GERENTE_SHOPPING` como perfil restrito.

Ao trocar o perfil de um usuario para `GERENTE_SHOPPING`, o cadastro deve exigir pelo menos um shopping. Mesmo com essa validacao, a API deve falhar de forma fechada caso um usuario restrito fique sem vinculos.

### `portal_usuario_shopping`

Alteracao de dados obrigatoria para o Victor: nenhuma. Os dois vinculos ja existem.

Esta e a tabela que deve definir o escopo de dados. No modelo atualmente utilizado pela aplicacao:

- `usuario_id` identifica o usuario;
- `coligada_totvs` contem, apesar do nome, o valor de `gbi_shopping.num_shopping`;
- a combinacao `usuario_id, coligada_totvs` ja possui indice unico.

Toda consulta de autorizacao deve selecionar `coligada_totvs` pelo `usuario_id` autenticado. Para `GERENTE_SHOPPING`, ausencia de linhas significa ausencia de acesso.

A tabela tambem possui o campo legado `shopping_id`, relacionado a `portal_shoppings`. Ele nao e preenchido pelo fluxo atual e nao deve ser usado por novas funcionalidades.

#### Limpeza estrutural recomendada

A limpeza abaixo e recomendada, mas deve ser executada como uma migracao separada depois que todo o codigo estiver usando o mesmo identificador:

1. Criar uma coluna canonica `num_shopping bigint`.
2. Preencher `num_shopping` a partir de `coligada_totvs`.
3. Alterar a aplicacao para ler e gravar `num_shopping`.
4. Tornar `num_shopping` obrigatorio.
5. Criar unicidade para `usuario_id, num_shopping`.
6. Alterar a chave estrangeira de `usuario_id` para `ON DELETE CASCADE`.
7. Depois da validacao e implantacao, remover os campos legados `shopping_id` e `coligada_totvs` e seus indices antigos.

Essa limpeza nao e pre-requisito para corrigir o acesso: a restricao pode e deve ser implementada usando `coligada_totvs` imediatamente.

### `portal_permissoes`

Alteracao estrutural obrigatoria: nenhuma.

Esta tabela controla a permissao por modulo (`pode_visualizar`, `pode_criar`, `pode_editar` e `pode_excluir`). Ela nao substitui o escopo por shopping. O perfil `GERENTE_SHOPPING` pode ter `pode_visualizar = true` para faturamento, mas as linhas retornadas devem continuar limitadas por `portal_usuario_shopping`.

### `gbi_shopping`

Alteracao de dados obrigatoria: nenhuma. Os IDs `31` e `32` existem, e nao foram encontrados `num_shopping` duplicados.

Esta tabela fornece o cadastro e o nome dos shoppings. No modelo atual, `gbi_shopping.num_shopping::text` deve ser comparado com `portal_usuario_shopping.coligada_totvs`.

Caso seja executada a limpeza estrutural de `portal_usuario_shopping`, deve-se avaliar uma restricao `UNIQUE` em `gbi_shopping.num_shopping` antes de criar uma chave estrangeira para essa coluna. Como `gbi_shopping` pode ser abastecida por ETL, essa alteracao deve ser validada com o processo de carga antes de ser aplicada.

### Tabelas de negocio, incluindo `gshop_contas`

Alteracao estrutural obrigatoria: nenhuma.

As consultas devem restringir o campo que representa o shopping. Em faturamento, o campo e `gshop_contas.idfilial`. Para usuarios restritos, ele deve pertencer ao conjunto autorizado antes que os dados sejam agregados, resumidos, paginados ou exportados.

### `portal_shoppings`

Alteracao obrigatoria: nenhuma.

Esta tabela aparece apenas na chave estrangeira do campo legado `portal_usuario_shopping.shopping_id`. O fluxo atual usa `gbi_shopping`; portanto, novas funcionalidades nao devem introduzir dependencia em `portal_shoppings` para autorizacao.

## Alteracoes obrigatorias na aplicacao

1. Criar uma unica funcao ou middleware que obtenha o escopo pelo usuario autenticado.
2. Retornar escopo total apenas para `MESTRE` e `GERENTE_CSC`.
3. Para `GERENTE_SHOPPING`, consultar os IDs em `portal_usuario_shopping` pelo `req.user.id`.
4. Aplicar o escopo aos filtros, ao relatorio, a exportacao e a geracao de tabelas de faturamento.
5. Validar os shoppings enviados pelo cliente contra o escopo. Um ID enviado manualmente nao concede acesso.
6. Aplicar o escopo ao cache antes de agregacao, resumo, paginacao e exportacao.
7. Manter a interface limitada aos shoppings autorizados, como reforco de experiencia, sem depender dela para seguranca.

## Comportamento esperado das requisicoes

- Usuario com escopo total e sem filtro de shopping: retorna todos os shoppings.
- Usuario restrito e sem filtro de shopping: retorna todos e somente os seus shoppings autorizados.
- Usuario restrito solicitando IDs autorizados: retorna somente os IDs solicitados e autorizados.
- Usuario restrito misturando IDs autorizados e nao autorizados: o servidor usa somente a intersecao autorizada ou responde `403`, conforme o contrato do endpoint.
- Usuario restrito solicitando somente IDs nao autorizados: retorna `403` ou nenhum dado, nunca dados de outro shopping.
- Usuario restrito sem vinculos: retorna `403` ou nenhum dado, nunca acesso total.

## Criterios minimos de aceite

- Victor visualiza apenas os shoppings `31` e `32` nos filtros e resultados.
- Lojas, contratos, totais e indicadores sao derivados apenas desses shoppings.
- O relatorio e os dois formatos de Excel nao incluem outros shoppings.
- Alterar o parametro `shopping` manualmente nao contorna a restricao.
- `MESTRE` e `GERENTE_CSC` continuam visualizando todos os shoppings.
- A alteracao dos vinculos pela administracao passa a valer nas requisicoes seguintes.
