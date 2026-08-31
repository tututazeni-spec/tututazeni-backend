# Foto de perfil do utilizador — upload self-service

**Data:** 2026-08-30
**Âmbito:** avatar do utilizador autenticado (o seu próprio), backend `innova` + frontend `frontend`

---

## Problema

O ícone no canto superior direito da plataforma (`Topbar.tsx`) é um círculo
desenhado à mão com um ícone genérico de pessoa (`lucide-react/User`) — nem
sequer mostra as iniciais. Não há forma de o utilizador carregar uma foto de
perfil, e essa foto não aparece em lado nenhum.

Queremos: o utilizador carrega uma foto a partir do canto superior direito, e
essa foto passa a aparecer em qualquer sítio onde hoje aparece o avatar de
iniciais **do próprio utilizador autenticado** (Topbar, Definições → Perfil, e
qualquer superfície "o meu perfil").

## Estado actual (levantamento)

### Backend (`innova`)

- `prisma/schema.prisma` — `model User` **já tem** `avatarUrl String?`
  (linha ~555). **Nenhuma migração é necessária.**
- `CreateUserDto`/`UpdateUserDto` (`src/users/users.dto.ts`) já expõem
  `avatarUrl?: string` — mas só via `PUT /users/:id`, que é rota
  administrativa/privilegiada.
- `GET /auth/me` (`src/auth/auth.service.ts#me`) devolve a linha `User`
  completa menos `password` (`const { password: _, ...rest } = user`) →
  **`avatarUrl` já vai no payload**. Não é preciso mexer nas leituras.
- `PUT /users/me/profile` (`src/users/users.controller.ts`) mapeia para
  `upsertProfile`, que escreve a **relação `Profile`** (bio/interests/
  careerGoals/linkedinUrl), **não** os campos escalares de `User`. Não serve
  para gravar `avatarUrl`.
- **Não existe infraestrutura de upload de ficheiros** em toda a app:
  `grep` por `FileInterceptor|multer|diskStorage|@UploadedFile|ServeStatic|
  useStaticAssets` não devolve nada. O padrão do código para ficheiros
  (`document-repository`) é o cliente enviar uma **URL** que já vive em
  storage externo (S3/Azure), validada por `IsAllowedFileUrl` contra um
  allowlist de host. Não há SDK de S3 nem credenciais no projecto.
- `main.ts` — `ValidationPipe` global com `whitelist: true`,
  `forbidNonWhitelisted: true`, `transform: true`. Body parser é o default do
  Express (limite ~100KB) → ver nota em "Riscos".

### Frontend (`frontend`, repo separado `tututazeni-frontend`)

- `components/ui/Avatar.tsx` — **já suporta** `url?: string`. Com `url`
  renderiza `next/image` (`fill`, `object-cover`) dentro de um círculo; sem
  `url` gera um gradiente determinístico pelo nome + iniciais
  (`getInitials`). Props: `{ name, url?, size?: 'sm'|'md'|'lg', className? }`.
  Importado em ~40 ficheiros.
- `components/Topbar.tsx` — **não usa** `<Avatar>`. Tem um `<div>` de 32px com
  `background: linear-gradient(...)` e um `<User size={16}>` da lucide.
  Estilos inline. Usa `useCurrentUser()` para nome/email.
- `hooks/useCurrentUser.ts` — interface `CurrentUser` **não** tem `avatarUrl`.
  Query key `queryKeys.auth.me()`, `staleTime: STALE_TIME.SEMI_STATIC`.
- `components/settings/TabPerfil.tsx` — renderiza
  `<Avatar name={user.fullName} size="lg" />` (sem `url`, sem edição).
- `next.config.ts` — `images.remotePatterns` só `https`, qualquer host.
  `next/image` **não** lida bem com `data:` URIs.
- **Não há** nenhum `<input type="file">` / `FileReader` / `FormData` em todo o
  frontend — não há padrão de upload a seguir.
- Chamadas à API: proxy `/api/*` → Nest; auth por cookie; hooks
  `useApiQuery` / `useApiMutation`; `useToast()` para feedback;
  `queryClient.invalidateQueries` para revalidar.

## Decisões (confirmadas com o utilizador)

1. **Armazenamento: base64 (data URL) directamente em `User.avatarUrl`.**
   O browser redimensiona para 256×256 e envia `data:image/jpeg;base64,...`
   (~20–40KB). Zero infra nova, zero dependências novas no backend,
   comportamento idêntico em local e produção. Custo aceite: a string viaja no
   `/auth/me` (que já é cacheado, `SEMI_STATIC`). Se mais tarde se quiser
   storage "a sério", o contrato da rota e a prop `url` do `<Avatar>` não
   mudam — muda só o conteúdo da string.
2. **Âmbito: só o avatar do utilizador autenticado.** Wire do `<Avatar url>`
   no Topbar + Definições. Outras superfícies (listas de colaboradores,
   organograma, comentários, leaderboards) ficam de fora — já passam
   `<Avatar>` e acenderão sozinhas se/quando os respectivos dados trouxerem
   `avatarUrl`.
3. **Recorte: auto center-crop.** Recorte quadrado ao centro + resize via
   `<canvas>`, sem dependência nova. Sem cropper interactivo.

## Desenho

### Backend — `innova`

#### Novo validador

`src/common/validators/is-base64-image-data-url.decorator.ts`

- `@IsBase64ImageDataUrl()` — validador class-validator.
- Regra: a string tem de casar
  `/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/`.
- Mensagem: `"avatarUrl deve ser uma data URL de imagem (png, jpeg ou webp) em base64"`.
- (O limite de tamanho fica no `@MaxLength` do DTO, não no validador.)

#### DTO

Em `src/users/users.dto.ts`:

```ts
export class UpdateMyAvatarDto {
  @ApiProperty({ example: 'data:image/jpeg;base64,/9j/4AAQ...' })
  @IsString()
  @MaxLength(200_000) // ~150KB descodificados — válvula de segurança
  @IsBase64ImageDataUrl()
  avatarUrl!: string;
}
```

#### Rotas — `src/users/users.controller.ts`

Junto às outras rotas `me/*` (todas já sob `JwtAuthGuard` a nível do
controller/guard global):

```ts
@Patch('me/avatar')
@ApiOperation({ summary: 'Definir a foto de perfil do utilizador autenticado' })
setMyAvatar(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateMyAvatarDto) {
  return this.svc.setAvatar(user.id, dto.avatarUrl);
}

@Delete('me/avatar')
@ApiOperation({ summary: 'Remover a foto de perfil do utilizador autenticado' })
@HttpCode(HttpStatus.OK)
removeMyAvatar(@CurrentUser() user: CurrentUserData) {
  return this.svc.clearAvatar(user.id);
}
```

#### Serviço — `src/users/users.service.ts`

```ts
async setAvatar(userId: number, avatarUrl: string) {
  await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  return { avatarUrl };
}

async clearAvatar(userId: number) {
  await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  return { avatarUrl: null };
}
```

(Usar `this.prisma.user`, não `this.prisma.read.user` — é escrita. Seguir o
padrão de escrita já usado no ficheiro.)

#### Body parser

O limite default do body parser do Express (~100KB) pode rejeitar uma data URL
de ~150KB com **413** antes de chegar ao `ValidationPipe`. Alinhar o limite
com o `@MaxLength(200_000)`:

- Em `src/main.ts`, após `NestFactory.create`:
  `app.useBodyParser('json', { limit: '512kb' })`
  (ou `app.use(express.json({ limit: '512kb' }))` se `useBodyParser` não
  estiver disponível nesta versão do Nest — confirmar na implementação).
- Só afecta o parsing; a defesa real de tamanho continua no `@MaxLength`.

#### `/auth/me`

Nenhuma alteração — já devolve `avatarUrl`. Cobrir com uma asserção no
integration spec.

#### Testes

- `src/common/validators/is-base64-image-data-url.decorator.spec.ts` —
  aceita `data:image/png;base64,iVBOR...`, `data:image/jpeg;base64,...`,
  `data:image/webp;base64,...`; rejeita `https://...`, `data:text/html;...`,
  string vazia, `data:image/gif;base64,...`.
- `src/users/users.controller.spec.ts` (ou o spec existente do controller) —
  `setMyAvatar` e `removeMyAvatar` chamam o serviço com `user.id` e devolvem o
  shape esperado (mock do `UsersService`).
- `test/integration/users-avatar.integration-spec.ts` — login → `PATCH
  /users/me/avatar` com data URL válida → 200 `{ avatarUrl }` → `GET /auth/me`
  devolve o mesmo `avatarUrl` → `DELETE /users/me/avatar` → `GET /auth/me`
  devolve `avatarUrl: null`. Também: `PATCH` com `https://evil.com/x.png` →
  400. Respeitar a infra de integração (`DB_POOL_MAX`, limpeza FK-ordered,
  Redis a correr).

### Frontend — `frontend`

#### `hooks/useCurrentUser.ts`

Adicionar à interface `CurrentUser`:

```ts
avatarUrl?: string | null;
```

#### `components/ui/Avatar.tsx`

Quando `url` começa por `data:`, renderizar `<img>` simples (não `next/image`)
— o optimizer do Next não processa data URIs e não queremos depender de
`remotePatterns`. Restante comportamento (tamanhos, `rounded-full`,
`object-cover`, fallback de iniciais) igual. A API pública do componente
**não muda**.

```tsx
if (url) {
  const isData = url.startsWith('data:');
  return (
    <div className={cn('relative overflow-hidden rounded-full', SIZE_CLASSES[size], className)}>
      {isData ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Image src={url} alt={name} fill className="object-cover" />
      )}
    </div>
  );
}
```

#### `components/ui/AvatarUploader.tsx` (novo)

Componente reutilizável (Topbar em modal, Definições inline).

Props:

```ts
interface AvatarUploaderProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
}
```

Comportamento:

- Renderiza `<Avatar name url size />` + um botão "Alterar foto" e, se `url`,
  "Remover foto".
- `<input type="file" accept="image/png,image/jpeg,image/webp" hidden>` com
  `ref`; o botão "Alterar foto" faz `inputRef.current.click()`.
- `onChange` do input:
  1. Rejeitar se `file.size > 8 * 1024 * 1024` → toast "Imagem demasiado
     grande (máx. 8MB)".
  2. `FileReader.readAsDataURL` → `new Image()` → `onload`.
  3. `resizeToDataUrl(img, 256, 0.85)`:
     - `canvas` 256×256; calcular quadrado central do source
       (`side = min(w, h)`, `sx = (w - side) / 2`, `sy = (h - side) / 2`);
       `ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256)`;
       `canvas.toDataURL('image/jpeg', quality)`.
  4. Se `dataUrl.length > 120_000`: repetir com `quality = 0.7`; se ainda
     `> 160_000`: repetir com `192` px e `quality = 0.7`; se ainda exceder →
     toast "Não foi possível comprimir a imagem o suficiente, tenta outra".
  5. `mutateSet(dataUrl)`.
- Estado `pending` do mutation → desactiva botões, mostra spinner.
- "Remover foto" → `mutateRemove()`.
- Sucesso/erro → `useToast()`.

`resizeToDataUrl` fica numa função pura exportável
(`lib/image.ts` — novo, ou co-localizada) para poder ter teste unitário do
cálculo do center-crop (o `drawImage` em si não é testável em vitest sem
canvas mock; testar só a matemática `computeSquareCrop(w, h)`).

#### `hooks/useUpdateAvatar.ts` (novo)

```ts
export function useUpdateAvatar() {
  const qc = useQueryClient();
  const onSettled = () => qc.invalidateQueries({ queryKey: queryKeys.auth.me() });

  const set = useApiMutation<{ avatarUrl: string }, string>(
    (avatarUrl) => ({ method: 'PATCH', url: '/users/me/avatar', body: { avatarUrl } }),
    { onSettled },
  );
  const remove = useApiMutation<{ avatarUrl: null }, void>(
    () => ({ method: 'DELETE', url: '/users/me/avatar' }),
    { onSettled },
  );
  return { set, remove };
}
```

(Assinatura exacta a ajustar à API real de `useApiMutation` no repo — ver
outros hooks de mutation existentes.)

A invalidação de `queryKeys.auth.me()` é o mecanismo "aparece em todo o lado":
Topbar e `TabPerfil` consomem a mesma entrada de cache.

#### `components/Topbar.tsx`

- Substituir o `<div>` de 32px + `<User>` por:
  `<Avatar name={user?.fullName ?? 'Utilizador'} url={user?.avatarUrl ?? undefined} size="sm" />`.
- Envolver avatar + bloco nome/email num `<button>` (reset de estilos inline:
  `background: none; border: none; cursor: pointer; display: flex; ...`) que
  faz `setOpen(true)`.
- `<Modal open={open} onClose={...} title="Foto de perfil">` (de
  `components/ui/Modal.tsx`) com `<AvatarUploader name={user.fullName}
  url={user?.avatarUrl} size="lg" />` lá dentro.
- Remover o import `User` da lucide se deixar de ser usado (`Bell`, `Search`
  ficam).

#### `components/settings/TabPerfil.tsx`

- Trocar `<Avatar name={user.fullName} size="lg" />` por
  `<AvatarUploader name={user.fullName} url={user.avatarUrl ?? undefined} size="lg" />`.

#### Testes (frontend, vitest)

- `lib/image.test.ts` — `computeSquareCrop(w, h)` para paisagem, retrato,
  quadrado.
- `components/ui/Avatar.test.tsx` — com `url` `data:` renderiza `<img>`; com
  `url` `https:` renderiza o componente do Next; sem `url` renderiza iniciais.
- `hooks/useUpdateAvatar.test.ts` (se houver padrão de teste de hooks com
  MSW/mock) — `set` faz `PATCH` no endpoint certo e invalida `auth.me`.

## Contrato da API (resumo)

| Método | Rota | Body | Resposta | Auth |
|---|---|---|---|---|
| `PATCH` | `/users/me/avatar` | `{ avatarUrl: "data:image/jpeg;base64,..." }` | `200 { avatarUrl }` | JWT (o próprio) |
| `DELETE` | `/users/me/avatar` | — | `200 { avatarUrl: null }` | JWT (o próprio) |
| `GET` | `/auth/me` | — | `200 { ..., avatarUrl }` (já existente) | JWT |

Erros: `400` data URL inválida ou `> 200_000` chars; `401` sem sessão.

## Riscos e mitigações

- **Body parser 413 antes da validação** — alinhar limite do JSON parser em
  `main.ts` para `512kb`. Testado no integration spec com uma data URL
  próxima do limite.
- **Payload do `/auth/me` cresce ~30KB** — aceitável; query já cacheada como
  `SEMI_STATIC`. Não adicionar `avatarUrl` a listas de utilizadores (fora de
  âmbito) para não multiplicar o custo.
- **`next/image` e data URIs** — resolvido com o ramo `<img>` no `Avatar`.
- **XSS via data URL** — o validador restringe a `image/(png|jpeg|webp)`;
  `data:image/svg+xml` fica de fora (evita SVG com script). Renderização é
  sempre em `<img src>`, nunca `innerHTML`.
- **Utilizador sem `fullName`?** — não acontece (`fullName` é `@db.Text` NOT
  NULL); o fallback `'Utilizador'` no Topbar é só para o estado de loading.
- **Infra de integração** — respeitar `DB_POOL_MAX`, limpeza FK-ordered,
  Redis local; correr a suite de integração completa antes de fechar.

## Fora de âmbito

- Fotos de outros utilizadores em listas / organograma / comentários /
  leaderboards.
- Cropper interactivo (zoom/arrastar).
- Storage externo (S3/Azure/Cloudinary) e upload directo do browser.
- Histórico/versões de avatar; moderação de imagem.

## Rollout

1. **PR backend** (`innova`): validador + DTO + rotas + serviço + limite do
   body parser + testes. Branch → PR → check `quality` verde → squash-merge.
2. **PR frontend** (`frontend`): tipo + `Avatar` data-URL + `AvatarUploader` +
   `useUpdateAvatar` + `lib/image` + Topbar + TabPerfil + testes. Branch → PR
   → CI verde → merge. Depende do contrato do PR backend estar em `main`.
3. Verificação por repo: `tsc --noEmit`, build, testes, `prettier --write`.
   Manual: carregar foto no Topbar → confirmar que aparece no Topbar e em
   Definições → Perfil sem reload; "Remover foto" volta às iniciais.
