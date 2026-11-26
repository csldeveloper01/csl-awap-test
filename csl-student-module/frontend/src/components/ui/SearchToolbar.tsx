import React from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { SearchIcon } from '../common/Icons';

export interface SearchToolbarProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  onSubmitSearch?: (e: React.FormEvent) => void;
  filters?: React.ReactNode;
  rightSlot?: React.ReactNode;
  style?: React.CSSProperties;
}

export function SearchToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  onSubmitSearch,
  filters,
  rightSlot,
  style,
}: SearchToolbarProps) {
  const { tokens } = useAdminTheme();

  const inner = (
    <div
      style={{
        backgroundColor: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: '10px',
        padding: '14px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: tokens.cardShadow,
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: '1 1 320px', minWidth: 0 }}>
        <label style={{ position: 'relative', flex: '1 1 240px', maxWidth: '420px', minWidth: '180px', display: 'flex', alignItems: 'center' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '12px',
              display: 'inline-flex',
              color: tokens.textMuted,
              pointerEvents: 'none',
            }}
          >
            <SearchIcon size={16} color={tokens.textMuted} />
          </span>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              fontFamily: tokens.fontFamily,
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </label>
        {filters}
      </div>

      {rightSlot && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {rightSlot}
        </div>
      )}
    </div>
  );

  if (onSubmitSearch) {
    return <form onSubmit={onSubmitSearch}>{inner}</form>;
  }
  return inner;
}

export function FilterBar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { tokens } = useAdminTheme();
  return (
    <div
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        padding: '3px',
        borderRadius: '8px',
        border: `1px solid ${tokens.border}`,
        backgroundColor: tokens.inputBg,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
