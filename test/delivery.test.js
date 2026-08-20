import test from "node:test";
import assert from "node:assert/strict";
import { distanceInKm, evaluateDelivery, validateDeliveryRanges } from "../src/lib/delivery.js";

const settings = {
  maximum_delivery_distance_km: 5,
  below_one_km_behavior: "fixed",
  below_one_km_fee: 2,
};
const ranges = [
  { min_distance_km: 1, max_distance_km: 1.99, fee: 4, active: true },
  { min_distance_km: 2, max_distance_km: 5, fee: 7, active: true },
];

test("calcula distância Haversine finita", () => {
  const distance = distanceInKm({ latitude: -23, longitude: -43 }, { latitude: -23.01, longitude: -43.01 });
  assert.ok(distance > 0);
  assert.ok(distance < 2);
});

test("aplica taxa fixa abaixo de 1 km e faixa acima", () => {
  assert.deepEqual(evaluateDelivery(0.5, ranges, settings).fee, 2);
  assert.deepEqual(evaluateDelivery(2.5, ranges, settings).fee, 7);
});

test("aceita a regra configurada quando a distância arredonda para 1 km", () => {
  assert.deepEqual(evaluateDelivery(0.999, ranges, settings), {
    allowed: true,
    fee: 2,
    code: "FIXED",
    message: "Taxa fixa até 1 km.",
  });
  assert.equal(evaluateDelivery(1, ranges, settings).allowed, true);
});

test("bloqueia fora do raio e detecta lacunas", () => {
  assert.equal(evaluateDelivery(5.01, ranges, settings).allowed, false);
  assert.match(validateDeliveryRanges([
    ranges[0],
    { min_distance_km: 2.1, max_distance_km: 5, fee: 7, active: true },
  ]), /lacuna/i);
});

test("orienta entrega externa acima do limite configurável sem cobrar taxa convencional", () => {
  const assessment = evaluateDelivery(5.01, ranges, {
    ...settings,
    own_delivery_limit_km: 5,
    external_delivery_enabled: true,
  });
  assert.equal(assessment.allowed, true);
  assert.equal(assessment.externalDelivery, true);
  assert.equal(assessment.fee, 0);
  assert.equal(assessment.code, "EXTERNAL_DELIVERY");
  assert.match(assessment.message, /Uber/i);
});

test("mantém a taxa própria exatamente no limite configurado", () => {
  const assessment = evaluateDelivery(5, ranges, {
    ...settings,
    own_delivery_limit_km: 5,
    external_delivery_enabled: true,
  });
  assert.equal(assessment.externalDelivery, undefined);
  assert.equal(assessment.allowed, true);
  assert.equal(assessment.fee, 7);
});

test("mantém a regra normal quando a entrega externa está desativada", () => {
  const assessment = evaluateDelivery(5.01, ranges, {
    ...settings,
    own_delivery_limit_km: 5,
    external_delivery_enabled: false,
  });
  assert.equal(assessment.allowed, false);
  assert.equal(assessment.code, "OUTSIDE_AREA");
});
