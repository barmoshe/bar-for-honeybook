import { NextResponse, type NextRequest } from "next/server";

/**
 * Hands every visitor their own workspace.
 *
 * A server component can read cookies but cannot set them, so the id has to be
 * minted somewhere that can. A proxy is that place, and it is a good fit for
 * another reason: it runs before the page, so the page can treat the cookie as
 * something that is simply always there.
 *
 * Nothing here touches the database. The proxy only decides what the workspace
 * is called; the page decides whether it exists yet.
 */

export const WORKSPACE_COOKIE = "hb_ws";

const APP_ROUTES = /^\/(f|studio|console|engineering)(\/|$)/;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (!APP_ROUTES.test(request.nextUrl.pathname)) return response;
  if (request.cookies.get(WORKSPACE_COOKIE)) return response;

  const id = `ws_${crypto.randomUUID().replaceAll("-", "")}`;

  // Set it on the request too, so the very first render sees the same id the
  // browser is about to store rather than a page that thinks it has no
  // workspace followed by one that does.
  request.cookies.set(WORKSPACE_COOKIE, id);
  response.cookies.set({
    name: WORKSPACE_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export const config = {
  matcher: ["/f/:path*", "/studio/:path*", "/console/:path*", "/engineering/:path*"],
};
