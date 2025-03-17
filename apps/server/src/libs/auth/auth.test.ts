import axios, { type AxiosInstance } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { CookieJar } from 'tough-cookie';

describe('better-auth customizations', () => {
  let api: AxiosInstance;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { default: app } = await import('@/index');
    Bun.serve(app);
    const { bunDb } = await import('@/libs/db');

    const files = await readdir('src/libs/db/migrations');
    for (const file of files) {
      if (file !== 'atlas.sum') {
        console.log(`Running migration ${file} in database`);
        bunDb.exec(await Bun.file(`src/libs/db/migrations/${file}`).text());
      }
    }
  });

  beforeEach(async () => {
    const jar = new CookieJar();

    api = axios.create({
      baseURL: 'http://localhost:3000',
      withCredentials: true,
      validateStatus: () => true,
    });

    api.interceptors.response.use((response) => {
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        cookies.forEach((cookie: string) => {
          jar.setCookieSync(cookie, `${response.config.baseURL}${response.config.url}`);
        });
      }
      return response;
    });

    api.interceptors.request.use((config) => {
      const cookies = jar.getCookiesSync(`${config.baseURL}${config.url}`);
      const cookieHeader = cookies.map((cookie) => cookie.cookieString()).join('; ');

      if (cookieHeader) {
        config.headers = config.headers || {};
        config.headers.Cookie = cookieHeader;
      }

      return config;
    });
  });

  afterEach(async () => {
    const { bunDb } = await import('@/libs/db');
    bunDb.exec('DELETE FROM user');
    bunDb.exec('DELETE FROM account');
    bunDb.exec('DELETE FROM session');
    bunDb.exec('DELETE FROM verification');
  });

  it('should not allow sign up when username is missing', async () => {
    const response = await api.post('/api/auth/sign-up/email', {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password',
    });

    expect(response.status).toBe(400);
    expect(response.data.code).toBe('MUST_SIGN_UP_WITH_USERNAME');
  });

  it('should not allow sign in with email', async () => {
    let response = await api.post('/api/auth/sign-up/email', {
      name: 'Test User',
      username: 'test',
      email: 'test@example.com',
      password: 'password',
    });
    expect(response.status).toBe(200);
    expect(response.data.user.name).toBe('Test User');
    expect(response.data.user.email).toBe('test@example.com');
    expect(response.data.user.id).toBeDefined();

    response = await api.post('/api/auth/sign-in/email', {
      email: 'test@example.com',
      password: 'password',
    });

    expect(response.status).toBe(400);
    expect(response.data.code).toBe('MUST_SIGN_IN_WITH_USERNAME');
  });

  it('should set role as admin when zero users exist', async () => {
    let response = await api.post('/api/auth/sign-up/email', {
      name: 'Test User',
      username: 'test',
      email: 'test@example.com',
      password: 'password',
    });

    expect(response.status).toBe(200);
    expect(response.data.user.name).toBe('Test User');
    expect(response.data.user.email).toBe('test@example.com');
    expect(response.data.user.id).toBeDefined();

    response = await api.post('/api/auth/sign-in/username', {
      username: 'test',
      password: 'password',
    });

    expect(response.status).toBe(200);
    expect(response.data.user.name).toBe('Test User');
    expect(response.data.user.email).toBe('test@example.com');
    expect(response.data.user.id).toBeDefined();

    response = await api.get('/api/auth/get-session');

    expect(response.status).toBe(200);
    expect(response.data.user.name).toBe('Test User');
    expect(response.data.user.email).toBe('test@example.com');
    expect(response.data.user.id).toBeDefined();
    expect(response.data.user.role).toBe('admin');
  });

  it('should not allow sign up when one user exists', async () => {
    let response = await api.post('/api/auth/sign-up/email', {
      name: 'Test User',
      username: 'test',
      email: 'test@example.com',
      password: 'password',
    });

    expect(response.status).toBe(200);
    expect(response.data.user.name).toBe('Test User');
    expect(response.data.user.email).toBe('test@example.com');
    expect(response.data.user.id).toBeDefined();

    response = await api.post('/api/auth/sign-up/email', {
      name: 'Test User 2',
      username: 'test2',
      email: 'test2@example.com',
      password: 'password',
    });

    expect(response.status).toBe(400);
    expect(response.data.code).toBe('EMAIL_AND_PASSWORD_SIGN_UP_IS_NOT_ENABLED');
  });
});
