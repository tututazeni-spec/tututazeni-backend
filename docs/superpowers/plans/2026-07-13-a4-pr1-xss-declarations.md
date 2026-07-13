# A4-PR1 — Remover XSS em declarations/page.tsx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar `dangerouslySetInnerHTML` do preview de declarações, substituindo por React children para remover vector XSS (A4, 🟠 Alto).

**Architecture:** Alteração cirúrgica de uma linha em `declarations/page.tsx`. Sem mudanças ao backend, API ou outros componentes. React faz escape automático do conteúdo — o browser recebe texto, não HTML.

**Tech Stack:** Next.js (App Router), React, TypeScript

## Global Constraints

- Não alterar comportamento visual — o utilizador não deve notar diferença
- Não alterar o backend nem o contrato da API
- Manter o strip de tags existente (`replace(/<[^>]*>/g, ' ').trim()`) — o conteúdo ainda pode ter tags se um admin tiver escrito HTML no campo `content`
- Ficheiro alvo: `frontend/app/(platform)/declarations/page.tsx`

---

### Task 1: Substituir `dangerouslySetInnerHTML` por React children

**Files:**
- Modify: `frontend/app/(platform)/declarations/page.tsx:232`

**Interfaces:**
- Consumes: `preview.previewHtml: string` (já existente no state)
- Produz: nenhuma alteração de interface — é mudança interna de renderização

- [ ] **Step 1: Localizar a linha exacta**

Abrir `frontend/app/(platform)/declarations/page.tsx` e confirmar linha 232:

```tsx
<pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans" dangerouslySetInnerHTML={{ __html: preview.previewHtml.replace(/<[^>]*>/g, ' ').trim() }} />
```

- [ ] **Step 2: Aplicar a alteração**

Substituir a linha 232 por:

```tsx
<pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
  {preview.previewHtml.replace(/<[^>]*>/g, ' ').trim()}
</pre>
```

A diferença: em vez de `dangerouslySetInnerHTML={{ __html: ... }}`, o conteúdo passa a ser React children. React serializa-o como texto — qualquer HTML restante é escapado automaticamente (`<` → `&lt;`, etc.).

- [ ] **Step 3: Verificar que não há erros de TypeScript**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: sem erros relacionados com `declarations/page.tsx`.

- [ ] **Step 4: Verificar a ausência de `dangerouslySetInnerHTML` no ficheiro**

```powershell
Select-String -Path "frontend/app/(platform)/declarations/page.tsx" -Pattern "dangerouslySetInnerHTML"
```

Expected: zero resultados.

- [ ] **Step 5: Teste manual — fluxo de preview**

1. Iniciar o frontend: `cd frontend && npm run dev`
2. Navegar para `/declarations`
3. Clicar em "Nova Declaração"
4. Avançar até ao Step 3
5. Clicar em "Ver Preview"
6. Confirmar que o texto do template aparece com variáveis substituídas e sem tags HTML visíveis
7. Confirmar que o scroll vertical funciona (o `max-h-48 overflow-y-auto` mantém-se)

- [ ] **Step 6: Commit**

```powershell
git add "frontend/app/(platform)/declarations/page.tsx"
git commit -m "fix(security): remove dangerouslySetInnerHTML sem sanitizacao em declarations preview (A4-PR1)"
```

Expected: commit criado com sucesso.
