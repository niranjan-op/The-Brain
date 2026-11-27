import * as React from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

interface PasswordInputProps
  extends Omit<React.ComponentProps<'input'>, 'type'> {
  startIcon?: React.ReactNode
  showLabel?: string
  hideLabel?: string
  groupClassName?: string
}

export function PasswordInput({
  startIcon,
  showLabel = 'Show password',
  hideLabel = 'Hide password',
  groupClassName,
  className,
  ...props
}: PasswordInputProps): React.ReactElement {
  const [visible, setVisible] = React.useState(false)

  return (
    <InputGroup className={cn('h-10 bg-muted/40', groupClassName)}>
      {startIcon && (
        <InputGroupAddon align="inline-start" className="pl-3">
          {startIcon}
        </InputGroupAddon>
      )}
      <InputGroupInput
        type={visible ? 'text' : 'password'}
        className={cn('h-10', className)}
        {...props}
      />
      <InputGroupAddon align="inline-end" className="pr-2">
        <InputGroupButton
          type="button"
          size="icon-xs"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          title={visible ? hideLabel : showLabel}
          className="text-muted-foreground hover:text-foreground"
        >
          {visible ? (
            <EyeOffIcon aria-hidden="true" />
          ) : (
            <EyeIcon aria-hidden="true" />
          )}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
