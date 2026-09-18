# Módulo Users — Novo Colaborador

## 1. Identificação e conta

ID do colaborador, número de colaborador, nome completo, nome preferencial, nome de utilizador, email corporativo, email pessoal, telefone corporativo, telefone pessoal, fotografia, estado da conta, conta activa/inactiva, data de criação, data de activação, data de desactivação, motivo da desactivação.

## 2. Dados pessoais

Nome próprio, nomes do meio, apelido, sexo, data de nascimento, nacionalidade, naturalidade, país de nascimento, estado civil, NIF, tipo de documento de identificação, número do documento, data de emissão, data de validade, país de emissão.

> Para documentos de identificação, colocar **permissões restritas**.

## 3. Contactos e morada

Telefone, telefone alternativo, email pessoal, país, província, município, cidade, morada, código postal, contacto de emergência, nome do contacto de emergência, relação com o colaborador, telefone do contacto de emergência.

## 4. Informação profissional

Número de colaborador, data de admissão, data de início na função, tipo de vínculo, regime de trabalho, situação contratual, cargo, função, posição, departamento, área, unidade, localização de trabalho, centro de custo, equipa, gestor directo, segundo responsável, supervisor, categoria profissional, nível hierárquico, área de negócio, horário de trabalho, turno, local de trabalho, regime presencial/híbrido/remoto.

## 5. Estrutura organizacional

Empresa, grupo empresarial, unidade, região, província, departamento, área, equipa, cargo, função, nível hierárquico, gestor directo, gestor funcional, centro de custo, localização, código organizacional.

O mesmo colaborador poderá estar relacionado com:
Empresa → Unidade → Departamento → Equipa → Cargo → Gestor

## 6. Contrato

Tipo de contrato, número do contrato, data do contrato, data de início, data de termo, período experimental, duração do período experimental, regime de trabalho, carga horária semanal, horário, motivo do contrato, renovável, número de renovações, data da próxima renovação, estado do contrato, documento do contrato.

## 7. Formação e qualificações

Nível de escolaridade, grau académico, área de formação, instituição de ensino, curso, especialização, certificações, qualificações profissionais, idiomas, nível de proficiência linguística, competências principais.

> O Users deve guardar apenas o **perfil/resumo**. Os detalhes ficam nos módulos: Formação → Cursos · Competências → Competências · Certificações → Formação/Competências.

## 8. Acesso e permissões

Perfil de acesso, função de sistema, grupo de permissões, roles, permissões directas, nível de acesso, administrador, gestor, instrutor, avaliador, acesso à Academia, acesso ao RH, acesso a relatórios, acesso a documentos, acesso a dados confidenciais, estado das permissões.

> Ligar ao módulo **Roles & Permissions**, em vez de criar permissões manualmente dentro do utilizador.

## 9. Dados de RH

Estado do colaborador, motivo de saída, data de saída, motivo de suspensão, data de suspensão, elegível para formação, elegível para avaliação, elegível para benefícios, grupo de colaboradores, população de RH, responsável de RH, observações internas.

**Estados:** Pré-admissão, Activo, Em férias, Licença, Suspenso, Inactivo, Cessado, Reformado.

## 10. Dados bancários

Banco, número de conta, IBAN, NIB, titular da conta, moeda, conta principal, estado da conta.

> Dados financeiros / Payroll — com **acesso extremamente restrito**.

## 11. Documentos

Documento de identificação, contrato, certificado académico, certificações, documentos profissionais, declaração, documentos administrativos, anexos — com tipo de documento, número, data de emissão, validade, ficheiro, estado, visibilidade, data de upload.

> Não integrar com Biblioteca/Document Repository.

## 12. Integrações (opcional)

ID externo, sistema de origem, código no ERP, código no sistema de payroll, código no sistema de ponto, código no Active Directory/SSO, identificador externo, última sincronização, estado da sincronização.

## 13. Onboarding

Estado do onboarding, plano de onboarding, data de início, data prevista de conclusão, responsável pelo onboarding, tarefas pendentes, documentos pendentes, formações obrigatórias, acessos pendentes, equipamento pendente, integração concluída.

> A gestão detalhada deve ficar no módulo **Onboarding**.

## 14. Auditoria

Criado por, data de criação, actualizado por, data da última actualização, histórico de alterações, alterações de cargo, de departamento, de unidade, de gestor, de permissões, de estado, histórico de acessos.

---

## Estrutura do formulário "Novo Colaborador" — etapas

1. Dados pessoais
2. Contactos
3. Dados profissionais
4. Estrutura organizacional
5. Contrato
6. Formação e qualificações
7. Acesso e permissões
8. Documentos
9. Onboarding
10. Revisão e criação

**No final:** Criar colaborador + conta + iniciar onboarding.
