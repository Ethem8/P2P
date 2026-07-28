import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // DÜZELTME: artık email değil, doğrudan gerçek veritabanı User.id
    // değerlerini alıyoruz. Frontend localStorage'daki 'user' objesinde
    // zaten bu id mevcut olduğu için ekstra bir email alanına gerek yok.
    const { text, senderId, recipientId, roomId } = body;

    if (!text || !senderId) {
      return NextResponse.json({ error: "Eksik bilgi gönderildi (text veya senderId yok)." }, { status: 400 });
    }

    // Gönderen kullanıcıyı ID üzerinden doğruluyoruz
    const sender = await prisma.user.findUnique({
      where: { id: senderId }
    });

    if (!sender) {
      return NextResponse.json({ error: "Gönderen kullanıcı bulunamadı." }, { status: 404 });
    }

    // Alıcıyı ID üzerinden doğruluyoruz (varsa)
    let validRecipientId: string | null = null;
    if (recipientId) {
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId }
      });
      validRecipientId = recipient?.id || null;
    }

    // Mesajı kaydediyoruz
    const savedMsg = await prisma.message.create({
      data: {
        text,
        senderId: sender.id,
        recipientId: validRecipientId,
        roomId: roomId || null,
      },
      include: {
        sender: { select: { username: true, email: true } },
        recipient: { select: { username: true, email: true } }
      }
    });

    return NextResponse.json({ success: true, message: savedMsg });

  } catch (error) {
    console.error("Mesaj kaydedilemedi:", error);
    return NextResponse.json({ error: "Sistem hatası." }, { status: 500 });
  }
}