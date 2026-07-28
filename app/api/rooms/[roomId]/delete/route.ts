// Konum: app/api/rooms/[roomId]/delete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Odayı TAMAMEN siler — herkes için. Sadece odayı oluşturan kişi (creator)
// bunu yapabilir. Room silinince, şemadaki onDelete: Cascade ayarları
// sayesinde o odaya ait tüm mesajlar (Message) ve canlı üyelik kayıtları
// (RoomPresence) da otomatik olarak silinir; participants ilişkisi de
// (many-to-many ara tablo) Prisma tarafından otomatik temizlenir.
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

    if (room.creatorId !== userId) {
      return NextResponse.json(
        { error: "Bu odayı sadece oluşturan kişi silebilir." },
        { status: 403 }
      );
    }

    await prisma.room.delete({ where: { id: roomId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Oda silinemedi:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}