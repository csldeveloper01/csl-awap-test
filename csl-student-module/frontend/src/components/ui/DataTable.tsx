import React from 'react';
import { useAdminTheme } from '../../utils/adminTheme';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmptyState({ title, description, action, icon, style }: EmptyStateProps) {
  const { tokens } = useAdminTheme();

  return (
    <div
      style={{
        backgroundColor: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: '10px',
        padding: '44px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        boxShadow: tokens.cardShadow,
        ...style,
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            backgroundColor: tokens.surfaceElevated,
            color: tokens.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '4px',
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          margin: 0,
          fontFamily: tokens.fontFamily,
          fontSize: '16px',
          fontWeight: 600,
          color: tokens.textPrimary,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: 0,
            maxWidth: '460px',
            fontFamily: tokens.fontFamily,
            fontSize: '13px',
            color: tokens.textSecondary,
            lineHeight: '19px',
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '6px' }}>{action}</div>}
    </div>
  );
}

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
  toolbar?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 5,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  onRowClick,
  footer,
  toolbar,
}: DataTableProps<T>) {
  const { tokens } = useAdminTheme();

  return (
    <section
      style={{
        backgroundColor: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: tokens.cardShadow,
      }}
    >
      {toolbar && (
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          {toolbar}
        </div>
      )}

      {!loading && data.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
        />
      ) : (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: tokens.pageBg,
                  borderBottom: `1px solid ${tokens.border}`,
                }}
              >
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      padding: '12px 16px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: tokens.textSecondary,
                      textAlign: col.align || 'left',
                      whiteSpace: 'nowrap',
                      width: col.width,
                    }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: skeletonRows }).map((_, rIdx) => (
                    <tr
                      key={`sk-${rIdx}`}
                      className="animate-pulse"
                      style={{ borderBottom: `1px solid ${tokens.border}` }}
                    >
                      {columns.map((col, cIdx) => (
                        <td key={`${col.key}-${cIdx}`} style={{ padding: '16px' }}>
                          <div
                            style={{
                              height: '14px',
                              borderRadius: '4px',
                              backgroundColor: tokens.surfaceElevated,
                              width: cIdx === 0 ? '70%' : '55%',
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : data.map((row, idx) => (
                    <tr
                      key={rowKey(row, idx)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      style={{
                        borderBottom: idx === data.length - 1 ? 'none' : `1px solid ${tokens.border}`,
                        cursor: onRowClick ? 'pointer' : 'default',
                        transition: 'background-color 120ms ease-out',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = tokens.surfaceHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            padding: '14px 16px',
                            fontSize: '13px',
                            color: tokens.textPrimary,
                            textAlign: col.align || 'left',
                            verticalAlign: 'middle',
                          }}
                        >
                          {col.render(row, idx)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {footer && (
        <div
          style={{
            padding: '12px 18px',
            borderTop: `1px solid ${tokens.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}
