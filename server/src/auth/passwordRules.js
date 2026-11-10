const PASSWORD_RULES = [
  { id: 'length', label: 'At least 10 characters', test: (value) => value.length >= 10 },
  { id: 'upper', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { id: 'symbol', label: 'One symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
  { id: 'max', label: '200 characters or fewer', test: (value) => value.length <= 200 },
];

function passwordProblems(password) {
  const value = typeof password === 'string' ? password : '';
  return PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => ({
    field: 'password',
    rule: rule.id,
    message: rule.label,
  }));
}

function isStrongPassword(password) {
  return passwordProblems(password).length === 0;
}

module.exports = { PASSWORD_RULES, passwordProblems, isStrongPassword };
