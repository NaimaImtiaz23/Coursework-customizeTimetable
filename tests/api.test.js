import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, seedCatalog } from '../server/db.js';
import { createApp } from '../server/app.js';

test('proxy trust is limited to configured addresses', async (t) => {
  for (const trusted of [false, true]) {
    const db = openDatabase(':memory:');
    const app = createApp(db, { trustedProxies: trusted ? ['127.0.0.1/32'] : [] });
    app.get('/test-client-ip', (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/test-client-ip`, {
      headers: { 'X-Forwarded-For': '198.51.100.7' },
    });
    assert.equal((await response.json()).ip, trusted ? '198.51.100.7' : '127.0.0.1');
    if (trusted) assert.equal(app.get('trust proxy fn')('198.51.100.8'), false);
  }
});

test('authentication, CSRF, ownership, validation and logout', async (t) => {
  const db = openDatabase(':memory:');
  seedCatalog(db);
  const app = createApp(db, { origin: 'http://localhost:3000' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body, headers = {}) =>
    fetch(base + path, {
      method,
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal((await request('/registrations', 'POST', { sectionId: 1 })).status, 401);
  assert.equal(
    (
      await request('/auth/signup', 'POST', {
        name: 'Alex',
        email: 'a@example.test',
        password: 'short',
      })
    ).status,
    400,
  );
  const signedUp = await request('/auth/signup', 'POST', {
    name: 'Alex Morgan',
    email: 'a@example.test',
    password: 'a-long-test-password',
  });
  assert.equal(signedUp.status, 200);
  const setCookie = signedUp.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  const { csrf } = await signedUp.json();
  const headers = { Cookie: cookie, 'X-CSRF-Token': csrf };
  assert.equal(
    (await request('/registrations', 'POST', { sectionId: 1 }, { Cookie: cookie })).status,
    403,
  );
  assert.equal(
    (
      await request(
        '/registrations',
        'POST',
        { sectionId: 1 },
        { ...headers, Origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request('/registrations', 'POST', { sectionId: '1 OR 1=1' }, headers)).status,
    400,
  );
  assert.equal((await request('/registrations', 'POST', { sectionId: 1 }, headers)).status, 201);
  const me = await (await request('/me', 'GET', undefined, headers)).json();
  assert.equal(me.registrations.length, 1);
  assert.equal(me.user.password_hash, undefined);
  const other = await request('/auth/signup', 'POST', {
    name: 'Other Student',
    email: 'b@example.test',
    password: 'another-long-password',
  });
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  const otherCsrf = (await other.json()).csrf;
  assert.equal(
    (
      await request('/registrations/1', 'DELETE', undefined, {
        Cookie: otherCookie,
        'X-CSRF-Token': otherCsrf,
      })
    ).status,
    404,
  );
  assert.equal((await request('/auth/logout', 'POST', {}, headers)).status, 200);
  assert.equal((await request('/registrations', 'POST', { sectionId: 5 }, headers)).status, 401);
});

test('production does not expose demo authentication', async (t) => {
  const db = openDatabase(':memory:');
  seedCatalog(db);
  const server = createApp(db, { production: true }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/demo`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.notEqual(response.status, 200);
});
