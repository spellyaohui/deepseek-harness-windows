const REQUIRED_DEPENDENCIES = [
  'controller',
  'useSnapshot',
  'api',
  'schema',
  't',
  'renderSlot',
  'normalizeProviderProfile',
] as const

type RequiredDependency = typeof REQUIRED_DEPENDENCIES[number]
type WithPresentDependencies<T extends Partial<Record<RequiredDependency, unknown>>> = T & {
  [Key in RequiredDependency]-?: Exclude<T[Key], undefined>
}


export function modelsSectionDependenciesReady<
  T extends Partial<Record<RequiredDependency, unknown>>,
>(value: T): value is WithPresentDependencies<T> {
  return REQUIRED_DEPENDENCIES.every(key => value[key] !== undefined)
}
