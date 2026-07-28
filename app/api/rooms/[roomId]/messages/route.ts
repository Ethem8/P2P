// Konum: app/api/rooms/[roomId]/messages/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Bir odaya daha önce yazılmış (ve /api/messages/save ile arşivlenmiş)
// mesajları döndürür. Oda içi mesajlar sadece P2P/mesh üzerinden canlı
// akıyordu; sayfa yenilenince veya kullanıcı odadan çıkıp tekrar girince
// bu geçmiş kayboluyordu. Artık odaya her katılımda bu endpoint çağrılıp
// geçmiş buradan yükleniyor.
//
// NOT: Arşivde sadece düz metin tutuluyor — dosya ekleri, emoji tepkileri
// ve "şuna yanıt veriyor" bağlantıları arşive dahil değil (bunlar sadece
// P2P üzerinden anlık iletiliyor). Geçmişten yüklenen mesajlar bu yüzden
// sade metin olarak görünür.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId eksik." }, { status: 400 });
    }

    // Sadece bu odanın katılımcısı geçmişi görebilir
    const membership = await prisma.room.findFirst({
      where: { id: roomId, participants: { some: { id: userId } } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Bu odanın geçmişini görme yetkin yok." }, { status: 403 });
    }

    const messages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
      take: 200, // son 200 mesajla sınırlı (performans için)
      include: {
        sender: { select: { username: true, email: true } },
      },
    });

    const shaped = messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      senderId: m.senderId,
      senderName: m.sender.username || m.sender.email,
    }));

    return NextResponse.json({ success: true, messages: shaped });
  } catch (error) {
    console.error("Oda mesaj geçmişi alınamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}