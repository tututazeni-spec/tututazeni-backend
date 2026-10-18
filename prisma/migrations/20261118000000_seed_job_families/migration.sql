-- Famílias profissionais por defeito: sem elas o seletor "Família profissional"
-- do Novo Percurso de Carreira aparecia vazio (nada as criava).
INSERT INTO "JobFamily" ("name", "code", "description", "area", "active", "updatedAt") VALUES
  ('Administração e Finanças', 'ADM-FIN', 'Gestão administrativa, contabilidade e finanças', 'Suporte', true, NOW()),
  ('Recursos Humanos', 'RH', 'Gestão de pessoas, formação e desenvolvimento', 'Suporte', true, NOW()),
  ('Tecnologia da Informação', 'TI', 'Desenvolvimento, infraestrutura e segurança', 'Tecnologia', true, NOW()),
  ('Comercial e Marketing', 'COM-MKT', 'Vendas, marketing e relação com clientes', 'Negócio', true, NOW()),
  ('Operações e Logística', 'OPS-LOG', 'Operações, produção e cadeia de abastecimento', 'Operações', true, NOW()),
  ('Jurídico e Compliance', 'JUR-COMP', 'Assuntos jurídicos, conformidade e auditoria', 'Suporte', true, NOW()),
  ('Liderança e Gestão', 'LID-GES', 'Funções de direcção e gestão de equipas', 'Gestão', true, NOW())
ON CONFLICT DO NOTHING;
