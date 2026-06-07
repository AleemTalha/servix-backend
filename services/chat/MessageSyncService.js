const ChatService = require("./ChatService");

class MessageSyncService {
  /**
   * When a user comes online, fetch all undelivered (status='sent')
   * messages from server and prepare them for delivery.
   *
   * Algorithm (WhatsApp-style offline sync):
   * 1. Query all messages where receiverId == userId AND status == 'sent'
   * 2. Return them so socket handler can emit to client
   * 3. Mark all as 'delivered' (handled by caller after successful emit)
   */
  async syncUndeliveredMessages(userId) {
    const messages = await ChatService.getUndeliveredMessages(userId);
    return messages;
  }

  /**
   * Mark a batch of messages as delivered.
   * Called after successfully emitting undelivered messages to the client.
   */
  async confirmDelivery(messageIds) {
    if (!messageIds || messageIds.length === 0) return 0;
    const result = await ChatService.markAsDelivered(messageIds);
    return result.modifiedCount;
  }

  /**
   * Mark all messages in a conversation as read.
   * Called when the user opens a conversation.
   */
  async markConversationRead(conversationId, userId) {
    const count = await ChatService.markAsRead(conversationId, userId);
    return count;
  }

  /**
   * Get unread count for a conversation.
   */
  async getUnreadCount(conversationId, userId) {
    return ChatService.getUnreadCount(conversationId, userId);
  }
}

module.exports = new MessageSyncService();
