import React, { useEffect, useRef } from 'react';
import { CloseIcon } from '../common/Icons';
import { useAdminTheme } from '../../utils/adminTheme';

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
  sm: '460px',
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
  const { tokens } = useAdminTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const prevOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (isOpen) {
      if (!prevOpenRef.current) {
        previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
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
    } else if (prevOpenRef.current) {
      prevOpenRef.current = false;
      document.body.style.overflow = '';
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    }
  }, [isOpen]);

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
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
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
        backgroundColor: 'rgba(16, 19, 24, 0.62)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: isFull ? '12px' : '16px',
        animation: 'cslModalFadeIn 0.15s ease-out',
        fontFamily: tokens.fontFamily,
      }}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <style>{`
        @keyframes cslModalFadeIn {
          from { opacity: 0; transform: scale(0.985); }
          to { opacity: 1; transform: scale(1); }
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
          backgroundColor: tokens.surfaceCard,
          color: tokens.textPrimary,
          border: `1px solid ${tokens.border}`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: resolvedMaxWidth,
          height: isFull ? '94vh' : undefined,
          maxHeight: isFull ? '94vh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: tokens.modalShadow,
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
            gap: '12px',
            padding: '16px 24px',
            borderBottom: `1px solid ${tokens.border}`,
            backgroundColor: tokens.surfaceCard,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id="accessible-modal-title"
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                lineHeight: '24px',
                color: tokens.textPrimary,
                letterSpacing: '-0.015em',
              }}
            >
              {title}
            </h2>
            {description && (
              <p
                id="accessible-modal-desc"
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  lineHeight: '18px',
                  color: tokens.textSecondary,
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
              borderRadius: '8px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.surfaceCard,
              color: tokens.textSecondary,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background-color 120ms ease-out, color 120ms ease-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.surfaceElevated;
              e.currentTarget.style.color = tokens.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = tokens.surfaceCard;
              e.currentTarget.style.color = tokens.textSecondary;
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
