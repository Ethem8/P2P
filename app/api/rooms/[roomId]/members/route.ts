// Konum: app/api/rooms/[roomId]/members/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ACTIVE_THRESHOLD_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // DÜZELTME: Next.js 15+ için params await edilmeli
    const { roomId } = await params;
    const activeSince = new Date(Date.now() - ACTIVE_THRESHOLD_MS);

    const presences = await prisma.roomPresence.findMany({
      where: { roomId, lastSeen: { gte: activeSince } },
      include: {
        user: { select: { id: true, username: true, email: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    const members = presences.map((p) => ({
      userId: p.user.id,
      username: p.user.username || "Kullanıcı",
      peerId: p.peerId,
      avatarUrl: p.user.avatarUrl || null,
    }));

    return NextResponse.json({ success: true, members });
  } catch (error) {
    console.error("Oda üyeleri alınamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}