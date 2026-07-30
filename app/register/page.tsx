"use client";
import { useState } from "react";

// Gelişmiş E-posta Kontrolü (Regex)
const validateEmail = (email: string) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

// GEÇİCİ: E-posta doğrulama kodu akışı, Resend domain doğrulaması
// tamamlanana kadar devre dışı. Doğrudan /api/auth/register'a istek
// atıyoruz — hesap anında oluşuyor, kod beklenmiyor. Domain doğrulanınca
// bu dosyayı iki adımlı (request-code/verify-code) versiyona geri
// çevirebiliriz.
export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      setError("Lütfen geçerli bir e-posta adresi girin (Örn: isim@gmail.com, isim@hotmail.com)");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (res.ok) {
        alert("Kayıt Başarılı!");
        window.location.href = "/";
      } else {
        const data = await res.json();
        setError(data.error || "Bilinmeyen bir hata oluştu.");
      }
    } catch (err) {
      setError("Bağlantı hatası! Sunucuya ulaşılamıyor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4">
      <div className="w-full max-w-xs">
        <h1 className="text-2xl font-bold mb-8 text-center">Hesap Oluştur</h1>

        {error && (
          <div className="p-3 mb-4 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-4 w-full">
          <input
            type="text"
            placeholder="Kullanıcı Adı"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
          />
          <input
            type="email"
            placeholder="Email (Örn: ad@domain.com)"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
          />
          <input
            type="password"
            placeholder="Şifre"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950 disabled:opacity-50 disabled:active:scale-100"
          >
            {isSubmitting ? "Kaydediliyor..." : "Kayıt Ol"}
          </button>
        </form>

        <div className="text-center mt-6">
          <a href="/" className="text-emerald-400 text-sm hover:underline">
            Zaten hesabın var mı? Giriş Yap
          </a>
        </div>
      </div>
    </main>
  );
}