"use client";

import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isOnline) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: '#f59e0b',
      color: '#fff',
      padding: '8px 16px',
      textAlign: 'center',
      fontWeight: 'bold',
      position: 'sticky',
      top: 0,
      zIndex: 9999,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px'
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a15.16 15.16 0 0 1-2.45 3.33M17.84 17.84A15 15 0 0 1 2 12s3-7 7-7M12 20a10 10 0 0 0 4.27-.96" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </svg>
      Offline Mode - Showing Cached Data
    </div>
  );
}
