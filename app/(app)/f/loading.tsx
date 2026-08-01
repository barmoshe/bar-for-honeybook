import RouteLoading from "../RouteLoading";

/**
 * /f picks a file and redirects to /f/[token], so a visitor pays for two server
 * round trips before seeing anything. Both segments show the same state on
 * purpose: the hop should read as one continuous wait rather than two loaders.
 */
export default function Loading() {
  return <RouteLoading eyebrow="Smart file" title="Opening your file." chrome="file" />;
}
