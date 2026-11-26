interface ComingSoonPageProps {
  module: string;
}

/** Placeholder for student modules not yet implemented. */
export function ComingSoonPage({ module }: ComingSoonPageProps) {
  return (
    <div className="csl-card" style={{ padding: '40px 28px', maxWidth: '560px', textAlign: 'center' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--csl-text-primary)', margin: '0 0 8px 0' }}>
        {module} module coming soon
      </h2>
      <p style={{ fontSize: '13.5px', color: 'var(--csl-text-muted)', margin: 0 }}>
        This section is not available yet.
      </p>
    </div>
  );
}
