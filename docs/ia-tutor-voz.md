# Comando de voz no Ísis (IA Tutor) — INNOVA

Guia de implementação de voz no módulo IA Tutor:

1. **Entrada por voz:** carregas no botão, falas, o browser transcreve e envia a pergunta ao tutor.
2. **Resposta por voz:** o tutor fala a resposta enquanto o texto aparece em simultâneo, com destaque ao ritmo da voz.

**Stack considerada:** Next.js 15 (App Router) no frontend, NestJS no backend, Gemini Flash como IA.

---

## 1. Escolher a abordagem

| | A) Web Speech API | B) Gravar áudio + Gemini |
|---|---|---|
| Custo | Grátis | Usa a quota Gemini |
| Backend | Sem alterações | Novo endpoint |
| Browsers | Chrome, Edge, Safari (Firefox não) | Todos |
| Esforço | Baixo | Médio |

**Recomendação:** começar pela opção A e deixar a B como reforço.

---

## 2. Opção A — Reconhecimento de voz no browser

Fluxo: carregas no botão → falas → o browser transcreve → o texto vai para o chat do tutor que já existe.

### 2.1 Hook de entrada de voz

**`hooks/useVoiceInput.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

export function useVoiceInput(onFinal: (text: string) => void, lang = 'pt-PT') {
  const recRef = useRef<Recognition | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinal(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Permite o acesso ao microfone.' : e.error);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    recRef.current = rec;
    setSupported(true);
  }, [lang, onFinal]);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setError(null);
    if (listening) {
      rec.stop();
    } else {
      rec.start();
      setListening(true);
    }
  }, [listening]);

  return { supported, listening, interim, error, toggle };
}
```

### 2.2 Botão do microfone

**`components/ia-tutor/MicButton.tsx`**

```tsx
'use client';
import { Mic, Square } from 'lucide-react';

interface Props {
  listening: boolean;
  onClick: () => void;
}

export function MicButton({ listening, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? 'Parar gravação' : 'Falar com o tutor'}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition
        ${listening ? 'animate-pulse bg-red-500 text-white' : 'bg-[#0F1F3D] text-[#D4A017] hover:opacity-90'}`}
    >
      {listening ? <Square size={16} /> : <Mic size={18} />}
    </button>
  );
}
```

---

## 3. Resposta por voz com transcrição em simultâneo

Usa a `speechSynthesis` do browser: grátis e sem alterações no backend.

### 3.1 Hook de voz do tutor

**`hooks/useSpeech.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Remove markdown para a voz não ler "asterisco asterisco"
export function toSpeakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>~-]{1,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeech(lang = 'pt-PT') {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [charIndex, setCharIndex] = useState(0);
  const [spokenText, setSpokenText] = useState('');
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    setSupported(true);

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang === lang) ??
        voices.find((v) => v.lang.startsWith('pt')) ??
        null;
    };
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
      window.speechSynthesis.cancel();
    };
  }, [lang]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (markdown: string) => {
      if (!supported) return;
      const text = toSpeakable(markdown);
      if (!text) return;

      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 1;
      if (voiceRef.current) u.voice = voiceRef.current;

      setSpokenText(text);
      setCharIndex(0);

      u.onstart = () => setSpeaking(true);
      u.onboundary = (e) => setCharIndex(e.charIndex);
      u.onend = () => {
        setSpeaking(false);
        setCharIndex(text.length);
      };
      u.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(u);
    },
    [supported, lang],
  );

  return { supported, speaking, charIndex, spokenText, speak, stop };
}
```

### 3.2 Componente com texto em destaque

**`components/ia-tutor/SpeakingText.tsx`**

```tsx
'use client';

interface Props {
  text: string;      // texto já limpo (spokenText)
  charIndex: number; // posição actual da voz
}

export function SpeakingText({ text, charIndex }: Props) {
  const spoken = text.slice(0, charIndex);
  const rest = text.slice(charIndex);

  return (
    <p className="text-sm leading-relaxed">
      <span className="text-[#0F1F3D]">{spoken}</span>
      <span className="text-gray-400">{rest}</span>
    </p>
  );
}
```

- **Enquanto o Ísis fala:** mostra-se o `SpeakingText` (o texto "acende" ao ritmo da voz).
- **Quando acaba:** mostra-se a bolha normal com markdown.

---

## 4. Ligação ao chat do tutor

Adapta `sendMessage` ao nome da função que o teu chat já usa para enviar texto. Tem de devolver o texto da resposta.

```tsx
const [voiceReplies, setVoiceReplies] = useState(true);

const { speak, stop, speaking, charIndex, spokenText } = useSpeech();

const handleVoice = useCallback(
  async (text: string) => {
    if (!text) return;
    const reply = await sendMessage(text); // devolve o texto da resposta
    if (voiceReplies && reply) speak(reply);
  },
  [sendMessage, speak, voiceReplies],
);

const { supported, listening, interim, error, toggle } = useVoiceInput(handleVoice);

// Ao carregar no microfone, o tutor cala-se primeiro
const onMicClick = () => {
  stop();
  toggle();
};
```

JSX:

```tsx
{supported && <MicButton listening={listening} onClick={onMicClick} />}
{listening && <p className="text-sm text-gray-500">{interim || 'A ouvir…'}</p>}
{error && <p className="text-sm text-red-600">{error}</p>}

{speaking && (
  <div className="rounded-xl border p-3">
    <SpeakingText text={spokenText} charIndex={charIndex} />
    <button onClick={stop} className="mt-2 text-xs text-[#D4A017]">
      Parar voz
    </button>
  </div>
)}
```

Notas:
- `handleVoice` tem de estar em `useCallback`, para não recriar o reconhecimento a cada render.
- A resposta só é falada quando a pergunta foi feita por voz, por isso quem escreve não é surpreendido com som.
- `voiceReplies` permite um botão para ligar ou desligar o som.

---

## 5. Opção B — Gravar áudio e transcrever com Gemini

Útil para funcionar em qualquer browser ou ter mais controlo. O Gemini Flash aceita áudio directamente, por isso aproveitas a mesma API.

1. **Frontend:** gravar com `MediaRecorder` (`audio/webm`) e enviar por `FormData` para `POST /ai-tutor/transcribe`.
2. **Backend (NestJS):** receber o ficheiro com `FileInterceptor`, converter para base64 e enviar ao Gemini como `inlineData` com o prompt: *"Transcreve este áudio em português europeu. Devolve apenas o texto."*
3. **Resposta:** o endpoint devolve o texto e o frontend envia-o ao chat, como na opção A.

---

## 6. Resposta mais rápida (opcional)

Se o chat do tutor devolve a resposta em *streaming*, podes falar frase a frase:

1. Acumula o texto recebido.
2. Sempre que aparece `.`, `?` ou `!`, envia essa frase para a fila de `speak`.

A voz começa em cerca de 1 segundo, em vez de esperar pela resposta completa.

---

## 7. Comandos que executam ações (opcional)

Para o Ísis executar ações ("abre os meus PDIs", "mostra a minha formação"):

1. O Gemini classifica a intenção e devolve JSON, por exemplo `{ "action": "navigate", "target": "/pdi" }`.
2. O frontend valida a ação contra uma lista permitida de rotas e executa.

---

## 8. Limitações e cuidados

| Tema | Detalhe |
|---|---|
| HTTPS | O microfone só funciona em HTTPS ou `localhost`. |
| Privacidade (LPDP) | No Chrome, a Web Speech API envia o áudio para servidores da Google. Convém referir isto na política de privacidade ou no consentimento. |
| Idioma | `pt-PT` funciona bem. `pt-AO` não é fiável. |
| Destaque palavra a palavra | O evento `onboundary` não dispara em todos os browsers. Se `charIndex` não avançar, mostra o texto completo de imediato. |
| iPhone/Safari | Bloqueia voz que não nasce de um toque. Como a resposta chega depois de uma chamada assíncrona, pode falhar. Solução: "desbloquear" no clique do microfone com `speechSynthesis.speak(new SpeechSynthesisUtterance(''))`. |
| Microfone a ouvir o tutor | Chamar `stop()` antes de gravar. Em telemóvel, evitar o microfone ligado enquanto o Ísis fala. |
| Qualidade da voz | Depende das vozes instaladas no dispositivo. Para voz igual para todos, o Gemini tem modelos de síntese de voz; confirmar custos e quota na documentação antes de adoptar. |

---

## 9. Checklist de implementação

- [ ] Criar `hooks/useVoiceInput.ts`
- [ ] Criar `hooks/useSpeech.ts`
- [ ] Criar `components/ia-tutor/MicButton.tsx`
- [ ] Criar `components/ia-tutor/SpeakingText.tsx`
- [ ] Ligar `handleVoice` à função de envio do chat (a devolver o texto da resposta)
- [ ] Adicionar botão para ligar/desligar a resposta por voz
- [ ] Testar em Chrome, Edge e Safari (iPhone)
- [ ] Actualizar a política de privacidade/consentimento (LPDP)
- [ ] (Opcional) Streaming frase a frase
- [ ] (Opcional) Comandos de ação por intenção
- [ ] (Opcional) Fallback com gravação de áudio + Gemini
