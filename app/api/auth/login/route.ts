import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const { username, password } = await req.json();

  const user = await prisma.user.findUnique({ where: { username } });

  // Eğer kullanıcı yoksa VEYA şifre alanı null ise hata döndür
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: "Hatalı kullanıcı adı veya şifre" }, { status: 401 });
  }

  // GÜNCELLEME: Frontend'in kullanıcının rolünü ve diğer bilgilerini kaydedebilmesi için tüm objeyi dönüyoruz
  return NextResponse.json({ 
    message: "Giriş başarılı!", 
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role // Artık super_admin rolü frontend'e akacak!
    }
  });
}