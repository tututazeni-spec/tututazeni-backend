import "dotenv/config";
import { BirdClient } from "@messagebird/sdk";

const { BIRD_API_KEY, BIRD_WHATSAPP_TO } = process.env;

if (!BIRD_API_KEY || !BIRD_WHATSAPP_TO) {
  console.error("Defina BIRD_API_KEY e BIRD_WHATSAPP_TO no .env (ver .env.example).");
  process.exit(1);
}

// Formato internacional E.164: "+" e 7 a 15 dígitos, sem espaços.
if (!/^\+[1-9]\d{6,14}$/.test(BIRD_WHATSAPP_TO)) {
  console.error("BIRD_WHATSAPP_TO tem de estar em formato internacional, ex.: +244900000000.");
  process.exit(1);
}

const bird = new BirdClient({ apiKey: BIRD_API_KEY });

try {
  const msg = await bird.whatsapp.send({
    to: BIRD_WHATSAPP_TO, // número do destinatário
    template: {
      slug: "bird_delivery_update",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", name: "ref", text: "A1B2C3D4" },
            { type: "text", name: "date", text: "10 Jul 2026" },
          ],
        },
      ],
    },
  });

  console.log("ID:", msg.id, "| Estado:", msg.status);
} catch (erro) {
  console.error("Erro ao enviar:", erro);
}