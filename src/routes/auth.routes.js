const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { authMiddleware } = require("../middlewares/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ message: "Informe email e senha." });
    }

    const emailTratado = String(email).trim();

    const result = await pool.query(
      `
      SELECT id, nome, email, senha_hash, perfil, ativo
      FROM portal_usuarios
      WHERE LOWER(email) = LOWER($1)
      `,
      [emailTratado]
    );

    const usuario = result.rows[0];

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ message: "Usuario ou senha invalidos." });
    }

    const senhaValida = await bcrypt.compare(String(senha), usuario.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({ message: "Usuario ou senha invalidos." });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const permissoes = await pool.query(
      `
      SELECT modulo, pode_visualizar, pode_criar, pode_editar, pode_excluir
      FROM portal_permissoes
      WHERE perfil = $1
      `,
      [usuario.perfil]
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
      permissoes: permissoes.rows,
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ message: "Erro interno no login." });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  res.json({
    usuario: req.user,
  });
});

module.exports = router;