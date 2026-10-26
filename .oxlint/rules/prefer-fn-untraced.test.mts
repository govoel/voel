import { Array } from 'effect';
import { RuleTester } from 'oxlint/plugins-dev';

import { preferFnUntracedRule } from './prefer-fn-untraced.mts';

const filename = `${import.meta.dirname}/../../packages/effect-turso/src/domain/models.ts`;

new RuleTester().run('prefer-fn-untraced', preferFnUntracedRule, {
  valid: Array.map(
    [
      'const program = Effect.gen(function* () { return 1 })',
      'const run = Effect.fnUntraced(function* (value: string) { return value })',
      'const run = () => Effect.succeed(1)',
      'const run = () => Other.gen(function* () { return 1 })',
      'const run = () => Effect.scoped(Effect.gen(function* () { return 1 }))',
      'const run = () => { prepare(); return Effect.gen(function* () { return 1 }) }',
      'const run = async () => Effect.gen(function* () { return 1 })',
      'const run = () => ({ effect: Effect.gen(function* () { return 1 }) })',
      'const run = () => Effect.gen(function* () { return 1 }).custom()',
      'const run = () => { return }',
      'const run = () => {}',
    ],
    (code) => ({ filename, code })
  ),
  invalid: Array.map(
    [
      'const run = () => Effect.gen(function* () { return 1 })',
      'const run = (value: string) => Effect.gen(function* () { return value })',
      'const run = <A>(value: A) => Effect.gen(function* () { return value })',
      'register((value) => Effect.gen(function* () { return value }))',
      'const run = () => Effect.gen(function* () { return 1 }).pipe(Effect.orDie)',
      'const run = () => Effect.gen(function* () { return 1 }).pipe(first).pipe(second)',
      'const run = () => (Effect.gen(function* () { return 1 }) as Effect.Effect<number>)',
      'const run = () => (Effect.gen(function* () { return 1 }) satisfies Effect.Effect<number>)',
      'const run = () => { return Effect.gen(function* () { return 1 }) }',
      'const run = () => { return Effect.gen(function* () { return 1 }).pipe(Effect.orDie) }',
    ],
    (code) => ({
      filename,
      code,
      errors: [
        {
          message: 'Use Effect.fnUntraced instead of an arrow function returning Effect.gen.',
          type: 'ArrowFunctionExpression',
        },
      ],
    })
  ),
});
