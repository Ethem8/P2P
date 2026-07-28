export const performLocalLogout = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('p2p_chat_rooms');
  localStorage.removeItem('p2p_active_chats');
  window.location.href = '/'; // Ana sayfaya yönlendir
};