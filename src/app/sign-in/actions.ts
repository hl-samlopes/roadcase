"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import type { FormState } from "@/lib/forms/state";

export async function signInAction(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      organization: formData.get("organization"),
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
  } catch (error) {
    // signIn redirects by throwing; only authentication failures are handled here.
    if (error instanceof AuthError && (error as { code?: string }).code === "rate_limited") {
      return {
        error:
          "Too many failed sign-in attempts. Wait 15 minutes and try again, or ask an admin to unlock your account.",
      };
    }
    if (error instanceof AuthError) {
      return { error: "That username and password don't match an active account." };
    }
    throw error;
  }
  return {};
}
