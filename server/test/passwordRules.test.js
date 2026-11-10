const { PASSWORD_RULES, passwordProblems, isStrongPassword } = require('../src/auth/passwordRules');

describe('password rules', () => {
  it('lists the rules the UI shows to people', () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual(['length', 'upper', 'lower', 'number', 'symbol', 'max']);
  });

  it('accepts a password that meets every rule', () => {
    expect(passwordProblems('Sup3rSecret!')).toEqual([]);
    expect(isStrongPassword('Sup3rSecret!')).toBe(true);
  });

  it('reports every missing rule for a weak password', () => {
    const problems = passwordProblems('abc');
    expect(problems.map((problem) => problem.rule)).toEqual(['length', 'upper', 'number', 'symbol']);
    expect(problems.every((problem) => problem.field === 'password')).toBe(true);
  });

  it('requires a number, a symbol and mixed case', () => {
    expect(passwordProblems('longenoughbutweak').map((problem) => problem.rule)).toEqual(['upper', 'number', 'symbol']);
    expect(passwordProblems('LONGENOUGH1!').map((problem) => problem.rule)).toEqual(['lower']);
    expect(passwordProblems('lowercase1!').map((problem) => problem.rule)).toEqual(['upper']);
  });

  it('rejects passwords longer than 200 characters', () => {
    expect(passwordProblems(`Aa1!${'x'.repeat(200)}`).map((problem) => problem.rule)).toEqual(['max']);
  });

  it('treats non-string input as an empty password', () => {
    expect(passwordProblems(null).map((problem) => problem.rule)).toEqual(['length', 'upper', 'lower', 'number', 'symbol']);
    expect(passwordProblems(undefined).length).toBe(5);
  });
});
