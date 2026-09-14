import { AxiosInstance } from 'axios';

const SESSION_EXPIRED_MESSAGE_KEY = 'authExpiredMessage';
let redirecting = false;

/**
 * Shared 401 handler (PR-AUTH-5) — attached to every authenticated api
 * client's axios instance. Registering this BEFORE each file's own
 * response interceptor means it sees the raw AxiosError first (so
 * `error.response.status` is still intact) and always re-throws the exact
 * same error unchanged, so each file's existing message-extraction
 * interceptor keeps working exactly as before. On a 401 it clears the
 * stored token and sends the user to /login with a clear reason — guarded
 * against redirect loops (never re-triggers if already on /login, and
 * never fires twice concurrently).
 */
export function attachAuthExpiryHandler(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401 && !redirecting) {
        redirecting = true;
        localStorage.removeItem('authToken');
        try {
          sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, 'Your session has expired. Please sign in again.');
        } catch {
          // sessionStorage can throw in a locked-down context — the redirect itself still proceeds.
        }
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.assign('/login');
        } else {
          redirecting = false;
        }
      }
      return Promise.reject(error);
    }
  );
}

/** Read once (e.g. on the login page) and clear — never shown twice. */
export function consumeSessionExpiredMessage(): string | null {
  try {
    const message = sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY);
    if (message) sessionStorage.removeItem(SESSION_EXPIRED_MESSAGE_KEY);
    return message;
  } catch {
    return null;
  }
}
