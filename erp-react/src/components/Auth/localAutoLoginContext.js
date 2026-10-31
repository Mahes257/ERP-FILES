import { createContext, useContext } from 'react';

/**
 * Local auto-login state, provided by LocalAutoLoginGate.
 *
 *  - `enabled`     the backend allows local auto-login for this client
 *                  (loopback + feature switched on). False on every deployed
 *                  instance, which is what keeps the normal sign-in flow.
 *  - `authenticated` a session is currently stored.
 *  - `signIn()`    obtains a genuine session for the server's configured
 *                  account and resolves true on success.
 */
export const LocalAutoLoginContext = createContext({
  enabled: false,
  authenticated: false,
  signIn: async () => false
});

/** Read the local auto-login state from anywhere inside the gate. */
export function useLocalAutoLogin() {
  return useContext(LocalAutoLoginContext);
}
