import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/authz";

export default async function Home() {
  redirect((await getCurrentUser()) ? "/items" : "/sign-in");
}
