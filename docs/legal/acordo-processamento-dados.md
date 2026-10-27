# Acordo de Processamento de Dados (DPA) — RASCUNHO

> **Para revisão jurídica.** Aplica-se quando a EVOS, LDA. ("**Fornecedor**") trata dados pessoais por conta da empresa cliente ("**Cliente**") ao prestar a plataforma INNOVA. Nesse caso o Cliente é o **responsável pelo tratamento** e o Fornecedor o **subcontratante/processador**. Campos `[ ]` por preencher. Referências à lei angolana de protecção de dados pessoais *(Lei n.º 22/11 — confirmar, incluindo regulamentação e autoridade competente)*.

## 1. Objecto, duração e natureza

- **Objecto:** alojar e operar a plataforma INNOVA (Academia Corporativa e RH) para o Cliente.
- **Duração:** a do contrato principal, mais o período de devolução/eliminação (cláusula 9).
- **Natureza e finalidade:** armazenamento, consulta, apresentação, cálculo e comunicação de dados dos colaboradores do Cliente para formação, avaliação de desempenho, assiduidade e licenças, folha de pagamento/recibos, comunicações e suporte.
- **Categorias de titulares:** colaboradores, candidatos, formandos, beneficiários, parceiros e financiadores do Cliente, e as pessoas de contacto destes.
- **Categorias de dados:** identificação e contacto; dados profissionais (cargo, departamento, histórico); dados de formação e avaliação; assiduidade e licenças; dados de remuneração e recibos; **NIF e NIB**; imagem/voz quando o Cliente usar o Avatar Training ou aulas ao vivo; registos de acesso. **Dados sensíveis** (ex.: saúde em licenças/justificações) só se o Cliente os introduzir — o Cliente deve minimizá-los.

## 2. Instruções do Cliente

O Fornecedor trata os dados **apenas por instrução documentada** do Cliente (este acordo, o contrato e as configurações que o Cliente faz na plataforma) e informa-o se considerar que uma instrução viola a lei. Não trata dados para fins próprios, exceto dados agregados e anonimizados de **utilização do serviço** (desempenho, estatísticas de produto), que não identificam pessoas.

## 3. Confidencialidade

Quem no Fornecedor acede a dados pessoais está vinculado por dever de confidencialidade, tem acesso apenas ao necessário (princípio do menor privilégio) e é formado para o efeito. O acesso de suporte a dados do Cliente exige pedido/autorização do Cliente ou necessidade técnica registada.

## 4. Segurança

O Fornecedor aplica as medidas do Anexo B ([`medidas-de-seguranca.md`](medidas-de-seguranca.md)), adequadas ao risco, e mantém-nas ou melhora-as durante o contrato. Não pode reduzir o nível de protecção sem aviso e acordo.

## 5. Subcontratantes ulteriores

- O Cliente dá **autorização geral** aos subcontratantes do Anexo A ([`subprocessadores.md`](subprocessadores.md)).
- O Fornecedor avisa o Cliente de qualquer acréscimo ou substituição com **[30] dias** de antecedência; o Cliente pode opor-se por motivo fundamentado; se não houver solução, pode resolver o contrato quanto ao serviço afectado.
- Impõe a cada subcontratante obrigações equivalentes às deste acordo e permanece responsável perante o Cliente.

## 6. Transferências internacionais

Só ocorrem para os fornecedores do Anexo A, quando o Cliente activar a funcionalidade correspondente, e com as garantias exigidas pela lei aplicável *(autorização/notificação à autoridade, cláusulas contratuais — advogado a definir)*. O Cliente pode manter desactivadas as integrações que envolvem transferência.

## 7. Direitos dos titulares

A plataforma dispõe de pedidos do titular, exportação, rectificação e anonimização. O Fornecedor **ajuda o Cliente** a responder em [10] dias úteis a partir do pedido, e encaminha-lhe os pedidos que lhe chegarem directamente, sem os responder por si.

## 8. Violação de dados pessoais

O Fornecedor notifica o Cliente **sem demora injustificada e, no máximo, em [48] horas** após ter conhecimento, indicando: natureza, categorias e número aproximado de titulares e registos, consequências prováveis, medidas tomadas e contacto. Trata-a como incidente SEV1 (`docs/deploy/gestao-incidentes.md`). A notificação à autoridade e aos titulares compete ao Cliente, com apoio do Fornecedor.

## 9. Devolução e eliminação

Terminado o contrato, o Cliente tem **[30] dias** para exportar os seus dados (formatos abertos, ex.: CSV/XLSX/PDF). Findo esse prazo, o Fornecedor elimina os dados de produção e, nas cópias de segurança, no ciclo normal de rotação (até **[90] dias**), e confirma por escrito, salvo obrigação legal de conservação.

## 10. Auditoria

O Fornecedor disponibiliza ao Cliente a informação necessária para demonstrar o cumprimento (incluindo os registos de auditoria da plataforma) e permite **uma auditoria por ano** (ou após violação), com aviso de [30] dias, durante o horário útil, sujeita a confidencialidade, sem afectar outros clientes e a custo do Cliente.

## 11. Governação (a definir)

- [ ] Designar contacto/encarregado de protecção de dados do Fornecedor: `[nome, e-mail]`.
- [ ] Manter registo das actividades de tratamento como subcontratante.
- [ ] Definir se o Cliente precisa de avaliação de impacto para funcionalidades de IA/avatar.

## 12. Responsabilidade e lei aplicável

*(Advogado a definir: repartição de responsabilidade entre as partes, limites, foro e lei aplicável. Deve ser coerente com o contrato principal.)*

## Anexos

- **A** — Subcontratantes: [`subprocessadores.md`](subprocessadores.md)
- **B** — Medidas de segurança: [`medidas-de-seguranca.md`](medidas-de-seguranca.md)
- **C** — Detalhe do tratamento (quadro da cláusula 1) por módulo activado pelo Cliente.
