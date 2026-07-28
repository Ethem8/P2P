// Konum: app/api/rooms/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, creatorId } = body;

    if (!creatorId) {
      return NextResponse.json({ error: "creatorId eksik." }, { status: 400 });
    }

    const creator = await prisma.user.findUnique({ where: { id: creatorId } });
    if (!creator) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    const room = await prisma.room.create({
      data: {
        name: name?.trim() || `${creator.username || "Kullanıcı"}'nin Odası`,
        creatorId: creator.id,
        participants: { connect: { id: creator.id } },
      },
    });

    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error("Oda oluşturulamadı:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}