No módulo de Cursos da plataforma, NENHUM conteúdo abre ao clicar numa lição: PDF carregado, PPTX carregado, vídeo carregado, áudio carregado, URL do YouTube, URL de áudio (Spotify e outros) e texto, link, interactivo, questionario, aula ao vivo colado diretamente na plataforma. Como falha tudo, a causa deve ser comum a todos os tipos. Resolve o problema de ponta a ponta.

## PASSO 1 — DIAGNÓSTICO (não alteres nada ainda)

- Localiza o componente/página que mostra uma lição ou conteúdo de curso (viewer/player) e a rota/endpoint do backend que devolve esse conteúdo.
- Segue o fluxo completo: clique na lição → pedido à API → resposta → renderização.
- Verifica, por esta ordem, as causas mais comuns:
  1. O endpoint devolve erro (404/401/403/500) ou dados vazios; lê os logs do backend e corre o pedido manualmente.
  2. O campo que guarda o tipo (pdf/pptx/video/audio/url/texto) ou o caminho/URL do ficheiro vem vazio, com nome diferente ou mal gravado na base de dados.
  3. Os ficheiros carregados não estão a ser servidos (pasta de uploads sem rota estática, caminho errado, falta de permissões, ficheiros que não existem no disco/storage).
  4. URL base errada no frontend (localhost vs produção, http vs https, variável de ambiente em falta).
  5. CORS, CSP ou X-Frame-Options a bloquear iframes, embeds e ficheiros.
  6. Autenticação: o token não é enviado no pedido do ficheiro (ex.: `<iframe>`, `<video>`, `<audio>` não enviam headers).
  7. Erros de JavaScript na consola (variável undefined, import em falta, componente que rebenta e deixa o viewer em branco).
  8. Proxy/Nginx com limite de tamanho, tipos MIME errados ou rota `/uploads` não configurada.
- Diz-me qual é a causa raiz encontrada, com evidência (linha de código, resposta da API, erro de log).

## PASSO 2 — CORREÇÃO

Corrige a causa raiz e garante que cada tipo abre corretamente:

- **PDF:** visualizador embutido (iframe/embed/pdf.js) com fallback "Abrir/Descarregar".
- **PPTX:** visualização funcional (conversão para PDF no servidor, ou fallback de descarga) e nunca página em branco.
- **Vídeo carregado:** `<video controls>` com o MIME correto e suporte a streaming (Range requests).
- **Áudio carregado:** `<audio controls>` com o MIME correto.
- **YouTube:** converter qualquer formato de link (watch, youtu.be, shorts) para URL embed e usar iframe.
- **Spotify e outros URLs de áudio:** usar o embed oficial quando existir; caso contrário, mostrar botão "Abrir link".
- **Texto colado:** renderizar de forma segura (sanitizar HTML, manter quebras de linha).
- Qualquer erro deve mostrar mensagem clara ao utilizador, nunca ecrã em branco.

## PASSO 3 — VERIFICAÇÃO

- Testa os 8 tipos de conteúdo e confirma que cada um abre.
- Corre os testes existentes e o build; não quebres mais nada.
- No fim, resume em português: causa raiz, ficheiros alterados e como testar manualmente.

## Regras

Faz alterações mínimas e seguras, não apagues dados nem ficheiros carregados, e pergunta-me antes de qualquer alteração à base de dados ou ao servidor de produção.
