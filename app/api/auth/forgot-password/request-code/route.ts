// Konum: app/api/auth/forgot-password/request-code/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_FROM } from "@/lib/resend";

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 dakika

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "E-posta eksik." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // GÜVENLİK NOTU: Kullanıcı yoksa bile başarı mesajı döndürüyoruz — aksi
    // halde bu endpoint "bu e-posta kayıtlı mı değil mi" bilgisini sızdıran
    // bir e-posta keşif (enumeration) aracına dönüşür. Sadece gerçekten
    // varsa e-posta gönderiyoruz.
    if (user) {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

      await prisma.passwordReset.upsert({
        where: { email },
        update: { code, expiresAt },
        create: { email, code, expiresAt },
      });

      try {
        await resend.emails.send({
          from: EMAIL_FROM,
          to: email,
          subject: "Şifre Sıfırlama Kodun",
          html: `
            <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #111;">Şifreni Sıfırla</h2>
              <p style="color: #444; font-size: 14px;">Şifreni sıfırlamak için aşağıdaki kodu uygulamaya gir:</p>
              <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
              </div>
              <p style="color: #888; font-size: 12px;">Bu kod 10 dakika içinde geçerliliğini yitirecek. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin, hesabında hiçbir şey değişmeyecek.</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Şifre sıfırlama e-postası gönderilemedi:", emailError);
        // Kullanıcıya yine de genel bir başarı mesajı dönüyoruz (enumeration'ı önlemek için),
        // ama sunucu logunda gerçek hatayı görebiliyoruz.
      }
    }

    return NextResponse.json({
      success: true,
      message: "Eğer bu e-posta kayıtlıysa, bir doğrulama kodu gönderildi.",
    });
  } catch (error: any) {
    console.error("Şifre sıfırlama kodu isteği hatası:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}