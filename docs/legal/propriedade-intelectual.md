# Propriedade intelectual: plano de protecção

> Para o responsável de PI/advogado. O que está feito no repositório, o que **só a empresa pode fazer** (registos junto de entidades públicas) e como manter a cadeia de titularidade limpa. Organismos e procedimentos de registo em Angola *(confirmar com advogado de PI: marca/propriedade industrial e direito de autor têm autoridades distintas)*.

## 1. O que se protege

| Activo | Forma de protecção | Estado |
|---|---|---|
| **Código-fonte** (backend, frontend, scripts) | Direito de autor (automático) + segredo comercial + licença proprietária | Código marcado `UNLICENSED` / privado em `package.json`; falta ficheiro `LICENSE` — ver §3 |
| **Marca INNOVA** (nome e logótipo `innova-logo.png`) | Registo de marca | **Não registada** (acção da empresa) |
| **Nome de domínio** | Registo + renovação | *(a confirmar — quem é o titular registado)* |
| **Documentação, textos de ajuda, materiais de formação** | Direito de autor | Automático; reservar autoria no contrato |
| **Modelos e dados de configuração** (templates de certificados, regras) | Direito de autor / segredo | — |
| **Bases de dados dos clientes** | **Pertencem ao cliente** (contrato cl. 2) | — |

## 2. Acções que só a empresa pode fazer

- [ ] **Verificar disponibilidade e registar a marca "INNOVA"** (e o logótipo) nas classes relevantes (software, formação, serviços de RH). Fazer antes de investir mais em comunicação. Pesquisa prévia de anterioridades, porque um nome comum a outros sectores pode estar registado.
- [ ] **Registo/depósito do software** como obra protegida, se o advogado entender conveniente (em muitos países não é obrigatório, mas dá prova de data e autoria).
- [ ] **Confirmar titularidade do domínio e das contas** (registrar, DNS, GitHub, Cloudflare, fornecedor de alojamento) em nome da empresa e não de pessoas.
- [ ] **Contratos de trabalho/prestação de quem escreveu o código** com **cessão de direitos de autor** à EVOS, LDA. Sem isto, a empresa pode não ser titular do que um colaborador ou freelancer escreveu. Rever também contribuições de agências externas.
- [ ] **Acordos de confidencialidade** com colaboradores, prestadores e parceiros com acesso a código ou dados.

## 3. Licença do software

- O software é **proprietário**: o cliente recebe um direito de **uso** (SaaS), nunca o código. Já refletido no contrato (cl. 3) e em `package.json` (`UNLICENSED`).
- Falta o ficheiro [`LICENSE`](../../LICENSE) com o aviso de direitos reservados — criado como rascunho na raiz; o advogado confirma o texto e a denominação do titular.
- Cabeçalhos de copyright por ficheiro não são necessários; basta o `LICENSE` e o aviso nos termos de utilização.

## 4. Software de terceiros (licenças que recebemos)

Inventário gerado por `node scripts/license-report.js`: [`licencas-terceiros.md`](licencas-terceiros.md).

Regras de higiene (aplicar em revisão de PR e antes de cada versão):

1. **Permitidas sem consulta:** MIT, ISC, BSD, Apache-2.0, 0BSD, Unlicense, CC0, BlueOak, Zlib, Python-2.0.
2. **Consultar o advogado antes de adoptar:** GPL, AGPL, SSPL, qualquer licença "source-available" (FSL, BUSL, Elastic) e CC-BY-SA em código distribuído. O script devolve código de saída 1 nesses casos, para poder ser usado em CI.
3. **Licença dupla:** registar a opção escolhida (já feito para `jszip` e `dompurify`).
4. **LGPL** (ex.: libvips via `sharp`): manter ligação dinâmica e o aviso de atribuição.
5. Dependências **sem licença** não entram: ou se confirma a licença no repositório de origem ou se substitui.
6. Rever activos de terceiros que não são código: **fontes** (`app/fonts`), **imagens/ícones** (`lucide-react` é ISC), **vozes e avatares** (ElevenLabs/Simli: ler os termos sobre uso comercial e titularidade do áudio gerado), **modelos de IA** (termos de uso do Groq/Gemini).

## 5. Conteúdo do cliente e conteúdo gerado

- **Conteúdo carregado pelo cliente** (cursos, lições, vídeos, PDFs): é do cliente, que garante ter direitos sobre ele. Os termos devem incluir essa garantia e um **procedimento de retirada** em caso de reclamação de terceiros.
- **Conteúdo gerado por IA** (respostas da Ísis, lições geradas): a titularidade e a protecção por direito de autor de obras geradas por IA são juridicamente incertas; os termos devem atribuir ao cliente os direitos que o Fornecedor possa ter e não prometer exclusividade.
- **Biblioteca digital e conteúdos licenciados:** respeitar licenças de editoras; a plataforma regista acessos/downloads (Biblioteca), úteis para prestar contas.

## 6. Defesa

- Termos de utilização proíbem engenharia inversa, cópia, revenda e extracção massiva de dados (`/termos`).
- Rate limiting e chaves de API com scopes limitam o acesso automatizado.
- Marcar documentos internos e comerciais como **Confidencial**.
- Registar provas de autoria: histórico Git (commits assinados quando possível), e arquivar versões lançadas.
