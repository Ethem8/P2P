// Konum: lib/resend.ts
import { Resend } from "resend";

// DÜZELTME: RESEND_API_KEY tanımlı değilse (örn. Vercel'de env variable
// eklenmeyi unutulmuşsa) eskiden bu dosya import edildiği anda (build
// sırasında bile) çöküyordu. Artık boş bir key ile de nesne oluşturuluyor
// — bu, "prisma generate" gibi build-time bir hataya yol açmıyor. Gerçek
// gönderim anında (RESEND_API_KEY hâlâ eksikse) Resend kendi anlamlı
// hatasını fırlatacak, o da route'ların catch bloğunda zaten yakalanıp
// kullanıcıya "kod gönderilemedi" şeklinde dönüyor.
if (!process.env.RESEND_API_KEY) {
  console.warn(
    "[UYARI] RESEND_API_KEY tanımlı değil — e-posta gönderimi çalışmayacak. " +
    "Vercel'de Settings > Environment Variables kısmına eklemeyi unutma."
  );
}

export const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_build_time_placeholder");

// Resend hesabı doğrulanmış bir domain'e sahip değilse, sadece
// 'onboarding@resend.dev' adresinden gönderim yapılabiliyor (test amaçlı,
// gerçek kullanıcılara da ulaşır). Kendi domain'ini Resend panelinden
// doğruladıktan sonra bunu 'kod@senin-domainin.com' gibi değiştirebilirsin.
export const EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";