import test from 'ava';
import {Context, Middleware, Next} from 'koa';

import {Router, SpecialMethod} from '../lib/Router';

let router = new Router();

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

	if (shouldMatch && !matched) throw new Error('Router did not match when it should');
	if (!shouldMatch && matched) throw new Error('Router matched when it should not');

	return context.body;
};

function append(str: string, last = false): Middleware {
	return (ctx: Context, next: Next) => {
		ctx.body = (ctx.body ? `${ctx.body}:` : '') + str;

		if (!last) return next();
		return Promise.resolve();
	};
}

test.beforeEach(() => {
	router = new Router();
});

test.serial('routes through the correct middleware', async (t) => {
	router.addMiddleware('/api', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /api'));
	router.addMiddleware('/api/user', 'GET', 0, append('GET 0 /api/user', true));
	router.addMiddleware('/about', 'GET', 0, append('GET 0 /about', true));
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE_EXACT, 0, append('MIDDLEWARE_EXACT 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /');
	t.is(await simulate('GET', '/api/user'), 'MIDDLEWARE 0 /:MIDDLEWARE 0 /api:GET 0 /api/user');
	t.is(await simulate('GET', '/about'), 'MIDDLEWARE 0 /:GET 0 /about');
	// FIXME: what should happen if the request matches with a shorter path? should it still call middleware that matches up to a certain point?
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('routes to the correct path', async (t) => {
	router.addMiddleware('/api/user', 'GET', 0, append('GET 0 /api/user', true));
	router.addMiddleware('/about', 'GET', 0, append('GET 0 /about', true));
	router.addMiddleware('/home', 'GET', 0, append('GET 0 /home', true));

	t.is(await simulate('GET', '/api/user'), 'GET 0 /api/user');
	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('GET', '/home'), 'GET 0 /home');
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('routes to the correct method', async (t) => {
	router.addMiddleware('/api/user', 'GET', 0, append('GET 0 /api/user', true));
	router.addMiddleware('/api/user', 'POST', 0, append('POST 0 /api/user', true));
	router.addMiddleware('/about', 'GET', 0, append('GET 0 /about', true));

	t.is(await simulate('GET', '/api/user'), 'GET 0 /api/user');
	t.is(await simulate('POST', '/api/user'), 'POST 0 /api/user');
	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('POST', '/about', false), undefined);
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('routes according to stage order', async (t) => {
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE, -5, append('MIDDLEWARE -5 /'));
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 5, append('MIDDLEWARE 5 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE -5 /:MIDDLEWARE 0 /:MIDDLEWARE 5 /');
});

test.serial('routes through special methods in order', async (t) => {
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE, 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware('/', SpecialMethod.MIDDLEWARE_EXACT, 0, append('MIDDLEWARE_EXACT 0 /'));
	router.addMiddleware('/', 'GET', 0, append('GET 0 /'));
	router.addMiddleware('/', SpecialMethod.ANY, 0, append('ANY 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /:GET 0 /:ANY 0 /');
});
