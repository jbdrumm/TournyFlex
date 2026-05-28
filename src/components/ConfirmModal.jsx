import { useState, useCallback, createContext, useContext } from 'react'

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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 20px',
        }}>
          <div style={{
            background: 'var(--green-dark)',
            border: `1px solid ${modal.danger ? 'rgba(214,69,69,0.5)' : 'var(--green-mid)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '24px 20px',
            maxWidth: 320, width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {modal.title && (
              <p style={{
                fontWeight: 700, fontSize: '1rem',
                color: modal.danger ? '#ff6b6b' : 'var(--cream)',
                marginBottom: 10, lineHeight: 1.3,
              }}>{modal.title}</p>
            )}
            {modal.message && (
              <p style={{
                fontSize: '0.875rem', color: 'var(--gray-300)',
                marginBottom: 20, lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}>{modal.message}</p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => handleClose(false)} style={{
                padding: '9px 20px', border: '1px solid var(--green-mid)',
                borderRadius: 'var(--radius)', background: 'transparent',
                color: 'var(--gray-300)', fontFamily: 'var(--font-body)',
                fontSize: '0.875rem', cursor: 'pointer',
              }}>{modal.cancel}</button>
              <button onClick={() => handleClose(true)} style={{
                padding: '9px 20px', border: 'none',
                borderRadius: 'var(--radius)',
                background: modal.danger ? '#c44' : 'var(--gold)',
                color: modal.danger ? 'white' : 'var(--green-deep)',
                fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                fontWeight: 600, cursor: 'pointer',
              }}>{modal.ok}</button>
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
