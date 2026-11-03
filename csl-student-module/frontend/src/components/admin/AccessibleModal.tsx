import React, { useEffect, useRef } from 'react';
import { CloseIcon } from '../common/Icons';

export interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  maxWidth?: string;
  closeOnBackdropClick?: boolean;
}

const SIZE_MAP: Record<string, string> = {
  sm: '440px',
  md: '580px',
  lg: '760px',
  xl: '980px',
  full: '96vw',
};

export function AccessibleModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  maxWidth,
  closeOnBackdropClick = true,
}: AccessibleModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const prevOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  // Keep latest onClose callback without re-triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (isOpen) {
      if (!prevOpenRef.current) {
        // Modal just opened: save active element and focus inside
        previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

        // Prevent body scrolling
        document.body.style.overflow = 'hidden';

        const timer = setTimeout(() => {
          if (modalRef.current) {
            const focusable = modalRef.current.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length > 0) {
              focusable[0].focus();
            } else {
              modalRef.current.focus();
            }
          }
        }, 50);

        prevOpenRef.current = true;
        return () => clearTimeout(timer);
      }
    } else {
      if (prevOpenRef.current) {
        prevOpenRef.current = false;
        document.body.style.overflow = '';
        if (previouslyFocusedElementRef.current) {
          previouslyFocusedElementRef.current.focus();
        }
      }
    }
  }, [isOpen]);

  // Global keydown listeners for Escape & Tab focus-trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const resolvedMaxWidth = maxWidth || SIZE_MAP[size] || '640px';
  const isFull = size === 'full';

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: isFull ? '12px' : '16px',
        animation: 'cslModalFadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <style>{`
        @keyframes cslModalFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="accessible-modal-title"
        aria-describedby={description ? 'accessible-modal-desc' : undefined}
        tabIndex={-1}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: isFull ? '16px' : '24px',
          width: '100%',
          maxWidth: resolvedMaxWidth,
          height: isFull ? '94vh' : undefined,
          maxHeight: isFull ? '94vh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
          outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div>
            <h2
              id="accessible-modal-title"
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#0F172A',
                letterSpacing: '-0.02em',
              }}
            >
              {title}
            </h2>
            {description && (
              <p
                id="accessible-modal-desc"
                style={{
                  margin: '3px 0 0',
                  fontSize: '12px',
                  color: '#64748B',
                }}
              >
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              cursor: 'pointer',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F1F5F9';
              e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.color = '#64748B';
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
