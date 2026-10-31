import { createContext, useContext } from 'react';

export const ApiErrorContext = createContext(null);

export function useApiError() {
  return useContext(ApiErrorContext);
}
