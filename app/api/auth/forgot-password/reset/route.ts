export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, code, newPassword } = body;

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: "Eksik alan bıraktınız." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
    }

    const pending = await prisma.passwordReset.findUnique({ where: { email } });
    if (!pending) {
      return NextResponse.json(
        { error: "Bu e-posta için bekleyen bir şifre sıfırlama isteği bulunamadı. Tekrar kod iste." },
        { status: 404 }
      );
    }

    if (pending.expiresAt < new Date()) {
      return NextResponse.json({ error: "Kodun süresi doldu. Lütfen yeni bir kod iste." }, { status: 410 });
    }

    if (pending.code !== code.trim()) {
      return NextResponse.json({ error: "Girdiğin kod hatalı." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    // Kullanılan kodu temizle — tekrar kullanılamasın
    await prisma.passwordReset.delete({ where: { email } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Şifre sıfırlama hatası:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}