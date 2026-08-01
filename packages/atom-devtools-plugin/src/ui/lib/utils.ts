export const cn = (...classNames: (string | false | null | undefined)[]): string =>
  classNames.filter((className): className is string => Boolean(className)).join(' ');
