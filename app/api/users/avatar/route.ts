// Konum: app/api/users/avatar/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Küçültülmüş (128x128) bir resmin base64 data URL olarak boyutu genelde
// birkaç yüz KB'ı geçmez. Yine de bir üst sınır koyuyoruz — Postgres'te
// TEXT alanı büyük veri tutabilir ama gereksiz şişmeyi önlemek için.
const MAX_AVATAR_DATA_URL_LENGTH = 500_000; // ~500KB (base64 metin uzunluğu)

// Mevcut profil resmini çeker. Login akışı localStorage'a avatarUrl
// yazmadığı için (ve login route'una dokunmamak için), dashboard açılırken
// bu endpoint'ten kendi/karşı tarafın güncel avatarını öğreniyoruz.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId eksik." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true, avatarUrl: user.avatarUrl || null });
  } catch (error: any) {
    console.error("Avatar alınamadı:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, avatarDataUrl } = body;

    if (!userId || !avatarDataUrl) {
      return NextResponse.json({ error: "Eksik alan bıraktınız." }, { status: 400 });
    }

    if (typeof avatarDataUrl !== "string" || !avatarDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Geçersiz resim verisi." }, { status: 400 });
    }

    if (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      return NextResponse.json({ error: "Resim çok büyük. Daha küçük bir görsel dene." }, { status: 413 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: avatarDataUrl },
      select: { id: true, avatarUrl: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error("Profil resmi güncellenemedi:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}

// Profil resmini kaldırmak için (varsayılan baş harf avatarına dönmek isteyenler için)
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: "userId eksik." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Profil resmi kaldırılamadı:", error);
    return NextResponse.json({ error: error.message || "Sistem hatası." }, { status: 500 });
  }
}