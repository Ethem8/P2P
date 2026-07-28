export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; 

export async function GET(request: Request) {
  try {
    const requesterRole = request.headers.get("x-user-role");

    if (requesterRole !== "super_admin") {
      return NextResponse.json(
        { error: "Yetkisiz erişim! Bu alanı sadece Süper Admin görebilir." }, 
        { status: 403 }
      );
    }

    // 1. Tüm kullanıcılar
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // 2. Aktif P2P Odaları
    const activeRooms = await prisma.room.findMany({
      include: {
        creator: { select: { username: true, email: true } },
        _count: { select: { participants: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 3. EN YENİ: Veritabanına kaydedilen tüm mesaj arşivi
    const allMessages = await prisma.message.findMany({
      include: {
        sender: { select: { username: true, email: true } },
        recipient: { select: { username: true, email: true } },
        room: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Son 100 mesajı getir (performans için sınırlandırdık)
    });

    return NextResponse.json({
      success: true,
      users: users,
      rooms: activeRooms,
      messages: allMessages // Artık mesajlarımız da var!
    });

  } catch (error) {
    console.error("API Hatası:", error);
    return NextResponse.json(
      { error: "Veriler çekilirken bir hata oluştu." }, 
      { status: 500 }
    );
  }
}