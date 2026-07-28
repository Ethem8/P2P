"use client";
import { useState } from "react";

    export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""); // Hata mesajı için yeni state

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); // Her yeni denemede eski hatayı temizle

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        
        // 🌟 GÜNCELLEME: API'den dönen nested (iç içe) 'user' objesini doğrudan kontrol edip kaydediyoruz
        if (data.user) {
          localStorage.setItem(
            "user",
            JSON.stringify({
              id: data.user.id,
              username: data.user.username,
              role: data.user.role || "user", // Artık data.user.role değerini (super_admin) başarıyla alacak!
            })
          );
        } else {
          // Eski API yapısı veya yedek durum için fallback (bunu önlem amacıyla ekledik)
          localStorage.setItem(
            "user",
            JSON.stringify({
              id: data.userId,
              username: username,
              role: data.role || "user",
            })
          );
        }

        window.location.href = "/dashboard";
      } else {
        // Giriş başarısızsa hata mesajını set et
        setError("Kullanıcı adı veya şifreniz yanlış.");
      }
    } catch (err) {
      setError("Bağlantı hatası! Sunucuya ulaşılamıyor.");
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4">
      <div className="w-full max-w-xs flex flex-col items-center">
        <h1 className="text-2xl font-bold mb-8 text-center">Giriş Yap</h1>

        {/* Hatalı Giriş Uyarı Kutusu */}
        {error && (
          <div className="w-full p-3 mb-4 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full">
          <input
            type="text"
            placeholder="Kullanıcı Adı"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-slate-900 border border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-all"
          />
          <input
            type="password"
            placeholder="Şifre"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-slate-900 border border-slate-700 p-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-all"
          />
          <button
            type="submit"
            className="bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950"
          >
            Giriş Yap
          </button>
        </form>

        <a href="/register" className="mt-6 text-emerald-400 text-sm hover:underline">
          Hesabın yok mu? Kayıt Ol
        </a>
        <a href="/forgot-password" className="mt-2 text-slate-500 text-sm hover:underline hover:text-slate-400">
          Şifremi Unuttum
        </a>
      </div>
    </main>
  );
}