import test from 'ava';
import {Context, Middleware, Next} from 'koa';

import {Router, SpecialMethod} from '../lib/Router';

let router = new Router();

type MethodsWithHelpers = 'CONNECT' | 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT' | 'TRACE';

async function doSimulation(method: MethodsWithHelpers, path: string, nextMiddleware: Middleware): Promise<Context> {
	const context = {
		path,
		method,
		body: undefined as (string | undefined),
		status: 200,
	};

	await router.middleware()(context as any, async () => {
		await nextMiddleware(context as any, async () => {});
	});

	return context as any;
}

async function simulate(method: MethodsWithHelpers, path: string, shouldMatch = true, modifyOutput?: (context: any) => any): Promise<string | {message: string; body?: string;} | undefined> {
	let matched = true;

	const context = await doSimulation(method, path, async () => {
		matched = false;
	});

	if (shouldMatch && !matched) return {
		message: 'Router did not match when it should',
		body: context.body,
	};
	if (!shouldMatch && matched) return {
		message: 'Router matched when it should not',
		body: context.body,
	};

	return modifyOutput ? modifyOutput(context) : context.body;
}

let registeredAppends: Record<string, true> = {};
function append(str: string, last = false): Middleware {
	if (registeredAppends[str]) throw new Error('Duplicate name for an append()');
	registeredAppends[str] = true;

	return (ctx: Context, next: Next) => {
		const toAppend = !ctx.params ? str : Object.entries(ctx.params).reduce((acc, [name, value]) => acc.replace(`:${name}`, `${value}:${name}`), str);
		ctx.body = (ctx.body ? `${ctx.body}:` : '') + toAppend;

		if (!last) return next();
		return Promise.resolve();
	};
}

test.beforeEach(() => {
	router = new Router();
	registeredAppends = {};
});

test.serial('routes through the correct middleware', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/api', 0, append('MIDDLEWARE 0 /api'));
	router.addMiddleware('GET', '/about', 0, append('GET 0 /about'));
	router.addTerminator('GET', '/about', 0, append('GET.T 0 /about', true));
	router.addMiddleware('GET', '/api/user', 0, append('GET 0 /api/user'));
	router.addTerminator('GET', '/api/user', 0, append('GET.T 0 /api/user', true));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE 0 /'));
	router.addTerminator(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE.T 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE 0 /');
	t.is(await simulate('GET', '/api/user'), 'MIDDLEWARE 0 /:MIDDLEWARE 0 /api:MIDDLEWARE.T 0 /:GET 0 /api/user:GET.T 0 /api/user');
	t.is(await simulate('GET', '/about'), 'MIDDLEWARE 0 /:MIDDLEWARE.T 0 /:GET 0 /about:GET.T 0 /about');
	t.is(await simulate('GET', '/wrong', false), 'MIDDLEWARE 0 /');
});

test.serial('routes to the correct terminator based on path', async (t) => {
	router.addTerminator('GET', '/api/user', 0, append('GET 0 /api/user', true));
	router.addTerminator('GET', '/about', 0, append('GET 0 /about', true));
	router.addTerminator('GET', '/home', 0, append('GET 0 /home', true));

	t.is(await simulate('GET', '/api/user'), 'GET 0 /api/user');
	t.is(await simulate('GET', '/about'), 'GET 0 /about');
	t.is(await simulate('GET', '/home'), 'GET 0 /home');
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('calling next() should fall through to the next terminator', async (t) => {
	router.addTerminator('GET', '/', 0, append('GET.T1 0 /'), append('GET.T2 0 /'));
	router.addTerminator(SpecialMethod.ALL, '/', 0, append('ALL.T1 0 /'), append('ALL.T2 0 /', true));

	t.is(await simulate('GET', '/'), 'GET.T1 0 /:GET.T2 0 /:ALL.T1 0 /:ALL.T2 0 /');
	t.is(await simulate('POST', '/'), 'ALL.T1 0 /:ALL.T2 0 /');
});

test.serial('terminators should not be called unless next() is called', async (t) => {
	router.addTerminator('GET', '/', 0, append('GET.T1 0 /'), append('GET.T2 0 /', true), append('GET.T3 0 /', true));
	router.addTerminator(SpecialMethod.ALL, '/', 0, append('ALL.T1 0 /'), append('ALL.T2 0 /', true), append('ALL.T3 0 /', true));

	t.is(await simulate('GET', '/'), 'GET.T1 0 /:GET.T2 0 /');
	t.is(await simulate('POST', '/'), 'ALL.T1 0 /:ALL.T2 0 /');
});

test.serial('routes to the correct method terminator based on path', async (t) => {
	router.addTerminator('GET', '/api/user', 0, append('GET.T 0 /api/user', true));
	router.addTerminator('POST', '/api/user', 0, append('POST.T 0 /api/user', true));
	router.addTerminator('GET', '/about', 0, append('GET.T 0 /about', true));

	t.is(await simulate('GET', '/api/user'), 'GET.T 0 /api/user');
	t.is(await simulate('POST', '/api/user'), 'POST.T 0 /api/user');
	t.is(await simulate('GET', '/about'), 'GET.T 0 /about');
	t.is(await simulate('POST', '/about', false), undefined);
	t.is(await simulate('GET', '/wrong', false), undefined);
});

test.serial('routes through middleware according to stage order', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE 0 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 10, append('MIDDLEWARE 10 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', -5, append('MIDDLEWARE -5 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 5, append('MIDDLEWARE 5 /'));
	router.addTerminator(SpecialMethod.MIDDLEWARE, '/', 2, append('MIDDLEWARE.T 2 /'));
	router.addMiddleware('GET', '/', -2, append('GET -2 /'));
	router.addMiddleware(SpecialMethod.ALL, '/', -3, append('ALL -3 /'));
	// Need to add a method terminator on the final node for all middleware to be ran
	router.addTerminator(SpecialMethod.ALL, '/', 0, append('ALL 0 /', true));

	t.is(await simulate('GET', '/'), 'MIDDLEWARE -5 /:ALL -3 /:GET -2 /:MIDDLEWARE 0 /:MIDDLEWARE.T 2 /:MIDDLEWARE 5 /:MIDDLEWARE 10 /:ALL 0 /');
});

test.serial('routes through terminators in order', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, append('MIDDLEWARE 0 /'));
	router.addTerminator('GET', '/', 0, append('GET.T 0 /'));
	router.addTerminator(SpecialMethod.ALL, '/', 0, append('ALL.T 0 /'));

	t.is(await simulate('GET', '/', false), 'MIDDLEWARE 0 /:GET.T 0 /:ALL.T 0 /');
});

test.serial('should recognize significance of trailing slashes in routes', async (t) => {
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/api', 0, append('MIDDLEWARE 0 /api'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/api/', 0, append('MIDDLEWARE 0 /api/'));
	router.addTerminator('GET', '/api/user', 0, append('GET.T 0 /api/user', true));

	t.is(await simulate('GET', '/api', false), 'MIDDLEWARE 0 /api');
	t.is(await simulate('GET', '/api/', false), 'MIDDLEWARE 0 /api:MIDDLEWARE 0 /api/');
	t.is(await simulate('GET', '/api/user'), 'MIDDLEWARE 0 /api:MIDDLEWARE 0 /api/:GET.T 0 /api/user');
});

test.serial('should respect both values for the strictSlashes option', async (t) => {
	router.addTerminator('GET', '/about', 0, append('GET.T 0 /about', true));
	router.addTerminator('GET', '/shop/', 0, append('GET.T 0 /shop/', true));

	t.is(await simulate('GET', '/about'), 'GET.T 0 /about');
	t.is(await simulate('GET', '/about/'), 'GET.T 0 /about');
	t.is(await simulate('GET', '/shop', false), undefined);
	t.is(await simulate('GET', '/shop/'), 'GET.T 0 /shop/');

	router = new Router({
		strictSlashes: true,
	});
	registeredAppends = {};

	router.addTerminator('GET', '/about', 0, append('GET.T 0 /about', true));
	router.addTerminator('GET', '/shop/', 0, append('GET.T 0 /shop/', true));

	t.is(await simulate('GET', '/about'), 'GET.T 0 /about');
	t.is(await simulate('GET', '/about/', false), undefined);
	t.is(await simulate('GET', '/shop', false), undefined);
	t.is(await simulate('GET', '/shop/'), 'GET.T 0 /shop/');
});

test.serial('method helpers should add middleware and terminators', async (t) => {
	router.all('/all', append('ALL 0 /all'), append('ALL.T 0 /all', true));
	router.connect('/', append('CONNECT 0 /'), append('CONNECT.T 0 /', true));
	router.delete('/', append('DELETE 0 /'), append('DELETE.T 0 /', true));
	router.del('/alias/del', append('DEL 0 /'), append('DEL.T 0 /', true));
	router.get('/', append('GET 0 /'), append('GET.T 0 /', true));
	router.head('/', append('HEAD 0 /'), append('HEAD.T 0 /', true));
	router.options('/', append('OPTIONS 0 /'), append('OPTIONS.T 0 /', true));
	router.patch('/', append('PATCH 0 /'), append('PATCH.T 0 /', true));
	router.post('/', append('POST 0 /'), append('POST.T 0 /', true));
	router.put('/', append('PUT 0 /'), append('PUT.T 0 /', true));
	router.trace('/', append('TRACE 0 /'), append('TRACE.T 0 /', true));

	t.is(await simulate('GET', '/all'), 'ALL 0 /all:ALL.T 0 /all');
	t.is(await simulate('POST', '/all'), 'ALL 0 /all:ALL.T 0 /all');
	t.is(await simulate('CONNECT', '/'), 'CONNECT 0 /:CONNECT.T 0 /');
	t.is(await simulate('DELETE', '/'), 'DELETE 0 /:DELETE.T 0 /');
	t.is(await simulate('DELETE', '/alias/del'), 'DEL 0 /:DEL.T 0 /');
	t.is(await simulate('GET', '/'), 'GET 0 /:GET.T 0 /');
	t.is(await simulate('HEAD', '/'), 'HEAD 0 /:HEAD.T 0 /');
	t.is(await simulate('OPTIONS', '/'), 'OPTIONS 0 /:OPTIONS.T 0 /');
	t.is(await simulate('PATCH', '/'), 'PATCH 0 /:PATCH.T 0 /');
	t.is(await simulate('POST', '/'), 'POST 0 /:POST.T 0 /');
	t.is(await simulate('PUT', '/'), 'PUT 0 /:PUT.T 0 /');
	t.is(await simulate('TRACE', '/'), 'TRACE 0 /:TRACE.T 0 /');
});

test.serial('method helpers should add middleware with correct stages', async (t) => {
	router.get('/', append('GET 0 /'), append('GET.T 0 /', true));
	router.use('/*', -5, append('MIDDLEWARE -5 /*'));
	router.use('/*', 5, append('MIDDLEWARE 5 /*'));
	// TODO: use has a different implementation than other helpers. test stages support appropriately for both

	t.is(await simulate('GET', '/'), 'MIDDLEWARE -5 /*:GET 0 /:MIDDLEWARE 5 /*:GET.T 0 /');
});

test.serial('use() should add middleware and handle the wildcard', async (t) => {
	router.use('/', append('USE.T 0 /'));
	router.use('/*', append('USE 0 /*'));
	router.use('/test*', append('USE 0 /test*'));
	router.get('/', append('GET.T 0 /', true));
	router.get('/test', append('GET.T 0 /test', true));

	t.is(await simulate('GET', '/'), 'USE 0 /*:USE.T 0 /:GET.T 0 /');
	t.is(await simulate('GET', '/test'), 'USE 0 /*:USE 0 /test*:USE.T 0 /:GET.T 0 /test');
	t.is(await simulate('GET', '/test/hello', false), 'USE 0 /*:USE 0 /test*');
});

test.serial('use(\'/*\') (with a wildcard) should attach all middleware as immediate middleware', async (t) => {
	router.use('/*', append('USE1 0 /*'), append('USE2 0 /*'));
	router.get('/test', append('GET.T 0 /test', true));

	t.is(await simulate('GET', '/test'), 'USE1 0 /*:USE2 0 /*:GET.T 0 /test');
	t.is(await simulate('GET', '/', false), 'USE1 0 /*:USE2 0 /*');
});

test.serial('use(\'/\') (without a wildcard) should attach all middleware as terminator middleware', async (t) => {
	router.use('/', append('USE1.T 0 /'), append('USE2.T 0 /'));
	router.get('/test', append('GET.T 0 /test', true));

	t.is(await simulate('GET', '/test'), 'USE1.T 0 /:USE2.T 0 /:GET.T 0 /test');
	t.is(await simulate('GET', '/', false), undefined);
});

test.serial('HEAD requests should use GET terminators if no HEAD terminators exist', async (t) => {
	router.get('/home', append('GET.T 0 /home', true));
	router.head('/api', append('HEAD.T 0 /api', true));
	router.get('/api', append('GET.T 0 /api', true));

	t.is(await simulate('HEAD', '/home'), 'GET.T 0 /home');
	t.is(await simulate('GET', '/home'), 'GET.T 0 /home');
	t.is(await simulate('HEAD', '/api'), 'HEAD.T 0 /api');
	t.is(await simulate('GET', '/api'), 'GET.T 0 /api');
});

test.serial('HEAD requests should not use GET terminators if HEAD terminators are available, even if those call next', async (t) => {
	router.head('/shop', append('HEAD.T 0 /shop'));
	router.get('/shop', append('GET.T 0 /shop', true));

	t.is(await simulate('HEAD', '/shop', false), 'HEAD.T 0 /shop');
	t.is(await simulate('GET', '/shop'), 'GET.T 0 /shop');
});

test.serial('HEAD middleware should be called for HEAD requests using GET terminators', async (t) => {
	router.addMiddleware('HEAD', '/home', 0, append('HEAD 0 /home'));
	router.get('/home', append('GET 0 /home'), append('GET.T 0 /home', true));

	t.is(await simulate('HEAD', '/home'), 'HEAD 0 /home:GET 0 /home:GET.T 0 /home');
	t.is(await simulate('GET', '/home'), 'GET 0 /home:GET.T 0 /home');
});

test.serial('should maintain the call stack through all middleware', async (t) => {
	function appendTwice(str: string, last = false): Middleware {
		return async (ctx: Context, next: Next) => {
			ctx.body = (ctx.body ? `${ctx.body}:` : '') + str;
	
			if (last) return;

			await next();

			ctx.body = (ctx.body ? `${ctx.body}:` : '') + str;
		};
	}

	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/', 0, appendTwice('MIDDLEWARE 0 /'));
	router.addTerminator(SpecialMethod.MIDDLEWARE, '/', 0, appendTwice('MIDDLEWARE.T 0 /'));
	router.addMiddleware(SpecialMethod.MIDDLEWARE, '/blog', 0, appendTwice('MIDDLEWARE 0 /blog'));
	router.addTerminator(SpecialMethod.MIDDLEWARE, '/blog', 0, appendTwice('MIDDLEWARE.T 0 /blog'));
	router.addMiddleware('GET', '/blog', 0, appendTwice('GET 0 /blog'));
	router.addTerminator('GET', '/blog', 0, appendTwice('GET.T 0 /blog'));
	router.addMiddleware(SpecialMethod.ALL, '/blog', 0, appendTwice('ALL 0 /blog'));
	router.addTerminator(SpecialMethod.ALL, '/blog', 0, appendTwice('ALL.T 0 /blog', true));

	t.is(await simulate('GET', '/blog'), [
		'MIDDLEWARE 0 /',
		'MIDDLEWARE 0 /blog',
		'MIDDLEWARE.T 0 /',
		'MIDDLEWARE.T 0 /blog',
		'GET 0 /blog',
		'ALL 0 /blog',
		'GET.T 0 /blog',
		'ALL.T 0 /blog',
		'GET.T 0 /blog',
		'ALL 0 /blog',
		'GET 0 /blog',
		'MIDDLEWARE.T 0 /blog',
		'MIDDLEWARE.T 0 /',
		'MIDDLEWARE 0 /blog',
		'MIDDLEWARE 0 /',
	].join(':'));
});

test.serial('should handle complex combinations of parameters', async (t) => {
	router.get('/post/:name', append('GET.T 0 /post/:name', true));
	router.get('/user/@me', append('GET.T 0 /user/@me', true));
	router.get('/user/:id(\\d+$)', append('GET.T 0 /user/:id', true));
	router.get('/user/:id(\\d+$)/ban', append('GET.T 0 /user/:id/ban', true));
	router.get('/user/:shortId$-10(\\d{1,2}$)', append('GET.T 0 /user/:shortId', true));
	router.get('/user/:shortId$-10(\\d{1,2}$)/ban', append('GET.T 0 /user/:shortId/ban', true));
	router.get('/user/x:hash([0-9a-f]{4}$)', append('GET.T 0 /user/x:hash', true));
	router.get('/user/x:hash([0-9a-f]{4}$)/ban', append('GET.T 0 /user/x:hash/ban', true));

	// No regex
	t.is(await simulate('GET', '/post/some-string'), 'GET.T 0 /post/some-string:name');

	// Shouldn't match for empty params
	t.is(await simulate('GET', '/post/', false), undefined);

	// Matches the correct params, according to regexes and stage order
	t.is(await simulate('GET', '/user/123'), 'GET.T 0 /user/123:id');
	t.is(await simulate('GET', '/user/123/'), 'GET.T 0 /user/123:id');
	t.is(await simulate('GET', '/user/123/ban'), 'GET.T 0 /user/123:id/ban');
	t.is(await simulate('GET', '/user/45/'), 'GET.T 0 /user/45:shortId');
	t.is(await simulate('GET', '/user/45/ban'), 'GET.T 0 /user/45:shortId/ban');

	// Works with characters other than `/` before params
	t.is(await simulate('GET', '/user/xffff'), 'GET.T 0 /user/xffff:hash');
	t.is(await simulate('GET', '/user/x1111/'), 'GET.T 0 /user/x1111:hash');
	t.is(await simulate('GET', '/user/x100a'), 'GET.T 0 /user/x100a:hash');
	t.is(await simulate('GET', '/user/x100a/ban'), 'GET.T 0 /user/x100a:hash/ban');

	// Works with static routes
	t.is(await simulate('GET', '/user/@me'), 'GET.T 0 /user/@me');

	// Doesn't match for invalid params
	t.is(await simulate('GET', '/user/', false), undefined);
	t.is(await simulate('GET', '/user//ban', false), undefined);
	t.is(await simulate('GET', '/user/xx/ban', false), undefined);
});

test.serial('should handle trailing slashes in parameters with strictSlashes disabled', async (t) => {
	router.get('/post/:name', append('GET.T 0 /post/:name', true));
	router.get('/user/:id', append('GET.T 0 /user/:id', true));
	router.get('/user/:id/', append('GET.T 0 /user/:id/', true));
	router.get('/thing/:id/', append('GET.T 0 /thing/:id/', true));

	t.is(await simulate('GET', '/post/some-string'), 'GET.T 0 /post/some-string:name');
	t.is(await simulate('GET', '/post/some-string/'), 'GET.T 0 /post/some-string:name');
	t.is(await simulate('GET', '/user/123'), 'GET.T 0 /user/123:id');
	t.is(await simulate('GET', '/user/123/'), 'GET.T 0 /user/123:id/');
	t.is(await simulate('GET', '/thing/123', false), undefined);
	t.is(await simulate('GET', '/thing/123/'), 'GET.T 0 /thing/123:id/');
});

test.serial('should handle trailing slashes in parameters with strictSlashes enabled', async (t) => {
	router = new Router({
		strictSlashes: true,
	});

	router.get('/post/:name', append('GET.T 0 /post/:name', true));
	router.get('/user/:id', append('GET.T 0 /user/:id', true));
	router.get('/user/:id/', append('GET.T 0 /user/:id/', true));
	router.get('/thing/:id/', append('GET.T 0 /thing/:id/', true));

	t.is(await simulate('GET', '/post/some-string'), 'GET.T 0 /post/some-string:name');
	t.is(await simulate('GET', '/post/some-string/', false), undefined);
	t.is(await simulate('GET', '/user/123'), 'GET.T 0 /user/123:id');
	t.is(await simulate('GET', '/user/123/'), 'GET.T 0 /user/123:id/');
	t.is(await simulate('GET', '/thing/123', false), undefined);
	t.is(await simulate('GET', '/thing/123/'), 'GET.T 0 /thing/123:id/');
});

test.serial('parameters should not leak to the next callback', async (t) => {
	router.get('/post/:id', append('GET.T 0 /post/:id'));
	router.get('/user/:id/ban/:reason/', append('GET.T 0 /user/:id/ban/:reason/'));

	t.deepEqual(await simulate('GET', '/post/23', false, (ctx) => [ctx.body, ctx.params]) as any, ['GET.T 0 /post/23:id', {id: undefined}]);
	t.deepEqual(await simulate('GET', '/user/123/ban/2/', false, (ctx) => [ctx.body, ctx.params]) as any, ['GET.T 0 /user/123:id/ban/2:reason/', {id: undefined, reason: undefined}]);

	t.is((await doSimulation('GET', '/post/23', (ctx, next) => {
		if (ctx.params.id !== undefined) throw new Error(`Parameter id was set to ${ctx.params.id}`);
		next();
	})).body, 'GET.T 0 /post/23:id');

	t.is((await doSimulation('GET', '/user/23/ban/stuff/', (ctx, next) => {
		if (ctx.params.id !== undefined) throw new Error(`Parameter id was set to ${ctx.params.id}`);
		if (ctx.params.reason !== undefined) throw new Error(`Parameter reason was set to ${ctx.params.reason}`);
		next();
	})).body, 'GET.T 0 /user/23:id/ban/stuff:reason/');
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
