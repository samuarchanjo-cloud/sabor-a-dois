import test from "node:test";
import assert from "node:assert/strict";
import { slugify, uniqueProductId } from "../src/lib/productIds.js";

test("gera o identificador a partir do nome completo, não da primeira letra", () => {
  assert.equal(slugify("Frango Assado com Batata e Farofa"), "frango-assado-com-batata-e-farofa");
});

test("gera identificadores distintos sem impor limite global de produtos", () => {
  const products = [
    { id: "f" },
    { id: "frango-assado-com-farofa" },
    { id: "frango-assado-com-farofa-2" },
  ];
  assert.equal(uniqueProductId("Frango Assado com Batata e Farofa", products), "frango-assado-com-batata-e-farofa");
  assert.equal(uniqueProductId("Frango Assado com Farofa", products), "frango-assado-com-farofa-3");
});
