// Konum: app/api/rooms/[roomId]/kick/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Sadece odayı oluşturan kişi (creator), belirtilen kullanıcının canlı
// üyeliğini (RoomPresence) siler — bu, o kullanıcının artık oda üyeleri
// listesinde görünmemesini ve mesh bağlantılarının kopmasını sağlar.
// NOT: Bu bir "kalıcı yasaklama" değildir — atılan kişi elinde oda kodu
// varsa teorik olarak tekrar katılabilir (P2P mimarisinde merkezi bir
// yetkilendirme katmanı olmadığı için tam bir yasaklama listesi ayrı bir
// geliştirme gerektirir).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { requesterId, targetUserId } = body;

    if (!requesterId || !targetUserId) {
      return NextResponse.json({ error: "Eksik alan bıraktınız." }, { status: 400 });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    }

    if (room.creatorId !== requesterId) {
      return NextResponse.json({ error: "Sadece oda sahibi birini atabilir." }, { status: 403 });
    }

    if (targetUserId === requesterId) {
      return NextResponse.json({ error: "Kendini atamazsın." }, { status: 400 });
    }

    await prisma.roomPresence.deleteMany({ where: { roomId, userId: targetUserId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Kullanıcı atılamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}