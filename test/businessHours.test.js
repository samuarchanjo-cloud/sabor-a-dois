import test from "node:test";
import assert from "node:assert/strict";
import { getBusinessStatus } from "../src/lib/businessHours.js";

test("reconhece horário aberto no mesmo dia", () => {
  const hours = [{ day_of_week: 3, is_open: true, opening_time: "19:00", closing_time: "23:00" }];
  const status = getBusinessStatus(hours, new Date("2026-08-19T20:00:00-03:00"), "America/Sao_Paulo");
  assert.equal(status.open, true);
});

test("preserva funcionamento que atravessa a meia-noite", () => {
  const hours = [{ day_of_week: 3, is_open: true, opening_time: "19:00", closing_time: "01:00" }];
  const status = getBusinessStatus(hours, new Date("2026-08-20T00:30:00-03:00"), "America/Sao_Paulo");
  assert.equal(status.open, true);
});
