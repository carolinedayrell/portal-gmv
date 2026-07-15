require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");


const authRoutes = require("./src/routes/auth.routes");
const usuariosRoutes = require("./src/routes/usuarios.routes");
const shoppingsRoutes = require("./src/routes/shoppings.routes");
const faturamentoRoutes = require("./src/routes/faturamento.routes");

const app = express();
const publicPath = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(publicPath));
app.use("/api/faturamento", faturamentoRoutes);


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

app.get("/shoppings", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/shoppings.html"));
});

app.get("/vendas", (req, res) => {
  res.sendFile(path.join(publicPath, "pages/vendas.html"));
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Portal GMV rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});