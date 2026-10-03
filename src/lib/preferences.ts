import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export const getPreference = cache((userId: string) =>
  db.userPreference.findUnique({ where: { userId } }),
);
