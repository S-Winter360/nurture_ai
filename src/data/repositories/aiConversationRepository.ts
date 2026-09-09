import { db } from '../db';
import { AiChatMessage } from '../../services/ai/types';

export class AiConversationRepository {
  public async getMessagesForMember(familyMemberId: string): Promise<AiChatMessage[]> {
    try {
      const messages = await db.aiMessages
        .where('familyMemberId')
        .equals(familyMemberId)
        .sortBy('timestamp');
      return messages;
    } catch {
      return [];
    }
  }

  public async saveMessage(message: AiChatMessage): Promise<void> {
    try {
      await db.aiMessages.put(message);
    } catch (err) {
      console.warn('Failed to persist AI message in IndexedDB:', err);
    }
  }

  public async clearMessagesForMember(familyMemberId: string): Promise<void> {
    try {
      await db.aiMessages
        .where('familyMemberId')
        .equals(familyMemberId)
        .delete();
    } catch (err) {
      console.warn('Failed to clear member AI messages:', err);
    }
  }

  public async clearAllMessages(): Promise<void> {
    try {
      await db.aiMessages.clear();
    } catch (err) {
      console.warn('Failed to clear all AI messages:', err);
    }
  }
}

export const aiConversationRepository = new AiConversationRepository();
