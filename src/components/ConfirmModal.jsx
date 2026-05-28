import { useState, useCallback, createContext, useContext, useEffect } from 'react'

const ConfirmContext = createContext(null)

export function ConfirmModalProvider({ children }) {
  const [modal, setModal] = useState(null)

  const confirm = useCallback(({ title, message, ok = 'OK', cancel = 'Cancel', danger = false } = {}) => {
    return new Promise((resolve) => {
      setModal({ title, message, ok, cancel, danger, resolve })
    })
  }, [])

  const handleClose = (result) => {
    if (modal?.resolve) modal.resolve(result)
    setModal(null)
  }

  // Rise with keyboard on mobile
  const [viewportBottom, setViewportBottom] = useState(0)
  useEffect(() => {
    function update() {
      const vv = window.visualViewport
      if (!vv) return
      setViewportBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)))
    }
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    update()
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) handleClose(false) }}
        >
          <style>{`@keyframes cfSlideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div style={isMobile ? {
            position: 'fixed', left: 0, right: 0,
            bottom: viewportBottom,
            background: 'var(--green-dark)',
            borderTop: `2px solid ${modal.danger ? '#c44' : 'var(--green-mid)'}`,
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px 36px',
            boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
            animation: 'cfSlideUp 0.22s ease',
            transition: 'bottom 0.15s ease',
          } : {
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--green-dark)',
            border: `1px solid ${modal.danger ? '#c44' : 'var(--green-mid)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '24px 20px',
            maxWidth: 320, width: 'calc(100% - 40px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'cfSlideUp 0.2s ease',
          }}>
            {/* Drag handle — mobile only */}
            {isMobile && (
              <div style={{ width: 36, height: 4, background: 'var(--green-mid)', borderRadius: 4, margin: '0 auto 20px' }} />
            )}

            {modal.title && (
              <p style={{ fontWeight: 700, fontSize: '1rem', color: modal.danger ? '#ff6b6b' : 'var(--cream)', marginBottom: 8, lineHeight: 1.3 }}>
                {modal.title}
              </p>
            )}
            {modal.message && (
              <p style={{ fontSize: '0.875rem', color: 'var(--gray-300)', marginBottom: 24, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {modal.message}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {/* KEY: onMouseDown + preventDefault so keyboard doesn't collapse before tap registers */}
              <button
                onMouseDown={e => { e.preventDefault(); handleClose(false) }}
                onTouchStart={e => { e.preventDefault(); handleClose(false) }}
                style={{ flex: 1, padding: '11px', border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--gray-300)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', cursor: 'pointer' }}>
                {modal.cancel}
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); handleClose(true) }}
                onTouchStart={e => { e.preventDefault(); handleClose(true) }}
                style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 'var(--radius)', background: modal.danger ? '#c44' : 'var(--gold)', color: modal.danger ? 'white' : 'var(--green-deep)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                {modal.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used within ConfirmModalProvider')
  return { confirm }
}
