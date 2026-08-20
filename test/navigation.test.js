import test from "node:test";
import assert from "node:assert/strict";
import { pathForView, routeFromPath } from "../src/lib/navigation.js";

test("representa telas importantes em URLs reais", () => {
  assert.equal(pathForView("home"), "/");
  assert.equal(pathForView("category", "porcoes-extras"), "/categorias/porcoes-extras");
  assert.equal(pathForView("cart"), "/carrinho");
  assert.equal(pathForView("checkout"), "/checkout");
  assert.equal(pathForView("admin"), "/admin");
});

test("restaura view e categoria a partir do histórico", () => {
  assert.deepEqual(routeFromPath("/categorias/bebidas"), { view: "category", categoryId: "bebidas" });
  assert.deepEqual(routeFromPath("/carrinho"), { view: "cart", categoryId: null });
  assert.deepEqual(routeFromPath("/checkout"), { view: "checkout", categoryId: null });
});
