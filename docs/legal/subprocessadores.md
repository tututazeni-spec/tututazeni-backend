# Subprocessadores e destinatários de dados

> Anexo ao Acordo de Processamento de Dados. Levantado a partir do código (integrações com chamadas de rede externas) e do `.env.example`. **Manter actualizado**: acrescentar um fornecedor aqui é pré-requisito para o ligar em produção. Os clientes devem ser avisados de alterações com antecedência definida no DPA.

"Condição" indica quando o fornecedor recebe dados: muitos são opcionais e só actuam se a empresa cliente os activar (variável de ambiente ou configuração).

| Fornecedor | Finalidade | Dados que recebe | Condição | Localização | Notas para o advogado |
|---|---|---|---|---|---|
| **Groq** (`api.groq.com`) | Modelo de linguagem do Tutor de IA (Ísis) | Texto das perguntas do utilizador e contexto de módulos a que o utilizador tem acesso | Se `GROQ_API_KEY` definida | EUA *(confirmar)* | **Transferência internacional.** Verificar política de retenção/treino do fornecedor e cláusulas contratuais. |
| **Google** (Gemini, `generativelanguage.googleapis.com`) | Modelo de linguagem alternativo | Idem | Se `GEMINI_API_KEY` definida | Múltiplas regiões | Idem. |
| **ElevenLabs** | Síntese de voz (TTS) da Ísis | Texto a converter em voz | Se `ELEVENLABS_API_KEY` definida | UE/EUA *(confirmar)* | Idem. |
| **Simli** | Avatar animado da Ísis / Avatar Training | Áudio/texto da sessão do avatar | Se `SIMLI_API_KEY` definida | *(confirmar)* | Pode envolver voz do utilizador: avaliar dados biométricos/voz. |
| **Ollama** (auto-alojado) | Modelo local alternativo | Texto das perguntas | Se `OLLAMA_URL` definida | Infra própria | Sem terceiro — preferível quando o cliente exige que os dados não saiam. |
| **Twilio** | SMS e WhatsApp de notificações/automações | Nº de telefone, texto da mensagem | Se credenciais Twilio definidas | EUA *(confirmar)* | Nº de telefone é dado pessoal. |
| **Meta (WhatsApp Cloud API, `graph.facebook.com`)** | WhatsApp de notificações | Nº de telefone, texto | Se configurado em Definições → WhatsApp | EUA/UE *(confirmar)* | Idem. |
| **Servidor SMTP do cliente/escolhido** (ex.: Brevo, Mailgun, Gmail) | E-mails de convite, reposição de senha, notificações | E-mail, nome, conteúdo da mensagem | Se `SMTP_HOST` definido | Conforme escolha | O fornecedor é escolhido por instalação: registar qual. |
| **Jitsi** (`meet.jit.si` público, ou JaaS / instância própria) | Aulas ao vivo | Nome de apresentação, áudio/vídeo da sessão | Aulas ao vivo | Conforme instância | Com a instância pública não há contrato: preferir instância própria ou JaaS em produção. |
| **Cloudflare** | CDN/WAF/DNS à frente da aplicação | Tráfego HTTP (IP, cabeçalhos, conteúdo em trânsito) | Em produção | Global | Termina TLS: vê tráfego em claro. |
| **Sentry** | Monitorização de erros | Mensagens de erro, rastos, identificador do utilizador (logs são sanitizados) | Se `SENTRY_DSN` definido | *(confirmar região do projecto)* | Confirmar que não vão dados pessoais nas mensagens. |
| **Fornecedor de alojamento (VPS / Postgres gerido)** | Alojar aplicação, base de dados e cópias de segurança | Todos os dados da plataforma | Sempre | *(preencher)* | **Principal subprocessador.** Indicar país, certificações, contrato. |
| **GitHub** (CI/CD, página de estado) | Compilar e publicar | Nenhum dado de clientes (só código e métricas de disponibilidade) | Sempre | EUA | Não é subprocessador de dados pessoais; listado por transparência. |

## Transferências internacionais

Vários fornecedores acima ficam fora de Angola. A lei angolana de protecção de dados *(Lei n.º 22/11, de 17 de Junho — confirmar)* sujeita as transferências internacionais a regras e, em certos casos, a autorização da autoridade de protecção de dados *(APD — confirmar)*. O advogado deve decidir: base para cada transferência, necessidade de autorização/notificação e cláusulas contratuais a exigir.

**Mitigação técnica já possível:** as integrações de IA, voz, SMS e WhatsApp são opcionais; um cliente que não possa exportar dados pode usar a instalação sem elas (ou com Ollama auto-alojado).
