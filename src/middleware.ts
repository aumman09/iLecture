import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Route protection: staff pages need INSTRUCTOR/ADVISOR/ADMIN; /join needs any signed-in user.
export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined;
    const p = req.nextUrl.pathname;
    const staff = role === "INSTRUCTOR" || role === "ADVISOR" || role === "ADMIN";
    if ((p.startsWith("/dashboard") || p.startsWith("/live")) && !staff) {
      return NextResponse.redirect(new URL("/join", req.url));
    }
    if (p.startsWith("/live") && role === "ADVISOR") return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  },
  { pages: { signIn: "/login" } }
);

export const config = { matcher: ["/dashboard/:path*", "/live/:path*", "/join/:path*", "/join"] };
