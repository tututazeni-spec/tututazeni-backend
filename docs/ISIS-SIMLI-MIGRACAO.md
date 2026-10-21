# Migração da Isis (AI-Tutor): de visemas para Simli

> Ficheiro de contexto para o Claude. Lê-o por inteiro antes de escrever ou alterar código.

## 1. Contexto

- Plataforma: **INNOVA** (LMS + HRM, B2B SaaS), web e mobile.
- Stack: **NestJS** (backend, TypeScript, Prisma) e **Next.js App Router** (frontend, TypeScript).
- A **Isis** é a tutora de IA do módulo AI-Tutor. Tem de responder por **texto e áudio**, buscando informação na plataforma e na internet.
- Já existe conta no **Simli**, um **avatar criado** e uma **chave de API**.

## 2. Objetivo

1. **Remover** a animação por visemas, que não funcionou corretamente.
2. **Substituir** pelo **Simli** (avatar com lip-sync em tempo real, criado a partir da imagem da Isis).
3. Manter o resto do fluxo: pergunta do utilizador, backend decide a resposta, a Isis responde com texto e áudio.

## 3. Regras de trabalho (obrigatórias)

- Explica **passo a passo**, em linguagem para principiantes, com **comandos exatos** e **cliques exatos** quando houver interface.
- Ao alterar código existente, **não enviar o ficheiro completo**. Indica apenas o **ficheiro**, as **linhas ou trechos a alterar** e o código novo desses trechos. Só envia um ficheiro completo se for novo.
- Responde sempre em **português**.
- **Não inventes** endpoints, nomes de pacotes ou parâmetros do Simli. Antes de escrever a integração, **consulta a documentação oficial do Simli** (site oficial e documentação para desenvolvedores) e confirma:
  - o pacote/SDK recomendado para web;
  - como criar a sessão e obter token;
  - o formato de áudio esperado (taxa de amostragem, canais, codificação);
  - se o português é suportado e como a voz/áudio é enviada;
  - limites do plano atual (minutos, sessões simultâneas).
- Se algo na documentação for diferente do que este ficheiro assume, **segue a documentação** e diz-me o que mudou.

## 4. Segurança (crítico)

- A **chave de API do Simli nunca vai para o frontend** nem para o Git.
- Guarda-a em variáveis de ambiente **apenas no backend**:

```env
# backend/.env  (não fazer commit)
SIMLI_API_KEY=colocar_aqui_a_chave
SIMLI_FACE_ID=colocar_aqui_o_id_do_avatar
```

- Confirma que `.env` está no `.gitignore`.
- O frontend só recebe do backend o que for necessário para abrir a sessão (por exemplo um token temporário), conforme a documentação do Simli.
- Os endpoints do backend para a Isis ficam **protegidos por autenticação** (utilizador e empresa/tenant da INNOVA).

## 5. Arquitetura pretendida

```
Utilizador (Next.js)
   │  pergunta (texto)
   ▼
NestJS  ──► gera a resposta da Isis (plataforma + internet)
   │
   ├──► texto da resposta  ──► frontend (mostra o texto)
   └──► áudio da resposta (TTS) ──► Simli ──► vídeo do avatar com lip-sync
                                                   │
                                                   ▼
                                       Next.js (elemento de vídeo)
```

Pontos a decidir **com base na documentação do Simli**:

- O áudio é enviado ao Simli **a partir do frontend** ou **a partir do backend**?
- O Simli faz também o TTS ou recebe áudio já pronto?

Explica-me a opção escolhida e porquê antes de implementar.

## 6. Plano de execução (por esta ordem)

Faz **uma fase de cada vez** e espera pela minha confirmação antes de passar à seguinte.

### Fase A: Limpeza dos visemas
1. Procura todo o código ligado a visemas. Comandos sugeridos, a correr na raiz do projeto:

```bash
grep -rni "viseme" --include=*.ts --include=*.tsx --include=*.js --include=*.json .
grep -rni "mouth" --include=*.ts --include=*.tsx .
```

2. Lista-me os ficheiros encontrados e o que cada um faz.
3. Indica **o que remover** e **o que manter** (o componente visual da Isis, a caixa de interação e o ecrã de chat ficam).
4. Remove dependências que só serviam os visemas, indicando o comando `npm uninstall ...` exato.

### Fase B: Backend (NestJS)
1. Adicionar as variáveis `SIMLI_API_KEY` e `SIMLI_FACE_ID` à configuração (`ConfigModule`).
2. Criar, no módulo do AI-Tutor, o código necessário para falar com o Simli (por exemplo, um serviço `SimliService` e um endpoint protegido para iniciar a sessão), conforme a documentação.
3. Mostrar apenas os trechos a criar ou alterar, com o caminho do ficheiro.

### Fase C: Frontend (Next.js App Router)
1. Instalar o SDK/pacote do Simli que a documentação indicar (comando exato).
2. Criar o componente da Isis com Simli (por exemplo `IsisAvatar.tsx`), tipado em TypeScript, com:
   - estado de ligação (a ligar, ligada, erro, terminada);
   - elemento de vídeo e de áudio para a stream;
   - botões de iniciar e terminar a conversa.
3. Colocar o componente onde hoje está a imagem estática da Isis, **com o dobro do tamanho atual**, como já pedido.
4. Se o componente usar APIs do browser, marcá-lo com `"use client"` e explicar porquê.

### Fase D: Fluxo de resposta (texto + áudio)
1. Ligar a resposta da Isis (texto) ao áudio (TTS) e ao envio para o Simli.
2. Mostrar o texto da resposta no chat enquanto a Isis fala.
3. Garantir que o **português** é falado corretamente; se a voz não for boa, propor alternativa.

### Fase E: Custos e robustez
O Simli em tempo real cobra por tempo de uso, por isso implementar:
- **Terminar a sessão** ao fechar o separador, sair da página ou ficar inativo (por exemplo, após alguns minutos sem interação).
- **Limite de duração** por sessão, configurável.
- Opção de ativar o avatar apenas em planos ou perfis definidos pela INNOVA.
- **Plano B**: se o Simli falhar ou o limite acabar, a Isis continua com a **imagem estática + texto + áudio**, sem partir a plataforma.
- Tratamento de erros com mensagens claras ao utilizador, em PT/EN/FR se a plataforma já tiver i18n.

## 7. Critérios de aceitação

- [ ] Não resta código de visemas nem dependências inúteis.
- [ ] A chave do Simli só existe no backend e fora do Git.
- [ ] A Isis aparece com o avatar do Simli e a boca acompanha a fala em português.
- [ ] O texto da resposta aparece no chat.
- [ ] A sessão termina ao sair da página e por inatividade.
- [ ] Existe plano B (imagem estática) quando o Simli falha.
- [ ] O build do Next.js e do NestJS passa sem erros de TypeScript.

## 8. Testes manuais que vou fazer

1. Perguntar algo simples e ver se a Isis responde com texto e voz sincronizada.
2. Fechar o separador a meio da fala e confirmar que a sessão termina.
3. Desligar a internet ou usar uma chave inválida e confirmar que aparece o plano B.
4. Testar no telemóvel (web e app móvel).

## 9. Primeiro passo agora

Começa pela **Fase A**: pede-me para colar o resultado dos comandos `grep` e os ficheiros relevantes, e diz-me exatamente o que remover.
