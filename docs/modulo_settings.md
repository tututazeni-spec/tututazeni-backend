# Módulo Definições (Settings) da INNOVA

Sugiro separar em dois níveis:

- **Definições da organização** (só o Admin): configuram a empresa-cliente (tenant).
- **Definições pessoais** (cada utilizador): perfil, palavra-passe, idioma, notificações.

---

## 1. Visão Geral — ROLE ADMIN

- Nome do tenant (aparece no cabeçalho do Dashboard)
- Nome da Plataforma
- Logo, NIF, morada, contactos, sector
- Fuso horário, idioma, moeda (AOA), formato de data e números
- Favicon, país, moeda, formato de data/hora

## 2. Permissões — *já tem* — ROLE ADMIN

- Lista de perfis (Admin, RH, Gestor, Formador, Colaborador, etc.)
- Matriz de permissões por módulo e ação (ver, criar, editar, apagar, exportar)
- Possibilidade de criar perfis personalizados
- Roles, permissões, acesso por módulo, acesso por unidade/departamento, permissões granulares

## 3. Utilizadores — ROLE ADMIN

- Regras de criação
- Ativação/desativação
- Campos obrigatórios
- Convite de utilizadores
- Utilizadores inativos

## 4. Segurança — *já tem*

- Política de palavras-passe (tamanho, complexidade, expiração)
- Autenticação de dois fatores (2FA)
- Duração da sessão / JWT
- Bloqueio após tentativas falhadas
- Histórico de logins e sessões ativas
- Tempo de expiração, tentativas de login, políticas de segurança

## 5. Notificações — ROLE ADMIN

- Canais: in-app, email e WhatsApp (só envio)
- Que eventos geram notificação (matrícula, lembrete de curso, evento corporativo, avaliação pendente)
- Templates das mensagens e horário permitido de envio

## 6. Integrações — ROLE ADMIN

- Email (SMTP)
- WhatsApp: número, estado da ligação, limites de envio
- IA (Ísis): ligar/desligar, limites de utilização, módulos onde está ativa
- Chaves de API e webhooks
- Pagamentos (EMIS Débito Direto, quando avançares)
- ERP, payroll, LMS, SSO, API, Power BI, Teams, WhatsApp, e-mail, webhooks

## 7. Certificados — ROLE ADMIN

- Biblioteca de templates
- Logo da academia (substitui o do template)
- Assinatura eletrónica (carregada uma vez e aplicada a todos)
- Texto padrão, numeração e código de verificação

## 8. Privacidade (LPDP)

- Textos de consentimento e versões
- Prazos de retenção de dados
- Contacto do responsável pela proteção de dados
- Gestão dos pedidos de direitos dos titulares
- Anonimização, exportação, eliminação e políticas de privacidade

## 9. Licença e Módulos — ROLE ADMIN

- Plano atual, nº de utilizadores, data de expiração
- Estado do trial
- Módulos ativos/inativos (feature flags)

## 10. Auditoria e Dados — ROLE ADMIN

- Registo de logs (quem mudou o quê e quando)
- Exportação de dados
- Estado dos backups
- Eventos auditáveis, acesso aos logs e regras de auditoria

## 11. Autenticação / SSO — ROLE ADMIN

Login, SSO, Microsoft/Google, LDAP/Active Directory, OAuth, domínio autorizado.

## 12. Email — ROLE ADMIN

SMTP, remetente, nome do remetente, templates, assinatura, servidor, porta, SSL/TLS.

## 13. WhatsApp — ROLE ADMIN

Meta Cloud API, número, Business Account, templates, eventos autorizados, limites e estado da integração.

## 14. Backups — ROLE ADMIN

Periodicidade, retenção, destino, restauração e estado dos backups.

## 15. Sistema — ROLE ADMIN

Cache, jobs, filas, manutenção, limites, paginação, uploads e parâmetros técnicos.
