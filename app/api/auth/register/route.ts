import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Backend'e gelen veri:", body); // <-- HATA AYIKLAMA
    const { email, password, username } = body;

    if (!email || !password || !username) {
      console.error("Eksik alan tespit edildi!");
      return NextResponse.json({ error: "Eksik alan bıraktınız." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, username, password: hashedPassword },
    });

    const room = await prisma.room.create({
      data: {
        name: `${username}'in Odası`,
        creatorId: user.id,
        participants: { connect: { id: user.id } },
      },
    });

    return NextResponse.json({ user, room }, { status: 201 });
  } catch (error: any) {
    console.error("Kayıt hatası:", error);
    return NextResponse.json({ error: error.message || "Kayıt hatası" }, { status: 500 });
  }
}