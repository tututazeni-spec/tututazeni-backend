-- Sequências atómicas para geração de códigos de Financiador (FIN-) e Grant (GRT-).
-- nextval() é atómico → elimina a corrida do antigo "ler último código + 1",
-- que sob concorrência (vários POST /crm/funders|grants simultâneos) podia
-- gerar o mesmo código duas vezes e violar o índice @unique em `code`.

CREATE SEQUENCE IF NOT EXISTS funder_code_seq AS INTEGER START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS funding_grant_code_seq AS INTEGER START WITH 1 INCREMENT BY 1;

-- Alinhar cada sequência com os dados já existentes (idempotente):
--   • se já há códigos FIN-/GRT-, o próximo nextval() devolve MAX(num)+1;
--   • se a tabela está vazia, o próximo nextval() devolve 1.
-- O 3.º argumento de setval (is_called) controla esse +1:
--   true  -> próximo nextval = valor + 1
--   false -> próximo nextval = valor
SELECT setval(
  'funder_code_seq',
  COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 1),
  EXISTS (SELECT 1 FROM "Funder" WHERE code ~ '^FIN-[0-9]+$')
)
FROM "Funder"
WHERE code ~ '^FIN-[0-9]+$';

SELECT setval(
  'funding_grant_code_seq',
  COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 1),
  EXISTS (SELECT 1 FROM "FundingGrant" WHERE code ~ '^GRT-[0-9]+$')
)
FROM "FundingGrant"
WHERE code ~ '^GRT-[0-9]+$';
