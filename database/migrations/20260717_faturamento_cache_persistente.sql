-- Execute este arquivo com autocommit habilitado.
-- Cada comando e independente e pode ser retomado com seguranca.
SET lock_timeout = '15s';
SET statement_timeout = '0';

CREATE TABLE IF NOT EXISTS etl_cargas_contas (
    id BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    data_inicio_busca DATE,
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluido_em TIMESTAMPTZ,
    total_extraido INTEGER NOT NULL DEFAULT 0,
    total_ids_processados INTEGER NOT NULL DEFAULT 0,
    total_excluidos INTEGER NOT NULL DEFAULT 0,
    requer_reconstrucao_completa BOOLEAN NOT NULL DEFAULT FALSE,
    erro TEXT,
    CONSTRAINT ck_etl_cargas_contas_status
        CHECK (status IN ('EM_EXECUCAO', 'CONCLUIDA', 'ERRO'))
);

ALTER TABLE etl_cargas_contas
    ADD COLUMN IF NOT EXISTS total_excluidos INTEGER NOT NULL DEFAULT 0;

ALTER TABLE etl_cargas_contas
    ADD COLUMN IF NOT EXISTS requer_reconstrucao_completa
        BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_etl_cargas_contas_status_id
    ON etl_cargas_contas (status, id);

CREATE TABLE IF NOT EXISTS etl_carga_contas_itens (
    carga_id BIGINT NOT NULL,
    idlancamento TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (carga_id, idlancamento),
    CONSTRAINT fk_etl_carga_contas_itens_carga
        FOREIGN KEY (carga_id)
        REFERENCES etl_cargas_contas (id)
        ON DELETE CASCADE
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_etl_carga_contas_itens_id
    ON etl_carga_contas_itens (idlancamento);

CREATE TABLE IF NOT EXISTS portal_faturamento_cache (
    idlancamento TEXT PRIMARY KEY,
    competencia TEXT,
    competencia_ordem BIGINT,
    shopping_id TEXT,
    shopping TEXT,
    contrato TEXT,
    tipo_loja TEXT,
    loja_id TEXT,
    loja TEXT,
    tipo TEXT,
    nome_da_classe TEXT,
    area NUMERIC,
    valor_lancado NUMERIC,
    descontos NUMERIC,
    juros NUMERIC,
    correcoes NUMERIC,
    multa NUMERIC,
    valor_faturado_total NUMERIC,
    valor_liquidado NUMERIC,
    data_baixa DATE,
    carga_id BIGINT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_faturamento_cache_competencia
    ON portal_faturamento_cache (competencia_ordem);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_faturamento_cache_shopping
    ON portal_faturamento_cache (shopping_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_faturamento_cache_loja
    ON portal_faturamento_cache (loja_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_faturamento_cache_tipo
    ON portal_faturamento_cache (tipo);

CREATE TABLE IF NOT EXISTS portal_faturamento_cache_estado (
    chave TEXT PRIMARY KEY,
    ultima_carga_id BIGINT,
    ultima_carga_importada_em TIMESTAMPTZ,
    cache_gerado_em TIMESTAMPTZ,
    ultima_reconstrucao_completa_em TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'VAZIO',
    total_registros BIGINT NOT NULL DEFAULT 0,
    erro TEXT
);

INSERT INTO portal_faturamento_cache_estado (chave, status)
VALUES ('faturamento', 'VAZIO')
ON CONFLICT (chave) DO NOTHING;
