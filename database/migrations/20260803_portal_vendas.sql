-- Estrutura inicial do módulo de Vendas.
--
-- Esta estrutura já foi aplicada no banco PortalGMV.
-- O arquivo existe para documentar e permitir a criação das mesmas
-- tabelas em novos ambientes.
--
-- Não executar novamente no banco atual sem uma análise prévia.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';


-- ============================================================
-- 1. IMPORTAÇÕES
-- Representa o arquivo recebido e seu processamento.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_vendas_importacoes (
    id BIGSERIAL PRIMARY KEY,

    usuario_id INTEGER,
    usuario_nome TEXT NOT NULL,
    usuario_perfil VARCHAR(30) NOT NULL,

    confirmado_por_usuario_id INTEGER,
    confirmado_por_nome TEXT,

    arquivo_nome TEXT NOT NULL,
    arquivo_hash_sha256 VARCHAR(64) NOT NULL,
    arquivo_tamanho_bytes BIGINT NOT NULL,
    arquivo_blob_uri TEXT,

    versao_modelo VARCHAR(20) NOT NULL DEFAULT '1.0',
    versao_regras VARCHAR(20) NOT NULL DEFAULT '1.0',
    regras_aceitas_em TIMESTAMPTZ NOT NULL,

    status VARCHAR(40) NOT NULL DEFAULT 'RECEBIDA',

    total_linhas INTEGER NOT NULL DEFAULT 0,
    total_vendas NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_erros INTEGER NOT NULL DEFAULT 0,
    total_divergencias INTEGER NOT NULL DEFAULT 0,
    total_avisos INTEGER NOT NULL DEFAULT 0,
    total_coberturas_substituidas INTEGER NOT NULL DEFAULT 0,

    erro_geral TEXT,

    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validada_em TIMESTAMPTZ,
    confirmada_em TIMESTAMPTZ,
    concluida_em TIMESTAMPTZ,

    CONSTRAINT fk_portal_vendas_importacoes_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES portal_usuarios (id)
        ON DELETE SET NULL,

    CONSTRAINT fk_portal_vendas_importacoes_confirmado_por
        FOREIGN KEY (confirmado_por_usuario_id)
        REFERENCES portal_usuarios (id)
        ON DELETE SET NULL,

    CONSTRAINT ck_portal_vendas_importacoes_status
        CHECK (
            status IN (
                'RECEBIDA',
                'VALIDANDO',
                'COM_ERROS',
                'AGUARDANDO_CONFIRMACAO',
                'PROCESSANDO',
                'CONCLUIDA',
                'REJEITADA',
                'CANCELADA'
            )
        ),

    CONSTRAINT ck_portal_vendas_importacoes_hash
        CHECK (
            arquivo_hash_sha256 ~ '^[0-9a-fA-F]{64}$'
        ),

    CONSTRAINT ck_portal_vendas_importacoes_tamanho
        CHECK (
            arquivo_tamanho_bytes >= 0
        ),

    CONSTRAINT ck_portal_vendas_importacoes_totais
        CHECK (
            total_linhas >= 0
            AND total_erros >= 0
            AND total_divergencias >= 0
            AND total_avisos >= 0
            AND total_coberturas_substituidas >= 0
        ),

    CONSTRAINT ck_portal_vendas_importacoes_confirmacao
        CHECK (
            (
                confirmada_em IS NULL
                AND confirmado_por_usuario_id IS NULL
                AND confirmado_por_nome IS NULL
            )
            OR
            (
                confirmada_em IS NOT NULL
                AND confirmado_por_nome IS NOT NULL
            )
        )
);


-- ============================================================
-- 2. LINHAS RECEBIDAS
-- Preserva o conteúdo informado e os valores oficiais
-- encontrados no sistema.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_vendas_importacao_linhas (
    id BIGSERIAL PRIMARY KEY,

    importacao_id BIGINT NOT NULL,
    numero_linha INTEGER NOT NULL,

    -- Valores originais recebidos no arquivo.
    periodo_informado TEXT,
    data_informada TEXT,
    shopping_informado TEXT,
    contrato_informado TEXT,
    luc_informada TEXT,
    loja_informada TEXT,
    abl_informada_texto TEXT,
    canal_informado TEXT,
    vendas_informadas_texto TEXT,

    -- Valores normalizados.
    periodo DATE,
    data_venda DATE,
    granularidade VARCHAR(10),
    contrato TEXT,
    canal VARCHAR(20),
    vendas NUMERIC(18, 2),
    abl_informada NUMERIC(14, 4),

    -- Valores oficiais encontrados pelo Contrato.
    shopping_sistema_id TEXT,
    shopping_sistema_nome TEXT,
    loja_sistema TEXT,

    -- Relação de LUCs e ABLs oficiais encontrada no sistema.
    lucs_sistema JSONB NOT NULL DEFAULT '[]'::jsonb,
    abl_total_sistema NUMERIC(14, 4),

    -- Resultado das validações.
    autorizada BOOLEAN,
    resultado VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',

    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_portal_vendas_importacao_linhas_importacao
        FOREIGN KEY (importacao_id)
        REFERENCES portal_vendas_importacoes (id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_portal_vendas_importacao_linha
        UNIQUE (importacao_id, numero_linha),

    CONSTRAINT ck_portal_vendas_importacao_numero_linha
        CHECK (
            numero_linha >= 2
        ),

    CONSTRAINT ck_portal_vendas_importacao_granularidade
        CHECK (
            granularidade IS NULL
            OR granularidade IN ('MENSAL', 'DIARIA')
        ),

    CONSTRAINT ck_portal_vendas_importacao_canal
        CHECK (
            canal IS NULL
            OR canal IN (
                'LOJA_FISICA',
                'ONLINE',
                'CONSOLIDADO'
            )
        ),

    CONSTRAINT ck_portal_vendas_importacao_resultado
        CHECK (
            resultado IN (
                'PENDENTE',
                'VALIDA',
                'DIVERGENCIA',
                'ERRO'
            )
        ),

    CONSTRAINT ck_portal_vendas_importacao_periodo
        CHECK (
            periodo IS NULL
            OR EXTRACT(DAY FROM periodo) = 1
        ),

    CONSTRAINT ck_portal_vendas_importacao_data_periodo
        CHECK (
            data_venda IS NULL
            OR periodo IS NULL
            OR DATE_TRUNC('month', data_venda)::date = periodo
        ),

    CONSTRAINT ck_portal_vendas_importacao_lucs_json
        CHECK (
            JSONB_TYPEOF(lucs_sistema) = 'array'
        )
);


-- ============================================================
-- 3. OCORRÊNCIAS DA IMPORTAÇÃO
-- Armazena erros bloqueantes, divergências e avisos.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_vendas_importacao_ocorrencias (
    id BIGSERIAL PRIMARY KEY,

    importacao_id BIGINT NOT NULL,
    linha_id BIGINT,

    numero_linha INTEGER,
    contrato TEXT,
    periodo DATE,

    severidade VARCHAR(20) NOT NULL,
    codigo VARCHAR(80) NOT NULL,
    campo VARCHAR(80),

    mensagem TEXT NOT NULL,
    valor_informado TEXT,
    valor_esperado TEXT,
    orientacao TEXT,

    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_portal_vendas_ocorrencias_importacao
        FOREIGN KEY (importacao_id)
        REFERENCES portal_vendas_importacoes (id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_portal_vendas_ocorrencias_linha
        FOREIGN KEY (linha_id)
        REFERENCES portal_vendas_importacao_linhas (id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_portal_vendas_ocorrencias_severidade
        CHECK (
            severidade IN (
                'ERRO',
                'DIVERGENCIA',
                'AVISO'
            )
        ),

    CONSTRAINT ck_portal_vendas_ocorrencias_numero_linha
        CHECK (
            numero_linha IS NULL
            OR numero_linha >= 2
        ),

    CONSTRAINT ck_portal_vendas_ocorrencias_periodo
        CHECK (
            periodo IS NULL
            OR EXTRACT(DAY FROM periodo) = 1
        )
);


-- ============================================================
-- 4. COBERTURAS
-- Controla a versão ativa de Contrato + Período + Canal.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_vendas_coberturas (
    id BIGSERIAL PRIMARY KEY,

    importacao_id BIGINT NOT NULL,

    contrato TEXT NOT NULL,
    periodo DATE NOT NULL,
    canal VARCHAR(20) NOT NULL,
    granularidade VARCHAR(10) NOT NULL,

    shopping_id TEXT NOT NULL,
    shopping_nome TEXT NOT NULL,
    loja_sistema TEXT,

    abl_total_sistema NUMERIC(14, 4) NOT NULL DEFAULT 0,

    ativa BOOLEAN NOT NULL DEFAULT TRUE,

    criada_por_usuario_id INTEGER,
    criada_por_nome TEXT NOT NULL,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    inativada_por_usuario_id INTEGER,
    inativada_por_nome TEXT,
    inativada_em TIMESTAMPTZ,

    substituida_por_importacao_id BIGINT,
    substituida_por_cobertura_id BIGINT,

    CONSTRAINT fk_portal_vendas_coberturas_importacao
        FOREIGN KEY (importacao_id)
        REFERENCES portal_vendas_importacoes (id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_portal_vendas_coberturas_criada_por
        FOREIGN KEY (criada_por_usuario_id)
        REFERENCES portal_usuarios (id)
        ON DELETE SET NULL,

    CONSTRAINT fk_portal_vendas_coberturas_inativada_por
        FOREIGN KEY (inativada_por_usuario_id)
        REFERENCES portal_usuarios (id)
        ON DELETE SET NULL,

    CONSTRAINT fk_portal_vendas_coberturas_substituida_importacao
        FOREIGN KEY (substituida_por_importacao_id)
        REFERENCES portal_vendas_importacoes (id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_portal_vendas_coberturas_substituida_cobertura
        FOREIGN KEY (substituida_por_cobertura_id)
        REFERENCES portal_vendas_coberturas (id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_portal_vendas_coberturas_periodo
        CHECK (
            EXTRACT(DAY FROM periodo) = 1
        ),

    CONSTRAINT ck_portal_vendas_coberturas_canal
        CHECK (
            canal IN (
                'LOJA_FISICA',
                'ONLINE',
                'CONSOLIDADO'
            )
        ),

    CONSTRAINT ck_portal_vendas_coberturas_granularidade
        CHECK (
            granularidade IN (
                'MENSAL',
                'DIARIA'
            )
        ),

    CONSTRAINT ck_portal_vendas_coberturas_abl
        CHECK (
            abl_total_sistema >= 0
        ),

    CONSTRAINT ck_portal_vendas_coberturas_situacao
        CHECK (
            (
                ativa = TRUE
                AND inativada_em IS NULL
                AND inativada_por_nome IS NULL
                AND substituida_por_importacao_id IS NULL
                AND substituida_por_cobertura_id IS NULL
            )
            OR
            (
                ativa = FALSE
                AND inativada_em IS NOT NULL
                AND inativada_por_nome IS NOT NULL
                AND substituida_por_importacao_id IS NOT NULL
            )
        )
);


-- ============================================================
-- 5. LUCs DA COBERTURA
-- Guarda uma fotografia das LUCs e ABLs do Contrato.
-- As vendas não são duplicadas nesta tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_vendas_cobertura_lucs (
    id BIGSERIAL PRIMARY KEY,

    cobertura_id BIGINT NOT NULL,

    luc TEXT NOT NULL,
    abl NUMERIC(14, 4),
    tipo_unidade TEXT,
    ordem INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT fk_portal_vendas_cobertura_lucs_cobertura
        FOREIGN KEY (cobertura_id)
        REFERENCES portal_vendas_coberturas (id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_portal_vendas_cobertura_luc
        UNIQUE (cobertura_id, luc),

    CONSTRAINT ck_portal_vendas_cobertura_luc_preenchida
        CHECK (
            TRIM(luc) <> ''
        ),

    CONSTRAINT ck_portal_vendas_cobertura_luc_abl
        CHECK (
            abl IS NULL
            OR abl >= 0
        ),

    CONSTRAINT ck_portal_vendas_cobertura_luc_ordem
        CHECK (
            ordem >= 1
        )
);


-- ============================================================
-- 6. VALORES DE VENDAS
-- Guarda um valor mensal ou os valores diários.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_vendas (
    id BIGSERIAL PRIMARY KEY,

    cobertura_id BIGINT NOT NULL,
    linha_importacao_id BIGINT NOT NULL,

    data_venda DATE,
    vendas NUMERIC(18, 2) NOT NULL,

    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_portal_vendas_cobertura
        FOREIGN KEY (cobertura_id)
        REFERENCES portal_vendas_coberturas (id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_portal_vendas_linha_importacao
        FOREIGN KEY (linha_importacao_id)
        REFERENCES portal_vendas_importacao_linhas (id)
        ON DELETE RESTRICT
);


-- ============================================================
-- 7. ÍNDICES DAS IMPORTAÇÕES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_portal_vendas_importacoes_status_data
    ON portal_vendas_importacoes (
        status,
        criada_em DESC
    );

CREATE INDEX IF NOT EXISTS idx_portal_vendas_importacoes_usuario_data
    ON portal_vendas_importacoes (
        usuario_id,
        criada_em DESC
    );

CREATE INDEX IF NOT EXISTS idx_portal_vendas_importacoes_hash
    ON portal_vendas_importacoes (
        arquivo_hash_sha256
    );


-- ============================================================
-- 8. ÍNDICES DAS LINHAS E OCORRÊNCIAS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_portal_vendas_importacao_linhas_importacao
    ON portal_vendas_importacao_linhas (
        importacao_id,
        numero_linha
    );

CREATE INDEX IF NOT EXISTS idx_portal_vendas_importacao_linhas_contrato
    ON portal_vendas_importacao_linhas (
        contrato
    );

CREATE INDEX IF NOT EXISTS idx_portal_vendas_ocorrencias_importacao
    ON portal_vendas_importacao_ocorrencias (
        importacao_id,
        severidade,
        numero_linha
    );


-- ============================================================
-- 9. ÍNDICES DAS COBERTURAS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_portal_vendas_coberturas_relatorio
    ON portal_vendas_coberturas (
        shopping_id,
        periodo,
        canal,
        contrato
    );

CREATE INDEX IF NOT EXISTS idx_portal_vendas_coberturas_contrato_periodo
    ON portal_vendas_coberturas (
        contrato,
        periodo
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_vendas_cobertura_ativa
    ON portal_vendas_coberturas (
        contrato,
        periodo,
        canal
    )
    WHERE ativa = TRUE;

CREATE INDEX IF NOT EXISTS idx_portal_vendas_cobertura_ativa_shopping
    ON portal_vendas_coberturas (
        shopping_id,
        periodo,
        contrato
    )
    WHERE ativa = TRUE;


-- ============================================================
-- 10. ÍNDICES DAS LUCs
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_portal_vendas_cobertura_lucs_luc
    ON portal_vendas_cobertura_lucs (
        luc,
        cobertura_id
    );

CREATE INDEX IF NOT EXISTS idx_portal_vendas_cobertura_lucs_cobertura
    ON portal_vendas_cobertura_lucs (
        cobertura_id,
        ordem
    );


-- ============================================================
-- 11. ÍNDICES DOS VALORES DE VENDAS
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_vendas_mensal_por_cobertura
    ON portal_vendas (
        cobertura_id
    )
    WHERE data_venda IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_vendas_diaria_por_cobertura_data
    ON portal_vendas (
        cobertura_id,
        data_venda
    )
    WHERE data_venda IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_vendas_data
    ON portal_vendas (
        data_venda,
        cobertura_id
    )
    WHERE data_venda IS NOT NULL;


COMMIT;