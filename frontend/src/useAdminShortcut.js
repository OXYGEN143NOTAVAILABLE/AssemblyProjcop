import { useEffect } from 'react'

// Keeps the existing hidden Shift + A + D shortcut to the admin login.
export default function useAdminShortcut() {
  useEffect(() => {
    const keys = new Set()
    const down = (e) => {
      keys.add(e.key.toLowerCase())
      if (e.shiftKey && keys.has('a') && keys.has('d')) {
        window.location.href = '/admin/login?back=' + window.location.pathname
      }
    }
    const up = (e) => keys.delete(e.key.toLowerCase())
    document.addEventListener('keydown', down)
    document.addEventListener('keyup', up)
    return () => {
      document.removeEventListener('keydown', down)
      document.removeEventListener('keyup', up)
    }
  }, [])
}
