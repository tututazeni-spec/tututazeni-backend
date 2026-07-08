# Template do Alertmanager (regra 9). O deploy.sh substitui os placeholders
# (VAR entre chavetas com $) pelos valores do .env.production e escreve
# monitoring/alertmanager.yml (gitignored).
# Routing: critical -> email + Telegram; warning -> Telegram; info -> só UI;
# Watchdog -> heartbeat ao healthchecks.io (dead-man externo).
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

  - name: 'aviso'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: ''

  # info fica só na UI (sem canais)
  - name: 'apenas-ui'

  # heartbeat: POST ao healthchecks.io a cada ~2m enquanto o Watchdog dispara
  - name: 'deadman'
    webhook_configs:
      - url: '${HEALTHCHECKS_PING_URL}'
        send_resolved: false
