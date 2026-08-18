import test from "node:test";
import assert from "node:assert/strict";
import { composeDeliveryAddress, formatPostalCode, validateDeliveryAddressFields } from "../src/lib/address.js";

test("formata CEP e compõe endereço brasileiro", () => {
  assert.equal(formatPostalCode("12345678"), "12345-678");
  const address = {
    postalCode: "12345-678",
    street: "Rua Exemplo",
    number: "10",
    complement: "Sala 2",
    neighborhood: "Centro",
    city: "Cidade",
    state: "SP",
  };
  assert.equal(validateDeliveryAddressFields(address), "");
  assert.match(composeDeliveryAddress(address), /Rua Exemplo, 10/);
  assert.match(composeDeliveryAddress(address), /CEP 12345-678/);
});
