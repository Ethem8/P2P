"use client";

import { performLocalLogout } from '@/lib/auth';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Send, Copy, CheckCircle, Wifi, Bell, MessageSquare, Users, Trash2, Key, Layers, Activity, Mail, Mic, MicOff, PhoneOff, Hash, Plus, LogIn, Volume2, VolumeX, Settings2, Smile, Paperclip, File as FileIcon, Download, Monitor, MonitorOff, Video, VideoOff, Reply, X, UserX, Crown, Maximize2, Minimize2, Square, Play, Pause } from 'lucide-react';

interface FileAttachment {
  name: string;
  mime: string;
  size: number;
  dataUrl: string; // "data:<mime>;base64,...." — doğrudan <img src> veya indirme linki olarak kullanılabilir
}

interface ReplyPreview {
  messageId: string;
  senderName: string;
  preview: string; // kısaltılmış metin veya "📎 dosya-adi" gibi
}

interface Message {
  id: string;
  sender: 'me' | 'peer';
  senderName: string;
  senderAvatar: string;
  senderAvatarUrl?: string | null;
  text: string;
  time: string;
  file?: FileAttachment;
  reactions?: { [emoji: string]: string[] }; // emoji -> tepki veren userId listesi
  replyTo?: ReplyPreview;
}

interface ChatRooms {
  [peerId: string]: Message[];
}

interface ActiveChat {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string | null; // Gerçek profil fotoğrafı (varsa)
  userId?: string; // Kalıcı kullanıcı kimliği (localStorage'daki gerçek User.id)
  isOnline?: boolean; // Bağlantı durumu — kopunca sohbet silinmiyor, sadece işaretleniyor
}

// --- ÇOK KİŞİLİ ODA (GRUP) TİPLERİ ---
interface RoomMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderAvatarUrl?: string | null;
  text: string;
  time: string;
  file?: FileAttachment;
  reactions?: { [emoji: string]: string[] }; // emoji -> tepki veren userId listesi
  replyTo?: ReplyPreview;
}

interface RoomListItem {
  id: string;
  name: string | null;
  createdAt: string;
  creator: { username: string | null; email: string };
  creatorId: string;
  activeCount: number;
}

interface RoomMember {
  userId: string;
  username: string;
  peerId: string;
  avatarUrl?: string | null;
}

const MAX_ROOM_PARTICIPANTS = 8;
const ROOM_HEARTBEAT_MS = 5000;
const ROOM_POLL_MS = 4000;

interface AdminUser {
  id: string;
  username: string | null;
  email: string;
  role?: string;
  createdAt?: string;
}

interface AdminRoom {
  id: string;
  name: string | null;
  createdAt: string;
  creatorId: string;
  creator: {
    username: string | null;
    email: string;
  };
  _count?: {
    participants: number;
  };
}

interface ArchivedMessage {
  id: string;
  text: string;
  createdAt: string;
  sender: {
    username: string | null;
    email: string;
  };
  recipient?: {
    username: string | null;
    email: string;
  } | null;
  room?: {
    name: string | null;
  } | null;
}

// Discord'daki gibi: dolu kısım değere göre renkli, geri kalanı koyu gri —
// native <input type="range">'in varsayılan (her zaman sona kadar açık
// renkli) track'ının aksine, sadece ayarlanan değere kadar dolu görünür.
function VolumeSlider({
  value,
  max = 100,
  onChange,
  disabled = false,
  color = '#23a55a',
}: {
  value: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  color?: string;
}) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const trackColor = disabled ? '#3f4147' : '#4e5058';
  const fillColor = disabled ? '#5c5e66' : color;
  return (
    <>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="discord-slider flex-1"
        style={{
          background: `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${percent}%, ${trackColor} ${percent}%, ${trackColor} 100%)`,
        }}
      />
      <style jsx>{`
        .discord-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 9999px;
          outline: none;
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
        }
        .discord-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 9999px;
          background: transparent;
        }
        .discord-slider::-moz-range-track {
          height: 4px;
          border-radius: 9999px;
          background: transparent;
        }
        .discord-slider::-moz-range-progress {
          height: 4px;
          border-radius: 9999px;
          background: ${fillColor};
        }
        .discord-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 9999px;
          background: #ffffff;
          margin-top: -4.5px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
          transition: transform 0.1s ease;
        }
        .discord-slider::-webkit-slider-thumb:hover {
          transform: ${disabled ? 'none' : 'scale(1.15)'};
        }
        .discord-slider::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border: none;
          border-radius: 9999px;
          background: #ffffff;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
        }
        .discord-slider:disabled::-webkit-slider-thumb {
          background: #8a8d93;
        }
      `}</style>
    </>
  );
}

// Harici bir pakete ihtiyaç duymadan, sık kullanılan emojilerden oluşan
// basit bir seçici. Küçük ama çeşitli bir set — yüzler, jestler, kalpler,
// eğlence/aktivite ve birkaç sembol.
// P2P veri kanalı üzerinden (base64 olarak) gönderilecek dosyalar için üst
// sınır. Sunucudan geçmediği ve tarayıcı belleğinde tutulduğu için çok
// büyük dosyalar performans sorunu yaratır — 5MB makul bir denge.
const FILE_MAX_BYTES = 5 * 1024 * 1024;

// Mesaj gönderirken gönderen tarafında üretilip alıcı tarafına da payload
// içinde taşınan ortak kimlik. Böylece iki taraf da AYNI mesaj ID'sine
// sahip olur — tepki (reaction) gibi "hangi mesaja" diyen işlemler için şart.
function generateMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// Bir mesajın reactions map'inde, verilen kullanıcının verdiği emoji
// tepkisini açar/kapatır (toggle). Yeni (immutable) bir obje döner.
function toggleReaction(
  reactions: { [emoji: string]: string[] } | undefined,
  emoji: string,
  reactorUserId: string
): { [emoji: string]: string[] } {
  const next: { [emoji: string]: string[] } = {};
  // Mevcut tüm emoji gruplarını kopyala
  Object.entries(reactions || {}).forEach(([e, ids]) => { next[e] = [...ids]; });

  const list = next[emoji] ? [...next[emoji]] : [];
  const idx = list.indexOf(reactorUserId);
  if (idx >= 0) {
    list.splice(idx, 1); // zaten tepki vermiş — kaldır
  } else {
    list.push(reactorUserId); // yeni tepki — ekle
  }

  if (list.length === 0) {
    delete next[emoji];
  } else {
    next[emoji] = list;
  }
  return next;
}

// Mesaj balonlarının altında görünen tepki pilleri + hızlı tepki verme
// butonu. Hem 1-1 hem grup mesajlarında ortak kullanılıyor.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Yanıtlanan mesajın kısa bir özetini çıkarır (dosyaysa dosya adı, metinse kısaltılmış hali).
function buildReplyPreview(msg: { text: string; file?: FileAttachment }): string {
  if (msg.file) return `📎 ${msg.file.name}`;
  const t = msg.text || '';
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
}

// Bir mesaj balonunun İÇİNDE, üstte gösterilen "şuna yanıt veriyor" alıntı
// bloğu. Tıklanınca orijinal mesaja kaydırıyor.
function QuotedReplyBlock({ reply, onClick }: { reply: ReplyPreview; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/20 border-l-2 border-slate-500 hover:bg-black/30 transition-colors"
    >
      <div className="text-[10px] font-semibold text-slate-300">{reply.senderName}</div>
      <div className="text-[11px] text-slate-400 truncate">{reply.preview}</div>
    </button>
  );
}

function MessageReactions({
  reactions,
  myUserId,
  isPickerOpen,
  onTogglePicker,
  onReact,
  onReply,
  align,
}: {
  reactions?: { [emoji: string]: string[] };
  myUserId: string;
  isPickerOpen: boolean;
  onTogglePicker: () => void;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  align: 'me' | 'peer';
}) {
  const entries = Object.entries(reactions || {});
  return (
    <div className={`flex items-center gap-1 mt-1 flex-wrap ${align === 'me' ? 'justify-end' : 'justify-start'}`}>
      {align === 'peer' && onReply && (
        <button
          onClick={onReply}
          className="text-slate-500 hover:text-slate-300 p-1 rounded-full hover:bg-slate-800 transition-colors"
          title="Yanıtla"
        >
          <Reply size={12} />
        </button>
      )}
      {entries.map(([emoji, ids]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className={`text-[11px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 transition-colors ${
            ids.includes(myUserId)
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <span>{emoji}</span>
          <span className="font-mono">{ids.length}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={onTogglePicker}
          className="text-[11px] px-1.5 py-0.5 rounded-full border border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          title="Tepki ekle"
        >
          +
        </button>
        {isPickerOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={onTogglePicker} />
            <div className={`absolute bottom-full mb-1 z-50 flex gap-1 bg-slate-900 border border-slate-700 rounded-full px-2 py-1.5 shadow-xl ${align === 'me' ? 'right-0' : 'left-0'}`}>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className="text-base hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {align === 'me' && onReply && (
        <button
          onClick={onReply}
          className="text-slate-500 hover:text-slate-300 p-1 rounded-full hover:bg-slate-800 transition-colors"
          title="Yanıtla"
        >
          <Reply size={12} />
        </button>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMOJI_LIST = [
  '😀', '😁', '😂', '🤣', '😅', '😊', '😇', '🙂', '😉', '😍',
  '😘', '😜', '🤔', '🤨', '😐', '😴', '🥱', '😢', '😭', '😡',
  '🤯', '😱', '🥳', '😎', '🤩', '🙄', '😏', '😬', '🤗', '🤫',
  '👍', '👎', '👌', '✌️', '🤞', '👏', '🙌', '🙏', '💪', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯',
  '🔥', '✨', '🎉', '🎊', '⚡', '💤', '☕', '🍕', '🍔', '🍺',
  '⚽', '🎮', '🎵', '📌', '📎', '✅', '❌', '❓', '❗', '💡',
];

// Mesaj balonu içinde bir dosya ekini gösterir: resimse önizleme, değilse
// indirme kartı. Dosya tamamen tarayıcı belleğinde (data URL) tutuluyor,
// hiçbir sunucuya yüklenmiyor.
// Mesaj balonu içinde bir dosya ekini gösterir: resimse önizleme (tıklayınca
// ekranda büyük açılır, indirmez), değilse indirme kartı. Dosya tamamen
// tarayıcı belleğinde (data URL) tutuluyor, hiçbir sunucuya yüklenmiyor.
function FileMessageContent({ file, onImageClick }: { file: FileAttachment; onImageClick?: (file: FileAttachment) => void }) {
  const isImage = file.mime.startsWith('image/');
  if (isImage) {
    return (
      <button type="button" onClick={() => onImageClick?.(file)} className="block cursor-zoom-in">
        <img
          src={file.dataUrl}
          alt={file.name}
          className="max-w-[220px] max-h-[220px] rounded-lg border border-slate-700 object-cover"
        />
        <div className="text-[10px] text-slate-500 mt-1 truncate text-left">{file.name}</div>
      </button>
    );
  }
  return (
    <a
      href={file.dataUrl}
      download={file.name}
      className="flex items-center gap-2.5 bg-slate-950/40 hover:bg-slate-950/60 border border-slate-700/60 rounded-xl px-3 py-2.5 transition-colors max-w-[220px]"
    >
      <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
        <FileIcon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{file.name}</div>
        <div className="text-[10px] text-slate-500">{formatFileSize(file.size)}</div>
      </div>
      <Download size={14} className="text-slate-400 shrink-0" />
    </a>
  );
}

// Seçilen bir resim dosyasını, canvas üzerinden max 128x128 boyutuna
// küçültüp JPEG olarak base64 data URL'e çevirir. Böylece profil resimleri
// veritabanında (Postgres TEXT alanında) makul boyutta kalır.
function resizeImageToDataUrl(file: File, maxSize = 128, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height *= maxSize / width; width = maxSize; }
        } else {
          if (height > maxSize) { width *= maxSize / height; height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context alınamadı')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Ekran paylaşımı / kamera akışlarını gösteren <video> elementi.
// ÖNEMLİ: Eğer ref'i doğrudan JSX içinde inline bir fonksiyonla
// (`ref={(el) => { el.srcObject = stream }}`) versek, o fonksiyon HER
// render'da yeniden oluşturulur ve React ref'i her seferinde önce null'a,
// sonra tekrar elemana bağlar — bu da video akışının sürekli kopup
// yeniden bağlanmasına, yani "göz kırpar gibi" siyah ekran flaşlamasına
// sebep olur. Bu bileşen, srcObject'i sadece `stream` GERÇEKTEN
// değiştiğinde (useEffect + dependency array) bağlayarak bu sorunu çözer.
function StreamVideo({
  stream,
  className,
  muted = false,
  onClick,
}: {
  stream: MediaStream | null;
  className?: string;
  muted?: boolean;
  onClick?: (e: React.MouseEvent<HTMLVideoElement>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted={muted}
      playsInline
      onClick={onClick}
      className={className}
    />
  );
}

// Bir kişinin avatarını gösterir: avatarUrl varsa gerçek resim, yoksa baş
// harflerden oluşan renkli daire. Uygulama genelinde (kendi profilin, 1-1
// sohbet listesi, oda üyeleri, mesaj balonları) tutarlı şekilde kullanılıyor.
function Avatar({
  avatarUrl,
  initials,
  size = 32,
  className = '',
  gradient = false,
}: {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
  className?: string;
  gradient?: boolean;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={initials}
        style={{ width: size, height: size }}
        className={`rounded-lg object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
        gradient ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 text-slate-950' : 'bg-slate-800 border border-slate-700 text-slate-200'
      } ${className}`}
    >
      {initials}
    </div>
  );
}

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  return (
    <>
      {/* Panel dışına tıklayınca kapatmak için görünmez arka plan */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full mb-2 left-0 z-50 w-72 max-h-56 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-3 grid grid-cols-8 gap-1">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="text-xl hover:bg-slate-800 rounded-lg p-1.5 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string>('user');
  const [nickname, setNickname] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>(''); // hâlâ görüntü/varsa admin panel için tutuluyor
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); // kendi profil fotoğrafım
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>(''); // localStorage'daki gerçek User.id (mesaj kaydı için asıl kullanılan kimlik)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');

  const [chatRooms, setChatRooms] = useState<ChatRooms>({});
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string>('');
  // Hangi kullanıcının sohbet verisi localStorage'dan başarıyla yüklendi —
  // kaydetme effect'inin, yükleme bitmeden eski/boş veriyi geri yazmasını
  // engellemek için kullanılıyor (aşağıdaki race condition düzeltmesine bakın).
  const [dataLoadedForUserId, setDataLoadedForUserId] = useState<string | null>(null);

  const [status, setStatus] = useState<string>('P2P Sunucusuna bağlanılıyor...');
  const [inputText, setInputText] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null); // hangi mesajın hızlı tepki paneli açık
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null); // yanıtlanmak üzere seçilen mesaj (1-1 ve grup ortak)
  const [viewingImage, setViewingImage] = useState<FileAttachment | null>(null); // Tıklanan görsel büyük ekranda açılınca burada tutulur
  // "Yazıyor..." göstergesi: 1-1 sohbette karşı tarafın o an yazıp yazmadığı
  const [peerTyping, setPeerTyping] = useState<{ [peerId: string]: boolean }>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);

  // --- ÇOK KİŞİLİ ODA (GRUP) STATE'LERİ ---
  const [leftPanelTab, setLeftPanelTab] = useState<'chats' | 'rooms'>('chats');
  const [myRooms, setMyRooms] = useState<RoomListItem[]>([]); // Sadece benim katıldığım odalar - kalıcı, bana özel
  const [isMyRoomsLoading, setIsMyRoomsLoading] = useState<boolean>(false);
  const [newRoomName, setNewRoomName] = useState<string>('');
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; creatorId?: string } | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [groupRoomMessages, setGroupRoomMessages] = useState<{ [roomId: string]: RoomMessage[] }>({});
  const [roomInputText, setRoomInputText] = useState<string>('');
  // "Yazıyor..." göstergesi: grup odada o an yazan üyeler (birden fazla olabilir)
  const [roomTypingUsers, setRoomTypingUsers] = useState<{ [userId: string]: { name: string; avatar: string } }>({});
  const [isMicOn, setIsMicOn] = useState<boolean>(false);
  const [micError, setMicError] = useState<string>('');
  // Bir katılımcıdan bize canlı ses akışı geliyorsa true — sadece o an aktif
  // gelen MediaConnection'lar üzerinden lokal olarak belirleniyor.
  const [peersWithVoice, setPeersWithVoice] = useState<{ [peerId: string]: boolean }>({});

  // --- SES KONTROL PANELİ ---
  const [showVoicePanel, setShowVoicePanel] = useState<boolean>(false);
  const [micGain, setMicGain] = useState<number>(100); // Kendi mikrofon seviyem (%), GainNode ile uygulanıyor
  const [micMode, setMicMode] = useState<'always' | 'ptt'>('always'); // 'always' = her zaman açık, 'ptt' = bas-konuş
  const [isPttActive, setIsPttActive] = useState<boolean>(false); // bas-konuş modunda şu an gerçekten konuşuyor muyum (tuş/buton basılı)
  const [isDeafened, setIsDeafened] = useState<boolean>(false); // "Kulaklığı kapat" — gelen tüm sesleri susturur
  const [remoteVolumes, setRemoteVolumes] = useState<{ [peerId: string]: number }>({}); // Her katılımcı için ayrı ses seviyesi (%)
  const [remoteMuted, setRemoteMuted] = useState<{ [peerId: string]: boolean }>({}); // Her katılımcıyı tek tek susturma

  // --- EKRAN PAYLAŞIMI ---
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false); // kendi ekranımı paylaşıyor muyum
  const [screenShareFps, setScreenShareFps] = useState<number>(30); // paylaşım başlamadan önce seçilen FPS
  const [screenShares, setScreenShares] = useState<{ [peerId: string]: MediaStream }>({}); // odadaki diğer üyelerden gelen canlı ekran akışları
  const [screenSharerNames, setScreenSharerNames] = useState<{ [peerId: string]: string }>({}); // küçük etiket için isim eşlemesi
  const [viewingScreenPeerId, setViewingScreenPeerId] = useState<string | null>(null); // null | 'me' | peerId — büyük ekranda hangisi açık

  // --- KAMERA (WEBCAM) ---
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false); // kendi kameramı açtım mı
  const [cameraStreams, setCameraStreams] = useState<{ [peerId: string]: MediaStream }>({}); // odadaki diğer üyelerden gelen canlı kamera akışları
  const [cameraSharerNames, setCameraSharerNames] = useState<{ [peerId: string]: string }>({});
  const [viewingCameraPeerId, setViewingCameraPeerId] = useState<string | null>(null); // null | 'me' | peerId — büyük ekranda hangi kamera açık
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false); // ekran paylaşımı/kamera büyük görüntüleyicisi gerçek tam ekranda mı

  // Süper Admin için DB state'leri
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [dbRooms, setDbRooms] = useState<AdminRoom[]>([]);
  const [liveRoomsList, setLiveRoomsList] = useState<RoomListItem[]>([]); // /api/rooms/list'ten gelen, canlı aktif üye sayısıyla
  const [dbMessages, setDbMessages] = useState<ArchivedMessage[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);

  const peerInstance = useRef<any>(null);
  const activeConnections = useRef<{ [key: string]: any }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const roomMessagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // 1-1 sohbet dosya seçici
  const roomFileInputRef = useRef<HTMLInputElement>(null); // grup oda dosya seçici

  // --- ÇOK KİŞİLİ ODA (GRUP) REF'LERİ ---
  const roomConnectionsRef = useRef<{ [peerId: string]: any }>({}); // mesh metin bağlantıları
  const roomMediaConnectionsRef = useRef<{ [peerId: string]: any }>({}); // mesh sesli görüşme bağlantıları
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioElsRef = useRef<{ [peerId: string]: HTMLAudioElement }>({});
  const roomHeartbeatIntervalRef = useRef<any>(null);
  const roomPollIntervalRef = useRef<any>(null);
  // "Yazıyor..." göstergesi için zamanlayıcılar ve throttle takibi
  const peerTypingTimeoutRef = useRef<{ [peerId: string]: any }>({}); // 1-1: alınan TYPING'i otomatik temizlemek için
  const lastTypingSentRef = useRef<number>(0); // 1-1: kendi TYPING gönderimimizi sınırlamak (throttle) için
  const roomTypingTimeoutRef = useRef<{ [userId: string]: any }>({}); // grup: alınan ROOM_TYPING'i otomatik temizlemek için
  const lastRoomTypingSentRef = useRef<number>(0); // grup: kendi ROOM_TYPING gönderimimizi sınırlamak için
  // PeerJS event handler'ları (peer.on('connection')/('call')) closure içinde
  // eski state'i görebildiği için (stale closure), kritik değerleri ref'te
  // de tutup handler'lar içinde ref üzerinden okuyoruz.
  const currentRoomRef = useRef<{ id: string; name: string; creatorId?: string } | null>(null);
  const isMicOnRef = useRef<boolean>(false);
  const nicknameRef = useRef<string>('');
  const userIdRef = useRef<string>('');

  // --- SES KONTROL PANELİ İÇİN REF'LER ---
  // Kendi mikrofonumuzu GainNode üzerinden yollamak için: ham mikrofon akışı,
  // AudioContext ve GainNode ayrı ayrı tutuluyor ki ses seviyesi değiştiğinde
  // akışı yeniden başlatmaya gerek kalmadan sadece gain.value güncellensin.
  const micRawStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<any>(null);
  const micGainNodeRef = useRef<any>(null);
  // peer.on('call') gibi handler'lar içinde güncel değeri okuyabilmek için
  // (stale closure'dan kaçınmak amacıyla) state'lerin ref kopyaları
  const remoteVolumesRef = useRef<{ [peerId: string]: number }>({});
  const remoteMutedRef = useRef<{ [peerId: string]: boolean }>({});
  const isDeafenedRef = useRef<boolean>(false);
  // Push-to-talk (bas-konuş) için ref'ler — klavye/mouse olay dinleyicileri
  // stabil (bir kez kurulan) olduğundan, güncel değeri stale closure
  // olmadan okuyabilmek için state'lerin ref kopyalarını tutuyoruz.
  const micGainRef = useRef<number>(100);
  const micModeRef = useRef<'always' | 'ptt'>('always');
  const isPttActiveRef = useRef<boolean>(false);

  // --- EKRAN PAYLAŞIMI İÇİN REF'LER ---
  const screenStreamRef = useRef<MediaStream | null>(null); // kendi paylaştığım ekran akışı
  const screenMediaConnectionsRef = useRef<{ [peerId: string]: any }>({}); // giden ekran paylaşımı bağlantıları (bizden onlara)
  const isScreenSharingRef = useRef<boolean>(false);

  // --- KAMERA İÇİN REF'LER ---
  const cameraStreamRef = useRef<MediaStream | null>(null); // kendi kamera akışım
  const cameraMediaConnectionsRef = useRef<{ [peerId: string]: any }>({}); // giden kamera bağlantıları (bizden onlara)
  const isCameraOnRef = useRef<boolean>(false);
  const avatarUrlRef = useRef<string | null>(null); // HANDSHAKE gönderirken güncel avatarı okumak için (stale closure önlemi)
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Bu oturumda geçmişi zaten çekilmiş oda ID'leri — aynı odaya çıkıp tekrar
  // girildiğinde geçmişi gereksiz yere tekrar tekrar çekmemek için.
  const loadedRoomHistoryRef = useRef<Set<string>>(new Set());

  // Ekran paylaşımı / kamera büyük görüntüleyicilerini gerçek tarayıcı tam
  // ekranına (adres çubuğu, sekmeler dahil her şeyin gizlendiği mod)
  // geçirebilmek için konteyner elementlerin ref'leri.
  const screenLightboxRef = useRef<HTMLDivElement>(null);
  const cameraLightboxRef = useRef<HTMLDivElement>(null);

  // Kullanıcı Esc'e basıp tarayıcının kendi tam ekranından çıkarsa (F11/Esc
  // gibi), butonumuzun ikonunun da senkron kalması için tarayıcının kendi
  // olayını dinliyoruz.
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Verilen elementi gerçek tarayıcı tam ekranına alır/çıkarır. Tarayıcı
  // güvenlik politikası gereği bu, ancak bir kullanıcı tıklaması (gesture)
  // içinde çağrılırsa çalışır — otomatik/sayfa açılışında tetiklenemez.
  const toggleFullscreen = (el: HTMLElement | null) => {
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch((err) => console.warn("Tam ekrana geçilemedi:", err));
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);
  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { remoteVolumesRef.current = remoteVolumes; }, [remoteVolumes]);
  useEffect(() => { remoteMutedRef.current = remoteMuted; }, [remoteMuted]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);
  useEffect(() => { isCameraOnRef.current = isCameraOn; }, [isCameraOn]);
  useEffect(() => { avatarUrlRef.current = avatarUrl; }, [avatarUrl]);
  useEffect(() => { micGainRef.current = micGain; applyMicGain(); }, [micGain]);
  useEffect(() => { micModeRef.current = micMode; applyMicGain(); }, [micMode]);
  useEffect(() => { isPttActiveRef.current = isPttActive; applyMicGain(); }, [isPttActive]);

  // userId belli olunca kendi profil fotoğrafımı sunucudan çekiyoruz
  // (login akışı localStorage'a avatarUrl yazmıyor, bu yüzden ayrı bir istek).
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/avatar?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setAvatarUrl(data.avatarUrl); })
      .catch((err) => console.error("Avatar alınamadı:", err));
  }, [userId]);

  // Profil resmi seçilince: küçültüp sunucuya yollar, başarılı olursa yerel state'i günceller.
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;

    if (!file.type.startsWith('image/')) {
      alert('Lütfen bir resim dosyası seç.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const resizedDataUrl = await resizeImageToDataUrl(file, 128, 0.85);
      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, avatarDataUrl: resizedDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Profil resmi yüklenemedi.');
        return;
      }
      setAvatarUrl(resizedDataUrl);
    } catch (err) {
      console.error("Avatar yükleme hatası:", err);
      alert('Profil resmi yüklenirken bir hata oluştu.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!userId) return;
    if (!confirm('Profil resmini kaldırmak istediğine emin misin?')) return;
    try {
      await fetch('/api/users/avatar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      setAvatarUrl(null);
    } catch (err) {
      console.error("Avatar kaldırma hatası:", err);
    }
  };

  // Güvenli Ses Çalma
  const playNotificationSound = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') return;

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (error) {
      console.warn("Ses çalınamadı:", error);
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const showPushNotification = (senderName: string, text: string) => {
    if (notificationsEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      new Notification(`${senderName} mesaj gönderdi`, { body: text });
    }
  };

  // P2P kodu artık 'p2p-' + userId formatında olduğu için, karşı tarafın
  // gerçek veritabanı ID'sini handshake'e güvenmeden doğrudan koddan çıkarabiliriz.
  const extractUserIdFromPeerId = (pid: string): string | null => {
    if (!pid) return null;
    return pid.startsWith('p2p-') ? pid.slice(4) : pid;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatRooms, selectedPeerId]);

  useEffect(() => {
    roomMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupRoomMessages, currentRoom]);

  // Farklı bir sohbete/odaya geçince, önceki konuşmadan kalan "yanıtlanıyor"
  // durumu (yanlış mesaja yanıt vermeyi önlemek için) sıfırlanır.
  useEffect(() => {
    setReplyingTo(null);
  }, [selectedPeerId, currentRoom?.id]);

  // Giriş ve Rol Kontrolü
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setNickname(parsedUser.username || 'Kullanıcı');
      setUserEmail(parsedUser.email || '');
      setUserId(parsedUser.id || ''); // gerçek veritabanı ID'si - mesajları arşivlerken bunu kullanıyoruz
      setUserRole(parsedUser.role || 'user');
      setIsLoggedIn(true);
    } else {
      router.push("/");
    }
    setIsHydrated(true);
  }, [router]);

  // Sohbet Verilerini Kullanıcıya Özel Yükleme
  // DÜZELTME: sohbet verileri artık sabit 'p2p_chat_rooms' / 'p2p_active_chats'
  // anahtarları yerine, userId'ye özel anahtarlarla saklanıyor. Böylece aynı
  // tarayıcıda birden fazla kullanıcı test edilse bile (örn. iki sekme),
  // birinin verisi diğerininkini ezmiyor veya silmiyor.
  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return;

    // Kullanıcı değiştiğinde (ör. logout sonrası farklı hesapla giriş)
    // önce bayrağı sıfırla ki kaydetme effect'i kesinlikle beklesin.
    setDataLoadedForUserId(null);

    const savedRooms = localStorage.getItem(`p2p_chat_rooms_${userId}`);
    const savedChats = localStorage.getItem(`p2p_active_chats_${userId}`);
    setChatRooms(savedRooms ? JSON.parse(savedRooms) : {});
    if (savedChats) {
      const parsedChats = JSON.parse(savedChats);
      setActiveChats(parsedChats);
      if (parsedChats.length > 0) setSelectedPeerId(parsedChats[0].id);
    } else {
      setActiveChats([]);
    }
    // Yükleme tamamlandı — artık kaydetme effect'i güvenle çalışabilir.
    setDataLoadedForUserId(userId);
  }, [userId]);

  // Veritabanı Verilerini Çekme (Admin)
  const fetchAdminData = async () => {
    if (!isLoggedIn || userRole !== 'super_admin') return;
    setIsAdminLoading(true);
    try {
      const [allDataRes, roomsListRes] = await Promise.all([
        fetch('/api/admin/all-data', {
          method: 'GET',
          headers: {
            'x-user-role': 'super_admin',
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/rooms/list', {
          method: 'GET',
          headers: {
            'x-user-role': 'super_admin',
            'Content-Type': 'application/json'
          }
        })
      ]);
      const data = await allDataRes.json();
      if (data.success) {
        setAllUsers(data.users || []);
        setDbRooms(data.rooms || []);
        setDbMessages(data.messages || []);
      } else {
        console.error("Veri yükleme hatası:", data.error);
      }

      const roomsData = await roomsListRes.json();
      if (roomsData.success) {
        setLiveRoomsList(roomsData.rooms || []);
      } else {
        console.error("Canlı oda listesi alınamadı:", roomsData.error);
      }
    } catch (err) {
      console.error("API bağlantı hatası:", err);
    } finally {
      setIsAdminLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    // Admin ise her 15 saniyede bir mesajları otomatik tazele
    let interval: any;
    if (isLoggedIn && userRole === 'super_admin') {
      interval = setInterval(fetchAdminData, 15000);
    }
    return () => clearInterval(interval);
  }, [isLoggedIn, userRole]);

  useEffect(() => {
    // KRİTİK: dataLoadedForUserId === userId kontrolü olmadan, kullanıcı
    // girişinde önce bu effect boş chatRooms/activeChats'i (state'in
    // başlangıç değeri) localStorage'a yazıyor, SONRA yükleme effect'i
    // gerçek veriyi okuyordu — ama yazma zaten gerçek veriyi ezmiş oluyordu.
    // Bu kontrol, yükleme bu kullanıcı için tamamlanmadan yazmayı engeller.
    if (isHydrated && typeof window !== 'undefined' && userId && dataLoadedForUserId === userId) {
      localStorage.setItem(`p2p_chat_rooms_${userId}`, JSON.stringify(chatRooms));
      localStorage.setItem(`p2p_active_chats_${userId}`, JSON.stringify(activeChats));
    }
  }, [chatRooms, activeChats, isHydrated, userId]);

  // Arka Planda Mesajı Veritabanına Kaydetme
  // DÜZELTME: email localStorage'da hiç saklanmadığı için (login akışı
  // sadece id/username/role kaydediyor) artık doğrudan gerçek veritabanı
  // ID'sini (userId) kullanıyoruz. Bu hem daha güvenilir hem de login
  // akışına dokunmaya gerek bırakmıyor.
  const archiveMessageToDatabase = async (text: string, recipientUserId: string | null) => {
    if (!userId) {
      console.error("Mesaj arşivlenemedi: userId bulunamadı (localStorage'daki 'user' objesinde id eksik).");
      return;
    }
    try {
      const res = await fetch('/api/messages/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          senderId: userId,
          recipientId: recipientUserId
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Mesaj kaydedilemedi (server yanıtı):", errData);
      }
    } catch (err) {
      console.error("Mesaj veri tabanına arşivlenirken hata oluştu:", err);
    }
  };

  // Bağlantı Olaylarını Yöneten Fonksiyon
  const setupConnectionEvents = (conn: any) => {
    const remotePeerId = conn.peer;
    activeConnections.current[remotePeerId] = conn;

    conn.on('open', () => {
      setStatus('Eşe Bağlandı');
      // DÜZELTME: karşı taraf yeniden bağlandığında "çevrimdışı" durumunu
      // "çevrimiçi"ye çeviriyoruz. Sohbet zaten listede duruyor, sadece
      // durumu güncelliyoruz; silip yeniden eklemiyoruz.
      setActiveChats((prev) =>
        prev.map((chat) =>
          chat.id === remotePeerId ? { ...chat, isOnline: true } : chat
        )
      );
      conn.send({
        type: 'HANDSHAKE',
        senderName: nickname,
        senderAvatar: nickname.substring(0, 2).toUpperCase(),
        senderAvatarUrl: avatarUrlRef.current,
        senderUserId: userId // DÜZELTME: karşı tarafa gerçek veritabanı ID'mizi gönderiyoruz
      });
    });

    conn.on('data', (data: any) => {
      if (data.type === 'HANDSHAKE') {
        setActiveChats((prev) => {
          if (prev.some(chat => chat.id === remotePeerId)) {
            // Zaten varsa userId bilgisini güncelle (ilk bağlantıda boş olabilir)
            return prev.map(chat =>
              chat.id === remotePeerId ? { ...chat, userId: data.senderUserId, avatarUrl: data.senderAvatarUrl, isOnline: true } : chat
            );
          }
          return [...prev, {
            id: remotePeerId,
            name: data.senderName,
            avatar: data.senderAvatar,
            avatarUrl: data.senderAvatarUrl,
            userId: data.senderUserId,
            isOnline: true
          }];
        });
        setSelectedPeerId(remotePeerId);
        return;
      }

      if (data.type === 'TYPING') {
        setPeerTyping((prev) => ({ ...prev, [remotePeerId]: true }));
        // Karşı taraf birkaç saniye boyunca yeni TYPING göndermezse göstergeyi otomatik kaldır
        if (peerTypingTimeoutRef.current[remotePeerId]) {
          clearTimeout(peerTypingTimeoutRef.current[remotePeerId]);
        }
        peerTypingTimeoutRef.current[remotePeerId] = setTimeout(() => {
          setPeerTyping((prev) => ({ ...prev, [remotePeerId]: false }));
        }, 3000);
        return;
      }

      if (data.type === 'REACTION') {
        setChatRooms((prev) => {
          const msgs = prev[remotePeerId] || [];
          return {
            ...prev,
            [remotePeerId]: msgs.map((m) =>
              m.id === data.messageId ? { ...m, reactions: toggleReaction(m.reactions, data.emoji, data.reactorUserId) } : m
            ),
          };
        });
        return;
      }

      const incomingMessage: Message = {
        id: data.messageId || (Date.now().toString() + '-peer'),
        sender: 'peer',
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
        senderAvatarUrl: data.senderAvatarUrl,
        text: data.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        file: data.type === 'FILE' ? data.file : undefined,
        replyTo: data.replyTo,
      };

      setChatRooms((prev) => ({
        ...prev,
        [remotePeerId]: [...(prev[remotePeerId] || []), incomingMessage]
      }));

      // Mesaj gelince "yazıyor" göstergesini hemen kapat
      setPeerTyping((prev) => ({ ...prev, [remotePeerId]: false }));
      if (peerTypingTimeoutRef.current[remotePeerId]) {
        clearTimeout(peerTypingTimeoutRef.current[remotePeerId]);
      }

      playNotificationSound();
      showPushNotification(data.senderName, data.text);
    });

    // DÜZELTME (ANA HATA BURADAYDI): Bağlantı kapandığında (örn. karşı taraf
    // oturumu kapattığı için peer.destroy() çağrıldığında) daha önce burada
    // sohbeti activeChats listesinden TAMAMEN siliyorduk. Bu, karşı taraf
    // SADECE oturumu kapatmış olsa bile sohbeti bizim listemizden kalıcı
    // olarak kaybettiriyordu (hemen ardından localStorage'a da yazılıyordu).
    // Artık sohbeti silmiyoruz, sadece "çevrimdışı" olarak işaretliyoruz.
    // Mesaj geçmişi (chatRooms) ve sohbet girdisi (activeChats) korunuyor.
    conn.on('close', () => {
      setStatus('Bağlantı koptu.');
      delete activeConnections.current[remotePeerId];
      setActiveChats((prev) =>
        prev.map((chat) =>
          chat.id === remotePeerId ? { ...chat, isOnline: false } : chat
        )
      );
    });

    conn.on('error', () => {
      setStatus('Bağlantı hatası gerçekleşti.');
      delete activeConnections.current[remotePeerId];
      // DÜZELTME: burada da artık sohbeti silmiyoruz, sadece çevrimdışı yapıyoruz.
      setActiveChats((prev) =>
        prev.map((chat) =>
          chat.id === remotePeerId ? { ...chat, isOnline: false } : chat
        )
      );
    });
  };

  // =====================================================================
  // ÇOK KİŞİLİ ODA (GRUP) MANTIĞI
  // =====================================================================
  // PeerJS kendi başına "odadaki herkes kim" bilgisini vermiyor; bu yüzden
  // sunucuda hafif bir "presence" (heartbeat) sistemi tutuyoruz. İstemci
  // periyodik olarak "hâlâ buradayım" der (heartbeat) ve odadaki aktif
  // üyelerin listesini çeker (poll). Yeni biri listede görünürse, ona
  // doğrudan PeerJS bağlantısı açılır (mesh: herkes herkese bağlanır).

  // Bir grup oda bağlantısından (mesh üyesi) gelen veriyi işler.
  const setupRoomConnectionEvents = (conn: any) => {
    const remotePeerId = conn.peer;

    conn.on('data', (data: any) => {
      if (data?.type === 'ROOM_FORCE_MUTE') {
        if (data.targetUserId !== userIdRef.current) return;
        stopMic();
        alert('Oda sahibi tarafından susturuldun.');
        return;
      }

      if (data?.type === 'ROOM_KICKED') {
        alert('Oda sahibi tarafından odadan çıkarıldın.');
        leaveRoom();
        return;
      }

      if (data?.type === 'ROOM_TYPING') {
        setRoomTypingUsers((prev) => ({
          ...prev,
          [data.senderId]: { name: data.senderName, avatar: data.senderAvatar },
        }));
        if (roomTypingTimeoutRef.current[data.senderId]) {
          clearTimeout(roomTypingTimeoutRef.current[data.senderId]);
        }
        roomTypingTimeoutRef.current[data.senderId] = setTimeout(() => {
          setRoomTypingUsers((prev) => {
            const next = { ...prev };
            delete next[data.senderId];
            return next;
          });
        }, 3000);
        return;
      }

      if (data?.type === 'ROOM_REACTION') {
        const room = currentRoomRef.current;
        if (!room) return;
        setGroupRoomMessages((prev) => {
          const msgs = prev[room.id] || [];
          return {
            ...prev,
            [room.id]: msgs.map((m) =>
              m.id === data.messageId ? { ...m, reactions: toggleReaction(m.reactions, data.emoji, data.reactorUserId) } : m
            ),
          };
        });
        return;
      }

      if (data?.type !== 'ROOM_MESSAGE' && data?.type !== 'ROOM_FILE') return;
      const room = currentRoomRef.current;
      if (!room) return;

      const incoming: RoomMessage = {
        id: data.messageId || (Date.now().toString() + '-' + remotePeerId),
        senderId: data.senderId,
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
        senderAvatarUrl: data.senderAvatarUrl,
        text: data.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        file: data.type === 'ROOM_FILE' ? data.file : undefined,
        replyTo: data.replyTo,
      };

      setGroupRoomMessages((prev) => ({
        ...prev,
        [room.id]: [...(prev[room.id] || []), incoming],
      }));

      // Mesaj gelince o kişinin "yazıyor" göstergesini hemen kapat
      setRoomTypingUsers((prev) => {
        const next = { ...prev };
        delete next[data.senderId];
        return next;
      });
      if (roomTypingTimeoutRef.current[data.senderId]) {
        clearTimeout(roomTypingTimeoutRef.current[data.senderId]);
      }

      playNotificationSound();
      showPushNotification(data.senderName, data.text);
    });

    conn.on('close', () => {
      delete roomConnectionsRef.current[remotePeerId];
    });

    conn.on('error', () => {
      delete roomConnectionsRef.current[remotePeerId];
    });
  };

  // Bir katılımcı için <audio> elementini oluşturur (yoksa) ve o an geçerli
  // olan ses seviyesi / susturma / kulaklık-kapalı ayarlarını hemen uygular.
  // Böylece yeni bağlanan biri için de daha önce ayarladığın tercihler geçerli olur.
  const getOrCreateRemoteAudioEl = (remotePeerId: string): HTMLAudioElement => {
    let audioEl = remoteAudioElsRef.current[remotePeerId];
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true;
      document.body.appendChild(audioEl);
      remoteAudioElsRef.current[remotePeerId] = audioEl;
    }
    audioEl.volume = (remoteVolumesRef.current[remotePeerId] ?? 100) / 100;
    audioEl.muted = !!remoteMutedRef.current[remotePeerId] || isDeafenedRef.current;
    return audioEl;
  };

  // Gelen sesli görüşme çağrısını yönetir (mesh: her üyeden ayrı ayrı gelir).
  const setupIncomingRoomCall = (call: any) => {
    const remotePeerId = call.peer;
    // Mikrofonumuz açıksa kendi sesimizi de göndeririz, kapalıysa sadece
    // dinleriz (tek yönlü — PeerJS undefined stream ile "receive-only" cevap kabul eder).
    call.answer(isMicOnRef.current ? localStreamRef.current || undefined : undefined);

    call.on('stream', (remoteStream: MediaStream) => {
      const audioEl = getOrCreateRemoteAudioEl(remotePeerId);
      audioEl.srcObject = remoteStream;
      setPeersWithVoice((prev) => ({ ...prev, [remotePeerId]: true }));
    });

    call.on('close', () => {
      cleanupRoomVoicePeer(remotePeerId);
    });
    call.on('error', () => {
      cleanupRoomVoicePeer(remotePeerId);
    });

    roomMediaConnectionsRef.current[remotePeerId] = call;
  };

  const cleanupRoomVoicePeer = (remotePeerId: string) => {
    delete roomMediaConnectionsRef.current[remotePeerId];
    const audioEl = remoteAudioElsRef.current[remotePeerId];
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      delete remoteAudioElsRef.current[remotePeerId];
    }
    setPeersWithVoice((prev) => {
      const next = { ...prev };
      delete next[remotePeerId];
      return next;
    });
  };

  // DÜZELTME: Oda listesi herkese açık gösterilmiyor artık — odalar sadece
  // kod paylaşılarak katılınabilir olsun istendi. fetchRoomsList kaldırıldı.

  // Bir odaya arşivlenmiş mesaj geçmişini veritabanından çeker ve o odanın
  // state'ine (varsa canlı gelen mesajların ÖNÜNE) ekler. Böylece odadan
  // çıkıp tekrar girince, hatta sayfa yenilense/yeniden giriş yapılsa bile
  // geçmiş mesajlar kaybolmaz.
  const fetchRoomMessageHistory = async (roomId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/messages?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!data.success) {
        console.error("Oda geçmişi alınamadı:", data.error);
        return;
      }
      const history: RoomMessage[] = data.messages.map((m: any) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName || 'Kullanıcı',
        senderAvatar: (m.senderName || 'Kullanıcı').substring(0, 2).toUpperCase(),
        text: m.text,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
      setGroupRoomMessages((prev) => ({
        ...prev,
        [roomId]: [...history, ...(prev[roomId] || [])],
      }));
    } catch (err) {
      console.error("Oda geçmişi çekilirken hata oluştu:", err);
    }
  };

  // Daha önce katıldığım (ve hâlâ Room.participants ilişkisinde yer aldığım)
  // odaları çeker. Bu liste SADECE bana özeldir — katılmadığım odalar burada
  // hiç görünmez. Odadan "ayrılmak" (leaveRoom) bu ilişkiyi bozmaz, o yüzden
  // 1-1 sohbetler gibi oda da benim listemde kalıcı kalır.
  const fetchMyRooms = async () => {
    if (!userId) return;
    setIsMyRoomsLoading(true);
    try {
      const res = await fetch(`/api/rooms/my?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.success) setMyRooms(data.rooms || []);
    } catch (err) {
      console.error("Odalarım alınamadı:", err);
    } finally {
      setIsMyRoomsLoading(false);
    }
  };

  // Odalar sekmesi açıldığında ve odaya her katılımda/ayrılışta listeyi tazele
  useEffect(() => {
    if (leftPanelTab !== 'rooms' || !userId) return;
    fetchMyRooms();
    const interval = setInterval(fetchMyRooms, 8000);
    return () => clearInterval(interval);
  }, [leftPanelTab, userId, currentRoom]);

  // Odadaki aktif üyeleri çeker ve yeni birileri varsa mesh bağlantısı açar.
  const pollRoomMembers = async (roomId: string) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/members`);
      const data = await res.json();
      if (!data.success) return;

      const members: RoomMember[] = data.members || [];
      setRoomMembers(members);

      members.forEach((member) => {
        if (member.peerId === peerInstance.current?.id) return; // kendimiz
        if (roomConnectionsRef.current[member.peerId]) return; // zaten bağlı

        const conn = peerInstance.current?.connect(member.peerId, {
          metadata: { type: 'room', roomId },
        });
        if (!conn) return;
        roomConnectionsRef.current[member.peerId] = conn;
        setupRoomConnectionEvents(conn);

        // Mikrofonumuz açıksa yeni üyeyi de sesli görüşmeye dahil et.
        if (isMicOnRef.current && localStreamRef.current && peerInstance.current) {
          const call = peerInstance.current.call(member.peerId, localStreamRef.current, {
            metadata: { type: 'room-voice', roomId },
          });
          if (call) setupOutgoingRoomCall(call);
        }

        // Ekran paylaşıyorsak yeni üyeye de o akışı yolla.
        if (isScreenSharingRef.current && screenStreamRef.current && peerInstance.current) {
          const screenCall = peerInstance.current.call(member.peerId, screenStreamRef.current, {
            metadata: { type: 'room-screen', roomId },
          });
          if (screenCall) screenMediaConnectionsRef.current[member.peerId] = screenCall;
        }

        // Kameramız açıksa yeni üyeye de o akışı yolla.
        if (isCameraOnRef.current && cameraStreamRef.current && peerInstance.current) {
          const cameraCall = peerInstance.current.call(member.peerId, cameraStreamRef.current, {
            metadata: { type: 'room-camera', roomId },
          });
          if (cameraCall) cameraMediaConnectionsRef.current[member.peerId] = cameraCall;
        }
      });

      // Odadan ayrılmış üyelerin bağlantılarını temizle
      const currentMemberPeerIds = new Set(members.map((m) => m.peerId));
      Object.keys(roomConnectionsRef.current).forEach((pid) => {
        if (!currentMemberPeerIds.has(pid)) {
          try { roomConnectionsRef.current[pid].close(); } catch {}
          delete roomConnectionsRef.current[pid];
        }
      });
      Object.keys(roomMediaConnectionsRef.current).forEach((pid) => {
        if (!currentMemberPeerIds.has(pid)) {
          try { roomMediaConnectionsRef.current[pid].close(); } catch {}
          cleanupRoomVoicePeer(pid);
        }
      });
      // Giden ekran paylaşımı bağlantıları (bizden onlara)
      Object.keys(screenMediaConnectionsRef.current).forEach((pid) => {
        if (!currentMemberPeerIds.has(pid)) {
          try { screenMediaConnectionsRef.current[pid].close(); } catch {}
          delete screenMediaConnectionsRef.current[pid];
        }
      });
      // Gelen ekran paylaşımları (onlardan bize) — o kişi artık odada değilse görüntüyü kaldır
      setScreenShares((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((pid) => {
          if (!currentMemberPeerIds.has(pid)) {
            delete next[pid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      // Giden kamera bağlantıları (bizden onlara)
      Object.keys(cameraMediaConnectionsRef.current).forEach((pid) => {
        if (!currentMemberPeerIds.has(pid)) {
          try { cameraMediaConnectionsRef.current[pid].close(); } catch {}
          delete cameraMediaConnectionsRef.current[pid];
        }
      });
      // Gelen kameralar (onlardan bize)
      setCameraStreams((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((pid) => {
          if (!currentMemberPeerIds.has(pid)) {
            delete next[pid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    } catch (err) {
      console.error("Oda üyeleri alınamadı:", err);
    }
  };

  const setupOutgoingRoomCall = (call: any) => {
    const remotePeerId = call.peer;
    call.on('stream', (remoteStream: MediaStream) => {
      const audioEl = getOrCreateRemoteAudioEl(remotePeerId);
      audioEl.srcObject = remoteStream;
      setPeersWithVoice((prev) => ({ ...prev, [remotePeerId]: true }));
    });
    call.on('close', () => cleanupRoomVoicePeer(remotePeerId));
    call.on('error', () => cleanupRoomVoicePeer(remotePeerId));
    roomMediaConnectionsRef.current[remotePeerId] = call;
  };

  const startRoomLoops = (roomId: string) => {
    stopRoomLoops();
    pollRoomMembers(roomId);
    roomHeartbeatIntervalRef.current = setInterval(() => {
      fetch(`/api/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userIdRef.current }),
      }).catch(() => {});
    }, ROOM_HEARTBEAT_MS);
    roomPollIntervalRef.current = setInterval(() => pollRoomMembers(roomId), ROOM_POLL_MS);
  };

  const stopRoomLoops = () => {
    if (roomHeartbeatIntervalRef.current) clearInterval(roomHeartbeatIntervalRef.current);
    if (roomPollIntervalRef.current) clearInterval(roomPollIntervalRef.current);
    roomHeartbeatIntervalRef.current = null;
    roomPollIntervalRef.current = null;
  };

  const joinRoom = async (roomId: string, roomName?: string) => {
    if (!userId || !peerId) return;
    // Zaten başka bir odadaysak, önce oradan düzgünce ayrıl (mesh bağlantılar,
    // mikrofon ve heartbeat/poll döngüleri kapatılsın) — yoksa eski oda
    // arka planda açık kalır.
    if (currentRoomRef.current && currentRoomRef.current.id !== roomId) {
      await leaveRoom();
    }
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, peerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Odaya katılınamadı.');
        return;
      }
      setSelectedPeerId(''); // 1-1 sohbeti kapat
      setCurrentRoom({ id: roomId, name: data.room?.name || roomName || 'Oda', creatorId: data.room?.creatorId });

      // DÜZELTME: oda mesajları artık odadan çıkıp girince kaybolmuyor.
      // Bu oturumda bu odaya daha önce hiç girilmediyse (loadedRoomHistoryRef'te
      // yoksa), veritabanındaki arşivden geçmiş mesajları çekip yüklüyoruz.
      // Bu oturum içinde zaten bir kez yüklendiyse (örn. çıkıp tekrar
      // girdiysen), state'te zaten duran (canlı P2P ile zenginleşmiş)
      // mesajların üzerine yazmıyoruz — sadece dokunmadan bırakıyoruz.
      if (!loadedRoomHistoryRef.current.has(roomId)) {
        loadedRoomHistoryRef.current.add(roomId);
        fetchRoomMessageHistory(roomId);
      } else {
        setGroupRoomMessages((prev) => (prev[roomId] ? prev : { ...prev, [roomId]: [] }));
      }

      startRoomLoops(roomId);
    } catch (err) {
      console.error("Odaya katılma hatası:", err);
      alert('Odaya katılırken bir hata oluştu.');
    }
  };

  const leaveRoom = async () => {
    const room = currentRoomRef.current;
    stopRoomLoops();

    // Mikrofon açıksa kapat, tüm ses/metin bağlantılarını sonlandır
    stopMic();
    // Ekran paylaşıyorsak onu da kapat
    stopScreenShare();
    setScreenShares({});
    setScreenSharerNames({});
    // Kamera açıksa onu da kapat
    stopCamera();
    setCameraStreams({});
    setCameraSharerNames({});
    Object.values(roomConnectionsRef.current).forEach((conn: any) => {
      try { conn.close(); } catch {}
    });
    roomConnectionsRef.current = {};

    setCurrentRoom(null);
    setRoomMembers([]);
    // Odadan çıkınca "yazıyor" göstergelerini de temizle
    Object.values(roomTypingTimeoutRef.current).forEach((t: any) => clearTimeout(t));
    roomTypingTimeoutRef.current = {};
    setRoomTypingUsers({});
    // Oda-özel ses ayarlarını da temizle (mikrofon seviyen ve kulaklık
    // tercihin kalıcı kalır, ama kişi bazlı ses/susturma ayarları o odaya
    // özeldi, yeni bir odada sıfırdan başlaması daha mantıklı)
    setRemoteVolumes({});
    setRemoteMuted({});
    setShowVoicePanel(false);

    if (room && userIdRef.current) {
      fetch(`/api/rooms/${room.id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userIdRef.current }),
      }).catch(() => {});
    }
  };

  const handleCreateRoom = async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoomName.trim(), creatorId: userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Oda oluşturulamadı.');
        return;
      }
      setNewRoomName('');
      await joinRoom(data.room.id, data.room.name);
    } catch (err) {
      console.error("Oda oluşturma hatası:", err);
      alert('Oda oluşturulurken bir hata oluştu.');
    }
  };

  const handleJoinByCode = () => {
    const code = joinRoomCode.trim();
    if (!code) return;
    joinRoom(code);
    setJoinRoomCode('');
  };

  // Oda sahibi (creator) ise odayı HERKES İÇİN kalıcı olarak siler.
  // Sahibi değilse, sadece kendi "Odalarım" listesinden kaldırır — oda
  // diğer katılımcılar için aynen durmaya devam eder.
  const handleDeleteOrForgetRoom = async (room: RoomListItem) => {
    const isOwner = room.creatorId === userId;
    const confirmText = isOwner
      ? `"${room.name || 'Bu oda'}" odasını KALICI OLARAK silmek istediğine emin misin? Tüm mesajlar ve katılımcılar için de silinecek, geri alınamaz.`
      : `"${room.name || 'Bu oda'}" odasını kendi listenden kaldırmak istediğine emin misin? Oda diğer katılımcılar için silinmeyecek.`;
    if (!confirm(confirmText)) return;

    // Şu an o odanın içindeysek önce düzgünce ayrıl (mesh/mikrofon kapansın)
    if (currentRoomRef.current?.id === room.id) {
      await leaveRoom();
    }

    try {
      const endpoint = isOwner ? `/api/rooms/${room.id}/delete` : `/api/rooms/${room.id}/forget`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'İşlem gerçekleştirilemedi.');
        return;
      }
      setMyRooms((prev) => prev.filter((r) => r.id !== room.id));
    } catch (err) {
      console.error("Oda silme/kaldırma hatası:", err);
      alert('Bir hata oluştu.');
    }
  };

  // Kullanıcı oda içinde yazarken diğer mesh üyelerine ROOM_TYPING yollar
  const handleRoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRoomInputText(value);
    if (!currentRoom) return;
    const now = Date.now();
    if (now - lastRoomTypingSentRef.current < 1500) return;
    lastRoomTypingSentRef.current = now;
    const payload = {
      type: 'ROOM_TYPING',
      senderId: userId,
      senderName: nickname,
      senderAvatar: nickname.substring(0, 2).toUpperCase(),
    };
    Object.values(roomConnectionsRef.current).forEach((conn: any) => {
      try { conn.send(payload); } catch {}
    });
  };

  const handleSendRoomMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInputText.trim() || !currentRoom) return;

    const myAvatar = nickname.substring(0, 2).toUpperCase();
    const messageId = generateMessageId();
    const replyTo = replyingTo || undefined;
    const payload = {
      type: 'ROOM_MESSAGE',
      messageId,
      senderId: userId,
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: roomInputText,
      replyTo,
    };

    Object.values(roomConnectionsRef.current).forEach((conn: any) => {
      try { conn.send(payload); } catch {}
    });

    const localMsg: RoomMessage = {
      id: messageId,
      senderId: userId,
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: roomInputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      replyTo,
    };

    setGroupRoomMessages((prev) => ({
      ...prev,
      [currentRoom.id]: [...(prev[currentRoom.id] || []), localMsg],
    }));
    setReplyingTo(null);

    // Grup mesajını da veritabanına arşivle (recipientId yok, roomId var)
    fetch('/api/messages/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: roomInputText, senderId: userId, roomId: currentRoom.id }),
    }).catch((err) => console.error("Grup mesajı arşivlenemedi:", err));

    setRoomInputText('');
    setShowEmojiPicker(false);
  };

  // Mikrofonun gerçek çıkış seviyesini hesaplayıp GainNode'a uygular:
  // - "Her zaman açık" modunda her zaman ayarlanan seviyede
  // - "Bas-konuş" modunda ise SADECE tuş/buton basılıyken (isPttActive) o
  //   seviyede, aksi halde tamamen sessiz (gain 0). Akış/bağlantılar hiç
  //   kesilmiyor — sadece çıkış sesi anlık olarak açılıp kapanıyor, bu
  //   yüzden gecikme yaşanmıyor.
  const applyMicGain = () => {
    if (!micGainNodeRef.current) return;
    const shouldBeAudible = micModeRef.current === 'always' || isPttActiveRef.current;
    micGainNodeRef.current.gain.value = shouldBeAudible ? micGainRef.current / 100 : 0;
  };

  // Mikrofonu açar: ses akışı alır, GainNode'dan geçirir (böylece "Mikrofon
  // Seviyen" kaydırıcısı akışı yeniden başlatmadan çalışabilir) ve odadaki
  // her mesh üyesine bu işlenmiş akışı yollar.
  const startMic = async () => {
    setMicError('');
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRawStreamRef.current = rawStream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(rawStream);
      const gainNode = audioCtx.createGain();
      // Bas-konuş modundaysak akış SESSİZ başlar (tuşa basana kadar);
      // her zaman açık moddaysak direkt ayarlı seviyede başlar.
      gainNode.gain.value = micModeRef.current === 'ptt' ? 0 : micGainRef.current / 100;
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(gainNode);
      gainNode.connect(dest);

      micAudioCtxRef.current = audioCtx;
      micGainNodeRef.current = gainNode;
      localStreamRef.current = dest.stream;
      setIsMicOn(true);

      Object.keys(roomConnectionsRef.current).forEach((peerIdKey) => {
        if (!peerInstance.current) return;
        const call = peerInstance.current.call(peerIdKey, dest.stream, {
          metadata: { type: 'room-voice', roomId: currentRoomRef.current?.id },
        });
        if (call) setupOutgoingRoomCall(call);
      });
    } catch (err) {
      console.error("Mikrofon erişimi alınamadı:", err);
      setMicError('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
    }
  };

  // Mikrofonu kapatır: ham akışı ve AudioContext'i durdurur, giden ses bağlantılarını kapatır.
  const stopMic = () => {
    if (micRawStreamRef.current) {
      micRawStreamRef.current.getTracks().forEach((t) => t.stop());
      micRawStreamRef.current = null;
    }
    if (micAudioCtxRef.current) {
      try { micAudioCtxRef.current.close(); } catch {}
      micAudioCtxRef.current = null;
    }
    micGainNodeRef.current = null;
    localStreamRef.current = null;
    Object.entries(roomMediaConnectionsRef.current).forEach(([pid, call]: [string, any]) => {
      try { call.close(); } catch {}
      cleanupRoomVoicePeer(pid);
    });
    setIsMicOn(false);
    isPttActiveRef.current = false;
    setIsPttActive(false);
  };

  const toggleMic = () => {
    if (isMicOn) stopMic();
    else startMic();
  };

  // Kendi mikrofon seviyeni değiştirir — akışı yeniden başlatmadan, canlı olarak.
  const handleMicGainChange = (value: number) => {
    setMicGain(value); // ilgili useEffect applyMicGain()'i otomatik çağırır
  };

  // Bas-konuş modunu açar/kapatır. Moddan çıkarken/girerken, mikrofon zaten
  // açıksa çıkış seviyesini hemen yeni moda göre günceller.
  const toggleMicMode = () => {
    setMicMode((prev) => (prev === 'always' ? 'ptt' : 'always'));
    isPttActiveRef.current = false;
    setIsPttActive(false);
  };

  // Bas-konuş: konuşmaya başla / bitir. Hem Space tuşu hem de mikrofon
  // butonunu basılı tutma ile tetiklenir.
  const startPttTalking = () => {
    if (micModeRef.current !== 'ptt' || !isMicOnRef.current) return;
    isPttActiveRef.current = true;
    setIsPttActive(true);
    applyMicGain();
  };
  const stopPttTalking = () => {
    if (micModeRef.current !== 'ptt') return;
    isPttActiveRef.current = false;
    setIsPttActive(false);
    applyMicGain();
  };

  // Boşluk tuşu ile bas-konuş — yazı yazarken (input/textarea odaktayken)
  // boşluk karakterinin normal çalışmasına dokunmuyoruz.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (micModeRef.current !== 'ptt' || !isMicOnRef.current) return;
      e.preventDefault();
      startPttTalking();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (micModeRef.current !== 'ptt') return;
      stopPttTalking();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belirli bir katılımcının sesini yükseltir/kısar.
  const setRemoteVolume = (peerId: string, value: number) => {
    setRemoteVolumes((prev) => ({ ...prev, [peerId]: value }));
    const el = remoteAudioElsRef.current[peerId];
    if (el) el.volume = value / 100;
  };

  // Belirli bir katılımcıyı tek başına tamamen susturur/açar.
  const toggleRemoteMute = (peerId: string) => {
    setRemoteMuted((prev) => {
      const nextMuted = !prev[peerId];
      const el = remoteAudioElsRef.current[peerId];
      if (el) el.muted = nextMuted || isDeafenedRef.current;
      return { ...prev, [peerId]: nextMuted };
    });
  };

  // =====================================================================
  // ODA SAHİBİ (ADMİN) YETKİLERİ — sadece Room.creatorId === userId olan
  // kişi kullanabilir. Susturma/atma sinyali mesh üzerinden doğrudan hedef
  // kişiye yollanıyor; hedefin istemcisi bunu uygulamayı KENDİSİ yapıyor
  // (P2P mimarisinde merkezi bir zorlama mekanizması yok — bu yüzden
  // gerçek bir "sunucu tarafı zorla susturma" değil, güvene dayalı bir
  // moderasyon sinyali). Atma işlemi ayrıca backend'de o kişinin canlı
  // üyeliğini de siliyor.
  const isRoomCreator = currentRoom?.creatorId === userId;

  const handleForceMuteMember = (member: RoomMember) => {
    if (!isRoomCreator || !currentRoom) return;
    const conn = roomConnectionsRef.current[member.peerId];
    if (conn) {
      try { conn.send({ type: 'ROOM_FORCE_MUTE', targetUserId: member.userId }); } catch {}
    }
  };

  const handleKickMember = async (member: RoomMember) => {
    if (!isRoomCreator || !currentRoom) return;
    if (!confirm(`${member.username} kullanıcısını odadan atmak istediğine emin misin?`)) return;

    const conn = roomConnectionsRef.current[member.peerId];
    if (conn) {
      try { conn.send({ type: 'ROOM_KICKED' }); } catch {}
    }
    try { conn?.close(); } catch {}
    delete roomConnectionsRef.current[member.peerId];

    try {
      await fetch(`/api/rooms/${currentRoom.id}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: userId, targetUserId: member.userId }),
      });
    } catch (err) {
      console.error("Kullanıcı atma isteği başarısız:", err);
    }
    // Listeden hemen kaldır — sonraki poll zaten teyit edecek
    setRoomMembers((prev) => prev.filter((m) => m.userId !== member.userId));
  };

  // =====================================================================
  // ODA SAHİBİ YETKİLERİ SONU
  // =====================================================================

  // "Kulaklığı kapat": odadaki HERKESİ tek seferde susturur/açar (kendi
  // mikrofonuna dokunmaz, sadece gelen sesleri keser).
  const toggleDeafen = () => {
    setIsDeafened((prev) => {
      const next = !prev;
      Object.entries(remoteAudioElsRef.current).forEach(([pid, el]) => {
        el.muted = next || !!remoteMutedRef.current[pid];
      });
      return next;
    });
  };

  // =====================================================================
  // EKRAN PAYLAŞIMI — sesli görüşmeyle aynı mesh mantığı, ayrı bir
  // MediaConnection tipi olarak ('room-screen'). Video, sunucudan geçmeden
  // doğrudan odadaki her mesh üyesine ayrı ayrı yollanıyor.
  // =====================================================================

  // Gelen bir ekran paylaşımı çağrısını karşılar (tek yönlü — biz video
  // göndermiyoruz, sadece izliyoruz).
  const setupIncomingScreenShare = (call: any) => {
    const remotePeerId = call.peer;
    call.answer();

    call.on('stream', (remoteStream: MediaStream) => {
      setScreenShares((prev) => ({ ...prev, [remotePeerId]: remoteStream }));
      const sharer = roomMembers.find((m) => m.peerId === remotePeerId);
      setScreenSharerNames((prev) => ({ ...prev, [remotePeerId]: sharer?.username || 'Bir katılımcı' }));
    });

    const cleanup = () => {
      setScreenShares((prev) => {
        const next = { ...prev };
        delete next[remotePeerId];
        return next;
      });
      setViewingScreenPeerId((prev) => (prev === remotePeerId ? null : prev));
    };
    call.on('close', cleanup);
    call.on('error', cleanup);
  };

  // Ekran paylaşımını başlatır: tarayıcının ekran/pencere/sekme seçme
  // diyaloğunu açar, seçilen akışı odadaki her mesh üyesine yollar.
  const startScreenShare = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: { ideal: screenShareFps, max: screenShareFps } },
      });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      // Kullanıcı paylaşımı tarayıcının kendi "Paylaşımı durdur" çubuğundan
      // kapatırsa (bizim butonumuzu kullanmadan) bunu yakalayıp state'i senkronla.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopScreenShare();
      });

      Object.keys(roomConnectionsRef.current).forEach((peerIdKey) => {
        if (!peerInstance.current) return;
        const call = peerInstance.current.call(peerIdKey, stream, {
          metadata: { type: 'room-screen', roomId: currentRoomRef.current?.id },
        });
        if (call) screenMediaConnectionsRef.current[peerIdKey] = call;
      });
    } catch (err) {
      // Kullanıcı paylaşım penceresini iptal ettiyse burası da tetiklenir, sessizce geç
      console.warn("Ekran paylaşımı başlatılamadı veya iptal edildi:", err);
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    Object.values(screenMediaConnectionsRef.current).forEach((call: any) => {
      try { call.close(); } catch {}
    });
    screenMediaConnectionsRef.current = {};
    setIsScreenSharing(false);
    setViewingScreenPeerId((prev) => (prev === 'me' ? null : prev));
  };

  const toggleScreenShare = () => {
    if (isScreenSharing) stopScreenShare();
    else startScreenShare();
  };

  // =====================================================================
  // EKRAN PAYLAŞIMI SONU
  // =====================================================================

  // =====================================================================
  // KAMERA (WEBCAM) — ekran paylaşımıyla birebir aynı mesh mantığı, ayrı
  // bir MediaConnection tipi olarak ('room-camera'). Görüntü, sunucudan
  // geçmeden doğrudan odadaki her mesh üyesine ayrı ayrı yollanıyor.
  // =====================================================================

  const setupIncomingCamera = (call: any) => {
    const remotePeerId = call.peer;
    call.answer();

    call.on('stream', (remoteStream: MediaStream) => {
      setCameraStreams((prev) => ({ ...prev, [remotePeerId]: remoteStream }));
      const sharer = roomMembers.find((m) => m.peerId === remotePeerId);
      setCameraSharerNames((prev) => ({ ...prev, [remotePeerId]: sharer?.username || 'Bir katılımcı' }));
    });

    const cleanup = () => {
      setCameraStreams((prev) => {
        const next = { ...prev };
        delete next[remotePeerId];
        return next;
      });
      setViewingCameraPeerId((prev) => (prev === remotePeerId ? null : prev));
    };
    call.on('close', cleanup);
    call.on('error', cleanup);
  };

  // Kamerayı açar: tarayıcının kamera izni istemesini tetikler, akışı
  // odadaki her mesh üyesine yollar.
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      cameraStreamRef.current = stream;
      setIsCameraOn(true);

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopCamera();
      });

      Object.keys(roomConnectionsRef.current).forEach((peerIdKey) => {
        if (!peerInstance.current) return;
        const call = peerInstance.current.call(peerIdKey, stream, {
          metadata: { type: 'room-camera', roomId: currentRoomRef.current?.id },
        });
        if (call) cameraMediaConnectionsRef.current[peerIdKey] = call;
      });
    } catch (err) {
      console.warn("Kamera açılamadı veya izin verilmedi:", err);
      setMicError('Kameraya erişilemedi. Tarayıcı izinlerini kontrol et.');
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    Object.values(cameraMediaConnectionsRef.current).forEach((call: any) => {
      try { call.close(); } catch {}
    });
    cameraMediaConnectionsRef.current = {};
    setIsCameraOn(false);
    setViewingCameraPeerId((prev) => (prev === 'me' ? null : prev));
  };

  const toggleCamera = () => {
    if (isCameraOn) stopCamera();
    else startCamera();
  };

  // =====================================================================
  // KAMERA SONU
  // =====================================================================

  // (Herkese açık oda listesi kaldırıldı — odalara sadece kod ile katılınıyor)

  // Bileşen kapanırken (sekme kapatma, çıkış) odadan temiz şekilde ayrıl
  useEffect(() => {
    return () => {
      stopRoomLoops();
      stopMic();
      stopScreenShare();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // =====================================================================
  // ÇOK KİŞİLİ ODA MANTIĞI SONU
  // =====================================================================

  // PeerJS Başlatma
  // DÜZELTME: rastgele oluşturulan ID yerine kullanıcının kalıcı
  // veritabanı ID'sinden türetilen sabit bir P2P kodu kullanıyoruz.
  // Böylece her oturumda aynı kod üretilir, arkadaşlar tekrar tekrar
  // yeni kod paylaşmaya gerek duymaz ve konuşma geçmişi kopmaz.
  useEffect(() => {
    if (!isLoggedIn || userRole === 'super_admin' || typeof window === 'undefined' || !userId) return;

    let peer: any = null;
    const stableId = 'p2p-' + userId;

    import('peerjs').then(({ Peer }) => {
      peer = new Peer(stableId);

      peer.on('open', (id: string) => {
        setPeerId(id);
        peerInstance.current = peer;
        setStatus('Bağlanmaya Hazır');
      });

      peer.on('connection', (conn: any) => {
        if (conn.metadata?.type === 'room') {
          roomConnectionsRef.current[conn.peer] = conn;
          setupRoomConnectionEvents(conn);
        } else {
          setupConnectionEvents(conn);
        }
      });

      // Gelen sesli görüşme / ekran paylaşımı / kamera çağrıları
      peer.on('call', (call: any) => {
        if (call.metadata?.type === 'room-voice') {
          setupIncomingRoomCall(call);
        } else if (call.metadata?.type === 'room-screen') {
          setupIncomingScreenShare(call);
        } else if (call.metadata?.type === 'room-camera') {
          setupIncomingCamera(call);
        }
      });

      peer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
          // Aynı hesap başka bir sekmede/cihazda zaten açık
          setStatus('Bu hesap başka bir sekmede/cihazda zaten bağlı.');
        } else {
          setStatus('Hata: ' + err.type);
        }
      });
    });

    return () => {
      if (peer) {
        peer.destroy();
      }
    };
  }, [isLoggedIn, userRole, nickname, userId]);

  const handleConnect = () => {
    if (!peerInstance.current || !targetId.trim() || targetId.trim() === peerId) return;

    const target = targetId.trim();
    setStatus('Bağlantı kuruluyor...');
    const conn = peerInstance.current.connect(target);
    setupConnectionEvents(conn);
    setTargetId('');
  };

  // Kullanıcı yazarken karşı tarafa TYPING sinyali yollar (en fazla 1.5
  // saniyede bir — her tuş vuruşunda değil, bağlantıyı gereksiz yormamak için).
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);
    if (!selectedPeerId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    const conn = activeConnections.current[selectedPeerId];
    if (conn) {
      try { conn.send({ type: 'TYPING' }); } catch {}
    }
  };

  // Emoji seçilince, o an açık olan alana (grup odası mı, 1-1 sohbet mi)
  // ekler. İkisi aynı anda görünmediği için currentRoom kontrolü yeterli.
  const insertEmoji = (emoji: string) => {
    if (currentRoom) {
      setRoomInputText((prev) => prev + emoji);
    } else {
      setInputText((prev) => prev + emoji);
    }
  };

  // 1-1 SOHBETTE MESAJA TEPKİ VER/KALDIR
  // Optimistik olarak önce kendi ekranımızda uyguluyoruz, sonra karşı
  // tarafa da aynı toggle bilgisini (emoji + kimin verdiği) yolluyoruz —
  // böylece iki taraf da bağımsız olarak aynı toggle mantığını çalıştırıp
  // aynı sonuca ulaşıyor (kimin ne zaman tıkladığı önemli değil).
  const sendReaction = (messageId: string, emoji: string) => {
    if (!selectedPeerId || !userId) return;
    setChatRooms((prev) => {
      const msgs = prev[selectedPeerId] || [];
      return {
        ...prev,
        [selectedPeerId]: msgs.map((m) =>
          m.id === messageId ? { ...m, reactions: toggleReaction(m.reactions, emoji, userId) } : m
        ),
      };
    });
    const conn = activeConnections.current[selectedPeerId];
    if (conn) {
      try { conn.send({ type: 'REACTION', messageId, emoji, reactorUserId: userId }); } catch {}
    }
    setReactionPickerMessageId(null);
  };

  // GRUP ODASINDA MESAJA TEPKİ VER/KALDIR (mesh — herkese ayrı ayrı yollanır)
  const sendRoomReaction = (messageId: string, emoji: string) => {
    if (!currentRoom || !userId) return;
    setGroupRoomMessages((prev) => {
      const msgs = prev[currentRoom.id] || [];
      return {
        ...prev,
        [currentRoom.id]: msgs.map((m) =>
          m.id === messageId ? { ...m, reactions: toggleReaction(m.reactions, emoji, userId) } : m
        ),
      };
    });
    Object.values(roomConnectionsRef.current).forEach((conn: any) => {
      try { conn.send({ type: 'ROOM_REACTION', messageId, emoji, reactorUserId: userId }); } catch {}
    });
    setReactionPickerMessageId(null);
  };

  // Bir mesajı yanıtlamak üzere seçer — input üstünde alıntı önizlemesi belirir.
  const startReply = (msg: { id: string; senderName: string; text: string; file?: FileAttachment }) => {
    setReplyingTo({ messageId: msg.id, senderName: msg.senderName, preview: buildReplyPreview(msg) });
  };

  // Bir alıntıya tıklanınca orijinal mesaja kaydırır (varsa) ve kısa süreliğine vurgular.
  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-cyan-400');
    setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400'), 1200);
  };

  // Seçilen dosyayı base64 data URL'e çevirip P2P bağlantı(lar)ı üzerinden
  // gönderir. Sunucudan hiç geçmiyor — tamamen doğrudan aktarım.
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  // 1-1 SOHBETTE DOSYA GÖNDER
  const handleFileSelect1to1 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosyayı art arda seçebilmek için input'u sıfırla
    if (!file || !selectedPeerId) return;

    if (file.size > FILE_MAX_BYTES) {
      alert(`Dosya çok büyük (${formatFileSize(file.size)}). En fazla ${formatFileSize(FILE_MAX_BYTES)} gönderebilirsin.`);
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const myAvatar = nickname.substring(0, 2).toUpperCase();
    const fileAttachment: FileAttachment = { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl };
    const messageId = generateMessageId();
    const replyTo = replyingTo || undefined;

    const payload = {
      type: 'FILE',
      messageId,
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: `📎 ${file.name}`,
      file: fileAttachment,
      replyTo,
    };

    const activeConn = activeConnections.current[selectedPeerId];
    if (activeConn) {
      try { activeConn.send(payload); } catch {}
    }

    const newMessage: Message = {
      id: messageId,
      sender: 'me',
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: `📎 ${file.name}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      file: fileAttachment,
      replyTo,
    };
    setChatRooms((prev) => ({
      ...prev,
      [selectedPeerId]: [...(prev[selectedPeerId] || []), newMessage],
    }));
    setReplyingTo(null);

    // Arşive sadece dosya adını yazıyoruz — dosyanın kendisi veritabanına
    // gitmiyor (P2P/tarayıcı belleği dışında hiçbir yerde saklanmıyor).
    const recipientUserId = extractUserIdFromPeerId(selectedPeerId);
    archiveMessageToDatabase(`📎 Dosya paylaşıldı: ${file.name}`, recipientUserId);
  };

  // GRUP ODASINDA DOSYA GÖNDER (mesh — herkese ayrı ayrı yollanır)
  const handleFileSelectRoom = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentRoom) return;

    if (file.size > FILE_MAX_BYTES) {
      alert(`Dosya çok büyük (${formatFileSize(file.size)}). En fazla ${formatFileSize(FILE_MAX_BYTES)} gönderebilirsin.`);
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const myAvatar = nickname.substring(0, 2).toUpperCase();
    const fileAttachment: FileAttachment = { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl };
    const messageId = generateMessageId();
    const replyTo = replyingTo || undefined;

    const payload = {
      type: 'ROOM_FILE',
      messageId,
      senderId: userId,
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: `📎 ${file.name}`,
      file: fileAttachment,
      replyTo,
    };

    Object.values(roomConnectionsRef.current).forEach((conn: any) => {
      try { conn.send(payload); } catch {}
    });

    const localMsg: RoomMessage = {
      id: messageId,
      senderId: userId,
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: `📎 ${file.name}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      file: fileAttachment,
      replyTo,
    };
    setGroupRoomMessages((prev) => ({
      ...prev,
      [currentRoom.id]: [...(prev[currentRoom.id] || []), localMsg],
    }));
    setReplyingTo(null);

    fetch('/api/messages/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `📎 Dosya paylaşıldı: ${file.name}`, senderId: userId, roomId: currentRoom.id }),
    }).catch((err) => console.error("Dosya mesajı arşivlenemedi:", err));
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedPeerId) return;

    const activeConn = activeConnections.current[selectedPeerId];
    const myAvatar = nickname.substring(0, 2).toUpperCase();
    const messageId = generateMessageId(); // İKİ TARAFTA DA AYNI ID — tepkiler bu sayede eşleşiyor
    const replyTo = replyingTo || undefined;

    const msgPayload = {
      messageId,
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: inputText,
      replyTo,
    };

    if (activeConn) {
      activeConn.send(msgPayload);
    }

    // P2P Akışı için yerel hafızaya kaydet
    const newMessage: Message = {
      id: messageId,
      sender: 'me',
      senderName: nickname,
      senderAvatar: myAvatar,
      senderAvatarUrl: avatarUrl,
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      replyTo,
    };

    setChatRooms((prev) => ({
      ...prev,
      [selectedPeerId]: [...(prev[selectedPeerId] || []), newMessage]
    }));
    setReplyingTo(null);

    // HİBRİT MODEL: Mesajı arka planda Postgres veritabanına da arşivle!
    // DÜZELTME: P2P kodu artık kullanıcı ID'sini içerdiği için doğrudan
    // koddan çıkarıyoruz; handshake verisine bağımlı kalmıyoruz.
    const recipientUserId = extractUserIdFromPeerId(selectedPeerId);
    archiveMessageToDatabase(inputText, recipientUserId);

    setInputText('');
    setShowEmojiPicker(false);
  };

  const handleLogout = () => {
    leaveRoom();
    performLocalLogout();
  };

  // Sadece yerel sohbet verilerini (odalar, aktif konuşmalar) temizler,
  // oturumu kapatmaz. Yalnızca GİRİŞ YAPMIŞ KULLANICIYA AİT anahtarları
  // siler; diğer kullanıcıların verilerine dokunmaz.
  const handleResetData = () => {
    if (!confirm("Tüm yerel sohbet verilerin (konuşmalar ve mesaj geçmişin) silinecek. Emin misin?")) return;
    if (userId) {
      localStorage.removeItem(`p2p_chat_rooms_${userId}`);
      localStorage.removeItem(`p2p_active_chats_${userId}`);
    }
    setChatRooms({});
    setActiveChats([]);
    setSelectedPeerId('');
  };

  const handleResetPassword = (username: string) => {
    const newTempPassword = Math.random().toString(36).substring(2, 10);
    alert(`${username} kullanıcısının şifresi başarıyla sıfırlandı!\nYeni Geçici Şifre: ${newTempPassword}\n\nKullanıcıya bu şifreyi iletebilirsiniz.`);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Bu kullanıcıyı silmek istediğine emin misin?")) return;

    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }) // ID'yi gönderiyoruz
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Bir hata oluştu");
      }

      alert("Başarıyla silindi!");
      await fetchAdminData(); // Listeyi yenile
    } catch (err: any) {
      alert("Hata: " + err.message);
      console.error(err);
    }
  };

  if (!isHydrated || !isLoggedIn) {
    return (
      <div className="h-screen w-full bg-slate-950 text-slate-400 flex items-center justify-center font-sans">
        <div className="animate-pulse text-sm">Oturum doğrulanıyor...</div>
      </div>
    );
  }

  // --- SÜPER ADMİN GÖRÜNÜMÜ ---
  if (userRole === 'super_admin') {
    return (
      <main className="flex h-screen w-full bg-slate-950 text-slate-100 font-sans antialiased">
        {/* Sol Menü */}
        <section className="w-1/4 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-slate-950 flex items-center justify-center text-xs font-bold shadow-md">
                SA
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-200">{nickname}</h1>
                <span className="text-[10px] text-rose-400 font-mono font-semibold uppercase">Süper Admin</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              <div className="flex items-center gap-2 p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20 text-xs font-semibold">
                <Users size={16} />
                <span>Sistem İzleme Paneli</span>
              </div>
            </div>
          </div>

          <button onClick={handleLogout} className="w-full text-xs text-rose-400 hover:text-rose-300 text-left pt-4 block font-medium">
            Güvenli Çıkış Yap
          </button>
        </section>

        {/* Sağ Yönetim Alanı */}
        <section className="w-3/4 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Shield className="text-rose-500" size={24} />
                  Süper Admin Kontrol Paneli
                </h2>
                <p className="text-xs text-slate-500 mt-1">Sistemdeki tüm kayıtlı kullanıcıları, odaları ve arşivlenen tüm sohbet mesajlarını anlık olarak izleyin.</p>
              </div>
              <button
                onClick={fetchAdminData}
                disabled={isAdminLoading}
                className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-full hover:bg-rose-500/20 transition-all disabled:opacity-50"
              >
                <Activity size={12} className={isAdminLoading ? "animate-spin" : ""} />
                <span>{isAdminLoading ? "Güncelleniyor..." : "Manuel Yenile"}</span>
              </button>
            </div>

            {/* --- METRİK KARTLARI --- */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Kayıtlı Kullanıcı</span>
                  <span className="text-2xl font-bold text-slate-200 mt-1 block">{allUsers.length}</span>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Users size={20} />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Toplam Kaydedilen Mesaj</span>
                  <span className="text-2xl font-bold text-indigo-400 mt-1 block">{dbMessages.length}</span>
                </div>
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <Mail size={20} />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Veritabanı Durumu</span>
                  <span className="text-xs font-bold text-emerald-400 mt-2 block flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                    Çevrimiçi (Neon PG)
                  </span>
                </div>
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                  <Wifi size={20} />
                </div>
              </div>
            </div>

            {/* --- CANLI MESAJ ARŞİVİ PANELİ --- */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Mail size={16} className="text-indigo-400" />
                Arşivlenmiş Canlı Yazışmalar (Postgres DB)
              </h3>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="max-h-[350px] overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                        <th className="p-4">Gönderen</th>
                        <th className="p-4">Alıcı</th>
                        <th className="p-4">Mesaj İçeriği</th>
                        <th className="p-4 text-right">Tarih / Saat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {dbMessages.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-600 italic">Henüz kaydedilmiş bir mesaj bulunmamaktadır. Kullanıcılar yazıştıkça buraya anlık yansıyacaktır.</td>
                        </tr>
                      ) : (
                        dbMessages.map((msg) => (
                          <tr key={msg.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="p-4">
                              <span className="font-semibold text-slate-200 block">{msg.sender.username || "Kullanıcı"}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{msg.sender.email}</span>
                            </td>
                            <td className="p-4">
                              {msg.recipient ? (
                                <>
                                  <span className="font-semibold text-slate-300 block">{msg.recipient.username || "Kullanıcı"}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">{msg.recipient.email}</span>
                                </>
                              ) : (
                                <span className="text-slate-500 italic">Genel/Sınıflandırılmamış</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-100 font-medium break-all max-w-xs">{msg.text}</td>
                            <td className="p-4 text-right text-slate-500 font-mono">
                              {new Date(msg.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* --- TÜM ODALAR TABLOSU (canlı aktif üye sayısıyla) --- */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Hash size={16} className="text-cyan-400" />
                Tüm Odalar (Grup Sohbetleri)
              </h3>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 uppercase tracking-wider">
                      <th className="p-4">Oda Adı</th>
                      <th className="p-4">Oluşturan</th>
                      <th className="p-4">Oluşturulma</th>
                      <th className="p-4 text-right">Şu An Aktif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {liveRoomsList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-600 italic">Henüz oluşturulmuş bir oda yok.</td>
                      </tr>
                    ) : (
                      liveRoomsList.map((room) => (
                        <tr key={room.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-4">
                            <span className="font-semibold text-slate-200 block">{room.name || 'İsimsiz Oda'}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{room.id}</span>
                          </td>
                          <td className="p-4">
                            <span className="font-semibold text-slate-300 block">{room.creator.username || 'Kullanıcı'}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{room.creator.email}</span>
                          </td>
                          <td className="p-4 text-slate-500">
                            {new Date(room.createdAt).toLocaleString()}
                          </td>
                          <td className="p-4 text-right">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                              <span className={`h-1.5 w-1.5 rounded-full ${room.activeCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
                              <span className={room.activeCount > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                                {room.activeCount} kişi
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* --- KULLANICI LİSTESİ TABLOSU --- */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Users size={16} className="text-rose-400" />
                Sistemdeki Kullanıcılar
              </h3>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 uppercase tracking-wider">
                      <th className="p-4">Kullanıcı Adı</th>
                      <th className="p-4">E-posta</th>
                      <th className="p-4">Kayıt Tarihi</th>
                      <th className="p-4 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {allUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-600 italic">Kayıtlı kullanıcı bulunamadı.</td>
                      </tr>
                    ) : (
                      allUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-4 font-semibold text-slate-200">{u.username || 'İsimsiz Kullanıcı'}</td>
                          <td className="p-4 text-slate-400 font-mono">{u.email}</td>
                          <td className="p-4 text-slate-500">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {u.role !== 'super_admin' && (
                              <>
                                <button
                                  onClick={() => handleResetPassword(u.username || u.email)}
                                  className="px-2.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded hover:bg-amber-500/20 transition-all text-[11px] font-medium inline-flex items-center gap-1"
                                >
                                  <Key size={12} />
                                  Şifre Sıfırla
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="px-2.5 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded hover:bg-rose-500/20 transition-all text-[11px] font-medium inline-flex items-center gap-1"
                                >
                                  <Trash2 size={12} />
                                  Sil
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </section>
      </main>
    );
  }

  // --- NORMAL KULLANICI P2P CHAT GÖRÜNÜMÜ ---
  const currentRoomMessages = chatRooms[selectedPeerId] || [];
  const currentChatUser = activeChats.find(c => c.id === selectedPeerId);

  return (
    <main className="flex h-screen w-full bg-slate-950 text-slate-100 font-sans antialiased">

      {/* SOL PANEL */}
      <section className="w-1/3 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative group shrink-0">
                <button
                  onClick={() => avatarFileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  title="Profil fotoğrafını değiştir"
                  className="block"
                >
                  <Avatar avatarUrl={avatarUrl} initials={nickname.substring(0, 2).toUpperCase()} size={36} gradient className="rounded-xl shadow-md" />
                  <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    {isUploadingAvatar ? (
                      <Activity size={14} className="text-white animate-spin" />
                    ) : (
                      <Plus size={14} className="text-white" />
                    )}
                  </div>
                </button>
                <input ref={avatarFileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-200">{nickname}</h1>
                <span className="text-[10px] text-emerald-400 font-mono">Çevrimiçi</span>
                {avatarUrl && (
                  <button onClick={handleRemoveAvatar} className="block text-[10px] text-slate-600 hover:text-rose-400 mt-0.5">
                    Fotoğrafı kaldır
                  </button>
                )}
              </div>
            </div>
            <button onClick={requestNotificationPermission} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition-colors">
              <Bell size={16} />
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Wifi size={14} className="text-emerald-500" />
            <span>Durum: <strong className="text-slate-300">{status}</strong></span>
          </div>

          {/* KENDİ KODUM */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Senin P2P Kodun</label>
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <code className="text-emerald-400 font-mono text-xs">{peerId || 'Üretiliyor...'}</code>
              <button onClick={() => navigator.clipboard.writeText(peerId)} className="text-slate-400 hover:text-slate-100">
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* SEKME GEÇİŞİ: Sohbetler / Odalar */}
          <div className="flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setLeftPanelTab('chats')}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                leftPanelTab === 'chats' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare size={13} /> Sohbetler
            </button>
            <button
              onClick={() => setLeftPanelTab('rooms')}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                leftPanelTab === 'rooms' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users size={13} /> Odalar
            </button>
          </div>

          {leftPanelTab === 'chats' ? (
            <>
              {/* YENİ BAĞLANTI EKLEME */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Yeni Arkadaş Ekle (P2P)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Karşı tarafın kodunu gir..."
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <button onClick={handleConnect} className="p-2 bg-emerald-500 text-slate-950 rounded-lg text-xs font-semibold hover:bg-emerald-400 transition-colors">
                    Bağlan
                  </button>
                </div>
              </div>

              {/* AKTİF CHAT ODALARI LİSTESİ */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Konuşmalarım</label>
                {activeChats.length === 0 ? (
                  <p className="text-xs text-slate-600 italic p-2">Henüz aktif bir konuşma yok.</p>
                ) : (
                  activeChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => { if (currentRoom) leaveRoom(); setSelectedPeerId(chat.id); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedPeerId === chat.id && !currentRoom
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Avatar avatarUrl={chat.avatarUrl} initials={chat.avatar} size={32} />
                        {/* Çevrimiçi/çevrimdışı durumu küçük bir noktayla gösteriliyor */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${
                            chat.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                          }`}
                          title={chat.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{chat.name}</div>
                        <div className="text-[10px] text-slate-500 truncate font-mono">{chat.id}</div>
                      </div>
                      <MessageSquare size={14} className={selectedPeerId === chat.id && !currentRoom ? "text-emerald-400" : "text-slate-600"} />
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              {/* GRUP ODASI: Oluştur / Kodla Katıl */}
              {/* DÜZELTME: odalar artık herkese açık listelenmiyor — bir
                  kişinin oluşturduğu oda başkalarının "Odalar" sekmesinde
                  görünmüyor. Katılım sadece odayı oluşturan kişinin
                  paylaştığı kod ile mümkün (oda içindeyken başlıktaki
                  kopyala ikonuyla kod paylaşılabilir). */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Yeni Oda Oluştur</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Oda adı (opsiyonel)"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <button onClick={handleCreateRoom} className="p-2 bg-cyan-500 text-slate-950 rounded-lg text-xs font-semibold hover:bg-cyan-400 transition-colors flex items-center gap-1">
                    <Plus size={14} /> Oluştur
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Oda oluşturduğunda kimseye görünmez. Katılmalarını istediğin
                  kişilere oda kodunu (oda başlığındaki kopyala ikonundan)
                  kendin paylaşmalısın.
                </p>
                <div className="h-px bg-slate-800" />
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Oda Koduyla Katıl</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Oda kodunu yapıştır..."
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <button onClick={handleJoinByCode} className="p-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors flex items-center gap-1">
                    <LogIn size={14} /> Katıl
                  </button>
                </div>
              </div>

              {/* ODALARIM: sadece benim katıldığım odalar, bana özel ve kalıcı */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Odalarım</label>
                  <button onClick={fetchMyRooms} className="text-[10px] text-cyan-400 hover:text-cyan-300">
                    {isMyRoomsLoading ? 'Yükleniyor...' : 'Yenile'}
                  </button>
                </div>
                {myRooms.length === 0 ? (
                  <p className="text-xs text-slate-600 italic p-2">Henüz katıldığın bir oda yok.</p>
                ) : (
                  myRooms.map((room) => (
                    <div
                      key={room.id}
                      className={`w-full flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        currentRoom?.id === room.id
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                          : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <button
                        onClick={() => joinRoom(room.id, room.name || 'Oda')}
                        disabled={currentRoom?.id === room.id}
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                      >
                        <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                          <Hash size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{room.name || 'İsimsiz Oda'}</div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {room.creatorId === userId ? 'Sen oluşturdun' : `${room.creator.username || 'Kullanıcı'} tarafından oluşturuldu`}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1 shrink-0">
                          <span className={`h-1.5 w-1.5 rounded-full ${room.activeCount > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                          {room.activeCount}
                        </span>
                      </button>
                      <button
                        onClick={() => handleDeleteOrForgetRoom(room)}
                        title={room.creatorId === userId ? 'Odayı kalıcı olarak sil' : 'Listemden kaldır'}
                        className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={handleResetData}
            className="flex-1 text-xs text-amber-400 hover:text-amber-300 text-center py-2 px-3 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 transition-colors font-medium"
          >
            Verileri Sıfırla
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 text-xs text-rose-400 hover:text-rose-300 text-center py-2 px-3 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 transition-colors font-medium"
          >
            Oturumu Kapat
          </button>
        </div>
      </section>

      {/* SAĞ PANEL */}
      <section className="w-2/3 flex flex-col bg-slate-950">
        {currentRoom ? (
          <>
            {/* GRUP ODASI BAŞLIĞI */}
            <div className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/20">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                  <Hash size={16} />
                </div>
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {currentRoom.name}
                    {isRoomCreator && (
                      <span title="Bu odanın sahibisin" className="inline-flex">
                        <Crown size={12} className="text-amber-400" />
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 font-normal">({roomMembers.length}/{MAX_ROOM_PARTICIPANTS})</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                    {currentRoom.id}
                    <button onClick={() => navigator.clipboard.writeText(currentRoom.id)} className="text-slate-500 hover:text-slate-300">
                      <Copy size={10} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* KATILIMCI AVATARLARI + MİKROFON DURUMU */}
                <div className="flex -space-x-2">
                  {roomMembers.map((m) => (
                    <div
                      key={m.userId}
                      title={m.username}
                      className={`h-8 w-8 rounded-full border-2 border-slate-950 overflow-hidden flex items-center justify-center text-[10px] font-bold ${
                        peersWithVoice[m.peerId] ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.username} className="h-full w-full object-cover" />
                      ) : (
                        m.username.substring(0, 2).toUpperCase()
                      )}
                    </div>
                  ))}
                </div>
                {/* MİKROFON BUTONU — "her zaman açık" modda tıkla-aç/kapat,
                    "bas-konuş" modda ise akış açıkken basılı tutunca konuşur */}
                <button
                  onClick={() => {
                    if (!isMicOn) { startMic(); return; }
                    if (micMode === 'always') stopMic();
                    // ptt modunda ve mikrofon zaten açıkken tek tıklama hiçbir şey yapmaz —
                    // konuşmak için basılı tutulur, tamamen kapatmak için Ses Ayarları panelindeki butonu kullan.
                  }}
                  onMouseDown={startPttTalking}
                  onMouseUp={stopPttTalking}
                  onMouseLeave={stopPttTalking}
                  onTouchStart={(e) => { e.preventDefault(); startPttTalking(); }}
                  onTouchEnd={(e) => { e.preventDefault(); stopPttTalking(); }}
                  title={
                    micMode === 'ptt'
                      ? (isMicOn ? 'Konuşmak için basılı tut (veya Space)' : 'Sesli görüşmeye katıl')
                      : (isMicOn ? 'Mikrofonu kapat' : 'Sesli görüşmeye katıl')
                  }
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all select-none ${
                    isMicOn
                      ? (micMode === 'ptt'
                          ? (isPttActive ? 'bg-emerald-500 text-slate-950 scale-110 ring-2 ring-emerald-400' : 'bg-slate-700 text-emerald-400')
                          : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400')
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                {/* EKRAN PAYLAŞIMI BUTONU */}
                <button
                  onClick={toggleScreenShare}
                  title={isScreenSharing ? 'Ekran paylaşımını durdur' : 'Ekranını paylaş'}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
                    isScreenSharing ? 'bg-indigo-500 text-slate-950 hover:bg-indigo-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isScreenSharing ? <Monitor size={18} /> : <MonitorOff size={18} />}
                </button>
                {/* KAMERA BUTONU */}
                <button
                  onClick={toggleCamera}
                  title={isCameraOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
                    isCameraOn ? 'bg-rose-500 text-slate-950 hover:bg-rose-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
                {/* PAYLAŞIM BAŞLAMADAN ÖNCE FPS SEÇİMİ */}
                <select
                  value={screenShareFps}
                  onChange={(e) => setScreenShareFps(Number(e.target.value))}
                  disabled={isScreenSharing}
                  title="Ekran paylaşımı FPS'i (paylaşımı başlatmadan önce seç)"
                  className="h-10 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-2 disabled:opacity-40 focus:outline-none focus:border-indigo-500"
                >
                  <option value={15}>15 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
                {/* SES AYARLARI BUTONU */}
                <button
                  onClick={() => setShowVoicePanel((v) => !v)}
                  title="Ses ayarları"
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors relative ${
                    showVoicePanel ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Settings2 size={18} />
                  {isDeafened && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 border-2 border-slate-950" />
                  )}
                </button>
                <button
                  onClick={leaveRoom}
                  title="Odadan ayrıl"
                  className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 flex items-center justify-center transition-colors"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>

            {/* SES KONTROL PANELİ: kendi mikrofon seviyen, kulaklık aç/kapat, katılımcı bazlı ses/susturma */}
            {showVoicePanel && (
              <div className="px-5 py-4 border-b border-slate-800 bg-[#232428] space-y-4">
                {/* Üst satır: mikrofon/kulaklık ikon toggle'ları (Discord'daki gibi) */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMic}
                    title={isMicOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
                    className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                      isMicOn ? 'bg-[#3f4147] text-slate-200 hover:bg-[#4a4d53]' : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                    }`}
                  >
                    {isMicOn ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button
                    onClick={toggleDeafen}
                    title={isDeafened ? 'Tüm sesleri aç' : 'Tüm sesleri kapat (sağırlaştır)'}
                    className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                      !isDeafened ? 'bg-[#3f4147] text-slate-200 hover:bg-[#4a4d53]' : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                    }`}
                  >
                    {isDeafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <span className="text-[11px] text-slate-500 pl-1">
                    {isMicOn ? 'Mikrofon açık' : 'Mikrofon kapalı'} · {isDeafened ? 'Sesler kapalı' : 'Sesler açık'}
                  </span>
                </div>

                {/* Konuşma modu: her zaman açık / bas-konuş */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Konuşma Modu</span>
                  <div className="flex bg-[#1e1f22] rounded-lg p-0.5">
                    <button
                      onClick={() => micMode !== 'always' && toggleMicMode()}
                      className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                        micMode === 'always' ? 'bg-[#3f4147] text-slate-100' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Her Zaman Açık
                    </button>
                    <button
                      onClick={() => micMode !== 'ptt' && toggleMicMode()}
                      className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                        micMode === 'ptt' ? 'bg-[#3f4147] text-slate-100' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Bas-Konuş
                    </button>
                  </div>
                </div>
                {micMode === 'ptt' && (
                  <p className="text-[10px] text-slate-500 -mt-2">
                    Konuşmak için <kbd className="px-1 py-0.5 bg-[#1e1f22] rounded border border-slate-700 text-slate-400">Boşluk</kbd> tuşuna ya da mikrofon ikonuna basılı tut.
                  </p>
                )}

                {/* Kendi mikrofon seviyem */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 w-24 shrink-0">Mikrofon Seviyen</span>
                  <VolumeSlider
                    value={micGain}
                    max={200}
                    onChange={handleMicGainChange}
                    disabled={!isMicOn}
                    color="#23a55a"
                  />
                  <span className="text-[10px] text-slate-500 w-9 text-right font-mono shrink-0">{micGain}%</span>
                </div>

                <div className="h-px bg-slate-800" />

                {/* Katılımcı bazlı ses seviyeleri */}
                <div className="space-y-3">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Katılımcılar</span>
                  {roomMembers.filter((m) => m.userId !== userId).length === 0 ? (
                    <p className="text-[11px] text-slate-600 italic">Odada başka kimse yok.</p>
                  ) : (
                    roomMembers
                      .filter((m) => m.userId !== userId)
                      .map((m) => (
                        <div key={m.userId} className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0 overflow-hidden">
                            {m.avatarUrl ? (
                              <img src={m.avatarUrl} alt={m.username} className="h-full w-full object-cover" />
                            ) : (
                              m.username.substring(0, 2).toUpperCase()
                            )}
                          </div>
                          <span className="text-xs text-slate-300 w-16 truncate shrink-0 flex items-center gap-1" title={m.username}>
                            {m.username}
                            {currentRoom?.creatorId === m.userId && <Crown size={10} className="text-amber-400 shrink-0" />}
                          </span>
                          <VolumeSlider
                            value={remoteVolumes[m.peerId] ?? 100}
                            onChange={(v) => setRemoteVolume(m.peerId, v)}
                            disabled={!!remoteMuted[m.peerId]}
                            color="#5865f2"
                          />
                          <button
                            onClick={() => toggleRemoteMute(m.peerId)}
                            title={remoteMuted[m.peerId] ? 'Sustur kaldır' : 'Bu kişiyi sustur'}
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              remoteMuted[m.peerId] ? 'bg-rose-500/10 text-rose-400' : 'text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            {remoteMuted[m.peerId] ? <VolumeX size={13} /> : <Volume2 size={13} />}
                          </button>
                          {/* ODA SAHİBİ YETKİLERİ — sadece odayı oluşturan kişi görür */}
                          {isRoomCreator && (
                            <>
                              <button
                                onClick={() => handleForceMuteMember(m)}
                                title="Bu kişinin mikrofonunu zorla kapat"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors shrink-0"
                              >
                                <MicOff size={13} />
                              </button>
                              <button
                                onClick={() => handleKickMember(m)}
                                title="Odadan at"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0"
                              >
                                <UserX size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {micError && (
              <div className="px-6 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs">{micError}</div>
            )}

            {/* EKRAN PAYLAŞIMI ŞERİDİ: aktif paylaşımlar (kendi + diğerleri) küçük önizleme olarak */}
            {(isScreenSharing || Object.keys(screenShares).length > 0) && (
              <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/30 flex gap-3 overflow-x-auto">
                {isScreenSharing && (
                  <button
                    onClick={() => setViewingScreenPeerId('me')}
                    className="shrink-0 w-40 rounded-xl overflow-hidden border-2 border-indigo-500 relative group"
                  >
                    <StreamVideo
                      stream={screenStreamRef.current}
                      muted
                      className="w-full h-24 object-cover bg-slate-950"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[10px] text-slate-200 px-2 py-1 flex items-center gap-1">
                      <Monitor size={10} /> Sen (paylaşıyorsun)
                    </div>
                  </button>
                )}
                {Object.entries(screenShares).map(([pid, stream]) => (
                  <button
                    key={pid}
                    onClick={() => setViewingScreenPeerId(pid)}
                    className="shrink-0 w-40 rounded-xl overflow-hidden border-2 border-slate-700 hover:border-indigo-500 relative transition-colors"
                  >
                    <StreamVideo
                      stream={stream}
                      className="w-full h-24 object-cover bg-slate-950"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[10px] text-slate-200 px-2 py-1 flex items-center gap-1 truncate">
                      <Monitor size={10} className="shrink-0" /> {screenSharerNames[pid] || 'Katılımcı'}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* KAMERA ŞERİDİ: aktif kameralar (kendi + diğerleri) yuvarlak küçük önizleme olarak */}
            {(isCameraOn || Object.keys(cameraStreams).length > 0) && (
              <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/30 flex gap-3 overflow-x-auto">
                {isCameraOn && (
                  <button
                    onClick={() => setViewingCameraPeerId('me')}
                    className="shrink-0 flex flex-col items-center gap-1"
                  >
                    <StreamVideo
                      stream={cameraStreamRef.current}
                      muted
                      className="h-16 w-16 rounded-full object-cover border-2 border-rose-500"
                    />
                    <span className="text-[10px] text-slate-400">Sen</span>
                  </button>
                )}
                {Object.entries(cameraStreams).map(([pid, stream]) => (
                  <button
                    key={pid}
                    onClick={() => setViewingCameraPeerId(pid)}
                    className="shrink-0 flex flex-col items-center gap-1"
                  >
                    <StreamVideo
                      stream={stream}
                      className="h-16 w-16 rounded-full object-cover border-2 border-slate-700 hover:border-rose-500 transition-colors"
                    />
                    <span className="text-[10px] text-slate-400 max-w-[64px] truncate">{cameraSharerNames[pid] || 'Katılımcı'}</span>
                  </button>
                ))}
              </div>
            )}

            {/* GRUP ODASI MESAJLARI */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {(groupRoomMessages[currentRoom.id] || []).length === 0 ? (
                <div className="text-center text-xs text-slate-600 my-8">Odaya hoş geldin. Mesaj yazabilir, mikrofona basıp sesli katılabilirsin.</div>
              ) : (
                (groupRoomMessages[currentRoom.id] || []).map((msg) => (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`flex gap-3 max-w-[75%] rounded-lg transition-shadow ${msg.senderId === userId ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'}`}
                  >
                    {msg.senderAvatarUrl ? (
                      <img
                        src={msg.senderAvatarUrl}
                        alt={msg.senderAvatar}
                        className="h-7 w-7 rounded-lg object-cover shrink-0 mt-1"
                      />
                    ) : (
                      <div className={`h-7 w-7 rounded-lg text-[10px] font-bold flex items-center justify-center shrink-0 mt-1 ${
                        msg.senderId === userId ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {msg.senderAvatar}
                      </div>
                    )}
                    <div className={`flex flex-col min-w-0 ${msg.senderId === userId ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-slate-500 mb-0.5 px-1">{msg.senderName}</span>
                      <div className="min-w-0 w-full">
                        {msg.replyTo && (
                          <QuotedReplyBlock reply={msg.replyTo} onClick={() => scrollToMessage(msg.replyTo!.messageId)} />
                        )}
                        {msg.file ? (
                          <FileMessageContent file={msg.file} onImageClick={setViewingImage} />
                        ) : (
                          <div className={`p-3 rounded-2xl text-sm ${
                            msg.senderId === userId ? 'bg-cyan-500 text-slate-950 rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
                          }`}>
                            {msg.text}
                          </div>
                        )}
                      </div>
                      <MessageReactions
                        reactions={msg.reactions}
                        myUserId={userId}
                        align={msg.senderId === userId ? 'me' : 'peer'}
                        isPickerOpen={reactionPickerMessageId === msg.id}
                        onTogglePicker={() => setReactionPickerMessageId((prev) => (prev === msg.id ? null : msg.id))}
                        onReact={(emoji) => sendRoomReaction(msg.id, emoji)}
                        onReply={() => startReply(msg)}
                      />
                      <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={roomMessagesEndRef} />
            </div>

            {/* YAZIYOR GÖSTERGESİ (GRUP) */}
            {Object.keys(roomTypingUsers).length > 0 && (
              <div className="px-6 pb-2 flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {Object.entries(roomTypingUsers).map(([uid, t]) => (
                    <div
                      key={uid}
                      title={t.name}
                      className="h-5 w-5 rounded-full bg-slate-800 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-slate-300"
                    >
                      {t.avatar}
                    </div>
                  ))}
                </div>
                <span className="text-[11px] text-slate-500 italic flex items-center gap-1">
                  {Object.values(roomTypingUsers).map((t) => t.name).join(', ')} yazıyor
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce" />
                  </span>
                </span>
              </div>
            )}

            {/* YANITLAMA BANNER'I */}
            {replyingTo && (
              <div className="px-4 pt-3 -mb-1 flex items-center justify-between bg-slate-900/10 border-t border-slate-800/50">
                <div className="flex items-center gap-2 min-w-0 text-xs text-slate-400">
                  <Reply size={13} className="shrink-0 text-cyan-400" />
                  <span className="shrink-0">Yanıtlanıyor: <span className="text-slate-200 font-medium">{replyingTo.senderName}</span></span>
                  <span className="truncate text-slate-500">— {replyingTo.preview}</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 text-slate-500 hover:text-slate-200 shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* GRUP ODASI INPUT ALANI */}
            <form onSubmit={handleSendRoomMessage} className="p-4 border-t border-slate-800 bg-slate-900/10 flex gap-3 relative">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="p-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-colors"
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={insertEmoji}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => roomFileInputRef.current?.click()}
                title="Dosya gönder"
                className="p-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-colors"
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={roomFileInputRef}
                type="file"
                onChange={handleFileSelectRoom}
                className="hidden"
              />
              <input
                type="text"
                placeholder={`#${currentRoom.name} odasına mesaj gönder...`}
                value={roomInputText}
                onChange={handleRoomInputChange}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 text-sm focus:outline-none focus:border-cyan-500 text-slate-100"
              />
              <button type="submit" className="p-3 bg-cyan-500 text-slate-950 rounded-xl hover:bg-cyan-400 transition-colors">
                <Send size={18} />
              </button>
            </form>
          </>
        ) : selectedPeerId && currentChatUser ? (
          <>
            {/* ODA BAŞLIĞI */}
            <div className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/20">
              <div className="flex items-center gap-3">
                <Avatar avatarUrl={currentChatUser.avatarUrl} initials={currentChatUser.avatar} size={36} className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400" />
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {currentChatUser.name}
                    {currentChatUser.isOnline ? (
                      <CheckCircle size={14} className="text-emerald-500" />
                    ) : (
                      <span className="text-[10px] text-slate-500 font-normal">(çevrimdışı)</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">{selectedPeerId}</div>
                </div>
              </div>
            </div>

            {/* ODA MESAJLARI */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {currentRoomMessages.length === 0 ? (
                <div className="text-center text-xs text-slate-600 my-8">Güvenli P2P oda bağlantısı kuruldu. Mesaj yazabilirsiniz.</div>
              ) : (
                currentRoomMessages.map((msg) => (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`flex gap-3 max-w-[75%] rounded-lg transition-shadow ${msg.sender === 'me' ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'}`}
                  >
                    {msg.senderAvatarUrl ? (
                      <img
                        src={msg.senderAvatarUrl}
                        alt={msg.senderAvatar}
                        className="h-7 w-7 rounded-lg object-cover shrink-0 mt-1"
                      />
                    ) : (
                      <div className={`h-7 w-7 rounded-lg text-[10px] font-bold flex items-center justify-center shrink-0 mt-1 ${
                        msg.sender === 'me' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {msg.senderAvatar}
                      </div>
                    )}
                    <div className={`flex flex-col min-w-0 ${msg.sender === 'me' ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-slate-500 mb-0.5 px-1">{msg.senderName}</span>
                      <div className="min-w-0 w-full">
                        {msg.replyTo && (
                          <QuotedReplyBlock reply={msg.replyTo} onClick={() => scrollToMessage(msg.replyTo!.messageId)} />
                        )}
                        {msg.file ? (
                          <FileMessageContent file={msg.file} onImageClick={setViewingImage} />
                        ) : (
                          <div className={`p-3 rounded-2xl text-sm ${
                            msg.sender === 'me' ? 'bg-emerald-500 text-slate-950 rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
                          }`}>
                            {msg.text}
                          </div>
                        )}
                      </div>
                      <MessageReactions
                        reactions={msg.reactions}
                        myUserId={userId}
                        align={msg.sender === 'me' ? 'me' : 'peer'}
                        isPickerOpen={reactionPickerMessageId === msg.id}
                        onTogglePicker={() => setReactionPickerMessageId((prev) => (prev === msg.id ? null : msg.id))}
                        onReact={(emoji) => sendReaction(msg.id, emoji)}
                        onReply={() => startReply(msg)}
                      />
                      <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* YAZIYOR GÖSTERGESİ (1-1) */}
            {peerTyping[selectedPeerId] && (
              <div className="px-6 pb-2 flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-300">
                  {currentChatUser.avatar}
                </div>
                <span className="text-[11px] text-slate-500 italic flex items-center gap-1">
                  {currentChatUser.name} yazıyor
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 rounded-full bg-slate-500 animate-bounce" />
                  </span>
                </span>
              </div>
            )}

            {/* YANITLAMA BANNER'I */}
            {replyingTo && (
              <div className="px-4 pt-3 -mb-1 flex items-center justify-between bg-slate-900/10 border-t border-slate-800/50">
                <div className="flex items-center gap-2 min-w-0 text-xs text-slate-400">
                  <Reply size={13} className="shrink-0 text-emerald-400" />
                  <span className="shrink-0">Yanıtlanıyor: <span className="text-slate-200 font-medium">{replyingTo.senderName}</span></span>
                  <span className="truncate text-slate-500">— {replyingTo.preview}</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 text-slate-500 hover:text-slate-200 shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* MESAJ INPUT ALANI */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/10 flex gap-3 relative">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="p-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-colors"
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={insertEmoji}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Dosya gönder"
                className="p-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-colors"
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect1to1}
                className="hidden"
              />
              <input
                type="text"
                placeholder={`${currentChatUser.name} kullanıcısına güvenli mesaj gönder...`}
                value={inputText}
                onChange={handleInputChange}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 text-sm focus:outline-none focus:border-emerald-500 text-slate-100"
              />
              <button type="submit" className="p-3 bg-emerald-500 text-slate-950 rounded-xl hover:bg-emerald-400 transition-colors">
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400 mb-4">
              <MessageSquare size={32} />
            </div>
            <h3 className="text-slate-300 font-medium mb-1">Bir Sohbet Seçin veya Yeni Eş Ekleyin</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Sol taraftaki "Yeni Arkadaş Ekle" alanına arkadaşınızın P2P kodunu yazarak doğrudan birebir sohbet başlatabilir,
              ya da "Odalar" sekmesinden çok kişilik bir metin/sesli odaya katılabilirsin.
            </p>
          </div>
        )}
      </section>

      {/* GÖRSEL BÜYÜTME (LIGHTBOX): resme tıklanınca indirmek yerine burada büyük gösterilir */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6"
          onClick={() => setViewingImage(null)}
        >
          <button
            onClick={() => setViewingImage(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title="Kapat"
          >
            ✕
          </button>
          <a
            href={viewingImage.dataUrl}
            download={viewingImage.name}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-16 h-10 w-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title="İndir"
          >
            <Download size={18} />
          </a>
          <img
            src={viewingImage.dataUrl}
            alt={viewingImage.name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[85vh] rounded-lg object-contain"
          />
          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-400">
            {viewingImage.name} · {formatFileSize(viewingImage.size)}
          </div>
        </div>
      )}

      {/* EKRAN PAYLAŞIMI BÜYÜK GÖRÜNTÜLEYİCİ */}
      {viewingScreenPeerId && (viewingScreenPeerId === 'me' ? screenStreamRef.current : screenShares[viewingScreenPeerId]) && (
        <div
          ref={screenLightboxRef}
          className={`fixed inset-0 z-[100] bg-black/95 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-6'}`}
          onClick={() => setViewingScreenPeerId(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(screenLightboxRef.current); }}
            className="absolute top-4 right-16 h-10 w-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran yap'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); setViewingScreenPeerId(null); }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title="Kapat"
          >
            ✕
          </button>
          <StreamVideo
            stream={viewingScreenPeerId === 'me' ? screenStreamRef.current : screenShares[viewingScreenPeerId] || null}
            muted={viewingScreenPeerId === 'me'}
            onClick={(e) => e.stopPropagation()}
            className={isFullscreen ? "w-full h-full object-contain bg-slate-950" : "max-w-[92vw] max-h-[85vh] rounded-lg object-contain bg-slate-950"}
          />
          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <Monitor size={12} />
            {viewingScreenPeerId === 'me' ? 'Kendi ekranını paylaşıyorsun' : `${screenSharerNames[viewingScreenPeerId] || 'Katılımcı'} ekranını paylaşıyor`}
          </div>
        </div>
      )}

      {/* KAMERA BÜYÜK GÖRÜNTÜLEYİCİ */}
      {viewingCameraPeerId && (viewingCameraPeerId === 'me' ? cameraStreamRef.current : cameraStreams[viewingCameraPeerId]) && (
        <div
          ref={cameraLightboxRef}
          className={`fixed inset-0 z-[100] bg-black/95 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-6'}`}
          onClick={() => setViewingCameraPeerId(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(cameraLightboxRef.current); }}
            className="absolute top-4 right-16 h-10 w-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran yap'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); setViewingCameraPeerId(null); }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title="Kapat"
          >
            ✕
          </button>
          <StreamVideo
            stream={viewingCameraPeerId === 'me' ? cameraStreamRef.current : cameraStreams[viewingCameraPeerId] || null}
            muted={viewingCameraPeerId === 'me'}
            onClick={(e) => e.stopPropagation()}
            className={isFullscreen ? "w-full h-full object-contain bg-slate-950" : "max-w-[92vw] max-h-[85vh] rounded-lg object-contain bg-slate-950"}
          />
          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <Video size={12} />
            {viewingCameraPeerId === 'me' ? 'Kendi kameran' : `${cameraSharerNames[viewingCameraPeerId] || 'Katılımcı'} kamerası`}
          </div>
        </div>
      )}
    </main>
  );
}