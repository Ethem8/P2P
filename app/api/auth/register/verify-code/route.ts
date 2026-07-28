// Konum: app/api/auth/register/verify-code/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json({ error: "E-posta veya kod eksik." }, { status: 400 });
    }

    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending) {
      return NextResponse.json(
        { error: "Bu e-posta için bekleyen bir kayıt isteği bulunamadı. Kayıt formunu tekrar doldur." },
        { status: 404 }
      );
    }

    if (pending.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Kodun süresi doldu. Lütfen yeni bir kod iste." },
        { status: 410 }
      );
    }

    if (pending.code !== code.trim()) {
      return NextResponse.json({ error: "Girdiğin kod hatalı." }, { status: 400 });
    }

    // Kod doğru — gerçek kullanıcıyı ve ilk odasını şimdi oluşturuyoruz
    // (register/route.ts'deki orijinal mantıkla aynı).
    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: pending.email,
          username: pending.username,
          password: pending.password, // zaten hash'lenmiş halde saklanmıştı
        },
      });
    } catch (createError: any) {
      // Aradaki süreçte biri aynı e-posta/kullanıcı adıyla kayıt olduysa
      if (createError.code === "P2002") {
        return NextResponse.json(
          { error: "Bu e-posta veya kullanıcı adı bu sırada başka biri tarafından alındı." },
          { status: 409 }
        );
      }
      throw createError;
    }

    const room = await prisma.room.create({
      data: {
        name: `${user.username}'in Odası`,
        creatorId: user.id,
        participants: { connect: { id: user.id } },
      },
    });

    // Geçici kaydı temizle
    await prisma.pendingRegistration.delete({ where: { email } });

    return NextResponse.json({ user, room }, { status: 201 });
  } catch (error: any) {
    console.error("Kod doğrulama hatası:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}