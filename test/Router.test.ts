import test from 'ava';
import {Context, Middleware, Next} from 'koa';

import {Router, SpecialMethod} from '../lib/Router';

let router = new Router();

type MethodsWithHelpers = 'CONNECT' | 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT' | 'TRACE';

async function simulate(method: MethodsWithHelpers, path: string, shouldMatch = true): Promise<string | undefined> {
	const context = {
		path,
		method,
		body: undefined as (string | undefined),
		status: 200,
	};

	let matched = true;

	await router.middleware()(context as any, async () => {
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
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/api', 0, append('MIDDLEWARE 0 /api'));
	router.addMiddleware('GET', '/api/user', 0, append('GET 0 /api/user', true));
	router.addMiddleware('GET', '/about', 0, append('GET 0 /about', true));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, '/', 0, append('MIDDLEWARE_EXACT 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /');
	t.is(await simulate('GET', '/api/user'), 'MIDDLEWARE 0 /:MIDDLEWARE 0 /api:GET 0 /api/user');
	t.is(await simulate('GET', '/about'), 'MIDDLEWARE 0 /:GET 0 /about');
	t.is(await simulate('GET', '/wrong', false), 'MIDDLEWARE 0 /');
});

test.serial('routes to the correct path', async (t) => {
	router.addMiddleware('GET', '/api/user', 0, append('GET 0 /api/user', true));
	router.addMiddleware('GET', '/about', 0, append('GET 0 /about', true));
	router.addMiddleware('GET', '/home', 0, append('GET 0 /home', true));

	t.is(await simulate('GET', '/api/user'), 'GET 0 /api/user');
	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('GET', '/home'), 'GET 0 /home');
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('routes to the correct method', async (t) => {
	router.addMiddleware('GET', '/api/user', 0, append('GET 0 /api/user', true));
	router.addMiddleware('POST', '/api/user', 0, append('POST 0 /api/user', true));
	router.addMiddleware('GET', '/about', 0, append('GET 0 /about', true));

	t.is(await simulate('GET', '/api/user'), 'GET 0 /api/user');
	t.is(await simulate('POST', '/api/user'), 'POST 0 /api/user');
	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('POST', '/about', false), undefined);
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('routes according to stage order', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 10, append('MIDDLEWARE 10 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', -5, append('MIDDLEWARE -5 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 5, append('MIDDLEWARE 5 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, '/', 0, append('MIDDLEWARE_EXACT 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE -5 /:MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /:MIDDLEWARE 5 /:MIDDLEWARE 10 /');
});

test.serial('routes through special methods in order', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, '/', 0, append('MIDDLEWARE_EXACT 0 /'));
	router.addMiddleware('GET', '/', 0, append('GET 0 /'));
	router.addMiddleware(SpecialMethod.ALL, '/', 0, append('ANY 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:MIDDLEWARE_EXACT 0 /:GET 0 /:ANY 0 /');
});

test.serial('should recognize significance of trailing slashes in routes', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/api', 0, append('MIDDLEWARE 0 /api'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/api/', 0, append('MIDDLEWARE 0 /api/'));
	router.addMiddleware('GET', '/api/user', 0, append('GET 0 /api/user', true));

	t.is(await simulate('GET', '/api', false), 'MIDDLEWARE 0 /api');
	t.is(await simulate('GET', '/api/', false), 'MIDDLEWARE 0 /api:MIDDLEWARE 0 /api/');
	t.is(await simulate('GET', '/api/user'), 'MIDDLEWARE 0 /api:MIDDLEWARE 0 /api/:GET 0 /api/user');
});

test.serial('should respect both values for the strictSlashes option', async (t) => {
	router.addMiddleware('GET', '/about', 0, append('GET 0 /about', true));
	router.addMiddleware('GET', '/shop/', 0, append('GET 0 /shop/', true));

	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('GET', '/about/'), 'GET 0 /about');
	t.is(await simulate('GET', '/shop', false), undefined);
	t.is(await simulate('GET', '/shop/'), 'GET 0 /shop/');

	router = new Router({
		strictSlashes: true,
	});

	router.addMiddleware('GET', '/about', 0, append('GET 0 /about', true));
	router.addMiddleware('GET', '/shop/', 0, append('GET 0 /shop/', true));

	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('GET', '/about/', false), undefined);
	t.is(await simulate('GET', '/shop', false), undefined);
	t.is(await simulate('GET', '/shop/'), 'GET 0 /shop/');
});

test.serial('method helpers should add middleware', async (t) => {
	router.all('/all', append('ALL 0 /all', true));
	router.connect('/', append('CONNECT 0 /', true));
	router.delete('/', append('DELETE 0 /', true));
	router.del('/alias/del', append('DEL 0 /', true));
	router.get('/', append('GET 0 /', true));
	router.head('/', append('HEAD 0 /', true));
	router.options('/', append('OPTIONS 0 /', true));
	router.patch('/', append('PATCH 0 /', true));
	router.post('/', append('POST 0 /', true));
	router.put('/', append('PUT 0 /', true));
	router.trace('/', append('TRACE 0 /', true));

	t.is(await simulate('GET', '/all'), 'ALL 0 /all');
	t.is(await simulate('POST', '/all'), 'ALL 0 /all');
	t.is(await simulate('CONNECT', '/'), 'CONNECT 0 /');
	t.is(await simulate('DELETE', '/'), 'DELETE 0 /');
	t.is(await simulate('DELETE', '/alias/del'), 'DEL 0 /');
	t.is(await simulate('GET', '/'), 'GET 0 /');
	t.is(await simulate('HEAD', '/'), 'HEAD 0 /');
	t.is(await simulate('OPTIONS', '/'), 'OPTIONS 0 /');
	t.is(await simulate('PATCH', '/'), 'PATCH 0 /');
	t.is(await simulate('POST', '/'), 'POST 0 /');
	t.is(await simulate('PUT', '/'), 'PUT 0 /');
	t.is(await simulate('TRACE', '/'), 'TRACE 0 /');
});

test.serial('method helpers should add middleware with correct stages', async (t) => {
	router.get('/', append('MIDDLEWARE_EXACT 0 /'), append('GET 0 /', true));
	router.use('/*', -5, append('MIDDLEWARE -5 /*'));
	router.use('/*', 5, append('MIDDLEWARE 5 /*'));

	t.is(await simulate('GET', '/'), 'MIDDLEWARE -5 /*:MIDDLEWARE_EXACT 0 /:MIDDLEWARE 5 /*:GET 0 /');
});

test.serial('use() should add middleware and handle the wildcard', async (t) => {
	router.use('/', append('USE 0 /'));
	router.use('/*', append('USE 0 /*'));
	router.use('/test*', append('USE 0 /test*'));
	router.get('/', append('GET 0 /', true));
	router.get('/test', append('GET 0 /test', true));

	t.is(await simulate('GET', '/'), 'USE 0 /*:USE 0 /:GET 0 /');
	t.is(await simulate('GET', '/test'), 'USE 0 /*:USE 0 /test*:GET 0 /test');
	t.is(await simulate('GET', '/test/hello', false), 'USE 0 /*:USE 0 /test*');
});

test.serial('use(\'/*\') (with a wildcard) should attach all middleware as not exact', async (t) => {
	router.use('/*', append('USE1 0 /*'), append('USE2 0 /*'));
	router.get('/test', append('GET 0 /test', true));

	t.is(await simulate('GET', '/test'), 'USE1 0 /*:USE2 0 /*:GET 0 /test');
});

test.serial('use(\'/\') (without a wildcard) should attach all middleware as exact', async (t) => {
	router.use('/', append('USE1 0 /'), append('USE2 0 /'));
	router.get('/test', append('GET 0 /test', true));

	t.is(await simulate('GET', '/test'), 'GET 0 /test');
	t.is(await simulate('GET', '/', false), 'USE1 0 /:USE2 0 /');
});

test.serial('HEAD requests should be redirected to GET if needed', async (t) => {
	router.get('/home', append('GET 0 /home', true));
	router.head('/api', append('HEAD 0 /api', true));
	router.get('/api', append('GET 0 /api', true));
	router.head('/shop', append('HEAD 0 /shop'));
	router.get('/shop', append('GET 0 /shop', true));

	t.is(await simulate('HEAD', '/home'), 'GET 0 /home');
	t.is(await simulate('HEAD', '/api'), 'HEAD 0 /api');
	t.is(await simulate('GET', '/api'), 'GET 0 /api');
	t.is(await simulate('HEAD', '/shop'), 'HEAD 0 /shop:GET 0 /shop');
	t.is(await simulate('GET', '/shop'), 'GET 0 /shop');
});

test('supports custom context and state types', async (t) => {
	function expect<T>(arg: T) {
		void arg;
	}

	function typeExtends<E, T extends E>() {}

	interface CustomState {
		numberProp: number;
	}

	interface CustomContext {
		booleanProp: boolean;
	}

	const customRouter = new Router<CustomState, CustomContext>();

	customRouter.addMiddleware('GET', '/', 0, (ctx) => {
		expect<boolean>(ctx.booleanProp);
		// @ts-expect-error
		expect(ctx.bad);

		expect<number>(ctx.state.numberProp);
		// @ts-expect-error
		expect(ctx.state.bad);
	});

	type MiddlewareType = Parameters<ReturnType<typeof customRouter.middleware>>[0];
	typeExtends<boolean, MiddlewareType['booleanProp']>();
	typeExtends<number, MiddlewareType['state']['numberProp']>();

	t.pass();
});
