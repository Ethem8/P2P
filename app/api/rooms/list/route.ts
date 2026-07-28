// Konum: app/api/rooms/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Bu süreden daha eski bir "lastSeen" değeri olan presence kayıtları
// artık aktif sayılmaz (istemci heartbeat göndermeyi durdurmuş demektir).
const ACTIVE_THRESHOLD_MS = 15_000;

// DÜZELTME: Odalar artık herkese açık listelenmiyor — kullanıcılar sadece
// oda kodunu bilerek katılabiliyor. Bu endpoint sadece süper admin panelinde
// izleme amacıyla kullanılıyor, bu yüzden diğer admin route'larıyla aynı
// şekilde 'x-user-role: super_admin' header kontrolü ekliyoruz.
export async function GET(request: Request) {
  try {
    const requesterRole = request.headers.get("x-user-role");
    if (requesterRole !== "super_admin") {
      return NextResponse.json(
        { error: "Yetkisiz erişim! Oda listesini sadece Süper Admin görebilir." },
        { status: 403 }
      );
    }

    const activeSince = new Date(Date.now() - ACTIVE_THRESHOLD_MS);

    const rooms = await prisma.room.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
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
    console.error("Oda listesi alınamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}