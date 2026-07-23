const jwt = require("jsonwebtoken");

function criarTokenDefinicaoSenha({
  usuarioId,
  credencialVersao,
  expiraEm,
}) {
  if (!process.env.PASSWORD_SETUP_SECRET) {
    throw new Error("PASSWORD_SETUP_SECRET não configurado.");
  }

  return jwt.sign(
    {
      sub: String(usuarioId),
      purpose: "DEFINE_PASSWORD",
      credencialVersao: Number(credencialVersao),
      exp: Math.floor(new Date(expiraEm).getTime() / 1000),
    },
    process.env.PASSWORD_SETUP_SECRET,
    {
      algorithm: "HS256",
      noTimestamp: true,
    }
  );
}

function validarTokenDefinicaoSenha(token) {
  const decoded = jwt.verify(
    token,
    process.env.PASSWORD_SETUP_SECRET,
    { algorithms: ["HS256"] }
  );

  if (decoded.purpose !== "DEFINE_PASSWORD") {
    throw new Error("Finalidade do token inválida.");
  }

  return decoded;
}

module.exports = {
  criarTokenDefinicaoSenha,
  validarTokenDefinicaoSenha,
};