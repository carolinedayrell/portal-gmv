# Regras obrigatorias do Portal GMV

## Controle de acesso por shopping

- Somente os perfis `MESTRE` e `GERENTE_CSC` podem visualizar dados de todos os shoppings.
- O perfil `GERENTE_SHOPPING` pode visualizar exclusivamente os shoppings vinculados ao usuario em `portal_usuario_shopping`.
- Enquanto o modelo atual estiver em uso, o identificador autorizado e `portal_usuario_shopping.coligada_totvs`, comparado como texto com `gbi_shopping.num_shopping` e com o campo de shopping das tabelas de negocio, como `gshop_contas.idfilial`.
- Um `GERENTE_SHOPPING` sem vinculos deve receber uma resposta sem dados ou erro de acesso; nunca deve receber acesso geral. A regra deve falhar de forma fechada.
- A autorizacao deve ser aplicada no servidor. Esconder opcoes na interface nao e controle de acesso.
- Todo endpoint novo ou alterado que leia dados por shopping deve aplicar o escopo antes de agregar, paginar ou retornar dados. Isso inclui filtros, buscas, indicadores, relatorios, dashboards, detalhes, exportacoes, arquivos, tarefas em segundo plano e dados obtidos de cache.
- IDs de shopping recebidos por URL, query string ou corpo da requisicao nunca sao confiaveis. Para usuarios restritos, use somente a intersecao entre os IDs solicitados e os IDs autorizados.
- O cache pode conter dados globais, mas a resposta de cada usuario deve ser filtrada pelo seu escopo antes de qualquer agregacao, resumo, paginacao ou exportacao.
- Os vinculos devem ser consultados pelo `req.user.id` no banco para que alteracoes administrativas tenham efeito sem depender da renovacao do token.
- Alteracoes de usuario e de seus vinculos devem permanecer transacionais.
- Toda funcionalidade por shopping deve testar, no minimo: acesso total de `MESTRE`; acesso total de `GERENTE_CSC`; acesso somente aos vinculos de `GERENTE_SHOPPING`; tentativa de informar um shopping nao autorizado; e usuario restrito sem vinculos.

Consulte `docs/controle-acesso-por-shopping.md` antes de criar ou alterar funcionalidades que trabalhem com dados de shopping.
