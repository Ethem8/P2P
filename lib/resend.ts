// Konum: lib/resend.ts
import { Resend } from "resend";

// .env dosyana RESEND_API_KEY eklemen gerekiyor.
// https://resend.com üzerinden ücretsiz hesap açıp API key alabilirsin.
export const resend = new Resend(process.env.RESEND_API_KEY);

// Resend hesabı doğrulanmış bir domain'e sahip değilse, sadece
// 'onboarding@resend.dev' adresinden gönderim yapılabiliyor (test amaçlı,
// gerçek kullanıcılara da ulaşır). Kendi domain'ini Resend panelinden
// doğruladıktan sonra bunu 'kod@senin-domainin.com' gibi değiştirebilirsin.
export const EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";