export function AuthChecking() {
  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      'font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ 'text-align': 'center' }}>
        <div style={{ 'font-size': '48px', 'margin-bottom': '16px' }}>🔐</div>
        <div style={{ 'font-size': '18px', opacity: 0.9 }}>Checking authentication...</div>
      </div>
    </div>
  );
}

export function AuthLocked() {
  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      'font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        'text-align': 'center',
        'max-width': '400px',
        background: 'rgba(255,255,255,0.1)',
        padding: '40px',
        'border-radius': '20px',
        'backdrop-filter': 'blur(10px)',
      }}>
        <div style={{ 'font-size': '64px', 'margin-bottom': '20px' }}>🔒</div>
        <h1 style={{ 'font-size': '24px', 'margin-bottom': '12px', 'font-weight': '600' }}>
          ClawChat
        </h1>
        <p style={{ 'font-size': '16px', opacity: 0.9, 'line-height': '1.5', 'margin-bottom': '24px' }}>
          This chat is invite-only.<br />
          Ask the admin for an invite link or scan a QR code.
        </p>
        <div style={{ 'font-size': '13px', opacity: 0.7 }}>
          Run <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', 'border-radius': '4px' }}>pnpm invite</code> on the server to generate an invite.
        </div>
      </div>
    </div>
  );
}
