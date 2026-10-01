import type { ReactNode } from 'react'
import { REASONING_LEVELS, readReasoningLevels, toggleReasoningLevel } from './model-reasoning.ts'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'

export function ModelReasoningLevels(props: {
  model: DeepSeekModelDraft
  position: number
  disabled: boolean
  t: (key: ModelsKey) => string
  onChange: (model: DeepSeekModelDraft) => void
}): ReactNode {
  const selected = readReasoningLevels(props.model)
  return (
    <fieldset className={styles['modelInputTypes']} aria-label={`${props.t('modelReasoningLevels')} ${String(props.position)}`}>
      <legend className={styles['modelFieldLabel']}>{props.t('modelReasoningLevels')}</legend>
      <div className={styles['reasoningChoices']}>
        <span className={styles['reasoningDefault']}>Default</span>
        {REASONING_LEVELS.map(level => (
          <label key={level} className={styles['reasoningChoice']}>
            <input type="checkbox" checked={selected !== 'invalid' && selected.includes(level)}
              disabled={props.disabled || selected === 'invalid'}
              onChange={event => { props.onChange(toggleReasoningLevel(props.model, level, event.target.checked)) }} />
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </label>
        ))}
      </div>
      <p className={styles['modelFieldHint']}>{props.t('modelReasoningHint')}</p>
      {selected === 'invalid' ? <p className={styles['error']}>{props.t('modelReasoningInvalid')}</p> : null}
    </fieldset>
  )
}
