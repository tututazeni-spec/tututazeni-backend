# Design: A4-PR1 — Remover XSS em declarations/page.tsx

**Data:** 2026-07-13
**Faixa de auditoria:** A-4 (XSS)
**Severidade:** 🟠 Alto

## Problema

`frontend/app/(platform)/declarations/page.tsx:232` usa `dangerouslySetInnerHTML` com
uma regex de strip de tags (`/<[^>]*>/g`) em vez de sanitização real. A regex tem
bypasses conhecidos e o resultado é injectado como HTML pelo browser.

## Contexto

- `previewHtml` vem do campo `DeclarationTemplate.content` (texto plano com `{{variavel}}`),
  não do campo `bodyContent` (esse sim é HTML).
- Não existe editor rich-text para templates — o campo `content` é sempre texto simples.
- A intenção do regex é mostrar texto sem tags; `dangerouslySetInnerHTML` é desnecessário.

## Solução (Opção A)

Substituir `dangerouslySetInnerHTML` por React children. React faz escape automático;
o browser recebe texto, não HTML.

**Ficheiro:** `frontend/app/(platform)/declarations/page.tsx:232`

```tsx
// Antes
<pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans"
     dangerouslySetInnerHTML={{ __html: preview.previewHtml.replace(/<[^>]*>/g, ' ').trim() }} />

// Depois
<pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
  {preview.previewHtml.replace(/<[^>]*>/g, ' ').trim()}
</pre>
```

## Scope

- 1 ficheiro, 1 linha alterada
- Sem alterações ao backend, API, schema ou outros componentes
- Comportamento visual idêntico ao utilizador

## Critério de sucesso

O preview da declaração continua a mostrar o texto do template com variáveis substituídas,
sem tags HTML visíveis, e sem `dangerouslySetInnerHTML` no componente.
