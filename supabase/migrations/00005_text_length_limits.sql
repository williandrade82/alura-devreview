-- Limites de tamanho validados no banco (o front só impõe maxLength, que é contornável).
-- Devem espelhar apps/web/src/lib/limits.ts.

alter table review_rules
  add constraint review_rules_rule_length
  check (char_length(btrim(rule)) between 1 and 500);

alter table adrs
  add constraint adrs_title_length
  check (char_length(btrim(title)) between 1 and 200),
  add constraint adrs_context_length
  check (char_length(btrim(context)) between 1 and 5000),
  add constraint adrs_decision_length
  check (char_length(btrim(decision)) between 1 and 5000);
