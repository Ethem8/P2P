// Konum: app/api/auth/register/request-code/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_FROM } from "@/lib/resend";
import bcrypt from "bcryptjs";

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 dakika

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 haneli
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, username } = body;

    if (!email || !password || !username) {
      return NextResponse.json({ error: "Eksik alan bıraktınız." }, { status: 400 });
    }

    // E-posta zaten doğrulanmış (gerçek) bir hesaba mı ait, kontrol et
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Bu e-posta adresi zaten kayıtlı." }, { status: 409 });
    }
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten alınmış." }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

    // Aynı e-posta ile daha önce doğrulanmamış bir istek varsa (örn. kod
    // gelmedi, "tekrar gönder" dendi) üzerine yazıyoruz — email @unique
    // olduğu için upsert kullanıyoruz.
    await prisma.pendingRegistration.upsert({
      where: { email },
      update: { username, password: hashedPassword, code, expiresAt },
      create: { email, username, password: hashedPassword, code, expiresAt },
    });

    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: "Doğrulama Kodun",
        html: `
          <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111;">Hesabını Doğrula</h2>
            <p style="color: #444; font-size: 14px;">Merhaba ${username}, kayıt işlemini tamamlamak için aşağıdaki kodu uygulamaya gir:</p>
            <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
            </div>
            <p style="color: #888; font-size: 12px;">Bu kod 10 dakika içinde geçerliliğini yitirecek. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("E-posta gönderilemedi:", emailError);
      return NextResponse.json(
        { error: "Doğrulama kodu gönderilemedi. E-posta adresini kontrol edip tekrar dene." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Kod gönderme hatası:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}