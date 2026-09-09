export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  icon?: string;
  data?: any;
}

export class LocalNotificationService {
  private static instance: LocalNotificationService;
  private inAppSubscribers: Array<(notification: InAppNotification) => void> = [];
  private notificationHistory: InAppNotification[] = [];

  private constructor() {}

  public static getInstance(): LocalNotificationService {
    if (!LocalNotificationService.instance) {
      LocalNotificationService.instance = new LocalNotificationService();
    }
    return LocalNotificationService.instance;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermissionStatus(): NotificationPermissionStatus {
    if (!this.isSupported()) return 'unsupported';
    return window.Notification.permission;
  }

  public async requestPermission(): Promise<NotificationPermissionStatus> {
    if (!this.isSupported()) return 'unsupported';
    try {
      const permission = await window.Notification.requestPermission();
      return permission;
    } catch {
      return 'unsupported';
    }
  }

  /**
   * Dispatches a notification (native if permitted, plus in-app broadcast)
   */
  public notify(title: string, body: string, data?: any): InAppNotification {
    const item: InAppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      body,
      timestamp: new Date().toISOString(),
      data
    };

    this.notificationHistory.push(item);

    // Native browser notification if allowed
    if (this.isSupported() && window.Notification.permission === 'granted') {
      try {
        new window.Notification(title, {
          body,
          icon: '/web/favicon.png',
          data
        });
      } catch {
        // Fallback silently to in-app
      }
    }

    // Broadcast to in-app listeners
    this.inAppSubscribers.forEach((sub) => {
      try {
        sub(item);
      } catch (err) {
        console.error('Error in notification subscriber:', err);
      }
    });

    return item;
  }

  public subscribe(callback: (notification: InAppNotification) => void): () => void {
    this.inAppSubscribers.push(callback);
    return () => {
      this.inAppSubscribers = this.inAppSubscribers.filter((s) => s !== callback);
    };
  }

  public getHistory(): InAppNotification[] {
    return [...this.notificationHistory];
  }

  public clearHistory(): void {
    this.notificationHistory = [];
  }
}

export const localNotificationService = LocalNotificationService.getInstance();
