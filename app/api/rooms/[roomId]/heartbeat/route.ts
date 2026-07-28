import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // DÜZELTME: Next.js 15+ için params await edilmeli
    const { roomId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId eksik." }, { status: 400 });
    }

    await prisma.roomPresence.updateMany({  
      where: { roomId, userId },
      data: { lastSeen: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Heartbeat hatası:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}