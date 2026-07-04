import { redirect } from "next/navigation";

// The /ai content now lives on the home page; keep shared links working.
export default function Page() {
  redirect("/#ai");
}
