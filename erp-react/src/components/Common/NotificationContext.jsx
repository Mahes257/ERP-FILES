/**
 * NotificationContext.jsx
 * ------------------------------------------------------------------
 * Provides real-time in-app notifications via WebSocket (STOMP over
 * SockJS) and a REST-backed unread count for the sidebar bell badge.
 *
 * Architecture:
 *   Backend POST /notifications → MySQL
 *           ↓
 *   SimpMessagingTemplate.convertAndSendToUser(userId, "/notifications", …)
 *           ↓
 *   WebSocket /user/{userId}/queue/notifications
 *           ↓
 *   useNotifications() hook → notification list + unread count
 *           ↓
 *   SidebarNotificationBell badge
 *           ↓
 *   Notifications page (full list, mark-read, resolve)
 *
 * Security:
 *   - JWT token is sent in the STOMP CONNECT "Authorization" header
 *   - StompJwtInterceptor on the server validates the token and sets
 *     the authenticated Principal, so /user/{id}/queue only delivers
 *     to the rightful owner
 *   - No userId is sent from the frontend — the server derives it
 * ------------------------------------------------------------------
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import { Client } from '@stomp/stompjs';
import {
  listNotifications,
  getUnreadCount,
  markAsRead as apiMarkAsRead,
  resolveNotification as apiResolve
} from '../../services/notificationService';
import {
  AUTH_STATE_CHANGED_EVENT,
  getStoredToken,
  isAuthenticated
} from '../../services/tokenStorage';

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  loading: true,
  connected: false,
  markAsRead: async () => {},
  resolveNotification: async () => {},
  refresh: async () => {}
});

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  return useContext(NotificationContext);
}

/** Build the raw WebSocket URL — proxied through Vite or direct to backend. */
function getWsUrl() {
  const base = import.meta.env.VITE_API_URL || '/v1';
  // When using native WebSocket (no SockJS), the raw WS endpoint is /ws/websocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${base}/ws/websocket`;
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);
  const mountedRef = useRef(true);

  // ---------- REST helpers ----------

  const refresh = useCallback(async () => {
    if (!isAuthenticated()) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    try {
      const [notifs, count] = await Promise.all([
        listNotifications(),
        getUnreadCount()
      ]);
      if (!mountedRef.current) return;
      setNotifications(notifs);
      setUnreadCount(count);
    } catch {
      // Best-effort — keep last known state
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id) => {
    try {
      const updated = await apiMarkAsRead(id);
      if (!updated) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? updated : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Best-effort
    }
  }, []);

  const resolveNotification = useCallback(async (id) => {
    try {
      const updated = await apiResolve(id);
      if (!updated) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? updated : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Best-effort
    }
  }, []);

  // ---------- WebSocket ----------

  useEffect(() => {
    mountedRef.current = true;

    if (!isAuthenticated()) {
      setLoading(false);
      return undefined;
    }

    // Initial REST load
    refresh();

    // STOMP over native WebSocket (SockJS fallback endpoint at /ws).
    // The Authorization header must be re-read on EVERY connect attempt:
    // the access token is short-lived and is refreshed in the background
    // by the axios layer. A header captured once at mount goes stale after
    // ~30 minutes, and then every reconnect is rejected by
    // StompJwtInterceptor ("JWT expired") — an infinite 5s failure loop.
    const wsUrl = getWsUrl();
    const client = new Client({
      webSocketFactory: () => new WebSocket(wsUrl),
      beforeConnect: () => {
        // Runs before the initial connect AND before every reconnect, so
        // a token refreshed while disconnected is used on the next attempt.
        client.connectHeaders = {
          Authorization: `Bearer ${getStoredToken()}`
        };
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        if (!mountedRef.current) return;
        setConnected(true);

        // Subscribe to the user's private notification queue.
        // The server resolves /user/{principal.name}/queue/notifications
        // automatically based on the authenticated STOMP session.
        client.subscribe('/user/queue/notifications', (message) => {
          try {
            const notif = JSON.parse(message.body);
            // Add the new notification to the top of the list.
            setNotifications((prev) => {
              // Avoid duplicates
              if (prev.some((n) => n.id === notif.id)) return prev;
              return [notif, ...prev];
            });
            // Increment unread count.
            setUnreadCount((prev) => prev + 1);
          } catch {
            // Malformed message — ignore
          }
        });
      },
      onDisconnect: () => {
        if (mountedRef.current) setConnected(false);
      },
      onStompError: (frame) => {
        // STOMP protocol error (e.g. bad credentials).
        // The client will retry via reconnectDelay.
        console.warn('STOMP error:', frame.headers?.message || frame.body);
      },
      onWebSocketClose: () => {
        if (!mountedRef.current) return;
        setConnected(false);
        // An abnormal close while the page is still open usually means the
        // session token aged out (or the backend restarted). Kick the app's
        // existing silent refresh now — via the normal REST path, no polling
        // is added — so the next reconnect attempt in reconnectDelay carries
        // a fresh token instead of repeating the same rejected one.
        refresh();
      }
    });

    client.activate();
    clientRef.current = client;

    return () => {
      mountedRef.current = false;
      if (clientRef.current) {
        clientRef.current.deactivate();
        clientRef.current = null;
      }
    };
  }, [refresh]);

  useEffect(() => {
    const onAuthStateChanged = () => {
      if (isAuthenticated()) {
        refresh();
      } else {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
      }
    };
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, onAuthStateChanged);
    return () => window.removeEventListener(AUTH_STATE_CHANGED_EVENT, onAuthStateChanged);
  }, [refresh]);

  // ---------- Multi-tab & visibility refresh ----------

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isAuthenticated()) {
        refresh();
      }
    };
    const onFocus = () => {
      if (isAuthenticated()) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        connected,
        markAsRead,
        resolveNotification,
        refresh
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
