import {DefaultContext, DefaultState, Middleware, Next, ParameterizedContext} from 'koa';
import compose from 'koa-compose';

import {Node} from './Node';

export enum SpecialMethod {
	/** For middleware that gets executed for every path segment. */
	MIDDLEWARE = 'middleware',
	/** For middleware that gets executed only for the specific path it was assigned to. */
	MIDDLEWARE_EXACT = 'middlewareExact',
	/** For middleware that matches for any request method. More specific methods will be called before these. */
	ANY = 'any',
}

export class RouterNodeData<StateT = DefaultState, ContextT = DefaultContext> {
	middleware: Map<string, Map<number, Middleware<StateT, ContextT>[]>> = new Map();
	orderedMiddleware: Map<string, Middleware<StateT, ContextT>[]> = new Map();

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
	}

	toString(): string {
		return `${this.middleware.size} stages, ${[...this.orderedMiddleware].map(([method, middleware]) => `${method} (${middleware.length})`).join(',')} methods`;
	}
}

export interface RouterOptions {
	/** If true, requests ending with `/` will match routes not ending in `/`. Routes ending with `/` will still require the request path to end in a slash. */
	strictSlashes?: boolean;
}

/**
 * A router implementation for Koa using a radix tree.
 */
export class Router<StateT = DefaultState, ContextT = DefaultContext> {
	rootNode: Node<RouterNodeData<StateT, ContextT>> = new Node(() => new RouterNodeData());

	private strictSlashes: boolean;

	constructor(opts: RouterOptions = {}) {
		this.strictSlashes = opts.strictSlashes ?? false;
	}

	normalizePath(path: string): string {
		if (this.strictSlashes) return path;
		if (path === '/') return path;
		if (path.endsWith('/')) return path.substr(0, path.length - 1);
		return path;
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
		const path = this.normalizePath(ctx.path);

		const nodes = this.rootNode.findAll(path);
		if (!nodes) return next();

		// TODO: cache if no params
		const matchingMiddleware = nodes
			.filter((node, index, arr) => {
				// Always leave in the root and last Node
				if (index === 0 || index === arr.length - 1) return true;
				// Allow any Nodes that end with a slash or are the last part of a path segment
				if (node.segment.endsWith('/') || arr[index + 1].segment.startsWith('/')) return true;
				// Don't allow any other nodes
				return false;
			})
			.map((node) => node.data.orderedMiddleware.get(SpecialMethod.MIDDLEWARE) || [])
			.reduce((acc, arr) => acc.concat(arr))
			.concat(nodes[nodes.length - 1].data.orderedMiddleware.get(SpecialMethod.MIDDLEWARE_EXACT) || [])
			.concat(nodes[nodes.length - 1].data.orderedMiddleware.get(ctx.method) || [])
			.concat(nodes[nodes.length - 1].data.orderedMiddleware.get(SpecialMethod.ANY) || []);

		return compose(matchingMiddleware)(ctx, next);
	}
}
