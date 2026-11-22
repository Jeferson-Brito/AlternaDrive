import { useEffect, useRef, useState } from 'react'

export function useDriverName() {
  const [selected, setSelected] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function show(id: string) {
    clearTimeout(timer.current)
    setSelected(id)
    timer.current = setTimeout(() => setSelected(undefined), 2500)
  }

  return { selected, show }
}
