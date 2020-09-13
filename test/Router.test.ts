import * as assert from 'assert';
import {Context, Middleware, Next} from 'koa';
import 'mocha';

import {Router, SpecialMethod} from '../lib/Router';

describe('Router', () => {
	let router: Router = new Router();

	async function simulate(method: 'GET' | 'HEAD' | 'POST', path: string, shouldMatch = true): Promise<string | undefined> {
		const context = {
			path,
			method,
			body: undefined as (string | undefined),
			status: 200,
		};

		let matched = true;

		await router.middlewareHandler(context as any, async () => {
			matched = false;
		});

		if (shouldMatch && !matched) assert.fail('Router did not match when it should');
		if (!shouldMatch && matched) assert.fail('Router matched when it should not');

		return context.body;
	}

	function append(str: string, last = false): Middleware {
		return (ctx: Context, next: Next) => {
			ctx.body = (ctx.body ? `${ctx.body}:` : '') + str;

			if (!last) return next();
			return Promise.resolve();
		};
	}

	beforeEach(() => {
		router = new Router();
	});

	it('routes through the correct middleware', async () => {
		router.addMiddleware('/api', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /api'));
		router.addMiddleware('/api/user', 'GET', 0, append('GET 0 /api/user', true));
		router.addMiddleware('/about', 'GET', 0, append('GET 0 /about', true));
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /'));
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE_EXACT, 0, append('MIDDLEWARE_EXACT 0 /'));

		assert.strictEqual(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /');
		assert.strictEqual(await simulate('GET', '/api/user'), 'MIDDLEWARE 0 /:MIDDLEWARE 0 /api:GET 0 /api/user');
		assert.strictEqual(await simulate('GET', '/about'), 'MIDDLEWARE 0 /:GET 0 /about');
		// FIXME: what should happen if the request matches with a shorter path? should it still call middleware that matches up to a certain point?
		assert.strictEqual(await simulate('GET', '/wrong', false), undefined);
	});

	it('routes to the correct path', async () => {
		router.addMiddleware('/api/user', 'GET', 0, append('GET 0 /api/user', true));
		router.addMiddleware('/about', 'GET', 0, append('GET 0 /about', true));
		router.addMiddleware('/home', 'GET', 0, append('GET 0 /home', true));

		assert.strictEqual(await simulate('GET', '/api/user'), 'GET 0 /api/user');
		assert.strictEqual(await simulate('GET', '/about'), 'GET 0 /about');
		assert.strictEqual(await simulate('GET', '/home'), 'GET 0 /home');
		assert.strictEqual(await simulate('GET', '/wrong', false), undefined);
	});

	it('routes to the correct method', async () => {
		router.addMiddleware('/api/user', 'GET', 0, append('GET 0 /api/user', true));
		router.addMiddleware('/api/user', 'POST', 0, append('POST 0 /api/user', true));
		router.addMiddleware('/about', 'GET', 0, append('GET 0 /about', true));

		assert.strictEqual(await simulate('GET', '/api/user'), 'GET 0 /api/user');
		assert.strictEqual(await simulate('POST', '/api/user'), 'POST 0 /api/user');
		assert.strictEqual(await simulate('GET', '/about'), 'GET 0 /about');
		assert.strictEqual(await simulate('POST', '/about', false), undefined);
		assert.strictEqual(await simulate('GET', '/wrong', false), undefined);
	});

	it('routes according to stage order', async () => {
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /'));
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE, -5, append('MIDDLEWARE -5 /'));
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 5, append('MIDDLEWARE 5 /'));

		assert.strictEqual(await simulate('GET', '/', false), 'MIDDLEWARE -5 /:MIDDLEWARE 0 /:MIDDLEWARE 5 /');
	});

	it('routes through special methods in order', async () => {
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /'));
		router.addMiddleware('/', SpecialMethod.MIDDLEWARE_EXACT, 0, append('MIDDLEWARE_EXACT 0 /'));
		router.addMiddleware('/', 'GET', 0, append('GET 0 /'));
		router.addMiddleware('/', SpecialMethod.ANY, 0, append('ANY 0 /'));

		assert.strictEqual(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /:GET 0 /:ANY 0 /');
	});
});
