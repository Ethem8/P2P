export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ACTIVE_THRESHOLD_MS = 15_000;

// Bir kullanıcının DAHA ÖNCE KATILDIĞI (Room.participants ilişkisinde yer
// aldığı) tüm odaları döner. Bu ilişki odadan "ayrılınca" (RoomPresence
// silinince) BOZULMUYOR — sadece canlı/aktif durumu değişiyor. Böylece oda,
// tıpkı 1-1 sohbetler gibi kullanıcının kendi listesinde kalıcı kalıyor,
// ama bu liste SADECE o kullanıcıya özel — başka biri bu odayı, katılmadığı
// sürece hiçbir yerde göremez (herkese açık listeleme zaten kaldırılmıştı).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId eksik." }, { status: 400 });
    }

    const activeSince = new Date(Date.now() - ACTIVE_THRESHOLD_MS);

    const rooms = await prisma.room.findMany({
      where: {
        participants: { some: { id: userId } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { username: true, email: true } },
        presences: {
          where: { lastSeen: { gte: activeSince } },
          select: { id: true },
        },
      },
    });

    const shaped = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      creator: r.creator,
      creatorId: r.creatorId,
      activeCount: r.presences.length,
    }));

    return NextResponse.json({ success: true, rooms: shaped });
  } catch (error) {
    console.error("Kullanıcının odaları alınamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}