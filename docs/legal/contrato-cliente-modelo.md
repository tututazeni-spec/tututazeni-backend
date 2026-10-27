# Contrato de prestação de serviços (SaaS) — esqueleto de cláusulas

> **Para revisão jurídica.** Não é um contrato: é a lista de cláusulas que o contrato com cada cliente deve ter, com a posição técnica/comercial já alinhada com o produto e a proposta de redacção onde isso ajuda o advogado. `[ ]` = decisão por tomar. O preço e os planos vêm de Faturação (`docs/deploy/faturacao-saas.md`).

**Partes:** EVOS, LDA. ("Fornecedor") e `[Cliente]` ("Cliente"). *Confirmar denominação, NIF, sede e representantes.*

## Cláusulas obrigatórias

| # | Tema | Posição proposta | Decide o advogado/negócio |
|---|---|---|---|
| 1 | **Objecto e módulos contratados** | Acesso à plataforma INNOVA nos módulos e limites do plano subscrito (utilizadores, armazenamento) | Lista de módulos por plano |
| 2 | **Propriedade dos dados** | Todos os dados que o Cliente (e os seus utilizadores) introduz ou gera na plataforma são **do Cliente**. O Fornecedor não os usa para fins próprios (ver DPA, cl. 2) e não os vende nem partilha, salvo subcontratantes do DPA e obrigação legal. | Tratamento de dados agregados/anonimizados de uso do serviço |
| 3 | **Propriedade intelectual** | Software, marca, documentação, modelos e melhorias são do Fornecedor; o Cliente recebe **licença de uso** limitada, não exclusiva, intransmissível, durante o contrato. Conteúdos do Cliente (cursos, documentos, logótipo) permanecem do Cliente, com licença ao Fornecedor apenas para os alojar e apresentar. Ver `propriedade-intelectual.md`. | Âmbito de licença a sugestões/feedback do Cliente |
| 4 | **Confidencialidade** | Obrigação recíproca sobre informação não pública (dados, preços, segurança, código); excepções legais; dura o contrato e **[5] anos** depois; dados pessoais seguem o DPA sem limite temporal | Prazo pós-contrato |
| 5 | **Protecção de dados** | DPA em anexo (`acordo-processamento-dados.md`) faz parte do contrato; prevalece em matéria de dados pessoais | — |
| 6 | **Nível de serviço** | Disponibilidade mensal **99,0 %**, suporte e créditos conforme `docs/deploy/sla-contratual.md` e tempos de `docs/suporte/canais-e-base-de-conhecimento.md`; exclusões (manutenção anunciada, força maior, terceiros) | Valor final do SLA e créditos |
| 7 | **Responsabilidades do Fornecedor** | Operar com diligência profissional, aplicar as medidas de segurança do anexo, avisar de incidentes (DPA cl. 8), manter cópias de segurança, prestar suporte | Limite de responsabilidade (ex.: valor das últimas 12 mensalidades), exclusão de lucros cessantes |
| 8 | **Responsabilidades do Cliente** | Legitimidade para tratar os dados que introduz (base legal, informação aos titulares); gerir utilizadores e permissões; confidencialidade das credenciais; uso lícito; não tentar contornar limites, não revender, não fazer engenharia inversa | — |
| 9 | **Conteúdo gerado por IA** | Respostas do Tutor de IA são **apoio à aprendizagem**, não aconselhamento profissional/jurídico/médico; o Cliente é responsável pela decisão que tomar com base nelas e pela supervisão humana em decisões de RH (avaliação, despedimento) | Cláusula sobre decisões automatizadas |
| 10 | **Preço, faturação e atraso** | Planos, moeda (AOA) e IVA conforme Faturação; pagamento em [30] dias; atraso → aviso, depois modo só-leitura e suspensão (dunning já implementado) | Prazos de atraso e juros |
| 11 | **Duração, renovação e rescisão** | Prazo inicial `[12]` meses, renovação automática anual com aviso de `[60]` dias; rescisão por incumprimento grave não sanado em `[30]` dias | Prazos |
| 12 | **Saída (portabilidade)** | Na cessação, exportação dos dados em formatos abertos durante `[30]` dias; depois eliminação (DPA cl. 9). Funcionalidade de exportação existente no produto | — |
| 13 | **Subcontratação e alterações** | Subcontratantes do DPA; alteração de termos do serviço com aviso de `[30]` dias; alterações materiais desfavoráveis dão direito a rescindir | — |
| 14 | **Garantias e exclusões** | Serviço "como está" quanto a funcionalidades beta (atrás de feature flag); sem garantia de funcionamento ininterrupto fora do SLA | — |
| 15 | **Indemnização por PI** | Fornecedor defende o Cliente se terceiros alegarem que o software viola direitos de PI, salvo uso fora do contrato ou conteúdos do Cliente | Âmbito e limite |
| 16 | **Força maior** | Cláusula-padrão (inclui falhas de infra-estrutura de terceiros fora do controlo, sem prejuízo de reporte) | — |
| 17 | **Lei aplicável e foro** | `[Direito angolano; foro de Luanda]` | **Decisão jurídica** |
| 18 | **Comunicações e contactos** | Contactos para suporte (`SUPPORT_EMAIL`), segurança/incidentes e protecção de dados | Preencher |

## Anexos do contrato

1. Descrição do serviço, módulos e limites do plano
2. SLA e suporte (`sla-contratual.md` + tempos de resposta)
3. DPA, subprocessadores e medidas de segurança
4. Preçário (de Faturação)
5. Termos de utilização aplicáveis aos utilizadores finais (`/termos`) — o Cliente garante que os utilizadores os aceitam; o produto regista a aceitação

## Pontos de atenção específicos do produto

- **Folha de pagamento/recibos e NIF/NIB:** dados financeiros pessoais; o Cliente deve ter base legal e informar os colaboradores.
- **Avatar Training e aulas ao vivo:** podem tratar imagem e voz; o Cliente informa e, se necessário, recolhe consentimento.
- **Avaliações 360º e desempenho:** apoiam decisões de RH; recomendar ao Cliente política interna e direito de contestação do colaborador.
- **API pública e webhooks:** o Cliente é responsável pela custódia das chaves e pelo destino dos webhooks.
