import RouteLoading from "../../RouteLoading";

/**
 * Without this, the nested route inherits ../loading.tsx and announces "What
 * the clients did" while the automations page is on its way, which is a page
 * that is not arriving.
 */
export default function Loading() {
  return <RouteLoading surface="automations" />;
}
