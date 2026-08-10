require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");


const { iniciarProcessadorEmails } = require("./src/services/email-outbox.services");
const authRoutes = require("./src/routes/auth.routes");
const usuariosRoutes = require("./src/routes/usuarios.routes");
const shoppingsRoutes = require("./src/routes/shoppings.routes");
const faturamentoRoutes = require("./src/routes/faturamento.routes");
const vendasRoutes = require("./src/routes/vendas.routes");


const app = express();
const publicPath = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(publicPath));
app.use("/api/faturamento", faturamentoRoutes);
app.use(  "/api/vendas",  vendasRoutes);


app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "Portal GMV",
    date: new Date(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/shoppings", shoppingsRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicPath, "login.html"));
});

app.get("/solicitar-cadastro", (req, res) => {
  res.sendFile(path.join(publicPath, "solicitar-cadastro.html"));
});

app.get("/esqueci-senha", (req, res) => {
  res.sendFile(path.join(publicPath, "esqueci-senha.html"));
});

app.get("/definir-senha", (req, res) => {
  res.sendFile(path.join(publicPath, "definir-senha.html"));
});

app.get("/alterar-senha-inicial", (req, res) => {
    res.sendFile(path.join(publicPath,"alterar-senha-inicial.html"));
});

app.get("/faturamento", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/faturamento.html"));
});

app.get("/faturamento/relatorio", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/faturamento-relatorio.html"));
});

app.get("/faturamento/gerar-tabelas", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/gerar-tabelas.html"));
});

app.get("/usuarios", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/usuarios.html"));
});

app.get("/meu-perfil", (req, res) => {
  res.sendFile(
    path.join(
      publicPath,
      "pages",
      "meu-perfil.html"
    )
  );
});

app.get("/shoppings", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/shoppings.html"));
});

app.get("/vendas", (req, res) => {
  return res.redirect("/vendas/relatorio");
});

app.get("/vendas/relatorio", (req, res) => {
  res.sendFile(
    path.join(
      publicPath,
      "pages",
      "vendas-relatorio.html"
    )
  );
});

app.get("/vendas/importacao", (req, res) => {
  res.sendFile(
    path.join(
      publicPath,
      "pages",
      "vendas-importacao.html"
    )
  );
});

const PORT = process.env.PORT || 4000;
const FATURAMENTO_CACHE_POLL_MS = Math.max(
  Number(process.env.FATURAMENTO_CACHE_POLL_MS || 60000),
  10000
);
const FATURAMENTO_CACHE_POLL_MAX_MS = Math.max(
  Number(process.env.FATURAMENTO_CACHE_POLL_MAX_MS || 15 * 60 * 1000),
  FATURAMENTO_CACHE_POLL_MS
);

app.listen(PORT, () => {
  console.log(`Portal GMV rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);

  iniciarProcessadorEmails();
  console.log("[EMAIL OUTBOX] Processador iniciado.");

  let falhasConsecutivasCache = 0;

  const agendarVerificacaoCache = (atraso) => {
    const timer = setTimeout(verificarCacheFaturamento, atraso);
    if (typeof timer.unref === "function") timer.unref();
  };

  const verificarCacheFaturamento = async () => {
    let proximoIntervalo = FATURAMENTO_CACHE_POLL_MS;

    try {
      await faturamentoRoutes.processarCargasPendentes();
      falhasConsecutivasCache = 0;
    } catch (error) {
      falhasConsecutivasCache += 1;
      proximoIntervalo = Math.min(
        FATURAMENTO_CACHE_POLL_MS * 2 ** falhasConsecutivasCache,
        FATURAMENTO_CACHE_POLL_MAX_MS
      );
      console.error(
        `[CACHE FATURAMENTO] Erro ao processar cargas pendentes; ` +
          `nova verificacao em ${Math.round(proximoIntervalo / 1000)}s:`,
        error
      );
    } finally {
      agendarVerificacaoCache(proximoIntervalo);
    }
  };

  const inicializarCache = async () => {
    try {
      await faturamentoRoutes.inicializarCacheFaturamento();
      console.log(
        "[CACHE FATURAMENTO] Cache persistido carregado e cargas pendentes processadas."
      );
    } catch (error) {
      console.error(
        "[CACHE FATURAMENTO] Erro ao inicializar o cache persistido:",
        error
      );
    } finally {
      agendarVerificacaoCache(FATURAMENTO_CACHE_POLL_MS);
    }
  };

  inicializarCache();
});
