import {DefaultContext, DefaultState, Middleware, Next, ParameterizedContext} from 'koa';
import compose from 'koa-compose';

import {Node} from './Node';

export enum SpecialMethod {
	/** For middleware that gets executed for every path segment. */
	MIDDLEWARE = 'middleware',
	/** For middleware that gets executed only for the specific path it was assigned to. */
	MIDDLEWARE_EXACT = 'middlewareExact',
	/** For middleware that matches for any request method. More specific methods will be called before ones bound to `all`. */
	ALL = 'all',
}

export class RouterNodeData<StateT = DefaultState, ContextT = DefaultContext> {
	middleware: Map<string, Map<number, Middleware<StateT, ContextT>[]>> = new Map();
	orderedMiddleware: Map<string, Middleware<StateT, ContextT>[]> = new Map();
	orderedMiddlewareForExact: Middleware<StateT, ContextT>[] = [];

	getMiddlewareStage(method: string, stage: number): Middleware<StateT, ContextT>[] {
		let methodStages = this.middleware.get(method);

		if (!methodStages) {
			methodStages = new Map();
			this.middleware.set(method, methodStages);
		}

		let stageArray = methodStages.get(stage);
		if (stageArray) return stageArray;

		stageArray = [];
		methodStages.set(stage, stageArray);
		return stageArray;
	}

	addMiddleware(method: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): void {
		const stageArray = this.getMiddlewareStage(method, stage);

		stageArray.push(...middleware);

		this.orderMiddleware(method);
	}

	orderMiddleware(method: string): void {
		const methodStages = this.middleware.get(method);

		// The method doesn't have any middleware registered - do nothing
		if (!methodStages) return;

		// Flatten middleware arrays of all the stages into a single array
		const orderedMiddleware = [...methodStages.keys()].sort().reduce((acc, key) => {
			acc.push(...methodStages.get(key)!);
			return acc;
		}, [] as Middleware<StateT, ContextT>[]);

		this.orderedMiddleware.set(method, orderedMiddleware);

		if (method === SpecialMethod.MIDDLEWARE || method === SpecialMethod.MIDDLEWARE_EXACT) {
			this.orderMiddlewareForExact();
		}
	}

	orderMiddlewareForExact(): void {
		const middlewareStages = this.middleware.get(SpecialMethod.MIDDLEWARE);
		const exactMiddlewareStages = this.middleware.get(SpecialMethod.MIDDLEWARE_EXACT);

		// If there's no middleware for either, just use the ordered middleware for the other
		if (!middlewareStages && !exactMiddlewareStages) {
			this.orderedMiddlewareForExact = [];
			return;
		} else if (!middlewareStages) {
			this.orderedMiddlewareForExact = this.orderedMiddleware.get(SpecialMethod.MIDDLEWARE_EXACT)!.slice();
			return;
		} else if (!exactMiddlewareStages) {
			this.orderedMiddlewareForExact = this.orderedMiddleware.get(SpecialMethod.MIDDLEWARE)!.slice();
			return;
		}

		const allStages = [...middlewareStages.keys(), ...exactMiddlewareStages.keys()]
			// Remove duplicates
			.filter((item, index, arr) => arr.indexOf(item) === index)
			.sort();

		// Create an array containing middleware and exact middleware, sorted according to their respective stages
		this.orderedMiddlewareForExact = allStages.reduce((acc, stage) => {
			acc.push(...(middlewareStages.get(stage)?.values() || []));
			acc.push(...(exactMiddlewareStages.get(stage)?.values() || []));
			return acc;
		}, [] as Middleware<StateT, ContextT>[]);
	}

	toString(): string {
		return `${this.middleware.size} stages. middleware: ${[...this.orderedMiddleware].map(([method, middleware]) => `${middleware.length} ${method}`).join(', ')}`;
	}
}

export interface RouterOptions {
	/** If true, requests ending with `/` will match routes not ending in `/`. Routes ending with `/` will still require the request path to end in a slash. */
	strictSlashes?: boolean;
}

/**
 * Type that assumes that:
 * - if `next` isn't done, then `current` can't be done either,
 * - `current` is never going to be done.
 */
type IteratorResultSequence<G extends Generator> = {
	current: G extends Generator<infer Y> ? IteratorYieldResult<Y> : never;
	next: G extends Generator<any, infer R> ? IteratorReturnResult<R> : never;
} | {
	current: G extends Generator<infer Y> ? IteratorYieldResult<Y> : never;
	next: G extends Generator<infer Y> ? IteratorYieldResult<Y> : never;
};

/**
 * A router implementation for Koa using a radix tree.
 */
export class Router<StateT = DefaultState, ContextT = DefaultContext> {
	rootNode: Node<RouterNodeData<StateT, ContextT>> = new Node(() => new RouterNodeData());

	private strictSlashes: boolean;

	constructor(opts: RouterOptions = {}) {
		this.strictSlashes = opts.strictSlashes ?? false;
	}

	addMiddleware(method: string, path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): void {
		if (path.length < 0 || path[0] !== '/') throw new Error('Paths must start with "/"');

		const node = this.rootNode.findOrCreateNode(path);

		node.data.addMiddleware(method, stage, ...middleware);
	}

	middleware(): Middleware<StateT, ContextT> {
		return this.middlewareHandler.bind(this);
	}

	async middlewareHandler(ctx: ParameterizedContext<StateT, ContextT>, next: Next): Promise<void> {
		const router = this;

		let nodeIterator = this.rootNode.nodeIterator(ctx.path);

		let result: IteratorResultSequence<typeof nodeIterator> = {
			// @ts-ignore: Set `current` to `undefined` since it'll always be set to `next` on the first pass
			current: undefined as unknown,
			next: nodeIterator.next(),
		};
		let runNode: this['rootNode'] | null = null;

		async function nextNode(): Promise<void> {
			// We reached the end of the chain, but nextNode was called. Go to the next middleware in the parent stack.
			if (result.next.done) return next();

			result.current = result.next;
			result.next = nodeIterator.next();

			const currentNode = result.current.value.node;
			const remainingPath = result.current.value.remainingPath;

			if (result.next.done) {
				runNode = currentNode;
			} else if (currentNode.segment.endsWith('/') || result.next.value.node.segment.startsWith('/')) {
				runNode = currentNode;
			}

			if (runNode) {
				// The node is final if there are no nodes to follow and if no path remains (or if strict slashes are disabled, if only a slash remains)
				if (result.next.done && (remainingPath.length === 0 || (!router.strictSlashes && remainingPath === '/'))) {
					// Run node as the final node
					const matchingMiddleware = runNode.data.orderedMiddlewareForExact.slice();

					const middlewareForMethod = runNode.data.orderedMiddleware.get(ctx.method);
					if (middlewareForMethod) matchingMiddleware.push(...middlewareForMethod);

					if (ctx.method === 'HEAD') {
						const middlewareForGet = runNode.data.orderedMiddleware.get('GET');
						if (middlewareForGet) matchingMiddleware.push(...middlewareForGet);
					}

					const middlewareForAll = runNode.data.orderedMiddleware.get(SpecialMethod.ALL);
					if (middlewareForAll) matchingMiddleware.push(...middlewareForAll);

					runNode = null;
					return compose(matchingMiddleware)(ctx, next);
				}

				// Run node as middleware only
				const middleware = runNode.data.orderedMiddleware.get(SpecialMethod.MIDDLEWARE);
				runNode = null;

				if (middleware) {
					return compose(middleware)(ctx, nextNode);
				}
			}

			return nextNode();
		}

		await nextNode();
	}

	use(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	use(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	use(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		const decidedStage = typeof stage === 'number' ? stage : 0;
		const combinedMiddleware = typeof stage === 'number' ? middleware : [stage].concat(middleware);

		if (path.endsWith('*')) {
			this.addMiddleware(SpecialMethod.MIDDLEWARE, path.substr(0, path.length - 1), decidedStage, ...combinedMiddleware);
			return this;
		}

		this.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, path, decidedStage, ...combinedMiddleware);
		return this;
	}

	private addMiddlewareHelper(method: string, path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		const decidedStage = typeof stage === 'number' ? stage : 0;
		const combinedMiddleware = typeof stage === 'number' ? middleware : [stage].concat(middleware);

		if (combinedMiddleware.length === 0) throw new Error('No middleware provided');

		if (combinedMiddleware.length > 1) this.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, path, decidedStage, ...combinedMiddleware.slice(0, combinedMiddleware.length - 1));
		this.addMiddleware(method, path, decidedStage, combinedMiddleware[combinedMiddleware.length - 1]);

		return this;
	}

	all(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	all(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	all(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper(SpecialMethod.ALL, path, stage, ...middleware);
	}

	connect(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	connect(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	connect(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('CONNECT', path, stage, ...middleware);
	}

	delete(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	delete(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	delete(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('DELETE', path, stage, ...middleware);
	}

	del(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	del(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	del(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('DELETE', path, stage, ...middleware);
	}

	get(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	get(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	get(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('GET', path, stage, ...middleware);
	}

	head(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	head(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	head(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('HEAD', path, stage, ...middleware);
	}

	options(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	options(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	options(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('OPTIONS', path, stage, ...middleware);
	}

	patch(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	patch(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	patch(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('PATCH', path, stage, ...middleware);
	}

	post(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	post(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	post(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('POST', path, stage, ...middleware);
	}

	put(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	put(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	put(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('PUT', path, stage, ...middleware);
	}

	trace(path: string, ...middleware: Middleware<StateT, ContextT>[]): this;
	trace(path: string, stage: number, ...middleware: Middleware<StateT, ContextT>[]): this;
	trace(path: string, stage: number | Middleware<StateT, ContextT>, ...middleware: Middleware<StateT, ContextT>[]): this {
		return this.addMiddlewareHelper('TRACE', path, stage, ...middleware);
	}
}
