import type { Metadata } from "next";
import AiPage from "@/components/AiPage";

export const metadata: Metadata = {
  title: "HoneyBook × AI, previewed live — Bar Moshe",
  description:
    "HoneyBook's real AI features — priority leads, AI Notetaker, the automations builder — researched and rebuilt by hand as live animated previews.",
};

export default function Page() {
  return <AiPage />;
}
