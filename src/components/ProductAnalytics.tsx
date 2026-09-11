"use client";

import { useAuth } from "@/components/AuthProvider";
import { trackProductEvent } from "@/lib/product-analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ProductAnalytics() {
  const pathname = usePathname();
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!pathname || pathname.startsWith("/dev")) {
      return;
    }

    trackProductEvent(
      {
        eventName: "session_start",
        path: pathname
      },
      accessToken
    );
    trackProductEvent(
      {
        eventName: "page_view",
        path: pathname
      },
      accessToken
    );

    const artistMatch = pathname.match(/^\/artists\/([^/]+)$/);

    if (artistMatch?.[1]) {
      trackProductEvent(
        {
          eventName: "artist_view",
          path: pathname,
          artistId: artistMatch[1]
        },
        accessToken
      );
    }
  }, [accessToken, pathname]);

  return null;
}
