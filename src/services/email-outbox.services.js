const pool = require("../db");
const {
  enviarEmail,
  criarEmailNovaSolicitacao,
  criarEmailDefinicaoSenha,
} = require("./email.service");
const {
  criarTokenDefinicaoSenha,
} = require("./password-setup-token-service");

let executando = false;

async function enfileirarEmail(
  client,
  { chave, tipo, destinatario, payload = {} }
) {
  await client.query(
    `
    INSERT INTO portal_email_outbox (
      chave_idempotencia,
      tipo,
      destinatario,
      payload
    )
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (chave_idempotencia) DO NOTHING
    `,
    [chave, tipo, destinatario, JSON.stringify(payload)]
  );
}

async function obterProximoEmail() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      UPDATE portal_email_outbox
      SET
        status = 'PENDENTE',
        processando_em = NULL,
        proxima_tentativa_em = NOW()
      WHERE status = 'PROCESSANDO'
        AND processando_em < NOW() - INTERVAL '10 minutes'
    `);

    const result = await client.query(`
      SELECT *
      FROM portal_email_outbox
      WHERE status = 'PENDENTE'
        AND proxima_tentativa_em <= NOW()
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    const item = result.rows[0];

    if (!item) {
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `
      UPDATE portal_email_outbox
      SET
        status = 'PROCESSANDO',
        processando_em = NOW()
      WHERE id = $1
      `,
      [item.id]
    );

    await client.query("COMMIT");
    return item;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function prepararMensagem(item) {
  if (item.tipo === "NOVA_SOLICITACAO_USUARIO") {
    return criarEmailNovaSolicitacao(item.payload);
  }

  if (
    item.tipo === "CADASTRO_APROVADO" ||
    item.tipo === "REDEFINICAO_SENHA"
  ) {
    const result = await pool.query(
      `
      SELECT
        id,
        nome,
        email,
        credencial_versao,
        credencial_expira_em,
        credencial_utilizada_em
      FROM portal_usuarios
      WHERE id = $1
      `,
      [item.payload.usuarioId]
    );

    const usuario = result.rows[0];

    if (
      !usuario ||
      usuario.credencial_utilizada_em ||
      !usuario.credencial_expira_em ||
      new Date(usuario.credencial_expira_em) <= new Date() ||
      Number(usuario.credencial_versao) !==
        Number(item.payload.credencialVersao)
    ) {
      return null;
    }

    const token = criarTokenDefinicaoSenha({
      usuarioId: usuario.id,
      credencialVersao: usuario.credencial_versao,
      expiraEm: usuario.credencial_expira_em,
    });

    const appUrl = String(process.env.APP_URL).replace(/\/+$/, "");
    const link =
      `${appUrl}/definir-senha.html?token=` +
      encodeURIComponent(token);

    return criarEmailDefinicaoSenha({
      nome: usuario.nome,
      link,
    });
  }

  throw new Error(`Tipo de e-mail inválido: ${item.tipo}`);
}

async function marcarEnviado(itemId) {
  await pool.query(
    `
    UPDATE portal_email_outbox
    SET
      status = 'ENVIADO',
      enviado_em = NOW(),
      ultimo_erro = NULL,
      processando_em = NULL
    WHERE id = $1
    `,
    [itemId]
  );
}

async function marcarFalha(itemId, error) {
  await pool.query(
    `
    UPDATE portal_email_outbox
    SET
      tentativas = tentativas + 1,
      status = CASE
        WHEN tentativas + 1 >= 8 THEN 'ERRO'
        ELSE 'PENDENTE'
      END,
      proxima_tentativa_em =
        NOW() + MAKE_INTERVAL(
          mins => LEAST(
            POWER(2, tentativas + 1)::int,
            60
          )
        ),
      processando_em = NULL,
      ultimo_erro = $2
    WHERE id = $1
    `,
    [
      itemId,
      String(error.message || error).slice(0, 2000),
    ]
  );
}

async function processarItem(item) {
  try {
    const mensagem = await prepararMensagem(item);

    if (!mensagem) {
      await pool.query(
        `
        UPDATE portal_email_outbox
        SET
          status = 'CANCELADO',
          processando_em = NULL,
          ultimo_erro =
            'Credencial expirada, substituída ou utilizada.'
        WHERE id = $1
        `,
        [item.id]
      );

      return;
    }

    await enviarEmail({
      para: item.destinatario,
      ...mensagem,
    });

    await marcarEnviado(item.id);
  } catch (error) {
    await marcarFalha(item.id, error);
  }
}

async function processarFila() {
  if (executando) return;

  executando = true;

  try {
    for (let i = 0; i < 10; i += 1) {
      const item = await obterProximoEmail();

      if (!item) break;

      await processarItem(item);
    }
  } finally {
    executando = false;
  }
}

function iniciarProcessadorEmails() {
  const intervalo = Math.max(
    Number(process.env.EMAIL_WORKER_INTERVAL_MS || 30000),
    10000
  );

  processarFila().catch((error) => {
    console.error("[EMAIL OUTBOX] Erro:", error.message);
  });

  const timer = setInterval(() => {
    processarFila().catch((error) => {
      console.error("[EMAIL OUTBOX] Erro:", error.message);
    });
  }, intervalo);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

module.exports = {
  enfileirarEmail,
  processarFila,
  iniciarProcessadorEmails,
};
