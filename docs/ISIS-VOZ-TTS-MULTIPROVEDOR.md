# Voz da Isis em português angolano: arquitetura multiprovedor (ElevenLabs ou VoiceStudio)

> Ficheiro de contexto para o Claude. Lê-o por inteiro antes de escrever ou alterar código.
> Este ficheiro complementa o `ISIS-SIMLI-MIGRACAO.md` (avatar com Simli). A voz gerada aqui é o áudio que alimenta o avatar.

## 1. Contexto

- Plataforma: **INNOVA** (LMS + HRM, B2B SaaS), web e mobile.
- Stack: **NestJS** (backend, TypeScript, Prisma) e **Next.js App Router** (frontend, TypeScript).
- A **Isis** é a tutora de IA. Responde por **texto e áudio**, e o áudio é usado pelo **Simli** para sincronizar a boca do avatar.
- Já existe conta e chave no Simli. Falta decidir e ligar a **voz**.

## 2. Objetivo

1. A Isis deve falar em **português angolano** (sotaque de Angola, vocabulário e ritmo naturais).
2. A plataforma deve funcionar com **ElevenLabs** ou com **VoiceStudio**, **trocando apenas uma variável de ambiente**, sem mexer no resto do código.
3. O áudio produzido deve ser compatível com o Simli e ter **baixa latência**.

## 3. Regras de trabalho (obrigatórias)

- Explica **passo a passo**, para principiantes, com **comandos exatos** e **cliques exatos** quando houver interface.
- Ao alterar código existente, **não envies o ficheiro completo**. Indica o **ficheiro**, as **linhas ou trechos a alterar** e o código novo desses trechos. Só envias ficheiro completo se for novo.
- Responde sempre em **português**.
- **Não inventes** endpoints, parâmetros, nomes de pacotes nem IDs de vozes. Antes de implementar cada adaptador, **consulta a documentação oficial** do fornecedor e confirma o que está abaixo.
- Se a documentação contradisser este ficheiro, **segue a documentação** e diz-me o que mudou.

## 4. Pontos a confirmar antes de programar

### 4.1 Qual é o "VoiceStudio"?
O nome é ambíguo. Existem vários serviços com nomes parecidos (por exemplo, catálogos de vozes que revendem vozes de outros fornecedores). **Pergunta-me qual é exatamente** (nome da empresa e endereço do site) e só depois escreves o adaptador. Até lá, deixa o adaptador VoiceStudio como **esqueleto com `TODO`**, sem inventar chamadas.

### 4.2 Sotaque angolano no ElevenLabs
- Segundo a documentação do ElevenLabs, **o sotaque vem da voz escolhida**, não de um parâmetro. Uma voz não treinada no idioma pode soar com sotaque estrangeiro.
- Pela API podes indicar o idioma com `language_code` (código ISO 639-1, por exemplo `pt`), mas isso **não escolhe Angola** em vez de Portugal ou Brasil.
- Confirma na documentação e na **Voice Library** (pesquisa com filtros de idioma/sotaque) se existe uma voz de português angolano adequada. Se não existir, as opções são:
  - **clonar uma voz** a partir de áudio de um falante angolano (ver secção 8, consentimento);
  - testar vozes multilingues em português e avaliar se o resultado serve.
- **Não assumas** que existe uma voz angolana pronta. Diz-me o que encontraste.

### 4.3 Formato de áudio exigido pelo Simli
Confirma na documentação do Simli o formato de áudio esperado (codificação, taxa de amostragem, canais) e se o áudio é enviado do **backend** ou do **frontend**. Se o ElevenLabs permitir escolher o formato de saída, confirma qual corresponde ao do Simli para **evitar conversões**. Se o VoiceStudio não suportar esse formato, prevê uma conversão no backend e diz-me qual ferramenta usar.

## 5. Arquitetura pretendida

```
Resposta da Isis (texto)
        │
        ▼
 TtsService (NestJS)  ──►  escolhe o fornecedor por TTS_PROVIDER
        │                    ├─ ElevenLabsProvider
        │                    └─ VoiceStudioProvider
        ▼
 áudio (formato aceite pelo Simli)
        │
        ├──► Simli (lip-sync do avatar)
        └──► (opcional) frontend, para tocar/guardar o áudio
```

Ideia central: o resto da plataforma **só conhece uma interface**. Cada fornecedor é um adaptador.

### Interface sugerida (TypeScript)

```ts
// tts/tts-provider.interface.ts
export interface TtsRequest {
  text: string;
  locale: 'pt-AO' | 'pt-PT' | 'pt-BR' | 'en' | 'fr';
  voiceId?: string; // se vazio, usa a voz por defeito do fornecedor
}

export interface TtsResult {
  audio: Buffer;          // ou um stream, conforme a documentação do Simli
  format: string;         // descreve o formato real devolvido
  provider: string;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(req: TtsRequest): Promise<TtsResult>;
  // Opcional, se o fornecedor suportar streaming:
  synthesizeStream?(req: TtsRequest): AsyncIterable<Buffer>;
}

export const TTS_PROVIDER = Symbol('TTS_PROVIDER');
```

> Isto é um ponto de partida. Ajusta-o à documentação dos fornecedores e do Simli, e mostra-me só o que criares ou alterares.

### Escolha do fornecedor por configuração

```env
# backend/.env  (não fazer commit)
TTS_PROVIDER=elevenlabs        # ou: voicestudio

ELEVENLABS_API_KEY=colocar_aqui
ELEVENLABS_VOICE_ID_PT_AO=colocar_aqui

VOICESTUDIO_API_KEY=colocar_aqui
VOICESTUDIO_VOICE_ID_PT_AO=colocar_aqui
```

No módulo NestJS, usa um **provider dinâmico** (`useFactory`) que lê `TTS_PROVIDER` e devolve o adaptador certo. Se o valor for desconhecido, a aplicação deve **falhar ao arrancar** com uma mensagem clara.

## 6. Plano de execução (por esta ordem)

Faz **uma fase de cada vez** e espera pela minha confirmação antes de avançar.

### Fase A: Descoberta e decisão
1. Pergunta-me qual é o VoiceStudio (secção 4.1).
2. Consulta a documentação do ElevenLabs, do VoiceStudio e do Simli (secções 4.2 e 4.3).
3. Faz um **resumo curto** do que confirmaste e do que ficou por confirmar.

### Fase B: Estrutura no backend (NestJS)
1. Criar a interface `TtsProvider` e o token de injeção.
2. Criar o `TtsModule` com o provider dinâmico controlado por `TTS_PROVIDER`.
3. Criar o `TtsService`, que é o **único ponto** usado pelo AI-Tutor para gerar voz.
4. Mostrar apenas ficheiros novos completos e, nos existentes, só os trechos a alterar.

### Fase C: Adaptador ElevenLabs
1. Implementar `ElevenLabsProvider` conforme a documentação (SDK ou chamada HTTP, o que for recomendado).
2. Usar `language_code` e a voz definida em `ELEVENLABS_VOICE_ID_PT_AO`.
3. Pedir o formato de áudio compatível com o Simli, se a documentação o permitir.
4. Tratar erros (chave inválida, limite excedido, voz inexistente) com mensagens claras.

### Fase D: Adaptador VoiceStudio
1. Só começar depois de eu responder à secção 4.1.
2. Implementar `VoiceStudioProvider` com a mesma interface.
3. Se o formato de áudio for diferente do exigido pelo Simli, propor e implementar a conversão.

### Fase E: Ligação ao Simli
1. O `TtsService` entrega o áudio ao fluxo do Simli, seguindo a documentação.
2. Preferir **streaming** (o áudio começa a seguir antes de estar completo) se ambos os serviços o suportarem, para reduzir o atraso.
3. Em frases longas, dividir o texto em partes curtas para a Isis começar a falar mais cedo.

### Fase F: Qualidade da voz em português angolano
1. Criar uma **lista de frases de teste** típicas do contexto corporativo da INNOVA (formações, RH, avisos), incluindo números, datas, moeda (Kwanza) e siglas.
2. Comparar as duas opções nessas frases e dar-me uma tabela simples: naturalidade, sotaque, pronúncia de números e nomes, latência e custo estimado.
3. Se a pronúncia de algum termo falhar, propor ajustes no texto antes do TTS (por exemplo, escrever números por extenso) em vez de alterar a voz.

### Fase G: Custos e robustez
- **Cache** de áudio para frases repetidas (por exemplo, saudações e mensagens fixas), guardando o resultado por `hash(texto + voz + fornecedor)`.
- **Limite de caracteres** por resposta e por utilizador/empresa (tenant), configurável.
- **Registo de uso** (caracteres sintetizados por fornecedor e por empresa) para controlar custos e poder repassá-los nos planos da INNOVA.
- **Plano B**: se o fornecedor escolhido falhar, tentar o outro (se configurado) e, em último caso, responder só com texto, sem partir a plataforma.
- Nenhuma chave de API no frontend nem no Git.

## 7. Critérios de aceitação

- [ ] Mudar `TTS_PROVIDER` troca de fornecedor sem alterar mais código.
- [ ] A voz é em português com sotaque angolano aceitável, validado por mim em ouvido.
- [ ] O áudio é aceite pelo Simli e a boca sincroniza com a fala.
- [ ] O atraso entre a resposta em texto e o início da fala é aceitável.
- [ ] Há cache, limite de uso, registo de caracteres e plano B.
- [ ] As chaves existem só no backend e fora do Git.
- [ ] O build do NestJS e do Next.js passa sem erros de TypeScript.

## 8. Notas legais e de custo

- **Consentimento na clonagem de voz:** se for clonada a voz de uma pessoa real (por exemplo, para obter o sotaque angolano), é necessário o **consentimento escrito** dessa pessoa para o uso comercial na INNOVA, com termos sobre duração e utilização. Verifica também as regras do fornecedor sobre clonagem. Guarda o consentimento junto com os documentos da empresa.
- **Preços e limites** mudam com frequência. Confirma nos planos oficiais, incluindo se o plano permite **uso comercial** e **clonagem de voz**.
- Vozes geradas por IA devem estar identificadas como tal perante os utilizadores finais, se a regulamentação ou os contratos com clientes o exigirem.

## 9. Primeiro passo agora

Começa pela **Fase A**: pergunta-me qual é o VoiceStudio, resume o que a documentação confirma e diz-me que decisões preciso de tomar antes de avançarmos.
