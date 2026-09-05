import { normalizeChatId } from "./domain.mjs";

function serializedId(value) {
  if (value && typeof value === "object") {
    return serializedId(value._serialized || value.id || value.user);
  }
  return String(value || "").trim();
}

export function normalizeOpenWAMessage(message) {
  if (!message || message.fromMe === true) return null;
  const chatId = normalizeChatId(message.chatId || message.chat?.id || message.from);
  if (!chatId) return null;
  const isGroup = chatId.endsWith("@g.us") || message.isGroupMsg === true;
  const senderId = normalizeChatId(
    isGroup
      ? message.authorPn || message.participantPn || message.sender?.id || message.author || message.sender || message.from
      : message.from || message.sender?.id || message.sender,
  );
  const id = serializedId(message.id || message.key?.id);
  const body = String(message.body || message.text || message.content || "").trim();
  if (!id || !senderId || !body) return null;
  return { id, chatId, senderId, body, isGroup };
}
