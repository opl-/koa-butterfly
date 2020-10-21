# Koa Butterfly 🦋

Butterfly is a feature packed Koa router. Supports:

- Nested routers
- Parameters, including:
	- Parameters that consume slashes
	- Regex matching
- Advanced middleware ordering rules
- TypeScript (it's written in TypeScript!)
- Radix tree based routing
- Request method matching, including an `all` wildcard
- Optional strict slashes
- Significant trailing slashes during route registration

Butterfly is already fully working, but still under development. This means that API changes can occur and that you can influence the development of this project. Proposals and other contributions are welcome.


## Installation

Koa Butterfly requires Node.js v10 or higher.

```bash
npm install --save koa-butterfly
```

See the [Reference](#reference) section below for usage and API documentation.


## Examples

### General usage

```typescript
import Koa from 'koa';
import {Router} from 'koa-butterfly';

const apiRouter = new Router();

apiRouter.get('/random/:max(\\d+)', async (ctx) => {
	const max = parseInt(ctx.params.max, 10);

	ctx.body = {
		max,
		result: Math.random() * max,
	};
});

const router = new Router();

// Nested Routers are usually registered as immediate middleware
router.use('/api*', apiRouter);

router.get('/', (ctx) => {
	ctx.body = '<body>Home page! <a href="/about">About</a></body>';
});

router.get('/about', (ctx) => {
	ctx.body = '<body>About page! Information! <a href="/">Home</a></body>';
});

const app = new Koa();
app.use(router.middleware());
app.listen(8080);
```


### Hidden API endpoints

In this example any requests starting with `/api` (like `/api/secret`, `/api` and `/api/wrong`, but *not* `/api-extra`) will first call the middleware mounted with `.use('/api*')`, which can reject them regardless of whether they match a real endpoint or not. This prevents clients from discovering which endpoints exist based on differences in HTTP status codes (401 vs 404).

```typescript
import Koa from 'koa';
import {Router} from 'koa-butterfly';

const router = new Router();

// Called for all requests that start with `/api`
router.use('/api*', (ctx, next) => {
	if (ctx.query.auth === 'secret') return next();

	ctx.status = 401;
	ctx.body = {error: 'unauthorized'};
});

router.get('/api/secret', (ctx) => {
	ctx.body = {
		status: 'secret information',
	};
});

const app = new Koa();
app.use(router.middleware());
app.listen(8080);
```


## Contributing

```bash
git clone git@github.com:opl-/koa-butterfly.git
cd koa-butterfly

# Install dependencies
npm install

# Test (with coverage)
npm test

# Test (without coverage, better for debugging)
npx ava
```

- `lib/Node.ts` contains the Radix tree implementation.
- `lib/Router.ts` contains the routing logic.
- `lib/pathParser.ts` is responsible for parsing paths provided during middleware registration.
- `lib/StagedArray.ts` provides functionality used for stages.
- `test/` contains tests for all components.


## Reference

### Middleware execution order

This section explains in detail how the `Router` determines which middleware to execute.

Behind the scenes the `Router` stores the registered middleware for each method on a path as two arrays: one for terminators and one for middleware. It also recognizes two special types of methods: `all` and `middleware`.

Understanding this is useful, because the ordering rules are tightly integrated with it.

When handling a request, the path will be traversed segment by segment (a segment is a slash, or a part between a slash and either another slash or the end of the path).

For each but the final segment, the middleware for the special method `middleware` will be executed as soon as it is encountered. This document refers to such middleware as "immediate middleware". Additionally, all terminator middleware for that special method will be stored to be ran later.

When the end of the path is reached the data for the used method and the special method `all` is retrieved.

If neither the used method nor the `all` special method has terminator middleware on it, the immediate middleware is still executed, but the request is considered to have not matched and `next()` is called by the `Router` to allow Koa to try any remaining middleware.

Otherwise, middleware from all sources below is sorted together (according to stages, then source (list below), then insertion order) and executed (as long as `next()` gets called):

- Middleware for the special method `middleware`
- Terminator middleware from earlier segments (mentioned earlier)
- Method middleware (for this request method)
- Middleware for the special method `all`

After the last `next()` is called, the terminator middleware for the request method is executed, followed by the terminator middleware for the special method `all`.

Assuming all the middleware that was executed called `next()`, the `Router` will call the `next()` passed to it by Koa, as all matching options provided by the user will be exhausted by then.

There's one exception to these rules: `HEAD` requests to a path that doesn't have terminator middleware registered for the `HEAD` method. Such requests will automatically use the `GET` middleware and terminator middleware. Any middleware registered for the `HEAD` method will also be included, being ordered right before the method (`GET`) middleware.


### Path format

When registering new routes you're expected to pass in a `path` argument which describes which request paths the middleware is intended to be called for.

All paths must begin with a slash. The simplest paths are completely static:

- `/` will match for requests to `/`, but *not* `/anything-else`
- `/about/us` will match for requests to `/about/us` and, as long as the `strictSlashes` option is disabled, `/about/us/`

It is important to note that trailing slashes are significant when registering routes:

- `/about/us/` will match for requests to `/about/us/` but *not* to `/about/us`

Paths can also contain parameters, which capture a segment of the request path and pass it to the middleware through the context object.

- `/user/:name` will match for `/user/john` and `/user/ben1/`, but *not* for `/user/ben1/info`

Parameters can also have a regex test and span slashes. To learn more, see the [Parameters](#parameters) section.

If you need to enter a character that otherwise has a special meaning, you can escape it using a backslash:

- `/user/\\:name` will match for `/user/:name`, but *not* for `/user/john`

To use a backslash as part of the path, escape the backslash with another backslash:

- `/\\\\` will match for `/\`


### Parameters

Parameters allow the request path to contain arbitrary segments that the `Router` will capture and pass to the middleware.

The simplest parameters capture a single path segment:

- `/user/:name` will match for `/user/john` (capturing `john` as `ctx.params.john`)

Slightly more complex parameters contain a regex in parenthesis following the parameter name. The path will only match if the regex matches. The regex match will be used as the parameter value:

- `/user/:id(\\d+)` will match for `/user/58` (capturing `58` as `ctx.params.id`), but *not* for `/user/john` nor `/user/8bit`

By default the parameter will match only one path segment (region between two slashes or between a slash and the end of a path). To make the parameter span multiple path segments, suffix it with `+`:

- `/search/:details+` will match for `/search/author/opl/title/juice` (capturing `author/opl/title/juice` as `ctx.params.details`)
- `/search/:details(\\w+/\\w+)+` will match for `/search/author/opl` (capturing `author/opl` as `ctx.params.details`), but *not* for `/search/author` (not enough segments for regex) nor `/search/author/opl/title/juice` (too many segments for regex)

Parameters can be placed almost anywhere in the path. They can contain a prefix:

- `/post/by-:author/show` will match for `/post/by-ben/show` (capturing `ben` as `ctx.params.author`)

Because the parameter only captures the path segment that its regex captures, you can put a static suffix after a parameter:

- `/post/:id(\\d+)-details` will match for `/post/58-details` (capturing `58` as `ctx.params.id`)

Parameters can also immediately follow another parameter, as long as the preceding parameter has a regex:

- `/:first(\\w+$):second` will match for `/hello-world` (capturing `hello` as `ctx.params.first`, and `-world` as `ctx.params.second`)

Just like middleware, parameters by default follow registration order, but also support [stages](#stages). The default stage is `0`, meaning that parameters registered with a stage lower than that will be executed earlier.

- Given two routes `/user/:id$-10(\\d+)` and `/user/:name`, `/user/58` will match middleware on the first path, while `/user/opl` will match middleware on the second path.


### Stages

A distinguishing feature of `koa-butterfly` is the ability to order middleware without depending on registration order. This is achieved through "stages".

A stage is simply a numerical value assigned to middleware (or a parameter) during registration. The default stage used when one isn't provided is `0`.

All values within a single stage are ordered according to insertion order.

Let's look at this code as an example:

```typescript
router.use('/', middleware1);
router.use('/', -5, middleware2, middleware3);
```

Despite `middleware1` being registered first, it will be `middleware2` that gets called first, followed by `middleware3` and then finally `middleware1`.

This is because stage `-5` is lower than the default `0` used for `middleware1`, and because `middleware3` was inserted right after `middleware2`.


### `MiddlewareLike`

Whenever the `Router` class expects middleware, the argument type used is `MiddlewareLike`.

This is because other than normal Koa middleware, the `Router` also allows passing in:

- Objects with a `middleware()` function that returns Koa middleware. The function will be called once on registration to retrieve an instance of the middleware.
- Falsy values (`null`, `undefined`, `false`). This is to allow registring just middleware (`.get('/about', middleware, null)`), and make using conditionals when registering middleware easier (`.use('/', opts.cors && corsMiddleware())`).


### `Router`

All routing logic is handled by the `Router` class.

#### `Router.middleware(): Middleware`

Returns a Koa middleware function for this `Router`.

#### `Router.use(path: string, [stage: number = 0,] [...middleware: MiddlewareLike,] terminatorMiddleware: MiddlewareLike): this`

If the `path` is suffixed with `*`, register the middleware as immediate middleware for that path (with the trailing `*` stripped).

Otherwise, register the middleware as middleware for that path.

#### `Router.all(path: string, [stage: number = 0,] [...middleware: MiddlewareLike,] terminatorMiddleware: MiddlewareLike): this`

Register the specified middleware to be used for that path, regardless of the request method.

#### `Router.<method>(path: string, [stage: number = 0,] [...middleware: MiddlewareLike,] terminatorMiddleware: MiddlewareLike): this`

Register the specified middleware to be used for that path, but only when the request method matches.

Only the following methods have this helper: `connect`, `delete` (alias `del`), `get`, `head`, `options`, `patch`, `post`, `put`, `trace`.

#### `Router.register(method: string, path: string, [stage: number = 0,] [...middleware: MiddlewareLike,] terminatorMiddleware: MiddlewareLike): this`

Register the specified middleware to be used for the given path and arbitrary HTTP request method. The `method` value usually should be uppercase.

#### `Router.addMiddleware(method: string, path: string, stage: number, ...middleware: MiddlewareLike): this`
#### `Router.addTerminator(method: string, path: string, stage: number, ...middleware: MiddlewareLike): this`

Register the specified middleware as either middleware or terminator middleware to be used for that path. See [Middleware execution order](#middleware-execution-order).
