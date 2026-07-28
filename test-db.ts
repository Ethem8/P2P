import { prisma } from './lib/prisma'; // lib/prisma'dan export ettiğimiz instance'ı kullanıyoruz

async function main() {
  try {
    // 1. Bir kayıt oluşturmayı dene
    const newUser = await prisma.user.create({
      data: {
        email: "test@ornek.com",
        username: "testuser",
        password: "hashedpassword123",
      },
    });
    console.log("Kayıt başarıyla oluşturuldu:", newUser);

    // 2. Kaydı geri oku
    const foundUser = await prisma.user.findUnique({
      where: { email: "test@ornek.com" }
    });
    console.log("Veritabanından okunan:", foundUser);
    
  } catch (e: any) {
    console.error("İşlem hatası:", e.message);
  }
}

main();