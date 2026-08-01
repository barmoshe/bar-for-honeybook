import type { Metadata } from "next";

import { currentWorkspace } from "@/lib/workspace";

import Studio from "./Studio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

export default async function Page() {
  // Seeds this visitor's workspace if the instance is cold, so the file they
  // create in a moment has somewhere to go.
  await currentWorkspace();
  return <Studio />;
}
