import React from 'react'

interface SkipToContentProps {
  targetId?: string
  label?: string
}

export function SkipToContent({
  targetId = 'main-content',
  label = 'Skip to content',
}: SkipToContentProps): React.ReactElement {
  const handleClick = (): void => {
    const target = document.getElementById(targetId)
    if (target) {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1')
      }
      target.focus({ preventScroll: false })
    }
  }

  return (
    <a href={`#${targetId}`} onClick={handleClick} className="skip-link">
      {label}
    </a>
  )
}
