import RouteLoading from "../../RouteLoading";

/** Matches /f/loading.tsx, so the redirect between them is not visible. */
export default function Loading() {
  return <RouteLoading eyebrow="Smart file" title="Opening your file." chrome="file" />;
}
