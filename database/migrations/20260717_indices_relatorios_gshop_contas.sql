-- Execute fora de uma transacao explicita (sem BEGIN/COMMIT), pois os
-- indices CONCURRENTLY permitem que o ETL e o Portal continuem operando.

SET lock_timeout = '15s';
SET statement_timeout = '0';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gshop_contas_filial_mes_mapa
  ON gshop_contas (idfilial, mes_mapa);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gshop_contas_filial_data_definicao
  ON gshop_contas (idfilial, data_definicao)
  WHERE data_definicao IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gshop_contas_origem_acordo
  ON gshop_contas (idlancamento_origem_acordo)
  WHERE idlancamento_origem_acordo IS NOT NULL;

ANALYZE gshop_contas;
