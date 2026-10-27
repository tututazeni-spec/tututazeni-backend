# Kubernetes (caminho de escala — não é o destino actual)

Produção hoje é Docker Compose num VPS (`ops/docker-compose.prod.yml`). Estes manifestos
são o equivalente para quando o gatilho de `docs/deploy/ha-and-spof.md` for atingido
(SLA formal, >300 req/s sustentados, deploy sem janela). Postgres continua **gerido/externo**
e o Redis deve passar a gerido (deixa de ser SPOF).

```bash
# 1. segredos (nunca no git) — as mesmas chaves de ops/.env.production.example
kubectl create namespace innova
kubectl -n innova create secret generic innova-secrets --from-env-file=.env.production
# 2. migrations ANTES do rollout (ver migrate.yaml)
kubectl apply -f ops/k8s/migrate.yaml
kubectl -n innova wait --for=condition=complete job/migrate --timeout=300s
# 3. aplicar (a tag da imagem está em kustomization.yaml)
kubectl apply -k ops/k8s
kubectl -n innova rollout status deploy/app
# rollback da app (não desfaz migrations — têm de ser expand/contract)
kubectl -n innova rollout undo deploy/app
```

Pré-requisitos: ingress-nginx, metrics-server (HPA), certificado Cloudflare Origin CA (ou cert-manager)
no Secret `innova-tls`, CNI com NetworkPolicy (Calico/Cilium). Substituir `innova.example.com`
pelo `DOMAIN` real em `ingress.yaml`.

Validação local: `kubectl kustomize ops/k8s` (não foi corrido no cluster — não existe cluster).
