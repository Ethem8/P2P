import { prisma } from "@/lib/prisma"; // Kendi import yolunla değiştir

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return Response.json({ error: "User ID gerekli" }, { status: 400 });
    }

    // Silme işlemini yap
    const deletedUser = await prisma.user.delete({
      where: { id: userId }
    });

    return Response.json({ success: true, deletedUser });
  } catch (error: any) {
    // HATA BURAYA DÜŞERSE TERMINALDE GÖRECEKSİN
    console.error("PRISMA SİLME HATASI:", error); 
    return Response.json({ error: error.message }, { status: 500 });
  }
}