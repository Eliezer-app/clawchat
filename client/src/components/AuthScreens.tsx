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
  let inputRef: HTMLInputElement | undefined;
  let errorRef: HTMLDivElement | undefined;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const token = inputRef?.value?.trim();
    if (!token) return;

    if (errorRef) errorRef.textContent = '';

    try {
      const res = await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`);
      if (res.ok || res.redirected) {
        window.location.href = '/';
      } else {
        const data = await res.json();
        if (errorRef) errorRef.textContent = data.error || 'Invalid token';
      }
    } catch {
      if (errorRef) errorRef.textContent = 'Connection error';
    }
  };

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
          Enter your invite token below.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Invite token"
            required
            autofocus
            style={{
              padding: '12px',
              border: 'none',
              'border-radius': '8px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              'font-size': '16px',
              'text-align': 'center',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '12px',
              border: 'none',
              'border-radius': '8px',
              background: 'white',
              color: '#667eea',
              'font-size': '16px',
              'font-weight': '600',
              cursor: 'pointer',
            }}
          >
            Join
          </button>
          <div ref={errorRef} style={{ color: '#ff6b6b', 'font-size': '14px', 'min-height': '20px' }} />
        </form>
        <div style={{ 'font-size': '13px', opacity: 0.7, 'margin-top': '12px' }}>
          Ask the admin for an invite token or scan a QR code.
        </div>
      </div>
    </div>
  );
}
