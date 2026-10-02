import type { Dispatch, SetStateAction } from 'react';
import {
  shouldRedirectToLogin,
  redirectToLoginOrHome
} from "./api";

type SetErrorType = Dispatch<SetStateAction<null|string>>

export function useAuthRedirect(setError:SetErrorType) {
  return (err:unknown) => {
    if (shouldRedirectToLogin(err)) {
      setError("Your session expired. Redirecting to sign in...");
      redirectToLoginOrHome();
      return true;
    }
    return false;
  };
}
