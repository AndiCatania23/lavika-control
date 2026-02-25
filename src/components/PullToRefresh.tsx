'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  children: React.ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || window.scrollY > 0) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    if (diff > 0) {
      setPullDistance(diff);
      e.preventDefault();
    }
  }, [isPulling, startY]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > 80) {
      setIsRefreshing(true);
      
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      
      window.location.href = window.location.href + '?t=' + Date.now();
    }
    setIsPulling(false);
    setPullDistance(0);
  }, [pullDistance]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const showIndicator = isPulling && pullDistance > 20;

  return (
    <div className="pull-to-refresh" style={{ minHeight: '100vh' }}>
      <div 
        className={`pull-to-refresh-indicator ${showIndicator ? 'visible' : ''}`}
        style={{
          background: 'rgba(212, 168, 83, 0.9)',
          borderRadius: '20px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#050505',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        <RefreshCw 
          className="w-4 h-4" 
          style={{ 
            animation: isRefreshing ? 'spin 1s linear infinite' : `rotate(${Math.min(pullDistance * 2, 180)}deg)`,
          }} 
        />
        {isRefreshing ? 'Aggiornamento...' : 'Aggiorna'}
      </div>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {children}
    </div>
  );
}
