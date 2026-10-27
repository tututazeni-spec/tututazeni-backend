# Template do Alertmanager (regra 9). O deploy.sh substitui os placeholders
# (VAR entre chavetas com $) pelos valores do .env.production e escreve
# monitoring/alertmanager.yml (gitignored).
# Routing: critical -> email + Telegram (+ SMS e Slack se configurados);
# warning -> Telegram (+ Slack se configurado); info -> só UI;
# Watchdog -> heartbeat ao healthchecks.io (dead-man externo).
# Linhas com prefixo "#SLACK# " / "#SMS# " são canais OPCIONAIS: o deploy.sh remove o
# prefixo se SLACK_WEBHOOK_URL / ALERT_SMS_TO estiverem preenchidos, senão descarta a linha.
global:
  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'
  smtp_from: '${SMTP_USER}'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'
  smtp_require_tls: true

route:
  receiver: 'apenas-ui'
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    # dead-man primeiro: nunca pode cair nos receivers de notificação
    - matchers: ['alertname="Watchdog"']
      receiver: 'deadman'
      group_wait: 0s
      group_interval: 1m
      repeat_interval: 2m
    - matchers: ['severity="critical"']
      receiver: 'critico'
    - matchers: ['severity="warning"']
      receiver: 'aviso'

receivers:
  - name: 'critico'
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: ''
#SLACK#     slack_configs:
#SLACK#       - api_url: '${SLACK_WEBHOOK_URL}'
#SLACK#         send_resolved: true
#SLACK#         title: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
#SLACK#         text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ "\n" }}{{ end }}'
#SMS#     webhook_configs:
#SMS#       - url: 'http://sms-relay:9094/alert'
#SMS#         send_resolved: false

  - name: 'aviso'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: ''
#SLACK#     slack_configs:
#SLACK#       - api_url: '${SLACK_WEBHOOK_URL}'
#SLACK#         send_resolved: true
#SLACK#         title: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
#SLACK#         text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ "\n" }}{{ end }}'

  # info fica só na UI (sem canais)
  - name: 'apenas-ui'

  # heartbeat: POST ao healthchecks.io a cada ~2m enquanto o Watchdog dispara
  - name: 'deadman'
    webhook_configs:
      - url: '${HEALTHCHECKS_PING_URL}'
        send_resolved: false
