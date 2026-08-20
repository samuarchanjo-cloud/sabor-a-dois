import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsappNumber, whatsappOrderUrl } from "../src/lib/whatsapp.js";

test("adiciona o DDI 55 a números brasileiros com DDD", () => {
  assert.equal(normalizeWhatsappNumber("(21) 98765-4321"), "5521987654321");
});

test("preserva número que já possui DDI e monta o link do pedido", () => {
  assert.equal(normalizeWhatsappNumber("+55 21 98765-4321"), "5521987654321");
  assert.equal(
    whatsappOrderUrl("5521987654321", "Pedido #123"),
    "https://wa.me/5521987654321?text=Pedido%20%23123",
  );
});
