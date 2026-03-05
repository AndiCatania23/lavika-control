export interface AppNotification {
  id: string;
  type: 'run_success' | 'run_failed' | 'run_cancelled' | 'new_video';
  title: string;
  message: string;
  timestamp: string;
  href: string;
}
