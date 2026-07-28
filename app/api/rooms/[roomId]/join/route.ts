// Konum: app/api/rooms/[roomId]/join/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ACTIVE_THRESHOLD_MS = 15_000;
const MAX_ROOM_PARTICIPANTS = 8;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // DÜZELTME: Next.js 15+ sürümünde route params artık bir Promise —
    // await edilmeden doğrudan okunursa roomId 'undefined' gelir ve
    // Prisma "needs at least one of `id` arguments" hatası verir.
    const { roomId } = await params;
    const body = await request.json();
    const { userId, peerId } = body;

    if (!userId || !peerId) {
      return NextResponse.json({ error: "userId veya peerId eksik." }, { status: 400 });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    }

    const activeSince = new Date(Date.now() - ACTIVE_THRESHOLD_MS);
    const activeCount = await prisma.roomPresence.count({
      where: { roomId, lastSeen: { gte: activeSince } },
    });

    const existing = await prisma.roomPresence.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!existing && activeCount >= MAX_ROOM_PARTICIPANTS) {
      return NextResponse.json(
        { error: `Oda dolu (maksimum ${MAX_ROOM_PARTICIPANTS} kişi).` },
        { status: 409 }
      );
    }

    const presence = await prisma.roomPresence.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: { peerId, lastSeen: new Date() },
      create: { roomId, userId, peerId },
    });

    await prisma.room.update({
      where: { id: roomId },
      data: { participants: { connect: { id: userId } } },
    });

    return NextResponse.json({
      success: true,
      presence,
      room: { id: room.id, name: room.name, creatorId: room.creatorId },
    });
  } catch (error) {
    console.error("Odaya katılma hatası:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}