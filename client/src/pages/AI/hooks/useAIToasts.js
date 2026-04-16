import { useCallback, useRef, useState } from 'react'

export function useAIToasts() {
  const [toasts, setToasts] = useState([])
  const toastRef = useRef(0)

  const addToast = useCallback((msg, type = 'success') => {
    const id = ++toastRef.current
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }, [])

  return { toasts, addToast }
}
