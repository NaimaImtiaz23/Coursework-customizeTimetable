let csrf = '';

export function setCsrfToken(value) {
  csrf = value;
}

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server could not complete this request.' }));
  if (!response.ok) throw new Error(data.error || 'Please try again shortly.');
  return data;
}
