// Konum: app/api/rooms/[roomId]/forget/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Odayı SİLMEZ — sadece isteyen kullanıcıyı o odanın participants
// ilişkisinden çıkarır. Böylece oda başkaları için (creator dahil) aynen
// duruyor, sadece bu kullanıcının "Odalarım" listesinden kayboluyor.
// Kullanıcı elindeki kodu tekrar girerse yeniden katılabilir.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId eksik." }, { status: 400 });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    }

    if (room.creatorId === userId) {
      return NextResponse.json(
        { error: "Odayı oluşturan kişi listeden kaldıramaz, sadece silebilir." },
        { status: 403 }
      );
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { participants: { disconnect: { id: userId } } },
    });

    // Emin olmak için canlı üyelik kaydı varsa onu da temizle
    await prisma.roomPresence.deleteMany({ where: { roomId, userId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Oda listeden kaldırılamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}