const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure:
    String(process.env.SMTP_SECURE || "false").toLowerCase() ===
    "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function escaparHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function verificarSmtp() {
  await transporter.verify();
}

async function enviarEmail({ para, assunto, texto, html }) {
  if (!para) {
    throw new Error("Destinatário não informado.");
  }

  const info = await transporter.sendMail({
    from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });

  console.log("[EMAIL] Mensagem processada:", {
    messageId: info.messageId,
    aceitos: Array.isArray(info.accepted)
      ? info.accepted.length
      : 0,
    rejeitados: Array.isArray(info.rejected)
      ? info.rejected.length
      : 0,
  });

  return info;
}

function criarEmailNovaSolicitacao({
  nome,
  email,
  shoppingNome,
}) {
  const appUrl = String(process.env.APP_URL).replace(/\/+$/, "");
  const url = `${appUrl}/usuarios`;

  return {
    assunto: "Nova solicitação de cadastro - Portal GMV",
    texto:
      `Nova solicitação de cadastro.\n\n` +
      `Nome: ${nome}\n` +
      `E-mail: ${email}\n` +
      `Shopping: ${shoppingNome}\n\n` +
      `Acesse: ${url}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2937">
        <h2>Nova solicitação de cadastro</h2>
        <p><strong>Nome:</strong> ${escaparHtml(nome)}</p>
        <p><strong>E-mail:</strong> ${escaparHtml(email)}</p>
        <p><strong>Shopping:</strong> ${escaparHtml(shoppingNome)}</p>
        <p><a href="${url}">Abrir solicitações</a></p>
      </div>
    `,
  };
}

function criarEmailDefinicaoSenha({ nome, link }) {
  return {
    assunto: "Defina sua senha - Portal GMV",
    texto:
      `Olá ${nome},\n\n` +
      `Acesse o link abaixo para definir sua senha:\n` +
      `${link}\n\n` +
      `O link é válido por 24 horas.`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2937">
        <h2>Definição de senha</h2>
        <p>Olá ${escaparHtml(nome)},</p>
        <p>Use o botão abaixo para definir sua senha.</p>
        <p>
          <a
            href="${escaparHtml(link)}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#185f93;
              color:#fff;
              text-decoration:none;
              border-radius:6px;
            "
          >
            Definir senha
          </a>
        </p>
        <p>Este link é válido por 24 horas.</p>
      </div>
    `,
  };
}

module.exports = {
  enviarEmail,
  verificarSmtp,
  criarEmailNovaSolicitacao,
  criarEmailDefinicaoSenha,
};