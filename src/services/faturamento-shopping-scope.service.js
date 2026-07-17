function filtrarBasePorEscopo(base, shoppingIdsPermitidos) {
  if (!Array.isArray(shoppingIdsPermitidos)) {
    return base;
  }

  const permitidos = new Set(
    shoppingIdsPermitidos.map((id) => String(id))
  );

  return base.filter((item) =>
    permitidos.has(String(item.shopping_id))
  );
}

module.exports = {
  filtrarBasePorEscopo,
};
