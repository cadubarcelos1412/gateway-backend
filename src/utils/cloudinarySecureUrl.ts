import { cloudinary } from "../config/cloudinary";

/**
 * 🔒 Gera uma URL assinada pra um recurso do Cloudinary com `type:
 * "authenticated"` — achado de auditoria de segurança (2026-08-30): antes
 * disso, documento de KYC (CNH/selfie/comprovante) era enviado como recurso
 * PÚBLICO (`resource_type: "auto"` sem `type`), então a `secure_url` salva no
 * banco era um link permanente que funcionava pra qualquer um que o
 * obtivesse, sem nunca precisar fazer login na PyxGate.
 *
 * `type: "authenticated"` no upload faz o Cloudinary EXIGIR uma assinatura
 * válida pra servir o arquivo — só quem tem a `api_secret` da conta (nosso
 * backend) consegue gerar um link que funcione. Isso fecha o acesso público
 * não autenticado; não é short-lived/expirável de verdade (isso exigiria o
 * recurso pago de "token-based authentication" do Cloudinary, fora de
 * escopo aqui) — mas fecha exatamente a falha reportada: ninguém de fora
 * consegue mais CONSTRUIR um link válido sozinho.
 *
 * ⚠️ Documentos enviados ANTES dessa mudança continuam com o upload antigo
 * (público) — precisam de uma migração separada (baixar do Cloudinary e
 * reenviar com type:"authenticated") pra ficarem protegidos também. Isso
 * não é um patch de código, é uma tarefa de dados à parte.
 */
export function signedAuthenticatedUrl(publicId: string, resourceType: string = "image"): string {
  return cloudinary.url(publicId, {
    type: "authenticated",
    sign_url: true,
    resource_type: resourceType,
    secure: true,
  });
}
