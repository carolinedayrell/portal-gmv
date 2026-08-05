Módulo de Vendas — Importação, histórico e relatório

1. Objetivo

O módulo de Vendas permitirá importar, validar, versionar, consultar e exportar vendas por Contrato e Período.

As informações oficiais de Shopping, LUC, Loja e ABL serão obtidas pelo Contrato. Shopping, Loja e ABL informados no arquivo serão preservados para auditoria e comparação, mas o relatório utilizará os valores oficiais encontrados no sistema.

Nenhuma importação com erro bloqueante poderá alterar dados de vendas.

2. Identificação do Contrato

O Contrato é o identificador obrigatório da venda.

Na base atual:

um Contrato identifica um único Shopping;

um Contrato pode possuir uma ou várias LUCs;

cada LUC possui sua própria ABL;

uma venda pertence ao Contrato e não deve ser duplicada entre suas LUCs.

Quando o Contrato possuir mais de uma LUC, o sistema deverá:

apresentar todas as LUCs encontradas;

apresentar a ABL de cada LUC;

calcular a ABL total do Contrato;

manter apenas uma venda para o Contrato;

impedir que a venda seja multiplicada pela quantidade de LUCs.

3. Campos do arquivo

O arquivo deverá possuir as seguintes colunas:

Campo

Obrigatoriedade

Regra

Período

Obrigatório

Competência da venda

Data

Condicional

Obrigatória para registros diários e vazia para mensais

Shopping

Obrigatório

Utilizado para conferência e autorização

Contrato

Obrigatório

Identificador principal

Loja

Opcional

Utilizada para conferência

ABL

Opcional

Utilizada para conferência

Canal

Obrigatório

LOJA_FISICA, ONLINE ou CONSOLIDADO

Vendas

Obrigatório

Valor monetário; zero é permitido

O Período será armazenado como o primeiro dia do mês, mas apresentado ao usuário no formato MM/AAAA.

A Data será armazenada como data completa.

4. Valores informados e valores do sistema

A importação deverá preservar:

Shopping informado;

Loja informada;

ABL informada;

Shopping encontrado no sistema;

LUCs encontradas no sistema;

Loja encontrada no sistema;

ABL de cada LUC;

ABL total encontrada no sistema.

O relatório utilizará os dados oficiais encontrados no momento da importação.

Esses dados deverão ser armazenados como fotografia histórica. Alterações posteriores no cadastro mestre não poderão modificar silenciosamente uma venda já importada.

5. Identificação da LUC

A LUC não faz parte do arquivo de importação e não é validada como dado informado.

O sistema localizará automaticamente todas as LUCs vinculadas ao Contrato e as apresentará na prévia.

A LUC não altera a unidade da venda. A venda continua pertencendo ao Contrato.

6. Validação da ABL

A ausência da ABL no arquivo não bloqueia a importação.

Quando o Contrato possuir somente uma LUC, a ABL informada será comparada com a ABL dessa LUC.

Quando o Contrato possuir várias LUCs, a ABL informada será comparada com a ABL total do Contrato.

Uma divergência de ABL não bloqueia a importação. A prévia deverá mostrar:

ABL informada;

ABL esperada;

LUCs e respectivas ABLs;

ABL total do Contrato.

O relatório utilizará a ABL oficial encontrada no sistema.

7. Validação do Shopping

O arquivo e a interface utilizarão os seguintes nomes padronizados:

| ID | Nome padronizado |
| --- | --- |
| 31 | BH OUTLET |
| 1 | OIAPOQUE BH |
| 13 | OIAPOQUE CONTAGEM |
| 3 | SÓ MARCAS CONTAGEM |
| 17 | SÓ MARCAS GUARULHOS |
| 8 | SHOPPING DO AVIÃO |

Os nomes antigos do cadastro serão aceitos como aliases durante a validação, mas a prévia e os relatórios exibirão o nome padronizado.

O Shopping informado será comparado com o Shopping encontrado pelo Contrato.

Se houver divergência:

o sistema registrará a discrepância;

o relatório utilizará o Shopping encontrado pelo Contrato;

a prévia mostrará os dois valores.

A autorização deverá ser verificada tanto para o Shopping informado quanto para o Shopping encontrado.

Se qualquer linha mencionar ou resultar em um Shopping não autorizado:

o arquivo inteiro será rejeitado;

nenhuma venda será inserida;

nenhuma venda será inativada;

a tentativa ficará registrada no histórico;

a resposta não deverá revelar dados adicionais do Shopping não autorizado.

8. Granularidade mensal

Uma venda mensal deverá possuir:

Período preenchido;

Data vazia;

Contrato;

Canal;

Vendas.

A chave de cobertura mensal será:

Contrato + Período + Canal.

Deverá existir somente uma cobertura ativa para essa combinação.

9. Granularidade diária

Uma venda diária deverá possuir:

Período preenchido;

Data preenchida;

Contrato;

Canal;

Vendas.

A Data deverá pertencer ao Período informado.

Para cada Contrato + Período + Canal diário:

todos os dias do mês deverão estar presentes;

cada dia deverá aparecer uma única vez;

dias sem vendas deverão possuir valor zero;

datas duplicadas serão erros bloqueantes;

datas ausentes serão erros bloqueantes.

A unidade de substituição diária continuará sendo o período completo do Contrato e Canal.

10. Canais de venda

Os canais permitidos serão:

LOJA_FISICA;

ONLINE;

CONSOLIDADO.

Vendas físicas e online são componentes independentes.

Para o mesmo Contrato e Período, poderá existir:

LOJA_FISICA diária e ONLINE mensal;

LOJA_FISICA mensal e ONLINE mensal;

LOJA_FISICA diária e ONLINE diária.

O canal CONSOLIDADO representa um valor que já contém todos os canais.

CONSOLIDADO não poderá coexistir com LOJA_FISICA ou ONLINE para o mesmo Contrato e Período.

Quando LOJA_FISICA e ONLINE forem informados separadamente, o portal calculará o total.

Uma venda ONLINE mensal:

terá Período preenchido;

terá Data vazia;

não será dividida entre os dias;

não será atribuída ao primeiro ou ao último dia do mês.

11. Substituição

A importação substituirá somente as coberturas presentes no arquivo.

A unidade de substituição será:

Contrato + Período + Canal.

Se um Contrato não estiver presente no arquivo, seus dados anteriores permanecerão ativos.

Ao confirmar uma importação:

localizar a cobertura ativa da mesma chave;

inativar a cobertura anterior;

registrar quem realizou a substituição;

registrar quando ocorreu a substituição;

relacionar a importação anterior à nova;

inserir a nova cobertura;

inserir os novos valores;

concluir tudo em uma única transação.

Se qualquer operação falhar, toda a transação deverá ser desfeita.

12. Histórico

O sistema não deverá apagar registros anteriores.

Cada importação deverá registrar:

arquivo;

hash do arquivo;

usuário;

nome do usuário no momento da importação;

data e hora;

status;

total de linhas;

total de vendas;

erros;

divergências;

coberturas substituídas.

Cada cobertura inativada deverá registrar:

importação que a criou;

usuário que a criou;

data da criação;

usuário que a inativou;

data da inativação;

importação que a substituiu.

13. Erros bloqueantes

São erros bloqueantes:

arquivo inválido;

cabeçalho inválido;

Contrato vazio;

Contrato inexistente;

Contrato associado a mais de um Shopping;

Período inválido;

Data inválida;

Data fora do Período;

valor de vendas inválido;

canal inválido;

linha duplicada;

data diária ausente;

coexistência indevida entre mensal e diário no mesmo canal;

coexistência entre CONSOLIDADO e canais componentes;

Shopping informado não autorizado;

Shopping encontrado não autorizado.

Se existir pelo menos um erro bloqueante, o arquivo inteiro será rejeitado.

14. Divergências não bloqueantes

São divergências não bloqueantes:

Shopping informado diferente do Shopping oficial, desde que ambos estejam autorizados;

Loja informada diferente da Loja oficial;

ABL informada diferente da ABL oficial;

ABL não informada.

A ausência do nome da Loja não gera ocorrência. Quando a Loja for informada, ela será comparada com o cadastro oficial.

As divergências deverão aparecer na prévia e exigir confirmação explícita.

15. Apresentação dos erros

O sistema deverá validar todo o arquivo e apresentar todas as ocorrências de uma vez.

Cada ocorrência deverá conter:

número da linha;

Contrato;

Período;

campo;

severidade;

motivo;

valor informado;

valor esperado;

orientação de correção.

O usuário poderá baixar uma planilha com as ocorrências.

16. Controle de acesso

Somente MESTRE e GERENTE_CSC possuem acesso a todos os Shoppings.

GERENTE_SHOPPING possui acesso somente aos Shoppings vinculados em portal_usuario_shopping.

Usuário restrito sem vínculo não possui acesso a dados.

O escopo deverá ser consultado pelo ID atual do usuário no banco.

A autorização deverá ser aplicada antes de:

validar informações sensíveis;

apresentar valores oficiais;

agregar;

paginar;

exportar;

confirmar uma importação.

Uma linha não autorizada rejeita o arquivo inteiro.

17. Permissões

As permissões do módulo VENDAS serão aplicadas da seguinte forma:

pode_visualizar: visualizar relatório, histórico e exportar;

pode_criar: enviar, validar e confirmar novas importações, inclusive quando substituírem as chaves presentes no arquivo;

pode_editar: realizar futuras correções administrativas fora do fluxo normal de importação.

O escopo por Shopping permanece obrigatório, independentemente da permissão do módulo.

18. Alertas

Antes de cada importação, o usuário deverá confirmar que compreendeu:

a necessidade de informar todos os dias nas cargas diárias;

a necessidade de registrar dias sem venda com zero;

a separação entre vendas físicas e online;

a proibição de duplicar canais com CONSOLIDADO;

a substituição somente das chaves presentes;

a utilização dos dados oficiais do Contrato;

a rejeição integral por Shopping não autorizado.

O aceite do alerta não desativa nenhuma validação.

19. Relatório

O relatório deverá permitir filtros por:

Período;

Data;

Shopping;

Contrato;

LUC;

Loja;

Canal;

Granularidade.

O relatório mensal mostrará:

vendas físicas;

vendas online;

vendas consolidadas;

vendas totais;

venda física por ABL;

venda total por ABL.

O relatório diário não distribuirá valores mensais pelos dias.

Valores online mensais deverão aparecer separadamente como valores do período.

20. Critérios mínimos de aceite

A funcionalidade somente poderá ser liberada depois que os testes demonstrarem:

importação mensal válida;

importação diária válida;

presença de todos os dias;

registro de zero;

online mensal junto com físico diário;

substituição isolada por canal;

contratos ausentes preservados;

divergências preservadas;

rejeição integral por acesso;

ausência de alterações parciais;

histórico completo;

totais iguais entre tela e exportação;

filtragem por Shopping antes da agregação;

funcionamento dos perfis MESTRE, GERENTE_CSC e GERENTE_SHOPPING.
