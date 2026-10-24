// Limites por IP para endpoints @Public que aceitam um código/segredo adivinhável.
/** Verificação pública por código (QR/URL): impede enumeração de códigos. */
export const PUBLIC_VERIFY_THROTTLE = { default: { limit: 30, ttl: 60_000 } };
/** Link de partilha com password opcional: impede brute-force da password. */
export const PUBLIC_SHARE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
