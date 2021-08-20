import * as React from 'react'
import * as Label from '@radix-ui/react-label'
import { Root, Indicator, CheckboxOwnProps } from '@radix-ui/react-checkbox'
import styles from './checkbox.module.css'

interface CheckboxProps extends CheckboxOwnProps {
  name: string
}

export function Checkbox(props: CheckboxProps) {
  return (
    <>
      <Label.Root htmlFor={props.name}>{props.name}</Label.Root>
      <Root {...props} className={styles.root}>
        <Indicator className={styles.indicator} />
      </Root>
      <div />
    </>
  )
}
