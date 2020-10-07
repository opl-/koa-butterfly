import {DefaultContext, DefaultState, Middleware, Next, ParameterizedContext} from 'koa';
import compose from 'koa-compose';

import {Node} from './Node';
import {parsePath} from "./pathParser";
import {StagedArray} from './StagedArray';

export enum SpecialMethod {
	/**
	 * Middleware for this special method will get executed for matching path segments, as soon as they're encountered.
	 *
	 * Terminators will be executed at the end of the request, but only if the request path matches a node with terminators.
	 */
	MIDDLEWARE = 'middleware',
	/**
	 * Middleware bound to this special method is called together with the middleware for the specific HTTP request methods.
	 *
	 * Terminators bound to this method are called for any HTTP request method, but only after the more specific options are exhausted.
	 */
	ALL = 'all',
}

export class MethodData<D> {
	middleware: StagedArray<D> = new StagedArray();
	terminators: StagedArray<D> = new StagedArray();
}

export interface ParameterRoute<NodeT> {
	name: string;
	regex: RegExp | null;
	matchAll: boolean;
	rootNode: NodeT;
}

export class RouterNodeData<StateT, ContextT> {
	methodData: Map<string, MethodData<Middleware<StateT, ContextT>>> = new Map();

	lateParams = new StagedArray<ParameterRoute<Node<RouterNodeData<StateT, ContextT>>>>();

	getMethodData(method: string, createIfMissing: true): MethodData<Middleware<StateT, ContextT>>;
	getMethodData(method: string, createIfMissing?: boolean): MethodData<Middleware<StateT, ContextT>> | undefined;
	getMethodData(method: string, createIfMissing = false): MethodData<Middleware<StateT, ContextT>> | undefined {
		let methodStages = this.methodData.get(method);

		if (createIfMissing && !methodStages) {
			methodStages = new MethodData<Middleware<StateT, ContextT>>();
			this.methodData.set(method, methodStages);
		}

		return methodStages;
	}

	toString(): string {
		return `methods (${this.methodData.size}): ${[...this.methodData.entries()].map(([method, data]) => [
			'\x1b[1m', // bold
			method,
			'\x1b[22m {', // normal intensity
			[
				data.middleware.length === 0 ? null : `middleware=${data.middleware.length}`,
				data.terminators.length === 0 ? null : `terminators=${data.terminators.length}`,
			].filter((v) => v).join(', '),
			'}'
		].join('')).join(', ')}`;
	}
}

export interface RouterOptions {
	/** If true, requests ending with `/` will match routes not ending in `/`. Routes ending with `/` will still require the request path to end in a slash. */
	strictSlashes?: boolean;
}

export interface RouterContext {
	params: Record<string, string>;
}

/**
 * Runs any middleware provided by the given generator.
 *
 * If the middleware doesn't call `next()`, the generator doesn't get called again, allowing the generator to easily stop execution at any time with no extra code.
 */
async function middlewareGeneratorRunner<StateT, ContextT>(ctx: ParameterizedContext<StateT, ContextT>, next: Next, middlewareGenerator: AsyncGenerator<Middleware<StateT, ContextT>[]>): Promise<void> {
	const middleware = await middlewareGenerator.next();

	if (middleware.done) return;

	if (middleware.value.length === 0) await middlewareGeneratorRunner(ctx, next, middlewareGenerator);
	else if (middleware.value.length === 1) await middleware.value[0](ctx, () => middlewareGeneratorRunner(ctx, next, middlewareGenerator));
	else await compose(middleware.value)(ctx, () => middlewareGeneratorRunner(ctx, next, middlewareGenerator));
}

/**
 * Used to set values for all middleware executed before the passed in `next` is called, then reset them back to the old value.
 *
 * In practice, this can be used to set parameter values while in the Router, while keeping them at their old values while giving up control to the `next` passed to the Router's middleware callback.
 *
 * This is similar to what `koa-mount` does with `ctx.path` and `ctx.mountPath`.
 *
 * @param oldValue Value passed to the setter to reset the value back to the old one
 * @param newValue Value passed to the setter to set the new value
 * @param setter Function setting the wanted values
 * @param next The middleware callback to call after the `wrappedNext` passed through `callback` is called
 * @param callback Function to call after the values have been set
 */
export async function middlewareValueWrapper<T>(oldValue: T, newValue: T, setter: (value: T) => any, next: Next, callback: (wrappedNext: () => any) => Promise<void>): Promise<void> {
	setter(newValue);
	await callback(async () => {
		setter(oldValue);
		await next();
		setter(newValue);
	});
	setter(oldValue);
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
export class Router<StateT = DefaultState, ContextT = DefaultContext, RouterContextT extends RouterContext & ContextT = RouterContext & ContextT> {
	rootNode: Node<RouterNodeData<StateT, RouterContextT>> = new Node(() => new RouterNodeData());

	private strictSlashes: boolean;

	constructor(opts: RouterOptions = {}) {
		this.strictSlashes = opts.strictSlashes ?? false;
	}

	getNode(path: string, createIfNone: true): this['rootNode'];
	getNode(path: string, createIfNone: false): this['rootNode'] | null;
	getNode(path: string, createIfNone = false): this['rootNode'] | null {
		if (path.length < 0 || path[0] !== '/') throw new Error('Paths must start with "/"');

		const segments = parsePath(path);
		let currentNode: this['rootNode'] | null = this.rootNode;

		while (segments.length > 0 && currentNode) {
			const currentSegment = segments.shift()!;

			if (currentSegment.type === 'path') {
				const foundNodes: this['rootNode'][] | null = currentNode.findAll(currentSegment.path, createIfNone);
				if (!foundNodes) return null;
				currentNode = foundNodes[foundNodes.length - 1];
			} else if (currentSegment.type === 'parameter') {
				const info = currentSegment.info;
				let paramRoute: ParameterRoute<this['rootNode']> | undefined;

				// Try to find an existing ParameterRoute matching the description
				paramRoute = currentNode.data.lateParams.orderedData.find((param) => (
					param.name === info.name && param.matchAll === info.matchAll && param.regex?.toString() === info.regex?.toString()
				));

				if (!paramRoute) {
					// If we're not allowed to create new data, abort
					if (!createIfNone) return null;

					// Create a new ParameterRoute since one doesn't already exist
					paramRoute = {
						name: info.name,
						matchAll: info.matchAll,
						regex: info.regex,
						rootNode: new Node(this.rootNode.dataCreator),
					};
					currentNode.data.lateParams.addData(info.stage, paramRoute);
				}

				currentNode = paramRoute.rootNode;
			} else {
				// @ts-ignore: sanity check
				// istanbul ignore next: sanity check
				throw new Error(`Unknown segment type: ${currentSegment.type}`);
			}
		}

		return currentNode;
	}

	addMiddleware(method: string, path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): void {
		const node = this.getNode(path, true);

		node.data.getMethodData(method, true).middleware.addData(stage, ...middleware);
	}

	addTerminator(method: string, path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): void {
		const node = this.getNode(path, true);

		node.data.getMethodData(method, true).terminators.addData(stage, ...middleware);
	}

	middleware(): Middleware<StateT, RouterContextT> {
		return this.middlewareHandler.bind(this);
	}

	async middlewareHandler(ctx: ParameterizedContext<StateT, RouterContextT>, next: Next): Promise<void> {
		return this.handleNodePath(this.rootNode, ctx.path, ctx, next);
	}

	async handleNodePath(node: this['rootNode'], path: string, ctx: ParameterizedContext<StateT, RouterContextT>, next: Next): Promise<void> {
		return middlewareGeneratorRunner<StateT, RouterContextT>(ctx, next, this.middlewareGenerator(node, path, ctx, next));
	}

	async *middlewareGenerator(node: this['rootNode'], path: string, ctx: ParameterizedContext<StateT, RouterContextT>, next: Next) {
		let nodeIterator = node.nodeIterator(path);

		let result: IteratorResultSequence<typeof nodeIterator> = {
			// @ts-ignore: Set `current` to `undefined` since it'll always be set to `next` on the first pass
			current: undefined as unknown,
			next: nodeIterator.next(),
		};
		// FIXME: these will be lost when going into another router. what do? (pass them through to that routers stuff? make it more fireproof by putting it in ctx/ctx.state?)
		let terminatorMiddleware: StagedArray<Middleware<StateT, RouterContextT>>[] = [];

		while (true) {
			// We reached the end of the chain, but nextNode was called. Go to the next middleware in the parent stack.
			if (result.next.done) return next();

			result.current = result.next;
			result.next = nodeIterator.next();

			const currentNode = result.current.value.node;
			const remainingPath = result.current.value.remainingPath;

			// Determine if this node is on a path segment boundary
			if (result.next.done || (currentNode.segment.endsWith('/') || result.next.value.node.segment.startsWith('/'))) {
				// The node is final if there are no nodes to follow and if no path remains (or if strict slashes are disabled, if only a slash remains)
				if (result.next.done && (remainingPath.length === 0 || (!this.strictSlashes && remainingPath === '/'))) {
					// Run node as the final node
					// FIXME: make sure that clients can't just send in `middleware` or another literal, and that actual methods are never lowercased. possibly switch to symbols for special methods
					let methodData = currentNode.data.getMethodData(ctx.method);
					let headData: typeof methodData;

					if (ctx.method === 'HEAD' && (methodData?.terminators.length || 0) === 0) {
						// If the method is HEAD but it has no terminators, use the GET terminators instead. If any middleware exists, it should still be executed before the GET middleware
						headData = methodData;
						methodData = currentNode.data.getMethodData('GET');
					}

					const allMethodData = currentNode.data.getMethodData(SpecialMethod.ALL);
					const hasTerminators = (methodData?.terminators.length || 0) > 0 || (allMethodData?.terminators.length || 0) > 0;

					// If the method has no terminators, fall through and handle this node like any other middleware node
					if (hasTerminators) {
						// Stores StagedArrays containing middleware to run. The order matters, as it determines middleware order within a stage.
						const matchingMiddlewareSAs: StagedArray<Middleware<StateT, RouterContextT>>[] = [];

						// Normal middleware always goes first
						const middlewareData = currentNode.data.getMethodData(SpecialMethod.MIDDLEWARE);
						if (middlewareData && middlewareData.middleware.length > 0) matchingMiddlewareSAs.push(middlewareData.middleware);

						// Terminator middleware collected through the different nodes goes next
						matchingMiddlewareSAs.push(...terminatorMiddleware);

						// Followed by terminator middleware for this node
						if (middlewareData && middlewareData.terminators.length > 0) matchingMiddlewareSAs.push(middlewareData.terminators);

						// If we are overriding terminators of HEAD with GET, try to still include the HEAD middleware
						if (headData && headData.middleware.length > 0) matchingMiddlewareSAs.push(headData.middleware);

						// Next, this method's middleware
						if (methodData && methodData.middleware.length > 0) matchingMiddlewareSAs.push(methodData.middleware);

						// And finally middleware for all methods on this path
						if (allMethodData && allMethodData.middleware.length > 0) matchingMiddlewareSAs.push(allMethodData.middleware);

						// Sort all the middleware together and run it
						yield StagedArray.sort(matchingMiddlewareSAs);

						// Run the appropriate terminator middleware at the end
						if (methodData) yield methodData.terminators.orderedData;
						if (allMethodData) yield allMethodData.terminators.orderedData;

						continue;
					}
				}

				// Run node as middleware only
				const middlewareData = currentNode.data.getMethodData(SpecialMethod.MIDDLEWARE);

				if (middlewareData) {
					if (middlewareData.terminators.length > 0) terminatorMiddleware.push(middlewareData.terminators);

					if (middlewareData.middleware.length > 0) yield middlewareData.middleware.orderedData as any;
				}
			}

			// Handle parameters. Ignores runNode to allow putting parameters in places other than right after a slash.
			// FIXME: what if path starts with `/`? other edge cases?
			if (currentNode.data.lateParams.length > 0) {
				const slashIndex = remainingPath.indexOf('/');
				const segmentValue = slashIndex === -1 ? remainingPath : remainingPath.substr(0, slashIndex);
				// TODO: skip checking params if segmentValue and remainingPath are both empty

				for (const param of currentNode.data.lateParams.orderedData) {
					let paramValue = param.matchAll ? remainingPath : segmentValue;

					// If a parameter is matchAll and has a regex, consume only the matched part
					if (param.matchAll && param.regex) {
						const result = paramValue.match(param.regex);
						paramValue = result ? result[0] : '';
					}

					if (paramValue.length > 0 && (!param.regex || param.regex.test(paramValue))) {
						ctx.params ??= {};

						await middlewareValueWrapper(
							ctx.params[param.name],
							paramValue,
							(newParamValue) => {
								if (newParamValue === undefined) delete ctx.params[param.name];
								else ctx.params[param.name] = newParamValue;
							},
							next,
							(nextWrapper) => this.handleNodePath(param.rootNode, remainingPath.substr(paramValue.length), ctx, nextWrapper),
						);

						// We matched the param - don't try anything else
						return;
					}
				}
			}
		}
	}

	// TODO: should omitting the path be an option?
	use(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	use(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	use(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		const decidedStage = typeof stage === 'number' ? stage : 0;
		const combinedMiddleware = typeof stage === 'number' ? middleware : [stage].concat(middleware);

		if (path.endsWith('*')) {
			this.addMiddleware(SpecialMethod.MIDDLEWARE, path.substr(0, path.length - 1), decidedStage, ...combinedMiddleware);
			return this;
		}

		this.addTerminator(SpecialMethod.MIDDLEWARE, path, decidedStage, ...combinedMiddleware);
		return this;
	}

	private addMiddlewareHelper(method: string, path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		const decidedStage = typeof stage === 'number' ? stage : 0;
		const combinedMiddleware = typeof stage === 'number' ? middleware : [stage].concat(middleware);

		if (combinedMiddleware.length === 0) throw new Error('No middleware provided');

		if (combinedMiddleware.length > 1) this.addMiddleware(method, path, decidedStage, ...combinedMiddleware.slice(0, combinedMiddleware.length - 1));
		this.addTerminator(method, path, decidedStage, combinedMiddleware[combinedMiddleware.length - 1]);

		return this;
	}

	all(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	all(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	all(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper(SpecialMethod.ALL, path, stage, ...middleware);
	}

	connect(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	connect(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	connect(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('CONNECT', path, stage, ...middleware);
	}

	delete(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	delete(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	delete(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('DELETE', path, stage, ...middleware);
	}

	del(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	del(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	del(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('DELETE', path, stage, ...middleware);
	}

	get(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	get(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	get(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('GET', path, stage, ...middleware);
	}

	head(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	head(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	head(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('HEAD', path, stage, ...middleware);
	}

	options(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	options(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	options(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('OPTIONS', path, stage, ...middleware);
	}

	patch(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	patch(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	patch(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('PATCH', path, stage, ...middleware);
	}

	post(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	post(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	post(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('POST', path, stage, ...middleware);
	}

	put(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	put(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	put(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('PUT', path, stage, ...middleware);
	}

	trace(path: string, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	trace(path: string, stage: number, ...middleware: Middleware<StateT, RouterContextT>[]): this;
	trace(path: string, stage: number | Middleware<StateT, RouterContextT>, ...middleware: Middleware<StateT, RouterContextT>[]): this {
		return this.addMiddlewareHelper('TRACE', path, stage, ...middleware);
	}
}
